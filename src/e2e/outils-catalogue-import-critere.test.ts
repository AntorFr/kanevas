// Browser test of kanevas-outils-catalogue-import, written from the exit criterion and docs/ecrans.md
// (E-20 « The import dialog ») — not from the code. Stub world with the seed; files derived from the
// sample at run time. Screenshots go to /tmp/cap-catalogue-import (never into the workspace).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-catalogue-import';
const VUES = [{ nom: 'bureau', width: 1440, height: 900 }, { nom: '360', width: 360, height: 780 }];
const EXEMPLE = JSON.parse(readFileSync('src/outils/essai/exemples/catalogue-essai.json', 'utf8')) as Any;
const clone = (): Any => JSON.parse(JSON.stringify(EXEMPLE));
const fautif = (): Any => { const c = clone(); delete c.armes.find((a: Any) => a.cle === 'laser-lourd').masse; return c; };
const fichier = (nom: string, contenu: unknown) => ({ name: nom, mimeType: 'application/json', buffer: Buffer.from(typeof contenu === 'string' ? contenu : JSON.stringify(contenu)) });

describe('import d’un catalogue depuis la carte (E-20)', { skip: skipBrowser, timeout: 400000 }, () => {
  for (const vue of VUES) {
    describe(vue.nom, () => {
      let srv: Server;
      let browser: Any;
      const ids: Record<string, number> = {};
      const ouvre = async (compte: string) => {
        const c = await connecte(browser, srv.base, compte);
        await c.page.setViewportSize({ width: vue.width, height: vue.height });
        return c;
      };
      const e15 = (nom: string, q = '') => `/systemes/${ids[nom]}?type=outils${q}`;
      const e14 = (nom: string, q = '') => `/univers/${ids[nom]}/parametres?onglet=outils${q}`;
      const carte = (page: Any) => page.getByRole('region', { name: 'Essai G' });
      const ouvrir = async (page: Any) => { await carte(page).getByRole('button', { name: 'Importer un catalogue…' }).click(); return page.getByRole('dialog'); };
      const choisir = (page: Any, f: Any) => page.locator('input[type=file]').setInputFiles(f);
      const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${vue.nom}-${nom}.png`, fullPage: true });
      const sansDebordement = async (page: Any) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'débordement horizontal');

      before(async () => {
        srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
        browser = await launch();
        const a = await connecte(browser, srv.base, 'Antor');
        const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
        for (const u of us.univers ?? us) ids[u.nom] = u.id;
        const ss = (await (await a.page.request.get('/api/systemes')).json()) as Any;
        for (const s of ss.systemes ?? ss) ids[s.nom] = s.id;
        await a.ctx.close();
      }, { timeout: 120000 });
      after(async () => { await browser?.close(); srv?.stop(); });

      it('Antor E-15 : fichier fautif, application, réimport, texte, 300 refus, coupure', async () => {
        const { page, ctx } = await ouvre('Antor');
        await page.goto(e15("Système d'essai"));
        await carte(page).waitFor();
        assert.ok(await carte(page).getByText('aucun catalogue importé').count() >= 1);
        const posts: string[] = [];
        page.on('request', (r: Any) => { if (r.method() !== 'GET') posts.push(`${r.method()} ${new URL(r.url()).pathname}`); });
        let dlg = await ouvrir(page);
        await choisir(page, fichier('fautif.json', fautif()));
        await dlg.getByText('11 ajoutés, 0 modifié, 1 refusé').waitFor();
        await dlg.getByText(/Arme « ?laser-lourd ?»?.*champ\s*masse\s*: nombre attendu\./).waitFor();
        assert.ok(posts.every((p) => /\/catalogue\/apercu$/.test(p)), `seul l'aperçu a écrit : ${posts}`);
        await photo(page, 'apercu-refus');
        await sansDebordement(page);
        await dlg.getByRole('button', { name: 'Annuler' }).click();
        await dlg.waitFor({ state: 'detached' });
        assert.ok(await carte(page).getByText('aucun catalogue importé').count() >= 1, 'carte inchangée après aperçu');

        dlg = await ouvrir(page);
        await choisir(page, fichier('fautif.json', fautif()));
        await dlg.getByText('11 ajoutés, 0 modifié, 1 refusé').waitFor();
        await dlg.getByRole('button', { name: /^Appliquer/ }).click();
        await dlg.getByText('Catalogue appliqué · version 2026-11-essai').waitFor();
        await photo(page, 'resultat');
        await dlg.getByRole('button', { name: 'Fermer' }).first().click();
        await carte(page).getByText('4 coques · 7 armes').waitFor();

        // same file again: nothing to apply
        dlg = await ouvrir(page);
        await choisir(page, fichier('fautif.json', fautif()));
        await dlg.getByText('0 ajouté, 0 modifié, 11 inchangés').waitFor();
        assert.equal(await dlg.getByRole('button', { name: /^Appliquer/ }).isDisabled(), true);
        await dlg.getByText('Rien à appliquer.').waitFor();
        await photo(page, 'rien');

        // a text file
        await choisir(page, fichier('note.txt', 'pas du json du tout'));
        await dlg.getByText('Ce fichier n’est pas un catalogue valide.').or(dlg.getByText("Ce fichier n'est pas un catalogue valide.")).waitFor();
        assert.equal(await dlg.getByRole('button', { name: /^Appliquer/ }).count(), 0, 'pas d’Appliquer sur un fichier invalide');
        await photo(page, 'invalide');

        // 300 faulty elements: 50 listed, « 250 autres refus… », « Voir tout »
        const gros = clone();
        gros.armes = Array.from({ length: 300 }, (_, i) => ({ cle: `x${i}`, nom: `X ${i}`, cout: 1, portee: 'courte' }));
        gros.coques = [];
        await choisir(page, fichier('gros.json', gros));
        await dlg.getByText('250 autres refus…').waitFor();
        assert.equal(await dlg.getByRole('list', { name: 'Éléments refusés' }).getByRole('listitem').count(), 50);
        await photo(page, 'refus-50');
        await dlg.getByRole('button', { name: 'Voir tout' }).click();
        await page.waitForFunction(() => document.querySelectorAll('[aria-label="Éléments refusés"] li').length === 300);
        await sansDebordement(page);
        await dlg.getByRole('button', { name: 'Annuler' }).click();

        // network cut at « Appliquer » (a modified file so there is something to apply)
        const modif = clone(); modif.version = '2026-12-essai'; modif.armes[0].cout = 99;
        dlg = await ouvrir(page);
        await choisir(page, fichier('modif.json', modif));
        await dlg.getByText('1 ajouté, 1 modifié').waitFor();
        await page.route('**/catalogue/application', (r: Any) => r.abort('connectionreset'));
        await dlg.getByRole('button', { name: /^Appliquer/ }).click();
        await dlg.getByText(/Connexion perdue pendant l.application\. Rien n.est appliqué à moitié/).waitFor();
        await photo(page, 'coupure');
        await page.unroute('**/catalogue/application');
        await dlg.getByRole('button', { name: 'Relancer l’aperçu' }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^Appliquer/.test(b.textContent ?? '') && !b.disabled));
        await dlg.getByText('1 ajouté, 1 modifié').waitFor();
        await ctx.close();
      });

      it('E-14 : remplacement d’un élément du système', async () => {
        const { page, ctx } = await ouvre('Antor');
        await page.goto(e14('Éneria d’essai'.replace('’', "'")));
        if (!(await carte(page).count())) await page.goto(e14('Éneria d\'essai'));
        await carte(page).waitFor();
        const f = clone(); f.coques = []; f.armes = [{ ...EXEMPLE.armes[0], nom: 'Laser maison' }];
        const dlg = await ouvrir(page);
        await choisir(page, fichier('univers.json', f));
        await dlg.getByText('dont 1 remplace un élément du système').waitFor();
        await photo(page, 'univers-remplace');
        await ctx.close();
      });

      it('droits : Mira, Léa, mode Joueur', async () => {
        const mira = await ouvre('Mira');
        await mira.page.goto(e15("Système d'essai"));
        await carte(mira.page).waitFor();
        await mira.page.getByText('Seul le responsable du système importe le catalogue.').first().waitFor();
        assert.equal(await mira.page.getByRole('button', { name: 'Importer un catalogue…' }).count(), 0);
        assert.ok(await carte(mira.page).getByText(/Catalogue du système · version/).count() >= 1);
        await photo(mira.page, 'mira-e15');
        await mira.page.goto(e14('Éneria d\'essai'));
        await carte(mira.page).waitFor();
        await mira.page.getByRole('button', { name: 'Importer un catalogue…' }).first().waitFor();
        await mira.ctx.close();

        const lea = await ouvre('Léa'.toLowerCase());
        await lea.page.goto(e14('Éneria d\'essai'));
        await lea.page.getByText('Page introuvable.').waitFor();
        await lea.ctx.close();

        const antor = await ouvre('Antor');
        await antor.page.goto(e14('Éneria d\'essai', '&mode=joueur'));
        await antor.page.getByText('Page introuvable.').waitFor();
        assert.equal(await antor.page.getByRole('button', { name: 'Importer un catalogue…' }).count(), 0);
        await antor.page.goto(e15("Système d'essai", '&mode=joueur'));
        await antor.page.getByText('Page introuvable.').waitFor();
        assert.equal(await antor.page.getByRole('button', { name: 'Importer un catalogue…' }).count(), 0);
        await antor.ctx.close();
      });
    });
  }
});
