/**
 * E-9, MJ, téléphone (390 px) : la tuile d'illustration en attente occupe une ligne
 * d'en-tête entière, la clé tient sur une ligne (ellipse si extrême) et le point final
 * ne reste pas seul ; aucun débordement horizontal. Une illustration disponible garde sa vignette.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { type Any, attendre, launch, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const opts = { skip: skipBrowser };

let browser: Any;
before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
});

async function cas(cle: string): Promise<{ hauteur: number; largeur: number; debordement: boolean; cleLignes: number; texte: string; fin: boolean }> {
  const app = await buildApp();
  try {
    assert.ok(semerBouchon(app.db));
    await app.listen({ host: '127.0.0.1', port: 0 });
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
    const r = await fetch(`${base}/api/import/v1/univers/${essai}/fiches/${encodeURIComponent('lieu:ill390')}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${JETON_BOUCHON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'lieu', titre: 'Quai', illustration: cle, sections: [] }),
    });
    assert.equal(r.status, 200, await r.clone().text());
    const fid = ((await r.json()) as { id: number }).id;
    const ctx = await browser.newContext({ baseURL: base, locale: 'fr-FR', viewport: { width: 390, height: 800 } });
    try {
      const page = await ctx.newPage();
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
      await attendre(page);
      await page.goto(`/univers/${essai}/fiche/${fid}`);
      await attendre(page);
      const tuile = page.locator('.ill-attente').first();
      await tuile.waitFor();
      const b = await tuile.boundingBox();
      const cleBox = await page.locator('.ill-attente .cle-attente').first().boundingBox();
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const texte = ((await tuile.innerText()) as string).replace(/[  ]/g, ' ');
      const fin = await page.evaluate(() => {
        // the closing quote and period must share the line of the key's end
        const k = document.querySelector('.ill-attente .cle-attente')!.getBoundingClientRect();
        const f = document.querySelector('.ill-attente .fin-cle-attente')!.getBoundingClientRect();
        return Math.abs(f.bottom - k.bottom) < 4;
      });
      return { hauteur: b.height, largeur: b.width, debordement, cleLignes: Math.round(cleBox.height / 21), texte, fin };
    } finally {
      await ctx.close();
    }
  } finally {
    await app.close();
  }
}

test('E-9 téléphone · illustration en attente, clé courte : une ligne de 358 px, texte entier, pas d’orphelin', opts, async () => {
  const c = await cas('img:plan-absent');
  assert.equal(c.texte, "Fichier en attente d'import : « img:plan-absent ».");
  assert.ok(c.largeur > 300, `tuile pleine largeur : ${c.largeur}`);
  assert.ok(c.hauteur < 70, `tuile basse (une ligne) : ${c.hauteur}`);
  assert.ok(!c.debordement, 'aucun défilement horizontal');
  assert.ok(c.fin, 'guillemet et point sur la ligne de la fin de clé');
});

test('E-9 téléphone · illustration en attente, clé de 200 caractères : abrégée sur une ligne, sans débordement', opts, async () => {
  const c = await cas('img:' + 'k'.repeat(196));
  assert.ok(c.largeur > 300);
  assert.ok(c.hauteur < 90, `tuile contenue : ${c.hauteur}`);
  assert.equal(c.cleLignes, 1, 'la clé reste sur une ligne');
  assert.ok(!c.debordement);
  assert.ok(c.fin);
});
