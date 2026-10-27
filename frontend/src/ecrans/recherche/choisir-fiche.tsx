import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { lire, useConnexionPerdue } from '../../api';
import { useCharge } from '../../cadre-contexte';
import { badgeFiche, iconeDuType, useTypes } from '../../types-contexte';
import { Bouton, Champ } from '../../ui';
import { LONGUEUR_RECHERCHE } from '../fiche/liste-recherche';
import type { Fiche, PageFiches } from '../fiche/types';

/** A reader-scoped sheet picker, independent of the filters of the surrounding search. */
export function ChoisirFiche({ universId, suffixeMode, onChoisir }: {
  universId: string;
  suffixeMode: string;
  onChoisir: (fiche: Fiche) => void;
}) {
  const perdue = useConnexionPerdue();
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const trop = saisie.trim().length > LONGUEUR_RECHERCHE;
  useEffect(() => {
    const delai = setTimeout(() => setRecherche(saisie.trim()), 300);
    return () => clearTimeout(delai);
  }, [saisie]);
  const p = new URLSearchParams(suffixeMode);
  if (recherche) p.set('q', recherche);
  const chemin = `/api/univers/${universId}/fiches?${p}`;

  return (
    <div className="choisir-fiche" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOuvert(false);
    }} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); }
    }}>
      <Champ etiquette="Lié à" placeholder={perdue ? 'Hors connexion' : 'Chercher une fiche…'}
        autoComplete="off" disabled={perdue} value={saisie}
        erreur={trop ? `${LONGUEUR_RECHERCHE} caractères au plus.` : undefined}
        onFocus={() => setOuvert(true)}
        onKeyDown={(e: KeyboardEvent) => { if (e.key === 'ArrowDown') setOuvert(true); }}
        onChange={(e: { target: { value: string } }) => { setSaisie(e.target.value); setOuvert(true); }} />
      {ouvert && !perdue && !trop && (
        <div className="choisir-fiche-menu">
          {recherche !== saisie.trim() ? <p role="status">Chargement…</p> :
            <Propositions key={chemin} chemin={chemin} onChoisir={onChoisir} />}
        </div>
      )}
    </div>
  );
}

function Propositions({ chemin, onChoisir }: { chemin: string; onChoisir: (fiche: Fiche) => void }) {
  const { types } = useTypes();
  const [page, recharger] = useCharge<PageFiches>(chemin);
  const [suite, setSuite] = useState<PageFiches | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);
  // A response from an unmounted query must not update the replacement's pagination.
  const actif = useRef(true);
  useEffect(() => { actif.current = true; return () => { actif.current = false; }; }, []);
  if (page.etat === 'chargement') return <p role="status">Chargement…</p>;
  if (page.etat === 'erreur') return <div role="alert"><p>Impossible de charger les fiches.</p><Bouton petit onClick={recharger}>Réessayer</Bouton></div>;
  const fiches = [...page.valeur.fiches, ...(suite?.fiches ?? [])];
  const suivant = suite ? suite.suivant : page.valeur.suivant;
  async function chargerSuite() {
    if (enCours || suivant === null) return;
    setEnCours(true);
    setEchec(false);
    try {
      const p = await lire<PageFiches>(`${chemin}&curseur=${encodeURIComponent(suivant)}`);
      if (actif.current) setSuite((s) => ({ fiches: [...(s?.fiches ?? []), ...p.fiches], suivant: p.suivant }));
    } catch { if (actif.current) setEchec(true); }
    finally { if (actif.current) setEnCours(false); }
  }
  return <>
    {fiches.length === 0 && <p>Aucune fiche.</p>}
    <ul aria-label="Fiches proposées">
      {fiches.map((f) => {
        const Icone = iconeDuType(types, f.type);
        return <li key={f.id}><button type="button" onClick={() => onChoisir(f)} title={f.titre}>
          <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{f.titre}</span><small>{badgeFiche(types, f)}</small>
        </button></li>;
      })}
    </ul>
    {echec && <p role="alert">Impossible de charger les fiches.</p>}
    {suivant !== null && <Bouton petit enCours={enCours} onClick={chargerSuite}>{echec ? 'Réessayer' : 'Charger la suite'}</Bouton>}
  </>;
}
