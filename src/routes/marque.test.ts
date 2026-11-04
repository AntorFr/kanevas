import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Brand files (AD-135): public, declared, byte copies of the pack.
const NOMS: Record<string, string> = {
  'favicon.ico': 'image/(x-icon|vnd\.microsoft\.icon)',
  'favicon.svg': 'image/svg+xml',
  'apple-touch-icon.png': 'image/png',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png',
  'icon-maskable-512.png': 'image/png',
  'site.webmanifest': 'application/manifest+json',
};

const racine = mkdtempSync(join(tmpdir(), 'kanevas-marque-'));
mkdirSync(join(racine, 'assets'));
cpSync('frontend/public', racine, { recursive: true });
writeFileSync(join(racine, 'index.html'), '<html><head></head><body>SHELL</body></html>');
writeFileSync(join(racine, 'secret.txt'), 'hors marque');
writeFileSync(join(racine, 'robots.txt'), 'hors marque');

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');

test('chaque fichier de marque répond 200 sans cookie, bon type, cache public d’un jour', async () => {
  const app = await buildApp();
  for (const [nom, type] of Object.entries(NOMS)) {
    const r = await app.inject({ url: `/${nom}` });
    assert.equal(r.statusCode, 200, nom);
    assert.match(r.headers['content-type'] as string, new RegExp(`^${type.replace('+', '\\+')}\\b`), nom);
    assert.equal(r.headers['cache-control'], 'public, max-age=86400', nom);
    assert.deepEqual(r.rawPayload, readFileSync(join('frontend/public', nom)), nom);
  }
  await app.close();
});

test('HEAD et une query string servent aussi le fichier sans session', async () => {
  const app = await buildApp();
  const h = await app.inject({ method: 'HEAD', url: '/favicon.ico' });
  assert.equal(h.statusCode, 200);
  const q = await app.inject({ url: '/icon-192.png?v=2' });
  assert.equal(q.statusCode, 200);
  await app.close();
});

test('un autre fichier racine sans session redirige vers la connexion', async () => {
  const app = await buildApp();
  for (const url of ['/secret.txt', '/robots.txt', '/index.html', '/Favicon.ico', '/favicon.ico/', '/assets/x.js', '/icon-256.png']) {
    const r = await app.inject({ url });
    assert.equal(r.statusCode, 302, url);
    assert.equal(r.headers.location, '/connexion-bouchon', url);
  }
  await app.close();
});

test('le manifeste est un JSON complet dont les icônes existent', () => {
  const m = JSON.parse(readFileSync('frontend/public/site.webmanifest', 'utf8'));
  assert.equal(m.name, 'Kanevas');
  assert.equal(m.short_name, 'Kanevas');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'fr');
  assert.equal(m.background_color, '#121317');
  assert.equal(m.theme_color, '#121317');
  const trouve = (taille: string, purpose: string) =>
    m.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === taille && (i.purpose ?? 'any') === purpose);
  const a192 = trouve('192x192', 'any');
  const a512 = trouve('512x512', 'any');
  const mask = trouve('512x512', 'maskable');
  for (const i of [a192, a512, mask]) {
    assert.ok(i);
    assert.equal(i.type, 'image/png');
    assert.ok(readFileSync(join('frontend/public', i.src)).length > 0);
  }
  assert.equal(a192.src, 'icon-192.png');
  assert.equal(a512.src, 'icon-512.png');
  assert.equal(mask.src, 'icon-maskable-512.png');
});

test('les images de frontend/public sont égales à celles du pack, et les sept sont là', () => {
  for (const nom of Object.keys(NOMS)) {
    if (nom === 'site.webmanifest') continue;
    assert.deepEqual(
      readFileSync(join('frontend/public', nom)),
      readFileSync(join('assets/brand/kanevas-marge/web', nom)),
      nom,
    );
  }
  assert.equal(Object.keys(NOMS).length, 7);
});

test('index.html déclare icon ico, icon svg, apple-touch-icon 180, manifest et theme-color', () => {
  const html = readFileSync('frontend/index.html', 'utf8');
  assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="any"/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/);
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /<meta name="theme-color" content="#121317"/);
});

test('CLAUDE.md mentionne frontend/public et AD-135', () => {
  const t = readFileSync('CLAUDE.md', 'utf8');
  assert.match(t, /frontend\/public/);
  assert.match(t, /AD-135/);
});
