import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { appeler, ErreurApi, useConnexionPerdue } from '../../../api';
import { Bouton, BoutonIcone, Fenetre } from '../../../ui';
import type { LigneDonnees, Niveau, Outil, ResumeSuppression } from '../types';
import { compte, phrase, phraseResultat } from './phrases';

type Phase = 'lecture' | 'pret' | 'suppression' | 'resultat' | 'erreur' | 'refus' | 'coupure';
const VISIBLES = 6;

/** E-20 deletion dialog: reads the summary at opening, deletes only the lines it just showed (`vu`). */
export function SuppressionDialog({ base, niveau, outil, onFermer }: { base: string; niveau: Niveau; outil: Outil; onFermer: () => void }) {
  const [phase, setPhase] = useState<Phase>('lecture');
  const [resume, setResume] = useState<ResumeSuppression>();
  const [change, setChange] = useState(false);
  const [efface, setEfface] = useState<LigneDonnees[]>([]);
  const [hors, setHors] = useState(false);
  const tour = useRef(0);
  const occupe = useRef(false);
  const suppression = useRef(false);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  const perdue = useConnexionPerdue();
  const dismiss = useCallback(() => { if (!suppression.current) fermer.current(); }, []);
  useEffect(() => () => { tour.current++; }, []);

  /** Reads the summary; returns it, or undefined once the failure is shown. */
  async function lire(): Promise<ResumeSuppression | undefined> {
    const mon = ++tour.current;
    setPhase('lecture'); setHors(false);
    try {
      const r = await appeler<ResumeSuppression>('GET', base);
      if (mon !== tour.current) return undefined;
      setResume(r); setPhase('pret');
      return r;
    } catch (e) {
      if (mon !== tour.current) return undefined;
      if (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404)) setPhase('refus');
      else { setHors(e instanceof ErreurApi && e.statut === 0); setPhase('erreur'); }
      return undefined;
    }
  }
  useEffect(() => { void lire(); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmer() {
    if (!resume || occupe.current || perdue) return;
    occupe.current = true; suppression.current = true;
    const mon = ++tour.current;
    setPhase('suppression');
    try {
      const r = await appeler<{ efface: LigneDonnees[] }>('POST', base, { vu: resume.efface.map((l) => ({ cle: l.cle, nombre: l.nombre })) });
      if (mon !== tour.current) return;
      setEfface(r.efface); setPhase('resultat');
      window.dispatchEvent(new Event('kanevas:outils-modifies'));
    } catch (e) {
      if (mon !== tour.current) return;
      if (e instanceof ErreurApi && e.statut === 409 && e.code === 'contenu_change') {
        suppression.current = false; occupe.current = false;
        if (await lire()) setChange(true);
      } else if (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404)) setPhase('refus');
      else if (e instanceof ErreurApi && e.statut === 0) setPhase('coupure');
      else { setHors(false); setPhase('erreur'); }
    } finally { occupe.current = false; suppression.current = false; }
  }

  const lignes = resume?.efface ?? [];
  const galaxie = outil.type === 'carte' && !outil.catalogue;
  const vide = phase === 'pret' && lignes.length === 0;
  const utilise = resume?.encoreUtilise;
  const enCours = phase === 'suppression';
  return createPortal(<Fenetre titre={`Supprimer les données de « ${outil.libelle} » ?`} onFermer={dismiss}>
    <div className="suppression-dialog">
      <div className="suppression-close"><BoutonIcone data-close etiquette="Fermer" icone={X} disabled={enCours} onClick={dismiss} /></div>
      <div className="suppression-contenu" aria-busy={phase === 'lecture' || enCours || undefined}>
        {perdue && phase !== 'coupure' && <p className="suppression-echec" role="status">Connexion perdue.</p>}
        {phase === 'lecture' && <p role="status">Lecture des données de l’outil…</p>}
        {(phase === 'pret' || enCours) && resume && !vide && <>
          {change && <p className="suppression-echec" role="alert">Les données ont changé depuis que vous avez ouvert cette fenêtre.</p>}
          <p className="suppression-phrase">{phrase(lignes, niveau, galaxie)}</p>
          {niveau === 'univers' && resume.sectionsGerees > 0 && <p className="suppression-note">
            Les fiches et leur texte sont conservés : leurs sections ne seront plus gérées par l’outil.</p>}
          {utilise && utilise.univers.length > 0 && <div className="suppression-utilise">
            <h3>Encore utilisé par :</h3>
            <ul>{utilise.univers.slice(0, VISIBLES).map((u) => <li key={u.id}>{u.nom}</li>)}</ul>
            {utilise.univers.length > VISIBLES && <p className="suppression-note">… et {utilise.univers.length - VISIBLES} autres</p>}
            {utilise.lignes.length > 0 && <p className="suppression-note">Ensemble : {utilise.lignes.map(compte).join(', ')}.</p>}
            <p className="suppression-note">Ces univers perdent les éléments du système : leurs conceptions seront à recalculer.</p>
          </div>}
          <p className="suppression-note"><strong>Cette action est définitive.</strong></p>
        </>}
        {vide && <>
          {change && <p className="suppression-echec" role="alert">Les données ont changé depuis que vous avez ouvert cette fenêtre.</p>}
          <p>Cet outil n’a aucune donnée à supprimer.</p>
        </>}
        {phase === 'resultat' && <p className="suppression-resultat" role="status">{phraseResultat(efface)}</p>}
        {phase === 'refus' && <p className="suppression-echec" role="alert">Vous ne pouvez plus supprimer ces données.</p>}
        {phase === 'coupure' && <p className="suppression-echec" role="alert">
          Connexion perdue pendant la suppression. Rien n’est supprimé à moitié : rouvrez la fenêtre pour voir l’état.</p>}
        {phase === 'erreur' && <div className="suppression-echec" role="alert">
          <p>{hors ? 'Connexion perdue.' : 'L’action n’a pas abouti. Rien n’est supprimé.'}</p>
          <Bouton disabled={perdue} onClick={() => void lire()}>Réessayer</Bouton>
        </div>}
        {phase === 'pret' && change && <Bouton onClick={() => void lire().then((r) => r && setChange(false))}>Recharger</Bouton>}
      </div>
      <footer className="suppression-actions">
        {(phase === 'pret' || enCours) && !vide && <Bouton variante="danger" ecrit disabled={perdue || enCours} onClick={() => void confirmer()}>
          {enCours ? 'Suppression…' : 'Supprimer les données'}</Bouton>}
        {(phase === 'pret' || enCours) && !vide
          ? <Bouton disabled={enCours} onClick={dismiss}>Annuler</Bouton>
          : phase !== 'lecture' && <Bouton onClick={dismiss}>Fermer</Bouton>}
      </footer>
    </div>
  </Fenetre>, document.body);
}
