import { ErreurApi } from '../../../api';

/** The six colour names of the server, each projected on a token by `galaxie.css`. */
export const COULEURS = [
  { nom: 'accent', libelle: 'Accent' }, { nom: 'table', libelle: 'Table' }, { nom: 'ambre', libelle: 'Ambre' },
  { nom: 'danger', libelle: 'Danger' }, { nom: 'neutre', libelle: 'Neutre' }, { nom: 'clair', libelle: 'Clair' },
] as const;

export const TAILLES_NOMS = [{ nom: 'petite', libelle: 'Petite' }, { nom: 'moyenne', libelle: 'Moyenne' }, { nom: 'grande', libelle: 'Grande' }] as const;
export const tailleNom = (n: number): string => (n === 1 ? 'petite' : n === 3 ? 'grande' : 'moyenne');

/** A negative coordinate with the typographic minus: « Hexagone (4, −2) ». */
export const entierAffiche = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

export const ECHEC_ECRITURE = 'L’enregistrement a échoué. Réessayez.';
export const CONFLIT: Record<string, string> = {
  systeme: 'Ce système a changé depuis que vous l’avez ouvert.',
  route: 'Cette route a changé depuis que vous l’avez ouverte.',
  zone: 'Cette zone a changé depuis que vous l’avez ouverte.',
  galaxie: 'Cette galaxie a changé depuis que vous l’avez ouverte.',
};

/** What a refused write is, for a form: the field to blame, or the kind of failure. */
export interface Echec {
  sorte: 'champ' | 'conflit' | 'refus' | 'introuvable' | 'perdu' | 'autre';
  champ?: string;
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

export function lireEchec(e: unknown): Echec {
  if (!(e instanceof ErreurApi)) return { sorte: 'autre', message: ECHEC_ECRITURE };
  const champ = typeof e.details?.champ === 'string' ? e.details.champ : undefined;
  if (e.statut === 0) return { sorte: 'perdu', message: 'Connexion perdue.' };
  if (e.statut === 404) return { sorte: 'introuvable', message: e.message };
  if (e.statut === 403) return { sorte: 'refus', code: e.code, message: 'Action refusée.' };
  if (e.statut === 409 && e.code === 'donnee_modifiee') return { sorte: 'conflit', code: e.code, message: e.message, details: e.details };
  if (e.statut === 409) return { sorte: 'champ', code: e.code, message: e.message, details: e.details };
  if (e.statut === 400 || e.statut === 413) return { sorte: 'champ', champ, code: e.code, message: e.message, details: e.details };
  return { sorte: 'autre', message: ECHEC_ECRITURE };
}

/** Name checks of the forms, with the words of `docs/ecrans.md`. */
export function erreurNom(nom: string): string | undefined {
  const n = nom.trim();
  if (n === '') return 'le nom est obligatoire.';
  if ([...n].length > 80) return '80 caractères au plus.';
  return undefined;
}

/** The seed of the stub used older colour names; they map onto the six of the server. */
const ANCIENNES: Record<string, string> = { bleu: 'accent', vert: 'table', rouge: 'danger' };
export const couleurServeur = (c: string): string => (COULEURS.some((x) => x.nom === c) ? c : ANCIENNES[c] ?? 'accent');
