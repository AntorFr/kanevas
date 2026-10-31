// Feature-level tests of kanevas-deplacer-arborescence (B-35, E-9 « Déplacer sous… »), second pass: the answers of
// the move itself (trop_profond, 404, 403), a parent of any type (AD-99), the « … » menu of a deep path closed by
// Échap. Written from docs/ecrans.md « Ce que `kanevas-deplacer-arborescence` construit » only. Real server in stub
// mode, real Chromium; expected values are literals.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;

const fiche = (id: number) => `/api/univers/${U}/fiches/${id}`;
async function api(method: string, url: string, data?: unknown): Promise<Any> {
  const r = await antor.request.fetch(srv.base + url, { method, data });
  const texte = await r.text();
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${texte}`);
  return texte ? JSON.parse(texte) : null;
}
async function creer(type: string, titre: string, parent: number | null = null): Promise<number> {
  const f = await api('POST', `/api/univers/${U}/fiches`, { type, titre, ...(type === 'personnage' ? { charge: { pj: false } } : {}) });
  if (parent !== null) await api('PATCH', fiche(f.id), { parent });
  return f.id;
}
const boite = () => antor.getByRole('dialog');
const liste = () => boite().getByRole('radiogroup', { name: 'Nouveau parent' });
const deplacer = () => boite().getByRole('button', { name: 'Déplacer', exact: true });
async function ouvrirBoite(id: number, titre: string): Promise<void> {
  await antor.goto(`/univers/${U}/fiche/${id}`);
  await antor.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
  await boite().getByRole('heading', { name: `Déplacer « ${titre} » sous…` }).waitFor();
  await liste().getByRole('radio').nth(0).waitFor();
}
async function chercherEtChoisir(texte: string, titre: string): Promise<void> {
  await boite().getByRole('button', { name: 'Recherche' }).click();
  await boite().getByRole('textbox', { name: 'Chercher une fiche' }).fill(texte);
  const ligne = liste().getByRole('radio', { name: new RegExp(`^${titre}`) });
  await ligne.waitFor();
  await ligne.check();
}

describe('kanevas-deplacer-arborescence, réponses du déplacement et parents de tout type', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await api('GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Panne : le refus « trop profond » n'est pas affiché, ou la boîte se ferme, ou la fiche bouge.
  test('échec : un parent déjà à 51 niveaux → « La hiérarchie est trop profonde. » sous la liste, boîte ouverte, rien ne bouge', async () => {
    let parent: number | null = null;
    for (let i = 1; i <= 51; i++) parent = await creer('lieu', `ZP${String(i).padStart(2, '0')}`, parent);
    const libre = await creer('lieu', 'ZLibre');
    await ouvrirBoite(libre, 'ZLibre');
    await chercherEtChoisir('ZP51', 'ZP51');
    await deplacer().click();
    await boite().getByText('La hiérarchie est trop profonde.').waitFor();
    assert.equal(await boite().isVisible(), true, 'la boîte reste ouverte');
    assert.equal(await antor.getByText('Fiche déplacée.').count(), 0);
    assert.deepEqual((await api('GET', fiche(libre))).ancetres, [], 'ZLibre est restée à la racine');
    await boite().getByRole('button', { name: 'Annuler' }).click();
  });

  // Panne : le 404 du déplacement n'est pas écrit, ou la boîte se ferme comme si tout avait réussi.
  test('échec : la fiche supprimée boîte ouverte → « Introuvable. » sous la liste, boîte ouverte', async () => {
    const f = await creer('lieu', 'ZEphemere');
    const cible = await creer('lieu', 'ZCible');
    await ouvrirBoite(f, 'ZEphemere');
    await chercherEtChoisir('ZCible', 'ZCible');
    await api('DELETE', fiche(f));
    await deplacer().click();
    await boite().getByText('Introuvable.').waitFor();
    assert.equal(await boite().isVisible(), true, 'la boîte reste ouverte');
    assert.equal(await antor.getByText('Fiche déplacée.').count(), 0);
    assert.deepEqual((await api('GET', `/api/univers/${U}/fiches/${cible}/enfants`)).fiches ?? [], [], 'ZCible n’a pas reçu d’enfant');
    await boite().getByRole('button', { name: 'Annuler' }).click();
  });

  // Panne : un 403 sur le déplacement laisse la boîte ouverte ou affiche un toast.
  test('exclusion : droit perdu au déplacement (403) → la boîte se ferme, sans toast « Fiche déplacée. »', async () => {
    const f = await creer('lieu', 'ZDroit');
    await creer('lieu', 'ZCible403');
    await ouvrirBoite(f, 'ZDroit');
    await chercherEtChoisir('ZCible403', 'ZCible403');
    await antor.route(new RegExp(`/fiches/${f}$`), (route: Any) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"erreur":"Refusé."}' }) : route.continue());
    await deplacer().click();
    await boite().waitFor({ state: 'detached' });
    assert.equal(await antor.getByText('Fiche déplacée.').count(), 0);
    await antor.unroute(new RegExp(`/fiches/${f}$`));
    assert.deepEqual((await api('GET', fiche(f))).ancetres, [], 'ZDroit n’a pas bougé');
  });

  // Panne : l'arborescence ou le déplacement ne propose que les lieux.
  test('nominal : un personnage est proposé à la racine et reçoit la fiche en parent (tous types, AD-99)', async () => {
    const perso = await creer('personnage', 'ZPerso');
    const f = await creer('lieu', 'ZSousPerso');
    await ouvrirBoite(f, 'ZSousPerso');
    const ligne = liste().getByRole('radio', { name: /^ZPerso/ });
    await ligne.check();
    await boite().getByText('Nouveau parent : ZPerso').waitFor();
    await deplacer().click();
    await antor.getByText('Fiche déplacée.').waitFor();
    assert.deepEqual((await api('GET', fiche(f))).ancetres.map((a: Any) => a.titre), ['ZPerso']);
    assert.ok(perso > 0);
  });

  // Panne : Échap ferme la boîte entière, ou change de niveau, au lieu de fermer le seul menu « … ».
  test('bord : Échap referme le menu « … » du chemin sans changer de niveau ni fermer la boîte', async () => {
    let parent: number | null = null;
    for (const t of ['EN1', 'EN2', 'EN3', 'EN4', 'EN5']) parent = await creer('lieu', t, parent);
    const feuille = await creer('lieu', 'EFeuille', parent);
    await ouvrirBoite(feuille, 'EFeuille');
    await boite().getByText('EFeuille (cette fiche)').waitFor();
    const nav = boite().getByRole('navigation', { name: 'Chemin' });
    await nav.getByRole('button', { name: '…' }).click();
    await antor.getByRole('menuitem', { name: /EN1/ }).waitFor();
    await antor.keyboard.press('Escape');
    await antor.getByRole('menuitem', { name: /EN1/ }).waitFor({ state: 'detached' });
    assert.equal(await boite().isVisible(), true, 'la boîte reste ouverte');
    await boite().getByText('EFeuille (cette fiche)').waitFor();
    await boite().getByRole('button', { name: 'Annuler' }).click();
  });
});
