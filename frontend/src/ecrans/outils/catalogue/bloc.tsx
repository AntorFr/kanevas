import { List, Upload } from 'lucide-react';
import { useState } from 'react';

import { Bouton } from '../../../ui';
import type { CatalogueSummary, Niveau, Outil } from '../types';
import { ElementsCatalogue } from './elements';
import { ImportDialog } from './import-dialog';
import './catalogue.css';

/** Catalogue counts belong to each level, not to the resolved catalogue. */
export function BlocCatalogue({ base, niveau, outil, catalogue, outils, ecriture, recharger }: {
  base: string; niveau: Niveau; outil: Outil; catalogue: CatalogueSummary; outils: Outil[];
  ecriture: boolean; recharger: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [elements, setElements] = useState(false);
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
    <div className="catalogue-boutons">
    {ecriture ? <Bouton icone={Upload} ecrit onClick={() => setOpen(true)}>Importer un catalogue…</Bouton>
      : null}
    <Bouton icone={List} aria-expanded={elements} onClick={() => setElements(!elements)}>Voir les éléments</Bouton>
    </div>
    {!ecriture && niveau === 'systeme' && <p className="catalogue-note">Seul le responsable du système importe le catalogue.</p>}
    {elements && <ElementsCatalogue key={`${niveau}/${catalogue.systeme.version}/${catalogue.univers.version}`} base={base} niveau={niveau} outil={outil} catalogue={catalogue} ecriture={ecriture} />}
    {open && <ImportDialog base={base} level={niveau} catalogue={catalogue} tools={outils} tool={outil}
      onClose={() => setOpen(false)} onApplied={recharger} />}
  </div>;
}
