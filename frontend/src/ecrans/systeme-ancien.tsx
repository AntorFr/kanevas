import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { ErreurApi, lire } from '../api';
import { Chargement, ErreurChargement, PageIntrouvable } from '../ui';
import type { Ecran } from '../registre';

/**
 * The old address of a system, `/univers/:id/systeme`: it leads to `/systemes/:sid` when the universe
 * is attached and the account is a member; otherwise « Page introuvable. » (docs/ecrans.md).
 */
function SystemeAncien() {
  const { id } = useParams();
  const [etat, setEtat] = useState<{ k: 'attente' } | { k: 'vers'; sid: number } | { k: 'introuvable' } | { k: 'erreur' }>({ k: 'attente' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ k: 'attente' });
    lire<{ systeme: { id: number } | null }>(`/api/univers/${id}`).then(
      (u) => actif && setEtat(u.systeme ? { k: 'vers', sid: u.systeme.id } : { k: 'introuvable' }),
      (e: unknown) => actif && setEtat(e instanceof ErreurApi && e.statut === 404 ? { k: 'introuvable' } : { k: 'erreur' }),
    );
    return () => {
      actif = false;
    };
  }, [id, essai]);
  if (etat.k === 'vers') return <Navigate to={`/systemes/${etat.sid}`} replace />;
  if (etat.k === 'introuvable') return <PageIntrouvable retour="systemes" />;
  if (etat.k === 'erreur') return <ErreurChargement texte="Impossible de charger ce système." onReessayer={() => setEssai((n) => n + 1)} />;
  return <Chargement texte="Chargement du système…" />;
}

export default { chemin: '/univers/:id/systeme', composant: SystemeAncien } satisfies Ecran;
