// Black-box test of the exit criterion of kanevas-cartes-graphes, played as the user plays it
// (docs/parcours.md P-3 step 6, P-6 step 3, P-9 ; docs/ecrans.md E-10, E-11, bloc « Cartes visibles » de E-3).
// Antor's gestures go through the screens; only the lore (sheets, sections, relations), which belongs to
// other features, is arranged through the API. Expected values are literals taken from the docs.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, texte as texteBrut, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/kanevas-captures';
mkdirSync(CAPTURES, { recursive: true });
const PAYSAGE = readFileSync(new URL('./fixtures/cartes/paysage-brume.png', import.meta.url));

let srv: Server;
let browser: Any;
const texte = async (page: Any): Promise<string> => (await texteBrut(page)).replace(/\s+/g, ' ');

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json().catch(() => null);
}

describe('kanevas-cartes-graphes, critère de sortie au navigateur', { skip: skipBrowser }, () => {
  let antor: Any;
  let lea: Any;
  let U = 0;
  let aldric = 0;
  let carte = 0;
  let graphe = 0;
  const ids: Record<string, number> = {};

  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: 'Brume critère' })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const fiche = async (type: string, titre: string, section: string, lisible: boolean) => {
      const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, ...(type === 'personnage' ? { charge: { pj: false } } : {}) });
      const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${f.id}/sections`, { titre: section, contenu: 'x' });
      if (lisible) await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
      return { f: f.id as number, s: s.id as number };
    };
    const a = await fiche('personnage', 'Maître Aldric', 'Apparence', true);
    aldric = a.f;
    const ombres = await fiche('faction', 'Les Ombres de Fer', 'Secret', false);
    const corbeaux = await fiche('faction', 'Les Corbeaux', 'Présentation', true);
    const guilde = await fiche('faction', 'La Guilde', 'Présentation', true);
    ids.ombres = ombres.f;
    const marais = await fiche('faction', 'Les Marais', 'Présentation', true);
    const rel = (de: { f: number; s: number }, vers: number, type: string) =>
      api(antor, 'POST', `/api/univers/${U}/fiches/${de.f}/sections/${de.s}/relations`, { cibleFicheId: vers, type });
    await rel(corbeaux, guilde.f, 'rival de'); // readable section, readable target: Léa sees it
    await rel(corbeaux, ombres.f, 'espion pour'); // readable section, hidden target: Léa must not
    await rel(corbeaux, marais.f, 'voisin de'); // both readable but « Les Marais » is not on the graph: no link
    await rel(ombres, guilde.f, 'ennemi de'); // hidden section, readable target: Léa must not
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Fails if the creation form drops the background, or if the new map is born visible.
  test('Antor crée une carte illustrée avec un fond : elle naît « MJ seul »', async () => {
    await antor.goto(`/univers/${U}/cartes`);
    await antor.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
    await attendre(antor);
    await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
    const form = antor.getByRole('form', { name: rx('Nouvelle carte') });
    await form.getByLabel('Titre', { exact: true }).fill('La ville de Brume');
    await form.locator('input[type=file]').setInputFiles({ name: 'brume.png', mimeType: 'image/png', buffer: PAYSAGE });
    await antor.getByRole('button', { name: rxExact('Créer') }).click();
    await antor.waitForURL(new RegExp(`/univers/${U}/cartes/\\d+$`));
    await antor.getByRole('heading', { name: 'La ville de Brume', level: 1 }).waitFor();
    await attendre(antor);
    carte = Number(antor.url().split('/').pop());
    const t = await texte(antor);
    assert.ok(t.includes('MJ seul'));
    const fond = await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes/${carte}/fond`);
    assert.equal(fond.status(), 200);
    assert.deepEqual(Buffer.from(await fond.body()), PAYSAGE);
  });

  // Fails if a map born hidden leaks to the players before "Rendre visible".
  test('Léa ne voit pas la carte tant qu\'Antor ne l\'a pas rendue visible', async () => {
    await lea.goto(`/univers/${U}/cartes`);
    await lea.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
    await attendre(lea);
    const t = await texte(lea);
    assert.ok(t.includes("Aucune carte n'est visible pour l'instant."));
    assert.ok(!t.includes('La ville de Brume'));
  });

  // Fails if "Ajouter" does not place the sheet, or if the carte is not made visible by the button.
  test('Antor place Aldric et la faction secrète puis rend la carte visible', async () => {
    await antor.goto(`/univers/${U}/cartes/${carte}`);
    await antor.getByRole('heading', { name: 'La ville de Brume', level: 1 }).waitFor();
    await attendre(antor);
    for (const [type, titre] of [['Personnage', 'Maître Aldric'], ['Faction', 'Les Ombres de Fer']]) {
      await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
      const fenetre = antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
      await fenetre.getByLabel('Type de fiche').selectOption({ label: type });
      await fenetre.getByRole('listitem').filter({ hasText: rx(titre!) }).getByRole('button', { name: rxExact('Ajouter') }).click();
      await attendre(antor);
      await fenetre.getByRole('button', { name: rxExact('Fermer') }).click();
      await fenetre.waitFor({ state: 'detached' });
    }
    await antor.getByRole('button', { name: rxExact('Rendre visible') }).click();
    await antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).waitFor();
    await antor.reload();
    await attendre(antor);
    const t = await texte(antor);
    assert.ok(t.includes('Visible des joueurs'));
    assert.ok(t.includes('Maître Aldric') && t.includes('Les Ombres de Fer'));
    await antor.screenshot({ path: `${CAPTURES}/critere-antor-carte.png`, fullPage: true });
  });

  // Fails if the secret faction's token, title or presence in any payload reaches Léa.
  test('Léa ouvre la carte : le token d\'Aldric, rien de la faction secrète, ni à l\'écran ni dans la réponse', async () => {
    const corps: Promise<string>[] = [];
    lea.on('response', (r: Any) => {
      if (r.url().includes('/api/')) corps.push(r.text().catch(() => ''));
    });
    await lea.goto(`/univers/${U}/cartes`);
    await attendre(lea);
    await lea.getByRole('link', { name: rx('La ville de Brume') }).first().click();
    await lea.getByRole('heading', { name: 'La ville de Brume', level: 1 }).waitFor();
    await attendre(lea);
    const t = await texte(lea);
    assert.ok(t.includes('Maître Aldric'));
    assert.ok(!t.includes('Ombres'));
    assert.ok(!t.includes('MJ seul'));
    assert.equal(await lea.getByRole('button', { name: rx('Cacher aux joueurs|Rendre visible|Ajouter une fiche|Renommer') }).count(), 0);
    const toutes = (await Promise.all(corps)).join('\n');
    assert.ok(!toutes.includes('Ombres'));
    assert.ok(!toutes.includes('Secret'));
    await lea.screenshot({ path: `${CAPTURES}/critere-lea-carte.png`, fullPage: true });
  });

  // Fails if touching the token does not navigate to the sheet.
  test('Léa touche le token d\'Aldric et arrive sur sa fiche', async () => {
    await lea.locator('main :is(a, button, [role=button], [role=link]):not(section *)').filter({ hasText: rx('Maître Aldric') }).first().click();
    await lea.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    assert.ok(!lea.url().includes('/cartes/'));
    assert.ok((await texte(lea)).includes('Apparence'));
  });

  // Fails if the player mode shows the GM something other than what Léa reads.
  test('Antor en mode Joueur voit la même liste « Sur la carte » que Léa, sans geste d\'écriture', async () => {
    const liste = async (p: Any): Promise<string[]> =>
      (await p.getByRole('region', { name: rx('Sur la carte') }).getByRole('listitem').allInnerTexts()).map((s: string) => s.replace(/\s+/g, ' ').trim());
    await lea.goto(`/univers/${U}/cartes/${carte}`);
    await attendre(lea);
    await antor.goto(`/univers/${U}/cartes/${carte}`);
    await attendre(antor);
    await antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
    await attendre(antor);
    await antor.waitForTimeout(300);
    try {
      const vuParLea = await liste(lea);
      assert.equal(vuParLea.length, 1);
      assert.deepEqual(await liste(antor), vuParLea);
      assert.ok(!(await texte(antor)).includes('Ombres'));
      assert.equal(await antor.getByRole('button', { name: rx('Retirer de la carte|Ajouter une fiche|Cacher aux joueurs') }).count(), 0);
    } finally {
      await antor.getByRole('radio', { name: rxExact('Mode MJ') }).check();
      await attendre(antor);
    }
  });

  // Fails if the block of E-3 lists a MJ-only map for Léa or omits a visible one.
  test('Léa lit la carte dans le bloc « Cartes visibles » de la vue d\'ensemble', async () => {
    await lea.goto(`/univers/${U}`);
    await attendre(lea);
    const t = await texte(lea);
    assert.ok(t.includes('Cartes visibles'));
    assert.ok(t.includes('La ville de Brume'));
  });

  // Fails if a link leaks through a hidden target, a hidden carrying section, or is dropped though readable.
  test('Graphe : Antor choisit quatre factions ; Léa ne voit ni la secrète ni un lien qui la touche', async () => {
    await antor.goto(`/univers/${U}/cartes`);
    await attendre(antor);
    await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
    const form = antor.getByRole('form', { name: rx('Nouvelle carte') });
    await form.getByLabel('Titre', { exact: true }).fill('Les factions');
    await form.getByRole('combobox', { name: rx('Forme') }).selectOption({ label: 'Graphe' });
    await antor.getByRole('button', { name: rxExact('Créer') }).click();
    await antor.waitForURL(new RegExp(`/univers/${U}/cartes/\\d+$`));
    graphe = Number(antor.url().split('/').pop());
    await attendre(antor);
    for (const titre of ['Les Corbeaux', 'La Guilde', 'Les Ombres de Fer']) {
      await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
      const fenetre = antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
      await fenetre.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await fenetre.getByRole('listitem').filter({ hasText: rx(titre) }).getByRole('button', { name: rxExact('Ajouter') }).click();
      await attendre(antor);
      await fenetre.getByRole('button', { name: rxExact('Fermer') }).click();
      await fenetre.waitFor({ state: 'detached' });
    }
    await antor.getByRole('button', { name: rxExact('Rendre visible') }).click();
    await antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).waitFor();
    await antor.reload();
    await attendre(antor);
    const liens = async (p: Any): Promise<string[]> =>
      (await p.getByRole('region', { name: rx('Liens') }).getByRole('listitem').allInnerTexts()).map((s: string) => s.replace(/\s+/g, ' ').replace(/’/g, "'").trim());
    assert.deepEqual((await liens(antor)).sort(), [
      'Les Corbeaux — espion pour → Les Ombres de Fer',
      'Les Corbeaux — rival de → La Guilde',
      'Les Ombres de Fer — ennemi de → La Guilde',
    ].sort());
    assert.ok(!(await texte(antor)).includes('voisin'));
    await antor.screenshot({ path: `${CAPTURES}/critere-antor-graphe.png`, fullPage: true });

    await lea.goto(`/univers/${U}/cartes/${graphe}`);
    await lea.getByRole('heading', { name: 'Les factions', level: 1 }).waitFor();
    await attendre(lea);
    assert.deepEqual(await liens(lea), ['Les Corbeaux — rival de → La Guilde']);
    const t = await texte(lea);
    assert.ok(!t.includes('Ombres'));
    assert.ok(!t.includes('espion'));
    assert.ok(!t.includes('ennemi'));
    assert.ok(!t.includes('voisin') && !t.includes('Marais'));
    const brut = JSON.stringify(await api(lea, 'GET', `/api/univers/${U}/cartes/${graphe}`));
    assert.ok(!brut.includes('Ombres') && !brut.includes('espion') && !brut.includes('ennemi'));
    await lea.screenshot({ path: `${CAPTURES}/critere-lea-graphe.png`, fullPage: true });
  });

  // Fails if "Cacher" leaves the map reachable by Léa.
  test('Antor cache le graphe : Léa lit « Page introuvable. » au rechargement', async () => {
    await antor.goto(`/univers/${U}/cartes`);
    await attendre(antor);
    const ligne = antor.getByRole('listitem').filter({ hasText: rx('Les factions') });
    await ligne.getByRole('button', { name: rxExact('Cacher aux joueurs') }).click();
    await ligne.getByRole('button', { name: rxExact('Rendre visible') }).waitFor();
    await lea.goto(`/univers/${U}/cartes/${graphe}`);
    await attendre(lea);
    assert.ok((await texte(lea)).includes('Page introuvable.'));
  });
});
