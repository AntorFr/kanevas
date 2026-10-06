import { ChevronDown, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Pastille } from '../../ui';
import '../liste.css';

export type Statut = 'en_preparation' | 'active' | 'terminee';

export interface Campagne {
  id: number;
  universId: number;
  nom: string;
  statut: Statut;
  creeLe: string;
}

export interface Scenario {
  id: number;
  campagneId: number;
  titre: string;
  contenu: string;
  version: number;
}

export type Categorie = 'monstres' | 'pnj' | 'cartes' | 'deroulements' | 'autre';

export interface Tache {
  id: number;
  campagneId: number;
  categorie: Categorie;
  libelle: string;
  faite: boolean;
  faiteLe: string | null;
}

export interface CompteRendu {
  id: number;
  titre: string;
  campagneId: number;
  campagneNom: string;
  auteur: string | null;
  creeLe: string;
}

export interface PageComptesRendus {
  comptesRendus: CompteRendu[];
  suivant: string | null;
}

export const ECHEC = 'L’action n’a pas abouti. Réessayez.';

export const LIBELLE_STATUT: Record<Statut, string> = {
  en_preparation: 'En préparation',
  active: 'Active',
  terminee: 'Terminée',
};

export const STATUTS: Statut[] = ['active', 'en_preparation', 'terminee'];

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

/** Status badge for a player: a word plus a tint. */
export function BadgeStatut({ statut }: { statut: Statut }) {
  const sens = statut === 'active' ? 'table' : statut === 'en_preparation' ? 'mj' : undefined;
  return sens ? <Pastille sens={sens}>{LIBELLE_STATUT[statut]}</Pastille> : <span className="badge-statut">{LIBELLE_STATUT[statut]}</span>;
}

/** Status list of a GM; the change is made in place by the parent. */
export function ListeStatut({
  statut,
  nom,
  desactive,
  onChange,
}: {
  statut: Statut;
  nom: string;
  desactive: boolean;
  onChange: (s: Statut) => void;
}) {
  return (
    <span className="champ-liste liste-statut-champ">
      <select
        className="liste-statut"
        aria-label={`Statut de ${nom}`}
        value={statut}
        disabled={desactive}
        onChange={(e) => onChange(e.target.value as Statut)}
      >
        {STATUTS.map((s) => (
          <option key={s} value={s}>
            {LIBELLE_STATUT[s]}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** One report of a list (E-6, E-13): title, author when there is one, date, link to E-9. */
export function LigneCompteRendu({ universId, cr, campagne }: { universId: string; cr: CompteRendu; campagne?: boolean }) {
  return (
    <li className="ligne-suivi">
      <Link className="grand" to={`/univers/${universId}/fiche/${cr.id}`}>
        <span className="mono" aria-hidden="true">
          <FileText size={14} strokeWidth={1.75} />
        </span>
        <span className="texte-ligne">
          <span className="titre-long">{cr.titre}</span>
          {campagne && <small> — {cr.campagneNom}</small>}
          {cr.auteur !== null && <small> {cr.auteur}</small>}
        </span>
      </Link>
      <span className="date">{dateCourte(cr.creeLe)}</span>
    </li>
  );
}
