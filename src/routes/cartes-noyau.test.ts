// kanevas-synchro-cartes-noyau: session routes to attach, detach and write the text of a map, and the sheet's « Cartes » block.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'cartes-noyau-routes-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
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
const appel = (app: App, h: Hote, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const u2 = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Ailleurs' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const fiche = async (univ: number, titre: string, ouverte: boolean) => {
    const b = `/api/univers/${univ}`;
    const f = (await appel(app, antor, 'POST', `${b}/fiches`, { type: 'lieu', titre })).json() as { id: number };
    const s = (await appel(app, antor, 'POST', `${b}/fiches/${f.id}/sections`, { titre: 'S', contenu: 'x' })).json();
    if (ouverte) await appel(app, antor, 'PATCH', `${b}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
    return f;
  };
  const port = await fiche(u.id, 'Port-Sel', true);
  const crypte = await fiche(u.id, 'Crypte Secrète', false);
  const loin = await fiche(u2.id, 'Loin', true);
  const carte = async (titre: string, visible: boolean) => {
    const c = (await appel(app, antor, 'POST', `${base}/cartes`, { titre, forme: 'graphe' })).json() as { id: number };
    if (visible) await appel(app, antor, 'PATCH', `${base}/cartes/${c.id}`, { visible: true });
    return c;
  };
  return { app, antor, lea, teo, base, port, crypte, loin, carte };
}
type M = Awaited<ReturnType<typeof monter>>;
const url = (m: M, c: { id: number }, suite: string) => `${m.base}/cartes/${c.id}/${suite}`;

test('MJ : rattache, détache, écrit le texte (version exigée, 409 carte_modifiee à la seconde écriture de la même version)', async () => {
  const m = await monter();
  const c = await m.carte('Plan', true);
  const r = await appel(m.app, m.antor, 'PUT', url(m, c, 'fiche'), { ficheId: m.port.id });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().fiche, { id: m.port.id, titre: 'Port-Sel', type: 'lieu' });
  const d = await appel(m.app, m.antor, 'DELETE', url(m, c, 'fiche'));
  assert.equal(d.statusCode, 200, d.body);
  assert.equal(d.json().fiche, null);

  const lu = (await appel(m.app, m.antor, 'GET', `${m.base}/cartes/${c.id}`)).json().carte;
  assert.equal(lu.version, 0);
  const t1 = await appel(m.app, m.antor, 'PUT', url(m, c, 'texte'), { texte: 'Bonjour', version: 0 });
  assert.equal(t1.statusCode, 200, t1.body);
  assert.equal(t1.json().version, 1);
  const t2 = await appel(m.app, m.antor, 'PUT', url(m, c, 'texte'), { texte: 'Autre', version: 0 });
  assert.equal(t2.statusCode, 409, t2.body);
  assert.equal(t2.json().code, 'carte_modifiee');
  const relu = (await appel(m.app, m.antor, 'GET', `${m.base}/cartes/${c.id}`)).json().carte;
  assert.equal(relu.texte, 'Bonjour');
  assert.equal(relu.version, 1);
});

test('texte : version absente ou non entière → 400 (la route l’exige) ; texte absent ou trop long → 400, rien écrit', async () => {
  const m = await monter();
  const c = await m.carte('Plan', true);
  for (const corps of [{ texte: 'x' }, { texte: 'x', version: '0' }, { texte: 'x', version: 0.5 }, { texte: 'x', version: null }]) {
    const r = await appel(m.app, m.antor, 'PUT', url(m, c, 'texte'), corps);
    assert.equal(r.statusCode, 400, JSON.stringify(corps) + r.body);
  }
  for (const corps of [{ version: 0 }, { texte: 5, version: 0 }, { texte: 'x'.repeat(5001), version: 0 }]) {
    const r = await appel(m.app, m.antor, 'PUT', url(m, c, 'texte'), corps);
    assert.equal(r.statusCode, 400, r.body);
  }
  const lu = (await appel(m.app, m.antor, 'GET', `${m.base}/cartes/${c.id}`)).json().carte;
  assert.equal(lu.version, 0);
  assert.equal(lu.texte, '');
});

test('rattacher : fiche d’un autre univers, inconnue ou absente → 400 champ fiche', async () => {
  const m = await monter();
  const c = await m.carte('Plan', true);
  for (const corps of [{ ficheId: m.loin.id }, { ficheId: 999999 }, {}, { ficheId: 'a' }]) {
    const r = await appel(m.app, m.antor, 'PUT', url(m, c, 'fiche'), corps);
    assert.equal(r.statusCode, 400, JSON.stringify(corps) + r.body);
    assert.equal(r.json().champ, 'fiche', r.body);
  }
});

test('joueur et inconnu : 404 sur chacune des trois écritures, rien n’est écrit', async () => {
  const m = await monter();
  const c = await m.carte('Plan', true);
  for (const h of [m.lea, m.teo]) {
    for (const [v, s, b] of [
      ['PUT', 'fiche', { ficheId: m.port.id }],
      ['DELETE', 'fiche', undefined],
      ['PUT', 'texte', { texte: 'x', version: 0 }],
    ] as const) {
      const r = await appel(m.app, h, v, url(m, c, s), b);
      assert.equal(r.statusCode, 404, `${v} ${s} ${r.body}`);
    }
  }
  for (const [v, s, b] of [
    ['PUT', 'fiche', { ficheId: m.port.id }],
    ['PUT', 'texte', { texte: 'x', version: 0 }],
  ] as const) {
    assert.equal((await appel(m.app, m.antor, v, `${m.base}/cartes/999999/${s}`, b)).statusCode, 404);
  }
  const lu = (await appel(m.app, m.antor, 'GET', `${m.base}/cartes/${c.id}`)).json().carte;
  assert.equal(lu.version, 0);
  assert.equal(lu.fiche, null);
});

test('GET /fiches/:fid/cartes : le joueur ne reçoit que les cartes visibles du lieu, le MJ toutes ; sans fuite du texte MJ', async () => {
  const m = await monter();
  const vis = await m.carte('Visible', true);
  const cach = await m.carte('Cachée', false);
  for (const c of [vis, cach]) await appel(m.app, m.antor, 'PUT', url(m, c, 'fiche'), { ficheId: m.port.id });
  await appel(m.app, m.antor, 'PUT', url(m, vis, 'texte'), { texte: 'Pub\n\n:::mj\nSecret MJ\n:::', version: 0 });
  const f = `${m.base}/fiches/${m.port.id}/cartes`;
  const j = await appel(m.app, m.lea, 'GET', f);
  assert.equal(j.statusCode, 200, j.body);
  assert.deepEqual(j.json().cartes.map((c: { id: number }) => c.id), [vis.id]);
  assert.ok(!j.body.includes('Secret'));
  assert.ok(!j.body.includes('Cachée'));
  assert.equal(j.json().cartes[0].texte, undefined);
  assert.equal(j.json().cartes[0].version, undefined);
  const mj = await appel(m.app, m.antor, 'GET', f);
  assert.deepEqual(mj.json().cartes.map((c: { id: number }) => c.id).sort(), [vis.id, cach.id].sort());
  const enJoueur = await appel(m.app, m.antor, 'GET', `${f}?mode=joueur`);
  assert.deepEqual(enJoueur.json().cartes.map((c: { id: number }) => c.id), [vis.id]);
  assert.ok(!enJoueur.body.includes('Secret'));
  // no role: 404 ; unknown sheet: 404 ; a sheet of another universe: 404
  assert.equal((await appel(m.app, m.teo, 'GET', f)).statusCode, 404);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.base}/fiches/999999/cartes`)).statusCode, 404);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.base}/fiches/${m.loin.id}/cartes`)).statusCode, 404);
});

test('AD-38 : une carte rattachée à une fiche que le lecteur ne lit pas ne nomme pas cette fiche', async () => {
  const m = await monter();
  const c = await m.carte('Plan', true);
  await appel(m.app, m.antor, 'PUT', url(m, c, 'fiche'), { ficheId: m.crypte.id });
  for (const u of [`${m.base}/cartes/${c.id}`, `${m.base}/cartes`]) {
    const r = await appel(m.app, m.lea, 'GET', u);
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(!r.body.includes('Crypte'), r.body);
  }
  const r = await appel(m.app, m.lea, 'GET', `${m.base}/cartes/${c.id}`);
  assert.equal(r.json().carte.fiche, undefined);
  // the sheet's block answers 404 to Léa, as for any sheet she cannot read
  assert.equal((await appel(m.app, m.lea, 'GET', `${m.base}/fiches/${m.crypte.id}/cartes`)).statusCode, 404);
  // the GM reads the name
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.base}/cartes/${c.id}`)).json().carte.fiche.titre, 'Crypte Secrète');
});
