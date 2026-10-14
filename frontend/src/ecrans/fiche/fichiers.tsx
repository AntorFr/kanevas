import { ChevronDown, Images, Lock, Upload, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ErreurApi, lire, useConnexionPerdue } from '../../api';
import { Bouton, ErreurChargement, Menu, Pastille, useToasts } from '../../ui';
import '../mediatheque/mediatheque.css';
import { Apercu, extension, tailleLisible, type Fichier, type PageFichiers } from '../mediatheque/commun';
import { MESSAGES_PIECES as T } from './pieces';

/**
 * The two ways to put a file on a sheet (B-55, E-9 « Fichiers »): « Ajouter depuis l'appareil » and
 * « Choisir dans la médiathèque ». One composition for the editor, the Pièces jointes block and the
 * illustration: each screen only says how a file is sent and what a file becomes once it is there.
 */

export const MESSAGE_RESERVE =
  'Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas.';

/** Where the failures of a send or a pick come from, in the words of the interface. */
export function texteErreur(e: unknown, nom: string): string {
  if (e instanceof ErreurApi) {
    if (e.code === 'fichier_vide') return T.vide(nom);
    if (e.code === 'pas_une_image') return `« ${nom} » n’est pas une image.`;
    if (e.code === 'limite_pieces') return e.message;
    if (e.statut === 403) return T.droit;
    if (e.statut === 404) return T.introuvable;
  }
  return T.envoi(nom);
}

/** What a send gives back to the screen that asked for it. */
export type Issue = { ok: true } | { ok: false; texte?: string };

interface Envoi {
  cle: number;
  nom: string;
  pct: number;
}

interface Message {
  cle: number;
  texte: string;
  fichier?: File;
}

export interface ConfigAjout<R> {
  universId: string;
  /** `?mode=joueur` or '': the picker lists what the account sees in that mode. */
  suffixeMode?: string;
  /** Only images (the illustration): the picker is filtered, the device chooser too. */
  images?: boolean;
  /** The caller may send from the device (the server judges anyway). */
  peutAjouter: boolean;
  /** The pastille « MJ seul » is for a GM. */
  mj: boolean;
  /** Accessible name of the trigger, and what it shows. */
  etiquette: string;
  icone?: LucideIcon;
  declencheur?: ReactNode;
  /** Sends one file where the screen wants it (with progress); the result goes to `apres`. */
  envoyer: (fichier: File, progres: (pct: number) => void) => { promesse: Promise<R>; annuler: () => void };
  /** What a sent file becomes (insert, refresh…). A throw is a failed add. */
  apres: (resultat: R, fichier: File) => Promise<void>;
  /** What a file picked in the library becomes. A throw is a refused pick. */
  choisir: (fichier: Fichier) => Promise<void>;
  /** Shows the failures elsewhere than under the tool (the illustration's header). */
  surMessage?: (texte: string, reessayer?: () => void) => void;
  /** The server said 403 on a send. */
  surDroitPerdu?: () => void;
}

/** The trigger menu, its upload lines and messages, and the picker; `deposer` is the drop of files. */
const repetable = (texte: string) => texte.includes('envoi n’a pas abouti');

export function useAjoutFichier<R>(c: ConfigAjout<R>) {
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selecteur, setSelecteur] = useState(false);
  const saisie = useRef<HTMLInputElement>(null);
  const suite = useRef(0);
  const annulations = useRef(new Map<number, () => void>());
  const courant = useRef(c);
  courant.current = c;

  useEffect(() => {
    const a = annulations.current;
    return () => a.forEach((f) => f());
  }, []);

  /** Sends one file and makes it part of the sheet; nothing is added when it fails. */
  async function televerser(fichier: File, local?: (pct: number) => void): Promise<Issue> {
    const k = courant.current;
    if (fichier.size === 0) return { ok: false, texte: T.vide(fichier.name) };
    const cle = ++suite.current;
    setEnvois((l) => [...l, { cle, nom: fichier.name, pct: 0 }]);
    const { promesse, annuler } = k.envoyer(fichier, (pct) => {
      setEnvois((l) => l.map((e) => (e.cle === cle ? { ...e, pct } : e)));
      local?.(pct);
    });
    annulations.current.set(cle, annuler);
    try {
      const r = await promesse;
      await k.apres(r, fichier);
      return { ok: true };
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === -1) {
        toast(`Envoi de « ${fichier.name} » annulé`);
        return { ok: false };
      }
      if (e instanceof ErreurApi && e.statut === 403 && e.code !== 'limite_pieces') k.surDroitPerdu?.();
      return { ok: false, texte: texteErreur(e, fichier.name) };
    } finally {
      annulations.current.delete(cle);
      setEnvois((l) => l.filter((x) => x.cle !== cle));
    }
  }

  function montrer(texte: string, fichier: File) {
    const k = courant.current;
    // Only an interrupted upload can be retried; a definitive refusal offers « Ignorer » alone.
    if (k.surMessage) return k.surMessage(texte, repetable(texte) ? () => void direct([fichier]) : undefined);
    setMessages((l) => [...l, { cle: ++suite.current, texte, fichier }]);
  }

  /** The device path: the files go one after the other, each judged alone. */
  async function direct(fichiers: File[]) {
    const k = courant.current;
    if (!k.peutAjouter || fichiers.length === 0) return;
    const liste = k.images ? fichiers.slice(0, 1) : fichiers;
    for (const f of liste) {
      const r = await televerser(f);
      if (!r.ok && r.texte) montrer(r.texte, f);
    }
  }

  const deposer = (fichiers: File[]) => {
    if (!perdue) void direct(fichiers);
  };

  const annulerEnvoi = (cle: number) => annulations.current.get(cle)?.();

  const entrees = [
    ...(c.peutAjouter
      ? [{ libelle: 'Ajouter depuis l’appareil', icone: Upload, impossible: perdue, onChoisir: () => saisie.current?.click() }]
      : []),
    { libelle: 'Choisir dans la médiathèque', icone: Images, onChoisir: () => setSelecteur(true) },
  ];

  const menu = (
    <>
      <Menu
        etiquette={c.etiquette}
        icone={c.icone}
        declencheur={c.declencheur}
        aligne="debut"
        desactive={perdue}
        entrees={entrees}
      />
      <input
        ref={saisie}
        type="file"
        multiple={!c.images}
        accept={c.images ? 'image/png, image/jpeg, image/gif, image/webp' : undefined}
        hidden
        tabIndex={-1}
        aria-hidden
        data-ajout-appareil=""
        onChange={(e) => {
          const liste = Array.from(e.target.files ?? []);
          e.target.value = '';
          void direct(liste);
        }}
      />
    </>
  );

  const etat = (
    <>
      {envois.map((e) => (
        <div key={e.cle} className="envoi-fichier" role="status">
          <span className="med-envoi-nom">{e.nom}</span> — Envoi… {e.pct} %{' '}
          <Bouton petit onClick={() => annulerEnvoi(e.cle)}>
            Annuler
          </Bouton>
        </div>
      ))}
      {messages.map((m) => (
        <div key={m.cle} className="echec" role="alert">
          {m.texte}{' '}
          {m.fichier && repetable(m.texte) && (
            <Bouton
              petit
              ecrit
              onClick={() => {
                setMessages((l) => l.filter((x) => x.cle !== m.cle));
                void direct([m.fichier!]);
              }}
            >
              Réessayer
            </Bouton>
          )}{' '}
          <Bouton petit onClick={() => setMessages((l) => l.filter((x) => x.cle !== m.cle))}>
            Ignorer
          </Bouton>
        </div>
      ))}
      {selecteur && (
        <SelecteurFichier
          universId={c.universId}
          suffixeMode={c.suffixeMode ?? ''}
          images={Boolean(c.images)}
          peutAjouter={c.peutAjouter}
          mj={c.mj}
          onFermer={() => setSelecteur(false)}
          onChoisir={async (f) => {
            await courant.current.choisir(f);
            setSelecteur(false);
          }}
          onEnvoyer={async (f, local) => {
            const r = await televerser(f, local);
            if (r.ok) setSelecteur(false);
            return r;
          }}
        />
      )}
    </>
  );

  return { menu, etat, deposer, enCours: envois.length > 0, envois, annulerEnvoi };
}

interface PropsSelecteur {
  universId: string;
  suffixeMode: string;
  images: boolean;
  peutAjouter: boolean;
  mj: boolean;
  onFermer: () => void;
  onChoisir: (fichier: Fichier) => Promise<void>;
  onEnvoyer: (fichier: File, progres: (pct: number) => void) => Promise<Issue>;
}

/** « Choisir un fichier »: the grid of E-19 in a box, filtered on the images for an illustration. */
export function SelecteurFichier(p: PropsSelecteur) {
  const perdue = useConnexionPerdue();
  const [nature, setNature] = useState<'' | 'images' | 'documents'>(p.images ? 'images' : '');
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  const [suite, setSuite] = useState<number | string | null>(null);
  const [rev, setRev] = useState(0);
  const [message, setMessage] = useState<string>();
  const [pct, setPct] = useState<number>();
  const [enCours, setEnCours] = useState(false);
  const saisie = useRef<HTMLInputElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);

  const requete = (apres?: number | string | null) => {
    const q = new URLSearchParams();
    if (nature) q.set('nature', nature);
    if (apres !== undefined && apres !== null) q.set('apres', String(apres));
    if (p.suffixeMode) q.set('mode', 'joueur');
    return q.toString();
  };

  useEffect(() => {
    let actif = true;
    setEtat('chargement');
    lire<PageFichiers>(`/api/univers/${p.universId}/fichiers?${requete()}`).then(
      (page) => {
        if (!actif) return;
        setFichiers(page.fichiers);
        setSuite(page.suite);
        setEtat('ok');
      },
      () => actif && setEtat('erreur'),
    );
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.universId, nature, rev]);

  useEffect(() => fermer.current?.focus(), []);

  async function plus() {
    if (suite === null) return;
    try {
      const page = await lire<PageFichiers>(`/api/univers/${p.universId}/fichiers?${requete(suite)}`);
      setFichiers((l) => [...l, ...page.fichiers]);
      setSuite(page.suite);
    } catch {
      setMessage('Impossible de charger la suite.');
    }
  }

  async function prendre(f: Fichier) {
    if (enCours) return;
    setEnCours(true);
    setMessage(undefined);
    try {
      await p.onChoisir(f);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) {
        setMessage('Ce fichier n’existe plus.');
        setRev((n) => n + 1);
      } else if (e instanceof ErreurApi && e.code === 'pas_une_image') setMessage(`« ${f.nom} » n’est pas une image.`);
      else if (e instanceof ErreurApi && e.code === 'limite_pieces') setMessage(e.message);
      else if (e instanceof ErreurApi && e.statut === 403) setMessage(T.droit);
      else setMessage(T.echec);
    } finally {
      setEnCours(false);
    }
  }

  async function depuisAppareil(liste: File[]) {
    const f = liste[0];
    if (!f || enCours) return;
    setEnCours(true);
    setMessage(undefined);
    setPct(0);
    const r = await p.onEnvoyer(f, setPct);
    setPct(undefined);
    setEnCours(false);
    if (!r.ok && r.texte) setMessage(r.texte);
  }

  return (
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && p.onFermer()}>
      <div
        className="boite selecteur"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-selecteur"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            p.onFermer();
          }
        }}
      >
        <div className="selecteur-tete">
          <h2 id="titre-selecteur">Choisir un fichier</h2>
          <button ref={fermer} type="button" className="bouton-icone" aria-label="Fermer" title="Fermer" onClick={p.onFermer}>
            <X size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="selecteur-outils">
          {p.peutAjouter && (
            <>
              <input
                ref={saisie}
                type="file"
                accept={p.images ? 'image/png, image/jpeg, image/gif, image/webp' : undefined}
                hidden
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const liste = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void depuisAppareil(liste);
                }}
              />
              <Bouton icone={Upload} ecrit disabled={perdue || enCours} onClick={() => saisie.current?.click()}>
                Ajouter depuis l’appareil
              </Bouton>
            </>
          )}
          {!p.images && (
            <div className="bascule" role="radiogroup" aria-label="Nature">
              {([['', 'Tout'], ['images', 'Images'], ['documents', 'Documents']] as const).map(([v, l]) => (
                <label key={v}>
                  <input type="radio" name="nature-selecteur" checked={nature === v} onChange={() => setNature(v)} />
                  {l}
                </label>
              ))}
            </div>
          )}
        </div>
        {pct !== undefined && (
          <div role="status" className="envoi-fichier">
            Envoi… {pct} %
          </div>
        )}
        {message && (
          <div className="echec" role="alert">
            {message}
          </div>
        )}
        {etat === 'chargement' && (
          <div className="med-grille" role="status" aria-label="Chargement des fichiers…">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="med-tuile squelette" aria-hidden="true" />
            ))}
          </div>
        )}
        {etat === 'erreur' && <ErreurChargement texte="Impossible de charger la médiathèque." onReessayer={() => setRev((n) => n + 1)} />}
        {etat === 'ok' && fichiers.length === 0 && (
          <p className="selecteur-vide">{p.images ? 'Aucune image à choisir.' : 'Aucun fichier à choisir.'}</p>
        )}
        {etat === 'ok' && fichiers.length > 0 && (
          <ul className="med-grille">
            {fichiers.map((f) => (
              <li key={f.id}>
                <button type="button" className="med-tuile" aria-label={f.nom} disabled={enCours} onClick={() => void prendre(f)}>
                  <Apercu universId={p.universId} f={f} />
                  {p.mj && f.visibilite === 'mj' && (
                    <span className="med-pastille">
                      <Pastille sens="mj" icone={Lock}>
                        MJ seul
                      </Pastille>
                    </span>
                  )}
                  <span className="med-nom" title={f.nom}>
                    {f.nom}
                  </span>
                  <small>
                    {f.image ? extension(f.nom) || 'Image' : tailleLisible(f.taille)}
                    {f.image ? ` · ${tailleLisible(f.taille)}` : ''}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {etat === 'ok' && suite !== null && (
          <Bouton icone={ChevronDown} disabled={perdue} onClick={() => void plus()}>
            Charger la suite
          </Bouton>
        )}
      </div>
    </div>
  );
}
