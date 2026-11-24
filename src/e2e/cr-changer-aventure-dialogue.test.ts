// ecrans: fiche
// Black-box screen tests of kanevas-cr-aventure-ecran-dialogue (E-9 « Changer d'aventure… »), written from the task's
// exit criterion. The effect (PATCH {campagne}) is proved at its door in src/routes/compte-rendu-changer-aventure.test.ts;
// here only what the user sees. Real server in stub mode + real Chromium.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-cr-aventure-dialogue-shots';
mkdirSync(SHOTS, { recursive: true });
const ECHEC = /L[’']action n[’']a pas abouti\. Réessayez\./;
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let couronne = 0;
let cr = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}: ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
const shot = (p: Any, nom: string) => p.screenshot({ path: `${SHOTS}/${nom}.png` });
const ligne = (p: Any) => p.locator('.ligne-campagne');
async function ouvrir(p: Any, id: number, titre: string): Promise<void> {
  await p.goto(`/univers/${U}/fiche/${id}`);
  await p.getByRole('heading', { name: titre, level: 1 }).waitFor();
}
const bouton = (p: Any) => p.getByRole('button', { name: 'Changer d’aventure…' });

describe('kanevas-cr-aventure-ecran-dialogue, E-9 Changer d’aventure', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'GET', '/api/univers')).find((u: Any) => u.nom === "Lame d'Ébène").id;
    for (const f of (await api(antor, 'GET', `/api/univers/${U}/fiches?type=aventure`)).fiches ?? []) {
      await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f.id}`);
    }
    const mk = async (titre: string) =>
      (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'aventure', titre, sections: [{ titre: 'Présentation', joueursLisent: true }] })).id as number;
    couronne = await mk('La Couronne brisée');
    await mk('Les Landes noires');
    cr = (await api(antor, 'POST', `/api/univers/${U}/comptes-rendus`, { campagneId: couronne, titre: 'Séance 7', texte: 'Le sceau cède.' })).id;
    await antor.goto(`/univers/${U}`);
    await lea.goto(`/univers/${U}`);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor choisit « Les Landes noires » : la ligne Campagne le nomme sans recharger, l’aventure actuelle n’est pas choisissable', async () => {
    await ouvrir(antor, cr, 'Séance 7');
    assert.match(await ligne(antor).innerText(), /Campagne :\s*La Couronne brisée/);
    let navigations = 0;
    antor.on('framenavigated', () => navigations++);
    await bouton(antor).click();
    const d = antor.getByRole('dialog');
    const groupe = d.getByRole('radiogroup', { name: 'Nouvelle aventure' });
    await groupe.getByRole('radio', { name: /Landes noires/ }).waitFor();
    assert.equal(await groupe.getByRole('radio', { name: /Couronne brisée/ }).isDisabled(), true, 'actuelle non sélectionnable');
    assert.match(await groupe.innerText(), /\(aventure actuelle\)/);
    assert.equal(await d.getByLabel('Chercher une aventure').getAttribute('placeholder'), 'Titre ou alias');
    const actuelle = groupe.locator('.resultat.soi');
    assert.equal(await actuelle.locator('.resultat-puce').evaluate((e: Element) => getComputedStyle(e).visibility), 'visible', 'rond de radio grisé visible');
    assert.equal((await actuelle.innerText()).replace(/\s+/g, ' ').trim().endsWith('(aventure actuelle)'), true, 'seul libellé dans la colonne du type');
    assert.doesNotMatch(await actuelle.innerText(), /Campagne\s*\(/, 'pas de sous-type en plus');
    const cadre = await ligne(antor).evaluate((e: Element) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const bt = e.querySelector('button')!.getBoundingClientRect();
      return { bord: s.borderTopWidth, pad: `${s.paddingTop} ${s.paddingLeft}`, rayon: s.borderTopLeftRadius, droite: Math.round(r.right - bt.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth)) };
    });
    assert.deepEqual({ ...cadre, droite: Math.abs(cadre.droite) <= 1 }, { bord: '1px', pad: '10px 12px', rayon: '8px', droite: true }, 'ligne encadrée, bouton au bord droit');
    assert.equal(await d.getByRole('button', { name: 'Changer d’aventure', exact: true }).isDisabled(), true, 'rien choisi, rien à valider');
    await groupe.getByRole('radio', { name: /Landes noires/ }).check();
    await shot(antor, 'dialogue-choix');
    const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'PATCH' && r.status() === 200);
    await d.getByRole('button', { name: 'Changer d’aventure', exact: true }).click();
    await reponse;
    await d.waitFor({ state: 'detached' });
    await ligne(antor).getByText('Les Landes noires').waitFor();
    assert.match(await ligne(antor).innerText(), /Campagne :\s*Les Landes noires/);
    assert.equal(navigations, 0, 'la fiche n’est pas rechargée');
    antor.removeAllListeners('framenavigated');
    await shot(antor, 'apres-validation');
    const f = await api(antor, 'GET', `/api/univers/${U}/fiches/${cr}`);
    assert.equal(f.sections.length, 1, 'les sections restent');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${cr}`, { campagne: couronne });
  });

  test('la recherche n’envoie q qu’une fois saisie, et le dialogue ne liste que ce que le serveur rend', async () => {
    await ouvrir(antor, cr, 'Séance 7');
    const urls: string[] = [];
    antor.on('request', (r: Any) => /\/fiches\?type=aventure/.test(r.url()) && urls.push(r.url()));
    await bouton(antor).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('radio', { name: /Landes noires/ }).waitFor();
    assert.ok(urls.length >= 1 && urls.every((u) => !/[?&]q=/.test(u)), `pas de q vide : ${urls}`);
    const avecQ = antor.waitForRequest((r: Any) => /[?&]q=Landes/.test(r.url()));
    await d.getByLabel('Chercher une aventure').fill('Landes');
    await avecQ;
    await d.getByRole('radio', { name: /Landes noires/ }).waitFor();
    await d.getByRole('radio', { name: /Couronne brisée/ }).waitFor({ state: 'detached' });
    await d.getByLabel('Chercher une aventure').fill('zzzzinconnu');
    await d.getByText('Aucune aventure ne correspond.').waitFor();
    antor.removeAllListeners('request');
    await d.getByRole('button', { name: 'Annuler' }).click();
    await d.waitFor({ state: 'detached' });
    assert.match(await ligne(antor).innerText(), /La Couronne brisée/, 'annuler ne change rien');
  });

  test('plus de 100 aventures : 100 d’abord, « Charger la suite » ajoute le reste', async () => {
    for (let i = 0; i < 102; i++) await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'aventure', titre: `Aventure en masse ${String(i).padStart(3, '0')}` });
    await ouvrir(antor, cr, 'Séance 7');
    await bouton(antor).click();
    const d = antor.getByRole('dialog');
    const radios = d.getByRole('radiogroup').getByRole('radio');
    await d.getByRole('button', { name: 'Charger la suite' }).waitFor();
    assert.equal(await radios.count(), 100);
    await d.getByRole('button', { name: 'Charger la suite' }).click();
    await d.getByRole('button', { name: 'Charger la suite' }).waitFor({ state: 'detached' });
    assert.equal(await radios.count(), 104, '2 (Couronne, Landes) + 102');
    await shot(antor, 'suite-chargee');
    await d.getByRole('button', { name: 'Annuler' }).click();
    for (const f of (await api(antor, 'GET', `/api/univers/${U}/fiches?type=aventure&q=masse`)).fiches ?? []) {
      await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f.id}`);
    }
  });

  test('requête en échec : « L’action n’a pas abouti. Réessayez. », la ligne reste inchangée', async () => {
    await ouvrir(antor, cr, 'Séance 7');
    await bouton(antor).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('radio', { name: /Landes noires/ }).check();
    await antor.route('**/api/univers/*/fiches/*', (route: Any) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }) : route.continue());
    await d.getByRole('button', { name: 'Changer d’aventure', exact: true }).click();
    await d.getByText(ECHEC).waitFor();
    await shot(antor, 'echec');
    await antor.unroute('**/api/univers/*/fiches/*');
    await d.getByRole('button', { name: 'Annuler' }).click();
    assert.match(await ligne(antor).innerText(), /Campagne :\s*La Couronne brisée/);
    assert.doesNotMatch(await ligne(antor).innerText(), /Landes/);
  });

  test('un MJ en mode joueur et un joueur ne voient pas le bouton', async () => {
    await ouvrir(antor, cr, 'Séance 7');
    await bouton(antor).waitFor();
    await antor.getByRole('radio', { name: /Mode Joueur/ }).click();
    await antor.waitForFunction(() => !document.body.innerText.includes('Changer d’aventure…'));
    await ligne(antor).getByText('La Couronne brisée').waitFor();
    await antor.waitForFunction(() => !([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Changer d’aventure…'))));
    assert.equal(await bouton(antor).count(), 0);
    await antor.getByRole('radio', { name: /Mode MJ/ }).click();
    await bouton(antor).waitFor();
    await ouvrir(lea, cr, 'Séance 7');
    await ligne(lea).getByText('La Couronne brisée').waitFor();
    assert.equal(await bouton(lea).count(), 0);
  });

  test('aventure supprimée : le bouton est sur « Aventure supprimée » et le choix rattache le compte rendu', async () => {
    const orpheline = await mkCr();
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${orpheline.camp}`);
    await ouvrir(antor, orpheline.cr, 'Séance orpheline');
    await ligne(antor).getByText('Aventure supprimée').waitFor();
    await shot(antor, 'supprimee');
    await bouton(antor).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('radio', { name: /Landes noires/ }).check();
    await d.getByRole('button', { name: 'Changer d’aventure', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    await ligne(antor).getByText('Les Landes noires').waitFor();
    assert.doesNotMatch(await ligne(antor).innerText(), /supprimée/);
  });
});

async function mkCr(): Promise<{ camp: number; cr: number }> {
  const camp = (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'aventure', titre: 'Éphémère' })).id as number;
  const cr = (await api(antor, 'POST', `/api/univers/${U}/comptes-rendus`, { campagneId: camp, titre: 'Séance orpheline', texte: 'x' })).id as number;
  return { camp, cr };
}
