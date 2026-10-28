import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
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

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  const idU = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const lame = idU("Lame d'Ébène");
  const landes = idU('Les Landes grises');
  const essai = idU('Essai Kanka');
  const cof = (app.db.prepare('SELECT systeme_id AS s FROM univers WHERE id = ?').get(lame) as { s: number }).s;
  const req = (h: H, method: 'GET' | 'PUT' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const liste = async (h: H, u: number) =>
    (await req(h, 'GET', `/api/univers/${u}/types`)).json() as Record<string, unknown>[];
  const ligne = async (h: H, u: number, t: string) => (await liste(h, u)).find((x) => x.type === t)!;
  return { app, antor, lea, mira, admin, lame, landes, essai, cof, req, liste, ligne };
}

test('critère : désactiver au système, forcer dans l’univers, réactiver, suivre', async () => {
  const w = await monde();
  const { req, ligne } = w;
  for (const t of ['vaisseau', 'note']) {
    const r = await req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/${t}`, { active: false });
    assert.equal(r.statusCode, 200, r.body);
  }
  for (const t of ['vaisseau', 'note']) {
    const l = await ligne(w.mira, w.landes, t);
    assert.equal(l.active, false);
    assert.equal(l.origine, 'systeme');
  }
  // Antor forces vaisseau on in Lame d'Ébène.
  assert.equal((await req(w.antor, 'PUT', `/api/univers/${w.lame}/types/vaisseau`, { etat: 'active' })).statusCode, 200);
  const v = await ligne(w.antor, w.lame, 'vaisseau');
  assert.equal(v.active, true);
  assert.equal(v.origine, 'univers');
  assert.equal(v.forcage, 'active');
  const n = await ligne(w.antor, w.lame, 'note');
  assert.equal(n.active, false);
  // The system turns note back on: Lame sees it; vaisseau does not move.
  await req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/note`, { active: true });
  assert.equal((await ligne(w.antor, w.lame, 'note')).active, true);
  await req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/vaisseau`, { active: true });
  await req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/vaisseau`, { active: false });
  assert.equal((await ligne(w.antor, w.lame, 'vaisseau')).active, true);
  // suivre removes the forcing.
  await req(w.antor, 'PUT', `/api/univers/${w.lame}/types/vaisseau`, { etat: 'suivre' });
  const s = await ligne(w.antor, w.lame, 'vaisseau');
  assert.deepEqual([s.active, s.origine, s.forcage], [false, 'systeme', null]);
  // GET système carries the types.
  const sys = (await req(w.antor, 'GET', `/api/systemes/${w.cof}`)).json();
  assert.deepEqual(sys.types.find((t: { type: string }) => t.type === 'vaisseau'), { type: 'vaisseau', active: false });
});

test('un univers sans système : tout actif, origine defaut ; compte_rendu non réglable', async () => {
  const w = await monde();
  const l = await w.liste(w.antor, w.essai);
  assert.equal(l.length, 15);
  assert.ok(l.every((x) => x.active === true && x.origine === 'defaut' && x.forcage === null));
  assert.ok(l.every((x) => x.systeme === null));
});

test('creerFiche : type désactivé → 400 type_desactive sans rien écrire ; forcé actif → créée', async () => {
  const w = await monde();
  await w.req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/vaisseau`, { active: false });
  const avant = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as { n: number }).n;
  const r = await w.req(w.mira, 'POST', `/api/univers/${w.landes}/fiches`, { type: 'vaisseau', titre: 'Nef' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'type_desactive');
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as { n: number }).n, avant);
  await w.req(w.antor, 'PUT', `/api/univers/${w.lame}/types/vaisseau`, { etat: 'active' });
  const ok = await w.req(w.antor, 'POST', `/api/univers/${w.lame}/fiches`, { type: 'vaisseau', titre: 'Nef' });
  assert.equal(ok.statusCode, 201, ok.body);
  // A type unknown is still "inconnu", not "désactivé".
  const inc = await w.req(w.antor, 'POST', `/api/univers/${w.lame}/fiches`, { type: 'monde', titre: 'X' });
  assert.equal(inc.statusCode, 400);
});

test('droits : Léa sans nbFiches ni systeme, 403 en écriture ; MJ étranger 404, Joueur du système 403', async () => {
  const w = await monde();
  const l = await w.liste(w.lea, w.lame);
  assert.ok(l.every((x) => !('nbFiches' in x) && !('systeme' in x)));
  const mj = await w.liste(w.antor, w.lame);
  assert.ok(mj.every((x) => typeof x.nbFiches === 'number' && 'systeme' in x));
  assert.equal((await w.req(w.lea, 'PUT', `/api/univers/${w.lame}/types/lieu`, { etat: 'desactive' })).statusCode, 403);
  // Admin is GM of a universe with another system: no right on CoF Mini → 404.
  assert.equal((await w.req(w.admin, 'PUT', `/api/systemes/${w.cof}/types/lieu`, { active: false })).statusCode, 404);
  // Léa is a Joueur of Lame (attached to CoF Mini) → 403.
  assert.equal((await w.req(w.lea, 'PUT', `/api/systemes/${w.cof}/types/lieu`, { active: false })).statusCode, 403);
  // Not a member of the universe: introuvable.
  assert.equal((await w.req(w.mira, 'GET', `/api/univers/${w.lame}/types`)).statusCode, 404);
  assert.equal((await w.req(w.mira, 'PUT', `/api/univers/${w.lame}/types/lieu`, { etat: 'desactive' })).statusCode, 404);
  // Nothing was written by the refusals.
  assert.equal((await w.ligne(w.antor, w.lame, 'lieu')).active, true);
});

test('erreurs : compte_rendu → type_non_reglable ; monde → type_inconnu ; corps faux → 400', async () => {
  const w = await monde();
  for (const [url, body] of [
    [`/api/univers/${w.lame}/types/compte_rendu`, { etat: 'desactive' }],
    [`/api/systemes/${w.cof}/types/compte_rendu`, { active: false }],
  ] as const) {
    const r = await w.req(w.antor, 'PUT', url, body);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().code, 'type_non_reglable');
  }
  for (const [url, body] of [
    [`/api/univers/${w.lame}/types/monde`, { etat: 'desactive' }],
    [`/api/systemes/${w.cof}/types/monde`, { active: false }],
  ] as const) {
    const r = await w.req(w.antor, 'PUT', url, body);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().code, 'type_inconnu');
  }
  assert.equal((await w.req(w.antor, 'PUT', `/api/univers/${w.lame}/types/lieu`, { etat: 'oui' })).statusCode, 400);
  assert.equal((await w.req(w.antor, 'PUT', `/api/univers/${w.lame}/types/lieu`, {})).statusCode, 400);
  assert.equal((await w.req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/lieu`, { active: 'non' })).statusCode, 400);
  assert.equal((await w.req(w.antor, 'PUT', `/api/systemes/${w.cof}/types/lieu`, {})).statusCode, 400);
});

test('aucun réglage ne cache une fiche (lecture MJ et joueur)', async () => {
  const w = await monde();
  const fiches = (await w.req(w.antor, 'GET', `/api/univers/${w.lame}/fiches?type=lieu`)).json();
  const lieu = (fiches.fiches ?? fiches)[0];
  assert.ok(lieu, 'le semis a un lieu');
  await w.req(w.antor, 'PUT', `/api/univers/${w.lame}/types/lieu`, { etat: 'desactive' });
  assert.equal((await w.req(w.antor, 'GET', `/api/univers/${w.lame}/fiches/${lieu.id}`)).statusCode, 200);
  assert.equal((await w.req(w.lea, 'GET', `/api/univers/${w.lame}/fiches/${lieu.id}`)).statusCode, 200);
  const n = (await w.ligne(w.antor, w.lame, 'lieu')).nbFiches as number;
  assert.ok(n >= 1);
});
