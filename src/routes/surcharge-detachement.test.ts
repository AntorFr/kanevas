// kanevas-systemes-jeu-surcharge-detachement : quand l'original disparaît ou que l'univers change de système, la copie devient
// une fiche ordinaire (AD-surcharge-3). Par les routes.
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
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: h ?? {}, payload });

async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const mira = await connecter(app, 'mira');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const aube = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube' })).json();
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  const espace = (app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(sys.id) as { id: number }).id;
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'mira'), 'mj')").run(espace);
  assert.equal((await appel(app, mira, 'PUT', `/api/univers/${aube.id}/systeme`, { systemeId: sys.id })).statusCode, 204);
  return { app, antor, mira, lame, aube, sys };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function element(w: Monde, titre = 'Épée') {
  const r = await appel(w.app, w.mira, 'POST', `/api/systemes/${w.sys.id}/fiches`, { type: 'objet', titre, sections: [{ titre: 'Description', joueursLisent: true }] });
  assert.equal(r.statusCode, 201, r.body);
  return r.json().id as number;
}
const copie = async (w: Monde, h: H, univers: number, el: number) => {
  const r = await appel(w.app, h, 'POST', `/api/univers/${univers}/fiches/${el}/personnaliser`);
  assert.equal(r.statusCode, 201, r.body);
  return r.json().id as number;
};
const ligne = (w: Monde, id: number) => w.app.db.prepare('SELECT univers_id u, surcharge_de s, titre FROM fiches WHERE id = ?').get(id) as { u: number; s: number | null; titre: string } | undefined;
const detachees = (w: Monde, id: number) =>
  w.app.db.prepare("SELECT univers_id u, compte_id c, valeur_avant detail FROM historique WHERE fiche_id = ? AND action = 'detachee'").all(id) as { u: number; c: number; detail: string }[];
const compte = (w: Monde, nom: string) => (w.app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(nom) as { id: number }).id;
const totalDetachees = (w: Monde) => (w.app.db.prepare("SELECT COUNT(*) n FROM historique WHERE action = 'detachee'").get() as { n: number }).n;

test('supprimer l’élément : les copies de tous les univers deviennent ordinaires, une ligne chacune dans son univers, par le compte qui supprime', async () => {
  const w = await monde();
  const el = await element(w);
  const a = await copie(w, w.antor, w.lame.id, el);
  const b = await copie(w, w.mira, w.aube.id, el);
  const bilan = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${el}/suppression`)).json();
  assert.equal(bilan.fichesDevenuesOrdinaires, 2, JSON.stringify(bilan));
  assert.equal(bilan.sections, 1, 'seules les sections de l’élément comptent, pas celles des copies');
  const r = await appel(w.app, w.mira, 'DELETE', `/api/systemes/${w.sys.id}/fiches/${el}`);
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(ligne(w, el), undefined);
  assert.deepEqual(ligne(w, a), { u: w.lame.id, s: null, titre: 'Épée' });
  assert.deepEqual(ligne(w, b), { u: w.aube.id, s: null, titre: 'Épée' });
  const [la] = detachees(w, a);
  const [lb] = detachees(w, b);
  assert.equal(detachees(w, a).length, 1);
  assert.equal(detachees(w, b).length, 1);
  assert.equal(la!.u, w.lame.id);
  assert.equal(lb!.u, w.aube.id);
  assert.equal(la!.c, compte(w, 'mira'), 'le compte agissant est celui qui supprime');
  assert.equal(JSON.parse(la!.detail).surcharge_de, el);
  // the copy is an ordinary sheet: readable, and it can be deleted
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/univers/${w.lame.id}/fiches/${a}`)).statusCode, 200);
  assert.equal((await appel(w.app, w.antor, 'DELETE', `/api/univers/${w.lame.id}/fiches/${a}`)).statusCode, 204);
});

test('supprimer un élément sans copie : aucune ligne de détachement, pas de clé dans le bilan, copie d’un autre élément intacte', async () => {
  const w = await monde();
  const seul = await element(w, 'Seul');
  const autre = await element(w, 'Autre');
  const c = await copie(w, w.antor, w.lame.id, autre);
  const avant = totalDetachees(w);
  const bilan = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${seul}/suppression`)).json();
  assert.ok(!('fichesDevenuesOrdinaires' in bilan));
  assert.equal((await appel(w.app, w.mira, 'DELETE', `/api/systemes/${w.sys.id}/fiches/${seul}`)).statusCode, 204);
  assert.equal(totalDetachees(w), avant);
  assert.equal(ligne(w, c)!.s, autre, 'la copie d’un autre élément reste une copie');
});

test('supprimer une fiche ordinaire d’univers : pas de détachement, pas de clé dans le bilan', async () => {
  const w = await monde();
  const el = await element(w);
  const c = await copie(w, w.antor, w.lame.id, el);
  const bilan = (await appel(w.app, w.antor, 'GET', `/api/univers/${w.lame.id}/fiches/${c}/suppression`)).json();
  assert.ok(!('fichesDevenuesOrdinaires' in bilan));
  // deleting the copy itself (as a sheet) leaves the element and the other copies alone
  const b = await copie(w, w.mira, w.aube.id, el);
  assert.equal((await appel(w.app, w.antor, 'DELETE', `/api/univers/${w.lame.id}/fiches/${c}`)).statusCode, 204);
  assert.equal(ligne(w, b)!.s, el);
  assert.equal(totalDetachees(w), 0);
});

test('détacher l’univers (systemeId null) : ses copies deviennent ordinaires ; celles des autres univers restent', async () => {
  const w = await monde();
  const el = await element(w);
  const a = await copie(w, w.antor, w.lame.id, el);
  const b = await copie(w, w.mira, w.aube.id, el);
  assert.equal((await appel(w.app, w.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: null })).statusCode, 204);
  assert.equal(ligne(w, a)!.s, null);
  assert.equal(detachees(w, a).length, 1);
  assert.equal(detachees(w, a)[0]!.c, compte(w, 'antor'));
  assert.equal(ligne(w, b)!.s, el);
  assert.equal(detachees(w, b).length, 0);
  assert.equal(ligne(w, el)!.s, null, 'l’élément reste');
});

test('passer à un autre système : les copies deviennent ordinaires, l’élément d’origine reste', async () => {
  const w = await monde();
  const el = await element(w);
  const a = await copie(w, w.antor, w.lame.id, el);
  const autre = (await appel(w.app, w.antor, 'POST', '/api/systemes', { nom: 'Autre' }));
  assert.equal(autre.statusCode, 201, autre.body);
  const r = await appel(w.app, w.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: autre.json().id });
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(ligne(w, a)!.s, null);
  assert.equal(detachees(w, a).length, 1);
  assert.ok(ligne(w, el));
});

test('le même système de nouveau, et un premier rattachement : aucune écriture de détachement', async () => {
  const w = await monde();
  const el = await element(w);
  const a = await copie(w, w.antor, w.lame.id, el);
  assert.equal((await appel(w.app, w.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: w.sys.id })).statusCode, 204);
  assert.equal(ligne(w, a)!.s, el);
  assert.equal(totalDetachees(w), 0);
  // a first attachment (universe without a system)
  const teo = await connecter(w.app, 'teo');
  const nu = (await appel(w.app, teo, 'POST', '/api/univers', { nom: 'Nu' })).json();
  assert.equal((await appel(w.app, teo, 'PUT', `/api/univers/${nu.id}/systeme`, { systemeId: null })).statusCode, 204);
  assert.equal(totalDetachees(w), 0);
});

test('systeme-nouveau sur un univers rattaché : ses copies deviennent ordinaires, le nom pris ne détache rien', async () => {
  const w = await monde();
  const el = await element(w);
  const a = await copie(w, w.antor, w.lame.id, el);
  const pris = await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Chroniques' });
  assert.ok(pris.statusCode >= 400 && pris.statusCode < 500, pris.body);
  assert.equal(ligne(w, a)!.s, el, 'rien n’est détaché si la création échoue');
  assert.equal(totalDetachees(w), 0);
  const r = await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Neuf' });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(ligne(w, a)!.s, null);
  assert.equal(detachees(w, a).length, 1);
  assert.equal((w.app.db.prepare('SELECT systeme_id s FROM univers WHERE id = ?').get(w.lame.id) as { s: number }).s, r.json().id);
});

test('supprimer un univers portant des copies : 204, les copies partent avec ses fiches, l’élément et les autres copies restent', async () => {
  const w = await monde();
  const el = await element(w);
  const a = await copie(w, w.antor, w.lame.id, el);
  const b = await copie(w, w.mira, w.aube.id, el);
  const r = await appel(w.app, w.antor, 'DELETE', `/api/univers/${w.lame.id}`, { nom: 'Lame' });
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(ligne(w, a), undefined);
  assert.equal(ligne(w, b)!.s, el);
  assert.ok(ligne(w, el));
  assert.equal(detachees(w, a).length, 0);
  // and the element can still be deleted, detaching the survivor
  assert.equal((await appel(w.app, w.mira, 'DELETE', `/api/systemes/${w.sys.id}/fiches/${el}`)).statusCode, 204);
  assert.equal(ligne(w, b)!.s, null);
});

test('source-scan : seul services/systemes.ts écrit univers.systeme_id par UPDATE', () => {
  const racine = fileURLToPath(new URL('../', import.meta.url));
  const fichiers = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(d, e.name)] : []));
  const ecrivains = fichiers(racine)
    .filter((f) => !f.includes('/db/') && /UPDATE\s+univers\s+SET[^;`'"]*\bsysteme_id\s*=/is.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(racine.length));
  assert.deepEqual(ecrivains, ['services/systemes.ts']);
  const src = readFileSync(join(racine, 'services/systemes.ts'), 'utf8');
  assert.equal((src.match(/UPDATE\s+univers\s+SET\s+systeme_id/gi) ?? []).length, 1, 'une seule écriture, dans changerSysteme');
});
