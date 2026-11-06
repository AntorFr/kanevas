import { z } from 'zod';
import type { Db } from '../../db/db.js';
import type { CibleCatalogue, DeclarationCatalogue, LigneCatalogue, StockageCatalogue } from '../../outils/declaration.js';
import { texteMasse } from '../../outils/swn/regles/masse.js';
import { ErreurService, introuvable } from '../erreurs.js';

// The catalogue of the ship designer (V-1, V-10): the seven natures, one declared list of columns per nature, from which the
// zod schemas AND the statements of the adapter are built — written once, never seven copies. The only SQL on `swn_catalogue_*`.

type Champ =
  | { nom: string; type: 'entier'; min: number; max?: number }
  | { nom: string; type: 'masse' }
  | { nom: string; type: 'oui-non' }
  | { nom: string; type: 'texte' }
  | { nom: string; type: 'choix' };
const entier = (nom: string, min = 0, max?: number): Champ => ({ nom, type: 'entier', min, ...(max === undefined ? {} : { max }) });
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

const CHAMPS: Record<NatureCatalogueVaisseau, Champ[]> = {
  coques: [entier('classe', 1, 4), entier('cout'), entier('pv'), entier('ca'), entier('puissance'), masse(),
    entier('emports'), entier('facteur_cout', 1), entier('facteur_puissance', 1), entier('facteur_masse', 1)],
  moteurs: [entier('niveau', 1, 6), ...ELEMENT],
  amenagements: ELEMENT,
  defenses: ELEMENT,
  armes: [entier('emport'), entier('munitions'), entier('cout_munition'), ...ELEMENT],
  modifications: ELEMENT,
  exemples: [{ nom: 'coque', type: 'texte' }, { nom: 'choix', type: 'choix' }],
};

const cleSchema = z.string().min(1).max(64);
const ligneChoix = z.strictObject({
  nature: z.enum(NATURES_DE_LIGNE), cle: cleSchema, quantite: z.number().int().min(1).max(99),
});
function schemaDe(nature: NatureCatalogueVaisseau): z.ZodObject {
  const forme: Record<string, z.ZodType> = { nom: z.string().min(1).max(200) };
  for (const c of CHAMPS[nature]) {
    forme[c.nom] = c.type === 'masse' ? z.number().min(0).max(1_000_000).multipleOf(0.5)
      : c.type === 'entier' ? (() => {
      const n = z.number().int().min(c.min);
      return c.max === undefined ? n : n.max(c.max);
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
    donnees[c.nom] = c.type === 'oui-non' ? Boolean(v) : c.type === 'choix' ? JSON.parse(v as string) : v;
  }
  return { nature, cle: r.cle, nom: r.nom, donnees, masque: Boolean(r.masque), version: r.version };
}
const colonnes = (nature: NatureCatalogueVaisseau) => CHAMPS[nature].map((c) => c.nom);
const aStocker = (c: Champ, v: unknown) => c.type === 'oui-non' ? Number(v) : c.type === 'choix' ? JSON.stringify(v) : v;

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
    if (avant && avant.nom === donnees.nom && egal(avant.donnees, donnees)) return 'inchange';
    const champs = CHAMPS[n];
    const valeurs = [donnees.nom, ...champs.map((c) => aStocker(c, donnees[c.nom]))];
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

export const catalogueVaisseaux: DeclarationCatalogue = {
  natures: NATURES_VAISSEAU.map((nom) => ({
    nom, libelle: LIBELLES[nom][0], libellePluriel: LIBELLES[nom][1], schema: schemaDe(nom),
    resume: (d: Record<string, unknown>) => resume(nom, d),
  })),
  stockage: stockageVaisseaux,
  /** V-10: a hull and every line of an example must resolve at the level of the import, else the example is refused. */
  verifier(nature, donnees, { existe }) {
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
