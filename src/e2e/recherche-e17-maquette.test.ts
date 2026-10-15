// Feature-level visual tests of E-17 against its mockup (docs/maquettes/e17-recherche.html), written from
// the mockup and docs/ecrans.md, never from the code: in a result, « alias : Salport » and the label pills
// share one line; the empty states (« Cherchez un nom, un alias ou un mot. », « Aucune fiche ne
// correspond. ») sit in a framed box (dashed border, rounded, text centred).
// Real server in stub mode, real Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-recherche-maquette-shots';
const LAME = 1;

let srv: Server;
let browser: Any;

async function recherche(page: Any, query: string): Promise<void> {
  await page.goto(`/univers/${LAME}/recherche${query}`);
  await page.getByRole('textbox').first().waitFor();
  await attendre(page);
  await page.waitForTimeout(700); // 300 ms debounce + request
  await attendre(page);
}

/** Style of the nearest box (the element or an ancestor inside <main>) whose whole text is `message`. */
async function cadreDe(page: Any, message: string): Promise<Any> {
  const el = page.locator('main').getByText(message, { exact: true }).first();
  await el.waitFor();
  return el.evaluate((node: Any) => {
    let cur = node;
    const main = node.closest('main');
    while (cur && cur !== main) {
      if ((cur.innerText as string).trim() === (node.innerText as string).trim()) {
        const cs = getComputedStyle(cur);
        if (cs.borderTopStyle === 'dashed') {
          return {
            style: cs.borderTopStyle,
            largeur: parseFloat(cs.borderTopWidth),
            rayon: parseFloat(cs.borderTopLeftRadius),
            alignement: cs.textAlign,
            marge: parseFloat(cs.paddingTop),
          };
        }
      }
      cur = cur.parentElement;
    }
    return null;
  });
}

describe('kanevas-import-recherche, E-17 comme la maquette (écarts visuels)', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('alias_et_etiquette_du_resultat_port_sel_sont_sur_une_seule_ligne', async () => {
    // Fails if « alias : Salport » and the « Côte des Brumes » pill stack on two lines.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=salport');
    await page.getByRole('link', { name: /Port-Sel/ }).first().waitFor();
    const alias = page.locator('main').getByText('alias : Salport');
    const a = await alias.boundingBox();
    assert.ok(a, 'alias visible dans le résultat');
    // The label pill of the result is the « Côte des Brumes » closest to the alias (the other one is the filter row).
    const etiquettes = page.locator('main').getByText('Côte des Brumes');
    let e: Any = null;
    for (let i = 0; i < (await etiquettes.count()); i++) {
      const b = await etiquettes.nth(i).boundingBox();
      if (b && (!e || Math.abs(b.y - a.y) < Math.abs(e.y - a.y))) e = b;
    }
    assert.ok(e, "étiquette visible à côté de l'alias");
    const centreA = a.y + a.height / 2;
    const centreE = e.y + e.height / 2;
    assert.ok(Math.abs(centreA - centreE) < 6, `centres verticaux ${centreA} et ${centreE} : pas la même ligne`);
    assert.ok(e.x > a.x + a.width - 1, "l'étiquette suit l'alias, à sa droite");
    await page.screenshot({ path: `${SHOTS}/alias-etiquette-une-ligne.png`, fullPage: true });
    await ctx.close();
  });

  test('resultat_sans_alias_garde_son_etiquette_sous_le_titre', async () => {
    // A title match shows no alias; the label pill still appears in the result (mockup: Antor, « sous-main »).
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=port-sel');
    await page.getByRole('link', { name: /Port-Sel/ }).first().waitFor();
    assert.equal(await page.locator('main').getByText('alias :').count(), 0);
    // Two pills: the filter row and the result's own.
    assert.equal(await page.locator('main').getByText('Côte des Brumes').count(), 2);
    await ctx.close();
  });

  test('etat_de_depart_est_encadre_en_pointilles_arrondi_et_centre', async () => {
    // Fails if « Cherchez un nom, un alias ou un mot. » is bare text instead of the mockup's dashed box.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '');
    const c = await cadreDe(page, 'Cherchez un nom, un alias ou un mot.');
    await page.screenshot({ path: `${SHOTS}/depart.png`, fullPage: true });
    assert.ok(c, 'aucun cadre en pointillés autour du message de départ');
    assert.equal(c.style, 'dashed');
    assert.ok(c.largeur >= 1);
    assert.equal(c.rayon, 12);
    assert.equal(c.alignement, 'center');
    assert.ok(c.marge >= 20, `marge intérieure ${c.marge}`);
    await ctx.close();
  });

  test('etat_sans_resultat_est_encadre_en_pointilles_arrondi_et_centre', async () => {
    // Fails if « Aucune fiche ne correspond. » is bare text instead of the mockup's dashed box.
    const { ctx, page } = await connecte(browser, srv.base, 'Léa');
    await recherche(page, '?q=sous-main');
    const c = await cadreDe(page, 'Aucune fiche ne correspond.');
    await page.screenshot({ path: `${SHOTS}/sans-resultat.png`, fullPage: true });
    assert.ok(c, 'aucun cadre en pointillés autour du message sans résultat');
    assert.equal(c.style, 'dashed');
    assert.equal(c.rayon, 12);
    assert.equal(c.alignement, 'center');
    assert.ok(c.marge >= 20, `marge intérieure ${c.marge}`);
    await ctx.close();
  });
});
