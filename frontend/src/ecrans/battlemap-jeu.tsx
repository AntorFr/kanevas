import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';

import { useBasculeMode, useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Chargement } from '../ui';

const Jeu = lazy(() => import('../outils/battlemap/table/jeu').then((m) => ({ default: m.Jeu })));

/**
 * E-29 (`…/outils/battlemap/cartes/:cid/jeu`): play a composed map. The guard is the server's: an unknown, hidden or unreadable map,
 * a non-member and a disabled tool all answer 404 on the table read, which the screen shows as « Page introuvable. ».
 */
function JeuEcran() {
  const { id, cid } = useParams();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const mj = univers.etat === 'ok' && univers.valeur.role === 'mj';
  const mode = useBasculeMode(mj);
  if (univers.etat === 'chargement') return <Chargement texte="Chargement de la partie…" />;
  const suffixe = mj && mode === 'joueur' ? '?mode=joueur' : '';
  return (
    <Suspense fallback={<Chargement texte="Chargement de la partie…" />}>
      <Jeu key={`${id}/${cid}${suffixe}`} universId={Number(id)} cid={String(cid)} suffixe={suffixe} />
    </Suspense>
  );
}

export default { chemin: '/univers/:id/outils/battlemap/cartes/:cid/jeu', composant: JeuEcran } satisfies Ecran;
