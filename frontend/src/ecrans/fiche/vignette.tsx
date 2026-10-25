import { Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useVue } from '../../cadre-contexte';
import { Pastille } from '../../ui';
import { badgeFiche, iconeDuType, useTypes } from '../../types-contexte';
import type { Fiche } from './types';

/** Address of the illustration of a sheet; the token makes a replaced image reload and a kept one cache. */
export const adresseIllustration = (universId: number | string, fichierId: number, jeton: string) =>
  `/api/univers/${universId}/fichiers/${fichierId}?v=${encodeURIComponent(jeton)}`;

/** The first letter of a title, article set aside (« Le Gué-aux-Saules » → « G »). */
export function initiale(titre: string): string {
  const sans = titre.trim().replace(/^(le |la |les |l['’])/i, '');
  return ([...(sans || titre.trim())][0] ?? '?').toUpperCase();
}

export const PHRASE_MJ_SEUL = "Aucune section n'est visible des joueurs.";

/**
 * The « MJ seul » badge of a whole sheet (B-57) and the sentence it writes on focus or touch.
 * Nothing unless the server said `visibleJoueurs: false` (it says nothing to a player or in player mode).
 * `badge` goes where the badge stands, `aide` under the title or the line.
 */
export function useMJSeul(fiche: Pick<Fiche, 'visibleJoueurs'>): { badge: ReactNode; aide: ReactNode } {
  const [lue, setLue] = useState(false);
  const { mode } = useVue();
  if (mode === 'joueur' || fiche.visibleJoueurs !== false) return { badge: null, aide: null };
  return {
    badge: (
      <span
        className="mj-seul"
        role="img"
        tabIndex={0}
        title={PHRASE_MJ_SEUL}
        aria-label={PHRASE_MJ_SEUL}
        onFocus={() => setLue(true)}
        onBlur={() => setLue(false)}
        onClick={(e) => {
          e.preventDefault();
          setLue(true);
        }}
      >
        <Pastille sens="secrete" icone={Lock}>
          MJ seul
        </Pastille>
      </span>
    ),
    aide: lue ? (
      <span className="aide-mj-seul" role="status">
        {PHRASE_MJ_SEUL}
      </span>
    ) : null,
  };
}

/** Fallback thumbnail: dotted flat, the initial, the type icon. Never an empty frame. */
function Repli({ fiche }: { fiche: Fiche }) {
  const { types } = useTypes();
  const Icone = iconeDuType(types, fiche.type);
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
  const { types } = useTypes();
  const ill = fiche.illustration && 'jeton' in fiche.illustration ? fiche.illustration : null;
  const jeton = ill?.jeton;
  const [ko, setKo] = useState<string>();
  const mjSeul = useMJSeul(fiche);
  const image = jeton !== undefined && ko !== jeton;
  return (
    <Link className="carte" to={`/univers/${universId}/fiche/${fiche.id}`}>
      <span className="vue">
        {image ? (
          <img
            src={adresseIllustration(universId, ill!.id, jeton)}
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
          <span className={`badge-type${fiche.charge.pj ? ' pj' : ''}`}>{badgeFiche(types, fiche)}</span>
        )}
      </span>
      {mjSeul.badge && <span className="pastille-carte">{mjSeul.badge}</span>}
      {mjSeul.aide}
      {fiche.sousType && (
        <span className="sous-type" title={fiche.sousType}>
          {fiche.sousType}
        </span>
      )}
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
