// Tests of kanevas-synchro-lecture-put-fichier (B-91, B-48, AD-104, AD-117): an omitted `visibilite` is not sent.
// Replays of PUT /fichiers/:cle without it keep what Kanevas holds;
// PUT /fichiers/:cle of the import API, with the stub token and the seed « Essai Kanka ».
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-fichiers-omission-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const PDF = Buffer.from('%PDF-1.4 tarifs');

type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
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

function multipart(contenu: Buffer, champs: Record<string, string>) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

const nbOctets = () => readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, contenu: Buffer, champs: Record<string, string>, lot?: number, headers = auth) => {
    const m = multipart(contenu, champs);
    return app.inject({
      method: 'PUT',
      url: `${base}/fichiers/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: { ...headers, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const lea = await connecter(app, 'lea');
  const antor = await connecter(app, 'antor');
  const liste = async (h: Record<string, string>) =>
    (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fichiers`, headers: h })).json() as {
      fichiers: { id: number; nom: string; visibilite: string }[];
    };
  const octets = async (h: Record<string, string>, id: number) =>
    app.inject({ method: 'GET', url: `/api/univers/${u.id}/fichiers/${id}`, headers: h });
  const lignes = () => (app.db.prepare('SELECT COUNT(*) n FROM fichiers').get() as { n: number }).n;
  return { app, u, put, lot, clore, lire, lea, antor, liste, octets, lignes, base, auth };
}


const vis = (app: App, id: number) => (app.db.prepare('SELECT visibilite FROM fichiers WHERE id = ?').get(id) as { visibilite: string }).visibilite;

test('B-91 : fichier mj posé par le script, rejoué sans visibilité : reste mj, inchangé, sans avertissement', async () => {
  const { put, lot, lire, app } = await monter();
  const id = (await put('img:m', PNG, { nom: 'm.png', visibilite: 'mj' })).json().id;
  const l = await lot();
  const r = await put('img:m', PNG, { nom: 'm.png' }, l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(r.json().avertissements, []);
  assert.equal(vis(app, id), 'mj');
  assert.equal((await lire(l)).avertissements, 0);
});

test('B-91 : fichier passé mj dans Kanevas, rejoué sans visibilité (octets neufs compris) : reste mj', async () => {
  const { put, app } = await monter();
  const id = (await put('img:k', PNG, { nom: 'k.png' })).json().id;
  assert.equal(vis(app, id), 'joueurs');
  app.db.prepare("UPDATE fichiers SET visibilite = 'mj' WHERE id = ?").run(id);
  const r1 = await put('img:k', PNG, { nom: 'k.png' });
  assert.equal(r1.json().etat, 'inchangee');
  assert.equal(vis(app, id), 'mj');
  const r2 = await put('img:k', PNG2, { nom: 'k.png' });
  assert.equal(r2.json().etat, 'mise_a_jour');
  assert.equal(vis(app, id), 'mj');
});

test('B-91 : fichier mj dans Kanevas, le joueur ne le voit toujours pas après un rejeu sans visibilité', async () => {
  const { put, lea, liste, app } = await monter();
  const id = (await put('img:s2', PNG, { nom: 'secret2.png', visibilite: 'mj' })).json().id;
  await put('img:s2', PNG2, { nom: 'secret2.png' });
  assert.equal(vis(app, id), 'mj');
  assert.ok(!(await liste(lea)).fichiers.some((f) => f.nom === 'secret2.png'));
});

test('B-91 : fichier neuf sans visibilité : créé joueurs', async () => {
  const { put, app } = await monter();
  const id = (await put('img:n2', PNG, { nom: 'n2.png' })).json().id;
  assert.equal(vis(app, id), 'joueurs');
});

test('B-91 : visibilité envoyée sur un fichier non retouché le change, dans les deux sens, sans avertissement', async () => {
  const { put, app } = await monter();
  const id = (await put('img:v', PNG, { nom: 'v.png' })).json().id;
  const a = await put('img:v', PNG, { nom: 'v.png', visibilite: 'mj' });
  assert.equal(a.json().etat, 'mise_a_jour');
  assert.deepEqual(a.json().avertissements, []);
  assert.equal(vis(app, id), 'mj');
  const b = await put('img:v', PNG, { nom: 'v.png', visibilite: 'joueurs' });
  assert.equal(b.json().etat, 'mise_a_jour');
  assert.equal(vis(app, id), 'joueurs');
});

test('B-47 : visibilité retouchée dans Kanevas, un rejeu sans visibilité la garde, un rejeu avec la reprend, sans avertissement', async () => {
  const { put, app } = await monter();
  const id = (await put('img:b', PNG, { nom: 'b.png', visibilite: 'mj' })).json().id;
  app.db.prepare("UPDATE fichiers SET visibilite = 'joueurs' WHERE id = ?").run(id);
  await put('img:b', PNG, { nom: 'b.png' });
  assert.equal(vis(app, id), 'joueurs');
  const r = await put('img:b', PNG, { nom: 'b.png', visibilite: 'mj' });
  assert.deepEqual(r.json().avertissements, []);
  assert.equal(vis(app, id), 'mj');
});

test('B-91 : un rejeu sans visibilité ne désarme pas la marque : le script peut ensuite changer un fichier non retouché', async () => {
  const { put, app } = await monter();
  const id = (await put('img:d', PNG, { nom: 'd.png', visibilite: 'mj' })).json().id;
  await put('img:d', PNG, { nom: 'd.png' });
  await put('img:d', PNG, { nom: 'd.png', visibilite: 'joueurs' });
  assert.equal(vis(app, id), 'joueurs');
});

test('visibilité vide ou inconnue envoyée : refusée (champ visibilite), rien écrit', async () => {
  const { put, app, lignes } = await monter();
  const id = (await put('img:e', PNG, { nom: 'e.png', visibilite: 'mj' })).json().id;
  const n = lignes();
  for (const v of ['', 'tous']) {
    const r = await put('img:e', PNG, { nom: 'e.png', visibilite: v });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().champ, 'visibilite');
  }
  const r = await put('img:nouveau', PNG, { nom: 'x.png', visibilite: '' });
  assert.equal(r.json().champ, 'visibilite');
  assert.equal(lignes(), n);
  assert.equal(vis(app, id), 'mj');
});
