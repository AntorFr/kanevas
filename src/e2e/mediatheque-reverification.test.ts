// Re-verification of kanevas-import-mediatheque, written from the brief of the re-check
// (B3 : « Utilisé dans » and the impact boxes follow the single reference grammar
// `![x](fichier:3 "titre")`) and docs/ecrans.md (E-19 panel and boxes). Not from the code.
// Real server in stub mode, real Chromium, real SQLite; literal expectations.
//
// TEST PLAN
//   B3 nominal   : an image cited with a title in « Description » appears under « Utilisé dans » of its panel and in
//                  the « Réserver au MJ » box : « Port-Sel — « Description » »
//   B3 bords     : a document linked with a title `[nom](fichier:N "titre")` counts as well; a citation without title still counts
//   B3 exclusion : the same text inside inline code / a code block is not a use : no « Utilisé dans », no box on reserving
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let fiche = 0;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const r = await (await antor.request.get(`/api/univers/${uid}/fiches?type=lieu`)).json();
  fiche = r.fiches.find((f: Any) => f.titre === 'Port-Sel').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const depot = async (nom: string, mime: string, buffer: Buffer): Promise<number> => {
  const r = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { fichier: { name: nom, mimeType: mime, buffer } } });
  assert.equal(r.status(), 201);
  return (await r.json()).id;
};
const ecrire = async (contenu: string) => {
  const f = await (await antor.request.get(`/api/univers/${uid}/fiches/${fiche}`)).json();
  const s = f.sections.find((x: Any) => x.titre === 'Description');
  const r = await antor.request.put(`/api/univers/${uid}/fiches/${fiche}/sections/${s.id}/contenu`, { data: { version: s.version, contenu } });
  assert.equal(r.status(), 200);
};
const impact = async (id: number, action: string): Promise<string[]> =>
  (await (await antor.request.get(`/api/univers/${uid}/fichiers/${id}/impact?action=${action}`)).json()).usages.map((u: Any) => u.libelle);
const panneau = async (nom: string) => {
  await antor.goto(`/univers/${uid}/mediatheque`);
  await attendre(antor);
  await antor.getByRole('button', { name: nom, exact: false }).filter({ hasText: nom }).first().click();
  await antor.getByRole('link', { name: 'Télécharger' }).first().waitFor();
};

test('B3 · image citée avec un titre : « Utilisé dans » et la boîte « Réserver au MJ » nomment « Port-Sel — « Description » »', opts, async () => {
  const id = await depot('grammaire-image.png', 'image/png', PNG);
  await ecrire(`Texte.\n\n![x](fichier:${id} "titre")\n`);
  assert.deepEqual(await impact(id, 'reserver'), ['Port-Sel — « Description »']);
  await panneau('grammaire-image.png');
  const p = antor.locator('.med-panneau');
  assert.match(await p.innerText(), /Utilisé dans[\s\S]*Port-Sel/);
  await p.getByText('Réservé au MJ', { exact: true }).click();
  const boite = antor.getByRole('alertdialog');
  await boite.waitFor();
  assert.match((await boite.innerText()).replace(/[’]/g, "'").replace(/[\u00a0\u202f]/g, ' '), /Port-Sel — « Description »/);
  await antor.screenshot({ path: '/tmp/scr/rev-b3-image.png' });
  await boite.getByRole('button', { name: 'Annuler' }).click();
});

test('B3 · document lié avec un titre, et référence sans titre : usages comptés', opts, async () => {
  const doc = await depot('grammaire-doc.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));
  const img = await depot('grammaire-sans-titre.png', 'image/png', PNG);
  await ecrire(`Voir [le tarif](fichier:${doc} "titre du lien").\n\n![y](fichier:${img})\n`);
  assert.deepEqual(await impact(doc, 'supprimer'), ['Port-Sel — « Description »']);
  assert.deepEqual(await impact(img, 'supprimer'), ['Port-Sel — « Description »']);
});

test('B3 · exclusion : la même référence en code n’est pas un usage (ni « Utilisé dans », ni boîte)', opts, async () => {
  const id = await depot('grammaire-code.png', 'image/png', PNG);
  await ecrire(`Syntaxe : \`![x](fichier:${id} "titre")\`\n\n\`\`\`\n![x](fichier:${id} "titre")\n\`\`\`\n`);
  assert.deepEqual(await impact(id, 'reserver'), []);
  assert.deepEqual(await impact(id, 'supprimer'), []);
  await panneau('grammaire-code.png');
  assert.doesNotMatch(await antor.locator('.med-panneau').innerText(), /Utilisé dans/);
  await antor.locator('.med-panneau').getByText('Réservé au MJ', { exact: true }).click();
  assert.equal(await antor.getByRole('alertdialog').count(), 0, 'sans usage : pas de boîte');
  await antor.screenshot({ path: '/tmp/scr/rev-b3-code.png' });
});
