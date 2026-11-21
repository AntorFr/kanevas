// Feature-level complement for kanevas-synchro-jetons (B-45, B-46, B-94, B-95, P-25), written from the feature sheet and
// docs/parcours.md, not from the code. Doors only (real server in stub mode, real SQLite, real guard); expected values are literals.
// World: the stub seed (« Lame d'Ébène »: antor GM, lea player; « Les Landes grises »: mira GM; « Les Cendres de Vaëlis »: admin GM, antor player).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Rep = { status: number; json: Any };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

let app: Any;
let base = '';
const ids: Record<string, number> = {};

async function lire(r: Response): Promise<Rep> {
  const t = await r.text();
  let json: Any = null;
  try { json = JSON.parse(t); } catch { /* empty */ }
  return { status: r.status, json };
}
async function session(compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}`,
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session for ${compte}`);
  return async (m, p, c) => lire(await fetch(base + p, {
    method: m,
    headers: { cookie, ...(c === undefined ? {} : { 'content-type': 'application/json' }) },
    body: c === undefined ? undefined : JSON.stringify(c),
  }));
}
async function avecJeton(m: string, p: string, valeur: string, corps?: unknown): Promise<Rep> {
  return lire(await fetch(base + p, {
    method: m,
    headers: { authorization: `Bearer ${valeur}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }));
}
let n = 0;
async function creer(c: Client, acces: Any, dureeJours = 30): Promise<{ jid: number; valeur: string; jeton: Any }> {
  const r = await c('POST', '/api/compte/jetons', { nom: `Complément ${++n}`, dureeJours, acces });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { jid: r.json.jeton.id, valeur: r.json.valeur, jeton: r.json.jeton };
}

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const antor = await session('antor');
  const us = (await antor('GET', '/api/univers')).json;
  for (const u of us) ids[u.nom] = u.id;
  const mira = await session('mira');
  for (const u of (await mira('GET', '/api/univers')).json) ids[u.nom] = u.id;
  for (const c of ['antor', 'lea', 'mira', 'admin']) ids['@' + c] = trouverCompte(app.db, c)!.id;
});
after(() => void app.close());

const LAME = "Lame d'Ébène";
const LANDES = 'Les Landes grises';
const CENDRES = 'Les Cendres de Vaëlis';
const JOUR = 86_400_000;

describe('B-94 : la durée de vie du jeton (7, 30, 90 ou 365 jours)', () => {
  for (const jours of [7, 30, 90, 365]) {
    it(`${jours} jours : accepté, l'expiration tombe ${jours} jours après la création`, async () => {
      const lea = await session('lea');
      const { jeton } = await creer(lea, { tous: true, niveauTous: 'lecture' }, jours);
      assert.equal(Math.round((Date.parse(jeton.expireLe) - Date.parse(jeton.creeLe)) / JOUR), jours);
    });
  }
  it('bords : 366 jours et 0 jour sont refusés 400 invalide, aucun jeton ajouté', async () => {
    const lea = await session('lea');
    const avant = (await lea('GET', '/api/compte/jetons')).json.jetons.length;
    for (const dureeJours of [366, 0]) {
      const r = await lea('POST', '/api/compte/jetons', { nom: 'Trop long', dureeJours, acces: { tous: true, niveauTous: 'lecture' } });
      assert.equal(r.status, 400, `dureeJours ${dureeJours}`);
    }
    assert.equal((await lea('GET', '/api/compte/jetons')).json.jetons.length, avant);
  });
});

describe('B-46 : un jeton expiré est refusé 401, comme un jeton révoqué', () => {
  it('le jeton dont l\'expiration est passée répond 401 jeton_invalide avec le corps unique, sous les deux préfixes', async () => {
    const lea = await session('lea');
    const { jid, valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
    const passe = (d: number) => new Date(Date.now() - d * JOUR).toISOString();
    app.db.prepare('UPDATE jetons_api SET cree_le = ?, expire_le = ? WHERE id = ?').run(passe(40), passe(10), jid);
    for (const p of [`/api/v1/univers/${ids[LAME]}`, `/api/import/v1/univers/${ids[LAME]}`]) {
      const r = await avecJeton('GET', p, valeur);
      assert.equal(r.status, 401, p);
      assert.deepEqual(r.json, { message: 'Jeton invalide.', code: 'jeton_invalide' });
    }
    const vu = (await lea('GET', '/api/compte/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.equal(vu.etat, 'expire');
  });
});

describe('B-94 : « tous mes univers » couvre aussi les univers rejoints plus tard', () => {
  it('lea (tous, lecture) n\'atteint pas les Landes ; une fois ajoutée par leur MJ, le même jeton les lit ; retirée, 404', async () => {
    const lea = await session('lea');
    const mira = await session('mira');
    const { valeur } = await creer(lea, { tous: true, niveauTous: 'lecture' });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LANDES]}`, valeur)).status, 404);
    const ajout = await mira('POST', `/api/univers/${ids[LANDES]}/membres`, { username: 'lea', role: 'joueur' });
    assert.equal(ajout.status, 201, JSON.stringify(ajout.json));
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LANDES]}`, valeur)).status, 200);
    const retrait = await mira('DELETE', `/api/univers/${ids[LANDES]}/membres/${ids['@lea']}`);
    assert.ok(retrait.status === 200 || retrait.status === 204, String(retrait.status));
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LANDES]}`, valeur)).status, 404);
  });
});

describe('B-46 / AD-144 : le jeton retient le moindre de son niveau et du rôle courant du compte', () => {
  it('un MJ rétrogradé joueur : son jeton ecriture ne 401 pas, il lit encore, il n\'ouvre plus de lot ; une fois retiré, 404', async () => {
    const antor = await session('antor');
    const mira = await session('mira');
    const ajout = await antor('POST', `/api/univers/${ids[LAME]}/membres`, { username: 'mira', role: 'mj' });
    assert.equal(ajout.status, 201, JSON.stringify(ajout.json));
    const { valeur } = await creer(mira, { tous: false, univers: [{ universId: ids[LAME], niveau: 'ecriture' }] });
    const lot = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(lot.status >= 200 && lot.status < 300, `MJ : ${lot.status}`);
    const r = await antor('PATCH', `/api/univers/${ids[LAME]}/membres/${ids['@mira']}`, { role: 'joueur' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200, 'lit encore');
    const apres = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(apres.status === 403 || apres.status === 404, `joueur : ${apres.status}`);
    assert.notEqual(apres.status, 401);
    await antor('DELETE', `/api/univers/${ids[LAME]}/membres/${ids['@mira']}`);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 404);
  });
});

describe('B-95 : qui voit, qui révoque', () => {
  it('exclusion : la route des jetons d\'un univers n\'existe plus pour son MJ (404), E-5 est introuvable pour un non-admin', async () => {
    const antor = await session('antor');
    assert.equal((await antor('GET', `/api/univers/${ids[LAME]}/jetons`)).status, 404);
    assert.equal((await antor('GET', '/api/instance/jetons')).status, 404);
    assert.equal((await (await session('lea'))('GET', '/api/instance/jetons')).status, 404);
  });

  it('E-18 : le MJ lit le nom du jeton sur la ligne du lot, rien d\'autre du jeton ; la joueuse n\'a pas la route (404)', async () => {
    const antor = await session('antor');
    const lea = await session('lea');
    const { valeur, jeton } = await creer(antor, { tous: false, univers: [{ universId: ids[LAME], niveau: 'ecriture' }] });
    const lot = await avecJeton('POST', `/api/import/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(lot.status >= 200 && lot.status < 300, String(lot.status));
    const r = await antor('GET', `/api/univers/${ids[LAME]}/lots`);
    assert.equal(r.status, 200);
    assert.ok(JSON.stringify(r.json).includes(jeton.nom), 'le nom du jeton est sur la ligne du lot');
    assert.equal(JSON.stringify(r.json).includes(valeur), false);
    assert.equal((await lea('GET', `/api/univers/${ids[LAME]}/lots`)).status, 404);
  });

  it('le dernier usage apparaît sur E-5 après un appel, « jamais utilisé » avant', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const { jid, valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    const avant = (await admin('GET', '/api/instance/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.equal(avant.dernierUsageLe, null);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
    const apres = (await admin('GET', '/api/instance/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.notEqual(apres.dernierUsageLe, null);
  });

  it('« Révoqué » (propriétaire) et « Révoqué par l\'admin » se distinguent : revoquePar est le compte qui a révoqué', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const a = await creer(lea, { tous: true, niveauTous: 'lecture' });
    const b = await creer(lea, { tous: true, niveauTous: 'lecture' });
    assert.equal((await lea('DELETE', `/api/compte/jetons/${a.jid}`)).status, 200);
    assert.equal((await admin('DELETE', `/api/instance/jetons/${b.jid}`)).status, 200);
    const liste = (await lea('GET', '/api/compte/jetons')).json.jetons;
    assert.equal(liste.find((j: Any) => j.id === a.jid).revoquePar, ids['@lea']);
    assert.equal(liste.find((j: Any) => j.id === b.jid).revoquePar, ids['@admin']);
    assert.equal(liste.find((j: Any) => j.id === a.jid).etat, 'revoque');
  });

  it('le propriétaire qui réenregistre ses accès efface « Modifié par l\'admin » ; la valeur ne change pas', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const { jid, valeur } = await creer(lea, { tous: true, niveauTous: 'lecture' });
    const m = await admin('PATCH', `/api/instance/jetons/${jid}`, { acces: { tous: true, niveauTous: 'lecture', univers: [{ universId: ids[LAME], niveau: 'aucun' }] } });
    assert.equal(m.status, 200, JSON.stringify(m.json));
    const vu = (await lea('GET', '/api/compte/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.notEqual(vu.modifieParAdmin, null);
    const o = await lea('PATCH', `/api/compte/jetons/${jid}`, { acces: { tous: true, niveauTous: 'lecture' } });
    assert.equal(o.status, 200, JSON.stringify(o.json));
    const apres = (await lea('GET', '/api/compte/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.equal(apres.modifieParAdmin, null);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200, 'même valeur, Lame de nouveau atteinte');
  });

  it('exclusion : l\'admin ne donne pas à un jeton un univers dont son propriétaire n\'est pas membre (400 invalide), rien n\'est changé', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const { jid, valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    const m = await admin('PATCH', `/api/instance/jetons/${jid}`, { acces: { tous: false, univers: [{ universId: ids[LANDES], niveau: 'lecture' }] } });
    assert.equal(m.status, 400, JSON.stringify(m.json));
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LANDES]}`, valeur)).status, 404);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
  });

  it('l\'admin passe un jeton « lecture » en « ecriture » ; un « tous » en lecture ne laisse pas écrire dans une exception à l\'écriture inverse', async () => {
    const antor = await session('antor');
    const admin = await session('admin');
    const { jid, valeur } = await creer(antor, { tous: true, niveauTous: 'lecture' });
    const w = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.equal(w.status, 403);
    assert.equal(w.json.code, 'lecture_seule');
    const m = await admin('PATCH', `/api/instance/jetons/${jid}`, { acces: { tous: true, niveauTous: 'lecture', univers: [{ universId: ids[LAME], niveau: 'ecriture' }] } });
    assert.equal(m.status, 200, JSON.stringify(m.json));
    const ok = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(ok.status >= 200 && ok.status < 300, String(ok.status));
    const ailleurs = await avecJeton('POST', `/api/v1/univers/${ids[CENDRES]}/lots`, valeur);
    assert.equal(ailleurs.status, 403, 'Cendres reste au niveau « tous » : lecture');
    assert.equal(ailleurs.json.code, 'lecture_seule');
  });
});
