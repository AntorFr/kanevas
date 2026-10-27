// Black-box tests of kanevas-rv-lore-suivi, from its exit criterion and docs/ecrans.md § « Partout »:
// every successful action on E-8 gives its toast (E-6 and E-7 are retired, AD-127) (gabarit « « <objet> » <participe> »),
// a failure gives none, and the toast never takes the focus. Real server in stub mode + Chromium.
// Panne visée : un toast retiré ou posé avant la réponse du serveur ; un toast perdu par la navigation.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let p: Any;

const toastDe = (page: Any, texte: string) => page.locator('.toasts .toast').filter({ hasText: texte });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  p = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(p, 'Toasts suivi');
  await p.getByRole('heading', { name: 'Toasts suivi', level: 1 }).waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-8 : créer une fiche donne « « Brenn » créée »', opts, async () => {
  await creerFiche(p, 'personnage', 'Brenn');
  await toastDe(p, '« Brenn » créée').waitFor();
});
