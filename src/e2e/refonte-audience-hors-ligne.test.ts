// Black-box test of kanevas-refonte-visuelle, written from docs/ecrans.md § « États des composants du cadre »:
// « réglage d'audience · connexion perdue · interrupteurs et liste désactivés, le réglage se lit ».
//
// TEST PLAN (panne nommée → test)
//   connexion perdue, réglage ouvert : les interrupteurs et la liste « Auteur » se désactivent, les valeurs
//     restent lisibles                       [le réglage reste actif hors ligne / se vide]
//   connexion perdue, réglage ouvert après la perte : même état, sans appel d'écriture
//   retour de la connexion : les interrupteurs redeviennent actifs
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  regler,
  rx,
  section,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const PERDU = /Connexion perdue\. Ce que vous voyez peut être dépassé/;
const PASTILLE = /régler l['’]audience de/;

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let urlFiche = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await (await connecte(browser, srv.base, 'Léa')).ctx.close();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Audience hors ligne');
  await antor.getByRole('heading', { name: 'Audience hors ligne', level: 1 }).waitFor();
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await antor.getByLabel('Rôle de lea').waitFor();
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  urlFiche = new URL(antor.url()).pathname;
  await ajouterSection(antor, 'Apparence');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  antor.setDefaultTimeout(8000);
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

describe('réglage d’audience hors ligne', () => {
  test('la connexion tombe, réglage ouvert : interrupteurs et liste désactivés, valeurs lisibles, puis réactivés au retour', opts, async () => {
    await antor.goto(urlFiche);
    await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    await antor.waitForLoadState('networkidle');
    await section(antor, 'Apparence').getByRole('button', { name: PASTILLE }).click();
    const boite = antor.getByRole('dialog', { name: 'Qui voit « Apparence »' });
    const lisent = boite.getByRole('switch', { name: rx('Les joueurs la lisent') });
    assert.equal(await lisent.isDisabled(), false, 'actif en ligne');
    let ecritures = 0;
    antor.on('request', (r: Any) => r.method() !== 'GET' && ecritures++);
    await antor.context().setOffline(true);
    try {
      await antor.getByText(PERDU).waitFor();
      const interrupteurs = boite.getByRole('switch');
      assert.equal(await interrupteurs.count(), 4);
      for (let i = 0; i < 4; i++) assert.equal(await interrupteurs.nth(i).isDisabled(), true, `interrupteur ${i} désactivé`);
      assert.equal(await boite.getByRole('combobox').isDisabled(), true, 'liste Auteur désactivée');
      assert.equal(await lisent.getAttribute('aria-checked'), 'true', 'le réglage se lit encore');
      await lisent.click({ force: true, timeout: 1500 }).catch(() => {});
      assert.equal(await lisent.getAttribute('aria-checked'), 'true', 'un clic hors ligne ne change rien');
      assert.equal(ecritures, 0, 'aucune écriture partie');
    } finally {
      await antor.context().setOffline(false);
    }
    antor.removeAllListeners('request');
    await antor.getByText(PERDU).waitFor({ state: 'detached', timeout: 40000 });
    assert.equal(await lisent.isDisabled(), false, 'réactivé au retour de la connexion');
    await antor.keyboard.press('Escape');
  });
});
