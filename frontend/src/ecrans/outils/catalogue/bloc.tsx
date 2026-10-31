import { Upload } from 'lucide-react';
import { useState } from 'react';

import { Bouton } from '../../../ui';
import type { CatalogueSummary, Niveau, Outil } from '../types';
import { ImportDialog } from './import-dialog';
import './catalogue.css';

/** Catalogue counts belong to each level, not to the resolved catalogue. */
export function BlocCatalogue({ base, niveau, outil, catalogue, outils, ecriture, recharger }: {
  base: string; niveau: Niveau; outil: Outil; catalogue: CatalogueSummary; outils: Outil[];
  ecriture: boolean; recharger: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const levels = niveau === 'systeme' ? ['systeme'] as const : ['systeme', 'univers'] as const;
  return <div className="catalogue-bloc">
    <h3>Catalogue</h3>
    {levels.map((level) => {
      const summary = catalogue[level];
      const counts = catalogue.natures.filter(({ nom }) => (summary.comptes[nom] ?? 0) > 0)
        .map(({ nom, libelle, libellePluriel }) => {
          const count = summary.comptes[nom]!;
          return `${count} ${(count > 1 ? libellePluriel : libelle).toLocaleLowerCase('fr')}`;
        }).join(' · ');
      return <p key={level} className="catalogue-version">
        Catalogue {level === 'systeme' ? 'du système' : 'de l’univers'} · {summary.version === null ? 'aucun catalogue importé' : <>
          version <strong>{summary.version}</strong>{counts && <> · {counts}</>}
        </>}
      </p>;
    })}
    {ecriture ? <Bouton icone={Upload} ecrit onClick={() => setOpen(true)}>Importer un catalogue…</Bouton>
      : niveau === 'systeme' && <p className="catalogue-note">Seul le responsable du système importe le catalogue.</p>}
    {open && <ImportDialog base={base} level={niveau} catalogue={catalogue} tools={outils} tool={outil}
      onClose={() => setOpen(false)} onApplied={recharger} />}
  </div>;
}
