import { Check, FileJson, RotateCcw, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { appeler, ErreurApi, useConnexionPerdue } from '../../../api';
import { Bouton, BoutonIcone, Fenetre } from '../../../ui';
import type { CatalogueSummary, Niveau, Outil } from '../types';
import { Report, reportCounts, totals, type ImportReport } from './report';

type Phase = 'empty' | 'reading' | 'preview' | 'applying' | 'result' | 'invalid' | 'error' | 'denied';
type Action = 'apercu' | 'application';
interface Selection { file: File; body?: unknown; ready: boolean }
interface Failure { text: string; cause?: ReactNode; retry?: Action; refreshPreview?: boolean }
const INVALID = 'Ce fichier n’est pas un catalogue valide.';

/** Keep structured causes from the API; render every value as text, never as markup. */
function invalidCause(error: ErreurApi, tools: Outil[], tool: Outil): ReactNode {
  const detail = error.details;
  if (error.code === 'catalogue_trop_grand') return 'Ce catalogue dépasse 5 000 éléments.';
  const field = typeof detail?.champ === 'string' ? detail.champ : '';
  switch (detail?.cause) {
    case 'pas_un_objet': return 'Un objet JSON est attendu.';
    case 'version': return 'La version doit être un texte de 1 à 40 caractères.';
    case 'section_inconnue': return <>Section inconnue : <code>{field}</code>.</>;
    case 'section_non_liste': return <>La section « <code>{field}</code> » doit être une liste.</>;
    case 'mauvais_outil': {
      const received = typeof detail.recu === 'string' ? detail.recu : 'outil inconnu';
      const name = tools.find((t) => t.cle === received)?.libelle ?? received;
      return `Ce catalogue est pour « ${name} », pas pour « ${tool.libelle} ».`;
    }
  }
}

/** One in-memory file drives both calls. An application always uses the server's fresh report. */
export function ImportDialog({ base, level, catalogue, tools, tool, onClose, onApplied }: {
  base: string; level: Niveau; catalogue: CatalogueSummary; tools: Outil[]; tool: Outil;
  onClose: () => void; onApplied: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>('empty');
  const [report, setReport] = useState<ImportReport>();
  const [failure, setFailure] = useState<Failure>();
  const [changed, setChanged] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const selected = useRef<Selection | undefined>(undefined);
  const generation = useRef(0);
  const busy = useRef(false);
  const applying = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const offline = useConnexionPerdue();
  // Stable callback: Fenetre must not restore/re-enter focus on every state change.
  const dismiss = useCallback(() => { if (!applying.current) close.current(); }, []);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (phase === 'result' || phase === 'denied') content.current?.querySelector<HTMLElement>('[data-close]')?.focus();
  }, [phase]);

  async function request(action: Action, selection = selected.current) {
    if (!selection || busy.current) return;
    busy.current = true;
    applying.current = action === 'application';
    const turn = ++generation.current;
    const previousReport = report;
    setPhase(action === 'application' ? 'applying' : 'reading');
    setFailure(undefined);
    try {
      if (!selection.ready) {
        if (selection.file.size > 8 * 1024 * 1024) {
          throw new ErreurApi(413, 'Ce fichier est trop volumineux (8 Mio au plus).', 'fichier_trop_gros');
        }
        const text = await selection.file.text();
        if (turn !== generation.current) return;
        try { selection.body = JSON.parse(text); }
        catch { throw new ErreurApi(400, INVALID, 'catalogue_invalide'); }
        selection.ready = true;
      }
      const result = await appeler<ImportReport>('POST', `${base}/${action}`, selection.body);
      if (turn !== generation.current) return;
      setReport(result);
      setPhase(action === 'application' ? 'result' : 'preview');
      if (action === 'application') {
        setChanged(!!previousReport && reportCounts(previousReport) !== reportCounts(result));
        void onApplied();
      }
    } catch (error) {
      if (turn !== generation.current) return;
      if (error instanceof ErreurApi && [403, 404].includes(error.statut)) {
        setPhase('denied');
        setFailure({ text: 'Vous ne pouvez plus importer ce catalogue.' });
      } else if (error instanceof ErreurApi && [400, 413].includes(error.statut)) {
        setPhase('invalid');
        setReport(undefined);
        setFailure({ text: error.statut === 413 ? 'Ce fichier est trop volumineux (8 Mio au plus).' : INVALID,
          cause: invalidCause(error, tools, tool) });
      } else {
        const network = error instanceof ErreurApi && error.statut === 0;
        setPhase(action === 'application' && previousReport ? 'preview' : 'error');
        setFailure({
          text: network ? action === 'application'
            ? 'Connexion perdue pendant l’application. Rien n’est appliqué à moitié : relancez l’aperçu pour voir l’état du catalogue.'
            : 'Connexion perdue.' : 'L’action n’a pas abouti. Rien n’est appliqué.',
          retry: action, refreshPreview: network && action === 'application',
        });
      }
    } finally {
      if (turn === generation.current) { busy.current = false; applying.current = false; }
    }
  }

  const working = phase === 'reading' || phase === 'applying';
  const finished = phase === 'result' || phase === 'denied';
  const count = report ? totals(report).ajoutes + totals(report).modifies : 0;
  return createPortal(<>
    {/* Outside Fenetre's focus cycle: the drawn button opens this native file picker. */}
    <input hidden ref={fileInput} type="file" accept=".json,application/json" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file || busy.current) return;
      const selection = { file, ready: false };
      selected.current = selection;
      setReport(undefined); setChanged(false);
      void request('apercu', selection);
    }} />
    <Fenetre titre={`Importer le catalogue ${level === 'systeme' ? 'du système' : 'de l’univers'}`} onFermer={dismiss}>
      <div className="catalogue-dialog" ref={content}>
        <div className="catalogue-close"><BoutonIcone data-close etiquette="Fermer" icone={X}
          disabled={phase === 'applying'} onClick={dismiss} /></div>
        <div className="catalogue-content" aria-busy={working || undefined}>
          {!finished && <Bouton icone={FileJson} disabled={working} onClick={() => fileInput.current?.click()}>
            {phase === 'invalid' ? 'Choisir un autre fichier' : 'Choisir un fichier JSON'}
          </Bouton>}
          {phase === 'empty' && <p>Choisissez un fichier de catalogue (JSON).</p>}
          {selected.current && <p className="catalogue-file">Fichier : <strong>{selected.current.file.name}</strong>{report && <> · version <strong>{report.version}</strong></>}</p>}
          {phase === 'reading' && <p role="status">Lecture du fichier…</p>}
          {failure && <div className="catalogue-failure" role="alert">
            <p>{failure.text}</p>{failure.cause && <p className="catalogue-cause">{failure.cause}</p>}
            {failure.retry && <Bouton icone={RotateCcw} disabled={working || offline} onClick={() => void request(failure.retry!)}>Réessayer</Bouton>}
            {failure.refreshPreview && <Bouton icone={RotateCcw} disabled={working || offline} onClick={() => void request('apercu')}>Relancer l’aperçu</Bouton>}
          </div>}
          {offline && !failure && <p className="catalogue-failure" role="status">Connexion perdue.</p>}
          {phase === 'result' && report && <div className="catalogue-result" role="status"><Check size={18} aria-hidden="true" />
            Catalogue appliqué · version {report.versionCatalogue ?? report.version}
          </div>}
          {changed && <p className="catalogue-note">Le catalogue a changé depuis l’aperçu : voici ce qui a été appliqué.</p>}
          {report && phase !== 'denied' && <Report key={`${generation.current}-${phase === 'result'}`} report={report} natures={catalogue.natures} />}
        </div>
        <footer className="catalogue-actions">
          {!finished && report && <div>
            <Bouton variante="principal" icone={Upload} ecrit disabled={working || count === 0}
              onClick={() => void request('application')}>
              {phase === 'applying' ? 'Application…' : `Appliquer (${count} élément${count > 1 ? 's' : ''})`}
            </Bouton>
            {count === 0 && <p className="catalogue-note">Rien à appliquer.</p>}
          </div>}
          <Bouton disabled={phase === 'applying'} onClick={dismiss}>{finished ? 'Fermer' : 'Annuler'}</Bouton>
        </footer>
      </div>
    </Fenetre>
  </>, document.body);
}
