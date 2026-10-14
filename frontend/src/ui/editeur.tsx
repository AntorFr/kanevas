import { Bold, Italic, Lock } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { appeler, useConnexionPerdue } from '../api';
import { Bouton } from './composants';
import { depasse, entourer, entourerBlocMJ, messageTropLong, refusServeur } from './editeur-logique';
import { Markdown } from './markdown';
import './editeur.css';

export { depasse, messageTropLong, refusServeur };

const ECHEC_APERCU = 'L’aperçu n’a pas abouti. Réessayez.';

type Apercu = { etat: 'cours' } | { etat: 'vide' } | { etat: 'echec' } | { etat: 'ok'; html: string };

interface Props {
  /** Accessible name of the field. */
  etiquette: string;
  valeur: string;
  onChange: (valeur: string) => void;
  /** Ceiling from `/api/moi` (`useLimiteContenu()`); unknown until it answered: nothing is checked. */
  max?: number;
  rows?: number;
  autoFocus?: boolean;
  /** Ctrl/⌘+Entrée. */
  onEnregistrer?: () => void;
  /** Échap. */
  onAnnuler?: () => void;
  /** A refusal from the server, shown instead of the length one. */
  erreur?: string;
  /**
   * Offers « Bloc MJ » and makes the preview a section's (E-9): the server renders the container for a GM only.
   * Absent for E-7, E-15 and the report window, whose preview sends nothing of it.
   */
  section?: { universId: string; modeJoueur: boolean; blocMJ: boolean };
  /** Beside the counter, at the foot of the frame: help line and buttons of the screen. */
  children?: ReactNode;
}

/**
 * The Markdown editor shared by E-9, E-7 and E-15 (B-32, P-14 step 1): bold / italic bar, Écrire / Aperçu
 * switch (the preview is the server's `POST /api/apercu`, the same function as the reading), counter and
 * ceiling from `/api/moi`. The text typed stays in the field while the preview shows.
 */
export function EditeurMarkdown({ etiquette, valeur, onChange, max, rows = 8, autoFocus, onEnregistrer, onAnnuler, erreur, section, children }: Props) {
  const perdue = useConnexionPerdue();
  const champ = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ debut: number; fin: number } | undefined>(undefined);
  const demande = useRef(0);
  const [vue, setVue] = useState<'ecrire' | 'apercu'>('ecrire');
  const [apercu, setApercu] = useState<Apercu>({ etat: 'vide' });
  const idErreur = useId();
  const trop = depasse(valeur, max);
  const message = erreur ?? (trop && max !== undefined ? messageTropLong(max) : undefined);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const touche = mac ? '⌘' : 'Ctrl';

  // An answer that arrives after the view was left, or after another request, is dropped.
  useEffect(() => () => void (demande.current += 1), []);

  // Puts the selection back after a wrap re-rendered the field.
  useLayoutEffect(() => {
    const s = selection.current;
    if (s && champ.current) {
      champ.current.focus();
      champ.current.setSelectionRange(s.debut, s.fin);
      selection.current = undefined;
    }
  });

  function marquer(marque: string) {
    const c = champ.current;
    if (!c || vue !== 'ecrire') return;
    const r = entourer(valeur, c.selectionStart, c.selectionEnd, marque);
    selection.current = { debut: r.debut, fin: r.fin };
    onChange(r.texte);
  }

  function blocMJ() {
    const c = champ.current;
    if (!c || vue !== 'ecrire') return;
    const r = entourerBlocMJ(valeur, c.selectionStart, c.selectionEnd);
    selection.current = { debut: r.debut, fin: r.fin };
    onChange(r.texte);
  }

  async function previsualiser() {
    if (valeur.trim() === '') {
      setApercu({ etat: 'vide' });
      setVue('apercu');
      return;
    }
    // Over the ceiling: no call, the error under the field says it.
    if (trop) return;
    const n = ++demande.current;
    setApercu({ etat: 'cours' });
    setVue('apercu');
    try {
      const r = await appeler<{ html: string }>('POST', '/api/apercu', {
        texte: valeur,
        ...(section ? { nature: 'section', univers_id: Number(section.universId), mode: section.modeJoueur ? 'joueur' : 'mj' } : {}),
      });
      if (n === demande.current) setApercu({ etat: 'ok', html: r.html });
    } catch {
      if (n === demande.current) setApercu({ etat: 'echec' });
    }
  }

  function ecrire() {
    demande.current += 1;
    setVue('ecrire');
    requestAnimationFrame(() => champ.current?.focus());
  }

  function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onAnnuler?.();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onEnregistrer?.();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      marquer('**');
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      marquer('*');
    }
  }

  const enCours = apercu.etat === 'cours' && vue === 'apercu';
  const radio = (v: 'ecrire' | 'apercu', libelle: string, action: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={vue === v}
      tabIndex={vue === v ? 0 : -1}
      aria-disabled={enCours || undefined}
      onClick={() => {
        if (!enCours && vue !== v) action();
      }}
      onKeyDown={(e) => {
        if (enCours || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        if (v === 'ecrire') void previsualiser();
        else ecrire();
      }}
    >
      {libelle}
    </button>
  );

  return (
    <div className="editeur-bloc">
      <div className={`editeur${message ? ' en-erreur' : ''}`} onKeyDown={clavier}>
        <div className="outils-md" role="toolbar" aria-label="Mise en forme">
          <button type="button" className="outil-md" aria-label="Gras" title={`Gras · ${touche} B`} disabled={vue !== 'ecrire'} onClick={() => marquer('**')}>
            <Bold size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" className="outil-md" aria-label="Italique" title={`Italique · ${touche} I`} disabled={vue !== 'ecrire'} onClick={() => marquer('*')}>
            <Italic size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {section?.blocMJ && (
            <button type="button" className="outil-mj" title="Bloc MJ · entoure la sélection" aria-label="Bloc MJ" disabled={vue !== 'ecrire'} onClick={blocMJ}>
              <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="lib-outil">Bloc MJ</span>
            </button>
          )}
          <div className="bascule-md" role="radiogroup" aria-label="Écrire ou voir l’aperçu">
            {radio('ecrire', 'Écrire', ecrire)}
            {radio('apercu', 'Aperçu', () => void previsualiser())}
          </div>
        </div>
        <textarea
          ref={champ}
          className="source-md"
          aria-label={etiquette}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? idErreur : undefined}
          rows={rows}
          value={valeur}
          autoFocus={autoFocus}
          hidden={vue !== 'ecrire'}
          onChange={(e) => onChange(e.target.value)}
        />
        {vue === 'apercu' && (
          <div className="apercu-md" aria-live="polite">
            {apercu.etat === 'cours' && <p className="etat-md">Aperçu en cours…</p>}
            {apercu.etat === 'vide' && <p className="etat-md">Rien à prévisualiser.</p>}
            {apercu.etat === 'echec' && (
              <div className="etat-md" role="alert">
                <span>{ECHEC_APERCU}</span>{' '}
                <Bouton petit disabled={perdue} onClick={() => void previsualiser()}>
                  Réessayer
                </Bouton>
              </div>
            )}
            {apercu.etat === 'ok' && <Markdown className="texte" html={apercu.html} />}
          </div>
        )}
        <div className="pied-md">
          <span className={`compteur-md${trop ? ' trop' : ''}`} aria-live="polite">
            {valeur.length.toLocaleString('fr-FR')}
            {max !== undefined && ` / ${max.toLocaleString('fr-FR')}`}
          </span>
          {children}
        </div>
      </div>
      {message && (
        <div className="erreur-md" id={idErreur}>
          Erreur : {message}
        </div>
      )}
    </div>
  );
}
