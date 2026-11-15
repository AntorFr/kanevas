// Compléments d'ensemble de kanevas-sous-type-dialogue, écrits depuis le besoin seul (Livre de Monsieur du
// 2026-10-29 ; docs/ecrans.md E-8 / E-9). Serveur réel en bouchon avec le monde de départ, Chromium réel.
// Attendus en dur. Cas ajoutés à sous-type-dialogue-ensemble.test.ts : persistance après rechargement,
// sous-type vu dans la liste « Personnages », refus serveur d'un Joueur, sous-type du badge toujours éditable.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, allerListe, connecte, launch, rx, skipBrowser, startServer, type Server } from './harnais.test.js';

const UNIVERS = 1; // « Lame d'Ébène » : antor MJ, lea Joueuse.
let srv: Server;
let browser: Any;
let antor: Any;
let n = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; body: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const t = await r.text();
  return { status: r.status(), body: t ? JSON.parse(t) : null };
}

async function pnjCapitaine(): Promise<{ id: number; titre: string }> {
  const titre = `Comp${++n}`;
  const c = await api(antor, 'POST', `/api/univers/${UNIVERS}/fiches`, { type: 'personnage', titre, charge: { pj: false } });
  assert.equal(c.status < 300, true);
  const p = await api(antor, 'PATCH', `/api/univers/${UNIVERS}/fiches/${c.body.id}`, { sousType: 'Capitaine' });
  assert.equal(p.status < 300, true);
  return { id: c.body.id, titre };
}

async function boite(page: Any, f: { id: number; titre: string }): Promise<Any> {
  await page.goto(`/univers/${UNIVERS}/fiche/${f.id}`);
  await page.getByRole('heading', { level: 1, name: f.titre }).waitFor();
  await page.getByRole('button', { name: rx(`Autres actions sur « ${f.titre} »`) }).click();
  await page.getByRole('menuitem', { name: rx('Changer le type…') }).click();
  const b = page.getByRole('dialog');
  await b.getByRole('heading', { name: rx('Changer le type de') }).waitFor();
  await b.getByText('Chargement des types…').waitFor({ state: 'detached' });
  return b;
}

describe('kanevas-sous-type-dialogue : compléments depuis le besoin', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'antor')).page;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('le sous-type changé par le dialogue survit au rechargement et se lit dans la liste « Personnages »', async () => {
    // Panne visée : le badge change à l'écran mais l'écriture est perdue, ou la liste garde l'ancien sous-type.
    const f = await pnjCapitaine();
    const b = await boite(antor, f);
    await b.getByLabel('Sous-type').fill('Amiral');
    await b.getByRole('button', { name: 'Changer le type' }).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    await antor.reload();
    await antor.getByRole('heading', { level: 1, name: f.titre }).waitFor();
    await antor.getByRole('button', { name: /^Sous-type : Amiral/ }).waitFor();
    assert.equal(((await antor.locator('main .tete-ligne .type').first().innerText()) as string).replace(/\s+/g, ' ').trim(), 'PNJ · Amiral');
    await allerListe(antor, 'personnage');
    await antor.getByText(f.titre).first().waitFor();
    assert.equal(await antor.getByText('Amiral').count() >= 1, true);
  });

  test('sous-type vidé par le dialogue : le badge ne dit plus « Capitaine » et l’API rend null', async () => {
    // Panne visée : le champ vidé n'est pas envoyé comme null (ancien sous-type conservé).
    const f = await pnjCapitaine();
    const b = await boite(antor, f);
    await b.getByLabel('Sous-type').fill('');
    await b.getByRole('button', { name: 'Changer le type' }).click();
    await antor.getByText('Sous-type retiré.').waitFor();
    await antor.getByRole('dialog').waitFor({ state: 'detached' });
    // Le badge ne dit plus « Capitaine » ; au MJ il reste l'invite « Ajouter un sous-type » (trou rendu : le critère dit « PNJ » seul).
    await antor.getByRole('button', { name: 'Ajouter un sous-type' }).waitFor();
    assert.equal(await antor.locator('main .tete-ligne .type').first().getByText('Capitaine').count(), 0);
    const v = await api(antor, 'GET', `/api/univers/${UNIVERS}/fiches/${f.id}`);
    assert.equal(v.body.sousType, null);
  });

  test('exclusion : une Joueuse qui lit Maître Aldric ne change pas son sous-type par l’API', async () => {
    // Panne visée : l'écriture du sous-type s'ouvre à un Joueur.
    const liste = await api(antor, 'GET', `/api/univers/${UNIVERS}/fiches?type=personnage`);
    const aldric = (liste.body.fiches ?? liste.body).find((x: Any) => x.titre === 'Maître Aldric');
    await api(antor, 'PATCH', `/api/univers/${UNIVERS}/fiches/${aldric.id}`, { sousType: 'Capitaine' });
    const lea = (await connecte(browser, srv.base, 'Léa')).page;
    assert.equal((await api(lea, 'GET', `/api/univers/${UNIVERS}/fiches/${aldric.id}`)).status, 200);
    const r = await api(lea, 'PATCH', `/api/univers/${UNIVERS}/fiches/${aldric.id}`, { sousType: 'Amiral' });
    assert.equal(r.status >= 400, true, `PATCH Léa -> ${r.status}`);
    const v = await api(antor, 'GET', `/api/univers/${UNIVERS}/fiches/${aldric.id}`);
    assert.equal(v.body.sousType, 'Capitaine');
    await lea.context().close();
  });
});
