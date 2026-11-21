// ecrans: outil-cible
// Feature-level black-box tests of kanevas-outils-format-zones (B-84): written from the feature sheet (« Livre », exit
// criterion), docs/parcours.md (B-84, P-18) and docs/ecrans.md (E-21), then from the T-8 / T-9 / Z-2 / Z-3 / Z-5 / Z-7 contracts of
// ARCHITECTURE.md for what is delivered without a screen (session API, import by the API, GM document). Real server in stub
// mode with the stub's starting world (« Éneria d'essai », « Galaxie d'essai »: Port-Sel (0,0), Vael (7,0), Hesper (1,5), one
// secret polygon zone « Marches interdites »), real SQLite, real Chromium. Expected values are literals or worked out by hand.
//
// The invented zone « Anneau d'essai » is the block q −15..14 × r −10..19 (900 hexagons) minus the hole q −3..6 × r −3..6
// (100 hexagons) = 800 hexagons. A hole cannot be said by a simple polygon, so no outline of 64 vertices says it exactly.
// The zone is written by the tests, never by the starting world.
//
// TEST PLAN (Antor GM, Léa Player)
//   B-84 nominal   : import creates the ring; reading gives exactly its 800 hexagons (none of the hole, none outside), count 800;
//                    replay unchanged (same version), same set in another order unchanged, one hexagon moved is « mise à jour »
//   B-84 bords     : 1 hexagon and 5 000 hexagons pass; 5 001 refused; empty set refused; duplicates collapse (3 pairs, 2 hexagons)
//   B-84 échec     : a half hexagon (1.5), a one-number pair, a text, a value beyond ±100 000, an empty set, an extra key, 5 001:
//                    each refused with champ « zones[i].contour », the good zones of the same file pass, nothing of the bad is stored;
//                    more than 50 000 hexagons in one request: the whole request is refused (champ « zones »)
//   B-84 droits    : a private set zone is absent from Léa's reading (name, key, shape) and from Antor in Player mode, present for
//                    Antor; its density does not move Léa's blocks; Léa cannot write one
//   B-84 densité   : a set zone of density 0 empties exactly the generated systems under its hexagons, the hole stays generated
//   B-84 document  : the GM document says « Anneau d'essai · 800 hexagones » (« 1 hexagone » for a single one) and goes stale on change
//   B-84 exclusions: a zone of 64 vertices drawn before reads as before (outline, no set keys), the stub's zone is unchanged;
//                    renaming a set zone keeps its hexagons; a set zone edited in Kanevas is not overwritten by the import (B-48);
//                    the starting world holds no set zone
//   B-84 perf      : 5 000 hexagons read by the API in under 1 s
//   B-84 écran     : 1280 px E-21 draws the ring: filled on a member hexagon, empty in the hole (hit test of the painted shape), the
//                    label stays on a member hexagon, click on the fill opens the panel « Hexagones 800 » (no « Sommets »); Léa and Antor
//                    in Player mode see no trace of the private zone; 5 000 hexagons are drawn in under 2 s; a zone of 64 vertices
//                    drawn before still shows a polygon and « Sommets 64 »
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-format-zones';
mkdirSync(SHOTS, { recursive: true });

const servers: Server[] = [];
let browser: Any;
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { await browser?.close(); servers.forEach((s) => s.stop()); });

interface Rep { status: number; json: Any; texte: string }
interface Monde {
  base: string; E: number; G: string; gid: number;
  api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  imp: (jeton: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  jeton: string;
  put: (zones: unknown[]) => Promise<Rep>;
}

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const lire = async (r: Response): Promise<Rep> => {
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    return lire(await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const gid = (await api('antor', 'GET', `/api/univers/${E}/cartes`)).json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id as number;
  const G = `/api/univers/${E}/outils/swn/galaxie/galaxies/${gid}`;
  const imp = async (jeton: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> =>
    lire(await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) }));
  const jeton = await srv.jetonOutils('antor', E, 'Script zones', ['swn/galaxie']);
  const put = (zones: unknown[]) => imp(jeton, 'PUT', `/outils/swn/galaxie/galaxies/${gid}`, { zones });
  return { base: srv.base, E, G, gid, api, imp, jeton, put };
}

type Hex = [number, number];
/** The invented zone: q −15..14 × r −10..19 minus the hole q −3..6 × r −3..6 = 800 hexagons. */
function anneau(): Hex[] {
  const h: Hex[] = [];
  for (let q = -15; q <= 14; q++) for (let r = -10; r <= 19; r++) if (!(q >= -3 && q <= 6 && r >= -3 && r <= 6)) h.push([q, r]);
  return h;
}
const enTrou = (q: number, r: number) => q >= -3 && q <= 6 && r >= -3 && r <= 6;
/** 5 000 hexagons: q −50..49 × r −25..24. */
function grande(): Hex[] {
  const h: Hex[] = [];
  for (let q = -50; q <= 49; q++) for (let r = -25; r <= 24; r++) h.push([q, r]);
  return h;
}
/** A simple polygon of exactly 64 distinct vertices (the perimeter of a 16 × 16 square) shifted by (dq, dr). */
function polygone64(dq: number, dr: number): Hex[] {
  const v: Hex[] = [];
  for (let i = 0; i < 16; i++) v.push([dq + i, dr]);
  for (let i = 0; i < 16; i++) v.push([dq + 16, dr + i]);
  for (let i = 0; i < 16; i++) v.push([dq + 16 - i, dr + 16]);
  for (let i = 0; i < 16; i++) v.push([dq, dr + 16 - i]);
  return v;
}
/** Hexagons said by a canonical range list `[[r, q0, q1], …]` (docs/donnees.md), as sorted « q,r » strings. */
const developper = (plages: [number, number, number][]): string[] => {
  const s: string[] = [];
  for (const [r, q0, q1] of plages) for (let q = q0; q <= q1; q++) s.push(`${q},${r}`);
  return s.sort();
};
const cles = (h: Hex[]): string[] => h.map(([q, r]) => `${q},${r}`).sort();

const FENETRE = '/blocs?de=-4,-4&a=4,4';
const zone = async (m: Monde, compte: string, cle: string, suffixe = ''): Promise<Any> =>
  ((await m.api(compte, 'GET', `${m.G}${FENETRE}${suffixe}`)).json.zones as Any[]).find((z) => z.cle === cle);
const prive = (h: Hex[], cle = 'reserve', nom = 'Réserve privée', extra: Any = {}) => ({ cle, nom, contour: { hexagones: h }, couleur: 'accent', secret: true, ...extra });
const ANNEAU = () => ({ cle: 'anneau', nom: "Anneau d'essai", contour: { hexagones: anneau() }, couleur: 'accent' });
const compteurs = (r: Rep, nature = 'zones') => r.json.natures[nature] as { creees: number; mises_a_jour: number; inchangees: number; refusees: number };

describe('B-84 E-21 à l’écran', { skip: skipBrowser, timeout: 600000 }, () => {
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const ouvre = async (m: Monde, compte: string) => {
    const c = await connecte(browser, m.base, compte);
    await c.page.setViewportSize({ width: 1280, height: 900 });
    await c.page.goto(`/univers/${m.E}/outils/swn/galaxie/${m.gid}`);
    await systeme(c.page, 'Vael').waitFor();
    return c;
  };
  /** Screen position of the centre of hexagon (q, r), worked out from Port-Sel (0,0), Vael (7,0) and Hesper (1,5). */
  const reperes = async (page: Any) => {
    const centre = async (nom: string) => {
      const b = await systeme(page, nom).locator('.gx-point').first().boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const [ps, va, he] = [await centre('Port-Sel'), await centre('Vael'), await centre('Hesper')];
    const dx = (va.x - ps.x) / 7;
    const dy = (he.y - ps.y) / 5;
    return (q: number, r: number) => ({ x: ps.x + dx * (q + r / 2), y: ps.y + dy * r });
  };
  /** True when a zone (the one of this key, or any zone when no key: a player's zones carry none) is painted under the point. */
  const sous = (page: Any, p: { x: number; y: number }, cle = ''): Promise<boolean> =>
    page.evaluate(({ x, y, cle }: Any) => document.elementsFromPoint(x, y).some((e: Element) => e.closest(cle ? `g.gx-zone[data-zone="${cle}"]` : 'g.gx-zone')), { x: p.x, y: p.y, cle });

  it('1280 px : Antor voit l’anneau rempli sur un hexagone membre et vide dans le trou, l’étiquette sur un membre ; le clic sur le remplissage dit « Hexagones 800 »', async () => {
    const m = await monde();
    await m.put([ANNEAU()]);
    const { page } = await ouvre(m, 'Antor');
    const g = page.locator('g.gx-zone[data-zone="anneau"]');
    await g.waitFor();
    const hex = await reperes(page);
    await page.screenshot({ path: `${SHOTS}/1280-01-anneau.png`, fullPage: true });
    for (const [q, r] of [[7, 0], [-4, 0], [8, 2], [-6, 1], [0, 7], [-2, -4]]) assert.equal(await sous(page, hex(q, r), 'anneau'), true, `(${q},${r}) est rempli`);
    for (const [q, r] of [[0, 0], [1, 5], [-3, -3], [6, 6], [3, 3]]) assert.equal(await sous(page, hex(q, r), 'anneau'), false, `(${q},${r}) est dans le trou, vide`);
    // the label (the name) sits on a member hexagon: its centre is not inside the hole, even shrunk by one hexagon
    const etiquette = page.locator('svg text', { hasText: "Anneau d'essai" }).first();
    await etiquette.waitFor();
    const b = await etiquette.boundingBox();
    const o = hex(0, 0);
    const dy = hex(0, 1).y - o.y;
    const dx = hex(1, 0).x - o.x;
    const r = (b.y + b.height / 2 - o.y) / dy;
    const q = (b.x + b.width / 2 - o.x) / dx - r / 2;
    assert.ok(!(q > -2 && q < 5 && r > -2 && r < 5), `l’étiquette est sur un hexagone membre, pas dans le trou : (${q.toFixed(1)}, ${r.toFixed(1)})`);

    const p = hex(-6, 1);
    await page.mouse.click(p.x, p.y);
    await page.getByText('Hexagones', { exact: true }).waitFor();
    await page.getByText('800', { exact: true }).waitFor();
    assert.equal(await page.getByText('Sommets', { exact: true }).count(), 0);
    await page.screenshot({ path: `${SHOTS}/1280-02-selection.png`, fullPage: true });
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await page.getByLabel('Nom').waitFor();
    assert.equal(await page.getByLabel('Nom').inputValue(), "Anneau d'essai");
    await page.screenshot({ path: `${SHOTS}/1280-03-modifier.png`, fullPage: true });
  });

  it('1280 px : Léa voit l’anneau public et aucune trace de la réserve privée (ni forme, ni nom) ; Antor la voit, puis plus en mode Joueur', async () => {
    const m = await monde();
    await m.put([ANNEAU(), prive([[-1, -1], [0, -1], [-1, 0], [0, 0], [1, 0], [2, 0]])]);
    const antor = await ouvre(m, 'Antor');
    await antor.page.locator('g.gx-zone[data-zone="reserve"]').waitFor();
    await antor.page.getByText('Réserve privée').first().waitFor();
    await antor.page.screenshot({ path: `${SHOTS}/1280-04-antor-prive.png`, fullPage: true });
    const hexA = await reperes(antor.page);
    assert.equal(await sous(antor.page, hexA(0, 0), 'reserve'), true);

    const lea = await ouvre(m, 'Léa');
    await lea.page.locator('g.gx-zone').first().waitFor();
    await lea.page.screenshot({ path: `${SHOTS}/1280-05-lea.png`, fullPage: true });
    assert.equal(await lea.page.locator('g.gx-zone').count(), 1, 'Léa ne voit que l’anneau public');
    assert.equal(await lea.page.getByText('Réserve privée').count(), 0);
    assert.equal(await lea.page.getByText('Marches interdites').count(), 0);
    const hexL = await reperes(lea.page);
    assert.equal(await sous(lea.page, hexL(0, 0), 'reserve'), false);

    await antor.page.getByRole('radio', { name: /Joueur/ }).click();
    await antor.page.locator('g.gx-zone[data-zone="reserve"]').waitFor({ state: 'detached' });
    assert.equal(await antor.page.getByText('Réserve privée').count(), 0);
    await systeme(antor.page, 'Vael').waitFor();
    await antor.page.locator('g.gx-zone').first().waitFor();
    await antor.page.screenshot({ path: `${SHOTS}/1280-06-antor-joueur.png`, fullPage: true });
    assert.equal(await antor.page.locator('g.gx-zone').count(), 1, 'en mode Joueur, Antor voit comme Léa');
  });

  it('mesure : 5 000 hexagones se dessinent en moins de deux secondes une fois la carte chargée', async () => {
    const m = await monde();
    await m.put([{ cle: 'grande', nom: 'Grande', contour: { hexagones: grande() }, couleur: 'accent' }]);
    const c = await connecte(browser, m.base, 'Antor');
    await c.page.setViewportSize({ width: 1280, height: 900 });
    await c.page.goto(`/univers/${m.E}/outils/swn/galaxie/${m.gid}`);
    await systeme(c.page, 'Vael').waitFor();
    const t0 = performance.now();
    await c.page.locator('g.gx-zone[data-zone="grande"] path').first().waitFor({ timeout: 2000 });
    const duree = performance.now() - t0;
    await c.page.screenshot({ path: `${SHOTS}/1280-07-5000.png`, fullPage: true });
    assert.ok(duree < 2000, `dessinée en ${Math.round(duree)} ms`);
    const hex = await reperes(c.page);
    assert.equal(await sous(c.page, hex(7, 0), 'grande'), true);
    // the map stays alive: one zoom and a recentre are applied at once
    await c.page.getByRole('button', { name: 'Zoom avant' }).click();
    await c.page.getByRole('button', { name: 'Recentrer' }).click();
    assert.ok(await c.page.locator('g.gx-zone[data-zone="grande"]').count() >= 1);
  });

  it('une zone à contour de 64 sommets tracée avant s’affiche en polygone et se sélectionne comme avant (« Sommets 64 »)', async () => {
    const m = await monde();
    const p = polygone64(-5, -3);
    const t = await m.api('antor', 'POST', `${m.G}/zones`, { nom: 'Ancienne', contour: p });
    assert.equal(t.status, 201, t.texte);
    const { page } = await ouvre(m, 'Antor');
    const g = page.locator(`g.gx-zone[data-zone="${t.json.cle}"]`);
    await g.waitFor();
    assert.ok((await g.locator('polygon').count()) >= 1);
    assert.equal(await g.locator('path').count(), 0, 'un polygone, pas un tracé d’hexagones');
    await page.screenshot({ path: `${SHOTS}/1280-08-ancienne.png`, fullPage: true });
    // a polygon zone is selected by its outline, as before
    await g.locator('polygon.gx-zone-bord').first().dispatchEvent('click');
    await page.getByText('Sommets', { exact: true }).waitFor();
    await page.getByText('64', { exact: true }).waitFor();
    assert.equal(await page.getByText('Hexagones', { exact: true }).count(), 0);
  });
});
