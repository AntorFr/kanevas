import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { lectureSysteme, sectionsDuSysteme } = await import('../services/droits.js');
type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

test('espace caché : ni id ni clé ne l’ouvrent comme un univers, même pour un MJ du système ; listes sans espace', async () => {
  const app = await buildApp();
  semerBouchon(app.db);
  const espaces = app.db.prepare('SELECT id, cle, espace_systeme_id s FROM univers WHERE espace_systeme_id IS NOT NULL').all() as { id: number; cle: string; s: number }[];
  assert.ok(espaces.length >= 2, 'la graine crée les espaces');
  const antor = await connecter(app, 'antor');
  const admin = await connecter(app, 'admin');
  const get = (h: { cookie: string }, url: string) => app.inject({ method: 'GET', url, headers: h });
  for (const e of espaces) {
    // make antor a GM of every space, whatever the seed did
    app.db.prepare("INSERT OR IGNORE INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'antor'), 'mj')").run(e.id);
    for (const adr of [String(e.id), e.cle]) {
      for (const suffixe of ['', '/fiches', '/membres', '/types', '/cartes']) {
        const r = await get(antor, `/api/univers/${adr}${suffixe}`);
        assert.equal(r.statusCode, 404, `GET /api/univers/${adr}${suffixe} → ${r.statusCode}`);
      }
    }
  }
  const liste = (await get(antor, '/api/univers')).json() as { id: number }[];
  assert.ok(!liste.some((u) => espaces.some((e) => e.id === u.id)));
  const inst = await get(admin, '/api/instance/univers');
  assert.equal(inst.statusCode, 200);
  assert.ok(!(inst.json() as { id: number }[]).some((u) => espaces.some((e) => e.id === u.id)));
  for (const e of espaces) assert.equal((await get(admin, `/api/instance/univers/${e.id}/membres`)).statusCode, 404);
});

test('gabarits : 404 sur toute la famille ; PUT types 403 à un GM rattaché non MJ du système', async () => {
  const app = await buildApp();
  semerBouchon(app.db);
  const mira = await connecter(app, 'mira');
  const sid = (app.db.prepare('SELECT id FROM systemes_jeu ORDER BY id').get() as { id: number }).id;
  for (const [m, u] of [['GET', `/api/systemes/${sid}/gabarits`], ['POST', `/api/systemes/${sid}/gabarits`], ['PUT', `/api/systemes/${sid}/gabarits/1`]] as const) {
    assert.equal((await app.inject({ method: m, url: u, headers: mira, payload: {} })).statusCode, 404, `${m} ${u}`);
  }
  // an attached-universe GM that is not a GM of the system
  const r = await app.inject({ method: 'PUT', url: `/api/systemes/${sid}/types/objet`, headers: mira, payload: { active: false } });
  const mj = app.db.prepare("SELECT 1 FROM membres m JOIN univers e ON e.id = m.univers_id JOIN comptes c ON c.id = m.compte_id WHERE e.espace_systeme_id = ? AND c.username = 'mira'").get(sid);
  assert.equal(r.statusCode, mj ? 200 : 403);
});

test('graine bouchon : les éléments des systèmes sont lisibles par lectureSysteme', async () => {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number };
  const lea = app.db.prepare("SELECT id FROM comptes WHERE username = 'lea'").get() as { id: number };
  const systemes = app.db.prepare('SELECT id FROM systemes_jeu').all() as { id: number }[];
  let total = 0;
  for (const s of systemes) {
    const droit = lectureSysteme(app.db, antor.id, s.id);
    if (!droit) continue;
    const fiches = app.db.prepare('SELECT id FROM fiches WHERE univers_id = ?').all(droit.espaceId) as { id: number }[];
    for (const f of fiches) {
      assert.ok(sectionsDuSysteme(app.db, antor.id, s.id, f.id).length > 0);
      total++;
    }
  }
  assert.ok(total > 0, 'au moins un élément lisible');
  const s1 = systemes[0]!.id;
  if (lectureSysteme(app.db, lea.id, s1)) {
    const f = app.db.prepare('SELECT f.id FROM fiches f JOIN univers e ON e.id = f.univers_id WHERE e.espace_systeme_id = ? LIMIT 1').get(s1) as { id: number } | undefined;
    if (f) assert.ok(sectionsDuSysteme(app.db, lea.id, s1, f.id).length > 0);
  }
});
