import { Bold, Italic, Link2, Lock, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react';

import { appeler, useConnexionPerdue } from '../api';
import { Bouton } from './composants';
import { dansBlocMJ, depasse, entourer, entourerBlocMJ, estLienIllisible, idsFichiers, insererLien, insererTexte, referenceFichier, sansBlocsMJ, messageTropLong, ouvertureLien, ouvrirLien, refusServeur } from './editeur-logique';
import { ListeLiens, useRechercheLiens, type FicheLien } from './liste-liens';
import { Markdown } from './markdown';
import './editeur.css';

export { depasse, idsFichiers, messageTropLong, referenceFichier, refusServeur, sansBlocsMJ };

const ECHEC_APERCU = 'L’aperçu n’a pas abouti. Réessayez.';

/** What the editor hands to the file tool of E-9 (« Fichier » of the toolbar): insertion, place, drop. */
export interface ApiEditeurFichier {
  /** Puts a reference at the caret as it is when the call comes (the upload may have been long). */
  inserer: (texte: string) => void;
  /** Whether the caret stands in a `:::mj` block now. */
  dansBlocMJ: () => boolean;
  /** Where the tool shows its upload lines and messages, under the field. */
  sous: HTMLElement | null;
  /** The tool registers here what a drop of files on the editor does. */
  depot: MutableRefObject<((fichiers: File[]) => void) | null>;
  /** The Écrire view is shown (the tool is inert in the preview). */
  ecriture: boolean;
}

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
  /**
   * Offers « Lien vers une fiche » (Ctrl/⌘+K) and the list opened by `[[` (B-33). Absent for E-15 and the report window,
   * where `[[…]]` stays text. `campagneId` makes the preview a scenario's (links read in its campaign's universe).
   */
  liens?: { universId: string; campagneId?: number };
  /** « Fichier » (`paperclip`) of the toolbar and the drop of files (B-55): the screen supplies the tool. Absent where a text holds no file. */
  fichier?: (api: ApiEditeurFichier) => ReactNode;
  /** A warning under the field that blocks nothing (B-55). */
  avertissement?: ReactNode;
  /** Beside the counter, at the foot of the frame: help line and buttons of the screen. */
  children?: ReactNode;
}

/**
 * The Markdown editor shared by E-9, E-7 and E-15 (B-32, P-14 step 1): bold / italic bar, Écrire / Aperçu
 * switch (the preview is the server's `POST /api/apercu`, the same function as the reading), counter and
 * ceiling from `/api/moi`. The text typed stays in the field while the preview shows.
 */
export function EditeurMarkdown({ etiquette, valeur, onChange, max, rows = 8, autoFocus, onEnregistrer, onAnnuler, erreur, section, liens, fichier, avertissement, children }: Props) {
  const perdue = useConnexionPerdue();
  const champ = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ debut: number; fin: number } | undefined>(undefined);
  const demande = useRef(0);
  const [vue, setVue] = useState<'ecrire' | 'apercu'>('ecrire');
  const [apercu, setApercu] = useState<Apercu>({ etat: 'vide' });
  const valeurRef = useRef(valeur);
  valeurRef.current = valeur;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const depot = useRef<((fichiers: File[]) => void) | null>(null);
  const [sous, setSous] = useState<HTMLDivElement | null>(null);
  const idErreur = useId();
  const idListe = useId();
  // The `[[` the caret is in (start of the brackets, text typed after them) and the highlighted row.
  const [ouvert, setOuvert] = useState<{ debut: number; requete: string }>();
  const [courant, setCourant] = useState(0);
  const fermeA = useRef(-1);
  const bloc = useRef<HTMLDivElement>(null);
  const listeOuverte = ouvert !== undefined;
  // The floating assistant button sits bottom right: keep the list and the save row clear of it (scroll-margin in editeur.css).
  const [recherche, reessayer] = useRechercheLiens(liens?.universId ?? '', ouvert?.requete ?? '', ouvert !== undefined);
  // The list grows when the answer arrives: scroll again then, so the whole list and the save row stay in view.
  const lignes = recherche.etat === 'ok' ? recherche.fiches.length : -1;
  useEffect(() => {
    if (listeOuverte) bloc.current?.querySelector('.pied-md')?.scrollIntoView?.({ block: 'nearest' });
  }, [listeOuverte, recherche.etat, lignes]);
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

  /** Opens or closes the list after the text or the caret moved. Escape keeps it shut on the same `[[`. */
  function suivreCaret(texte: string, caret: number) {
    const o = liens && !perdue && vue === 'ecrire' ? ouvertureLien(texte, caret) : null;
    if (!o) {
      fermeA.current = -1;
      setOuvert(undefined);
      return;
    }
    if (fermeA.current === o.debut) return setOuvert(undefined);
    setOuvert((a) => {
      if (!a || a.debut !== o.debut || a.requete !== o.requete) setCourant(0);
      return o;
    });
  }

  function lien() {
    const c = champ.current;
    if (!c || !liens || perdue || vue !== 'ecrire') return;
    const r = ouvrirLien(valeur, c.selectionStart, c.selectionEnd);
    selection.current = { debut: r.debut, fin: r.fin };
    fermeA.current = -1;
    onChange(r.texte);
    suivreCaret(r.texte, r.fin);
  }

  function choisir(f: FicheLien) {
    const c = champ.current;
    if (!c || !ouvert) return;
    const r = insererLien(valeur, ouvert.debut, c.selectionStart, f.id, f.titre);
    selection.current = { debut: r.debut, fin: r.fin };
    fermeA.current = -1;
    setOuvert(undefined);
    onChange(r.texte);
  }

  /** Keys of the open list; they never reach the frame's own (Échap would cancel the edit). */
  function clavierListe(e: KeyboardEvent) {
    if (!ouvert) return;
    const fiches = recherche.etat === 'ok' ? recherche.fiches : [];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fermeA.current = ouvert.debut;
      setOuvert(undefined);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && fiches.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setCourant((i) => (e.key === 'ArrowDown' ? (i + 1) % fiches.length : (i - 1 + fiches.length) % fiches.length));
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && fiches[courant]) {
      e.preventDefault();
      e.stopPropagation();
      choisir(fiches[courant]!);
    }
  }

  function inserer(insertion: string) {
    const c = champ.current;
    const texte = valeurRef.current;
    const debut = c ? c.selectionStart : texte.length;
    const fin = c ? c.selectionEnd : texte.length;
    const r = insererTexte(texte, debut, fin, insertion);
    selection.current = { debut: r.debut, fin: r.fin };
    changeRef.current(r.texte);
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
        ...(liens?.campagneId !== undefined ? { nature: 'scenario', campagne_id: liens.campagneId } : {}),
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
    } else if (liens && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      lien();
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

  const glisse = (e: React.DragEvent) => Boolean(depot.current) && Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      className="editeur-bloc"
      ref={bloc}
      onDragOver={(e) => glisse(e) && e.preventDefault()}
      onDrop={(e) => {
        if (!glisse(e)) return;
        e.preventDefault();
        depot.current?.(Array.from(e.dataTransfer.files));
      }}
    >
      <div className={`editeur${message ? ' en-erreur' : ''}`} onKeyDown={clavier}>
        <div className="outils-md" role="toolbar" aria-label="Mise en forme">
          <button type="button" className="outil-md" aria-label="Gras" title={`Gras · ${touche} B`} disabled={vue !== 'ecrire'} onClick={() => marquer('**')}>
            <Bold size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" className="outil-md" aria-label="Italique" title={`Italique · ${touche} I`} disabled={vue !== 'ecrire'} onClick={() => marquer('*')}>
            <Italic size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {liens && (
            <button type="button" className="outil-md" aria-label="Lien vers une fiche" title={`Lien vers une fiche · ${touche} K`} disabled={vue !== 'ecrire' || perdue} onClick={lien}>
              <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          {fichier?.({ inserer, dansBlocMJ: () => dansBlocMJ(valeurRef.current, champ.current?.selectionStart ?? valeurRef.current.length), sous, depot, ecriture: vue === 'ecrire' })}
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
          aria-autocomplete={liens ? 'list' : undefined}
          aria-controls={ouvert ? idListe : undefined}
          aria-activedescendant={ouvert && recherche.etat === 'ok' && recherche.fiches.length > 0 ? `${idListe}-${courant}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            suivreCaret(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={clavierListe}
          onKeyUp={(e) => {
            if (liens && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) suivreCaret(e.currentTarget.value, e.currentTarget.selectionStart);
          }}
          onClick={(e) => liens && suivreCaret(e.currentTarget.value, e.currentTarget.selectionStart)}
        />
        {ouvert && vue === 'ecrire' && (
          <ListeLiens id={idListe} recherche={recherche} courant={courant} onCourant={setCourant} onChoisir={choisir} onReessayer={reessayer} />
        )}
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
        <div ref={setSous} className="sous-md" />
        <div className="pied-md">
          <span className={`compteur-md${trop ? ' trop' : ''}`} aria-live="polite">
            {valeur.length.toLocaleString('fr-FR')}
            {max !== undefined && ` / ${max.toLocaleString('fr-FR')}`}
          </span>
          {children}
        </div>
      </div>
      {avertissement && (
        <div className="avert-mj" role="status">
          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{avertissement}</span>
        </div>
      )}
      {message && (
        <div className="erreur-md" id={idErreur}>
          {estLienIllisible(message) ? message : `Erreur : ${message}`}
        </div>
      )}
    </div>
  );
}
