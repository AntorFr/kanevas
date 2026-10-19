// Measured render of E-4 and E-14 (arbitrated 13/10): the role pastilles end at the right end of the row rule
// (no empty column left by the hidden « Retirer »), and the three GM blocks of E-14 are the closed hatched block of E-6/E-9.
// Panne visée : « Retirer » invisible garde sa largeur après la pastille (≈89 px de vide) ; blocs MJ à cadre ouvert (dégradé, filet 2 px).
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
  await creerUnivers(p, 'Mesure rendu');
  await p.getByRole('heading', { name: 'Mesure rendu', level: 1 }).waitFor();
  await allerMembres(p);
  await ajouterMembre(p, 'lea', 'Joueur');
  await p.getByLabel('Rôle de lea').waitFor();
  await attendre(p);
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

const mesure = (nom: string) => p.locator('.liste-membres li').filter({ has: p.getByLabel(`Rôle de ${nom}`) }).evaluate((li: Element) => {
  const pad = parseFloat(getComputedStyle(li).paddingRight);
  const pastille = (li.querySelector('.role-pastille') as HTMLElement).getBoundingClientRect();
  const retirer = (li.querySelector('.actions-revelees') as HTMLElement).getBoundingClientRect();
  return { videDroite: Math.round(li.getBoundingClientRect().right - pad - pastille.right), pastilleG: pastille.left, retirerD: retirer.right };
});

test('E-4 : les pastilles de rôle finissent au bout du filet, au repos comme au survol, sans colonne vide', opts, async () => {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.mouse.move(2, 2);
  for (const nom of ['antor', 'lea']) {
    const m = await mesure(nom);
    assert.ok(Math.abs(m.videDroite) <= 1, `${nom} : pastille à ${m.videDroite} px du bout du filet`);
    assert.ok(m.retirerD <= m.pastilleG + 1, `${nom} : « Retirer » doit précéder la pastille`);
  }
  const repos = await mesure('lea');
  await p.locator('.liste-membres li').filter({ has: p.getByLabel('Rôle de lea') }).hover();
  await p.waitForTimeout(400);
  assert.deepEqual(await mesure('lea'), repos, 'la pastille ne bouge pas au survol');
});

test('E-14 : les cinq blocs MJ reprennent le bloc fermé de E-6/E-9 (trame, filet complet, barre de 3 px)', opts, async () => {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await p.getByRole('heading', { name: 'Paramètres', level: 1 }).waitFor();
  await attendre(p);
  const blocs = await p.locator('.panneaux-suivi .panneau.reserve-mj').evaluateAll((els: Element[]) => els.map((e) => {
    const s = getComputedStyle(e);
    const b = getComputedStyle(e, '::before');
    return {
      titre: e.querySelector('h2')?.textContent ?? '', danger: e.classList.contains('zone-danger'), fond: s.backgroundImage, ombre: s.boxShadow, bord: s.borderLeftWidth,
      margeG: s.marginLeft, padD: s.paddingRight, avant: b.content, avantL: b.width, haut: e.getBoundingClientRect().top, bas: e.getBoundingClientRect().bottom,
    };
  }));
  assert.equal(blocs.length, 5); // + « Types de fiche » et « Supprimer l’univers » (kanevas-import)
  for (const b of blocs) {
    assert.match(b.fond, /repeating-linear-gradient/, `${b.titre} : trame`);
    assert.doesNotMatch(b.fond, /transparent 40%/, `${b.titre} : plus de dégradé ouvert`);
    assert.match(b.ombre, /0px 0px 0px 1px inset/, `${b.titre} : filet complet de 1 px (${b.ombre})`);
    assert.doesNotMatch(b.ombre, /(?<![\d.])2px 0px 0px 0px/, `${b.titre} : pas de filet gauche de 2 px`);
    assert.equal(b.bord, '0px');
    assert.equal(b.margeG, '-28px', `${b.titre} : même marge que E-6/E-9`);
    assert.equal(b.padD, '28px');
    assert.equal(b.avant, '""', `${b.titre} : barre ::before`);
    // The closing panel « Supprimer l’univers » carries a --danger rule above it instead of the 3 px bar.
    if (!b.danger) assert.equal(b.avantL, '3px');
  }
  assert.ok(blocs[1].haut - blocs[0].bas <= 12, 'blocs voisins resserrés comme E-6/E-9');
  await p.screenshot({ path: '/tmp/rv-reglages-e14-mesure.png' });
});
