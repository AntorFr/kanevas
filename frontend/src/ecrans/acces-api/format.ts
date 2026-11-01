/** Pure wording of E-18 (docs/ecrans.md): dates, counters of a batch, state of a token. */

export type Issue = 'creees' | 'mises_a_jour' | 'inchangees' | 'refusees' | 'supprimees';
export type Nature = 'fiches' | 'fichiers' | 'campagnes' | 'scenarios' | 'relations';
/** `supprimees` exists on the `fiches` nature only (AD-119 (4)); absent elsewhere and in older batches. */
export type Compteurs = Record<string, Partial<Record<Issue, number>>>;

export interface OutilVue { cle: string; libelle: string }
export interface OutilProposable extends OutilVue {
  module: string;
  libelleModule: string;
  type: 'carte' | 'generateur' | 'aide';
}

export interface JetonVue {
  id: number;
  nom: string;
  createur: string;
  creeLe: string;
  expireLe: string;
  revoqueLe: string | null;
  dernierUsageLe: string | null;
  /** False when the creator is no longer a GM of the universe (B-46). */
  actif: boolean;
  outils: OutilVue[];
}

export interface EntreeRapport {
  cle: string;
  objet: string;
  raison: string;
  gravite: 'refus' | 'avertissement';
}

export interface LotVue {
  lotId: number;
  jeton: string;
  ouvertLe: string;
  etat: 'en_cours' | 'clos' | 'abandonne';
  compteurs: Compteurs;
  avertissements: number;
  enAttente: number;
  refus: EntreeRapport[];
  alertes: EntreeRapport[];
  refusAutres: number;
  alertesAutres: number;
  outil?: OutilVue;
  natures?: { nom: string; libelle: string }[];
}

const nombre = (n: number) => n.toLocaleString('fr-FR');

/** « 11 oct. 2026 ». */
export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** « 11 oct. 2026, 15:52 ». */
export function dateHeure(iso: string): string {
  const d = new Date(iso);
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateCourte(iso)}, ${h}`;
}

/** « dernier usage il y a 3 min » for a recent use, « le 3 oct. 2026 » past a day, « jamais utilisé ». */
export function dernierUsage(iso: string | null, maintenant: number): string {
  if (!iso) return 'jamais utilisé';
  const min = Math.max(0, Math.floor((maintenant - Date.parse(iso)) / 60000));
  if (min < 1) return 'dernier usage à l’instant';
  if (min < 60) return `dernier usage il y a ${min} min`;
  if (min < 24 * 60) return `dernier usage il y a ${Math.floor(min / 60)} h`;
  return `dernier usage le ${dateCourte(iso)}`;
}

export type EtatJeton = 'actif' | 'inactif' | 'revoque' | 'expire';

/** Revoked first, then expired; a live token whose creator lost the role is « inactif » (still listed, revocable). */
export function etatJeton(j: JetonVue, maintenant: number): EtatJeton {
  if (j.revoqueLe) return 'revoque';
  if (Date.parse(j.expireLe) <= maintenant) return 'expire';
  return j.actif ? 'actif' : 'inactif';
}

const NATURES: { cle: Nature; libelle: string; feminin: boolean }[] = [
  { cle: 'fiches', libelle: 'Fiches', feminin: true },
  { cle: 'fichiers', libelle: 'Fichiers', feminin: false },
  { cle: 'campagnes', libelle: 'Campagnes', feminin: true },
  { cle: 'scenarios', libelle: 'Scénarios', feminin: false },
  { cle: 'relations', libelle: 'Relations', feminin: true },
];

function forme(issue: Issue, n: number, feminin: boolean): string {
  const e = feminin ? 'e' : '';
  const s = n > 1 ? 's' : '';
  switch (issue) {
    case 'creees':
      return `créé${e}${s}`;
    case 'mises_a_jour':
      return feminin ? `mise${s} à jour` : 'mis à jour';
    case 'inchangees':
      return `inchangé${e}${s}`;
    case 'refusees':
      return `refusé${e}${s}`;
    case 'supprimees':
      return `supprimé${e}${s}`;
  }
}

/** « Fiches : 498 créées · 3 refusées » per nature with something in it; null natures omitted. */
export function ligneNature(c: Compteurs, nature: Nature): string | null {
  const def = NATURES.find((n) => n.cle === nature)!;
  const compteurs = c[nature] ?? {};
  const parts = (['creees', 'mises_a_jour', 'inchangees', 'refusees', 'supprimees'] as Issue[])
    .filter((i) => (compteurs[i] ?? 0) > 0)
    .map((i) => `${nombre(compteurs[i]!)} ${forme(i, compteurs[i]!, def.feminin)}`);
  return parts.length ? `${def.libelle} : ${parts.join(' · ')}` : null;
}

/** Every piece of the counters line of a batch, in order; empty when nothing was written. */
export function morceauxLot(lot: Pick<LotVue, 'compteurs' | 'enAttente' | 'avertissements' | 'outil' | 'natures'>): string[] {
  const out: string[] = [];
  if (lot.outil) {
    for (const nature of lot.natures ?? []) {
      const c = lot.compteurs[nature.nom] ?? {};
      const parts = (['creees', 'mises_a_jour', 'inchangees', 'refusees'] as Issue[])
        .filter((issue) => (c[issue] ?? 0) > 0)
        .map((issue) => `${nombre(c[issue]!)} ${forme(issue, c[issue]!, false)}`);
      if (parts.length) out.push(`${nature.libelle} : ${parts.join(', ')}`);
    }
    return out;
  }
  for (const n of NATURES) {
    const l = ligneNature(lot.compteurs, n.cle);
    if (l) out.push(l);
  }
  if (lot.enAttente > 0) {
    out.push(lot.enAttente === 1 ? '1 lien ou référence en attente' : `${nombre(lot.enAttente)} liens et références en attente`);
  }
  if (lot.avertissements > 0) {
    out.push(lot.avertissements === 1 ? '1 avertissement' : `${nombre(lot.avertissements)} avertissements`);
  }
  return out;
}

export const ETAT_LOT: Record<LotVue['etat'], string> = { en_cours: 'En cours', clos: 'Clos', abandonne: 'Abandonné' };

/** « 3 refusées » / « 2 avertissements » group titles. */
export function titreGroupe(n: number, sorte: 'refus' | 'avertissement'): string {
  if (sorte === 'refus') return `${nombre(n)} ${n > 1 ? 'refusées' : 'refusée'}`;
  return `${nombre(n)} ${n > 1 ? 'avertissements' : 'avertissement'}`;
}
