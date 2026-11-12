// Review tests of kanevas-battlemap-assets-noyau (B-96, B-97, B-98, B-110, AD-150 to AD-152, AD-battlemap-assets-2/3/5).
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
const F = await import('./fichiers.js');
const A = await import('./battlemap-assets.js');
const D = await import('./battlemap-direction.js');
const { modulesActifs } = await import('../outils/registre.js');
const O = await import('./outils-donnees.js');
type Db = ReturnType<typeof openDb>;

const PNG = (n = 1) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, 2, 3, 4]);
const flux = (n = 1) => Readable.from([PNG(n)]);
const TXT = () => Readable.from([Buffer.from('juste du texte')]);

function err(fn: () => unknown): { code: string; detail?: string } {
  try { fn(); } catch (e: any) { return e; }
  assert.fail('aucune erreur levée');
}
async function errA(fn: () => Promise<unknown>): Promise<{ code: string; detail?: string }> {
  try { await fn(); } catch (e: any) { return e; }
  assert.fail('aucune erreur levée');
}

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  const v = creerUnivers(db, antor, { nom: 'V' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  const racine = mkdtempSync(join(tmpdir(), 'bm-'));
  return {
    db, u, v, racine, mj: { compteId: antor }, mjJoueur: { compteId: antor, modeJoueur: true }, lea: { compteId: lea }, zoe: { compteId: zoe },
  };
}
type M = ReturnType<typeof monde>;
let n = 0;
const ajouter = (m: M, saisie: any = {}, u = m.u) => A.ajouterAsset(m.db, m.mj, u, flux(++n % 200), `img${n}.png`, saisie, m.racine);
const fichierMedia = async (m: M, u = m.u) => (await F.ajouterFichier(m.db, m.mj, u, flux(++n % 200), `m${n}.png`, { ou: 'mediatheque' }, m.racine)).id;
const compte = (db: Db, t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n as number;

test('un MJ ajoute une image comme asset : objet 1×1, visible, nom du fichier sans extension', async () => {
  const m = monde();
  const a = await A.ajouterAsset(m.db, m.mj, m.u, flux(), 'Tonneau rouge.png', {}, m.racine);
  assert.equal(a.nom, 'Tonneau rouge');
  assert.equal(a.categorie, 'objet');
  assert.deepEqual([a.largeur, a.hauteur, a.visible, a.etat, a.vueDessus], [1, 1, true, 'valide', true]);
});

test('écriture : non-MJ et étranger introuvable, MJ en mode Joueur refuse', async () => {
  const m = monde();
  for (const qui of [m.lea, m.zoe]) {
    assert.equal((await errA(() => A.ajouterAsset(m.db, qui, m.u, flux(), 'a.png', {}, m.racine))).code, 'introuvable');
  }
  assert.equal((await errA(() => A.ajouterAsset(m.db, m.mjJoueur, m.u, flux(), 'a.png', {}, m.racine))).code, 'refuse');
  const a = await ajouter(m);
  for (const [qui, code] of [[m.lea, 'introuvable'], [m.zoe, 'introuvable'], [m.mjJoueur, 'refuse']] as const) {
    assert.equal(err(() => A.modifierAssets(m.db, qui, m.u, [a.id], { nom: 'x' })).code, code);
    assert.equal(err(() => A.retirerAssets(m.db, qui, m.u, [a.id])).code, code);
    assert.equal(err(() => A.compterUsage(m.db, qui, m.u, [a.id])).code, code);
  }
  assert.equal(compte(m.db, 'bm_assets'), 1);
  assert.equal(A.listerAssets(m.db, m.mj, m.u).assets[0]!.nom, a.nom);
});

test('ajout refusé : un fichier non image laisse zéro fichier et zéro asset', async () => {
  const m = monde();
  const avant = compte(m.db, 'fichiers');
  const e = await errA(() => A.ajouterAsset(m.db, m.mj, m.u, TXT(), 'notes.txt', {}, m.racine));
  assert.equal(e.code, 'invalide');
  assert.equal(compte(m.db, 'fichiers'), avant);
  assert.equal(compte(m.db, 'bm_assets'), 0);
});

test('ajout refusé avant dépôt : nom de 81 caractères, empreinte de 21, empreinte sur un sol, 11 étiquettes, catégorie inconnue', async () => {
  const m = monde();
  const cas: [any, string][] = [
    [{ nom: 'x'.repeat(81) }, 'nom_invalide'],
    [{ largeur: 21, hauteur: 1 }, 'empreinte_invalide'],
    [{ largeur: 1, hauteur: 0 }, 'empreinte_invalide'],
    [{ largeur: 1.5, hauteur: 1 }, 'empreinte_invalide'],
    [{ categorie: 'sol', largeur: 1, hauteur: 1 }, 'empreinte_invalide'],
    [{ categorie: 'mur', largeur: 2, hauteur: null }, 'empreinte_invalide'],
    [{ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 'tags_invalides'],
    [{ tags: ['x'.repeat(31)] }, 'tags_invalides'],
    [{ categorie: 'zzz' }, 'categorie_invalide'],
  ];
  for (const [saisie, detail] of cas) {
    const e = await errA(() => A.ajouterAsset(m.db, m.mj, m.u, flux(), 'a.png', saisie, m.racine));
    assert.deepEqual([e.code, e.detail], ['invalide', detail], JSON.stringify(saisie));
  }
  assert.equal(compte(m.db, 'fichiers'), 0);
  // Limites acceptées : 80, 20×20, 10 étiquettes, sol sans empreinte.
  await A.ajouterAsset(m.db, m.mj, m.u, flux(1), 'a.png', { nom: 'x'.repeat(80), largeur: 20, hauteur: 20, tags: Array.from({ length: 10 }, (_, i) => `t${i}`) }, m.racine);
  const sol = await A.ajouterAsset(m.db, m.mj, m.u, flux(2), 'b.png', { categorie: 'sol' }, m.racine);
  assert.deepEqual([sol.largeur, sol.hauteur], [null, null]);
});

test('deux assets sur un même fichier : conflit fichier_deja_asset ; fichier non image : pas_une_image', async () => {
  const m = monde();
  const f = await fichierMedia(m);
  const a = A.ajouterAssetDepuisFichier(m.db, m.mj, m.u, f, { nom: 'Un' });
  assert.equal(a.visible, true);
  const e = err(() => A.ajouterAssetDepuisFichier(m.db, m.mj, m.u, f, { nom: 'Deux' }));
  assert.deepEqual([e.code, e.detail], ['conflit', 'fichier_deja_asset']);
  const t = (await F.ajouterFichier(m.db, m.mj, m.u, TXT(), 'a.txt', { ou: 'mediatheque' }, m.racine)).id;
  assert.equal(err(() => A.ajouterAssetDepuisFichier(m.db, m.mj, m.u, t)).detail, 'pas_une_image');
  // Fichier d'un autre univers : introuvable.
  const autre = await fichierMedia(m, m.v);
  assert.equal(err(() => A.ajouterAssetDepuisFichier(m.db, m.mj, m.u, autre)).code, 'introuvable');
  const f3 = await fichierMedia(m);
  assert.equal(err(() => A.ajouterAssetDepuisFichier(m.db, m.lea, m.u, f3)).code, 'introuvable');
});

test('le 5 001e asset est refusé bibliotheque_pleine, le 5 000e passe ; une autre bibliothèque est libre', async () => {
  const m = monde();
  const ins = m.db.prepare("INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le) VALUES (?, 'f', 'image/png', 1, ?, 'joueurs', ?, 'x')");
  m.db.transaction(() => {
    for (let i = 0; i < 4999; i++) {
      const id = Number(ins.run(m.u, `d${i}`, m.mj.compteId).lastInsertRowid);
      m.db.prepare("INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, cree_le) VALUES (?, ?, 'a', 'objet', 1, 1, 'x')").run(m.u, id);
    }
  })();
  const cinqMille = await ajouter(m);
  assert.ok(cinqMille.id);
  assert.equal(compte(m.db, 'bm_assets'), 5000);
  const avant = compte(m.db, 'fichiers');
  const e = await errA(() => ajouter(m));
  assert.deepEqual([e.code, e.detail], ['conflit', 'bibliotheque_pleine']);
  assert.equal(compte(m.db, 'fichiers'), avant, 'aucun fichier orphelin');
  const f = await fichierMedia(m);
  assert.equal(err(() => A.ajouterAssetDepuisFichier(m.db, m.mj, m.u, f)).detail, 'bibliotheque_pleine');
  await ajouter(m, {}, m.v);
});

test('liste d’un joueur : ni asset mj, ni brouillon, ni leur compte ; le MJ voit tout ; MJ en mode Joueur lit comme un joueur', async () => {
  const m = monde();
  const visible = await ajouter(m, { categorie: 'objet', nom: 'Visible' });
  const cache = await ajouter(m, { categorie: 'decor', nom: 'Caché' });
  const brouillon = await ajouter(m, { categorie: 'sol', nom: 'Brouillon' });
  A.modifierAssets(m.db, m.mj, m.u, [cache.id], { visible: false });
  m.db.prepare("UPDATE bm_assets SET etat = 'brouillon' WHERE id = ?").run(brouillon.id);
  for (const qui of [m.lea, m.mjJoueur]) {
    const l = A.listerAssets(m.db, qui, m.u);
    assert.deepEqual(l.assets.map((a) => a.nom), ['Visible']);
    assert.deepEqual(l.comptes, { objet: 1, vaisseau: 0, decor: 0, sol: 0, mur: 0, total: 1 });
    assert.deepEqual(A.listerAssets(m.db, qui, m.u, { q: 'cach' }).assets, []);
    assert.deepEqual(A.listerAssets(m.db, qui, m.u, { categorie: 'decor' }).comptes.decor, 0);
  }
  const l = A.listerAssets(m.db, m.mj, m.u);
  assert.equal(l.assets.length, 3);
  assert.deepEqual(l.comptes, { objet: 1, vaisseau: 0, decor: 1, sol: 1, mur: 0, total: 3 });
  assert.equal(l.assets.find((a) => a.id === cache.id)!.visible, false);
  assert.ok(visible.id);
  assert.equal(err(() => A.listerAssets(m.db, m.zoe, m.u)).code, 'introuvable');
});

test('filtres : catégorie (comptes inchangés), recherche nom/étiquette sans casse et joker littéral, étiquettes en ET', async () => {
  const m = monde();
  await ajouter(m, { nom: 'Caisse', tags: ['bois', 'Cargo'] });
  await ajouter(m, { nom: 'Baril 100%', tags: ['bois'], categorie: 'decor' });
  await ajouter(m, { nom: 'Dalle', categorie: 'sol', tags: ['pierre'] });
  const l = A.listerAssets(m.db, m.mj, m.u, { categorie: 'objet' });
  assert.deepEqual(l.assets.map((a) => a.nom), ['Caisse']);
  assert.equal(l.comptes.total, 3);
  assert.deepEqual(A.listerAssets(m.db, m.mj, m.u, { q: 'CARGO' }).assets.map((a) => a.nom), ['Caisse']);
  assert.deepEqual(A.listerAssets(m.db, m.mj, m.u, { q: '%' }).assets.map((a) => a.nom), ['Baril 100%']);
  assert.deepEqual(A.listerAssets(m.db, m.mj, m.u, { q: '_' }).assets, []);
  assert.deepEqual(A.listerAssets(m.db, m.mj, m.u, { tags: ['bois'] }).assets.length, 2);
  assert.deepEqual(A.listerAssets(m.db, m.mj, m.u, { tags: ['bois', 'cargo'] }).assets.map((a) => a.nom), ['Caisse']);
  assert.equal(A.listerAssets(m.db, m.mj, m.u, { q: 'bois', categorie: 'sol' }).comptes.total, 2);
  assert.equal(err(() => A.listerAssets(m.db, m.mj, m.u, { categorie: 'x' })).detail, 'categorie_invalide');
});

test('modifierAssets : tout ou rien (un id étranger, une empreinte sur sol, un nom trop long)', async () => {
  const m = monde();
  const a = await ajouter(m, { nom: 'A', tags: ['x'] });
  const b = await ajouter(m, { nom: 'B', categorie: 'sol' });
  const etranger = await ajouter(m, { nom: 'Z' }, m.v);
  const avant = JSON.stringify(A.listerAssets(m.db, m.mj, m.u));
  assert.equal(err(() => A.modifierAssets(m.db, m.mj, m.u, [a.id, etranger.id], { nom: 'N' })).code, 'introuvable');
  assert.equal(err(() => A.modifierAssets(m.db, m.mj, m.u, [a.id, 99999], { nom: 'N' })).code, 'introuvable');
  assert.equal(err(() => A.modifierAssets(m.db, m.mj, m.u, [a.id, b.id], { largeur: 2, hauteur: 2 })).detail, 'empreinte_invalide');
  assert.equal(err(() => A.modifierAssets(m.db, m.mj, m.u, [a.id, b.id], { nom: 'x'.repeat(81) })).detail, 'nom_invalide');
  assert.equal(err(() => A.modifierAssets(m.db, m.mj, m.u, [], { nom: 'N' })).code, 'invalide');
  assert.equal(JSON.stringify(A.listerAssets(m.db, m.mj, m.u)), avant);
  // Échec au milieu : le premier est déjà écrit dans la transaction, mais tout est défait ; la visibilité aussi.
  assert.equal(err(() => A.modifierAssets(m.db, m.mj, m.u, [a.id, b.id], { visible: false, largeur: 3, hauteur: 3 })).code, 'invalide');
  assert.equal(JSON.stringify(A.listerAssets(m.db, m.mj, m.u)), avant);
});

test('modifierAssets : empreinte 2×1 sur une sélection, étiquettes, visibilité écrite sur le fichier, changement de catégorie', async () => {
  const m = monde();
  const a = await ajouter(m, { nom: 'A' });
  const b = await ajouter(m, { nom: 'B' });
  const r = A.modifierAssets(m.db, m.mj, m.u, [a.id, b.id, a.id], { largeur: 2, hauteur: 1, tags: ['Bois', 'bois', ' neuf '], visible: false });
  assert.equal(r.length, 2);
  for (const x of r) assert.deepEqual([x.largeur, x.hauteur, x.tags, x.visible], [2, 1, ['Bois', 'neuf'], false]);
  assert.equal((m.db.prepare('SELECT visibilite v FROM fichiers WHERE id = ?').get(a.fichierId) as any).v, 'mj');
  assert.deepEqual(A.listerAssets(m.db, m.lea, m.u).assets, []);
  const s = A.modifierAssets(m.db, m.mj, m.u, [a.id], { categorie: 'sol' })[0]!;
  assert.deepEqual([s.largeur, s.hauteur], [null, null]);
  const o = A.modifierAssets(m.db, m.mj, m.u, [a.id], { categorie: 'vaisseau' })[0]!;
  assert.deepEqual([o.largeur, o.hauteur], [1, 1]);
});

test('retirer une sélection : lignes supprimées, fichiers gardés ; usage 0 ; tout ou rien', async () => {
  const m = monde();
  const a = await ajouter(m); const b = await ajouter(m);
  assert.equal(A.compterUsage(m.db, m.mj, m.u, [a.id, b.id]), 0);
  assert.equal(err(() => A.compterUsage(m.db, m.mj, m.u, [a.id, 99999])).code, 'introuvable');
  assert.equal(err(() => A.retirerAssets(m.db, m.mj, m.u, [a.id, 99999])).code, 'introuvable');
  assert.equal(compte(m.db, 'bm_assets'), 2);
  const fichiers = compte(m.db, 'fichiers');
  assert.equal(A.retirerAssets(m.db, m.mj, m.u, [a.id, b.id]), 2);
  assert.equal(compte(m.db, 'bm_assets'), 0);
  assert.equal(compte(m.db, 'fichiers'), fichiers);
  // Le fichier retiré peut redevenir un asset ou être effacé.
  A.ajouterAssetDepuisFichier(m.db, m.mj, m.u, a.fichierId);
});

test('effacerFichier : adossé à un asset → conflit fichier_bibliotheque ; une fois l’asset retiré, il s’efface', async () => {
  const m = monde();
  const a = await ajouter(m);
  const e = err(() => F.effacerFichier(m.db, m.mj, m.u, a.fichierId, m.racine));
  assert.deepEqual([e.code, e.detail], ['conflit', 'fichier_bibliotheque']);
  assert.equal(compte(m.db, 'bm_assets'), 1);
  assert.equal(compte(m.db, 'fichiers'), 1);
  A.retirerAssets(m.db, m.mj, m.u, [a.id]);
  F.effacerFichier(m.db, m.mj, m.u, a.fichierId, m.racine);
  assert.equal(compte(m.db, 'fichiers'), 0);
});

test('origines bibliotheque / direction : joueurs / mj ; non-MJ introuvable, MJ en mode Joueur refuse, non-image invalide', async () => {
  const m = monde();
  const b = await F.ajouterFichier(m.db, m.mj, m.u, flux(), 'b.png', { ou: 'bibliotheque' }, m.racine);
  const d = await F.ajouterFichier(m.db, m.mj, m.u, flux(), 'd.png', { ou: 'direction' }, m.racine);
  const vis = (id: number) => (m.db.prepare('SELECT visibilite v FROM fichiers WHERE id = ?').get(id) as any).v;
  assert.deepEqual([vis(b.id), vis(d.id)], ['joueurs', 'mj']);
  for (const ou of ['bibliotheque', 'direction'] as const) {
    assert.equal((await errA(() => F.ajouterFichier(m.db, m.lea, m.u, flux(), 'x.png', { ou }, m.racine))).code, 'introuvable');
    assert.equal((await errA(() => F.ajouterFichier(m.db, m.zoe, m.u, flux(), 'x.png', { ou }, m.racine))).code, 'introuvable');
    assert.equal((await errA(() => F.ajouterFichier(m.db, m.mjJoueur, m.u, flux(), 'x.png', { ou }, m.racine))).code, 'refuse');
    assert.equal((await errA(() => F.ajouterFichier(m.db, m.mj, m.u, TXT(), 'x.txt', { ou }, m.racine))).code, 'invalide');
  }
  assert.equal(compte(m.db, 'fichiers'), 2);
});

test('direction : lecture réservée au MJ hors mode Joueur ; écriture non-MJ introuvable, mode Joueur refuse', () => {
  const m = monde();
  for (const qui of [m.lea, m.zoe, m.mjJoueur]) assert.equal(err(() => D.lireDirection(m.db, qui, m.u)).code, 'introuvable');
  assert.equal(err(() => D.ecrireDirection(m.db, m.lea, m.u, 'x', 0)).code, 'introuvable');
  assert.equal(err(() => D.ecrireDirection(m.db, m.mjJoueur, m.u, 'x', 0)).code, 'refuse');
  const v = D.lireDirection(m.db, m.mj, m.u);
  assert.deepEqual([v.texte, v.textePrecedent, v.version, v.images], ['', null, 0, []]);
});

test('direction : version périmée conflit, texte_precedent gardé, 5 000 passe, 5 001 invalide', () => {
  const m = monde();
  const d1 = D.ecrireDirection(m.db, m.mj, m.u, 'Premier', 0);
  assert.deepEqual([d1.version, d1.textePrecedent], [1, null]);
  assert.equal(err(() => D.ecrireDirection(m.db, m.mj, m.u, 'Perdu', 0)).detail, 'direction_modifiee');
  assert.equal(err(() => D.ecrireDirection(m.db, m.mj, m.u, 'Perdu', 0)).code, 'conflit');
  const d2 = D.ecrireDirection(m.db, m.mj, m.u, 'Second', 1);
  assert.deepEqual([d2.texte, d2.textePrecedent, d2.version], ['Second', 'Premier', 2]);
  // Réécrire le même texte ne perd pas le précédent.
  assert.equal(D.ecrireDirection(m.db, m.mj, m.u, 'Second', 2).textePrecedent, 'Premier');
  const long = D.ecrireDirection(m.db, m.mj, m.u, 'x'.repeat(5000), 3);
  assert.equal(long.texte.length, 5000);
  const e = err(() => D.ecrireDirection(m.db, m.mj, m.u, 'x'.repeat(5001), 4));
  assert.deepEqual([e.code, e.detail], ['invalide', 'texte_trop_long']);
  assert.equal(D.lireDirection(m.db, m.mj, m.u).version, 4);
  assert.equal(err(() => D.ecrireDirection(m.db, m.mj, m.u, 'a', -1)).code, 'invalide');
  assert.equal(err(() => D.ecrireDirection(m.db, m.mj, m.u, 'a', 1.5)).code, 'invalide');
  assert.equal(err(() => D.ecrireDirection(m.db, m.mj, m.u, 'a', '4')).code, 'invalide');
  // Une autre direction n'est pas touchée.
  assert.equal(D.lireDirection(m.db, m.mj, m.v).version, 0);
});

test('références : 8 au plus (la 9e refusée sans fichier), légende, retrait avec rang resserré, fichier gardé', async () => {
  const m = monde();
  for (let i = 0; i < 8; i++) await D.ajouterReference(m.db, m.mj, m.u, flux(i + 1), `r${i}.png`, m.racine);
  const avant = compte(m.db, 'fichiers');
  const e = await errA(() => D.ajouterReference(m.db, m.mj, m.u, flux(50), 'r9.png', m.racine));
  assert.deepEqual([e.code, e.detail], ['conflit', 'limite_references']);
  assert.equal(compte(m.db, 'fichiers'), avant);
  const f = await fichierMedia(m);
  const avant2 = compte(m.db, 'fichiers');
  assert.equal(err(() => D.ajouterReferenceDepuisFichier(m.db, m.mj, m.u, f)).detail, 'limite_references');
  let v = D.lireDirection(m.db, m.mj, m.u);
  assert.equal(v.images.length, 8);
  assert.ok(v.images.every((i) => (m.db.prepare('SELECT visibilite v FROM fichiers WHERE id = ?').get(i.fichierId) as any).v === 'mj'));
  v = D.legenderReference(m.db, m.mj, m.u, v.images[2]!.fichierId, '  Ciel gris  ');
  assert.equal(v.images[2]!.legende, 'Ciel gris');
  assert.equal(err(() => D.legenderReference(m.db, m.mj, m.u, v.images[2]!.fichierId, 'x'.repeat(201))).detail, 'legende_invalide');
  assert.equal(D.legenderReference(m.db, m.mj, m.u, v.images[2]!.fichierId, 'x'.repeat(200)).images[2]!.legende.length, 200);
  assert.equal(err(() => D.legenderReference(m.db, m.mj, m.u, 99999, 'a')).code, 'introuvable');
  const premier = v.images[0]!.fichierId;
  v = D.retirerReference(m.db, m.mj, m.u, premier);
  assert.deepEqual(v.images.map((i) => i.rang), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(compte(m.db, 'fichiers'), avant2);
  assert.equal(err(() => D.retirerReference(m.db, m.mj, m.u, premier)).code, 'introuvable');
  assert.equal(err(() => D.retirerReference(m.db, m.lea, m.u, v.images[0]!.fichierId)).code, 'introuvable');
  assert.equal(err(() => D.retirerReference(m.db, m.mjJoueur, m.u, v.images[0]!.fichierId)).code, 'refuse');
});

test('référence depuis la médiathèque : le fichier devient mj ; un fichier d’asset est refusé et reste visible ; doublon refusé', async () => {
  const m = monde();
  const f = await fichierMedia(m);
  D.ajouterReferenceDepuisFichier(m.db, m.mj, m.u, f);
  assert.equal((m.db.prepare('SELECT visibilite v FROM fichiers WHERE id = ?').get(f) as any).v, 'mj');
  assert.equal(err(() => D.ajouterReferenceDepuisFichier(m.db, m.mj, m.u, f)).detail, 'reference_existante');
  const a = await ajouter(m);
  assert.equal(err(() => D.ajouterReferenceDepuisFichier(m.db, m.mj, m.u, a.fichierId)).detail, 'fichier_bibliotheque');
  assert.equal(A.listerAssets(m.db, m.lea, m.u).assets.length, 1);
  assert.equal(err(() => D.ajouterReferenceDepuisFichier(m.db, m.lea, m.u, f)).code, 'introuvable');
});

test('effacerFichier d’une référence la retire et le fichier part', async () => {
  const m = monde();
  const v = await D.ajouterReference(m.db, m.mj, m.u, flux(), 'r.png', m.racine);
  const fid = v.images[0]!.fichierId;
  F.effacerFichier(m.db, m.mj, m.u, fid, m.racine);
  assert.deepEqual(D.lireDirection(m.db, m.mj, m.u).images, []);
  assert.equal(compte(m.db, 'bm_direction_images'), 0);
  assert.equal(compte(m.db, 'fichiers'), 0);
});

test('le module battlemap est dans modulesActifs ; compter rend assets, références, direction ; effacer ne touche pas aux fichiers ; supprimerUnivers ne bute pas sur RESTRICT', async () => {
  const m = monde();
  const mod = modulesActifs().find((x) => x.nom === 'battlemap');
  assert.ok(mod);
  const outil = mod.outils.find((o) => o.cle === 'battlemap/assets');
  assert.ok(outil?.donnees);
  assert.deepEqual(outil.visibiliteParDefaut, { mj: true, joueur: true });
  const portee = (universId: number) => ({ niveau: 'univers' as const, universId });
  assert.deepEqual(outil.donnees.compter(m.db, portee(m.u)).filter((l) => l.nombre > 0), []);
  await ajouter(m); await ajouter(m);
  await D.ajouterReference(m.db, m.mj, m.u, flux(77), 'r.png', m.racine);
  D.ecrireDirection(m.db, m.mj, m.u, 'Sombre', 0);
  await ajouter(m, {}, m.v);
  const lignes = outil.donnees.compter(m.db, portee(m.u));
  assert.deepEqual(lignes.map((l) => [l.cle, l.nombre]), [['assets', 2], ['references', 1], ['direction', 1]]);
  const fichiers = compte(m.db, 'fichiers');
  outil.donnees.effacer(m.db, portee(m.u));
  assert.deepEqual(outil.donnees.compter(m.db, portee(m.u)).map((l) => l.nombre), [0, 0, 0]);
  assert.equal(compte(m.db, 'fichiers'), fichiers);
  assert.equal((m.db.prepare('SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ?').get(m.v) as any).n, 1, 'l’autre univers reste');
  // supprimerUnivers avec assets (RESTRICT) : ne bute pas.
  await ajouter(m);
  await D.ajouterReference(m.db, m.mj, m.u, flux(78), 'r2.png', m.racine);
  D.ecrireDirection(m.db, m.mj, m.u, 'Encore', 0);
  supprimerUnivers(m.db, m.mj, m.u, 'U');
  assert.equal((m.db.prepare('SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ?').get(m.u) as any).n, 0);
  assert.equal(compte(m.db, 'bm_direction'), 0);
  assert.equal(compte(m.db, 'bm_direction_images'), 0);
  assert.equal((m.db.prepare('SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ?').get(m.v) as any).n, 1);
  assert.deepEqual(m.db.pragma('foreign_key_check'), []);
});

test('suppression des données de l’outil par le chemin D : compte puis efface, activation gardée, conflit si le contenu a changé', async () => {
  const m = monde();
  const { poserActivation } = await import('./outils.js');
  const { creerEtRattacherSysteme } = await import('./systemes.js');
  creerEtRattacherSysteme(m.db, m.mj.compteId, m.u, { nom: 'Sys' });
  poserActivation(m.db, m.mj, { niveau: 'univers', id: m.u }, 'battlemap/assets', true);
  await ajouter(m);
  const portee = { niveau: 'univers' as const, universId: m.u };
  const r = O.resumeSuppression(m.db, m.mj, portee, 'battlemap/assets');
  assert.deepEqual(r.efface.map((l) => [l.cle, l.nombre]), [['assets', 1]]);
  assert.equal(err(() => O.supprimerDonneesOutil(m.db, m.lea, portee, 'battlemap/assets', r.efface)).code, 'introuvable');
  await ajouter(m);
  assert.equal(err(() => O.supprimerDonneesOutil(m.db, m.mj, portee, 'battlemap/assets', r.efface)).detail, 'contenu_change');
  assert.equal(compte(m.db, 'bm_assets'), 2);
  const vu = O.resumeSuppression(m.db, m.mj, portee, 'battlemap/assets').efface;
  O.supprimerDonneesOutil(m.db, m.mj, portee, 'battlemap/assets', vu);
  assert.equal(compte(m.db, 'bm_assets'), 0);
  assert.equal(compte(m.db, 'fichiers'), 2);
});

// --- montée de la migration 0035 sur une base au schéma 0034 ---
const SRC = new URL('../db/migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0035 : montée depuis 0034, données gardées, contraintes vivantes, RESTRICT / CASCADE', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(34));
  const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'bm_%'").all() as { name: string }[]).map((t) => t.name).sort();
  assert.deepEqual(tables(), []);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', '2026-11-01T00:00:00.000Z')").run();
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'a', 'x')").run();
  const avant = db.prepare('SELECT * FROM univers').all();
  assert.deepEqual(migrate(db), [35]);
  assert.deepEqual(tables(), ['bm_assets', 'bm_direction', 'bm_direction_images']);
  assert.deepEqual(db.prepare('SELECT * FROM univers').all(), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(migrate(db), []);
  const fic = (i: number) => db.prepare("INSERT INTO fichiers (id, univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le) VALUES (?, 1, 'f', 'image/png', 1, ?, 'joueurs', 1, 'x')").run(i, `d${i}`);
  [1, 2, 3, 4, 5, 6, 7].forEach(fic);
  const asset = (f: number, cat: string, l: unknown, h: unknown, nom = 'n', tags = '[]', etat = 'valide') =>
    db.prepare('INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, tags, etat, cree_le) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)').run(f, nom, cat, l, h, tags, etat, 'x');
  asset(1, 'objet', 1, 1);
  assert.throws(() => asset(1, 'objet', 1, 1), /UNIQUE/);
  assert.throws(() => asset(2, 'objet', 1, 1, ''), /CHECK/);
  assert.throws(() => asset(2, 'objet', 1, 1, 'x'.repeat(81)), /CHECK/);
  assert.throws(() => asset(2, 'objet', 21, 1), /CHECK/);
  assert.throws(() => asset(2, 'objet', 0, 1), /CHECK/);
  assert.throws(() => asset(2, 'objet', null, null), /CHECK/);
  assert.throws(() => asset(2, 'sol', 1, 1), /CHECK/);
  assert.throws(() => asset(2, 'zzz', 1, 1), /CHECK/);
  assert.throws(() => asset(2, 'objet', 1, 1, 'n', '{}'), /CHECK/);
  assert.throws(() => asset(2, 'objet', 1, 1, 'n', JSON.stringify(Array(11).fill('a'))), /CHECK/);
  assert.throws(() => asset(2, 'objet', 1, 1, 'n', '[]', 'autre'), /CHECK/);
  asset(2, 'sol', null, null);
  assert.throws(() => db.prepare('DELETE FROM fichiers WHERE id = 1').run(), /FOREIGN KEY/);
  db.prepare('INSERT INTO bm_direction (univers_id, texte, modifie_le) VALUES (1, ?, ?)').run('x'.repeat(5000), 'x');
  assert.throws(() => db.prepare('UPDATE bm_direction SET texte = ?').run('x'.repeat(5001)), /CHECK/);
  db.prepare("INSERT INTO bm_direction_images (univers_id, fichier_id, legende, rang) VALUES (1, 3, 'a', 1)").run();
  assert.throws(() => db.prepare("INSERT INTO bm_direction_images (univers_id, fichier_id, legende, rang) VALUES (1, 3, 'a', 2)").run(), /UNIQUE|PRIMARY/);
  assert.throws(() => db.prepare("INSERT INTO bm_direction_images (univers_id, fichier_id, legende, rang) VALUES (1, 4, ?, 2)").run('x'.repeat(201)), /CHECK/);
  db.prepare('DELETE FROM fichiers WHERE id = 3').run();
  assert.equal((db.prepare('SELECT COUNT(*) n FROM bm_direction_images').get() as any).n, 0, 'CASCADE sur la référence');
});
