// Revue de kanevas-outils-format-vaisseaux-effets-atelier (E-22, X-7, B-83): navigateur piloté, catalogue d'essai inventé écrit par le test (X-8).
// Sélecteurs : rôles et textes visibles ; chaque geste attend ce que l'utilisateur voit.
//
// PLAN
//   blindage   : 30 000 cr de ligne, armure 7, légende « 10 % de la coque »
//   réparation : atelier (réparation 2 au moins) ; 1 → alerte, enregistrable ; 2 → disparaît
//   cale       : sans cible → alerte bloquante + enregistrement refusé ; soute-r choisi → soutes 20
//   sans éligible : « Aucun élément à viser dans cette conception. » + alerte bloquante
//   réacteur   : stepper borné à 5 ; « 3 points : −3 puissance, +1,5 masse »
//   moteur-sys : légende « moteur système · rend puissance 3 et masse 1,5 » en classe 2
//   persistance: réparation, points et cible relus après réouverture
//   lecteur    : chiffres sans contrôle
//   sans champs: catalogue muet → aucun contrôle nouveau
//   390 px     : pas de débordement horizontal
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
    catalogue: 'swn/vaisseaux', version: muet ? 'rev-muet' : 'rev-effets',
    coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5 }],
    moteurs: [],
    amenagements: [
      { cle: 'soute-r', nom: 'Soute R', ...el, ...si({ soute: 10 }) },
      { cle: 'moteur-sys', nom: 'Moteur système', ...el, ...si({ effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] }) },
    ],
    defenses: [],
    armes: [],
    modifications: [
      { cle: 'blindage', nom: 'Blindage', ...el, cout: 0, ...si({ cout_pct: 10, effet: 'armure', valeur: 2 }) },
      { cle: 'atelier', nom: 'Atelier', ...el, ...si({ effet: 'reparation_min', valeur: 2 }) },
      { cle: 'cale', nom: 'Cale', ...el, limite: 1, ...si({ effet: 'soutes_doublees' }) },
      { cle: 'reacteur', nom: 'Réacteur', ...el, limite: 1, ...si({ effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5 }) },
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

describe('E-22 effets, 1280 px', { skip: skipBrowser, timeout: 240000 }, () => {
  it('blindage : 30 000 cr de ligne, armure 7, légende en pourcentage', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    const choix = p.locator('li').filter({ hasText: 'Blindage' }).last();
    await choix.waitFor();
    assert.match(norm(await choix.innerText()), /10 % de la coque/);
    await choix.getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Blindage' }).waitFor();
    await p.waitForFunction(() => /Armure\s*7/.test((document.querySelector('.vx-resultats') as HTMLElement).innerText), null, { timeout: 15000 });
    const l = norm(await ligne(p, 'Blindage').innerText());
    assert.match(l, /30 000 cr/);
    assert.match(l, /10 % de la coque/);
    await p.screenshot({ path: '/tmp/shots/effets-1280-blindage.png', fullPage: true });
  });

  it('réparation : 1 alerte et enregistre, 2 la lève', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    assert.equal(await p.locator('input[aria-label="Compétence de réparation"]').count(), 0, 'rien tant que rien ne la demande');
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    await p.locator('li').filter({ hasText: 'Atelier' }).last().getByRole('button').first().click();
    const champ = p.locator('input[aria-label="Compétence de réparation"]');
    await champ.waitFor();
    await champ.fill('1');
    await p.getByText(/réparation/i).filter({ hasText: /2 au moins|insuffisante/i }).first().waitFor();
    await p.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Enregistrer'); return !!b && !(b as HTMLButtonElement).disabled; }, null, { timeout: 15000 });
    await p.screenshot({ path: '/tmp/shots/effets-1280-reparation1.png', fullPage: true });
    assert.equal(await sauver(p), 200);
    await champ.fill('2');
    await p.waitForFunction(() => !/Bloquante|À surveiller/.test(document.body.innerText), null, { timeout: 15000 });
    await champ.fill('21');
    await p.getByText('Compétence de réparation : un nombre entier de 0 à 20.').waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    await champ.fill('2');
    await sauver(p);
    const q = await ouvrir('antor', orak, 1280);
    assert.equal(await q.locator('input[aria-label="Compétence de réparation"]').inputValue(), '2', 'relue après réouverture');
  });

  it('cale : sans cible bloque, soute-r → soutes 20, relue après réouverture', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    await p.locator('li').filter({ hasText: 'Cale' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Cale' }).waitFor();
    await p.getByText('Aucun élément à viser dans cette conception.').waitFor();
    await p.getByText('Bloquante').first().waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true, 'enregistrement refusé');
    await p.screenshot({ path: '/tmp/shots/effets-1280-cale-vide.png', fullPage: true });

    await ajouter(p, AJ_AM, 'Soute R');
    const liste = p.getByRole('combobox', { name: 'Élément visé' });
    await liste.waitFor();
    assert.deepEqual((await liste.locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Soute R']);
    await p.getByText('Bloquante').first().waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.waitForFunction(() => /Soutes\s*10/.test((document.querySelector('.vx-resultats') as HTMLElement).innerText.replace(/[\u00A0\u202F]/g, ' ')), null, { timeout: 15000 });
    await liste.selectOption('amenagements/soute-r');
    await p.waitForFunction(() => /Soutes\s*20/.test((document.querySelector('.vx-resultats') as HTMLElement).innerText.replace(/ /g, ' ')), null, { timeout: 15000 });
    await p.getByText('Bloquante').first().waitFor({ state: 'detached' });
    await p.screenshot({ path: '/tmp/shots/effets-1280-cale.png', fullPage: true });
    assert.equal(await sauver(p), 200);
    const q = await ouvrir('antor', orak, 1280);
    assert.match(await res(q), /Soutes\s*20/);
    assert.equal(await q.getByRole('combobox', { name: 'Élément visé' }).inputValue(), 'amenagements/soute-r');
    // retirer la cible : la cible retirée de la conception ne reste pas choisie
    await q.getByRole('button', { name: 'Retirer : Soute R' }).click();
    await q.getByText('Aucun élément à viser dans cette conception.').waitFor();
    await q.getByText('Bloquante').first().waitFor();
  });

  it('réacteur : borné à 5, conséquence du serveur ; moteur système en légende', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_AM }).first().click();
    const ms = norm(await p.locator('li').filter({ hasText: 'Moteur système' }).last().innerText());
    assert.match(ms, /moteur système · rend puissance 3 et masse 1,5/);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    await p.locator('li').filter({ hasText: 'Réacteur' }).last().getByRole('button').first().click();
    const champ = p.locator('input[aria-label="Points échangés : Réacteur"]');
    await champ.waitFor();
    assert.equal(await champ.getAttribute('max'), '5');
    const avant = await res(p);
    await champ.fill('3');
    await p.getByText('3 points : −3 puissance, +1,5 masse', { exact: true }).waitFor();
    const apres = await res(p);
    assert.notEqual(apres, avant, 'les chiffres de puissance et de masse ont bougé');
    await p.screenshot({ path: '/tmp/shots/effets-1280-reacteur.png', fullPage: true });
    await champ.fill('6');
    await p.getByText('Points échangés : un nombre entier de 0 à 5.').waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.getByRole('button', { name: 'Augmenter : Points échangés : Réacteur' }).isDisabled();
    await champ.fill('5');
    await p.getByText('5 points : −5 puissance, +2,5 masse', { exact: true }).waitFor();
    await p.getByRole('button', { name: 'Augmenter : Points échangés : Réacteur' }).waitFor();
    assert.equal(await p.getByRole('button', { name: 'Augmenter : Points échangés : Réacteur' }).isDisabled(), true);
    await champ.fill('3');
    await p.getByText('3 points : −3 puissance, +1,5 masse', { exact: true }).waitFor();
    assert.equal(await sauver(p), 200);
    const q = await ouvrir('antor', orak, 1280);
    assert.equal(await q.locator('input[aria-label="Points échangés : Réacteur"]').inputValue(), '3');
    await q.getByText('3 points : −3 puissance, +1,5 masse', { exact: true }).waitFor();
  });

  it('lecteur : les chiffres sans aucun contrôle', async () => {
    await remettre();
    const v = (await api('antor', 'GET', `${B()}/conceptions/${etoile}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${etoile}`, {
      coque: 'fregate-r', reparation: 2, version: v.version,
      choix: [
        { nature: 'amenagements', cle: 'soute-r', quantite: 1 },
        { nature: 'modifications', cle: 'cale', quantite: 1, vise: { nature: 'amenagements', cle: 'soute-r' } },
        { nature: 'modifications', cle: 'reacteur', quantite: 1, points: 3 },
        { nature: 'modifications', cle: 'atelier', quantite: 1 },
      ],
    });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
    await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    const p = await ouvrir('teo', etoile, 1280);
    await p.getByText('Lecture seule.').waitFor();
    await p.getByText('Points échangés : 3').waitFor();
    await p.getByText('Élément visé : Soute R').waitFor();
    const t = norm(await p.locator('body').innerText());
    assert.match(t, /Soutes\s*20/);
    assert.match(t, /Points échangés : 3/);
    assert.match(t, /Compétence de réparation : 2/);
    assert.match(t, /Élément visé : Soute R/);
    assert.equal(await p.locator('input[type="number"]').count(), 0);
    assert.equal(await p.getByRole('combobox').count(), 0);
    assert.equal(await p.getByRole('button', { name: /Augmenter|Diminuer/ }).count(), 0);
    await p.screenshot({ path: '/tmp/shots/effets-lecteur.png', fullPage: true });
  });

  it('catalogue muet : aucun contrôle nouveau', async () => {
    await remettre(true);
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    await p.locator('li').filter({ hasText: 'Blindage' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Blindage' }).waitFor();
    const l = norm(await ligne(p, 'Blindage').innerText());
    assert.doesNotMatch(l, /% de la coque|Ligne :/);
    assert.equal(await p.locator('input[aria-label="Compétence de réparation"]').count(), 0);
    assert.equal(await p.locator('input[aria-label^="Points échangés"]').count(), 0);
    assert.equal(await p.getByRole('combobox', { name: 'Élément visé' }).count(), 0);
    assert.doesNotMatch(await res(p), /Soutes/);
    await p.screenshot({ path: '/tmp/shots/effets-muet.png', fullPage: true });
  });
});

describe('E-22 effets, 390 px', { skip: skipBrowser, timeout: 240000 }, () => {
  it('cale + réacteur + soute : pas de débordement, cibles de 44 px', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 390);
    await ajouter(p, AJ_AM, 'Soute R');
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    await p.locator('li').filter({ hasText: 'Cale' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Cale' }).waitFor();
    await p.getByRole('button', { name: 'Ajouter : Modifications' }).click();
    await p.locator('li').filter({ hasText: 'Réacteur' }).last().getByRole('button').first().click();
    const liste = p.getByRole('combobox', { name: 'Élément visé' });
    await liste.waitFor();
    await liste.selectOption('amenagements/soute-r');
    const champ = p.locator('input[aria-label="Points échangés : Réacteur"]');
    await champ.fill('3');
    await p.getByText('3 points : −3 puissance, +1,5 masse', { exact: true }).waitFor();
    for (const b of [liste, champ, p.getByRole('button', { name: 'Augmenter : Points échangés : Réacteur' })]) {
      const box = await b.boundingBox();
      assert.ok(box && box.height >= 43.5, `cible ≥ 44 px : ${JSON.stringify(box)}`);
    }
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(m.sw <= m.iw + 1, `aucun défilement horizontal ${JSON.stringify(m)}`);
    await p.screenshot({ path: '/tmp/shots/effets-390.png', fullPage: true });
  });
});
