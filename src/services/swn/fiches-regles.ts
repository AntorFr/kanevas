import { createHash } from 'node:crypto';
import type { Db } from '../../db/db.js';
import type { ContexteSection, EcritSection } from '../../outils/declaration.js';
import { texteExemples, texteRegles, type CoqueRegle, type ElementRegle, type ExempleResolu } from '../../outils/swn/regles/texte-regles.js';
import { resoudreElements } from '../catalogues.js';
import { ErreurService } from '../erreurs.js';
import { calculerResolu, resoudreChoix, versionsSource, OUTIL_VAISSEAUX, type LigneChoix } from './calcul-vaisseau.js';
import { catalogueVaisseaux, NATURES_VAISSEAU, type NatureCatalogueVaisseau } from './catalogue-vaisseaux.js';

// The rule and example sheets of the ship designer (B-77, R-1 to R-5): seven managed sections of `recalcul: 'proposition'`,
// produced **at a player's level** (R-2), and the table `swn_fiches_generees`, which only this file reads or writes.
// Apart from `section-vaisseaux.ts` for the same reason: the declaration (`outils/swn/index.ts`) calls these hooks lazily.

/** `regles-<nature>` for the six rule sheets, `exemples` for the examples. */
export const typeDe = (nature: NatureCatalogueVaisseau): string => (nature === 'exemples' ? 'exemples' : `regles-${nature}`);
export const TYPES_REGLES: string[] = NATURES_VAISSEAU.map(typeDe);
export const natureDe = (type: string): NatureCatalogueVaisseau | null =>
  NATURES_VAISSEAU.find((n) => typeDe(n) === type) ?? null;

export interface LigneFicheGeneree { id: number; univers_id: number; cle: string; fiche_id: number; section_id: number; source_version: string }

/** What a player does not see of this nature (every nature for the examples), as a short digest: `-` when nothing is hidden. */
function empreinte(db: Db, universId: number, nature: NatureCatalogueVaisseau): string {
  const stock = catalogueVaisseaux.stockage;
  const tous = nature === 'exemples';
  const caches = new Set<string>();
  for (const r of stock.lister(db, { universId })) if (r.masque && (tous || r.nature === nature)) caches.add(`${r.nature}/${r.cle}`);
  for (const r of stock.retraits(db, universId)) if (tous || r.nature === nature) caches.add(`${r.nature}/${r.cle}`);
  if (caches.size === 0) return '-';
  return createHash('sha1').update([...caches].sort().join('\n')).digest('hex').slice(0, 12);
}

export function versionSourceRegles(db: Db, universId: number, type: string): string {
  const nature = natureDe(type);
  if (!nature) throw new ErreurService('invalide', 'Type de section inconnu.', 'section_geree');
  const s = versionsSource(db, universId);
  return `regles:c=${s.catalogue};m=${empreinte(db, universId, nature)}${nature === 'exemples' ? `;r=${s.reglages}` : ''}`;
}

/** The elements of a nature as a player reads them (K-2): masked and withdrawn ones are absent, no trace. */
function elementsJoueur(db: Db, universId: number, nature: NatureCatalogueVaisseau) {
  return resoudreElements(db, universId, OUTIL_VAISSEAUX, nature, { inclureMasques: false }).map((r) => ({
    ...r.donnees, cle: r.cle, nom: r.nom,
    proprietaire: r.origine === 'univers' || r.origine === 'remplace' ? ('univers' as const) : ('systeme' as const),
  }));
}

/** An example whose hull or any line does not resolve at a player's level is left out whole (R-2). */
function exemplesJoueur(db: Db, universId: number): ExempleResolu[] {
  const sortie: ExempleResolu[] = [];
  for (const x of resoudreElements(db, universId, OUTIL_VAISSEAUX, 'exemples', { inclureMasques: false })) {
    const d = x.donnees as { coque: string; choix: LigneChoix[] };
    const s = calculerResolu(db, universId, resoudreChoix(db, universId, { coque: d.coque, choix: d.choix }, null));
    if (s.resultat !== null) sortie.push({ cle: x.cle, nom: x.nom, resultat: s.resultat });
  }
  return sortie;
}

export function produireRegles(db: Db, universId: number, type: string): { contenu: string; sourceVersion: string; charge: { cle: string } } {
  const nature = natureDe(type);
  if (!nature) throw new ErreurService('invalide', 'Type de section inconnu.', 'section_geree');
  const contenu = nature === 'exemples' ? texteExemples(exemplesJoueur(db, universId))
    : nature === 'coques' ? texteRegles('coques', elementsJoueur(db, universId, 'coques') as unknown as CoqueRegle[])
    : texteRegles(nature, elementsJoueur(db, universId, nature) as unknown as ElementRegle[]);
  return { contenu, sourceVersion: versionSourceRegles(db, universId, type), charge: { cle: type } };
}

export const ligneGeneree = (db: Db, universId: number, cle: string): LigneFicheGeneree | undefined =>
  db.prepare('SELECT * FROM swn_fiches_generees WHERE univers_id = ? AND cle = ?').get(universId, cle) as LigneFicheGeneree | undefined;

/** Same transaction, after every write of the section: the row follows the section, whoever wrote (R-5). */
export function apresEcritureRegles(ctx: ContexteSection, ecrit: EcritSection): void {
  const cle = (ecrit.charge as { cle?: string } | undefined)?.cle;
  if (typeof cle !== 'string' || !natureDe(cle) || ctx.sectionId === null) {
    throw new ErreurService('invalide', 'Cette section ne s\'écrit que par la génération des fiches de règles.', 'section_geree');
  }
  const existe = ctx.db.prepare('SELECT id FROM swn_fiches_generees WHERE section_id = ?').get(ctx.sectionId);
  if (existe) {
    ctx.db.prepare('UPDATE swn_fiches_generees SET source_version = ? WHERE section_id = ?').run(ecrit.sourceVersion, ctx.sectionId);
  } else {
    ctx.db.prepare(`INSERT INTO swn_fiches_generees (univers_id, cle, fiche_id, section_id, source_version) VALUES (?, ?, ?, ?, ?)`)
      .run(ctx.universId, cle, ctx.ficheId, ctx.sectionId, ecrit.sourceVersion);
  }
}
