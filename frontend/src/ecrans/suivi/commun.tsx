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

/** One report of a list (E-13): title, author when there is one, date, link to E-9. */
export function LigneCompteRendu({ universId, cr, campagne }: { universId: string; cr: CompteRendu; campagne?: boolean }) {
  return (
    <li className="ligne-suivi">
      <Link className="grand" to={`/univers/${universId}/fiche/${cr.id}`}>
        <span className="mono" aria-hidden="true">
          <NotebookPen size={14} strokeWidth={1.75} />
        </span>
        <span className="texte-ligne">
          <span className="titre-long">{cr.titre}</span>
          {campagne && cr.campagneNom !== undefined && <small> — {cr.campagneNom}</small>}
          {campagne && cr.campagneSupprimee && <small> — Aventure supprimée</small>}
          {cr.auteur !== null && <small> {cr.auteur}</small>}
        </span>
      </Link>
      <span className="date">{dateCourte(cr.creeLe)}</span>
    </li>
  );
}
