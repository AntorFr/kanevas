import { useRef, useState } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../../../api';
import { Bouton, Pastille } from '../../../ui';
import type { BlocSection } from '../registre';
import { MESSAGES_PIECES as T, formaterTaille } from '../pieces';
import type { PieceJointe, PropsBlocSection } from '../types';

/** One upload line: running (`pct`) or kept as an error until ignored. */
interface Ligne {
  cle: number;
  nom: string;
  fichier: File;
  secrete: boolean;
  pct: number;
  erreur?: string;
  /** « Réessayer » only makes sense for a transport failure. */
  reessayable?: boolean;
}

type Issue = { ok: true } | { ok: false; statut: number; code?: string };

/** POST one file with progress; the `secrete` field goes first so the server reads it before the stream. */
function envoyer(url: string, fichier: File, secrete: boolean, progres: (pct: number) => void, xhr: XMLHttpRequest): Promise<Issue> {
  return new Promise((resolve) => {
    const corps = new FormData();
    corps.append('secrete', secrete ? 'true' : 'false');
    corps.append('fichier', fichier, fichier.name);
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && progres(Math.floor((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, statut: 0 });
    xhr.onabort = () => resolve({ ok: false, statut: -1 });
    xhr.onload = () => {
      if (xhr.status === 401) window.location.assign('/');
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      let code: string | undefined;
      try {
        code = (JSON.parse(xhr.responseText) as { code?: string }).code;
      } catch {
        /* no body */
      }
      resolve({ ok: false, statut: xhr.status, code });
    };
    xhr.send(corps);
  });
}

function BlocPiecesJointes({ universId, fiche, section, role, rafraichir }: PropsBlocSection) {
  const perdue = useConnexionPerdue();
  const mj = role === 'mj';
  const ecrit = mj || section.peutEcrire;
  const pieces = section.piecesJointes ?? [];
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [secrete, setSecrete] = useState(false);
  const [aRetirer, setARetirer] = useState<number>();
  const [enCours, setEnCours] = useState<number>();
  const [echecs, setEchecs] = useState<Record<number, string>>({});
  const [indisponibles, setIndisponibles] = useState<number[]>([]);
  const [avertissement, setAvertissement] = useState<string>();
  const sel = useRef<HTMLInputElement>(null);
  const suite = useRef(0);
  const xhrs = useRef(new Map<number, XMLHttpRequest>());
  const annulees = useRef(new Set<number>());

  // A reader with nothing to see and nothing to add has no block at all — unless a message
  // (e.g. a refused upload after the write right was withdrawn) is still to be shown.
  if (!mj && !ecrit && pieces.length === 0 && lignes.length === 0 && !avertissement) return null;

  const base = `/api/univers/${universId}/fiches/${fiche.id}`;
  const urlFichier = (p: PieceJointe) => `${base}/pieces-jointes/${p.id}/fichier`;
  const changer = (cle: number, m: Partial<Ligne>) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...m } : l)));
  const retirerLigne = (cle: number) => setLignes((ls) => ls.filter((l) => l.cle !== cle));

  async function televerser(l: Ligne) {
    if (annulees.current.has(l.cle)) return retirerLigne(l.cle);
    changer(l.cle, { pct: 0, erreur: undefined, reessayable: undefined });
    const xhr = new XMLHttpRequest();
    xhrs.current.set(l.cle, xhr);
    const r = await envoyer(`${base}/sections/${section.id}/pieces-jointes`, l.fichier, l.secrete, (pct) => changer(l.cle, { pct }), xhr);
    xhrs.current.delete(l.cle);
    if (r.ok) {
      retirerLigne(l.cle);
      return rafraichir();
    }
    if (r.statut === -1) return retirerLigne(l.cle); // cancelled: nothing was written
    if (r.code === 'fichier_vide') return changer(l.cle, { erreur: T.vide(l.nom) });
    if (r.code === 'limite_pieces') return changer(l.cle, { erreur: T.limite(role) });
    if (r.statut === 403) {
      changer(l.cle, { erreur: T.droit });
      return rafraichir();
    }
    if (r.statut === 404) return changer(l.cle, { erreur: T.introuvable });
    changer(l.cle, { erreur: T.envoi(l.nom), reessayable: true });
  }

  /** The chosen files go one after the other; each is judged alone. */
  async function choisir(liste: FileList | null) {
    const fichiers = Array.from(liste ?? []);
    if (sel.current) sel.current.value = '';
    if (fichiers.length === 0) return;
    const nouvelles = fichiers.map<Ligne>((f) => ({ cle: ++suite.current, nom: f.name, fichier: f, secrete: mj && secrete, pct: 0 }));
    setLignes((ls) => [...ls, ...nouvelles]);
    for (const l of nouvelles) await televerser(l);
  }

  function annuler(cle: number) {
    annulees.current.add(cle);
    const x = xhrs.current.get(cle);
    if (x) x.abort();
    else retirerLigne(cle);
  }

  async function agir(id: number, action: () => Promise<void>, droit = false) {
    if (enCours !== undefined) return;
    setEnCours(id);
    setEchecs(({ [id]: _, ...reste }) => reste);
    setAvertissement(undefined);
    try {
      await action();
      setARetirer(undefined);
      await rafraichir();
    } catch (e) {
      const statut = e instanceof ErreurApi ? e.statut : 0;
      if (statut === 404) {
        setAvertissement(T.disparue);
        setARetirer(undefined);
        await rafraichir();
      } else if (statut === 403 && droit) {
        setAvertissement(T.droit);
        setARetirer(undefined);
        await rafraichir();
      } else {
        setEchecs((x) => ({ ...x, [id]: T.echec }));
      }
    } finally {
      setEnCours(undefined);
    }
  }

  const telecharger = (p: PieceJointe) => (
    <a className="bouton neutre petit" href={urlFichier(p)} download={p.nom}>
      Télécharger
    </a>
  );

  return (
    <div className="pieces-jointes">
      <h3>
        Pièces jointes {pieces.length > 0 && <span className="compteur">({pieces.length})</span>}
      </h3>
      {avertissement && (
        <div className="echec" role="alert">
          {avertissement}
        </div>
      )}
      {pieces.length === 0 && lignes.length === 0 && <p className="vide">Aucune pièce jointe.</p>}
      <ul className="liste-pieces">
        {pieces.map((p) => (
          <li key={p.id} className={`piece${p.secrete ? ' reserve-mj' : ''}`}>
            {p.image && !indisponibles.includes(p.id) ? (
              <a className="vignette" href={urlFichier(p)} target="_blank" rel="noopener noreferrer">
                <img
                  src={urlFichier(p)}
                  alt={p.nom}
                  onError={() => setIndisponibles((i) => [...i, p.id])}
                />
              </a>
            ) : p.image ? (
              <div className="vignette indisponible">Image indisponible.</div>
            ) : null}
            <div className="legende">
              <span className="nom-piece">
                {p.nom} · {formaterTaille(p.taille)}
              </span>{' '}
              {p.secrete && <Pastille sens="mj">Secrète — MJ seul</Pastille>}
            </div>
            <div className="actions">
              {(!p.image || indisponibles.includes(p.id)) && telecharger(p)}
              {mj && (
                <Bouton
                  petit
                  ecrit
                  enCours={enCours === p.id && aRetirer === undefined}
                  onClick={() => agir(p.id, () => appeler('PATCH', `${base}/pieces-jointes/${p.id}`, { secrete: !p.secrete }))}
                >
                  {p.secrete ? 'Lever le secret' : 'Rendre secrète'}
                </Bouton>
              )}
              {ecrit && aRetirer !== p.id && (
                <Bouton petit variante="danger" ecrit onClick={() => setARetirer(p.id)}>
                  Retirer « {p.nom} »
                </Bouton>
              )}
            </div>
            {echecs[p.id] && (
              <div className="echec" role="alert">
                {echecs[p.id]}
              </div>
            )}
            {ecrit && aRetirer === p.id && (
              <div className="confirmation" role="alertdialog" aria-label="Confirmer le retrait">
                <p>Retirer « {p.nom} » ? Le fichier sera perdu.</p>
                <div className="actions">
                  <Bouton variante="danger" ecrit enCours={enCours === p.id} onClick={() => agir(p.id, () => appeler('DELETE', `${base}/pieces-jointes/${p.id}`), true)}>
                    Retirer le fichier
                  </Bouton>
                  <Bouton onClick={() => setARetirer(undefined)}>Annuler</Bouton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {lignes.map((l) =>
        l.erreur ? (
          <div key={l.cle} className="echec" role="alert">
            {l.erreur}{' '}
            {l.reessayable && (
              <Bouton petit ecrit onClick={() => void televerser(l)}>
                Réessayer
              </Bouton>
            )}{' '}
            <Bouton petit onClick={() => retirerLigne(l.cle)}>
              Ignorer
            </Bouton>
          </div>
        ) : (
          <div key={l.cle} className="envoi" role="status">
            {l.nom} — Envoi… {l.pct} %{' '}
            <Bouton petit onClick={() => annuler(l.cle)}>
              Annuler
            </Bouton>
          </div>
        ),
      )}
      {ecrit && (
        <div className="ajout-piece">
          <input ref={sel} type="file" multiple hidden tabIndex={-1} aria-hidden onChange={(e) => void choisir(e.target.files)} />
          <Bouton ecrit disabled={perdue} onClick={() => sel.current?.click()}>
            Ajouter un fichier
          </Bouton>
          {mj && (
            <label>
              <input type="checkbox" checked={secrete} onChange={(e) => setSecrete(e.target.checked)} />
              Secrète (MJ seul)
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default {
  id: 'pieces-jointes',
  roles: ['mj', 'joueur'],
  rang: 20,
  composant: BlocPiecesJointes,
} satisfies BlocSection;
