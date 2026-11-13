import { Readable } from 'node:stream';

import type { Db } from '../db/db.js';
import { attachmentsDir } from '../config/env.js';
import { ajouterAsset, modifierAssets, type Categorie } from '../services/battlemap-assets.js';
import { ajouterReference, ecrireDirection } from '../services/battlemap-direction.js';
import { assurerCompte } from '../services/comptes.js';
import { poserActivation } from '../services/outils.js';
import { pngPlat } from './png-plat.js';

type Rvb = readonly [number, number, number];

/** Nine assets: three objects, three pieces of scenery, three floors; the last object is GM-only (AD-battlemap-assets-4). */
const ASSETS: { nom: string; categorie: Categorie; couleur: Rvb; mj?: true; tags?: string[] }[] = [
  { nom: 'Tonneau', categorie: 'objet', couleur: [139, 94, 60], tags: ['taverne', 'bois'] },
  { nom: 'Coffre', categorie: 'objet', couleur: [184, 134, 11] },
  { nom: 'Coffre piégé', categorie: 'objet', couleur: [160, 40, 40], mj: true },
  { nom: 'Arbre', categorie: 'decor', couleur: [46, 125, 50] },
  { nom: 'Rocher', categorie: 'decor', couleur: [120, 120, 125] },
  { nom: 'Statue', categorie: 'decor', couleur: [190, 190, 180] },
  { nom: 'Dalles', categorie: 'sol', couleur: [96, 96, 104] },
  { nom: 'Herbe', categorie: 'sol', couleur: [104, 159, 56] },
  { nom: 'Sable', categorie: 'sol', couleur: [222, 196, 130] },
];

/**
 * The library and the art direction of « Éneria d'essai » (the universe with a system), written by the real services,
 * with the tool switched on for its system. Call it once, on the seeded world.
 */
export async function semerBattlemap(db: Db, racine: string = attachmentsDir): Promise<void> {
  const u = db.prepare("SELECT id, systeme_id FROM univers WHERE nom = ?").get("Éneria d'essai") as
    | { id: number; systeme_id: number | null }
    | undefined;
  if (!u || u.systeme_id === null) return;
  const antor = { compteId: assurerCompte(db, 'antor').id };
  poserActivation(db, antor.compteId, { niveau: 'systeme', id: u.systeme_id }, 'battlemap/assets', true);
  const flux = (c: Rvb) => Readable.from([pngPlat(c)]);
  for (const a of ASSETS) {
    const vue = await ajouterAsset(db, antor, u.id, flux(a.couleur), `${a.nom}.png`, { nom: a.nom, categorie: a.categorie, ...(a.tags ? { tags: a.tags } : {}) }, racine);
    if (a.mj) modifierAssets(db, antor, u.id, [vue.id], { visible: false });
  }
  ecrireDirection(db, antor, u.id, 'Peinture à plat, couleurs franches, vue de dessus, contours nets.', 0);
  await ajouterReference(db, antor, u.id, flux([200, 90, 60]), 'reference-style.png', racine);
}
