// ecrans: outil
// Feature-level black-box screen tests of kanevas-concepteur-vaisseaux-mods-livre (E-22, B-93, B-94, P-19 step 6, P-22): real browser, real
// server in stub mode. Written from the feature sheet, docs/ecrans.md (E-22 « What … builds » criteria and alert texts) and docs/parcours.md.
// The effects (figures, alerts, refusals, storage) are proved at their door in `src/routes/vaisseaux-mods-livre-ensemble-api-lot-vaisseaux.test.ts`;
// here only what the user sees. Every expected text is written by hand from the docs.
//
// TEST PLAN (catalogue d'essai : coque de classe 3, « Refonte M » 20 000 cr 3 composants, « Prétech M » 2 composants par classe)
// E-22 Léa 1280 et 390 px  nominal : une installation → « Installation : 4 jours d'équipage, 1 jour avec chantier » ; Réparation 1 → « Maintenance : 3 » ;
//                          quatre installations → « 16 jours d'équipage, 4 jours avec chantier » et « 4 mods entretenus, Maintenance 3 » ; 2 intégrées →
//                          alerte disparue, « Refonte : 200 000 cr, 12 composants » ; 3 intégrées → « Plus de mods intégrés que 2 × Réparation », Enregistrer permis
//                          bords : ni débordement horizontal à 390 px ; sans modification, ni ligne ni bloc de réparation
// E-22 prétech par classe  une installation de 2 composants sur une coque de classe 3 → « Composants prétech : 6 »
// E-22 lecteur (Téo)       « Intégrées à la coque : 2 sur 3 », « Modificateurs Int + Con : 0 », « Maintenance : 3 », aucun champ ni « Enregistrer » ; rien quand integre vaut 0
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const catalogue = {
  catalogue: 'swn/vaisseaux', version: 'ens-mods',
  coques: [
    { cle: 'c3', nom: 'Coque trois', classe: 3, cout: 300000, pv: 5, ca: 10, puissance: 60, masse: 60, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5 },
  ],
  moteurs: [], amenagements: [], defenses: [], armes: [],
  modifications: [
    { cle: 'refonte-m', nom: 'Refonte M', ...el, cout: 20000, composants: 3 },
    { cle: 'pretech-m', nom: 'Pretech M', ...el, cout: 0, composants: 2, composants_par_classe: 1 },
  ],
  exemples: [],
};

before(async () => {
  if (skipBrowser) return;
  mkdirSync('/tmp/shots', { recursive: true });
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function api(compte: string, methode: string, chemin: string, corps?: object): Promise<Any> {
  const r0 = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  const cookie = (r0.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie, ...(corps ? { 'content-type': 'application/json' } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
let E = 0; let orak = 0; let etoile = 0;
const B = () => `/api/univers/${E}/outils/swn/vaisseaux`;
async function remettre(): Promise<void> {
  if (!E) E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  assert.equal((await api('antor', 'POST', `${B()}/catalogue/application`, catalogue)).statut, 200);
  const l = (await api('antor', 'GET', `${B()}/conceptions`)).json;
  orak = l.conceptions.find((c: Any) => c.titre === "Vent d'Orak").ficheId;
  etoile = l.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId;
  for (const f of [orak, etoile]) await poser(f, []);
}
async function poser(fiche: number, choix: Any[], plus: Any = {}): Promise<void> {
  const v = (await api('antor', 'GET', `${B()}/conceptions/${fiche}`)).json;
  const r = await api('antor', 'PUT', `${B()}/conceptions/${fiche}`, { coque: 'c3', choix, version: v.version, ...plus });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
}
async function ouvrir(compte: string, fiche: number, largeur: number): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, compte === 'lea' ? 'Léa' : compte);
  ctxs.push(ctx);
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await page.locator('.vx-resultats').waitFor();
  return page;
}
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const corps = async (p: Any) => norm(await p.locator('body').innerText());
async function voir(p: Any, re: RegExp) {
  await p.waitForFunction(({ s, f }: Any) => new RegExp(s, f).test(document.body.innerText.replace(/[\u00a0\u202f]/g, ' ')), { s: re.source, f: re.flags }, { timeout: 15000 });
}
async function ajouter(p: Any, nom: string) {
  await p.getByRole('button', { name: /^(Ajouter une modification|Ajouter : Modifications)$/ }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).waitFor();
}
const plus = async (p: Any, nom: string, n: number) => { for (let i = 0; i < n; i++) await p.getByRole('button', { name: `Augmenter la quantité : ${nom}` }).click(); };
const integrees = (p: Any) => p.locator('input[aria-label="Intégrées à la coque : Refonte M"]');

describe('E-22 mods du livre (ensemble)', { skip: skipBrowser, timeout: 300000 }, () => {
  const parcours = (largeur: number) => async () => {
    await remettre();
    const p = await ouvrir('lea', orak, largeur);
    assert.doesNotMatch(await corps(p), /Installation :|Maintenance :|Composants prétech|Refonte :/);
    assert.equal(await p.getByRole('heading', { name: 'Compétence de réparation' }).count(), 0);
    await ajouter(p, 'Refonte M');
    await voir(p, /Installation\s*:?\s*4 jours d['’]équipage, 1 jour avec chantier/);
    await p.getByRole('heading', { name: 'Compétence de réparation' }).waitFor();
    await p.locator('input[aria-label="Compétence de réparation"]').fill('1');
    await voir(p, /Maintenance : 3\b/);
    await plus(p, 'Refonte M', 3);
    await voir(p, /Installation\s*:?\s*16 jours d['’]équipage, 4 jours avec chantier/);
    await voir(p, /4 mods entretenus, Maintenance 3/);
    await integrees(p).fill('2');
    await voir(p, /Refonte\s*:?\s*200 000 cr, 12 composants/);
    await p.waitForFunction(() => !/mods entretenus/.test(document.body.innerText), null, { timeout: 15000 });
    await integrees(p).fill('3');
    await voir(p, /Plus de mods intégrés que 2 × Réparation/);
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(m.sw <= m.iw + 1, `aucun défilement horizontal ${JSON.stringify(m)}`);
    await p.screenshot({ path: `/tmp/shots/ensemble-mods-${largeur}.png`, fullPage: true });
  };
  it('E-22 Léa : installation, Maintenance, alerte, intégrées, refonte, 1280 px', parcours(1280));
  it('E-22 Léa : installation, Maintenance, alerte, intégrées, refonte, 390 px', parcours(390));

  it('E-22 prétech par classe : une installation de 2 composants sur une coque de classe 3 affiche « Composants prétech : 6 »', async () => {
    await remettre();
    const p = await ouvrir('lea', orak, 1280);
    await ajouter(p, 'Pretech M');
    await voir(p, /Composants prétech\s*:?\s*6\b/);
  });

  it('E-22 lecteur Téo : texte seul pour les intégrées, les modificateurs et la Maintenance ; rien quand aucune intégrée', async () => {
    await remettre();
    await poser(etoile, [{ nature: 'modifications', cle: 'refonte-m', quantite: 3, integre: 2 }], { reparation: 1 });
    await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    const p = await ouvrir('teo', etoile, 1280);
    await voir(p, /Intégrées à la coque : 2 sur 3/);
    const t = await corps(p);
    assert.match(t, /Modificateurs Int \+ Con : 0/);
    assert.match(t, /Maintenance : 3\b/);
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    assert.equal(await p.locator('input').count(), 0);
    await p.screenshot({ path: '/tmp/shots/ensemble-mods-lecteur.png', fullPage: true });
    await poser(etoile, [{ nature: 'modifications', cle: 'refonte-m', quantite: 3 }], { reparation: 1 });
    const q = await ouvrir('teo', etoile, 1280);
    await voir(q, /Maintenance : 3\b/);
    assert.doesNotMatch(await corps(q), /Intégrées à la coque/);
  });
});
