import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Bouton } from '../../../ui';
import type { CatalogueSummary } from '../types';

interface Counts { ajoutes: number; modifies: number; inchanges: number; refuses: number }
export interface ImportReport {
  version: string;
  apercu: boolean;
  natures: Record<string, Counts>;
  remplacements: number;
  absents: number;
  refus: { nature: string; cle: string; champ: string; raison: string }[];
  refusTotal: number;
  versionCatalogue: string | null;
}

export const totals = (report: ImportReport): Counts => Object.values(report.natures).reduce((a, b) => ({
  ajoutes: a.ajoutes + b.ajoutes, modifies: a.modifies + b.modifies,
  inchanges: a.inchanges + b.inchanges, refuses: a.refuses + b.refuses,
}), { ajoutes: 0, modifies: 0, inchanges: 0, refuses: 0 });

const counted = (n: number, label: string) => `${n} ${label}${n > 1 ? 's' : ''}`;
export const summaryText = (report: ImportReport) => {
  const counts = totals(report);
  return [counted(counts.ajoutes, 'ajouté'), counted(counts.modifies, 'modifié'),
    ...(counts.inchanges ? [counted(counts.inchanges, 'inchangé')] : []),
    ...(counts.refuses ? [counted(counts.refuses, 'refusé')] : []),
  ].join(', ');
};

/** Compare counts, not the preview flag or the version changed by our own application. */
export const reportCounts = (report: ImportReport) => JSON.stringify({
  natures: report.natures, remplacements: report.remplacements, absents: report.absents,
});

/** Server labels and counts, including its bounded refusal report. */
export function Report({ report, natures }: { report: ImportReport; natures: CatalogueSummary['natures'] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? report.refus : report.refus.slice(0, 50);
  const remaining = report.refusTotal - visible.length;
  const columns = [['ajoutes', 'Ajouté'], ['modifies', 'Modifié'], ['inchanges', 'Inchangé'], ['refuses', 'Refusé']] as const;
  return <>
    <p className="catalogue-summary" role="status">{summaryText(report)}</p>
    {report.remplacements > 0 && <p className="catalogue-note">dont {report.remplacements} {report.remplacements === 1 ? 'remplace' : 'remplacent'} un élément du système</p>}
    <table className="catalogue-counts" aria-label="Résumé par nature">
      <thead><tr><th scope="col">Nature</th>{columns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
      <tbody>{natures.map(({ nom, libellePluriel }) => {
        const counts = report.natures[nom];
        return counts && <tr key={nom}><th scope="row">{libellePluriel}</th>
          {columns.map(([key, label]) => <td key={key} data-label={label}>{counts[key]}</td>)}
        </tr>;
      })}</tbody>
    </table>
    {visible.length > 0 && <ol className="catalogue-refusals" aria-label="Éléments refusés">
      {visible.map((refusal, index) => <li key={index}>
        {natures.find((n) => n.nom === refusal.nature)?.libelle ?? refusal.nature} « <code>{refusal.cle}</code> », champ <code>{refusal.champ}</code> : {refusal.raison}. Cet élément n’est pas appliqué.
      </li>)}
    </ol>}
    {remaining > 0 && <p className="catalogue-more">{expanded ? `… et ${remaining} autres` : `${remaining} autres refus…`}
      {!expanded && report.refus.length > 50 && <Bouton icone={ChevronDown} onClick={() => setExpanded(true)}>Voir tout</Bouton>}
    </p>}
    <p className="catalogue-note">Les éléments qui ne sont plus dans le fichier restent dans le catalogue.</p>
    {report.absents > 0 && <p className="catalogue-note">{counted(report.absents, 'élément')} du catalogue {report.absents === 1 ? 'n’est pas' : 'ne sont pas'} dans ce fichier.</p>}
  </>;
}
