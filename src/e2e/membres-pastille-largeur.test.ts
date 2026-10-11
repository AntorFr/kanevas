// Revérification kanevas-refonte-visuelle, E-4 Membres : la pastille de rôle (select natif) est
// de largeur uniforme (arbitrage : la forme de la maquette n'est pas exigée), non coupée, chevron visible.
// Panne visée : une règle de E-12 / du champ-liste force la largeur ou le padding de la pastille ; ou le
// chevron est masqué (la pastille perd son padding droit réservé).
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
  await creerUnivers(p, 'Pastille largeur');
  await p.getByRole('heading', { name: 'Pastille largeur', level: 1 }).waitFor();
  await allerMembres(p);
  await ajouterMembre(p, 'lea', 'Joueur');
  await p.getByLabel('Rôle de lea').waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

const pastille = (nom: string) =>
  p.getByLabel(`Rôle de ${nom}`).locator('xpath=..').evaluate((e: HTMLElement) => {
    const sel = e.querySelector('select') as HTMLSelectElement;
    return { w: e.getBoundingClientRect().width, coupe: sel.scrollWidth > sel.clientWidth + 1 };
  });

// Arbitrage : le select natif à deux options prend la largeur de la plus large, donc la même pour MJ et Joueur.
// On n'exige que : pastille non coupée, chevron visible, même largeur.
for (const schema of ['light', 'dark'] as const) {
  test(`E-4 ${schema} bureau : pastille de rôle non coupée, chevron visible, même largeur MJ / Joueur`, opts, async () => {
    await p.emulateMedia({ colorScheme: schema });
    await p.setViewportSize({ width: 1440, height: 900 });
    await allerMembres(p);
    await p.getByLabel('Rôle de lea').waitFor();
    await attendre(p);
    await p.mouse.move(2, 2);
    const mj = await pastille('antor');
    const joueur = await pastille('lea');
    await p.screenshot({ path: `/tmp/rv-membres-pastille-${schema}.png` });
    assert.equal(mj.coupe, false, 'pastille MJ coupée');
    assert.equal(joueur.coupe, false, 'pastille Joueur coupée');
    assert.ok(Math.abs(mj.w - joueur.w) <= 1, `largeurs MJ ${mj.w} / Joueur ${joueur.w}`);
    const chev = await p.getByLabel('Rôle de antor').locator('xpath=..').locator('svg').evaluate((e: Element) => {
      const r = e.getBoundingClientRect();
      return { o: getComputedStyle(e).opacity, w: r.width };
    });
    assert.equal(chev.o, '1');
    assert.ok(chev.w > 0, 'chevron présent');
  });
}
