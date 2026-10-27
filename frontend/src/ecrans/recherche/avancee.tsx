import { Link2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../../api';
import { useCharge } from '../../cadre-contexte';
import { Bouton, Champ } from '../../ui';
import type { Fiche } from '../fiche/types';
import { ChoisirFiche } from './choisir-fiche';

interface Nature {
  cle: string;
  libelleSource: string;
  libelleCible: string;
  symetrique: boolean;
  typesCible: string[];
}

type Cible = { etat: 'chargement' | 'introuvable' | 'erreur' } | { etat: 'ok'; fiche: Fiche };

/** Resolve the address before searching; stale metadata never belongs to a new sheet or mode. */
export function useAvancee(universId: string, suffixeMode: string, params: URLSearchParams, setParams: SetURLSearchParams) {
  const perdue = useConnexionPerdue();
  const lie = params.get('lie') ?? '';
  const [natures, rechargerNatures] = useCharge<{ natures: Nature[] }>(`/api/univers/${universId}/natures`);
  const chemin = `/api/univers/${universId}/fiches/${encodeURIComponent(lie)}${suffixeMode ? `?${suffixeMode}` : ''}`;
  const [lecture, setLecture] = useState<{ chemin: string; cible: Cible }>();
  const [essai, setEssai] = useState(0);
  const cible: Cible = lecture?.chemin === chemin ? lecture.cible : { etat: 'chargement' };
  useEffect(() => {
    if (!lie || perdue) return;
    let actif = true;
    setLecture({ chemin, cible: { etat: 'chargement' } });
    lire<Fiche>(chemin).then(
      (fiche) => { if (actif) setLecture({ chemin, cible: { etat: 'ok', fiche } }); },
      (e: unknown) => { if (actif) setLecture({ chemin, cible: { etat: e instanceof ErreurApi && e.statut === 404 ? 'introuvable' : 'erreur' } }); },
    );
    return () => { actif = false; };
  }, [chemin, lie, perdue, essai]);
  const proposees = natures.etat === 'ok' && cible.etat === 'ok'
    ? natures.valeur.natures.filter((n) => n.typesCible.includes(cible.fiche.type)).slice(0, 5) : [];
  const natureUrl = params.get('nature') ?? '';
  const nature = proposees.some((n) => n.cle === natureUrl) ? natureUrl : '';
  const lieu = cible.etat === 'ok' && cible.fiche.type === 'lieu';
  const descendants = lieu && params.get('descendants') === '1';
  const resolue = cible.etat === 'ok' || cible.etat === 'introuvable';
  const nettoyable = !lie || (resolue && natures.etat === 'ok');
  useEffect(() => {
    if (!nettoyable) return;
    const n = new URLSearchParams(params);
    if (!lie || !nature) n.delete('nature');
    if (!lie || !descendants) n.delete('descendants');
    if (n.toString() !== params.toString()) setParams(n, { replace: true });
  }, [params, setParams, lie, nature, descendants, nettoyable]);
  return {
    lie, nature, descendants, cible, lieu, proposees, natures, rechargerNatures,
    rechargerCible: () => setEssai((n) => n + 1),
    attend: Boolean(lie) && (!resolue || natures.etat !== 'ok'),
  };
}

export function Avancee({ universId, suffixeMode, params, setParams, avancee }: {
  universId: string;
  suffixeMode: string;
  params: URLSearchParams;
  setParams: SetURLSearchParams;
  avancee: ReturnType<typeof useAvancee>;
}) {
  const perdue = useConnexionPerdue();
  const { lie, cible, proposees, nature, descendants, lieu, natures } = avancee;
  const porteFiltres = params.has('lie') || params.has('nature') || params.has('descendants');
  const [ouvert, setOuvert] = useState(porteFiltres);
  const details = useRef<HTMLDetailsElement>(null);
  const boutonRetrait = useRef<HTMLButtonElement>(null);
  const avant = useRef(lie);
  useEffect(() => { if (porteFiltres) setOuvert(true); }, [porteFiltres]);
  useEffect(() => {
    if (lie !== avant.current) {
      if (lie) boutonRetrait.current?.focus();
      else details.current?.querySelector<HTMLInputElement>('input')?.focus();
      avant.current = lie;
    }
  }, [lie]);
  function changer(cle: string, valeur: string) {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (valeur) n.set(cle, valeur); else n.delete(cle);
      if (cle === 'lie' && !valeur) { n.delete('nature'); n.delete('descendants'); }
      return n;
    }, { replace: true });
  }
  const titre = cible.etat === 'ok' ? cible.fiche.titre : cible.etat === 'introuvable' ? 'Fiche introuvable' : cible.etat === 'erreur' ? 'Impossible de charger la fiche.' : 'Chargement…';
  return <details ref={details} className="recherche-avancee" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
    <summary>Recherche avancée</summary>
    <div className="filtres-avances">
      {lie ? <div className="filtre-lie"><span className="lib-champ">Lié à</span>
        <span className="pastille-lie" title={titre}>
          <Link2 size={14} aria-hidden="true" /><span>{titre}</span>
          <button ref={boutonRetrait} type="button" aria-label="Retirer la fiche liée" title="Retirer" onClick={() => changer('lie', '')}><X size={14} aria-hidden="true" /></button>
        </span>
        {cible.etat === 'erreur' && <div role="alert"><Bouton petit disabled={perdue} onClick={avancee.rechargerCible}>Réessayer</Bouton></div>}
      </div> : <ChoisirFiche key={suffixeMode} universId={universId} suffixeMode={suffixeMode} onChoisir={(f) => changer('lie', String(f.id))} />}
      <div className="filtre-nature">
        <Champ etiquette="Par" liste value={nature} disabled={!lie || avancee.attend || perdue}
          onChange={(e: { target: { value: string } }) => changer('nature', e.target.value)}>
          <option value="">toute relation</option>
          {proposees.map((n) => <option key={n.cle} value={n.cle}>{n.symetrique ? n.libelleSource : n.libelleCible}</option>)}
        </Champ>
      </div>
      {lie && lieu && <label className="filtre-descendants"><input type="checkbox" checked={descendants} disabled={perdue}
        onChange={(e) => changer('descendants', e.target.checked ? '1' : '')} /> sous-lieux compris</label>}
    </div>
    {natures.etat === 'erreur' && <div className="echec" role="alert">Impossible de charger les natures. <Bouton petit disabled={perdue} onClick={avancee.rechargerNatures}>Réessayer</Bouton></div>}
  </details>;
}
