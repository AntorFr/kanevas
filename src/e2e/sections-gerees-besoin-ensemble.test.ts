// ecrans: fiche
// Feature-level tests of kanevas-outils-sections-gerees (B-66, B-67, E-9), written from the exit
// criterion of the feature sheet and docs/ecrans.md (« Screen details for kanevas-outils-sections-gerees »),
// without reading the implementation. The real server in stub mode, the seeded world (« Éneria d'essai »:
// antor GM, mira GM, lea and roxane players), the tool « Essai G » (the trial generator), a real Chromium.
// One narrative: each step starts from the state the previous one left, as the criterion does.
// Screenshots: /tmp/cap-gere-besoin (outside the tracked tree).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, rx, section, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-gere-besoin';

describe('sections gérées par un outil — le besoin, de bout en bout', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let U = 0;
  let S = 0;
  let ids: Record<string, number> = {};
  let antor: Any;
  let lea: Any;
  let mira: Any;
  let fiche = 0;
  let carac = 0; // « Caractéristiques » (geste)
  let notes = 0; // « Notes » (proposition)
  const api = (u: string) => `/api/univers/${U}${u}`;
  const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const statut = async (r: Any, attendu: number, quoi: string) =>
    assert.equal(r.status(), attendu, `${quoi}: ${await r.text()}`);

  const lireFiche = async (c: Any, f = fiche) => {
    const r = await c.page.request.get(api(`/fiches/${f}`));
    assert.equal(r.status(), 200, await r.text());
    return (await r.json()) as Any;
  };
  const sectionDe = async (c: Any, sid: number, f = fiche) =>
    ((await lireFiche(c, f)).sections as Any[]).find((s) => s.id === sid);
  const generer = (c: Any, data: Any) => c.page.request.post(api('/outils/essai/g/sections'), { data });
  /** Writes the universe setting « Marge d'essai » with the current settings version. */
  const poserMarge = async (c: Any, valeur: number) => {
    const o = (await (await c.page.request.get(api('/outils'))).json()) as Any;
    const g = o.outils.find((x: Any) => x.cle === 'essai/g');
    await statut(
      await c.page.request.put(api('/outils/essai/g/reglages'), {
        data: { version: g.univers.versionReglages, valeurs: { marge: valeur } },
      }),
      204,
      `marge ${valeur}`,
    );
  };
  /** The banner of a managed section (docs/ecrans.md, Accessibility): a group, its actions are its buttons and links. */
  const bandeau = (s: Any) => s.getByRole('group', { name: 'Section gérée par un outil' });
  const ouvrir = async (c: Any, f = fiche) => {
    await c.page.goto(`/univers/${U}/fiche/${f}`);
    await c.page.getByRole('heading', { name: 'Caractéristiques', exact: true }).waitFor();
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = await connecte(browser, srv.base, 'Antor');
    lea = await connecte(browser, srv.base, 'Léa');
    mira = await connecte(browser, srv.base, 'Mira');
    const us = (await (await antor.page.request.get('/api/univers')).json()) as Any[];
    const u = us.find((x) => x.nom === "Éneria d'essai");
    U = u.id;
    S = u.systeme.id;
    const ms = (await (await antor.page.request.get(api('/membres'))).json()) as Any[];
    for (const m of ms) ids[m.username] = m.compteId;
    await statut(await antor.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: true } }), 204, 'activation');
    const f = await antor.page.request.post(api('/fiches'), { data: { type: 'objet', titre: "Vaisseau d'essai" } });
    await statut(f, 201, 'fiche');
    fiche = ((await f.json()) as Any).id;
  });
  after(async () => {
    for (const c of [antor, lea, mira]) await c?.ctx.close();
    await browser?.close();
    srv?.stop();
  });

  it('nominal : le générateur écrit au nom d\'Antor la section de Léa ; Léa la lit, bandeau et texte, sans éditeur', async () => {
    const r = await generer(antor, { ficheId: fiche, type: 'caracteristiques', auteurId: ids.lea });
    await statut(r, 201, 'génération');
    carac = ((await r.json()) as Any).id;

    await ouvrir(lea);
    const s = section(lea.page, 'Caractéristiques');
    await s.getByText(rx('Générée par Essai G')).waitFor();
    await s.getByText("Marge d'essai : 10 %").first().waitFor();
    assert.equal(await lea.page.getByRole('button', { name: /^Modifier/ }).count(), 0, 'aucun éditeur');
    assert.equal(await lea.page.locator('textarea').count(), 0, 'aucun éditeur');
    await photo(lea.page, '01-lea-bandeau');
  });

  it('périmé : Antor change « Marge d\'essai » ; la section montre d\'anciens réglages, le contenu n\'a pas bougé', async () => {
    await poserMarge(antor, 25);

    await ouvrir(lea);
    const s = section(lea.page, 'Caractéristiques');
    await s.getByText(rx('Calculée avec d\'anciens réglages')).waitFor();
    await s.getByText("Marge d'essai : 10 %").first().waitFor();
    assert.equal(await s.getByRole('button', { name: /Recalculer/ }).count(), 0, 'Léa n\'a pas le bouton');
    await photo(lea.page, '02-lea-perime');
  });

  it('recalcul : « Recalculer » (Antor, navigateur) met le texte à jour, et la section redevient à jour', async () => {
    await ouvrir(antor);
    const s = section(antor.page, 'Caractéristiques');
    await s.getByText(rx('Calculée avec d\'anciens réglages')).waitFor();
    await s.getByRole('link', { name: /Ouvrir dans l.outil/ }).waitFor();
    await photo(antor.page, '03-antor-perime');
    const reponse = antor.page.waitForResponse((r: Any) => /\/recalcul$/.test(r.url()) && r.request().method() === 'POST');
    await s.getByRole('button', { name: 'Recalculer' }).click();
    await reponse;
    await s.getByText("Marge d'essai : 25 %").first().waitFor();
    await antor.page.getByText('Section recalculée.').waitFor({ state: 'attached' });
    assert.equal(await s.getByText(rx('anciens réglages')).count(), 0);
    assert.equal(await s.getByRole('button', { name: 'Recalculer' }).count(), 0);
    await photo(antor.page, '04-antor-recalcule');
  });

  it('exclusion : une section gérée du MJ seul reste invisible pour Léa (aucun bandeau, aucun texte)', async () => {
    const f = await antor.page.request.post(api('/fiches'), { data: { type: 'objet', titre: 'Plan secret' } });
    const secret = ((await f.json()) as Any).id;
    const r = await generer(antor, { ficheId: secret, type: 'notes' });
    await statut(r, 201, 'section MJ');
    const lue = lea.page.waitForResponse((x: Any) => x.url().endsWith(`/fiches/${secret}`));
    await lea.page.goto(`/univers/${U}/fiche/${secret}`);
    await lue;
    await lea.page.getByRole('main').waitFor();
    assert.equal(await lea.page.getByText(rx('Générée par')).count(), 0, 'aucun bandeau pour Léa');
    assert.equal(await lea.page.getByText(rx('Notes — marge')).count(), 0);
    await photo(lea.page, '05-lea-section-mj-seul');
  });

  it('sur proposition : une proposition apparaît pour Antor (« Voir la proposition ») et pas pour Mira (« Proposer un recalcul »)', async () => {
    const r = await generer(antor, { ficheId: fiche, type: 'notes', auteurId: ids.lea });
    await statut(r, 201, 'notes');
    notes = ((await r.json()) as Any).id;
    await poserMarge(antor, 40);
    const pid = ((await sectionDe(antor, notes)).geree.propositionId) as number;

    // l'écran : Antor « Voir la proposition », Mira « Proposer un recalcul »
    await ouvrir(antor);
    const sa = section(antor.page, 'Notes');
    await sa.getByRole('button', { name: /Voir la proposition/ }).or(sa.getByRole('link', { name: /Voir la proposition/ })).first().waitFor();
    await photo(antor.page, '06-antor-proposition');
    await ouvrir(mira);
    const sm = section(mira.page, 'Notes');
    await sm.getByRole('button', { name: /Proposer un recalcul/ }).waitFor();
    assert.equal(await sm.getByRole('button', { name: /Voir la proposition/ }).count(), 0);

    // ignorée, puis une nouvelle proposition acceptée : les effets sont prouvés par src/routes/sections-gerees-lot-outils.test.ts
    await antor.page.request.post(api(`/propositions/${pid}/abandonner`));
    await poserMarge(antor, 60);
    const pid2 = ((await sectionDe(antor, notes)).geree.propositionId) as number;
    await antor.page.request.post(api(`/propositions/${pid2}/appliquer`));
  });

  it('bords : à 360 px la bande s\'enroule, aucune action n\'est coupée, la page ne déborde pas', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await page.waitForLoadState('networkidle');
    await page.goto(`/univers/${U}/fiche/${fiche}`);
    await page.getByRole('heading', { name: 'Caractéristiques', exact: true }).waitFor();
    const s = section(page, 'Caractéristiques');
    const lien = s.getByRole('link', { name: /Ouvrir dans l.outil/ });
    await lien.waitFor();
    const box = await lien.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 360, JSON.stringify(box));
    assert.ok(box.height >= 44, `bouton de 44 px au moins: ${box.height}`);
    const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largeur <= 360, `la page déborde: ${largeur}`);
    await photo(page, '07-360px');
    await ctx.close();
  });

  it('outil désactivé : la fiche garde le texte avec « Outil désactivé », aucune régénération, l\'écriture est refusée', async () => {
    await statut(await antor.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: false } }), 204, 'désactivation');
    const avant = await sectionDe(antor, carac);
    for (const c of [lea, antor]) {
      const v = await sectionDe(c, carac);
      assert.equal(v.geree.etat, 'desactive');
      assert.equal(v.geree.libelle, null, 'aucun nom');
      assert.equal(v.geree.lien, null);
      assert.equal(v.geree.peutRecalculer, false);
      assert.match(v.html, /Marge d'essai : 25 %/, 'le texte reste');
    }
    const r = await generer(antor, { ficheId: fiche, type: 'caracteristiques', sectionId: carac, version: avant.version });
    assert.equal(r.status(), 404, `régénération: ${await r.text()}`);
    const rc = await antor.page.request.post(api(`/fiches/${fiche}/sections/${carac}/recalcul`), { data: { version: avant.version } });
    assert.ok(rc.status() >= 400, `recalcul: ${rc.status()}`);
    const put = await antor.page.request.put(api(`/fiches/${fiche}/sections/${carac}/contenu`), { data: { contenu: 'x', version: avant.version } });
    assert.equal(put.status(), 403);
    const apres = await sectionDe(antor, carac);
    assert.equal(apres.version, avant.version);
    assert.match(apres.html, /25 %/);

    await ouvrir(lea);
    const s = section(lea.page, 'Caractéristiques');
    await s.getByText('Outil désactivé').waitFor();
    await s.getByText("Marge d'essai : 25 %").first().waitFor();
    assert.equal(await s.getByText(rx('Générée par')).count(), 0, 'pas de nom d\'outil');
    assert.equal(await bandeau(s).getByRole('button').count(), 0);
    await ouvrir(antor);
    const sa = section(antor.page, 'Caractéristiques');
    await sa.getByText('Outil désactivé').waitFor();
    await bandeau(sa).waitFor();
    assert.equal(await bandeau(sa).getByRole('button').count(), 0, 'rien pour le MJ non plus');
    assert.equal(await sa.getByRole('button', { name: /Recalculer|Proposer un recalcul|Voir la proposition|^Modifier/ }).count(), 0);
    assert.equal(await sa.getByRole('link', { name: /Ouvrir dans l.outil/ }).count(), 0);
    await photo(antor.page, '08-desactive');
  });

  it('outil activé mais caché aux joueurs : Léa lit « Générée par un outil », sans lien ni action', async () => {
    await statut(await antor.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: true } }), 204, 'réactivation');
    await statut(await antor.page.request.put(api('/outils/essai/g/visibilite'), { data: { joueur: false } }), 204, 'visibilité');
    const v = await sectionDe(lea, carac);
    assert.equal(v.geree.libelle, null);
    assert.equal(v.geree.lien, null);
    assert.equal(v.geree.peutOuvrir, false, 'pas même pour l\'autrice');
    assert.equal(v.geree.peutRecalculer, false);
    await ouvrir(lea);
    const s = section(lea.page, 'Caractéristiques');
    await s.getByText('Générée par un outil').waitFor();
    assert.equal(await s.getByText(rx('Essai G')).count(), 0, 'le nom ne fuit pas');
    assert.equal(await bandeau(s).getByRole('link').count(), 0);
    assert.equal(await bandeau(s).getByRole('button').count(), 0);
    await photo(lea.page, '09-outil-cache');
  });
});
