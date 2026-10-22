// Review of kanevas-mediatheque-fiche, reopened by verify (E-9 « bloc Pièces jointes », B-24):
// the size of a document sits against its name (no hole before the actions), and the legend of an image
// shows « nom · taille » whole even for a long name, at desktop and phone widths.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, rx, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.ts';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

async function mise(): Promise<{ antor: Any; nom: string; fiche: string }> {
  const antor = await connecte(browser, srv.base, 'Antor');
  const nom = 'Géométrie pièces';
  const fiche = 'Maître Aldric';
  const u = (await (await antor.ctx.request.post('/api/univers', { data: { nom } })).json()) as Any;
  const f = (await (await antor.ctx.request.post(`/api/univers/${u.id}/fiches`, { data: { type: 'personnage', titre: fiche, charge: { pj: false } } })).json()) as Any;
  const fid = f.id ?? f.fiche?.id;
  const s = (await (await antor.ctx.request.post(`/api/univers/${u.id}/fiches/${fid}/sections`, { data: { titre: 'Apparence' } })).json()) as Any;
  const sid = s.id ?? s.section?.id;
  const p = await antor.ctx.request.patch(`/api/univers/${u.id}/fiches/${fid}/sections/${sid}`, { data: { joueursLisent: true } });
  assert.ok(p.ok());
  for (const [name, buffer] of [['regles.pdf', PDF], ['un-portrait-au-nom-vraiment-tres-long-pour-la-legende.png', PNG]] as const) {
    const r = await antor.ctx.request.post(`/api/univers/${u.id}/fichiers`, {
      multipart: { section: String(sid), maniere: 'joint', fichier: { name, mimeType: 'application/octet-stream', buffer } },
    });
    assert.equal(r.status(), 201);
  }
  return { antor, nom, fiche };
}

async function ouvrir(page: Any, nom: string, fiche: string): Promise<void> {
  await page.goto('/');
  await attendre(page);
  await page.getByRole('link', { name: rx(nom) }).first().click();
  await attendre(page);
  await page.getByRole('link', { name: rxExact('Personnages') }).click();
  await attendre(page);
  await page.getByRole('link', { name: rx(fiche) }).first().click();
  await page.getByRole('heading', { name: rx(fiche) }).first().waitFor();
  await attendre(page);
}

for (const [label, largeur] of [['bureau', 1440], ['téléphone', 390]] as const) {
  test(`E-9 pièces jointes (${label}) : la taille du document touche son nom, la légende de l'image est entière`, opts, async () => {
    const { antor, nom, fiche } = await mise();
    await antor.page.setViewportSize({ width: 1440, height: 900 });
    await ouvrir(antor.page, nom, fiche);
    await antor.page.setViewportSize({ width: largeur, height: 900 });
    const app = section(antor.page, 'Apparence');
    const ligne = app.locator('.fichier', { hasText: 'regles.pdf' }).first();
    await ligne.waitFor();
    const g = await ligne.evaluate((el: Any) => {
      const n = el.querySelector('.fichier-nom').getBoundingClientRect();
      const t = el.querySelector('.fichier-taille').getBoundingClientRect();
      return { trou: t.left - n.right, tronque: el.querySelector('.fichier-nom').scrollWidth > el.querySelector('.fichier-nom').clientWidth };
    });
    assert.ok(g.trou >= 0 && g.trou <= 16, `hole between name and size: ${g.trou}px`);
    assert.equal(g.tronque, false, 'short name not truncated');
    const legende = app.locator('figcaption').first();
    await legende.waitFor();
    const t = (await legende.innerText()).replace(/ /g, ' ');
    assert.ok(t.includes(`un-portrait-au-nom-vraiment-tres-long-pour-la-legende.png · ${PNG.length} o`), t);
    const coupee = await legende.evaluate((el: Any) => {
      const s = el.firstElementChild;
      return s.scrollWidth > s.clientWidth + 1 || getComputedStyle(s).textOverflow === 'ellipsis';
    });
    assert.equal(coupee, false, 'legend not cut by an ellipsis');
  });
}
