// Door of the lot « médiathèque » for the migration test of src/e2e/mediatheque-relu-besoin.test.ts: a database written by the
// build before the media library (fixture src/e2e/fixtures/avant-mediatheque) is migrated at startup; the visibility and the
// bytes of what it holds are read through `inject`. Same literals as the screen file.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'kanevas-avant-door-'));
cpSync('src/e2e/fixtures/avant-mediatheque', dir, { recursive: true });
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.DB_PATH = join(dir, 'k.sqlite');
delete process.env.ATTACHMENTS_DIR;

const { buildApp } = await import('../app.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function cookie(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
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

test('les pièces et illustrations d’avant migrent : la secrète et celle du MJ sont réservées, les octets et les illustrations sont servis selon le rôle', async () => {
  const app = await buildApp();
  const antor = await cookie(app, 'antor');
  const lea = await cookie(app, 'lea');
  const get = (h: Record<string, string>, url: string) => app.inject({ method: 'GET', url: `/api/univers/1${url}`, headers: h });
  const liste = async (h: Record<string, string>): Promise<Any[]> => (await get(h, '/fichiers')).json().fichiers;
  const listeA = await liste(antor);
  const vis = (nom: string) => listeA.find((x) => x.nom === nom)?.visibilite;
  assert.equal(vis('ancien-public.pdf'), 'joueurs');
  assert.equal(vis('ancien-secret.pdf'), 'mj');
  assert.equal(vis('ancien-mj.pdf'), 'mj');
  const listeL = (await liste(lea)).map((x) => x.nom);
  assert.ok(listeL.includes('ancien-public.pdf'));
  assert.ok(!listeL.includes('ancien-secret.pdf'));
  assert.ok(!listeL.includes('ancien-mj.pdf'));
  // octets conservés
  const pub = listeA.find((x) => x.nom === 'ancien-public.pdf');
  const r = await get(lea, `/fichiers/${pub.id}`);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body, '%PDF-1.4\nancien public\n');
  const sec = listeA.find((x) => x.nom === 'ancien-secret.pdf');
  assert.equal((await get(lea, `/fichiers/${sec.id}`)).statusCode, 404);
  assert.equal((await get(antor, `/fichiers/${sec.id}`)).statusCode, 200);
  // illustrations : celle d'une fiche sans section lue reste au MJ, celle de Port-Sel se charge pour Léa
  const ficheA = (await get(antor, '/fiches/23')).json();
  assert.ok(ficheA.illustration, 'Antor a toujours l’illustration du Rapport secret');
  assert.equal((await get(antor, `/fichiers/${ficheA.illustration.id}`)).statusCode, 200);
  assert.equal((await get(lea, `/fichiers/${ficheA.illustration.id}`)).statusCode, 404);
  const f12 = (await get(lea, '/fiches/12')).json();
  assert.ok(f12.illustration);
  assert.equal((await get(lea, `/fichiers/${f12.illustration.id}`)).statusCode, 200);
});
