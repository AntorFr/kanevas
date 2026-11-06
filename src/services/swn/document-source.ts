import { createHash } from 'node:crypto';
import type { Db } from '../../db/db.js';
import type { ContexteSection } from '../../outils/declaration.js';
import { redigerDocumentMJ, type VueDocument } from '../../outils/swn/regles/document.js';
import { introuvable } from '../erreurs.js';
import { niveauLecture, routesLisibles, systemesLisibles, zonesLisibles, type LigneGalaxie } from './galaxies.js';

/**
 * Source side of the GM document (T-7): the version of what it is made from and its text. Kept apart from
 * `document.ts` (which writes the section) so the module declaration can import it without closing a cycle.
 */

/** Fixed version of a galaxy that no longer exists. */
export const GALAXIE_SUPPRIMEE = 'galaxie-supprimee';

const TAILLES = ['petite', 'moyenne', 'grande'];

/** The galaxy a document section belongs to: by section, else by sheet. */
function galaxieDeContexte(db: Db, ctx: ContexteSection): LigneGalaxie | undefined {
  return (ctx.sectionId !== null
    ? db.prepare('SELECT * FROM swn_galaxies WHERE univers_id = ? AND section_id = ?').get(ctx.universId, ctx.sectionId)
    : db.prepare('SELECT * FROM swn_galaxies WHERE univers_id = ? AND fiche_id = ? ORDER BY id LIMIT 1').get(ctx.universId, ctx.ficheId)
  ) as LigneGalaxie | undefined;
}

/** SHA-256 of the title, the sorted `(cle, version)` of systems and zones, the sorted `(id, version)` of routes. */
export function versionGalaxie(db: Db, g: LigneGalaxie): string {
  const trier = (a: [string | number, number][]) => a.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]));
  const systemes = trier((db.prepare('SELECT cle, version FROM swn_systemes WHERE galaxie_id = ?').all(g.id) as
    { cle: string; version: number }[]).map((r) => [r.cle, r.version]));
  const zones = trier((db.prepare('SELECT cle, version FROM swn_zones WHERE galaxie_id = ?').all(g.id) as
    { cle: string; version: number }[]).map((r) => [r.cle, r.version]));
  const routes = trier((db.prepare('SELECT id, version FROM swn_routes WHERE galaxie_id = ?').all(g.id) as
    { id: number; version: number }[]).map((r) => [r.id, r.version]));
  return createHash('sha256').update(JSON.stringify([g.titre, systemes, zones, routes])).digest('hex');
}

export function versionSourceDocument(ctx: ContexteSection): string {
  const g = galaxieDeContexte(ctx.db, ctx);
  return g ? versionGalaxie(ctx.db, g) : GALAXIE_SUPPRIMEE;
}

/** Text and source version of a galaxy at level `'mj'`; any other level is `introuvable`. */
export function produireGalaxie(db: Db, acteur: ContexteSection['acteur'], universId: number, g: LigneGalaxie):
  { contenu: string; sourceVersion: string } {
  if (niveauLecture(db, acteur, universId) !== 'mj') throw introuvable();
  const systemes = systemesLisibles(db, g.id, 'mj');
  const noms = new Map(systemes.map((s) => [s.id, s.nom]));
  const vue: VueDocument = {
    titre: g.titre,
    systemes: systemes.map((s) => ({
      nom: s.nom, q: s.q, r: s.r, taille: TAILLES[Math.min(Math.max(s.taille, 1), 3) - 1]!, notes: s.notes, secret: s.secret === 1,
    })),
    routes: routesLisibles(db, g.id, 'mj').map((r) => ({
      depuis: noms.get(r.depuis_id) ?? '', vers: noms.get(r.vers_id) ?? '', longueur: r.longueur, publique: r.publique === 1, typeLien: r.type_lien,
    })),
    zones: zonesLisibles(db, g.id, 'mj').map((z) => ({ nom: z.nom, densite: z.densite, secret: z.secret === 1 })),
  };
  return { contenu: redigerDocumentMJ(vue), sourceVersion: versionGalaxie(db, g) };
}

export function produireDocument(ctx: ContexteSection): { contenu: string; sourceVersion: string } {
  const g = galaxieDeContexte(ctx.db, ctx);
  if (!g) throw introuvable();
  return produireGalaxie(ctx.db, ctx.acteur, ctx.universId, g);
}
