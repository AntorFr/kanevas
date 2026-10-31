import { Link2, Route as IconeRoute, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { Bouton } from '../../../ui';
import { cases, distanceHex } from './geo';
import type { PanneauSysteme, Reference, Resultat, VueTrajet } from './types';

const TAILLES: Record<number, string> = { 1: 'Petite', 2: 'Moyenne', 3: 'Grande' };


/** The search of readable systems: from 2 characters, the latest query wins. */
function useRecherche(base: string, suffixe: string) {
  const [texte, setTexte] = useState('');
  const [liste, setListe] = useState<Resultat[] | null>(null);
  const [echec, setEchec] = useState(false);
  const [essai, setEssai] = useState(0);
  const tour = useRef(0);
  const q = texte.trim();
  useEffect(() => {
    const mon = ++tour.current;
    setEchec(false);
    if ([...q].length < 2) { setListe(null); return; }
    const t = setTimeout(() => {
      lire<Resultat[]>(`${base}/recherche?q=${encodeURIComponent(q)}${suffixe ? `&${suffixe.slice(1)}` : ''}`).then(
        (r) => mon === tour.current && setListe(r),
        () => mon === tour.current && (setEchec(true), setListe(null)),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [q, base, suffixe, essai]);
  const vider = () => { setTexte(''); setListe(null); };
  return { texte, setTexte, liste, echec, reessayer: () => setEssai((n) => n + 1), vider };
}

/** A system search field: from 2 characters, readable systems only, « Aucun système ne correspond. » otherwise. */
export function ChampSysteme({ base, suffixe, etiquette, valeur, onChoisir, desactive }: {
  base: string; suffixe: string; etiquette: string; valeur: Resultat | null; onChoisir: (r: Resultat | null) => void; desactive?: boolean;
}) {
  const perdue = useConnexionPerdue();
  const rech = useRecherche(base, suffixe);

  const id = `gx-champ-${etiquette}`;
  return (
    <div className="gx-champ">
      <label htmlFor={id}>{etiquette}</label>
      {valeur ? (
        <div className="gx-choisi">
          <span>{valeur.nom}</span>
          <Bouton petit onClick={() => onChoisir(null)} aria-label={`Changer ${etiquette.toLowerCase()}`}>Changer</Bouton>
        </div>
      ) : (
        <>
          <input id={id} type="search" value={rech.texte} disabled={desactive || perdue} autoComplete="off"
            placeholder="Rechercher un système" onChange={(e) => rech.setTexte(e.target.value)} />
          <ResultatsRecherche liste={rech.liste} echec={rech.echec} onChoisir={(r) => { rech.vider(); onChoisir(r); }} onReessayer={rech.reessayer} />
        </>
      )}
    </div>
  );
}

function ResultatsRecherche({ liste, echec, onChoisir, onReessayer }: {
  liste: Resultat[] | null; echec: boolean; onChoisir: (r: Resultat) => void; onReessayer: () => void;
}) {
  if (echec) return <p className="echec" role="alert">La recherche a échoué. <Bouton petit onClick={onReessayer}>Réessayer</Bouton></p>;
  if (liste === null) return null;
  if (liste.length === 0) return <p className="gx-note">Aucun système ne correspond.</p>;
  return (
    <ul className="gx-resultats">
      {liste.map((r) => (
        <li key={r.cle}><button type="button" onClick={() => onChoisir(r)}>{r.nom}</button></li>
      ))}
    </ul>
  );
}

/** The search block of the column (top). */
export function Recherche({ base, suffixe, onChoisir }: { base: string; suffixe: string; onChoisir: (r: Resultat) => void }) {
  const perdue = useConnexionPerdue();
  const rech = useRecherche(base, suffixe);
  return (
    <div className="gx-bloc gx-recherche">
      <label htmlFor="gx-recherche"><Search size={14} aria-hidden="true" /> Rechercher un système</label>
      <input id="gx-recherche" type="search" value={rech.texte} disabled={perdue} autoComplete="off" onChange={(e) => rech.setTexte(e.target.value)} />
      <ResultatsRecherche liste={rech.liste} echec={rech.echec} onChoisir={(r) => { rech.vider(); onChoisir(r); }} onReessayer={rech.reessayer} />
    </div>
  );
}

export type EtatPanneau =
  | { k: 'chargement' }
  | { k: 'erreur' }
  | { k: 'introuvable' }
  | { k: 'ok'; s: PanneauSysteme };

/** The selected system's panel, or « Système non défini » for a generated hexagon. */
export function PanneauSystemeVue({ selection, etat, secret, mesure, onDepuis, onVers, onReessayer }: {
  selection: { k: 'systeme'; cle: string } | { k: 'genere'; q: number; r: number };
  etat: EtatPanneau; secret?: boolean; mesure: Reference | null;
  onDepuis: (r: Resultat) => void; onVers: (r: Resultat) => void; onReessayer: () => void;
}) {
  const [copie, setCopie] = useState(false);
  const [champ, setChamp] = useState<string | null>(null);
  const saisie = useRef<HTMLInputElement>(null);
  useEffect(() => { setCopie(false); setChamp(null); }, [selection]);
  useEffect(() => { if (champ !== null) saisie.current?.select(); }, [champ]);

  if (selection.k === 'genere') {
    const d = mesure ? distanceHex(selection, mesure) : null;
    return (
      <section className="gx-bloc gx-panneau" aria-label="Système sélectionné">
        <h2>Système non défini</h2>
        <dl className="gx-kv"><dt>Coordonnées</dt><dd>{selection.q}, {selection.r}</dd>
          {d !== null && <><dt>Distance</dt><dd>{cases(d)}{mesure ? ` depuis ${mesure.nom}` : ''}</dd></>}</dl>
      </section>
    );
  }
  if (etat.k === 'chargement') return <section className="gx-bloc gx-panneau" aria-busy="true"><p className="gx-note">Chargement…</p></section>;
  if (etat.k !== 'ok') return (
    <section className="gx-bloc gx-panneau"><p className="echec" role="alert">Impossible de charger le système. <Bouton petit onClick={onReessayer}>Réessayer</Bouton></p></section>
  );
  const s = etat.s;
  const ici: Resultat = { cle: selection.cle, nom: s.nom, q: s.q, r: s.r };
  const adresse = new URL(s.lien, window.location.origin).toString();
  const d = mesure && mesure.cle !== selection.cle ? distanceHex(s, mesure) : null;
  async function copier() {
    try {
      await navigator.clipboard.writeText(adresse);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setChamp(adresse);
    }
  }
  return (
    <section className="gx-bloc gx-panneau" aria-label="Système sélectionné">
      <div className="gx-tete"><h2>{s.nom}</h2>{secret && <span className="pastille mj">MJ seul</span>}</div>
      <dl className="gx-kv">
        <dt>Taille</dt><dd>{TAILLES[s.taille] ?? `Taille ${s.taille}`}</dd>
        {s.notes !== '' && <><dt>Notes</dt><dd className="gx-notes">{s.notes}</dd></>}
        {d !== null && mesure && <><dt>Distance</dt><dd>{cases(d)} depuis {mesure.nom}</dd></>}
        {s.routes.length > 0 && <><dt>Routes</dt><dd><ul className="gx-routes">{s.routes.map((r) => <li key={r.avec.cle}>{r.avec.nom} · {cases(r.longueur)}</li>)}</ul></dd></>}
      </dl>
      <div className="gx-actions">
        <Bouton icone={IconeRoute} onClick={() => onDepuis(ici)}>Trajet depuis ici</Bouton>
        <Bouton onClick={() => onVers(ici)}>Trajet vers ici</Bouton>
        <Bouton icone={Link2} onClick={() => void copier()}>Copier le lien</Bouton>
        {copie && <span role="status" className="gx-note">Lien copié</span>}
      </div>
      {champ !== null && <input ref={saisie} className="gx-lien" readOnly value={champ} aria-label="Adresse du système" onFocus={(e) => e.currentTarget.select()} />}
    </section>
  );
}

/** The « Trajet » tool: two ends, engine, routes (GM only), result. */
export function Trajet({ base, suffixe, mj, depart, arrivee, onDepart, onArrivee, resultat, onResultat }: {
  base: string; suffixe: string; mj: boolean;
  depart: Resultat | null; arrivee: Resultat | null; onDepart: (r: Resultat | null) => void; onArrivee: (r: Resultat | null) => void;
  resultat: VueTrajet | null; onResultat: (v: VueTrajet | null) => void;
}) {
  const perdue = useConnexionPerdue();
  const [moteur, setMoteur] = useState(2);
  const [routes, setRoutes] = useState<'toutes' | 'publiques'>('toutes');
  const [calcul, setCalcul] = useState(false);
  const [echec, setEchec] = useState(false);
  const [message, setMessage] = useState<string>();
  const verrou = useRef(false);
  const prets = depart !== null && arrivee !== null;

  async function calculer() {
    if (!depart || !arrivee || verrou.current || perdue) return;
    setMessage(undefined);
    setEchec(false);
    if (depart.cle === arrivee.cle) return setMessage('Choisissez deux systèmes différents.');
    verrou.current = true;
    setCalcul(true);
    try {
      const params = new URLSearchParams({ depart: depart.cle, arrivee: arrivee.cle, moteur: String(moteur), routes: mj ? routes : 'publiques' });
      if (suffixe) params.set('mode', 'joueur');
      onResultat(await lire<VueTrajet>(`${base}/trajet?${params.toString()}`));
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) {
        onDepart(null); onArrivee(null); onResultat(null);
        setMessage('Ce système n’existe plus ou n’est plus visible.');
      } else setEchec(true);
    } finally {
      verrou.current = false;
      setCalcul(false);
    }
  }

  return (
    <section className="gx-bloc gx-trajet" aria-label="Trajet">
      <h2>Trajet</h2>
      <ChampSysteme base={base} suffixe={suffixe} etiquette="Départ" valeur={depart} onChoisir={onDepart} />
      <ChampSysteme base={base} suffixe={suffixe} etiquette="Arrivée" valeur={arrivee} onChoisir={onArrivee} />
      <div className="gx-champ">
        <label htmlFor="gx-moteur">Moteur</label>
        <select id="gx-moteur" value={moteur} onChange={(e) => setMoteur(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {mj && (
        <div className="gx-champ">
          <label htmlFor="gx-routes">Routes</label>
          <select id="gx-routes" value={routes} onChange={(e) => setRoutes(e.target.value as 'toutes' | 'publiques')}>
            <option value="toutes">Toutes</option>
            <option value="publiques">Publiques</option>
          </select>
        </div>
      )}
      <div className="gx-actions">
        <Bouton variante="principal" disabled={!prets || perdue} enCours={false} onClick={() => void calculer()}>{calcul ? 'Calcul…' : 'Calculer'}</Bouton>
        {resultat && <Bouton onClick={() => { onResultat(null); setMessage(undefined); }}>Effacer</Bouton>}
      </div>
      {message && <p className="gx-note" role="status">{message}</p>}
      {echec && <p className="echec" role="alert">Le calcul a échoué. <Bouton petit onClick={() => void calculer()}>Réessayer</Bouton></p>}
      {resultat && (resultat.trouve ? (
        <div className="gx-resultat">
          <p className="gx-libelle"><b>{resultat.libelle}</b></p>
          <ol className="gx-etapes" aria-label="Étapes">{resultat.etapes.map((e) => <li key={e.cle}>{e.nom}</li>)}</ol>
        </div>
      ) : <p className="gx-resultat" role="status">{resultat.libelle}</p>)}
    </section>
  );
}
