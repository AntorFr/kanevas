import { useRef } from 'react';

import { COULEURS } from './ecriture';
import { IconeElement, libelleCouleur, libelleIcone } from './MarqueElement';

/** One radiogroup of 28 px swatches: a single tab stop (the checked one), arrows move and select. */
function Groupe({ legende, valeurs, valeur, onChange, rendu }: {
  legende: string; valeurs: readonly string[]; valeur: string; onChange: (v: string) => void; rendu: (v: string) => React.ReactNode;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const courant = Math.max(0, valeurs.indexOf(valeur));
  function touche(e: React.KeyboardEvent) {
    const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = valeurs[(courant + pas + valeurs.length) % valeurs.length]!;
    onChange(suivant);
    requestAnimationFrame(() => racine.current?.querySelector<HTMLElement>(`[data-valeur="${suivant}"]`)?.focus());
  }
  return (
    <div className="sel-groupe">
      <span className="sel-legende" id={`sel-${legende}`}>{legende}</span>
      <div ref={racine} role="radiogroup" aria-labelledby={`sel-${legende}`} className="sel-pastilles" onKeyDown={touche}>
        {valeurs.map((v) => (
          <button key={v} type="button" role="radio" className="sel-pastille" data-valeur={v} aria-checked={v === valeur} tabIndex={v === (valeurs.includes(valeur) ? valeur : valeurs[0]) ? 0 : -1}
            aria-label={legende === 'Icône' ? libelleIcone(v) : libelleCouleur(v)} title={legende === 'Icône' ? libelleIcone(v) : libelleCouleur(v)}
            onClick={() => onChange(v)}>
            {rendu(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The icon and colour picker of an element (E-23): two radiogroups of 28 px swatches, each swatch carrying a readable
 * name (« Vaisseau », « Ambre »), so the choice never rests on colour alone. The lists are the server's.
 */
export function SelecteurAspect({ icones, couleurs, icone, couleur, onIcone, onCouleur }: {
  icones: readonly string[]; couleurs: readonly string[]; icone: string; couleur: string; onIcone: (v: string) => void; onCouleur: (v: string) => void;
}) {
  const liste = couleurs.length > 0 ? couleurs : COULEURS.map((c) => c.nom);
  return (
    <div className="sel-aspect">
      <Groupe legende="Icône" valeurs={icones} valeur={icone} onChange={onIcone} rendu={(v) => <IconeElement icone={v} taille={16} />} />
      <Groupe legende="Couleur" valeurs={liste} valeur={couleur} onChange={onCouleur}
        rendu={(v) => <span className="sel-couleur" data-couleur={v} aria-hidden="true" />} />
    </div>
  );
}
