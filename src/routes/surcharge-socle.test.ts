// kanevas-systemes-jeu-surcharge-socle : personnaliser / revenir / copies / systeme.personnalisees, par les routes.
// antor : MJ de Lame (rattachée) ; lea : joueuse de Lame ; mira : MJ du système seulement (son univers Aube est un
// univers étranger à Lame, rattaché aussi ensuite) ; teo : aucun lien.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  const aube = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube' })).json();
  const nu = (await appel(app, teo, 'POST', '/api/univers', { nom: 'Nu' })).json(); // no system
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  const espace = (app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(sys.id) as { id: number }).id;
  app.db
    .prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'mira'), 'mj')")
    .run(espace);
  return { app, antor, lea, teo, mira, lame, aube, nu, sys, espace };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function creerElement(w: Monde, titre = 'Épée runique') {
  const r = await appel(w.app, w.mira, 'POST', `/api/systemes/${w.sys.id}/fiches`, {
    type: 'objet',
    titre,
    sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Secret de forge', joueursLisent: false }],
  });
  assert.equal(r.statusCode, 201, r.body);
  const fiche = r.json();
  const vue = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${fiche.id}`)).json();
  const [pub, secret] = vue.sections as { id: number; version: number }[];
  for (const [s, t] of [[pub!, 'Lame bleutée visible'], [secret!, 'Sang de dragon']] as const) {
    const e = await appel(w.app, w.mira, 'PUT', `/api/systemes/${w.sys.id}/fiches/${fiche.id}/sections/${s.id}/contenu`, { contenu: t, version: s.version });
    assert.equal(e.statusCode, 200, e.body);
  }
  return fiche.id as number;
}
const perso = (w: Monde, h: H | null, univers: number, fid: number) => appel(w.app, h, 'POST', `/api/univers/${univers}/fiches/${fid}/personnaliser`);
const revenir = (w: Monde, h: H | null, univers: number, fid: number) => appel(w.app, h, 'DELETE', `/api/univers/${univers}/fiches/${fid}/personnalisation`);
const nbCopies = (w: Monde) => (w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n;

test('personnaliser : 201 puis 200 avec la même copie, qui ne porte que les sections lisibles des joueurs', async () => {
  const w = await monde();
  const el = await creerElement(w);
  const r1 = await perso(w, w.antor, w.lame.id, el);
  assert.equal(r1.statusCode, 201, r1.body);
  const c = r1.json();
  assert.notEqual(c.id, el);
  assert.equal(c.titre, 'Épée runique');
  assert.equal(c.type, 'objet');
  assert.deepEqual(c.sections.map((s: { titre: string; contenu: string }) => [s.titre, s.contenu]), [['Description', 'Lame bleutée visible']]);
  assert.ok(!JSON.stringify(c).includes('Sang de dragon') && !JSON.stringify(c).includes('Secret de forge'));
  const ligne = w.app.db.prepare('SELECT univers_id u, surcharge_de s FROM fiches WHERE id = ?').get(c.id) as { u: number; s: number };
  assert.deepEqual(ligne, { u: w.lame.id, s: el });
  // 200, same copy, nothing more written
  const r2 = await perso(w, w.antor, w.lame.id, el);
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(r2.json().id, c.id);
  assert.equal(nbCopies(w), 1);
  // the id of the copy answers 200 with that copy as well
  const r3 = await perso(w, w.antor, w.lame.id, c.id);
  assert.equal(r3.statusCode, 200, r3.body);
  assert.equal(r3.json().id, c.id);
  assert.equal(nbCopies(w), 1);
  // the element is untouched, secret section included
  const orig = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${el}`)).json();
  assert.equal(orig.sections.length, 2);
  // the history of Lame records the creation of the copy
  const h = w.app.db.prepare("SELECT action FROM historique WHERE fiche_id = ? AND objet = 'fiche'").all(c.id) as { action: string }[];
  assert.deepEqual(h.map((x) => x.action), ['creee']);
});

test('personnaliser : la copie garde les droits d’audience des sections, un alias, et ne reprend ni parent ni clé de l’original', async () => {
  const w = await monde();
  const el = await creerElement(w);
  w.app.db.prepare('INSERT INTO fiche_alias (fiche_id, alias) VALUES (?, ?)').run(el, 'Lame-aube');
  const c = (await perso(w, w.antor, w.lame.id, el)).json();
  const lignes = w.app.db.prepare('SELECT titre, joueurs_lisent l FROM sections WHERE fiche_id = ?').all(c.id) as { titre: string; l: number }[];
  assert.deepEqual(lignes, [{ titre: 'Description', l: 1 }]);
  assert.deepEqual(w.app.db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ?').all(c.id), [{ alias: 'Lame-aube' }]);
  const cles = w.app.db.prepare('SELECT f.cle c, o.cle o, f.parent_id p FROM fiches f, fiches o WHERE f.id = ? AND o.id = ?').get(c.id, el) as { c: string; o: string; p: number | null };
  assert.notEqual(cles.c, null);
  assert.equal(cles.p, null);
});

test('personnaliser : la joueuse reçoit 403, le MJ étranger et le sans-lien 404, rien n’est écrit', async () => {
  const w = await monde();
  const el = await creerElement(w);
  assert.equal((await perso(w, w.lea, w.lame.id, el)).statusCode, 403);
  assert.equal((await perso(w, w.mira, w.lame.id, el)).statusCode, 404, 'MJ du système mais sans rôle dans Lame');
  assert.equal((await perso(w, w.teo, w.lame.id, el)).statusCode, 404);
  assert.equal((await perso(w, null, w.lame.id, el)).statusCode, 401);
  assert.equal(nbCopies(w), 0);
});

test('personnaliser : fiche ordinaire, id inconnu, élément d’un autre système, univers sans système → 404', async () => {
  const w = await monde();
  const el = await creerElement(w);
  const ord = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: 'Ordinaire' })).json();
  assert.equal((await perso(w, w.antor, w.lame.id, ord.id)).statusCode, 404);
  assert.equal((await perso(w, w.antor, w.lame.id, 999999)).statusCode, 404);
  // an element of another system
  const autre = (await appel(w.app, w.mira, 'POST', `/api/univers/${w.aube.id}/systeme-nouveau`, { nom: 'Autre' })).json();
  const espaceAutre = (w.app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(autre.id) as { id: number }).id;
  const fa = w.app.db.prepare("SELECT id FROM fiches WHERE univers_id = ?").get(espaceAutre) as { id: number } | undefined;
  const creeAutre = (await appel(w.app, w.mira, 'POST', `/api/systemes/${autre.id}/fiches`, { type: 'objet', titre: 'Étranger' })).json();
  assert.equal(fa, undefined);
  assert.equal((await perso(w, w.antor, w.lame.id, creeAutre.id)).statusCode, 404);
  // a universe without a system
  assert.equal((await perso(w, w.teo, w.nu.id, el)).statusCode, 404);
  assert.equal(nbCopies(w), 0);
});

test('personnaliser : le MJ en mode joueur est refusé (403, mode_joueur) et rien n’est écrit', async () => {
  const w = await monde();
  const el = await creerElement(w);
  const { personnaliser } = await import('../services/surcharge.js');
  const compte = (w.app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  assert.throws(
    () => personnaliser(w.app.db, { compteId: compte, modeJoueur: true } as never, w.lame.id, el),
    (e: { code?: string; detail?: string }) => e.code === 'refuse' && e.detail === 'mode_joueur',
  );
  assert.equal(nbCopies(w), 0);
});

test('personnaliser : l’original déjà copié dans Lame n’est pas copié deux fois ; un autre univers en a sa propre copie', async () => {
  const w = await monde();
  const el = await creerElement(w);
  assert.equal((await appel(w.app, w.mira, 'PUT', `/api/univers/${w.aube.id}/systeme`, { systemeId: w.sys.id })).statusCode, 204);
  const a = await perso(w, w.antor, w.lame.id, el);
  const b = await perso(w, w.mira, w.aube.id, el);
  assert.equal(a.statusCode, 201);
  assert.equal(b.statusCode, 201, b.body);
  assert.notEqual(a.json().id, b.json().id);
  assert.equal(nbCopies(w), 2);
  // the copy id of Lame is not a door into Aube
  assert.equal((await perso(w, w.mira, w.aube.id, a.json().id)).statusCode, 404);
});

test('revenir : 204 puis 404 ; par l’id de l’élément comme par celui de la copie ; joueuse 403, étranger 404', async () => {
  const w = await monde();
  const el = await creerElement(w);
  const c = (await perso(w, w.antor, w.lame.id, el)).json();
  assert.equal((await revenir(w, w.lea, w.lame.id, el)).statusCode, 403);
  assert.equal((await revenir(w, w.mira, w.lame.id, el)).statusCode, 404);
  assert.equal((await revenir(w, w.teo, w.lame.id, el)).statusCode, 404);
  assert.equal(nbCopies(w), 1);
  const r = await revenir(w, w.antor, w.lame.id, el);
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(r.body, '');
  assert.equal(w.app.db.prepare('SELECT id FROM fiches WHERE id = ?').get(c.id), undefined, 'la copie est supprimée');
  assert.ok(w.app.db.prepare('SELECT id FROM fiches WHERE id = ?').get(el), 'l’élément reste');
  assert.equal((await revenir(w, w.antor, w.lame.id, el)).statusCode, 404);
  // by the copy's id
  const c2 = (await perso(w, w.antor, w.lame.id, el)).json();
  assert.equal((await revenir(w, w.antor, w.lame.id, c2.id)).statusCode, 204);
  assert.equal(nbCopies(w), 0);
  // an ordinary sheet is never « reverted »
  const ord = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: 'Ordinaire' })).json();
  assert.equal((await revenir(w, w.antor, w.lame.id, ord.id)).statusCode, 404);
  assert.ok(w.app.db.prepare('SELECT id FROM fiches WHERE id = ?').get(ord.id));
  // the copy of another universe is not reached through this universe
  assert.equal((await appel(w.app, w.mira, 'PUT', `/api/univers/${w.aube.id}/systeme`, { systemeId: w.sys.id })).statusCode, 204);
  const ca = (await perso(w, w.mira, w.aube.id, el)).json();
  assert.equal((await revenir(w, w.antor, w.lame.id, ca.id)).statusCode, 404);
  assert.ok(w.app.db.prepare('SELECT id FROM fiches WHERE id = ?').get(ca.id));
});

test('…/copies : le nombre d’univers, et les seuls noms des univers où le compte a un rôle', async () => {
  const w = await monde();
  const el = await creerElement(w);
  await appel(w.app, w.mira, 'PUT', `/api/univers/${w.aube.id}/systeme`, { systemeId: w.sys.id });
  const url = `/api/systemes/${w.sys.id}/fiches/${el}/copies`;
  assert.deepEqual((await appel(w.app, w.mira, 'GET', url)).json(), { nbUnivers: 0, mesUnivers: [] });
  await perso(w, w.antor, w.lame.id, el);
  await perso(w, w.mira, w.aube.id, el);
  // mira has a role in Aube only: Lame is counted, never named
  assert.deepEqual((await appel(w.app, w.mira, 'GET', url)).json(), { nbUnivers: 2, mesUnivers: [{ id: w.aube.id, nom: 'Aube' }] });
  assert.ok(!(await appel(w.app, w.mira, 'GET', url)).body.includes('Lame'));
  // a reader of the system who is not a GM of it: 403 ; no link: 404
  assert.equal((await appel(w.app, w.antor, 'GET', url)).statusCode, 403);
  assert.equal((await appel(w.app, w.lea, 'GET', url)).statusCode, 403);
  assert.equal((await appel(w.app, w.teo, 'GET', url)).statusCode, 404);
  // an ordinary sheet of Lame or an unknown id: 404
  const ord = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: 'Ordinaire' })).json();
  assert.equal((await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${ord.id}/copies`)).statusCode, 404);
  assert.equal((await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/999999/copies`)).statusCode, 404);
  // a copy removed is no longer counted
  await revenir(w, w.antor, w.lame.id, el);
  assert.deepEqual((await appel(w.app, w.mira, 'GET', url)).json(), { nbUnivers: 1, mesUnivers: [{ id: w.aube.id, nom: 'Aube' }] });
});

test('GET /api/univers/:id : systeme.personnalisees pour le MJ, absent pour la joueuse', async () => {
  const w = await monde();
  const el = await creerElement(w);
  const lire = async (h: H) => (await appel(w.app, h, 'GET', `/api/univers/${w.lame.id}`)).json();
  assert.equal((await lire(w.antor)).systeme.personnalisees, 0);
  await perso(w, w.antor, w.lame.id, el);
  assert.equal((await lire(w.antor)).systeme.personnalisees, 1);
  const j = await lire(w.lea);
  assert.deepEqual(j.systeme, { id: w.sys.id, nom: 'Chroniques' });
  assert.ok(!('personnalisees' in j.systeme));
  await revenir(w, w.antor, w.lame.id, el);
  assert.equal((await lire(w.antor)).systeme.personnalisees, 0);
  // a universe without a system keeps `systeme: null`
  assert.equal((await appel(w.app, w.teo, 'GET', `/api/univers/${w.nu.id}`)).json().systeme, null);
});

test('source-scan : seul services/surcharge.ts écrit fiches.surcharge_de', () => {
  const racine = fileURLToPath(new URL('../services/', import.meta.url));
  const fichiers = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(d, e.name)] : []));
  const ecrivains = fichiers(racine)
    .filter((f) => /surcharge_de\s*=[^=]|surcharge_de\s*\)?\s*VALUES|INSERT INTO fiches[^;]*surcharge_de/is.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(racine.length));
  assert.deepEqual(ecrivains, ['surcharge.ts']);
});
