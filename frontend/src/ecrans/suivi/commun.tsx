import { NotebookPen } from 'lucide-react';
import { Link } from 'react-router-dom';

import '../liste.css';

export type Categorie = 'monstres' | 'pnj' | 'cartes' | 'deroulements' | 'autre';

export interface Tache {
  id: number;
  ficheId: number;
  categorie: Categorie;
  libelle: string;
  faite: boolean;
  faiteLe: string | null;
}

export interface CompteRendu {
  id: number;
  titre: string;
  /** Only for a reader of that adventure (E-13); never a title otherwise. */
  campagneId?: number;
  campagneNom?: string;
  /** Only to a GM: the adventure of the report is gone. */
  campagneSupprimee?: true;
  auteur: string | null;
  creeLe: string;
}

export interface PageComptesRendus {
  comptesRendus: CompteRendu[];
  suivant: string | null;
}

export const ECHEC = 'L’action n’a pas abouti. Réessayez.';

export const CATEGORIES: { valeur: Categorie; libelle: string }[] = [
  { valeur: 'monstres', libelle: 'Monstres' },
  { valeur: 'pnj', libelle: 'PNJ' },
  { valeur: 'cartes', libelle: 'Cartes' },
  { valeur: 'deroulements', libelle: 'Déroulements' },
  { valeur: 'autre', libelle: 'Autre' },
];

export const libelleCategorie = (c: Categorie) => CATEGORIES.find((x) => x.valeur === c)?.libelle ?? c;

/** « 22 sept. 2026 » */
export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One report: title above author and adventure, with separate links to their sheets (E-13). */
export function LigneCompteRendu({ universId, cr, campagne }: { universId: string; cr: CompteRendu; campagne?: boolean }) {
  const aventure = campagne && (cr.campagneNom !== undefined || cr.campagneSupprimee);
  const metadonnees = cr.auteur !== null || aventure;
  return (
    <li className="ligne-suivi ligne-compte-rendu">
      <div className="grand">
        <span className="mono" aria-hidden="true">
          <NotebookPen size={14} strokeWidth={1.75} />
        </span>
        <span className="texte-ligne">
          <Link className="titre-long titre-compte-rendu" to={`/univers/${universId}/fiche/${cr.id}`}>{cr.titre}</Link>
          {metadonnees && <small className="meta-compte-rendu">
            {cr.auteur !== null && <span>{cr.auteur}</span>}
            {cr.auteur !== null && aventure && <span aria-hidden="true">·</span>}
            {campagne && cr.campagneNom !== undefined && <Link className="badge-type" to={`/univers/${universId}/fiche/${cr.campagneId}`}>{cr.campagneNom}</Link>}
            {campagne && cr.campagneSupprimee && <span className="badge-type">Aventure supprimée</span>}
          </small>}
        </span>
      </div>
      <time className="date" dateTime={cr.creeLe}>{dateCourte(cr.creeLe)}</time>
    </li>
  );
}
