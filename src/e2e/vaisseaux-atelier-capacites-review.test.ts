// ecrans: outil
// Review tests of kanevas-concepteur-vaisseaux-capacites-equipage-atelier (E-22, B-91, B-92, B-94, V-5): « Capacités » block, effect line,
// « dont joueurs » / « dont robots », crew costs, divided price, reader and 390 px, on a trial catalogue written by the test.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const EFFET = 'e'.repeat(100) + ' ' + 'f'.repeat(99);
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 20, masse: 20, emports: 2, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'review-capacites',
  coques: [{ cle: 'c6', nom: 'Coque six', ...coque, equipage_min: 2, equipage_max: 6 }],
  moteurs: [],
  amenagements: [
    { cle: 'vie', nom: 'Vie étendue', ...el, capacite: 'equipage_max_pct', effet_jeu: EFFET },
    { cle: 'canot', nom: 'Hangar à canots', ...el, capacite: 'canots' },
    { cle: 'prov', nom: 'Provision étendue', ...el, capacite: 'provisions' },
    { cle: 'auto', nom: 'Automatisation', ...el, limite: 1, effet: 'support_automatisation' },
  ],
  defenses: [], armes: [], modifications: [], exemples: [],
});

before(async () => {
  if (skipBrowser) return;
  mkdirSync('/tmp/shots', { recursive: true });
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function cookie(compte: string): Promise<string> {
  const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
async function api(compte: string, methode: string, chemin: string, corps?: object): Promise<Any> {
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: await cookie(compte), ...(corps ? { 'content-type': 'application/json' } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
const q = (cle: string, quantite = 1) => ({ nature: 'amenagements', cle, quantite });
let monde: { E: number; orak: number; etoile: number } | null = null;
async function ids() {
  if (monde) return monde;
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('antor', 'POST', `/api/univers/${E}/outils/swn/vaisseaux/catalogue/application`, catalogue());
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  const B = `/api/univers/${E}/outils/swn/vaisseaux/conceptions`;
  const l = (await api('antor', 'GET', B)).json;
  const fiche = (t: string): number => l.conceptions.find((c: Any) => c.titre === t).ficheId;
  const orak = fiche("Vent d'Orak"); const etoile = fiche('Étoile du soir');
  // Orak: 1 vie + 1 canot + 2 provisions, crew 10 (max 12), 2 PJ, 3 robots, automation
  await pose(B, orak, { coque: 'c6', equipage: 10, pj: 2, robots: 3, choix: [q('vie'), q('canot'), q('prov', 2), q('auto')] });
  await pose(B, etoile, { coque: 'c6', equipage: 10, pj: 2, robots: 3, choix: [q('vie'), q('auto')] });
  monde = { E, orak, etoile };
  return monde;
}
async function pose(B: string, f: number, corps: Any) {
  const v = (await api('antor', 'GET', `${B}/${f}`)).json;
  const r = await api('antor', 'PUT', `${B}/${f}`, { ...corps, version: v.version });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  return r.json;
}
async function ouvrir(compte: string, fiche: number, largeur: number): Promise<Any> {
  const { E } = await ids();
  const { ctx, page: p } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  await p.setViewportSize({ width: largeur, height: 800 });
  await p.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await p.locator('.vx-resultats').waitFor();
  return p;
}
const norm = (s: string) => s.replace(/[\u00A0\u202F\u2009]/g, ' ');
const res = async (p: Any) => norm(await p.locator('.vx-resultats').innerText());
const pas = async (p: Any) => { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); assert.ok(m.sw <= m.iw + 1, `défilement horizontal ${JSON.stringify(m)}`); };

describe('E-22 capacités et équipage, 1280 px', { skip: skipBrowser }, () => {
  it('Antor : bloc Capacités, coûts d’équipage, champs dont, effet_jeu sous l’élément', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByText('Équipage : 640 cr/jour').waitFor();
    const t = await res(p);
    assert.match(t, /Capacités/);
    assert.match(t, /Équipage maximum 12/);
    assert.match(t, /Canots de sauvetage 1/);
    assert.match(t, /Équipage : 640 cr\/jour/);
    assert.match(t, /Robots : 3 000 cr \(une fois\)/);
    assert.doesNotMatch(t, /÷/);
    assert.equal(await p.locator('input[aria-label="dont joueurs"]').inputValue(), '2');
    assert.equal(await p.locator('input[aria-label="dont robots"]').inputValue(), '3');
    assert.equal(await p.locator('input[aria-label="dont robots"]').isEnabled(), true);
    assert.ok((await p.locator('.vx-effet-jeu').first().innerText()).startsWith('eee'));
    await p.screenshot({ path: '/tmp/shots/capacites-1280.png', fullPage: true });
  });

  it('sans automatisation : 1 robot donne l’alerte bloquante et refuse Enregistrer ; 0 la lève et grise le champ', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: 'Retirer : Automatisation' }).click();
    await p.getByText('Des robots exigent un système d’automatisation.', { exact: false }).or(p.getByText("Des robots exigent un système d'automatisation.")).first().waitFor();
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    assert.equal(await p.locator('input[aria-label="dont robots"]').isEnabled(), true, 'modifiable tant que robots > 0');
    await p.locator('input[aria-label="dont robots"]').fill('0');
    await p.getByText(/Des robots exigent/).first().waitFor({ state: 'detached' });
    await p.getByText(/Aucun système d.automatisation sur cette conception\./).waitFor();
    assert.equal(await p.locator('input[aria-label="dont robots"]').isDisabled(), true);
    const t = await res(p);
    assert.doesNotMatch(t, /Robots :/, 'pas de ligne robots à 0');
    assert.match(t, /Équipage : /);
    await p.screenshot({ path: '/tmp/shots/capacites-sans-auto.png', fullPage: true });
  });

  it('boîte de choix : effet_jeu lu, un élément sans effet_jeu n’a pas de ligne vide', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).or(p.getByRole('button', { name: /Ajouter un aménagement|Ajouter des aménagements/i })).first().click();
    const vie = p.locator('li').filter({ hasText: 'Vie étendue' }).last();
    await vie.waitFor();
    assert.match(norm(await vie.innerText()), /e{100} f{99}/);
    const canot = p.locator('li').filter({ hasText: 'Hangar à canots' }).last();
    assert.equal(await canot.locator('.vx-effet-jeu').count(), 0);
  });

  it('E-20 : les quatre réglages du concepteur ; cadence 0 refusée avec « Valeur hors limites. »', async () => {
    const { E, orak } = await ids();
    const { ctx, page: p } = await connecte(browser, srv.base, 'antor');
    ctxs.push(ctx);
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(`/univers/${E}/parametres?onglet=outils`);
    for (const nom of ['Diviseur de prix', 'Cadence du chantier', 'Solde par jour', 'Vivres par jour']) await p.getByText(nom, { exact: true }).first().waitFor();
    const ligne = (nom: string) => p.locator('.outil-reglage').filter({ has: p.getByText(nom, { exact: true }) });
    await ligne('Cadence du chantier').getByRole('button', { name: /Remplacer/ }).click();
    await p.getByLabel('Cadence du chantier').fill('0');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Valeur hors limites.').waitFor({ timeout: 5000 });
  });

  it('Teo (joueur non auteur) lit bloc et coûts sans saisie ; E-20 reste « Page introuvable. »', async () => {
    const { E, etoile } = await ids();
    const m = await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    assert.ok(m.statut === 201 || /déjà membre/.test(m.json?.message ?? ''), JSON.stringify(m.json));
    const { ctx, page: r } = await connecte(browser, srv.base, 'teo');
    ctxs.push(ctx);
    await r.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${etoile}`);
    await r.locator('.vx-resultats').waitFor();
    await r.getByText('Lecture seule.').waitFor();
    const t = await res(r);
    assert.match(t, /Équipage maximum 12/);
    assert.match(t, /Équipage : 640 cr\/jour/);
    assert.match(t, /Robots : 3 000 cr \(une fois\)/);
    assert.equal(await r.locator('input[aria-label="dont joueurs"]').count(), 0);
    assert.equal(await r.locator('input[aria-label="dont robots"]').count(), 0);
    assert.equal(await r.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    const corps = norm(await r.locator('main').innerText());
    assert.match(corps, /dont joueurs\s*2/);
    assert.match(corps, /dont robots\s*3/);
    await r.goto(`/univers/${E}/parametres?onglet=outils`);
    await r.getByText('Page introuvable.').waitFor();
  });
});

describe('E-22 capacités et équipage, 390 px', { skip: skipBrowser }, () => {
  it('équipage de 100 000 et ligne d’effet de 200 caractères sans débordement', async () => {
    const { E, orak } = await ids();
    const B = `/api/univers/${E}/outils/swn/vaisseaux/conceptions`;
    await pose(B, orak, { coque: 'c6', equipage: 100000, pj: 0, robots: 0, choix: [q('vie')] });
    const p = await ouvrir('antor', orak, 390);
    await p.locator('.vx-couts').waitFor();
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).or(p.getByRole('button', { name: /Ajouter un aménagement|Ajouter des aménagements/i })).first().click();
    await p.locator('li').filter({ hasText: 'Vie étendue' }).last().waitFor();
    await pas(p);
    await p.screenshot({ path: '/tmp/shots/capacites-390.png', fullPage: true });
  });
});
