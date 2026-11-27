// Tests d'ensemble de kanevas-systemes-jeu-api, écrits depuis le besoin (B-118 pour l'API, P-28, critère de sortie de la fiche),
// à la porte de chaque effet : routes réelles, base réelle, mode bouchon, jetons Bearer réels. Attendus littéraux tirés de la doc du produit.
// L'écran E-23 est hors de ce fichier (test d'écran). Monde : Antor MJ de l'univers « Lame » et MJ du système « Zeta » (accordé par l'admin),
// Léa joueuse de « Lame » (lit le système), Mira MJ de « Zeta » sans aucun univers, Téo sans aucun lien.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c, `connexion de ${compte}`);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H, method: Verbe, url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
const avec = (app: App, jeton: string, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${jeton}` }, payload });
const lignes = (j: Any): Any[] => (Array.isArray(j) ? j : (j.fiches ?? j.items ?? j.resultats ?? []));

async function monde() {
  const app = await buildApp();
  const h = {
    antor: await connecter(app, 'antor'),
    lea: await connecter(app, 'lea'),
    mira: await connecter(app, 'mira'),
    teo: await connecter(app, 'teo'),
    admin: await connecter(app, 'admin'),
  };
  const lame = (await appel(app, h.antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  assert.equal((await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' })).statusCode, 201);
  const sys = (await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  for (const u of ['antor', 'mira']) {
    const r = await appel(app, h.admin, 'POST', `/api/instance/systemes/${sys.id}/membres`, { username: u });
    assert.equal(r.statusCode, 201, r.body);
  }
  const sid = `/api/v1/systemes/${sys.id}`;
  return { app, h, lame, sys, sid };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function jeton(w: Monde, qui: keyof Monde['h'], corps: object) {
  const r = await appel(w.app, w.h[qui], 'POST', '/api/compte/jetons', { nom: 'agent', dureeJours: 30, contenu: true, ...corps });
  return { statut: r.statusCode, json: r.json() as Any, valeur: (r.json() as Any).valeur as string, jid: (r.json() as Any).jeton?.id as number };
}
const toutesLecture = { tous: true, niveauTous: 'lecture' };
const univLecture = (w: Monde) => ({ tous: false, univers: [{ universId: w.lame.id, niveau: 'lecture' }] });

async function creerElement(w: Monde, valeur: string) {
  const c = await avec(w.app, valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'Pistolet laser' });
  assert.equal(c.statusCode, 201, c.body);
  const id = c.json().id;
  const pub = await avec(w.app, valeur, 'PUT', `${w.sid}/fiches/${id}/sections/desc`, { titre: 'Description', contenu: 'Dégâts 1d8', joueursLisent: true });
  assert.equal(pub.statusCode, 200, pub.body);
  const mj = await avec(w.app, valeur, 'PUT', `${w.sid}/fiches/${id}/sections/forge`, { titre: 'Forge secrète', contenu: 'Cristal de Vorsk' });
  assert.equal(mj.statusCode, 200, mj.body);
  return id as number;
}

test('B-118 nominal : un jeton « ecriture » sur le système écrit un élément pour un MJ du système, le relit et le liste ; niveau effectif « ecriture »', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  assert.equal(t.statut, 201, JSON.stringify(t.json));
  assert.match(t.valeur, /^kvs_/);
  const id = await creerElement(w, t.valeur);
  const gen = (await avec(w.app, t.valeur, 'GET', w.sid)).json();
  assert.deepEqual([gen.id, gen.nom, gen.niveau], [w.sys.id, 'Zeta', 'ecriture']);
  const v = (await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).json();
  assert.equal(v.entete.titre, 'Pistolet laser');
  assert.ok(JSON.stringify(v).includes('Cristal de Vorsk'), 'MJ du système : toutes les sections');
  assert.ok(JSON.stringify(v).includes('Dégâts 1d8'));
  const liste = lignes((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches`)).json());
  assert.deepEqual(liste.map((l: Any) => l.titre), ['Pistolet laser']);
  // l'élément est aussi celui que Mira, MJ du système, lit par la session
  const m = await appel(w.app, w.h.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${id}`);
  assert.equal(m.statusCode, 200);
  assert.ok(m.body.includes('Pistolet laser'));
  await w.app.close();
});

test('B-118 : le même jeton ouvre toujours ses univers', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  assert.equal((await avec(w.app, t.valeur, 'GET', `/api/v1/univers/${w.lame.id}`)).statusCode, 200);
  assert.equal((await avec(w.app, t.valeur, 'GET', `/api/v1/univers/${w.lame.id}/fiches`)).statusCode, 200);
  await w.app.close();
});

test('B-118 : abaissé à « lecture » (PATCH), le jeton lit encore et reçoit 403 lecture_seule en écrivant ; rien n’est écrit', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, t.valeur);
  const p = await appel(w.app, w.h.antor, 'PATCH', `/api/compte/jetons/${t.jid}`, { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'lecture' }] });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).json().niveau, 'lecture');
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).statusCode, 200);
  const ecr = await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'Intrus' });
  assert.equal(ecr.statusCode, 403);
  assert.equal(ecr.json().code ?? ecr.json().erreur, 'lecture_seule', ecr.body);
  assert.equal((await avec(w.app, t.valeur, 'DELETE', `${w.sid}/fiches/${id}`)).statusCode, 403);
  assert.deepEqual(lignes((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches`)).json()).map((l: Any) => l.titre), ['Pistolet laser']);
  await w.app.close();
});

test('B-118 : un jeton d’univers sans ligne de système lit au niveau joueur l’élément par la porte de l’univers (200, sections joueurs seules) et reçoit 404 sur /api/v1/systemes/<id>', async () => {
  const w = await monde();
  const ecrit = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, ecrit.valeur);
  const t = await jeton(w, 'lea', { acces: univLecture(w) });
  assert.equal(t.statut, 201, JSON.stringify(t.json));
  const lu = await avec(w.app, t.valeur, 'GET', `/api/v1/univers/${w.lame.id}/fiches/id/${id}`);
  assert.equal(lu.statusCode, 200, lu.body);
  assert.equal(lu.json().entete.titre, 'Pistolet laser');
  assert.ok(lu.body.includes('Dégâts 1d8'), 'section joueurs lisible');
  assert.ok(!lu.body.includes('Cristal de Vorsk') && !lu.body.includes('Forge secrète'), 'section MJ absente');
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).statusCode, 404);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches`)).statusCode, 404);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).statusCode, 404);
  assert.equal((await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'X' })).statusCode, 404);
  await w.app.close();
});

test('B-118 exclusion : un jeton « ecriture » sur un système dont le compte n’est pas MJ est refusé à la création (400, champ systemes), aucun jeton créé', async () => {
  const w = await monde();
  const avant = (await appel(w.app, w.h.lea, 'GET', '/api/compte/jetons')).json().jetons.length;
  const r = await jeton(w, 'lea', { acces: univLecture(w), systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  assert.equal(r.statut, 400, JSON.stringify(r.json));
  assert.equal(r.json.champ, 'systemes');
  const apres = (await appel(w.app, w.h.lea, 'GET', '/api/compte/jetons')).json().jetons.length;
  assert.equal(apres, avant);
  await w.app.close();
});

test('B-118 bords : Léa lectrice peut créer « lecture » sur le système, lit, n’écrit pas ; ne voit que les sections joueurs', async () => {
  const w = await monde();
  const ecrit = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, ecrit.valeur);
  const t = await jeton(w, 'lea', { acces: univLecture(w), systemes: [{ id: w.sys.id, niveau: 'lecture' }] });
  assert.equal(t.statut, 201, JSON.stringify(t.json));
  const g = await avec(w.app, t.valeur, 'GET', w.sid);
  assert.deepEqual([g.statusCode, g.json().niveau], [200, 'lecture']);
  const lu = await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`);
  assert.equal(lu.statusCode, 200);
  assert.ok(lu.body.includes('Dégâts 1d8'));
  assert.ok(!lu.body.includes('Cristal de Vorsk'), 'Léa ne lit pas la section MJ');
  assert.equal((await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'X' })).statusCode, 403);
  await w.app.close();
});

test('B-118 échec : création refusée (400, champ systemes) pour un système que le compte ne lit pas, inconnu, en double, au niveau inconnu ou à l’id non entier', async () => {
  const w = await monde();
  const cas: [string, Any[], Any][] = [
    ['Téo ne lit aucun système', [{ id: w.sys.id, niveau: 'lecture' }], 'teo'],
    ['système inconnu', [{ id: 99999, niveau: 'lecture' }], 'antor'],
    ['doublon', [{ id: w.sys.id, niveau: 'lecture' }, { id: w.sys.id, niveau: 'ecriture' }], 'antor'],
    ['niveau aucun', [{ id: w.sys.id, niveau: 'aucun' }], 'antor'],
    ['id texte', [{ id: 'abc', niveau: 'lecture' }], 'antor'],
  ];
  for (const [nom, systemes, qui] of cas) {
    const r = await jeton(w, qui, { acces: toutesLecture, systemes });
    assert.equal(r.statut, 400, `${nom} : ${JSON.stringify(r.json)}`);
    assert.equal(r.json.champ, 'systemes', nom);
  }
  assert.equal((await appel(w.app, w.h.teo, 'GET', '/api/compte/jetons')).json().jetons.length, 0);
  await w.app.close();
});

test('B-118 : sans ligne dans jetons_systemes (jeton « tous » ou liste vide), 404 sur le système et sur un id inconnu ou non numérique', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: { tous: true, niveauTous: 'ecriture' } });
  for (const url of [w.sid, `${w.sid}/fiches`, '/api/v1/systemes/99999', '/api/v1/systemes/abc', '/api/v1/systemes/abc/fiches']) {
    assert.equal((await avec(w.app, t.valeur, 'GET', url)).statusCode, 404, url);
  }
  assert.equal((await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'X' })).statusCode, 404);
  await w.app.close();
});

test('B-118 : sans jeton valide, 401 jeton_invalide sur la porte système', async () => {
  const w = await monde();
  assert.equal((await w.app.inject({ method: 'GET', url: w.sid })).statusCode, 401);
  assert.equal((await avec(w.app, 'kvs_inconnu', 'GET', w.sid)).statusCode, 401);
  await w.app.close();
});

test('B-118 exclusion : le droit du compte gagne — retiré des MJ du système, le jeton « ecriture » reçoit 403 en écrivant et lit encore par son univers', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, t.valeur);
  const antorId = (w.app.db.prepare('SELECT id FROM comptes WHERE username = ?').get('antor') as { id: number }).id;
  const ret = await appel(w.app, w.h.admin, 'DELETE', `/api/instance/systemes/${w.sys.id}/membres/${antorId}`);
  assert.equal(ret.statusCode, 204, ret.body);
  const ecr = await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'Intrus' });
  assert.equal(ecr.statusCode, 403, ecr.body);
  const g = await avec(w.app, t.valeur, 'GET', w.sid);
  assert.deepEqual([g.statusCode, g.json().niveau], [200, 'lecture']);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).statusCode, 200);
  await w.app.close();
});

test('B-118 exclusion : retiré des MJ et d’aucun univers rattaché, le compte de Mira n’atteint plus rien : 404 sur toute l’adresse', async () => {
  const w = await monde();
  const t = await jeton(w, 'mira', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  assert.equal(t.statut, 201, JSON.stringify(t.json));
  assert.equal((await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'Avant' })).statusCode, 201);
  const miraId = (w.app.db.prepare('SELECT id FROM comptes WHERE username = ?').get('mira') as { id: number }).id;
  assert.equal((await appel(w.app, w.h.admin, 'DELETE', `/api/instance/systemes/${w.sys.id}/membres/${miraId}`)).statusCode, 204);
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).statusCode, 404);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches`)).statusCode, 404);
  assert.equal((await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'Après' })).statusCode, 404);
  await w.app.close();
});

test('B-118 exclusion : sur une porte système, ?lot= est un 400 invalide ; relations, export, historique, fichiers et l’alias /api/import/v1 sont absents (404)', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, t.valeur);
  const lot = await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches?lot=1`, { type: 'objet', titre: 'Lot' });
  assert.equal(lot.statusCode, 400, lot.body);
  assert.equal(lot.json().champ, 'lot');
  for (const url of [`${w.sid}/export`, `${w.sid}/historique`, `${w.sid}/fichiers`, `${w.sid}/cartes`, `${w.sid}/fiches/${id}/relations`, `/api/import/v1/systemes/${w.sys.id}`]) {
    assert.equal((await avec(w.app, t.valeur, 'GET', url)).statusCode, 404, url);
  }
  assert.deepEqual(lignes((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches`)).json()).map((l: Any) => l.titre), ['Pistolet laser']);
  await w.app.close();
});

test('B-118 : PATCH sans clé systemes laisse les accès ; systemes: [] les retire tous (le jeton perd la porte système, garde son univers)', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const p1 = await appel(w.app, w.h.antor, 'PATCH', `/api/compte/jetons/${t.jid}`, { acces: toutesLecture });
  assert.equal(p1.statusCode, 200, p1.body);
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).json().niveau, 'ecriture');
  const p2 = await appel(w.app, w.h.antor, 'PATCH', `/api/compte/jetons/${t.jid}`, { acces: toutesLecture, systemes: [] });
  assert.equal(p2.statusCode, 200, p2.body);
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).statusCode, 404);
  assert.equal((await avec(w.app, t.valeur, 'GET', `/api/v1/univers/${w.lame.id}`)).statusCode, 200);
  await w.app.close();
});

test('B-118 : PATCH refuse d’élever Léa à « ecriture » sur un système qu’elle ne gère pas (400 systemes), le niveau reste « lecture »', async () => {
  const w = await monde();
  const t = await jeton(w, 'lea', { acces: univLecture(w), systemes: [{ id: w.sys.id, niveau: 'lecture' }] });
  const p = await appel(w.app, w.h.lea, 'PATCH', `/api/compte/jetons/${t.jid}`, { acces: univLecture(w), systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  assert.equal(p.statusCode, 400, p.body);
  assert.equal(p.json().champ, 'systemes');
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).json().niveau, 'lecture');
  await w.app.close();
});

test('P-28 : GET /api/compte/jetons rend systemes [{id, nom, niveau}] du jeton ; GET /api/systemes dit peutEcrire (Antor oui, Léa non, Téo aucun système)', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'lecture' }] });
  const liste = (await appel(w.app, w.h.antor, 'GET', '/api/compte/jetons')).json().jetons as Any[];
  const mien = liste.find((j) => j.id === t.jid);
  assert.equal(mien.systemes.length, 1);
  assert.deepEqual([mien.systemes[0].id, mien.systemes[0].nom, mien.systemes[0].niveau], [w.sys.id, 'Zeta', 'lecture']);
  const choix = async (qui: keyof Monde['h']) => ((await appel(w.app, w.h[qui], 'GET', '/api/systemes')).json() as Any[]).filter((s) => s.id === w.sys.id);
  assert.deepEqual((await choix('antor')).map((s) => s.peutEcrire), [true]);
  assert.deepEqual((await choix('lea')).map((s) => s.peutEcrire), [false]);
  assert.deepEqual(await choix('teo'), []);
  await w.app.close();
});
