import { useId, useRef } from 'react';

/** Id of the panel a tab controls; the caller puts it on its `role="tabpanel"` (`aria-labelledby` is `idOnglet`). */
export const idPanneau = (prefixe: string, id: string) => `${prefixe}-panneau-${id}`;
export const idOnglet = (prefixe: string, id: string) => `${prefixe}-onglet-${id}`;

/**
 * Tabs (charte, « Onglets »): `role="tablist"`, one `role="tab"` per tab with `aria-selected`, a single
 * tab stop (the active tab), ← → move and select, Home / End jump. The caller owns the active id (it rides in
 * the address query `?onglet=`). Colours only through tokens (`.onglets-liste` in ui.css).
 */
export function Onglets<T extends string>({
  etiquette,
  onglets,
  actif,
  onChange,
  prefixe,
}: {
  etiquette: string;
  onglets: readonly { id: T; libelle: string }[];
  actif: T;
  onChange: (id: T) => void;
  /** Base of the tab and panel ids (see `idOnglet`, `idPanneau`); generated when absent. */
  prefixe?: string;
}) {
  const genere = useId();
  const base = prefixe ?? genere;
  const racine = useRef<HTMLDivElement>(null);
  const courant = Math.max(0, onglets.findIndex((o) => o.id === actif));

  function touche(ev: React.KeyboardEvent) {
    let suivant = -1;
    if (ev.key === 'ArrowRight') suivant = (courant + 1) % onglets.length;
    else if (ev.key === 'ArrowLeft') suivant = (courant - 1 + onglets.length) % onglets.length;
    else if (ev.key === 'Home') suivant = 0;
    else if (ev.key === 'End') suivant = onglets.length - 1;
    if (suivant < 0) return;
    ev.preventDefault();
    onChange(onglets[suivant]!.id);
    racine.current?.querySelectorAll<HTMLElement>('[role="tab"]')[suivant]?.focus();
  }

  return (
    <div ref={racine} className="onglets-liste" role="tablist" aria-label={etiquette} onKeyDown={touche}>
      {onglets.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          id={idOnglet(base, o.id)}
          aria-selected={i === courant}
          aria-controls={idPanneau(base, o.id)}
          tabIndex={i === courant ? 0 : -1}
          onClick={() => onChange(o.id)}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}
