// ecrans: recherche, fiches
// Pastille du système et case « Masquer les éléments du système » (kanevas-systemes-jeu-recherche-ecrans, B-117) : l'effet
// (origine, systeme, filtre) a sa porte dans src/services/fiches*.test.ts ; ici seulement ce que la lectrice voit.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

describe('kanevas-systemes-jeu-recherche-ecrans : pastille et case du système', { skip: skipBrowser }, () => {
  it('« pisto » : trois lignes (système, Personnalisé, rien) ; la case en retire une et vit dans l’adresse ; « laser » donne le message et le bouton ; E-8 porte la case ; un univers sans système n’a ni case ni pastille', { timeout: 300000 }, async () => {
    const s = await startServer();
    const browser = await launch();
    aFermer.push(async () => {
      await browser.close();
      s.stop();
    });
    const antor = await connecte(browser, s.base, 'Antor');
    const mira = await connecte(browser, s.base, 'Mira');
    const admin = await connecte(browser, s.base, 'Admin');
    antor.page.setDefaultTimeout(60000);

    const u = await antor.ctx.request.post('/api/univers', { data: { nom: 'Lame', description: 'd' } });
    assert.equal(u.status(), 201);
    const uid = (await u.json()).id;
    const sys = await antor.ctx.request.post(`/api/univers/${uid}/systeme-nouveau`, { data: { nom: 'Zeta' } });
    assert.equal(sys.status(), 201);
    const sid = (await sys.json()).id;
    assert.ok((await admin.ctx.request.post(`/api/instance/systemes/${sid}/membres`, { data: { username: 'mira' } })).status() < 300);
    const element = async (titre: string) => {
      const r = await mira.ctx.request.post(`/api/systemes/${sid}/fiches`, { data: { type: 'objet', titre, sections: [{ titre: 'Description', joueursLisent: true }] } });
      assert.equal(r.status(), 201);
      return (await r.json()).id;
    };
    await element('Pistolet laser');
    const pompe = await element('Pistolet à pompe');
    assert.equal((await antor.ctx.request.post(`/api/univers/${uid}/fiches/${pompe}/personnaliser`)).status(), 201);
    assert.equal((await antor.ctx.request.post(`/api/univers/${uid}/fiches`, { data: { type: 'personnage', titre: 'Le Pistolero', charge: { pj: false } } })).status(), 201);

    const p: Any = antor.page;
    await p.goto(`/univers/${uid}/recherche?q=pisto`);
    await attendre(p);
    const lignes = p.locator('.ligne-recherche');
    await lignes.nth(2).waitFor();
    assert.equal(await lignes.count(), 3);
    assert.equal(await lignes.filter({ hasText: 'Zeta' }).count(), 1, 'la pastille du système sur l’élément resté à l’original');
    assert.equal(await lignes.filter({ hasText: 'Personnalisé' }).count(), 1);
    assert.equal(await lignes.filter({ hasText: 'Le Pistolero' }).locator('.marque-systeme, .marque-personnalise').count(), 0, 'rien sur une fiche de l’univers');
    await p.screenshot({ path: '/tmp/kanevas-recherche-pastilles.png' });

    const caseSysteme = p.getByLabel('Masquer les éléments du système');
    await caseSysteme.click();
    await p.waitForURL(/sans-systeme=1/);
    await lignes.nth(1).waitFor();
    await p.waitForFunction(() => document.querySelectorAll('.ligne-recherche').length === 2);
    await p.reload();
    await p.getByLabel('Masquer les éléments du système').waitFor();
    assert.equal(await p.getByLabel('Masquer les éléments du système').isChecked(), true, 'un rechargement conserve la case');

    await p.goto(`/univers/${uid}/recherche?q=laser&sans-systeme=1`);
    await p.getByRole('status').filter({ hasText: 'Aucun résultat sans les éléments du système.' }).waitFor();
    await p.getByRole('button', { name: 'Afficher les éléments du système' }).click();
    await p.getByRole('link', { name: /Pistolet laser/ }).waitFor();
    assert.equal(await p.getByLabel('Masquer les éléments du système').isChecked(), false);
    assert.ok(!p.url().includes('sans-systeme'));
    await p.screenshot({ path: '/tmp/kanevas-recherche-rendu.png' });

    // E-8 : la même case sur la liste d'un type
    await p.goto(`/univers/${uid}/fiches/objets`);
    await p.getByLabel('Masquer les éléments du système').click();
    await p.waitForURL(/sans-systeme=1/);
    await p.getByRole('link', { name: /Pistolet à pompe/ }).waitFor();
    await p.waitForFunction(() => !document.body.innerText.includes('Pistolet laser'));
    await p.screenshot({ path: '/tmp/kanevas-fiches-sans-systeme.png' });

    // Un univers sans système : ni case ni pastille
    const v = await antor.ctx.request.post('/api/univers', { data: { nom: 'Nu', description: 'd' } });
    const nu = (await v.json()).id;
    assert.equal((await antor.ctx.request.post(`/api/univers/${nu}/fiches`, { data: { type: 'personnage', titre: 'Le Pistolero', charge: { pj: false } } })).status(), 201);
    await p.goto(`/univers/${nu}/recherche?q=pisto`);
    await p.getByRole('link', { name: /Pistolero/ }).waitFor();
    assert.equal(await p.getByLabel('Masquer les éléments du système').count(), 0);
    assert.equal(await p.locator('.marque-systeme').count(), 0);
  });
});
