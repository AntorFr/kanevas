import { z } from 'zod';
import type { Db } from '../../db/db.js';
import type { CibleCatalogue, DeclarationCatalogue, LigneCatalogue, StockageCatalogue } from '../../outils/declaration.js';
import { EFFETS, PARAMETRES_EFFET, SENS_ECHANGE, estEffet, type ParametreEffet } from '../../outils/swn/regles/effets.js';
import { texteMasse } from '../../outils/swn/regles/masse.js';
import { ErreurService, introuvable } from '../erreurs.js';

// The catalogue of the ship designer (V-1, V-10): the seven natures, one declared list of columns per nature, from which the
// zod schemas AND the statements of the adapter are built — written once, never seven copies. The only SQL on `swn_catalogue_*`.

type Champ =
  | { nom: string; type: 'entier'; min: number; max?: number; defaut?: number; facultatif?: true }
  | { nom: string; type: 'texte-libre'; max: number; facultatif: true }
  | { nom: string; type: 'masse' }
  | { nom: string; type: 'reel'; min: number; max: number; facultatif: true }
  | { nom: string; type: 'code'; facultatif: true }
  | { nom: string; type: 'liste4'; facultatif: true }
  | { nom: string; type: 'oui-non' }
  | { nom: string; type: 'texte' }
  | { nom: string; type: 'choix' };
const entier = (nom: string, min = 0, max?: number, defaut?: number): Champ =>
  ({ nom, type: 'entier', min, ...(max === undefined ? {} : { max }), ...(defaut === undefined ? {} : { defaut }) });
/** F-1: an optional integer (`NULL` = not stated, omitted from the row's data). */
const facultatif = (nom: string, min: number, max: number): Champ => ({ nom, type: 'entier', min, max, facultatif: true });
/** F-1: an optional free text of 1 to `max` characters, stored trimmed and never read as Markdown. */
const texteLibre = (nom: string, max: number): Champ => ({ nom, type: 'texte-libre', max, facultatif: true });
/** X-1: an optional half-multiple (stored as a number). */
const reel = (nom: string, min: number, max: number): Champ => ({ nom, type: 'reel', min, max, facultatif: true });
/** X-1: an optional text (effect code, direction) checked against a closed list by the import; the CHECK of the column repeats it. */
const code = (nom: string): Champ => ({ nom, type: 'code', facultatif: true });
/** X-1: four optional numbers, one per hull class, checked by the import and stored as JSON text. */
const liste4 = (nom: string): Champ => ({ nom, type: 'liste4', facultatif: true });
const masse = (): Champ => ({ nom: 'masse', type: 'masse' });
const ouiNon = (nom: string): Champ => ({ nom, type: 'oui-non' });

/** Element fields, shared by engines, fittings, defences, weapons and modifications. */
const ELEMENT: Champ[] = [
  entier('cout'), entier('puissance'), masse(), entier('pv'), entier('ca'),
  ouiNon('x_cout'), ouiNon('x_puissance'), ouiNon('x_masse'), entier('limite'),
];
export const NATURES_VAISSEAU = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples'] as const;
export type NatureCatalogueVaisseau = (typeof NATURES_VAISSEAU)[number];
/** The natures a design line may name (an example's `choix`). */
export const NATURES_DE_LIGNE = ['moteurs', 'amenagements', 'defenses', 'armes', 'modifications'] as const;

/** Optional fields shared by engines, fittings and defences (F-1). */
const PLAGE_CLASSES: Champ[] = [facultatif('classe_min', 1, 4), facultatif('classe_max', 1, 4), texteLibre('condition', 200)];

const CHAMPS: Record<NatureCatalogueVaisseau, Champ[]> = {
  coques: [entier('classe', 1, 4), entier('cout'), entier('pv'), entier('ca'), entier('puissance'), masse(),
    entier('emports'), entier('facteur_cout', 1), entier('facteur_puissance', 1), entier('facteur_masse', 1),
    facultatif('vitesse', 0, 99), facultatif('armure', 0, 99), facultatif('equipage_min', 0, 100_000), facultatif('equipage_max', 0, 100_000)],
  moteurs: [entier('niveau', 1, 6), ...ELEMENT, ...PLAGE_CLASSES],
  amenagements: [...ELEMENT, ...PLAGE_CLASSES, code('effet'), liste4('rend_puissance'), liste4('rend_masse'), facultatif('soute', 0, 1_000_000)],
  defenses: [...ELEMENT, ...PLAGE_CLASSES, facultatif('bonus_vitesse', 0, 9)],
  armes: [entier('emport'), entier('munitions'), entier('cout_munition'), entier('classe_min', 1, 4, 1), ...ELEMENT,
    texteLibre('degats', 40), facultatif('perforation', 0, 99), texteLibre('qualites', 120), facultatif('niveau_tech', 0, 9)],
  modifications: [...ELEMENT, facultatif('cout_pct', 1, 1000), code('effet'), facultatif('valeur', -9, 20), facultatif('points_max', 1, 99),
    code('sens'), facultatif('echange_puissance', 1, 99), reel('echange_masse', 0.5, 99)],
  exemples: [{ nom: 'coque', type: 'texte' }, { nom: 'choix', type: 'choix' }, facultatif('equipage', 0, 100_000)],
};

const cleSchema = z.string().min(1).max(64);
const ligneChoix = z.strictObject({
  nature: z.enum(NATURES_DE_LIGNE), cle: cleSchema, quantite: z.number().int().min(1).max(99),
  magasins: z.number().int().min(1).max(9).optional(),
}).refine((l) => l.magasins === undefined || l.nature === 'armes', { message: 'magasins : armes seulement' });
function schemaDe(nature: NatureCatalogueVaisseau): z.ZodObject {
  const forme: Record<string, z.ZodType> = { nom: z.string().min(1).max(200) };
  for (const c of CHAMPS[nature]) {
    if (c.type === 'code') { forme[c.nom] = z.string().optional(); continue; }
    if (c.type === 'liste4') { forme[c.nom] = z.unknown().optional(); continue; }
    if (c.type === 'reel') { forme[c.nom] = z.number().min(c.min).max(c.max).multipleOf(0.5).optional(); continue; }
    if (c.type === 'texte-libre') { forme[c.nom] = z.string().trim().min(1).max(c.max).optional(); continue; }
    forme[c.nom] = c.type === 'masse' ? z.number().min(0).max(1_000_000).multipleOf(0.5)
      : c.type === 'entier' ? (() => {
      const n = z.number().int().min(c.min);
      const bornee = c.max === undefined ? n : n.max(c.max);
      return c.facultatif ? bornee.optional() : c.defaut === undefined ? bornee : bornee.default(c.defaut);
    })()
      : c.type === 'oui-non' ? z.boolean()
      : c.type === 'texte' ? cleSchema
      : z.array(ligneChoix).max(100);
  }
  return z.strictObject(forme);
}

const table = (nature: string): string => {
  if (!(NATURES_VAISSEAU as readonly string[]).includes(nature)) throw introuvable();
  return `swn_catalogue_${nature}`;
};
const proprietaire = (c: CibleCatalogue) => 'systemeId' in c
  ? { niveau: 'systeme', colonne: 'systeme_id', id: c.systemeId }
  : { niveau: 'univers', colonne: 'univers_id', id: c.universId };

type Ligne = Record<string, unknown> & { cle: string; nom: string; masque: number; version: number };
function ligne(nature: NatureCatalogueVaisseau, r: Ligne): LigneCatalogue {
  const donnees: Record<string, unknown> = { nom: r.nom };
  for (const c of CHAMPS[nature]) {
    const v = r[c.nom];
    if ('facultatif' in c && c.facultatif && v === null) continue;
    donnees[c.nom] = c.type === 'oui-non' ? Boolean(v) : c.type === 'choix' || c.type === 'liste4' ? JSON.parse(v as string) : v;
  }
  return { nature, cle: r.cle, nom: r.nom, donnees, masque: Boolean(r.masque), version: r.version };
}
const colonnes = (nature: NatureCatalogueVaisseau) => CHAMPS[nature].map((c) => c.nom);
const aStocker = (c: Champ, v: unknown) => c.type === 'oui-non' ? Number(v) : c.type === 'choix' || (c.type === 'liste4' && v !== null) ? JSON.stringify(v) : v;

function lire(db: Db, cible: CibleCatalogue, nature: NatureCatalogueVaisseau, cle: string): LigneCatalogue | null {
  const o = proprietaire(cible);
  const r = db.prepare(`SELECT * FROM ${table(nature)} WHERE proprietaire = ? AND ${o.colonne} = ? AND cle = ?`)
    .get(o.niveau, o.id, cle) as Ligne | undefined;
  return r ? ligne(nature, r) : null;
}
const naturesDe = (nature?: string): NatureCatalogueVaisseau[] => {
  if (nature === undefined) return [...NATURES_VAISSEAU];
  table(nature);
  return [nature as NatureCatalogueVaisseau];
};
const egal = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => JSON.stringify(v) === JSON.stringify(b[k]));

export const stockageVaisseaux: StockageCatalogue = {
  lister(db, cible, nature, page) {
    const o = proprietaire(cible);
    let rows = naturesDe(nature).flatMap((n) =>
      (db.prepare(`SELECT * FROM ${table(n)} WHERE proprietaire = ? AND ${o.colonne} = ?`).all(o.niveau, o.id) as Ligne[])
        .map((r) => ligne(n, r)));
    rows.sort((a, b) => a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : a.nature.localeCompare(b.nature));
    if (page?.curseur) {
      const i = rows.findIndex((r) => r.cle === page.curseur);
      rows = i < 0 ? [] : rows.slice(i + 1);
    }
    return page?.limite === undefined ? rows : rows.slice(0, page.limite);
  },
  lirePar(db, cible, nature, cle) {
    table(nature);
    return lire(db, cible, nature as NatureCatalogueVaisseau, cle);
  },
  ecrire(db, cible, nature, { cle, donnees, versionCatalogue }) {
    table(nature);
    const n = nature as NatureCatalogueVaisseau;
    const o = proprietaire(cible);
    const avant = lire(db, cible, n, cle);
    const complet = { ...donnees };
    for (const c of CHAMPS[n]) if (c.type === 'entier' && c.defaut !== undefined) complet[c.nom] ??= c.defaut;
    if (avant && avant.nom === donnees.nom && egal(avant.donnees, complet)) return 'inchange';
    const champs = CHAMPS[n];
    const valeurs = [donnees.nom, ...champs.map((c) => aStocker(c, donnees[c.nom] ?? (c.type === 'entier' ? c.defaut : undefined) ?? null))];
    if (avant) {
      db.prepare(`UPDATE ${table(n)} SET nom = ?, ${colonnes(n).map((c) => `${c} = ?`).join(', ')},
        version_catalogue = ?, version = version + 1 WHERE proprietaire = ? AND ${o.colonne} = ? AND cle = ?`)
        .run(...valeurs, versionCatalogue, o.niveau, o.id, cle);
      return 'modifie';
    }
    db.prepare(`INSERT INTO ${table(n)} (proprietaire, systeme_id, univers_id, cle, nom, ${colonnes(n).join(', ')}, version_catalogue)
      VALUES (?, ?, ?, ?, ?, ${colonnes(n).map(() => '?').join(', ')}, ?)`)
      .run(o.niveau, 'systemeId' in cible ? cible.systemeId : null, 'universId' in cible ? cible.universId : null,
        cle, ...valeurs, versionCatalogue);
    return 'cree';
  },
  poserMasque(db, universId, nature, cle, masque, versionLue) {
    table(nature);
    const changes = db.prepare(`UPDATE ${table(nature)} SET masque = ?, version = version + 1
      WHERE proprietaire = 'univers' AND univers_id = ? AND cle = ? AND version = ?`)
      .run(Number(masque), universId, cle, versionLue).changes;
    if (!changes) {
      if (!lire(db, { universId }, nature as NatureCatalogueVaisseau, cle)) throw introuvable();
      throw new ErreurService('conflit', "Cet élément a changé depuis que vous l'avez ouvert.", 'donnee_modifiee');
    }
    return lire(db, { universId }, nature as NatureCatalogueVaisseau, cle)!;
  },
  retraits(db, universId) {
    return db.prepare('SELECT nature, cle FROM swn_catalogue_retraits WHERE univers_id = ?')
      .all(universId) as { nature: string; cle: string }[];
  },
  poserRetrait(db, universId, nature, cle, retire) {
    table(nature);
    if (retire) {
      db.prepare('INSERT INTO swn_catalogue_retraits (univers_id, nature, cle) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
        .run(universId, nature, cle);
    } else db.prepare('DELETE FROM swn_catalogue_retraits WHERE univers_id = ? AND nature = ? AND cle = ?')
      .run(universId, nature, cle);
  },
  compter(db, cible) {
    const o = proprietaire(cible);
    const lignes: { nature: string; nombre: number }[] = NATURES_VAISSEAU.map((nature) => ({ nature, nombre: (db.prepare(
      `SELECT COUNT(*) AS n FROM ${table(nature)} WHERE proprietaire = ? AND ${o.colonne} = ?`).get(o.niveau, o.id) as { n: number }).n }));
    if ('universId' in cible) {
      lignes.push({ nature: 'retraits', nombre: (db.prepare('SELECT COUNT(*) AS n FROM swn_catalogue_retraits WHERE univers_id = ?')
        .get(cible.universId) as { n: number }).n });
    }
    return lignes;
  },
  effacer(db, cible) {
    const o = proprietaire(cible);
    for (const nature of NATURES_VAISSEAU) db.prepare(`DELETE FROM ${table(nature)} WHERE proprietaire = ? AND ${o.colonne} = ?`).run(o.niveau, o.id);
    if ('universId' in cible) db.prepare('DELETE FROM swn_catalogue_retraits WHERE univers_id = ?').run(cible.universId);
  },
};

const LIBELLES: Record<NatureCatalogueVaisseau, [string, string]> = {
  coques: ['Coque', 'Coques'], moteurs: ['Moteur', 'Moteurs'], amenagements: ['Aménagement', 'Aménagements'],
  defenses: ['Défense', 'Défenses'], armes: ['Arme', 'Armes'], modifications: ['Modification', 'Modifications'],
  exemples: ['Exemple', 'Exemples'],
};
const n = (v: unknown) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function resume(nature: NatureCatalogueVaisseau, d: Record<string, unknown>): string {
  if (nature === 'exemples') return `${d.coque} · ${(d.choix as unknown[]).length} lignes`;
  return `${nature === 'coques' ? `classe ${d.classe} · ` : ''}coût ${n(d.cout)} · puissance ${d.puissance} · masse ${texteMasse(d.masse as number)}`;
}

type Refus = { champ: string; raison: string } | null;
const quatre = (v: unknown, masse: boolean): boolean => Array.isArray(v) && v.length === 4
  && v.every((x) => typeof x === 'number' && x >= 0 && x <= 1_000_000 && (masse ? x % 0.5 === 0 : Number.isInteger(x)));
/** X-1: the rules between the fields of a modification or a fitting — the effect, its parameters (required with it, refused without it), `limite` 1. */
function verifierEffet(nature: 'modifications' | 'amenagements', d: Record<string, unknown>): Refus {
  const effet = d.effet;
  const parametres = nature === 'modifications' ? PARAMETRES_EFFET.filter((p) => !p.startsWith('rend_')) : PARAMETRES_EFFET.filter((p) => p.startsWith('rend_'));
  if (effet === undefined) {
    const p = parametres.find((x) => d[x] !== undefined);
    return p ? { champ: p, raison: "paramètre sans effet" } : null;
  }
  if (!estEffet(effet) || EFFETS[effet].nature !== nature) return { champ: 'effet', raison: `effet inconnu : ${String(effet)}` };
  const decl = EFFETS[effet];
  for (const p of parametres) {
    const propre = (decl.parametres as readonly ParametreEffet[]).includes(p);
    if (!propre && d[p] !== undefined) return { champ: p, raison: `paramètre étranger à l'effet ${effet}` };
    if (propre && d[p] === undefined) return { champ: p, raison: `paramètre requis par l'effet ${effet}` };
  }
  const v = d.valeur;
  if (typeof v === 'number') {
    if (effet === 'reparation_min' ? v < 1 || v > 20 : v === 0 || v < -9 || v > 9) {
      return { champ: 'valeur', raison: effet === 'reparation_min' ? 'de 1 à 20 attendu' : 'de -9 à 9, hors 0, attendu' };
    }
  }
  if (d.sens !== undefined && !(SENS_ECHANGE as readonly string[]).includes(d.sens as string)) {
    return { champ: 'sens', raison: `valeur attendue : ${SENS_ECHANGE.join(', ')}` };
  }
  if (d.rend_puissance !== undefined && !quatre(d.rend_puissance, false)) return { champ: 'rend_puissance', raison: 'quatre entiers positifs attendus' };
  if (d.rend_masse !== undefined && !quatre(d.rend_masse, true)) return { champ: 'rend_masse', raison: 'quatre masses (multiples de 0,5) attendues' };
  if (decl.limiteUne && d.limite !== 1) return { champ: 'limite', raison: 'limite 1 attendue' };
  return null;
}

export const catalogueVaisseaux: DeclarationCatalogue = {
  natures: NATURES_VAISSEAU.map((nom) => ({
    nom, libelle: LIBELLES[nom][0], libellePluriel: LIBELLES[nom][1], schema: schemaDe(nom),
    resume: (d: Record<string, unknown>) => resume(nom, d),
  })),
  stockage: stockageVaisseaux,
  /** V-10: a hull and every line of an example must resolve at the level of the import, else the example is refused. */
  verifier(nature, donnees, { existe }) {
    const bornes = (min: string, max: string, champ: string) => {
      const a = donnees[min], b = donnees[max];
      return typeof a === 'number' && typeof b === 'number' && a > b ? { champ, raison: `${min} au plus égal à ${max}` } : null;
    };
    if (nature === 'coques') return bornes('equipage_min', 'equipage_max', 'equipage_max');
    if (nature === 'moteurs' || nature === 'defenses') return bornes('classe_min', 'classe_max', 'classe_max');
    if (nature === 'amenagements') return bornes('classe_min', 'classe_max', 'classe_max') ?? verifierEffet(nature, donnees);
    if (nature === 'modifications' || nature === 'amenagements') return verifierEffet(nature, donnees);
    if (nature !== 'exemples') return null;
    if (!existe('coques', donnees.coque as string)) {
      return { champ: 'coque', raison: `élément inconnu : coques/${donnees.coque as string}` };
    }
    for (const l of donnees.choix as { nature: string; cle: string }[]) {
      if (!existe(l.nature, l.cle)) return { champ: 'choix', raison: `élément inconnu : ${l.nature}/${l.cle}` };
    }
    return null;
  },
};
