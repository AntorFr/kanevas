// Feature-level browser tests of kanevas-outils-vaisseaux (real server in stub mode with the stub's starting data,
// real Chromium through Playwright). Written from the feature sheet (« Livre », exit criterion), docs/parcours.md
// (P-19, B-68, B-70, B-75, B-76), docs/ecrans.md (E-22, E-9) and docs/maquettes/e22-concepteur-vaisseaux.html.
// Selectors are roles and visible texts. Each action is awaited on what the user sees (never networkidle nor a fixed delay).
// Expected values are literals calculated by hand from the trial catalogue.
//
// TEST PLAN (world: « Éneria d'essai » #5: Antor, Mira GM; Léa Player, author of « Vent d'Orak » and « Étoile du soir »;
// Roxane exists in the seed but the stub login offers no Roxane: Teo, made a player of the universe, plays the player who is not
// the author — she reads « Étoile du soir » and not « Vent d'Orak »)
//   critère       : Léa adds a second Lance d'essai → « Puissance insuffisante : −2 », « Enregistrer » disabled with the reason; she
//                   removes it, saves → « Conception enregistrée. » and E-9 shows « Caractéristiques » under the banner, no editor
//   bords         : the list of Léa has two designs and no « Nouvelle conception »; Antor has it
//   creation (GM) : Antor creates the design of « Aube de Sel » (hull Éclaireur, author Léa) and lands in the workshop
//   refus         : the player who is not the author: « Étoile du soir » read-only (no « Enregistrer », no « Annuler »), « Vent d'Orak » → « Page introuvable. »
//   conflit       : two tabs of Léa on the same version: the second save → « Cette conception a changé depuis que vous l'avez ouverte. » + « Recharger »
//   retrait       : hull withdrawn by Antor → « Élément retiré de cet univers », « Enregistrer » disabled, enabled after « Changer de coque »
//   masque        : Lance d'essai masked by Antor → still on « Vent d'Orak », no alert, save works, not in the picker
//   390 px        : the picker lists the catalogue in one column, nothing overflows horizontally; the read-only workshop shows results above choices
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, rx, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

/** Visible text, non-breaking spaces read as spaces (« 685 000 cr »). */
const txt = async (page: Any): Promise<string> => (await texte(page)).replace(/[\u00a0\u202f]/g, ' ');

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-ensemble';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

interface Monde { base: string; E: number; orak: number; etoile: number; aube: number; api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<{ status: number; json: Any }> }

async function monde(): Promise<Monde> {
  srv?.stop();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown) => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const t = await r.text();
    let json: Any = null;
    try { json = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const liste = (await api('antor', 'GET', `/api/univers/${E}/outils/swn/vaisseaux/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { base: srv.base, E, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir'), aube: liste.fichesSansConception[0].ficheId, api };
}

async function ouvrir(m: Monde, compte: string, chemin: string, largeur?: number): Promise<Any> {
  const { ctx, page } = await connecte(browser, m.base, compte === 'lea' ? 'Léa' : compte);
  ctxs.push(ctx);
  if (largeur) await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${m.E}/outils/swn/vaisseaux${chemin}`);
  return page;
}
const atelier = (page: Any) => page.getByText('Résultats enregistrés').or(page.getByText('Résultats', { exact: true })).first().waitFor();

describe('critère de sortie : Léa conçoit « Vent d’Orak »', { skip: skipBrowser }, () => {
  it('liste de Léa : deux conceptions, pas de « Nouvelle conception » ; une seconde lance bloque, la retirer débloque, E-9 garde le résultat', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'lea', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Étoile du soir' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Nouvelle conception' }).count(), 0, 'Léa does not see « Nouvelle conception »');
    await page.screenshot({ path: `${SHOTS}-lea-liste.png`, fullPage: true });

    await page.getByRole('link', { name: "Vent d'Orak" }).click();
    await page.getByText('Résultats enregistrés').waitFor();
    let t = await txt(page);
    assert.match(t, /685 000 cr/);
    assert.match(t, /28 jours/);
    assert.match(t, /34 250 cr \/ an/);
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);

    await page.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await page.getByText('Puissance insuffisante : −2').first().waitFor();
    assert.match(await txt(page), /Bloquante/i);
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true, '« Enregistrer » refused while the alert shows');
    await page.getByText('Enregistrement refusé : Puissance insuffisante (−2).').waitFor();
    await page.screenshot({ path: `${SHOTS}-lea-alerte.png`, fullPage: true });

    await page.getByRole('button', { name: "Diminuer la quantité : Lance d'essai" }).click();
    await page.getByText('Puissance insuffisante : −2').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Conception enregistrée.').waitFor();
    await page.screenshot({ path: `${SHOTS}-lea-enregistre.png`, fullPage: true });

    await page.goto(`/univers/${m.E}/fiche/${m.orak}`);
    await page.getByText(/Générée par/).waitFor();
    t = await txt(page);
    assert.match(t, /Caractéristiques/);
    assert.match(t, /685 000 cr/);
    assert.equal(await page.getByRole('link', { name: /Ouvrir dans (l['’]outil|le concepteur)/ }).count(), 1);
    assert.equal(await page.locator('textarea').count(), 0, 'no editor on the managed section');
    assert.equal(await page.getByRole('button', { name: /Modifier/ }).count(), 0);
    await page.screenshot({ path: `${SHOTS}-e9.png`, fullPage: true });
  });

  it('exclusion : un enregistrement refusé (alerte jamais enregistrée) laisse E-9 sur le résultat précédent', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'lea', `?fiche=${m.orak}`);
    await page.getByText('Résultats enregistrés').waitFor();
    await page.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await page.getByText('Puissance insuffisante : −2').first().waitFor();
    await page.goto(`/univers/${m.E}/fiche/${m.orak}`);
    await page.getByText(/Générée par/).waitFor();
    assert.match(await txt(page), /685 000 cr/);
    assert.doesNotMatch(await txt(page), /Puissance insuffisante/);
  });
});

describe('P-19 étape 3 : le bandeau de E-9', { skip: skipBrowser }, () => {
  it('« Caractéristiques » est sous le bandeau « Générée par le concepteur de vaisseaux » (mot pour mot, P-19 et E-22)', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'lea', '');
    await page.goto(`/univers/${m.E}/fiche/${m.orak}`);
    await page.getByText(/Générée par/).waitFor();
    assert.match(await txt(page), /Générée par le concepteur de vaisseaux/);
  });
});

describe('P-19 étape 1 : Antor crée la conception de « Aube de Sel »', { skip: skipBrowser }, () => {
  it('« Nouvelle conception » : fiche, coque, autrice Léa ; Créer ouvre l’atelier sur la coque seule avec « Aucun moteur de saut »', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'antor', '');
    await page.getByRole('button', { name: 'Nouvelle conception' }).click();
    const dialogue = page.getByRole('dialog');
    await dialogue.getByLabel('Fiche').waitFor();
    await dialogue.getByRole('option', { name: 'Aube de Sel' }).waitFor({ state: 'attached' });
    await dialogue.getByLabel('Coque', { exact: true }).selectOption({ label: 'Éclaireur' });
    await dialogue.getByLabel('Auteur').selectOption({ label: 'lea' });
    await dialogue.getByRole('button', { name: 'Créer' }).click();
    await page.getByText('Aucun moteur de saut : ce vaisseau ne peut pas voyager.').waitFor();
    assert.match(await txt(page), /Aube de Sel/);
    assert.match(await txt(page), /20 000 cr/);
    await page.screenshot({ path: `${SHOTS}-antor-creation.png`, fullPage: true });
    const fiche = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${m.aube}`)).json;
    const s = fiche.sections.find((x: Any) => x.titre === 'Caractéristiques');
    assert.equal(s.geree.outil, 'swn/vaisseaux');
    const v = (await m.api('lea', 'GET', `/api/univers/${m.E}/outils/swn/vaisseaux/conceptions/${m.aube}`)).json;
    assert.equal(v.peutEcrire, true, 'Léa is the author');
  });
});

describe('P-19 étape 5 · B-68 : le lien partagé avec une joueuse non autrice', { skip: skipBrowser }, () => {
  it('« Étoile du soir » est en lecture seule (ni Enregistrer ni Annuler) ; « Vent d’Orak » est « Page introuvable. »', async () => {
    const m = await monde();
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const page = await ouvrir(m, 'teo', `?fiche=${m.etoile}`);
    await page.getByText('Résultats enregistrés').waitFor();
    assert.match(await txt(page), /50 000 cr/);
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Annuler' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Augmenter la quantité/ }).count(), 0, 'no stepper');
    assert.equal(await page.getByRole('button', { name: 'Copier le lien' }).count(), 1);
    await page.screenshot({ path: `${SHOTS}-lecture-seule.png`, fullPage: true });
    await page.goto(`/univers/${m.E}/outils/swn/vaisseaux?fiche=${m.orak}`);
    await page.getByText('Page introuvable.').waitFor();
    assert.doesNotMatch(await txt(page), /Orak|Frégate/);
    await page.screenshot({ path: `${SHOTS}-introuvable.png`, fullPage: true });
  });

  it('le compte sans rôle dans l’univers reçoit « Page introuvable. » pour tout l’écran', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'teo', '');
    await page.getByText('Page introuvable.').waitFor();
    assert.doesNotMatch(await txt(page), /Vent d'Orak|Étoile du soir/);
  });
});

describe('B-76 : deux enregistrements de la même version lue', { skip: skipBrowser }, () => {
  it('le second reçoit « Cette conception a changé depuis que vous l’avez ouverte. » avec « Recharger »', async () => {
    const m = await monde();
    const a = await ouvrir(m, 'lea', `?fiche=${m.orak}`);
    const b = await ouvrir(m, 'lea', `?fiche=${m.orak}`);
    await a.getByText('Résultats enregistrés').waitFor();
    await b.getByText('Résultats enregistrés').waitFor();
    // tab A: remove the Lance and save
    await a.getByRole('button', { name: "Retirer : Lance d'essai" }).click();
    await a.getByText('Puissance libre').first().waitFor();
    await a.getByRole('button', { name: 'Enregistrer' }).click();
    await a.getByText('Conception enregistrée.').waitFor();
    // tab B (same version as A had read): remove the Laser and save
    await b.getByRole('button', { name: 'Retirer : Laser' }).click();
    await b.getByRole('button', { name: 'Enregistrer' }).click();
    await b.getByText(rx("Cette conception a changé depuis que vous l'avez ouverte.")).first().waitFor();
    assert.equal(await b.getByRole('button', { name: 'Recharger' }).count(), 1);
    await b.screenshot({ path: `${SHOTS}-conflit.png`, fullPage: true });
    const v = (await m.api('lea', 'GET', `/api/univers/${m.E}/outils/swn/vaisseaux/conceptions/${m.orak}`)).json;
    assert.equal(v.resultat.prix, 535000, 'only tab A wrote: frégate + engine 2 + hold + laser = 300 000 + 60 000 + 50 000 + 125 000');
  });
});

describe('B-62 · P-19 : Antor retire la coque, puis masque la lance', { skip: skipBrowser }, () => {
  it('coque retirée : « Élément retiré de cet univers », « Enregistrer » refusé jusqu’au changement de coque, le texte de la fiche inchangé', async () => {
    const m = await monde();
    const avant = (await m.api('lea', 'GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html;
    assert.equal((await m.api('antor', 'PUT', `/api/univers/${m.E}/outils/swn/vaisseaux/catalogue/coques/eclaireur/retrait`, { retire: true })).status, 200);
    const page = await ouvrir(m, 'lea', `?fiche=${m.etoile}`);
    await page.getByText('Élément retiré de cet univers').first().waitFor();
    assert.match(await txt(page), /Bloquante/i);
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    await page.screenshot({ path: `${SHOTS}-retire.png`, fullPage: true });
    const apres = (await m.api('lea', 'GET', `/api/univers/${m.E}/fiches/${m.etoile}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html;
    assert.equal(apres, avant);
    await page.getByRole('button', { name: 'Changer de coque' }).click();
    await page.getByRole('button', { name: /Ajouter\s*Frégate d'essai|Frégate d'essai/ }).first().click();
    await page.getByText('Élément retiré de cet univers', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Conception enregistrée.').waitFor();
  });

  it('arme masquée : Léa la voit toujours sur « Vent d’Orak », réenregistre sans alerte, ne la trouve plus dans ses choix', async () => {
    const m = await monde();
    const g = (await m.api('antor', 'GET', `/api/univers/${m.E}/outils/swn/vaisseaux/catalogue/gestion?nature=armes`)).json.elements.find((e: Any) => e.cle === 'lance-d-essai');
    assert.equal((await m.api('antor', 'PUT', `/api/univers/${m.E}/outils/swn/vaisseaux/catalogue/armes/lance-d-essai/masque`, { masque: true, version: g.version })).status, 200);
    const page = await ouvrir(m, 'lea', `?fiche=${m.orak}`);
    await page.getByText('Résultats enregistrés').waitFor();
    assert.equal(await page.getByRole('button', { name: "Retirer : Lance d'essai" }).count(), 1, 'the lance is still on the design');
    assert.doesNotMatch(await txt(page), /Bloquante|Élément retiré/);
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Conception enregistrée.').waitFor();
    assert.doesNotMatch(await txt(page), /Bloquante/);
    await page.getByRole('button', { name: 'Ajouter : Armes' }).click();
    await page.getByText('Canon léger').first().waitFor();
    const choix = await txt(page);
    assert.match(choix, /Laser/);
    assert.equal(await page.getByRole('button', { name: /^Ajouter\s*Lance d'essai/ }).count(), 0, 'the lance is not offered');
    await page.screenshot({ path: `${SHOTS}-masque.png`, fullPage: true });
  });

  it('Antor (MJ) voit « Lance d’essai » avec le repère « Univers » et, une fois masquée, « Masqué »', async () => {
    const m = await monde();
    const g = (await m.api('antor', 'GET', `/api/univers/${m.E}/outils/swn/vaisseaux/catalogue/gestion?nature=armes`)).json.elements.find((e: Any) => e.cle === 'lance-d-essai');
    await m.api('antor', 'PUT', `/api/univers/${m.E}/outils/swn/vaisseaux/catalogue/armes/lance-d-essai/masque`, { masque: true, version: g.version });
    const page = await ouvrir(m, 'antor', `?fiche=${m.orak}`);
    await page.getByText('Résultats enregistrés').waitFor();
    await page.getByRole('button', { name: 'Ajouter : Armes' }).click();
    await page.getByText('Canon léger').first().waitFor();
    const t = await txt(page);
    assert.match(t, /Lance d'essai[\s\S]*Univers/);
    assert.match(t, /Masqué/);
  });
});

describe('B-70 : à 390 px', { skip: skipBrowser }, () => {
  it('le catalogue se parcourt en une colonne, sans débordement horizontal', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'lea', `?fiche=${m.orak}`, 390);
    await page.getByText('Résultats enregistrés').waitFor();
    await page.getByRole('button', { name: 'Ajouter : Armes' }).click();
    await page.getByText('Canon léger').first().waitFor();
    const boutons = page.getByRole('button', { name: /^Ajouter\s*(Canon léger|Laser|Lance d'essai)/ });
    assert.equal(await boutons.count(), 3);
    const boites = await boutons.evaluateAll((es: Element[]) => es.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; }));
    assert.equal(new Set(boites.map((b: Any) => b.x)).size, 1, `one column: ${JSON.stringify(boites)}`);
    assert.ok(boites[0].y < boites[1].y && boites[1].y < boites[2].y, 'stacked');
    const debord = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(debord, false, 'no horizontal overflow');
    await page.screenshot({ path: `${SHOTS}-390-catalogue.png`, fullPage: true });
  });

  it('la liste des conceptions est sur une colonne et le prix sous le titre', async () => {
    const m = await monde();
    const page = await ouvrir(m, 'lea', '', 390);
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    const lien = await page.getByRole('link', { name: "Vent d'Orak" }).boundingBox();
    const prix = await page.getByText('685 000 cr').first().boundingBox();
    assert.ok(prix!.y > lien!.y, 'the price is below the title');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `${SHOTS}-390-liste.png`, fullPage: true });
  });

  it('en lecture seule, les résultats sont au-dessus des choix', async () => {
    const m = await monde();
    await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' });
    const page = await ouvrir(m, 'teo', `?fiche=${m.etoile}`, 390);
    await page.getByText('Résultats enregistrés').waitFor();
    const r = await page.getByText('Résultats enregistrés').boundingBox();
    const c = await page.getByText('Moteur de saut').first().boundingBox();
    assert.ok(r!.y < c!.y, 'results above the choices');
    await page.screenshot({ path: `${SHOTS}-390-lecture.png`, fullPage: true });
  });
});
