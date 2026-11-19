import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-liens-illustrer, route side: POST …/interieur/:q/:r/astres/:cle/illustrer-fiche {cote}.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, Record<string, string>> = {};
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const fiche = app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Port', '{}', 1, 1)").run(E).lastInsertRowid as number;
  app.db.prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (?, 'Texte', 1, '', '2026-01-01', 1)").run(fiche);
  const sid = app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,'s','S',62,63,3,'accent','',0,0)").run(g, E).lastInsertRowid as number;
  const astre = (cle: string, f: number | null) => app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille, nom, fiche_id) VALUES (?,?,'planete','rocheux',2,4,0.1,?,?)").run(sid, cle, cle, f);
  astre('lie', fiche); astre('libre', null);
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur`;
  const post = (who: string, path: string, payload: unknown) => app.inject({ method: 'POST', url: `${base}/${path}`, headers: { ...(h[who] ?? {}), 'content-type': 'application/json' }, payload: payload as never });
  const get = (who: string, path: string) => app.inject({ method: 'GET', url: `${base}/${path}`, headers: h[who] });
  return { app, E, fiche, post, get };
}

test('MJ : 200 {fichierId, ficheId, titre}, fichier créé, octets égaux à la route haute définition', async () => {
  const w = await monde();
  const r = await w.post('antor', '62/63/astres/lie/illustrer-fiche', { cote: 256 });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.deepEqual(Object.keys(j).sort(), ['ficheId', 'fichierId', 'titre']);
  assert.equal(j.ficheId, w.fiche);
  assert.equal(j.titre, 'Port');
  assert.equal(one(w.app, 'SELECT illustration_fichier_id i FROM fiches WHERE id = ?', w.fiche).i, j.fichierId);
  assert.equal(one(w.app, 'SELECT visibilite v FROM fichiers WHERE id = ?', j.fichierId).v, 'joueurs');
  const hd = await w.get('antor', '62/63/astres/lie/illustration?cote=256');
  const fichier = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/fichiers/${j.fichierId}/contenu`, headers: { cookie: (await connecter(w.app, 'antor')).cookie } });
  if (fichier.statusCode === 200) assert.ok(fichier.rawPayload.equals(hd.rawPayload));
  else assert.ok(one(w.app, 'SELECT taille t FROM fichiers WHERE id = ?', j.fichierId).t === hd.rawPayload.length);
}, { timeout: 60_000 });

test('corps non lié : 400 invalide code non_liee, aucun fichier', async () => {
  const w = await monde();
  const n = one(w.app, 'SELECT count(*) n FROM fichiers').n;
  const r = await w.post('antor', '62/63/astres/libre/illustrer-fiche', { cote: 256 });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'non_liee');
  assert.equal(one(w.app, 'SELECT count(*) n FROM fichiers').n, n);
});

test('joueuse : 403 ; non membre : 404 ; clé inconnue : 404 ; sans session refusée ; aucun fichier', async () => {
  const w = await monde();
  const n = one(w.app, 'SELECT count(*) n FROM fichiers').n;
  assert.equal((await w.post('lea', '62/63/astres/lie/illustrer-fiche', { cote: 256 })).statusCode, 403);
  assert.equal((await w.post('antor', '62/63/astres/inconnu/illustrer-fiche', { cote: 256 })).statusCode, 404);
  assert.equal((await w.post('antor', '5/5/astres/lie/illustrer-fiche', { cote: 256 })).statusCode, 404);
  const s = await w.post('personne', '62/63/astres/lie/illustrer-fiche', { cote: 256 });
  assert.ok([401, 302, 403].includes(s.statusCode), String(s.statusCode));
  assert.equal(one(w.app, 'SELECT count(*) n FROM fichiers').n, n);
});

test('cote absent, hors bornes ou non numérique : 400 champ cote, aucun fichier', async () => {
  const w = await monde();
  const n = one(w.app, 'SELECT count(*) n FROM fichiers').n;
  for (const body of [{}, { cote: 63 }, { cote: 2049 }, { cote: '256' }, { cote: 64.5 }, { cote: null }]) {
    const r = await w.post('antor', '62/63/astres/lie/illustrer-fiche', body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal(r.json().champ, 'cote');
  }
  assert.equal(one(w.app, 'SELECT count(*) n FROM fichiers').n, n);
});
