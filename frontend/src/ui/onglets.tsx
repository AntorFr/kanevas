import { useRef } from 'react';

/**
 * Tabs (charte, « Onglets »): a `tablist` of `tab` buttons, one tab stop (the active tab), left/right arrows move and
 * select. The active tab lives in the address (`?onglet=`), set by the caller; the panel is the caller's `tabpanel`.
 * Not `Segments`, which is a value choice.
 */
export function Onglets<T extends string>({
  legende,
  onglets,
  actif,
  onChange,
}: {
  legende: string;
  onglets: readonly { valeur: T; libelle: string }[];
  actif: T;
  onChange: (valeur: T) => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const courant = Math.max(0, onglets.findIndex((o) => o.valeur === actif));

  function touche(ev: React.KeyboardEvent) {
    const pas = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!pas) return;
    ev.preventDefault();
    const suivant = (courant + pas + onglets.length) % onglets.length;
    onChange(onglets[suivant]!.valeur);
    racine.current?.querySelectorAll<HTMLElement>('[role="tab"]')[suivant]?.focus();
  }

  return (
    <div ref={racine} className="onglets outils-onglets" role="tablist" aria-label={legende} onKeyDown={touche}>
      {onglets.map((o, i) => (
        <button
          key={o.valeur}
          type="button"
          role="tab"
          aria-selected={o.valeur === actif}
          tabIndex={i === courant ? 0 : -1}
          className={o.valeur === actif ? 'actif' : undefined}
          onClick={() => onChange(o.valeur)}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}
