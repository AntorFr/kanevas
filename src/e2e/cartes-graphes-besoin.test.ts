// Black-box tests of kanevas-cartes-graphes written from the need (docs/parcours.md B-12 (carte), B-22,
// B-23, B-29 ; P-3 step 6, P-6 step 3, P-9 ; docs/ecrans.md "Détail des écrans de kanevas-cartes-graphes"
// : E-10, E-11, bloc « Cartes visibles » de E-3), not from the code. Expected values are literals taken
// from those docs. Real server in stub mode + real Chromium (same harness as the other e2e files). The
// world is arranged through the API (fast); what is checked is read on screen as the user sees it, and
// in the API payload when the need forbids a leak the screen would hide.
// Screenshots (proofs of the moment) go to CAPTURES, outside the tracked tree.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, texte as texteBrut, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/kanevas-captures';
mkdirSync(CAPTURES, { recursive: true });
const fixture = (n: string): Buffer => readFileSync(new URL(`./fixtures/cartes/${n}`, import.meta.url));
const PAYSAGE = fixture('paysage-brume.png');
const PORTRAIT = fixture('portrait-ambre.png');
const PDF = fixture('plan.pdf');
const VIDE = fixture('vide.png');

/** A valid grey PNG of the given size, built here so that the proportions are known (no fixture file). */
function pngDe(largeur: number, hauteur: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloc = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grey
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(largeur, 128)]);
  const brut = Buffer.concat(Array.from({ length: hauteur }, () => ligne));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut)),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

const BANDEAU =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";
const PAS_ABOUTI = "L'action n'a pas abouti. Réessayez.";
const PAS_IMAGE = "Erreur : ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP).";

let srv: Server;
let browser: Any;

/** Visible text of the page with whitespace collapsed (a link is drawn over several lines). */
const texte = async (page: Any): Promise<string> => (await texteBrut(page)).replace(/\s+/g, ' ');

async function api(page: Any, method: string, url: string, data?: unknown, ok = true): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  if (ok) assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json().catch(() => null);
}
const statut = async (page: Any, method: string, url: string, data?: unknown): Promise<number> =>
  (await page.request.fetch(srv.base + url, { method, data })).status();

async function capture(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true });
}

interface Monde {
  U: number;
  antor: Any;
  lea: Any;
  teo: Any;
  aldric: number;
  aldricApparence: number;
  ombres: number;
  ombresSecret: number;
  lames: number;
  lamesAlliances: number; // closed section carrying « allié de » -> ombres
  guilde: number;
  guildePresentation: number;
}

/**
 * Antor (MJ), Léa (Joueuse), Teo (no role). « Maître Aldric » (personnage): « Apparence » read by the
 * players. « Les Ombres de Fer » (faction): its only section is closed. « Les Lames Grises »: a readable
 * « Présentation », a closed « Alliances » carrying « allié de » -> Ombres, a readable « Rivalités »
 * carrying « rival de » -> Guilde. « La Guilde »: a readable « Présentation ».
 */
async function monde(nom: string): Promise<Monde> {
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const lea = (await connecte(browser, srv.base, 'Léa')).page;
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  const U = (await api(antor, 'POST', '/api/univers', { nom })).id;
  await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const fiche = (type: string, titre: string) =>
    api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, ...(type === 'personnage' ? { charge: { pj: false } } : {}) });
  const sec = async (f: number, titre: string, contenu: string, lisible: boolean) => {
    const base = `/api/univers/${U}/fiches/${f}/sections`;
    const s = await api(antor, 'POST', base, { titre, contenu });
    if (lisible) await api(antor, 'PATCH', `${base}/${s.id}`, { joueursLisent: true });
    return s.id as number;
  };
  const aldric = (await fiche('personnage', 'Maître Aldric')).id;
  const aldricApparence = await sec(aldric, 'Apparence', 'Grand, cape grise, regard dur.', true);
  const ombres = (await fiche('faction', 'Les Ombres de Fer')).id;
  const ombresSecret = await sec(ombres, 'Secret', 'Ils brûlent les archives.', false);
  const lames = (await fiche('faction', 'Les Lames Grises')).id;
  await sec(lames, 'Présentation', 'Une guilde de coursiers.', true);
  const lamesAlliances = await sec(lames, 'Alliances', 'Pacte avec les Ombres.', false);
  const lamesRivalites = await sec(lames, 'Rivalités', 'Contre la Guilde.', true);
  const guilde = (await fiche('faction', 'La Guilde')).id;
  const guildePresentation = await sec(guilde, 'Présentation', 'Marchands.', true);
  const rel = (f: number, s: number, cible: number, type: string) =>
    api(antor, 'POST', `/api/univers/${U}/fiches/${f}/sections/${s}/relations`, { cibleFicheId: cible, type });
  await rel(lames, lamesAlliances, ombres, 'allié de');
  await rel(lames, lamesRivalites, guilde, 'rival de');
  return { U, antor, lea, teo, aldric, aldricApparence, ombres, ombresSecret, lames, lamesAlliances, guilde, guildePresentation };
}

const urlCartes = (m: Monde) => `/api/univers/${m.U}/cartes`;
const carteApi = (m: Monde, forme: 'illustree' | 'graphe', titre: string, visible = false) =>
  api(m.antor, 'POST', urlCartes(m), { titre, forme }).then(async (c) => {
    if (visible) await api(m.antor, 'PATCH', `${urlCartes(m)}/${c.id}`, { visible: true });
    return c.id as number;
  });
const poser = (m: Monde, carte: number, ficheId: number, x?: number, y?: number) =>
  api(m.antor, 'POST', `${urlCartes(m)}/${carte}/elements`, { ficheId, ...(x === undefined ? {} : { x, y }) });

async function ouvrirCarte(page: Any, m: Monde, id: number): Promise<void> {
  await page.goto(`/univers/${m.U}/cartes/${id}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  await page.waitForTimeout(200);
}
async function ouvrirListe(page: Any, m: Monde): Promise<void> {
  await page.goto(`/univers/${m.U}/cartes`);
  await page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
  await attendre(page);
  await page.waitForTimeout(200);
}
const enTete = (page: Any, label: string) => page.getByRole('button', { name: rxExact(label) });
const liste = (page: Any) => page.getByRole('region', { name: rx('Sur la carte') });
/** Titles in the « Sur la carte » list, in order. */
const surLaCarte = async (page: Any): Promise<string[]> =>
  (await liste(page).getByRole('listitem').evaluateAll((els: HTMLElement[]) =>
    els.map((e) => (e.querySelector('a') as HTMLElement | null)?.innerText ?? e.innerText),
  )).map((t: string) => t.replace(/’/g, "'").trim());
const liens = async (page: Any): Promise<string[]> => {
  const r = page.getByRole('region', { name: rx('Liens') });
  if ((await r.count()) === 0) return [];
  return (await r.getByRole('listitem').allInnerTexts()).map((t: string) => t.replace(/\s+/g, ' ').replace(/’/g, "'").trim());
};

/** Opens the creation form of E-10 and fills it; the background goes through the file chooser. */
async function remplirCreation(page: Any, titre: string, forme: 'Carte illustrée' | 'Graphe', fond?: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const formulaire = page.getByRole('form', { name: rx('Nouvelle carte') });
  if ((await formulaire.count()) === 0) await page.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await formulaire.getByLabel('Titre', { exact: true }).fill(titre);
  await formulaire.getByRole('combobox', { name: rx('Forme') }).selectOption({ label: forme });
  if (fond) await formulaire.locator('input[type=file]').setInputFiles(fond);
}
const fichierPng = (buffer = PAYSAGE, name = 'brume.png') => ({ name, mimeType: 'image/png', buffer });

/** « Ajouter une fiche » (E-11): chooses the type, then clicks « Ajouter » on the row of `titre`. */
async function ajouterFiche(page: Any, type: string, titre: string): Promise<void> {
  await page.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
  const fenetre = page.getByRole('dialog', { name: rx('Ajouter une fiche') });
  await fenetre.getByLabel('Type de fiche').selectOption({ label: type });
  const ligne = fenetre.getByRole('listitem').filter({ hasText: rx(titre) });
  await ligne.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
  await fenetre.getByRole('button', { name: rxExact('Fermer') }).click();
  await fenetre.waitFor({ state: 'detached' });
}

/** The token or node of a fiche in the frame (not the « Sur la carte » and « Liens » lists, which are sections). */
const noeud = (page: Any, titre: string) => page.locator('main :is(a, button, [role=button], [role=link]):not(section *)').filter({ hasText: rx(titre) });

/** Collects every API response body seen by the page, to look for leaks the screen would hide. */
function espion(page: Any): { corps: () => Promise<string> } {
  const prises: Promise<string>[] = [];
  page.on('response', (r: Any) => {
    if (r.url().includes('/api/')) prises.push(r.text().catch(() => ''));
  });
  return { corps: async () => (await Promise.all(prises)).join('\n') };
}

describe('kanevas-cartes-graphes, du besoin', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // =========================== B-22 : poser une carte illustrée (E-10, E-11) ===========================
  describe('B-22 carte illustrée : création, fond, tokens', () => {
    let m: Monde;
    let carte = 0;
    before(async () => {
      m = await monde("Lame d'Ébène cartes");
    });

    // Si le fond choisi n'est pas envoyé avec « Créer », la carte naît sans fond ou ne naît pas.
    test('nominal : Antor crée « La ville de Brume » avec un fond, arrive sur la carte, non visible, fond servi', async () => {
      await ouvrirListe(m.antor, m);
      assert.ok((await texte(m.antor)).includes("Aucune carte pour l'instant. Créez-en une pour commencer."));
      await remplirCreation(m.antor, 'La ville de Brume', 'Carte illustrée', fichierPng());
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.waitForURL(new RegExp(`/univers/${m.U}/cartes/\\d+$`));
      await m.antor.getByRole('heading', { name: 'La ville de Brume', level: 1 }).waitFor();
      await attendre(m.antor);
      carte = Number(m.antor.url().split('/').pop());
      const t = await texte(m.antor);
      assert.ok(t.includes('Carte illustrée'));
      assert.ok(t.includes('MJ seul'));
      assert.ok(!t.includes('Visible des joueurs'));
      assert.ok(t.includes('Aucun token. Ajoutez une fiche pour la placer sur la carte.'));
      assert.equal(await enTete(m.antor, 'Changer le fond').count(), 1);
      assert.equal(await enTete(m.antor, 'Ajouter un fond').count(), 0);
      const r = await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${carte}/fond`);
      assert.equal(r.status(), 200);
      assert.equal(r.headers()['content-type'], 'image/png');
      assert.deepEqual(Buffer.from(await r.body()), PAYSAGE);
      await capture(m.antor, 'b22-creation-carte-illustree');
    });

    // Si la carte créée par l'écran naissait visible, Léa la verrait tout de suite.
    test('exclusion : la carte créée est invisible de Léa, dans sa liste comme à son adresse', async () => {
      await ouvrirListe(m.lea, m);
      assert.ok(!(await texte(m.lea)).includes('La ville de Brume'));
      assert.ok((await texte(m.lea)).includes("Aucune carte n'est visible pour l'instant."));
      assert.equal(await statut(m.lea, 'GET', `${urlCartes(m)}/${carte}`), 404);
      assert.equal(await statut(m.lea, 'GET', `${urlCartes(m)}/${carte}/fond`), 404);
    });

    // Si le token n'apparaît pas au centre ou n'est pas enregistré, la carte rechargée ne le montre pas.
    test('nominal : Antor place Aldric et la faction secrète, au centre, et les voit dans « Sur la carte »', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await ajouterFiche(m.antor, 'Personnage', 'Maître Aldric');
      await ajouterFiche(m.antor, 'Faction', 'Les Ombres de Fer');
      await ouvrirCarte(m.antor, m, carte);
      assert.deepEqual((await surLaCarte(m.antor)).sort(), ['Les Ombres de Fer', 'Maître Aldric']);
      assert.equal(await noeud(m.antor, 'Maître Aldric').count(), 1);
      assert.equal(await noeud(m.antor, 'Les Ombres de Fer').count(), 1);
      const lue = await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`);
      const aldric = lue.elements.find((e: Any) => e.ficheId === m.aldric);
      assert.equal(aldric.x, 50);
      assert.equal(aldric.y, 50);
      // Both tokens are born at the centre: the secret one is set aside so that later tests can click Aldric.
      const ombres = lue.elements.find((e: Any) => e.ficheId === m.ombres);
      await api(m.antor, 'PATCH', `${urlCartes(m)}/${carte}/elements/${ombres.id}`, { x: 20, y: 20 });
      await capture(m.antor, 'b22-tokens-places');
    });

    // Si la fenêtre propose « Ajouter » pour une fiche déjà placée, la même fiche se pose deux fois.
    test('bord : une fiche déjà sur la carte porte « Déjà sur la carte » et aucun bouton', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
      const fenetre = m.antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
      await fenetre.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
      const ligne = fenetre.getByRole('listitem').filter({ hasText: rx('Maître Aldric') });
      await ligne.waitFor();
      assert.ok((await ligne.innerText()).includes('Déjà sur la carte'));
      assert.equal(await ligne.getByRole('button').count(), 0);
      await fenetre.getByRole('button', { name: rxExact('Fermer') }).click();
    });

    // Si les flèches ne déplacent pas d'un pour cent (cinq avec Maj) ou si la position n'est pas enregistrée.
    test('nominal : Antor déplace le token d\'Aldric au clavier (3 x 1 %, puis Maj 5 %) et la position survit au rechargement', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await noeud(m.antor, 'Maître Aldric').click();
      assert.ok((await texte(m.antor)).includes('Maître Aldric · Personnage'));
      for (let i = 0; i < 3; i++) await m.antor.keyboard.press('ArrowRight');
      await m.antor.keyboard.press('Shift+ArrowDown');
      await attendre(m.antor);
      await m.antor.waitForTimeout(400);
      await ouvrirCarte(m.antor, m, carte);
      const lue = await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`);
      const aldric = lue.elements.find((e: Any) => e.ficheId === m.aldric);
      assert.equal(aldric.x, 53);
      assert.equal(aldric.y, 55);
    });

    // Si le glisser à la souris ne déplace pas le token d'une distance proportionnelle, ou ne s'enregistre pas.
    test('nominal et bord : Antor glisse le token d\'Aldric de 100 px à la souris, la position suit et survit au rechargement ; hors du cadre, elle est ramenée au bord', async () => {
      await ouvrirCarte(m.antor, m, carte);
      const jeton = noeud(m.antor, 'Maître Aldric');
      const cadre = await jeton.evaluate((e: HTMLElement) => {
        const r = (e.offsetParent as HTMLElement).getBoundingClientRect();
        return { w: r.width, h: r.height, x: r.x, y: r.y };
      });
      const avant = (await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).elements.find((e: Any) => e.ficheId === m.aldric);
      const b = (await jeton.boundingBox())!;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      await m.antor.mouse.move(cx, cy);
      await m.antor.mouse.down();
      await m.antor.mouse.move(cx + 50, cy, { steps: 5 });
      await m.antor.mouse.move(cx + 100, cy, { steps: 5 });
      await m.antor.mouse.up();
      await attendre(m.antor);
      await m.antor.waitForTimeout(400);
      const apres = (await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).elements.find((e: Any) => e.ficheId === m.aldric);
      const attendu = avant.x + (100 / cadre.w) * 100;
      assert.ok(Math.abs(apres.x - attendu) < 1.5, `x ${apres.x}, attendu ${attendu}`);
      assert.ok(Math.abs(apres.y - avant.y) < 1.5, `y ${apres.y}, avant ${avant.y}`);
      // Dropped far outside the frame: brought back to the edge, never beyond.
      const b2 = (await noeud(m.antor, 'Maître Aldric').boundingBox())!;
      await m.antor.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
      await m.antor.mouse.down();
      await m.antor.mouse.move(cadre.x + cadre.w + 300, cadre.y - 200, { steps: 8 });
      await m.antor.mouse.up();
      await attendre(m.antor);
      await m.antor.waitForTimeout(400);
      const bord = (await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).elements.find((e: Any) => e.ficheId === m.aldric);
      assert.equal(bord.x, 100);
      assert.equal(bord.y, 0);
      await api(m.antor, 'PATCH', `${urlCartes(m)}/${carte}/elements/${bord.id}`, { x: 53, y: 55 });
    });

    // Si le panneau du token sélectionné n'ouvre pas la fiche.
    test('nominal : le clic sur un token ouvre « Maître Aldric · Personnage » avec « Ouvrir la fiche », qui mène à la fiche', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await noeud(m.antor, 'Maître Aldric').click();
      assert.ok((await texte(m.antor)).includes('Maître Aldric · Personnage'));
      assert.equal(await m.antor.getByRole('button', { name: rxExact('Retirer de la carte') }).count() >= 1, true);
      await m.antor.getByRole('link', { name: rxExact('Ouvrir la fiche') }).click();
      await m.antor.waitForURL(new RegExp(`/univers/${m.U}/fiche/${m.aldric}$`));
    });

    // Si le retrait ne demande pas de confirmation, un clic de trop retire le token.
    test('bord : « Retirer de la carte » demande confirmation, « Annuler » garde le token, confirmer le retire, la fiche reste', async () => {
      const c = await carteApi(m, 'illustree', 'Carte à retirer');
      await poser(m, c, m.aldric, 20, 20);
      await ouvrirCarte(m.antor, m, c);
      await liste(m.antor).getByRole('button', { name: rxExact('Retirer de la carte') }).click();
      assert.ok((await texte(m.antor)).includes('Retirer « Maître Aldric » de cette carte ? La fiche reste.'));
      assert.deepEqual(await surLaCarte(m.antor), ['Maître Aldric']);
      await m.antor.getByRole('button', { name: rxExact('Annuler') }).click();
      assert.deepEqual(await surLaCarte(m.antor), ['Maître Aldric']);
      await liste(m.antor).getByRole('button', { name: rxExact('Retirer de la carte') }).click();
      await m.antor.getByRole('button', { name: rxExact('Retirer de la carte') }).last().click();
      await attendre(m.antor);
      await m.antor.waitForFunction(() => document.body.innerText.includes('Aucun token.'));
      assert.deepEqual((await api(m.antor, 'GET', `${urlCartes(m)}/${c}`)).elements, []);
      assert.equal(await statut(m.antor, 'GET', `/api/univers/${m.U}/fiches/${m.aldric}`), 200);
    });

    // Si un fond refusé écrase l'ancien, ou si choisir l'image n'envoie pas aussitôt.
    test('échec puis nominal : « plan.pdf » est refusé et le fond reste ; une image choisie remplace le fond aussitôt', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.locator('input[type=file]').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: PDF });
      await m.antor.getByText(rx(PAS_IMAGE)).waitFor();
      let r = await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${carte}/fond`);
      assert.deepEqual(Buffer.from(await r.body()), PAYSAGE);
      await m.antor.locator('input[type=file]').setInputFiles(fichierPng(PORTRAIT, 'portrait.png'));
      await attendre(m.antor);
      await m.antor.waitForTimeout(400);
      r = await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${carte}/fond`);
      assert.deepEqual(Buffer.from(await r.body()), PORTRAIT);
    });

    // Si le renommage n'est pas pris, ou si un titre trop long passe.
    test('nominal et bord : Antor renomme la carte ; 81 caractères sont refusés', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('button', { name: rxExact('Renommer') }).click();
      const champ = m.antor.getByRole('textbox').first();
      await champ.fill('x'.repeat(81));
      await m.antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
      await m.antor.getByText(rx('Erreur : 80 caractères au plus.')).waitFor();
      await champ.fill('La ville de Brume (v2)');
      await m.antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
      await m.antor.getByRole('heading', { name: 'La ville de Brume (v2)', level: 1 }).waitFor();
      assert.equal((await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).carte.titre, 'La ville de Brume (v2)');
    });
  });

  describe('E-10 création : bords et échecs', () => {
    let m: Monde;
    before(async () => {
      m = await monde("Lame d'Ébène création");
      await ouvrirListe(m.antor, m);
    });

    // Si le titre vide est accepté.
    test('échec : titre vide, « Erreur : le titre est obligatoire. », rien n\'est créé', async () => {
      await remplirCreation(m.antor, '', 'Carte illustrée');
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.getByText(rx('Erreur : le titre est obligatoire.')).waitFor();
      assert.equal(m.antor.url().includes('/cartes/'), false);
    });

    // Si la borne des 80 caractères est mal placée (81 accepté ou 80 refusé).
    test('bords : 81 caractères refusés, 80 acceptés', async () => {
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'x'.repeat(81), 'Carte illustrée');
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.getByText(rx('Erreur : 80 caractères au plus.')).waitFor();
      await m.antor.getByLabel('Titre', { exact: true }).fill('y'.repeat(80));
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.waitForURL(new RegExp(`/univers/${m.U}/cartes/\\d+$`));
      await m.antor.getByRole('heading', { level: 1 }).waitFor();
      assert.ok((await texte(m.antor)).includes('y'.repeat(80)));
    });

    // Si un PDF ou un fichier vide est accepté comme fond.
    test('échecs : « plan.pdf » et un PNG vide sont refusés, aucune carte créée', async () => {
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'Carte au PDF', 'Carte illustrée', { name: 'plan.pdf', mimeType: 'application/pdf', buffer: PDF });
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.getByText(rx(PAS_IMAGE)).waitFor();
      await remplirCreation(m.antor, 'Carte au PDF', 'Carte illustrée', { name: 'vide.png', mimeType: 'image/png', buffer: VIDE });
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.getByText(rx(PAS_IMAGE)).waitFor();
      const liste = await api(m.antor, 'GET', urlCartes(m));
      assert.ok(!JSON.stringify(liste).includes('Carte au PDF'));
      await capture(m.antor, 'e10-fond-refuse');
    });

    // Si l'échec de création perd la saisie.
    test('échec : une création qui échoue dit « La carte n\'a pas pu être créée. Réessayez. » et garde la saisie', async () => {
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'Carte en panne', 'Graphe');
      await m.antor.route('**/api/univers/*/cartes', (r: Any) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.getByText(rx("La carte n'a pas pu être créée. Réessayez.")).waitFor();
      assert.equal(await m.antor.getByLabel('Titre', { exact: true }).inputValue(), 'Carte en panne');
      await m.antor.unroute('**/api/univers/*/cartes');
    });

    // Si le choix « Graphe » laisse proposer une image de fond.
    test('bord : pour un graphe, le formulaire ne propose pas d\'image de fond', async () => {
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'Un graphe', 'Graphe');
      assert.equal(await m.antor.getByRole('form', { name: rx('Nouvelle carte') }).locator('input[type=file]').count(), 0);
      assert.ok(!(await texte(m.antor)).includes('Image de fond'));
    });

    // Si « Annuler » laisse le formulaire ouvert.
    test('bord : « Annuler » ferme le formulaire', async () => {
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'Rien', 'Carte illustrée');
      await m.antor.getByRole('button', { name: rxExact('Annuler') }).click();
      assert.equal(await m.antor.getByRole('form', { name: rx('Nouvelle carte') }).count(), 0);
    });

    // Si un compte sans rôle ou le joueur peut créer une carte.
    test('exclusions : Léa n\'a pas « Nouvelle carte » ; Teo (sans rôle) lit « Page introuvable. »', async () => {
      await ouvrirListe(m.lea, m);
      assert.equal(await m.lea.getByRole('button', { name: rx('Nouvelle carte') }).count(), 0);
      await m.teo.goto(`/univers/${m.U}/cartes`);
      await attendre(m.teo);
      const t = await texte(m.teo);
      assert.ok(t.includes('Page introuvable.'));
      assert.ok(t.includes('Mes univers'));
      assert.equal(await statut(m.teo, 'GET', urlCartes(m)), 404);
      const admin = (await connecte(browser, srv.base, 'Admin')).page;
      await admin.goto(`/univers/${m.U}/cartes`);
      await attendre(admin);
      assert.ok((await texte(admin)).includes('Page introuvable.'));
      assert.equal(await statut(admin, 'GET', urlCartes(m)), 404);
    });

    // Si la limite de 25 Mo est mal appliquée ou sans message.
    test('bord : une image de plus de 25 Mo est refusée « Erreur : l\'image dépasse 25 Mo. »', async () => {
      await ouvrirListe(m.antor, m);
      const gros = Buffer.concat([PAYSAGE, Buffer.alloc(26 * 1024 * 1024)]);
      await remplirCreation(m.antor, 'Carte trop lourde', 'Carte illustrée', fichierPng(gros, 'gros.png'));
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.getByText(rx("Erreur : l'image dépasse 25 Mo.")).waitFor({ timeout: 30000 });
      assert.ok(!JSON.stringify(await api(m.antor, 'GET', urlCartes(m))).includes('Carte trop lourde'));
    });
  });

  // =========================== B-23, B-12 : montrer à la table (E-10, E-11) ===========================
  describe('B-23 la carte illustrée à la table, B-12 mode Joueur', () => {
    let m: Monde;
    let carte = 0;
    before(async () => {
      m = await monde("Lame d'Ébène table");
      // Antor builds « La ville de Brume » through the screens.
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'La ville de Brume', 'Carte illustrée', fichierPng());
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.waitForURL(new RegExp(`/univers/${m.U}/cartes/\\d+$`));
      await m.antor.getByRole('heading', { name: 'La ville de Brume', level: 1 }).waitFor();
      await attendre(m.antor);
      carte = Number(m.antor.url().split('/').pop());
      await ajouterFiche(m.antor, 'Personnage', 'Maître Aldric');
      await ajouterFiche(m.antor, 'Faction', 'Les Ombres de Fer');
    });

    // Si « Rendre visible » ne change pas la lecture des joueurs, ou laisse l'état au joueur.
    test('nominal : Antor clique « Rendre visible » dans la liste ; Léa voit la carte, sans état ni geste de visibilité', async () => {
      await ouvrirListe(m.lea, m);
      assert.ok(!(await texte(m.lea)).includes('La ville de Brume'));
      await ouvrirListe(m.antor, m);
      assert.ok((await texte(m.antor)).includes('MJ seul'));
      await m.antor.getByRole('button', { name: rxExact('Rendre visible') }).click();
      await m.antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).waitFor();
      assert.ok((await texte(m.antor)).includes('Visible des joueurs'));
      await ouvrirListe(m.lea, m);
      const t = await texte(m.lea);
      assert.ok(t.includes('La ville de Brume'));
      assert.ok(t.includes('Carte illustrée'));
      assert.ok(!t.includes('Visible des joueurs'));
      assert.ok(!t.includes('MJ seul'));
      assert.equal(await m.lea.getByRole('button', { name: rx('Rendre visible') }).count(), 0);
      assert.equal(await m.lea.getByRole('button', { name: rx('Cacher aux joueurs') }).count(), 0);
      await capture(m.lea, 'b23-liste-joueuse');
    });

    // Si le filtre de droits manque sur les tokens, la liste ou le contenu envoyé au navigateur.
    test('exclusion : Léa voit le fond et le token d\'Aldric, ni le token ni le titre des Ombres de Fer, nulle part, ni dans la réponse du serveur', async () => {
      const spy = espion(m.lea);
      const fond = m.lea.waitForResponse((r: Any) => new RegExp(`/cartes/${carte}/fond(\\?.*)?$`).test(r.url()));
      await ouvrirCarte(m.lea, m, carte);
      assert.equal((await fond).status(), 200);
      const t = await texte(m.lea);
      assert.ok(t.includes('Maître Aldric'));
      assert.equal(await noeud(m.lea, 'Maître Aldric').count(), 1);
      assert.ok(!t.includes('Ombres'));
      assert.deepEqual(await surLaCarte(m.lea), ['Maître Aldric']);
      const corps = await spy.corps();
      assert.ok(!corps.includes('Ombres'), 'la réponse du serveur nomme la faction cachée');
      assert.ok(!corps.includes('Ombres de Fer'));
      assert.ok(!(await m.lea.locator('main').innerHTML()).includes('Ombres'));
      await capture(m.lea, 'b23-carte-joueuse');
    });

    // Si le serveur donne à Léa une carte qui trahit l'existence des éléments cachés (compte).
    test('exclusion : la réponse de l\'API pour Léa ne porte qu\'un élément et ne nomme pas l\'autre', async () => {
      const lue = await api(m.lea, 'GET', `${urlCartes(m)}/${carte}`);
      assert.equal(lue.elements.length, 1);
      assert.equal(lue.elements[0].titre, 'Maître Aldric');
      assert.ok(!JSON.stringify(lue).includes('Ombres'));
    });

    // Si le token de la joueuse n'ouvre pas la fiche.
    test('nominal : Léa touche le token d\'Aldric et arrive sur sa fiche', async () => {
      await ouvrirCarte(m.lea, m, carte);
      await noeud(m.lea, 'Maître Aldric').click();
      await m.lea.waitForURL(new RegExp(`/univers/${m.U}/fiche/${m.aldric}$`));
      await m.lea.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
    });

    // Si Léa dispose d'un geste de MJ sur la carte.
    test('exclusion : Léa n\'a ni renommer, ni ajouter, ni fond, ni retirer, ni mode Joueur sur la carte', async () => {
      await ouvrirCarte(m.lea, m, carte);
      for (const nom of ['Renommer', 'Ajouter une fiche', 'Changer le fond', 'Ajouter un fond', 'Retirer de la carte', 'Cacher aux joueurs', 'Rendre visible']) {
        assert.equal(await m.lea.getByRole('button', { name: rx(nom) }).count(), 0, nom);
      }
      assert.equal(await m.lea.locator('input[type=file]').count(), 0);
    });

    // Si le mode Joueur montre au MJ autre chose que ce que voit Léa.
    test('nominal : Antor en mode Joueur voit exactement la carte de Léa, sans geste de modification', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
      await attendre(m.antor);
      await m.antor.waitForTimeout(300);
      try {
        const t = await texte(m.antor);
        assert.ok(t.includes('Maître Aldric'));
        assert.ok(!t.includes('Ombres'));
        assert.deepEqual(await surLaCarte(m.antor), await surLaCarte(m.lea));
        assert.equal(await noeud(m.antor, 'Maître Aldric').count(), 1);
        for (const nom of ['Renommer', 'Ajouter une fiche', 'Changer le fond', 'Retirer de la carte', 'Cacher aux joueurs', 'Rendre visible']) {
          assert.equal(await m.antor.getByRole('button', { name: rx(nom) }).count(), 0, nom);
        }
        assert.equal(await m.antor.locator('main').getByText('MJ seul').count(), 0);
        await capture(m.antor, 'b12-carte-mode-joueur');
      } finally {
        await m.antor.getByRole('radio', { name: rxExact('Mode MJ') }).check();
        await attendre(m.antor);
      }
    });

    // Si le mode Joueur laisse passer un geste d'écriture.
    test('exclusion : en mode Joueur, Antor ne peut pas écrire sur la carte (refus)', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
      await attendre(m.antor);
      try {
        const s = await statut(m.antor, 'PATCH', `${urlCartes(m)}/${carte}?mode=joueur`, { titre: 'Pirate' });
        assert.ok(s === 403 || s === 404, `statut ${s}`);
        assert.equal((await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).carte.titre, 'La ville de Brume');
      } finally {
        await m.antor.getByRole('radio', { name: rxExact('Mode MJ') }).check();
        await attendre(m.antor);
      }
    });

    // Si un token dont la fiche devient illisible reste visible, ou laisse une trace.
    test('exclusion : une fiche refermée aux joueurs disparaît de la carte de Léa au rechargement, sans trace', async () => {
      const garde = (await api(m.antor, 'POST', `/api/univers/${m.U}/fiches`, { type: 'lieu', titre: 'La Tour du Guet' })).id;
      const s = await api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${garde}/sections`, { titre: 'Vue', contenu: 'Haute.' });
      await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${garde}/sections/${s.id}`, { joueursLisent: true });
      const c = await carteApi(m, 'illustree', 'Carte du guet', true);
      await poser(m, c, garde, 10, 10);
      await ouvrirCarte(m.lea, m, c);
      assert.ok((await texte(m.lea)).includes('La Tour du Guet'));
      await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${garde}/sections/${s.id}`, { joueursLisent: false });
      await ouvrirCarte(m.lea, m, c);
      const t = await texte(m.lea);
      assert.ok(!t.includes('La Tour du Guet'));
      assert.ok(t.includes('Rien à voir sur cette carte pour l\'instant.'));
    });

    // Si cacher la carte n'efface pas son existence côté joueuse.
    test('nominal : Antor la cache ; Léa, au rechargement, lit « Page introuvable. », la carte quitte sa liste, le fond répond 404', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await enTete(m.antor, 'Cacher aux joueurs').click();
      await enTete(m.antor, 'Rendre visible').waitFor();
      await ouvrirCarte(m.lea, m, carte);
      const t = await texte(m.lea);
      assert.ok(t.includes('Page introuvable.'));
      assert.ok(t.includes('Mes univers'));
      assert.ok(!t.includes('Maître Aldric'));
      await ouvrirListe(m.lea, m);
      assert.ok(!(await texte(m.lea)).includes('La ville de Brume'));
      assert.equal(await statut(m.lea, 'GET', `${urlCartes(m)}/${carte}/fond`), 404);
      assert.equal(await statut(m.lea, 'GET', `${urlCartes(m)}/${carte}`), 404);
      await capture(m.lea, 'b23-carte-cachee-joueuse');
    });

    // Si le MJ en mode Joueur sur une carte cachée voit la carte ou un refus muet.
    test('refus : Antor en mode Joueur sur la carte non visible lit sa propre phrase et « Quitter le mode Joueur »', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
      await attendre(m.antor);
      try {
        await m.antor.getByText(rx('Les joueurs ne voient pas cette carte : elle n\'est pas visible.')).waitFor();
        await m.antor.getByRole('button', { name: rxExact('Quitter le mode Joueur') }).or(m.antor.getByRole('link', { name: rxExact('Quitter le mode Joueur') })).waitFor();
        assert.ok(!(await texte(m.antor)).includes('Page introuvable.'));
      } finally {
        await m.antor.getByRole('radio', { name: rxExact('Mode MJ') }).check().catch(() => {});
        await attendre(m.antor);
      }
    });

    // Si un compte sans rôle devine la carte.
    test('exclusion : Teo, sans rôle dans l\'univers, lit « Page introuvable. » sur la carte, même visible', async () => {
      await api(m.antor, 'PATCH', `${urlCartes(m)}/${carte}`, { visible: true });
      await ouvrirCarte(m.teo, m, carte);
      assert.ok((await texte(m.teo)).includes('Page introuvable.'));
      assert.equal(await statut(m.teo, 'GET', `${urlCartes(m)}/${carte}`), 404);
      assert.equal(await statut(m.teo, 'GET', `${urlCartes(m)}/${carte}/fond`), 404);
    });

    // Si une action de MJ répond autre chose que 403 à une joueuse qui lit la carte (404 si elle ne la lit pas).
    test('exclusion : Léa force une action de MJ sur la carte qu\'elle lit : 403 ; sur une carte cachée : 404', async () => {
      const cachee = await carteApi(m, 'illustree', 'Carte cachée');
      assert.equal(await statut(m.lea, 'PATCH', `${urlCartes(m)}/${carte}`, { visible: false }), 403);
      assert.equal(await statut(m.lea, 'PATCH', `${urlCartes(m)}/${carte}`, { titre: 'Pirate' }), 403);
      assert.equal(await statut(m.lea, 'POST', `${urlCartes(m)}/${carte}/elements`, { ficheId: m.guilde, x: 1, y: 1 }), 403);
      const lue = await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`);
      const e = lue.elements[0].id;
      assert.equal(await statut(m.lea, 'PATCH', `${urlCartes(m)}/${carte}/elements/${e}`, { x: 1, y: 1 }), 403);
      assert.equal(await statut(m.lea, 'DELETE', `${urlCartes(m)}/${carte}/elements/${e}`), 403);
      assert.equal(await statut(m.lea, 'PATCH', `${urlCartes(m)}/${cachee}`, { visible: true }), 404);
      assert.equal(await statut(m.lea, 'POST', `${urlCartes(m)}/${cachee}/elements`, { ficheId: m.guilde, x: 1, y: 1 }), 404);
      const apres = await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`);
      assert.equal(apres.carte.titre, 'La ville de Brume');
      assert.equal(apres.carte.visible, true);
      assert.equal(apres.elements.length, 2);
    });
  });

  // =========================== P-9, B-22, B-23 : le graphe des factions ===========================
  describe('P-9 graphe des factions : fiches choisies, liens venus des relations, droits de lecture', () => {
    let m: Monde;
    let graphe = 0;
    before(async () => {
      m = await monde("Lame d'Ébène graphe");
    });

    // Si le graphe naît avec des fiches, ou si le choix des fiches ne passe pas par la carte.
    test('nominal : Antor crée le graphe « Les factions » (naît vide), choisit les trois factions, voit leurs deux liens', async () => {
      await ouvrirListe(m.antor, m);
      await remplirCreation(m.antor, 'Les factions', 'Graphe');
      await m.antor.getByRole('button', { name: rxExact('Créer') }).click();
      await m.antor.waitForURL(new RegExp(`/univers/${m.U}/cartes/\\d+$`));
      await m.antor.getByRole('heading', { name: 'Les factions', level: 1 }).waitFor();
      await attendre(m.antor);
      graphe = Number(m.antor.url().split('/').pop());
      let t = await texte(m.antor);
      assert.ok(t.includes('Graphe'));
      assert.ok(t.includes('MJ seul'));
      assert.ok(t.includes('Aucune fiche. Ajoutez des fiches pour voir leurs liens.'));
      await ajouterFiche(m.antor, 'Faction', 'Les Lames Grises');
      await ajouterFiche(m.antor, 'Faction', 'Les Ombres de Fer');
      await ajouterFiche(m.antor, 'Faction', 'La Guilde');
      await ouvrirCarte(m.antor, m, graphe);
      assert.deepEqual((await surLaCarte(m.antor)).sort(), ['La Guilde', 'Les Lames Grises', 'Les Ombres de Fer']);
      assert.deepEqual((await liens(m.antor)).sort(), [
        'Les Lames Grises — allié de → Les Ombres de Fer',
        'Les Lames Grises — rival de → La Guilde',
      ]);
      await capture(m.antor, 'p9-graphe-mj');
    });

    // Si la liste des liens n'est pas dessinée comme le doc la dit, le MJ ne peut pas la lire.
    test('bord : les trois nœuds sont dans le cadre, chacun cliquable sur au moins 44 px', async () => {
      await ouvrirCarte(m.antor, m, graphe);
      for (const titre of ['Les Lames Grises', 'Les Ombres de Fer', 'La Guilde']) {
        const n = noeud(m.antor, titre);
        assert.equal(await n.count(), 1, titre);
        const b = await n.boundingBox();
        assert.ok(b && b.width >= 44 && b.height >= 44, `${titre}: ${JSON.stringify(b)}`);
      }
    });

    // Si le graphe rendu visible laisse voir la faction secrète à Léa (nœud, titre, lien, réponse du serveur).
    test('exclusion : graphe visible, Léa n\'y voit pas la faction secrète (nœud, titre, lien), seulement « rival de »', async () => {
      await api(m.antor, 'PATCH', `${urlCartes(m)}/${graphe}`, { visible: true });
      const spy = espion(m.lea);
      await ouvrirCarte(m.lea, m, graphe);
      const t = await texte(m.lea);
      assert.ok(t.includes('Les Lames Grises'));
      assert.ok(t.includes('La Guilde'));
      assert.ok(!t.includes('Ombres'));
      assert.ok(!t.includes('allié de'));
      assert.deepEqual((await surLaCarte(m.lea)).sort(), ['La Guilde', 'Les Lames Grises']);
      assert.deepEqual(await liens(m.lea), ['Les Lames Grises — rival de → La Guilde']);
      const corps = await spy.corps();
      assert.ok(!corps.includes('Ombres'), 'la réponse du serveur nomme la faction cachée');
      assert.ok(!corps.includes('allié de'), 'la réponse du serveur porte le lien caché');
      await capture(m.lea, 'p9-graphe-joueuse');
    });

    // Si le mode Joueur du graphe diffère de la lecture de Léa.
    test('nominal : Antor en mode Joueur voit le même graphe que Léa', async () => {
      await ouvrirCarte(m.antor, m, graphe);
      await m.antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
      await attendre(m.antor);
      await m.antor.waitForTimeout(300);
      try {
        assert.deepEqual((await surLaCarte(m.antor)).sort(), ['La Guilde', 'Les Lames Grises']);
        assert.deepEqual(await liens(m.antor), ['Les Lames Grises — rival de → La Guilde']);
        assert.ok(!(await texte(m.antor)).includes('Ombres'));
      } finally {
        await m.antor.getByRole('radio', { name: rxExact('Mode MJ') }).check();
        await attendre(m.antor);
      }
    });

    // Si le toucher d'un nœud n'ouvre pas la fiche.
    test('nominal : Léa touche le nœud « La Guilde » et arrive sur sa fiche', async () => {
      await ouvrirCarte(m.lea, m, graphe);
      await noeud(m.lea, 'La Guilde').click();
      await m.lea.waitForURL(new RegExp(`/univers/${m.U}/fiche/${m.guilde}$`));
    });

    // La relation « allié de » est portée par « Alliances » (fermée) : même cible lisible, le lien reste caché.
    test('bords : Léa lit les trois fiches, voit trois nœuds et seulement « rival de » ; Antor voit les deux liens', async () => {
      const s = await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${m.ombres}/sections/${m.ombresSecret}`, { joueursLisent: true });
      assert.ok(s);
      await ouvrirCarte(m.lea, m, graphe);
      assert.deepEqual((await surLaCarte(m.lea)).sort(), ['La Guilde', 'Les Lames Grises', 'Les Ombres de Fer']);
      assert.deepEqual(await liens(m.lea), ['Les Lames Grises — rival de → La Guilde']);
      await ouvrirCarte(m.antor, m, graphe);
      assert.equal((await liens(m.antor)).length, 2);
    });

    // Si un lien survit quand la cible devient illisible : « deux nœuds et aucun lien ».
    test('bord : si Léa ne lisait pas « La Guilde », elle verrait deux nœuds et « Aucun lien entre ces fiches. »', async () => {
      await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${m.guilde}/sections/${m.guildePresentation}`, { joueursLisent: false });
      await ouvrirCarte(m.lea, m, graphe);
      assert.deepEqual((await surLaCarte(m.lea)).sort(), ['Les Lames Grises', 'Les Ombres de Fer']);
      assert.deepEqual(await liens(m.lea), []);
      const t = await texte(m.lea);
      assert.ok(t.includes('Aucun lien entre ces fiches.'));
      assert.ok(!t.includes('La Guilde'));
      assert.ok(!t.includes('rival de'));
      await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${m.guilde}/sections/${m.guildePresentation}`, { joueursLisent: true });
    });

    // Si les liens sont figés à l'ajout du nœud : ils viennent des relations, lues au chargement.
    test('nominal : une relation ajoutée sur une fiche, puis retirée, se voit sur le graphe au rechargement', async () => {
      const rel = await api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${m.guilde}/sections/${m.guildePresentation}/relations`, { cibleFicheId: m.lames, type: 'dépend de' });
      await ouvrirCarte(m.antor, m, graphe);
      assert.ok((await liens(m.antor)).includes('La Guilde — dépend de → Les Lames Grises'));
      await api(m.antor, 'DELETE', `/api/univers/${m.U}/fiches/relations/${rel.id}`);
      await ouvrirCarte(m.antor, m, graphe);
      assert.ok(!(await liens(m.antor)).some((l) => l.includes('dépend de')));
    });

    // Si le graphe garde un fond ou une position (jamais pour un graphe).
    test('exclusion : un graphe n\'accepte ni fond ni position de nœud', async () => {
      const fond = await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${graphe}/fond`, {
        method: 'PUT',
        multipart: { fichier: { name: 'brume.png', mimeType: 'image/png', buffer: PAYSAGE } },
      });
      assert.ok(fond.status() >= 400 && fond.status() < 500, `fond: ${fond.status()}`);
      const c = await carteApi(m, 'graphe', 'Graphe sans position');
      const s = await statut(m.antor, 'POST', `${urlCartes(m)}/${c}/elements`, { ficheId: m.guilde, x: 10, y: 10 });
      assert.ok(s >= 400 && s < 500, `position: ${s}`);
    });

    // Si le graphe vide affiche le texte du MJ à la joueuse.
    test('vide : un graphe visible sans nœud lisible dit à Léa « Rien à voir sur ce graphe pour l\'instant. »', async () => {
      const c = await carteApi(m, 'graphe', 'Graphe du secret', true);
      const secret = (await api(m.antor, 'POST', `/api/univers/${m.U}/fiches`, { type: 'faction', titre: 'Faction muette' })).id;
      await api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${secret}/sections`, { titre: 'Rien', contenu: 'x' });
      await poser(m, c, secret);
      await ouvrirCarte(m.lea, m, c);
      const t = await texte(m.lea);
      assert.ok(t.includes("Rien à voir sur ce graphe pour l'instant."));
      assert.ok(!t.includes('Faction muette'));
    });
  });

  // =========================== E-3 : le bloc « Cartes visibles » ===========================
  describe('E-3 bloc « Cartes visibles »', () => {
    let m: Monde;
    before(async () => {
      m = await monde("Lame d'Ébène bloc");
    });
    const ouvrirVue = async (page: Any) => {
      await page.goto(`/univers/${m.U}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await attendre(page);
      await page.waitForTimeout(300);
    };

    // Si Léa voit un bloc vide, ou un compteur, quand rien n'est visible.
    test('vide : Léa n\'a aucun bloc (ni titre ni compteur) ; Antor lit « Aucune carte visible des joueurs. » et « Toutes »', async () => {
      await carteApi(m, 'illustree', 'Carte secrète du MJ');
      await ouvrirVue(m.lea);
      assert.ok(!(await texte(m.lea)).includes('Cartes visibles'));
      await ouvrirVue(m.antor);
      const t = await texte(m.antor);
      assert.ok(t.includes('Cartes visibles'));
      assert.ok(t.includes('Aucune carte visible des joueurs.'));
      assert.equal(await m.antor.getByRole('link', { name: rxExact('Toutes') }).count(), 1);
      assert.ok(!t.includes('Carte secrète du MJ'));
    });

    // Si le bloc liste les cartes « MJ seul » ou en oublie une visible.
    test('nominal : deux cartes visibles et une « MJ seul » — Léa en liste deux, Antor aussi', async () => {
      await carteApi(m, 'illustree', 'La ville de Brume', true);
      await carteApi(m, 'graphe', 'Les factions', true);
      for (const p of [m.lea, m.antor]) {
        await ouvrirVue(p);
        const t = await texte(p);
        assert.ok(t.includes('Cartes visibles'));
        assert.ok(t.includes('La ville de Brume'));
        assert.ok(t.includes('Les factions'));
        assert.ok(!t.includes('Carte secrète du MJ'));
        assert.equal(await p.getByRole('link', { name: rx('La ville de Brume') }).count(), 1);
      }
      await capture(m.lea, 'e3-bloc-cartes-joueuse');
    });

    // Si le lien du bloc ne mène pas à la carte.
    test('nominal : le titre mène à la carte (E-11), « Toutes » à la liste (E-10)', async () => {
      await ouvrirVue(m.lea);
      await m.lea.getByRole('link', { name: rx('La ville de Brume') }).click();
      await m.lea.waitForURL(new RegExp(`/univers/${m.U}/cartes/\\d+$`));
      await m.lea.getByRole('heading', { name: 'La ville de Brume', level: 1 }).waitFor();
      await ouvrirVue(m.antor);
      await m.antor.getByRole('link', { name: rxExact('Toutes') }).click();
      await m.antor.waitForURL(new RegExp(`/univers/${m.U}/cartes$`));
    });

    // Si le bloc n'est pas borné à cinq, ou pas dans l'ordre alphabétique.
    test('bord : sept cartes visibles, le bloc en montre cinq, par ordre alphabétique', async () => {
      const m2 = await monde("Lame d'Ébène bloc sept");
      for (const t of ['Gamma', 'Bêta', 'Alpha', 'Epsilon', 'Delta', 'Zêta', 'Carte Cinq']) await carteApi(m2, 'illustree', t, true);
      await m2.antor.goto(`/univers/${m2.U}`);
      await m2.antor.getByRole('heading', { level: 1 }).waitFor();
      await attendre(m2.antor);
      await m2.antor.waitForTimeout(300);
      const bloc = m2.antor.locator('main').getByRole('region', { name: rx('Cartes visibles') });
      const titres = (await bloc.getByRole('link').allInnerTexts()).map((x: string) => x.split('\n')[0]!.trim()).filter((x: string) => x !== 'Toutes');
      assert.deepEqual(titres, ['Alpha', 'Bêta', 'Carte Cinq', 'Delta', 'Epsilon']);
      assert.equal(await m2.antor.getByRole('link', { name: rxExact('Toutes') }).count(), 1);
    });

    // Si le compte sans rôle voit le bloc.
    test('exclusion : Teo, sans rôle, lit « Page introuvable. » sur la vue d\'ensemble', async () => {
      await ouvrirVue(m.teo);
      const t = await texte(m.teo);
      assert.ok(t.includes('Page introuvable.'));
      assert.ok(!t.includes('Cartes visibles'));
    });
  });

  // =========================== E-10 : la liste ===========================
  describe('E-10 la liste des cartes', () => {
    let m: Monde;
    before(async () => {
      m = await monde("Lame d'Ébène liste");
    });

    // Si « Cacher aux joueurs » ne retire pas la carte de la liste de Léa.
    test('nominal : « Cacher aux joueurs » dans la liste ; Léa ne la voit plus', async () => {
      await carteApi(m, 'illustree', 'Brume', true);
      await ouvrirListe(m.lea, m);
      assert.ok((await texte(m.lea)).includes('Brume'));
      await ouvrirListe(m.antor, m);
      await m.antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).click();
      await m.antor.getByRole('button', { name: rxExact('Rendre visible') }).waitFor();
      await ouvrirListe(m.lea, m);
      assert.ok(!(await texte(m.lea)).includes('Brume'));
      assert.ok((await texte(m.lea)).includes("Aucune carte n'est visible pour l'instant."));
    });

    // Si l'ordre n'est pas alphabétique, ou si la forme n'est pas dite.
    test('bord : titres par ordre alphabétique, avec leur forme ; MJ voit l\'état de chacune', async () => {
      await carteApi(m, 'graphe', 'Zéphyr', true);
      await carteApi(m, 'illustree', 'Aube');
      await ouvrirListe(m.antor, m);
      const lignes = (await m.antor.locator('main').getByRole('listitem').allInnerTexts()).map((x: string) => x.replace(/\s+/g, ' ').trim());
      assert.equal(lignes.length, 3);
      assert.ok(lignes[0]!.startsWith('Aube') && lignes[0]!.includes('Carte illustrée') && lignes[0]!.includes('MJ seul'));
      assert.ok(lignes[1]!.startsWith('Brume') && lignes[1]!.includes('MJ seul'));
      assert.ok(lignes[2]!.startsWith('Zéphyr') && lignes[2]!.includes('Graphe') && lignes[2]!.includes('Visible des joueurs'));
      await capture(m.antor, 'e10-liste-mj');
    });

    // Si le titre ne mène pas à la carte.
    test('nominal : un clic sur le titre ouvre la carte', async () => {
      await ouvrirListe(m.antor, m);
      await m.antor.getByRole('link', { name: rx('Zéphyr') }).click();
      await m.antor.getByRole('heading', { name: 'Zéphyr', level: 1 }).waitFor();
    });

    // Si la page n'est pas bornée à cent cartes, ou si « Charger la suite » n'apporte pas le reste.
    test('bord : 102 cartes — cent sur la première page, puis « Charger la suite » apporte le reste', async () => {
      const m2 = await monde("Lame d'Ébène cent cartes");
      for (let i = 0; i < 102; i++) await api(m2.antor, 'POST', urlCartes(m2), { titre: `Carte ${String(i).padStart(3, '0')}`, forme: 'graphe' });
      await ouvrirListe(m2.antor, m2);
      const compte = async () => m2.antor.locator('main').getByRole('listitem').count();
      assert.equal(await compte(), 100);
      await m2.antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
      await m2.antor.waitForFunction(() => document.querySelectorAll('main li').length === 102);
      assert.equal(await compte(), 102);
      assert.equal(await m2.antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
    });
  });

  // =========================== limites d'une carte ===========================
  describe('limites : 100 éléments, fiche inconnue, contenu long', () => {
    let m: Monde;
    let carte = 0;
    before(async () => {
      m = await monde("Lame d'Ébène limites");
      carte = await carteApi(m, 'illustree', 'Carte pleine', true);
      for (let i = 0; i < 100; i++) {
        const titre = i === 0 ? 'Le long nom d\'un lieu qui dépasse largement les vingt-quatre caractères du token' : `Lieu ${i}`;
        const f = (await api(m.antor, 'POST', `/api/univers/${m.U}/fiches`, { type: 'lieu', titre })).id;
        const s = await api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${f}/sections`, { titre: 'Vue', contenu: 'x' });
        await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${f}/sections/${s.id}`, { joueursLisent: true });
        await poser(m, carte, f, (i % 10) * 10 + 5, Math.floor(i / 10) * 10 + 5);
      }
    });

    // Si le plafond de 100 éléments n'est pas appliqué ou sans message.
    test('bord : la carte porte 100 éléments ; en ajouter un 101e dit « Cette carte porte déjà 100 éléments. » et n\'ajoute rien', async () => {
      assert.equal(await statut(m.antor, 'POST', `${urlCartes(m)}/${carte}/elements`, { ficheId: m.guilde, x: 1, y: 1 }), 409);
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
      const fenetre = m.antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
      await fenetre.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await fenetre.getByRole('listitem').filter({ hasText: rx('La Guilde') }).getByRole('button', { name: rxExact('Ajouter') }).click();
      await m.antor.getByText(rx('Cette carte porte déjà 100 éléments.')).waitFor();
      assert.equal((await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).elements.length, 100);
    });

    // Si un titre long déborde du token, ou si la liste ne donne pas le titre entier.
    test('contenu long : à 100 éléments, un titre de 80+ caractères est coupé à 24 puis « … » sur le token, entier dans la liste', async () => {
      await ouvrirCarte(m.antor, m, carte);
      const entier = "Le long nom d'un lieu qui dépasse largement les vingt-quatre caractères du token";
      assert.ok((await surLaCarte(m.antor)).includes(entier));
      const jeton = m.antor.locator('main :is(a, button, [role=button]):not(section *)').filter({ hasText: rx("Le long nom d'un lieu") }).first();
      const visible = ((await jeton.innerText()) as string).replace(/’/g, "'");
      assert.ok(visible.includes('…'), visible);
      assert.ok(!visible.includes('du token'), visible);
      await capture(m.antor, 'e11-cent-elements');
    });

    // Si Léa voit une page cassée sur une carte pleine.
    test('contenu long : Léa ouvre la carte de 100 éléments et lit la liste des 100', async () => {
      await ouvrirCarte(m.lea, m, carte);
      assert.equal((await surLaCarte(m.lea)).length, 100);
    });

    // Si une fiche inconnue est acceptée, ou si le message manque.
    test('échec : ajouter une fiche d\'un autre univers ou inconnue est refusé (invalide) et rien ne se pose', async () => {
      const c = await carteApi(m, 'illustree', 'Carte neuve');
      assert.equal(await statut(m.antor, 'POST', `${urlCartes(m)}/${c}/elements`, { ficheId: 999999, x: 1, y: 1 }), 400);
      assert.deepEqual((await api(m.antor, 'GET', `${urlCartes(m)}/${c}`)).elements, []);
    });
  });

  // =========================== B-29 : les six états ===========================
  describe('B-29 états de E-10, E-11 et du bloc de E-3', () => {
    let m: Monde;
    let carte = 0;
    before(async () => {
      m = await monde("Lame d'Ébène états");
      ({ id: carte } = await api(m.antor, 'POST', urlCartes(m), { titre: 'Carte des états', forme: 'illustree' }));
      await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${carte}/fond`, {
        method: 'PUT',
        multipart: { fichier: { name: 'brume.png', mimeType: 'image/png', buffer: PAYSAGE } },
      });
      await poser(m, carte, m.aldric, 30, 40);
      await api(m.antor, 'PATCH', `${urlCartes(m)}/${carte}`, { visible: true });
    });

    // Si l'écran n'annonce pas son chargement.
    test('chargement : la carte dit « Chargement… » tant que la réponse n\'est pas là', async () => {
      const page = (await connecte(browser, srv.base, 'Antor')).page;
      await page.route(`**${urlCartes(m)}/${carte}`, async (r: Any) => {
        await new Promise((ok) => setTimeout(ok, 1500));
        await r.continue();
      });
      await page.goto(`/univers/${m.U}/cartes/${carte}`);
      await page.getByText(rx('Chargement…')).first().waitFor({ timeout: 1200 });
      await capture(page, 'e11-chargement');
      await page.getByRole('heading', { name: 'Carte des états', level: 1 }).waitFor();
    });

    // Si une panne de chargement laisse un écran blanc, ou si « Réessayer » ne relance pas.
    test('erreur : la carte qui ne charge pas dit « Impossible de charger cette page. » ; « Réessayer » la charge une fois la panne finie', async () => {
      const page = (await connecte(browser, srv.base, 'Antor')).page;
      await page.route(`**${urlCartes(m)}/${carte}`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
      await page.goto(`/univers/${m.U}/cartes/${carte}`);
      await page.getByText(rx('Impossible de charger cette page.')).waitFor();
      await capture(page, 'e11-erreur');
      await page.unroute(`**${urlCartes(m)}/${carte}`);
      await page.getByRole('button', { name: rxExact('Réessayer') }).click();
      await page.getByRole('heading', { name: 'Carte des états', level: 1 }).waitFor();
    });

    test('erreur : la liste qui ne charge pas dit « Impossible de charger cette page. » avec « Réessayer »', async () => {
      const page = (await connecte(browser, srv.base, 'Antor')).page;
      await page.route(`**${urlCartes(m)}?*`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
      await page.route(`**${urlCartes(m)}`, (r: Any) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
      await page.goto(`/univers/${m.U}/cartes`);
      await page.getByText(rx('Impossible de charger cette page.')).waitFor();
      assert.equal(await page.getByRole('button', { name: rxExact('Réessayer') }).count(), 1);
    });

    // Si la perte de connexion laisse écrire dans le vide.
    test('connexion perdue : le bandeau paraît, les gestes d\'écriture se désactivent, la carte chargée reste', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.context().setOffline(true);
      try {
        await m.antor.getByText(rx(BANDEAU)).first().waitFor();
        for (const nom of ['Renommer', 'Cacher aux joueurs', 'Ajouter une fiche']) {
          assert.equal(await m.antor.getByRole('button', { name: rxExact(nom) }).isDisabled(), true, nom);
        }
        assert.ok((await texte(m.antor)).includes('Maître Aldric'));
        await capture(m.antor, 'e11-connexion-perdue');
      } finally {
        await m.antor.context().setOffline(false);
      }
      await attendre(m.antor);
    });

    test('connexion perdue : sur la liste, « Nouvelle carte » et « Cacher aux joueurs » se désactivent, la liste chargée reste', async () => {
      await ouvrirListe(m.antor, m);
      await m.antor.context().setOffline(true);
      try {
        await m.antor.getByText(rx(BANDEAU)).first().waitFor();
        assert.equal(await m.antor.getByRole('button', { name: rxExact('Nouvelle carte') }).isDisabled(), true);
        assert.equal(await m.antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).isDisabled(), true);
        assert.ok((await texte(m.antor)).includes('Carte des états'));
      } finally {
        await m.antor.context().setOffline(false);
      }
      await attendre(m.antor);
    });

    // Si un geste raté laisse l'écran dans un état qui ne dit pas la vérité.
    test('échec d\'écriture : une visibilité qui échoue dit « L\'action n\'a pas abouti. Réessayez. » et l\'état d\'avant reste', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.route(`**${urlCartes(m)}/${carte}`, (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
      await enTete(m.antor, 'Cacher aux joueurs').click();
      await m.antor.getByText(rx(PAS_ABOUTI)).first().waitFor();
      assert.equal(await enTete(m.antor, 'Cacher aux joueurs').count(), 1);
      assert.ok((await texte(m.antor)).includes('Visible des joueurs'));
      await m.antor.unroute(`**${urlCartes(m)}/${carte}`);
      assert.equal((await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).carte.visible, true);
      await capture(m.antor, 'e11-echec-ecriture');
    });

    test('échec d\'écriture : un déplacement qui échoue ramène le token à sa place et dit « L\'action n\'a pas abouti. Réessayez. »', async () => {
      await ouvrirCarte(m.antor, m, carte);
      const place = () => noeud(m.antor, 'Maître Aldric').evaluate((e: HTMLElement) => [e.offsetLeft, e.offsetTop]);
      const avant = await place();
      await m.antor.route(`**${urlCartes(m)}/${carte}/elements/*`, (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
      await noeud(m.antor, 'Maître Aldric').click();
      for (let i = 0; i < 5; i++) await m.antor.keyboard.press('ArrowRight');
      await m.antor.getByText(rx(PAS_ABOUTI)).first().waitFor();
      await m.antor.waitForTimeout(300);
      assert.deepEqual(await place(), avant);
      await m.antor.unroute(`**${urlCartes(m)}/${carte}/elements/*`);
      const e = (await api(m.antor, 'GET', `${urlCartes(m)}/${carte}`)).elements[0];
      assert.equal(e.x, 30);
      assert.equal(e.y, 40);
    });

    // Si le fond manquant casse la carte ou pose des tokens sans repère.
    test('erreur de fond : « Le fond de la carte n\'a pas pu être chargé. » avec « Réessayer », sans token posé, la liste reste', async () => {
      const page = (await connecte(browser, srv.base, 'Antor')).page;
      await page.route(`**${urlCartes(m)}/${carte}/fond*`, (r: Any) => r.abort());
      await page.goto(`/univers/${m.U}/cartes/${carte}`);
      await page.getByText(rx("Le fond de la carte n'a pas pu être chargé.")).waitFor();
      assert.equal(await page.getByRole('button', { name: rxExact('Réessayer') }).count(), 1);
      assert.equal(await noeud(page, 'Maître Aldric').count(), 0);
      assert.deepEqual(await surLaCarte(page), ['Maître Aldric']);
      await capture(page, 'e11-fond-indisponible');
      await page.unroute(`**${urlCartes(m)}/${carte}/fond*`);
      await page.getByRole('button', { name: rxExact('Réessayer') }).click();
      await noeud(page, 'Maître Aldric').waitFor();
    });

    // Si la fenêtre d'ajout n'a pas ses états propres.
    test('fenêtre « Ajouter une fiche » : vide, recherche sans résultat, erreur avec « Réessayer »', async () => {
      await ouvrirCarte(m.antor, m, carte);
      await m.antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
      const fenetre = m.antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
      await fenetre.getByLabel('Type de fiche').selectOption({ label: 'Lieu' });
      await fenetre.getByText(rx('Aucune fiche de ce type.')).waitFor();
      await fenetre.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await fenetre.getByRole('textbox', { name: rx('Chercher une fiche') }).fill('zzzzzz');
      await fenetre.getByRole('button', { name: rxExact('Chercher') }).click();
      await fenetre.getByText(rx('Aucune fiche ne correspond.')).waitFor();
      await capture(m.antor, 'e11-fenetre-vide');
      await m.antor.route('**/api/univers/*/fiches?*', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
      await fenetre.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
      await fenetre.getByText(rx('Impossible de charger les fiches.')).waitFor();
      assert.equal(await fenetre.getByRole('button', { name: rxExact('Réessayer') }).count(), 1);
      await m.antor.unroute('**/api/univers/*/fiches?*');
    });

    // Si le bloc de la vue d'ensemble casse la page entière quand les cartes ne chargent pas.
    test('bloc E-3 en erreur : « Impossible de charger les cartes. » avec « Réessayer », le reste de la page tient', async () => {
      const page = (await connecte(browser, srv.base, 'Léa')).page;
      await page.route(`**${urlCartes(m)}?*`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
      await page.route(`**${urlCartes(m)}`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
      await page.goto(`/univers/${m.U}`);
      await page.getByText(rx('Impossible de charger les cartes.')).waitFor();
      assert.ok((await texte(page)).includes('Lame d\'Ébène états'));
      await capture(page, 'e3-bloc-erreur');
    });
  });

  // =========================== téléphone ===========================
  describe('P-6 étape 3 : la carte au téléphone', () => {
    let m: Monde;
    let carte = 0;
    before(async () => {
      m = await monde("Lame d'Ébène téléphone");
      carte = await carteApi(m, 'illustree', 'La ville de Brume', true);
      await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${carte}/fond`, {
        method: 'PUT',
        multipart: { fichier: { name: 'brume.png', mimeType: 'image/png', buffer: PAYSAGE } },
      });
      await poser(m, carte, m.aldric, 30, 40);
    });

    // Si le token est trop petit pour un doigt, ou si la page déborde en largeur.
    test('Léa, sur un téléphone, touche le token (au moins 44 px), arrive sur la fiche ; la page ne défile pas en largeur', async () => {
      const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
      await page.waitForLoadState('networkidle');
      await ouvrirCarte(page, m, carte);
      const jeton = noeud(page, 'Maître Aldric');
      const b = await jeton.boundingBox();
      assert.ok(b && b.width >= 44 && b.height >= 44, JSON.stringify(b));
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), 'la page déborde en largeur');
      await capture(page, 'p6-carte-telephone');
      await jeton.tap();
      await page.waitForURL(new RegExp(`/univers/${m.U}/fiche/${m.aldric}$`));
      await ctx.close();
    });
  });
  // =========================== proportions du cadre (AD-70) ===========================
  describe('E-11 le cadre : proportions du fond, contenu long', () => {
    let m: Monde;
    before(async () => {
      m = await monde("Lame d'Ébène cadre");
    });
    const cadreDe = (page: Any) =>
      noeud(page, 'Maître Aldric').evaluate((e: HTMLElement) => {
        const r = (e.offsetParent as HTMLElement).getBoundingClientRect();
        return { w: r.width, h: r.height };
      });

    // Si le cadre déforme l'image ou déborde de la page.
    test('bords : un fond de 3000 x 300 garde ses proportions (10 pour 1) ; un fond de 300 x 3000 tient en largeur', async () => {
      for (const [l, h] of [[3000, 300], [300, 3000]] as const) {
        const c = await carteApi(m, 'illustree', `Fond ${l}x${h}`, true);
        await m.antor.request.fetch(`${srv.base}${urlCartes(m)}/${c}/fond`, {
          method: 'PUT',
          multipart: { fichier: { name: 'f.png', mimeType: 'image/png', buffer: pngDe(l, h) } },
        });
        await poser(m, c, m.aldric, 50, 50);
        await ouvrirCarte(m.lea, m, c);
        await m.lea.waitForFunction(() => document.querySelector('main img') === null || (document.querySelector('main img') as HTMLImageElement).complete);
        const cadre = await cadreDe(m.lea);
        const rapport = cadre.w / cadre.h;
        assert.ok(Math.abs(rapport - l / h) / (l / h) < 0.03, `${l}x${h}: cadre ${cadre.w}x${cadre.h}`);
        const principal = (await m.lea.locator('main').boundingBox())!;
        assert.ok(cadre.w <= principal.width + 1, `${l}x${h}: le cadre déborde (${cadre.w} > ${principal.width})`);
        assert.ok(await m.lea.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${l}x${h}: la page déborde`);
        await capture(m.lea, `e11-fond-${l}x${h}`);
      }
    });

    // Si le cadre sans fond n'est pas au format neutre 16/10.
    test('bord : une carte sans fond a un cadre neutre à 16/10', async () => {
      const c = await carteApi(m, 'illustree', 'Sans fond', true);
      await poser(m, c, m.aldric, 50, 50);
      await ouvrirCarte(m.lea, m, c);
      const cadre = await cadreDe(m.lea);
      assert.ok(Math.abs(cadre.w / cadre.h - 1.6) < 0.03, `cadre ${cadre.w}x${cadre.h}`);
    });

    // Si un titre de 80 caractères fait déborder la liste au téléphone.
    test('contenu long : un titre de carte de 80 caractères passe à la ligne, sans défilement horizontal, au téléphone', async () => {
      const titre = 'Le très long titre de la carte des marches du nord et des terres brûlées de Vaëlis'.slice(0, 80);
      assert.equal(titre.length, 80);
      await carteApi(m, 'graphe', titre, true);
      const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
      await page.waitForLoadState('networkidle');
      await ouvrirListe(page, m);
      assert.ok((await texte(page)).includes(titre));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'la liste déborde en largeur');
      await capture(page, 'e10-titre-long-telephone');
      await ctx.close();
    });
  });
});
