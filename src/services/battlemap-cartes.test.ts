// Review tests of kanevas-battlemap-editeur-cartes-noyau (B-101, B-104, B-110, AD-154 to AD-156, AD-battlemap-editeur-1/5/6/9).
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { ajouterMembre } = await import('./membres.js');
const { creerUnivers, supprimerUnivers } = await import('./univers.js');
const { creerFiche } = await import('./fiches.js');
const A = await import('./battlemap-assets.js');
const C = await import('./battlemap-cartes.js');
const { battlemapCartes } = await import('../outils/battlemap/index.js');
const { listerCartesOutils, poserActivation } = await import('./outils.js');
type Db = ReturnType<typeof openDb>;

const PNG = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, 2, 3, 4]);
function err(fn: () => unknown): { code: string; detail?: string; champ?: string } {
  try { fn(); } catch (e: any) { return e; }
  assert.fail('aucune erreur levée');
}
let n = 0;
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  const v = creerUnivers(db, antor, { nom: 'V' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  return { db, u, v, racine: mkdtempSync(join(tmpdir(), 'bmc-')), antor,
    mj: { compteId: antor }, mjJoueur: { compteId: antor, modeJoueur: true }, lea: { compteId: lea }, zoe: { compteId: zoe } };
}
type M = ReturnType<typeof monde>;
const asset = async (m: M, saisie: any = {}, u = m.u) =>
  String((await A.ajouterAsset(m.db, m.mj, u, Readable.from([PNG(++n % 250)]), `a${n}.png`, saisie, m.racine)).id);
const doc = (m: M, id: number, qui: any = m.mj) => C.lireCarte(m.db, qui, m.u, id).document as any;
const rows = (db: Db) => (db.prepare('SELECT COUNT(*) n FROM bm_cartes').get() as any).n as number;
const cases = (...xs: [number, number][]) => xs.map(([x, y]) => ({ x, y }));

async function carteGarnie(m: M) {
  const sol = await asset(m); const mur = await asset(m); const obj = await asset(m);
  const { id } = C.creerCarte(m.db, m.mj, m.u, { titre: 'Donjon', largeur: 30, hauteur: 20 });
  const r = C.appliquerCommandes(m.db, m.mj, m.u, id, 1, [
    { type: 'peindre_sol', calque: 'sol', cellules: cases([0, 0], [1, 0]), asset_id: sol },
    { type: 'tracer_mur', calque: 'murs', segments: [{ x: 2, y: 2, cote: 'h' }, { x: 3, y: 2, cote: 'h' }], asset_id: mur },
    { type: 'poser_porte', calque: 'murs', x: 3, y: 2, cote: 'h', porte: true },
    { type: 'poser_element', id: 'e1', calque: 'objets', asset_id: obj, x: 5.5, y: 4.5 },
    { type: 'poser_element', id: 'e2', calque: 'objets', asset_id: obj, x: 6.5, y: 4.5 },
  ]);
  return { id, sol, mur, obj, version: r.version };
}

test('création 30 × 20 : document du cœur, version 1, invisible, défauts', async () => {
  const m = monde();
  const { id } = C.creerCarte(m.db, m.mj, m.u, { titre: ' Donjon ', largeur: 30, hauteur: 20 });
  const v = C.lireCarte(m.db, m.mj, m.u, id);
  assert.deepEqual([v.titre, v.largeur, v.hauteur, v.version, v.visible, v.peutEcrire, v.tailleCase], ['Donjon', 30, 20, 1, false, true, 70]);
  assert.deepEqual((v.document as any).calques.map((c: any) => c.nom), ['Sol', 'Murs', 'Objets']);
  const d = C.creerCarte(m.db, m.mj, m.u, { titre: 'Défaut' });
  const w = C.lireCarte(m.db, m.mj, m.u, d.id);
  assert.deepEqual([w.largeur, w.hauteur], [30, 20]);
});

test('création refusée : titre vide ou trop long, taille hors limites ou non entière, non-MJ, mode Joueur', () => {
  const m = monde();
  assert.equal(err(() => C.creerCarte(m.db, m.mj, m.u, { titre: '  ' })).code, 'invalide');
  assert.equal(err(() => C.creerCarte(m.db, m.mj, m.u, { titre: 'x'.repeat(81) })).code, 'invalide');
  for (const t of [{ largeur: 201 }, { hauteur: 0 }, { largeur: 1.5 }, { largeur: '30' }, { hauteur: -3 }]) {
    assert.equal(err(() => C.creerCarte(m.db, m.mj, m.u, { titre: 'A', ...t })).code, 'invalide', JSON.stringify(t));
  }
  assert.equal(err(() => C.creerCarte(m.db, m.mj, m.u, { titre: 'A', tailleCase: 19 })).code, 'invalide');
  assert.equal(err(() => C.creerCarte(m.db, m.lea, m.u, { titre: 'A' })).code, 'introuvable');
  assert.equal(err(() => C.creerCarte(m.db, m.zoe, m.u, { titre: 'A' })).code, 'introuvable');
  assert.equal(err(() => C.creerCarte(m.db, m.mjJoueur, m.u, { titre: 'A' })).code, 'refuse');
  assert.equal(rows(m.db), 0);
});

test('un lot (sol, deux murs, porte, deux éléments) se relit à l’identique ; la version avance', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  assert.equal(c.version, 2);
  const d = doc(m, c.id);
  assert.equal(d.sols.length, 2);
  assert.equal(d.murs.length, 2);
  assert.equal(d.murs.filter((x: any) => x.porte).length, 1);
  assert.equal(d.elements.length, 2);
  assert.equal(C.lireCarte(m.db, m.mj, m.u, c.id).version, 2);
  assert.deepEqual(doc(m, c.id), d);
});

test('version périmée : conflit/version, rien ne change ; lot vide, version non entière : invalide', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const avant = C.lireCarte(m.db, m.mj, m.u, c.id);
  const e = err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 1, [{ type: 'supprimer_element', id: 'e1' }]));
  assert.deepEqual([e.code, e.detail], ['conflit', 'version']);
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), avant);
  assert.equal(err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, [])).code, 'invalide');
  assert.equal(err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, '2', [{ type: 'supprimer_element', id: 'e1' }])).code, 'invalide');
  assert.equal(err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, 'x')).code, 'invalide');
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), avant);
});

test('carte_pleine : un lot qui dépasse une limite est refusé en entier', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const avant = C.lireCarte(m.db, m.mj, m.u, c.id);
  const lot = [{ type: 'supprimer_element', id: 'e1' },
    ...Array.from({ length: 18 }, (_, i) => ({ type: 'creer_calque', id: `k${i}`, nom: `K${i}`, genre: 'objet' }))];
  const e = err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, lot));
  assert.deepEqual([e.code, e.detail], ['conflit', 'carte_pleine']);
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), avant);
});

test('une commande refusée par le cœur refuse tout le lot (rien d’écrit)', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const avant = C.lireCarte(m.db, m.mj, m.u, c.id);
  const e = err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, [
    { type: 'supprimer_element', id: 'e1' }, { type: 'deplacer_element', id: 'inexistant', x: 1, y: 1 }]));
  assert.equal(e.code, 'invalide');
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), avant);
});

test('asset_id étranger, retiré, brouillon ou non numérique : asset_inconnu ; rien d’écrit', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const autre = await asset(m, {}, m.v);
  const avant = C.lireCarte(m.db, m.mj, m.u, c.id);
  const retire = await asset(m);
  A.retirerAssets(m.db, m.mj, m.u, [Number(retire)]);
  for (const a of [autre, retire, '99999', 'abc', '']) {
    for (const cmd of [
      { type: 'poser_element', id: 'z', calque: 'objets', asset_id: a, x: 1.5, y: 1.5 },
      { type: 'peindre_sol', calque: 'sol', cellules: cases([9, 9]), asset_id: a },
      { type: 'tracer_mur', calque: 'murs', segments: [{ x: 9, y: 9, cote: 'v' }], asset_id: a },
    ]) {
      const e = err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, [cmd]));
      assert.equal(e.detail, 'asset_inconnu', `${a} ${cmd.type}`);
      assert.equal(e.code, 'invalide');
    }
  }
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), avant);
});

test('fiche_id d’un autre univers ou inexistant : fiche_inconnue ; une fiche de l’univers passe', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const etrangere = creerFiche(m.db, m.antor, m.v, { type: 'lieu', titre: 'Ailleurs', charge: {} }).id;
  const ici = creerFiche(m.db, m.antor, m.u, { type: 'lieu', titre: 'Ici', charge: {} }).id;
  for (const f of [String(etrangere), '99999', 'fiche-x']) {
    assert.equal(err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, [{ type: 'lier_fiche', id: 'e1', fiche_id: f }])).detail, 'fiche_inconnue', f);
    assert.equal(err(() => C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2,
      [{ type: 'poser_element', id: 'q', calque: 'objets', asset_id: c.obj, x: 1.5, y: 1.5, fiche_id: f }])).detail, 'fiche_inconnue', f);
  }
  assert.equal(doc(m, c.id).elements.length, 2);
  const r = C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, [{ type: 'lier_fiche', id: 'e1', fiche_id: String(ici) }]);
  assert.equal(r.version, 3);
});

test('lecture joueur : calque MJ seul, asset MJ seul, asset retiré et fiche illisible absents ; le lien seul tombe', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const aMj = await asset(m);
  A.modifierAssets(m.db, m.mj, m.u, [Number(aMj)], { visible: false });
  const aRetire = await asset(m);
  const aOk = await asset(m);
  const lisible = creerFiche(m.db, m.antor, m.u, { type: 'lieu', titre: 'Pub', charge: {}, sections: [{ titre: 'S', joueursLisent: true }] }).id;
  const cachee = creerFiche(m.db, m.antor, m.u, { type: 'lieu', titre: 'Secret', charge: {}, sections: [{ titre: 'S', joueursLisent: false }] }).id;
  C.appliquerCommandes(m.db, m.mj, m.u, c.id, 2, [
    { type: 'creer_calque', id: 'mjs', nom: 'Pièges', genre: 'objet' },
    { type: 'regler_calque', id: 'mjs', mj_seul: true },
    { type: 'poser_element', id: 'piege', calque: 'mjs', asset_id: aOk, x: 1.5, y: 1.5 },
    { type: 'poser_element', id: 'secret', calque: 'objets', asset_id: aMj, x: 2.5, y: 1.5 },
    { type: 'poser_element', id: 'ancien', calque: 'objets', asset_id: aRetire, x: 3.5, y: 1.5 },
    { type: 'poser_element', id: 'pub', calque: 'objets', asset_id: aOk, x: 4.5, y: 1.5, fiche_id: String(lisible) },
    { type: 'poser_element', id: 'cache', calque: 'objets', asset_id: aOk, x: 5.5, y: 1.5, fiche_id: String(cachee) },
  ]);
  A.retirerAssets(m.db, m.mj, m.u, [Number(aRetire)]);
  C.reglerCarte(m.db, m.mj, m.u, c.id, 3, { visible: true });
  const mjDoc = doc(m, c.id);
  assert.equal(mjDoc.elements.length, 7);
  for (const joueur of [m.lea, m.mjJoueur]) {
    const d = doc(m, c.id, joueur);
    const ids = d.elements.map((e: any) => e.id);
    assert.deepEqual(ids.sort(), ['cache', 'e1', 'e2', 'pub']);
    assert.ok(!d.calques.some((k: any) => k.id === 'mjs'));
    assert.equal(d.elements.find((e: any) => e.id === 'pub').fiche_id, String(lisible));
    assert.equal(d.elements.find((e: any) => e.id === 'cache').fiche_id, undefined);
    const v = C.lireCarte(m.db, joueur, m.u, c.id);
    assert.equal(v.peutEcrire, false);
    assert.equal(v.visible, undefined);
  }
});

test('le contexte du filtre ne vient jamais de l’appelant : lireCarte n’accepte aucun paramètre de contexte', () => {
  assert.equal(C.lireCarte.length, 4);
});

test('droits de lecture : carte cachée introuvable pour joueur et étranger ; MJ en mode Joueur refuse mode_joueur ; id inconnu introuvable', async () => {
  const m = monde();
  const { id } = C.creerCarte(m.db, m.mj, m.u, { titre: 'Cachée' });
  for (const qui of [m.lea, m.zoe]) assert.equal(err(() => C.lireCarte(m.db, qui, m.u, id)).code, 'introuvable');
  const e = err(() => C.lireCarte(m.db, m.mjJoueur, m.u, id));
  assert.deepEqual([e.code, e.detail], ['refuse', 'mode_joueur']);
  for (const x of [9999, -1, 1.5, NaN]) assert.equal(err(() => C.lireCarte(m.db, m.mj, m.u, x)).code, 'introuvable');
  assert.equal(err(() => C.lireCarte(m.db, m.mj, m.v, id)).code, 'introuvable', 'autre univers');
  assert.equal(C.lireCarte(m.db, m.mj, m.u, id).titre, 'Cachée');
  C.rendreVisibleCarte(m.db, m.mj, m.u, id, true, 1);
  assert.equal(C.lireCarte(m.db, m.lea, m.u, id).titre, 'Cachée');
  assert.equal(err(() => C.lireCarte(m.db, m.zoe, m.u, id)).code, 'introuvable');
});

test('écriture : non-MJ et étranger introuvable, MJ en mode Joueur refuse, rien ne change', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  C.rendreVisibleCarte(m.db, m.mj, m.u, c.id, true, 2);
  const avant = C.lireCarte(m.db, m.mj, m.u, c.id);
  const cmd = [{ type: 'supprimer_element', id: 'e1' }];
  for (const [qui, code] of [[m.lea, 'introuvable'], [m.zoe, 'introuvable'], [m.mjJoueur, 'refuse']] as const) {
    assert.equal(err(() => C.appliquerCommandes(m.db, qui, m.u, c.id, 3, cmd)).code, code);
    assert.equal(err(() => C.reglerCarte(m.db, qui, m.u, c.id, 3, { titre: 'X' })).code, code);
    assert.equal(err(() => C.rendreVisibleCarte(m.db, qui, m.u, c.id, false, 3)).code, code);
    assert.equal(err(() => C.supprimerCarte(m.db, qui, m.u, c.id)).code, code);
  }
  assert.equal(err(() => C.appliquerCommandes(m.db, m.mj, m.v, c.id, 3, cmd)).code, 'introuvable', 'autre univers');
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), avant);
});

test('régler : titre, visibilité, taille de case, taille ; redimensionner sous un élément refusé sans effet', async () => {
  const m = monde();
  const c = await carteGarnie(m);
  const r = C.reglerCarte(m.db, m.mj, m.u, c.id, 2, { titre: 'Crypte', tailleCase: 100, largeur: 40, hauteur: 25, visible: true });
  assert.equal(r.version, 3);
  const v = C.lireCarte(m.db, m.mj, m.u, c.id);
  assert.deepEqual([v.titre, v.tailleCase, v.largeur, v.hauteur, v.visible, (v.document as any).largeur], ['Crypte', 100, 40, 25, true, 40]);
  const e = err(() => C.reglerCarte(m.db, m.mj, m.u, c.id, 3, { titre: 'Autre', largeur: 5, hauteur: 5 }));
  assert.equal(e.code, 'invalide');
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), v);
  assert.equal(err(() => C.reglerCarte(m.db, m.mj, m.u, c.id, 2, { titre: 'X' })).detail, 'version');
  assert.equal(err(() => C.reglerCarte(m.db, m.mj, m.u, c.id, 3, { tailleCase: 301 })).code, 'invalide');
  assert.equal(err(() => C.reglerCarte(m.db, m.mj, m.u, c.id, 3, { visible: 'oui' })).code, 'invalide');
  assert.equal(err(() => C.reglerCarte(m.db, m.mj, m.u, c.id, 3, { titre: '' })).code, 'invalide');
  assert.equal(err(() => C.reglerCarte(m.db, m.mj, m.u, c.id, 3, {})).code, 'invalide');
  assert.deepEqual(C.lireCarte(m.db, m.mj, m.u, c.id), v);
});

test('« Utilisé sur N cartes » : trois cartes → 3, une carte compte une fois, asset retiré compris', async () => {
  const m = monde();
  const a = await asset(m); const b = await asset(m);
  for (let i = 0; i < 3; i++) {
    const { id } = C.creerCarte(m.db, m.mj, m.u, { titre: `C${i}` });
    C.appliquerCommandes(m.db, m.mj, m.u, id, 1, [
      { type: 'poser_element', id: 'x', calque: 'objets', asset_id: a, x: 1.5, y: 1.5 },
      { type: 'poser_element', id: 'y', calque: 'objets', asset_id: a, x: 2.5, y: 1.5 },
      { type: 'peindre_sol', calque: 'sol', cellules: cases([0, 0]), asset_id: a }]);
  }
  C.creerCarte(m.db, m.mj, m.u, { titre: 'Vide' });
  assert.equal(A.compterUsage(m.db, m.mj, m.u, [Number(a)]), 3);
  assert.equal(A.compterUsage(m.db, m.mj, m.u, [Number(b)]), 0);
  assert.equal(A.compterUsage(m.db, m.mj, m.u, [Number(a), Number(b)]), 3);
  A.retirerAssets(m.db, m.mj, m.u, [Number(a)]);
  assert.equal(C.cartesUtilisant(m.db, m.u, [a]), 3);
  assert.equal(C.cartesUtilisant(m.db, m.v, [a]), 0, 'autre univers');
  assert.equal(C.cartesUtilisant(m.db, m.u, []), 0);
});

test('outil cartes : liste (adresse au MJ seul), création avec taille, suppression, compter/effacer, supprimerUnivers', async () => {
  const m = monde();
  const sys = Number(m.db.prepare("INSERT INTO systemes_jeu (nom, cree_le) VALUES ('Système', 'x')").run().lastInsertRowid);
  m.db.prepare('UPDATE univers SET systeme_id = ? WHERE id IN (?, ?)').run(sys, m.u, m.v);
  poserActivation(m.db, m.mj, { niveau: 'univers', id: m.u }, 'battlemap/cartes', true);
  poserActivation(m.db, m.mj, { niveau: 'univers', id: m.v }, 'battlemap/cartes', true);
  const { id } = battlemapCartes.creation!.creer(m.db, m.mj, m.u, 'Taverne', { largeur: 12, hauteur: 9 });
  battlemapCartes.creation!.creer(m.db, m.mj, m.v, 'Ailleurs');
  const l = listerCartesOutils(m.db, m.mj, m.u).filter((c) => c.outil === 'cartes');
  assert.equal(l.length, 1);
  assert.deepEqual([l[0]!.largeur, l[0]!.hauteur, l[0]!.adresse], [12, 9, `/univers/${m.u}/outils/battlemap/cartes/${id}`]);
  assert.equal(listerCartesOutils(m.db, m.lea, m.u).filter((c) => c.outil === 'cartes').length, 0, 'invisible');
  C.rendreVisibleCarte(m.db, m.mj, m.u, id, true, 1);
  const lj = listerCartesOutils(m.db, m.lea, m.u).filter((c) => c.outil === 'cartes');
  assert.equal(lj.length, 1);
  assert.equal(lj[0]!.adresse, undefined);
  assert.equal(err(() => listerCartesOutils(m.db, m.zoe, m.u)).code, 'introuvable');
  assert.deepEqual(battlemapCartes.donnees!.compter(m.db, { niveau: 'univers', universId: m.u }).map((x) => x.nombre), [1, 0, 0]);
  assert.deepEqual(battlemapCartes.donnees!.compter(m.db, { niveau: 'univers', universId: m.v }).map((x) => x.nombre), [1, 0, 0]);
  battlemapCartes.donnees!.effacer(m.db, { niveau: 'univers', universId: m.u });
  assert.equal(rows(m.db), 1, 'l’autre univers reste');
  const k = C.creerCarte(m.db, m.mj, m.u, { titre: 'Z' }).id;
  battlemapCartes.creation!.supprimer!(m.db, m.mj, m.u, k);
  assert.equal(err(() => C.lireCarte(m.db, m.mj, m.u, k)).code, 'introuvable');
  C.creerCarte(m.db, m.mj, m.u, { titre: 'Y' });
  supprimerUnivers(m.db, m.mj, m.u, 'U');
  assert.equal(rows(m.db), 1);
});

test('montée de la migration 0047 depuis 0046 : table créée, contraintes tenues, rien d’autre ne bouge', () => {
  const SRC = new URL('../db/migrations/', import.meta.url).pathname;
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 46) copyFileSync(SRC + f, dir + f);
  const db = openDb(':memory:');
  migrate(db, dir);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'bm_cartes'").get(), undefined);
  db.prepare("INSERT INTO univers (id, cle, nom, cree_le) VALUES (1, 'un', 'U', '2026-11-01T00:00:00.000Z')").run();
  assert.deepEqual(migrate(db), [47, 48, 49, 50, 51]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const ins = (titre: string, l: unknown, h: unknown, doc: string) => db.prepare(
    "INSERT INTO bm_cartes (univers_id, titre, largeur, hauteur, document, cree_le, modifie_le) VALUES (1, ?, ?, ?, ?, 'a', 'a')").run(titre, l, h, doc);
  ins('ok', 30, 20, '{}');
  const l = db.prepare('SELECT visible, taille_case, version FROM bm_cartes').get() as any;
  assert.deepEqual([l.visible, l.taille_case, l.version], [0, 70, 1]);
  assert.throws(() => ins('', 1, 1, '{}'));
  assert.throws(() => ins('x', 201, 1, '{}'));
  assert.throws(() => ins('x', 1, 0, '{}'));
  assert.throws(() => ins('x', 1.5, 1, '{}'));
  assert.throws(() => ins('x', 1, 1, 'pas du json'));
  assert.throws(() => db.prepare("INSERT INTO bm_cartes (univers_id, titre, largeur, hauteur, document, cree_le, modifie_le) VALUES (99, 'x', 1, 1, '{}', 'a', 'a')").run());
  db.prepare('DELETE FROM univers WHERE id = 1').run();
  assert.equal((db.prepare('SELECT COUNT(*) n FROM bm_cartes').get() as any).n, 0, 'cascade');
});
