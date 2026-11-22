// ecrans: accueil
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { freePort, launch, skipBrowser, type Any } from './harnais.test.js';

// Layer 3 of AD-rust-6: the proof page, served by a Vite dev server started here (random port),
// loads the example module in Chromium and shows the same value as the Rust test.
// Pinned in rust/modules/exemple (fnv1a_kanevas_epingle): fnv1a("kanevas").
const FNV1A_KANEVAS = '3485111814';

let vite: ViteDevServer;
let base: string;
let browser: Any;

before(async () => {
  if (skipBrowser) return;
  const port = await freePort();
  vite = await createServer({
    configFile: `${process.cwd()}/frontend/vite.essai.config.ts`,
    server: { port, strictPort: true, host: '127.0.0.1' },
    logLevel: 'silent',
  });
  await vite.listen();
  base = `http://127.0.0.1:${port}`;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await vite?.close();
});

test('AD-rust-6 the proof page shows the pinned value of fnv1a("kanevas") computed by the Wasm module', { skip: skipBrowser }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('fnv1a')?.textContent !== '…', undefined, { timeout: 20_000 });
    assert.equal(await page.textContent('#fnv1a'), FNV1A_KANEVAS);
    assert.notEqual((await page.textContent('#version'))?.trim(), '');
    assert.equal(await page.isHidden('#erreur'), true);
  } finally {
    await page.close();
  }
});

// Browser layer of the `coeur` proof (AD-139, AD-etoiles-3): the same fixtures as the Node test, through the same .wasm.
const fixtures = (f: string) => JSON.parse(readFileSync(`${process.cwd()}/rust/modules/coeur/tests/fixtures/${f}`, 'utf8'));

test('the coeur module in Chromium finds the fixtures\' stars and the exact JSON bytes of generation-sortie-coeur.json', { skip: skipBrowser }, async () => {
  const galaxie = fixtures('generation-galaxie.json');
  const sortie = fixtures('generation-sortie-coeur.json');
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('coeur-sortie')?.textContent, undefined, { timeout: 30_000 });
    assert.equal(await page.isHidden('#erreur'), true);
    assert.equal(await page.textContent('#densite'), '0.68');

    const etoiles: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-etoiles')!.textContent!));
    assert.equal(etoiles.length, galaxie.blocs.length);
    galaxie.blocs.forEach((b: Any, i: number) => {
      const obtenu = JSON.parse(etoiles[i]!);
      if (!b.etoile) return assert.equal(obtenu, null, `block ${b.bx},${b.by}`);
      assert.equal(obtenu.q, b.etoile.q);
      assert.equal(obtenu.r, b.etoile.r);
      assert.equal(obtenu.lettre, b.etoile.lettre);
      for (const k of ['taille', 'x', 'y']) assert.ok(Math.abs(obtenu[k] - b.etoile[k]) <= 1e-9, `${k} ${b.bx},${b.by}`);
    });

    const octets: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-sortie')!.textContent!));
    assert.deepEqual(octets, sortie.blocs.map((b: Any) => b.json));

    const hex = JSON.parse((await page.textContent('#coeur-hex'))!);
    assert.deepEqual([hex.q, hex.r], [7, -3]);
  } finally {
    await page.close();
  }
});

test('the coeur module in Chromium draws the fixtures\' systems and the exact JSON bytes of generation-sortie-systemes.json', { skip: skipBrowser }, async () => {
  const systemes = fixtures('generation-systemes.json');
  const sortie = fixtures('generation-sortie-systemes.json');
  const egal = (a: Any, b: Any, ctx: string): void => {
    if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) <= 1e-9, `${ctx}: ${a} != ${b}`);
    if (Array.isArray(a) && Array.isArray(b)) {
      assert.equal(a.length, b.length, `${ctx}: length`);
      return a.forEach((v, i) => egal(v, b[i], `${ctx}[${i}]`));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${ctx}: keys`);
      return Object.keys(a).forEach((k) => egal(a[k], b[k], `${ctx}.${k}`));
    }
    assert.deepEqual(a, b, ctx);
  };
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('coeur-systeme-appels')?.textContent, undefined, { timeout: 30_000 });
    assert.equal(await page.isHidden('#erreur'), true);
    const tires: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-systemes')!.textContent!));
    assert.equal(tires.length, systemes.systemes.length);
    systemes.systemes.forEach((s: Any, i: number) => egal(JSON.parse(tires[i]!), s.sortie, `${s.entree.q},${s.entree.r}`));
    const octets: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-sortie-systemes')!.textContent!));
    assert.deepEqual(octets, sortie.systemes.map((s: Any) => s.json));
    const a = JSON.parse((await page.textContent('#coeur-systeme-appels'))!);
    assert.ok(Math.abs(a.transition - systemes.systemes[0].sortie.transition) <= 1e-9);
    assert.ok(Math.abs(a.x - 2) < 1e-9 && Math.abs(a.y) < 1e-9 && Math.abs(a.orbite - 2) < 1e-9 && Math.abs(a.heure - 3) < 1e-9);
  } finally {
    await page.close();
  }
});

test('the coeur module in Chromium draws the same bytes as the Node binding (AD-carte-1) and refuses an unknown type and a side of 8', { skip: skipBrowser }, async () => {
  const { dessiner, versionRendu } = await import('../wasm/coeur.js');
  const { fusionnerReglages, reglagesDefaut, tirerSysteme, typesCatalogue, validerAspectType, validerReglages, versionGenerateurCourante, versionsGenerateur } = await import('../wasm/coeur.js');
  const v = await versionRendu();
  const aspects = ['{"type":"tellurique"}', '{"type":"jaune"}', '{"type":"gazeuse","aspect":{"palette":["#102030","#a0b0c0"]}}'];
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('coeur-rendu-refus')?.textContent, undefined, { timeout: 30_000 });
    assert.equal(await page.isHidden('#erreur'), true);
    const images: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-rendu')!.textContent!));
    assert.equal(images.length, aspects.length);
    for (const [i, a] of aspects.entries()) {
      assert.equal(images[i]!.length, 32 * 32 * 4 * 2);
      assert.equal(images[i], Buffer.from(await dessiner(a, 32, v)).toString('hex'), a);
    }
    assert.notEqual(images[0], images[1]);
    assert.deepEqual(JSON.parse((await page.textContent('#coeur-rendu-refus'))!), [true, true]);
    // the edition calls (AD-edition-3, AD-edition-4)
    await page.waitForFunction(() => document.getElementById('coeur-edition')?.textContent, undefined, { timeout: 30_000 });
    const e = JSON.parse((await page.textContent('#coeur-edition'))!);
    assert.deepEqual(e.types.planete.sort(), ['gazeuse', 'glace', 'lave', 'rocheux', 'tellurique', 'verrouillee']);
    assert.deepEqual(e.types.lune.sort(), ['glace', 'lave', 'rocheux']);
    assert.deepEqual(e.types.comete, ['comete']);
    assert.equal(e.galactique.length, 6);
    for (const g of e.galactique) {
      assert.ok(Math.abs(g.orbite - 3.37) <= 0.0051);
      assert.equal(g.heure, g.voisin);
    }
    assert.deepEqual(e.galactique.map((g: Any) => g.heure).sort((a: number, b: number) => a - b), [1, 3, 5, 7, 9, 11]);
    assert.deepEqual(JSON.parse(e.aspect), { mer: 0.5 });
    assert.deepEqual(JSON.parse(e.formation), { de: 1, a: 2 });
    assert.deepEqual(e.refus, [true, true, true, true, true]);
    // the settings calls (AD-reglages-1, AD-reglages-6): the same values as the Node layer
    await page.waitForFunction(() => document.getElementById('coeur-reglages')?.textContent, undefined, { timeout: 30_000 });
    const g = JSON.parse((await page.textContent('#coeur-reglages'))!);
    assert.equal(g.defaut, await reglagesDefaut(1));
    assert.deepEqual(g.versions, await versionsGenerateur());
    assert.equal(g.courante, await versionGenerateurCourante());
    assert.deepEqual(JSON.parse(g.valide), JSON.parse(await validerReglages(1, '{"frequences":{"comete":0.9}}')));
    assert.deepEqual(JSON.parse(g.valide), { ok: true, canonique: { frequences: { comete: 0.9 } } });
    assert.equal(JSON.parse(g.refuse).champ, 'frequences.comete');
    assert.equal(JSON.parse(g.refuse).borne, 'Entre 0 et 1.');
    assert.equal(g.fusion, await fusionnerReglages(1, '{"frequences":{"comete":0.9}}'));
    assert.equal(g.fusionVide, g.defaut);
    assert.equal(g.aspect, await validerAspectType('tellurique', '{"mer":0.5}'));
    assert.equal(JSON.parse(g.aspectRefuse).ok, false);
    assert.equal(g.catalogue, await typesCatalogue());
    assert.equal(g.comete, await tirerSysteme(0, 0, 0.8, 'K', 1, '{"frequences":{"comete":1}}'));
    assert.deepEqual(g.refus, [true, true, true, true]);
  } finally {
    await page.close();
  }
});
