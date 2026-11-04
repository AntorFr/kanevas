// Browser test of kanevas-outils-galaxie-tenir-ecran, written from the exit criterion and docs/ecrans.md
// « What kanevas-outils-galaxie-tenir builds of E-21 and E-10 » — not from the code. Stub world with the seed.
// Screenshots go to /tmp/cap-galaxie-tenir (never into the workspace). Waits are on what the user sees
// (or on the answer to the gesture), never on `networkidle` nor on a delay.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-tenir';
const R3 = Math.sqrt(3);

describe('E-21 en écriture et « Carte de la galaxie » dans E-10', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let adresse = '';
  let base = '';
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);

  const api = async (compte: string, method: string, path: string, data?: Any) => {
    const c = await connecte(browser, srv.base, compte);
    const r = await c.page.request.fetch(path, { method, data });
    const corps = await r.json().catch(() => null);
    await c.ctx.close();
    return { status: r.status(), corps };
  };
  const ouvre = async (compte: string, w = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    return c;
  };
  // Pixel centre of an hexagon, from two systems whose hexagons are known (Port-Sel 0,0 and Vael 7,0 of the seed).
  const centreSysteme = async (page: Any, nom: string) => {
    const b = await systeme(page, nom).locator('.gx-zone-touche').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const hex = async (page: Any, q: number, r: number) => {
    const p = await centreSysteme(page, 'Port-Sel');
    const v = await centreSysteme(page, 'Vael');
    const s = (v.x - p.x) / (7 * R3);
    return { x: p.x + s * R3 * (q + r / 2), y: p.y + s * 1.5 * r };
  };
  const toucher = async (page: Any, q: number, r: number) => {
    const p = await hex(page, q, r);
    await page.mouse.click(p.x, p.y);
  };
  const menu = async (page: Any, ouvrant: string, entree: string) => {
    await page.getByRole('button', { name: ouvrant }).click();
    await page.getByRole('menuitem', { name: entree }).click();
  };
  // An anonymous hexagon (no generated circle, no system) well inside the map, away from the ones used above.
  const hexVide = async (page: Any): Promise<[number, number]> => {
    const box = await page.locator('svg.gx-svg').boundingBox();
    for (const [q, r] of [[4, 8], [3, 8], [2, 7], [5, 7], [-2, 6], [6, 6], [0, 8], [1, 9]] as [number, number][]) {
      const p = await hex(page, q, r);
      const dedans = p.x > box.x + 20 && p.x < box.x + box.width - 20 && p.y > box.y + 20 && p.y < box.y + box.height - 20;
      const occupe = await page.evaluate(([x, y]: number[]) => [...document.querySelectorAll('g.gx-systeme .gx-zone-touche')].some((e) => {
        const b = e.getBoundingClientRect();
        return Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y) < 12;
      }), [p.x, p.y]);
      if (dedans && !occupe && (await page.locator(`circle[data-genere="${q},${r}"]`).count()) === 0) return [q, r];
    }
    throw new Error('aucun hexagone vide visible');
  };
  const section = (page: Any, nom: string) => page.getByRole('region', { name: nom });
  const attendreSysteme = async (page: Any, nom: string) => systeme(page, nom).waitFor();
  const lireJson = async (page: Any, chemin: string) => {
    const r = await page.request.get(chemin);
    return { status: r.status(), corps: await r.json().catch(() => null) };
  };

  before(async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-gxt-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    const gid = adresse.split('/').pop();
    base = `/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}`;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('Antor au bureau : place, trace, dessine, Mode Joueur sans commande, retour ; Léa ne voit rien des trois', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Vael');
    await hors(page, '01-bureau-mj');

    // Placer un système : Port Noir sur un hexagone anonyme (1, 0), « Secret (MJ seul) » activé
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    await toucher(page, 1, 0);
    await section(page, 'Nouveau système').waitFor();
    await page.getByLabel('Nom', { exact: true }).fill('Port Noir');
    await page.getByRole('switch', { name: 'Secret (MJ seul)' }).click();
    await hors(page, '02-formulaire-systeme');
    await page.getByRole('button', { name: 'Placer', exact: true }).click();
    await attendreSysteme(page, 'Port Noir');

    // Tracer une route privée Port Noir → Vael : la longueur est affichée, jamais saisie
    await page.getByRole('button', { name: 'Tracer une route' }).click();
    await page.getByText('Touchez le système de départ, puis celui d’arrivée.').waitFor();
    await systeme(page, 'Port Noir').click();
    await systeme(page, 'Vael').click();
    const route = section(page, 'Nouvelle route');
    await route.getByText('De Port Noir à Vael').waitFor();
    await route.getByText('Longueur : 6 cases').waitFor();
    assert.equal(await route.locator('input[type=number], input[name*=longueur i]').count(), 0, 'aucun champ de longueur');
    assert.equal(await route.getByRole('switch', { name: 'Route publique' }).getAttribute('aria-checked'), 'true', 'publique par défaut');
    await route.getByRole('switch', { name: 'Route publique' }).click();
    await hors(page, '03-route');
    await route.getByRole('button', { name: 'Tracer', exact: true }).click();
    await route.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelectorAll('.gx-route.privee').length === 2);

    // Dessiner une zone secrète : trois sommets dans un coin vide, « Terminer » activé dès le troisième
    await page.getByRole('button', { name: 'Dessiner une zone' }).click();
    await page.getByText('Touchez les sommets du contour, puis « Terminer ».').waitFor();
    await toucher(page, 3, 4);
    await toucher(page, 5, 4);
    assert.equal(await page.getByRole('button', { name: 'Terminer' }).isDisabled(), true, 'Terminer à partir de 3 points');
    await toucher(page, 4, 6);
    await page.getByRole('button', { name: 'Terminer' }).click();
    const zone = section(page, 'Nouvelle zone');
    await zone.getByLabel('Nom', { exact: true }).fill('Brèche noire');
    await zone.getByRole('switch', { name: 'Secrète' }).click();
    await hors(page, '04-zone');
    await zone.getByRole('button', { name: 'Dessiner', exact: true }).click();
    await zone.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelectorAll('[data-zone]').length === 2);

    await hors(page, '04b-apres-zone');
    await ctx.close();
  });

  it('Léa ne voit ni Port Noir, ni la route privée, ni la zone secrète : carte, trajet et recherche', async () => {
    const l = await ouvre('Léa');
    await l.page.goto(adresse);
    await attendreSysteme(l.page, 'Vael');
    assert.equal(await systeme(l.page, 'Port Noir').count(), 0);
    assert.equal(await l.page.locator('.gx-route.privee, [data-zone]').count(), 0);
    await l.page.getByLabel('Rechercher un système', { exact: true }).first().fill('Noir');
    await l.page.getByText('Aucun système ne correspond.').first().waitFor();
    const rl = await lireJson(l.page, `${base}/recherche?q=Noir`);
    assert.ok(!JSON.stringify(rl.corps).includes('Port Noir'), 'la recherche de Léa ne trahit pas Port Noir');
    await l.ctx.close();
  });

  // The Mode Joueur of the exit criterion, in the state the gestures leave: the last thing drawn is selected.
  it('Antor bascule en Mode Joueur juste après avoir tracé : la carte reste lisible, sans Port Noir, route ni zone', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Port Noir');
    await systeme(page, 'Port Noir').click();
    await section(page, 'Système sélectionné').getByRole('heading', { name: 'Port Noir' }).waitFor();
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    // Port Noir leaves the map; the rest of the map must stay (the page does not turn to « Page introuvable. »).
    await page.waitForFunction(() => document.querySelector('g.gx-systeme[aria-label="Port Noir"]') === null);
    await attendreSysteme(page, 'Vael');
    assert.equal(await page.getByText('Page introuvable.').count(), 0, 'la page du joueur n\'est pas « Page introuvable. »');
    await hors(page, '05b-mode-joueur-selection');
    await ctx.close();
  });

  it('Antor en Mode Joueur : Port Noir, la route et la zone absents de la carte et de la recherche, aucune commande d\'écriture, retour en Mode MJ', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Port Noir');
    assert.equal(await page.locator('.gx-route.privee').count(), 2);
    assert.equal(await page.locator('[data-zone]').count(), 2);
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await page.waitForFunction(() => document.querySelector('g.gx-systeme[aria-label="Port Noir"]') === null);
    await attendreSysteme(page, 'Vael');
    assert.equal(await page.locator('[data-zone]').count(), 0, 'aucune zone en Mode Joueur');
    assert.equal(await page.locator('.gx-route.privee').count(), 0, 'aucune route privée en Mode Joueur');
    for (const n of ['Placer un système', 'Tracer une route', 'Dessiner une zone', 'Modifier la carte ▾', 'Galaxie ▾']) {
      assert.equal(await page.getByRole('button', { name: n }).count(), 0, `${n} absent`);
    }
    const t = await texte(page);
    for (const m of ['Promouvoir', 'Renommer', 'Supprimer la galaxie', 'Graine', 'Document MJ']) assert.ok(!t.includes(m), `${m} absent`);
    await page.getByLabel('Rechercher un système', { exact: true }).first().fill('Noir');
    await page.getByText('Aucun système ne correspond.').first().waitFor();
    await hors(page, '05-mode-joueur');
    await page.getByRole('radio', { name: /^Mode MJ$|MJ$/ }).first().click();
    await page.getByRole('button', { name: 'Placer un système' }).waitFor();
    await attendreSysteme(page, 'Port Noir');
    await ctx.close();
  });

  it('Antor : promeut « Relais », déplace Vael, conflit avec Mira puis « Recharger », change la graine', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Vael');

    // Promouvoir une case générée
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    // a generated hexagon well inside the map, clear of the zoom buttons and the legend
    const cible = (await page.evaluate(() => {
      const c = document.querySelector('svg.gx-svg')!.getBoundingClientRect();
      for (const e of document.querySelectorAll('circle.gx-genere')) {
        const r = e.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        if (x > c.left + 40 && x < c.right - 140 && y > c.top + 40 && y < c.bottom - 150) return e.getAttribute('data-genere');
      }
      return null;
    })) as string;
    assert.ok(cible, 'une case générée visible');
    const [gq, gr] = cible!.split(',').map(Number);
    const cb = await page.locator(`circle[data-genere="${cible}"]`).boundingBox();
    await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await section(page, 'Promouvoir ce système').waitFor();
    await page.getByLabel('Nom', { exact: true }).fill('Relais');
    await hors(page, '06-promouvoir');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await attendreSysteme(page, 'Relais');
    const relais = await lireJson(page, `${base}/systemes/relais`);
    assert.equal(relais.status, 200);
    assert.deepEqual([relais.corps.q, relais.corps.r], [gq, gr], 'Relais est à l\'hexagone touché');

    // Déplacer Vael d'un hexagone (the map was centred on Relais: « Recentrer » brings Vael back)
    await page.getByRole('button', { name: 'Recentrer' }).click();
    await attendreSysteme(page, 'Vael');
    await systeme(page, 'Vael').click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await section(page, 'Modifier le système').getByRole('button', { name: 'Déplacer' }).click();
    await page.getByText('Touchez le nouvel hexagone.').waitFor();
    const avant = await lireJson(page, `${base}/systemes/vael`);
    await toucher(page, 7, -1);
    await section(page, 'Modifier le système').getByText(/routes seront recalculées/).waitFor();
    await section(page, 'Modifier le système').getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('section[aria-label="Modifier le système"]'));
    const apres = await lireJson(page, `${base}/systemes/vael`);
    assert.deepEqual([apres.corps.q, apres.corps.r], [7, -1], `Vael déplacé (avant ${avant.corps.q},${avant.corps.r})`);

    // Antor ouvre « Modifier » ; Mira modifie Vael avec la version lue ; Antor enregistre → conflit, puis « Recharger »
    await systeme(page, 'Vael').click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = section(page, 'Modifier le système');
    await form.waitFor();
    const version = (await lireJson(page, `${base}/systemes/vael`)).corps.version;
    const m = await api('Mira', 'PATCH', `${base}/systemes/vael`, { notes: 'Notes de Mira', version });
    assert.equal(m.status, 200);
    await form.getByLabel('Notes', { exact: true }).fill('Notes d\'Antor');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await form.getByText('Ce système a changé depuis que vous l’avez ouvert.').waitFor();
    await hors(page, '07-conflit');
    await form.getByRole('button', { name: 'Recharger' }).click();
    await page.waitForFunction(() => (document.querySelector('section[aria-label="Modifier le système"] textarea') as HTMLTextAreaElement)?.value === 'Notes de Mira');
    await form.getByRole('button', { name: 'Annuler' }).click();

    // Graine : le dialogue confirme, « Relais » reste en place, un système non défini a bougé
    const genereAvant = await page.locator('circle.gx-genere').evaluateAll((e: Any[]) => e.map((x) => x.getAttribute('data-genere')).sort());
    await menu(page, 'Galaxie ▾', 'Graine…');
    const dlg = page.getByRole('dialog');
    await dlg.getByText('essai-1').waitFor();
    await dlg.getByLabel('Nouvelle graine').fill('autre-graine');
    await dlg.getByRole('button', { name: 'Changer la graine' }).click();
    await page.getByText('Tous les systèmes non définis changent de place.').waitFor();
    await hors(page, '08-graine-confirmation');
    await page.getByRole('button', { name: 'Changer la graine' }).last().click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await attendreSysteme(page, 'Relais');
    await page.waitForFunction((av: string[]) => {
      const nv = [...document.querySelectorAll('circle.gx-genere')].map((x) => x.getAttribute('data-genere')).sort();
      return JSON.stringify(nv) !== JSON.stringify(av);
    }, genereAvant);
    const r2 = await lireJson(page, `${base}/systemes/relais`);
    assert.deepEqual([r2.corps.q, r2.corps.r], [gq, gr], 'Relais n\'a pas bougé');
    await ctx.close();
  });

  it('Antor : « Document MJ… » crée la fiche, Léa ne la lit pas, le septième système la périme, proposition en attente puis abandonnée', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Vael');
    await menu(page, 'Galaxie ▾', 'Document MJ…');
    let dlg = page.getByRole('dialog');
    await dlg.getByText('Seul le MJ lit ce document.').waitFor();
    await dlg.getByRole('button', { name: 'Créer une fiche de type Savoir' }).click();
    assert.equal(await dlg.getByLabel('Titre').inputValue(), 'Galaxie — notes MJ');
    await dlg.getByRole('button', { name: 'Écrire le document' }).click();
    await dlg.getByText('Document dans « Galaxie — notes MJ »').waitFor();
    await dlg.getByText('À jour.').waitFor();
    const fiche = (await dlg.getByRole('link', { name: 'Ouvrir la fiche' }).getAttribute('href'))!;
    await hors(page, '09-document');
    await dlg.getByRole('button', { name: 'Fermer' }).click();
    const ficheId = fiche.split('/').pop();

    // Léa ne lit pas la section « Document MJ »
    const l = await ouvre('Léa');
    const lf = await lireJson(l.page, `/api/univers/${univers}/fiches/${ficheId}`);
    assert.ok(!JSON.stringify(lf.corps).includes('Document MJ') || lf.status === 404, 'Léa ne lit pas le document');
    assert.ok(!JSON.stringify(lf.corps).includes('Port-Sel'), 'le contenu du document ne fuit pas');
    await l.ctx.close();

    // Un système de plus (le septième) : le document est périmé, proposition en attente, pas de « Proposer »
    await page.getByRole('button', { name: 'Placer un système' }).click();
    const [vq, vr] = await hexVide(page);
    await toucher(page, vq, vr);
    await section(page, 'Nouveau système').waitFor();
    await page.getByLabel('Nom', { exact: true }).fill('Septième');
    await page.getByRole('button', { name: 'Placer', exact: true }).click();
    await attendreSysteme(page, 'Septième');
    await menu(page, 'Galaxie ▾', 'Document MJ…');
    dlg = page.getByRole('dialog');
    await dlg.getByText('Le document n’est plus à jour.').waitFor();
    await dlg.getByText(/Proposition en attente/).waitFor();
    assert.equal(await dlg.getByRole('button', { name: 'Proposer la mise à jour' }).count(), 0);
    await hors(page, '10-document-perime');
    await dlg.getByRole('button', { name: 'Fermer' }).click();

    // Abandonnée, la proposition fait revenir « Proposer la mise à jour »
    const doc = await lireJson(page, `${base}/document`);
    assert.equal(doc.corps.etat, 'perime');
    const pid = doc.corps.propositionId;
    assert.ok(pid > 0);
    const ab = await page.request.post(`/api/univers/${univers}/propositions/${pid}/abandonner`);
    assert.ok(ab.status() < 300, `abandon ${ab.status()}`);
    await menu(page, 'Galaxie ▾', 'Document MJ…');
    dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Proposer la mise à jour' }).waitFor();
    assert.equal(await dlg.getByText(/Proposition en attente/).count(), 0);
    await hors(page, '11-document-abandon');
    await dlg.getByRole('button', { name: 'Fermer' }).click();
    await ctx.close();
  });

  it('erreurs montrées : nom vide, hexagone pris, deux extrémités égales, route existante, contour croisé, échec d\'écriture, connexion perdue — rien n\'est créé', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Vael');

    // nom vide
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    const [vq, vr] = await hexVide(page);
    await toucher(page, vq, vr);
    const form = section(page, 'Nouveau système');
    await form.getByRole('button', { name: 'Placer', exact: true }).click();
    await form.getByText('Erreur : le nom est obligatoire.').waitFor();
    await hors(page, '15-nom-vide');

    // échec d'écriture : les champs sont gardés
    await form.getByLabel('Nom', { exact: true }).fill('Échec');
    await page.route('**/galaxie/galaxies/*/systemes', (r: Any) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
    await form.getByRole('button', { name: 'Placer', exact: true }).click();
    await form.getByText('L’enregistrement a échoué. Réessayez.').waitFor();
    assert.equal(await form.getByLabel('Nom', { exact: true }).inputValue(), 'Échec', 'champs conservés');
    await hors(page, '16-echec-ecriture');
    await page.unroute('**/galaxie/galaxies/*/systemes');

    // connexion perdue : contrôles désactivés, champs conservés
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.getByText('Connexion perdue.').first().waitFor();
    assert.equal(await form.getByRole('button', { name: 'Placer', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Tracer une route' }).isDisabled(), true);
    assert.equal(await form.getByLabel('Nom', { exact: true }).inputValue(), 'Échec');
    await hors(page, '17-connexion-perdue');
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByText('Connexion perdue.').waitFor({ state: 'detached' });
    await form.getByRole('button', { name: 'Annuler' }).click();

    // hexagone pris : Hesper vers l'hexagone de Port-Sel
    await systeme(page, 'Hesper').click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const mod = section(page, 'Modifier le système');
    await mod.getByRole('button', { name: 'Déplacer' }).click();
    await page.getByText('Touchez le nouvel hexagone.').waitFor();
    await toucher(page, 0, 0);
    await mod.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await mod.getByText('Cet hexagone porte déjà un système.').waitFor();
    await hors(page, '18-hexagone-pris');
    await mod.getByRole('button', { name: 'Annuler' }).click();

    // deux extrémités égales, puis route existante
    await page.getByRole('button', { name: 'Tracer une route' }).click();
    await systeme(page, 'Vael').click();
    await systeme(page, 'Vael').click();
    await page.getByText('Choisissez deux systèmes différents.').waitFor();
    assert.equal(await section(page, 'Nouvelle route').count(), 0, 'aucun formulaire de route');
    await hors(page, '19-meme-extremite');
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await page.getByRole('button', { name: 'Tracer une route' }).click();
    await systeme(page, 'Port-Sel').click();
    await systeme(page, 'Vael').click();
    await section(page, 'Nouvelle route').getByRole('button', { name: 'Tracer', exact: true }).click();
    await page.getByText('Ces deux systèmes sont déjà reliés.').waitFor();
    await hors(page, '20-route-existante');
    await section(page, 'Nouvelle route').getByRole('button', { name: 'Annuler' }).click();

    // contour croisé (nœud papillon)
    await page.getByRole('button', { name: 'Dessiner une zone' }).click();
    for (const [q, r] of [[3, 4], [5, 6], [5, 4], [3, 6]]) await toucher(page, q, r);
    await page.getByRole('button', { name: 'Terminer' }).click();
    const z = section(page, 'Nouvelle zone');
    await z.getByLabel('Nom', { exact: true }).fill('Croisée');
    await z.getByRole('button', { name: 'Dessiner', exact: true }).click();
    await z.getByText('Ce contour se croise. Corrigez-le.').waitFor();
    await hors(page, '21-contour-croise');
    await z.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await page.locator('[data-zone]').count(), 2, 'aucune zone de plus');
    assert.equal(await page.locator('.gx-route.privee').count(), 2, 'aucune route de plus');
    await ctx.close();
  });

  it('à 390 px : « Modifier la carte ▾ » porte les gestes, le formulaire s\'ouvre sous la carte, contrôles de 44 px ; Léa n\'a aucune commande', async () => {
    const { page, ctx } = await ouvre('Antor', 390, 780);
    await page.goto(adresse);
    await attendreSysteme(page, 'Port-Sel').catch(() => undefined);
    await page.getByRole('button', { name: 'Modifier la carte ▾' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Placer un système' }).count(), 0, 'les gestes sont dans le menu');
    assert.ok((await page.getByRole('button', { name: 'Modifier la carte ▾' }).boundingBox()).height >= 44);
    await page.getByRole('button', { name: 'Modifier la carte ▾' }).click();
    const noms = await page.getByRole('menuitem').allInnerTexts();
    for (const n of ['Placer un système', 'Tracer une route', 'Dessiner une zone', 'Renommer', 'Graine…', 'Document MJ…', 'Supprimer la galaxie…']) {
      assert.ok(noms.some((x: string) => x.includes(n)), `${n} dans le menu`);
    }
    await hors(page, '22-390-menu');
    await page.getByRole('menuitem', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    const box = await page.locator('svg.gx-svg').boundingBox();
    // an anonymous hexagon near the middle of the map: try a few points until the form opens
    const cadre = { x: box.x + box.width / 2, y: box.y + box.height * 0.8 };
    await page.mouse.click(cadre.x, cadre.y);
    const form = page.getByRole('region', { name: /Nouveau système|Promouvoir ce système/ });
    await form.waitFor();
    const dessous = await page.evaluate(() => {
      const c = document.querySelector('svg.gx-svg')!.getBoundingClientRect();
      const f = document.querySelector('section.gx-form')!.getBoundingClientRect();
      return f.top >= c.bottom - 2;
    });
    assert.ok(dessous, 'le formulaire s\'ouvre sous la carte');
    const petits = await form.evaluate((f: Element) => [...f.querySelectorAll('button, input:not([type=radio]):not([type=checkbox]), select, textarea, [role=switch], label:has(input[type=radio])')]
      .map((e) => ({ n: (e.getAttribute('aria-label') || e.textContent || (e as HTMLInputElement).name || e.tagName).trim().slice(0, 30), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
      .filter((x) => x.h > 0 && (x.h < 44 || x.w < 44)));
    assert.deepEqual(petits, [], 'chaque contrôle fait 44 px ou plus');
    await hors(page, '23-390-formulaire');
    await form.getByRole('button', { name: 'Annuler' }).click();
    await ctx.close();

    for (const compte of ['Léa']) {
      const c = await ouvre(compte, 390, 780);
      await c.page.goto(adresse);
      await attendreSysteme(c.page, 'Vael').catch(async () => { await c.page.getByRole('button', { name: 'Zoom arrière' }).click(); await attendreSysteme(c.page, 'Vael'); });
      assert.equal(await c.page.getByRole('button', { name: /Modifier la carte|Placer un système|Galaxie ▾/ }).count(), 0, `${compte} : aucun contrôle d'écriture`);
      assert.equal(await c.page.getByRole('radio', { name: /Joueur/ }).count(), 0, `${compte} : aucune bascule`);
      await c.ctx.close();
    }
  });

  it('Antor : « Supprimer la galaxie… » compte 7 systèmes, 4 routes et 2 zones, puis efface', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await attendreSysteme(page, 'Vael');
    await menu(page, 'Galaxie ▾', 'Supprimer la galaxie…');
    const dlg = page.getByRole('alertdialog');
    await dlg.getByText('Les 7 systèmes, 4 routes et 2 zones de cette galaxie seront effacés.').waitFor();
    await dlg.getByText(/Sa section « Document MJ » de la fiche « Galaxie — notes MJ » sera retirée\./).waitFor();
    await hors(page, '12-suppression');
    await dlg.getByRole('button', { name: 'Effacer la galaxie' }).click();
    await page.waitForURL(new RegExp(`/univers/${univers}/cartes$`));
    const apres = await lireJson(page, base);
    assert.equal(apres.status, 404, 'la galaxie est effacée');
    await ctx.close();
  });

  it('E-10 : « Carte de la galaxie » crée « Galaxie neuve » (MJ seul), la renomme, la rend visible à Léa, la recache', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(`/univers/${univers}/cartes`);
    await page.getByRole('button', { name: 'Nouvelle carte' }).click();
    await page.getByLabel('Forme').selectOption({ label: 'Carte de la galaxie' });
    assert.equal(await page.getByLabel('Image de fond').count(), 0, 'pas d\'image de fond');
    await page.getByLabel('Titre').fill('Galaxie neuve');
    await hors(page, '13-e10-forme');
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await page.waitForURL(/\/outils\/swn\/galaxie\/\d+$/);
    const adr = new URL(page.url()).pathname;
    await page.getByRole('heading', { name: 'Galaxie neuve' }).waitFor();
    await page.getByText('MJ seul').first().waitFor();
    await page.getByText('Aucun système défini.', { exact: false }).waitFor();

    const l = await ouvre('Léa');
    const liste = async () => JSON.stringify((await lireJson(l.page, `/api/univers/${univers}/cartes`)).corps.cartes.map((c: Any) => c.titre));
    assert.ok(!(await liste()).includes('Galaxie neuve'), 'Léa ne la liste pas');

    await menu(page, 'Galaxie ▾', 'Renommer');
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Titre').fill('Galaxie du bord');
    await dlg.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('heading', { name: 'Galaxie du bord' }).waitFor();

    await page.goto(`/univers/${univers}/cartes`);
    const ligne = page.locator('li').filter({ hasText: 'Galaxie du bord' });
    await ligne.getByRole('button', { name: 'Rendre visible' }).click();
    await ligne.getByRole('button', { name: 'Cacher aux joueurs' }).waitFor();
    await hors(page, '14-e10-visible');
    assert.ok((await liste()).includes('Galaxie du bord'), 'Léa la liste une fois visible');
    await l.page.goto(`/univers/${univers}/cartes`);
    await l.page.getByText('Galaxie du bord').first().waitFor();
    await l.page.goto(adr);
    await l.page.getByRole('heading', { name: 'Galaxie du bord' }).waitFor();
    assert.equal(await l.page.getByRole('button', { name: /Placer un système|Galaxie ▾/ }).count(), 0, 'Léa : aucun contrôle d\'écriture');
    assert.equal(await l.page.getByRole('radio', { name: /Joueur/ }).count(), 0, 'Léa : aucune bascule');

    await ligne.getByRole('button', { name: 'Cacher aux joueurs' }).click();
    await ligne.getByRole('button', { name: 'Rendre visible' }).waitFor();
    await l.page.goto(adr);
    await l.page.getByText('Page introuvable.').waitFor();
    await l.ctx.close();
    await ctx.close();
  });
});
