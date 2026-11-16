// Shared world of the doors written by the « écrans » lot (docs/tests-ecran/lot-ecrans.md): the app in stub mode driven by
// `inject` instead of a real server and a browser. Accounts: antor, lea, teo, mira, admin. Not a test file.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
export type App = Awaited<ReturnType<typeof buildApp>>;
export type Hote = { cookie: string };
export type Verbe = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

async function connecter(app: App, compte: string): Promise<Hote> {
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

export async function monter(opts: { semis?: boolean } = {}) {
  const app = await buildApp();
  if (opts.semis) assert.ok((await import('../bouchon/depart.js')).semerBouchon(app.db), 'the starting world is seeded');
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const appel = (h: Hote | undefined, method: Verbe, url: string, payload?: object) =>
    app.inject({ method, url, headers: h ?? {}, payload });
  /** Calls and returns `{status, corps}`; the body is parsed when it is JSON. */
  const dire = async (h: Hote | undefined, method: Verbe, url: string, payload?: object) => {
    const r = await appel(h, method, url, payload);
    let corps: Any = r.body;
    try {
      corps = r.body ? JSON.parse(r.body) : null;
    } catch {
      /* not JSON */
    }
    return { status: r.statusCode, corps };
  };
  /** A fresh universe made by Antor (GM), the given accounts joining as players. */
  const univers = async (nom: string, joueurs: string[] = []) => {
    const u = await dire(antor, 'POST', '/api/univers', { nom });
    assert.equal(u.status, 201, JSON.stringify(u.corps));
    const base = `/api/univers/${u.corps.id}`;
    for (const j of joueurs) assert.equal((await dire(antor, 'POST', `${base}/membres`, { username: j, role: 'joueur' })).status, 201);
    return { id: u.corps.id as number, base };
  };
  const creer = async (h: Hote, base: string, corps: object) => {
    const r = await dire(h, 'POST', `${base}/fiches`, corps);
    assert.equal(r.status, 201, JSON.stringify(r.corps));
    return r.corps as { id: number; titre: string };
  };
  const n = (t: string) => (app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  return { app, antor, lea, teo, mira, admin, appel, dire, univers, creer, n };
}
