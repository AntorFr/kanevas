import { useEffect, useId, useRef, useState } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { useToasts } from '../../ui';
import type { FicheVue } from './types';

/** E-9: the title stays a heading; only a GM outside player mode can edit it. */
export function TitreFiche({ universId, fiche, gestion, rafraichir, onDroitPerdu, onIntrouvable }: {
  universId: string;
  fiche: FicheVue;
  gestion: boolean;
  rafraichir: () => Promise<void>;
  onDroitPerdu: () => void;
  onIntrouvable: () => void;
}) {
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);
  const annule = useRef(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const idErreur = useId();

  useEffect(() => {
    if (edition && gestion) {
      champ.current?.focus();
      champ.current?.select();
    }
  }, [edition, gestion]);

  useEffect(() => {
    const c = champ.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${c.scrollHeight}px`;
  }, [edition, valeur]);

  function fermer(focus: boolean) {
    annule.current = true;
    setEdition(false);
    if (focus) requestAnimationFrame(() => bouton.current?.focus());
  }

  async function enregistrer(focus: boolean) {
    if (verrou.current || annule.current || perdue || !gestion) return;
    const titre = valeur.trim();
    if (!titre) return setErreur('Erreur : le titre est obligatoire.');
    if (titre.length > 120) return setErreur('Erreur : 120 caractères au plus.');
    if (titre === fiche.titre) return fermer(focus);
    verrou.current = true;
    setEnCours(true);
    setErreur(undefined);
    try {
      await appeler('PATCH', `/api/univers/${universId}/fiches/${fiche.id}`, { titre });
      await rafraichir();
      fermer(focus);
      toast('Fiche renommée.');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) onIntrouvable();
      else if (e instanceof ErreurApi && e.statut === 403) {
        fermer(false);
        onDroitPerdu();
      } else setErreur("L'action n'a pas abouti. Réessayez.");
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  return (
    <>
      <h1 id="titre-fiche" tabIndex={-1}>
        {gestion && edition ? (
          <textarea
            className="titre-edition"
            aria-label="Titre de la fiche"
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? idErreur : undefined}
            aria-busy={enCours}
            ref={champ}
            rows={1}
            value={valeur}
            readOnly={enCours}
            onChange={(e) => { setValeur(e.target.value); setErreur(undefined); }}
            onBlur={() => void enregistrer(false)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape' && !verrou.current) {
                e.preventDefault();
                fermer(true);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                void enregistrer(true);
              }
            }}
          />
        ) : gestion ? (
          <button className="titre-modifiable" type="button" ref={bouton} aria-label={`Renommer « ${fiche.titre} »`}
            aria-disabled={perdue || undefined}
            onClick={() => {
              if (perdue) return;
              annule.current = false;
              setValeur(fiche.titre);
              setErreur(undefined);
              setEdition(true);
            }}>
            {fiche.titre}
          </button>
        ) : fiche.titre}
      </h1>
      {gestion && edition && erreur && <p className="erreur-edition" id={idErreur} role="alert">{erreur}</p>}
    </>
  );
}
