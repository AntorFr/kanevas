import { useState } from 'react';
import { Link } from 'react-router-dom';

import { MarqueDisparu, classeDisparu } from '../ecrans/fiche/marque';
import type { Fiche } from '../ecrans/fiche/types';
import { adresseIllustration, useMJSeul } from '../ecrans/fiche/vignette';
import { badgeFiche, iconeDuType, marqueDe, useTypes } from '../types-contexte';

/** Thumbnail of a sheet row: its illustration, else the type icon; the « disparu » mark of the shared component. */
export function VignetteFiche({ universId, fiche, taille = 36, className = '' }: {
  universId: string | number;
  fiche: Fiche;
  taille?: 36 | 40;
  className?: string;
}) {
  const { types } = useTypes();
  const Icone = iconeDuType(types, fiche.type);
  const [ko, setKo] = useState(false);
  const marque = marqueDe(types, fiche);
  const ill = fiche.illustration && 'jeton' in fiche.illustration ? fiche.illustration : null;
  return (
    <span
      className={`vignette-fiche t${taille}${classeDisparu(marque)}${className ? ` ${className}` : ''}`}
      aria-hidden={marque ? undefined : 'true'}
    >
      {ill && !ko ? (
        <img src={adresseIllustration(universId, ill.id, ill.jeton)} alt="" width={taille} height={taille} loading="lazy" onError={() => setKo(true)} />
      ) : (
        <Icone size={16} strokeWidth={1.75} />
      )}
      {marque && <MarqueDisparu mot={marque.mot} Icone={marque.Icone} />}
    </span>
  );
}

/**
 * One related sheet (charte §4): thumbnail, title as a link, type badge for a character, sub-type, « MJ seul »,
 * the relation's qualifier and, under a place, the sub-place it was read through (« — Les Docks »), both grey.
 */
export function LigneFicheLiee({ universId, fiche, qualificatif, via }: {
  universId: string;
  fiche: Fiche;
  qualificatif?: string;
  /** Title of the sub-place the sheet sits in, when the place's own sub-places are read too. */
  via?: string;
}) {
  const { types } = useTypes();
  const mjSeul = useMJSeul(fiche);
  return (
    <li className="ligne-liee">
      <VignetteFiche universId={universId} fiche={fiche} />
      <Link className="jeton cible titre-liee" to={`/univers/${universId}/fiche/${fiche.id}`} title={fiche.titre}>
        {fiche.titre}
      </Link>
      {fiche.type === 'personnage' && (
        <span className={`badge-type${fiche.charge.pj ? ' pj' : ''}`}>{badgeFiche(types, fiche)}</span>
      )}
      {fiche.sousType && <span className="gris-liee">{fiche.sousType}</span>}
      {mjSeul.badge}
      {qualificatif && <span className="gris-liee" title={qualificatif}>{qualificatif}</span>}
      {via && <span className="gris-liee via-liee" title={via}>— {via}</span>}
      {mjSeul.aide}
    </li>
  );
}
