// Browser test of kanevas-outils-catalogue-acces-api, written from the exit criterion and docs/ecrans.md
// (E-18, « the scope of a token and tool batches »). Stub world with the seed. Screenshots: /tmp/cap-acces-api.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-acces-api';
const VUES = [{ nom: 'bureau', width: 1440, height: 900 }, { nom: '360', width: 360, height: 780 }];
const EXEMPLE = JSON.parse(readFileSync('src/outils/essai/exemples/catalogue-essai.json', 'utf8')) as Any;
const fautif = (): Any => { const c = JSON.parse(JSON.stringify(EXEMPLE)); delete c.armes.find((a: Any) => a.cle === 'laser-lourd').masse; return c; };

describe('E-18 : portée du jeton et lots d’outil', { skip: skipBrowser, timeout: 400000 }, () => {
  for (const vue of VUES) {
    it(vue.nom, async () => {
      const srv: Server = await startServer({ KANEVAS_SANS_SEMIS: '' });
      const browser: Any = await launch();
      try {
        const ouvre = async (compte: string) => {
          const c = await connecte(browser, srv.base, compte);
          await c.page.setViewportSize({ width: vue.width, height: vue.height });
          return c;
        };
        const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${vue.nom}-${nom}.png`, fullPage: true });
        const { page } = await ouvre('Antor');
        const us = (await (await page.request.get('/api/univers')).json()) as Any;
        const id = (n: string) => (us.univers ?? us).find((u: Any) => u.nom === n).id as number;
        const E = id("Éneria d'essai");
        const K = id('Essai Kanka');
        const nouveau = async (p: Any) => { await p.getByRole('button', { name: /Nouveau jeton/ }).first().click(); return p.getByRole('dialog'); };

        // Outils : « Créer le jeton » désactivé tant que rien n'est coché
        await page.goto(`/univers/${E}/acces-api`);
        let dlg = await nouveau(page);
        await dlg.getByLabel('Nom').fill('Jeton G');
        await dlg.getByLabel('Outils').check();
        await dlg.getByText('Cochez au moins un outil.').waitFor();
        assert.equal(await dlg.getByRole('button', { name: 'Créer le jeton' }).isDisabled(), true);
        await photo(page, 'validation');
        await dlg.getByLabel(/Essai G/).check();
        assert.equal(await dlg.getByText('Cochez au moins un outil.').count(), 0);
        assert.equal(await dlg.getByRole('button', { name: 'Créer le jeton' }).isDisabled(), false);
        // décocher revient à l'état invalide
        await dlg.getByLabel(/Essai G/).uncheck();
        assert.equal(await dlg.getByRole('button', { name: 'Créer le jeton' }).isDisabled(), true);
        await dlg.getByLabel(/Essai G/).check();
        await dlg.getByRole('button', { name: 'Créer le jeton' }).click();
        const valeur = (await dlg.getByLabel('Jeton', { exact: true }).textContent())!.trim();
        assert.match(valeur, /^kvs_/);
        await dlg.getByRole('button', { name: 'J’ai copié le jeton' }).click();

        // jeton de contenu
        dlg = await nouveau(page);
        await dlg.getByLabel('Nom').fill('Jeton contenu');
        await dlg.getByRole('button', { name: 'Créer le jeton' }).click();
        await dlg.getByRole('button', { name: 'J’ai copié le jeton' }).click();
        await page.locator('[data-jeton="Jeton G"]').getByText('Portée : Essai G').waitFor();
        await page.locator('[data-jeton="Jeton contenu"]').getByText('Portée : contenu').waitFor();

        // import du fichier fautif avec le jeton d'outil
        const h = { authorization: `Bearer ${valeur}` };
        const base = `${srv.base}/api/import/v1/univers/${E}`;
        const lot = (await (await fetch(`${base}/lots?outil=essai/g`, { method: 'POST', headers: h })).json()).lotId;
        const r = await fetch(`${base}/outils/essai/g/catalogue?niveau=univers&lot=${lot}`, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(fautif()) });
        assert.equal(r.status, 200);
        await page.reload();
        const ligne = page.locator('li', { hasText: 'Coques : 4 créés' });
        await ligne.getByText('Essai G').first().waitFor();
        await ligne.getByText('Armes : 7 créés, 1 refusé').waitFor();
        await ligne.getByRole('button').first().click();
        await ligne.getByText(/armes · laser-lourd/).waitFor();
        await ligne.getByText(/masse/).first().waitFor();
        await photo(page, 'lot-outil');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'débordement horizontal');

        // univers sans système : Outils désactivé et expliqué
        await page.goto(`/univers/${K}/acces-api`);
        dlg = await nouveau(page);
        await dlg.getByText('Aucun outil de ce système ne reçoit de catalogue par l’API.').waitFor();
        assert.equal(await dlg.getByLabel('Outils').isDisabled(), true);
        await photo(page, 'sans-outil');

        // Léa
        const lea = await ouvre('Léa'.toLowerCase());
        await lea.page.goto(`/univers/${E}/acces-api`);
        await lea.page.getByText('Page introuvable.').waitFor();
      } finally {
        await browser.close();
        srv.stop();
      }
    });
  }
});
