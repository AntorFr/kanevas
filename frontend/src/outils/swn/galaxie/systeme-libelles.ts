// Wording of E-23's text list (AD-systeme-5): pure, so that the screen only lays rows out.
import type { AstreSysteme, FormationSysteme } from './types';

const FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
/** A number to two decimals at most, French comma: `2,03`. */
export const nombre = (n: number): string => FORMAT.format(n);

const ETOILES: Record<string, string> = {
  blanche: 'blanche', jaune: 'jaune', orange: 'orange', geante_bleue: 'géante bleue', geante_rouge: 'géante rouge',
  naine_blanche: 'naine blanche', naine_rouge: 'naine rouge',
};
const CORPS: Record<string, string> = {
  rocheux: 'Rocheux', tellurique: 'Tellurique', gazeuse: 'Gazeuse', glace: 'Glace', lave: 'Lave', verrouillee: 'Verrouillée',
  anomalie: 'Anomalie', comete: 'Comète',
};
const brut = (t: string) => { const s = t.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

/** « Étoile jaune », « Compagne · Étoile naine rouge », « Lune · Rocheux », « Tellurique », « Comète », « Anomalie ». */
export function typeAstre(a: AstreSysteme): string {
  if (a.genre === 'etoile') {
    const base = `Étoile ${ETOILES[a.type] ?? a.type.replace(/_/g, ' ')}`;
    return a.etoile_rang > 0 ? `Compagne · ${base}` : base;
  }
  const t = CORPS[a.type] ?? brut(a.type);
  return a.genre === 'lune' ? `Lune · ${t}` : t;
}

export const nomAstre = (a: AstreSysteme): string => (a.nom !== null && a.nom !== '' ? a.nom : 'Astre sans nom');
export const nomFormation = (f: FormationSysteme): string => (f.nom !== null && f.nom !== '' ? f.nom : 'Zone sans nom');
export const typeFormation = (f: FormationSysteme): string => (f.forme === 'anneau' ? 'Anneau' : 'Nuage');

/** « Orbite 4 · 7 h ». A moon with no orbit of its own has only its hour. */
export function placeAstre(a: AstreSysteme): string {
  return a.orbite === null ? `Autour de sa planète · ${nombre(a.heure)} h` : `Orbite ${nombre(a.orbite)} · ${nombre(a.heure)} h`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** A ring « Orbite 2,9 à 3,3 »; a cloud « Orbite 5,2 · 4 h ». */
export function placeFormation(f: FormationSysteme): string {
  const p = f.parametres;
  if (f.forme === 'anneau') {
    const de = num(p.de), a = num(p.a);
    return de !== null && a !== null ? `Orbite ${nombre(de)} à ${nombre(a)}` : 'Orbite';
  }
  const o = num(p.orbite), h = num(p.heure);
  return o === null ? 'Orbite' : h === null ? `Orbite ${nombre(o)}` : `Orbite ${nombre(o)} · ${nombre(h)} h`;
}
