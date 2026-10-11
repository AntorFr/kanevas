// Revérification kanevas-refonte-visuelle, E-4 Membres : la pastille de rôle est ajustée à son texte
// (maquette e04 mesurée à 1440 px : « MJ » 58 px, « Joueur » 80 px), pas étirée à ~76 px pour « MJ ».
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

const largeur = (nom: string) =>
  p.getByLabel(`Rôle de ${nom}`).locator('xpath=..').evaluate((e: HTMLElement) => e.getBoundingClientRect().width);

for (const schema of ['light', 'dark'] as const) {
  test(`E-4 ${schema} bureau : pastille « MJ » ~58 px et « Joueur » ~80 px, chevron visible`, opts, async () => {
    await p.emulateMedia({ colorScheme: schema });
    await p.setViewportSize({ width: 1440, height: 900 });
    await allerMembres(p);
    await p.getByLabel('Rôle de lea').waitFor();
    await attendre(p);
    await p.mouse.move(2, 2);
    const mj = await largeur('antor');
    const joueur = await largeur('lea');
    await p.screenshot({ path: `/tmp/rv-membres-pastille-${schema}.png` });
    assert.ok(joueur >= 0, `Joueur ${joueur}`);
    assert.ok(mj >= 54 && mj <= 64, `pastille MJ ${mj} px (attendu ~58; Joueur mesuré ${joueur})`);
    assert.ok(joueur >= 76 && joueur <= 86, `pastille Joueur ${joueur} px (attendu ~80)`);
    const chev = await p.getByLabel('Rôle de antor').locator('xpath=..').locator('svg').evaluate((e: Element) => {
      const r = e.getBoundingClientRect();
      return { o: getComputedStyle(e).opacity, w: r.width };
    });
    assert.equal(chev.o, '1');
    assert.ok(chev.w > 0, 'chevron présent');
  });
}
