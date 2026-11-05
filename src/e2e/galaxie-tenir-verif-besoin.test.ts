// Verification tests of kanevas-outils-galaxie-tenir, written from the feature sheet and from the states of
// docs/ecrans.md (E-21 in writing, E-10) — not from the code. Complements the integration tests: these cover the
// states of the table « State (adds to the table of E-21) » and the delete / remove confirmations.
// Real server in stub mode with its world, real Chromium. Each test works in its own fresh galaxy so that the
// tests do not depend on one another. Screenshots go to /tmp/cap-galaxie-verif (outside the tree).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-verif';
const R3 = Math.sqrt(3);

describe('E-21 en écriture : états, confirmations et conflits (vérification)', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const section = (page: Any, nom: string) => page.getByRole('region', { name: nom });

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
  const base = (gid: number) => `/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}`;
  // A fresh galaxy of Antor: « Alpha » (0,0), « Beta » (7,0), « Gamma » (1,5); routes Alpha–Beta and Alpha–Gamma.
  const galaxie = async (titre: string, avec: { routes?: boolean; zone?: boolean } = { routes: true }) => {
    const c = await api('Antor', 'POST', `/api/univers/${univers}/outils/swn/galaxie/cartes`, { titre });
    assert.equal(c.status, 201, JSON.stringify(c.corps));
    const gid = c.corps.id as number;
    for (const [nom, q, r] of [['Alpha', 0, 0], ['Beta', 7, 0], ['Gamma', 1, 5]] as [string, number, number][]) {
      assert.equal((await api('Antor', 'POST', `${base(gid)}/systemes`, { nom, q, r })).status, 201);
    }
    if (avec.routes) {
      assert.equal((await api('Antor', 'POST', `${base(gid)}/routes`, { depuis: 'alpha', vers: 'beta' })).status, 201);
      assert.equal((await api('Antor', 'POST', `${base(gid)}/routes`, { depuis: 'alpha', vers: 'gamma' })).status, 201);
    }
    return { gid, adresse: `/univers/${univers}/outils/swn/galaxie/${gid}` };
  };
  const centre = async (page: Any, nom: string) => {
    const b = await systeme(page, nom).locator('.gx-zone-touche').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const lire = async (page: Any) => {
    const p = await centre(page, 'Alpha');
    const v = await centre(page, 'Beta');
    return { p, v };
  };
  // Positions of « Alpha » and « Beta » identical on two reads one frame apart (the map stops moving: fit, blocks loading).
  const stable = async (page: Any) => {
    let lu = await lire(page);
    for (let i = 0; i < 100; i++) {
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
      const suite = await lire(page);
      if (JSON.stringify(suite) === JSON.stringify(lu)) return suite;
      lu = suite;
    }
    throw new Error(`La carte ne se stabilise pas : ${JSON.stringify(lu)}`);
  };
  // The blocks around the view are loaded (no hatched block left): until then a generated hexagon is not known as such.
  const blocsLus = (page: Any) => page.waitForFunction(
    () => !document.querySelector('.gx-manquant') && !document.querySelector('.gx-chargement'), undefined, { timeout: 10000 },
  ).catch(() => undefined);
  // Taps hexagon (q, r) on a settled map, then checks the caller's effect; without it, reads again and retries (3 tries).
  // With `libre`, a hexagon the engine generated a system on (« Promouvoir ce système », not « Nouveau système ») is
  // skipped for the next one to its right: which hexagons are generated depends on the galaxy, not on the test.
  const toucher = async (page: Any, q: number, r: number, effet: () => Promise<void>, libre = false) => {
    let dernier = '';
    for (let essai = 1; essai <= 3; essai++) {
      await blocsLus(page);
      const { p, v } = await stable(page);
      const s = (v.x - p.x) / (7 * R3);
      const place = (dq: number) => ({ x: p.x + s * R3 * (q + dq + r / 2), y: p.y + s * 1.5 * r });
      let dq = 0;
      if (libre) {
        const genere = await page.evaluate(() => [...document.querySelectorAll('.gx-genere')].map((c) => {
          const b = c.getBoundingClientRect();
          return [b.x + b.width / 2, b.y + b.height / 2];
        }));
        while (dq < 6 && genere.some(([gx, gy]: number[]) => Math.hypot(gx! - place(dq).x, gy! - place(dq).y) < s * 0.5)) dq++;
      }
      const { x, y } = place(dq);
      const heading = await page.evaluate(() => [...document.querySelectorAll('[role="region"]')].map((e) => e.getAttribute('aria-label')).join('|'));
      dernier = `hexagone (${q + dq}, ${r}) visé en (${x}, ${y}), Alpha ${JSON.stringify(p)}, Beta ${JSON.stringify(v)}, échelle ${s}, régions « ${heading} »`;
      await page.mouse.click(x, y);
      try { await effet(); return; } catch { /* the map moved under the click: read again */ }
    }
    throw new Error(`Le toucher n’a eu aucun effet en 3 essais : ${dernier}`);
  };
  const apparu = (f: Any) => () => f.waitFor({ timeout: 2000 });
  const sommets = (page: Any, n: number) => async () => {
    await page.waitForFunction((k: number) => document.querySelectorAll('.gx-trace circle').length === k, n, { timeout: 2000 });
  };
  const menu = async (page: Any, ouvrant: string, entree: string) => {
    await page.getByRole('button', { name: ouvrant }).click();
    await page.getByRole('menuitem', { name: entree }).click();
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(mkdtempSync(join(tmpdir(), 'kanevas-gxv-')), 'k.db') });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  // Panne attrapée : la confirmation de retrait ne cite pas le nombre de routes, ou le retrait ne les emporte pas.
  it('Retirer « Alpha » : la confirmation dit « Ses 2 routes seront effacées. », « Annuler » ne retire rien, la confirmation efface le système et ses 2 routes', async () => {
    const { gid, adresse } = await galaxie('Retrait');
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Alpha').waitFor();
    await systeme(page, 'Alpha').click();
    await page.getByRole('button', { name: 'Retirer', exact: true }).click();
    const dlg = page.getByRole('alertdialog');
    await dlg.getByText('Retirer « Alpha » ? Ses 2 routes seront effacées.').waitFor();
    await hors(page, 'retirer-confirmation');
    await dlg.getByRole('button', { name: 'Annuler' }).click();
    await dlg.waitFor({ state: 'detached' });
    assert.equal((await page.request.get(`${base(gid)}/systemes/alpha`)).status(), 200, 'Annuler ne retire rien');
    await systeme(page, 'Alpha').click();
    await page.getByRole('button', { name: 'Retirer', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^Retirer/ }).click();
    await systeme(page, 'Alpha').waitFor({ state: 'detached' });
    assert.equal((await page.request.get(`${base(gid)}/systemes/alpha`)).status(), 404);
    const c = await (await page.request.get(`${base(gid)}/contenu`)).json();
    assert.deepEqual([c.systemes, c.routes, c.zones], [2, 0, 0]);
    await ctx.close();
  });

  // Panne attrapée : un champ hors bornes est accepté, ou l'erreur est muette, ou la création a quand même lieu.
  it('Formulaire de système : nom de 81 caractères, notes de 2 001 caractères : les erreurs du tableau d’états, rien n’est créé', async () => {
    const { gid, adresse } = await galaxie('Bornes', { routes: false });
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Alpha').waitFor();
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    const f = section(page, 'Nouveau système');
    await toucher(page, 4, 8, apparu(f), true);
    await f.getByLabel('Nom', { exact: true }).fill('n'.repeat(81));
    await f.getByRole('button', { name: 'Placer', exact: true }).click();
    await f.getByText('Erreur : 80 caractères au plus.').waitFor();
    await f.getByLabel('Nom', { exact: true }).fill('Limite');
    await f.getByLabel('Notes', { exact: true }).fill('x'.repeat(2001));
    await f.getByRole('button', { name: 'Placer', exact: true }).click();
    await f.getByText('Erreur : 2 000 caractères au plus.').waitFor();
    await hors(page, 'bornes-systeme');
    const c = await (await page.request.get(`${base(gid)}/contenu`)).json();
    assert.equal(c.systemes, 3, 'rien n’est créé');
    await f.getByLabel('Notes', { exact: true }).fill('x'.repeat(2000));
    await f.getByRole('button', { name: 'Placer', exact: true }).click();
    await systeme(page, 'Limite').waitFor();
    await ctx.close();
  });

  it('Formulaire de zone : densité 101 refusée « Erreur : entre 0 et 100. », 100 acceptée', async () => {
    const { gid, adresse } = await galaxie('Densité', { routes: false });
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Alpha').waitFor();
    await page.getByRole('button', { name: 'Dessiner une zone' }).click();
    await toucher(page, 3, 4, sommets(page, 1));
    await toucher(page, 5, 4, sommets(page, 2));
    await toucher(page, 4, 6, sommets(page, 3));
    await page.getByRole('button', { name: 'Terminer' }).click();
    const z = section(page, 'Nouvelle zone');
    await z.getByLabel('Nom', { exact: true }).fill('Dense');
    await z.getByLabel('Densité de systèmes').fill('101');
    await z.getByRole('button', { name: 'Dessiner', exact: true }).click();
    await z.getByText('Erreur : entre 0 et 100.').waitFor();
    await hors(page, 'densite');
    assert.equal((await (await page.request.get(`${base(gid)}/contenu`)).json()).zones, 0);
    await z.getByLabel('Densité de systèmes').fill('100');
    await z.getByRole('button', { name: 'Dessiner', exact: true }).click();
    await z.waitFor({ state: 'detached' });
    assert.equal((await (await page.request.get(`${base(gid)}/contenu`)).json()).zones, 1);
    await ctx.close();
  });

  // Panne attrapée : le décompte lu à l'ouverture sert à effacer une galaxie qui a changé depuis.
  it('Supprimer la galaxie : singulier/pluriel (« 1 système », « 0 route », « 1 zone ») ; un décompte périmé affiche « Cette galaxie a changé : relisez le décompte. » et n’efface rien', async () => {
    const c = await api('Antor', 'POST', `/api/univers/${univers}/outils/swn/galaxie/cartes`, { titre: 'Petite' });
    const gid = c.corps.id as number;
    assert.equal((await api('Antor', 'POST', `${base(gid)}/systemes`, { nom: 'Seul', q: 0, r: 0 })).status, 201);
    assert.equal((await api('Antor', 'POST', `${base(gid)}/zones`, { nom: 'Unique', contour: [[3, 3], [5, 3], [4, 5]] })).status, 201);
    const { page, ctx } = await ouvre('Antor');
    await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}`);
    await systeme(page, 'Seul').waitFor();
    await menu(page, 'Galaxie ▾', 'Supprimer la galaxie…');
    const dlg = page.getByRole('alertdialog');
    await dlg.getByText(/1 système, 0 route et 1 zone/).waitFor();
    await hors(page, 'suppression-singulier');
    const t = await dlg.innerText();
    assert.ok(!/1 systèmes|0 routes|1 zones/.test(t), t);
    // un autre geste ajoute un système pendant que le dialogue est ouvert
    assert.equal((await api('Mira', 'POST', `${base(gid)}/systemes`, { nom: 'Surprise', q: 2, r: 2 })).status, 201);
    await dlg.getByRole('button', { name: 'Effacer la galaxie' }).click();
    await dlg.getByText('Cette galaxie a changé : relisez le décompte.').waitFor();
    await dlg.getByText(/2 systèmes, 0 route et 1 zone/).waitFor();
    await hors(page, 'suppression-decompte-perime');
    assert.equal((await page.request.get(base(gid))).status(), 200, 'rien n’est effacé sur un décompte périmé');
    await dlg.getByRole('button', { name: 'Effacer la galaxie' }).click();
    await page.waitForURL(new RegExp(`/univers/${univers}/cartes$`));
    assert.equal((await page.request.get(base(gid))).status(), 404);
    await ctx.close();
  });

  // Panne attrapée : le conflit de version n'est géré que pour les systèmes.
  it('Conflit sur une route : Mira la modifie avec la version lue, Antor enregistre : « Cette route a changé depuis que vous l’avez ouverte. » + « Recharger »', async () => {
    const { gid, adresse } = await galaxie('Conflit route');
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Alpha').waitFor();
    await page.locator('.gx-route').first().click({ force: true });
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.getByRole('region', { name: /route/i }).last();
    await form.waitFor();
    const blocs = await (await page.request.get(`${base(gid)}/blocs?de=-2,-2&a=2,2`)).json();
    const route = blocs.routes[0];
    const m = await api('Mira', 'PATCH', `${base(gid)}/routes/${route.id}`, { publique: false, version: route.version });
    assert.equal(m.status, 200, JSON.stringify(m.corps));
    await form.getByRole('switch').first().click();
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await form.getByText('Cette route a changé depuis que vous l’avez ouverte.').waitFor();
    await hors(page, 'conflit-route');
    await form.getByRole('button', { name: 'Recharger' }).waitFor();
    await ctx.close();
  });

  // Panne attrapée : basculer en Mode Joueur laisse un formulaire ouvert, ou son brouillon survit au retour.
  it('Mode Joueur pendant un formulaire : il disparaît avec son brouillon, aucune commande d’écriture ; de retour en Mode MJ le formulaire est vierge et rien n’est créé', async () => {
    const { gid, adresse } = await galaxie('Mode joueur', { routes: false });
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Alpha').waitFor();
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    const f = section(page, 'Nouveau système');
    await toucher(page, 4, 8, apparu(f), true);
    await f.getByLabel('Nom', { exact: true }).fill('Brouillon');
    await page.getByRole('radio', { name: 'Mode Joueur' }).click();
    await f.waitFor({ state: 'detached' });
    for (const n of ['Placer un système', 'Tracer une route', 'Dessiner une zone', 'Galaxie ▾']) {
      assert.equal(await page.getByRole('button', { name: n }).count(), 0, `${n} absent en Mode Joueur`);
    }
    await hors(page, 'mode-joueur');
    await page.getByRole('radio', { name: 'Mode MJ' }).click();
    await systeme(page, 'Alpha').waitFor();
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    await toucher(page, 4, 8, apparu(section(page, 'Nouveau système')), true);
    assert.equal(await section(page, 'Nouveau système').getByLabel('Nom', { exact: true }).inputValue(), '');
    assert.equal((await (await page.request.get(`${base(gid)}/contenu`)).json()).systemes, 3);
    await ctx.close();
  });

  it('Document MJ… : la recherche d’une fiche sans résultat dit « Aucune fiche. »', async () => {
    const { adresse } = await galaxie('Document', { routes: false });
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Alpha').waitFor();
    await menu(page, 'Galaxie ▾', 'Document MJ…');
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Choisir une fiche' }).click();
    await dlg.getByRole('searchbox').or(dlg.getByRole('textbox')).first().fill('zzzqqxx');
    await dlg.getByText('Aucune fiche.').waitFor();
    await hors(page, 'document-aucune-fiche');
    await ctx.close();
  });
});
