import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'illu-routes-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

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

const appel = (app: App, h: Hote, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

function envoi(app: App, h: Hote, url: string, contenu: Buffer, champ = 'fichier') {
  const B = 'XB';
  const payload = Buffer.concat([
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${champ}"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  ]);
  return app.inject({
    method: 'PUT',
    url,
    headers: { ...h, 'content-type': `multipart/form-data; boundary=${B}` },
    payload,
  });
}

const fichiers = () =>
  readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

async function monter() {
  for (const n of readdirSync(RACINE)) if (n !== 'tmp') rmSync(join(RACINE, n), { recursive: true, force: true });
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const zoe = await connecter(app, 'teo');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const base = `/api/univers/${u.id}/fiches`;
  await appel(app, antor, 'POST', `/api/univers/${u.id}/membres`, { username: 'lea' });
  const f = (await appel(app, antor, 'POST', base, { type: 'personnage', titre: 'Aldric', charge: { pj: false } })).json();
  const caché = (await appel(app, antor, 'POST', base, { type: 'lieu', titre: 'Crypte' })).json();
  const s = (await appel(app, antor, 'POST', `${base}/${f.id}/sections`, { titre: 'Pub', contenu: 'x' })).json();
  await appel(app, antor, 'PATCH', `${base}/${f.id}/sections/${s.id}`, { joueursLisent: true });
  await appel(app, antor, 'POST', `${base}/${caché.id}/sections`, { titre: 'MJ', contenu: 'x' });
  return { app, antor, lea, zoe, base, u, f, ill: `${base}/${f.id}/illustration`, cachee: `${base}/${caché.id}/illustration` };
}

test('MJ pose : 200 {jeton,type,taille}, fichier sur disque, lecture avec cache immutable et en-têtes AD-66', async () => {
  const m = await monter();
  const r = await envoi(m.app, m.antor, m.ill, PNG);
  assert.equal(r.statusCode, 200, r.body);
  const { illustration } = r.json();
  assert.equal(illustration.type, 'image/png');
  assert.equal(illustration.taille, 12);
  assert.ok(existsSync(join(RACINE, illustration.jeton)));

  const lu = await appel(m.app, m.lea, 'GET', `${m.ill}?v=${illustration.jeton}`);
  assert.equal(lu.statusCode, 200);
  assert.ok(lu.rawPayload.equals(PNG));
  assert.equal(lu.headers['content-type'], 'image/png');
  assert.equal(lu.headers['cache-control'], 'private, max-age=31536000, immutable');
  assert.equal(lu.headers['x-content-type-options'], 'nosniff');
  assert.equal(lu.headers['content-security-policy'], "default-src 'none'; sandbox");
  assert.match(String(lu.headers['content-disposition']), /^inline/);

  for (const url of [m.ill, `${m.ill}?v=perime`]) {
    const sans = await appel(m.app, m.lea, 'GET', url);
    assert.equal(sans.statusCode, 200);
    assert.equal(sans.headers['cache-control'], 'private, no-store');
  }
});

test('le type est lu à la signature : un JPEG annoncé image/png est servi en image/jpeg', async () => {
  const m = await monter();
  const r = await envoi(m.app, m.antor, m.ill, JPEG);
  assert.equal(r.json().illustration.type, 'image/jpeg');
  assert.equal((await appel(m.app, m.antor, 'GET', m.ill)).headers['content-type'], 'image/jpeg');
});

test('refus : pas une image (HTML, SVG) → 400 pas_une_image, vide → 400 fichier_vide, rien n’est écrit', async () => {
  const m = await monter();
  for (const c of [Buffer.from('<html>x</html>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')]) {
    const r = await envoi(m.app, m.antor, m.ill, c);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().code, 'pas_une_image');
  }
  const v = await envoi(m.app, m.antor, m.ill, Buffer.alloc(0));
  assert.equal(v.statusCode, 400);
  assert.equal(v.json().code, 'fichier_vide');
  assert.deepEqual(fichiers(), []);
  assert.equal(((await appel(m.app, m.antor, 'GET', m.base + `/${m.f.id}`)).json().illustration), null);
});

test('mauvais champ ou corps non multipart → 400, rien d’écrit', async () => {
  const m = await monter();
  assert.equal((await envoi(m.app, m.antor, m.ill, PNG, 'autre')).statusCode, 400);
  const j = await m.app.inject({ method: 'PUT', url: m.ill, headers: m.antor, payload: { a: 1 } });
  assert.equal(j.statusCode, 400);
  assert.deepEqual(fichiers(), []);
});

test('remplacer change le jeton et supprime l’ancien fichier ; retirer → 204, fichier supprimé, 404 ensuite ; retirer sans image → 204', async () => {
  const m = await monter();
  const a = (await envoi(m.app, m.antor, m.ill, PNG)).json().illustration.jeton;
  const b = (await envoi(m.app, m.antor, m.ill, JPEG)).json().illustration.jeton;
  assert.notEqual(a, b);
  assert.deepEqual(fichiers(), [b]);
  assert.equal((await appel(m.app, m.lea, 'GET', `${m.ill}?v=${a}`)).headers['cache-control'], 'private, no-store');

  const d = await appel(m.app, m.antor, 'DELETE', m.ill);
  assert.equal(d.statusCode, 204);
  assert.deepEqual(fichiers(), []);
  assert.equal((await appel(m.app, m.antor, 'GET', m.ill)).statusCode, 404);
  assert.equal((await appel(m.app, m.antor, 'DELETE', m.ill)).statusCode, 204);
});

test('liste, recherche et lecture de fiche rendent illustration null ou {jeton}', async () => {
  const m = await monter();
  const avant = (await appel(m.app, m.antor, 'GET', `${m.base}?type=personnage`)).json();
  assert.equal(JSON.stringify(avant).includes('"illustration":null'), true);
  const jeton = (await envoi(m.app, m.antor, m.ill, PNG)).json().illustration.jeton;

  const liste = (await appel(m.app, m.lea, 'GET', `${m.base}?type=personnage`)).json();
  const items = liste.fiches ?? liste.items ?? liste;
  assert.deepEqual(items.find((x: { id: number }) => x.id === m.f.id).illustration, { jeton });
  const rech = (await appel(m.app, m.lea, 'GET', `${m.base}?type=personnage&q=Aldric`)).json();
  assert.deepEqual((rech.fiches ?? rech.items ?? rech)[0].illustration, { jeton });
  const fiche = (await appel(m.app, m.lea, 'GET', `${m.base}/${m.f.id}`)).json();
  assert.deepEqual(fiche.illustration, { jeton });
  await appel(m.app, m.antor, 'DELETE', m.ill);
  assert.equal((await appel(m.app, m.lea, 'GET', `${m.base}/${m.f.id}`)).json().illustration, null);
});

test('droits : un joueur qui voit la fiche reçoit 403 à PUT et DELETE, rien ne change', async () => {
  const m = await monter();
  const jeton = (await envoi(m.app, m.antor, m.ill, PNG)).json().illustration.jeton;
  assert.equal((await envoi(m.app, m.lea, m.ill, JPEG)).statusCode, 403);
  assert.equal((await appel(m.app, m.lea, 'DELETE', m.ill)).statusCode, 403);
  assert.deepEqual(fichiers(), [jeton]);
});

test('fiche invisible : 404 de corps identique à un identifiant inconnu, en lecture, pose et retrait (joueur ou étranger)', async () => {
  const m = await monter();
  await envoi(m.app, m.antor, m.cachee, PNG);
  const inconnue = `${m.base}/999999/illustration`;
  const ref = await appel(m.app, m.lea, 'GET', inconnue);
  assert.equal(ref.statusCode, 404);
  for (const h of [m.lea, m.zoe]) {
    const g = await appel(m.app, h, 'GET', m.cachee);
    assert.equal(g.statusCode, 404);
    assert.equal(g.body, ref.body);
    const p = await envoi(m.app, h, m.cachee, PNG);
    assert.equal(p.statusCode, 404);
    assert.equal(p.body, ref.body);
    const d = await appel(m.app, h, 'DELETE', m.cachee);
    assert.equal(d.statusCode, 404);
    assert.equal(d.body, ref.body);
  }
  assert.equal(fichiers().length, 1);
  // A visible sheet without illustration answers the same body too.
  const sans = await appel(m.app, m.lea, 'GET', m.ill);
  assert.equal(sans.statusCode, 404);
  assert.equal(sans.body, ref.body);
});

test('MJ en mode joueur : la lecture directe suit ses droits réels', async () => {
  const m = await monter();
  await envoi(m.app, m.antor, m.cachee, PNG);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.cachee}?mode=joueur`)).statusCode, 200);
});

test('poser ne change pas modifie_le de la fiche', async () => {
  const m = await monter();
  const avant = (await appel(m.app, m.antor, 'GET', `${m.base}/${m.f.id}`)).json().modifieLe;
  await new Promise((r) => setTimeout(r, 1100));
  await envoi(m.app, m.antor, m.ill, PNG);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.base}/${m.f.id}`)).json().modifieLe, avant);
});
