// ecrans: parametres
// Browser test of kanevas-outils-textes (E-20, « Import refusals »), written from the fiche and docs/ecrans.md — not from the code.
// Need: the import refusal of an element whose `vise` is missing reads « … champ vise : élément visé exigé. Cet élément n’est pas appliqué. »
// on the report screen, with ONE full stop after « exigé ». Invented trial catalogue; screenshots in /tmp/cap-textes (never in the workspace).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-textes';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const VISE = { nature: 'armes', cle: 'canon-r' };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 20, masse: 20, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, emports: 3 };
const catalogue = (sans: string[]): Any => {
  const mods: Any[] = [
    { cle: 'montage-l', nom: 'Montage L', ...el, effet: 'montages_specialises', limite: 1, vise: VISE },
    { cle: 'surcharge-l', nom: 'Surcharge L', ...el, effet: 'surcharge_cumulable', limite: 2, effet_pct: 50, vise: VISE },
  ];
  for (const m of mods) if (sans.includes(m.cle)) delete m.vise;
  return {
    catalogue: 'swn/vaisseaux', version: 'textes-1', coques: [{ cle: 'fregate-r', nom: 'Frégate R', ...coque }], moteurs: [], amenagements: [], defenses: [],
    armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 0, cout_munition: 0, ...el }], modifications: mods, exemples: [],
  };
};
const fichier = (contenu: unknown) => ({ name: 'vaisseaux.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contenu)) });
const norm = (s: string) => s.replace(/[  \s]+/g, ' ').trim();

describe('refus d’import « vise » exigé : un seul point à l’écran du rapport (E-20)', { skip: skipBrowser, timeout: 400000 }, () => {
  for (const vue of [{ nom: 'bureau', width: 1440, height: 900 }, { nom: '360', width: 360, height: 780 }]) {
    describe(vue.nom, () => {
      let srv: Server; let browser: Any; let E = 0;
      before(async () => {
        srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
        browser = await launch();
        const a = await connecte(browser, srv.base, 'Antor');
        const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
        E = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
        await a.ctx.close();
      }, { timeout: 120000 });
      after(async () => { await browser?.close(); srv?.stop(); });

      const ouvrirDialogue = async (page: Any) => {
        await page.goto(`/univers/${E}/parametres?onglet=outils`);
        const carte = page.getByRole('region', { name: 'Concepteur de vaisseaux' });
        await carte.waitFor();
        await carte.getByRole('button', { name: 'Importer un catalogue…' }).click();
        const dlg = page.getByRole('dialog');
        await dlg.waitFor();
        return dlg;
      };

      it('montage et surcharge sans élément visé : « élément visé exigé. » avec un seul point, jamais deux', async () => {
        const { page, ctx } = await connecte(browser, srv.base, 'Antor');
        await page.setViewportSize({ width: vue.width, height: vue.height });
        const dlg = await ouvrirDialogue(page);
        await page.locator('input[type=file]').setInputFiles(fichier(catalogue(['montage-l', 'surcharge-l'])));
        const liste = dlg.getByRole('list', { name: 'Éléments refusés' });
        await liste.waitFor();
        const lignes = (await liste.getByRole('listitem').allInnerTexts()).map(norm);
        assert.deepEqual(lignes, [
          'Modification « montage-l », champ vise : élément visé exigé. Cet élément n’est pas appliqué.',
          'Modification « surcharge-l », champ vise : élément visé exigé. Cet élément n’est pas appliqué.',
        ]);
        await page.screenshot({ path: `${SHOTS}/${vue.nom}-refus-vise.png`, fullPage: true });
        await ctx.close();
      });

      it('élément visé fourni : aucun refus, donc aucune ligne de refus à l’écran', async () => {
        const { page, ctx } = await connecte(browser, srv.base, 'Antor');
        await page.setViewportSize({ width: vue.width, height: vue.height });
        const dlg = await ouvrirDialogue(page);
        await page.locator('input[type=file]').setInputFiles(fichier(catalogue([])));
        await dlg.getByRole('table', { name: 'Résumé par nature' }).waitFor();
        assert.equal(await dlg.getByRole('list', { name: 'Éléments refusés' }).count(), 0);
        assert.equal((await dlg.innerText()).includes('exigé'), false);
        await ctx.close();
      });
    });
  }
});
