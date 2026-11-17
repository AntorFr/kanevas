// Doors of `src/e2e/icones-marque-besoin.test.ts` (lot « écrans »): the brand files served without a session (AD-135): sizes of the
// images, the manifest and what stays closed, through `inject` on the built shell. The screen file keeps what the page declares and shows.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const racine = mkdtempSync(join(tmpdir(), 'kanevas-marque-ecrans-'));
mkdirSync(join(racine, 'assets'));
cpSync('frontend/public', racine, { recursive: true });
writeFileSync(join(racine, 'index.html'), '<html><head></head><body>SHELL</body></html>');
writeFileSync(join(racine, 'robots.txt'), 'hors marque');

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const app = await buildApp();
const PACK = 'assets/brand/kanevas-marge/web/';
const dim = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];
const get = async (p: string) => app.inject({ url: p });

test('B-fichiers : les 7 fichiers répondent 200 sans session avec les octets du pack Marge', async () => {
  for (const nom of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    const r = await get(`/${nom}`);
    assert.equal(r.statusCode, 200, nom);
    assert.deepEqual(r.rawPayload, readFileSync(PACK + nom), `${nom} : octets du pack Marge`);
  }
  assert.equal((await get('/site.webmanifest')).statusCode, 200);
});

test('B-tailles : apple-touch 180, icônes 192 et 512, maskable 512, ICO et SVG valides', async () => {
  assert.deepEqual(dim((await get('/apple-touch-icon.png')).rawPayload), [180, 180]);
  assert.deepEqual(dim((await get('/icon-192.png')).rawPayload), [192, 192]);
  assert.deepEqual(dim((await get('/icon-512.png')).rawPayload), [512, 512]);
  assert.deepEqual(dim((await get('/icon-maskable-512.png')).rawPayload), [512, 512]);
  assert.deepEqual([...(await get('/favicon.ico')).rawPayload.subarray(0, 4)], [0, 0, 1, 0]);
  assert.match((await get('/favicon.svg')).body, /<svg[\s>]/);
});

test('B-manifeste : nom Kanevas, standalone, couleurs de la charte, icônes 192, 512 et maskable servies', async () => {
  const m = (await get('/site.webmanifest')).json() as { name: string; display: string; start_url: string; theme_color: string; background_color: string; icons: Array<{ src: string; sizes: string; purpose?: string }> };
  assert.equal(m.name, 'Kanevas');
  assert.equal(m.display, 'standalone');
  assert.match(m.start_url, /^\/?$/);
  const charte = ['#121317', '#fcfcfd', '#8b9bf0'];
  assert.ok(charte.includes(String(m.theme_color).toLowerCase()), `theme_color ${m.theme_color}`);
  assert.ok(charte.includes(String(m.background_color).toLowerCase()), `background_color ${m.background_color}`);
  const decrits = m.icons.map((i) => `${i.sizes} ${i.purpose ?? 'any'}`).sort();
  assert.ok(decrits.includes('192x192 any'), JSON.stringify(decrits));
  assert.ok(decrits.includes('512x512 any'), JSON.stringify(decrits));
  assert.ok(decrits.includes('512x512 maskable'), JSON.stringify(decrits));
  for (const i of m.icons) {
    const r = await get(new URL(i.src, 'http://x/site.webmanifest').pathname);
    assert.equal(r.statusCode, 200, i.src);
    const [l, h] = dim(r.rawPayload);
    assert.equal(`${l}x${h}`, i.sizes, i.src);
  }
});

test('B-exclusion : sans session, la page et les autres fichiers du pack ne sont pas publics', async () => {
  for (const chemin of ['/', '/robots.txt', '/kanevas-icon-1024.png', '/icon-1024.png', '/apple-touch-icon-precomposed.png', '/api/univers']) {
    assert.notEqual((await get(chemin)).statusCode, 200, `${chemin} ne doit pas être public`);
  }
});
