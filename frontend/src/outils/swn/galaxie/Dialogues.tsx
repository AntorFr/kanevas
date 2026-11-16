import { Dices, FileText, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { appeler, lire, useConnexionPerdue } from '../../../api';
import { BoiteDialogue, Bouton, Champ, Fenetre } from '../../../ui';
import { CONFLIT, ECHEC_ECRITURE, erreurNom, lireEchec, type Echec } from './ecriture';
import type { VueGalaxie } from './types';

/** Reads what a dialog needs at its opening: « Chargement… », or « Impossible de lire. Réessayez. » with a retry. */
function useLecture<T>(url: string) {
  const [valeur, setValeur] = useState<T | null>(null);
  const [echec, setEchec] = useState(false);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEchec(false);
    lire<T>(url).then((v) => actif && setValeur(v), () => actif && setEchec(true));
    return () => { actif = false; };
  }, [url, essai]);
  return { valeur, echec, rejouer: () => { setValeur(null); setEssai((n) => n + 1); } };
}

function Lecture({ echec, valeur, onRejouer, children }: { echec: boolean; valeur: unknown; onRejouer: () => void; children: ReactNode }) {
  if (echec) return <p className="echec" role="alert">Impossible de lire. Réessayez. <Bouton petit onClick={onRejouer}>Réessayer</Bouton></p>;
  if (valeur === null) return <p className="gx-note" role="status">Chargement…</p>;
  return <>{children}</>;
}

const pluriel = (n: number, un: string, plusieurs = `${un}s`) => (n === 1 ? `1 ${un}` : `${n} ${n === 0 ? un : plusieurs}`);

function MessageEchec({ echec, quoi = 'galaxie' }: { echec: Echec | null; quoi?: 'galaxie' }) {
  if (!echec || echec.sorte === 'perdu') return null;
  if (echec.sorte === 'conflit') return <p className="echec" role="alert">{CONFLIT[quoi]}</p>;
  if (echec.sorte === 'refus') return <p className="echec" role="alert">Action refusée.</p>;
  if (echec.sorte === 'autre') return <p className="echec" role="alert">{ECHEC_ECRITURE}</p>;
  return null;
}

interface Commun {
  base: string;
  galaxie: VueGalaxie;
  onFermer: () => void;
  /** The galaxy changed: the screen reads it again. */
  onChange: () => void;
  /** The galaxy is gone or no longer readable. */
  onIntrouvable: () => void;
  /** « Recharger »: the screen reads the galaxy again and the dialog starts over with its new version. */
  onRecharger: () => void;
}

/** Runs a write of a dialog: the kind of failure is kept, a vanished galaxy leaves the screen. */
function useEcriture(onIntrouvable: () => void) {
  const perdue = useConnexionPerdue();
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<Echec | null>(null);
  const executer = useCallback(async <T,>(appel: () => Promise<T>): Promise<{ ok: true; valeur: T } | { ok: false }> => {
    setEchec(null);
    setEnCours(true);
    try {
      return { ok: true, valeur: await appel() };
    } catch (e) {
      const f = lireEchec(e);
      if (f.sorte === 'introuvable') onIntrouvable(); else setEchec(f);
      return { ok: false };
    } finally {
      setEnCours(false);
    }
  }, [onIntrouvable]);
  return { enCours, echec, setEchec, executer, perdue };
}

/** « Renommer »: the title, 1 to 80 characters. */
export function DialogueRenommer({ base, galaxie, onFermer, onChange, onIntrouvable, onRecharger }: Commun) {
  const [titre, setTitre] = useState(galaxie.titre);
  const [version] = useState(galaxie.version);
  const [erreur, setErreur] = useState<string>();
  const w = useEcriture(onIntrouvable);
  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    if (w.enCours || w.perdue) return;
    const m = erreurNom(titre)?.replace('le nom', 'le titre');
    setErreur(m);
    if (m) return;
    const r = await w.executer(() => appeler('PATCH', base, { titre: titre.trim(), version }));
    if (r.ok) { onChange(); onFermer(); }
  }
  return (
    <Fenetre titre="Renommer" icone={Pencil} onFermer={onFermer}>
      <form onSubmit={(ev) => void soumettre(ev)} noValidate>
        <Champ etiquette="Titre" value={titre} erreur={erreur} onChange={(ev: { target: { value: string } }) => setTitre(ev.target.value)} />
        <MessageEchec echec={w.echec} />
        <div className="gx-actions">
          {w.echec?.sorte === 'conflit' && <Bouton onClick={() => { onRecharger(); onFermer(); }}>Recharger</Bouton>}
          <Bouton type="submit" variante="principal" ecrit disabled={w.enCours}>{w.enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}

const tirer = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

/** « Graine… » (B-64): shows the seed, asks the new one, then a confirmation that says what moves. */
export function DialogueGraine({ base, galaxie, onFermer, onChange, onIntrouvable, onRecharger }: Commun) {
  const lecture = useLecture<{ graine: string }>(`${base}/graine`);
  const contenu = useLecture<{ systemes: number }>(`${base}/contenu`);
  const [saisie, setSaisie] = useState('');
  const [version] = useState(galaxie.version);
  const [erreur, setErreur] = useState<string>();
  const [confirmation, setConfirmation] = useState(false);
  const w = useEcriture(onIntrouvable);
  const pret = lecture.valeur !== null && contenu.valeur !== null;

  function suite(ev: FormEvent) {
    ev.preventDefault();
    const g = saisie.trim();
    if ([...g].length < 1 || [...g].length > 64) return setErreur('la graine fait 1 à 64 caractères.');
    setErreur(undefined);
    setConfirmation(true);
  }
  async function changer() {
    const r = await w.executer(() => appeler('PUT', `${base}/graine`, { graine: saisie.trim(), version, confirme: true }));
    if (r.ok) { onChange(); onFermer(); }
  }
  if (confirmation) {
    const n = contenu.valeur?.systemes ?? 0;
    return (
      <BoiteDialogue
        titre="Changer la graine ?"
        texte={`Tous les systèmes non définis changent de place. ${n === 1 ? 'Le système que vous avez placé ou promu garde la sienne.' : `Les ${n} systèmes que vous avez placés ou promus gardent la leur.`}`}
        action="Changer la graine" icone={KeyRound} variante="mj" enCours={w.enCours}
        desactive={w.perdue} onConfirmer={() => void changer()} onFermer={onFermer}
      >
        <MessageEchec echec={w.echec} />
        {w.echec?.sorte === 'conflit' && <Bouton onClick={() => { onRecharger(); onFermer(); }}>Recharger</Bouton>}
        {w.echec?.sorte === 'champ' && <p className="echec" role="alert">Erreur : la graine fait 1 à 64 caractères.</p>}
      </BoiteDialogue>
    );
  }
  return (
    <Fenetre titre="Graine" icone={KeyRound} onFermer={onFermer}>
      <Lecture echec={lecture.echec || contenu.echec} valeur={pret ? true : null} onRejouer={() => { lecture.rejouer(); contenu.rejouer(); }}>
        <form onSubmit={suite} noValidate>
          <p>Graine actuelle : <code>{lecture.valeur?.graine}</code></p>
          <Champ etiquette="Nouvelle graine" value={saisie} erreur={erreur} maxLength={200}
            onChange={(ev: { target: { value: string } }) => setSaisie(ev.target.value)} />
          <div className="gx-actions">
            <Bouton icone={Dices} onClick={() => setSaisie(tirer())}>Tirer au hasard</Bouton>
            <Bouton type="submit" variante="principal" ecrit>Changer la graine</Bouton>
            <Bouton onClick={onFermer}>Annuler</Bouton>
          </div>
        </form>
      </Lecture>
    </Fenetre>
  );
}

interface Decomptes { systemes: number; routes: number; zones: number; document: { titre: string } | null }

/** « Supprimer la galaxie… »: the counts are read at the opening and sent back; a changed count is stated again. */
export function DialogueSuppression({ base, galaxie, onFermer, onIntrouvable, onRecharger, onSupprimee }: Commun & { onSupprimee: () => void }) {
  const lecture = useLecture<Decomptes>(`${base}/contenu`);
  const [vu, setVu] = useState<Decomptes | null>(null);
  const [change, setChange] = useState(false);
  const [version] = useState(galaxie.version);
  const w = useEcriture(onIntrouvable);
  const d = vu ?? lecture.valeur;
  async function effacer() {
    if (!d) return;
    const r = await w.executer(() => appeler('DELETE', `${base}?version=${version}&systemes=${d.systemes}&routes=${d.routes}&zones=${d.zones}`));
    if (r.ok) onSupprimee();
  }
  // A changed count comes back as 409 `contenu_change`: the new numbers replace the old ones and the GM reads them again.
  useEffect(() => {
    const f = w.echec;
    if (f?.code === 'contenu_change' && f.details) {
      const n = f.details as unknown as Decomptes;
      setVu({ systemes: n.systemes, routes: n.routes, zones: n.zones, document: lecture.valeur?.document ?? null });
      setChange(true);
      w.setEchec(null);
    }
  }, [w.echec]); // eslint-disable-line react-hooks/exhaustive-deps
  const phrase = d ? `Les ${pluriel(d.systemes, 'système')}, ${pluriel(d.routes, 'route')} et ${pluriel(d.zones, 'zone')} de cette galaxie seront effacés.` : '';
  return (
    <BoiteDialogue
      titre={`Supprimer la galaxie « ${galaxie.titre} » ?`}
      texte={d ? phrase : 'Chargement…'}
      action="Effacer la galaxie" icone={Trash2} enCours={w.enCours} desactive={!d || w.perdue}
      onConfirmer={() => void effacer()} onFermer={onFermer}
    >
      {lecture.echec && <p className="echec" role="alert">Impossible de lire. Réessayez. <Bouton petit onClick={lecture.rejouer}>Réessayer</Bouton></p>}
      {!d && !lecture.echec && <p className="gx-note" role="status">Chargement…</p>}
      {change && <p className="echec" role="alert">Cette galaxie a changé : relisez le décompte.</p>}
      {d?.document && <p>Sa section « Document MJ » de la fiche « {d.document.titre} » sera retirée.</p>}
      <MessageEchec echec={w.echec} />
      {w.echec?.sorte === 'conflit' && <Bouton onClick={() => { onRecharger(); onFermer(); }}>Recharger</Bouton>}
    </BoiteDialogue>
  );
}

interface VueDocument {
  fiche: { id: number; titre: string } | null;
  sectionId: number | null;
  etat: 'a_jour' | 'perime' | 'desactive' | null;
  propositionId: number | null;
}
interface FicheListee { id: number; titre: string }

/** « Document MJ… » (B-74): no document yet, choose or create a sheet; with one, its state and the proposal. */
export function DialogueDocument({ base, universId, galaxie, onFermer, onChange, onIntrouvable, onRecharger }: Commun & { universId: number }) {
  const lecture = useLecture<VueDocument>(`${base}/document`);
  const [doc, setDoc] = useState<VueDocument | null>(null);
  const d = doc ?? lecture.valeur;
  const [version] = useState(galaxie.version);
  const [choix, setChoix] = useState<'choisir' | 'creer'>('creer');
  const [titre, setTitre] = useState('Galaxie — notes MJ');
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [recherche, setRecherche] = useState('');
  const [fiches, setFiches] = useState<FicheListee[] | null>(null);
  const [rechercheEchec, setRechercheEchec] = useState(false);
  const [fiche, setFiche] = useState<number | null>(null);
  const [message, setMessage] = useState<string>();
  const w = useEcriture(onIntrouvable);

  useEffect(() => {
    if (choix !== 'choisir') return;
    let actif = true;
    setRechercheEchec(false);
    const t = setTimeout(() => {
      lire<{ fiches: FicheListee[] }>(`/api/univers/${universId}/fiches?q=${encodeURIComponent(recherche.trim())}`).then(
        (p) => actif && setFiches(p.fiches),
        () => actif && setRechercheEchec(true),
      );
    }, 200);
    return () => { actif = false; clearTimeout(t); };
  }, [choix, recherche, universId]);

  async function ecrire() {
    setMessage(undefined);
    if (choix === 'creer') {
      const m = erreurNom(titre)?.replace('le nom', 'le titre');
      setErreurTitre(m);
      if (m) return;
    } else if (fiche === null) return setMessage('Choisissez une fiche.');
    const r = await w.executer(() => appeler<VueDocument>('POST', `${base}/document`,
      { ...(choix === 'creer' ? { creer: { titre: titre.trim() } } : { ficheId: fiche }), version }));
    if (r.ok) { setDoc(r.valeur); onChange(); }
  }
  useEffect(() => {
    const f = w.echec;
    if (!f) return;
    if (f.code === 'document_existant') setMessage('Cette fiche porte déjà un document.');
    else if (f.sorte === 'champ' || f.sorte === 'refus') setMessage('Cette fiche n’est plus disponible.');
  }, [w.echec]);

  async function proposer() {
    if (!d?.fiche || d.sectionId === null) return;
    const r = await w.executer(() => appeler('POST', `/api/univers/${universId}/fiches/${d.fiche!.id}/sections/${d.sectionId}/recalcul/proposition`));
    if (r.ok) { const v = await lire<VueDocument>(`${base}/document`).catch(() => null); if (v) setDoc(v); }
  }

  return (
    <Fenetre titre="Document MJ" icone={FileText} onFermer={onFermer}>
      <Lecture echec={lecture.echec} valeur={d} onRejouer={lecture.rejouer}>
        {d?.fiche ? (
          <div>
            <p>Document dans « {d.fiche.titre} »</p>
            <p role="status">{d.etat === 'perime' ? 'Le document n’est plus à jour.' : d.etat === 'a_jour' ? 'À jour.' : ''}</p>
            {d.etat === 'perime' && d.propositionId !== null && (
              <p>Proposition en attente — à appliquer dans les propositions.</p>
            )}
            <div className="gx-actions">
              <Link className="bouton" to={`/univers/${universId}/fiche/${d.fiche.id}`}>Ouvrir la fiche</Link>
              {d.etat === 'perime' && d.propositionId === null && (
                <Bouton variante="principal" ecrit enCours={w.enCours} onClick={() => void proposer()}>Proposer la mise à jour</Bouton>
              )}
              <Bouton onClick={onFermer}>Fermer</Bouton>
            </div>
            <MessageEchec echec={w.echec} />
          </div>
        ) : (
          <div className="gx-dialogue-corps">
            <p>Seul le MJ lit ce document.</p>
            <div className="gx-actions">
              <Bouton variante={choix === 'choisir' ? 'principal' : 'neutre'} aria-pressed={choix === 'choisir'} onClick={() => setChoix('choisir')}>Choisir une fiche</Bouton>
              <Bouton variante={choix === 'creer' ? 'principal' : 'neutre'} aria-pressed={choix === 'creer'} onClick={() => setChoix('creer')}>Créer une fiche de type Savoir</Bouton>
            </div>
            {choix === 'creer' ? (
              <Champ etiquette="Titre" value={titre} erreur={erreurTitre} onChange={(ev: { target: { value: string } }) => setTitre(ev.target.value)} />
            ) : (
              <div>
                <Champ etiquette="Rechercher une fiche" type="search" value={recherche} onChange={(ev: { target: { value: string } }) => setRecherche(ev.target.value)} />
                {rechercheEchec && <p className="echec" role="alert">Impossible de lire. Réessayez.</p>}
                {fiches !== null && fiches.length === 0 && <p className="gx-note">Aucune fiche.</p>}
                <ul className="gx-fiches" aria-label="Fiches">
                  {(fiches ?? []).map((f) => (
                    <li key={f.id}><button type="button" aria-pressed={fiche === f.id} onClick={() => setFiche(f.id)}>{f.titre}</button></li>
                  ))}
                </ul>
              </div>
            )}
            {message && <p className="echec" role="alert">{message}</p>}
            <MessageEchec echec={w.echec} />
            <div className="gx-actions">
              {w.echec?.sorte === 'conflit' && <Bouton onClick={() => { onRecharger(); onFermer(); }}>Recharger</Bouton>}
              <Bouton variante="principal" ecrit enCours={w.enCours} onClick={() => void ecrire()}>Écrire le document</Bouton>
              <Bouton onClick={onFermer}>Annuler</Bouton>
            </div>
          </div>
        )}
      </Lecture>
    </Fenetre>
  );
}
