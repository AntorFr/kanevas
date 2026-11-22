// ecrans: cartes
// Browser test of kanevas-carte-spatiale-edition as a whole (E-23 édition, E-21 « Ancrer ce système »), written from the sheet's
// exit criterion, docs/parcours.md (P-22 step 3) and docs/ecrans.md (E-23 « what -edition builds ») — not from the code.
// The effect (rows, codes, neighbours, rights) is proved at its door in src/outils/swn/edition-ensemble-besoin.test.ts;
// here: what the user sees — the dialog before the write, the mark « Tiré » / « Défini », the messages, no gesture for a Player.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, rx, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-edition-ensemble';

describe('E-23 édition : le MJ ancre et déplace, la joueuse lit', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const tires: Array<{ q: number; r: number }> = [];
  const sql = <T,>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const base = () => `/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}/interieur`;
  const adr = (q: number, r: number) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${q}/${r}`;
  const ouvrir = async (compte: string, q: number, r: number, largeur = 1280) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: 900 });
    const ecritures: Any[] = [];
    c.page.on('request', (rq: Any) => { if (['PATCH', 'POST', 'PUT', 'DELETE'].includes(rq.method()) && rq.url().includes('/interieur/')) ecritures.push({ m: rq.method(), u: rq.url() }); });
    await c.page.goto(adr(q, r));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    return { ...c, ecritures };
  };
  const lireApi = async (page: Any, q: number, r: number) => (await (await page.request.get(`${base()}/${q}/${r}`)).json()) as Any;

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-edition-ens-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    for (let q = -50; q < -40 && tires.length < 4; q++) for (let r = -50; r < -40 && tires.length < 4; r++) {
      const rep = await a.page.request.get(`${base()}/${q}/${r}`);
      if (!rep.ok()) continue;
      const i = (await rep.json()) as Any;
      if (i.etat === 'tire' && (i.astres ?? []).some((x: Any) => x.genre === 'planete')) tires.push({ q, r });
    }
    await a.ctx.close();
    assert.ok(tires.length >= 3, 'trois systèmes tirés avec une planète dans la graine');
  }, { timeout: 300000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  const fr = (x: number) => String(x).replace('.', ',');
  /** Selects the first planet of the system on the list « Corps » and returns it as the API gives it. */
  const choisirPlanete = async (page: Any, q: number, r: number) => {
    const p = (await lireApi(page, q, r)).astres.find((a: Any) => a.genre === 'planete');
    await page.getByRole('button', { name: new RegExp(`Orbite ${fr(p.orbite)} · ${fr(p.heure)} h`) }).last().click();
    await page.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await page.getByRole('heading', { name: /^Déplacer / }).waitFor();
    return p as Any;
  };
  const dialogue = (page: Any) => page.getByRole('dialog', { name: 'Ancrer ce système ?' });

  it('critère : « Déplacer » une planète d\'un système tiré, le dialogue d\'ancrage paraît d\'abord, la marque lit « Défini », la planète est à sa nouvelle heure après rechargement, les voisins tirés n\'ont pas bougé', async () => {
    const [A, B, C] = tires as [Any, Any, Any];
    const { page, ctx, ecritures } = await ouvrir('Antor', A.q, A.r);
    await page.getByText('Tiré', { exact: true }).waitFor();
    const voisinsAvant = [JSON.stringify(await lireApi(page, B.q, B.r)), JSON.stringify(await lireApi(page, C.q, C.r))];
    const p = await choisirPlanete(page, A.q, A.r);
    await page.getByLabel('Heure', { exact: true }).fill('7,5');
    await page.getByText(`= Orbite ${fr(p.orbite)} · 7,5 h`).waitFor();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await dialogue(page).waitFor();
    assert.equal(ecritures.length, 0, 'rien n\'est envoyé avant que le dialogue d\'ancrage soit répondu');
    await page.screenshot({ path: `${SHOTS}/dialogue-ancrage.png` });
    assert.ok(await dialogue(page).getByText(rx('L\'intérieur de ce système sera figé tel que vous le voyez')).isVisible());
    const reponse = page.waitForResponse((x: Any) => x.request().method() !== 'GET' && x.url().includes('/interieur/'));
    await dialogue(page).getByRole('button', { name: 'Ancrer', exact: true }).click();
    assert.equal((await reponse).status(), 200);
    await page.getByText('Défini', { exact: true }).waitFor();
    await page.getByText(/déplacé\./).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/apres-ancrage.png` });
    await page.reload();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await page.getByText('Défini', { exact: true }).waitFor();
    assert.equal((await lireApi(page, A.q, A.r)).astres.find((a: Any) => a.cle === p.cle).heure, 7.5);
    await page.getByRole('button', { name: new RegExp(`Orbite ${fr(p.orbite)} · 7,5 h`) }).last().waitFor();
    assert.deepEqual([JSON.stringify(await lireApi(page, B.q, B.r)), JSON.stringify(await lireApi(page, C.q, C.r))], voisinsAvant);
    await ctx.close();
  });

  it('« Annuler » dans le dialogue d\'ancrage : rien n\'est envoyé, la marque lit toujours « Tiré »', async () => {
    const B = tires[1]!;
    const { page, ctx, ecritures } = await ouvrir('Antor', B.q, B.r);
    await choisirPlanete(page, B.q, B.r);
    await page.getByLabel('Heure', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await dialogue(page).waitFor();
    await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
    await dialogue(page).waitFor({ state: 'hidden' });
    assert.equal(ecritures.length, 0);
    await page.getByText('Tiré', { exact: true }).waitFor();
    assert.equal((await lireApi(page, B.q, B.r)).etat, 'tire');
    await ctx.close();
  });

  it('une orbite négative et l\'heure 12 se lisent « Orbite invalide. », « Enregistrer » est désactivé et rien n\'est envoyé', async () => {
    const B = tires[1]!;
    const { page, ctx, ecritures } = await ouvrir('Antor', B.q, B.r);
    await choisirPlanete(page, B.q, B.r);
    await page.getByLabel('Orbite', { exact: true }).fill('-1');
    await page.getByText('Orbite invalide.').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled());
    await page.getByLabel('Orbite', { exact: true }).fill('3');
    await page.getByLabel('Heure', { exact: true }).fill('12');
    await page.getByText('Orbite invalide.').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled());
    await page.screenshot({ path: `${SHOTS}/orbite-invalide.png` });
    assert.equal(ecritures.length, 0);
    await ctx.close();
  });

  it('segment « Hexagone » : « abc » se lit « Nombre attendu. » avec la ligne « = — » ; le centre se lit « Position invalide. »', async () => {
    const B = tires[1]!;
    const { page, ctx } = await ouvrir('Antor', B.q, B.r);
    await choisirPlanete(page, B.q, B.r);
    await page.getByRole('radio', { name: 'Hexagone' }).or(page.getByRole('button', { name: 'Hexagone' })).first().click();
    await page.getByLabel('q', { exact: true }).fill(String(B.q + 1));
    await page.getByLabel('r', { exact: true }).fill('abc');
    await page.getByText('Nombre attendu.').waitFor();
    await page.getByText('= —').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled());
    await page.getByLabel('q', { exact: true }).fill(String(B.q));
    await page.getByLabel('r', { exact: true }).fill(String(B.r));
    await page.getByText('Position invalide.').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled());
    await page.screenshot({ path: `${SHOTS}/hexagone-invalide.png` });
    await ctx.close();
  });

  it('l\'hexagone voisin saisi dans le formulaire se lit « = Orbite <rayon> · 3 h » : sur le cercle de transition, à l\'heure du voisin', async () => {
    const B = tires[1]!;
    const { page, ctx } = await ouvrir('Antor', B.q, B.r);
    const rayon = (await lireApi(page, B.q, B.r)).transition as number;
    await choisirPlanete(page, B.q, B.r);
    await page.getByRole('radio', { name: 'Hexagone' }).or(page.getByRole('button', { name: 'Hexagone' })).first().click();
    await page.getByLabel('q', { exact: true }).fill(String(B.q + 1));
    await page.getByLabel('r', { exact: true }).fill(String(B.r));
    await page.getByText(`= Orbite ${fr(rayon)} · 3 h`).waitFor();
    await ctx.close();
  });

  it('un autre MJ a changé le tirage entre-temps : à « Ancrer », « Cet astre a changé depuis que vous l\'avez ouvert. » et « Recharger » dans le dialogue, rien n\'est ancré', async () => {
    const C = tires[2]!;
    const { page, ctx } = await ouvrir('Antor', C.q, C.r);
    await choisirPlanete(page, C.q, C.r);
    await page.getByLabel('Heure', { exact: true }).fill('4');
    sql((db) => db.prepare('UPDATE swn_galaxies SET version = version + 1 WHERE id = ?').run(gid));
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await dialogue(page).waitFor();
    await dialogue(page).getByRole('button', { name: 'Ancrer', exact: true }).click();
    await page.getByText(rx('Cet astre a changé depuis que vous l\'avez ouvert.')).waitFor();
    await page.getByRole('button', { name: 'Recharger' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/conflit.png` });
    assert.equal((await lireApi(page, C.q, C.r)).etat, 'tire');
    await ctx.close();
  });

  it('menu « Système › Ancrer ce système » : « Annuler » laisse « Tiré » ; « Ancrer » lit « Défini », annonce « Système ancré. » et retire l\'entrée du menu', async () => {
    const D = tires[3] ?? tires[2]!;
    const { page, ctx, ecritures } = await ouvrir('Antor', D.q, D.r);
    await page.getByRole('button', { name: 'Système', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ancrer ce système' }).click();
    await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
    await dialogue(page).waitFor({ state: 'hidden' });
    assert.equal(ecritures.length, 0);
    await page.getByText('Tiré', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Système', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ancrer ce système' }).click();
    await dialogue(page).getByRole('button', { name: 'Ancrer', exact: true }).click();
    await page.getByText('Défini', { exact: true }).waitFor();
    await page.getByText('Système ancré.').waitFor();
    await page.getByRole('button', { name: 'Système', exact: true }).click();
    assert.equal(await page.getByRole('menuitem', { name: 'Ancrer ce système' }).count(), 0);
    assert.equal((await lireApi(page, D.q, D.r)).etat, 'defini');
    await ctx.close();
  });

  it('Léa (joueuse) et Antor en mode joueur : ni menu « Système », ni « Déplacer », ni « Modifier… », ni « Retirer »', async () => {
    const E = tires[1]!;
    for (const [compte, modeJoueur] of [['Léa', false], ['Antor', true]] as const) {
      const { page, ctx } = await ouvrir(compte, E.q, E.r);
      if (modeJoueur) {
        await page.getByText('Mode Joueur', { exact: true }).click();
        await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
      }
      const p = (await lireApi(page, E.q, E.r)).astres.find((a: Any) => a.genre === 'planete');
      await page.getByRole('button', { name: new RegExp(`Orbite ${fr(p.orbite)} · ${fr(p.heure)} h`) }).last().click();
      await page.getByRole('button', { name: 'Voir l’illustration' }).waitFor();
      for (const nom of ['Système', 'Déplacer', 'Modifier…', 'Retirer l’astre', 'Ajouter un astre…']) {
        assert.equal(await page.getByRole('button', { name: nom, exact: true }).count(), 0, `${compte} ${modeJoueur} ${nom}`);
      }
      await page.screenshot({ path: `${SHOTS}/lecture-${compte}.png` });
      await ctx.close();
    }
  });
});
