import type { MotsDisparu } from '../../types-contexte';
import type { LucideIcon } from 'lucide-react';

/** The class a frame takes when its sheet is gone: the image is desaturated at 60 % (liste.css). */
export const classeDisparu = (marque: unknown) => (marque ? ' disparu' : '');

/**
 * The gone mark (AD-131), placed in the frame of an image: the glyph of the type in a small round chip at
 * the bottom-left. On the drawn fallback (`seul`) the glyph stands alone, without a chip. The word is its name.
 */
export function MarqueDisparu({ mot, Icone, seul }: { mot: string; Icone: LucideIcon; seul?: boolean }) {
  return (
    <span className={seul ? 'marque-disparu seul' : 'marque-disparu'} role="img" aria-label={mot} title={mot}>
      <Icone size={seul ? 40 : 12} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

export type EtatFiche = '' | 'la' | 'disparu';

/** The `?etat=` of an address: anything else than the two keys reads « Tous ». */
export const etatDe = (v: string | null): EtatFiche => (v === 'la' || v === 'disparu' ? v : '');

/** « Vivants / Morts / Tous » (the words of the type): the same control on E-8 and in the volet of E-17. */
export function FiltreEtat({ mots, valeur, onChoix }: { mots: MotsDisparu; valeur: EtatFiche; onChoix: (v: EtatFiche) => void }) {
  const choix: [EtatFiche, string][] = [['la', mots.filtre.la], ['disparu', mots.filtre.disparu], ['', mots.filtre.tous]];
  return (
    <div className="bascule-vue filtre-etat" role="group" aria-label="État">
      {choix.map(([v, libelle]) => (
        <button key={v || 'tous'} type="button" aria-pressed={valeur === v} aria-label={v === '' ? `${libelle}, sans filtre d’état` : undefined} onClick={() => onChoix(v)}>
          {libelle}
        </button>
      ))}
    </div>
  );
}
