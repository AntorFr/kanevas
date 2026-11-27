// Compléments d'ensemble de kanevas-systemes-jeu-api (vérification indépendante, écrits depuis la fiche et P-28 seuls) : cycle d'écriture complet par la clé,
// jeton révoqué, jeton d'outils seul, plus-MJ qui écrit encore. Attendus littéraux tirés du besoin.
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


test('P-28 : la clé « ecriture » modifie l’en-tête, réécrit puis supprime une section, supprime l’élément (204) ; l’élément disparaît de la liste et du système', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, t.valeur);
  const lu = (await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).json();
  assert.equal(lu.entete.titre, 'Pistolet laser');
  const perime = await w.app.inject({ method: 'PATCH', url: `${w.sid}/fiches/${id}`, headers: { authorization: `Bearer ${t.valeur}`, 'if-match': '"00000000000000000000000000000000"' }, payload: { titre: 'Périmé' } });
  assert.equal(perime.statusCode, 412, perime.body);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).json().entete.titre, 'Pistolet laser');
  const p = await avec(w.app, t.valeur, 'PATCH', `${w.sid}/fiches/${id}`, { titre: 'Pistolet laser Mk2' });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).json().entete.titre, 'Pistolet laser Mk2');
  const s = await avec(w.app, t.valeur, 'DELETE', `${w.sid}/fiches/${id}/sections/forge`);
  assert.ok([200, 204].includes(s.statusCode), s.body);
  assert.ok(!(await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).body.includes('Cristal de Vorsk'));
  assert.equal((await avec(w.app, t.valeur, 'DELETE', `${w.sid}/fiches/${id}`)).statusCode, 204);
  assert.equal((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches/${id}`)).statusCode, 404);
  assert.deepEqual(lignes((await avec(w.app, t.valeur, 'GET', `${w.sid}/fiches`)).json()), []);
  await w.app.close();
});

test('P-28 échec : un jeton révoqué n’ouvre plus la porte système (401), et son compte garde ses éléments', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, t.valeur);
  assert.equal((await appel(w.app, w.h.antor, 'DELETE', `/api/compte/jetons/${t.jid}`)).statusCode, 200);
  assert.equal((await avec(w.app, t.valeur, 'GET', w.sid)).statusCode, 401);
  assert.equal((await avec(w.app, t.valeur, 'POST', `${w.sid}/fiches`, { type: 'objet', titre: 'Après révocation' })).statusCode, 401);
  const m = await appel(w.app, w.h.mira, 'GET', `/api/systemes/${w.sys.id}/fiches`);
  assert.ok(m.body.includes('Pistolet laser') && !m.body.includes('Après révocation'));
  assert.ok(id > 0);
  await w.app.close();
});

test('P-28 exclusion : un jeton qui ne porte aucun accès au contenu (outils seuls) reçoit 401 jeton_invalide sur la porte système', async () => {
  const w = await monde();
  const r = await appel(w.app, w.h.antor, 'POST', '/api/compte/jetons', { nom: 'outil', dureeJours: 30, acces: univLecture(w), contenu: false, outils: ['swn/galaxie'] });
  if (r.statusCode !== 201) return void (await w.app.close(), assert.fail(`création du jeton d'outils: ${r.body}`));
  const v = r.json().valeur as string;
  const g = await avec(w.app, v, 'GET', w.sid);
  assert.equal(g.statusCode, 401, g.body);
  assert.equal(g.json().code ?? g.json().erreur, 'jeton_invalide');
  await w.app.close();
});

test('P-28 : ce que la clé écrit, Léa (joueuse du système) le lit par la session au niveau joueur : section publique seule', async () => {
  const w = await monde();
  const t = await jeton(w, 'antor', { acces: toutesLecture, systemes: [{ id: w.sys.id, niveau: 'ecriture' }] });
  const id = await creerElement(w, t.valeur);
  const l = await appel(w.app, w.h.lea, 'GET', `/api/systemes/${w.sys.id}/fiches/${id}`);
  assert.equal(l.statusCode, 200, l.body);
  assert.ok(l.body.includes('Dégâts 1d8') && !l.body.includes('Cristal de Vorsk'));
  await w.app.close();
});
