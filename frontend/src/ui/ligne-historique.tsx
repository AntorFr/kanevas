import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Pastille } from './composants';

/**
 * History line (charte, « Ligne d'historique », E-24): a row without frame, the date, who and by which way,
 * the sheet and what changed. The change label opens the detail; the sheet link is a second link, never nested.
 * The origin is carried by its word and its icon. The screen gives the content, this draws it.
 */
export function ListeHistorique({ etiquette, children }: { etiquette: string; children: ReactNode }) {
  return (
    <ul className="liste-historique" aria-label={etiquette}>
      {children}
    </ul>
  );
}

export function LigneHistorique({
  date,
  dateLisible,
  contributeur,
  via,
  origine,
  fiche,
  libelle,
  vers,
  courante,
}: {
  /** ISO instant, for `<time dateTime>`. */
  date: string;
  dateLisible: string;
  contributeur: string;
  /** « via Foundry », « assistant », « import · lot 3 ». */
  via?: string;
  origine: { mot: string; icone: LucideIcon };
  /** Absent: the sheet is deleted, shown as plain text with its pastille. */
  fiche: { vers: string; titre: string } | null;
  libelle: string;
  /** Address of the detail. */
  vers: string;
  courante?: boolean;
}) {
  return (
    <li className="ligne-historique">
      <time dateTime={date} className="ligne-historique-date">
        {dateLisible}
      </time>
      <div className="ligne-historique-corps">
        <div className="ligne-historique-qui">
          <b>{contributeur}</b>
          {via && <span className="ligne-historique-via">{via}</span>}
          <Pastille sens="neutre" icone={origine.icone}>
            {origine.mot}
          </Pastille>
        </div>
        <div className="ligne-historique-quoi">
          {fiche ? (
            <Link className="ligne-historique-fiche" to={fiche.vers}>
              {fiche.titre}
            </Link>
          ) : (
            <span className="ligne-historique-supprimee">
              Fiche <Pastille sens="neutre">supprimée</Pastille>
            </span>
          )}
          <span aria-hidden="true">—</span>
          <Link className="ligne-historique-detail" to={vers} aria-current={courante ? 'true' : undefined}>
            {libelle}
          </Link>
        </div>
      </div>
    </li>
  );
}
