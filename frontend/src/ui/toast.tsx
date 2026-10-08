import { CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** A toast lives 4 s, at most three are shown, the newest at the bottom (docs/ecrans.md). */
export const DUREE_TOAST_MS = 4000;
export const MAX_TOASTS = 3;

export interface ToastInfo {
  id: number;
  texte: string;
}

/** Adds a toast at the bottom of the stack; beyond three, the oldest leaves. Pure. */
export function empiler(liste: ToastInfo[], nouveau: ToastInfo): ToastInfo[] {
  return [...liste, nouveau].slice(-MAX_TOASTS);
}

interface ContexteToasts {
  /** Confirms a successful action. Never takes the focus. */
  toast: (texte: string) => void;
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

  const toast = useCallback(
    (texte: string) => {
      const id = prochain.current++;
      setListe((l) => empiler(l, { id, texte }));
      minuteurs.current.set(id, setTimeout(() => retirer(id), DUREE_TOAST_MS));
    },
    [retirer],
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
          <Toast key={t.id} texte={t.texte} onFermer={() => retirer(t.id)} />
        ))}
      </div>
    </Contexte.Provider>
  );
}

/** One toast: a check, the text, « Fermer ». */
export function Toast({ texte, onFermer }: { texte: string; onFermer: () => void }) {
  return (
    <div className="toast">
      <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" className="toast-icone" />
      <span>{texte}</span>
      <button type="button" className="bouton-icone" aria-label="Fermer" title="Fermer" onClick={onFermer}>
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
