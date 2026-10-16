// Browser check of E-18 on a phone (390 px): a token with an expiry date shows its three mentions
// (créé par / dernier usage ou jamais utilisé / expire le) stacked in a column, none ending with a dangling « · »
// (mock-up docs/maquettes/e18-acces-api.html:527-528).
//
// TEST PLAN
//   B-E18 nominal : a fresh 30-day token has three mentions, one per line, left-aligned, no separator rendered
//   B-E18 bords   : the last mention «expire le …» is on its own line; no mention's text ends with « · »
//   B-E18 desktop : same token at 1280 px keeps the three mentions on one row, « · » after all but the last
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === 'Essai Kanka').id;
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('button', { name: /Nouveau jeton/ }).first().click();
  const boite = antor.getByRole('dialog');
  await boite.getByRole('textbox', { name: /Nom/ }).fill('Jeton mentions');
  await boite.getByRole('button', { name: 'Créer le jeton' }).click();
  await antor.locator('.face-jeton').waitFor();
  await antor.locator('.face-jeton').getByRole('button', { name: 'J’ai copié le jeton' }).click();
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('E-18 : au téléphone un jeton qui expire empile ses trois mentions, sans « · » pendant', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  const ligne = antor.locator('li[data-jeton="Jeton mentions"]');
  await ligne.waitFor();
  const m = await ligne.locator('.meta > span').evaluateAll((els: Element[]) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { texte: (e as HTMLElement).innerText.trim(), after: getComputedStyle(e, '::after').content, top: r.top, left: r.left, h: r.height };
  }));
  assert.equal(m.length, 3, JSON.stringify(m));
  assert.match(m[0].texte, /^créé par Antor/i);
  assert.match(m[1].texte, /^jamais utilisé$/);
  assert.match(m[2].texte, /^expire le /);
  assert.ok(m.every((x: Any) => x.after === 'none' || x.after === 'normal'), `séparateur rendu: ${JSON.stringify(m)}`);
  assert.ok(m.every((x: Any, i: number) => i === 0 || x.top > m[i - 1].top), `mentions non empilées: ${JSON.stringify(m)}`);
  assert.equal(new Set(m.map((x: Any) => Math.round(x.left))).size, 1, 'mentions alignées à gauche');
  assert.ok(m.every((x: Any) => !x.texte.endsWith('·')), 'aucune mention ne finit par « · »');
  await antor.screenshot({ path: '/tmp/e18-jeton-390.png' });
});

test('E-18 : au bureau le même jeton garde ses trois mentions sur une ligne, « · » après chacune sauf la dernière', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/acces-api`);
  const ligne = antor.locator('li[data-jeton="Jeton mentions"]');
  await ligne.waitFor();
  const m = await ligne.locator('.meta > span').evaluateAll((els: Element[]) => els.map((e) => ({ after: getComputedStyle(e, '::after').content, top: Math.round(e.getBoundingClientRect().top) })));
  assert.deepEqual(m.map((x: Any) => x.after), ['"·"', '"·"', 'none']);
  assert.equal(new Set(m.map((x: Any) => x.top)).size, 1, 'une seule ligne');
});
