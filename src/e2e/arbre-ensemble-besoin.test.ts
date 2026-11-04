// Feature-level tests of kanevas-import-arbre (B-35, P-12, P-14, P-10; E-8 tree, E-9 trail, « Contient »,
// « Déplacer sous… »; AD-99, AD-104), written from the feature's exit criterion and docs/parcours.md /
// docs/ecrans.md only. World: the stub seed (« Lame d'Ébène », « Essai Kanka »). Real server in stub mode,
// real Chromium, the import API called over HTTP with the stub token. Expected values are literals.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const SHOTS = '/tmp/kanevas-arbre-ensemble-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0; // Lame d'Ébène
let E = 0; // Essai Kanka
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
/** Same call, status and body kept (for the refusals). */
async function brut(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; corps: Any; texte: string }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const texte = await r.text();
  let corps: Any = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    /* not json */
  }
  return { status: r.status(), corps, texte };
}
async function importer(method: string, chemin: string, corps?: unknown): Promise<{ status: number; corps: Any }> {
  const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, {
    method,
    headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  return { status: r.status, corps: t ? JSON.parse(t) : null };
}
async function ouvrir(page: Any, univers: number, id: number, titre: string): Promise<void> {
  await page.goto(`/univers/${univers}/fiche/${id}`);
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
  await attendre(page);
}
const fil = (page: Any) => page.getByRole('navigation', { name: /Fil d.Ariane/i }).first();
async function filTexte(page: Any): Promise<string> {
  return (await fil(page).innerText()).replace(/\s*\n\s*/g, ' › ').replace(/\s+/g, ' ').replace(/^\S › /, '').trim();
}
const arbre = (page: Any) => page.getByRole('tree');
const noeud = (page: Any, titre: string) => arbre(page).getByRole('treeitem').filter({ hasText: titre });
async function titres(page: Any): Promise<string[]> {
  return (await arbre(page).getByRole('treeitem').locator('.titre-fiche').allInnerTexts()).map((s: string) => s.trim());
}
async function deplier(page: Any, titre: string): Promise<void> {
  const n = noeud(page, titre).first();
  await n.getByRole('button', { name: 'Déplier' }).click();
  await n.and(page.locator('[aria-expanded=true]')).waitFor();
  await page.getByText('Chargement…', { exact: true }).waitFor({ state: 'detached' });
  await attendre(page);
}
async function ouvrirListe(page: Any, nav: string): Promise<void> {
  await page.goto(`/univers/${U}`);
  await attendre(page);
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: nav, exact: true }).click();
  await attendre(page);
}
async function enArbre(page: Any): Promise<void> {
  const b = page.getByRole('button', { name: 'Arbre', exact: true });
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  await arbre(page).waitFor();
  await attendre(page);
}
const patch = (page: Any, fid: number, parent: number | null, mode = '') =>
  brut(page, 'PATCH', `/api/univers/${U}/fiches/${fid}${mode}`, { parent });
const creer = async (type: string, titre: string): Promise<number> =>
  (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre })).id;

describe('kanevas-import-arbre, la hiérarchie de bout en bout', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    E = us.find((u: Any) => u.nom === 'Essai Kanka').id;
    const l = await api(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    for (const f of l.fiches) ids[f.titre] = f.id;
    const s = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Sphères`);
    for (const f of s.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // B-35 nominal. Panne : la vue « Arbre » ne montre plus Sphères > Port-Sel > Taverne, ou ne se souvient plus.
  test('B-35 nominal : Antor déplie Les Sphères puis Port-Sel et voit La Taverne du Kraken, le choix Arbre survit au rechargement', async () => {
    await ouvrirListe(antor, 'Lieux');
    assert.equal(await arbre(antor).count(), 0, 'la grille est la vue de départ');
    await enArbre(antor);
    await antor.reload();
    await attendre(antor);
    await arbre(antor).waitFor();
    await deplier(antor, 'Les Sphères');
    await deplier(antor, 'Port-Sel');
    const t = await titres(antor);
    assert.ok(t.includes('La Taverne du Kraken'), t.join('|'));
    assert.equal(await noeud(antor, 'La Taverne du Kraken').getAttribute('aria-level'), '3');
    await antor.screenshot({ path: `${SHOTS}/antor-arbre.png` });
  });

  // B-35 nominal + exclusion (lecteur). Panne : le filtre de droits retiré du fil, de « Contient » ou de l'arbre.
  test('B-35 : Léa ouvre Port-Sel, fil « Lame d’Ébène › Lieux › Port-Sel », Contient sans le Repaire, Antor le voit', async () => {
    await ouvrir(lea, U, ids['Port-Sel'], 'Port-Sel');
    assert.equal(await filTexte(lea), "Lame d'Ébène › Lieux › Port-Sel");
    const contient = lea.getByRole('heading', { name: 'Contient' });
    await contient.waitFor();
    const corps = await lea.locator('main').innerText();
    for (const n of ['La Taverne du Kraken', 'Les Docks', 'Le Phare aux Sels', 'Quartier des Cordiers']) {
      assert.ok(corps.includes(n), `Contient sans ${n}`);
    }
    assert.ok(!corps.includes('Repaire'), 'le Repaire (MJ seul) fuit');
    assert.ok(!corps.includes('Sphères'), 'Les Sphères (illisible) fuit');
    await lea.screenshot({ path: `${SHOTS}/lea-port-sel.png` });
    await ouvrir(antor, U, ids['Port-Sel'], 'Port-Sel');
    assert.ok((await antor.locator('main').innerText()).includes('Le Repaire des contrebandiers'));
    assert.equal(await filTexte(antor), "Lame d'Ébène › Lieux › Les Sphères › Port-Sel");
  });

  // B-35 exclusion : « sans compteur ». Panne : un total, un nombre ou le titre d'une fiche cachée dans une réponse de Léa.
  test('B-35 exclusion : aucune réponse de l’API à Léa ne nomme, ne numérote ni ne compte une fiche qu’elle ne lit pas', async () => {
    const p = ids['Port-Sel'];
    const reponses = [
      await brut(lea, 'GET', `/api/univers/${U}/fiches/${p}`),
      await brut(lea, 'GET', `/api/univers/${U}/fiches/${p}/enfants`),
      await brut(lea, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=racine`),
      await brut(lea, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=${p}`),
      await brut(lea, 'GET', `/api/univers/${U}/fiches?q=Repaire`),
      await brut(lea, 'GET', `/api/univers/${U}/fiches?q=Sphères`),
    ];
    for (const r of reponses) {
      assert.equal(r.status, 200, r.texte.slice(0, 200));
      assert.ok(!r.texte.includes('Repaire'), 'titre caché: ' + r.texte.slice(0, 300));
      assert.ok(!r.texte.includes('Sphères'), 'titre caché: ' + r.texte.slice(0, 300));
      const listes = [r.corps.ancetres, r.corps.enfants, r.corps.fiches].filter(Array.isArray).flat() as Any[];
      assert.ok(!listes.some((x) => x.id === ids['Les Sphères'] || x.id === ids['Le Repaire des contrebandiers']), 'id caché');
      assert.ok(!/"(total|nombre|count|compte|masques|caches|cachees)\w*"/i.test(r.texte), 'compteur: ' + r.texte.slice(0, 300));
    }
    assert.equal(reponses[1]!.corps.enfants.length, 4);
    assert.deepEqual(reponses[4]!.corps.fiches, []);
    assert.deepEqual(reponses[5]!.corps.fiches, []);
    // 404 d'une fiche illisible: même réponse qu'une adresse inconnue
    const cachee = await brut(lea, 'GET', `/api/univers/${U}/fiches/${ids['Les Sphères']}/enfants`);
    const inconnue = await brut(lea, 'GET', `/api/univers/${U}/fiches/987654/enfants`);
    assert.equal(cachee.status, 404);
    assert.equal(cachee.status, inconnue.status);
    assert.equal(cachee.texte, inconnue.texte);
  });

  // B-35 exclusion : le mode Joueur d'un MJ lit comme un joueur. Panne : « Contient » ignore le mode.
  test('B-35 : Antor en mode Joueur ne voit plus le Repaire ni Les Sphères dans l’API', async () => {
    const e = await brut(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}/enfants?mode=joueur`);
    assert.equal(e.status, 200);
    assert.equal(e.corps.enfants.length, 4);
    assert.ok(!e.texte.includes('Repaire'));
    const f = await brut(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}?mode=joueur`);
    assert.ok(!f.texte.includes('Sphères'), 'ancêtre illisible en mode Joueur');
    const racine = await brut(antor, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=racine&mode=joueur`);
    assert.ok(racine.corps.fiches.some((x: Any) => x.titre === 'Port-Sel'));
    assert.ok(!racine.corps.fiches.some((x: Any) => x.titre === 'Les Sphères'));
  });

  // B-35 bord : Léa, racine sans « dans ». Panne : « dans » rend le titre d'un parent illisible.
  test('B-35 bord : pour Léa, Port-Sel est une racine de l’arbre sans « dans », quatre enfants dépliés, pas de nombre', async () => {
    await ouvrirListe(lea, 'Lieux');
    await enArbre(lea);
    const racines = await titres(lea);
    assert.ok(racines.includes('Port-Sel'), racines.join('|'));
    assert.ok(!racines.includes('Les Sphères'));
    assert.ok(!(await noeud(lea, 'Port-Sel').innerText()).includes('dans'));
    await deplier(lea, 'Port-Sel');
    const t = await titres(lea);
    const i = t.indexOf('Port-Sel');
    assert.deepEqual(t.slice(i + 1, i + 5).sort(), ['La Taverne du Kraken', 'Le Phare aux Sels', 'Les Docks', 'Quartier des Cordiers']);
    const texte = await arbre(lea).innerText();
    assert.ok(!texte.includes('Repaire'));
    assert.ok(!/\(\s*\d+\s*\)/.test(texte), 'nombre visible: ' + texte);
  });

  // B-35 : parent d'un autre type. Panne : l'enfant d'un autre type apparaît dans l'arbre du type, ou manque à « Contient ».
  test('B-35 : un événement rangé sous Port-Sel est dans « Contient », porte « dans Port-Sel » dans Événements, et n’est pas dans l’arbre des Lieux', async () => {
    const ev = await creer('evenement', 'Le Pillage des Docks');
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${ev}/sections`, { titre: 'Récit', contenu: 'Les docks brûlent.' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${ev}/sections/${s.id}`, { joueursLisent: true });
    const r = await patch(antor, ev, ids['Port-Sel']);
    assert.equal(r.status, 200, r.texte);
    ids['Le Pillage des Docks'] = ev;
    await ouvrirListe(lea, 'Événements');
    await enArbre(lea);
    assert.ok((await noeud(lea, 'Le Pillage des Docks').innerText()).includes('dans Port-Sel'));
    await ouvrir(lea, U, ids['Port-Sel'], 'Port-Sel');
    assert.ok((await lea.locator('main').innerText()).includes('Le Pillage des Docks'), 'absent de Contient');
    await ouvrirListe(lea, 'Lieux');
    await enArbre(lea);
    await deplier(lea, 'Port-Sel');
    assert.ok(!(await titres(lea)).includes('Le Pillage des Docks'));
    await ouvrir(lea, U, ev, 'Le Pillage des Docks');
    assert.equal(await filTexte(lea), "Lame d'Ébène › Événements › Port-Sel › Le Pillage des Docks");
  });

  // P-14 étape 2, échec. Panne : le contrôle de cycle retiré.
  test('P-14 échec : Les Sphères sous Port-Sel est refusé avec « Une fiche ne peut pas être rangée sous l’un de ses descendants. », la boîte reste ouverte, rien ne bouge', async () => {
    await ouvrir(antor, U, ids['Les Sphères'], 'Les Sphères');
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    const d = antor.getByRole('dialog');
    // La recherche écarte désormais les descendants (AD-129) : le cycle ne reste atteignable que si la hiérarchie
    // change boîte ouverte. Une fiche libre est choisie, puis rangée sous Port-Sel par ailleurs.
    const libre = (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Cible du cycle' })).id;
    await d.getByRole('button', { name: 'Recherche' }).click();
    await d.getByLabel('Chercher une fiche').fill('Cible du cycle');
    await d.getByLabel(/^Cible du cycle/).first().check();
    assert.equal((await patch(antor, libre, ids['Port-Sel'])).status, 200);
    await d.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await d.getByText(/Une fiche ne peut pas être rangée sous l.un de ses descendants\./).waitFor();
    assert.equal(await d.isVisible(), true);
    await antor.screenshot({ path: `${SHOTS}/cycle.png` });
    await d.getByRole('button', { name: 'Annuler' }).click();
    const ancetres = (await api(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}`)).ancetres;
    assert.deepEqual(ancetres.map((a: Any) => a.titre), ['Les Sphères']);
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${libre}`);
    // par l'API aussi
    const r = await patch(antor, ids['Les Sphères'], ids['Port-Sel']);
    assert.equal(r.status, 400);
    assert.equal(r.corps.code, 'cycle');
  });

  // P-14 : la boîte cherche dans tous les types. Panne : la recherche reste bornée au type de la fiche.
  test('P-14 : « Déplacer sous… » trouve par titre une fiche d’un autre type, avec « Événement » en sous-titre, et n’y propose pas la fiche elle-même', async () => {
    await ouvrir(antor, U, ids['Les Docks'], 'Les Docks');
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('button', { name: 'Recherche' }).click();
    await d.getByLabel('Chercher une fiche').fill('Pillage');
    const ligne = d.getByLabel(/^Le Pillage des Docks/).first();
    await ligne.waitFor();
    assert.ok((await d.innerText()).includes('Événement'));
    await d.getByRole('button', { name: 'Recherche' }).click();
    await d.getByLabel('Chercher une fiche').fill('Les Docks');
    await antor.waitForTimeout(900);
    await attendre(antor);
    assert.equal(await d.getByLabel(/^Les Docks/).count(), 0, 'la fiche se propose à elle-même');
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  // B-35 exclusion : droits d'écriture. Panne : un Joueur obtient le menu ou le PATCH.
  test('B-35 exclusion : Léa n’a ni menu « ⋯ » ni « Déplacer sous… », et son PATCH est refusé sans rien changer', async () => {
    await ouvrir(lea, U, ids['Les Docks'], 'Les Docks');
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    assert.ok(!(await lea.locator('body').innerText()).includes('Déplacer sous'));
    const r = await patch(lea, ids['Les Docks'], ids['Le Phare aux Sels']);
    assert.equal(r.status, 403);
    const mode = await patch(antor, ids['Les Docks'], ids['Le Phare aux Sels'], '?mode=joueur');
    assert.equal(mode.status, 403, 'un MJ en mode Joueur ne déplace pas');
    const e = await api(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}/enfants`);
    assert.ok(e.enfants.some((x: Any) => x.titre === 'Les Docks'));
  });

  // P-12 étape 5, bord : plus de trois ancêtres. Panne : le fil affiche toute la chaîne.
  test('P-12 bord : à cinq ancêtres lisibles, le fil montre le premier, « … », puis les deux derniers, et le menu « … » liste les autres avec leur lien', async () => {
    const noms = ['Niveau A', 'Niveau B', 'Niveau C', 'Niveau D', 'Niveau E', 'Feuille Z'];
    const f: number[] = [];
    for (const n of noms) f.push(await creer('lieu', n));
    for (let i = 1; i < f.length; i++) assert.equal((await patch(antor, f[i]!, f[i - 1]!)).status, 200);
    await ouvrir(antor, U, f[5]!, 'Feuille Z');
    assert.equal(await filTexte(antor), "Lame d'Ébène › Lieux › Niveau A › … › Niveau D › Niveau E › Feuille Z");
    await fil(antor).getByText('…', { exact: true }).click();
    const items = await antor.getByRole('menuitem').allInnerTexts();
    assert.equal(items.length, 2, items.join('|'));
    assert.ok(items[0].includes('Niveau B') && items[1].includes('Niveau C'), items.join('|'));
    await antor.screenshot({ path: `${SHOTS}/fil-long.png` });
    // retour par le fil (P-12 étape 5)
    await antor.keyboard.press('Escape');
    await fil(antor).getByRole('link', { name: 'Niveau E' }).click();
    await antor.getByRole('heading', { level: 1, name: 'Niveau E', exact: true }).waitFor();
  });

  // AD-99 : profondeur bornée à 50. Panne : plus de borne, une chaîne infinie accepte tout.
  test('AD-99 bord : en rangeant une chaîne de 60 fiches, le déplacement est refusé « trop_profond » vers le 51e niveau, la fiche reste à la racine', async () => {
    const f: number[] = [];
    for (let i = 0; i < 60; i++) f.push(await creer('lieu', `Maillon ${i}`));
    let refus = -1;
    for (let i = 1; i < f.length; i++) {
      const r = await patch(antor, f[i]!, f[i - 1]!);
      if (r.status !== 200) {
        assert.equal(r.status, 400);
        assert.equal(r.corps.code, 'trop_profond');
        refus = i;
        break;
      }
    }
    assert.ok(refus >= 49 && refus <= 52, `premier refus au maillon ${refus}`);
    const v = await api(antor, 'GET', `/api/univers/${U}/fiches/${f[refus]!}`);
    assert.deepEqual(v.ancetres, []);
  });

  // P-10 + AD-104 : critère d'import, de bout en bout. Panne : parent absent bloque l'écriture, ou rejeu sans effet,
  // ou rejeu qui écrase un parent changé à la main.
  test('P-10 / AD-104 : import de Les Docks avec un parent absent → fiche sans parent et avertissement ; la clé arrive → le parent est posé ; changé à la main → plus écrasé', async () => {
    const lot1 = (await importer('POST', '/lots')).corps.lotId;
    const r1 = await importer('PUT', `/fiches/${encodeURIComponent('lieu:les-docks')}?lot=${lot1}`, {
      type: 'lieu', titre: 'Les Docks', sections: [], parent: 'lieu:port-sel-absent',
    });
    assert.equal(r1.status, 200, JSON.stringify(r1.corps));
    assert.equal(r1.corps.avertissements.length, 1);
    assert.ok(r1.corps.avertissements[0].includes('lieu:port-sel-absent'), r1.corps.avertissements[0]);
    const docks = r1.corps.id;
    const sans = await api(antor, 'GET', `/api/univers/${E}/fiches/${docks}`);
    assert.deepEqual(sans.ancetres, []);
    await ouvrir(antor, E, docks, 'Les Docks');
    assert.equal(await filTexte(antor), 'Essai Kanka › Lieux › Les Docks');

    const lot2 = (await importer('POST', '/lots')).corps.lotId;
    const port = await importer('PUT', `/fiches/${encodeURIComponent('lieu:port-sel-absent')}?lot=${lot2}`, {
      type: 'lieu', titre: 'Port-Sel Kanka', sections: [],
    });
    assert.equal(port.status, 200);
    const rejeu = await importer('PUT', `/fiches/${encodeURIComponent('lieu:les-docks')}?lot=${lot2}`, {
      type: 'lieu', titre: 'Les Docks', sections: [], parent: 'lieu:port-sel-absent',
    });
    assert.equal(rejeu.status, 200);
    assert.deepEqual(rejeu.corps.avertissements, []);
    await ouvrir(antor, E, docks, 'Les Docks');
    assert.equal(await filTexte(antor), 'Essai Kanka › Lieux › Port-Sel Kanka › Les Docks');
    await antor.screenshot({ path: `${SHOTS}/import-rejeu.png` });

    // un parent changé à la main n'est plus écrasé
    const anse = (await api(antor, 'GET', `/api/univers/${E}/fiches?q=Anse-aux-Sels`)).fiches[0].id;
    const main = await brut(antor, 'PATCH', `/api/univers/${E}/fiches/${docks}`, { parent: anse });
    assert.equal(main.status, 200, main.texte);
    const lot3 = (await importer('POST', '/lots')).corps.lotId;
    const encore = await importer('PUT', `/fiches/${encodeURIComponent('lieu:les-docks')}?lot=${lot3}`, {
      type: 'lieu', titre: 'Les Docks', sections: [], parent: 'lieu:port-sel-absent',
    });
    assert.equal(encore.status, 200);
    await ouvrir(antor, E, docks, 'Les Docks');
    assert.equal(await filTexte(antor), 'Essai Kanka › Lieux › Anse-aux-Sels › Les Docks');
  });

  // P-10 échec : jeton. Panne : le rangement par l'import s'ouvre sans le jeton.
  test('P-10 échec : sans jeton valide, l’import avec parent est refusé 401 et n’écrit rien', async () => {
    const r = await fetch(`${srv.base}/api/import/v1/univers/${E}/fiches/${encodeURIComponent('lieu:intrus')}`, {
      method: 'PUT',
      headers: { authorization: 'Bearer kvs_faux', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'lieu', titre: 'Intrus', sections: [], parent: 'lieu:les-docks' }),
    });
    assert.equal(r.status, 401);
    const cherche = await api(antor, 'GET', `/api/univers/${E}/fiches?q=Intrus`);
    assert.deepEqual(cherche.fiches, []);
  });
});
