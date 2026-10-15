// Browser check of E-19 (kanevas-mediatheque-ecran), after the exit criterion of the task.
//
// TEST PLAN (literal expectations from the criterion / docs/ecrans.md)
//   nominal   : filter Images + Non utilisés -> « Plan secret de la Guilde » with « MJ seul »; rename without toast
//   échec     : empty name -> « Erreur : le nom est obligatoire. »; 0-byte file -> « « notes.txt » est vide. »
//   réserver  : box lists the 3 usages; Annuler changes nothing; confirming gives the toast
//   supprimer : box lists the 3 sheets; toast « Fichier supprimé. »
//   exclusions: Léa sees no hidden file, no add/toggle/delete; forced address -> « Page introuvable. »
//   états     : offline banner + disabled actions; slow upload shows « Envoi… » + Annuler, adds nothing; drop veil
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const ouvrir = async (p: Any) => {
  await p.goto(`/univers/${uid}/mediatheque`);
  await p.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await p.waitForLoadState('networkidle');
};
const tuile = (p: Any, nom: string) => p.locator('.med-tuile').filter({ has: p.locator(`[title="${nom}"]`) });
const ouvrirFichier = async (p: Any, nom: string) => {
  await tuile(p, nom).click();
  await p.getByRole('complementary').or(p.locator('.med-panneau')).first().waitFor();
};

test('barre : « Médiathèque » est sous « Cartes »', opts, async () => {
  await antor.goto(`/univers/${uid}`);
  const liens: string[] = await antor.locator('nav a').allInnerTexts();
  const t = liens.map((s) => s.trim());
  assert.equal(t.indexOf('Médiathèque'), t.indexOf('Cartes') + 1, JSON.stringify(t));
});

test('Antor filtre Images puis Non utilisés : seul « Plan secret de la Guilde », pastille MJ seul', opts, async () => {
  await ouvrir(antor);
  await antor.locator('label', { hasText: /^Images$/ }).click();
  await antor.getByLabel('Usage').selectOption({ label: 'Non utilisés' });
  await antor.waitForLoadState('networkidle');
  await antor.locator('.med-tuile').first().waitFor();
  const noms: string[] = await antor.locator('.med-tuile .med-nom').allInnerTexts();
  assert.ok(noms.includes('Plan secret de la Guilde'), JSON.stringify(noms));
  assert.ok(!noms.includes('Carte des Sphères'), JSON.stringify(noms));
  assert.match(await tuile(antor, 'Plan secret de la Guilde').innerText(), /MJ seul/);
  await antor.screenshot({ path: '/tmp/scr/filtre.png' });
});

test('renommer sans toast ; nom vide : « Erreur : le nom est obligatoire. »', opts, async () => {
  await ouvrir(antor);
  await ouvrirFichier(antor, 'port-sel-quais.webp');
  const champ = antor.getByRole('textbox', { name: /Nom/ }).first();
  await champ.fill('Quais de Port-Sel');
  await champ.blur();
  await antor.waitForLoadState('networkidle');
  await tuile(antor, 'Quais de Port-Sel').waitFor();
  assert.equal(await antor.getByRole('status').filter({ hasText: /Fichier/ }).count(), 0, 'pas de toast');
  await champ.fill('');
  await champ.blur();
  await antor.getByText('Erreur : le nom est obligatoire.').waitFor();
  await champ.fill('x'.repeat(201));
  await champ.blur();
  await antor.getByText('Erreur : 200 caractères au plus.').waitFor();
  await antor.screenshot({ path: '/tmp/scr/panneau-nom.png' });
});

test('réserver « Carte des Sphères » : la boîte liste les trois usages ; Annuler ne change rien ; toast', opts, async () => {
  await ouvrir(antor);
  await ouvrirFichier(antor, 'Carte des Sphères');
  await antor.getByText('Réservé au MJ', { exact: true }).click();
  const boite = antor.getByRole('alertdialog');
  await boite.waitFor();
  const t = (await boite.innerText()).replace(/[’]/g, "'");
  assert.match(t, /Val-Fortin — « ?Description ?»/);
  assert.match(t, /Maître Aldric — « ?Apparence ?» \(jointe\)/);
  assert.match(t, /Port-Sel/);
  await antor.screenshot({ path: '/tmp/scr/reserver.png' });
  await boite.getByRole('button', { name: 'Annuler' }).click();
  await antor.waitForLoadState('networkidle');
  assert.equal(await tuile(antor, 'Carte des Sphères').locator('.pastille').count(), 0, 'toujours visible');
  assert.equal((await antor.request.get(`/api/univers/${uid}/fichiers`).then((r: Any) => r.json())).fichiers.find((f: Any) => f.nom === 'Carte des Sphères').visibilite, 'joueurs');
  await antor.getByText('Réservé au MJ', { exact: true }).click();
  await antor.getByRole('alertdialog').getByRole('button', { name: 'Réserver au MJ' }).click();
  await antor.getByText('Fichier réservé au MJ.').waitFor();
  assert.match(await tuile(antor, 'Carte des Sphères').innerText(), /MJ seul/);
});

test('rendre visible : sans toast', opts, async () => {
  await ouvrir(antor);
  await ouvrirFichier(antor, 'Carte des Sphères');
  await antor.getByText('Visible des joueurs', { exact: true }).click();
  await tuile(antor, 'Carte des Sphères').locator('.pastille').waitFor({ state: 'detached' });
  assert.equal(await tuile(antor, 'Carte des Sphères').locator('.pastille').count(), 0);
  assert.equal(await antor.getByText(/^Fichier (réservé|rendu)/).count(), 0);
});

test('Léa : ni fichier mj des autres, ni ajout, ni bascule, ni Supprimer ; adresse mj : Page introuvable', opts, async () => {
  const api = await lea.request.get(`/api/univers/${uid}/fichiers?limite=500`).then((r: Any) => r.json());
  const mj = (await antor.request.get(`/api/univers/${uid}/fichiers`).then((r: Any) => r.json())).fichiers.find((f: Any) => f.nom === 'Plan secret de la Guilde');
  await ouvrir(lea);
  const t = await texte(lea);
  assert.ok(!t.includes('Plan secret de la Guilde'), 'fichier mj visible');
  assert.ok(!t.includes('MJ seul'), 'pastille MJ');
  assert.equal(await lea.getByRole('button', { name: /Ajouter des fichiers/ }).count(), 0);
  await lea.locator('.med-tuile').first().click();
  await lea.waitForLoadState('networkidle');
  assert.equal(await lea.getByText('Réservé au MJ', { exact: true }).count(), 0);
  assert.equal(await lea.getByRole('button', { name: /Supprimer/ }).count(), 0);
  assert.equal(await lea.locator('input[type=file]').count(), 0, 'pas de sélecteur de fichier');
  assert.ok(Array.isArray(api.fichiers));
  await lea.goto(`/univers/${uid}/mediatheque?fichier=${mj.id}`);
  await lea.getByText('Page introuvable.').waitFor();
  await lea.screenshot({ path: '/tmp/scr/lea.png' });
});

test('supprimer « Carte des Sphères » : la boîte liste les trois fiches, toast', opts, async () => {
  await ouvrir(antor);
  await ouvrirFichier(antor, 'Carte des Sphères');
  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  const boite = antor.getByRole('alertdialog');
  const t = (await boite.innerText()).replace(/[’]/g, "'");
  assert.match(t, /3 fiches/);
  for (const m of [/Port-Sel/, /Val-Fortin/, /Maître Aldric/]) assert.match(t, m);
  await antor.screenshot({ path: '/tmp/scr/supprimer.png' });
  await boite.getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByText('Fichier supprimé.').waitFor();
  assert.equal(await tuile(antor, 'Carte des Sphères').count(), 0);
});

test('ajout de deux fichiers dont un de 0 octet ; « notes.txt » est vide.', opts, async () => {
  await ouvrir(antor);
  const avant = (await antor.request.get(`/api/univers/${uid}/fichiers`).then((r: Any) => r.json())).fichiers.length;
  await antor.locator('input[type=file]').first().setInputFiles([
    { name: 'rapport.png', mimeType: 'image/png', buffer: PNG },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
  ]);
  await antor.getByText('« notes.txt » est vide.'.replace(/'/g, '’')).or(antor.getByText('« notes.txt » est vide.')).first().waitFor();
  await antor.locator('.med-tuile').filter({ hasText: 'rapport' }).waitFor();
  const liste = (await antor.request.get(`/api/univers/${uid}/fichiers`).then((r: Any) => r.json())).fichiers;
  assert.equal(liste.length, avant + 1);
  const ajoute = liste.find((f: Any) => f.nom === 'rapport.png' || f.nom === 'rapport');
  assert.ok(ajoute, JSON.stringify(liste.map((f: Any) => f.nom)));
  assert.equal(ajoute.visibilite, 'joueurs', 'ajout depuis la médiathèque : visible des joueurs');
  await antor.screenshot({ path: '/tmp/scr/ajout.png' });
});

test('Documents : un PDF de 2,4 Mo dit « 2,4 Mo » et « Document PDF »', opts, async () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2_516_582 - 9, 0x20), Buffer.from('\n%%EOF\n')]);
  await ouvrir(antor);
  await antor.locator('input[type=file]').first().setInputFiles({ name: 'guide.pdf', mimeType: 'application/pdf', buffer: pdf });
  await antor.waitForLoadState('networkidle');
  await antor.locator('label', { hasText: /^Documents$/ }).click();
  await antor.waitForLoadState('networkidle');
  const tu = antor.locator('.med-tuile').filter({ hasText: 'guide' });
  await tu.waitFor();
  const tt = await tu.textContent();
  assert.match(tt, /2,4 Mo/);
  assert.match(tt, /PDF/);
  await tu.click();
  await antor.getByText('Document PDF').first().waitFor();
  await antor.getByRole('link', { name: /Télécharger/ }).or(antor.getByRole('button', { name: /Télécharger/ })).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/document.png' });
});

test('envoi long : « Envoi… » + pourcentage + Annuler, qui n\'ajoute rien', opts, async () => {
  await ouvrir(antor);
  const avant = (await antor.request.get(`/api/univers/${uid}/fichiers`).then((r: Any) => r.json())).fichiers.length;
  await antor.route('**/api/univers/*/fichiers', async (route: Any) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((r) => setTimeout(r, 15000)).catch(() => undefined);
    await route.abort().catch(() => undefined);
  });
  const gros = Buffer.concat([PNG, Buffer.alloc(2_400_000, 1)]);
  await antor.locator('input[type=file]').first().setInputFiles({ name: 'lent.png', mimeType: 'image/png', buffer: gros });
  const ligne = antor.getByRole('status').filter({ hasText: /Envoi…/ });
  await ligne.waitFor();
  assert.match(await ligne.innerText(), /lent.*Envoi… \d+ %/s);
  await antor.screenshot({ path: '/tmp/scr/envoi.png' });
  await ligne.getByRole('button', { name: 'Annuler' }).click();
  await antor.waitForTimeout(500);
  await antor.unroute('**/api/univers/*/fichiers');
  const apres = (await antor.request.get(`/api/univers/${uid}/fichiers`).then((r: Any) => r.json())).fichiers.length;
  assert.equal(apres, avant);
  assert.equal(await antor.getByText(/Envoi…/).count(), 0);
});

test('glisser un fichier au-dessus de la grille : voile de dépôt', opts, async () => {
  await ouvrir(antor);
  await antor.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
    const cible = document.querySelector('.mediatheque') as HTMLElement;
    cible.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    cible.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
  });
  await antor.getByText('Déposez les fichiers pour les ajouter.').waitFor();
  await antor.screenshot({ path: '/tmp/scr/voile.png' });
});

test('connexion coupée : le bandeau, actions désactivées', opts, async () => {
  await ouvrir(antor);
  await ouvrirFichier(antor, 'Lames Grises');
  await antor.getByRole('button', { name: 'Supprimer le fichier' }).waitFor();
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  await antor.getByText(/Connexion perdue/).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/offline.png' });
  assert.ok(await antor.getByRole('button', { name: /Ajouter des fichiers/ }).first().isDisabled(), 'ajout actif');
  assert.ok(await antor.getByRole('button', { name: 'Supprimer le fichier' }).isDisabled(), 'suppression active');
  const radios = antor.getByRole('radiogroup', { name: 'Visibilité' }).locator('input');
  assert.equal(await radios.count(), 2);
  assert.ok(await radios.nth(0).isDisabled() && await radios.nth(1).isDisabled(), 'bascule de visibilité active');
  await antor.screenshot({ path: '/tmp/scr/offline.png' });
  await antor.context().setOffline(false);
  await antor.evaluate(() => window.dispatchEvent(new Event('online')));
});

test('téléphone 390 px : le panneau est plein écran', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await ouvrir(antor);
  await tuile(antor, 'Lames Grises').click();
  await antor.getByRole('button', { name: 'Supprimer le fichier' }).waitFor();
  const r = await antor.locator('.med-panneau').first().evaluate((e: Element) => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y }; });
  assert.ok(r.w >= 385 && r.x <= 2, JSON.stringify(r));
  assert.ok(r.h >= 700, JSON.stringify(r));
  await antor.screenshot({ path: '/tmp/scr/tel.png' });
  await antor.setViewportSize({ width: 1280, height: 800 });
});

test('médiathèque vide (univers neuf) : les textes de la table d’états', opts, async () => {
  await antor.goto('/');
  const id = (await (await antor.request.post('/api/univers', { data: { nom: 'Vide E19', description: '' } })).json()).id;
  await antor.goto(`/univers/${id}/mediatheque`);
  await antor.getByText('Aucun fichier pour l’instant. Ajoutez-en, ou posez-en un dans une fiche.').waitFor();
  assert.ok(await antor.getByRole('button', { name: 'Ajouter des fichiers' }).count() >= 1);
  await antor.getByRole('searchbox').fill('zzz');
  await antor.getByText('Aucun fichier ne correspond.').waitFor();
});

test('réouverture : pas de « Médiathèque › Médiathèque », panneau avec réserve basse, pastille opaque', opts, async () => {
  await ouvrir(antor);
  const entete: string = await antor.locator('header, nav[aria-label*="riane" i]').allInnerTexts().then((a: string[]) => a.join(' '));
  assert.ok(!/Médiathèque\s*›\s*Médiathèque/.test(entete), entete);
  const fond = await tuile(antor, 'Plan secret de la Guilde').locator('.med-pastille .pastille').evaluate((e: Element) => getComputedStyle(e).backgroundColor);
  assert.ok(!/rgba\(.*,\s*0(\.\d+)?\)$/.test(fond) && fond !== 'transparent', fond);
  await ouvrirFichier(antor, 'Plan secret de la Guilde');
  const bas = await antor.locator('.med-panneau').evaluate((e: Element) => parseFloat(getComputedStyle(e).paddingBottom));
  assert.ok(bas >= 48, `padding-bottom ${bas}`);
  // Scrolled to the end, « Supprimer le fichier » must not sit under the floating assistant button.
  await antor.locator('.med-panneau').evaluate((e: Element) => { e.scrollTop = e.scrollHeight; });
  const sup = await antor.getByRole('button', { name: 'Supprimer le fichier' }).boundingBox();
  const flot = await antor.locator('button', { hasText: 'Demander à Kanevas' }).boundingBox();
  const chevauche = sup.x < flot.x + flot.width && sup.x + sup.width > flot.x && sup.y < flot.y + flot.height && sup.y + sup.height > flot.y;
  assert.ok(!chevauche, `Supprimer ${JSON.stringify(sup)} sous le bouton ${JSON.stringify(flot)}`);
});

test('réouverture 3 : libellés « Visibilité » et « Usage » visibles, icône de tri et d’envoi, rien ne déborde à 390 px', opts, async () => {
  const p = antor;
  await p.setViewportSize({ width: 390, height: 844 });
  await ouvrir(p);
  for (const lib of ['Visibilité', 'Usage']) {
    const b = await p.locator('.med-filtres .lib-champ', { hasText: new RegExp(`^${lib}$`) }).boundingBox();
    assert.ok(b && b.width > 20 && b.height > 8, `${lib} visible : ${JSON.stringify(b)}`);
  }
  assert.equal(await p.locator('.med-ordre > svg').count(), 1, 'icône de tri');
  assert.equal(await p.getByRole('button', { name: 'Ajouter des fichiers' }).locator('svg').count(), 1, 'icône d’envoi');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'pas de défilement horizontal');
  const sel = await p.locator('.med-ordre select').evaluate((e: Any) => e.scrollWidth <= e.clientWidth);
  assert.ok(sel, 'libellé d’ordre non coupé');
  await p.setViewportSize({ width: 1280, height: 800 });
});
