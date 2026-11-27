// Review tests of kanevas-battlemap-table-service (B-104, B-109, AD-156, AD-160, AD-162, AD-163, AD-battlemap-table-5, 7, 8, 9).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
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
const T = await import('./battlemap-tables.js');
const K = await import('../outils/battlemap/coeur.js');
const { battlemapCartes } = await import('../outils/battlemap/index.js');
type Db = ReturnType<typeof openDb>;

const PNG = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, 2, 3, 4]);
function err(fn: () => unknown): { code: string; detail?: string; champ?: string } {
  try { fn(); } catch (e: any) { return e; }
  assert.fail('aucune erreur levée');
}
let n = 100;
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  return { db, u, racine: mkdtempSync(join(tmpdir(), 'bmt-')), antor, leaId: lea, zoeId: zoe,
    mj: { compteId: antor }, mjJoueur: { compteId: antor, modeJoueur: true }, lea: { compteId: lea }, zoe: { compteId: zoe } };
}
type M = ReturnType<typeof monde>;
const asset = async (m: M, saisie: any = {}) =>
  String((await A.ajouterAsset(m.db, m.mj, m.u, Readable.from([PNG(++n % 250)]), `a${n}.png`, saisie, m.racine)).id);
const carte = (m: M, visible = true, largeur = 12, hauteur = 8) => {
  const { id } = C.creerCarte(m.db, m.mj, m.u, { titre: 'Salle', largeur, hauteur });
  if (visible) C.reglerCarte(m.db, m.mj, m.u, id, 1, { visible: true });
  return id;
};
const pion = (id: string, x: number, y: number, extra: any = {}) => ({ type: 'ajouter_pion', id, nom: id.toUpperCase(), x, y, ...extra });
const rows = (db: Db, t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n as number;
const jouee = (m: M, visible = true, l = 12, h = 8) => {
  const id = carte(m, visible, l, h);
  T.creerTable(m.db, m.mj, m.u, id);
  return id;
};

test('le MJ crée la table (idempotent), la relit, applique un lot et obtient la version suivante', () => {
  const m = monde();
  const id = carte(m);
  assert.deepEqual(T.lireTable(m.db, m.mj, m.u, id), { commencee: false, peutEcrire: true });
  const c = T.creerTable(m.db, m.mj, m.u, id);
  assert.equal(c.creee, true);
  const v1 = T.lireTable(m.db, m.mj, m.u, id) as any;
  assert.deepEqual([v1.commencee, v1.version, v1.peutEcrire, v1.etat.pions.length, v1.proprietaires], [true, 1, true, 0, {}]);
  const bis = T.creerTable(m.db, m.mj, m.u, id);
  assert.equal(bis.creee, false);
  assert.equal(rows(m.db, 'bm_tables'), 1);
  const r = T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 2, 2), { type: 'reveler_rect', x: 0, y: 0, l: 3, h: 3 }]);
  assert.equal(r.version, 2);
  const v2 = T.lireTable(m.db, m.mj, m.u, id) as any;
  assert.equal(v2.version, 2);
  assert.equal(v2.etat.pions[0].id, 'a');
  assert.equal((C.lireCarte(m.db, m.mj, m.u, id)).version, 2, 'la version de la carte est celle de la carte (visible → 2), pas de la table');
});

test('version périmée : conflit/version, rien n’est écrit ; lot refusé en entier ; version ou lot mal formés : invalide', () => {
  const m = monde();
  const id = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1)]);
  const p = err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('b', 2, 2)]));
  assert.deepEqual([p.code, p.detail], ['conflit', 'version']);
  const refus = err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 2, [pion('b', 2, 2), pion('c', 99, 99)]));
  assert.equal(refus.code, 'invalide');
  assert.equal(refus.detail, 'limite_depassee');
  assert.equal((T.lireTable(m.db, m.mj, m.u, id) as any).etat.pions.length, 1, 'le lot refusé n’écrit rien');
  assert.equal((T.lireTable(m.db, m.mj, m.u, id) as any).version, 2);
  for (const v of [0, 1.5, '2', null, undefined]) assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, v, [pion('z', 1, 1)])).code, 'invalide', String(v));
  for (const c of [[], 'x', null, undefined, Array.from({ length: 501 }, (_, i) => pion(`p${i}`, 0, 0))]) {
    assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 2, c)).code, 'invalide');
  }
  assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 2, [pion('a', 3, 3)])).detail, 'id_existant');
});

test('table_pleine : 200 pions au plus, le 201e est conflit/table_pleine et le lot ne laisse rien', () => {
  const m = monde();
  const id = jouee(m, true, 30, 20);
  const lot = (de: number, k: number) => Array.from({ length: k }, (_, i) => pion(`p${de + i}`, (de + i) % 30, Math.floor((de + i) / 30)));
  let v = 1;
  for (const de of [0, 100]) v = T.appliquerCommandesTable(m.db, m.mj, m.u, id, v, lot(de, 100)).version;
  const e = err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, v, lot(200, 1)));
  assert.deepEqual([e.code, e.detail], ['conflit', 'table_pleine']);
  assert.equal((T.lireTable(m.db, m.mj, m.u, id) as any).etat.pions.length, 200);
});

test('un joueur lit la vue filtrée (sans propriétaires ni peutEcrire) ; sans table : {commencee:false}', async () => {
  const m = monde();
  const id = carte(m);
  assert.deepEqual(T.lireTable(m.db, m.lea, m.u, id), { commencee: false });
  T.creerTable(m.db, m.mj, m.u, id);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1), pion('b', 8, 5), { type: 'reveler_rect', x: 0, y: 0, l: 3, h: 3 }]);
  T.definirProprietaire(m.db, m.mj, m.u, id, 'a', m.leaId);
  const v = T.lireTable(m.db, m.lea, m.u, id) as any;
  assert.equal(v.commencee, true);
  assert.equal('peutEcrire' in v, false);
  assert.equal('proprietaires' in v, false);
  assert.equal('etat' in v, false);
  assert.deepEqual(v.pions.map((p: any) => p.id), ['a'], 'le pion sous le brouillard n’est pas rendu');
  assert.equal(JSON.stringify(v).includes('proprietaire'), false);
  // le MJ en mode joueur lit comme un joueur
  const mj = T.lireTable(m.db, m.mjJoueur, m.u, id) as any;
  assert.equal('peutEcrire' in mj, false);
  assert.deepEqual(mj.pions.map((p: any) => p.id), ['a']);
  const sans = carte(m);
  assert.deepEqual(T.lireTable(m.db, m.mjJoueur, m.u, sans), { commencee: false });
});

test('écritures : une commande de joueur est refuse, le MJ en mode joueur aussi ; création idempotente interdite aux autres', () => {
  const m = monde();
  const id = jouee(m);
  for (const qui of [m.lea, m.mjJoueur]) {
    assert.equal(err(() => T.appliquerCommandesTable(m.db, qui, m.u, id, 1, [pion('a', 1, 1)])).code, 'refuse');
    assert.equal(err(() => T.definirProprietaire(m.db, qui, m.u, id, 'a', null)).code, 'refuse');
  }
  const sans = carte(m);
  assert.equal(err(() => T.creerTable(m.db, m.lea, m.u, sans)).code, 'refuse');
  assert.equal(err(() => T.creerTable(m.db, m.mjJoueur, m.u, sans)).code, 'refuse');
  assert.equal(rows(m.db, 'bm_tables'), 1);
  assert.equal((T.lireTable(m.db, m.mj, m.u, id) as any).version, 1);
});

test('carte cachée : introuvable pour un joueur, un non-membre, un MJ en mode joueur — en lecture et en écriture ; carte inconnue ou d’un autre univers aussi', () => {
  const m = monde();
  const id = jouee(m, false);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1)]);
  const autre = creerUnivers(m.db, m.antor, { nom: 'V' }).id;
  for (const qui of [m.lea, m.zoe, m.mjJoueur]) {
    assert.equal(err(() => T.lireTable(m.db, qui, m.u, id)).code, 'introuvable');
    assert.equal(err(() => T.appliquerCommandesTable(m.db, qui, m.u, id, 2, [pion('b', 2, 2)])).code, 'introuvable');
    assert.equal(err(() => T.definirProprietaire(m.db, qui, m.u, id, 'a', null)).code, 'introuvable');
    assert.equal(err(() => T.creerTable(m.db, qui, m.u, id)).code, 'introuvable');
  }
  assert.equal(err(() => T.lireTable(m.db, m.mj, m.u, 9999)).code, 'introuvable');
  assert.equal(err(() => T.lireTable(m.db, m.mj, autre, id)).code, 'introuvable');
  // non-membre sur une carte visible aussi
  const vis = carte(m);
  assert.equal(err(() => T.lireTable(m.db, m.zoe, m.u, vis)).code, 'introuvable');
  // même silence : message identique
  assert.equal(err(() => T.lireTable(m.db, m.lea, m.u, id)).message, err(() => T.lireTable(m.db, m.lea, m.u, 9999)).message);
});

test('propriétaire : un membre ou null ; non-membre, id faux, pion inconnu refusés ; la version avance dans la même opération', () => {
  const m = monde();
  const id = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1)]);
  const r = T.definirProprietaire(m.db, m.mj, m.u, id, 'a', m.leaId);
  assert.equal(r.version, 3);
  assert.deepEqual((T.lireTable(m.db, m.mj, m.u, id) as any).proprietaires, { a: m.leaId });
  assert.equal(T.definirProprietaire(m.db, m.mj, m.u, id, 'a', m.antor).version, 4, 'remplacer');
  assert.deepEqual((T.lireTable(m.db, m.mj, m.u, id) as any).proprietaires, { a: m.antor });
  for (const c of [m.zoeId, 9999, 0, -1, 1.5, '1', undefined]) {
    const e = err(() => T.definirProprietaire(m.db, m.mj, m.u, id, 'a', c));
    assert.equal(e.code, 'invalide', String(c));
  }
  assert.equal((T.lireTable(m.db, m.mj, m.u, id) as any).version, 4, 'les refus n’avancent pas la version');
  assert.equal(err(() => T.definirProprietaire(m.db, m.mj, m.u, id, 'fantome', m.leaId)).code, 'introuvable');
  assert.equal(T.definirProprietaire(m.db, m.mj, m.u, id, 'a', null).version, 5);
  assert.deepEqual((T.lireTable(m.db, m.mj, m.u, id) as any).proprietaires, {});
  const sans = carte(m);
  assert.equal(err(() => T.definirProprietaire(m.db, m.mj, m.u, sans, 'a', null)).code, 'introuvable');
  // un lot périmé après un changement de propriétaire
  assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 4, [pion('b', 2, 2)])).detail, 'version');
});

test('retirer un pion ou réinitialiser emporte ses propriétaires ; réinitialiser vide pions, brouillard, vue et calques masqués', () => {
  const m = monde();
  const id = jouee(m);
  let v = T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1), pion('b', 2, 2), { type: 'reveler_rect', x: 0, y: 0, l: 4, h: 4 },
    { type: 'partager_vue', vue: { x: 0, y: 0, l: 4, h: 4 } }, { type: 'regler_calque_joueurs', calque: 'objets', montre: false }]).version;
  T.definirProprietaire(m.db, m.mj, m.u, id, 'a', m.leaId); v++;
  T.definirProprietaire(m.db, m.mj, m.u, id, 'b', m.antor); v++;
  assert.equal(rows(m.db, 'bm_pions_proprietaires'), 2);
  v = T.appliquerCommandesTable(m.db, m.mj, m.u, id, v, [{ type: 'retirer_pion', id: 'a' }]).version;
  assert.deepEqual((T.lireTable(m.db, m.mj, m.u, id) as any).proprietaires, { b: m.antor });
  const avant = (T.lireTable(m.db, m.mj, m.u, id) as any).etat;
  assert.notEqual(avant.vue, null);
  assert.deepEqual(avant.calques_masques, ['objets']);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, v, [{ type: 'reinitialiser' }]);
  const t = T.lireTable(m.db, m.mj, m.u, id) as any;
  const vide = JSON.parse(K.etatVide(12, 8));
  assert.deepEqual(t.etat, vide);
  assert.deepEqual(t.proprietaires, {});
  assert.equal(rows(m.db, 'bm_pions_proprietaires'), 0);
  assert.equal(rows(m.db, 'bm_tables'), 1, 'la table reste');
});

test('rogner une carte jouée rogne le brouillard et la vue ; l’agrandir ajoute des cases cachées ; la version de la table avance', () => {
  const m = monde();
  const id = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1), { type: 'reveler_rect', x: 0, y: 0, l: 12, h: 8 },
    { type: 'partager_vue', vue: { x: 6, y: 2, l: 6, h: 6 } }]);
  const avant = (T.lireTable(m.db, m.mj, m.u, id) as any);
  C.reglerCarte(m.db, m.mj, m.u, id, 2, { largeur: 8, hauteur: 5 });
  const t = T.lireTable(m.db, m.mj, m.u, id) as any;
  assert.equal(t.version, avant.version + 1);
  assert.notEqual(t.etat.brouillard, avant.etat.brouillard);
  assert.equal(Buffer.from(t.etat.brouillard, 'base64').length, Math.ceil(8 * 5 / 8));
  const v = t.etat.vue;
  assert.ok(v === null || (v.x + v.l <= 8 && v.y + v.h <= 5), `vue ramenée dans la carte : ${JSON.stringify(v)}`);
  assert.deepEqual(t.etat.pions.map((p: any) => p.id), ['a']);
  // agrandir : les cases ajoutées sont cachées
  C.reglerCarte(m.db, m.mj, m.u, id, 3, { largeur: 16, hauteur: 10 });
  const g = T.lireTable(m.db, m.mj, m.u, id) as any;
  const bits = Buffer.from(g.etat.brouillard, 'base64');
  assert.equal(bits.length, Math.ceil(16 * 10 / 8));
  const revele = (x: number, y: number) => (bits[(y * 16 + x) >> 3]! >> ((y * 16 + x) & 7)) & 1;
  assert.equal(revele(0, 0), 1);
  assert.equal(revele(12, 0), 0);
  assert.equal(revele(0, 9), 0);
});

test('rogner une carte jouée refuse (limite_depassee, champ taille) si un pion sortirait ; rien ne change', () => {
  const m = monde();
  const id = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('loin', 10, 6)]);
  const avantT = JSON.stringify(T.lireTable(m.db, m.mj, m.u, id));
  const avantC = C.lireCarte(m.db, m.mj, m.u, id);
  for (const [l, h] of [[8, 8], [12, 5], [10, 6]] as const) {
    const e = err(() => C.reglerCarte(m.db, m.mj, m.u, id, 2, { largeur: l, hauteur: h }));
    assert.deepEqual([e.code, e.detail, e.champ], ['invalide', 'limite_depassee', 'taille'], `${l}x${h}`);
  }
  assert.equal(JSON.stringify(T.lireTable(m.db, m.mj, m.u, id)), avantT);
  const apres = C.lireCarte(m.db, m.mj, m.u, id);
  assert.deepEqual([apres.largeur, apres.hauteur, apres.version], [avantC.largeur, avantC.hauteur, avantC.version]);
  // 11 × 7 contient encore le pion
  C.reglerCarte(m.db, m.mj, m.u, id, 2, { largeur: 11, hauteur: 7 });
  assert.equal(C.lireCarte(m.db, m.mj, m.u, id).largeur, 11);
});

test('un pion à emprise (asset 2 × 2) compte avec son emprise pour le rognage', async () => {
  const m = monde();
  const grand = await asset(m, { largeur: 2, hauteur: 2 });
  const id = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('g', 9, 5, { asset_id: grand })]);
  const e = err(() => C.reglerCarte(m.db, m.mj, m.u, id, 2, { largeur: 10, hauteur: 8 }));
  assert.equal(e.detail, 'limite_depassee');
  C.reglerCarte(m.db, m.mj, m.u, id, 2, { largeur: 11, hauteur: 8 });
});

test('une carte sans table se redimensionne comme avant', () => {
  const m = monde();
  const id = carte(m);
  C.reglerCarte(m.db, m.mj, m.u, id, 2, { largeur: 5, hauteur: 5 });
  assert.equal(rows(m.db, 'bm_tables'), 0);
});

test('supprimer la carte supprime sa table et ses propriétaires, pas ceux d’une autre carte', () => {
  const m = monde();
  const a = jouee(m); const b = jouee(m);
  for (const id of [a, b]) {
    T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('p', 1, 1)]);
    T.definirProprietaire(m.db, m.mj, m.u, id, 'p', m.leaId);
  }
  C.supprimerCarte(m.db, m.mj, m.u, a);
  assert.equal(rows(m.db, 'bm_tables'), 1);
  assert.equal(rows(m.db, 'bm_pions_proprietaires'), 1);
  assert.equal((m.db.prepare('SELECT carte_id FROM bm_tables').get() as any).carte_id, b);
});

test('supprimer l’univers supprime tables et propriétaires, et laisse ceux d’un autre univers', () => {
  const m = monde();
  const a = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, a, 1, [pion('p', 1, 1)]);
  T.definirProprietaire(m.db, m.mj, m.u, a, 'p', m.leaId);
  const v = creerUnivers(m.db, m.antor, { nom: 'V' }).id;
  const { id: cv } = C.creerCarte(m.db, m.mj, v, { titre: 'Autre' });
  T.creerTable(m.db, m.mj, v, cv);
  T.appliquerCommandesTable(m.db, m.mj, v, cv, 1, [pion('p', 1, 1)]);
  T.definirProprietaire(m.db, m.mj, v, cv, 'p', m.antor);
  supprimerUnivers(m.db, m.mj, m.u, 'U');
  assert.equal(rows(m.db, 'bm_cartes'), 1);
  assert.equal(rows(m.db, 'bm_tables'), 1);
  assert.equal(rows(m.db, 'bm_pions_proprietaires'), 1);
});

test('compter / effacer du module : tables de jeu et propriétaires, effacés avant les cartes ; pas d’effet hors univers', () => {
  const m = monde();
  const a = jouee(m);
  T.appliquerCommandesTable(m.db, m.mj, m.u, a, 1, [pion('p', 1, 1), pion('q', 2, 2)]);
  T.definirProprietaire(m.db, m.mj, m.u, a, 'p', m.leaId);
  T.definirProprietaire(m.db, m.mj, m.u, a, 'q', m.antor);
  const compte = battlemapCartes.donnees!.compter(m.db, { niveau: 'univers', universId: m.u } as any) as any[];
  const parCle = Object.fromEntries(compte.map((l) => [l.cle, l.nombre]));
  assert.equal(parCle.tables, 1);
  assert.equal(parCle.proprietaires, 2);
  assert.equal(compte.find((l) => l.cle === 'tables').pluriel, 'tables de jeu');
  battlemapCartes.donnees!.effacer(m.db, { niveau: 'univers', universId: m.u } as any);
  assert.equal(rows(m.db, 'bm_cartes') + rows(m.db, 'bm_tables') + rows(m.db, 'bm_pions_proprietaires'), 0);
  assert.equal(m.db.pragma('foreign_key_check').length, 0);
});

test('octets : aucune chaîne secrète n’apparaît dans la table d’un joueur ni dans la carte lue', async () => {
  const m = monde();
  const mjSeul = await asset(m);
  A.modifierAssets(m.db, m.mj, m.u, [Number(mjSeul)], { visible: false });
  const ok = await asset(m);
  const cachee = creerFiche(m.db, m.antor, m.u, { type: 'lieu', titre: 'SECRET-FICHE-TITRE', charge: {}, sections: [{ titre: 'S', joueursLisent: false }] }).id;
  const lisible = creerFiche(m.db, m.antor, m.u, { type: 'lieu', titre: 'Pub', charge: {}, sections: [{ titre: 'S', joueursLisent: true }] }).id;
  const id = carte(m, true, 20, 10);
  C.appliquerCommandes(m.db, m.mj, m.u, id, 2, [
    { type: 'peindre_sol', calque: 'sol', cellules: [{ x: 1, y: 1 }, { x: 15, y: 8 }], asset_id: ok },
  ]);
  T.creerTable(m.db, m.mj, m.u, id);
  T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [
    pion('visible', 1, 1, { nom: 'Mira', fiche_id: String(lisible) }),
    pion('cache', 2, 2, { nom: 'SECRET-PION-CACHE', visible: false }),
    pion('brume', 15, 8, { nom: 'SECRET-PION-BROUILLARD' }),
    pion('mjseul', 1, 2, { nom: 'Vox', asset_id: mjSeul }),
    pion('fichecachee', 2, 1, { nom: 'Rhok', fiche_id: String(cachee) }),
    { type: 'reveler_rect', x: 0, y: 0, l: 5, h: 5 },
  ]);
  const t = T.lireTable(m.db, m.lea, m.u, id) as any;
  const octets = JSON.stringify([t, C.lireCarte(m.db, m.lea, m.u, id), T.lireTable(m.db, m.mjJoueur, m.u, id)]);
  for (const secret of ['SECRET-PION-CACHE', 'SECRET-PION-BROUILLARD', 'SECRET-FICHE-TITRE', `"asset_id":"${mjSeul}"`]) {
    assert.equal(octets.includes(secret), false, secret);
  }
  assert.equal(octets.includes(`"${cachee}"`), false, 'la fiche illisible n’est pas référencée');
  const ids = t.pions.map((p: any) => p.id).sort();
  assert.deepEqual(ids, ['fichecachee', 'mjseul', 'visible']);
  assert.equal(t.pions.find((p: any) => p.id === 'mjseul').asset_id, null, 'asset MJ seul : disque simple');
  assert.equal(t.pions.find((p: any) => p.id === 'visible').fiche_id, String(lisible));
  assert.equal(t.pions.find((p: any) => p.id === 'fichecachee').fiche_id, null);
});

test('références : asset ou fiche inconnus, ou d’un autre univers, refusés (asset_inconnu, fiche_inconnue)', async () => {
  const m = monde();
  const id = jouee(m);
  const v = creerUnivers(m.db, m.antor, { nom: 'V' }).id;
  const etr = creerFiche(m.db, m.antor, v, { type: 'lieu', titre: 'Ailleurs', charge: {} }).id;
  assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1, { asset_id: '99999' })])).detail, 'asset_inconnu');
  assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1, { fiche_id: String(etr) })])).detail, 'fiche_inconnue');
  assert.equal(err(() => T.appliquerCommandesTable(m.db, m.mj, m.u, id, 1, [pion('a', 1, 1), { type: 'regler_pion', id: 'a', fiche_id: '99999' }])).detail, 'fiche_inconnue');
  assert.equal((T.lireTable(m.db, m.mj, m.u, id) as any).version, 1);
});

test('0049 : une base au schéma 0048 (carte, univers) monte sans perte ; contraintes des deux tables vivantes', async () => {
  const { copyFileSync, mkdirSync, readdirSync } = await import('node:fs');
  const src = new URL('../db/migrations/', import.meta.url).pathname;
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(src)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 48) copyFileSync(src + f, dir + f);
  const db = openDb(':memory:');
  migrate(db, dir);
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'a', 'x')").run();
  db.prepare("INSERT INTO univers (id, cle, nom, cree_le) VALUES (1, 'un', 'U', 'x')").run();
  const doc = '{"schema":1}';
  db.prepare("INSERT INTO bm_cartes (id, univers_id, titre, visible, largeur, hauteur, taille_case, document, version, cree_le, modifie_le) VALUES (1, 1, 'C', 1, 4, 4, 70, ?, 3, 'x', 'x')").run(doc);
  const avant = db.prepare('SELECT * FROM bm_cartes').all();
  assert.deepEqual(migrate(db), [49, 50, 51, 52, 53]);
  assert.deepEqual(db.prepare('SELECT * FROM bm_cartes').all(), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const t = (etat: string, v = 1, c = 1) => db.prepare("INSERT INTO bm_tables (carte_id, etat, version, cree_le, modifie_le) VALUES (?, ?, ?, 'x', 'x')").run(c, etat, v);
  assert.throws(() => t('pas du json'), /CHECK/);
  assert.throws(() => t('{}', 0), /CHECK/);
  assert.throws(() => t('{}', 1, 99), /FOREIGN KEY/);
  t('{}');
  assert.throws(() => t('{}'), /UNIQUE|PRIMARY/);
  const p = (pid: string, c = 1, cmp = 1) => db.prepare('INSERT INTO bm_pions_proprietaires (carte_id, pion_id, compte_id) VALUES (?, ?, ?)').run(c, pid, cmp);
  assert.throws(() => p(''), /CHECK/);
  assert.throws(() => p('x'.repeat(21)), /CHECK/);
  assert.throws(() => p('a', 1, 99), /FOREIGN KEY/);
  p('a');
  assert.throws(() => p('a'), /UNIQUE|PRIMARY/);
  db.prepare('DELETE FROM bm_cartes WHERE id = 1').run();
  assert.equal((db.prepare('SELECT COUNT(*) n FROM bm_tables').get() as any).n + (db.prepare('SELECT COUNT(*) n FROM bm_pions_proprietaires').get() as any).n, 0);
});
