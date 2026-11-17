import { Readable } from 'node:stream';

import type { Db } from '../db/db.js';
import { attachmentsDir } from '../config/env.js';
import { ajouterAsset, modifierAssets, type Categorie } from '../services/battlemap-assets.js';
import { appliquerCommandes, creerCarte, reglerCarte } from '../services/battlemap-cartes.js';
import { ajouterReference, ecrireDirection } from '../services/battlemap-direction.js';
import { assurerCompte } from '../services/comptes.js';
import { creerFiche } from '../services/fiches.js';
import { poserActivation } from '../services/outils.js';
import { pngPlat } from './png-plat.js';

type Rvb = readonly [number, number, number];

/** Ten assets: three objects, three pieces of scenery, three floors and a wall; the last object is GM-only (AD-battlemap-assets-4). */
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
  { nom: 'Mur de pierre', categorie: 'mur', couleur: [70, 70, 80] },
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
  // The generation tool too (AD-battlemap-generation-9): it stays absent without an image engine, which the stub always has.
  poserActivation(db, antor.compteId, { niveau: 'systeme', id: u.systeme_id }, 'battlemap/generation', true);
  const flux = (c: Rvb) => Readable.from([pngPlat(c)]);
  const ids = new Map<string, string>();
  for (const a of ASSETS) {
    const vue = await ajouterAsset(db, antor, u.id, flux(a.couleur), `${a.nom}.png`, { nom: a.nom, categorie: a.categorie, ...(a.tags ? { tags: a.tags } : {}) }, racine);
    ids.set(a.nom, String(vue.id));
    if (a.mj) modifierAssets(db, antor, u.id, [vue.id], { visible: false });
  }
  ecrireDirection(db, antor, u.id, 'Peinture à plat, couleurs franches, vue de dessus, contours nets.', 0);
  await ajouterReference(db, antor, u.id, flux([200, 90, 60]), 'reference-style.png', racine);
  semerCantine(db, antor, u.id, u.systeme_id, ids);
}

type Cote = 'h' | 'v';
/** The four sides of a room of cells `x0..x1` × `y0..y1` (walls are edges: `h` is the top of a cell, `v` its left). */
function piece(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; cote: Cote }[] {
  const s: { x: number; y: number; cote: Cote }[] = [];
  for (let x = x0; x <= x1; x++) s.push({ x, y: y0, cote: 'h' }, { x, y: y1 + 1, cote: 'h' });
  for (let y = y0; y <= y1; y++) s.push({ x: x0, y, cote: 'v' }, { x: x1 + 1, y, cote: 'v' });
  return s;
}

/**
 * « Cantine de la station » (AD-battlemap-editeur-8): built by the core's commands through the service, never typed as a
 * document. A floor, two rooms with a door, three objects, one linked to a sheet, and a GM-only layer holding a trap room.
 */
function semerCantine(db: Db, antor: { compteId: number }, universId: number, systemeId: number, ids: Map<string, string>): void {
  poserActivation(db, antor.compteId, { niveau: 'systeme', id: systemeId }, 'battlemap/cartes', true);
  const fiche = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? ORDER BY id LIMIT 1').get(universId) as { id: number } | undefined)?.id
    ?? creerFiche(db, antor.compteId, universId, { type: 'lieu', titre: 'Cantine de la station' }).id;
  const { id } = creerCarte(db, antor, universId, { titre: 'Cantine de la station', largeur: 30, hauteur: 20 });
  const mur = ids.get('Mur de pierre')!;
  const sallePiege = piece(16, 12, 26, 17);
  const cellules: { x: number; y: number }[] = [];
  for (let y = 1; y <= 18; y++) for (let x = 1; x <= 28; x++) cellules.push({ x, y });
  const objet = (n: string, nom: string, x: number, y: number, extra: object = {}) =>
    ({ type: 'poser_element', id: n, calque: 'objets', asset_id: ids.get(nom)!, x, y, ...extra });
  appliquerCommandes(db, antor, universId, id, 1, [
    { type: 'peindre_sol', calque: 'sol', cellules, asset_id: ids.get('Dalles')! },
    { type: 'tracer_mur', calque: 'murs', segments: [...piece(2, 2, 12, 9), ...piece(16, 2, 26, 9)], asset_id: mur },
    { type: 'poser_porte', calque: 'murs', x: 6, y: 10, cote: 'h', porte: true },
    { type: 'poser_porte', calque: 'murs', x: 21, y: 10, cote: 'h', porte: true },
    objet('tonneau', 'Tonneau', 4.5, 4.5),
    objet('coffre', 'Coffre', 20.5, 4.5, { fiche_id: String(fiche) }),
    objet('statue', 'Statue', 8.5, 7.5),
    { type: 'creer_calque', id: 'mj', nom: 'Réservé au MJ', genre: 'mur', mj_seul: true },
    { type: 'tracer_mur', calque: 'mj', segments: sallePiege, asset_id: mur },
    { type: 'poser_porte', calque: 'mj', x: 21, y: 12, cote: 'h', porte: true },
  ]);
  reglerCarte(db, antor, universId, id, 2, { visible: true });
}

