// Review tests of kanevas-outils-format-vaisseaux-fiches-atelier (E-22, F-6, B-82): the crew stepper, Vitesse / Armure / Équipage rows,
// the « Classe » mark, the captions, the read-only figure and the 390 px width, on a trial catalogue written by the test (F-8).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const CONDITION = 'x'.repeat(100) + ' ' + 'y'.repeat(99);
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 2, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'review-atelier',
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5, equipage_min: 6, equipage_max: 20 },
    { cle: 'fregate-s', nom: 'Frégate S', ...coque, equipage_min: 8, equipage_max: 30 },
  ],
  moteurs: [], amenagements: [
    { cle: 'hangar', nom: 'Hangar', ...el, classe_min: 3, condition: CONDITION },
    { cle: 'salle', nom: 'Salle', ...el, classe_min: 2, classe_max: 3 },
  ],
  defenses: [{ cle: 'voiles', nom: 'Voiles', ...el, bonus_vitesse: 1 }],
  armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el, degats: '1d8', perforation: 3, qualites: 'Bruyant', niveau_tech: 3 }],
  modifications: [], exemples: [],
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
let monde: { E: number; orak: number; etoile: number } | null = null;
async function ids() {
  if (monde) return monde;
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('antor', 'POST', `/api/univers/${E}/outils/swn/vaisseaux/catalogue/application`, catalogue());
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  const l = (await api('antor', 'GET', `/api/univers/${E}/outils/swn/vaisseaux/conceptions`)).json;
  const fiche = (t: string): number => l.conceptions.find((c: Any) => c.titre === t).ficheId;
  const B = `/api/univers/${E}/outils/swn/vaisseaux/conceptions`;
  // start from designs without fittings (the seed ones would be blocked by a small hull's power), same hull
  for (const f of [fiche("Vent d'Orak"), fiche('Étoile du soir')]) {
    const v = (await api('antor', 'GET', `${B}/${f}`)).json;
    const r = await api('antor', 'PUT', `${B}/${f}`, { coque: v.coque.cle, choix: [], version: v.version });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
  }
  // the reader's design carries a crew of 8 on the new hull
  const v = (await api('antor', 'GET', `${B}/${fiche('Étoile du soir')}`)).json;
  const r = await api('antor', 'PUT', `${B}/${fiche('Étoile du soir')}`, { coque: 'fregate-r', choix: [], equipage: 8, version: v.version });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  monde = { E, orak: fiche("Vent d'Orak"), etoile: fiche('Étoile du soir') };
  return monde;
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
const norm = (s: string) => s.replace(/[  ]/g, ' ');
async function choisirCoque(p: Any, nom: string) {
  await p.getByRole('button', { name: 'Changer de coque' }).click();
  await p.locator('li').filter({ has: p.getByRole('button', { name: new RegExp(`^Ajouter\\s*${nom}|^Choisir\\s*${nom}`) }) }).last().getByRole('button').first().click();
}
async function valeurEgale(p: Any, attendu: string) {
  await p.waitForFunction((a: string) => (document.querySelector('input[aria-label="Équipage"]') as HTMLInputElement | null)?.value === a, attendu, { timeout: 15000 })
    .catch(async () => assert.equal(await champ(p).inputValue(), attendu));
}
const champ = (p: Any) => p.locator('input[aria-label="Équipage"]');
const resultat = (p: Any, nom: string) => p.locator('.vx-resultats').getByText(nom, { exact: true });

describe('E-22 équipage, 1280 px', { skip: skipBrowser }, () => {
  it('Antor : frégate-r → Vitesse 3, Armure 5, Équipage 6 ; 5 alerte et enregistre ; 6 la lève ; 100 001 refusé', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    assert.equal(await champ(p).count(), 0, 'coque sans borne : pas de bloc');
    await choisirCoque(p, 'Frégate R');
    await champ(p).waitFor();
    await p.locator('.vx-resultats').getByText('Vitesse').waitFor();
    await p.screenshot({ path: '/tmp/shots/atelier-1280-fregate.png' });
    const txt = norm(await p.locator('.vx-resultats').innerText());
    assert.match(txt, /Vitesse\s*3/);
    assert.match(txt, /Armure\s*5/);
    assert.match(txt, /Équipage\s*6/);
    await valeurEgale(p, '6');
    await p.getByText('6 à 20', { exact: true }).waitFor();

    await champ(p).fill('5');
    await p.getByText('Équipage insuffisant : 5 sur 6 au moins.').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true, 'alerte à surveiller : enregistrable');
    await champ(p).fill('6');
    await p.getByText('Équipage insuffisant', { exact: false }).waitFor({ state: 'detached' });

    await champ(p).fill('100001');
    await p.getByText('Équipage : un nombre entier de 0 à 100 000.').waitFor();
    await valeurEgale(p, '100001');
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true, 'sans enregistrement');
    await p.screenshot({ path: '/tmp/shots/atelier-1280-refus.png' });
    await champ(p).fill('21');
    await p.getByText('Équipage excessif : 21 sur 20 au plus.').waitFor();
  });

  it('changement de coque : non touché → minimum de la nouvelle ; touché → gardé', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await choisirCoque(p, 'Frégate R');
    await champ(p).waitFor();
    await valeurEgale(p, '6');
    await choisirCoque(p, 'Frégate S');
    await p.getByText('8 à 30', { exact: true }).waitFor();
    await valeurEgale(p, '8');
    await champ(p).fill('9');
    await choisirCoque(p, 'Frégate R');
    await p.getByText('6 à 20', { exact: true }).waitFor();
    await valeurEgale(p, '9');
  });

  it('voiles → vitesse 4 ; hangar : marque Classe sur la coque de classe 2, l’ajouter bloque ; légendes', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await choisirCoque(p, 'Frégate R');
    await champ(p).waitFor();
    await p.getByRole('button', { name: /Ajouter/ }).first().waitFor();
    await p.getByRole('button', { name: 'Ajouter : Défenses' }).or(p.getByRole('button', { name: /Ajouter une défense|Ajouter des défenses/i })).first().click();
    const voiles = p.locator('li').filter({ hasText: 'Voiles' }).last();
    await voiles.waitFor();
    assert.match(norm(await voiles.innerText()), /vitesse \+1/);
    await voiles.getByRole('button').first().click();
    await p.waitForFunction(() => /Vitesse\s*4/.test((document.querySelector('.vx-resultats') as HTMLElement).innerText.replace(/\u00A0/g, ' ')), null, { timeout: 15000 });
    await p.getByRole('button', { name: 'Retirer : Voiles' }).click();
    await p.waitForFunction(() => /Vitesse\s*3/.test((document.querySelector('.vx-resultats') as HTMLElement).innerText), null, { timeout: 15000 });
    // fittings picker
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).or(p.getByRole('button', { name: /Ajouter un aménagement|Ajouter des aménagements/i })).first().click();
    const hangar = p.locator('li').filter({ hasText: 'Hangar' }).last();
    await hangar.waitFor();
    const t = norm(await hangar.innerText());
    assert.match(t, /classe 3 au moins/);
    assert.match(t, /Classe/);
    assert.match(t, /x{100}/, 'condition');
    const salle = norm(await p.locator('li').filter({ hasText: 'Salle' }).last().innerText());
    assert.match(salle, /classe 2 à 3/);
    assert.doesNotMatch(salle.replace(/classe 2 à 3/, ''), /Classe/, 'salle : pas de marque');
    await p.screenshot({ path: '/tmp/shots/atelier-1280-hangar.png' });
    await hangar.getByRole('button').first().click();
    await p.getByText('Bloquante').first().waitFor();
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    await p.getByRole('button', { name: 'Retirer : Hangar' }).click();
    await p.getByText('Bloquante').first().waitFor({ state: 'detached' });
  });

  it('enregistre à 8, ferme, rouvre : 8 ; un lecteur voit le chiffre sans pas', async () => {
    const { E, orak, etoile } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await choisirCoque(p, 'Frégate R');
    await champ(p).fill('8');
    await p.getByText('Équipage 8', { exact: false }).first().waitFor().catch(() => {});
    const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    assert.equal((await rep).status(), 200);
    await p.close();
    const q = await ouvrir('antor', orak, 1280);
    await champ(q).waitFor();
    await valeurEgale(q, '8');
    // a reader who cannot write: Teo (joueur, not the author) reads the design
    const m = await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    assert.equal(m.statut, 201, JSON.stringify(m.json));
    const { ctx, page: r } = await connecte(browser, srv.base, 'teo');
    ctxs.push(ctx);
    await r.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${etoile}`);
    await r.getByText('Lecture seule.').waitFor();
    await r.getByRole('group', { name: 'Équipage' }).waitFor();
    assert.equal(await r.getByRole('group', { name: 'Équipage' }).locator('output').innerText(), '8');
    assert.equal(await r.getByRole('button', { name: 'Augmenter l’équipage' }).count(), 0);
    assert.equal(await r.locator('input[aria-label="Équipage"]').count(), 0);
    await r.screenshot({ path: '/tmp/shots/atelier-lecteur.png' });
  });
});

describe('E-22 équipage, 390 px', { skip: skipBrowser }, () => {
  it('cibles de 44 px, condition de 200 caractères sans débordement, champ désactivé hors ligne', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 390);
    await choisirCoque(p, 'Frégate R');
    await champ(p).waitFor();
    for (const b of [p.getByRole('button', { name: 'Diminuer l’équipage' }), p.getByRole('button', { name: 'Augmenter l’équipage' }), champ(p)]) {
      const box = await b.boundingBox();
      assert.ok(box && box.height >= 43.5, `cible ≥ 44 px : ${JSON.stringify(box)}`);
    }
    await valeurEgale(p, '6');
    await p.getByRole('button', { name: 'Augmenter l’équipage' }).click();
    await valeurEgale(p, '7');
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).or(p.getByRole('button', { name: /Ajouter un aménagement|Ajouter des aménagements/i })).first().click();
    await p.locator('li').filter({ hasText: 'Hangar' }).last().waitFor();
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(m.sw <= m.iw + 1, `aucun défilement horizontal ${JSON.stringify(m)}`);
    await p.screenshot({ path: '/tmp/shots/atelier-390-condition.png', fullPage: true });
    await p.context().setOffline(true);
    await p.getByRole('button', { name: 'Augmenter l’équipage' }).click({ timeout: 3000 }).catch(() => {}); // a recalculation that fails: the connection is lost
    await p.getByText('Les choix sont verrouillés.').waitFor();
    assert.equal(await champ(p).isDisabled(), true, 'champ désactivé hors ligne');
    await p.screenshot({ path: '/tmp/shots/atelier-390-horsligne.png' });
  });
});
