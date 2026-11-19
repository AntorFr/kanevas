import { CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** A toast lives 4 s, at most three are shown, the newest at the bottom (docs/ecrans.md). */
export const DUREE_TOAST_MS = 4000;
export const MAX_TOASTS = 3;

export interface ToastInfo {
  id: number;
  texte: string;
  action?: ActionToast;
}

/** An action carried by a toast: a real link (`href`) or a button (`onClick`). */
export type ActionToast = { libelle: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/** Adds a toast at the bottom of the stack; beyond three, the oldest leaves. Pure. */
export function empiler(liste: ToastInfo[], nouveau: ToastInfo): ToastInfo[] {
  return [...liste, nouveau].slice(-MAX_TOASTS);
}

interface ContexteToasts {
  /** Confirms a successful action, optionally with one action. Never takes the focus. */
  toast: (texte: string, action?: ActionToast) => void;
}
const Contexte = createContext<ContexteToasts>({ toast: () => {} });

/** `const { toast } = useToasts(); toast('« Rumeurs entendues » enregistrée')`. */
export function useToasts(): ContexteToasts {
  return useContext(Contexte);
}

/**
 * Holds the toasts and renders their region: `role="status"` + `aria-live="polite"`, centred at the
 * bottom (the width of the assistant button is left free on a phone). A failure is not a toast.
 */
export function FournisseurToasts({ children }: { children: ReactNode }) {
  const [liste, setListe] = useState<ToastInfo[]>([]);
  const prochain = useRef(1);
  const minuteurs = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const retirer = useCallback((id: number) => {
    clearTimeout(minuteurs.current.get(id));
    minuteurs.current.delete(id);
    setListe((l) => l.filter((t) => t.id !== id));
  }, []);

  const armer = useCallback(
    (id: number) => {
      clearTimeout(minuteurs.current.get(id));
      minuteurs.current.set(id, setTimeout(() => retirer(id), DUREE_TOAST_MS));
    },
    [retirer],
  );
  const suspendre = useCallback((id: number) => {
    clearTimeout(minuteurs.current.get(id));
    minuteurs.current.delete(id);
  }, []);

  const toast = useCallback(
    (texte: string, action?: ActionToast) => {
      const id = prochain.current++;
      setListe((l) => empiler(l, action ? { id, texte, action } : { id, texte }));
      armer(id);
    },
    [armer],
  );

  useEffect(() => {
    const m = minuteurs.current;
    return () => m.forEach(clearTimeout);
  }, []);

  const valeur = useMemo(() => ({ toast }), [toast]);
  return (
    <Contexte.Provider value={valeur}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {liste.map((t) => (
          <Toast
            key={t.id}
            texte={t.texte}
            action={t.action}
            onFermer={() => retirer(t.id)}
            onSuspendre={() => suspendre(t.id)}
            onReprendre={() => armer(t.id)}
          />
        ))}
      </div>
    </Contexte.Provider>
  );
}

/**
 * One toast: a check, the text, an optional action, « Fermer ». A toast with an action is held while the
 * pointer or the focus is on it (WCAG 2.2.1) and its 4 s start again when both have left; it never takes the focus.
 */
export function Toast({
  texte,
  action,
  onFermer,
  onSuspendre,
  onReprendre,
}: {
  texte: string;
  action?: ActionToast;
  onFermer: () => void;
  onSuspendre?: () => void;
  onReprendre?: () => void;
}) {
  const pointeur = useRef(false);
  const focus = useRef(false);
  const tenir = action ? onSuspendre : undefined;
  const relacher = action ? onReprendre : undefined;
  const maj = (p: boolean | null, f: boolean | null) => {
    if (p !== null) pointeur.current = p;
    if (f !== null) focus.current = f;
    if (pointeur.current || focus.current) tenir?.();
    else relacher?.();
  };
  return (
    <div
      className="toast"
      onPointerEnter={action ? () => maj(true, null) : undefined}
      onPointerLeave={action ? () => maj(false, null) : undefined}
      onFocus={action ? () => maj(null, true) : undefined}
      onBlur={action ? () => maj(null, false) : undefined}
    >
      <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" className="toast-icone" />
      <span>{texte}</span>
      {action &&
        (action.href !== undefined ? (
          <a className="toast-action" href={action.href}>
            {action.libelle}
          </a>
        ) : (
          <button type="button" className="toast-action" onClick={action.onClick}>
            {action.libelle}
          </button>
        ))}
      <button type="button" className="bouton-icone" aria-label="Fermer" title="Fermer" onClick={onFermer}>
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
