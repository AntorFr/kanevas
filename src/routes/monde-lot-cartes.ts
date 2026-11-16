// Shared world of the doors written by the « cartes » lot (docs/tests-ecran/lot-cartes.md): the app in stub mode WITH its starting
// world (« Éneria d'essai », « Galaxie d'essai », …) seeded as `server.ts` does, driven by `inject` instead of a real server and
// a browser. Same shape as the world the screen files used (`monde`, `appel`, `lire`, `put`, `sql`). Not a test file.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
export type App = Awaited<ReturnType<typeof buildApp>>;

export interface Monde {
  app: App;
  uid: number;
  gid: number;
  sid: number; // the game system « Système d'essai »
  cookies: Record<string, string>;
}

export interface Rep {
  status: number;
  texte: string;
  json: Any;
}

async function connexion(app: App, compte: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function monde(): Promise<Monde> {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the starting world is seeded');
  const m: Monde = { app, uid: 0, gid: 0, sid: 0, cookies: {} };
  for (const c of ['antor', 'lea', 'teo', 'mira', 'roxane']) m.cookies[c] = await connexion(app, c);
  const univers = (await lire(m, 'antor', '/api/univers')).json as Any[];
  const eneria = univers.find((u) => u.nom === "Éneria d'essai");
  m.uid = eneria.id;
  m.sid = eneria.systeme.id;
  const cartes = await lire(m, 'antor', `/api/univers/${m.uid}/cartes`);
  m.gid = cartes.json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id;
  return m;
}

export async function appel(m: Monde, compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const r = await m.app.inject({
    method: methode as 'GET',
    url: chemin,
    headers: { cookie: m.cookies[compte] },
    payload: corps === undefined ? undefined : (corps as object),
  });
  let json: Any = null;
  try {
    json = JSON.parse(r.body);
  } catch {
    /* not JSON */
  }
  return { status: r.statusCode, texte: r.body, json };
}
export const lire = (m: Monde, compte: string, chemin: string) => appel(m, compte, 'GET', chemin);
export async function put(m: Monde, compte: string, chemin: string, corps: unknown): Promise<number> {
  return (await appel(m, compte, 'PUT', chemin, corps)).status;
}
/** Data setups no screen offers go straight to the database of the app. */
export function sql(m: Monde, requete: string): void {
  m.app.db.exec(requete);
}
