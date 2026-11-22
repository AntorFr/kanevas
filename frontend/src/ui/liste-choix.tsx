import { useRef, type ReactNode } from 'react';

import { Pastille } from './composants';

export type OptionChoix = {
  id: string;
  libelle: string;
  /** The 48 px thumbnail (an image, a canvas, an icon); decorative. */
  vignette: ReactNode;
  /** The badge on the right (a `Pastille`), e.g. « modifié ». */
  pastille?: { sens: 'mj' | 'table' | 'neutre' | 'secrete' | 'danger'; texte: string };
};
export type GroupeChoix = { titre?: string; options: readonly OptionChoix[] };

/**
 * Choice list with thumbnails (charte, « Liste de choix à vignettes »): `role="listbox"`, one `role="option"`
 * per row with `aria-selected`, a single tab stop (the selected row, else the first), ↑ ↓ Home End move the
 * focus, Enter or a click chooses (`onChoisir`, which opens the editor). It scrolls inside itself.
 */
export function ListeChoix({
  etiquette,
  groupes,
  selection,
  onChoisir,
}: {
  etiquette: string;
  groupes: readonly GroupeChoix[];
  selection: string | null;
  onChoisir: (id: string) => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const ids = groupes.flatMap((g) => g.options.map((o) => o.id));
  const arret = selection !== null && ids.includes(selection) ? selection : ids[0];

  function touche(ev: React.KeyboardEvent) {
    const lignes = Array.from(racine.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const i = lignes.indexOf(document.activeElement as HTMLElement);
    let suivant = -1;
    if (ev.key === 'ArrowDown') suivant = Math.min(lignes.length - 1, i + 1);
    else if (ev.key === 'ArrowUp') suivant = Math.max(0, i - 1);
    else if (ev.key === 'Home') suivant = 0;
    else if (ev.key === 'End') suivant = lignes.length - 1;
    if (suivant < 0 || lignes.length === 0) return;
    ev.preventDefault();
    lignes[suivant]?.focus();
  }

  return (
    <div ref={racine} className="liste-choix" role="listbox" aria-label={etiquette} onKeyDown={touche}>
      {groupes.map((g, gi) => {
        const lignes = g.options.map((o) => (
          <div
            key={o.id}
            role="option"
            aria-selected={o.id === selection}
            tabIndex={o.id === arret ? 0 : -1}
            className="choix"
            onClick={() => onChoisir(o.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onChoisir(o.id);
              }
            }}
          >
            <span className="vignette-choix" aria-hidden="true">{o.vignette}</span>
            <span className="libelle-choix">{o.libelle}</span>
            {o.pastille && <Pastille sens={o.pastille.sens}>{o.pastille.texte}</Pastille>}
          </div>
        ));
        if (!g.titre) return <div key={gi} role="presentation">{lignes}</div>;
        const idTitre = `${etiquette.replace(/\W+/g, '-')}-g${gi}`;
        return (
          <div key={gi} role="group" aria-labelledby={idTitre}>
            <div className="titre-choix" id={idTitre}>{g.titre}</div>
            {lignes}
          </div>
        );
      })}
    </div>
  );
}
