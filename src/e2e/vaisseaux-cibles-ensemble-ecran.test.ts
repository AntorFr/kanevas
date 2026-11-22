// ecrans: outil
// Feature-level browser tests of kanevas-concepteur-vaisseaux-cibles (B-89, B-94, P-19 step 6 and P-22, E-22 « Visée » rows), real server in stub
// mode, real Chromium. Written from the feature sheet (exit criterion) and docs/ecrans.md (« What kanevas-concepteur-vaisseaux-cibles builds »:
// rows « Visée 1 », « Visée 2 », alert texts, reader line « Visée : <nom> », empty line). Effects (arithmetic, refusals, storage) are proved at
// their door in `src/routes/vaisseaux-cibles-ensemble-api-lot-vaisseaux.test.ts`; here only what the user sees. Each wait is for what the
// user sees, never networkidle nor a fixed delay. Screenshots go to /tmp/shots, outside the tree.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player author of « Étoile du soir », Teo a reader; coque « Coque C2 » puissance 30, masse 30)
// Laser 3/3, Canon 5/5. Montage = montages_specialises (no limit, no target in the catalogue).
// E-22 nominal   : « Montage » ajouté puis quantité 2 → deux rangées « Visée 1 » et « Visée 2 », options « Choisir un élément », « Laser », « Canon » ;
//                  alerte « Choisissez l'élément visé (2 installations sur 2) », « Enregistrer » grisé ; Laser puis Canon → plus d'alerte, « Puissance libre 27 »
// E-22 doublon   : Laser sur les deux rangées → « Cet élément est déjà visé par un montage spécialisé » une seule fois, « Enregistrer » grisé
// E-22 rangées   : descendre à 1 retire « Visée 2 » avec son choix (et « Visée » seule) ; remonter à 2 la rend vide
// B-94 rouvrir   : enregistré puis rouvert, les rangées portent Laser et Canon
// E-22 lectrice  : Teo lit « Visée : Laser » et « Visée : Canon », ni choix ni « Enregistrer »
// E-22 vide      : sans arme, « Aucune arme à viser dans cette conception. » et l'alerte bloquante
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-cibles-ensemble';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 30, masse: 30, emports: 4, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5, moteur_spike: 0 };
const arme = (puissance: number, masse: number) => ({ ...el, puissance, masse, emport: 1, munitions: 0, cout_munition: 0 });
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'cibles-ecran-1',
  coques: [{ cle: 'c2', nom: 'Coque C2', classe: 2, ...coque }],
  armes: [{ cle: 'laser', nom: 'Laser', ...arme(3, 3) }, { cle: 'canon', nom: 'Canon', ...arme(5, 5) }],
  modifications: [{ cle: 'montage', nom: 'Montage', ...el, effet: 'montages_specialises' }],
});
const l = (nature: string, cle: string, quantite = 1, plus: Any = {}) => ({ nature, cle, quantite, ...plus });

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
  if (importer) {
    const r = await api('antor', 'POST', `${V}/catalogue/application`, catalogue());
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.refusTotal, 0, JSON.stringify(r.json));
  }
  const liste = (await api('antor', 'GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
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
const norm = (s: string) => s.replace(/[  ]/g, ' ');
const corps = async (p: Any) => norm(await p.locator('body').innerText());
const resultats = async (p: Any) => norm(await p.getByRole('complementary', { name: 'Résultats' }).innerText());
const attendreTexte = (p: Any, re: RegExp) => p.waitForFunction((src: string) => new RegExp(src).test(document.body.innerText.replace(/[  ]/g, ' ')), re.source, { timeout: 15000 });
const AM = 'Ajouter un aménagement'; const ARME = 'Ajouter une arme'; const MOD = 'Ajouter une modification';
async function ajouter(p: Any, bouton: string, nom: string) {
  const groupe = { [AM]: 'Aménagements', [ARME]: 'Armes', [MOD]: 'Modifications' }[bouton];
  await p.getByRole('button', { name: new RegExp(`^(${bouton}|Ajouter : ${groupe})$`) }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).first().waitFor();
}


const rangee = (p: Any, k: number) => p.getByRole('combobox', { name: `Visée ${k}`, exact: true });
const enregistrer = (p: Any) => p.getByRole('button', { name: 'Enregistrer' });
const plus = (p: Any) => p.getByRole('button', { name: 'Augmenter la quantité : Montage' }).click();
const moins = (p: Any) => p.getByRole('button', { name: 'Diminuer la quantité : Montage' }).click();
const DEJA = 'Cet élément est déjà visé par un montage spécialisé';

describe('B-89 · E-22 : rangées « Visée », une par installation', { skip: skipBrowser, timeout: 300000 }, () => {
  it('nominal : deux installations, deux rangées ; alerte du compte, « Enregistrer » grisé ; Laser puis Canon lèvent l’alerte, puissance libre 27 ; enregistré, rouvert avec ses deux choix', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'c2', choix: [l('armes', 'laser'), l('armes', 'canon')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, MOD, 'Montage');
    await p.getByRole('combobox', { name: 'Visée', exact: true }).waitFor();
    await attendreTexte(p, /Choisissez l['’]élément visé/);
    await plus(p);
    await rangee(p, 2).waitFor();
    assert.deepEqual((await rangee(p, 1).locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Laser', 'Canon']);
    await attendreTexte(p, /Choisissez l['’]élément visé \(2 installations sur 2\)/);
    assert.equal(await enregistrer(p).isDisabled(), true);
    await rangee(p, 1).selectOption({ label: 'Laser' });
    await attendreTexte(p, /Choisissez l['’]élément visé \(1 installation sur 2\)/);
    await rangee(p, 2).selectOption({ label: 'Canon' });
    await p.getByText(/Choisissez l['’]élément visé/).first().waitFor({ state: 'detached' });
    await p.getByText(/Puissance libre\s*27/).first().waitFor();
    await p.screenshot({ path: `${SHOTS}-nominal.png`, fullPage: true });
    const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await enregistrer(p).click();
    assert.equal((await rep).status(), 200);
    await p.getByText('Conception enregistrée.').waitFor();
    const q = await ouvrir(m, 'Léa', m.etoile);
    await rangee(q, 1).waitFor();
    assert.equal(await rangee(q, 1).locator('option:checked').innerText(), 'Laser');
    assert.equal(await rangee(q, 2).locator('option:checked').innerText(), 'Canon');
    await q.getByText(/Puissance libre\s*27/).first().waitFor();
  });

  it('exclusion : la même arme sur les deux rangées → « Cet élément est déjà visé par un montage spécialisé » une seule fois, « Enregistrer » grisé', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'c2', choix: [l('armes', 'laser'), l('armes', 'canon')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, MOD, 'Montage');
    await plus(p);
    await rangee(p, 2).waitFor();
    await rangee(p, 1).selectOption({ label: 'Laser' });
    await rangee(p, 2).selectOption({ label: 'Laser' });
    await p.getByText(DEJA).first().waitFor();
    assert.equal(await p.getByText(DEJA).count(), 1);
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.screenshot({ path: `${SHOTS}-doublon.png`, fullPage: true });
  });

  it('bords : descendre de 3 à 2 installations retire la dernière rangée avec son choix, remonter la rend vide', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'c2', choix: [l('armes', 'laser'), l('armes', 'canon')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, MOD, 'Montage');
    await plus(p); await plus(p);
    await rangee(p, 3).waitFor();
    await rangee(p, 3).selectOption({ label: 'Canon' });
    await moins(p);
    await rangee(p, 3).waitFor({ state: 'detached' });
    await plus(p);
    await rangee(p, 3).waitFor();
    assert.equal(await rangee(p, 3).inputValue(), '');
    await attendreTexte(p, /Choisissez l['’]élément visé \(3 installations sur 3\)/);
  });

  it('lectrice (Teo) : « Visée : Laser » et « Visée : Canon », ni choix ni « Enregistrer »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'c2', choix: [l('armes', 'laser'), l('armes', 'canon'), l('modifications', 'montage', 2, { cibles: [{ nature: 'armes', cle: 'laser', quantite: 1 }, { nature: 'armes', cle: 'canon', quantite: 1 }] })] });
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const t = await ouvrir(m, 'Teo', m.etoile);
    await attendreTexte(t, /Visée : Laser/);
    assert.match(await corps(t), /Visée : Canon/);
    assert.equal(await t.getByRole('combobox', { name: /^Visée/ }).count(), 0);
    assert.equal(await enregistrer(t).count(), 0);
    await t.screenshot({ path: `${SHOTS}-lectrice.png`, fullPage: true });
  });

  it('vide : sans arme, la ligne « Aucune arme à viser dans cette conception. » et l’alerte bloquante', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'c2', choix: [] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, MOD, 'Montage');
    await p.getByText('Aucune arme à viser dans cette conception.').first().waitFor();
    await attendreTexte(p, /Choisissez l['’]élément visé/);
    assert.equal(await enregistrer(p).isDisabled(), true);
  });
});
