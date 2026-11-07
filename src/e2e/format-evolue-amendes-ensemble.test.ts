// Feature-level black-box tests of kanevas-outils-format-evolue for the criterion as AMENDED on 2026-11-06: written from the
// feature sheet's exit criterion and docs/ecrans.md (E-21, E-22), not from the code. Real server in stub mode with the stub's
// starting world (« Éneria d'essai », « Galaxie d'essai »), real SQLite, real Chromium. Expected values are literals.
//
// TEST PLAN
//   B-80 E-22 (amended): a hull of mass 7 (imported by the test, absent from the seed) + an element of mass 0.5 taken 3 times →
//                   the free mass reads « 5,5 » (API 5.5, screen at 1280 and 390 px); with no element it reads « 7 » (no comma, no « ,0 »);
//                   no « utilisée » anywhere on the screen (no mass used added)
//   B-81 E-21 (amended), label placement: typed routes drawn in 8 directions (horizontal, vertical, both diagonals, other slopes)
//                   and one private route, GM view: the label of each stays clear of its own route's stroke (segment ∩ label box = ∅)
//   B-81 E-21 (amended), truncation: 14 characters are shown whole; 15 and 40 are cut with « … » on the map, the tooltip of the label
//                   carries the full type, the panel line carries it whole
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-format-evolue-amendes';
mkdirSync(SHOTS, { recursive: true });

const servers: Server[] = [];
let browser: Any;
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { await browser?.close(); servers.forEach((s) => s.stop()); });

interface Rep { status: number; json: Any; texte: string }
type Api = (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function session(): Promise<{ base: string; api: Api; E: number }> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const api: Api = async (compte, methode, chemin, corps) => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  return { base: srv.base, api, E };
}

describe('B-80 (critère amendé) : masse libre exacte d’une coque de masse 7, sans masse utilisée', () => {
  const CLE = 'coupleur-essai';
  async function monde() {
    const s = await session();
    const V = `/api/univers/${s.E}/outils/swn/vaisseaux`;
    const jeton = (await s.api('antor', 'POST', `/api/univers/${s.E}/jetons`, { nom: 'Script masses', dureeJours: 30, outils: ['swn/vaisseaux'] })).json.valeur as string;
    const imp = (methode: string, chemin: string, corps?: unknown) =>
      fetch(`${s.base}/api/import/v1/univers/${s.E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const lot = ((await (await imp('POST', '/lots?outil=swn/vaisseaux')).json()) as Any).lotId as number;
    const r = await imp('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${lot}`, {
      catalogue: 'swn/vaisseaux', version: 'essai-amende',
      coques: [{ cle: 'coque-sept', nom: 'Coque de sept', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 7, emports: 6, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 }],
      amenagements: [{ cle: CLE, nom: "Coupleur d'essai", cout: 4, puissance: 0, masse: 0.5, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }],
    });
    assert.equal(r.status, 200, await r.text());
    const aube = (await s.api('antor', 'GET', `${V}/conceptions`)).json.fichesSansConception.find((f: Any) => f.titre === 'Aube de Sel').ficheId as number;
    return { ...s, V, aube };
  }
  const txt = async (page: Any): Promise<string> => ((await page.locator('body').innerText()) as string).replace(/[  ]/g, ' ');

  it('API : coque de masse 7 + trois éléments de 0,5 → masse libre exactement 5.5 ; sans élément → exactement 7 ; à seize… la coque de 7 en porte quatorze (7 − 7 = 0), le quinzième donne −0.5 et l’alerte', async () => {
    const m = await monde();
    const calc = async (q: number) => (await m.api('lea', 'POST', `${m.V}/calcul`, { coque: 'coque-sept', choix: q ? [{ nature: 'amenagements', cle: CLE, quantite: q }] : [] })).json;
    assert.equal((await calc(3)).resultat.masseLibre, 5.5);
    assert.equal((await calc(0)).resultat.masseLibre, 7);
    const zero = await calc(14);
    assert.equal(zero.resultat.masseLibre, 0);
    assert.ok(!(zero.alertes as Any[]).some((a) => a.code === 'masse_insuffisante'));
    const neg = await calc(15);
    assert.equal(neg.resultat.masseLibre, -0.5);
    assert.ok((neg.alertes as Any[]).some((a) => a.code === 'masse_insuffisante'));
  });

  for (const largeur of [1280, 390]) {
    it(`${largeur} px : E-22 écrit « 5,5 » pour trois coupleurs sur la coque de masse 7, « 7 » sans éléments, et aucune masse utilisée n’apparaît`, async () => {
      const m = await monde();
      const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'coque-sept' });
      assert.equal(cree.status, 201, cree.texte);
      const lire = async () => {
        const { ctx, page } = await connecte(browser, m.base, 'Antor');
        await page.setViewportSize({ width: largeur, height: 900 });
        await page.goto(`/univers/${m.E}/outils/swn/vaisseaux`);
        await page.getByRole('link', { name: 'Aube de Sel' }).click();
        await page.getByText('Résultats', { exact: false }).first().waitFor();
        return { ctx, page };
      };
      let { ctx, page } = await lire();
      let t = await txt(page);
      assert.match(t, /Masse libre\s*7(?![\d,.])/, 'masse entière : « 7 » sans virgule');
      assert.ok(!/7[,.]0/.test(t), 'jamais « 7,0 »');
      await page.screenshot({ path: `${SHOTS}/${largeur}-masse-7.png`, fullPage: true });
      await ctx.close();
      const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'coque-sept', choix: [{ nature: 'amenagements', cle: CLE, quantite: 3 }], version: cree.json.version });
      assert.equal(ok.status, 200, ok.texte);
      ({ ctx, page } = await lire());
      t = await txt(page);
      assert.match(t, /Masse libre\s*5,5(?![\d])/, 'masse libre exacte « 5,5 »');
      assert.ok(!/5\.5/.test(t), 'aucun point décimal');
      assert.ok(!/utilisée/i.test(t), 'aucune masse utilisée ajoutée');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de débordement horizontal');
      await page.screenshot({ path: `${SHOTS}/${largeur}-masse-5-5.png`, fullPage: true });
      await ctx.close();
    });
  }
});

describe('B-81 (critère amendé) : étiquette de route lisible, jamais traversée, type tronqué', { skip: skipBrowser, timeout: 900000 }, () => {
  const cle = (nom: string) => nom.toLowerCase();
  async function monde() {
    const s = await session();
    const gid = (await s.api('antor', 'GET', `/api/univers/${s.E}/cartes`)).json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id as number;
    const G = `/api/univers/${s.E}/outils/swn/galaxie/galaxies/${gid}`;
    const systeme = async (nom: string, q: number, r: number) => {
      const x = await s.api('antor', 'POST', `${G}/systemes`, { nom, q, r });
      assert.equal(x.status, 201, x.texte);
    };
    const route = async (de: string, vers: string, corps: Any) => {
      const x = await s.api('antor', 'POST', `${G}/routes`, { depuis: cle(de), vers: cle(vers), ...corps });
      assert.equal(x.status, 201, x.texte);
      return x.json.id as number;
    };
    return { ...s, gid, G, systeme, route };
  }
  const sys = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const ouvre = async (m: Any, largeur: number, attendre: string) => {
    const c = await connecte(browser, m.base, 'Antor');
    await c.page.setViewportSize({ width: largeur, height: 900 });
    await c.page.goto(`/univers/${m.E}/outils/swn/galaxie/${m.gid}`);
    await sys(c.page, attendre).waitFor();
    return c;
  };
  const zoomer = async (page: Any, etiquette: Any) => {
    const plus = page.getByRole('button', { name: 'Zoom avant' });
    for (let i = 0; i < 6 && (await etiquette.count()) === 0 && (await plus.getAttribute('aria-disabled')) !== 'true'; i++) await plus.click();
  };
  /** Distance in px between the route's stroke (segment, screen coordinates) and the label's box; 0 when they cross.
   * The label is found by its visible text (the tooltip <title> child is not part of it). Written without inner named
   * functions: tsx would inject a helper the page does not have. */
  const ecart = (page: Any, id: number, texte: string) => page.evaluate(({ id, texte }: Any) => {
    const ligne = document.querySelector(`g[data-route="${id}"] line.gx-route-touche`) as SVGLineElement;
    const et = [...document.querySelectorAll('svg text.gx-route-type')].find((n) => [...n.childNodes].filter((c) => c.nodeName !== 'title').map((c) => c.textContent).join('').startsWith(texte)) as SVGTextElement;
    if (!ligne || !et) return { absent: true };
    const m = ligne.getScreenCTM()!;
    const x1 = ligne.x1.baseVal.value, y1 = ligne.y1.baseVal.value, x2 = ligne.x2.baseVal.value, y2 = ligne.y2.baseVal.value;
    const ax = m.a * x1 + m.c * y1 + m.e, ay = m.b * x1 + m.d * y1 + m.f, bx = m.a * x2 + m.c * y2 + m.e, by = m.b * x2 + m.d * y2 + m.f;
    const r = et.getBoundingClientRect();
    let min = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const x = ax + ((bx - ax) * i) / 2000, y = ay + ((by - ay) * i) / 2000;
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      min = Math.min(min, Math.hypot(dx, dy));
    }
    return { absent: false, min, larg: r.width, haut: r.height, pente: Math.round((Math.atan2(by - ay, bx - ax) * 180) / Math.PI) };
  }, { id, texte });
  const visibles = (page: Any) => page.locator('svg text.gx-route-type').evaluateAll((ns: Element[]) => ns.map((e) => [...e.childNodes].filter((c) => c.nodeName !== 'title').map((c) => c.textContent).join('')));

  it('1280 px : dans huit orientations, et sur une route privée, l’étiquette « Pirate n » reste à l’écart du trait de sa route', async () => {
    const m = await monde();
    await m.systeme('Pivot', 5, 5);
    const rayons: Array<[string, number, number]> = [
      ['Est', 8, 5], ['Ouest', 2, 5], ['Sud', 5, 8], ['Nord', 5, 2], ['Haut', 8, 2], ['Bas', 2, 8], ['Oblique', 8, 8], ['Raide', 6, 8],
    ];
    const ids: number[] = [];
    for (const [nom, q, r] of rayons) await m.systeme(nom, q, r);
    for (let i = 0; i < rayons.length; i++) ids.push(await m.route('Pivot', rayons[i][0], { type_lien: `Pirate ${i}`, ...(i === 3 ? { publique: false } : {}) }));
    const { ctx, page } = await ouvre(m, 1280, 'Pivot');
    const mesures: Array<[string, Any]> = [];
    for (let i = 0; i < ids.length; i++) {
      const et = page.locator('svg text.gx-route-type', { hasText: `Pirate ${i}` });
      await zoomer(page, et);
      await et.first().waitFor();
      mesures.push([rayons[i][0], await ecart(page, ids[i], `Pirate ${i}`)]);
    }
    await page.screenshot({ path: `${SHOTS}/1280-orientations.png`, fullPage: true });
    for (const [nom, v] of mesures) {
      assert.equal(v.absent, false, `${nom} : étiquette ou trait introuvable`);
      assert.ok(Number.isFinite(v.min) && v.min > 0, `${nom} (pente ${v.pente}°) : le trait de la route traverse l’étiquette (distance ${v.min})`);
      assert.ok(v.larg > v.haut, `${nom} : l’étiquette est lisible, horizontale (${v.larg}×${v.haut})`);
    }
    assert.ok(new Set(mesures.map(([, v]) => v.pente)).size >= 4, 'les routes couvrent au moins quatre pentes distinctes à l’écran');
    await ctx.close();
  });

  it('1280 px : un type de 14 caractères se lit en entier ; 15 caractères sont coupés par « … » avec le type complet en infobulle ; le panneau dit le type entier', async () => {
    const m = await monde();
    await m.systeme('Pivot', 5, 5);
    await m.systeme('Est', 8, 5);
    await m.systeme('Sud', 5, 8);
    const t14 = 'ABCDEFGHIJKLMN';
    const t15 = 'ABCDEFGHIJKLMNO';
    const id14 = await m.route('Pivot', 'Est', { type_lien: t14 });
    const id15 = await m.route('Pivot', 'Sud', { type_lien: t15 });
    const { ctx, page } = await ouvre(m, 1280, 'Pivot');
    await zoomer(page, page.locator('svg text.gx-route-type'));
    await page.locator('svg text.gx-route-type').first().waitFor();
    const infobulle = (n: Any) => n.evaluate((e: Element) => [...e.querySelectorAll('title')].map((c) => c.textContent).join(''));
    const textes = (await visibles(page)) as string[];
    assert.equal(textes.length, 2, `deux étiquettes attendues : ${JSON.stringify(textes)}`);
    assert.ok(textes.includes(t14), `le type de 14 caractères se lit en entier : ${JSON.stringify(textes)}`);
    const coupees = textes.filter((x) => x.endsWith('…'));
    assert.equal(coupees.length, 1, `le type de 15 caractères est coupé : ${JSON.stringify(textes)}`);
    assert.ok(coupees[0].length <= 15 && t15.startsWith(coupees[0].slice(0, -1)), `coupé : « ${coupees[0]} »`);
    const noeuds = page.locator('svg text.gx-route-type');
    for (let i = 0; i < 2; i++) if ((await noeuds.nth(i).evaluate((e: Element) => (e.textContent ?? '').includes('…')))) assert.equal(await infobulle(noeuds.nth(i)), t15, 'l’infobulle porte le type complet');
    await page.screenshot({ path: `${SHOTS}/1280-troncature.png`, fullPage: true });
    for (const [id, t] of [[id14, t14], [id15, t15]] as Array<[number, string]>) {
      await page.locator(`g[data-route="${id}"] line.gx-route-touche`).dispatchEvent('click');
      await page.getByText(`Type : ${t}`).waitFor();
    }
    await ctx.close();
  });

  it('1280 px : un type de 40 caractères est coupé, son infobulle porte les 40, et la route oblique ne le traverse pas', async () => {
    const m = await monde();
    await m.systeme('Pivot', 5, 5);
    await m.systeme('Oblique', 8, 8);
    const t40 = 'Convoi marchand armé des Marches du Sel'.padEnd(40, '.');
    assert.equal(t40.length, 40);
    const id = await m.route('Pivot', 'Oblique', { type_lien: t40 });
    const { ctx, page } = await ouvre(m, 1280, 'Pivot');
    const et = page.locator('svg text.gx-route-type', { hasText: '…' });
    await zoomer(page, et);
    await et.first().waitFor();
    const l = (await et.first().evaluate((e: Element) => ({
      visible: [...e.childNodes].filter((c) => c.nodeName !== 'title').map((c) => c.textContent).join(''),
      infobulle: [...e.querySelectorAll('title')].map((c) => c.textContent).join(''),
    }))) as { visible: string; infobulle: string };
    assert.ok(l.visible.endsWith('…') && l.visible.length <= 15, `coupé : « ${l.visible} »`);
    assert.equal(l.infobulle, t40);
    const v = await ecart(page, id, 'Convoi');
    assert.ok(Number.isFinite(v.min) && v.min > 0, `le trait traverse l’étiquette longue (distance ${v.min})`);
    await page.screenshot({ path: `${SHOTS}/1280-quarante.png`, fullPage: true });
    await ctx.close();
  });
});
