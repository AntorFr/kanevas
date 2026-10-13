// kanevas-rv-fondations, in a real Chromium on the stub app: the charte tokens apply in both
// themes, the three fonts are loaded from our own origin and the browser makes no request to
// another host.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
}, { timeout: 120000 });
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const CAPTURES = process.env['CAPTURES_DIR'];

for (const [nom, attr, fond, accent] of [
  ['sombre', 'dark', 'rgb(18, 19, 23)', '#8b9bf0'],
  ['clair', 'light', 'rgb(252, 252, 253)', '#3a4cc0'],
] as const) {
  test(`app en bouchon, thème ${nom} : fond de la charte, accent, polices propres, aucun hôte externe`, opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'antor');
    const externes: string[] = [];
    page.on('request', (r: Any) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith('http') && u.origin !== new URL(srv.base).origin) externes.push(r.url());
    });
    await page.addInitScript((c: string) => localStorage.setItem('kanevas-theme', c), nom === 'clair' ? 'clair' : 'sombre');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => document.documentElement.dataset['theme']), attr);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), fond);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
      accent,
    );
    // force the three families to load, then check the browser really has them
    const charge = await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('500 40px "Fraunces Variable"'),
        document.fonts.load('400 18px "Newsreader Variable"'),
        document.fonts.load('italic 400 18px "Newsreader Variable"'),
        document.fonts.load('400 14px "Inter"'),
        document.fonts.load('600 14px "Inter"'),
      ]);
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/['"]/g, ''));
    });
    for (const f of ['Fraunces Variable', 'Newsreader Variable', 'Inter']) assert.ok(charge.includes(f), `${f} non chargée : ${charge}`);
    assert.deepEqual(externes, []);
    if (CAPTURES) {
      mkdirSync(CAPTURES, { recursive: true });
      await page.screenshot({ path: `${CAPTURES}/accueil-${nom}.png` });
    }
    await ctx.close();
  });
}
