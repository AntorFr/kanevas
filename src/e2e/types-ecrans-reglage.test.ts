// Browser tests of kanevas-types-ecrans-reglage, from its exit criterion: the E-15 « Types de fiche » tab
// and the E-14 « Types de fiche » panel (AD-120). Real server in stub mode WITH the starting world, real Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Server;
let browser: Any;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json().catch(() => null);
}
const barre = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });
const lienBarre = (page: Any, nom: string) => barre(page).getByRole('link', { name: rxExact(nom) });
const capture = (page: Any, nom: string) => page.screenshot({ path: `${CAPTURES}/types-reglage-${nom}.png`, fullPage: true });
const ligne = (page: Any, singulier: string) => page.locator(`li[data-type]`).filter({ has: page.locator('.type-nom', { hasText: rx(singulier) }) });

describe('kanevas-types-ecrans-reglage, au navigateur', { skip: skipBrowser }, () => {
  let antor: Any;
  let lea: Any;
  let mira: Any;
  let lame = 0;
  let landes = 0;
  let cof = 0;
  let nLieux = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    mira = (await connecte(browser, srv.base, 'Mira')).page;
    lame = ((await api(antor, 'GET', '/api/univers')) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
    landes = ((await api(mira, 'GET', '/api/univers')) as { id: number; nom: string }[]).find((u) => u.nom === 'Les Landes grises')!.id;
    cof = ((await api(antor, 'GET', '/api/systemes')) as { id: number; nom: string }[]).find((s) => s.nom === 'CoF Mini')!.id;
    const types = (await api(antor, 'GET', `/api/univers/${lame}/types`)) as { type: string; nbFiches?: number }[];
    nLieux = types.find((t) => t.type === 'lieu')!.nbFiches!;
    assert.ok(nLieux > 1);
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('E-15 : Antor désactive Vaisseau et Note, toast « Vaisseau désactivé pour CoF Mini. », Mira ne les a plus dans sa barre', async () => {
    await antor.goto(`/systemes/${cof}`);
    await attendre(antor);
    await antor.getByRole('tab', { name: rxExact('Types de fiche') }).click();
    await attendre(antor);
    const vaisseau = antor.getByRole('switch', { name: rx('Vaisseau') });
    await vaisseau.waitFor();
    assert.equal(await vaisseau.getAttribute('aria-checked'), 'true');
    await vaisseau.click();
    await antor.getByText('Vaisseau désactivé pour CoF Mini.').waitFor();
    await antor.getByRole('switch', { name: rx('Note') }).click();
    await antor.getByText('Note désactivé pour CoF Mini.').waitFor();
    assert.equal(await antor.getByRole('switch', { name: rx('Vaisseau') }).getAttribute('aria-checked'), 'false');
    assert.match(await antor.locator('body').innerText(), /Utilisé par 2 univers\./);
    await capture(antor, 'e15-mj');
    await mira.goto(`/univers/${landes}`);
    await attendre(mira);
    await lienBarre(mira, 'Lieux').waitFor();
    assert.equal(await lienBarre(mira, 'Vaisseaux').count(), 0);
    assert.equal(await lienBarre(mira, 'Notes').count(), 0);
  });

  test('E-15 : le réglage persiste au rechargement', async () => {
    await antor.goto(`/systemes/${cof}`);
    await attendre(antor);
    await antor.getByRole('tab', { name: rxExact('Types de fiche') }).click();
    const v = antor.getByRole('switch', { name: rx('Vaisseau') });
    await v.waitFor();
    assert.equal(await v.getAttribute('aria-checked'), 'false');
  });

  test('E-14 : forcer Vaisseau à « Activé » : « Le système le désactive. », « Vaisseaux » dans la barre, pas « Notes »', async () => {
    await antor.goto(`/univers/${lame}/parametres`);
    await attendre(antor);
    const l = ligne(antor, 'Vaisseau');
    await l.waitFor();
    await l.getByRole('radio', { name: rxExact('Activé') }).click();
    await antor.getByText("Vaisseau : activé dans Lame d'Ébène.").waitFor();
    await l.getByText('Le système le désactive.').waitFor();
    assert.equal(await l.getByRole('radio', { name: rxExact('Activé') }).getAttribute('aria-checked'), 'true');
    await capture(antor, 'e14-force');
    await antor.goto(`/univers/${lame}`);
    await attendre(antor);
    await lienBarre(antor, 'Vaisseaux').waitFor();
    assert.equal(await lienBarre(antor, 'Notes').count(), 0);
  });

  test('E-14 : désactiver Lieu demande confirmation avec N lieux ; Annuler ne change rien ; Désactiver retire « Lieux » mais un lien ouvre la fiche', async () => {
    await antor.goto(`/univers/${lame}/parametres`);
    await attendre(antor);
    const l = ligne(antor, 'Lieu');
    await l.waitFor();
    await l.getByRole('radio', { name: rxExact('Désactivé') }).click();
    const d = antor.getByRole('alertdialog');
    await d.waitFor();
    const t = await d.innerText();
    assert.ok(t.includes("Désactiver « Lieu » dans Lame d'Ébène ?"), t);
    assert.ok(t.includes(`Les ${nLieux} lieux restent ; on les atteint par un lien, la recherche ou l’arbre.`), t);
    await capture(antor, 'e14-confirmer');
    await d.getByRole('button', { name: rxExact('Annuler') }).click();
    await d.waitFor({ state: 'detached' });
    assert.equal(await l.getByRole('radio', { name: rxExact('Désactivé') }).getAttribute('aria-checked'), 'false');
    const apres = (await api(antor, 'GET', `/api/univers/${lame}/types`)) as { type: string; active: boolean }[];
    assert.equal(apres.find((x) => x.type === 'lieu')!.active, true);
    await l.getByRole('radio', { name: rxExact('Désactivé') }).click();
    await antor.getByRole('alertdialog').getByRole('button', { name: rxExact('Désactiver') }).click();
    await antor.getByText("Lieu : désactivé dans Lame d'Ébène.").waitFor();
    await antor.goto(`/univers/${lame}`);
    await attendre(antor);
    await lienBarre(antor, 'Cartes').waitFor();
    assert.equal(await lienBarre(antor, 'Lieux').count(), 0);
    // A link to a place still opens its sheet (the type is off, the sheets stay).
    const liste = (await api(antor, 'GET', `/api/univers/${lame}/fiches?type=lieu`)) as Any;
    const premier = Array.isArray(liste) ? liste[0] : liste.fiches[0];
    assert.ok(premier, 'aucun lieu lu');
    await antor.goto(`/univers/${lame}/fiche/${premier.id}`);
    await attendre(antor);
    const corps = await antor.locator('body').innerText();
    assert.doesNotMatch(corps, /Page introuvable/);
    assert.ok(corps.includes(premier.titre ?? premier.nom), corps);
    await capture(antor, 'lieu-desactive-lien');
  });

  test('E-14 : le système réactive Note ; « Notes » dans la barre de Lame d’Ébène au rechargement', async () => {
    await api(antor, 'PUT', `/api/systemes/${cof}/types/note`, { active: true });
    await antor.goto(`/univers/${lame}`);
    await attendre(antor);
    await lienBarre(antor, 'Notes').waitFor();
  });

  test('E-14 : repasser à « Système » donne le toast « suit le système » ; E-14 montre le nombre de fiches', async () => {
    await antor.goto(`/univers/${lame}/parametres`);
    await attendre(antor);
    const l = ligne(antor, 'Vaisseau');
    await l.getByRole('radio', { name: rx('Système') }).click();
    await antor.getByText('Vaisseau : suit le système.').waitFor();
    assert.match(await ligne(antor, 'Lieu').innerText(), new RegExp(`${nLieux} fiches`));
  });

  test('E-14 : univers sans système « Par défaut · activé », sans note de contradiction', async () => {
    const r = await api(antor, 'POST', '/api/univers', { nom: 'Sans système' });
    await antor.goto(`/univers/${r.id}/parametres`);
    await attendre(antor);
    const l = ligne(antor, 'Vaisseau');
    await l.waitFor();
    assert.match(await l.innerText(), /Par défaut · activé/);
    assert.match(await l.innerText(), /Aucune fiche/);
    await capture(antor, 'e14-sans-systeme');
  });

  test('Léa : E-14 « Page introuvable. » ; E-15 « Lecture seule », interrupteurs désactivés', async () => {
    await lea.goto(`/univers/${lame}/parametres`);
    await attendre(lea);
    assert.match(await lea.locator('body').innerText(), /Page introuvable\./);
    await capture(lea, 'e14-joueur');
    await lea.goto(`/systemes/${cof}`);
    await attendre(lea);
    await lea.getByRole('tab', { name: rxExact('Types de fiche') }).click();
    await lea.getByRole('switch').first().waitFor();
    assert.match(await lea.locator('body').innerText(), /Lecture seule/);
    for (const s of (await lea.getByRole('switch').all()) as Any[]) {
      assert.ok((await s.isDisabled()) || (await s.getAttribute('aria-disabled')) === 'true');
    }
    await capture(lea, 'e15-joueur');
  });

  test('refus serveur : E-15 remet l’interrupteur ; E-14 remet la bascule ; « L’action n’a pas abouti. Réessayez. »', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.route('**/api/systemes/*/types/*', (r: Any) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue()));
    await page.route('**/api/univers/*/types/*', (r: Any) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue()));
    await page.goto(`/systemes/${cof}`);
    await attendre(page);
    await page.getByRole('tab', { name: rxExact('Types de fiche') }).click();
    const s = page.getByRole('switch', { name: rx('Vaisseau') });
    await s.waitFor();
    const avant = await s.getAttribute('aria-checked');
    await s.click();
    await page.getByText('L’action n’a pas abouti. Réessayez.').waitFor();
    assert.equal(await s.getAttribute('aria-checked'), avant);
    await capture(page, 'e15-echec');
    await page.goto(`/univers/${lame}/parametres`);
    await attendre(page);
    const l = ligne(page, 'Vaisseau');
    await l.waitFor();
    const choix = l.getByRole('radio', { name: rxExact('Désactivé') });
    await choix.click();
    await page.getByText('L’action n’a pas abouti. Réessayez.').waitFor();
    assert.equal(await choix.getAttribute('aria-checked'), 'false');
    await capture(page, 'e14-echec');
  });
});
