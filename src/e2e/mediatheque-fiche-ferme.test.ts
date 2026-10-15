// Reopening of kanevas-mediatheque-fiche: a joined file closed to the reader stays a line of the
// « Pièces jointes » block, a neutral frame (lock, --texte-3) with the sentence alone (docs/ecrans.md, Fichiers).
//
// TEST PLAN
//   nominal   : Antor joins a PNG and a PDF to « Description », reserves both; Léa reads « Image réservée au MJ. »
//               and « Fichier réservé au MJ. » in the block, framed (border, lock icon), no file name, no link
//   exclusion : neither real name nor bytes reach Léa's page; no menu on those lines
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;
let portId = 0;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const fiches = await (await antor.request.get(`/api/univers/${uid}/fiches?type=lieu`)).json();
  portId = (Array.isArray(fiches) ? fiches : fiches.fiches).find((f: Any) => f.titre === 'Port-Sel').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('Léa lit une image et un document réservés au MJ en cadres neutres dans Pièces jointes', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(antor);
  const zone = antor.getByRole('region', { name: /Description/ });
  const entree = zone.locator('input[type=file]').first();
  await entree.setInputFiles({ name: 'secret-image.png', mimeType: 'image/png', buffer: PNG });
  await zone.getByText('secret-image.png').first().waitFor();
  await entree.setInputFiles({ name: 'secret-doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
  await zone.getByText('secret-doc.pdf').first().waitFor();
  const liste = await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json();
  for (const nom of ['secret-image.png', 'secret-doc.pdf']) {
    const f = (liste.fichiers ?? liste).find((x: Any) => x.nom === nom);
    const r = await antor.request.patch(`/api/univers/${uid}/fichiers/${f.id}`, { data: { visibilite: 'mj' } });
    assert.equal(r.status(), 200);
  }

  await lea.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(lea);
  const bloc = lea.getByRole('region', { name: /Description/ });
  const cadres = bloc.locator('.liste-pieces .ferme');
  await cadres.first().waitFor();
  const textes = (await cadres.allInnerTexts()).map((t: string) => t.trim());
  assert.ok(textes.includes('Image réservée au MJ.'), textes.join('|'));
  assert.ok(textes.includes('Fichier réservé au MJ.'), textes.join('|'));
  const style = await cadres.first().evaluate((e: Element) => {
    const s = getComputedStyle(e);
    return { bord: s.borderTopWidth, fond: s.backgroundColor, svg: e.querySelectorAll('svg').length, liens: e.querySelectorAll('a,button').length };
  });
  assert.equal(style.bord, '1px');
  assert.notEqual(style.fond, 'rgba(0, 0, 0, 0)');
  assert.equal(style.svg, 1, 'cadenas');
  assert.equal(style.liens, 0);
  await cadres.first().scrollIntoViewIfNeeded();
  await lea.screenshot({ path: '/tmp/scr/lea-pieces-fermees.png' });
  const tout = await texte(lea);
  assert.doesNotMatch(tout, /secret-image|secret-doc/);
  assert.equal(await bloc.locator('.liste-pieces li:has(.ferme)').getByRole('button').count(), 0, 'pas de menu pour les lignes fermées');
});
