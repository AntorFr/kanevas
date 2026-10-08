import { ChevronDown, Eye, Lock, PenLine, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { useConnexionPerdue } from '../api';
import type { Role } from '../types';

/** Disabled state shared by every button: explicit, in flight, or a writing gesture while offline. */
function useInactif(disabled?: boolean, enCours?: boolean, ecrit?: boolean): boolean {
  const perdue = useConnexionPerdue();
  return Boolean(disabled) || Boolean(enCours) || Boolean(ecrit && perdue);
}

type PropsBouton = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual role: neutral by default; `fantome` has no background. */
  variante?: 'neutre' | 'principal' | 'danger' | 'fantome';
  petit?: boolean;
  /** Request in flight: label becomes « … », a second trigger is ignored. */
  enCours?: boolean;
  /** The button writes: disabled while the connection is lost. */
  ecrit?: boolean;
  /** Lucide icon, 14 px, left of the label. */
  icone?: LucideIcon;
};

/**
 * Button (charte, « Bouton »). Disabled = opacity + `aria-disabled` (still focusable, never fires).
 */
export function Bouton({ variante = 'neutre', petit, enCours, ecrit, disabled, onClick, icone: Icone, children, ...reste }: PropsBouton) {
  const inactif = useInactif(disabled, enCours, ecrit);
  return (
    <button
      type="button"
      {...reste}
      className={`bouton ${variante}${petit ? ' petit' : ''}${reste.className ? ` ${reste.className}` : ''}`}
      aria-disabled={inactif || undefined}
      onClick={(e) => {
        if (inactif) return e.preventDefault();
        onClick?.(e);
      }}
    >
      {Icone && <Icone size={14} strokeWidth={1.75} aria-hidden="true" style={enCours ? { visibility: 'hidden' } : undefined} />}
      {enCours ? <span className="bouton-contenu-masque">{children}</span> : children}
      {enCours && <span className="bouton-attente">…</span>}
    </button>
  );
}

/**
 * Icon-only button (28 px). `etiquette` is the accessible name and names the object
 * (« Retirer la relation membre de → Lames Grises »); `infobulle` is the short tooltip (« Retirer »).
 */
export function BoutonIcone({
  etiquette,
  infobulle,
  icone: Icone,
  danger,
  ecrit,
  disabled,
  onClick,
  ...reste
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  etiquette: string;
  infobulle?: string;
  icone: LucideIcon;
  danger?: boolean;
  ecrit?: boolean;
}) {
  const inactif = useInactif(disabled, false, ecrit);
  return (
    <button
      type="button"
      title={infobulle ?? etiquette}
      {...reste}
      aria-label={etiquette}
      className={`bouton-icone${danger ? ' danger' : ''}`}
      aria-disabled={inactif || undefined}
      onClick={(e) => {
        if (inactif) return e.preventDefault();
        onClick?.(e);
      }}
    >
      <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/**
 * Field with a visible label (34 px); the error sits under it, prefixed « Erreur : », via
 * aria-describedby. `zone` is a textarea, `liste` a dressed native select (`children` = options).
 */
export function Champ({
  etiquette,
  erreur,
  zone,
  liste,
  children,
  ...reste
}: { etiquette: string; erreur?: string; zone?: boolean; liste?: boolean; children?: ReactNode } & Record<string, unknown>) {
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
      {zone ? (
        <textarea {...props} />
      ) : liste ? (
        <span className="champ-liste">
          <select {...props}>{children}</select>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
      ) : (
        <input {...props} />
      )}
      {erreur && (
        <div className="erreur" id={idErreur}>
          Erreur : {erreur}
        </div>
      )}
    </label>
  );
}

/** The four audience states of a section (charte, « Pastille d'audience »). */
export type EtatAudience = 'lue' | 'ecrite' | 'confiee' | 'mj';

export interface ReglagesAudience {
  joueursLisent: boolean;
  joueursEcrivent: boolean;
  auteurLit: boolean;
  auteurEcrit: boolean;
}

/** The state a section's settings spell: players read → lue (ecrite if they write too); else an author → confiee; else MJ only. */
export function etatAudience(r: ReglagesAudience): EtatAudience {
  if (r.joueursLisent) return r.joueursEcrivent ? 'ecrite' : 'lue';
  if (r.auteurLit || r.auteurEcrit) return 'confiee';
  return 'mj';
}

/** The word of a state: the state is carried by icon + word + tint, never the tint alone. */
export function motAudience(etat: EtatAudience, auteur?: string): string {
  switch (etat) {
    case 'lue':
      return 'Lue des joueurs';
    case 'ecrite':
      return 'Écrite par les joueurs';
    case 'confiee':
      return `Confiée à ${auteur ?? 'un joueur'}`;
    case 'mj':
      return 'MJ seul';
  }
}

/** Badge, 22 px: a word plus a tint (and an icon). `onClick` makes it a button with a chevron. */
export function Pastille({
  sens,
  icone: Icone,
  onClick,
  etiquette,
  children,
}: {
  sens: 'mj' | 'table' | 'neutre' | 'secrete';
  icone?: LucideIcon;
  onClick?: () => void;
  /** Accessible name when it is a button (state and gesture). */
  etiquette?: string;
  children: ReactNode;
}) {
  const contenu = (
    <>
      {Icone && <Icone size={12} strokeWidth={1.75} aria-hidden="true" />}
      {children}
      {onClick && <ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`pastille ${sens} cliquable`} aria-label={etiquette} onClick={onClick}>
        {contenu}
      </button>
    );
  }
  return <span className={`pastille ${sens}`}>{contenu}</span>;
}

export function PastilleRole({ role }: { role: Role }) {
  return role === 'mj' ? <Pastille sens="mj">MJ</Pastille> : <Pastille sens="table">Joueur</Pastille>;
}

/** Audience badge of a section. With `onRegler` (the GM's sheet) it opens the audience setting. */
export function PastilleAudience({
  etat,
  auteur,
  section,
  onRegler,
}: {
  etat: EtatAudience;
  auteur?: string;
  section?: string;
  onRegler?: () => void;
}) {
  const mot = motAudience(etat, auteur);
  const sens = etat === 'mj' ? 'mj' : etat === 'confiee' ? 'neutre' : 'table';
  const icone = etat === 'mj' ? Lock : etat === 'lue' ? Eye : etat === 'ecrite' ? PenLine : undefined;
  return (
    <Pastille
      sens={sens}
      icone={icone}
      onClick={onRegler}
      etiquette={onRegler ? `${mot} — régler l’audience de « ${section ?? ''} »` : undefined}
    >
      {etat === 'confiee' && auteur && <Avatar nom={auteur} joueur petit />}
      {mot}
    </Pastille>
  );
}

/** Round initials, decorative (the name is always written beside it). */
export function Avatar({ nom, joueur, petit }: { nom: string; joueur?: boolean; petit?: boolean }) {
  const initiales = nom
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join('');
  return (
    <span className={`avatar${joueur ? ' joueur' : ''}${petit ? ' petit' : ''}`} aria-hidden="true">
      {initiales}
    </span>
  );
}

/** A titled `section`; `reserveMj` adds the amber rule and the words « MJ seul ». */
export function Panneau({ titre, reserveMj, children }: { titre: string; reserveMj?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`panneau${reserveMj ? ' reserve-mj' : ''}`} aria-labelledby={id}>
      <h2 id={id}>
        {titre} {reserveMj && <Pastille sens="mj" icone={Lock}>MJ seul</Pastille>}
      </h2>
      {children}
    </section>
  );
}

/** Full-width status banner, not dismissible (`role="status"`). */
export function Bandeau({ sorte, children }: { sorte: 'bouchon' | 'perdue' | 'joueur'; children: ReactNode }) {
  return (
    <div className={`bandeau ${sorte}`} role="status">
      {sorte === 'perdue' && <WifiOff size={14} strokeWidth={1.75} aria-hidden="true" />}
      {sorte === 'joueur' && <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}
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

/** Loading skeleton shaped like a sheet (type, title, rule, two sections); `role="status"`, the text is read and written. */
export function SqueletteFiche({ texte = 'Chargement de la fiche…' }: { texte?: string }) {
  return (
    <div className="squelette-fiche" role="status">
      <div className="squelette s-type" aria-hidden="true" />
      <div className="squelette s-titre" aria-hidden="true" />
      <div className="squelette s-filet" aria-hidden="true" />
      {[0, 1].map((i) => (
        <div key={i} className="squelette-section" aria-hidden="true">
          <div className="squelette s-sous-titre" />
          <div className="squelette s-ligne" />
          <div className="squelette s-ligne" />
          <div className="squelette s-ligne court" />
        </div>
      ))}
      <p className="squelette-texte">{texte}</p>
    </div>
  );
}

/** Checkbox, 16 px; `mj` tints it amber (the one box of the product that says « Secrète (MJ seul) »). */
export function Case({
  etiquette,
  mj,
  ...reste
}: { etiquette: string; mj?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className={`case${mj ? ' mj' : ''}`}>
      <input type="checkbox" {...reste} />
      {etiquette}
    </label>
  );
}
