import { Plus, Sparkles, Square, Trash2, ClipboardPaste, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { appeler, ErreurApi, lire, useConnexionPerdue } from '../../api';
import {
  Alerte, Bouton, BoiteDialogue, Champ, Chargement, ErreurChargement, Fenetre, Pastille,
} from '../../ui';

// ---- Types of the API (`services/battlemap-lots.ts`) -----------------------------------------------------------------------
export type Categorie = 'objet' | 'vaisseau' | 'decor' | 'sol' | 'mur';
export type EtatLigne = 'attente' | 'en_cours' | 'brouillon' | 'echec' | 'accepte' | 'ecarte' | 'interrompu';

export interface LigneLot {
  id: number;
  rang: number;
  nom: string;
  categorie: Categorie;
  largeur: number | null;
  hauteur: number | null;
  indice: string;
  remarque: string;
  etat: EtatLigne;
  motEchec: string | null;
  assetId: number | null;
  fichierId: number | null;
  jeton: string | null;
}
export interface Lot { id: number; etat: 'prepare' | 'en_cours' | 'termine'; lignes: LigneLot[]; interrompu: boolean }
export interface DonneesLots { lot: Lot | null; moteurOccupe: boolean; directionArtistique: string | null }

const MAX_LIGNES = 20;
const MAX_NOM = 80;
const MAX_INDICE = 200;
const MAX_EMPREINTE = 20;
const POLL_ACTIF = 2000;
const POLL_REPOS = 15000;

const CATEGORIES: readonly { valeur: Categorie; libelle: string }[] = [
  { valeur: 'objet', libelle: 'Objet' },
  { valeur: 'vaisseau', libelle: 'Vaisseau' },
  { valeur: 'decor', libelle: 'Décor' },
  { valeur: 'sol', libelle: 'Sol' },
  { valeur: 'mur', libelle: 'Mur' },
];
const LIBELLE_CATEGORIE = Object.fromEntries(CATEGORIES.map((c) => [c.valeur, c.libelle])) as Record<Categorie, string>;
const sansEmpreinte = (c: Categorie) => c === 'sol' || c === 'mur';

export const MESSAGE_PLEINE = 'Bibliothèque pleine (5 000 assets).';
export const MESSAGE_LIGNES = '20 lignes au plus.';
const MESSAGE_LIGNE = 'Cette ligne a changé.';
const MESSAGE_LOT = 'Ce lot a changé.';
const MESSAGE_ACTION = 'L’action n’a pas abouti.';

const ETATS: Record<EtatLigne, { mot: string; sens: 'mj' | 'table' | 'neutre' | 'secrete' | 'danger' }> = {
  attente: { mot: 'En attente', sens: 'neutre' },
  en_cours: { mot: 'En cours', sens: 'table' },
  brouillon: { mot: 'Brouillon prêt', sens: 'table' },
  echec: { mot: 'Échec', sens: 'danger' },
  interrompu: { mot: 'Interrompu', sens: 'secrete' },
  accepte: { mot: 'Accepté', sens: 'table' },
  ecarte: { mot: 'Écarté', sens: 'neutre' },
};

const base = (id: string) => `/api/univers/${id}/outils/battlemap/lots`;
const srcFichier = (id: string, l: { fichierId: number | null; jeton: string | null }) =>
  `/api/univers/${id}/fichiers/${l.fichierId}?v=${encodeURIComponent(l.jeton ?? '')}`;

// ---- The list being written --------------------------------------------------------------------------------------------------
export interface LigneSaisie { cle: number; nom: string; categorie: Categorie; largeur: string; hauteur: string; indice: string }

let compteurCle = 0;
const nouvelleSaisie = (p: Partial<LigneSaisie> = {}): LigneSaisie =>
  ({ cle: ++compteurCle, nom: '', categorie: 'objet', largeur: '1', hauteur: '1', indice: '', ...p });

const entierEmpreinte = (v: string) => /^[0-9]+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= MAX_EMPREINTE;

/** A line is ready to be sent: a name, and a footprint of 1 to 20 for a category that has one. */
export const ligneValide = (l: LigneSaisie): boolean =>
  l.nom.trim().length >= 1 && l.nom.trim().length <= MAX_NOM && l.indice.trim().length <= MAX_INDICE
  && (sansEmpreinte(l.categorie) || (entierEmpreinte(l.largeur) && entierEmpreinte(l.hauteur)));

const versCorps = (l: LigneSaisie) => ({
  nom: l.nom.trim(),
  categorie: l.categorie,
  largeur: sansEmpreinte(l.categorie) ? null : Number(l.largeur),
  hauteur: sansEmpreinte(l.categorie) ? null : Number(l.hauteur),
  indice: l.indice.trim(),
});

const depuisLigne = (l: LigneLot): LigneSaisie => nouvelleSaisie({
  nom: l.nom, categorie: l.categorie, largeur: String(l.largeur ?? 1), hauteur: String(l.hauteur ?? 1), indice: l.indice,
});

const plier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * « Coller des lignes »: `nom ; catégorie ; LxH ; indication`, one line per asset. The readable lines are returned, the
 * others reported by their number (as typed, empty lines counted).
 */
export function lireLignesCollees(texte: string): { lignes: LigneSaisie[]; refus: string[] } {
  const lignes: LigneSaisie[] = [];
  const refus: string[] = [];
  texte.split(/\r?\n/).forEach((brut, i) => {
    if (brut.trim() === '') return;
    const n = i + 1;
    const [nom = '', cat = '', emp = '', ...reste] = brut.split(';').map((s) => s.trim());
    const illisible = (raison: string) => refus.push(`Ligne ${n} illisible : ${raison}.`);
    if (nom === '') return illisible('nom manquant');
    if (Array.from(nom).length > MAX_NOM) return illisible('nom trop long');
    const categorie = cat === '' ? 'objet' : CATEGORIES.find((c) => plier(c.libelle) === plier(cat) || plier(c.libelle + 's') === plier(cat))?.valeur;
    if (!categorie) return illisible('catégorie inconnue');
    const indice = reste.join(';').trim();
    if (Array.from(indice).length > MAX_INDICE) return illisible('indication trop longue');
    let largeur = '1';
    let hauteur = '1';
    if (emp !== '') {
      if (sansEmpreinte(categorie)) return illisible('un sol ou un mur n’a pas d’empreinte');
      const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(emp);
      if (!m || !entierEmpreinte(m[1]!) || !entierEmpreinte(m[2]!)) return illisible('empreinte inconnue');
      [, largeur, hauteur] = m as unknown as [string, string, string];
    }
    lignes.push(nouvelleSaisie({ nom, categorie, largeur, hauteur, indice }));
  });
  return { lignes, refus };
}

// ---- The batch read, shared with E-25 (draft cards) ---------------------------------------------------------------------------
export interface EtatLots {
  donnees: DonneesLots | null;
  /** `absent`: the tool answered « introuvable » (no engine, disabled, hidden). */
  etat: 'chargement' | 'ok' | 'erreur' | 'absent';
  /** The rows on screen are older than the last failed read (offline, server down). */
  perimee: boolean;
  recharger: () => void;
}

/** Reads `GET lots`, again every 2 s while a line waits or runs, every 15 s otherwise (AD-159's stream belongs to the table). */
export function useLots(id: string, actif: boolean): EtatLots {
  const [donnees, setDonnees] = useState<DonneesLots | null>(null);
  const [etat, setEtat] = useState<EtatLots['etat']>('chargement');
  const [perimee, setPerimee] = useState(false);
  const [tour, setTour] = useState(0);
  const recharger = useCallback(() => setTour((n) => n + 1), []);
  const derniere = useRef<DonneesLots | null>(null);

  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const prochain = () => {
      const lignes = derniere.current?.lot?.lignes ?? [];
      const rapide = lignes.some((l) => l.etat === 'attente' || l.etat === 'en_cours');
      minuteur = setTimeout(() => void lecture(), rapide ? POLL_ACTIF : POLL_REPOS);
    };
    async function lecture() {
      try {
        const d = await lire<DonneesLots>(base(id));
        if (!vivant) return;
        derniere.current = d;
        setDonnees(d);
        setEtat('ok');
        setPerimee(false);
        prochain();
      } catch (e) {
        if (!vivant) return;
        if (e instanceof ErreurApi && e.statut === 404) {
          derniere.current = null;
          setEtat('absent');
          return;
        }
        if (derniere.current) setPerimee(true);
        else setEtat('erreur');
        prochain();
      }
    }
    void lecture();
    return () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
    };
  }, [id, actif, tour]);

  return { donnees, etat, perimee, recharger };
}

// ---- The tab ---------------------------------------------------------------------------------------------------------------------
type Message = { texte: string; sens: 'danger' | 'avertissement' } | null;
const ACTION_MANQUEE = { texte: MESSAGE_ACTION, sens: 'danger' as const };

export function Generation({ id, lots }: { id: string; lots: EtatLots }) {
  const perdue = useConnexionPerdue();
  const { donnees, etat, perimee, recharger } = lots;
  const lot = donnees?.lot ?? null;
  const prepare = lot === null || lot.etat === 'prepare';

  const [saisies, setSaisies] = useState<LigneSaisie[] | null>(null);
  const [enregistrement, setEnregistrement] = useState<'repos' | 'attente' | 'echec'>('repos');
  const [refusCollage, setRefusCollage] = useState<string[]>([]);
  const [collage, setCollage] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [confirmerArret, setConfirmerArret] = useState(false);
  const [fin, setFin] = useState<'arrete' | 'termine' | null>(null);
  const [remarqueDe, setRemarqueDe] = useState<number | null>(null);
  const [remarque, setRemarque] = useState('');
  const aVuLot = useRef(false);
  const modifie = useRef(false);

  // The list is the local copy while the batch is not started; it starts from the stored `prepare` batch (assistant, reload).
  useEffect(() => {
    if (etat !== 'ok') return;
    if (lot !== null) aVuLot.current = true;
    if (saisies === null) {
      setSaisies(lot !== null && lot.etat === 'prepare' ? lot.lignes.map(depuisLigne) : []);
    } else if (lot === null && aVuLot.current) {
      // The batch closed (stopped here or finished): a new, empty list.
      aVuLot.current = false;
      setSaisies([]);
      setFin((f) => f ?? 'termine');
    } else if (lot !== null && lot.etat === 'prepare' && !modifie.current && saisies.length === 0 && lot.lignes.length > 0) {
      setSaisies(lot.lignes.map(depuisLigne));
    }
  }, [etat, lot, saisies]);

  // Continuous saving: 600 ms after the last edit, when every line is ready.
  useEffect(() => {
    if (!modifie.current || saisies === null || !prepare) return;
    if (saisies.length === 0 || !saisies.every(ligneValide)) return;
    setEnregistrement('attente');
    const t = setTimeout(() => void enregistrer(saisies), 600);
    return () => clearTimeout(t);
  }, [saisies]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer(liste: LigneSaisie[]): Promise<boolean> {
    try {
      await appeler('PUT', base(id), { lignes: liste.map(versCorps) });
      setEnregistrement('repos');
      return true;
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'lot_en_cours') {
        setEnregistrement('repos');
        setMessage({ texte: MESSAGE_LOT, sens: 'danger' });
        modifie.current = false;
        setSaisies(null);
        recharger();
      } else setEnregistrement('echec');
      return false;
    }
  }

  function changer(f: (l: LigneSaisie[]) => LigneSaisie[]) {
    modifie.current = true;
    setFin(null);
    setSaisies((l) => f(l ?? []));
  }

  async function agir(cle: string, chemin: string, corps: unknown = {}): Promise<boolean> {
    setOccupe(cle);
    setMessage(null);
    let ok = false;
    try {
      await appeler('POST', `${base(id)}${chemin}`, corps);
      ok = true;
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'etat_ligne') setMessage({ texte: MESSAGE_LIGNE, sens: 'danger' });
      else if (e instanceof ErreurApi && (e.code === 'etat_lot' || e.code === 'lot_en_cours' || e.statut === 404)) setMessage({ texte: MESSAGE_LOT, sens: 'danger' });
      else if (e instanceof ErreurApi && e.code === 'bibliotheque_pleine') setMessage({ texte: MESSAGE_PLEINE, sens: 'danger' });
      else setMessage(ACTION_MANQUEE);
    } finally {
      setOccupe(null);
      recharger();
    }
    return ok;
  }

  async function lancer() {
    if (saisies === null || !saisies.every(ligneValide) || saisies.length === 0) return;
    setOccupe('lancer');
    setMessage(null);
    setFin(null);
    try {
      // The list is sent whole first, so the batch started is the one on screen.
      if (!(lot?.etat === 'prepare' && !modifie.current) && !(await enregistrer(saisies))) return;
      await appeler('POST', `${base(id)}/lancer`, {});
      modifie.current = false;
      setSaisies(null);
    } catch (e) {
      setMessage(e instanceof ErreurApi && (e.code === 'etat_lot' || e.code === 'lot_en_cours') ? { texte: MESSAGE_LOT, sens: 'danger' } : ACTION_MANQUEE);
    } finally {
      setOccupe(null);
      recharger();
    }
  }

  async function arreter() {
    setConfirmerArret(false);
    if (await agir('arreter', '/arreter')) {
      aVuLot.current = false;
      modifie.current = false;
      setSaisies([]);
      setFin('arrete');
    }
  }

  if (etat === 'chargement' || (etat === 'ok' && saisies === null)) return <Chargement texte="Chargement du lot…" />;
  if (etat === 'erreur') return <div className="bm-gen"><ErreurChargement texte="Impossible de charger le lot." onReessayer={recharger} /></div>;
  if (etat === 'absent') return null;

  const liste = saisies ?? [];
  const lignes = lot?.lignes ?? [];
  const traitees = lignes.filter((l) => ['brouillon', 'accepte', 'ecarte', 'echec'].includes(l.etat)).length;
  const demarre = lot !== null && lot.etat !== 'prepare';
  const pretes = liste.length > 0 && liste.every(ligneValide);
  const inactif = perdue || occupe !== null;

  return (
    <div className="bm-gen">
      <BandeauDirection id={id} direction={donnees?.directionArtistique ?? null} />
      {perimee && <p className="bm-gen-perime" role="status">Données peut-être périmées.</p>}
      {message && <Alerte sens={message.sens}>{message.texte}</Alerte>}
      <div className="bm-gen-colonnes">
        <section className="bm-gen-liste" aria-label="Liste">
          <header className="bm-gen-entete">
            <h2>Liste</h2>
            <span className="bm-gen-compte">{(demarre ? lignes.length : liste.length)} ligne{(demarre ? lignes.length : liste.length) > 1 ? 's' : ''}</span>
          </header>
          {demarre ? (
            <ul className="bm-gen-lecture">
              {lignes.map((l) => (
                <li key={l.id}>
                  <b>{l.nom}</b> <span>{LIBELLE_CATEGORIE[l.categorie]}{l.largeur !== null ? ` · ${l.largeur}×${l.hauteur}` : ''}</span>
                  {l.indice && <small>{l.indice}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <>
              {liste.length === 0 && <p className="bm-gen-vide">Aucune ligne. Ajoutez-en une ou collez-en plusieurs.</p>}
              <ul className="bm-gen-saisies">
                {liste.map((l, i) => (
                  <LigneListe
                    key={l.cle}
                    ligne={l}
                    rang={i + 1}
                    onChange={(p) => changer((s) => s.map((x) => (x.cle === l.cle ? { ...x, ...p } : x)))}
                    onRetirer={() => changer((s) => s.filter((x) => x.cle !== l.cle))}
                  />
                ))}
              </ul>
              {liste.length >= MAX_LIGNES && <p className="bm-gen-note" role="status">{MESSAGE_LIGNES}</p>}
              {refusCollage.length > 0 && (
                <Alerte sens="avertissement">
                  {refusCollage.map((r) => <span key={r} className="bm-gen-refus">{r}</span>)}
                </Alerte>
              )}
              {enregistrement === 'echec' && (
                <Alerte action={<Bouton petit onClick={() => void enregistrer(liste)}>Réessayer</Bouton>}>Impossible d’enregistrer la liste.</Alerte>
              )}
              <div className="bm-gen-actions">
                <Bouton icone={Plus} ecrit disabled={liste.length >= MAX_LIGNES} onClick={() => changer((s) => [...s, nouvelleSaisie()])}>Ajouter une ligne</Bouton>
                <Bouton icone={ClipboardPaste} ecrit disabled={liste.length >= MAX_LIGNES} onClick={() => { setRefusCollage([]); setCollage(true); }}>Coller des lignes</Bouton>
                <Bouton variante="principal" icone={Play} ecrit enCours={occupe === 'lancer'} disabled={!pretes || inactif} onClick={() => void lancer()}>
                  {liste.length > 0 ? `Lancer le lot (${liste.length})` : 'Lancer le lot'}
                </Bouton>
              </div>
            </>
          )}
        </section>

        <section className="bm-gen-lot" aria-label="Lot">
          <header className="bm-gen-entete">
            <h2>Lot</h2>
            {lot?.etat === 'prepare' && <Pastille sens="neutre">Préparé</Pastille>}
            {demarre && <span className="bm-gen-compte">{traitees} sur {lignes.length}</span>}
          </header>
          {fin && lot === null && <p className="bm-gen-fin" role="status">{fin === 'arrete' ? 'Lot arrêté.' : 'Le dernier lot est terminé.'}</p>}
          {lot === null && !fin && <p className="bm-gen-vide">Aucun lot. Écrivez la liste puis lancez.</p>}
          {lot?.etat === 'prepare' && <p className="bm-gen-vide">Ce lot est préparé, il n’est pas lancé. Relisez la liste puis lancez.</p>}
          {demarre && lot.interrompu && (
            <Alerte sens="avertissement">Le serveur a redémarré pendant le lot. Reprenez-le quand vous voulez.</Alerte>
          )}
          {demarre && (
            <div className="bm-gen-actions">
              {lot.interrompu && (
                <Bouton variante="principal" icone={RotateCcw} ecrit enCours={occupe === 'reprendre'} disabled={inactif} onClick={() => void agir('reprendre', '/reprendre')}>Reprendre</Bouton>
              )}
              <Bouton variante="danger" icone={Square} ecrit enCours={occupe === 'arreter'} disabled={inactif} onClick={() => setConfirmerArret(true)}>Arrêter le lot</Bouton>
            </div>
          )}
          {demarre && (
            <ul className="bm-gen-lignes">
              {lignes.map((l) => (
                <LigneDuLot
                  key={l.id}
                  id={id}
                  ligne={l}
                  occupee={occupe}
                  inactif={inactif}
                  moteurOccupe={donnees?.moteurOccupe ?? false}
                  remarque={remarqueDe === l.id ? remarque : null}
                  onRemarque={(v) => setRemarque(v)}
                  onOuvrirRemarque={() => { setRemarqueDe(l.id); setRemarque(''); }}
                  onFermerRemarque={() => setRemarqueDe(null)}
                  onAgir={(cle, chemin, corps) => agir(cle, chemin, corps).then((ok) => { if (ok) setRemarqueDe(null); })}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {collage && (
        <BoiteCollage
          places={MAX_LIGNES - liste.length}
          onFermer={() => setCollage(false)}
          onAjouter={(nouvelles, refus) => {
            setCollage(false);
            setRefusCollage(refus);
            changer((s) => [...s, ...nouvelles]);
          }}
        />
      )}
      {confirmerArret && (
        <BoiteDialogue
          titre="Arrêter le lot"
          texte="Les lignes non acceptées seront écartées, leurs brouillons supprimés."
          action="Arrêter le lot"
          icone={Sparkles}
          onConfirmer={() => void arreter()}
          onFermer={() => setConfirmerArret(false)}
        />
      )}
    </div>
  );
}

function BandeauDirection({ id, direction }: { id: string; direction: string | null }) {
  return (
    <div className="bm-gen-direction" role="note">
      {direction === null ? (
        <>
          <span>Sans direction artistique, les images seront génériques.</span>
          <Link to={`/univers/${id}/outils/battlemap/assets?onglet=direction`}>Écrire une direction</Link>
        </>
      ) : (
        <>
          <span><b>Direction artistique</b> · {direction}</span>
          <Link to={`/univers/${id}/outils/battlemap/assets?onglet=direction`}>Modifier</Link>
        </>
      )}
    </div>
  );
}

function LigneListe({ ligne, rang, onChange, onRetirer }: {
  ligne: LigneSaisie; rang: number; onChange: (p: Partial<LigneSaisie>) => void; onRetirer: () => void;
}) {
  const sans = sansEmpreinte(ligne.categorie);
  const vide = ligne.nom.trim() === '';
  return (
    <li className="bm-gen-saisie">
      <Champ etiquette={`Nom de la ligne ${rang}`} zone rows={1} value={ligne.nom} maxLength={MAX_NOM} placeholder="Nom" erreur={vide ? 'obligatoire' : undefined}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); }}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ nom: e.target.value.replace(/\s*\n+\s*/g, ' ') })} />
      <Champ etiquette={`Catégorie de la ligne ${rang}`} liste value={ligne.categorie}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ categorie: e.target.value as Categorie })}>
        {CATEGORIES.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
      </Champ>
      <div className="bm-gen-empreinte">
        {!sans && (
          <>
            <Champ etiquette={`Largeur de la ligne ${rang}`} type="number" min={1} max={MAX_EMPREINTE} value={ligne.largeur}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ largeur: e.target.value })} />
            <Champ etiquette={`Hauteur de la ligne ${rang}`} type="number" min={1} max={MAX_EMPREINTE} value={ligne.hauteur}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ hauteur: e.target.value })} />
          </>
        )}
      </div>
      <Bouton variante="fantome" petit icone={Trash2} ecrit aria-label={`Retirer la ligne ${ligne.nom.trim() || rang}`} onClick={onRetirer}>Retirer</Bouton>
      <div className="bm-gen-saisie-indication">
        <Champ etiquette={`Indication de la ligne ${rang}`} facultatif value={ligne.indice} maxLength={MAX_INDICE} placeholder="Indication : une couchette double, draps froissés"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ indice: e.target.value })} />
      </div>
    </li>
  );
}

function LigneDuLot({ id, ligne: l, occupee, inactif, moteurOccupe, remarque, onRemarque, onOuvrirRemarque, onFermerRemarque, onAgir }: {
  id: string; ligne: LigneLot; occupee: string | null; inactif: boolean; moteurOccupe: boolean; remarque: string | null;
  onRemarque: (v: string) => void; onOuvrirRemarque: () => void; onFermerRemarque: () => void;
  onAgir: (cle: string, chemin: string, corps?: unknown) => Promise<void>;
}) {
  const [cassee, setCassee] = useState(false);
  const e = ETATS[l.etat];
  const cle = (a: string) => `${a}-${l.id}`;
  const chemin = (a: string) => `/lignes/${l.id}/${a}`;
  return (
    <li className={`bm-gen-ligne etat-${l.etat}`}>
      {l.etat === 'brouillon' && (
        <div className="carte-asset-vignette bm-gen-image">
          {cassee ? <span className="bm-gen-image-cassee">Impossible de charger l’image.</span>
            : <img src={srcFichier(id, l)} alt={`Brouillon de ${l.nom}`} loading="lazy" onError={() => setCassee(true)} />}
        </div>
      )}
      {l.etat === 'echec' && <div className="bm-gen-image bm-gen-image-echec" aria-hidden="true">!</div>}
      <div className="bm-gen-corps">
      <div className="bm-gen-ligne-tete">
        <span className="bm-gen-nom" title={l.nom}>{l.nom}</span>
        <span className="bm-gen-meta">{LIBELLE_CATEGORIE[l.categorie]}{l.largeur !== null ? ` · ${l.largeur}×${l.hauteur}` : ''}</span>
        <Pastille sens={e.sens}>{e.mot}</Pastille>
      </div>
      {l.indice && <small className="bm-gen-indice">{l.indice}</small>}
      {l.etat === 'en_cours' && (
        <>
          <p role="status" className="bm-gen-statut">Génération de {l.nom}…</p>
          {moteurOccupe && <Alerte sens="avertissement">Le moteur d’image est occupé, votre lot attend son tour.</Alerte>}
        </>
      )}
      {l.etat === 'interrompu' && <small className="bm-gen-indice">Le serveur a redémarré pendant ce lot.</small>}
      {l.etat === 'echec' && (
        <>
          <p className="bm-gen-echec">{l.motEchec ?? 'Échec'}</p>
          <div className="bm-gen-actions">
            <Bouton petit ecrit enCours={occupee === cle('reessayer')} disabled={inactif} onClick={() => void onAgir(cle('reessayer'), chemin('reessayer'))}>Réessayer</Bouton>
            <Bouton petit ecrit enCours={occupee === cle('ecarter')} disabled={inactif} onClick={() => void onAgir(cle('ecarter'), chemin('ecarter'))}>Écarter</Bouton>
          </div>
        </>
      )}
      {l.etat === 'brouillon' && (
        <>
          {remarque === null ? (
            <div className="bm-gen-actions">
              <Bouton petit variante="principal" ecrit enCours={occupee === cle('accepter')} disabled={inactif || cassee} onClick={() => void onAgir(cle('accepter'), chemin('accepter'))}>Accepter</Bouton>
              <Bouton petit ecrit disabled={inactif} onClick={onOuvrirRemarque}>Régénérer…</Bouton>
              <Bouton petit ecrit enCours={occupee === cle('ecarter')} disabled={inactif} onClick={() => void onAgir(cle('ecarter'), chemin('ecarter'))}>Écarter</Bouton>
            </div>
          ) : (
            <form className="bm-gen-remarque" onSubmit={(ev) => { ev.preventDefault(); void onAgir(cle('regenerer'), chemin('regenerer'), { remarque }); }}>
              <Champ etiquette="Remarque" facultatif placeholder="plus usé" maxLength={500} value={remarque}
                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => onRemarque(ev.target.value)} />
              <div className="bm-gen-actions">
                <Bouton petit type="submit" variante="principal" ecrit enCours={occupee === cle('regenerer')} disabled={inactif}>Régénérer</Bouton>
                <Bouton petit onClick={onFermerRemarque}>Annuler</Bouton>
              </div>
            </form>
          )}
        </>
      )}
      {l.etat === 'accepte' && l.assetId !== null && (
        <Link className="bm-gen-lien" to={`/univers/${id}/outils/battlemap/assets`}>Voir dans la bibliothèque</Link>
      )}
      </div>
    </li>
  );
}

function BoiteCollage({ places, onFermer, onAjouter }: {
  places: number; onFermer: () => void; onAjouter: (lignes: LigneSaisie[], refus: string[]) => void;
}) {
  const [texte, setTexte] = useState('');
  function valider() {
    const { lignes, refus } = lireLignesCollees(texte);
    const gardees = lignes.slice(0, Math.max(0, places));
    onAjouter(gardees, lignes.length > gardees.length ? [...refus, MESSAGE_LIGNES] : refus);
  }
  return (
    <Fenetre titre="Coller des lignes" icone={ClipboardPaste} onFermer={onFermer}>
      <p className="bm-note">Une ligne par asset : nom ; catégorie ; LxH ; indication. Catégories : objet, vaisseau, décor, sol, mur.</p>
      <Champ etiquette="Lignes à coller" zone value={texte} placeholder={'Couchette ; objet ; 2x1 ; draps froissés\nPlancher ; sol'}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTexte(e.target.value)} />
      <div className="actions">
        <Bouton variante="principal" disabled={texte.trim() === ''} onClick={valider}>Ajouter les lignes</Bouton>
        <Bouton onClick={onFermer}>Annuler</Bouton>
      </div>
    </Fenetre>
  );
}
