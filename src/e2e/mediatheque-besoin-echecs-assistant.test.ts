// Feature-level check of kanevas-import-mediatheque, written from the need only (docs/parcours.md B-25, B-53, B-54,
// docs/ecrans.md E-19 « Assistant-added file » and its state table), not from the code. Real server in stub mode,
// real Chromium. It completes what the other mediatheque-* files leave unchecked: the assistant's image seen from E-19,
// and the error states of E-19 (interrupted upload, failed change or deletion, role removed while viewing).
//
// TEST PLAN (literal expectations)
//   B-25 / AD-44   : a portrait asked for « Apparence » (read by players) enters E-19 « Visible des joueurs », « ajouté par antor »,
//                    and Léa's library lists it; asked for « Vérité — MJ seul » it enters « Réservé au MJ » and Léa's library does not
//   E-19 erreur    : interrupted upload -> « L'envoi n'a pas abouti. » with « Réessayer » and « Abandonner »; Abandonner adds nothing;
//                    Réessayer, the network back, adds the file once
//   E-19 erreur    : failed rename / failed deletion -> « L'action n'a pas abouti. Réessayez. », the file is unchanged on the server
//   E-19 refus     : a MJ demoted while the panel is open who renames -> « Vous ne pouvez plus modifier ce fichier. », name unchanged
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;

const PNG = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
});

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

async function json(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
const liste = async (page: Any, U: number): Promise<Any[]> => (await json(page, 'GET', `/api/univers/${U}/fichiers`)).fichiers;
async function ouvrir(page: Any, U: number): Promise<void> {
  await page.goto(`/univers/${U}/mediatheque`);
  await page.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(page);
}
const tuile = (p: Any, nom: string) => p.locator('.med-tuile').filter({ has: p.locator(`[title="${nom}"]`) });

test('B-25 · le portrait demandé à l’assistant entre dans E-19 selon la section : visible pour « Apparence », réservé pour « Vérité — MJ seul »', opts, async () => {
  // Fails if a generated image skips the library, ignores where it is added, or leaks a GM-section image to Léa.
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const lea = (await connecte(browser, srv.base, 'Léa')).page;
  const U = (await json(antor, 'POST', '/api/univers', { nom: 'Assistant mediatheque' })).id;
  await json(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const f = (await json(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).id;
  const base = `/api/univers/${U}/fiches/${f}/sections`;
  const app = (await json(antor, 'POST', base, { titre: 'Apparence', contenu: 'Grand.' })).id;
  await json(antor, 'PATCH', `${base}/${app}`, { joueursLisent: true });
  await json(antor, 'POST', base, { titre: 'Vérité — MJ seul', contenu: 'Il trahit.' });
  assert.equal((await liste(antor, U)).length, 0);

  await antor.goto(`/univers/${U}/fiche/${f}`);
  await attendre(antor);
  await antor.getByRole('button', { name: /Demander à Kanevas/ }).click();
  const champ = antor.getByLabel(/Demander à Kanevas/);
  await champ.waitFor();
  for (const section of ['Apparence', 'Vérité — MJ seul']) {
    await champ.fill(`Fais un portrait pour « ${section} » d'« Maître Aldric »`);
    await antor.getByRole('button', { name: /^Envoyer$/ }).click();
    await antor.getByText(`Image attachée à la section « ${section} » de « Maître Aldric »`, { exact: true }).waitFor();
  }

  const fichiers = await liste(antor, U);
  assert.equal(fichiers.length, 2);
  const visibles = fichiers.filter((x: Any) => x.visibilite === 'joueurs');
  const reserves = fichiers.filter((x: Any) => x.visibilite === 'mj');
  assert.equal(visibles.length, 1, JSON.stringify(fichiers));
  assert.equal(reserves.length, 1, JSON.stringify(fichiers));

  await ouvrir(antor, U);
  assert.match(await antor.locator('main').innerText(), /2 fichiers/);
  assert.match(await tuile(antor, reserves[0].nom).innerText(), /MJ seul/);
  assert.doesNotMatch(await tuile(antor, visibles[0].nom).innerText(), /MJ seul/);
  await tuile(antor, visibles[0].nom).click();
  await antor.getByText(/ajouté par antor/).waitFor();
  assert.match(await antor.getByText(/Utilisé dans/).first().locator('xpath=..').innerText(), /Maître Aldric/);
  await antor.screenshot({ path: '/tmp/scr-med-assistant.png' });

  await ouvrir(lea, U);
  assert.match(await lea.locator('main').innerText(), /1 fichier\b/);
  assert.equal(await tuile(lea, visibles[0].nom).count(), 1);
  assert.equal(await tuile(lea, reserves[0].nom).count(), 0);
});

async function mondeSimple(nom: string): Promise<{ U: number; antor: Any }> {
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const U = (await json(antor, 'POST', '/api/univers', { nom })).id;
  await json(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const r = await antor.request.post(`/api/univers/${U}/fichiers`, { multipart: { fichier: PNG('carte.png') } });
  assert.equal(r.status(), 201);
  return { U, antor };
}

test('E-19 erreur · un envoi coupé dit « L’envoi n’a pas abouti. » avec Réessayer et Abandonner ; Abandonner n’ajoute rien, Réessayer ajoute une fois', opts, async () => {
  // Fails if an interrupted upload leaves a file, loses the retry, or retries twice.
  const { U, antor } = await mondeSimple('E19 envoi coupe');
  await ouvrir(antor, U);
  let coupe = true;
  await antor.route('**/api/univers/*/fichiers', async (route: Any) => {
    if (route.request().method() === 'POST' && coupe) return route.abort('failed');
    return route.continue();
  });
  await antor.locator('input[type=file]').first().setInputFiles(PNG('neuf.png'));
  await antor.getByText(/L.envoi n.a pas abouti\./).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr-med-envoi-coupe.png' });
  assert.equal((await liste(antor, U)).length, 1, 'rien d’ajouté');
  await antor.getByRole('button', { name: 'Abandonner' }).waitFor();
  await antor.getByRole('button', { name: 'Réessayer' }).waitFor();
  await antor.getByRole('button', { name: 'Abandonner' }).click();
  assert.equal(await antor.getByText(/L.envoi n.a pas abouti\./).count(), 0);
  assert.equal((await liste(antor, U)).length, 1, 'abandonné : rien d’ajouté');

  await antor.locator('input[type=file]').first().setInputFiles(PNG('neuf.png'));
  await antor.getByRole('button', { name: 'Réessayer' }).waitFor();
  coupe = false;
  await antor.getByRole('button', { name: 'Réessayer' }).click();
  await tuile(antor, 'neuf.png').waitFor();
  const noms = (await liste(antor, U)).map((x: Any) => x.nom).sort();
  assert.deepEqual(noms, ['carte.png', 'neuf.png']);
});

test('E-19 erreur · un renommage puis une suppression qui échouent disent « L’action n’a pas abouti. Réessayez. » et ne changent rien', opts, async () => {
  // Fails if a failed change is shown as done, or silently applied/dropped.
  const { U, antor } = await mondeSimple('E19 action echoue');
  await ouvrir(antor, U);
  await tuile(antor, 'carte.png').click();
  await antor.locator('.med-panneau').waitFor();
  await antor.route('**/api/univers/*/fichiers/*', async (route: Any) => {
    const m = route.request().method();
    if (m === 'PATCH' || m === 'DELETE') return route.abort('failed');
    return route.continue();
  });
  const champ = antor.getByRole('textbox', { name: /Nom/ }).first();
  await champ.fill('Autre nom');
  await champ.blur();
  await antor.getByText('L’action n’a pas abouti. Réessayez.').or(antor.getByText("L'action n'a pas abouti. Réessayez.")).first().waitFor();
  assert.equal((await liste(antor, U))[0].nom, 'carte.png');

  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last().getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByText('L’action n’a pas abouti. Réessayez.').or(antor.getByText("L'action n'a pas abouti. Réessayez.")).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr-med-action-echoue.png' });
  assert.equal((await liste(antor, U)).length, 1, 'le fichier est toujours là');
});

test('E-19 refus · un MJ rétrogradé panneau ouvert qui renomme lit « Vous ne pouvez plus modifier ce fichier. » ; le nom ne change pas', opts, async () => {
  // Fails if a demoted account can still write, or is refused without the words of the table.
  const { U, antor } = await mondeSimple('E19 role retire');
  const mira = (await connecte(browser, srv.base, 'Mira')).page;
  await json(antor, 'POST', `/api/univers/${U}/membres`, { username: 'mira', role: 'mj' });
  await ouvrir(mira, U);
  await tuile(mira, 'carte.png').click();
  await mira.locator('.med-panneau').waitFor();
  const membres = await json(antor, 'GET', `/api/univers/${U}/membres`);
  const l = Array.isArray(membres) ? membres : membres.membres;
  const m = l.find((x: Any) => /mira/i.test(JSON.stringify(x)));
  await json(antor, 'PATCH', `/api/univers/${U}/membres/${m.compteId ?? m.id}`, { role: 'joueur' });
  const champ = mira.getByRole('textbox', { name: /Nom/ }).first();
  await champ.fill('Pirate');
  await champ.blur();
  await mira.getByText(/Vous ne pouvez plus modifier ce fichier\./).first().waitFor();
  await mira.screenshot({ path: '/tmp/scr-med-role-retire.png' });
  assert.equal((await liste(antor, U))[0].nom, 'carte.png');
  assert.doesNotMatch(await texte(mira), /Erreur : le nom/);
});
