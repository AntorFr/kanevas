// Revue de kanevas-outils-format-vaisseaux-regles-livre-atelier (E-22, B-87, W-4, W-6): navigateur piloté, catalogue d'essai W-4 écrit par le test, attendus calculés à la main.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 20, masse: 20, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = (muet = false) => {
  const si = <T,>(x: T) => (muet ? {} : x);
  return {
    catalogue: 'swn/vaisseaux', version: muet ? 'rev-l-muet' : 'rev-l',
    coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque, puissance: 60, vitesse: 3, armure: 5 }],
    moteurs: [],
    amenagements: [],
    defenses: [],
    armes: [{ cle: 'laser-z', nom: 'Laser Z', ...el, puissance: 10, masse: 1, emport: 1, munitions: 0, cout_munition: 0 }],
    modifications: [
      { cle: 'optimise-l', nom: 'Optimise L', ...el, cout: 0, puissance: 0, masse: 0, limite: 1, ...si({ effet: 'soutes_optimisees_livre' }) },
      { cle: 'blindage-l', nom: 'Blindage L', ...el, cout: 0, puissance: 0, masse: 0, limite: 1, ...si({ effet: 'blindage_renforce', valeur: 2 }) },
      { cle: 'montage-l', nom: 'Montage L', ...el, cout: 0, puissance: 0, masse: 0, limite: 1, ...si({ effet: 'montages_specialises', vise: { nature: 'armes', cle: 'laser-z' } }) },
      { cle: 'surcharge-l', nom: 'Surcharge L', ...el, cout: 0, puissance: 0, masse: 0, limite: 2, ...si({ effet: 'surcharge_cumulable', effet_pct: 50, vise: { nature: 'armes', cle: 'laser-z' } }) },
    ],
    exemples: [],
  };
};

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
let E = 0; let orak = 0; let etoile = 0;
const B = () => `/api/univers/${E}/outils/swn/vaisseaux`;
async function remettre(muet = false) {
  if (!E) E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('antor', 'POST', `${B()}/catalogue/application`, catalogue(muet));
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  const l = (await api('antor', 'GET', `${B()}/conceptions`)).json;
  orak = l.conceptions.find((c: Any) => c.titre === "Vent d'Orak").ficheId;
  etoile = l.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId;
  for (const f of [orak, etoile]) {
    const v = (await api('antor', 'GET', `${B()}/conceptions/${f}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${f}`, { coque: 'fregate-r', choix: [], version: v.version });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
  }
}
async function ouvrir(compte: string, fiche: number, largeur: number): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await page.locator('.vx-resultats').waitFor();
  return page;
}
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');
const res = async (p: Any) => norm(await p.locator('.vx-resultats').innerText());
async function ajouter(p: Any, nature: string, nom: string) {
  await p.getByRole('button', { name: nature }).first().click();
  const ligne = p.locator('li').filter({ hasText: nom }).last();
  await ligne.waitFor();
  await ligne.getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).waitFor();
}
const ligne = (p: Any, nom: string) => p.getByRole('button', { name: `Retirer : ${nom}` }).locator('xpath=ancestor::li[1]');
const AJ_AM = 'Ajouter un aménagement'; const AJ_MOD = 'Ajouter une modification';
const enregistrer = (p: Any) => p.getByRole('button', { name: 'Enregistrer' });
const sauver = async (p: Any) => {
  const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
  await enregistrer(p).click();
  return (await rep).status();
};


const opts = async (p: Any) => (await p.getByRole('combobox', { name: 'Élément visé' }).last().locator('option').allInnerTexts()).map(norm);
const visees = (p: Any, nom: string) => ligne(p, nom).getByRole('combobox', { name: 'Élément visé' });
async function modif(p: Any, nom: string) {
  await p.getByRole('button', { name: AJ_MOD }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).first().waitFor();
}


const texte = async (p: Any) => norm(await p.locator('body').innerText());
async function attendre(p: Any, re: RegExp) {
  await p.waitForFunction(({ s, f }: Any) => new RegExp(s, f).test(document.body.innerText.replace(/[\u00A0\u202F]/g, ' ')), { s: re.source, f: re.flags }, { timeout: 15000 });
}
async function choisir(p: Any, nom: string, ouvrirBouton = AJ_MOD) {
  await p.getByRole('button', { name: new RegExp(`^(${ouvrirBouton}|Ajouter : Modifications)$`) }).first().click();
  const li = p.locator('li').filter({ hasText: nom }).last();
  await li.waitFor();
  return li;
}

describe('E-22 livre', { skip: skipBrowser, timeout: 240000 }, () => {
  for (const largeur of [1280, 390]) {
    it(`les quatre effets : légendes et lignes ajustées lues, ${largeur} px`, async () => {
      await remettre();
      const p = await ouvrir('antor', orak, largeur);
      // soutes optimisées
      const li = await choisir(p, 'Optimise L');
      assert.match(norm(await li.innerText()), /soutes −10 % de masse libre, fret ×2/);
      await li.getByRole('button').first().click();
      await p.getByRole('button', { name: 'Retirer : Optimise L' }).waitFor();
      await attendre(p, /masse −2/);
      // blindage renforcé : légende, bloc Réparation, armure 10 pour 3
      const lb = await choisir(p, 'Blindage L');
      assert.match(norm(await lb.innerText()), /armure \+2 et réparation/);
      await lb.getByRole('button').first().click();
      await p.getByRole('button', { name: 'Retirer : Blindage L' }).waitFor();
      await p.getByRole('heading', { name: 'Compétence de réparation' }).waitFor();
      const rep = p.locator('input[aria-label="Compétence de réparation"]').first();
      await rep.fill('3');
      await attendre(p, /armure \+5/);
      await attendre(p, /Armure\s*10\b/);
      // montage : arme d'abord
      await p.getByRole('button', { name: 'Ajouter une arme' }).first().click();
      await p.locator('li').filter({ hasText: 'Laser Z' }).last().getByRole('button').first().click();
      await p.getByRole('button', { name: 'Retirer : Laser Z' }).waitFor();
      const lm = await choisir(p, 'Montage L');
      assert.match(norm(await lm.innerText()), /puissance et masse de l['’]arme visée ÷ 2/);
      await lm.getByRole('button').first().click();
      await p.getByRole('button', { name: 'Retirer : Montage L' }).waitFor();
      assert.deepEqual((await visees(p, 'Montage L').locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Laser Z']);
      await visees(p, 'Montage L').selectOption('armes/laser-z');
      await attendre(p, /masse \+1, puissance \+5/);
      // surcharge, une puis deux fois
      const ls = await choisir(p, 'Surcharge L');
      assert.match(norm(await ls.innerText()), /puissance de l['’]arme \+50 % par installation/);
      await ls.getByRole('button').first().click();
      await p.getByRole('button', { name: 'Retirer : Surcharge L' }).waitFor();
      assert.deepEqual((await visees(p, 'Surcharge L').locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Laser Z']);
      await visees(p, 'Surcharge L').selectOption('armes/laser-z');
      await attendre(p, /puissance \+5/);
      await p.getByRole('button', { name: 'Ajouter : Modifications' }).click();
      await p.locator('li').filter({ hasText: 'Surcharge L' }).getByRole('button', { name: /^Ajouter / }).click();
      await attendre(p, /puissance \+10/);
      const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert.ok(m.sw <= m.iw + 1, `aucun défilement horizontal ${JSON.stringify(m)}`);
      await p.screenshot({ path: `/tmp/shots/l-${largeur}.png`, fullPage: true });
    });
  }

  it('lecteur : mêmes légendes, aucun contrôle', async () => {
    await remettre();
    const v = (await api('antor', 'GET', `${B()}/conceptions/${etoile}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${etoile}`, {
      coque: 'fregate-r', version: v.version, reparation: 3,
      choix: [
        { nature: 'armes', cle: 'laser-z', quantite: 1 },
        { nature: 'modifications', cle: 'optimise-l', quantite: 1 },
        { nature: 'modifications', cle: 'blindage-l', quantite: 1 },
        { nature: 'modifications', cle: 'montage-l', quantite: 1, vise: { nature: 'armes', cle: 'laser-z' } },
        { nature: 'modifications', cle: 'surcharge-l', quantite: 2, vise: { nature: 'armes', cle: 'laser-z' } },
      ],
    });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
    await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    const p = await ouvrir('teo', etoile, 1280);
    await p.getByText('Lecture seule.').waitFor();
    await attendre(p, /Élément visé : Laser Z/);
    const t = await texte(p);
    for (const re of [/soutes −10 % de masse libre, fret ×2/, /armure \+2 et réparation/, /puissance et masse de l['’]arme visée ÷ 2/, /puissance de l['’]arme \+50 % par installation/, /Élément visé : Laser Z/]) assert.match(t, re);
    assert.equal(await p.locator('input[type="number"]').count(), 0);
    assert.equal(await p.getByRole('combobox').count(), 0);
  });

  it('catalogue sans ces effets : ni légende ni contrôle nouveau', async () => {
    await remettre(true);
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    for (const n of ['Optimise L', 'Blindage L', 'Montage L', 'Surcharge L']) {
      assert.doesNotMatch(norm(await p.locator('li').filter({ hasText: n }).last().innerText()), /soutes −|armure \+|arme visée|par installation/, n);
    }
    await p.locator('li').filter({ hasText: 'Blindage L' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Blindage L' }).waitFor();
    assert.equal(await p.getByRole('heading', { name: 'Compétence de réparation' }).count(), 0);
    assert.equal(await p.getByRole('combobox', { name: 'Élément visé' }).count(), 0);
  });
});
