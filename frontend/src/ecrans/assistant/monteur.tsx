import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { universDe, useChemin } from './adresse';
import { choisirUnivers } from './fil';
import { Panneau, useDisponibilite } from './panneau';
import './assistant.css';

const TELEPHONE = '(max-width: 759px)';

/**
 * The floating button and its panel, on every screen of a universe the account has a role in.
 * No role (the instance admin, Teo before being added): 404 on the availability route, no button.
 */
export function Assistant() {
  const chemin = useChemin();
  const universId = universDe(chemin);
  const [dispo, relire] = useDisponibilite(universId);
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    choisirUnivers(universId);
    setOuvert(false);
  }, [universId]);

  const present = universId !== null && dispo.k !== 'absent';
  useEffect(() => {
    document.body.classList.toggle('asst-present', present);
    document.body.classList.toggle('asst-ouvert', present && ouvert);
    return () => document.body.classList.remove('asst-present', 'asst-ouvert');
  }, [present, ouvert]);

  const fermer = () => {
    setOuvert(false);
    bouton.current?.focus();
  };

  useEffect(() => {
    if (!ouvert) return;
    champ.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [ouvert]);

  if (!present || universId === null) return null;
  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="asst-bouton"
        aria-expanded={ouvert}
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
      >
        <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" /> Demander à Kanevas
      </button>
      {ouvert && (
        <Panneau
          universId={universId}
          dispo={dispo}
          relireDispo={relire}
          fermer={fermer}
          surOuverture={() => window.matchMedia(TELEPHONE).matches && setOuvert(false)}
          champ={champ}
        />
      )}
    </>
  );
}
