// Tests d'ensemble de kanevas-fiches-liees-natures : le semis du bouchon lu à l'écran (fiche de la feature, « Livre »).
// Aldric, Ombeline et Bran sont déjà vus dans natures-ensemble-besoin ; ici Suie, le Prieur masqué, et ce que Léa n'en lit pas.
// Attendus littéraux tirés du besoin : « Suie se situe aux Docks », « le Prieur se situe à Port-Sel (se cache, depuis
// « Secret — MJ seul »)». Vrai serveur en mode bouchon avec son monde de départ, vrai Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, section, skipBrowser, startServer, type Server } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
const U = 1;
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
const ids: Record<string, number> = {};
const norm = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ').trim();

async function ouvrir(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
}

describe('kanevas-fiches-liees-natures, le semis du bouchon à l’écran', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=personnage`)).json();
    for (const f of r.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Panne visée : le semis ne pose plus la relation de Suie, ou y ajoute un qualificatif / un tiret vide.
  test('Suie : « se situe à · Les Docks », sans qualificatif ni tiret', opts, async () => {
    await ouvrir(antor, 'Suie');
    const g = section(antor, 'Apparence').getByRole('group', { name: 'Relations' });
    await antor.waitForFunction((attendu: string) => [...document.querySelectorAll('[role=group][aria-label=Relations]')].some((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').includes(attendu)), 'se situe à · Les Docks');
    const t = norm(await g.innerText());
    assert.ok(t.includes('se situe à · Les Docks'), t);
    assert.ok(!t.includes('Les Docks —'), t);
  });

  // Panne visée : le semis perd la relation « se cache » du Prieur ou la pose sur une autre section.
  test('Le Prieur masqué, section « Secret — MJ seul » : « se situe à · Port-Sel — se cache » pour Antor', opts, async () => {
    await ouvrir(antor, 'Le Prieur masqué');
    const g = section(antor, 'Secret — MJ seul').getByRole('group', { name: 'Relations' });
    await antor.waitForFunction((attendu: string) => [...document.querySelectorAll('[role=group][aria-label=Relations]')].some((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').includes(attendu)), 'se situe à · Port-Sel — se cache');
    const t = norm(await g.innerText());
    assert.ok(t.includes('se situe à · Port-Sel — se cache'), t);
  });

  // Exclusion : Léa ne lit pas la fiche ni sa relation.
  test('Léa ne lit pas « se cache » : la fiche du Prieur lui est inconnue', opts, async () => {
    const r = await lea.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Le Prieur masqué']}`);
    assert.equal(r.status(), 404);
    assert.ok(!(await r.text()).includes('se cache'));
  });
});
