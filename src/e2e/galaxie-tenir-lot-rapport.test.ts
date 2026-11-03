// Black-box test of kanevas-outils-galaxie-tenir, import of a galaxy by the API, seen on screen: the batch report
// (E-18, « Accès API ») counts the elements created by nature after the first push (4 systems, 1 zone, 3 routes, no refusal) and
// as unchanged after the replay, and a route between two systems absent from the batch is counted refused. The literal
// « 0 refusé, n créés » of the docs is not on this screen (see the report's « Trous »): the counts are what is checked. Written from the sheet's exit criterion and
// docs/ecrans.md (« API import »), not from the code. Real server in stub mode with its starting world.
// Screenshots go to /tmp/cap-galaxie-tenir-lot (proofs of the moment, not committed).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const SHOTS = '/tmp/cap-galaxie-tenir-lot';
mkdirSync(SHOTS, { recursive: true });
const opts = { skip: skipBrowser, timeout: 300000 };
const servers: { stop: () => void }[] = [];
let browser: Any;

before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const s of servers) s.stop();
});

const FICHIER = {
  systemes: [
    { cle: 'port-sel', nom: 'Port-Sel', q: 0, r: 0, taille: 3 },
    { cle: 'vael', nom: 'Vael', q: 7, r: 0, taille: 2 },
    { cle: 'hesper', nom: 'Hesper', q: 1, r: 5 },
    { cle: 'station-fantome', nom: 'Station fantôme', q: -4, r: 2, secret: true },
  ],
  zones: [{ cle: 'marches', nom: 'Marches interdites', contour: [[-12, 2], [-4, 2], [-4, 8], [-12, 8]], secret: true }],
  routes: [
    { depuis: 'port-sel', vers: 'vael' },
    { depuis: 'vael', vers: 'hesper' },
    { depuis: 'port-sel', vers: 'hesper', publique: false },
  ],
};

async function preparer(): Promise<{ page: Any; E: number; bord: number; valeur: string; base: string }> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const { page } = await connecte(browser, srv.base, 'Antor');
  const us = (await (await page.request.get('/api/univers')).json()) as Any[];
  const E = us.find((u) => u.nom === "Éneria d'essai").id as number;
  const bord = ((await (await page.request.post(`/api/univers/${E}/outils/swn/galaxie/cartes`, { data: { titre: 'Galaxie du bord' } })).json()) as Any).id as number;
  const j = await page.request.post(`/api/univers/${E}/jetons`, { data: { nom: 'Script galaxie', dureeJours: 30, outils: ['swn/galaxie'] } });
  assert.equal(j.status(), 201);
  const valeur = ((await j.json()) as Any).valeur as string;
  return { page, E, bord, valeur, base: srv.base };
}
async function pousser(page: Any, E: number, bord: number, valeur: string, lotId: number, corps: unknown): Promise<Any> {
  const r = await page.request.put(`/api/import/v1/univers/${E}/outils/swn/galaxie/galaxies/${bord}?lot=${lotId}`, {
    headers: { authorization: `Bearer ${valeur}`, 'content-type': 'application/json' },
    data: corps,
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function ouvrirLot(page: Any, E: number, valeur: string): Promise<number> {
  const r = await page.request.post(`/api/import/v1/univers/${E}/lots?outil=swn/galaxie`, { headers: { authorization: `Bearer ${valeur}` } });
  assert.equal(r.status(), 201);
  return ((await r.json()) as Any).lotId as number;
}

// Panne visée : le rapport de lot de la galaxie n'arrive plus à l'écran des lots, ou perd « refusé » / « créés ».
test('B-65 / E-18 : le lot de la galaxie pousse 8 éléments dans « Galaxie du bord » : 4 systèmes, 3 routes, 1 territoire créés sans refus ; le rejeu : tout inchangé', opts, async () => {
  const { page, E, bord, valeur } = await preparer();
  const lot1 = await ouvrirLot(page, E, valeur);
  await pousser(page, E, bord, valeur, lot1, FICHIER);
  await page.goto(`/univers/${E}/acces-api`);
  await page.getByText(/systèmes : 4 créés/).first().waitFor();
  const t1 = (await page.locator('main').innerText()) as string;
  assert.match(t1, /territoires : 1 créé/);
  assert.match(t1, /routes : 3 créés/);
  assert.doesNotMatch(t1, /refusé/);
  await page.screenshot({ path: `${SHOTS}/lot-1.png`, fullPage: true });
  await pousser(page, E, bord, valeur, lot1, FICHIER); // rejeu dans le même lot (un lot ouvert est repris)
  await page.reload();
  await page.getByText(/systèmes : .*4 inchangés/).first().waitFor();
  const t2 = (await page.locator('main').innerText()) as string;
  assert.match(t2, /territoires : .*1 inchangé/);
  assert.match(t2, /routes : .*3 inchangés/);
  await page.screenshot({ path: `${SHOTS}/lot-2.png`, fullPage: true });
});

// Panne visée : une route vers des systèmes absents du lot n'est plus refusée avec son champ, ou fait tomber le reste du lot.
test('B-65 échec / E-18 : une route entre deux systèmes absents du lot est comptée refusée à l’écran, les 2 systèmes et la route valide sont créés', opts, async () => {
  const { page, E, bord, valeur } = await preparer();
  const lot = await ouvrirLot(page, E, valeur);
  const rep = await pousser(page, E, bord, valeur, lot, {
    systemes: [{ cle: 'vael', nom: 'Vael', q: 7, r: 0 }, { cle: 'hesper', nom: 'Hesper', q: 1, r: 5 }],
    routes: [{ depuis: 'vael', vers: 'hesper' }, { depuis: 'nulle-part', vers: 'ailleurs' }],
  });
  assert.equal(rep.natures.routes.refusees, 1);
  assert.equal(rep.natures.routes.creees, 1);
  assert.equal(rep.natures.systemes.creees, 2);
  await page.goto(`/univers/${E}/acces-api`);
  await page.getByText(/routes : 1 créé, 1 refusé/).first().waitFor();
  assert.match((await page.locator('main').innerText()) as string, /systèmes : 2 créés/);
  await page.screenshot({ path: `${SHOTS}/lot-refus.png`, fullPage: true });
});
