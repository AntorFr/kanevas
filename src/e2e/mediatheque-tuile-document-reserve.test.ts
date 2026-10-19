// Review of the reserved-document tile layout and the phone « Ajouter des fichiers » button (E-19).
//
// TEST PLAN
//   chevauchement : on a reserved document tile (badge « MJ seul », sheet with the type icon, footer with
//                   extension and size) the three boxes never overlap, desktop and 390 px, light and dark
//   bouton mobile : at 390 px « Ajouter des fichiers » is as wide as its header and at least 40 px high
//   image         : an image tile keeps its 4/3 frame
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
const NOM = 'reserve-tuile.pdf';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const r = await antor.request.post(`/api/univers/${uid}/fichiers`, {
    multipart: { fichier: { name: NOM, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%reserve') } },
  });
  assert.ok(r.ok(), await r.text());
  const f = await r.json();
  const p = await antor.request.patch(`/api/univers/${uid}/fichiers/${f.id}`, { data: { visibilite: 'mj' } });
  assert.ok(p.ok(), await p.text());
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

// A string, not a function: tsx would inject a helper the page does not have.
const boites = (page: Any) =>
  page.evaluate(`(() => {
    const t = document.querySelector('.med-tuile:has([title="${NOM}"])');
    const lire = (s) => { const b = t.querySelector(s).getBoundingClientRect(); return [b.top, b.bottom]; };
    return { c: lire('.med-cadre'), p: lire('.med-pastille'), f: lire('.med-feuille'), d: lire('.med-pied-doc') };
  })()`);

for (const [largeur, hauteur] of [[1440, 900], [390, 800]]) {
  for (const theme of ['clair', 'sombre']) {
    test(`document réservé : pastille, feuille et pied sans chevauchement (${largeur} px, ${theme})`, opts, async () => {
      await antor.setViewportSize({ width: largeur, height: hauteur });
      await antor.addInitScript((t: string) => localStorage.setItem('kanevas-theme', t), theme);
      await antor.goto(`/univers/${uid}/mediatheque`);
      await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
      await antor.waitForLoadState('networkidle');
      const b = await boites(antor);
      assert.ok(b.p[1] <= b.f[0], `pastille ${b.p} / feuille ${b.f}`);
      assert.ok(b.f[1] <= b.d[0], `feuille ${b.f} / pied ${b.d}`);
      assert.ok(b.c[0] <= b.p[0] && b.d[1] <= b.c[1] + 0.5, `dans le cadre ${b.c}`);
    });
  }
}

test('téléphone : « Ajouter des fichiers » pleine largeur et au moins 40 px', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/mediatheque`);
  await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  const m = await antor.evaluate(() => {
    const b = [...document.querySelectorAll('.med-tete button')].find((x) => x.textContent?.includes('Ajouter des fichiers'))!.getBoundingClientRect();
    const t = document.querySelector('.med-tete')!;
    const cs = getComputedStyle(t);
    const interieur = t.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return { w: b.width, h: b.height, interieur };
  });
  assert.ok(m.h >= 40, `hauteur ${m.h}`);
  assert.ok(Math.abs(m.w - m.interieur) <= 1, `largeur ${m.w} / en-tête ${m.interieur}`);
});

test('image : la tuile garde son cadre 4/3', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await antor.goto(`/univers/${uid}/mediatheque`);
  await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await antor.waitForLoadState('networkidle');
  const r = await antor.locator('.med-tuile').filter({ has: antor.locator('[title="Carte des Sphères"]') }).locator('.med-cadre')
    .evaluate((e: Element) => { const b = e.getBoundingClientRect(); return b.width / b.height; });
  assert.ok(Math.abs(r - 4 / 3) < 0.02, `ratio ${r}`);
});
