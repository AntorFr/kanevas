// Review of the single tile-frame rule (E-19 + « Choisir un fichier ») and of the « Supprimer le fichier » alignment.
//
// TEST PLAN
//   cadre unique : in a mixed row (image, reserved document, public document) every .med-cadre has the same
//                  height and width on the E-19 grid, desktop and 390 px
//   sélecteur    : in the picker, the « Ajouter depuis l'appareil » tile frame has the height of the image and
//                  document frames
//   supprimer    : in the file panel (GM) the icon of « Supprimer le fichier » starts at the left edge of the
//                  name (± 1 px), desktop and 390 px
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  for (const [nom, reserve] of [['cadre-a.pdf', true], ['cadre-b.pdf', false]] as const) {
    const r = await antor.request.post(`/api/univers/${uid}/fichiers`, {
      multipart: { fichier: { name: nom, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n%${nom}`) } },
    });
    assert.ok(r.ok(), await r.text());
    if (reserve) {
      const f = await r.json();
      const p = await antor.request.patch(`/api/univers/${uid}/fichiers/${f.id}`, { data: { visibilite: 'mj' } });
      assert.ok(p.ok(), await p.text());
    }
  }
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const ouvrir = async (page: Any) => {
  await page.goto(`/univers/${uid}/mediatheque`);
  await page.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
};

for (const [largeur, hauteur] of [[1440, 900], [390, 800]]) {
  test(`cadre unique : images et documents ont le même cadre (${largeur} px)`, opts, async () => {
    await antor.setViewportSize({ width: largeur, height: hauteur });
    await ouvrir(antor);
    const m: Any[] = await antor.evaluate(`(() => [...document.querySelectorAll('.med-grille .med-tuile .med-cadre')]
      .map((c) => { const b = c.getBoundingClientRect(); return { w: b.width, h: b.height, doc: !!c.querySelector('.med-feuille') }; }))()`);
    assert.ok(m.some((x) => x.doc), 'au moins un document');
    assert.ok(m.some((x) => !x.doc), 'au moins une image');
    for (const x of m) {
      assert.ok(Math.abs(x.h - m[0].h) <= 0.5 && Math.abs(x.w - m[0].w) <= 0.5, `cadre ${x.w}×${x.h} / ${m[0].w}×${m[0].h}`);
      assert.ok(Math.abs(x.w / x.h - 4 / 3) < 0.02, `ratio ${x.w / x.h}`);
    }
  });
}

test('sélecteur : la tuile « Ajouter depuis l’appareil » a la hauteur des autres cadres', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  const fiche = await (await antor.request.get(`/api/univers/${uid}/fiches`)).json();
  const liste = (fiche.fiches ?? fiche) as Any[];
  const port = liste.find((f) => /Port-Sel/.test(f.titre ?? f.nom));
  assert.ok(port, 'fiche Port-Sel');
  await antor.goto(`/univers/${uid}/fiche/${port.id}`);
  await antor.getByRole('region', { name: /Description/ }).getByRole('button', { name: 'Modifier', exact: true }).click();
  await antor.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  const d = antor.getByRole('dialog');
  await d.getByText('Choisir un fichier').waitFor();
  await antor.waitForLoadState('networkidle');
  await antor.evaluate(`document.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; e.style.transition = 'none'; })`);
  const m: Any[] = await antor.evaluate(`(() => [...document.querySelectorAll('.selecteur .med-grille .med-cadre')]
    .map((c) => { const b = c.getBoundingClientRect(); return { w: b.width, h: b.height }; }))()`);
  assert.ok(m.length >= 2, `cadres ${m.length}`);
  for (const x of m) assert.ok(Math.abs(x.h - m[0].h) <= 0.5 && Math.abs(x.w - m[0].w) <= 0.5, `cadre ${x.w}×${x.h} / ${m[0].w}×${m[0].h}`);
});

for (const [largeur, hauteur] of [[1440, 900], [390, 800]]) {
  test(`supprimer : l'icône est alignée à gauche du nom (${largeur} px)`, opts, async () => {
    await antor.setViewportSize({ width: largeur, height: hauteur });
    await ouvrir(antor);
    await antor.locator('.med-tuile').filter({ has: antor.locator('[title="cadre-b.pdf"]') }).first().click();
    await antor.locator('.med-panneau .med-nom-en-place').waitFor();
    await antor.waitForLoadState('networkidle');
    const m = await antor.evaluate(`(() => {
      const nom = document.querySelector('.med-panneau .med-nom-en-place').getBoundingClientRect().left;
      const ic = document.querySelector('.med-panneau .med-supprimer svg').getBoundingClientRect().left;
      return { nom, ic };
    })()`);
    assert.ok(Math.abs(m.nom - m.ic) <= 1, `nom ${m.nom} / icône ${m.ic}`);
  });
}
