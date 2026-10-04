import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { useConnexionPerdue } from '../api';
import type { Role } from '../types';

/**
 * Button (charte, « Bouton »). `enCours` shows « … » and blocks a second trigger; `ecrit` marks a
 * button that writes, disabled while the connection is lost. Disabled = opacity + aria-disabled.
 */
export function Bouton({
  variante = 'neutre',
  petit,
  enCours,
  ecrit,
  disabled,
  onClick,
  children,
  ...reste
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'neutre' | 'principal' | 'danger';
  petit?: boolean;
  enCours?: boolean;
  ecrit?: boolean;
}) {
  const perdue = useConnexionPerdue();
  const inactif = Boolean(disabled) || Boolean(enCours) || Boolean(ecrit && perdue);
  return (
    <button
      type="button"
      {...reste}
      className={`bouton ${variante}${petit ? ' petit' : ''}`}
      aria-disabled={inactif || undefined}
      onClick={(e) => {
        if (inactif) return e.preventDefault();
        onClick?.(e);
      }}
    >
      {enCours ? '…' : children}
    </button>
  );
}

/** Field with a visible label; the error sits under it, prefixed « Erreur : », via aria-describedby. */
export function Champ({
  etiquette,
  erreur,
  zone,
  ...reste
}: { etiquette: string; erreur?: string; zone?: boolean } & Record<string, unknown>) {
  const id = useId();
  const idErreur = `${id}-e`;
  const props = {
    ...reste,
    id,
    'aria-invalid': erreur ? true : undefined,
    'aria-describedby': erreur ? idErreur : undefined,
  };
  return (
    <label className="champ" htmlFor={id}>
      <span>{etiquette}</span>
      {zone ? <textarea {...props} /> : <input {...props} />}
      {erreur && (
        <div className="erreur" id={idErreur}>
          Erreur : {erreur}
        </div>
      )}
    </label>
  );
}

/** Role / audience badge: a word plus a tint, always the same tint for the same meaning. */
export function Pastille({ sens, children }: { sens: 'mj' | 'table'; children: ReactNode }) {
  return <span className={`pastille ${sens}`}>{children}</span>;
}

export function PastilleRole({ role }: { role: Role }) {
  return role === 'mj' ? <Pastille sens="mj">MJ</Pastille> : <Pastille sens="table">Joueur</Pastille>;
}

/** A titled `section`; `reserveMj` adds the amber rule and the words « MJ seul ». */
export function Panneau({ titre, reserveMj, children }: { titre: string; reserveMj?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`panneau${reserveMj ? ' reserve-mj' : ''}`} aria-labelledby={id}>
      <h2 id={id}>
        {titre} {reserveMj && <Pastille sens="mj">MJ seul</Pastille>}
      </h2>
      {children}
    </section>
  );
}

/** Full-width status banner, not dismissible. */
export function Bandeau({ sorte, children }: { sorte: 'bouchon' | 'perdue'; children: ReactNode }) {
  return (
    <div className={`bandeau ${sorte}`} role="status">
      {children}
    </div>
  );
}

/** Two radio buttons: mode MJ / mode Joueur, the change announced. */
export function BasculeMjJoueur({ mode, onChange }: { mode: 'mj' | 'joueur'; onChange: (m: 'mj' | 'joueur') => void }) {
  const nom = useId();
  return (
    <div>
      <div role="radiogroup" aria-label="Mode d’affichage" className={`bascule ${mode}`}>
        {(['mj', 'joueur'] as const).map((m) => (
          <label key={m}>
            <input type="radio" name={nom} checked={mode === m} onChange={() => onChange(m)} />
            {m === 'mj' ? 'Mode MJ' : 'Mode Joueur'}
          </label>
        ))}
      </div>
      <span role="status" className="sr-seul" style={{ position: 'absolute', left: -9999 }}>
        {mode === 'joueur' ? 'Mode Joueur : vous voyez ce que voit un joueur' : ''}
      </span>
    </div>
  );
}

/** Modal dialog: focus enters and stays, Escape closes, focus returns to the opener. */
export function Fenetre({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const ouvrant = document.activeElement as HTMLElement | null;
    const focalisables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button,input,textarea,select,[tabindex]') ?? []).filter(
        (e) => e.getAttribute('aria-disabled') !== 'true' && !(e as HTMLButtonElement).disabled,
      );
    (focalisables()[0] ?? ref.current)?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onFermer();
      if (e.key !== 'Tab') return;
      const f = focalisables();
      if (f.length === 0) return e.preventDefault();
      const premier = f[0]!;
      const dernier = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === premier) {
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
      ouvrant?.focus();
    };
  }, [onFermer]);
  return (
    <div className="voile">
      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <h2 id={id}>{titre}</h2>
        {children}
      </div>
    </div>
  );
}
