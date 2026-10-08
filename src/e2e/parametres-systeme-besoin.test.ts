// Feature-level test of kanevas-illustrations, B-13 (docs/parcours.md, docs/ecrans.md E-14 « Critères »), written from
// the need, not from the code. Real server in stub mode WITH its starting world, real Chromium. Expected values are literals.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, startServer, type Server } from './harnais.test.js';

const opts = { skip: undefined as string | false | undefined, timeout: 90000 };

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;

async function parametres() {
  await antor.goto(`/univers/${U}/parametres`);
  await antor.getByRole('heading', { level: 1 }).waitFor();
  await attendre(antor);
}

describe('kanevas-illustrations, B-13 : rattacher, détacher et créer un système depuis E-14', { timeout: 300000 }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const r = await antor.request.fetch(`${srv.base}/api/univers`);
    const j = JSON.parse(await r.text());
    U = (j.univers ?? j).find((u: Any) => u.nom === "Lame d'Ébène").id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Fails if « Aucun système » + « Rattacher » stops detaching, or if it deletes the system.
  test('B-13 : « Aucun système » détache, le catalogue garde CoF Mini', opts, async () => {
    await parametres();
    await antor.getByLabel('Système du catalogue').selectOption({ label: 'Aucun système' });
    await antor.getByRole('button', { name: 'Rattacher', exact: true }).click();
    await antor.getByText('Cet univers n’est rattaché à aucun système de jeu.').first().waitFor();
    assert.equal(await antor.getByLabel('Système du catalogue').locator('option', { hasText: 'CoF Mini' }).count(), 1);
  });

  // Fails if choosing a catalogue system no longer attaches the universe.
  test('B-13 nominal : choisir « CoF Mini » et « Rattacher » montre « Utilisé par 2 univers » et « Ouvrir le système »', opts, async () => {
    await antor.getByLabel('Système du catalogue').selectOption({ label: 'CoF Mini' });
    await antor.getByRole('button', { name: 'Rattacher', exact: true }).click();
    await antor.getByText(/Utilisé par 2 univers/).first().waitFor();
    assert.equal(await antor.getByRole('link', { name: rx('Ouvrir le système') }).count(), 1);
  });

  // Fails if the uniqueness of a system name becomes case-sensitive.
  test('B-13 échec : créer « cof mini » dit « Un système porte déjà ce nom. » et ne crée rien', opts, async () => {
    await parametres();
    await antor.getByLabel('Nom du système').fill('cof mini');
    await antor.getByRole('button', { name: 'Créer et rattacher' }).click();
    await antor.getByText('Un système porte déjà ce nom.').first().waitFor();
    const cat = JSON.parse(await (await antor.request.fetch(`${srv.base}/api/systemes/catalogue`)).text());
    assert.equal(JSON.stringify(cat).match(/cof mini/gi)?.length, 1);
  });

  // Fails if an empty name is accepted.
  test('B-13 bords : nom vide → « Erreur : le nom est obligatoire. » ; 81 caractères → « Erreur : 80 caractères au plus. »', opts, async () => {
    await parametres();
    await antor.getByRole('button', { name: 'Créer et rattacher' }).click();
    await antor.getByText('Erreur : le nom est obligatoire.').first().waitFor();
    await antor.getByLabel('Nom du système').fill('x'.repeat(81));
    await antor.getByRole('button', { name: 'Créer et rattacher' }).click();
    await antor.getByText('Erreur : 80 caractères au plus.').first().waitFor();
  });

  // Fails if « Créer et rattacher » creates without attaching, or attaches without creating.
  test('B-13 : « Créer et rattacher » crée « Brumes » au catalogue et y rattache l’univers (« Utilisé par 1 univers »)', opts, async () => {
    await parametres();
    await antor.getByLabel('Nom du système').fill('Brumes');
    await antor.getByRole('button', { name: 'Créer et rattacher' }).click();
    await antor.getByText(/Utilisé par 1 univers/).first().waitFor();
    const cat = await (await antor.request.fetch(`${srv.base}/api/systemes/catalogue`)).text();
    assert.ok(cat.includes('Brumes'));
  });

  // Fails if a Joueur can reach the settings.
  test('B-13 exclusion : Léa, Joueuse, voit « Page introuvable. » à l’adresse des paramètres', opts, async () => {
    const lea = (await connecte(browser, srv.base, 'Léa')).page;
    await lea.goto(`/univers/${U}/parametres`);
    await lea.getByText('Page introuvable.').first().waitFor();
  });
});
