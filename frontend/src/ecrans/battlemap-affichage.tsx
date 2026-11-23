import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';

import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';

const Affichage = lazy(() => import('../outils/battlemap/table/affichage').then((m) => ({ default: m.Affichage })));

/**
 * E-30 (`…/outils/battlemap/cartes/:cid/affichage`, AD-160): the table display, outside the frame. It is a member's screen under the
 * session guard; every read it makes asks for the player view, so a GM who opens it sees what a player sees.
 */
function AffichageEcran() {
  const { id, cid } = useParams();
  // The address may name the universe by its key: the display takes the id the answer carries, and waits for it.
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  if (univers.etat === 'chargement') return <div className="affichage" />;
  return (
    <Suspense fallback={<div className="affichage" />}>
      <Affichage key={`${id}/${cid}`} universId={univers.etat === 'ok' ? univers.valeur.id : Number(id)} cid={String(cid)} />
    </Suspense>
  );
}

export default { chemin: '/univers/:id/outils/battlemap/cartes/:cid/affichage', composant: AffichageEcran, sansCadre: true } satisfies Ecran;
