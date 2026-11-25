import type { ComponentType } from 'react';

/**
 * One choosable row of a `radiogroup` list of sheets (« Déplacer sous… », « Changer d'aventure… »): the native
 * radio stays (role, keyboard) but is hidden behind the dot, then the icon, the title and a detail. `soi` marks a row
 * that cannot be chosen (`aria-disabled`, the radio disabled): the sheet itself, the current adventure.
 */
export function LigneChoix({
  nom,
  titre,
  Icone,
  detail,
  note,
  soi = false,
  choisi,
  enfants,
  onChoisir,
}: {
  nom: string;
  titre: string;
  Icone: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;
  detail: string;
  /** Text after the title of a row that cannot be chosen, e.g. « (cette fiche) ». */
  note?: string;
  soi?: boolean;
  choisi: boolean;
  /** The id whose children the row opens (tree view), read by the keyboard handler. */
  enfants?: number;
  onChoisir: () => void;
}) {
  return (
    <label className={`resultat${soi ? ' soi' : ''}`} aria-disabled={soi || undefined} title={titre}>
      <input type="radio" name={nom} disabled={soi} checked={!soi && choisi} data-enfants={enfants} onChange={onChoisir} />
      <span className="puce resultat-puce" aria-hidden="true" />
      <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="titre-res">{titre}</span>
      {soi && ' '}
      {soi && note && <span className="note-soi">{note}</span>}
      <span className="type-option">{detail}</span>
    </label>
  );
}
