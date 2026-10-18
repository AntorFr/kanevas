// Feature-level check of kanevas-import-mediatheque, written from the sheet of the feature and from
// docs/parcours.md P-16 « Échec » (an interrupted upload: « L'envoi n'a pas abouti. », nothing added,
// nothing joined), not from the code. Real server in stub mode on the seed, real Chromium.
//
// TEST PLAN (literal expectations)
//   P-16 échec / B-53 : Antor drops a file on E-19, the request is cut -> « l'envoi n'a pas abouti. », library total unchanged
//   P-16 échec / B-55 : Antor joins a file to « Description » of « Port-Sel », the request is cut ->
//                       « l'envoi n'a pas abouti. », nothing joined, library total unchanged
//   B-55 reprise      : the network back, the same gesture adds and joins the file (it was not half-recorded)
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let portSel = 0;
const PDF = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
const MESSAGE = /l.envoi n.a pas abouti\./i;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const r = await (await antor.request.get(`/api/univers/${uid}/fiches?type=lieu`)).json();
  portSel = (Array.isArray(r) ? r : r.fiches).find((f: Any) => f.titre === 'Port-Sel').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const total = async (): Promise<number> => (await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json()).fichiers.length;
const nomsDeLaMediatheque = async (): Promise<string[]> =>
  (await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json()).fichiers.map((f: Any) => f.nom);
const coupe = (p: Any) => p.route('**/api/univers/*/fichiers', (r: Any) => (r.request().method() === 'POST' ? r.abort() : r.continue()));

test('un envoi coupé depuis la médiathèque dit « l’envoi n’a pas abouti. » et n’ajoute aucun fichier', opts, async () => {
  const avant = await total();
  await antor.goto(`/univers/${uid}/mediatheque`);
  await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(antor);
  await coupe(antor);
  await antor.locator('input[type=file]').first().setInputFiles(PDF('coupe-e19.pdf'));
  await antor.getByText(MESSAGE).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/coupe-e19.png' });
  await antor.unroute('**/api/univers/*/fichiers');
  assert.equal(await total(), avant);
  assert.ok(!(await nomsDeLaMediatheque()).includes('coupe-e19.pdf'));
});

test('un envoi coupé par « Joindre un fichier » ne joint rien et n’ajoute rien à la médiathèque', opts, async () => {
  const avant = await total();
  await antor.goto(`/univers/${uid}/fiche/${portSel}`);
  await attendre(antor);
  const description = antor.getByRole('region', { name: /Description/ });
  await coupe(antor);
  await description.locator('input[type=file]').first().setInputFiles(PDF('coupe-joint.pdf'));
  await antor.getByText(MESSAGE).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/coupe-joint.png' });
  await antor.unroute('**/api/univers/*/fichiers');
  assert.equal(await total(), avant);
  assert.ok(!(await nomsDeLaMediatheque()).includes('coupe-joint.pdf'));
  await antor.reload();
  await attendre(antor);
  assert.equal(await antor.getByText('coupe-joint.pdf').count(), 0);
});

test('le réseau revenu, le même geste ajoute et joint le fichier', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${portSel}`);
  await attendre(antor);
  const description = antor.getByRole('region', { name: /Description/ });
  await description.locator('input[type=file]').first().setInputFiles(PDF('coupe-joint.pdf'));
  await description.getByText('coupe-joint.pdf').first().waitFor();
  // The row shows the name while the POST is still running: wait for the stored file.
  const fin = Date.now() + 15000;
  let noms = await nomsDeLaMediatheque();
  while (!noms.includes('coupe-joint.pdf') && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 200));
    noms = await nomsDeLaMediatheque();
  }
  assert.ok(noms.includes('coupe-joint.pdf'));
});
