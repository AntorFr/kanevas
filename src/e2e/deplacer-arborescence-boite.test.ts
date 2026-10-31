// Black-box tests of the « Déplacer sous… » box of E-9 (kanevas-deplacer-arborescence-boite), written from the
// task's exit criterion and docs/ecrans.md « Ce que `kanevas-deplacer-arborescence` construit ».
// Real server in stub mode + real Chromium; expected values are literals from the criterion.
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function ouvrirBoite(page: Any, titre: string): Promise<Any> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
  await attendre(page);
  await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  await page.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
  const d = page.getByRole('dialog');
  await d.waitFor();
  return d;
}
const chemin = async (d: Any) => (await d.getByRole('navigation', { name: 'Chemin' }).innerText()).replace(/\s*\n\s*/g, ' › ');
const lignes = async (d: Any) => (await d.getByRole('radiogroup', { name: 'Nouveau parent' }).locator('label').allInnerTexts()).map((t: string) => t.replace(/\s+/g, ' ').trim());

describe('kanevas-deplacer-arborescence-boite, E-9 « Déplacer sous… »', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    const l = await api(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    for (const f of l.fiches) ids[f.titre] = f.id;
    const r = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Port-Sel`);
    for (const f of r.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  afterEach(async () => {
    await antor.setViewportSize({ width: 1280, height: 720 });
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('s’ouvre sur le niveau de la Taverne : chemin, quatre frères, elle-même non choisissable', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByText('La Taverne du Kraken (cette fiche)').waitFor();
    assert.equal(await d.getByRole('button', { name: 'Arborescence' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await chemin(d), "Lame d'Ébène › Les Sphères › Port-Sel");
    const l = await lignes(d);
    for (const t of ['Aucun parent', 'Le Phare aux Sels', 'Le Repaire des contrebandiers', 'Les Docks', 'Quartier des Cordiers']) {
      assert.ok(l.some((x: string) => x.startsWith(t)), `${t} absent: ${l.join('|')}`);
    }
    const soi = d.getByLabel(/La Taverne du Kraken/);
    assert.equal(await soi.isDisabled(), true);
    assert.equal(await d.getByRole('button', { name: /^Ouvrir « La Taverne/ }).count(), 0);
    assert.equal(await d.getByRole('button', { name: 'Déplacer', exact: true }).isDisabled(), true);
  });

  test('clic sur « Les Sphères » du chemin : Port-Sel « (parent actuel) » avec chevron ; le choisir laisse Déplacer inactif', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByRole('button', { name: 'Les Sphères', exact: true }).click();
    await d.getByLabel(/^Port-Sel/).waitFor();
    const l = (await lignes(d)).find((x: string) => x.startsWith('Port-Sel'));
    assert.ok(l?.includes('(parent actuel)'), String(l));
    await d.getByRole('button', { name: 'Ouvrir « Port-Sel »' }).waitFor();
    await d.getByLabel(/^Port-Sel/).check();
    assert.equal(await d.getByRole('button', { name: 'Déplacer', exact: true }).isDisabled(), true);
  });

  test('le choix survit à Remonter / chevron et au passage en Recherche ; résumé « Nouveau parent »', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByLabel(/^Les Docks/).check();
    await d.getByText('Nouveau parent : Les Docks').waitFor();
    await d.getByRole('button', { name: 'Remonter d’un niveau' }).click();
    await d.getByRole('button', { name: 'Ouvrir « Port-Sel »' }).click();
    await d.getByLabel(/^Les Docks/).waitFor();
    assert.equal(await d.getByLabel(/^Les Docks/).isChecked(), true);
    assert.equal(await chemin(d), "Lame d'Ébène › Les Sphères › Port-Sel");
    await d.getByRole('button', { name: 'Recherche' }).click();
    await d.getByLabel('Chercher une fiche').fill('Doc');
    await d.getByLabel(/^Les Docks/).waitFor();
    assert.equal(await d.getByLabel(/^Les Docks/).isChecked(), true);
    await d.getByLabel('Aucun parent').check();
    await d.getByText('Nouveau parent : aucun (racine de l’univers)').waitFor();
  });

  test('« Aucun parent » : « (actuel) » à la racine, Déplacer inactif ; sur Les Sphères la racine s’ouvre, Remonter inactif', async () => {
    const d = await ouvrirBoite(antor, 'Les Sphères');
    await d.getByText('Les Sphères (cette fiche)').waitFor();
    assert.equal(await chemin(d), "Lame d'Ébène");
    assert.equal(await d.getByRole('button', { name: 'Remonter d’un niveau' }).isDisabled(), true);
    assert.ok((await lignes(d))[0].includes('(actuel)'));
    await d.getByLabel('Aucun parent').check();
    assert.equal(await d.getByRole('button', { name: 'Déplacer', exact: true }).isDisabled(), true);
  });

  test('sur Port-Sel : pas de chevron sur sa ligne ; Recherche « Doc » ne propose pas Les Docks, « Taverne » rien', async () => {
    const d = await ouvrirBoite(antor, 'Port-Sel');
    await d.getByText('Port-Sel (cette fiche)').waitFor();
    assert.equal(await d.getByRole('button', { name: 'Ouvrir « Port-Sel »' }).count(), 0);
    await d.getByRole('button', { name: 'Recherche' }).click();
    assert.equal(await d.getByLabel('Chercher une fiche').evaluate((e: Element) => e === document.activeElement), true);
    await d.getByText('Tapez le début d’un titre.').waitFor();
    await d.getByLabel('Chercher une fiche').fill('Doc');
    await d.getByText('Recherche…').waitFor({ state: 'detached' });
    await d.getByText('Aucune fiche ne correspond.').waitFor();
    assert.equal(await d.getByLabel(/^Les Docks/).count(), 0);
    // « Taverne » : la fiche et ses descendants sont écartés (La Taverne du Kraken) ; un lieu de sous-type Taverne reste.
    await d.getByLabel('Chercher une fiche').fill('Taverne');
    await d.getByLabel(/^Le Pendu Joyeux/).waitFor();
    assert.equal(await d.getByLabel(/^La Taverne du Kraken/).count(), 0);
    // Retour sur l'arborescence : la saisie est gardée en revenant.
    await d.getByRole('button', { name: 'Arborescence' }).click();
    await d.getByRole('button', { name: 'Recherche' }).click();
    assert.equal(await d.getByLabel('Chercher une fiche').inputValue(), 'Taverne');
  });

  test('chaque ouverture repart sur l’Arborescence, même après un passage en Recherche', async () => {
    let d = await ouvrirBoite(antor, 'Les Docks');
    await d.getByRole('button', { name: 'Recherche' }).click();
    await d.getByRole('button', { name: 'Annuler' }).click();
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    d = antor.getByRole('dialog');
    assert.equal(await d.getByRole('button', { name: 'Arborescence' }).getAttribute('aria-pressed'), 'true');
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  test('échec de lecture du niveau : « Impossible de charger ce niveau. », Réessayer relit', async () => {
    let echec = true;
    await antor.route(/\/fiches\/\d+\/enfants/, (route: Any) => (echec ? route.fulfill({ status: 500, body: '{}' }) : route.continue()));
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByText('Impossible de charger ce niveau.').waitFor();
    assert.equal(await d.getByRole('button', { name: 'Les Sphères', exact: true }).isVisible(), true, 'le chemin reste utilisable');
    echec = false;
    await d.getByRole('button', { name: 'Réessayer' }).click();
    await d.getByText('Les Docks').first().waitFor();
    await antor.unroute(/\/fiches\/\d+\/enfants/);
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  test('niveau disparu (404) en marche : « Introuvable. », le chemin garde le niveau, Remonter relit le niveau du dessus', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByLabel(/^Les Docks/).waitFor();
    await antor.route(new RegExp(`/fiches/${ids['Port-Sel']}/enfants`), (route: Any) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"erreur":"Introuvable."}' }));
    await d.getByRole('button', { name: 'Les Sphères', exact: true }).click();
    await d.getByLabel(/^Port-Sel/).waitFor();
    await d.getByRole('button', { name: 'Ouvrir « Port-Sel »' }).click();
    await d.getByText('Introuvable.').waitFor();
    assert.equal(await chemin(d), "Lame d'Ébène › Les Sphères › Port-Sel");
    await d.getByRole('button', { name: 'Remonter d’un niveau' }).click();
    await d.getByLabel(/^Port-Sel/).waitFor();
    assert.equal(await d.getByText('Introuvable.').count(), 0);
    await antor.unroute(new RegExp(`/fiches/${ids['Port-Sel']}/enfants`));
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  test('droit perdu (403) boîte ouverte : la boîte se ferme sans toast', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByLabel(/^Les Docks/).waitFor();
    await antor.route(/\/fiches\/\d+\/enfants/, (route: Any) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"erreur":"Refusé."}' }));
    await d.getByRole('button', { name: 'Les Sphères', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    assert.equal(await antor.getByText('Fiche déplacée.').count(), 0);
    await antor.unroute(/\/fiches\/\d+\/enfants/);
  });

  test('plus de 50 enfants : 50 puis « Charger la suite » (Chargement… inactif), les 50 premiers restent', async () => {
    const p = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Archipel' });
    for (let i = 1; i <= 55; i++) {
      await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: `Îlot ${String(i).padStart(2, '0')}`, parent: p.id });
    }
    const premier = (await api(antor, 'GET', `/api/univers/${U}/fiches?q=${encodeURIComponent('Îlot 01')}`)).fiches[0];
    ids['Îlot 01'] = premier.id;
    const d = await ouvrirBoite(antor, 'Îlot 01');
    await d.getByText('Îlot 01 (cette fiche)').waitFor();
    assert.equal(await d.getByRole('radio').count(), 51, 'Aucun parent + 50 lignes');
    let lenteur = true;
    await antor.route(/curseur=/, async (route: Any) => {
      while (lenteur) await new Promise((r) => setTimeout(r, 50));
      await route.continue();
    });
    const suite = d.getByRole('button', { name: 'Charger la suite' });
    await suite.click();
    const enCours = d.getByRole('button', { name: 'Chargement…' });
    try {
      await enCours.waitFor({ timeout: 3000 });
      assert.equal(await enCours.getAttribute('aria-disabled'), 'true');
    } finally {
      lenteur = false;
    }
    assert.equal(await d.getByRole('radio').count(), 51);
    lenteur = false;
    await d.getByLabel(/^Îlot 55/).waitFor();
    assert.equal(await d.getByRole('button', { name: 'Charger la suite' }).count(), 0);
    await antor.unroute(/curseur=/);
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  test('clavier : droite descend sur une ligne à enfants, gauche et retour arrière remontent, annonce « Niveau : … »', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByLabel(/^Les Docks/).waitFor();
    await d.getByRole('button', { name: 'Remonter d’un niveau' }).click();
    const pS = d.getByLabel(/^Port-Sel/);
    await pS.waitFor();
    await pS.focus();
    await antor.keyboard.press('ArrowRight');
    await d.getByLabel(/^Les Docks/).waitFor();
    assert.equal(await chemin(d), "Lame d'Ébène › Les Sphères › Port-Sel");
    await d.getByText('Niveau : Port-Sel').waitFor({ state: 'attached' });
    // « première ligne choisissable » : « Aucun parent » compte-t-elle ? (trou de la conception, non figé ici)
    assert.equal(await d.getByRole('radiogroup', { name: 'Nouveau parent' }).evaluate((g: Element) => g.contains(document.activeElement)), true, 'le focus reste dans la liste');
    await antor.keyboard.press('ArrowLeft');
    await d.getByLabel(/^Port-Sel/).waitFor();
    assert.equal(await chemin(d), "Lame d'Ébène › Les Sphères");
    await d.getByLabel(/^Port-Sel/).focus();
    await antor.keyboard.press('ArrowRight');
    await d.getByLabel(/^Les Docks/).waitFor();
    await antor.keyboard.press('Backspace');
    await d.getByLabel(/^Port-Sel/).waitFor();
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  test('chaîne de cinq niveaux : univers, « … », deux derniers maillons ; le menu « … » ouvre le niveau caché', async () => {
    let parent: number | undefined;
    const faits: Record<string, number> = {};
    for (const t of ['N1', 'N2', 'N3', 'N4', 'N5']) {
      const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: t, ...(parent ? { parent } : {}) });
      faits[t] = f.id;
      parent = f.id;
    }
    await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Feuille', parent: faits.N5 });
    const f6 = (await api(antor, 'GET', `/api/univers/${U}/fiches?q=Feuille`)).fiches[0];
    ids['Feuille'] = f6.id;
    const d = await ouvrirBoite(antor, 'Feuille');
    await d.getByText('Feuille (cette fiche)').waitFor();
    const nav = d.getByRole('navigation', { name: 'Chemin' });
    assert.equal(await nav.getByRole('button', { name: 'N1', exact: true }).count(), 0, 'N1 masqué');
    assert.equal(await nav.getByRole('button', { name: 'N4', exact: true }).count(), 1);
    assert.equal(await nav.getByText('N5', { exact: true }).count(), 1);
    await nav.getByRole('button', { name: '…' }).click();
    await antor.getByRole('menuitem', { name: /N1/ }).click();
    await d.getByLabel(/^N2/).waitFor();
    assert.equal(await chemin(d), "Lame d'Ébène › N1");
    await d.getByRole('button', { name: 'Annuler' }).click();
  });

  test('téléphone (390 px) : boîte plein écran, lignes et chevron de 44 px', async () => {
    await antor.setViewportSize({ width: 390, height: 800 });
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    const h = await d.getByLabel(/^Les Docks/).evaluate((e: Element) => (e.closest('label') as HTMLElement).getBoundingClientRect().height);
    assert.ok(h >= 44, `ligne ${h}px`);
    const nav = d.getByRole('navigation', { name: 'Chemin' });
    await nav.getByRole('button', { name: 'Les Sphères', exact: true }).or(nav.getByRole('button', { name: '…' })).first().waitFor();
    assert.equal(await nav.getByRole('button', { name: 'Lame d\'Ébène' }).count(), 1, 'l’univers reste dans le chemin');
    await d.getByRole('button', { name: 'Remonter d’un niveau' }).click();
    const chev = d.getByRole('button', { name: 'Ouvrir « Port-Sel »' });
    await chev.waitFor();
    const cb = await chev.boundingBox();
    assert.ok(cb.width >= 44 && cb.height >= 44, `chevron ${cb.width}x${cb.height}`);
    const b = await d.boundingBox();
    assert.ok(b.width >= 0.9 * 390, `largeur ${b.width}`); // comme « Changer le type » (Fenetre, 92vw)
    await d.getByRole('button', { name: 'Annuler' }).click();
    await antor.setViewportSize({ width: 1280, height: 720 });
  });

  test('téléphone (390 px), racine longue : titre, bascule et pied de la boîte restent atteignables, la liste défile dans la boîte', async () => {
    await antor.setViewportSize({ width: 390, height: 844 });
    const d = await ouvrirBoite(antor, 'Les Sphères');
    await d.getByText('Les Sphères (cette fiche)').waitFor();
    const b = await d.boundingBox();
    assert.ok(b.y >= 0 && b.y + b.height <= 844 + 0.5, `la boîte déborde de l'écran: y=${b.y} h=${b.height}`);
    for (const n of ['Arborescence', 'Annuler']) assert.equal(await d.getByRole('button', { name: n, exact: true }).isVisible(), true, n);
    await d.getByRole('button', { name: 'Annuler' }).click({ timeout: 3000 });
    await antor.setViewportSize({ width: 1280, height: 720 });
  });

  for (const [nom, w, h] of [['bureau', 1280, 720], ['téléphone', 390, 844]] as const) {
    test(`vue Arborescence (${nom}) : le type finit au même bord avec ou sans chevron, le chevron est dans la surbrillance du choix`, async () => {
      await antor.setViewportSize({ width: w, height: h });
      const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
      await d.getByText('La Taverne du Kraken (cette fiche)').waitFor();
      await d.getByRole('navigation', { name: 'Chemin' }).getByRole('button', { name: 'Lame d\'Ébène' }).click();
      await d.getByRole('button', { name: 'Ouvrir « Les Sphères »' }).waitFor();
      // right edge of the type text of every row (with, without chevron, the current sheet)
      const bords = await d.getByRole('radiogroup', { name: 'Nouveau parent' }).locator('.ligne-res').evaluateAll((rows: Element[]) =>
        rows
          .filter((r) => r.querySelector('.type-option'))
          .map((r) => ({ t: r.textContent, chevron: !!r.querySelector('.chevron-res'), droite: Math.round(r.querySelector('.type-option')!.getBoundingClientRect().right) })),
      );
      assert.ok(bords.some((b: Any) => b.chevron) && bords.some((b: Any) => !b.chevron), `il faut des lignes avec et sans chevron: ${JSON.stringify(bords)}`);
      assert.equal(new Set(bords.map((b: Any) => b.droite)).size, 1, `colonne des types dentelée: ${JSON.stringify(bords)}`);
      // the highlighted row contains the chevron
      await d.getByLabel(/^Les Sphères/).check();
      const ok = await d.getByLabel(/^Les Sphères/).evaluate((i: Element) => {
        const row = i.closest('.ligne-res')!;
        const fond = getComputedStyle(row).backgroundColor;
        const rr = row.getBoundingClientRect();
        const cb = row.querySelector('.chevron-res')!.getBoundingClientRect();
        return { fond, dedans: cb.right <= rr.right + 0.5 && cb.left >= rr.left };
      });
      assert.notEqual(ok.fond, 'rgba(0, 0, 0, 0)', 'la ligne entière (chevron compris) porte la surbrillance');
      assert.equal(ok.dedans, true);
      await d.getByRole('button', { name: 'Annuler' }).click();
    });
    test(`chemin profond à titre long (${nom}) : aucun maillon ne déborde de la boîte, le niveau courant cède en dernier`, async () => {
      await antor.setViewportSize({ width: w, height: h });
      let parent: number | undefined;
      let dernier = 0;
      for (const t of ['Les Archives de l’Amirauté', 'Archipel des Brumes Hurlantes', 'Les Grands Entrepôts Royaux', 'Chambre forte numéro neuf']) {
        const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: `${t} ${nom}`, ...(parent ? { parent } : {}) });
        parent = f.id;
        dernier = f.id;
      }
      const e = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: `Enfant du fond ${nom}`, parent: dernier });
      ids[`Enfant du fond ${nom}`] = e.id;
      const d = await ouvrirBoite(antor, `Enfant du fond ${nom}`);
      await d.getByText(`Enfant du fond ${nom} (cette fiche)`).waitFor();
      const nav = d.getByRole('navigation', { name: 'Chemin' });
      const m = await nav.evaluate((n: Element) => {
        const b = n.closest('[role="dialog"]')!.getBoundingClientRect();
        const kids = [...n.querySelectorAll('.maillon, .menu-declencheur')] as HTMLElement[];
        return {
          boiteDroite: b.right,
          debord: n.scrollWidth - n.clientWidth,
          maillons: kids.map((k) => ({ t: k.textContent, droite: k.getBoundingClientRect().right, w: k.getBoundingClientRect().width, tronque: k.scrollWidth > k.clientWidth })),
          courant: (() => { const c = n.querySelector('[aria-current="location"]') as HTMLElement; return { w: c.getBoundingClientRect().width, sw: c.scrollWidth, t: c.textContent }; })(),
        };
      });
      assert.ok(m.debord <= 0, `le chemin déborde de ${m.debord}px: ${JSON.stringify(m)}`);
      for (const k of m.maillons) assert.ok(k.droite <= m.boiteDroite + 0.5, `maillon « ${k.t} » hors de la boîte: ${JSON.stringify(m)}`);
      assert.ok(m.courant.w >= 40, `le niveau courant est écrasé: ${JSON.stringify(m.courant)}`);
      await d.getByRole('button', { name: 'Annuler' }).click();
    });
  }

  test('Docks puis Déplacer : rangée sous Les Docks, le fil d’Ariane le montre (critère de sortie)', async () => {
    const d = await ouvrirBoite(antor, 'La Taverne du Kraken');
    await d.getByLabel(/^Les Docks/).check();
    await d.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await antor.getByText('Fiche déplacée.').waitFor();
    await attendre(antor);
    const fil = (await antor.getByRole('navigation', { name: /Fil d.Ariane/i }).first().innerText()).replace(/\s*\n\s*/g, ' › ');
    assert.ok(fil.includes('Les Docks › La Taverne du Kraken'), fil);
  });
});
