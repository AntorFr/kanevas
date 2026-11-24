// ecrans: administration, systeme
// B-114 / E-15 « MJ du système » : l'admin ouvre depuis « Administration » un système sans MJ, ajoute un compte, le retire.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

describe('B-114 : l’admin gère les MJ d’un système depuis Administration (navigateur)', { skip: skipBrowser }, () => {
  it('ouvre un système sans MJ, ajoute lea, la retire ; un non-admin n’a pas l’onglet', async () => {
    const s = await startServer();
    const browser = await launch();
    aFermer.push(async () => {
      await browser.close();
      s.stop();
    });
    const antor = await connecte(browser, s.base, 'Antor');
    const lea = await connecte(browser, s.base, 'Léa');
    const admin = await connecte(browser, s.base, 'Admin');
    admin.page.setDefaultTimeout(60000);
    const u = await antor.ctx.request.post('/api/univers', { data: { nom: 'Brume', description: 'd' } });
    assert.equal(u.status(), 201);
    const sys = await antor.ctx.request.post(`/api/univers/${(await u.json()).id}/systeme-nouveau`, { data: { nom: 'Zeta' } });
    assert.equal(sys.status(), 201);
    const sid = (await sys.json()).id;
    // the admin has no link with the system: no GM at all
    const page: Any = admin.page;
    await page.goto('/administration');
    await page.getByRole('heading', { name: 'Systèmes de jeu' }).waitFor();
    await attendre(page);
    await page.getByRole('link', { name: rx('Zeta') }).click();
    await page.getByRole('tab', { name: 'MJ du système' }).waitFor();
    assert.match(page.url(), /type=mj/);
    await page.getByText('Aucun MJ', { exact: false }).waitFor();
    await page.getByLabel('Identifiant du compte').fill('lea');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: 'Retirer lea' }).waitFor();
    const apres = await admin.ctx.request.get(`/api/instance/systemes/${sid}/membres`);
    assert.deepEqual((await apres.json()).map((m: { username: string }) => m.username), ['lea']);
    await page.getByRole('button', { name: 'Retirer lea' }).click();
    await page.getByRole('button', { name: 'Retirer lea' }).last().click();
    await page.getByText('Aucun MJ', { exact: false }).waitFor();
    const fin = await admin.ctx.request.get(`/api/instance/systemes/${sid}/membres`);
    assert.deepEqual(await fin.json(), []);
    // a non-admin reaches no such tab
    await antor.page.goto(`/systemes/${sid}?type=mj`);
    await antor.page.getByText(/introuvable/i).first().waitFor();
    assert.equal(await antor.page.getByRole('tab', { name: 'MJ du système' }).count(), 0);
    void lea;
  });
});
