// Revérification de kanevas-images (B-25, échec) : écrit depuis le besoin (docs/ecrans.md, « Les échecs,
// dits par l'assistant » et critère « en bouchon, sa demande contient « échec » »), pas depuis le code.
// Une génération en échec est une réponse de l'assistant (message normal du fil), jamais la bulle
// d'erreur « Je n'ai pas pu répondre — réessayer » (role="alert").
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;

async function json(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.json();
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
});
after(async () => {
  if (browser) await browser.close();
  if (srv) srv.stop();
});

describe('kanevas-images : l’échec de génération est un message normal (B-25)', { skip: skipBrowser }, () => {
  for (const demande of [
    "Fais un portrait pour « Apparence » d'« Maître Aldric » avec un échec",
    "échec : fais un portrait pour Apparence d'Aldric",
    "Fais un portrait pour Apparence d'Aldric, ÉCHEC",
  ]) {
    test(`echec_dit_en_message_normal_sans_bulle_d_erreur : ${demande}`, async () => {
      // Fails if the failure surfaces as the transport error bubble, or not as the exact sentence, or attaches something.
      const antor = (await connecte(browser, srv.base, 'Antor')).page;
      const U = (await json(antor, 'POST', '/api/univers', { nom: `Echec ${Math.random()}` })).id;
      const f = (await json(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).id;
      await json(antor, 'POST', `/api/univers/${U}/fiches/${f}/sections`, { titre: 'Apparence', contenu: 'Grand, cape grise.' });
      await antor.goto(`/univers/${U}/fiche/${f}`);
      await antor.getByRole('heading', { level: 1 }).waitFor();
      await attendre(antor);
      await antor.getByRole('button', { name: rx('Demander à Kanevas') }).click();
      await antor.getByLabel(rx('Demander à Kanevas')).fill(demande);
      await antor.getByRole('button', { name: /^Envoyer$/ }).click();
      await antor.getByText("Je n'ai pas pu générer l'image.").first().waitFor();
      await attendre(antor);
      assert.equal(await antor.getByRole('alert').count(), 0, 'no error bubble');
      assert.equal(await antor.getByText(/Je n['’]ai pas pu répondre/).count(), 0);
      assert.equal(await antor.getByRole('button', { name: /Réessayer/ }).count(), 0);
      assert.equal(await antor.getByText(/Image attachée à la section/).count(), 0);
      await antor.reload();
      await attendre(antor);
      assert.equal(await antor.locator('main img[src*="pieces-jointes"]').count(), 0);
    });
  }
});
