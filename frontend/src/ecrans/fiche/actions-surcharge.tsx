import { Layers, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { typeParType, useTypes } from '../../types-contexte';
import { Alerte, BoiteDialogue, Bouton, useToasts } from '../../ui';
import type { FicheVue } from './types';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/** « Personnaliser pour cet univers » (E-9, an element opened from a universe): creates the copy, then shows it. */
export function BoutonPersonnaliser({ universId, fiche }: { universId: string; fiche: FicheVue }) {
  const navigate = useNavigate();
  const { toast } = useToasts();
  const { types } = useTypes();
  const perdue = useConnexionPerdue();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const verrou = useRef(false);

  async function personnaliser() {
    if (verrou.current || perdue) return;
    verrou.current = true;
    setEnCours(true);
    setErreur(undefined);
    try {
      const copie = await appeler<{ id: number }>('POST', `/api/univers/${universId}/fiches/${fiche.id}/personnaliser`);
      navigate(`/univers/${universId}/fiche/${copie.id}`);
      toast('Fiche personnalisée pour cet univers');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) {
        const slug = typeParType(types, fiche.type)?.slug;
        navigate(slug ? `/univers/${universId}/fiches/${slug}` : `/univers/${universId}`);
        toast('Cet élément n’existe plus.');
      } else if (e instanceof ErreurApi && e.statut === 403) setErreur('Vous ne pouvez plus modifier cet univers.');
      else setErreur(ECHEC);
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  return (
    <span className="action-surcharge">
      <Bouton variante="principal" ecrit icone={Layers} enCours={enCours} onClick={() => void personnaliser()}>
        {enCours ? 'Création…' : 'Personnaliser pour cet univers'}
      </Bouton>
      {erreur && <span className="erreur-action" role="alert">{erreur}</span>}
    </span>
  );
}

/** « Revenir à l'élément du système » (E-9, menu of a copy): deletes this copy only, after a confirmation. */
export function FenetreRevenir({ universId, fiche, onFermer, onDroitPerdu }: {
  universId: string;
  fiche: FicheVue;
  onFermer: () => void;
  onDroitPerdu: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const verrou = useRef(false);

  function montrerElement(message: string) {
    navigate(fiche.surchargeDe !== undefined ? `/univers/${universId}/fiche/${fiche.surchargeDe}` : `/univers/${universId}`);
    toast(message);
  }

  async function revenir() {
    if (verrou.current || perdue) return;
    verrou.current = true;
    setEnCours(true);
    setErreur(undefined);
    try {
      await appeler('DELETE', `/api/univers/${universId}/fiches/${fiche.id}/personnalisation`);
      montrerElement('Retour à l’élément du système');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) montrerElement('Cette fiche n’est plus personnalisée.');
      else if (e instanceof ErreurApi && e.statut === 403) {
        onFermer();
        onDroitPerdu();
      } else setErreur(ECHEC);
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  return (
    <BoiteDialogue
      titre="Revenir à l’élément du système ?"
      texte={
        <>
          La version de cet univers, « {fiche.titre} », sera supprimée. L’élément du système la remplace
          <span className="sans-mobile"> ; les liens écrits vers cette version ne mèneront plus nulle part</span>.
        </>
      }
      action="Revenir à l’élément"
      empilee
      libelleEnCours="Retour…"
      icone={TriangleAlert}
      enCours={enCours}
      onConfirmer={() => void revenir()}
      onFermer={() => { if (!verrou.current) onFermer(); }}
      reperage={() => document.getElementById('titre-fiche')}
    >
      {erreur && <Alerte>{erreur}</Alerte>}
    </BoiteDialogue>
  );
}
