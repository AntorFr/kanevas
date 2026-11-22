import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-elements-service (B-96, AD-144, AD-elements-1), on a temporary database.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const { lireSorties } = await import('./sorties.js');
const { presenceDeFiche } = await import('./presence.js');
const { elementLisible } = await import('./lisibilite.js');
const { creerFiche, lireFiche } = await import('../fiches.js');
const E = await import('./ecriture-systeme.js');
const L = await import('./ecriture-elements.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const FG = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const { plagesDe } = await import('../../outils/swn/regles/forme.js');
const cible = FS.systemes[0].entree as { q: number; r: number };

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=?, visible=1 WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  for (const z of FG.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const mj = { compteId: cid('antor') };
  const mjJoueur = { compteId: cid('antor'), modeJoueur: true };
  const lea = { compteId: cid('lea') };
  const lire = (a: any, c = cible) => lireInterieur(db, a, univers, g, c.q, c.r);
  const ver = () => (q('SELECT version FROM swn_galaxies WHERE id=?', g)[0].version as number);
  const AS = [db, mj, univers, g, cible.q, cible.r] as const;
  const fiche = (titre: string, o: { mjSeul?: boolean } = {}) => {
    const f = creerFiche(db, cid('antor'), univers, { type: 'lieu', titre }).id as number;
    return f;
  };
  return { db, q, univers, g, mj, mjJoueur, lea, lire, ver, AS, fiche };
}
type W = ReturnType<typeof monde>;
const erreur = (f: () => unknown): any => { try { f(); } catch (e) { return e; } assert.fail('aucune erreur'); };
/** The defined system with a planet, its moon, and an element's helper. */
function avecPlanete(w: W) {
  E.ancrer(w.db, w.mj, w.univers, w.g, cible.q, cible.r, { versionSysteme: w.ver() });
  const p = E.ajouterAstre(...w.AS, { genre: 'planete', nom: 'Mère', orbite: 2, heure: 3 });
  const l = E.ajouterAstre(...w.AS, { genre: 'lune', parent_cle: p.cle, nom: 'Petite' });
  const el = (cle: string) => w.lire(w.mj).elements.find((x: any) => x.cle === cle);
  return { p: p.cle!, l: l.cle!, el };
}
const lignes = (w: W) => w.q('SELECT * FROM swn_elements ORDER BY id');

test("B-96 : un élément posé sur une planète suit la planète déplacée, orbite et heure nuls en base", () => {
  const w = monde();
  const { p, el } = avecPlanete(w);
  const r = L.ajouterElement(...w.AS, { genre: 'vaisseau', nom: 'Aube-Brisée', sur: p });
  const c = r.cle!;
  assert.deepEqual([lignes(w)[0].orbite, lignes(w)[0].heure], [null, null]);
  assert.deepEqual([el(c).sur, el(c).orbite, el(c).heure], [p, 2, 3]);
  const v = w.lire(w.mj).astres.find((a: any) => a.cle === p)!.version;
  E.modifierAstre(...w.AS, p, { version: v, orbite: 7, heure: 9 });
  assert.deepEqual([el(c).sur, el(c).orbite, el(c).heure], [p, 7, 9]);
  assert.deepEqual([lignes(w)[0].orbite, lignes(w)[0].heure], [null, null]);
});

test("B-96 : retirer la planète retire ses éléments, ceux de ses lunes aussi, et l'aperçu les compte pour le MJ seul", () => {
  const w = monde();
  const { p, l, el } = avecPlanete(w);
  L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port', sur: p });
  assert.equal(L.elementsDuCorps(w.db, w.mj, w.univers, w.g, cible.q, cible.r, p), 1);
  const reserve = L.ajouterElement(...w.AS, { genre: 'base', nom: 'Cache', sur: l, secret: true });
  L.ajouterElement(...w.AS, { genre: 'station', nom: 'Libre', orbite: 4, heure: 1 });
  // the reserved one on a moon is counted for the GM; the free-floating one is not
  assert.equal(L.elementsDuCorps(w.db, w.mj, w.univers, w.g, cible.q, cible.r, p), 2);
  assert.equal(L.elementsDuCorps(w.db, w.mj, w.univers, w.g, cible.q, cible.r, l), 1);
  for (const a of [w.lea, w.mjJoueur]) assert.equal(erreur(() => L.elementsDuCorps(w.db, a, w.univers, w.g, cible.q, cible.r, p)).code, 'refuse');
  assert.equal(erreur(() => L.elementsDuCorps(w.db, w.mj, w.univers, w.g, cible.q, cible.r, 'fantome')).detail, 'astre_inconnu');
  E.retirerAstre(...w.AS, p, { version: w.lire(w.mj).astres.find((a: any) => a.cle === p)!.version });
  assert.deepEqual(lignes(w).map((x) => x.nom), ['Libre']);
  assert.equal(el(reserve.cle!), undefined);
});

test('B-96 : un élément réservé est absent pour la joueuse et le MJ en mode joueur, sans trou ni compte', () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const f = w.fiche('Épave');
  L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port', sur: p });
  const avantLea = JSON.stringify(w.lire(w.lea));
  const avantMjJ = JSON.stringify(w.lire(w.mjJoueur));
  const sortiesAvant = JSON.stringify(lireSorties(w.db, w.lea, w.univers, w.g, cible.q, cible.r));
  const s = L.ajouterElement(...w.AS, { genre: 'vaisseau', nom: 'Secret-Absolu', sur: p, secret: true });
  L.lierElement(...w.AS, s.cle!, { ficheId: f, version: 1 });
  const id = lignes(w).find((x) => x.cle === s.cle)!.id as number;
  for (const a of [w.lea, w.mjJoueur]) {
    const v = w.lire(a);
    assert.deepEqual(v.elements.map((x: any) => x.nom), ['Port']);
    assert.ok(!JSON.stringify(v).includes('Secret-Absolu'));
    assert.ok(!JSON.stringify(v).includes(`"fiche":{"id":${f}`));
    assert.ok(v.elements.every((x: any) => x.reserve === undefined && x.version === undefined));
    assert.equal(presenceDeFiche(w.db, a, w.univers, f), null);
    assert.equal(elementLisible(w.db, a, id), false);
  }
  // same body as before the reserved element existed, for the player (no hole, no count)
  assert.equal(JSON.stringify(w.lire(w.lea)), avantLea);
  assert.equal(JSON.stringify(w.lire(w.mjJoueur)), avantMjJ);
  assert.equal(JSON.stringify(lireSorties(w.db, w.lea, w.univers, w.g, cible.q, cible.r)), sortiesAvant);
  // the GM outside Player mode reads it, with its badge, its link and its block line
  const vu = w.lire(w.mj).elements.find((x: any) => x.cle === s.cle);
  assert.equal(vu.reserve, true);
  assert.deepEqual(vu.fiche, { id: f, titre: 'Épave' });
  assert.deepEqual(presenceDeFiche(w.db, w.mj, w.univers, f)!.lignes.map((l: any) => l.texte), [`Secret-Absolu — ${w.lire(w.mj).nom}, sur Mère (MJ seul)`]);
  assert.equal(elementLisible(w.db, w.mj, id), true);
  // an unknown id answers like a hidden one
  assert.equal(elementLisible(w.db, w.lea, 999999), false);
  assert.equal(elementLisible(w.db, w.mj, 999999), false);
  // revealing it shows it to the player, hiding it again removes it
  L.reserverElement(...w.AS, s.cle!, { secret: false, version: w.lire(w.mj).elements.find((x: any) => x.cle === s.cle).version });
  assert.deepEqual(w.lire(w.lea).elements.map((x: any) => x.nom).sort(), ['Port', 'Secret-Absolu']);
});

test("B-97 : un élément d'un système masqué est illisible pour la joueuse, lisible pour le MJ", () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const f = w.fiche('Port');
  const c = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port', sur: p }).cle!;
  L.lierElement(...w.AS, c, { ficheId: f, version: 1 });
  const id = lignes(w)[0].id as number;
  w.db.prepare('UPDATE swn_systemes SET secret = 1').run();
  assert.equal(elementLisible(w.db, w.lea, id), false);
  assert.equal(presenceDeFiche(w.db, w.lea, w.univers, f), null);
  assert.equal(elementLisible(w.db, w.mj, id), true);
  assert.equal(erreur(() => w.lire(w.lea)).code, 'introuvable');
  // the same silence on a write: the system is `introuvable`, not `refuse`
  const e = erreur(() => L.ajouterElement(w.db, w.lea, w.univers, w.g, cible.q, cible.r, { genre: 'ville', nom: 'X' }));
  assert.equal(e.code, 'introuvable');
  assert.equal(lignes(w).length, 1);
});

test("une première pose sur un système tiré l'ancre : promu vrai, voisins tirés identiques", () => {
  const w = monde();
  const voisins = FS.systemes.slice(1).map((s: any) => JSON.stringify(w.lire(w.mj, s.entree)));
  assert.equal(w.lire(w.mj).etat, 'tire');
  assert.equal(w.q('SELECT count(*) n FROM swn_systemes')[0].n, 0);
  const r = L.ajouterElement(...w.AS, { genre: 'station', nom: 'Relais', versionSysteme: w.ver(), nomAncrage: 'Vael' });
  assert.equal(r.interieur.etat, 'defini');
  const s = w.q('SELECT * FROM swn_systemes');
  assert.equal(s.length, 1);
  assert.equal(s[0].promu, 1);
  assert.equal(s[0].nom, 'Vael');
  assert.deepEqual(r.interieur.elements.map((x: any) => [x.nom, x.sur, x.orbite, x.heure]), [['Relais', null, 1, 0]]);
  for (const [i, sy] of FS.systemes.slice(1).entries()) assert.equal(JSON.stringify(w.lire(w.mj, sy.entree)), voisins[i], `voisin ${i}`);
});

test("système tiré sans jeton, ou refusé : rien n'est écrit, ancrage compris", () => {
  const w = monde();
  assert.equal(erreur(() => L.ajouterElement(...w.AS, { genre: 'ville', nom: 'X' })).code, 'invalide');
  const mauvais = erreur(() => L.ajouterElement(...w.AS, { genre: 'ville', nom: 'X', orbite: -1, versionSysteme: w.ver() }));
  assert.deepEqual([mauvais.code, mauvais.detail], ['invalide', 'orbite_invalide']);
  assert.equal(w.q('SELECT count(*) n FROM swn_systemes')[0].n, 0);
  assert.equal(lignes(w).length, 0);
});

test('un système supprimé ou sans étoile répond introuvable, un système défini efface ses éléments', () => {
  const w = monde();
  const { p } = avecPlanete(w);
  L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port', sur: p });
  for (const f of [
    () => L.ajouterElement(w.db, w.mj, w.univers, w.g, cible.q + 1000, cible.r, { genre: 'ville', nom: 'X', versionSysteme: w.ver() }),
    () => L.modifierElement(w.db, w.mj, w.univers, w.g, cible.q + 1000, cible.r, 'x', { version: 1, nom: 'X' }),
    () => L.retirerElement(w.db, w.mj, w.univers, w.g, cible.q + 1000, cible.r, 'x', { version: 1 }),
  ]) assert.equal(erreur(f).code, 'introuvable');
  w.db.prepare('DELETE FROM swn_systemes').run();
  assert.equal(lignes(w).length, 0);
});

test("un élément sur un élément, sur une zone ou sur un corps absent est refusé astre_inconnu, rien d'écrit", () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const e1 = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port', sur: p }).cle!;
  const z = E.ajouterZone(...w.AS, { forme: 'anneau', nom: 'Ceinture', parametres: { de: 3, a: 3.5 } }).cle!;
  const avant = lignes(w);
  for (const cible_ of [e1, z, 'fantome', '']) {
    const e = erreur(() => L.ajouterElement(...w.AS, { genre: 'station', nom: 'Y', sur: cible_ }));
    assert.deepEqual([e.code, e.detail], ['introuvable', 'astre_inconnu'], String(cible_));
    const d = erreur(() => L.deplacerElement(...w.AS, e1, { version: 1, sur: cible_ }));
    assert.deepEqual([d.code, d.detail], ['introuvable', 'astre_inconnu'], String(cible_));
  }
  assert.deepEqual(lignes(w), avant);
});

test('bords de la place : orbite 0 et heure 11.99 passent, orbite -1, heure 12 et le double lieu sont refusés', () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const ok = L.ajouterElement(...w.AS, { genre: 'vaisseau', nom: 'Bord', orbite: 0, heure: 11.99 });
  const lu = lignes(w)[0];
  assert.deepEqual([lu.orbite, lu.heure, lu.astre_id], [0, 11.99, null]);
  const avant = lignes(w);
  for (const [entree, detail] of [
    [{ orbite: -1, heure: 1 }, 'orbite_invalide'],
    [{ orbite: 1, heure: 12 }, 'orbite_invalide'],
    [{ orbite: 1, heure: -0.1 }, 'orbite_invalide'],
  ] as const) {
    const e = erreur(() => L.ajouterElement(...w.AS, { genre: 'vaisseau', nom: 'Mauvais', ...entree }));
    assert.deepEqual([e.code, e.detail], ['invalide', detail], JSON.stringify(entree));
    const d = erreur(() => L.deplacerElement(...w.AS, ok.cle!, { version: 1, ...entree }));
    assert.deepEqual([d.code, d.detail], ['invalide', detail], JSON.stringify(entree));
  }
  const double = erreur(() => L.ajouterElement(...w.AS, { genre: 'vaisseau', nom: 'Deux', sur: p, orbite: 2, heure: 1 }));
  assert.equal(double.code, 'invalide');
  assert.deepEqual(lignes(w), avant);
});

test('déplacer : sur un astre efface la place propre, vers une orbite efface le corps ; une version périmée est a_change', () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const c = L.ajouterElement(...w.AS, { genre: 'vaisseau', nom: 'Nef', orbite: 5, heure: 2 }).cle!;
  L.deplacerElement(...w.AS, c, { version: 1, sur: p });
  assert.deepEqual([lignes(w)[0].astre_id !== null, lignes(w)[0].orbite, lignes(w)[0].heure, lignes(w)[0].version], [true, null, null, 2]);
  L.deplacerElement(...w.AS, c, { version: 2, orbite: 6, heure: 4 });
  assert.deepEqual([lignes(w)[0].astre_id, lignes(w)[0].orbite, lignes(w)[0].heure, lignes(w)[0].version], [null, 6, 4, 3]);
  const e = erreur(() => L.deplacerElement(...w.AS, c, { version: 2, sur: p }));
  assert.deepEqual([e.code, e.detail], ['conflit', 'a_change']);
  assert.equal(lignes(w)[0].orbite, 6);
  // the same version twice: the second write loses
  L.modifierElement(...w.AS, c, { version: 3, nom: 'A' });
  const e2 = erreur(() => L.modifierElement(...w.AS, c, { version: 3, nom: 'B' }));
  assert.deepEqual([e2.code, e2.detail], ['conflit', 'a_change']);
  assert.equal(lignes(w)[0].nom, 'A');
  // an unknown element is the same `astre_inconnu`, whatever the gesture
  for (const f of [
    () => L.modifierElement(...w.AS, 'nope', { version: 1, nom: 'x' }),
    () => L.deplacerElement(...w.AS, 'nope', { version: 1, sur: p }),
    () => L.retirerElement(...w.AS, 'nope', { version: 1 }),
    () => L.reserverElement(...w.AS, 'nope', { version: 1, secret: true }),
    () => L.lierElement(...w.AS, 'nope', { version: 1, ficheId: 1 }),
    () => L.delierElement(...w.AS, 'nope', { version: 1 }),
  ]) assert.equal(erreur(f).detail, 'astre_inconnu');
});

test("aspect : icône et couleur d'une liste du serveur, défaut l'icône du genre, un genre inconnu refusé", () => {
  const w = monde();
  avecPlanete(w);
  const a = L.ajouterElement(...w.AS, { genre: 'station', nom: 'S' }).cle!;
  const lu = (c: string) => w.lire(w.mj).elements.find((x: any) => x.cle === c).aspect;
  assert.equal(lu(a).icone, 'station');
  assert.equal(typeof lu(a).couleur, 'string');
  const v = () => w.lire(w.mj).elements.find((x: any) => x.cle === a).version;
  L.modifierElement(...w.AS, a, { version: v(), aspect: { icone: 'balise' } });
  assert.equal(lu(a).icone, 'balise');
  const avant = lignes(w);
  for (const aspect of [{ icone: 'dragon' }, { couleur: 'plaid' }, { icone: 'base', taille: 3 }, 'x', null, []]) {
    assert.equal(erreur(() => L.modifierElement(...w.AS, a, { version: v(), aspect })).code, 'invalide', JSON.stringify(aspect));
  }
  assert.equal(erreur(() => L.ajouterElement(...w.AS, { genre: 'dragon', nom: 'D' })).code, 'invalide');
  assert.equal(erreur(() => L.ajouterElement(...w.AS, { genre: 'ville', nom: '' })).code, 'invalide');
  assert.equal(erreur(() => L.ajouterElement(...w.AS, { genre: 'ville', nom: 'x'.repeat(81) })).code, 'invalide');
  assert.equal(erreur(() => L.ajouterElement(...w.AS, { genre: 'ville' })).code, 'invalide');
  assert.deepEqual(lignes(w), avant);
});

test('lierElement lie une fiche de l\'univers, refuse fiche_inconnue sinon ; delierElement la délie', () => {
  const w = monde();
  avecPlanete(w);
  const c = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port' }).cle!;
  const f = w.fiche('Port-fiche');
  const autre = w.q('SELECT id FROM univers WHERE id != ? LIMIT 1', w.univers)[0].id as number;
  const etrangere = w.db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('k' || hex(randomblob(6)), 'ecran', ?, 'lieu', 'Ailleurs', '{}', 1, 1)").run(autre).lastInsertRowid as number;
  const v = () => lignes(w)[0].version as number;
  for (const ficheId of [999999, etrangere, 0, -1, 1.5, '1', null, undefined]) {
    const e = erreur(() => L.lierElement(...w.AS, c, { ficheId, version: v() }));
    assert.deepEqual([e.code, e.champ, e.detail], ['invalide', 'ficheId', 'fiche_inconnue'], String(ficheId));
  }
  assert.equal(lignes(w)[0].fiche_id, null);
  const r = L.lierElement(...w.AS, c, { ficheId: f, version: v() });
  assert.deepEqual(r.interieur.elements[0].fiche, { id: f, titre: 'Port-fiche' });
  assert.equal(erreur(() => L.lierElement(...w.AS, c, { ficheId: f, version: 1 })).detail, 'a_change');
  const d = L.delierElement(...w.AS, c, { version: v() });
  assert.equal(d.interieur.elements[0].fiche, null);
  assert.equal(lignes(w)[0].fiche_id, null);
  // a sheet deleted later leaves the element, unlinked
  L.lierElement(...w.AS, c, { ficheId: f, version: v() });
  w.db.prepare('DELETE FROM fiches WHERE id = ?').run(f);
  assert.equal(lignes(w).length, 1);
  assert.equal(lignes(w)[0].fiche_id, null);
});

test("AD-144 : pour une joueuse, un élément dont la fiche liée lui est illisible n'a ni lien ni ligne de bloc", () => {
  const w = monde();
  avecPlanete(w);
  const ouvert = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port' }).cle!;
  const ferme = L.ajouterElement(...w.AS, { genre: 'base', nom: 'Fort' }).cle!;
  const lisible = w.fiche('Fiche ouverte');
  const cachee = w.fiche('Dossier MJ');
  // the control: a sheet the player reads gives a link; the other has no section a player reads
  w.db.prepare('UPDATE sections SET joueurs_lisent = 1 WHERE fiche_id = ?').run(lisible);
  w.db.prepare('UPDATE sections SET joueurs_lisent = 0 WHERE fiche_id = ?').run(cachee);
  w.db.prepare("INSERT INTO sections (cle, fiche_id, titre, contenu, contenu_public, joueurs_lisent, ordre, modifie_le) VALUES ('texte-' || hex(randomblob(4)), ?, ?, ?, ?, 1, 90, ?)")
    .run(lisible, 'Vue', 'x', 'x', '2026-01-01T00:00:00Z');
  assert.ok(lireFiche(w.db, w.lea, w.univers, lisible));
  assert.equal(erreur(() => lireFiche(w.db, w.lea, w.univers, cachee)).code, 'introuvable');
  L.lierElement(...w.AS, ouvert, { ficheId: lisible, version: 1 });
  L.lierElement(...w.AS, ferme, { ficheId: cachee, version: 1 });
  const vue = (a: any, c: string) => w.lire(a).elements.find((x: any) => x.cle === c);
  assert.deepEqual(vue(w.lea, ouvert).fiche, { id: lisible, titre: 'Fiche ouverte' });
  assert.equal(vue(w.mj, ferme).fiche.id, cachee);
  assert.ok(vue(w.lea, ferme), "l'élément reste sur la carte");
  assert.equal(vue(w.lea, ferme).fiche, null, 'ni lien');
  assert.ok(!JSON.stringify(w.lire(w.lea)).includes('Dossier MJ'));
  assert.ok(!JSON.stringify(w.lire(w.lea)).includes(`"id":${cachee}`));
  // no block line for the sheet the player cannot read
  assert.equal(lireFiche(w.db, w.mj, w.univers, cachee).blocs.length, 1);
});

test('gardes : la joueuse et le MJ en mode joueur sont refusés sur chaque geste, rien ne bouge', () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const c = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Port', sur: p }).cle!;
  const vide = lignes(w);
  const sys = w.q('SELECT * FROM swn_systemes');
  for (const a of [w.lea, w.mjJoueur]) {
    const g = (f: (...x: any[]) => unknown, ...x: unknown[]) => () => f(w.db, a, w.univers, w.g, cible.q, cible.r, ...x);
    for (const f of [
      g(L.ajouterElement, { genre: 'ville', nom: 'Z' }),
      g(L.modifierElement, c, { version: 1, nom: 'Z' }),
      g(L.deplacerElement, c, { version: 1, orbite: 1, heure: 1 }),
      g(L.retirerElement, c, { version: 1 }),
      g(L.reserverElement, c, { version: 1, secret: true }),
      g(L.lierElement, c, { version: 1, ficheId: 1 }),
      g(L.delierElement, c, { version: 1 }),
    ]) assert.equal(erreur(f).code, 'refuse');
  }
  assert.deepEqual(lignes(w), vide);
  assert.deepEqual(w.q('SELECT * FROM swn_systemes'), sys);
  // an unknown account is not a member
  assert.equal(erreur(() => L.ajouterElement(w.db, { compteId: 99999 }, w.univers, w.g, cible.q, cible.r, { genre: 'ville', nom: 'Z' })).code, 'introuvable');
});

test("le MJ réserve et dé-réserve : la clé est unique pour tout le système, corps et zones compris, et retirer un élément le retire", () => {
  const w = monde();
  const { p } = avecPlanete(w);
  const a = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Mère' }).cle!;
  const b = L.ajouterElement(...w.AS, { genre: 'ville', nom: 'Mère' }).cle!;
  assert.notEqual(a, b);
  assert.notEqual(a, p);
  const bad = erreur(() => L.reserverElement(...w.AS, a, { version: 1, secret: 'oui' }));
  assert.equal(bad.code, 'invalide');
  L.reserverElement(...w.AS, a, { version: 1, secret: true });
  assert.equal(w.q('SELECT secret FROM swn_elements WHERE cle = ?', a)[0].secret, 1);
  L.retirerElement(...w.AS, a, { version: 2 });
  assert.deepEqual(lignes(w).map((x) => x.cle), [b]);
});

test('0044 : montée depuis 0043 avec le semis, tout reste, swn_elements neuve et contrainte, foreign_key_check vide', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-0044-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source).filter((x) => /^\d{4}-.+\.sql$/.test(x))) if (Number(f.slice(0, 4)) <= 43 || Number(f.slice(0, 4)) === 46) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  assert.equal(semerBouchon(db), true);
  const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as any[]).map((x) => x.name);
  assert.ok(!tables().includes('swn_elements'));
  const tout = (t: string) => db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all();
  const avant = { s: tout('swn_systemes'), a: tout('swn_astres'), f: tout('fiches'), g: tout('swn_galaxies') };
  assert.deepEqual(migrate(db), [44, 45, 47, 48]);
  assert.ok(tables().includes('swn_elements'));
  assert.deepEqual({ s: tout('swn_systemes'), a: tout('swn_astres'), f: tout('fiches'), g: tout('swn_galaxies') }, avant);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_elements').get() as any).n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(migrate(db), []);
  // the constraints of docs/donnees.md
  const sid = (db.prepare('INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) SELECT id, univers_id, ?, ?, 1, 1, 3, ?, ?, 0, 1 FROM swn_galaxies LIMIT 1')
    .run('s', 'S', 'accent', '').lastInsertRowid) as number;
  const ast = db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?, 'p', 'planete', 'rocheux', 1, 1, 1)").run(sid).lastInsertRowid as number;
  const ins = (genre: string, astre: number | null, orbite: number | null, heure: number | null, secret = 0, cle = 'e') => () =>
    db.prepare('INSERT INTO swn_elements (systeme_id, cle, genre, nom, astre_id, orbite, heure, secret) VALUES (?,?,?,?,?,?,?,?)').run(sid, cle, genre, 'N', astre, orbite, heure, secret);
  assert.doesNotThrow(ins('vaisseau', ast, null, null, 0, 'e1'));
  assert.doesNotThrow(ins('ville', null, 0, 11.5, 1, 'e2'));
  assert.throws(ins('vaisseau', ast, 1, 1, 0, 'e3'), 'astre ET orbite');
  assert.throws(ins('vaisseau', null, null, null, 0, 'e4'), 'ni astre ni orbite');
  assert.throws(ins('vaisseau', null, 1, null, 0, 'e5'), 'orbite sans heure');
  assert.throws(ins('vaisseau', null, 1, 12, 0, 'e6'), 'heure 12');
  assert.throws(ins('vaisseau', null, -1, 1, 0, 'e7'), 'orbite négative');
  assert.throws(ins('planete', null, 1, 1, 0, 'e8'), 'genre inconnu');
  assert.throws(ins('ville', null, 1, 1, 2, 'e9'), 'secret 2');
  assert.throws(ins('ville', null, 1, 1, 0, 'e1'), 'clé déjà prise dans le système');
  // a body removed takes its elements; a system removed takes all
  db.prepare('DELETE FROM swn_astres WHERE id = ?').run(ast);
  assert.deepEqual((db.prepare('SELECT cle FROM swn_elements').all() as any[]).map((x) => x.cle), ['e2']);
  db.prepare('DELETE FROM swn_systemes WHERE id = ?').run(sid);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_elements').get() as any).n, 0);
});

// ---- source scans ----------------------------------------------------------------------------------------------

const racine = fileURLToPath(new URL('../../', import.meta.url));
function sources(d: string, sortie: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { sources(p, sortie); continue; }
    if (/\.(ts|tsx|mjs|js)$/.test(n) && !/\.test\.tsx?$/.test(n)) sortie.push(p);
  }
  return sortie;
}

test('balayage des sources : seul ecriture-elements.ts écrit swn_elements', () => {
  const motif = /(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+swn_elements\b/i;
  const fautifs = sources(racine).filter((p) => !p.endsWith(join('swn', 'ecriture-elements.ts')) && motif.test(readFileSync(p, 'utf8'))).map((p) => p.slice(racine.length));
  assert.deepEqual(fautifs, []);
  assert.ok(motif.test(readFileSync(join(racine, 'services/swn/ecriture-elements.ts'), 'utf8')));
});

test('balayage des sources : swn_elements.secret ne se lit que dans lisibilite.ts (hors écrivain)', () => {
  const fautifs: string[] = [];
  for (const p of sources(join(racine, 'services'))) {
    const rel = p.slice(racine.length);
    if (rel === join('services', 'swn', 'lisibilite.ts') || rel === join('services', 'swn', 'ecriture-elements.ts')) continue;
    const texte = readFileSync(p, 'utf8');
    if (!/\bswn_elements\b/.test(texte)) continue;
    texte.split('\n').forEach((l, i) => { if (!/^\s*(\/\/|\*|\/\*)/.test(l) && /\bsecret\b/i.test(l)) fautifs.push(`${rel}:${i + 1}: ${l.trim()}`); });
  }
  assert.deepEqual(fautifs, []);
  // and nothing outside services/ names the column of an element either
  const dehors = sources(racine).filter((p) => !p.slice(racine.length).startsWith('services')).filter((p) => {
    const t = readFileSync(p, 'utf8');
    return /\bswn_elements\b/.test(t);
  }).map((p) => p.slice(racine.length));
  assert.deepEqual(dehors, []);
});
