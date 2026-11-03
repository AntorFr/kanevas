// Browser test of kanevas-outils-cadre-barre, written from the exit criterion (AD-133, B-59, B-70).
// Stub world with the seed: « Éneria d'essai » (Antor GM, Léa player, system with the trial module).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

describe('section « Outils » de la barre et écran d’un outil', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let universId: number;
  let systemeId: number;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const modules = (page: Any) => {
    const vus: string[] = [];
    page.on('request', (r: Any) => {
      const m = /\/assets\/([abg])-[^/]+\.js/.exec(r.url());
      if (m) vus.push(m[1]);
    });
    return vus;
  };
  const put = async (page: Any, chemin: string, data: unknown) => {
    const r = await page.request.put(chemin, { data });
    assert.equal(r.status(), 204, chemin);
  };
  const barre = (page: Any) => page.getByRole('navigation').first();

  it('barre_et_ecran_pour_antor_et_lea_puis_mj_seul_ferme_la_porte', async () => {
    const antor = await connecte(browser, srv.base, 'Antor');
    const lea = await connecte(browser, srv.base, 'Léa');
    const liste = (await (await antor.page.request.get('/api/univers')).json()) as Any[];
    const u = liste.find((x) => x.nom === "Éneria d'essai");
    universId = u.id as number;
    systemeId = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    const base = `/api/univers/${universId}/outils`;
    const cible = systemeId ? `/api/systemes/${systemeId}/outils` : base;
    // nothing enabled yet: no section
    await lea.page.goto(`/univers/${universId}`);
    await lea.page.getByRole('link', { name: 'Personnages', exact: true }).waitFor();
    await attendre(lea.page);
    assert.equal(await lea.page.getByText('Outils', { exact: true }).count(), 0, 'aucun outil activé: pas de section');
    await antor.page.goto(`/univers/${universId}`);
    await antor.page.getByRole('link', { name: 'Personnages', exact: true }).waitFor();
    await attendre(antor.page);
    assert.equal(await antor.page.getByText('Outils', { exact: true }).count(), 0);

    for (const k of ['essai/a', 'essai/b']) {
      await put(antor.page, `${cible}/${k}/activation`, { active: true });
      await put(antor.page, `${cible}/${k}/visibilite`, { mj: true, joueur: true });
    }
    const vusLea = modules(lea.page);
    const vusAntor = modules(antor.page);
    await lea.page.goto(`/univers/${universId}`);
    await lea.page.getByRole('link', { name: 'Essai A', exact: true }).waitFor();
    await antor.page.goto(`/univers/${universId}`);
    await antor.page.getByRole('link', { name: 'Essai B', exact: true }).waitFor();
    for (const p of [lea.page, antor.page]) {
      assert.equal(await p.getByText('Outils', { exact: true }).count(), 1);
      assert.equal(await p.getByRole('link', { name: 'Essai A', exact: true }).count(), 1);
      assert.equal(await p.getByRole('link', { name: 'Essai B', exact: true }).count(), 1);
    }
    // order: after « Cartes », before « Lore »
    const t = await texte(antor.page);
    assert.ok(t.indexOf('Cartes') < t.indexOf('Outils') && t.indexOf('Outils') < t.indexOf('Lore'), t);
    await antor.page.screenshot({ path: '/tmp/cap/barre-antor.png' });
    await lea.page.screenshot({ path: '/tmp/cap/barre-lea.png' });
    assert.deepEqual(vusAntor.concat(vusLea), [], 'aucun module de code avant ouverture');

    // Antor opens Essai A
    await antor.page.getByRole('link', { name: 'Essai A', exact: true }).click();
    await antor.page.waitForURL((x: URL) => x.pathname === `/univers/${universId}/outils/essai/a`);
    await antor.page.getByRole('heading', { name: 'Essai A' }).waitFor();
    const ta = await texte(antor.page);
    assert.match(ta, /Une carte pour éprouver le cadre des outils\./);
    assert.match(ta, /Pas de charges de carburant/);
    assert.match(ta, /Non/);
    assert.deepEqual(vusAntor, ['a']);
    assert.deepEqual(vusLea, [], 'Léa n’a rien ouvert');
    await antor.page.screenshot({ path: '/tmp/cap/essai-a-antor.png' });

    // valeur effective après un réglage du système
    // « MJ seul » for the players
    await put(antor.page, `${cible}/essai/a/visibilite`, { mj: true, joueur: false });
    await lea.page.goto(`/univers/${universId}`);
    await lea.page.getByRole('link', { name: 'Essai B', exact: true }).waitFor();
    assert.equal(await lea.page.getByRole('link', { name: 'Essai A', exact: true }).count(), 0);
    // Antor in player mode sees what Léa sees
    await antor.page.goto(`/univers/${universId}/outils/essai/b`);
    await antor.page.getByRole('heading', { name: 'Essai B' }).waitFor();
    await antor.page.getByRole('link', { name: 'Essai A', exact: true }).waitFor();
    await antor.page.getByRole('radio', { name: 'Mode Joueur' }).check();
    await antor.page.waitForFunction(() => ![...document.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Essai A'));
    assert.equal(await antor.page.getByRole('link', { name: 'Essai B', exact: true }).count(), 1);
    await antor.page.screenshot({ path: '/tmp/cap/barre-antor-joueur.png' });
    await antor.ctx.close();
    await lea.ctx.close();
  });

  it('adresse_forcee_d_un_outil_MJ_seul_lit_Page_introuvable_sans_demander_le_module', async () => {
    const lea = await connecte(browser, srv.base, 'Léa');
    const vusLea = modules(lea.page);
    await lea.page.goto(`/univers/${universId}/outils/essai/a`);
    await lea.page.getByText('Page introuvable.').waitFor({ timeout: 8000 }).catch(async () => {
      await lea.page.screenshot({ path: '/tmp/cap/debug-lea.png' });
      throw new Error(`pas de « Page introuvable. » : ${(await texte(lea.page)).slice(0, 400)}`);
    });
    await lea.page.screenshot({ path: '/tmp/cap/essai-a-lea-ferme.png' });
    assert.ok(!vusLea.includes('a'), 'Léa n’a jamais demandé le module d’Essai A');
    await lea.ctx.close();
  });

  it('evenement_rafraichit_la_barre_sans_recharger_et_sans_outil_la_section_disparait', async () => {
    const antor = await connecte(browser, srv.base, 'Antor');
    const liste = (await (await antor.page.request.get('/api/univers')).json()) as Any[];
    const u = liste.find((x) => x.nom === "Éneria d'essai");
    const id = u.id as number;
    const sys = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    const cible = sys ? `/api/systemes/${sys}/outils` : `/api/univers/${id}/outils`;
    await antor.page.goto(`/univers/${id}`);
    await antor.page.getByRole('link', { name: 'Essai B', exact: true }).waitFor();
    await put(antor.page, `${cible}/essai/b/activation`, { active: false });
    await put(antor.page, `${cible}/essai/a/activation`, { active: false });
    // not refreshed until the event
    assert.equal(await antor.page.getByRole('link', { name: 'Essai B', exact: true }).count(), 1);
    await antor.page.evaluate(() => {
      (window as Any).marque = 'meme-page';
      window.dispatchEvent(new Event('kanevas:outils-modifies'));
    });
    await antor.page.waitForFunction(() => ![...document.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Essai B'));
    assert.equal(await antor.page.evaluate(() => (window as Any).marque), 'meme-page');
    assert.equal(await antor.page.getByText('Outils', { exact: true }).count(), 0, 'plus aucun outil: pas de section');
    await antor.page.screenshot({ path: '/tmp/cap/evenement.png' });
    // reactivation + event brings it back
    await put(antor.page, `${cible}/essai/a/activation`, { active: true });
    await put(antor.page, `${cible}/essai/b/activation`, { active: true });
    await antor.page.evaluate(() => window.dispatchEvent(new Event('kanevas:outils-modifies')));
    await antor.page.getByRole('link', { name: 'Essai B', exact: true }).waitFor();
    await antor.ctx.close();
  });

  it('adresse_d_un_outil_desactive_ou_inconnu_du_client_lit_Page_introuvable', async () => {
    const antor = await connecte(browser, srv.base, 'Antor');
    const liste = (await (await antor.page.request.get('/api/univers')).json()) as Any[];
    const id = liste.find((x) => x.nom === "Éneria d'essai").id as number;
    const sys = liste.find((x) => x.id === id).systeme.id as number;
    await put(antor.page, `/api/systemes/${sys}/outils/essai/b/activation`, { active: false });
    await put(antor.page, `/api/systemes/${sys}/outils/essai/a/activation`, { active: false });
    try {
      // a disabled tool's address
      await antor.page.goto(`/univers/${id}/outils/essai/a`);
      await antor.page.getByText('Page introuvable.').waitFor();
      // unknown to the client registry
      await antor.page.goto(`/univers/${id}/outils/essai/zzz`);
      await antor.page.getByText('Page introuvable.').waitFor();
    } finally {
      await put(antor.page, `/api/systemes/${sys}/outils/essai/a/activation`, { active: true });
      await put(antor.page, `/api/systemes/${sys}/outils/essai/b/activation`, { active: true });
    }
    await antor.ctx.close();
  });

  it('a_360_px_la_section_est_dans_le_tiroir_Menu', async () => {
    const antor = await connecte(browser, srv.base, 'Antor');
    const liste = (await (await antor.page.request.get('/api/univers')).json()) as Any[];
    const id = liste.find((x) => x.nom === "Éneria d'essai").id as number;
    await antor.page.setViewportSize({ width: 360, height: 740 });
    await antor.page.goto(`/univers/${id}`);
    await antor.page.getByRole('button', { name: 'Menu', exact: true }).click();
    await antor.page.getByRole('link', { name: 'Essai B', exact: true }).waitFor();
    assert.equal(await antor.page.getByText('Outils', { exact: true }).count(), 1);
    await antor.page.screenshot({ path: '/tmp/cap/tiroir-360.png' });
    await antor.ctx.close();
  });
});
