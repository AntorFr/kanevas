// Revue de kanevas-outils-format-vaisseaux-suite-atelier (E-22, B-86, Z-5, Z-7): navigateur piloté, catalogue d'essai Z-5 écrit par le test.
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
    catalogue: 'swn/vaisseaux', version: muet ? 'rev-z-muet' : 'rev-z',
    coques: [
      { cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5 },
      { cle: 'fregate-r3', nom: 'Frégate R3', ...coque, classe: 3, cout: 400000, vitesse: 3, armure: 5 },
    ],
    moteurs: [],
    amenagements: [
      { cle: 'moteur-sys', nom: 'Moteur système', ...el, cout: 40000, puissance: 3, masse: 1.5, ...si({ effet: 'moteur_systeme', reduction_cout_pct: 10, reduction_base: 'coque', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] }) },
      { cle: 'soute-z', nom: 'Soute Z', ...el, masse: 8, ...si({ soute: 10 }) },
      { cle: 'cabine-z', nom: 'Cabine Z', ...el },
    ],
    defenses: [],
    armes: [{ cle: 'laser-z', nom: 'Laser Z', ...el, puissance: 10, masse: 1, emport: 1, munitions: 0, cout_munition: 0 }],
    modifications: [
      { cle: 'optimise-z', nom: 'Optimise Z', ...el, limite: 1, ...si({ effet: 'soutes_optimisees', effet_pct: 10 }) },
      { cle: 'montage-z', nom: 'Montage Z', ...el, limite: 1, ...si({ effet: 'montage_specialise', valeur: -1 }) },
      { cle: 'surcharge-z', nom: 'Surcharge Z', ...el, limite: 1, ...si({ effet: 'surcharge_arme', effet_pct: 50 }) },
      { cle: 'blindage-z', nom: 'Blindage Z', ...el, ...si({ effet: 'armure_par_classe', armure_par_classe: [1, 2, 3, 4] }) },
      { cle: 'reacteur-i', nom: 'Réacteur I', ...el, limite: 3, ...si({ effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation' }) },
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

describe('E-22 suite Z, 1280 px', { skip: skipBrowser, timeout: 240000 }, () => {
  it('moteur-sys base coque : légende et ligne 10 000 cr', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: 'Ajouter un aménagement' }).first().click();
    const choix = norm(await p.locator('li').filter({ hasText: 'Moteur système' }).last().innerText());
    assert.match(choix, /moteur système · rend puissance 3 et masse 1,5 · coût −10 % de la coque/);
    await p.locator('li').filter({ hasText: 'Moteur système' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Moteur système' }).waitFor();
    await p.waitForFunction(() => /Ligne : 10 000/.test((document.body).innerText.replace(/[\u00A0\u202F]/g, ' ')), null, { timeout: 15000 });
    await p.screenshot({ path: '/tmp/shots/z-1280-moteur.png', fullPage: true });
  });

  it('soute-z + optimise-z : légende, masse −1, liste réduite aux soutes', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await ajouter(p, AJ_AM, 'Soute Z');
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).click();
    await p.locator('li').filter({ hasText: 'Cabine Z' }).last().getByRole('button', { name: /^Ajouter / }).click();
    await p.getByRole('button', { name: 'Retirer : Cabine Z' }).waitFor();
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    assert.match(norm(await p.locator('li').filter({ hasText: 'Optimise Z' }).last().innerText()), /soutes −10 % de masse/);
    await p.locator('li').filter({ hasText: 'Optimise Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Optimise Z' }).waitFor();
    assert.deepEqual(await opts(p), ['Choisir un élément', 'Soute Z']);
    await visees(p, 'Optimise Z').selectOption('amenagements/soute-z');
    await p.waitForFunction(() => /masse −1/.test(document.body.innerText.replace(/[\u00A0\u202F]/g, ' ')), null, { timeout: 15000 });
    await p.screenshot({ path: '/tmp/shots/z-1280-optimise.png', fullPage: true });
  });

  it('montage-z et surcharge-z : seulement les armes, emports −1 et puissance +5', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await ajouter(p, AJ_AM, 'Soute Z');
    await p.getByRole('button', { name: 'Ajouter une arme' }).first().click();
    await p.locator('li').filter({ hasText: 'Laser Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Laser Z' }).waitFor();
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    assert.match(norm(await p.locator('li').filter({ hasText: 'Montage Z' }).last().innerText()), /emports −1/);
    assert.match(norm(await p.locator('li').filter({ hasText: 'Surcharge Z' }).last().innerText()), /puissance de l’arme \+50 %/);
    await p.locator('li').filter({ hasText: 'Montage Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Montage Z' }).waitFor();
    await p.getByRole('button', { name: 'Ajouter : Modifications' }).click();
    await p.locator('li').filter({ hasText: 'Surcharge Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Surcharge Z' }).waitFor();
    for (const n of ['Montage Z', 'Surcharge Z']) assert.deepEqual((await visees(p, n).locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Laser Z'], n);
    await visees(p, 'Montage Z').selectOption('armes/laser-z');
    await visees(p, 'Surcharge Z').selectOption('armes/laser-z');
    await p.waitForFunction(() => { const t = document.body.innerText; return /emports −1/.test(t) && /puissance \+5/.test(t); }, null, { timeout: 15000 });
    await p.screenshot({ path: '/tmp/shots/z-1280-armes.png', fullPage: true });
  });

  it('blindage-z : armure +2 en classe 2', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    assert.match(norm(await p.locator('li').filter({ hasText: 'Blindage Z' }).last().innerText()), /armure \+2/);
    await p.locator('li').filter({ hasText: 'Blindage Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Blindage Z' }).waitFor();
    assert.match(norm(await ligne(p, 'Blindage Z').innerText()), /armure \+2/);
    await p.waitForFunction(() => /Armure\s*7/.test((document.querySelector('.vx-resultats') as HTMLElement).innerText), null, { timeout: 15000 });
  });

  it('reacteur-i : 3 points, une seconde installation', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    assert.match(norm(await p.locator('li').filter({ hasText: 'Réacteur I' }).last().innerText()), /arrondi par installation/);
    await p.locator('li').filter({ hasText: 'Réacteur I' }).last().getByRole('button').first().click();
    const champ = p.locator('input[aria-label="Points échangés : Réacteur I"]').first();
    await champ.waitFor();
    assert.equal(await champ.getAttribute('max'), '5');
    await champ.fill('3');
    await p.getByText('3 points : −3 puissance, +1 masse', { exact: true }).waitFor();
    await champ.fill('6');
    await p.getByText('Points échangés : un nombre entier de 0 à 5.').waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    await champ.fill('3');
    // une seconde fois : la ligne ne se grise pas, la quantité monte
    await p.getByRole('button', { name: 'Ajouter : Modifications' }).click();
    await p.locator('li').filter({ hasText: 'Réacteur I' }).getByRole('button', { name: /^Ajouter / }).click();
    await p.waitForFunction(() => /\n2\n/.test(document.body.innerText) || /×\s*2/.test(document.body.innerText), null, { timeout: 15000 });
    await p.screenshot({ path: '/tmp/shots/z-1280-reacteur.png', fullPage: true });
    // deux installations de 3 points : la conséquence est celle que le serveur envoie pour la ligne (Z-5 : −6 puissance, +2 masse)
    await p.getByText('3 points : −6 puissance, +2 masse', { exact: true }).waitFor();
  });

  it('lecteur : mêmes légendes, aucun contrôle', async () => {
    await remettre();
    const v = (await api('antor', 'GET', `${B()}/conceptions/${etoile}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${etoile}`, {
      coque: 'fregate-r', version: v.version,
      choix: [
        { nature: 'amenagements', cle: 'soute-z', quantite: 1 },
        { nature: 'modifications', cle: 'optimise-z', quantite: 1, vise: { nature: 'amenagements', cle: 'soute-z' } },
        { nature: 'modifications', cle: 'blindage-z', quantite: 1 },
        { nature: 'modifications', cle: 'reacteur-i', quantite: 1, points: 3 },
      ],
    });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
    await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    const p = await ouvrir('teo', etoile, 1280);
    await p.getByText('Lecture seule.').waitFor();
    await p.getByText('Élément visé : Soute Z').waitFor();
    const t = norm(await p.locator('body').innerText());
    assert.match(t, /armure \+2/);
    assert.match(t, /masse −1/);
    assert.match(t, /3 points : −3 puissance, \+1 masse/);
    assert.equal(await p.locator('input[type="number"]').count(), 0);
    assert.equal(await p.getByRole('combobox').count(), 0);
    await p.screenshot({ path: '/tmp/shots/z-lecteur.png', fullPage: true });
  });

  it('catalogue sans ces champs : ni légende ni contrôle nouveau', async () => {
    await remettre(true);
    const p = await ouvrir('antor', orak, 1280);
    await ajouter(p, AJ_AM, 'Soute Z');
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    for (const n of ['Optimise Z', 'Montage Z', 'Surcharge Z', 'Blindage Z', 'Réacteur I']) {
      const t = norm(await p.locator('li').filter({ hasText: n }).last().innerText());
      assert.doesNotMatch(t, /armure \+|emports|de masse|puissance de l’arme|arrondi|de la coque/, n);
    }
    await p.locator('li').filter({ hasText: 'Optimise Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Optimise Z' }).waitFor();
    assert.equal(await p.getByRole('combobox', { name: 'Élément visé' }).count(), 0);
    assert.doesNotMatch(norm(await ligne(p, 'Optimise Z').innerText()), /masse −|Ligne :/);
  });
});

describe('E-22 suite Z, 390 px', { skip: skipBrowser, timeout: 240000 }, () => {
  it('légendes longues : retour à la ligne, aucun débordement', async () => {
    await remettre();
    const p = await ouvrir('antor', orak, 390);
    await p.getByRole('button', { name: 'Ajouter un aménagement' }).first().click();
    await p.locator('li').filter({ hasText: 'Moteur système' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Moteur système' }).waitFor();
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).click();
    await p.locator('li').filter({ hasText: 'Soute Z' }).last().getByRole('button', { name: /^Ajouter / }).click();
    await p.getByRole('button', { name: 'Retirer : Soute Z' }).waitFor();
    await p.getByRole('button', { name: AJ_MOD }).first().click();
    await p.locator('li').filter({ hasText: 'Optimise Z' }).last().getByRole('button').first().click();
    await p.getByRole('button', { name: 'Retirer : Optimise Z' }).waitFor();
    await visees(p, 'Optimise Z').selectOption('amenagements/soute-z');
    await p.getByRole('button', { name: 'Ajouter : Modifications' }).click();
    await p.locator('li').filter({ hasText: 'Réacteur I' }).last().getByRole('button', { name: /^Ajouter / }).click();
    await p.locator('input[aria-label="Points échangés : Réacteur I"]').first().fill('3');
    await p.getByText('3 points : −3 puissance, +1 masse', { exact: true }).waitFor();
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(m.sw <= m.iw + 1, `aucun défilement horizontal ${JSON.stringify(m)}`);
    await p.screenshot({ path: '/tmp/shots/z-390.png', fullPage: true });
  });
});
