// Tests of E-4 member row, from the arbitrated charte rule (V8, V12b): « Retirer » is revealed on
// hover/focus (visible on touch), the role is a pastille without a bordered field, the identifier
// is not framed, and avatar / role / action share one height. Real server (stub) + Chromium.
// Panne visée : « Retirer » plein et permanent, rôle en champ encadré, hauteurs inégales sur la ligne.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, allerMembres, ajouterMembre, attendre, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let p: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await connecte(browser, srv.base, 'Léa');
  p = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(p, 'Membres charte');
  await p.getByRole('heading', { name: 'Membres charte', level: 1 }).waitFor();
  await allerMembres(p);
  await ajouterMembre(p, 'lea', 'Joueur');
  await p.getByLabel('Rôle de lea').waitFor();
  await attendre(p);
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

const ligne = () => p.locator('.liste-membres li').filter({ has: p.getByLabel('Rôle de lea') });
const opacite = () => ligne().locator('.actions-revelees').evaluate((e: Element) => getComputedStyle(e).opacity);

test('E-4 : Retirer est caché au repos, révélé au survol et au focus clavier', opts, async () => {
  await p.mouse.move(2, 2);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  assert.equal(await opacite(), '0');
  await ligne().hover();
  await p.waitForTimeout(400);
  assert.equal(await opacite(), '1');
  await p.mouse.move(2, 2);
  await p.getByRole('button', { name: 'Retirer lea', exact: true }).focus();
  await p.waitForTimeout(400);
  assert.equal(await opacite(), '1');
});

test('E-4 : Retirer reste visible quand le pointeur ne survole pas (tactile)', opts, async () => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const tel = await ctx.newPage();
  const cookies = await p.context().cookies();
  await ctx.addCookies(cookies);
  await tel.goto(p.url());
  await tel.getByLabel('Rôle de lea').waitFor();
  await attendre(tel);
  const o = await tel.locator('.liste-membres li').filter({ has: tel.getByLabel('Rôle de lea') }).locator('.actions-revelees').evaluate((e: Element) => getComputedStyle(e).opacity);
  await tel.screenshot({ path: '/tmp/rv-reglages-membres-tactile.png' });
  await ctx.close();
  assert.equal(o, '1');
});

test('E-4 : avatar, rôle et action ont la même hauteur (28 px) ; identifiant et rôle sans cadre', opts, async () => {
  await ligne().hover();
  const m = await ligne().evaluate((li: Element) => {
    const nom = getComputedStyle(li.querySelector('.membre-nom') as Element);
    const sel = getComputedStyle(li.querySelector('select') as Element);
    return {
      avatar: Math.round((li.querySelector('.avatar') as HTMLElement).getBoundingClientRect().height),
      role: Math.round((li.querySelector('.role-pastille') as HTMLElement).getBoundingClientRect().height),
      select: Math.round((li.querySelector('select') as HTMLElement).getBoundingClientRect().height),
      action: Math.round((li.querySelector('.actions-revelees button') as HTMLElement).getBoundingClientRect().height),
      nomBord: nom.borderTopWidth, nomOmbre: nom.boxShadow, selBord: sel.borderTopWidth,
    };
  });
  assert.deepEqual([m.avatar, m.role, m.select, m.action], [28, 28, 28, 28]);
  assert.equal(m.nomBord, '0px');
  assert.equal(m.nomOmbre, 'none');
  assert.equal(m.selBord, '0px');
  await p.screenshot({ path: '/tmp/rv-reglages-membres-survol.png' });
});

test('E-4 : le MJ porte la teinte MJ, le joueur non (pastille de rôle)', opts, async () => {
  const fond = (nom: string) => p.getByLabel(`Rôle de ${nom}`).evaluate((e: Element) => getComputedStyle(e).backgroundColor);
  const mj = await fond('antor');
  const joueur = await fond('lea');
  assert.notEqual(mj, joueur);
});

// Panne visée : l'icône du titre d'un écran de réglages diverge de celle de la navigation (charte.md:104).
const iconeLucide = (svg: Any) => svg.evaluate((e: Element) => (e.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('lucide-') && c !== 'lucide').join(' '));

test('E-4 / E-14 : l\'icône du titre est celle de l\'entrée de navigation', opts, async () => {
  for (const [nom, attendue] of [['Membres', 'lucide-contact-round'], ['Paramètres', 'lucide-settings2']] as const) {
    await p.getByRole('link', { name: nom, exact: true }).click();
    await p.getByRole('heading', { name: nom, level: 1 }).waitFor();
    await attendre(p);
    const titre = await iconeLucide(p.locator('.tete-liste .glyphe-type svg'));
    const nav = await iconeLucide(p.getByRole('link', { name: nom, exact: true }).locator('svg').first());
    assert.equal(nav, titre, `${nom} : titre ≠ navigation`);
    assert.match(titre, new RegExp(attendue.replace('settings2', 'settings-2')));
  }
});
