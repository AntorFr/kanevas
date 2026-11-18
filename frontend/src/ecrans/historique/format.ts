import { Bot, CircleHelp, Monitor, Plug, Upload, Wrench, type LucideIcon } from 'lucide-react';

/** What `GET /api/univers/:id/historique` sends for one line (services/historique.ts). */
export interface LigneVue {
  id: number;
  creeLe: string;
  ficheId: number | null;
  ficheCle: string;
  ficheTitre: string;
  objet: 'entete' | 'section' | 'relation' | 'fiche';
  objetCle: string | null;
  action: 'creee' | 'modifiee' | 'supprimee';
  compte: { id: number; username: string } | null;
  jeton: { id: number; nom: string } | null;
  origine: string;
  lotId: number | null;
  valeurConservee: boolean;
  restaurable: boolean;
  sectionTitre: string | null;
  champ: string | null;
  /** A relation line: the key of its target. */
  cible: string | null;
}

export interface DetailVue {
  ligne: LigneVue;
  avant: Record<string, unknown> | null;
  courante: Record<string, unknown> | null;
  sections?: { cle: string; titre: string; ordre: number; contenu: string }[];
  version?: number | null;
  empreinte?: string;
}

export const ORIGINES: Record<string, { mot: string; icone: LucideIcon }> = {
  ecran: { mot: 'écran', icone: Monitor },
  assistant: { mot: 'assistant', icone: Bot },
  import: { mot: 'import', icone: Upload },
  mcp: { mot: 'MCP', icone: Plug },
  outil: { mot: 'outil', icone: Wrench },
  inconnu: { mot: 'inconnue', icone: CircleHelp },
};

export const origineDe = (o: string) => ORIGINES[o] ?? ORIGINES.inconnu!;

/** « via Foundry », « assistant », « import · lot 3 »: how the write came, after the account. */
export function viaDe(l: LigneVue): string | undefined {
  if (l.jeton) return `via ${l.jeton.nom}`;
  if (l.origine === 'assistant') return 'assistant';
  if (l.origine === 'import') return l.lotId === null ? 'import' : `import · lot ${l.lotId}`;
  return undefined;
}

const VERBE = {
  section: { creee: 'créée', modifiee: 'réécrite', supprimee: 'supprimée' },
  relation: { creee: 'ajoutée', modifiee: 'modifiée', supprimee: 'retirée' },
} as const;

const CHAMPS: Record<string, string> = {
  titre: 'Titre changé',
  type: 'Type changé',
  parent: 'Fiche déplacée',
  'alias+': 'Alias ajouté',
  'alias-': 'Alias retiré',
  'etiquette+': 'Étiquette ajoutée',
  'etiquette-': 'Étiquette retirée',
};

/** What the line says it changed (docs/ecrans.md, E-24 « What a line says »). */
export function libelleDe(l: LigneVue): string {
  if (l.objet === 'fiche') return l.action === 'supprimee' ? 'Fiche supprimée' : 'Fiche créée';
  if (l.objet === 'section') return `Section « ${l.sectionTitre ?? l.objetCle ?? ''} » ${VERBE.section[l.action]}`;
  if (l.objet === 'relation') {
    const cible = l.cible ? ` vers ${l.cible}` : '';
    return `Relation${cible} ${VERBE.relation[l.action]}`;
  }
  return (l.champ !== null && CHAMPS[l.champ]) || 'En-tête modifié';
}

export const PERIODES = [
  { valeur: '', libelle: 'Toute la période', jours: 0 },
  { valeur: '1', libelle: '24 dernières heures', jours: 1 },
  { valeur: '7', libelle: '7 derniers jours', jours: 7 },
  { valeur: '30', libelle: '30 derniers jours', jours: 30 },
] as const;

export const ACTIONS = [
  { valeur: '', libelle: 'Toutes les actions' },
  { valeur: 'creee', libelle: 'Créations' },
  { valeur: 'modifiee', libelle: 'Modifications' },
  { valeur: 'supprimee', libelle: 'Suppressions' },
] as const;

export interface Filtres {
  fiche: string;
  qui: string;
  action: string;
  periode: string;
}

/** The query of the list for the filters. `qui` is `c:<id>` (an account) or `j:<name>` (a token name). */
export function requete(f: Filtres, maintenant: Date, apres?: string): string {
  const q = new URLSearchParams();
  if (f.fiche) q.set('fiche', f.fiche);
  if (f.qui.startsWith('c:')) q.set('compte', f.qui.slice(2));
  if (f.qui.startsWith('j:')) q.set('jeton', f.qui.slice(2));
  if (f.action) q.set('action', f.action);
  const jours = PERIODES.find((p) => p.valeur === f.periode)?.jours ?? 0;
  if (jours > 0) q.set('depuis', new Date(maintenant.getTime() - jours * 86_400_000).toISOString());
  if (apres) q.set('apres', apres);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const dateLisible = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A section as plain source text: its name, then its Markdown as written. */
export const texteSection = (s: { titre: string; contenu: string }) => `${s.titre}\n\n${s.contenu}`;

const liste = (v: unknown) => (Array.isArray(v) && v.length > 0 ? v.join(', ') : '—');
const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** A header as plain text, one field a line. */
export function texteEntete(e: Record<string, unknown>): string {
  return [
    `Titre : ${val(e.titre)}`,
    `Type : ${val(e.type)}`,
    `Sous-type : ${val(e.sousType)}`,
    `Fiche parente (n°) : ${val(e.parentId)}`,
    `Alias : ${liste(e.alias)}`,
    `Étiquettes : ${liste(e.etiquettes)}`,
  ].join('\n');
}

/** A relation's previous value, as the trigger keeps it. */
export function texteRelation(r: Record<string, unknown>): string {
  return [`Cible : ${val(r.cible_cle ?? r.cible_fiche_id)}`, `Nature : ${val(r.nature)}`, `Qualificatif : ${val(r.qualificatif)}`].join('\n');
}

export const PERIME = 'La fiche a changé depuis l’affichage.';
export const CLE_PRISE = 'Une autre section porte maintenant cette clé.';
export const EXPIRE = 'La valeur précédente n’est plus conservée.';
export const NON_CONSERVEE = 'Valeur précédente non conservée (plus de 30 jours).';

/** The words of a refused restoration (B-103). */
export function refusDe(code: string | undefined, message: string): string {
  if (code === 'historique_perime') return PERIME;
  if (code === 'cle_prise') return CLE_PRISE;
  if (code === 'valeur_expiree') return EXPIRE;
  return message;
}
