import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import {
  ajouterElement,
  creerCarte,
  deplacerElement,
  listerCartes,
  lireCarte,
  ouvrirFond,
  reglerCarte,
  remplacerFond,
  retirerElement,
} from './cartes.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche } from './fiches.js';
import { ajouterMembre } from './membres.js';
import { relierSection } from './relations.js';
import { ajouterSection, changerAudience } from './sections.js';
import { creerUnivers } from './univers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32)]);
const flux = (b: Buffer) => Readable.from([b]);

async function err(fn: () => unknown): Promise<ErreurService | null> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  return null;
}
const nb = (db: Db, t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;
const sql = (db: Db, q: string) => {
  try {
    db.exec(q);
    return null;
  } catch (e) {
    return String(e);
  }
};
const fichiers = (r: string) => readdirSync(r).filter((f) => f !== 'tmp');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const racine = mkdtempSync(join(tmpdir(), 'cartes-'));
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'Lame' });
  const u2 = creerUnivers(db, antor.id, { nom: 'Autre' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const aldric = creerFiche(db, antor.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  const faction = creerFiche(db, antor.id, u.id, { type: 'faction', titre: 'Les Ombres de Fer', charge: {} } as never);
  const ailleurs = creerFiche(db, antor.id, u2.id, { type: 'lieu', titre: 'Ailleurs', charge: {} });
  const sA = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Pub', contenu: 'x' });
  changerAudience(db, antor.id, u.id, aldric.id, sA.id, { joueursLisent: true });
  ajouterSection(db, antor.id, u.id, faction.id, { titre: 'Secret', contenu: 'y' });
  return { db, racine, antor, lea, u, u2, aldric, faction, ailleurs };
}
async function carte(m: ReturnType<typeof monde>, forme: 'illustree' | 'graphe' = 'illustree', visible = false) {
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'Carte', forme }, m.racine);
  if (visible) reglerCarte(m.db, m.antor.id, false, c.id, { visible: true });
  return c;
}

test('base : la migration est idempotente et refuse les lignes hors règle', async () => {
  const m = monde();
  assert.deepEqual(migrate(m.db), []);
  const c = await carte(m);
  const g = await carte(m, 'graphe');
  const ins = (cols: string, vals: string) => sql(m.db, `INSERT INTO cartes (univers_id, ${cols}, cree_le) VALUES (${m.u.id}, ${vals}, 'x')`);
  assert.ok(ins('titre, forme', "'t', 'autre'"));
  assert.ok(ins('titre, forme, fond', "'t', 'illustree', 'f1'"), 'fond sans type');
  assert.ok(ins('titre, forme, fond, fond_type', "'t', 'graphe', 'f2', 'image/png'"), 'fond sur graphe');
  assert.ok(ins('titre, forme', "'', 'graphe'"));
  assert.ok(ins('titre, forme', `'${'x'.repeat(81)}', 'graphe'`));
  const el = (cid: number, fid: number, x: string, y: string) =>
    sql(m.db, `INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (${cid}, ${fid}, ${x}, ${y}, 'x')`);
  assert.ok(el(c.id, m.aldric.id, '5', 'NULL'), 'x sans y');
  assert.ok(el(c.id, m.aldric.id, '101', '5'));
  assert.ok(el(c.id, m.aldric.id, '5', '-1'));
  assert.equal(el(c.id, m.aldric.id, '0', '100'), null);
  assert.ok(el(c.id, m.aldric.id, '1', '1'), 'même fiche deux fois');
  assert.equal(el(g.id, m.aldric.id, 'NULL', 'NULL'), null);
  assert.ok(sql(m.db, `DELETE FROM fiches WHERE id = ${m.aldric.id}`), 'fiche placée');
  assert.ok(sql(m.db, `UPDATE cartes SET forme = 'graphe' WHERE id = ${c.id}`));
});

test('creerCarte : carte non visible, fond PNG écrit ; refus sans rien écrire', async () => {
  const m = monde();
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'Plan', forme: 'illustree', fond: flux(PNG) }, m.racine);
  assert.equal(c.visible, false);
  assert.equal(c.fond, true);
  assert.equal(fichiers(m.racine).length, 1);
  const o = await ouvrirFond(m.db, m.antor.id, c.id, m.racine);
  assert.equal(o.type, 'image/png');
  assert.equal(o.taille, PNG.length);
  o.flux.destroy();
  const avant = nb(m.db, 'cartes');
  for (const [b, code] of [[PDF, 'fond_invalide'], [Buffer.alloc(0), 'fond_invalide'], [Buffer.concat([PNG, Buffer.alloc(25 * 1024 * 1024)]), 'fond_trop_lourd']] as const) {
    const e = await err(() => creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'X', forme: 'illustree', fond: flux(b) }, m.racine));
    assert.equal(e?.detail, code);
  }
  assert.equal(nb(m.db, 'cartes'), avant);
  assert.equal(fichiers(m.racine).length, 1);
  assert.deepEqual(readdirSync(join(m.racine, 'tmp')), []);
  assert.equal((await err(() => creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'G', forme: 'graphe', fond: flux(PNG) }, m.racine)))?.detail, 'fond_invalide');
});

test('fond : exactement 25 Mo accepté', async () => {
  const m = monde();
  const b = Buffer.concat([PNG, Buffer.alloc(25 * 1024 * 1024 - PNG.length)]);
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'Gros', forme: 'illustree', fond: flux(b) }, m.racine);
  assert.equal(c.fond, true);
});

test('remplacerFond : nouveau fichier, ligne changée, ancien supprimé ; refus laisse l’ancien', async () => {
  const m = monde();
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'P', forme: 'illustree', fond: flux(PNG) }, m.racine);
  const avant = (m.db.prepare('SELECT fond FROM cartes WHERE id=?').get(c.id) as { fond: string }).fond;
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
  await remplacerFond(m.db, m.antor.id, false, c.id, flux(jpeg), m.racine);
  const apres = m.db.prepare('SELECT fond, fond_type FROM cartes WHERE id=?').get(c.id) as { fond: string; fond_type: string };
  assert.notEqual(apres.fond, avant);
  assert.equal(apres.fond_type, 'image/jpeg');
  assert.equal(existsSync(join(m.racine, avant)), false);
  assert.equal(existsSync(join(m.racine, apres.fond)), true);
  assert.equal((await err(() => remplacerFond(m.db, m.antor.id, false, c.id, flux(PDF), m.racine)))?.detail, 'fond_invalide');
  assert.equal((m.db.prepare('SELECT fond FROM cartes WHERE id=?').get(c.id) as { fond: string }).fond, apres.fond);
  assert.deepEqual(fichiers(m.racine), [apres.fond]);
  const g = await carte(m, 'graphe');
  assert.equal((await err(() => remplacerFond(m.db, m.antor.id, false, g.id, flux(PNG), m.racine)))?.detail, 'fond_invalide');
});

test('titre : vide, blanc, 81 caractères refusés ; 80 accepté', async () => {
  const m = monde();
  for (const titre of ['', '   ', 'x'.repeat(81)]) {
    assert.equal((await err(() => creerCarte(m.db, m.antor.id, false, m.u.id, { titre, forme: 'graphe' }, m.racine)))?.code, 'invalide');
  }
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'x'.repeat(80), forme: 'graphe' }, m.racine);
  assert.equal(err(() => reglerCarte(m.db, m.antor.id, false, c.id, { titre: '' })) !== null, true);
  assert.equal((await err(() => reglerCarte(m.db, m.antor.id, false, c.id, { titre: 'y'.repeat(81) })))?.code, 'invalide');
  assert.equal(nb(m.db, 'cartes'), 1);
});

test('Léa et Antor en mode Joueur ne peuvent rien écrire : refus distinct du refus de lecture', async () => {
  const m = monde();
  const c = await carte(m, 'illustree', true);
  const e = reglerCarte(m.db, m.antor.id, false, c.id, {});
  assert.ok(e);
  const el = ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.aldric.id, x: 1, y: 1 });
  for (const [id, mode] of [[m.lea.id, false], [m.antor.id, true]] as const) {
    const essais: Array<() => unknown> = [
      () => creerCarte(m.db, id, mode, m.u.id, { titre: 'X', forme: 'graphe' }, m.racine),
      () => reglerCarte(m.db, id, mode, c.id, { titre: 'Z' }),
      () => ajouterElement(m.db, id, mode, c.id, { ficheId: m.faction.id, x: 1, y: 1 }),
      () => deplacerElement(m.db, id, mode, c.id, el.id, { x: 9, y: 9 }),
      () => retirerElement(m.db, id, mode, c.id, el.id),
      () => remplacerFond(m.db, id, mode, c.id, flux(PNG), m.racine),
    ];
    for (const f of essais) assert.equal((await err(f))?.code, 'refuse');
  }
  assert.equal(nb(m.db, 'cartes'), 1);
  assert.equal(nb(m.db, 'elements_carte'), 1);
  assert.equal(m.db.prepare('SELECT titre FROM cartes').get().titre, 'Carte');
  // carte cachée : Léa ne sait même pas qu'elle existe
  const h = await carte(m);
  assert.equal((await err(() => reglerCarte(m.db, m.lea.id, false, h.id, { visible: true })))?.code, 'introuvable');
});

test('ajouterElement : arrondi, bord, refus à codes distincts, retrait laisse la fiche', async () => {
  const m = monde();
  const c = await carte(m);
  const a = ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.aldric.id, x: 12.3456, y: 99.999 });
  assert.deepEqual([a.x, a.y], [12.35, 100]);
  const f = ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.faction.id, x: -5, y: 250 });
  assert.deepEqual([f.x, f.y], [0, 100]);
  const code = async (fn: () => unknown) => (await err(fn))?.detail;
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.aldric.id, x: 1, y: 1 })), 'fiche_deja_placee');
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.ailleurs.id, x: 1, y: 1 })), 'fiche_inconnue');
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: 99999, x: 1, y: 1 })), 'fiche_inconnue');
  const p = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'P', forme: 'illustree' }, m.racine);
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, p.id, { ficheId: m.aldric.id })), 'position_invalide');
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, p.id, { ficheId: m.aldric.id, x: 5 })), 'position_invalide');
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, p.id, { ficheId: m.aldric.id, x: NaN, y: 1 })), 'position_invalide');
  const g = await carte(m, 'graphe');
  assert.equal(await code(() => ajouterElement(m.db, m.antor.id, false, g.id, { ficheId: m.aldric.id, x: 1, y: 1 })), 'position_invalide');
  const n = ajouterElement(m.db, m.antor.id, false, g.id, { ficheId: m.aldric.id });
  assert.equal(n.x, undefined);
  assert.equal(nb(m.db, 'elements_carte'), 3);
  const d = deplacerElement(m.db, m.antor.id, false, c.id, a.id, { x: 50.005, y: 0.004 });
  assert.equal(d.y, 0);
  assert.equal(await code(() => deplacerElement(m.db, m.antor.id, false, g.id, n.id, { x: 1, y: 1 })), 'position_invalide');
  retirerElement(m.db, m.antor.id, false, c.id, a.id);
  assert.equal(nb(m.db, 'elements_carte'), 2);
  assert.equal(nb(m.db, 'fiches'), 3);
  assert.equal((await err(() => retirerElement(m.db, m.antor.id, false, c.id, a.id)))?.code, 'introuvable');
});

test('carte pleine : 100 fiches placées, la 101e refusée', async () => {
  const m = monde();
  const c = await carte(m);
  for (let i = 0; i < 100; i++) {
    const f = creerFiche(m.db, m.antor.id, m.u.id, { type: 'lieu', titre: `L${i}`, charge: {} });
    ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: f.id, x: 1, y: 1 });
  }
  const f = creerFiche(m.db, m.antor.id, m.u.id, { type: 'lieu', titre: 'L101', charge: {} });
  const e = await err(() => ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: f.id, x: 1, y: 1 }));
  assert.equal(e?.detail, 'carte_pleine');
  assert.equal(nb(m.db, 'elements_carte'), 100);
});

test('lireCarte : filtrage par rôle et par mode, sans trace de la fiche cachée', async () => {
  const m = monde();
  const c = await carte(m);
  ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.aldric.id, x: 10, y: 10 });
  ajouterElement(m.db, m.antor.id, false, c.id, { ficheId: m.faction.id, x: 20, y: 20 });
  assert.equal(lireCarte(m.db, m.antor.id, false, c.id).elements.length, 2);
  // carte non visible : même refus pour Léa et pour un id inconnu
  const e1 = await err(() => lireCarte(m.db, m.lea.id, false, c.id));
  const e2 = await err(() => lireCarte(m.db, m.lea.id, false, 9999));
  assert.equal(e1?.code, 'introuvable');
  assert.deepEqual([e1?.code, e1?.message, e1?.detail], [e2?.code, e2?.message, e2?.detail]);
  assert.equal((await err(() => ouvrirFond(m.db, m.lea.id, c.id, m.racine)))?.code, 'introuvable');
  assert.equal((await err(() => lireCarte(m.db, m.antor.id, true, c.id)))?.detail, 'mode_joueur');
  assert.equal((await err(() => lireCarte(m.db, m.antor.id, true, c.id)))?.code, 'refuse');
  assert.deepEqual(listerCartes(m.db, m.lea.id, false, m.u.id).cartes, []);
  assert.equal(listerCartes(m.db, m.antor.id, false, m.u.id).cartes.length, 1);
  reglerCarte(m.db, m.antor.id, false, c.id, { visible: true });
  const l = lireCarte(m.db, m.lea.id, false, c.id);
  assert.deepEqual(l.elements.map((e) => [e.titre, e.x, e.y]), [['Aldric', 10, 10]]);
  assert.equal(l.peutEcrire, false);
  assert.ok(!JSON.stringify(l).includes('Ombres'));
  assert.deepEqual(lireCarte(m.db, m.antor.id, true, c.id), l);
  assert.equal(listerCartes(m.db, m.lea.id, false, m.u.id).cartes.length, 1);
  assert.equal(lireCarte(m.db, m.antor.id, false, c.id).elements.length, 2);
  // un inconnu de l'univers
  const x = assurerCompte(m.db, 'zoe');
  assert.equal((await err(() => lireCarte(m.db, x.id, false, c.id)))?.code, 'introuvable');
  assert.equal((await err(() => listerCartes(m.db, x.id, false, m.u.id)))?.code, 'introuvable');
});

test('fond : Léa ouvre le fond d’une carte visible, pas celui d’une carte cachée ; Antor en mode Joueur est jugé sur ses vrais droits', async () => {
  const m = monde();
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'P', forme: 'illustree', fond: flux(PNG) }, m.racine);
  assert.equal((await err(() => ouvrirFond(m.db, m.lea.id, c.id, m.racine)))?.code, 'introuvable');
  const o = await ouvrirFond(m.db, m.antor.id, c.id, m.racine);
  o.flux.destroy();
  reglerCarte(m.db, m.antor.id, false, c.id, { visible: true });
  const l = await ouvrirFond(m.db, m.lea.id, c.id, m.racine);
  l.flux.destroy();
  assert.equal(l.type, 'image/png');
  const g = await carte(m, 'graphe', true);
  assert.equal((await err(() => ouvrirFond(m.db, m.lea.id, g.id, m.racine)))?.code, 'introuvable');
});

function graphe() {
  const m = monde();
  const c = creerFicheGraphe(m);
  return { m, ...c };
}
function creerFicheGraphe(m: ReturnType<typeof monde>) {
  const { db, antor, u } = m;
  const b = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Château', charge: {} });
  const c = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Forêt', charge: {} });
  const sPriv = ajouterSection(db, antor.id, u.id, m.aldric.id, { titre: 'Alliances', contenu: '' });
  const sPub = ajouterSection(db, antor.id, u.id, m.aldric.id, { titre: 'Rivalités', contenu: '' });
  changerAudience(db, antor.id, u.id, m.aldric.id, sPub.id, { joueursLisent: true });
  for (const f of [b, c]) {
    const s = ajouterSection(db, antor.id, u.id, f.id, { titre: 'Pub', contenu: 'z' });
    changerAudience(db, antor.id, u.id, f.id, s.id, { joueursLisent: true });
  }
  relierSection(db, antor.id, u.id, m.aldric.id, sPriv.id, { cibleFicheId: b.id, type: 'allié de' });
  relierSection(db, antor.id, u.id, m.aldric.id, sPub.id, { cibleFicheId: c.id, type: 'rival de' });
  return { b, c, sPriv, sPub };
}

test('graphe : liens filtrés par garde de section ; sans le 3e nœud, aucun lien', async () => {
  const { m, b, c } = graphe();
  const g = await carte(m, 'graphe', true);
  for (const f of [m.aldric, b, c]) ajouterElement(m.db, m.antor.id, false, g.id, { ficheId: f.id });
  const types = (l: { liens?: { type: string }[] }) => (l.liens ?? []).map((x) => x.type).sort();
  assert.deepEqual(types(lireCarte(m.db, m.antor.id, false, g.id)), ['allié de', 'rival de']);
  const lea = lireCarte(m.db, m.lea.id, false, g.id);
  assert.deepEqual(lea.liens, [{ de: m.aldric.id, vers: c.id, type: 'rival de' }]);
  assert.equal(lea.elements.length, 3);
  assert.deepEqual(types(lireCarte(m.db, m.antor.id, true, g.id)), ['rival de']);
  // Léa ne lit pas la cible : ni nœud, ni lien
  const s = m.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').all(c.id) as { id: number }[];
  for (const x of s) changerAudience(m.db, m.antor.id, m.u.id, c.id, x.id, { joueursLisent: false });
  const l2 = lireCarte(m.db, m.lea.id, false, g.id);
  assert.equal(l2.elements.length, 2);
  assert.deepEqual(l2.liens, []);
  assert.ok(!JSON.stringify(l2).includes('Forêt'));
  assert.ok(lireCarte(m.db, m.antor.id, false, g.id).liens!.length === 2);
});
