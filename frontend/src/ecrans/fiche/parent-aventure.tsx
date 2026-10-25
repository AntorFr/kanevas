import { useEffect, useRef, useState } from 'react';

import { lire, useConnexionPerdue } from '../../api';
import { Bouton, Champ } from '../../ui';
import type { Fiche, PageFiches } from './types';
import './parent-aventure.css';

type Parent = Pick<Fiche, 'id' | 'titre'>;
type Resultats = { etat: 'chargement' | 'erreur' } | { etat: 'ok'; fiches: Fiche[]; suivant: string | null; visibles: number };
const TAILLE = 20;

/** The optional parent at creation: search readable adventures, showing twenty at a time.
 * The server pages by one hundred; the client reveals twenty before requesting the next page.
 */
export function ParentAventure({ universId, valeur, onChange }: {
  universId: string;
  valeur: Parent | null;
  onChange: (parent: Parent | null) => void;
}) {
  const perdue = useConnexionPerdue();
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<Resultats>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [echecSuite, setEchecSuite] = useState(false);
  const generation = useRef(0);
  const mot = saisie.trim();
  const trop = mot.length > 100;
  const chemin = `/api/univers/${universId}/fiches?type=aventure${mot ? `&q=${encodeURIComponent(mot)}` : ''}`;

  useEffect(() => {
    const g = ++generation.current;
    setResultats({ etat: 'chargement' });
    setEnCours(false);
    setEchecSuite(false);
    if (trop) return;
    const minuteur = setTimeout(() => {
      lire<PageFiches>(chemin).then(
        (p) => g === generation.current && setResultats({ etat: 'ok', ...p, visibles: TAILLE }),
        () => g === generation.current && setResultats({ etat: 'erreur' }),
      );
    }, mot ? 300 : 0);
    return () => { clearTimeout(minuteur); generation.current++; };
  }, [chemin, trop, essai, mot]);

  async function suite() {
    if (resultats.etat !== 'ok' || enCours || perdue) return;
    if (resultats.visibles < resultats.fiches.length) {
      setResultats({ ...resultats, visibles: resultats.visibles + TAILLE });
      return;
    }
    if (resultats.suivant === null) return;
    const g = generation.current;
    setEnCours(true);
    setEchecSuite(false);
    try {
      const p = await lire<PageFiches>(`${chemin}&curseur=${encodeURIComponent(resultats.suivant)}`);
      if (g === generation.current) setResultats((r) => r.etat === 'ok'
        ? { etat: 'ok', fiches: [...r.fiches, ...p.fiches], suivant: p.suivant, visibles: r.visibles + TAILLE } : r);
    } catch {
      if (g === generation.current) setEchecSuite(true);
    } finally {
      if (g === generation.current) setEnCours(false);
    }
  }

  const vide = resultats.etat === 'ok' && resultats.fiches.length === 0;
  const visibles = !trop && resultats.etat === 'ok' ? resultats.fiches.slice(0, resultats.visibles) : [];
  return (
    <div className="parent-aventure">
      <Champ etiquette="Dans" facultatif value={saisie} autoComplete="off"
        placeholder={vide && !mot ? 'Aucune aventure' : 'Chercher une aventure…'}
        erreur={trop ? '100 caractères au plus.' : undefined}
        disabled={perdue}
        onChange={(e: { target: { value: string } }) => setSaisie(e.target.value)} />
      <div className="choix-parent" role="radiogroup" aria-label="Aventure parente">
        <label>
          <input type="radio" name="parent-aventure" checked={valeur === null} onChange={() => onChange(null)} />
          Aucun parent
        </label>
        {valeur && !visibles.some((f) => f.id === valeur.id) && <label title={valeur.titre}>
          <input type="radio" name="parent-aventure" checked onChange={() => {}} />
          <span>{valeur.titre}</span>
        </label>}
        {!trop && resultats.etat === 'chargement' && <p role="status">Chargement des aventures…</p>}
        {!trop && resultats.etat === 'erreur' && <p role="alert">Impossible de charger les aventures. <Bouton petit onClick={() => setEssai((n) => n + 1)}>Réessayer</Bouton></p>}
        {!trop && vide && <p>{mot ? 'Aucune aventure ne correspond.' : 'Aucune aventure'}</p>}
        {visibles.map((f) => (
          <label key={f.id} title={f.titre}>
            <input type="radio" name="parent-aventure" checked={f.id === valeur?.id} onChange={() => onChange({ id: f.id, titre: f.titre })} />
            <span>{f.titre}</span>
          </label>
        ))}
        {echecSuite && <p role="alert">Impossible de charger la suite.</p>}
        {!trop && resultats.etat === 'ok' && (resultats.visibles < resultats.fiches.length || resultats.suivant !== null) && (
          <Bouton petit disabled={perdue} enCours={enCours} onClick={() => void suite()}>Charger la suite</Bouton>
        )}
      </div>
    </div>
  );
}
