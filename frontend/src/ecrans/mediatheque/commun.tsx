import { File as FichierIcone, FileArchive, FileSpreadsheet, FileText, ImageOff, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  total: number;
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

/** Thumbnail of an image (lazy, `cover`) or the tile of a document; the file is only what the server sent. */
export function Apercu({ universId, f, grand }: { universId: string; f: Fichier; grand?: boolean }) {
  const [casse, setCasse] = useState(false);
  useEffect(() => setCasse(false), [f.id, f.jeton]);
  if (f.image && !casse) {
    return (
      <img
        className={grand ? 'med-grand' : 'med-vignette'}
        src={octets(universId, f)}
        alt={grand ? f.nom : ''}
        loading={grand ? undefined : 'lazy'}
        onError={() => setCasse(true)}
      />
    );
  }
  if (f.image) {
    return (
      <span className={grand ? 'med-grand med-doc' : 'med-vignette med-doc'}>
        <ImageOff size={grand ? 40 : 28} strokeWidth={1.75} aria-hidden="true" />
        <span>Image indisponible.</span>
      </span>
    );
  }
  const Icone = iconeDe(f);
  return (
    <span className={grand ? 'med-grand med-doc' : 'med-vignette med-doc'}>
      <span className="med-feuille">
        <Icone size={grand ? 42 : 30} strokeWidth={1.5} aria-hidden="true" />
      </span>
      {!grand && (
        <span className="med-pied-doc">
          {extension(f.nom) !== '' ? <b className="med-ext">{extension(f.nom)}</b> : <span />}
          <span className="med-poids">{tailleLisible(f.taille)}</span>
        </span>
      )}
    </span>
  );
}

