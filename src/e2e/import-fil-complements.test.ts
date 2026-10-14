// Complements to the acceptance tests of kanevas-import-fil, written from the need only
// (docs/parcours.md B-45..B-48, P-10; the criterion of the feature sheet). HTTP only, stub mode, real SQLite.
//
// PLAN
//  B-47 / exclusion  a section the script re-marks MJ-only (human did not touch it) is closed to Léa at the replay.
//  B-48 / type       the type of a fiche changed in Kanevas is not overwritten by the replay, the batch says so.
//  B-47 / sans lot   a PUT without ?lot succeeds and leaves no batch on E-18.
//  B-46 / en cours   a token revoked while a batch is open: the next PUT is 401 and nothing is written or counted.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
type App = Awaited<ReturnType<typeof buildApp>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const corps = (public_: boolean) => ({
  type: 'lieu',
  titre: 'Port-Sel',
  sections: [
    { cle: 'description', titre: 'Description', contenu: 'Un port brumeux.', joueursLisent: true, joueursEcrivent: false },
    { cle: 'notes', titre: 'Notes', contenu: 'Le capitaine boit.', joueursLisent: public_, joueursEcrivent: false },
  ],
});

describe('kanevas-import-fil, compléments', () => {
  let app: App;
  let essai: number;
  const cookies = new Map<string, string>();

  before(async () => {
    app = await buildApp();
    assert.equal(semerBouchon(app.db), true);
    essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  });
  after(async () => { await app.close(); });

  const cookie = async (compte: string) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST', url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    return cookies.get(compte)!;
  };
  const parse = (b: string) => { try { return JSON.parse(b); } catch { return b; } };
  const session = async (compte: string, method: string, url: string, payload?: unknown) => {
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: await cookie(compte) }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
    return { status: r.statusCode, json: parse(r.body) as Any };
  };
  const api = async (method: string, chemin: string, jeton: string, payload?: unknown) => {
    const r = await app.inject({ method: method as 'GET', url: `/api/import/v1/univers/${essai}/${chemin}`, headers: { authorization: `Bearer ${jeton}` }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
    return { status: r.statusCode, json: parse(r.body) as Any };
  };
  const lotsListes = async () => {
    const r = await session('antor', 'GET', `/api/univers/${essai}/lots`);
    return (Array.isArray(r.json) ? r.json : r.json.lots) as Any[];
  };
  const lireSections = async (compte: string, fid: number) =>
    (await session(compte, 'GET', `/api/univers/${essai}/fiches/${fid}`)).json.sections as Any[];

  test('section re-marquée MJ seul par le script, intouchée dans Kanevas : Léa la perd au rejeu', async () => {
    // Fails if the replay keeps the old audience.
    const a = await api('PUT', 'fiches/lieu%3Aaudience', JETON_BOUCHON, corps(true));
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(a.json.etat, 'creee');
    const fid = a.json.id as number;
    assert.deepEqual((await lireSections('lea', fid)).map((s) => s.titre).sort(), ['Description', 'Notes']);
    const b = await api('PUT', 'fiches/lieu%3Aaudience', JETON_BOUCHON, corps(false));
    assert.equal(b.json.etat, 'mise_a_jour');
    assert.deepEqual((await lireSections('lea', fid)).map((s) => s.titre), ['Description']);
    assert.equal(JSON.stringify((await session('lea', 'GET', `/api/univers/${essai}/fiches/${fid}`)).json).includes('Le capitaine boit.'), false);
  });

  test('type changé dans Kanevas : le rejeu ne le remet pas, le lot nomme la fiche et le type', async () => {
    // Fails if the replay overwrites the type a human chose.
    const a = await api('PUT', 'fiches/lieu%3Atype', JETON_BOUCHON, corps(true));
    const fid = a.json.id as number;
    app.db.prepare("UPDATE fiches SET type = 'faction' WHERE id = ?").run(fid);
    const ouvert = await api('POST', 'lots', JETON_BOUCHON);
    const lotId = ouvert.json.lotId as number;
    const b = await api('PUT', `fiches/lieu%3Atype?lot=${lotId}`, JETON_BOUCHON, corps(true));
    assert.equal(b.status, 200, JSON.stringify(b.json));
    const c = await api('POST', `lots/${lotId}/clore`, JETON_BOUCHON);
    assert.equal((app.db.prepare('SELECT type FROM fiches WHERE id = ?').get(fid) as { type: string }).type, 'faction');
    const rapport = JSON.stringify(c.json);
    assert.ok(rapport.includes('lieu:type'), rapport);
    assert.ok(/type/.test(JSON.stringify(c.json.rapport)), rapport);
    assert.ok(c.json.avertissements >= 1, rapport);
  });

  test('PUT sans ?lot : réussit, et aucun lot ne paraît sur E-18', async () => {
    // Fails if a write without batch opens one.
    const avant = (await lotsListes()).length;
    const r = await api('PUT', 'fiches/lieu%3Asanslot', JETON_BOUCHON, corps(true));
    assert.equal(r.status, 200);
    assert.equal(r.json.etat, 'creee');
    assert.equal((await lotsListes()).length, avant);
  });

  test('jeton révoqué lot ouvert : le PUT suivant reçoit 401, rien n’est écrit ni compté', async () => {
    // Fails if a revoked token still writes into an open batch.
    const cree = await session('antor', 'POST', `/api/univers/${essai}/jetons`, { nom: 'Éphémère', dureeJours: 7 });
    assert.equal(cree.status, 201);
    const jeton = cree.json.valeur as string;
    const ouvert = await api('POST', 'lots', jeton);
    const lotId = ouvert.json.lotId as number;
    assert.equal((await api('PUT', `fiches/lieu%3Arevoque-1?lot=${lotId}`, jeton, corps(true))).status, 200);
    const rev = await session('antor', 'POST', `/api/univers/${essai}/jetons/${cree.json.jeton.id}/revoquer`);
    assert.ok(rev.status === 200 || rev.status === 204, JSON.stringify(rev.json));
    const r = await api('PUT', `fiches/lieu%3Arevoque-2?lot=${lotId}`, jeton, corps(true));
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, { message: 'Jeton invalide.', code: 'jeton_invalide' });
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM fiches WHERE cle_origine = 'lieu:revoque-2'").get()!.n ?? 0, 0);
    const lu = (await lotsListes()).find((l) => l.id === lotId || l.lotId === lotId);
    assert.ok(lu, 'the open batch is still listed');
    assert.equal(JSON.stringify(lu).includes('"creees":2'), false);
  });
});
