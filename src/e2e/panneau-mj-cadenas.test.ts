// kanevas-rv-composants (reopened by verify): every « MJ seul » panel (E-6 campaign, E-14 settings) shows a
// padlock before the words, in light and dark, like the audience pill (charte § Composants: icon, word, tint).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
let uid = 0;
let cid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'antor')).page;
  const post = async (u: string, data: unknown) => {
    const r = await page.request.fetch(srv.base + u, { method: 'POST', data });
    assert.ok(r.status() < 300, `${u} -> ${r.status()}`);
    return r.json();
  };
  uid = (await post('/api/univers', { nom: 'Cadenas' })).id;
  cid = (await post(`/api/univers/${uid}/campagnes`, { nom: 'Camp' })).id;
}, { timeout: 120000 });
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

for (const theme of ['clair', 'sombre'] as const) {
  test(`panneaux « MJ seul » avec cadenas (${theme})`, opts, async () => {
    await page.addInitScript((c: string) => localStorage.setItem('kanevas-theme', c), theme);
    const cas: Array<[string, string[]]> = [
      [`/univers/${uid}/campagnes/${cid}`, ['Scénarios', 'Préparation']],
      [`/univers/${uid}/parametres`, ['Identité', 'Système de jeu', 'Créer un système']],
    ];
    for (const [url, titres] of cas) {
      await page.goto(url);
      for (const t of titres) await page.getByRole('heading', { name: t, level: 2 }).waitFor();
      const pastilles = page.locator('section.panneau.reserve-mj h2 .pastille.mj');
      assert.equal(await pastilles.count(), titres.length, `${url} : une pastille par panneau réservé`);
      for (let i = 0; i < titres.length; i++) {
        const p = pastilles.nth(i);
        assert.equal((await p.innerText()).trim(), 'MJ seul');
        assert.equal(await p.locator('svg.lucide-lock').count(), 1, `${url} #${i} (${theme}) : cadenas`);
        assert.equal(await p.locator('svg').evaluate((s: Any) => s.getBoundingClientRect().width > 0), true, 'cadenas visible');
      }
    }
  });
}
