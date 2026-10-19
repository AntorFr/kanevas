// Review of kanevas-mediatheque-fiche, last reopening: « Joindre un fichier » takes the quiet add style of
// « Relier à une fiche » (Plus icon, small ghost button) and keeps its two paths.
//
// TEST PLAN
//   nominal   : the trigger has the small ghost class, a Plus (not paperclip) icon, the two entries
//               « Ajouter depuis l'appareil » and « Choisir dans la médiathèque »
//   exclusion : connection lost -> the trigger is disabled (aria-disabled) and opens nothing
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let portId = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const fiches = await (await antor.request.get(`/api/univers/${uid}/fiches?type=lieu`)).json();
  portId = (Array.isArray(fiches) ? fiches : fiches.fiches).find((f: Any) => f.titre === 'Port-Sel').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('« Joindre un fichier » est un bouton fantôme petit avec Plus et les deux chemins', opts, async () => {
  // Fails if the trigger loses the shared style, shows the paperclip again, or drops one of the two paths.
  await antor.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(antor);
  const zone = antor.getByRole('region', { name: /Description/ });
  const bouton = zone.getByRole('button', { name: 'Joindre un fichier' });
  const relier = antor.getByRole('button', { name: 'Relier à une fiche' }).first();
  const classes = await bouton.getAttribute('class');
  assert.match(classes ?? '', /\bfantome\b/);
  assert.match(classes ?? '', /\bpetit\b/);
  assert.equal(await bouton.locator('svg.lucide-plus').count(), 1);
  assert.equal(await bouton.locator('svg.lucide-paperclip').count(), 0);
  assert.equal(await bouton.evaluate((e: HTMLElement) => getComputedStyle(e).height), await relier.evaluate((e: HTMLElement) => getComputedStyle(e).height));
  await bouton.click();
  await antor.getByRole('menuitem', { name: /Ajouter depuis l.appareil/ }).waitFor();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).waitFor();
  assert.equal(await antor.getByRole('menuitem').count(), 2);
  await antor.keyboard.press('Escape');
});

test('connexion perdue : « Joindre un fichier » est désactivé et ne s’ouvre pas', opts, async () => {
  // Fails if the offline state leaves the trigger usable.
  await antor.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(antor);
  const zone = antor.getByRole('region', { name: /Description/ });
  const bouton = zone.getByRole('button', { name: 'Joindre un fichier' });
  await bouton.waitFor();
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  try {
    await antor.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Joindre un fichier/.test(b.textContent ?? '') && (b as HTMLButtonElement).disabled), null, { timeout: 15000 });
    assert.equal(await bouton.getAttribute('aria-disabled'), 'true');
    await bouton.click({ force: true });
    assert.equal(await antor.getByRole('menu').count(), 0);
  } finally {
    await antor.context().setOffline(false);
  }
});
