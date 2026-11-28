// kanevas-systemes-jeu-recherche-origine (revue) : `origine` sur chaque ligne et option `origine=tous|univers` de
// GET /api/univers/:id/fiches. antor : MJ de Lame ; lea : joueuse de Lame ; mira : MJ du système.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type L = { id: number; titre: string; origine: string; systeme?: { id: number; nom: string } };

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) => app.inject({ method, url, headers: h, payload });

async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  const nu = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Nu' })).json();
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  const espace = (app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(sys.id) as { id: number }).id;
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'mira'), 'mj')").run(espace);
  const element = async (titre: string) => {
    const r = await appel(app, mira, 'POST', `/api/systemes/${sys.id}/fiches`, { type: 'objet', titre, sections: [{ titre: 'Description', joueursLisent: true }] });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().id as number;
  };
  const original = await element('Pistolet laser');
  const aPerso = await element('Fusil à pompe');
  const copie = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/fiches/${aPerso}/personnaliser`)).json().id as number;
  const ordinaire = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/fiches`, { type: 'personnage', titre: 'Le Pistolero', charge: { pj: false }, sections: [{ titre: 'Portrait', joueursLisent: true }] })).json().id as number;
  return { app, antor, lea, mira, lame, nu, sys, original, aPerso, copie, ordinaire };
}
type Monde = Awaited<ReturnType<typeof monde>>;
const page = async (w: Monde, h: H, u: number, qs = '') => (await appel(w.app, h, 'GET', `/api/univers/${u}/fiches${qs}`)).json() as { fiches: L[]; suivant: string | null };
const resume = (l: L[]) => l.map((f) => [f.id, f.origine, f.systeme?.nom ?? null]).sort();

test('tous : une ligne par entrée avec origine et système ; univers : la copie reste, l’original sort', async () => {
  const w = await monde();
  const attendu = [[w.original, 'systeme', 'Chroniques'], [w.copie, 'surcharge', 'Chroniques'], [w.ordinaire, 'univers', null]].sort();
  for (const qs of ['', '?origine=tous']) assert.deepEqual(resume((await page(w, w.antor, w.lame.id, qs)).fiches), attendu, qs);
  assert.deepEqual(resume((await page(w, w.antor, w.lame.id, '?origine=univers')).fiches), [[w.copie, 'surcharge', 'Chroniques'], [w.ordinaire, 'univers', null]].sort());
  const sys = (await page(w, w.antor, w.lame.id)).fiches.find((f) => f.id === w.original)!;
  assert.equal(typeof sys.systeme?.id, 'number');
  assert.equal(sys.systeme!.id, w.sys.id);
  const ord = (await page(w, w.antor, w.lame.id)).fiches.find((f) => f.id === w.ordinaire)!;
  assert.equal('systeme' in ord, false);
});

test('recherche : origine=univers laisse la copie et la fiche, retire l’original', async () => {
  const w = await monde();
  assert.deepEqual(resume((await page(w, w.antor, w.lame.id, '?q=pisto')).fiches).map((r) => r[1]).sort(), ['systeme', 'univers']);
  assert.deepEqual((await page(w, w.antor, w.lame.id, '?q=pisto&origine=univers')).fiches.map((f) => f.id), [w.ordinaire]);
  assert.deepEqual((await page(w, w.antor, w.lame.id, '?q=laser&origine=univers')).fiches, []);
});

test('joueuse : lit pareil, sans fuite de nom hors système', async () => {
  const w = await monde();
  assert.deepEqual(resume((await page(w, w.lea, w.lame.id)).fiches), [[w.original, 'systeme', 'Chroniques'], [w.copie, 'surcharge', 'Chroniques'], [w.ordinaire, 'univers', null]].sort());
  assert.deepEqual(resume((await page(w, w.lea, w.lame.id, '?origine=univers')).fiches), [[w.copie, 'surcharge', 'Chroniques'], [w.ordinaire, 'univers', null]].sort());
});

test('univers sans système : que des lignes univers, origine=univers identique', async () => {
  const w = await monde();
  await appel(w.app, w.antor, 'POST', `/api/univers/${w.nu.id}/fiches`, { type: 'objet', titre: 'Caillou' });
  for (const qs of ['', '?origine=univers', '?origine=tous']) {
    const l = (await page(w, w.antor, w.nu.id, qs)).fiches;
    assert.deepEqual(l.map((f) => [f.titre, f.origine, 'systeme' in f]), [['Caillou', 'univers', false]], qs);
  }
});

test('origine=univers garde la taille de page (100) et le curseur au-delà d’une page', async () => {
  const w = await monde();
  const N = 104;
  for (let i = 0; i < N; i++) {
    const r = await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: `Objet ${String(i).padStart(3, '0')}` });
    assert.equal(r.statusCode, 201, r.body);
  }
  // propres : copie + Pistolero + N ; l'original est écarté de la requête, pas de la page lue
  const vu: number[] = [];
  let curseur: string | null = null;
  const tailles: number[] = [];
  do {
    const p = await page(w, w.antor, w.lame.id, `?origine=univers${curseur ? `&curseur=${curseur}` : ''}`);
    tailles.push(p.fiches.length);
    assert.ok(p.fiches.every((f) => f.id !== w.original));
    vu.push(...p.fiches.map((f) => f.id));
    curseur = p.suivant;
  } while (curseur && tailles.length < 10);
  assert.deepEqual(tailles, [100, N + 2 - 100]);
  assert.equal(new Set(vu).size, N + 2);
  assert.ok(vu.includes(w.copie) && vu.includes(w.ordinaire));
  // tous : l'original s'ajoute, une ligne de plus
  let total = 0;
  curseur = null;
  do {
    const p = await page(w, w.antor, w.lame.id, curseur ? `?curseur=${curseur}` : '');
    total += p.fiches.length;
    curseur = p.suivant;
  } while (curseur);
  assert.equal(total, N + 3);
});

test('autre valeur : 400 Requête invalide, répétée, vide ou casse différente comprises', async () => {
  const w = await monde();
  for (const qs of ['?origine=autre', '?origine=', '?origine=Univers', '?origine=univers&origine=tous', '?origine=systeme']) {
    const r = await appel(w.app, w.antor, 'GET', `/api/univers/${w.lame.id}/fiches${qs}`);
    assert.equal(r.statusCode, 400, qs);
    assert.equal(r.json().message ?? r.json().erreur ?? r.body, r.json().message ?? r.json().erreur ?? r.body);
    assert.match(r.body, /Requête invalide\./, qs);
  }
});
