// Review of the E-19 panel correction (aperçu d'un document, libellés « Utilisé dans »).
//
// TEST PLAN
//   document : the preview holds the type label « Document PDF » AND the « Télécharger » link (inside the
//              dotted preview, not below it); an image has no « Télécharger » (maquette #etat-image)
//   usages   : a file both in the text and attached to the same section gives two lines
//              « « Section » (dans le texte) » and « Pièces jointes de « Section » »; an illustration says
//              « (illustration) »; an attached-only file never says « (dans le texte) »
//   dérive   : the confirmation box wording is untouched (« — « Apparence » (jointe) »)
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let descId = 0;
let fichePort = 0;

const PDF = (nom: string) => ({ name: nom, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n%${nom}`) });
const api = (u: string) => `/api/univers/${uid}${u}`;
const norm = (t: string) => t.replace(/[\s  ]+/g, ' ');

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const fiches = await (await antor.request.get(api('/fiches?type=lieu'))).json();
  fichePort = (fiches.fiches ?? fiches).find((f: Any) => f.titre === 'Port-Sel').id;
  const f = await (await antor.request.get(api(`/fiches/${fichePort}`))).json();
  descId = f.sections.find((s: Any) => s.titre === 'Description').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const ouvrirPanneau = async (nom: string) => {
  await antor.goto(`/univers/${uid}/mediatheque`);
  await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await antor.waitForLoadState('networkidle');
  await antor.locator('.med-tuile').filter({ has: antor.locator(`[title="${nom}"]`) }).click();
  await antor.locator('.med-panneau').waitFor();
  // The body only exists once the detail answered: wait for that state before any count()/innerText().
  await antor.locator('.med-panneau .med-corps').waitFor();
  await antor.waitForLoadState('networkidle');
};

test('document : « Document PDF » et « Télécharger » dans l’aperçu ; image : aucun « Télécharger »', opts, async () => {
  const r = await antor.request.post(api('/fichiers'), { multipart: { fichier: PDF('tarifs-rev.pdf') } });
  assert.ok(r.ok(), await r.text());
  await ouvrirPanneau('tarifs-rev.pdf');
  const apercu = antor.locator('.med-panneau .med-apercu-document');
  assert.equal(await apercu.count(), 1);
  assert.match(norm(await apercu.innerText()), /Document PDF/);
  const lien = apercu.getByRole('link', { name: 'Télécharger' });
  assert.equal(await lien.count(), 1);
  assert.equal(await antor.locator('.med-panneau').getByRole('link', { name: 'Télécharger' }).count(), 1, 'pas de doublon');
  assert.equal(await lien.getAttribute('download'), 'tarifs-rev.pdf');
  const [dl] = await Promise.all([antor.waitForEvent('download'), lien.click()]);
  assert.equal(dl.suggestedFilename(), 'tarifs-rev.pdf');

  await ouvrirPanneau('Carte des Sphères');
  assert.equal(await antor.locator('.med-panneau .med-apercu-document').count(), 0);
  // maquette #etat-image: an image panel has no « Télécharger » at all
  assert.equal(await antor.locator('.med-panneau').getByRole('link', { name: 'Télécharger' }).count(), 0);
  assert.equal(await antor.locator('.med-panneau .med-apercu-document a').count(), 0);
});

test('image : le nom n’est pas décalé par un retrait et le crayon de renommage est un bouton icône sans contour', opts, async () => {
  await ouvrirPanneau('Carte des Sphères');
  const nom = antor.locator('.med-panneau .med-nom-en-place');
  assert.equal(await nom.evaluate((e: Element) => getComputedStyle(e).paddingLeft), '0px');
  const crayon = antor.locator('.med-panneau').getByRole('button', { name: 'Renommer le fichier' });
  assert.equal(await crayon.count(), 1);
  assert.equal(await crayon.evaluate((e: Element) => getComputedStyle(e).borderTopWidth), '0px');
  await crayon.click();
  assert.equal(await nom.evaluate((e: Element) => document.activeElement === e), true, 'le crayon met le nom en saisie');
});

test('document : la ligne de métadonnées dit PDF (extension du nom), jamais OCTET-STREAM', opts, async () => {
  const r = await antor.request.post(api('/fichiers'), { multipart: { fichier: PDF('meta-ext.pdf') } });
  assert.ok(r.ok(), await r.text());
  await ouvrirPanneau('meta-ext.pdf');
  const meta = norm(await antor.locator('.med-panneau .med-meta-ligne').innerText());
  assert.match(meta, /^PDF \d/, meta);
  assert.doesNotMatch(meta, /OCTET/i);
});

test('image sans extension : la ligne de métadonnées retombe sur le type MIME', opts, async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const r = await antor.request.post(api('/fichiers'), { multipart: { fichier: { name: 'sans-ext', mimeType: 'image/png', buffer: png } } });
  assert.ok(r.ok(), await r.text());
  await ouvrirPanneau('sans-ext');
  const meta = norm(await antor.locator('.med-panneau .med-meta-ligne').innerText());
  assert.match(meta, /^PNG \d/, meta);
});

test('« Utilisé dans » : texte + joint dans la même section = deux lignes ; joint seul ne dit pas « dans le texte » ; illustration', opts, async () => {
  // text link + attachment of the same file in « Description » of Port-Sel
  const t = await antor.request.post(api('/fichiers'), { multipart: { section: String(descId), maniere: 'joint', fichier: PDF('double-usage.pdf') } });
  assert.ok(t.ok(), await t.text());
  const corps = await t.json();
  const id = corps.id ?? corps.fichier?.id;
  assert.ok(id, 'id du fichier');
  const sec = (await (await antor.request.get(api(`/fiches/${fichePort}`))).json()).sections.find((s: Any) => s.id === descId);
  const e = await antor.request.put(api(`/fiches/${fichePort}/sections/${descId}/contenu`), {
    data: { contenu: `${sec.contenu ?? ''}\n\n[double-usage.pdf](fichier:${id})\n`, version: sec.version },
  });
  assert.ok(e.ok(), await e.text());
  await ouvrirPanneau('double-usage.pdf');
  const lignes: string[] = (await antor.locator('.med-panneau a[href*="fiche"]').allInnerTexts()).map(norm);
  const port = lignes.filter((l) => l.includes('Port-Sel'));
  assert.equal(port.length, 1, JSON.stringify(lignes));
  assert.match(port[0], /« Description » \(dans le texte\)/);
  assert.match(port[0], /Pièces jointes de « Description »/);
  assert.doesNotMatch(port[0], /\(jointe\)/);

  // joint only (Léa's seeded « Carte des Sphères » is attached to Aldric's Apparence)
  await ouvrirPanneau('Carte des Sphères');
  const l2: string[] = (await antor.locator('.med-panneau a[href*="fiche"]').allInnerTexts()).map(norm);
  const aldric = l2.find((l) => l.includes('Maître Aldric')) ?? '';
  assert.match(aldric, /Pièces jointes de « Apparence »/, JSON.stringify(l2));
  assert.doesNotMatch(aldric, /dans le texte/);
  assert.ok(l2.some((l) => /Port-Sel.*\(illustration\)/.test(l) && !/« /.test(l)), JSON.stringify(l2));
  assert.ok(l2.some((l) => /Val-Fortin.*« Description » \(dans le texte\)/.test(l)), JSON.stringify(l2));
});

test('la boîte « Réserver au MJ » garde ses libellés d’origine', opts, async () => {
  await ouvrirPanneau('Carte des Sphères');
  await antor.getByText('Réservé au MJ', { exact: true }).click();
  const boite = antor.getByRole('alertdialog');
  await boite.waitFor();
  const t = norm(await boite.innerText());
  assert.match(t, /Val-Fortin — « ?Description ?»/);
  assert.match(t, /Maître Aldric — « ?Apparence ?» \(jointe\)/);
  await boite.getByRole('button', { name: 'Annuler' }).click();
});
