// Re-check of kanevas-import-secrets (B-34), end to end: a closing line `:::` bordered by a blank other
// than space or tab does not close the GM block, so nothing of what follows reaches a player.
// Expectations are literals taken from B-34 ("Kanevas ne livre rien d'un bloc MJ à qui n'est pas MJ").
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

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

// Panne visée : le ferme-bloc accepte un blanc Unicode (\s) que le moteur n'honore pas, et le texte
// après la fausse fermeture sort dans le public, la recherche et la lecture d'un joueur.
const BLANCS: Array<[string, string]> = [
  ['U+2003', ' '], ['U+3000', '　'], ['U+FEFF', '﻿'], ['U+2028', ' '], ['VT', '\v'], ['FF', '\f'],
];

for (const [nom, w] of BLANCS) {
  for (const [cote, ligne] of [['avant', `${w}:::`], ['après', `:::${w}`]] as const) {
    test(`B-34 : ligne ${cote === 'avant' ? 'bordée avant' : 'bordée après'} par ${nom}, rien du bloc ni de sa suite ne sort vers Léa`, async () => {
      const app = await buildApp();
      semerBouchon(app.db);
      const antor = await connecter(app, 'antor');
      const lea = await connecter(app, 'lea');
      const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
      const base = `/api/univers/${u.id}`;
      const f = app.db.prepare("SELECT id FROM fiches WHERE titre = 'Maître Aldric'").get() as { id: number };
      const s = (await app.inject({ method: 'POST', url: `${base}/fiches/${f.id}/sections`, headers: antor, payload: { titre: 'Notes', contenu: '' } })).json();
      await app.inject({ method: 'PATCH', url: `${base}/fiches/${f.id}/sections/${s.id}`, headers: antor, payload: { joueursLisent: true } });
      const v0 = (await app.inject({ method: 'GET', url: `${base}/fiches/${f.id}/sections/${s.id}`, headers: antor })).json().version;
      const put = await app.inject({
        method: 'PUT', url: `${base}/fiches/${f.id}/sections/${s.id}/contenu`, headers: antor,
        payload: { contenu: `:::mj\nsecretun\n${ligne}\nsecretdeux\n:::\npubliquefin`, version: v0 },
      });
      assert.equal(put.statusCode, 200, put.body);

      const lecture = await app.inject({ method: 'GET', url: `${base}/fiches/${f.id}/sections/${s.id}`, headers: lea });
      assert.equal(lecture.statusCode, 200, lecture.body);
      assert.ok(!lecture.body.includes('secretun'), lecture.body);
      assert.ok(!lecture.body.includes('secretdeux'), lecture.body);
      assert.ok(lecture.body.includes('publiquefin'), lecture.body);

      const trouve = async (h: object, mot: string) =>
        (await app.inject({ method: 'GET', url: `${base}/fiches?q=${mot}`, headers: h as Record<string, string> })).body.includes('Maître Aldric');
      assert.equal(await trouve(lea, 'secretun'), false);
      assert.equal(await trouve(lea, 'secretdeux'), false);
      assert.equal(await trouve(lea, 'publiquefin'), true);
      assert.equal(await trouve(antor, 'secretdeux'), true);
    });
  }
}
