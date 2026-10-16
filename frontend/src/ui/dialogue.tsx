import { Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Bouton } from './composants';

/** Elements the focus can cycle through inside a dialog. */
const FOCALISABLES = 'a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])';

/**
 * Confirmation dialog (charte, « Boîte de dialogue »): `role="alertdialog"`, `aria-modal`, titled and
 * described. The focus enters on « Annuler » and stays (Tab loops); Escape or a click on the veil
 * closes; the focus goes back to the opener — or to `reperage` (the sheet's title) when the opener
 * has vanished. The action is a danger button named with its verb and object.
 */
export function BoiteDialogue({
  titre,
  texte,
  action,
  onConfirmer,
  onFermer,
  enCours,
  desactive,
  libelleEnCours,
  reperage,
  icone: Icone = Trash2,
  variante = 'danger',
  children,
}: {
  titre: string;
  texte: ReactNode;
  /** Verb and object of the destructive action: « Retirer la section ». */
  action: string;
  onConfirmer: () => void;
  onFermer: () => void;
  enCours?: boolean;
  /** The action stays unavailable (a confirmation not yet given) without being in flight. */
  desactive?: boolean;
  /** Label of the action while in flight (« Suppression… »); the default is the button's « … ». */
  libelleEnCours?: string;
  /** Where the focus goes if the opener is gone when the dialog closes. */
  reperage?: () => HTMLElement | null;
  /** Glyph of the round badge (the bin by default). */
  icone?: LucideIcon;
  /** `danger` (red bin, danger button) or `mj` (GM amber badge, primary button): a reversible GM closing. */
  variante?: 'danger' | 'mj';
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const annuler = useRef<HTMLButtonElement>(null);
  const idTitre = useId();
  const idTexte = useId();
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  const repere = useRef(reperage);
  repere.current = reperage;

  useEffect(() => {
    const ouvrant = document.activeElement as HTMLElement | null;
    annuler.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        return fermer.current();
      }
      if (e.key !== 'Tab') return;
      const f = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? []).filter(
        (x) => !(x as HTMLButtonElement).disabled,
      );
      if (f.length === 0) return e.preventDefault();
      const premier = f[0]!;
      const dernier = f[f.length - 1]!;
      if (!ref.current?.contains(document.activeElement)) {
        e.preventDefault();
        premier.focus();
      } else if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('keydown', touche);
      // The opener may have disappeared with what the dialog removed.
      queueMicrotask(() => {
        const cible = ouvrant && ouvrant.isConnected ? ouvrant : repere.current?.();
        cible?.focus();
      });
    };
  }, []);

  return (
    <div
      className="voile"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className="boite"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={idTexte}
        ref={ref}
      >
        <span className={`boite-icone${variante === 'mj' ? ' mj' : ''}`} aria-hidden="true">
          <Icone size={16} strokeWidth={1.75} />
        </span>
        <div className="boite-corps">
          <h2 id={idTitre}>{titre}</h2>
          <p id={idTexte}>{texte}</p>
          {children}
          <div className="boite-actions">
            <button type="button" className="bouton neutre" ref={annuler} onClick={onFermer}>
              Annuler
            </button>
            <Bouton
              variante={variante === 'mj' ? 'principal' : 'danger'}
              enCours={libelleEnCours ? undefined : enCours}
              disabled={desactive || (libelleEnCours ? enCours : undefined)}
              ecrit
              onClick={onConfirmer}
            >
              {enCours && libelleEnCours ? libelleEnCours : action}
            </Bouton>
          </div>
        </div>
      </div>
    </div>
  );
}
