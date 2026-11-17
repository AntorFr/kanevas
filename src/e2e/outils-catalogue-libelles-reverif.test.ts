// ecrans: acces-api, systeme
// Revérification of kanevas-outils-catalogue, written from docs/ecrans.md (E-20 « Voir les éléments », E-18 « Portée »),
// not from the code. Expected strings are literals. Screenshots: /tmp/cap-catalogue-libelles (not committed).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-catalogue-libelles';
mkdirSync(SHOTS, { recursive: true });

describe('E-20 résumé des éléments et E-18 choix d’outil: libellés', { skip: skipBrowser, timeout: 300000 }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => { srv = await startServer({ KANEVAS_SANS_SEMIS: '' }); browser = await launch(); }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('E-20: la ligne d’un élément dit « masse 20 · coût 80 », jamais « 20 masse · 80 crédits »', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    const us = (await (await page.request.get('/api/univers')).json()) as Any;
    const S = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").systeme.id as number;
    const sys = `/api/systemes/${S}/outils/essai/g`;
    await page.request.put(`${sys}/activation`, { data: { active: true } });
    const r = await page.request.post(`${sys}/catalogue/application`, {
      data: { catalogue: 'essai/g', version: 'v-libelles', coques: [{ cle: 'cargo', nom: 'Cargo', masse: 20, cout: 80 }, { cle: 'corvette', nom: 'Corvette', masse: 12, cout: 100 }], armes: [] },
    });
    assert.equal(r.status(), 200);
    await page.goto(`/systemes/${S}?type=outils`);
    const carte = page.getByRole('region', { name: 'Essai G' });
    await carte.getByRole('button', { name: 'Voir les éléments' }).click();
    const panneau = page.getByRole('region', { name: /^Éléments/ });
    const cargo = panneau.getByRole('listitem').filter({ hasText: 'Cargo' });
    await cargo.waitFor();
    const t = await cargo.innerText();
    assert.match(t, /masse 20 · coût 80/);
    assert.doesNotMatch(t, /20 masse|80 crédits/);
    const corvette = await panneau.getByRole('listitem').filter({ hasText: 'Corvette' }).innerText();
    assert.match(corvette, /masse 12 · coût 100/);
    await page.screenshot({ path: `${SHOTS}/e20-resume.png`, fullPage: true });
  });
});
