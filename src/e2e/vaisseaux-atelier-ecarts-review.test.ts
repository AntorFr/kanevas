// Revue de kanevas-outils-format-vaisseaux-ecarts-atelier (E-22, B-85, Y-6): navigateur piloté, catalogue d'essai inventé (Y-4) écrit ici.
// TEST PLAN (Éneria d'essai, bouchon, Antor MJ / Léa joueur lectrice)
//   nominal  : défense « vitesse −2 » (U+2212), vitesse 1; modification « armure +2 · réparation 2 au moins », bloc réparation,
//              alerte à 1 + enregistrement, plus d'alerte à 2; « soutes 20 » (classe 2) puis cale visée → 40; moteur système
//              « … · coût −10 % » + « Ligne : 36 000 cr »; « Élément visé » propose la soute par classe
//   bords    : sans coque, « soutes » par classe absent; « vitesse +2 » signée; effet reparation_min seul sans doublon
//   lecteur  : Léa lit les mêmes légendes, sans contrôle
//   muet     : catalogue sans les champs → aucune légende ni bloc nouveau
//   390 px   : pas de débordement horizontal
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
    catalogue: 'swn/vaisseaux', version: muet ? 'rev-ecarts-muet' : 'rev-ecarts',
    coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5 }],
    moteurs: [],
    amenagements: [
      { cle: 'soute-r2', nom: 'Soute R2', ...el, ...si({ soute: 5, soute_par_classe: [10, 20, 40, 80] }) },
      { cle: 'moteur-sys', nom: 'Moteur système R', ...el, cout: 40000, ...si({ effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10 }) },
    ],
    defenses: [
      { cle: 'rotors-lourds', nom: 'Rotors lourds', ...el, bonus_vitesse: muet ? 0 : -2 },
      { cle: 'rotors-vifs', nom: 'Rotors vifs', ...el, bonus_vitesse: muet ? 1 : 2 },
    ],
    armes: [],
    modifications: [
      { cle: 'blindage-r', nom: 'Blindage R', ...el, cout: 0, cout_pct: 10, effet: 'armure', valeur: 2, ...si({ reparation_min: 2 }) },
      { cle: 'atelier-r', nom: 'Atelier R', ...el, effet: 'reparation_min', valeur: 2 },
      { cle: 'cale', nom: 'Cale R', ...el, limite: 1, effet: 'soutes_doublees' },
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
async function remettre(muet = false, coqueCle: string | null = 'fregate-r', choix: Any[] = []) {
  if (!E) E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('antor', 'POST', `${B()}/catalogue/application`, catalogue(muet));
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  const l = (await api('antor', 'GET', `${B()}/conceptions`)).json;
  orak = l.conceptions.find((c: Any) => c.titre === "Vent d'Orak").ficheId;
  etoile = l.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId;
  for (const f of [orak, etoile]) {
    const v = (await api('antor', 'GET', `${B()}/conceptions/${f}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${f}`, { coque: coqueCle, choix, version: v.version });
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
const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const res = async (p: Any) => norm(await p.locator('.vx-resultats').innerText());
const ligne = (p: Any, nom: string) => p.getByRole('button', { name: `Retirer : ${nom}` }).locator('xpath=ancestor::li[1]');
async function ajouter(p: Any, nature: string, nom: string) {
  await p.getByRole('button', { name: nature }).first().click();
  const l = p.locator('li').filter({ hasText: nom }).last();
  await l.waitFor();
  await l.getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).waitFor();
}
const attendre = (p: Any, re: RegExp) => p.waitForFunction((s: string) => new RegExp(s).test((document.querySelector('.vx-resultats') as HTMLElement).innerText.replace(/[  ]/g, ' ')), re.source, { timeout: 15000 });
const AJ_AM = 'Ajouter un aménagement'; const AJ_DEF = 'Ajouter une défense'; const AJ_MOD = 'Ajouter une modification';

describe('E-22 écarts, 1280 px', { skip: skipBrowser, timeout: 300000 }, () => {
  it('défense : « vitesse −2 » (U+2212) et vitesse 1; « vitesse +2 » signée', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_DEF }).first().click();
    const lourds = norm(await p.locator('li').filter({ hasText: 'Rotors lourds' }).last().innerText());
    assert.match(lourds, /vitesse −2/);
    assert.match(norm(await p.locator('li').filter({ hasText: 'Rotors vifs' }).last().innerText()), /vitesse \+2/);
    await p.getByRole('button', { name: 'Fermer' }).click();
    await ajouter(p, AJ_DEF, 'Rotors lourds');
    await attendre(p, /Vitesse\s*1(?!\d)/);
    await ligne(p, 'Rotors lourds').getByText(/vitesse −2/).waitFor();
    await p.screenshot({ path: '/tmp/shots/ecarts-1280-vitesse.png', fullPage: true });
  });

  it('réparation : légende après l’effet, bloc présent, alerte à 1 + enregistrement, levée à 2; effet seul sans doublon', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    const champ = p.locator('input[aria-label="Compétence de réparation"]');
    assert.equal(await champ.count(), 0, 'rien ne la demande encore');
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    assert.match(norm(await p.locator('li').filter({ hasText: 'Blindage R' }).last().innerText()), /armure \+2 · réparation 2 au moins/);
    const seul = norm(await p.locator('li').filter({ hasText: 'Atelier R' }).last().innerText());
    assert.equal((seul.match(/réparation 2 au moins/g) ?? []).length, 1, seul);
    await p.getByRole('button', { name: 'Fermer' }).click();
    await ajouter(p, AJ_MOD, 'Blindage R');
    await champ.waitFor();
    await champ.fill('1');
    await p.getByText(/Blindage R.*réparation 2 au moins \(1 choisie\)/).first().waitFor();
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);
    const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    assert.equal((await rep).status(), 200);
    await champ.fill('2');
    await p.waitForFunction(() => !/réparation 2 au moins \(/.test(document.body.innerText), null, { timeout: 15000 });
    await p.screenshot({ path: '/tmp/shots/ecarts-1280-reparation.png', fullPage: true });
  });

  it('effet seul : le bloc de réparation reste présent (voie historique)', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await ajouter(p, AJ_MOD, 'Atelier R');
    await p.locator('input[aria-label="Compétence de réparation"]').waitFor();
  });

  it('soute par classe : « soutes 20 », cale visée → 40, « Élément visé » la propose', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await ajouter(p, AJ_AM, 'Soute R2');
    await attendre(p, /Soutes\s*20(?!\d)/);
    await ligne(p, 'Soute R2').getByText(/soutes 20/).waitFor();
    await ajouter(p, AJ_MOD, 'Cale R');
    const select = p.getByLabel('Élément visé');
    await select.waitFor();
    assert.match(norm(await select.innerText()), /Soute R2/);
    await select.selectOption({ label: 'Soute R2' });
    await attendre(p, /Soutes\s*40(?!\d)/);
    await p.screenshot({ path: '/tmp/shots/ecarts-1280-soutes.png', fullPage: true });
  });

  it('moteur système : légende complète et « Ligne : 36 000 cr »', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await ajouter(p, AJ_AM, 'Moteur système R');
    await p.getByText('Ligne : 36 000 cr').first().waitFor();
    await ligne(p, 'Moteur système R').getByText(/coût −10 %/).waitFor();
    const l = norm(await ligne(p, 'Moteur système R').innerText());
    assert.match(l, /moteur système · rend puissance 3 et masse 1,5 · coût −10 %/);
    assert.match(l, /Ligne : 36 000 cr/);
  });

  it('un lecteur (Téo, autre lecteur) lit les mêmes légendes sans contrôle', async () => {
    await remettre(false, 'fregate-r', [
      { nature: 'defenses', cle: 'rotors-lourds', quantite: 1 },
      { nature: 'modifications', cle: 'blindage-r', quantite: 1 },
      { nature: 'amenagements', cle: 'soute-r2', quantite: 1 },
      { nature: 'amenagements', cle: 'moteur-sys', quantite: 1 },
    ]);
    await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    const p = await ouvrir('teo', etoile, 1280);
    await p.getByText('Ligne : 36 000 cr').first().waitFor();
    await p.getByText(/moteur système · rend/).first().waitFor();
    for (const re of [/vitesse −2/, /Compétence de réparation : 0/, /soutes 20/, /moteur système · rend puissance 3 et masse 1,5 · coût −10 %/, /Ligne : 36 000 cr/]) {
      await p.waitForFunction(
        (s: string) => new RegExp(s).test(((document.querySelector('main') as HTMLElement).innerText).replace(/[  ]/g, ' ').replace(/\s+/g, ' ')),
        re.source,
        { timeout: 15000 },
      );
    }
    const t = norm(await p.locator('main').innerText());
    assert.match(t, /vitesse −2/);
    assert.match(t, /Compétence de réparation : 0/);
    assert.match(t, /soutes 20/);
    assert.match(t, /moteur système · rend puissance 3 et masse 1,5 · coût −10 %/);
    assert.match(t, /Ligne : 36 000 cr/);
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    assert.equal(await p.locator('input[aria-label="Compétence de réparation"]').count(), 0);
  });

  it('catalogue sans ces champs : aucune légende ni bloc nouveau', async () => {
    await remettre(true);
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_DEF }).first().click();
    assert.doesNotMatch(norm(await p.locator('li').filter({ hasText: 'Rotors lourds' }).last().innerText()), /−/);
    await p.getByRole('button', { name: 'Fermer' }).click();
    await p.getByRole('button', { name: AJ_AM }).first().click();
    const t = norm(await p.locator('li').filter({ hasText: 'Soute R2' }).last().innerText());
    assert.doesNotMatch(t, /soutes/);
    const m = norm(await p.locator('li').filter({ hasText: 'Moteur système R' }).last().innerText());
    assert.doesNotMatch(m, /coût −/);
    await p.getByRole('button', { name: 'Fermer' }).click();
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    assert.doesNotMatch(norm(await p.locator('li').filter({ hasText: 'Blindage R' }).last().innerText()), /réparation/);
    assert.equal(await p.locator('input[aria-label="Compétence de réparation"]').count(), 0);
  });
});

describe('E-22 écarts, 390 px', { skip: skipBrowser, timeout: 300000 }, () => {
  it('les légendes passent à la ligne sans débordement horizontal', async () => {
    await remettre(false, 'fregate-r', [
      { nature: 'defenses', cle: 'rotors-lourds', quantite: 1 },
      { nature: 'modifications', cle: 'blindage-r', quantite: 1 },
      { nature: 'amenagements', cle: 'soute-r2', quantite: 1 },
      { nature: 'amenagements', cle: 'moteur-sys', quantite: 1 },
    ]);
    const p = await ouvrir('antor', orak, 390);
    await p.getByText('Ligne : 36 000 cr').first().waitFor();
    await p.getByText(/coût −10 %/).first().waitFor();
    const largeur = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largeur <= 390, `scrollWidth ${largeur}`);
    await p.screenshot({ path: '/tmp/shots/ecarts-390.png', fullPage: true });
  });
});
