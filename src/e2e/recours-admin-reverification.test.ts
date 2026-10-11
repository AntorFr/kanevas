// Independent black-box tests of `kanevas-recours-admin` (B-6, P-2 step 3, E-5), written from the need
// only (fiche, docs/parcours.md, docs/ecrans.md). They complete recours-admin-ensemble.test.ts with the
// consequences of a repair seen from the other accounts. Real server in stub mode, real Chromium.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  type Any,
  attendre,
  connecte,
  creerFiche,
  launch,
  ouvrirUniversDepuisAccueil,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.ts';

const LAME = "Lame d'Ébène";
const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

async function monde() {
  const s = await startServer();
  const browser = await launch();
  aFermer.push(async () => {
    await browser.close();
    s.stop();
  });
  const antor = await connecte(browser, s.base, 'Antor');
  const lea = await connecte(browser, s.base, 'Léa');
  const mira = await connecte(browser, s.base, 'Mira');
  const admin = await connecte(browser, s.base, 'Admin');
  const r = await antor.ctx.request.post('/api/univers', { data: { nom: LAME, description: 'Une cité marchande rongée par les secrets.' } });
  assert.equal(r.status(), 201);
  const id: number = (await r.json()).id;
  const a = await antor.ctx.request.post(`/api/univers/${id}/membres`, { data: { username: 'lea', role: 'joueur' } });
  assert.equal(a.status(), 201);
  await ouvrirUniversDepuisAccueil(antor.page, LAME);
  await creerFiche(antor.page, 'personnage', 'Maître Aldric');
  return { s, browser, antor, lea, mira, admin, id };
}

async function ouvrirAdmin(page: Any, univers: string): Promise<void> {
  await page.goto('/administration');
  await page.getByRole('heading', { name: 'Administration', level: 1 }).waitFor();
  await attendre(page);
  await page.getByRole('link', { name: rx(univers) }).first().click();
  await page.getByRole('heading', { name: `Membres — ${univers}` }).waitFor();
  await attendre(page);
}

async function ajouter(page: Any, identifiant: string, role: 'MJ' | 'Joueur'): Promise<void> {
  await page.getByLabel('Identifiant du compte').fill(identifiant);
  await page.getByLabel('Rôle', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
}

describe('kanevas-recours-admin : conséquences de la réparation (navigateur)', { skip: skipBrowser }, () => {
  // Panne visée : le MJ ajouté par l'admin n'a pas réellement les droits d'un MJ, ou le MJ retiré garde un accès.
  it('admin_remplace_le_mj_la_nouvelle_mj_lit_et_l_ancien_ne_trouve_plus_l_univers', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page, LAME);
    await ajouter(m.admin.page, 'mira', 'MJ');
    await m.admin.page.getByRole('button', { name: 'Retirer antor' }).waitFor();
    await m.admin.page.getByRole('button', { name: 'Retirer antor' }).click();
    await m.admin.page.getByText('Retirer antor', { exact: true }).click();
    await m.admin.page.getByText('antor', { exact: true }).waitFor({ state: 'detached' });
    await attendre(m.admin.page);
    assert.match(await texte(m.admin.page), /2 membres/);
    // Mira lit la fiche
    const fiches = await m.mira.ctx.request.get(`/api/univers/${m.id}/fiches`);
    assert.equal(fiches.status(), 200);
    assert.match(JSON.stringify(await fiches.json()), /Maître Aldric/);
    // Antor n'est plus membre : l'univers n'existe plus pour lui (B-4)
    assert.equal((await m.antor.ctx.request.get(`/api/univers/${m.id}`)).status(), 404);
    await m.antor.page.goto(`/univers/${m.id}`);
    await attendre(m.antor.page);
    assert.match(await texte(m.antor.page), /Page introuvable\./);
  });

  // Panne visée : le changement de rôle de l'admin dans E-5 n'est pas ce que voit le MJ.
  it('admin_membre_joueur_promu_mj_dans_e5_antor_le_voit_mj', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page, LAME);
    await ajouter(m.admin.page, 'admin', 'Joueur');
    await m.admin.page.getByRole('button', { name: 'Retirer admin' }).waitFor();
    let liste = await (await m.antor.ctx.request.get(`/api/univers/${m.id}/membres`)).json();
    assert.deepEqual(liste.filter((x: Any) => x.username === 'admin').map((x: Any) => x.role), ['joueur']);
    await m.admin.page.getByLabel('Rôle de admin').selectOption({ label: 'MJ' });
    await attendre(m.admin.page);
    liste = await (await m.antor.ctx.request.get(`/api/univers/${m.id}/membres`)).json();
    assert.deepEqual(liste.filter((x: Any) => x.username === 'admin').map((x: Any) => x.role), ['mj']);
  });

  // Panne visée : la recherche, la liste des univers ou la barre trahissent l'univers à l'admin sans rôle.
  it('admin_sans_role_ni_recherche_ni_liste_d_univers_ne_montrent_l_univers_ou_ses_fiches', async () => {
    const m = await monde();
    assert.equal((await m.admin.ctx.request.get(`/api/univers/${m.id}/fiches?recherche=Aldric`)).status(), 404);
    const mes = await (await m.admin.ctx.request.get('/api/univers')).json();
    assert.ok(!JSON.stringify(mes).includes('Ébène'), 'Mes univers ne liste pas un univers sans rôle');
    await m.admin.page.goto('/');
    await attendre(m.admin.page);
    assert.ok(!(await texte(m.admin.page)).includes('Maître Aldric'));
    await m.admin.page.screenshot({ path: '/tmp/recours-admin-verif-accueil.png' });
  });
});
