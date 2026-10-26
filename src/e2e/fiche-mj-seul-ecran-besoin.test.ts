// Black-box tests of kanevas-fiche-mj-seul-ecran (B-57), written from the task's exit criterion:
// the « MJ seul » badge on the E-8 card, the tree row, the E-9 header, the « Relier » card and the
// E-17 result, and the « Visibilité » filter of the E-8 grid. Real server in stub mode + real Chromium.
// Expected values are literals from the criterion; the stub seed ("Lame d'Ébène") is the world.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, regler, section, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-fiche-mj-seul-shots';
const PHRASE = "Aucune section n'est visible des joueurs.";
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function creer(titre: string, ouverte: boolean | null): Promise<void> {
  const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre });
  ids[titre] = f.id;
  if (ouverte === null) return;
  const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${f.id}/sections`, { titre: 'Description', contenu: 'Texte B57.' });
  if (ouverte) await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
}
const carte = (page: Any, titre: string) => page.locator('a.carte').filter({ hasText: titre });
const pastilles = (loc: Any) => loc.getByText('MJ seul', { exact: true });
async function titresCartes(page: Any): Promise<string[]> {
  return (await page.locator('a.carte .titre, a.carte h2, a.carte h3').allInnerTexts()).map((s: string) => s.trim());
}
async function versLieux(page: Any, query = '', vue: 'grille' | 'arbre' | 'memorisee' = 'grille'): Promise<void> {
  await page.goto(`/univers/${U}/fiches/lieux${query}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.locator('a.carte, [role=tree]').first().waitFor();
  if (vue === 'memorisee') return;
  const bouton = page.getByRole('button', { name: vue === 'grille' ? 'Grille' : 'Arbre', exact: true });
  if ((await bouton.getAttribute('aria-pressed')) !== 'true') await bouton.click();
  await page.locator(vue === 'grille' ? 'a.carte' : '[role=tree]').first().waitFor();
}
const filtre = (page: Any) => page.getByLabel('Visibilité', { exact: true });

describe('kanevas-fiche-mj-seul-ecran, B-57', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'GET', '/api/univers')).find((u: Any) => u.nom === "Lame d'Ébène").id;
    await creer('Crypte fermée B57', false);
    await creer('Place ouverte B57', true);
    await creer('Lieu vide B57', null);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('grille MJ : pastille sous le titre des fiches fermées ou vides, jamais sur une fiche ouverte', async () => {
    await versLieux(antor);
    await carte(antor, 'Crypte fermée B57').waitFor();
    assert.equal(await pastilles(carte(antor, 'Crypte fermée B57')).count(), 1);
    assert.equal(await pastilles(carte(antor, 'Lieu vide B57')).count(), 1);
    assert.equal(await pastilles(carte(antor, 'Place ouverte B57')).count(), 0);
    const c = carte(antor, 'Crypte fermée B57');
    const t = (await c.getByText('Crypte fermée B57', { exact: true }).boundingBox()) as Any;
    const pb = (await pastilles(c).boundingBox()) as Any;
    const [tb, p] = [t.y + t.height, pb.y];
    assert.ok(p >= tb - 1, `pastille (${p}) doit être sous le titre (${tb})`);
    await antor.screenshot({ path: `${SHOTS}/grille-mj.png` });
  });

  test('infobulle : la pastille porte la phrase, au focus clavier aussi', async () => {
    await versLieux(antor);
    const pas = carte(antor, 'Crypte fermée B57').getByRole('img', { name: PHRASE });
    assert.equal(await pas.getAttribute('title'), PHRASE);
    await pas.focus();
    await antor.getByRole('status').filter({ hasText: PHRASE }).waitFor();
  });

  test('arbre MJ : la ligne de la fiche fermée porte la pastille, pas celle de la fiche ouverte', async () => {
    await versLieux(antor, '', 'arbre');
    const ligne = (t: string) => antor.getByRole('treeitem').filter({ hasText: t });
    await ligne('Crypte fermée B57').waitFor();
    assert.equal(await pastilles(ligne('Crypte fermée B57')).count(), 1);
    assert.equal(await pastilles(ligne('Lieu vide B57')).count(), 1);
    assert.equal(await pastilles(ligne('Place ouverte B57')).count(), 0);
    await antor.screenshot({ path: `${SHOTS}/arbre-mj.png` });
  });

  test('filtre : trois valeurs, adresse, grille filtrée, combinaison sous-type + recherche, « Toutes » rend l’arbre mémorisé', async () => {
    // the arbre is the memorised view (previous test)
    await versLieux(antor, '', 'arbre');
    await versLieux(antor, '', 'memorisee');
    await antor.getByRole('tree').waitFor();
    const f = filtre(antor);
    assert.deepEqual(await f.locator('option').allInnerTexts(), ['Visibilité : toutes', 'Visibles des joueurs', 'Réservées au MJ']);
    await f.selectOption('mj');
    await antor.waitForURL(/visibilite=mj/);
    await carte(antor, 'Crypte fermée B57').waitFor();
    assert.equal(await antor.getByRole('tree').count(), 0, 'un filtre rend la grille');
    assert.equal(await carte(antor, 'Place ouverte B57').count(), 0);
    assert.equal(await carte(antor, 'Lieu vide B57').count(), 1);
    // reload keeps the value
    await antor.reload();
    await carte(antor, 'Crypte fermée B57').waitFor();
    assert.equal(await f.inputValue(), 'mj');
    // joueurs : the opposite
    await f.selectOption('joueurs');
    await carte(antor, 'Place ouverte B57').waitFor();
    assert.equal(await carte(antor, 'Crypte fermée B57').count(), 0);
    assert.equal(await pastilles(antor.locator('a.carte')).count(), 0, 'aucune pastille parmi les visibles');
    // combined with the search
    await f.selectOption('mj');
    await antor.getByRole('searchbox').or(antor.getByLabel(/^Chercher dans/)).first().fill('Crypte');
    await antor.keyboard.press('Enter');
    await antor.waitForURL(/q=Crypte/);
    await antor.waitForURL(/visibilite=mj/);
    // the list goes through its loading state (every card leaves): wait for the old card to leave, then for the answer
    await carte(antor, 'Lieu vide B57').waitFor({ state: 'detached' });
    await carte(antor, 'Crypte fermée B57').waitFor();
    assert.equal(await carte(antor, 'Crypte fermée B57').count(), 1);
    // « Toutes » : the tree comes back once the filters are gone
    await versLieux(antor, '?visibilite=mj', 'memorisee');
    await carte(antor, 'Lieu vide B57').waitFor();
    await filtre(antor).selectOption('');
    await antor.getByRole('tree').waitFor();
    assert.ok(!antor.url().includes('visibilite'), antor.url());
  });

  test('filtre sans fiche : message et « Voir toutes les fiches »', async () => {
    await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'quete', titre: 'Quête ouverte B57' }).then(async (q: Any) => {
      const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${q.id}/sections`, { titre: 'But', contenu: 'x' });
      await api(antor, 'PATCH', `/api/univers/${U}/fiches/${q.id}/sections/${s.id}`, { joueursLisent: true });
    });
    // un sous-type inexistant + visibilité : message combiné ; sans autre filtre, message dédié
    await antor.goto(`/univers/${U}/fiches/lieux?visibilite=mj&q=zzzintrouvable`);
    await antor.getByRole('button', { name: 'Voir toutes les fiches' }).waitFor();
    await antor.getByRole('button', { name: 'Voir toutes les fiches' }).click();
    await antor.waitForURL((u: URL) => !u.search.includes('visibilite') && !u.search.includes('q='));
  });

  test('en-tête E-9 : pastille + infobulle ; ouvrir la section aux joueurs la retire sans recharger, puis de la carte', async () => {
    for (const t of ['Crypte fermée B57', 'Lieu vide B57']) {
      await antor.goto(`/univers/${U}/fiche/${ids[t]}`);
      await antor.getByRole('heading', { level: 1, name: t, exact: true }).waitFor();
      const pas = antor.getByRole('img', { name: PHRASE });
      await pas.waitFor();
      assert.equal(await pas.getAttribute('title'), PHRASE);
    }
    await antor.goto(`/univers/${U}/fiche/${ids['Crypte fermée B57']}`);
    await antor.getByRole('heading', { level: 1, name: 'Crypte fermée B57', exact: true }).waitFor();
    await antor.getByRole('img', { name: PHRASE }).waitFor();
    await antor.screenshot({ path: `${SHOTS}/entete-avant.png` });
    await regler(antor, 'Description', 'Les joueurs la lisent', true);
    await antor.getByRole('img', { name: PHRASE }).waitFor({ state: 'detached' });
    await antor.screenshot({ path: `${SHOTS}/entete-apres.png` });
    await versLieux(antor);
    await carte(antor, 'Crypte fermée B57').waitFor();
    assert.equal(await pastilles(carte(antor, 'Crypte fermée B57')).count(), 0);
  });

  test('résultat E-17 : pastille pour le MJ sur la fiche réservée', async () => {
    await api(antor, 'GET', `/api/univers/${U}/fiches?type=lieu&visibilite=mj`).then((r: Any) => {
      assert.ok(r.fiches.some((x: Any) => x.titre === 'Lieu vide B57' && x.visibleJoueurs === false));
    });
    await antor.goto(`/univers/${U}/recherche?q=${encodeURIComponent('Lieu vide B57')}`);
    await antor.getByRole('link', { name: /Lieu vide B57/ }).first().waitFor();
    assert.ok((await pastilles(antor.locator('main')).count()) >= 1, 'pastille sur le résultat E-17');
    await antor.screenshot({ path: `${SHOTS}/e17-mj.png` });
  });

  test('sélecteur « Relier » : pastille sur la carte de la fiche réservée au MJ et pas sur l’ouverte', async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['Place ouverte B57']}`);
    await antor.getByRole('heading', { level: 1, name: 'Place ouverte B57', exact: true }).waitFor();
    const b = section(antor, 'Description').getByRole('group', { name: 'Relations' });
    await b.getByRole('button', { name: 'Relier à une fiche', exact: true }).click();
    await b.getByLabel('Type de fiche').selectOption({ label: 'Lieu' });
    await b.getByLabel('Chercher dans les lieux').fill('B57');
    await b.getByRole('button', { name: 'Chercher', exact: true }).click();
    const vide = b.locator('.choix-fiche-ligne').filter({ hasText: 'Lieu vide B57' });
    await vide.waitFor();
    assert.equal(await pastilles(vide).count(), 1);
    assert.equal(await pastilles(b.locator('.choix-fiche-ligne').filter({ hasText: 'Place ouverte B57' })).count(), 0);
    await antor.screenshot({ path: `${SHOTS}/relier-mj.png` });
  });

  test('filtre sans autre filtre : « Aucune fiche réservée au MJ. » / « Aucune fiche visible des joueurs. » et « Voir toutes les fiches »', async () => {
    // a fresh universe: one sheet closed to the players, none open (then the opposite)
    const u = (await api(antor, 'POST', '/api/univers', { nom: 'Vide B57' })).id;
    const f = await api(antor, 'POST', `/api/univers/${u}/fiches`, { type: 'lieu', titre: 'Seul fermé B57' });
    await api(antor, 'POST', `/api/univers/${u}/fiches/${f.id}/sections`, { titre: 'Secret', contenu: 'x' });
    await antor.goto(`/univers/${u}/fiches/lieux?visibilite=joueurs`);
    await antor.getByText('Aucune fiche visible des joueurs.', { exact: true }).waitFor();
    await antor.screenshot({ path: `${SHOTS}/vide-joueurs.png` });
    await antor.getByRole('button', { name: 'Voir toutes les fiches' }).click();
    await antor.getByText('Seul fermé B57').waitFor();
    assert.ok(!antor.url().includes('visibilite'), antor.url());
    const o = await api(antor, 'POST', `/api/univers/${u}/fiches`, { type: 'objet', titre: 'Seul ouvert B57' });
    const s = await api(antor, 'POST', `/api/univers/${u}/fiches/${o.id}/sections`, { titre: 'Aspect', contenu: 'x' });
    await api(antor, 'PATCH', `/api/univers/${u}/fiches/${o.id}/sections/${s.id}`, { joueursLisent: true });
    await antor.goto(`/univers/${u}/fiches/objets?visibilite=mj`);
    await antor.getByText('Aucune fiche réservée au MJ.', { exact: true }).waitFor();
    await antor.screenshot({ path: `${SHOTS}/vide-mj.png` });
  });

  test('bascule en mode Joueur : ni pastille ni filtre ni paramètre ; retour MJ → « Toutes »', async () => {
    await versLieux(antor, '?visibilite=mj');
    await filtre(antor).waitFor();
    await antor.getByRole('radiogroup', { name: /Mode d.affichage/ }).getByRole('radio', { name: 'Joueur' }).check({ force: true });
    await filtre(antor).waitFor({ state: 'detached' });
    await antor.waitForFunction(() => !location.search.includes('visibilite'));
    await carte(antor, 'Place ouverte B57').waitFor();
    assert.equal(await pastilles(antor.locator('main')).count(), 0);
    assert.equal(await carte(antor, 'Lieu vide B57').count(), 0, 'mode Joueur ne montre pas la fiche vide');
    await antor.getByRole('radiogroup', { name: /Mode d.affichage/ }).getByRole('radio', { name: 'MJ' }).check({ force: true });
    await filtre(antor).waitFor();
    assert.equal(await filtre(antor).inputValue(), '');
  });

  test('joueuse : ni pastille ni filtre ; ?visibilite=mj ignoré et nettoyé', async () => {
    await versLieux(lea, '?visibilite=mj');
    await lea.locator('a.carte').first().waitFor();
    assert.equal(await filtre(lea).count(), 0);
    assert.equal(await pastilles(lea.locator('main')).count(), 0);
    assert.ok((await lea.locator('a.carte').count()) >= 1, 'la liste reste entière');
    assert.ok(await carte(lea, 'Place ouverte B57').count() === 1);
    await lea.screenshot({ path: `${SHOTS}/lea.png` });
    await lea.goto(`/univers/${U}/fiche/${ids['Place ouverte B57']}`);
    await lea.getByRole('heading', { level: 1, name: 'Place ouverte B57', exact: true }).waitFor();
    assert.equal(await lea.getByRole('img', { name: PHRASE }).count(), 0);
  });
});
