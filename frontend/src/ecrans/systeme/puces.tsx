import { Link } from 'react-router-dom';

import type { SystemeCompte } from '../../types';
import { PastilleRole, Sceau } from '../../ui';

const COUPE = 24;
const coupe = (nom: string) => {
  const lettres = Array.from(nom);
  return lettres.length > COUPE ? `${lettres.slice(0, COUPE).join('')}…` : nom;
};

/**
 * The universes of the account that use a system, as chips (seal, name cut at 24 characters,
 * role). On a card (`lien` false) a chip is not a link of its own — the whole card is one; on E-15
 * each leads to the universe's overview (E-3).
 */
export function PucesUnivers({ univers, lien }: { univers: SystemeCompte['mesUnivers']; lien?: boolean }) {
  return (
    <span className="puces">
      {univers.map((u) => {
        const contenu = (
          <>
            <Sceau nom={u.nom} taille="petit" />
            <span className="nom-puce" aria-hidden="true">
              {coupe(u.nom)}
            </span>
            <PastilleRole role={u.role} />
          </>
        );
        const etiquette = `${u.nom} — ${u.role === 'mj' ? 'MJ' : 'Joueur'}`;
        return lien ? (
          <Link key={u.id} className="puce-u" to={`/univers/${u.id}`} title={u.nom} aria-label={etiquette}>
            {contenu}
          </Link>
        ) : (
          <span key={u.id} className="puce-u" title={etiquette}>
            {contenu}
          </span>
        );
      })}
    </span>
  );
}

export const utilisePar = (n: number) => `Utilisé par ${n.toLocaleString('fr-FR')} univers`;
