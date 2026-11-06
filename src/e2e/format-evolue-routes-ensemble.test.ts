// Feature-level black-box tests of kanevas-outils-format-evolue, routes side (B-81): written from the feature sheet
// (« Livre », exit criterion), docs/parcours.md (P-18) and docs/ecrans.md (E-21), then from the T-4 / T-7 / T-8 / T-9
// contracts of ARCHITECTURE.md for what is delivered without a screen (session API, import, GM document). Real server in
// stub mode with the stub's starting world (« Éneria d'essai », « Galaxie d'essai »: Port-Sel (0,0), Vael (7,0), Hesper (1,5),
// « Station fantôme » secret; 3 routes, one private), real SQLite, real Chromium. Expected values are literals;
// hex distances are worked out by hand (Havre (3,2) → Vael (7,0): max(|4|, |−2|, |−2|) = 4 cases).
//
// TEST PLAN (Antor GM, Léa Player; « Havre » is a system placed by the tests, the route is Havre — Vael)
//   B-81 nominal  : Antor traces Havre—Vael with type « Pirate »; both levels' block reading carries it; Léa reads it while public;
//                   private: Léa's response holds neither the route nor « Pirate », Antor's keeps it (and Antor in Player mode
//                   sees what Léa sees); the GM document says « Havre — Vael · 4 cases · Pirate » (then « privée »)
//   B-81 bords    : 1 character and 40 characters (accents) accepted; 41 refused; blank refused; surrounding spaces trimmed;
//                   PATCH changes then removes (null) the type; a change of type makes the GM document stale
//   B-81 échec    : 41 characters / blank / a number: 400 with champ type_lien, on tracing, on modifying (version unchanged) and on import
//   B-81 import   : a route with type_lien is created, unchanged at replay, updated when the type changes; the 41-character one is
//                   refused with its champ and the rest of the file goes through
//   B-81 exclusions: a route without type (drawn before, seed routes) carries none; a private typed route is invisible to Léa,
//                   also through the galaxy search; Léa cannot write a type
//   B-81 écran    : 1280 px: Antor traces « Pirate » through the form, the label sits on the map and the panel reads « Type : Pirate »;
//                   Léa sees the label while public and nothing once private; 41 characters stop at the field; 390 px: a 40-character type
//                   is cut with « … » on the map and wraps in the panel, no horizontal overflow
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-format-evolue-routes';
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
  jeton: () => Promise<string>;
}

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
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
  const gid = (await api('antor', 'GET', `/api/univers/${E}/cartes`)).json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").id as number;
  const G = `/api/univers/${E}/outils/swn/galaxie/galaxies/${gid}`;
  const imp = async (jeton: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const jeton = async () => (await api('antor', 'POST', `/api/univers/${E}/jetons`, { nom: 'Script galaxie', dureeJours: 30, outils: ['swn/galaxie'] })).json.valeur as string;
  const mo: Monde = { base: srv.base, E, G, gid, api, imp, jeton };
  const h = await api('antor', 'POST', `${G}/systemes`, { nom: 'Havre', q: 3, r: 2 });
  assert.equal(h.status, 201, h.texte);
  return mo;
}

const BLOCS = '/blocs?de=-2,-2&a=9,9';
const route = async (m: Monde, compte: string, suffixe = ''): Promise<Any> =>
  (await m.api(compte, 'GET', `${m.G}${BLOCS}${suffixe}`)).json.routes.find((r: Any) => r.depuis.cle === 'havre' || r.vers.cle === 'havre');
const trace = (m: Monde, corps: Any) => m.api('antor', 'POST', `${m.G}/routes`, { depuis: 'havre', vers: 'vael', ...corps });
const un = (n: number, c = 'x') => c.repeat(n);

describe('B-81 session API : le type de lien d’une route', () => {
  it('nominal : Antor trace Havre — Vael « Pirate » ; Antor et Léa le lisent tant que la route est publique ; privée, Léa ne reçoit ni la route ni « Pirate », Antor garde le type, Antor en mode Joueur voit comme Léa', async () => {
    const m = await monde();
    const r = await trace(m, { type_lien: 'Pirate' });
    assert.equal(r.status, 201, r.texte);
    assert.equal(r.json.type_lien, 'Pirate');
    assert.equal(r.json.longueur, 4);
    assert.equal((await route(m, 'antor')).type_lien, 'Pirate');
    const lea = await route(m, 'lea');
    assert.equal(lea.type_lien, 'Pirate');
    assert.equal(lea.longueur, 4);

    const modif = await m.api('antor', 'PATCH', `${m.G}/routes/${r.json.id}`, { publique: false, version: r.json.version });
    assert.equal(modif.status, 200, modif.texte);
    assert.equal(modif.json.type_lien, 'Pirate', 'rendre privée ne touche pas au type');
    const reponseLea = await m.api('lea', 'GET', `${m.G}${BLOCS}`);
    assert.equal(reponseLea.json.routes.some((x: Any) => x.depuis.cle === 'havre' || x.vers.cle === 'havre'), false);
    assert.ok(!reponseLea.texte.includes('Pirate'), 'aucune trace du type dans la réponse de Léa');
    const antor = await route(m, 'antor');
    assert.equal(antor.type_lien, 'Pirate');
    assert.equal(antor.publique, false);
    const joueur = await m.api('antor', 'GET', `${m.G}${BLOCS}&mode=joueur`);
    assert.ok(!joueur.texte.includes('Pirate'), 'Antor en mode Joueur ne voit pas le type');
    assert.deepEqual(joueur.json.routes, reponseLea.json.routes);
  });

  it('exclusion : les routes d’avant (semis) et une route tracée sans type n’ont aucun type, pour Antor comme pour Léa', async () => {
    const m = await monde();
    await trace(m, {});
    for (const compte of ['antor', 'lea']) {
      const routes = (await m.api(compte, 'GET', `${m.G}${BLOCS}`)).json.routes as Any[];
      assert.ok(routes.length >= 3, `${compte} lit des routes`);
      for (const r of routes) assert.ok(r.type_lien === undefined || r.type_lien === null, `${compte} : route sans type, obtenu ${JSON.stringify(r.type_lien)}`);
    }
  });

  it('bords : 1 caractère et 40 caractères accentués passent ; les espaces autour sont retirés', async () => {
    const m = await monde();
    const a = await trace(m, { type_lien: 'P' });
    assert.equal(a.status, 201, a.texte);
    assert.equal(a.json.type_lien, 'P');
    await m.api('antor', 'DELETE', `${m.G}/routes/${a.json.id}?version=${a.json.version}`);
    const b = await trace(m, { type_lien: un(40, 'é') });
    assert.equal(b.status, 201, b.texte);
    assert.equal(b.json.type_lien, un(40, 'é'));
    await m.api('antor', 'DELETE', `${m.G}/routes/${b.json.id}?version=${b.json.version}`);
    const c = await trace(m, { type_lien: '  Pirate  ' });
    assert.equal(c.status, 201, c.texte);
    assert.equal(c.json.type_lien, 'Pirate');
  });

  it('échec : 41 caractères, un texte blanc et un nombre sont refusés avec champ type_lien ; aucune route écrite', async () => {
    const m = await monde();
    for (const valeur of [un(41), '   ', 123]) {
      const r = await trace(m, { type_lien: valeur });
      assert.equal(r.status, 400, `${JSON.stringify(valeur)} : ${r.texte}`);
      assert.equal(r.json.champ, 'type_lien');
    }
    assert.equal(await route(m, 'antor'), undefined, 'aucune route Havre n’a été écrite');
  });

  it('PATCH : le type change, puis disparaît avec null ; 41 caractères refusés sans bouger la version ; la visibilité seule garde le type', async () => {
    const m = await monde();
    const r = await trace(m, { type_lien: 'Pirate' });
    const id = r.json.id;
    const marchande = await m.api('antor', 'PATCH', `${m.G}/routes/${id}`, { type_lien: 'Marchande', version: r.json.version });
    assert.equal(marchande.status, 200, marchande.texte);
    assert.equal(marchande.json.type_lien, 'Marchande');
    assert.ok(marchande.json.version > r.json.version);
    const trop = await m.api('antor', 'PATCH', `${m.G}/routes/${id}`, { type_lien: un(41), version: marchande.json.version });
    assert.equal(trop.status, 400, trop.texte);
    assert.equal(trop.json.champ, 'type_lien');
    const blanc = await m.api('antor', 'PATCH', `${m.G}/routes/${id}`, { type_lien: '  ', version: marchande.json.version });
    assert.equal(blanc.status, 400, blanc.texte);
    assert.equal((await route(m, 'antor')).version, marchande.json.version);
    assert.equal((await route(m, 'antor')).type_lien, 'Marchande');
    const prive = await m.api('antor', 'PATCH', `${m.G}/routes/${id}`, { publique: false, version: marchande.json.version });
    assert.equal(prive.json.type_lien, 'Marchande');
    const sans = await m.api('antor', 'PATCH', `${m.G}/routes/${id}`, { type_lien: null, version: prive.json.version });
    assert.equal(sans.status, 200, sans.texte);
    const apres = await route(m, 'antor');
    assert.ok(apres.type_lien === undefined || apres.type_lien === null);
    assert.equal(apres.publique, false, 'retirer le type ne rend pas la route publique');
  });

  it('exclusion : Léa ne pose pas de type (403), et la recherche de la galaxie ne livre pas un type de route privée', async () => {
    const m = await monde();
    const r = await trace(m, { type_lien: 'Pirate', publique: false });
    assert.equal(r.status, 201, r.texte);
    const lea = await m.api('lea', 'PATCH', `${m.G}/routes/${r.json.id}`, { type_lien: 'Autre', version: r.json.version });
    assert.equal(lea.status, 403, lea.texte);
    assert.equal((await route(m, 'antor')).type_lien, 'Pirate');
    const rech = await m.api('lea', 'GET', `${m.G}/recherche?q=Pirate`);
    assert.ok(!rech.texte.includes('Pirate'), rech.texte);
  });
});

describe('B-81 document MJ', () => {
  const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const document = async (m: Monde) => {
    const cree = await m.api('antor', 'POST', `${m.G}/document`, { creer: { titre: 'Galaxie — notes MJ' }, version: 1 });
    assert.equal(cree.status, 201, cree.texte);
    return cree.json.fiche.id as number;
  };
  const texteDoc = async (m: Monde, fid: number) =>
    plat(((await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${fid}`)).json.sections as Any[]).find((s) => s.titre === 'Document MJ').html);

  it('le document dit la route « Havre — Vael · 4 cases · Pirate » ; privée : « Pirate » avant « privée » ; une route sans type ne dit rien de plus', async () => {
    const m = await monde();
    const r = await trace(m, { type_lien: 'Pirate' });
    const fid = await document(m);
    let t = await texteDoc(m, fid);
    assert.match(t, /Havre — Vael · 4 cases · Pirate(?! ·)/);
    assert.match(t, /Port-Sel — Vael · 7 cases(?! ·)/);
    await m.api('antor', 'PATCH', `${m.G}/routes/${r.json.id}`, { publique: false, version: r.json.version });
    const d = (await m.api('antor', 'GET', `${m.G}/document`)).json;
    assert.equal(d.etat, 'perime');
    await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${d.propositionId}/appliquer`, {});
    t = await texteDoc(m, fid);
    assert.match(t, /Havre — Vael · 4 cases · Pirate · privée/);
  });

  it('changer seulement le type périme le document ; la proposition appliquée porte le nouveau type ; Léa ne lit pas la fiche', async () => {
    const m = await monde();
    const r = await trace(m, { type_lien: 'Pirate' });
    const fid = await document(m);
    assert.equal((await m.api('antor', 'GET', `${m.G}/document`)).json.etat, 'a_jour');
    await m.api('antor', 'PATCH', `${m.G}/routes/${r.json.id}`, { type_lien: 'Marchande', version: r.json.version });
    const d = (await m.api('antor', 'GET', `${m.G}/document`)).json;
    assert.equal(d.etat, 'perime');
    assert.ok(!(await texteDoc(m, fid)).includes('Marchande'), 'le texte ne change qu’à l’application');
    const ap = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${d.propositionId}/appliquer`, {});
    assert.equal(ap.status, 200, ap.texte);
    const t = await texteDoc(m, fid);
    assert.match(t, /Havre — Vael · 4 cases · Marchande/);
    assert.ok(!t.includes('Pirate'));
    assert.equal((await m.api('lea', 'GET', `/api/univers/${m.E}/fiches/${fid}`)).status, 404);
  });
});

describe('B-81 import par l’API', () => {
  const FICHIER = (type?: unknown) => ({
    systemes: [{ cle: 'port-sel', nom: 'Port-Sel', q: 0, r: 0 }, { cle: 'vael', nom: 'Vael', q: 7, r: 0 }, { cle: 'hesper', nom: 'Hesper', q: 1, r: 5 }],
    routes: [{ depuis: 'port-sel', vers: 'vael', ...(type === undefined ? {} : { type_lien: type }) }, { depuis: 'vael', vers: 'hesper' }],
  });
  const prepare = async () => {
    const m = await monde();
    const bord = (await m.api('antor', 'POST', `/api/univers/${m.E}/outils/swn/galaxie/cartes`, { titre: 'Galaxie du bord' })).json.id as number;
    const t = await m.jeton();
    const lot = (await m.imp(t, 'POST', '/lots?outil=swn/galaxie')).json.lotId as number;
    const put = (corps: unknown) => m.imp(t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}?lot=${lot}`, corps);
    const lire = async (compte: string) => ((await m.api(compte, 'GET', `/api/univers/${m.E}/outils/swn/galaxie/galaxies/${bord}${BLOCS}`)).json.routes as Any[]);
    return { m, put, lire };
  };

  it('nominal : une route avec type_lien est créée, inchangée au rejeu, mise à jour quand le type change', async () => {
    const { put, lire } = await prepare();
    const a = await put(FICHIER('Pirate'));
    assert.equal(a.status, 200, a.texte);
    assert.equal(a.json.natures.routes.creees, 2);
    assert.equal(a.json.refusTotal, 0);
    assert.equal((await lire('antor')).find((r) => r.depuis.cle === 'port-sel').type_lien, 'Pirate');
    const b = await put(FICHIER('Pirate'));
    assert.deepEqual([b.json.natures.routes.creees, b.json.natures.routes.mises_a_jour ?? b.json.natures.routes.misesAJour, b.json.natures.routes.inchangees], [0, 0, 2]);
    assert.equal((await lire('antor')).length, 2, 'aucun doublon');
    const c = await put(FICHIER('Marchande'));
    assert.deepEqual([c.json.natures.routes.creees, c.json.natures.routes.inchangees], [0, 1]);
    assert.equal((c.json.natures.routes.mises_a_jour ?? c.json.natures.routes.misesAJour), 1);
    assert.equal((await lire('antor')).find((r) => r.depuis.cle === 'port-sel').type_lien, 'Marchande');
  });

  it('échec : 41 caractères et un texte blanc sont refusés avec leur champ type_lien, l’autre route du fichier passe', async () => {
    const { put, lire } = await prepare();
    for (const valeur of [un(41), '   ']) {
      const r = await put(FICHIER(valeur));
      assert.equal(r.status, 200, r.texte);
      assert.equal(r.json.natures.routes.refusees, 1, `${JSON.stringify(valeur)} : ${r.texte}`);
      assert.equal(r.json.natures.routes.creees + r.json.natures.routes.inchangees, 1);
      assert.match(r.texte, /routes\[0\]\.type_lien/);
      assert.equal((await lire('antor')).some((x) => x.depuis.cle === 'port-sel'), false, 'la route refusée n’est pas écrite');
    }
  });

  it('bord : 40 caractères passent à l’import', async () => {
    const { put, lire } = await prepare();
    const r = await put(FICHIER(un(40)));
    assert.equal(r.json.refusTotal, 0, r.texte);
    assert.equal((await lire('antor')).find((x) => x.depuis.cle === 'port-sel').type_lien, un(40));
  });
});

describe('B-81 E-21 à l’écran', { skip: skipBrowser, timeout: 600000 }, () => {
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const ouvre = async (m: Monde, compte: string, largeur: number) => {
    const c = await connecte(browser, m.base, compte);
    await c.page.setViewportSize({ width: largeur, height: 900 });
    await c.page.goto(`/univers/${m.E}/outils/swn/galaxie/${m.gid}`);
    await systeme(c.page, 'Vael').waitFor();
    return c;
  };
  const commande = async (page: Any, nom: string) => {
    const direct = page.getByRole('button', { name: nom, exact: true });
    if (await direct.count()) return direct.click();
    await page.getByRole('button', { name: 'Modifier la carte' }).click();
    await page.getByRole('menuitem', { name: nom }).click();
  };
  const zoomer = async (page: Any, etiquette: Any) => {
    const plus = page.getByRole('button', { name: 'Zoom avant' });
    for (let i = 0; i < 6 && (await etiquette.count()) === 0 && (await plus.getAttribute('aria-disabled')) !== 'true'; i++) await plus.click();
  };
  const tracerParFormulaire = async (page: Any, type: string) => {
    await commande(page, 'Tracer une route');
    await systeme(page, 'Havre').click();
    await systeme(page, 'Vael').click();
    const form = page.getByRole('region', { name: 'Nouvelle route' });
    await form.getByText('De Havre à Vael').waitFor();
    await form.getByLabel('Type de lien (facultatif)').fill(type);
    return form;
  };
  const sansDebordement = (page: Any) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  it('1280 px : Antor trace « Pirate » ; l’étiquette est sur la carte, sur le segment, le panneau dit « Type : Pirate » ; Léa lit « Pirate » tant que la route est publique, rien une fois privée', async () => {
    const m = await monde();
    const antor = await ouvre(m, 'Antor', 1280);
    const form = await tracerParFormulaire(antor.page, 'Pirate');
    await antor.page.screenshot({ path: `${SHOTS}/1280-01-formulaire.png`, fullPage: true });
    const [rep] = await Promise.all([
      antor.page.waitForResponse((r: Any) => r.url().endsWith('/routes') && r.request().method() === 'POST'),
      form.getByRole('button', { name: 'Tracer', exact: true }).click(),
    ]);
    assert.equal(rep.status(), 201);
    await form.waitFor({ state: 'detached' });
    const etiquette = antor.page.locator('svg text.gx-route-type', { hasText: 'Pirate' });
    await zoomer(antor.page, etiquette);
    await etiquette.waitFor();
    await antor.page.screenshot({ path: `${SHOTS}/1280-02-etiquette.png`, fullPage: true });
    // zoomed in, Vael may be outside the drawn part of the map: the label is read against Havre, its near end (Vael lies to the right)
    const [e, h] = await Promise.all([etiquette.boundingBox(), systeme(antor.page, 'Havre').boundingBox()]);
    assert.ok(e.x > h.x + h.width / 2, `l’étiquette est sur le segment, à droite de Havre : ${e.x} vs ${h.x}`);

    const id = (await rep.json()).id as number;
    await antor.page.locator(`g[data-route="${id}"] line.gx-route-touche`).dispatchEvent('click');
    await antor.page.getByText('Type : Pirate').waitFor();
    await antor.page.screenshot({ path: `${SHOTS}/1280-03-panneau.png`, fullPage: true });

    const lea = await ouvre(m, 'Léa', 1280);
    const etiquetteLea = lea.page.locator('svg text.gx-route-type', { hasText: 'Pirate' });
    await zoomer(lea.page, etiquetteLea);
    await etiquetteLea.waitFor();
    await lea.page.screenshot({ path: `${SHOTS}/1280-04-lea-publique.png`, fullPage: true });

    await antor.page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const fm = antor.page.getByRole('form', { name: 'Modifier la route' });
    assert.equal(await fm.getByLabel('Type de lien (facultatif)').inputValue(), 'Pirate');
    await fm.getByRole('switch', { name: 'Route publique' }).click();
    await Promise.all([
      antor.page.waitForResponse((r: Any) => r.url().endsWith(`/routes/${id}`) && r.request().method() === 'PATCH'),
      fm.getByRole('button', { name: 'Enregistrer' }).click(),
    ]);
    await antor.page.getByText('Privée').first().waitFor();
    const gardee = antor.page.locator('svg text.gx-route-type', { hasText: 'Pirate' });
    await zoomer(antor.page, gardee);
    await gardee.first().waitFor();
    await antor.page.screenshot({ path: `${SHOTS}/1280-04b-antor-privee.png`, fullPage: true });
    await lea.page.reload();
    await systeme(lea.page, 'Vael').waitFor();
    await zoomer(lea.page, lea.page.locator('svg text.gx-route-type', { hasText: 'Pirate' }));
    assert.equal(await lea.page.getByText('Pirate').count(), 0, 'Léa ne lit plus rien de la route');
    await lea.page.screenshot({ path: `${SHOTS}/1280-05-lea-privee.png`, fullPage: true });
    await antor.ctx.close(); await lea.ctx.close();
  });

  it('une route d’avant n’a ni étiquette ni ligne « Type : » (Port-Sel — Vael)', async () => {
    const m = await monde();
    const antor = await ouvre(m, 'Antor', 1280);
    const touche = antor.page.locator('g[data-route] line.gx-route-touche').first();
    await touche.dispatchEvent('click');
    await antor.page.getByRole('button', { name: 'Modifier', exact: true }).waitFor();
    assert.equal(await antor.page.getByText(/Type :/).count(), 0);
    await antor.page.screenshot({ path: `${SHOTS}/anciennes-routes.png`, fullPage: true });
    await antor.ctx.close();
  });

  it('formulaire : 41 caractères arrêtés au champ (« Le type de lien fait 1 à 40 caractères. »), rien n’est envoyé', async () => {
    const m = await monde();
    const antor = await ouvre(m, 'Antor', 1280);
    const form = await tracerParFormulaire(antor.page, un(41));
    await form.getByText('Le type de lien fait 1 à 40 caractères.').waitFor();
    let envoye = false;
    antor.page.on('request', (r: Any) => { if (r.url().endsWith('/routes') && r.method() === 'POST') envoye = true; });
    await form.getByRole('button', { name: 'Tracer', exact: true }).click();
    assert.equal(envoye, false);
    assert.equal(((await m.api('antor', 'GET', `${m.G}${BLOCS}`)).json.routes as Any[]).some((r) => r.depuis.cle === 'havre' || r.vers.cle === 'havre'), false);
    await antor.page.screenshot({ path: `${SHOTS}/form-41.png`, fullPage: true });
    await antor.ctx.close();
  });

  it('390 px : un type de 40 caractères est coupé par « … » sur la carte et passe à la ligne dans le panneau, sans débordement', async () => {
    const m = await monde();
    const long = 'Convoi marchand armé des Marches du Sel'.padEnd(40, '.');
    assert.equal(long.length, 40);
    const r = await trace(m, { type_lien: long });
    assert.equal(r.status, 201, r.texte);
    const antor = await ouvre(m, 'Antor', 390);
    const etiquette = antor.page.locator('svg text.gx-route-type', { hasText: '…' });
    await zoomer(antor.page, etiquette);
    await etiquette.first().waitFor();
    const lu = (await etiquette.first().evaluate((n: Element) => [...n.childNodes].filter((c) => c.nodeName !== 'title').map((c) => c.textContent).join(''))) as string;
    assert.ok(lu.endsWith('…') && lu.length <= 15 && long.startsWith(lu.slice(0, -1)), `étiquette coupée : « ${lu} »`);
    assert.equal(await sansDebordement(antor.page), true);
    await antor.page.screenshot({ path: `${SHOTS}/390-etiquette-longue.png`, fullPage: true });
    await antor.page.locator(`g[data-route="${r.json.id}"] line.gx-route-touche`).dispatchEvent('click');
    await antor.page.getByText(`Type : ${long}`).waitFor();
    assert.equal(await sansDebordement(antor.page), true);
    await antor.page.screenshot({ path: `${SHOTS}/390-panneau-long.png`, fullPage: true });
    await antor.ctx.close();
  });
});
