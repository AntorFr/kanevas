// Ensemble, E-9 Pièces jointes, mockup e09-fiche-importee.html: « Joindre un fichier » is the quiet add link
// of « Relier à une fiche », not a larger or darker control.
//
// TEST PLAN
//   nominal : Antor, Port-Sel « Description »: the trigger has the font size, weight, text and icon colour and
//             height of « Relier à une fiche », and a height between 26 and 36 px

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

const lire = (el: Any) =>
  el.evaluate((e: HTMLElement) => {
    const s = getComputedStyle(e);
    const svg = e.querySelector('svg');
    return { taille: s.fontSize, graisse: s.fontWeight, couleur: s.color, hauteur: parseFloat(s.height), icone: svg ? getComputedStyle(svg).color : '' };
  });

test('« Joindre un fichier » a le style discret de « Relier à une fiche »', opts, async () => {
  // Fails if the trigger is bigger, bolder or darker than the add link of the mockup.
  await antor.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(antor);
  const joindre = await lire(antor.getByRole('region', { name: /Description/ }).getByRole('button', { name: 'Joindre un fichier' }));
  const relier = await lire(antor.getByRole('button', { name: 'Relier à une fiche' }).first());
  assert.equal(relier.taille, joindre.taille, JSON.stringify({ joindre, relier }));
  assert.equal(joindre.graisse, '500');
  assert.equal(joindre.couleur, relier.couleur);
  assert.equal(joindre.icone, relier.icone);
  assert.ok(joindre.hauteur >= 26 && joindre.hauteur <= 36, `height ${joindre.hauteur}`);
  assert.equal(joindre.hauteur, relier.hauteur);
  await antor.screenshot({ path: '/tmp/joindre-style.png' });
});
