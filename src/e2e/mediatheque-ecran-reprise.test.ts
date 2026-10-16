// Review of the reopening of kanevas-mediatheque-ecran (Escape in the audience panel while saving;
// offline banner not cleared by an in-flight answer). Black-box, stub server, seeded « Lame d'Ébène ».
//
// TEST PLAN
//   Escape  : slow PATCH, author chosen (select disabled, focus left on the badge) -> Escape closes the dialog,
//             focus goes back to the badge, the save still lands (reload shows it)
//   offline : a GET answered late, `offline` fired meanwhile -> the banner stays; `online` clears it
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let urlFiche = '';

const BANDEAU = "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  const univers = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène");
  uid = univers.id;
  await antor.goto(`/univers/${uid}`);
  const fiches = await (await antor.request.get(`/api/univers/${uid}/fiches?type=personnage`)).json();
  const liste = Array.isArray(fiches) ? fiches : (fiches.fiches ?? fiches.items);
  urlFiche = `/univers/${uid}/fiche/${liste[0].id}`;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('Échap ferme « Qui voit » pendant la sauvegarde de l\'auteur, rend le focus à la pastille ; la sauvegarde aboutit', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto(urlFiche);
  await page.getByRole('button', { name: /régler l['’]audience de/ }).first().waitFor();
  await page.route(/\/api\/.*sections/, async (route: Any) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  const pastille = page.getByRole('button', { name: /régler l['’]audience de/ }).first();
  await pastille.click();
  const boite = page.getByRole('dialog', { name: /^Qui voit/ });
  const choix = boite.getByRole('combobox', { name: /Auteur/ });
  await choix.selectOption({ label: 'lea' });
  await page.waitForFunction("document.querySelector('[role=dialog] select')?.disabled === true");
  await page.keyboard.press('Escape');
  await boite.waitFor({ state: 'detached', timeout: 1200 });
  const nom: string = await page.evaluate("document.activeElement?.getAttribute('aria-label') ?? ''");
  assert.match(nom, /régler l['’]audience/, 'focus back on the badge');
  await page.waitForTimeout(2000);
  await page.unroute(/\/api\/.*sections/);
  await page.reload();
  await page.getByRole('button', { name: /régler l['’]audience de/ }).first().click();
  const relu = await page.getByRole('dialog', { name: /^Qui voit/ }).getByRole('combobox', { name: /Auteur/ }).inputValue();
  assert.notEqual(relu, '', 'the author was saved');
  await page.close();
});

test('une réponse 200 déjà en vol après « offline » ne lève pas le bandeau ; « online » le lève', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto(`/univers/${uid}/mediatheque`);
  await page.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
  let liberer: () => void = () => {};
  const porte = new Promise<void>((r) => (liberer = r));
  await page.route(/\/api\/univers\/\d+\/fichiers/, async (route: Any) => {
    await porte;
    await route.fallback();
  });
  // a GET goes out while online, and is held
  await page.locator('label', { hasText: /^Images$/ }).click();
  await page.waitForTimeout(300);
  await page.evaluate(
    "Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline'));",
  );
  await page.getByText(rx(BANDEAU)).waitFor();
  liberer();
  await page.waitForTimeout(800);
  assert.equal(await page.getByText(rx(BANDEAU)).count(), 1, 'banner kept after the late answer');
  await page.evaluate(
    "Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online'));",
  );
  await page.getByText(rx(BANDEAU)).waitFor({ state: 'detached' });
  await page.close();
});
