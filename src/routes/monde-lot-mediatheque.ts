// Shared world of the doors written by the « médiathèque » lot (docs/tests-ecran/lot-mediatheque.md): the seeded app (Lame d'Ébène,
// illustrations) driven by `inject` instead of a real server and a browser. Accounts: antor, lea, teo, admin. Not a test file.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RACINE = mkdtempSync(join(tmpdir(), 'fichiers-lot-med-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, semerIllustrations } = await import('../bouchon/depart.js');

export type App = Awaited<ReturnType<typeof buildApp>>;
export type H = Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

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

export function multipart(nom: string, mime: string, contenu: Buffer, champs: Record<string, string> = {}) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: ${mime}\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

export async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  await semerIllustrations(app.db, RACINE);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const admin = await connecter(app, 'admin');
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const api = (p: string) => `/api/univers/${u.id}${p}`;
  const get = (h: H, p: string) => app.inject({ method: 'GET', url: api(p), headers: h });
  const json = async (h: H, p: string): Promise<Any> => (await get(h, p)).json();
  const noms = async (h: H, query = ''): Promise<string[]> => ((await json(h, `/fichiers${query}`)).fichiers as Any[]).map((f) => f.nom);
  const fichier = async (h: H, nom: string): Promise<Any> => ((await json(h, '/fichiers')).fichiers as Any[]).find((f) => f.nom === nom);
  const envoyer = (h: H, champs: Record<string, string>, nom: string, mime: string, contenu: Buffer, url = '/fichiers') => {
    const m = multipart(nom, mime, contenu, champs);
    return app.inject({ method: 'POST', url: api(url), headers: { ...h, 'content-type': m.type }, payload: m.payload });
  };
  const patch = (h: H, p: string, data: unknown) => app.inject({ method: 'PATCH', url: api(p), headers: h, payload: data as object });
  const suppr = (h: H, p: string) => app.inject({ method: 'DELETE', url: api(p), headers: h });
  const ficheId = (t: string) => (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, u.id) as { id: number }).id;
  return { app, antor, lea, teo, admin, api, get, json, noms, fichier, envoyer, patch, suppr, ficheId };
}
