import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = mkdtempSync(join(tmpdir(), 'kanevas-lien-'));
writeFileSync(join(racine, 'index.html'), '<!doctype html><html><body>app</body></html>');
process.env.NODE_ENV = 'test';
process.env.FRONTEND_DIR = racine;
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

// antor: creator of the system and GM of Lame (attached), no GM status on the system; lea: player of Lame;
// mira: GM of the system only (her universe is not attached); teo: no link; admin: instance admin, no link.
async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube' });
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  const espace = (app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(sys.id) as { id: number }).id;
  app.db
    .prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'mira'), 'mj')")
    .run(espace);
  return { app, antor, lea, teo, mira, admin, lame, sys, espace };
}

type Monde = Awaited<ReturnType<typeof monde>>;

/** Mira creates an « objet » with a public and a GM-only section, both written. */
async function creerElement(w: Monde) {
  const r = await appel(w.app, w.mira, 'POST', `/api/systemes/${w.sys.id}/fiches`, {
    type: 'objet',
    titre: 'Épée runique',
    sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Secret de forge', joueursLisent: false }],
  });
  assert.equal(r.statusCode, 201, r.body);
  const fiche = r.json();
  const vue = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${fiche.id}`)).json();
  const [pub, secret] = vue.sections as { id: number; version: number; titre: string }[];
  const textes: [typeof pub, string][] = [[pub!, 'Lame bleutée visible'], [secret!, 'Forgée avec du sang de dragon']];
  for (const [s, texte] of textes) {
    const e = await appel(w.app, w.mira, 'PUT', `/api/systemes/${w.sys.id}/fiches/${fiche.id}/sections/${s.id}/contenu`, { contenu: texte, version: s.version });
    assert.equal(e.statusCode, 200, e.body);
  }
  return fiche as { id: number };
}


test('lien direct /univers/<u>/fiche/<id> d’un élément : 302 vers son adresse lisible pour un membre rattaché, 404 de corps identique sinon (B-119)', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const cle = (w.app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(f.id) as { cle: string }).cle;
  const lameCle = (w.app.db.prepare('SELECT cle FROM univers WHERE id = ?').get(w.lame.id) as { cle: string }).cle;
  const aube = (w.app.db.prepare("SELECT id, cle FROM univers WHERE nom = 'Aube'").get() as { id: number; cle: string });
  for (const [nom, h] of [['lea', w.lea], ['antor', w.antor]] as const) {
    const r = await appel(w.app, h, 'GET', `/univers/${w.lame.id}/fiche/${f.id}`);
    assert.equal(r.statusCode, 302, `${nom} ${r.body}`);
    assert.ok(r.headers.location?.startsWith(`/univers/${lameCle}/`), String(r.headers.location));
    assert.equal(r.headers.location, `/univers/${lameCle}/objet/${cle.split(':').pop()}`);
  }
  // not followed: no link, member of another universe not attached, GM of the system outside Lame, unknown id
  const inconnu = await appel(w.app, w.teo, 'GET', `/univers/${w.lame.id}/fiche/999999`);
  const refus: [string, Awaited<ReturnType<typeof appel>>][] = [
    ['teo', await appel(w.app, w.teo, 'GET', `/univers/${w.lame.id}/fiche/${f.id}`)],
    ['mira dans Lame', await appel(w.app, w.mira, 'GET', `/univers/${w.lame.id}/fiche/${f.id}`)],
    ['mira dans Aube (non rattaché)', await appel(w.app, w.mira, 'GET', `/univers/${aube.id}/fiche/${f.id}`)],
    ['admin', await appel(w.app, w.admin, 'GET', `/univers/${w.lame.id}/fiche/${f.id}`)],
    ['anonyme', await appel(w.app, null, 'GET', `/univers/${w.lame.id}/fiche/${f.id}`)],
  ];
  for (const [nom, r] of refus) {
    if (nom === 'anonyme') { assert.ok(!String(r.headers.location).includes('/objet/'), 'anonyme : pas l’adresse de l’élément'); continue; }
    assert.equal(r.statusCode, 404, nom);
    assert.equal(r.body, inconnu.body, `${nom} : corps distinct d’un id inconnu`);
  }
});

test('lien direct : un élément dont aucune section n’est lisible des joueurs ne se suit pas pour un joueur ; l’API résout aussi la clé de l’élément par l’univers', async () => {
  const w = await monde();
  const r = await appel(w.app, w.mira, 'POST', `/api/systemes/${w.sys.id}/fiches`, {
    type: 'objet', titre: 'Réserve', sections: [{ titre: 'Cachée', joueursLisent: false }],
  });
  assert.equal(r.statusCode, 201, r.body);
  const cache = r.json();
  const l = await appel(w.app, w.lea, 'GET', `/univers/${w.lame.id}/fiche/${cache.id}`);
  assert.equal(l.statusCode, 404, 'le joueur ne suit pas un élément sans section lisible');
  const visible = await creerElement(w);
  const cle = (w.app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(visible.id) as { cle: string }).cle;
  const api = await appel(w.app, w.lea, 'GET', `/api/univers/${w.lame.id}/fiches/${cle}`);
  assert.equal(api.statusCode, 200, api.body);
  assert.equal(api.json().id, visible.id);
  assert.equal((await appel(w.app, w.teo, 'GET', `/api/univers/${w.lame.id}/fiches/${cle}`)).statusCode, 404);
});
