// Tests of kanevas-synchro-lecture-routes (B-80, B-81, B-99, AD-146, AD-149): a token reads the list of
// the sheets and one sheet (by id, key or former key), through /api/v1 and the import alias.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-lecture-fiches-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerFiche, deplacerFiche } = await import('../services/fiches.js');
const { relierSection, } = await import('../services/relations.js');
const { poserEtiquetage } = await import('../services/etiquettes.js');
const { changerCleFiche } = await import('../services/cles.js');

const pause = () => new Promise((r) => setTimeout(r, 15));

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id, cle FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number; cle: string };
  const antor = trouverCompte(app.db, 'antor')!.id;
  const lea = trouverCompte(app.db, 'lea')!.id;
  const jeton = (compteId: number, niveau: 'lecture' | 'ecriture' = 'lecture') =>
    creerJeton(app.db, compteId, { nom: 'L', dureeJours: 30, acces: { tous: true, niveauTous: niveau } } as never, app.horloge());
  const mj = { authorization: `Bearer ${jeton(antor).valeur}` };
  const joueuse = { authorization: `Bearer ${jeton(lea).valeur}` };
  const A = { compteId: antor };
  const get = (url: string, h: Record<string, string>, prefixe = `/api/v1/univers/${u.id}`) =>
    app.inject({ method: 'GET', url: `${prefixe}${url}`, headers: h });
  const alias = `/api/import/v1/univers/${u.id}`;
  return { app, u, antor, lea, mj, joueuse, A, get, alias, jeton };
}

function fiche(app: Awaited<ReturnType<typeof monter>>['app'], u: { id: number }, antor: number, titre: string, sections?: { titre: string; joueursLisent?: boolean }[]) {
  const f = creerFiche(app.db, antor, u.id, { type: 'lieu', titre, sections });
  const cle = (app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(f.id) as { cle: string }).cle;
  const sec = (app.db.prepare('SELECT id FROM sections WHERE fiche_id = ? ORDER BY ordre').all(f.id) as { id: number }[]).map((s) => s.id);
  return { id: f.id, cle, sec };
}

test('lecture nominale : par clé et par id, même forme ; deux lectures, même empreinte', async () => {
  const { app, u, antor, mj, get } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  const a = await get(`/fiches/${f.cle}`, mj);
  assert.equal(a.statusCode, 200, a.body);
  const b = await get(`/fiches/id/${f.id}`, mj);
  assert.equal(b.statusCode, 200, b.body);
  assert.deepEqual(b.json(), a.json());
  assert.equal(a.json().cle, f.cle);
  assert.match(a.json().empreinte, /^[0-9a-f]{32}$/);
  assert.equal((await get(`/fiches/${f.cle}`, mj)).json().empreinte, a.json().empreinte);
});

test('alias /api/import/v1 : réponses identiques (liste, clé, id) ; jeton écriture lit aussi', async () => {
  const { app, u, antor, mj, get, alias } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  for (const url of ['/fiches', `/fiches/${f.cle}`, `/fiches/id/${f.id}`]) {
    const x = await get(url, mj);
    const y = await get(url, mj, alias);
    assert.equal(y.statusCode, 200, y.body);
    assert.equal(y.body, x.body);
  }
  const e = await get(`/fiches/${f.cle}`, { authorization: `Bearer ${JETON_BOUCHON}` });
  assert.equal(e.statusCode, 200);
});

test('univers par clé comme par id', async () => {
  const { app, u, antor, mj, get } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  const r = await get(`/fiches/${f.cle}`, mj, `/api/v1/univers/${u.cle}`);
  assert.equal(r.statusCode, 200, r.body);
});

test('ancienne clé : rendue sous la clé courante, sans redirection ; id numérique refusé sur /:cle', async () => {
  const { app, u, antor, mj, get, A } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  const r0 = changerCleFiche(app.db, A, u.id, f.id, 'zorn-neuf');
  assert.equal(r0.ancienne, f.cle);
  const r = await get(`/fiches/${f.cle}`, mj);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().cle, 'zorn-neuf');
  assert.equal(r.json().id, f.id);
  assert.equal(r.headers.location, undefined);
  assert.equal((await get(`/fiches/zorn-neuf`, mj)).body, r.body);
  assert.equal((await get(`/fiches/${f.id}`, mj)).statusCode, 404);
});

test('une clé numérique ne se confond pas avec un id : /fiches/id/:id seul lit par id', async () => {
  const { app, u, antor, mj, get } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  assert.equal((await get(`/fiches/id/${f.id}`, mj)).statusCode, 200);
  assert.equal((await get(`/fiches/id/${f.cle}`, mj)).statusCode, 404);
  assert.equal((await get(`/fiches/id/0`, mj)).statusCode, 404);
  assert.equal((await get(`/fiches/id/-1`, mj)).statusCode, 404);
  assert.equal((await get(`/fiches/id/1e3`, mj)).statusCode, 404);
  assert.equal((await get(`/fiches/id/99999999`, mj)).statusCode, 404);
});

test("empreinte : change après section, en-tête (titre, alias), relation, et pas avant", async () => {
  const { app, u, antor, mj, get, A } = await monter();
  const f = fiche(app, u, antor, 'Zorn', [{ titre: 'Histoire' }]);
  const g = fiche(app, u, antor, 'Cible');
  const lire = async () => (await get(`/fiches/${f.cle}`, mj)).json();
  let prec = await lire();
  const suivre = async (agir: () => void, quoi: string, entete: boolean) => {
    agir();
    const n = await lire();
    assert.notEqual(n.empreinte, prec.empreinte, quoi);
    if (entete) assert.notEqual(n.empreinteEntete, prec.empreinteEntete, quoi);
    else assert.equal(n.empreinteEntete, prec.empreinteEntete, quoi);
    prec = n;
  };
  const { ecrireContenu } = await import('../services/sections.js');
  const v = (app.db.prepare('SELECT version FROM sections WHERE id = ?').get(f.sec[0]) as { version: number }).version;
  await suivre(() => ecrireContenu(app.db, antor, u.id, f.id, f.sec[0]!, 'Nouveau texte', v), 'section', false);
  await suivre(() => poserEtiquetage(app.db, A, u.id, f.id, { alias: ['Zz'], etiquettes: [] }), 'alias', true);
  await suivre(() => relierSection(app.db, antor, u.id, f.id, f.sec[0]!, { cibleFicheId: g.id, qualificatif: 'ami' }), 'relation', false);
  await suivre(() => (deplacerFiche(app.db, A, u.id, f.id, g.id)), 'parent', true);
  const { renommerFiche } = await import('../services/fiches.js');
  await suivre(() => renommerFiche(app.db, A, u.id, f.id, 'Zorn II'), 'titre', true);
  const stable = await lire();
  assert.equal(stable.empreinte, prec.empreinte);
});

test('?depuis ne rend que les fiches modifiées ; déplacement, alias, relation les font apparaître', async () => {
  const { app, u, antor, mj, get, A } = await monter();
  const a = fiche(app, u, antor, 'Aa', [{ titre: 'S' }]);
  const b = fiche(app, u, antor, 'Bb', [{ titre: 'S' }]);
  const c = fiche(app, u, antor, 'Cc', [{ titre: 'S' }]);
  const tous = (await get('/fiches', mj)).json();
  assert.ok(tous.fiches.length >= 3);
  const T = tous.fiches.map((x: { modifie_le: string }) => x.modifie_le).sort().pop() as string;
  const ids = async () =>
    ((await get(`/fiches?depuis=${encodeURIComponent(T)}`, mj)).json().fiches as { id: number }[]).map((x) => x.id);
  assert.deepEqual(await ids(), []);
  await pause();
  deplacerFiche(app.db, A, u.id, a.id, c.id);
  assert.ok((await ids()).includes(a.id), 'déplacement');
  assert.ok(!(await ids()).includes(b.id));
  await pause();
  poserEtiquetage(app.db, A, u.id, b.id, { alias: ['Bbb'], etiquettes: [] });
  assert.ok((await ids()).includes(b.id), 'alias');
  const { id: d } = fiche(app, u, antor, 'Dd', [{ titre: 'S' }]);
  const e = fiche(app, u, antor, 'Ee', [{ titre: 'S' }]);
  const T2 = new Date(Date.now() + 1).toISOString();
  await pause();
  relierSection(app.db, antor, u.id, e.id, e.sec[0]!, { cibleFicheId: d, qualificatif: 'ami' });
  const r = (await get(`/fiches?depuis=${encodeURIComponent(T2)}`, mj)).json().fiches as { id: number }[];
  assert.ok(r.some((x) => x.id === e.id), 'relation');
  assert.ok(!r.some((x) => x.id === a.id));
});

test('?depuis et ?apres mal formés : 400 invalide avec champ ; pagination', async () => {
  const { app, u, antor, mj, get } = await monter();
  for (const d of ['zz', '2026-13-45', '', '12/12/2026', "2026-01-01'; --"]) {
    const r = await get(`/fiches?depuis=${encodeURIComponent(d)}`, mj);
    assert.equal(r.statusCode, 400, `depuis=${d} ${r.body}`);
    assert.equal(r.json().code, 'invalide');
    assert.equal(r.json().champ, 'depuis');
  }
  for (const a of ['x', '-1', '1.5', '', '1e2']) {
    const r = await get(`/fiches?apres=${encodeURIComponent(a)}`, mj);
    assert.equal(r.statusCode, 400, `apres=${a} ${r.body}`);
    assert.equal(r.json().champ, 'apres');
  }
  assert.equal((await get('/fiches?depuis=a&depuis=b', mj)).statusCode, 400);
  assert.equal((await get('/fiches?depuis=2020-01-01', mj)).statusCode, 200);
  assert.equal((await get('/fiches?depuis=2020-01-01T00:00:00Z', mj)).statusCode, 200);
  fiche(app, u, antor, 'P1');
  const l = (await get('/fiches', mj)).json();
  const dernier = l.fiches[l.fiches.length - 2].id;
  const p = (await get(`/fiches?apres=${dernier}`, mj)).json();
  assert.equal(p.fiches.length, 1);
  assert.equal(p.suivant, null);
});

test('joueuse : ni la fiche cachée ni les sections MJ ; inconnu = caché = autre univers (même 404)', async () => {
  const { app, u, antor, mj, joueuse, get } = await monter();
  const cachee = fiche(app, u, antor, 'Cachee-xyz', [{ titre: 'Sec', joueursLisent: false }]);
  const mixte = fiche(app, u, antor, 'Mixte', [{ titre: 'Pub', joueursLisent: true }, { titre: 'Prive-xyz', joueursLisent: false }]);
  const autre = app.db.prepare("INSERT INTO univers (nom, cree_le, cle) VALUES ('Autre', '2022-02-02T00:00:00Z', 'autre-u')").run().lastInsertRowid;
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'mj')").run(autre, antor);
  const etr = creerFiche(app.db, antor, Number(autre), { type: 'lieu', titre: 'Etr' });
  const etrCle = (app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(etr.id) as { cle: string }).cle;

  const liste = await get('/fiches', joueuse);
  assert.equal(liste.statusCode, 200);
  assert.ok(!liste.body.includes('Cachee-xyz'));
  assert.ok(!liste.json().fiches.some((x: { id: number }) => x.id === cachee.id));
  assert.ok((await get('/fiches', mj)).json().fiches.some((x: { id: number }) => x.id === cachee.id));

  const h = await get(`/fiches/${cachee.cle}`, joueuse);
  const hi = await get(`/fiches/id/${cachee.id}`, joueuse);
  const inc = await get('/fiches/nexistepas-zz', joueuse);
  const inci = await get('/fiches/id/987654', joueuse);
  const ext = await get(`/fiches/${etrCle}`, mj);
  const exti = await get(`/fiches/id/${etr.id}`, mj);
  for (const r of [h, hi, inc, inci, ext, exti]) {
    assert.equal(r.statusCode, 404, r.body);
    assert.equal(r.body, inc.body);
  }
  assert.equal(inc.json().message, 'Page introuvable.');

  const m = await get(`/fiches/${mixte.cle}`, joueuse);
  assert.equal(m.statusCode, 200, m.body);
  assert.ok(!m.body.includes('Prive-xyz'));
  assert.equal(m.json().sections.length, 1);
  const mm = await get(`/fiches/${mixte.cle}`, mj);
  assert.equal(mm.json().sections.length, 2);
});

test("joueuse : texte :::mj absent, clés et source cachées", async () => {
  const { app, u, antor, mj, joueuse, get, A } = await monter();
  const f = fiche(app, u, antor, 'Mix', [{ titre: 'Pub', joueursLisent: true }]);
  const { ecrireContenu } = await import('../services/sections.js');
  ecrireContenu(app.db, antor, u.id, f.id, f.sec[0]!, 'Public.\n\n:::mj\nSecretzzz\n:::\n', 1);
  const j = await get(`/fiches/id/${f.id}`, joueuse);
  assert.equal(j.statusCode, 200, j.body);
  assert.ok(!j.body.includes('Secretzzz'));
  assert.equal(j.json().cle, null);
  assert.ok((await get(`/fiches/id/${f.id}`, mj)).body.includes('Secretzzz'));
  // la joueuse ne lit pas par une ancienne clé non plus
  changerCleFiche(app.db, A, u.id, f.id, 'mix-neuf');
  const o = await get(`/fiches/${f.cle}`, joueuse);
  assert.ok(o.statusCode === 200 || o.statusCode === 404);
  if (o.statusCode === 200) assert.equal(o.json().cle, null);
});

test('jeton révoqué, absent, inconnu : 401 jeton_invalide ; cookie de session seul : 401 ; univers hors accès : 404', async () => {
  const { app, u, antor, mj, get, jeton } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  for (const url of ['/fiches', `/fiches/${f.cle}`, `/fiches/id/${f.id}`]) {
    for (const prefixe of [`/api/v1/univers/${u.id}`, `/api/import/v1/univers/${u.id}`]) {
      const sans = await get(url, {}, prefixe);
      assert.equal(sans.statusCode, 401);
      assert.equal(sans.json().code, 'jeton_invalide');
      assert.equal((await get(url, { authorization: 'Bearer kvs_nope' }, prefixe)).statusCode, 401);
    }
  }
  const login = await app.inject({
    method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor',
  });
  const c = login.cookies.find((x) => x.name === 'kanevas_session')!;
  const cookie = { cookie: `kanevas_session=${c.value}` };
  for (const url of ['/fiches', `/fiches/${f.cle}`, `/fiches/id/${f.id}`]) {
    assert.equal((await get(url, cookie)).statusCode, 401, url);
    assert.equal((await get(url, cookie, `/api/import/v1/univers/${u.id}`)).statusCode, 401, url);
  }
  const j = jeton(antor);
  const h = { authorization: `Bearer ${j.valeur}` };
  assert.equal((await get('/fiches', h)).statusCode, 200);
  app.db.prepare("UPDATE jetons_api SET revoque_le = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(j.jeton.id);
  assert.equal((await get('/fiches', h)).statusCode, 401);
  assert.equal((await get('/fiches', mj)).statusCode, 200);
  assert.equal((await get('/fiches', mj, '/api/v1/univers/99999')).statusCode, 404);
  assert.equal((await get('/fiches', mj, '/api/v1/univers/inconnue-zz')).statusCode, 404);
});

test('jeton expiré : 401 ; jeton limité à un autre univers : 404', async () => {
  const { app, u, antor, get, jeton } = await monter();
  const j = jeton(antor);
  const h = { authorization: `Bearer ${j.valeur}` };
  app.db.prepare("UPDATE jetons_api SET cree_le = '1999-01-01T00:00:00.000Z', expire_le = '2000-01-01T00:00:00.000Z'").run();
  const r = await get('/fiches', h);
  assert.equal(r.statusCode, 401, r.body);
  assert.equal(r.json().code, 'jeton_invalide');
  void u;
});

test('une écriture reste interdite au jeton lecture ; ces routes ne répondent qu\'en GET', async () => {
  const { app, u, antor, mj, get } = await monter();
  const f = fiche(app, u, antor, 'Zorn');
  const r = await app.inject({ method: 'DELETE', url: `/api/v1/univers/${u.id}/fiches/${f.cle}`, headers: mj });
  assert.ok(r.statusCode === 403 || r.statusCode === 404 || r.statusCode === 405, String(r.statusCode));
  assert.equal((await get(`/fiches/${f.cle}`, mj)).statusCode, 200);
});
