import { useState } from 'react';
import { Link } from 'react-router-dom';

import { badgeFiche } from './types-fiche';
import { iconeDuType } from './types-fiche';
import type { Fiche } from './types';

/** Address of the illustration of a sheet; the token makes a replaced image reload and a kept one cache. */
export const adresseIllustration = (universId: number | string, ficheId: number, jeton: string) =>
  `/api/univers/${universId}/fiches/${ficheId}/illustration?v=${encodeURIComponent(jeton)}`;

/** The first letter of a title, article set aside (« Le Gué-aux-Saules » → « G »). */
export function initiale(titre: string): string {
  const sans = titre.trim().replace(/^(le |la |les |l['’])/i, '');
  return ([...(sans || titre.trim())][0] ?? '?').toUpperCase();
}

/** Fallback thumbnail: dotted flat, the initial, the type icon. Never an empty frame. */
function Repli({ fiche }: { fiche: Fiche }) {
  const Icone = iconeDuType(fiche.type);
  return (
    <span className="repli">
      <span className="puce-type" aria-hidden="true">
        <Icone size={14} strokeWidth={1.75} />
      </span>
      <span className="initiale" aria-hidden="true">
        {initiale(fiche.titre)}
      </span>
    </span>
  );
}

/** A card of the grid of E-8: a link to the sheet, thumbnail (or fallback), title, PJ / PNJ for a character. */
export function CarteFiche({ universId, fiche }: { universId: number | string; fiche: Fiche }) {
  const jeton = fiche.illustration?.jeton;
  const [ko, setKo] = useState<string>();
  const image = jeton !== undefined && ko !== jeton;
  return (
    <Link className="carte" to={`/univers/${universId}/fiche/${fiche.id}`}>
      <span className="vue">
        {image ? (
          <img
            src={adresseIllustration(universId, fiche.id, jeton)}
            alt=""
            width={600}
            height={450}
            loading="lazy"
            decoding="async"
            onError={() => setKo(jeton)}
          />
        ) : (
          <Repli fiche={fiche} />
        )}
      </span>
      <span className="pied-carte">
        <span className="titre" title={fiche.titre}>
          {fiche.titre}
        </span>
        {fiche.type === 'personnage' && (
          <span className={`badge-type${fiche.charge.pj ? ' pj' : ''}`}>{badgeFiche(fiche)}</span>
        )}
      </span>
    </Link>
  );
}

/** Loading of the grid: ten skeleton cards (two rows on desktop) and the sentence. */
export function ChargementGrille({ texte }: { texte: string }) {
  return (
    <div role="status" className="chargement-liste">
      <ul className="grille-fiches squelettes" aria-hidden="true">
        {[70, 52, 64, 46, 58, 40, 66, 50, 60, 44].map((l, i) => (
          <li key={i}>
            <span className="squelette cadre" />
            <span className="squelette trait" style={{ width: `${l}%` }} />
          </li>
        ))}
      </ul>
      <p className="squelette-texte">{texte}</p>
    </div>
  );
}
