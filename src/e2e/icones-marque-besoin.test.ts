// Black-box tests of `kanevas-icones`, written from the need (the "Livre" and "Précision" messages of the
// feature, docs/charte.md « The brand », docs/ecrans.md E-1 and sidebar). Expected values are literals.
// Real server in stub mode + real Chromium (harnais.test.ts); the dev server is vite itself.
//
// TEST PLAN (failure named -> test)
//   B-fichiers   : the 7 brand files answer 200 WITHOUT a session, right type, bytes of the pack  [file missing / behind the guard / wrong file]
//   B-tailles    : apple-touch 180, icon-192 192, icon-512 512, maskable 512 px; ico is an ICO     [wrong export copied]
//   B-index      : the page declares ico (sizes any), svg, apple-touch 180x180, manifest           [link missing]
//   B-manifeste  : name Kanevas, standalone, charter colours, icons 192/512 any + 512 maskable, each src served [manifest still pack's]
//   B-installable: Chromium finds no installability error on the manifest                           [manifest incomplete]
//   B-barre      : outside a universe the sidebar shows the Marge image (30 px) before « Kanevas », not the K square,
//                  same pixels in both themes; the link still reads « Kanevas — Mes univers » and goes to E-1
//   B-univers    : inside a universe the brand is not shown, the universe seal (initial) is unchanged
//   B-echec      : image fails to load -> « Kanevas » alone, link keeps its name, nothing else moves
//   B-exclusion  : the guard stays: / and other files of the pack are not public without a session
//   B-dev        : the vite dev server serves the same 7 files and declares them in the page
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  type Any,
  attendre,
  connecte,
  creerUnivers,
  freePort,
  launch,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const PACK = 'assets/brand/kanevas-marge/web/';
const FICHIERS: Array<[string, RegExp]> = [
  ['/favicon.ico', /^image\/(x-icon|vnd\.microsoft\.icon)/],
  ['/favicon.svg', /^image\/svg\+xml/],
  ['/apple-touch-icon.png', /^image\/png/],
  ['/icon-192.png', /^image\/png/],
  ['/icon-512.png', /^image\/png/],
  ['/icon-maskable-512.png', /^image\/png/],
  ['/site.webmanifest', /^application\/(manifest\+json|json)/],
];
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;

const dim = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

async function verifierFichiers(base: string): Promise<void> {
  for (const [chemin, type] of FICHIERS) {
    const r = await fetch(base + chemin, { redirect: 'manual' });
    assert.equal(r.status, 200, `${chemin} sans session`);
    assert.match(r.headers.get('content-type') ?? '', type, `${chemin} type`);
    if (chemin === '/site.webmanifest') continue; // completed by the feature: not the pack's bytes
    const octets = Buffer.from(await r.arrayBuffer());
    assert.ok(octets.equals(readFileSync(PACK + chemin.slice(1))), `${chemin} : octets du pack Marge`);
  }
}

test('B-fichiers : les 7 fichiers répondent 200 sans session, du bon type, avec les octets du pack Marge', opts, async () => {
  await verifierFichiers(srv.base);
});

test('B-tailles : apple-touch 180, icônes 192 et 512, maskable 512, ICO et SVG valides', opts, async () => {
  const get = async (p: string) => Buffer.from(await (await fetch(srv.base + p)).arrayBuffer());
  assert.deepEqual(dim(await get('/apple-touch-icon.png')), [180, 180]);
  assert.deepEqual(dim(await get('/icon-192.png')), [192, 192]);
  assert.deepEqual(dim(await get('/icon-512.png')), [512, 512]);
  assert.deepEqual(dim(await get('/icon-maskable-512.png')), [512, 512]);
  assert.deepEqual([...(await get('/favicon.ico')).subarray(0, 4)], [0, 0, 1, 0]);
  assert.match((await get('/favicon.svg')).toString(), /<svg[\s>]/);
});

test('B-index : la page déclare favicon ICO et SVG, apple-touch-icon 180x180 et manifeste', opts, async () => {
  await antor.goto('/');
  await antor.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  const liens: Array<{ rel: string; href: string; sizes: string; type: string }> = await antor.evaluate(() =>
    [...document.head.querySelectorAll('link')].map((l) => ({
      rel: l.getAttribute('rel') ?? '',
      href: l.getAttribute('href') ?? '',
      sizes: l.getAttribute('sizes') ?? '',
      type: l.getAttribute('type') ?? '',
    })),
  );
  const trouve = (rel: string, href: string) => liens.find((l) => l.rel === rel && l.href === href);
  assert.ok(trouve('icon', '/favicon.ico'), 'favicon.ico');
  assert.equal(trouve('icon', '/favicon.ico')?.sizes, 'any');
  assert.equal(trouve('icon', '/favicon.svg')?.type, 'image/svg+xml');
  assert.equal(trouve('apple-touch-icon', '/apple-touch-icon.png')?.sizes, '180x180');
  assert.ok(trouve('manifest', '/site.webmanifest'), 'manifest');
  assert.equal(await antor.title(), 'Kanevas');
});

test('B-manifeste : nom Kanevas, standalone, couleurs de la charte, icônes 192, 512 et maskable servies', opts, async () => {
  const m = (await (await fetch(srv.base + '/site.webmanifest')).json()) as Any;
  assert.equal(m.name, 'Kanevas');
  assert.equal(m.display, 'standalone');
  assert.match(m.start_url, /^\/?$/);
  const charte = ['#121317', '#fcfcfd', '#8b9bf0'];
  assert.ok(charte.includes(String(m.theme_color).toLowerCase()), `theme_color ${m.theme_color}`);
  assert.ok(charte.includes(String(m.background_color).toLowerCase()), `background_color ${m.background_color}`);
  const decrits = m.icons.map((i: Any) => `${i.sizes} ${i.purpose ?? 'any'}`).sort();
  assert.ok(decrits.includes('192x192 any'), JSON.stringify(decrits));
  assert.ok(decrits.includes('512x512 any'), JSON.stringify(decrits));
  assert.ok(decrits.includes('512x512 maskable'), JSON.stringify(decrits));
  for (const i of m.icons) {
    const r = await fetch(new URL(i.src, srv.base + '/site.webmanifest'), { redirect: 'manual' });
    assert.equal(r.status, 200, i.src);
    const [l, h] = dim(Buffer.from(await r.arrayBuffer()));
    assert.equal(`${l}x${h}`, i.sizes, i.src);
  }
});

test('B-installable : Chromium lit le manifeste et ne trouve aucune erreur d’installation', opts, async () => {
  const ctx = await antor.context().newCDPSession(antor);
  await antor.goto('/');
  await antor.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  const { installabilityErrors: errors } = await ctx.send('Page.getInstallabilityErrors');
  const { data } = await ctx.send('Page.getAppManifest');
  assert.deepEqual(errors, [], JSON.stringify(errors));
  assert.match(String(data), /"name":\s*"Kanevas"/);
});

const marque = (p: Any) => p.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Kanevas — Mes univers' });

test('B-barre : hors univers, la barre montre l’image Marge de 30 px avant « Kanevas », sans carré K, identique en clair et sombre', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(30000);
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  const lien = marque(page);
  await lien.waitFor();
  const img = lien.locator('img');
  assert.equal(await img.count(), 1);
  assert.equal(await img.getAttribute('src'), '/favicon.svg');
  await page.waitForFunction(() => {
    const i = document.querySelector('a[aria-label="Kanevas — Mes univers"] img') as HTMLImageElement | null;
    return !!i && i.complete && i.naturalWidth > 0;
  });
  const boite = await img.boundingBox();
  assert.equal(Math.round(boite.width), 30);
  assert.equal(Math.round(boite.height), 30);
  assert.equal(((await lien.innerText()) as string).trim(), 'Kanevas');
  assert.equal(await lien.getByText(/^K$/).count(), 0, 'le carré K a disparu');
  assert.equal(await lien.locator('.sceau').count(), 0);
  const texte = lien.getByText('Kanevas', { exact: true });
  assert.ok((await texte.boundingBox()).x > boite.x + boite.width - 1, 'image avant le nom');
  assert.equal(await lien.getAttribute('aria-label'), 'Kanevas — Mes univers');

  const theme = async (nom: 'Clair' | 'Sombre') => {
    if (!(await page.getByRole('menu').isVisible())) await page.getByRole('button', { name: /antor/i }).click();
    await page.getByRole('menuitemradio', { name: nom }).click();
    await page.waitForFunction((t: string) => document.documentElement.dataset.theme === t, nom === 'Clair' ? 'light' : 'dark');
  };
  await theme('Sombre');
  const coeur = { x: boite.x + 5, y: boite.y + 5, width: 20, height: 20 }; // the rounded corners are transparent: compare the inside
  const sombre = await page.screenshot({ clip: coeur, path: '/tmp/icones-barre-sombre.png' });
  await theme('Clair');
  const clair = await page.screenshot({ clip: coeur, path: '/tmp/icones-barre-clair.png' });
  assert.ok(sombre.equals(clair), 'même image dans les deux thèmes');
  await page.screenshot({ path: '/tmp/icones-barre-page-claire.png', fullPage: false });

  await lien.click(); // E-1
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  await page.close();
});

test('B-barre : la marque est aussi sur « Systèmes de jeu » (hors univers)', opts, async () => {
  const page = await antor.context().newPage();
  await page.goto('/systemes');
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Kanevas — Mes univers' }).locator('img').waitFor();
  await page.close();
});

test('B-univers : dans un univers la barre montre le sélecteur, pas la marque ; le sceau de l’univers garde son initiale', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(30000);
  await creerUnivers(page, 'Lame d’Ébène');
  await page.getByRole('heading', { name: 'Lame d’Ébène', level: 1 }).waitFor();
  const barre = page.getByRole('complementary', { name: 'Barre latérale' });
  assert.equal(await barre.getByRole('link', { name: 'Kanevas — Mes univers' }).count(), 0);
  assert.equal(await barre.locator('img[src="/favicon.svg"]').count(), 0);
  assert.equal(((await barre.locator('.sceau').first().innerText()) as string).trim(), 'L');
  await page.screenshot({ path: '/tmp/icones-univers.png' });
  await page.close();
});

test('B-echec : image qui ne charge pas -> « Kanevas » seul, lien nommé, rien d’autre ne bouge', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(30000);
  await page.route('**/favicon.svg', (r: Any) => r.abort());
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  const lien = marque(page);
  await lien.waitFor();
  assert.equal(((await lien.innerText()) as string).trim(), 'Kanevas');
  assert.equal(await lien.getAttribute('aria-label'), 'Kanevas — Mes univers');
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Systèmes de jeu' }).waitFor();
  await page.screenshot({ path: '/tmp/icones-echec.png' });
  await page.close();
});

test('B-exclusion : sans session, la page et les autres fichiers du pack ne sont pas publics', opts, async () => {
  for (const chemin of ['/', '/robots.txt', '/kanevas-icon-1024.png', '/icon-1024.png', '/apple-touch-icon-precomposed.png', '/api/univers']) {
    const r = await fetch(srv.base + chemin, { redirect: 'manual' });
    assert.notEqual(r.status, 200, `${chemin} ne doit pas être public`);
  }
});

test('B-dev : le serveur de dev (vite) sert les mêmes 7 fichiers et la page les déclare', opts, async () => {
  const port = await freePort();
  const enfant: ChildProcess = spawn('node_modules/.bin/vite', ['--config', 'frontend/vite.config.ts', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  try {
    const limite = Date.now() + 30000;
    for (;;) {
      try {
        await fetch(base + '/');
        break;
      } catch {
        if (Date.now() > limite) throw new Error('vite did not start');
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await verifierFichiers(base);
    const html = await (await fetch(base + '/')).text();
    for (const motif of [/rel="icon"[^>]*href="\/favicon\.ico"/, /href="\/favicon\.svg"/, /rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/, /rel="manifest"[^>]*href="\/site\.webmanifest"/]) {
      assert.match(html, motif);
    }
  } finally {
    enfant.kill('SIGKILL');
  }
});
