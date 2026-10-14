import { File as FichierIcone, FileArchive, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';

/** A file as `GET /fichiers` renders it (the server already applied every right). */
export interface Fichier {
  id: number;
  nom: string;
  type: string;
  taille: number;
  image: boolean;
  visibilite: 'joueurs' | 'mj';
  ajoutePar: number;
  ajouteLe: string;
  jeton: string;
}

export interface PageFichiers {
  fichiers: Fichier[];
  suite: number | string | null;
}

export interface Usage {
  ficheId: number;
  ficheTitre: string;
  illustration: boolean;
  sectionTitre: string | null;
  dansTexte: boolean;
  joint: boolean;
  libelle: string;
}

export interface Detail {
  fichier: Fichier & { ajouteParNom: string; cleOrigine?: string };
  usages: Usage[];
  restantes: number;
}

export const octets = (universId: string | number, f: Pick<Fichier, 'id' | 'jeton'>) =>
  `/api/univers/${universId}/fichiers/${f.id}?v=${encodeURIComponent(f.jeton)}`;

/** « 2,4 Mo »: binary units, one decimal, French comma. */
export function tailleLisible(n: number): string {
  const un = (v: number) => v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${un(n / 1024)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${un(n / 1024 / 1024)} Mo`;
  return `${un(n / 1024 / 1024 / 1024)} Go`;
}

export function extension(nom: string): string {
  const i = nom.lastIndexOf('.');
  return i > 0 && i < nom.length - 1 ? nom.slice(i + 1).toUpperCase().slice(0, 5) : '';
}

const TABLEURS = ['XLS', 'XLSX', 'ODS', 'CSV'];
const ARCHIVES = ['ZIP', '7Z', 'TAR', 'GZ', 'RAR', 'TGZ'];

export function iconeDe(f: Pick<Fichier, 'nom' | 'type'>): LucideIcon {
  const e = extension(f.nom);
  if (f.type === 'application/pdf' || e === 'PDF') return FileText;
  if (TABLEURS.includes(e)) return FileSpreadsheet;
  if (ARCHIVES.includes(e)) return FileArchive;
  return FichierIcone;
}

/** « Document PDF », « Tableur XLSX », « Archive ZIP », « Image PNG »: the nature and the extension. */
export function typeLisible(f: Pick<Fichier, 'nom' | 'type' | 'image'>): string {
  const e = extension(f.nom);
  const nature = f.image ? 'Image' : TABLEURS.includes(e) ? 'Tableur' : ARCHIVES.includes(e) ? 'Archive' : 'Document';
  return e ? `${nature} ${e}` : nature;
}
