// Feature-level browser tests of kanevas-outils-format-vaisseaux-fiches (B-82, E-22), real server in stub mode, real Chromium.
// Written from the feature sheet (exit criterion), docs/parcours.md (P-19 step 2) and docs/ecrans.md
// (« What kanevas-outils-format-vaisseaux-fiches builds of E-22 »). Selectors are roles and visible texts; each gesture waits for what
// the user sees, never networkidle nor a fixed delay. Expected values are literals, calculated by hand. The trial catalogue is
// written here and absent from the seed.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player author of « Vent d'Orak » and « Étoile du soir », Teo added as Player)
// Hand-calculated: Frégate R classe 2, vitesse 3, armure 5, équipage 6 à 20; Voiles +1; Hangar classe 3 au moins; Croiseur R classe 3.
// B-82 nominal   : Léa's design on Frégate R + Voiles reads « Vitesse 4 », « Armure 5 », « Équipage 6 », the field reads 6, bounds « 6 à 20 »
//     bords      : 5 → « Équipage insuffisant : 5 sur 6 au moins. », « Enregistrer » stays available ; 6 and 20 → no crew alert ;
//                  21 → « Équipage excessif : 21 sur 20 au plus. » ; saved at 5 and reopened it reads 5
//     échec      : 100001 → field invalid, « Équipage : un nombre entier de 0 à 100 000. », typed value kept, nothing saved
//     exclusions : a catalogue that says nothing (seed): no crew block, no Vitesse / Armure / Équipage row ; Teo (a Player who is not the author) sees the figure
//                  with no stepper ; the connection lost disables the stepper
//     classe     : design on Croiseur R (class 3) carrying Hangar, hull changed to Frégate R: blocking alert with the exact text, a « Classe »
//                  mark on the chosen line, « Enregistrer » disabled
//     390 px     : crew block above the first nature, results above choices, no horizontal scroll
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-fiches-ensemble';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 100000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const CONDITION = 'a'.repeat(99) + ' ' + 'b'.repeat(100);
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'fiches-ecran-1',
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5, equipage_min: 6, equipage_max: 20 },
    { cle: 'croiseur-r', nom: 'Croiseur R', classe: 3, ...coque },
  ],
  amenagements: [{ cle: 'hangar', nom: "Hangar d'essai", ...el, classe_min: 3, condition: CONDITION }],
  defenses: [{ cle: 'voiles', nom: "Voiles d'essai", ...el, bonus_vitesse: 1 }],
});

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function monde(importer: boolean) {
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
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  if (importer) assert.equal((await api('antor', 'POST', `${V}/catalogue/application`, catalogue())).status, 200);
  const liste = (await api('antor', 'GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  /** Puts a design on a hull with the given choices through the API (Antor, GM). */
  const poser = async (fiche: number, corps: Any) => {
    const v = (await api('antor', 'GET', `${V}/conceptions/${fiche}`)).json;
    const r = await api('antor', 'PUT', `${V}/conceptions/${fiche}`, { ...corps, version: v.version });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  };
  return { E, V, api, poser, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function ouvrir(m: Monde, compte: string, fiche: number, largeur = 1280): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${m.E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await page.getByRole('complementary', { name: 'Résultats' }).waitFor();
  return page;
}
const norm = (s: string) => s.replace(/[  ]/g, ' ');
const resultats = async (p: Any) => norm(await p.getByRole('complementary', { name: 'Résultats' }).innerText());
const groupe = (p: Any) => p.getByRole('group', { name: 'Équipage' });
const champ = (p: Any) => p.getByRole('spinbutton', { name: 'Équipage' });
const enregistrer = (p: Any) => p.getByRole('button', { name: 'Enregistrer' });

describe('B-82 · E-22 : l’atelier dit vitesse, armure et équipage', { skip: skipBrowser, timeout: 240000 }, () => {
  it('Léa, Frégate R + Voiles : Vitesse 4, Armure 5, Équipage 6, champ à 6 et bornes « 6 à 20 »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [{ nature: 'defenses', cle: 'voiles', quantite: 1 }], equipage: 6 });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await champ(p).waitFor();
    assert.equal(await champ(p).inputValue(), '6');
    await p.getByText('6 à 20', { exact: true }).waitFor();
    const t = await resultats(p);
    assert.match(t, /Vitesse\s*4/);
    assert.match(t, /Armure\s*5/);
    assert.match(t, /Équipage\s*6/);
    assert.ok(t.indexOf('Portée de saut') < t.indexOf('Vitesse') && t.indexOf('Vitesse') < t.indexOf('Armure') && t.indexOf('Armure') < t.indexOf('Équipage'), 'rows in the order of the screen text');
    await p.screenshot({ path: `${SHOTS}-nominal.png`, fullPage: true });
  });

  it('bords : 5 alerte sans bloquer, 6 et 20 sans alerte, 21 « Équipage excessif : 21 sur 20 au plus. » ; enregistré à 5, rouvert à 5', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [], equipage: 6 });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await champ(p).waitFor();
    await champ(p).fill('5');
    await p.getByText('Équipage insuffisant : 5 sur 6 au moins.').waitFor();
    assert.equal(await enregistrer(p).isEnabled(), true, 'a watch alert does not stop the save');
    await p.screenshot({ path: `${SHOTS}-5.png`, fullPage: true });
    await champ(p).fill('6');
    await p.getByText(/Équipage insuffisant/).waitFor({ state: 'detached' });
    await champ(p).fill('20');
    await p.waitForFunction(() => /Équipage\s*20/.test((document.querySelector('[aria-label="Résultats"]') as HTMLElement).innerText.replace(/ /g, ' ')));
    assert.equal(await p.getByText(/Équipage (insuffisant|excessif)/).count(), 0);
    await champ(p).fill('21');
    await p.getByText('Équipage excessif : 21 sur 20 au plus.').waitFor();
    await champ(p).fill('5');
    await p.getByText('Équipage insuffisant : 5 sur 6 au moins.').waitFor();
    const put = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await enregistrer(p).click();
    assert.equal((await put).status(), 200);
    await p.getByText('Conception enregistrée.').waitFor();
    const q = await ouvrir(m, 'Léa', m.etoile);
    await champ(q).waitFor();
    assert.equal(await champ(q).inputValue(), '5');
    assert.equal(await m.api('lea', 'GET', `${m.V}/conceptions/${m.etoile}`).then((r) => r.json.resultat.equipage.choisi), 5);
  });

  it('échec : 100001 marque le champ invalide, affiche « Équipage : un nombre entier de 0 à 100 000. », garde la saisie et n’enregistre rien', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [], equipage: 6 });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await champ(p).waitFor();
    await champ(p).fill('100001');
    await p.getByText('Équipage : un nombre entier de 0 à 100 000.').waitFor();
    assert.equal(await champ(p).inputValue(), '100001');
    assert.equal(await champ(p).getAttribute('aria-invalid'), 'true');
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.screenshot({ path: `${SHOTS}-invalide.png`, fullPage: true });
    assert.equal(await m.api('lea', 'GET', `${m.V}/conceptions/${m.etoile}`).then((r) => r.json.resultat.equipage.choisi), 6);
  });

  it('classe : une conception sur Croiseur R avec un Hangar passe sur Frégate R en alerte bloquante, marque « Classe », sans enregistrement', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'croiseur-r', choix: [{ nature: 'amenagements', cle: 'hangar', quantite: 1 }] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText(/Hangar d'essai/).first().waitFor();
    assert.equal(await p.getByText('Bloquante').count(), 0);
    await p.getByRole('button', { name: 'Changer de coque' }).click();
    await p.locator('li').filter({ hasText: 'Frégate R' }).last().getByRole('button').first().click();
    await p.getByText("« Hangar d'essai » : classe de coque 3 au moins.").first().waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    const ligne = norm(await p.locator('li').filter({ hasText: "Hangar d'essai" }).last().innerText());
    assert.match(ligne, /Classe/);
    await p.screenshot({ path: `${SHOTS}-classe.png`, fullPage: true });
  });

  it('exclusion : Teo (joueur, non auteur), qui lit la conception de Léa sans pouvoir l’écrire, voit l’équipage 8 sans pas ni champ', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [], equipage: 8 });
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const p = await ouvrir(m, 'Teo', m.etoile);
    await groupe(p).waitFor();
    assert.equal(await groupe(p).locator('output').innerText(), '8');
    assert.equal(await champ(p).count(), 0);
    assert.equal(await p.getByRole('button', { name: 'Augmenter l’équipage' }).count(), 0);
    await p.screenshot({ path: `${SHOTS}-lecteur.png`, fullPage: true });
  });

  it('exclusion : connexion perdue, le pas d’équipage est désactivé avec les autres contrôles', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [], equipage: 8 });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await champ(p).waitFor();
    await p.context().setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.waitForFunction(() => (document.querySelector('input[aria-label="Équipage"]') as HTMLInputElement | null)?.disabled === true, null, { timeout: 15000 });
    await p.screenshot({ path: `${SHOTS}-hors-ligne.png`, fullPage: true });
    await p.context().setOffline(false);
  });

  it('exclusion : le catalogue du semis, qui ne dit rien, ne montre ni bloc Équipage ni ligne Vitesse, Armure, Équipage', async () => {
    const m = await monde(false);
    const p = await ouvrir(m, 'Léa', m.orak);
    await p.getByText('685 000 cr').first().waitFor();
    assert.equal(await groupe(p).count(), 0);
    const t = await resultats(p);
    assert.doesNotMatch(t, /Vitesse|Armure|Équipage/);
    await p.screenshot({ path: `${SHOTS}-semis.png`, fullPage: true });
  });

  it('390 px : le bloc d’équipage est une colonne au-dessus de la première nature, les résultats au-dessus des choix, sans défilement horizontal ; la condition de 200 caractères passe à la ligne', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'croiseur-r', choix: [{ nature: 'amenagements', cle: 'hangar', quantite: 1 }] });
    await m.poser(m.orak, { coque: 'fregate-r', choix: [], equipage: 6 });
    const p = await ouvrir(m, 'Léa', m.orak, 390);
    await groupe(p).waitFor();
    const pos = async (sel: Any) => (await sel.boundingBox());
    const res = await pos(p.getByRole('complementary', { name: 'Résultats' }));
    const grp = await pos(groupe(p));
    const choix = await pos(p.getByRole('region', { name: 'Choix' }));
    assert.ok(res.y < grp.y, 'results above the crew block');
    assert.ok(grp.y < choix.y + choix.height);
    assert.ok(grp.x >= 0 && grp.x + grp.width <= 390, 'the crew block fits the width');
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
    await p.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
    // condition wraps
    const q = await ouvrir(m, 'Léa', m.etoile, 390);
    await q.getByText(/Hangar d'essai/).first().waitFor();
    await q.getByRole('button', { name: 'Ajouter : Aménagements' }).click();
    const ligne = q.locator('li').filter({ hasText: "Hangar d'essai" }).last();
    await ligne.waitFor();
    assert.match(norm(await ligne.innerText()), /a{99} b{100}/);
    assert.equal(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll with the long condition');
    await q.screenshot({ path: `${SHOTS}-390-condition.png`, fullPage: true });
  });

  it('390 px : le « − », le « + » et le champ d’équipage sont des cibles de 44 px', async () => {
    const m = await monde(true);
    await m.poser(m.orak, { coque: 'fregate-r', choix: [], equipage: 6 });
    const p = await ouvrir(m, 'Léa', m.orak, 390);
    await groupe(p).waitFor();
    for (const cible of [p.getByRole('button', { name: 'Diminuer l’équipage' }), champ(p), p.getByRole('button', { name: 'Augmenter l’équipage' })]) {
      const b = await cible.boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `44 px target, got ${b.width}x${b.height}`);
    }
  });

  // Sheet: the « Classe » mark shows « beside its name ». Failure if the mark sits away from the name line (after the whole text block).
  for (const largeur of [1280, 390]) {
    it(`${largeur} px : la marque « Classe » est à côté du nom de l’élément, sur la même ligne, à moins de 24 px`, async () => {
      const m = await monde(true);
      await m.poser(m.etoile, { coque: 'croiseur-r', choix: [{ nature: 'amenagements', cle: 'hangar', quantite: 1 }] });
      const p = await ouvrir(m, 'Léa', m.etoile, largeur);
      await p.getByText(/Hangar d'essai/).first().waitFor();
      await p.getByRole('button', { name: 'Changer de coque' }).click();
      await p.locator('li').filter({ hasText: 'Frégate R' }).last().getByRole('button').first().click();
      await p.getByText("« Hangar d'essai » : classe de coque 3 au moins.").first().waitFor();
      const ligne = p.locator('li').filter({ hasText: "Hangar d'essai" }).last();
      const g = await ligne.evaluate(new Function('li', `
        const rectDe = function (txt) {
          const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            if ((n.textContent || '').trim() === txt) { const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }
          }
          return null;
        };
        return { nom: rectDe("Hangar d'essai"), marque: rectDe('Classe') };
      `) as Any);
      assert.ok(g.nom && g.marque, JSON.stringify(g));
      const cy = (g.marque.t + g.marque.b) / 2;
      assert.ok(cy >= g.nom.t - 2 && cy <= g.nom.b + 2, `mark on the name line: mark y ${cy}, name ${g.nom.t}..${g.nom.b}`);
      assert.ok(g.marque.l - g.nom.r >= 0 && g.marque.l - g.nom.r <= 24, `mark within 24 px right of the name, gap ${g.marque.l - g.nom.r}`);
      await p.screenshot({ path: `${SHOTS}-marque-classe-${largeur}.png`, fullPage: true });
    });
  }
});
