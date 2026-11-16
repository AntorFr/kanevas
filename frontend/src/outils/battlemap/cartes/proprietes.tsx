// The Propriétés tab of E-28: the map's fields with no selection, one element's, or the few things a multiple selection
// allows. Every change is one command of the core's list; the scale and its bounds are the core's (`bornes`), never typed here.
// The title of a linked sheet is read from the sheet at each display (AD-battlemap-editeur-6): the document only holds its id.
import { Copy, Link2, Trash2, Unlink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, lire } from '../../../api';
import { Bouton, Champ, Fenetre, Interrupteur } from '../../../ui';
import type { Bornes } from './coeur';
import type { AssetCarte, Commande, Document, Element } from './types';

interface Fiche { id: number; titre: string; type?: string }

export const ASSET_RETIRE = 'Asset retiré';

export function PanneauProprietes({
  universId, doc, titre, tailleCase, visible, selection, assets, bornes, geste, dupliquer,
}: {
  universId: number;
  doc: Document;
  titre: string;
  tailleCase: number;
  visible: boolean;
  selection: readonly string[];
  assets: ReadonlyMap<string, AssetCarte>;
  bornes: Bornes | null;
  geste: (commandes: Commande[], refus?: string) => boolean;
  dupliquer: (ids: readonly string[]) => void;
}) {
  const els = doc.elements.filter((e) => selection.includes(e.id));
  return (
    <section className="editeur-proprietes" aria-label="Propriétés">
      <h2 className="editeur-panneau-titre">Propriétés</h2>
      {els.length === 0 && (
        <dl className="editeur-champs">
          <dt>Nom</dt><dd>{titre}</dd>
          <dt>Taille</dt><dd>{doc.largeur} × {doc.hauteur} cases</dd>
          <dt>Taille de case</dt><dd>{tailleCase} px</dd>
          <dt>Visible des joueurs</dt><dd>{visible ? 'Oui' : 'Non'}</dd>
          <dt>Calques</dt><dd>{doc.calques.length}</dd>
        </dl>
      )}
      {els.length === 0 && <p className="editeur-note">Sélectionnez un élément pour modifier ses propriétés.</p>}
      {els.length === 1 && <Element1 universId={universId} doc={doc} e={els[0]!} assets={assets} bornes={bornes} geste={geste} dupliquer={dupliquer} />}
      {els.length > 1 && (
        <div className="editeur-groupe">
          <p className="editeur-note" role="status">{els.length} éléments sélectionnés</p>
          <dl className="editeur-champs">
            <dt>Calque</dt>
            <dd>{[...new Set(els.map((e) => doc.calques.find((c) => c.id === e.calque)?.nom ?? ''))].join(', ')}</dd>
          </dl>
          <div className="editeur-actions">
            <Bouton icone={Copy} onClick={() => dupliquer(selection)}>Dupliquer</Bouton>
            <Bouton icone={Trash2} onClick={() => geste(els.map((e) => ({ type: 'supprimer_element', id: e.id })))}>Supprimer</Bouton>
          </div>
        </div>
      )}
    </section>
  );
}

/** A number field applied on Enter or blur; a value the core refuses leaves the document as it was and says why. */
function Nombre({ etiquette, valeur, pas, onValider }: { etiquette: string; valeur: number; pas?: number; onValider: (v: number) => void }) {
  const [t, setT] = useState(String(valeur));
  useEffect(() => setT(String(valeur)), [valeur]);
  const fin = () => {
    const v = Number(t.replace(',', '.'));
    if (t.trim() === '' || !Number.isFinite(v)) return setT(String(valeur));
    if (v !== valeur) onValider(v);
  };
  return (
    <Champ
      etiquette={etiquette}
      inputMode="decimal"
      step={pas}
      value={t}
      onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setT(ev.target.value)}
      onBlur={fin}
      onKeyDown={(ev: React.KeyboardEvent) => { if (ev.key === 'Enter') fin(); }}
    />
  );
}

function Element1({
  universId, doc, e, assets, bornes, geste, dupliquer,
}: {
  universId: number; doc: Document; e: Element; assets: ReadonlyMap<string, AssetCarte>; bornes: Bornes | null;
  geste: (c: Commande[], refus?: string) => boolean; dupliquer: (ids: readonly string[]) => void;
}) {
  const asset = assets.get(e.asset_id);
  const calque = doc.calques.find((c) => c.id === e.calque);
  const [lier, setLier] = useState(false);
  const echelle = e.echelle ?? 1;
  const [erreurEchelle, setErreurEchelle] = useState('');
  useEffect(() => setErreurEchelle(''), [e.id, echelle]);
  return (
    <div className="editeur-groupe">
      <dl className="editeur-champs">
        <dt>Asset</dt>
        <dd className={asset ? undefined : 'asset-retire'}>{asset ? asset.nom : ASSET_RETIRE}</dd>
        <dt>Calque</dt><dd>{calque?.nom ?? ''}</dd>
      </dl>
      <div className="editeur-deux">
        <Nombre etiquette="Position X" valeur={e.x} pas={0.5} onValider={(x) => geste([{ type: 'deplacer_element', id: e.id, x, y: e.y }])} />
        <Nombre etiquette="Position Y" valeur={e.y} pas={0.5} onValider={(y) => geste([{ type: 'deplacer_element', id: e.id, x: e.x, y }])} />
      </div>
      <Champ
        etiquette="Rotation"
        liste
        value={String(e.rotation ?? 0)}
        onChange={(ev: React.ChangeEvent<HTMLSelectElement>) => geste([{ type: 'pivoter_element', id: e.id, rotation: Number(ev.target.value) }])}
      >
        {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}
      </Champ>
      <Interrupteur etiquette="Miroir" coche={e.miroir === true} onChange={(v) => geste([{ type: 'retourner_element', id: e.id, miroir: v }])} />
      <div>
        <Nombre
          etiquette="Échelle"
          valeur={echelle}
          pas={0.25}
          onValider={(v) => {
            // The core owns the bounds: a refusal is shown, the document does not change.
            if (!geste([{ type: 'mettre_a_echelle', id: e.id, echelle: v }], '')) {
              setErreurEchelle(bornes ? `L’échelle va de ${bornes.echelleMin} à ${bornes.echelleMax}.` : 'Échelle refusée.');
            }
          }}
        />
        {erreurEchelle !== '' && <p className="editeur-erreur" role="alert">{erreurEchelle}</p>}
      </div>
      <FicheLiee universId={universId} e={e} onLier={() => setLier(true)} onDelier={() => geste([{ type: 'lier_fiche', id: e.id }])} />
      <div className="editeur-actions">
        <Bouton icone={Copy} onClick={() => dupliquer([e.id])}>Dupliquer</Bouton>
        <Bouton icone={Trash2} onClick={() => geste([{ type: 'supprimer_element', id: e.id }])}>Supprimer</Bouton>
      </div>
      {lier && (
        <ChoixFiche
          universId={universId}
          onFermer={() => setLier(false)}
          onChoisir={(f) => { setLier(false); geste([{ type: 'lier_fiche', id: e.id, fiche_id: String(f.id) }]); }}
        />
      )}
    </div>
  );
}

/** The linked sheet: its title is read now, under the reader's rights; a sheet gone (or hidden) is « Fiche introuvable ». */
function FicheLiee({ universId, e, onLier, onDelier }: { universId: number; e: Element; onLier: () => void; onDelier: () => void }) {
  const [etat, setEtat] = useState<{ k: 'charge' } | { k: 'ok'; titre: string } | { k: 'perdue' }>({ k: 'charge' });
  useEffect(() => {
    if (!e.fiche_id) return;
    let actif = true;
    setEtat({ k: 'charge' });
    lire<Fiche>(`/api/univers/${universId}/fiches/${e.fiche_id}`).then(
      (f) => actif && setEtat({ k: 'ok', titre: f.titre }),
      (x) => actif && setEtat(x instanceof ErreurApi && x.statut === 0 ? { k: 'charge' } : { k: 'perdue' }),
    );
    return () => { actif = false; };
  }, [universId, e.fiche_id]);

  if (!e.fiche_id) {
    return (
      <div className="editeur-fiche">
        <span className="lib-champ">Fiche liée</span>
        <p className="editeur-note">Aucune fiche liée.</p>
        <Bouton icone={Link2} onClick={onLier}>Lier une fiche…</Bouton>
      </div>
    );
  }
  return (
    <div className="editeur-fiche">
      <span className="lib-champ">Fiche liée</span>
      {etat.k === 'charge' && <p className="editeur-note" role="status">Chargement…</p>}
      {etat.k === 'ok' && <p className="editeur-fiche-titre">{etat.titre}</p>}
      {etat.k === 'perdue' && <p className="editeur-note" role="status">Fiche introuvable</p>}
      <div className="editeur-actions">
        {etat.k === 'ok' && <Link className="bouton" to={`/univers/${universId}/fiche/${e.fiche_id}`}>Ouvrir la fiche</Link>}
        <Bouton icone={Link2} onClick={onLier}>Lier une fiche…</Bouton>
        <Bouton icone={Unlink} onClick={onDelier}>Délier</Bouton>
      </div>
    </div>
  );
}

function ChoixFiche({ universId, onFermer, onChoisir }: { universId: number; onFermer: () => void; onChoisir: (f: Fiche) => void }) {
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<Fiche[] | null>(null);
  const [echec, setEchec] = useState(false);
  const delai = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    let actif = true;
    clearTimeout(delai.current);
    delai.current = setTimeout(() => {
      setEchec(false);
      lire<{ fiches: Fiche[] }>(`/api/univers/${universId}/fiches${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(
        (p) => actif && setListe(p.fiches),
        () => actif && (setEchec(true), setListe([])),
      );
    }, q === '' ? 0 : 250);
    return () => { actif = false; clearTimeout(delai.current); };
  }, [universId, q]);
  return (
    <Fenetre titre="Lier une fiche" onFermer={onFermer}>
      <div className="editeur-choix-fiche">
        <Champ etiquette="Rechercher une fiche" type="search" autoFocus value={q} onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setQ(ev.target.value)} />
        {echec && <p className="editeur-erreur" role="alert">La recherche n’a pas abouti. Réessayez.</p>}
        {liste === null && <p className="editeur-note" role="status">Recherche…</p>}
        {liste !== null && liste.length === 0 && !echec && <p className="editeur-note">Aucune fiche ne correspond.</p>}
        <ul className="editeur-choix-liste">
          {(liste ?? []).map((f) => (
            <li key={f.id}>
              <button type="button" className="editeur-choix-fiche-ligne" onClick={() => onChoisir(f)}>
                {f.titre}{f.type ? <small> · {f.type}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Fenetre>
  );
}
