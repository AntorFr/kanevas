// Tests of kanevas-recherche-liste, written from the exit criterion (AD-63, AD-74, AD-118 (1-3)).
// HTTP in stub mode, real SQLite.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { migrate, openDb } = await import('../db/db.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  const lame = (app.db.prepare("SELECT id FROM univers WHERE nom = ?").get("Lame d'Ébène") as { id: number }).id;
  const fid = (t: string) => (app.db.prepare('SELECT id FROM fiches WHERE titre = ?').get(t) as { id: number }).id;
  const cookies = new Map<string, string>();
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, payload });
    return { status: r.statusCode, json: JSON.parse(r.body) as Any };
  };
  const put = (compte: string, t: string, corps: object, q = '') =>
    req(compte, 'PUT', `/api/univers/${lame}/fiches/${fid(t)}/etiquetage${q}`, corps);
  const get = (compte: string, t: string) => req(compte, 'GET', `/api/univers/${lame}/fiches/${fid(t)}`);
  const noms = async (compte: string, q = '') =>
    (await req(compte, 'GET', `/api/univers/${lame}/etiquettes${q}`)).json.map((e: { nom: string }) => e.nom);
  const liste = async (compte: string, q: string) => {
    const r = await req(compte, 'GET', `/api/univers/${lame}/fiches?${q}`);
    return r;
  };
  const titres = async (compte: string, q: string) => (await liste(compte, q)).json.fiches.map((f: Any) => f.titre);
  return { app, req, liste, titres, lame };
}

test('alias trouvé', async () => {
  const m = await monde();
  const a = (await m.liste('lea', 'q=salport')).json.fiches;
  assert.deepEqual(a.map((f: Any) => f.titre), ['Port-Sel']);
  assert.equal(a[0].aliasTrouve, 'Salport');
  assert.deepEqual(a[0].alias, ['Port-aux-Sels', 'Salport']);
  assert.deepEqual(a[0].etiquettes, ['Côte des Brumes']);
  const b = (await m.liste('lea', 'q=port-sel')).json.fiches;
  // « Maître Aldric » also quotes Port-Sel in a readable section: the sheet itself carries no aliasTrouve.
  assert.ok(b.some((f: Any) => f.titre === 'Port-Sel'));
  assert.equal(b.find((f: Any) => f.titre === 'Port-Sel').aliasTrouve, undefined);
  const c = (await m.liste('lea', 'q=SALPORT')).json.fiches;
  assert.equal(c[0].aliasTrouve, 'Salport');
});

test('secret, mode Joueur', async () => {
  const m = await monde();
  assert.deepEqual(await m.titres('lea', 'q=sous-main'), []);
  assert.deepEqual(await m.titres('lea', 'q=sous-main&mode=joueur'), []);
  assert.deepEqual(await m.titres('antor', 'q=sous-main'), ['Port-Sel']);
  assert.deepEqual(await m.titres('antor', 'q=sous-main&mode=joueur'), []);
  assert.deepEqual(await m.titres('antor', 'q=sous%20main'), ['Port-Sel']);
});

test('étiquette', async () => {
  const m = await monde();
  const e = encodeURIComponent('Côte des Brumes');
  assert.deepEqual(await m.titres('lea', `etiquette=${e}`), ['Port-Sel']);
  assert.deepEqual(await m.titres('antor', `etiquette=${e}`), ['Cercle des Cendres', 'Port-Sel']);
  assert.deepEqual(await m.titres('antor', `etiquette=${e}&mode=joueur`), ['Port-Sel']);
  assert.deepEqual(await m.titres('antor', `etiquette=${encodeURIComponent('côte DES brumes')}`), ['Cercle des Cendres', 'Port-Sel']);
  assert.deepEqual(await m.titres('antor', 'etiquette=Inconnue'), []);
  // Label is not a text search: the label alone as q does not match through the index.
  assert.deepEqual(await m.titres('lea', `q=${e}&etiquette=${e}`), ['Port-Sel']);
});

test('types, sous-type, savoir désactivé, illisible', async () => {
  const m = await monde();
  assert.deepEqual(await m.titres('lea', 'q=chronique'), ["Chronique de l'Âge d'Ombre"]);
  assert.deepEqual(await m.titres('lea', 'q=r%C3%A9cit'), ["Chronique de l'Âge d'Ombre"]);
  assert.deepEqual(await m.titres('lea', 'q=recit'), ["Chronique de l'Âge d'Ombre"]);
  assert.ok(!(await m.titres('lea', 'q=cendres')).includes('Cercle des Cendres'));
  assert.ok((await m.titres('antor', 'q=cendres')).includes('Cercle des Cendres'));
  assert.deepEqual(await m.titres('lea', 'q=taverne'), ['La Taverne du Kraken', 'Le Pendu Joyeux']);
  assert.deepEqual(await m.titres('lea', 'q=taverne&type=lieu'), ['La Taverne du Kraken', 'Le Pendu Joyeux']);
  assert.deepEqual(await m.titres('lea', 'q=taverne&type=personnage'), []);
  const l = (await m.liste('lea', 'q=taverne&type=lieu')).json.fiches;
  assert.ok(l.every((f: Any) => f.type === 'lieu'));
});

test('bornes et ordre', async () => {
  const m = await monde();
  assert.equal((await m.liste('lea', 'q=' + 'a'.repeat(100))).status, 200);
  assert.equal((await m.liste('lea', 'q=' + 'a'.repeat(101))).status, 400);
  const t = await m.titres('antor', '');
  assert.deepEqual(t, [...t].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase())));
  assert.equal((await m.liste('lea', 'etiquette=')).status < 500, true);
  assert.equal((await m.liste('lea', 'q=%22%20OR%20*')).status < 500, true);
  assert.equal((await m.liste('lea', 'q=NEAR(a%20b)')).status < 500, true);
});

test('curseur avec recherche', async () => {
  const m = await monde();
  const p1 = (await m.liste('antor', 'q=a')).json;
  assert.ok(p1.fiches.length > 0);
});

test('mode ignoré pour un non-MJ', async () => {
  const m = await monde();
  assert.deepEqual(await m.titres('lea', 'q=salport&mode=joueur'), ['Port-Sel']);
  assert.deepEqual(await m.titres('lea', 'q=salport&mode=mj'), ['Port-Sel']);
});
