// Tests d'ensemble de `kanevas-battlemap-assets`, écrits depuis le besoin seul (B-96, B-97, B-98, B-110,
// P-26 étapes 1 et 2, E-25, E-26 de docs/parcours.md et docs/ecrans.md) : vrai serveur en mode bouchon,
// vrai Chromium, attendus en dur. Les captures vont dans un dossier temporaire, hors de l'arbre suivi.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import { type Any, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 240000 };
const CAPTURES = join(tmpdir(), 'kanevas-captures-battlemap-attendus');
mkdirSync(CAPTURES, { recursive: true });

// --- PNG valides et distincts, construits sans dépendance ---------------------------------------
function crc32(buf: Buffer): number {
  let r = 0xffffffff;
  for (const b of buf) {
    r ^= b;
    for (let k = 0; k < 8; k++) r = r & 1 ? 0xedb88320 ^ (r >>> 1) : r >>> 1;
  }
  return (r ^ 0xffffffff) >>> 0;
}
function bloc(type: string, data: Buffer): Buffer {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}
let teinte = 0;
function png(): Buffer {
  teinte += 1;
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(8, 0);
  ih.writeUInt32BE(8, 4);
  ih[8] = 8;
  ih[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array(8).fill([teinte % 256, (teinte >> 8) % 256, 90]).flat())]);
  const brut = Buffer.concat(Array(8).fill(ligne));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc('IHDR', ih),
    bloc('IDAT', deflateSync(brut)),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}
const fichierPng = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });

// --- aides --------------------------------------------------------------------------------------
async function universId(page: Any, nom: string): Promise<number> {
  const r = await page.request.get('/api/univers');
  const liste = (await r.json()) as Array<{ id: number; nom: string }>;
  const u = liste.find((x) => x.nom === nom);
  assert.ok(u, `univers ${nom} introuvable`);
  return u.id;
}
const grille = (page: Any) => page.getByRole('list', { name: 'Assets' });
const carte = (page: Any, nom: string) =>
  grille(page).getByRole('listitem').filter({ has: page.getByText(nom, { exact: true }) });
/** Attend (sans délai fixe) que le nombre de cartes affichées atteigne la valeur attendue. */
async function attendreCartes(page: Any, n: number): Promise<void> {
  const limite = Date.now() + 20000;
  let vu = -1;
  while (Date.now() < limite) {
    vu = await grille(page).getByRole('listitem').count();
    if (vu === n) return;
    await page.waitForTimeout(100);
  }
  assert.equal(vu, n, 'nombre de cartes affichées');
}
const segment = (page: Any, nom: string, n: number) =>
  page.getByRole('radio', { name: new RegExp(`^${nom}\\s*${n}$`) });

async function ouvrirBibliotheque(page: Any, uid: number, suite = ''): Promise<void> {
  await page.goto(`/univers/${uid}/outils/battlemap/assets${suite}`);
}
async function deposer(page: Any, fichiers: Any[], categorie: string | null, confirmer: string): Promise<void> {
  await page.locator('input[type=file]').first().setInputFiles(fichiers);
  const dialogue = page.getByRole('dialog');
  await dialogue.waitFor();
  if (categorie) await dialogue.getByRole('radio', { name: categorie, exact: true }).click();
  await dialogue.getByRole('button', { name: confirmer }).click();
}
async function enregistrer(page: Any): Promise<number> {
  const [r] = await Promise.all([
    page.waitForResponse((x: Any) => x.url().includes('/battlemap/direction') && x.request().method() === 'PUT'),
    page.getByRole('button', { name: 'Enregistrer' }).click(),
  ]);
  return r.status();
}
/** Dans la fenêtre « Choisir dans la médiathèque », le bouton « Ajouter » de la ligne du fichier. */
const ajouterLigne = (dialogue: Any, nom: string) => dialogue.getByRole('button', { name: `Ajouter ${nom}`, exact: true });
const carteContenant = (page: Any, texte: string) => grille(page).getByRole('listitem').filter({ hasText: texte });
async function api(page: Any, uid: number, suite: string): Promise<Any> {
  const r = await page.request.get(`/api/univers/${uid}/outils/battlemap/${suite}`);
  return { status: r.status(), corps: await r.json().catch(() => null) };
}
async function listeAssets(page: Any, uid: number): Promise<Any[]> {
  return (await api(page, uid, 'assets')).corps.assets;
}

// ==================================================================================================
// Monde bouchon complet : « Éneria d'essai » avec sa petite bibliothèque semée (neuf images dont une
// MJ seul, « Coffre piégé »), Antor MJ, Léa joueuse.
// ==================================================================================================
describe('bibliothèque et direction — monde semé', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid: number;

  before(async () => {
    if (skipBrowser) return;
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    uid = await universId(antor, "Éneria d'essai");
  });
  after(async () => {
    await browser?.close();
    await srv?.stop();
  });

  // ---------------------------------------------------------------- B-96, côté joueuse (état semé)
  test('B-96 · Léa lit la bibliothèque : neuf assets semés moins le MJ seul, aucun contrôle d’écriture', opts, async () => {
    await ouvrirBibliotheque(lea, uid);
    await lea.getByRole('heading', { name: 'Bibliothèque', level: 1 }).waitFor();
    await carte(lea, 'Tonneau').waitFor();
    assert.equal(await grille(lea).getByRole('listitem').count(), 8);
    assert.equal(await carte(lea, 'Coffre piégé').count(), 0, 'le MJ seul est absent (pas refusé, absent)');
    await segment(lea, 'Tous', 8).waitFor();
    assert.equal(await segment(lea, 'Tous', 9).count(), 0, 'le compte ne trahit pas le MJ seul');
    await segment(lea, 'Sols', 3).waitFor();
    for (const nom of ['Ajouter des images', 'Choisir dans la médiathèque', 'Retirer…']) {
      assert.equal(await lea.getByRole('button', { name: nom }).count(), 0, `pas de « ${nom} »`);
    }
    assert.equal(await lea.getByRole('checkbox').count(), 0, 'aucune case de sélection');
    assert.equal(await lea.getByRole('toolbar').count(), 0, 'aucune barre de sélection');
    assert.equal(await lea.getByRole('tab').count(), 0, 'aucune barre d’onglets (pas de Direction artistique)');
    assert.equal(await lea.locator('input[type=file]').count(), 0, 'aucune zone de dépôt');
    await carte(lea, 'Tonneau').getByText('Tonneau', { exact: true }).click();
    assert.equal(await lea.getByRole('dialog').count(), 0);
    assert.equal(await lea.getByRole('button', { name: 'Enregistrer' }).count(), 0, 'la fiche ne s’ouvre pas en écriture');
    await lea.screenshot({ path: join(CAPTURES, 'lea-bibliotheque.png') });
  });

  test('B-96 · Léa cherche « Coffre piégé » (MJ seul) : aucun résultat, et « coffre » ne trouve que « Coffre »', opts, async () => {
    await ouvrirBibliotheque(lea, uid);
    await carte(lea, 'Tonneau').waitFor();
    await lea.getByRole('searchbox', { name: 'Rechercher un asset' }).fill('piégé');
    await lea.getByText(rx('Aucun asset ne correspond.')).waitFor();
    assert.equal(await grille(lea).getByRole('listitem').count(), 0);
    await lea.getByRole('searchbox', { name: 'Rechercher un asset' }).fill('coffre');
    await carte(lea, 'Coffre').waitFor();
    assert.equal(await grille(lea).getByRole('listitem').count(), 1);
    assert.equal(await carte(lea, 'Coffre piégé').count(), 0);
  });

  test('B-96 · Léa lit l’image d’un asset visible, mais pas les octets d’un asset MJ seul', opts, async () => {
    const liste = await listeAssets(antor, uid);
    const visible = liste.find((a: Any) => a.nom === 'Tonneau');
    const cache = liste.find((a: Any) => a.nom === 'Coffre piégé');
    assert.ok(visible && cache);
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${visible.fichierId}`)).status(), 200);
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${cache.fichierId}`)).status(), 404);
    const laListe = (await api(lea, uid, 'assets')).corps.assets.map((a: Any) => a.nom);
    assert.equal(laListe.length, 8);
    assert.ok(!laListe.includes('Coffre piégé'));
  });

  // ---------------------------------------------------------------- E-26, côté joueuse
  test('E-26 · Léa : « Page introuvable. » sur la direction artistique, et l’API la lui refuse', opts, async () => {
    const pourLeMJ = await api(antor, uid, 'direction');
    assert.equal(pourLeMJ.status, 200, 'la direction existe pour le MJ');
    assert.ok(String(pourLeMJ.corps.texte).includes('Peinture'), 'et porte le texte semé');
    await ouvrirBibliotheque(lea, uid, '?onglet=direction');
    await lea.getByText(rx('Page introuvable.')).first().waitFor();
    assert.equal(await lea.getByText('Style MJ seul').count(), 0);
    assert.equal(await lea.getByRole('textbox', { name: 'Style', exact: true }).count(), 0);
    const r = await api(lea, uid, 'direction');
    assert.equal(r.status, 404);
    assert.ok(!JSON.stringify(r.corps).includes('Peinture'), 'le texte de la direction ne fuit pas');
    await lea.screenshot({ path: join(CAPTURES, 'lea-direction-introuvable.png') });
  });

  // ---------------------------------------------------------------- B-97 : le dépôt (critère de sortie)
  test('B-97 · Antor dépose trois images en « Objets », les sélectionne et règle l’empreinte « 2×1 »', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await segment(antor, 'Objets', 3).waitFor();
    await deposer(
      antor,
      [fichierPng('couchette-a.png'), fichierPng('couchette-b.png'), fichierPng('console.png')],
      'Objets',
      'Ajouter 3 fichiers',
    );
    await antor.getByText(rx('3 images ajoutées.')).waitFor();
    for (const nom of ['couchette-a', 'couchette-b', 'console']) await carte(antor, nom).waitFor();
    await segment(antor, 'Objets', 6).waitFor();
    await segment(antor, 'Tous', 12).waitFor();
    // Nommé depuis le fichier (extension ôtée), catégorie du dépôt, 1×1 par défaut pour un objet.
    const apres = await listeAssets(antor, uid);
    const a = apres.find((x: Any) => x.nom === 'couchette-a');
    assert.deepEqual([a.categorie, a.largeur, a.hauteur, a.visible], ['objet', 1, 1, true]);
    // Sélection, puis empreinte 2×1 sur les deux couchettes seulement.
    await antor.getByRole('checkbox', { name: 'Sélectionner couchette-a' }).check();
    await antor.getByRole('checkbox', { name: 'Sélectionner couchette-b' }).check();
    await antor.getByRole('toolbar', { name: 'Sélection d’assets' }).getByRole('button', { name: 'Empreinte' }).click();
    await antor.getByRole('menuitem', { name: '2×1' }).click();
    await carte(antor, 'couchette-a').getByText('2×1').waitFor();
    await carte(antor, 'couchette-b').getByText('2×1').waitFor();
    assert.equal(await carte(antor, 'console').getByText('1×1').count(), 1, 'la console non sélectionnée reste 1×1');
    await antor.screenshot({ path: join(CAPTURES, 'antor-empreinte-2x1.png') });
    await antor.reload();
    await carte(antor, 'couchette-a').getByText('2×1').waitFor();
    const relue = await listeAssets(antor, uid);
    const dims = (nom: string) => {
      const x = relue.find((y: Any) => y.nom === nom);
      return [x.largeur, x.hauteur];
    };
    assert.deepEqual(dims('couchette-a'), [2, 1]);
    assert.deepEqual(dims('couchette-b'), [2, 1]);
    assert.deepEqual(dims('console'), [1, 1]);
  });

  test('B-97 · le dépôt prend la catégorie choisie : « Murs » donne des assets sans empreinte', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await deposer(antor, [fichierPng('mur-nord.png')], 'Murs', 'Ajouter 1 fichier');
    await carte(antor, 'mur-nord').waitFor();
    const m = (await listeAssets(antor, uid)).find((x: Any) => x.nom === 'mur-nord');
    assert.deepEqual([m.categorie, m.largeur, m.hauteur], ['mur', null, null]);
    await segment(antor, 'Murs', 1).waitFor();
  });

  test('B-97 · un fichier qui n’est pas une image est refusé par son nom sans bloquer les autres', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await deposer(
      antor,
      [
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') },
        fichierPng('apres-le-refus.png'),
        { name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci n’est pas une image') },
        { name: 'dessin.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      ],
      null,
      'Ajouter 4 fichiers',
    );
    await carte(antor, 'apres-le-refus').waitFor();
    for (const nom of ['notes.txt', 'faux.png', 'dessin.svg']) {
      await antor.getByText(rx(`${nom} n’est pas une image.`)).first().waitFor();
    }
    const noms = (await listeAssets(antor, uid)).map((x: Any) => x.nom);
    for (const refuse of ['notes', 'notes.txt', 'faux', 'faux.png', 'dessin', 'dessin.svg']) {
      assert.ok(!noms.includes(refuse), `${refuse} n'est pas devenu un asset`);
    }
    await antor.screenshot({ path: join(CAPTURES, 'antor-fichier-refuse.png') });
  });

  test('B-97 · une empreinte sur un sol est refusée et le sol reste sans empreinte', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Sable').waitFor();
    await antor.getByRole('checkbox', { name: 'Sélectionner Sable' }).check();
    await antor.getByRole('toolbar', { name: 'Sélection d’assets' }).getByRole('button', { name: 'Empreinte' }).click();
    await antor.getByRole('menuitem', { name: '2×1' }).click();
    await antor.getByText(rx('Un sol ou un mur n’a pas d’empreinte.')).waitFor();
    const s = (await listeAssets(antor, uid)).find((x: Any) => x.nom === 'Sable');
    assert.deepEqual([s.largeur, s.hauteur], [null, null]);
  });

  test('B-97 · la recherche ignore la casse (« COFFRE » trouve « Coffre » et « Coffre piégé »)', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await antor.getByRole('searchbox', { name: 'Rechercher un asset' }).fill('COFFRE');
    await attendreCartes(antor, 2);
    await carte(antor, 'Coffre piégé').waitFor();
    await carte(antor, 'Coffre').waitFor();
  });

  test('B-97 · la recherche ignore les accents (« piege » trouve « Coffre piégé »)', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await antor.getByRole('searchbox', { name: 'Rechercher un asset' }).fill('piege');
    await carte(antor, 'Coffre piégé').waitFor({ timeout: 5000 });
    await attendreCartes(antor, 1);
  });

  test('B-97 · la recherche ignore la casse des lettres accentuées (« PIÉGÉ » trouve « Coffre piégé »)', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await antor.getByRole('searchbox', { name: 'Rechercher un asset' }).fill('PIÉGÉ');
    await carte(antor, 'Coffre piégé').waitFor({ timeout: 5000 });
    await attendreCartes(antor, 1);
  });

  test('B-97 · les étiquettes « bois » et « taverne » se combinent en ET : seul « Tonneau » porte les deux', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await attendreCartes(antor, 14);
    await antor.getByRole('button', { name: 'bois', exact: true }).click();
    await antor.getByRole('button', { name: 'taverne', exact: true }).click();
    await attendreCartes(antor, 1);
    await carte(antor, 'Tonneau').waitFor();
  });

  // ---------------------------------------------------------------- visibilité des assets
  test('B-96 · Antor rend « couchette-b » MJ seul : Léa ne le voit plus, ni dans la grille, ni en octets', opts, async () => {
    const avant = (await listeAssets(antor, uid)).find((x: Any) => x.nom === 'couchette-b');
    await ouvrirBibliotheque(lea, uid);
    await carte(lea, 'couchette-a').waitFor();
    await carte(lea, 'couchette-b').waitFor();
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${avant.fichierId}`)).status(), 200);
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'couchette-b').waitFor();
    await antor.getByRole('checkbox', { name: 'Sélectionner couchette-b' }).check();
    await antor.getByRole('toolbar', { name: 'Sélection d’assets' }).getByRole('button', { name: 'Visibilité' }).click();
    await antor.getByRole('menuitem', { name: /MJ/ }).first().click();
    await carte(antor, 'couchette-b').getByText('MJ', { exact: true }).waitFor();
    await ouvrirBibliotheque(lea, uid);
    await carte(lea, 'couchette-a').waitFor();
    assert.equal(await carte(lea, 'couchette-b').count(), 0);
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${avant.fichierId}`)).status(), 404);
  });

  // ---------------------------------------------------------------- B-97 : retrait
  test('B-97 · « Retirer… » dit « Utilisé sur 0 carte »', opts, async () => {
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Rocher').waitFor();
    await antor.getByRole('checkbox', { name: 'Sélectionner Rocher' }).check();
    await antor.getByRole('button', { name: 'Retirer…' }).click();
    await antor.getByRole('alertdialog').getByText(rx('Utilisé sur 0 carte')).waitFor({ timeout: 5000 });
  });

  test('B-97 · « Retirer… » compte les cartes, annule sans rien faire, confirme et laisse le fichier', opts, async () => {
    const r = await antor.request.post(`/api/univers/${uid}/outils/battlemap/assets`, {
      multipart: { categorie: 'objet', fichier: fichierPng('a-retirer.png') },
    });
    assert.equal(r.status(), 201);
    const fichierId = (await listeAssets(antor, uid)).find((x: Any) => x.nom === 'a-retirer').fichierId;
    // Un fichier adossé à un asset ne se supprime pas depuis la médiathèque.
    const suppr = await antor.request.delete(`/api/univers/${uid}/fichiers/${fichierId}`);
    assert.equal(suppr.status(), 409, 'fichier adossé à un asset : refus (conflit)');
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'a-retirer').waitFor();
    await antor.getByRole('checkbox', { name: 'Sélectionner a-retirer' }).check();
    await antor.getByRole('button', { name: 'Retirer…' }).click();
    const dialogue = antor.getByRole('alertdialog');
    await dialogue.getByText(rx('Utilisé sur 0 carte')).waitFor();
    await antor.screenshot({ path: join(CAPTURES, 'antor-retirer.png') });
    await dialogue.getByRole('button', { name: 'Annuler' }).click();
    await dialogue.waitFor({ state: 'detached' });
    assert.equal(await carte(antor, 'a-retirer').count(), 1, 'annuler ne retire rien');
    await antor.getByRole('button', { name: 'Retirer…' }).click();
    await antor.getByRole('alertdialog').getByText(rx('Utilisé sur 0 carte')).waitFor();
    await antor.getByRole('alertdialog').getByRole('button', { name: 'Retirer 1 asset' }).click();
    await carte(antor, 'a-retirer').waitFor({ state: 'detached' });
    assert.ok(!(await listeAssets(antor, uid)).some((x: Any) => x.nom === 'a-retirer'));
    assert.equal((await antor.request.get(`/api/univers/${uid}/fichiers/${fichierId}`)).status(), 200, 'le fichier reste dans la médiathèque');
  });

  // ---------------------------------------------------------------- B-97 : depuis la médiathèque
  test('B-97 · « Choisir dans la médiathèque » : le fichier choisi garde sa visibilité (MJ seul reste MJ seul)', opts, async () => {
    const ajout = async (nom: string) => {
      const r = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { fichier: fichierPng(nom) } });
      assert.equal(r.status(), 201);
      return ((await r.json()) as Any).id as number;
    };
    const idOuvert = await ajout('affiche-ouverte.png');
    const idSecret = await ajout('plan-secret.png');
    const m = await antor.request.patch(`/api/univers/${uid}/fichiers/${idSecret}`, { data: { visibilite: 'mj' } });
    assert.equal(m.status(), 200);
    await ouvrirBibliotheque(antor, uid);
    await carte(antor, 'Tonneau').waitFor();
    await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).click();
    const dialogue = antor.getByRole('dialog');
    await dialogue.waitFor();
    await antor.screenshot({ path: join(CAPTURES, 'antor-choisir-mediatheque.png') });
    const texte = await dialogue.innerText();
    assert.ok(texte.includes('affiche-ouverte'), 'le fichier libre est proposé');
    assert.ok(texte.includes('plan-secret'));
    assert.ok(!texte.includes('Tonneau'), 'un fichier déjà adossé à un asset n’est pas proposé');
    await ajouterLigne(dialogue, 'affiche-ouverte.png').click();
    await carteContenant(antor, 'affiche-ouverte').waitFor();
    await ajouterLigne(dialogue, 'plan-secret.png').click();
    await carteContenant(antor, 'plan-secret').waitFor();
    const liste = await listeAssets(antor, uid);
    const ouvert = liste.find((x: Any) => x.nom.startsWith('affiche-ouverte'));
    const secret = liste.find((x: Any) => x.nom.startsWith('plan-secret'));
    assert.equal(ouvert.visible, true);
    assert.equal(secret.visible, false);
    assert.equal(ouvert.fichierId, idOuvert, 'l’asset est adossé au fichier choisi, pas à une copie');
    const laListe = (await api(lea, uid, 'assets')).corps.assets.map((x: Any) => x.nom);
    assert.ok(laListe.some((n: string) => n.startsWith('affiche-ouverte')));
    assert.ok(!laListe.some((n: string) => n.startsWith('plan-secret')));
  });

  // ---------------------------------------------------------------- B-98 : la direction artistique
  test('B-98 · Antor écrit la direction artistique, enregistre, et la retrouve après rechargement', opts, async () => {
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    const style = antor.getByRole('textbox', { name: 'Style', exact: true });
    await style.waitFor();
    await style.fill('Acier usé, lumière froide, éviter le néon.');
    assert.equal(await enregistrer(antor), 200);
    const relu = await api(antor, uid, 'direction');
    assert.equal(relu.corps.texte, 'Acier usé, lumière froide, éviter le néon.');
    assert.equal(relu.corps.version, 2);
    await antor.reload();
    assert.equal(await antor.getByRole('textbox', { name: 'Style', exact: true }).inputValue(), 'Acier usé, lumière froide, éviter le néon.');
    await antor.screenshot({ path: join(CAPTURES, 'antor-direction.png') });
  });

  test('B-98 · une image de référence ajoutée est un fichier MJ seul que Léa ne peut pas lire', opts, async () => {
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    await antor.getByRole('textbox', { name: 'Style', exact: true }).waitFor();
    await antor.getByRole('heading', { name: /Images de référence · 1 \/ 8/ }).waitFor();
    await antor.locator('input[type=file]').first().setInputFiles([fichierPng('ref-lumiere.png')]);
    await antor.getByRole('heading', { name: /Images de référence · 2 \/ 8/ }).waitFor();
    await antor.getByRole('img', { name: 'ref-lumiere.png' }).waitFor();
    const d = (await api(antor, uid, 'direction')).corps;
    const ref = d.images.find((x: Any) => x.nom === 'ref-lumiere.png');
    assert.ok(ref);
    assert.equal((await antor.request.get(`/api/univers/${uid}/fichiers/${ref.fichierId}`)).status(), 200);
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${ref.fichierId}`)).status(), 404);
    // Et la médiathèque qu'elle lit ne la liste pas.
    const liste = await lea.request.get(`/api/univers/${uid}/fichiers`);
    assert.ok(!JSON.stringify(await liste.json()).includes('ref-lumiere'));
    // Et aucun asset n'a été créé par ce dépôt.
    assert.ok(!(await listeAssets(antor, uid)).some((x: Any) => x.nom === 'ref-lumiere'));
    await antor.screenshot({ path: join(CAPTURES, 'antor-reference.png') });
  });

  test('B-98 · une image de la médiathèque choisie comme référence devient MJ seul', opts, async () => {
    const r = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { fichier: fichierPng('croquis.png') } });
    const id = ((await r.json()) as Any).id as number;
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${id}`)).status(), 200, 'visible avant le choix');
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    await antor.getByRole('heading', { name: /Images de référence/ }).waitFor();
    await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).click();
    const dialogue = antor.getByRole('dialog');
    await ajouterLigne(dialogue, 'croquis.png').click();
    await antor.getByRole('img', { name: 'croquis.png' }).waitFor();
    assert.equal((await lea.request.get(`/api/univers/${uid}/fichiers/${id}`)).status(), 404, 'MJ seul après le choix');
    assert.equal((await antor.request.get(`/api/univers/${uid}/fichiers/${id}`)).status(), 200);
  });

  test('B-98 · la neuvième image de référence est refusée : « 8 images au plus. »', opts, async () => {
    const d = (await api(antor, uid, 'direction')).corps;
    const deja = d.images.length;
    for (let i = deja; i < 8; i++) {
      const r = await antor.request.post(`/api/univers/${uid}/outils/battlemap/direction/images`, {
        multipart: { fichier: fichierPng(`ref-${i}.png`) },
      });
      assert.equal(r.status(), 201);
    }
    assert.equal((await api(antor, uid, 'direction')).corps.images.length, 8);
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    await antor.getByRole('heading', { name: /Images de référence · 8 \/ 8/ }).waitFor();
    await antor.locator('input[type=file]').first().setInputFiles([fichierPng('neuvieme.png')]);
    await antor.getByText(rx('8 images au plus.')).first().waitFor();
    const apres = (await api(antor, uid, 'direction')).corps.images;
    assert.equal(apres.length, 8);
    assert.ok(!apres.some((x: Any) => x.nom === 'neuvieme.png'));
    await antor.screenshot({ path: join(CAPTURES, 'antor-neuf-references.png') });
  });

  test('B-98 · deux fenêtres : la seconde à enregistrer lit « Ce texte a changé depuis que vous l’avez ouvert. » et « Recharger »', opts, async () => {
    const second = (await connecte(browser, srv.base, 'antor')).page;
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    await ouvrirBibliotheque(second, uid, '?onglet=direction');
    await antor.getByRole('textbox', { name: 'Style', exact: true }).waitFor();
    await second.getByRole('textbox', { name: 'Style', exact: true }).waitFor();
    await antor.getByRole('textbox', { name: 'Style', exact: true }).fill('Première version.');
    assert.equal(await enregistrer(antor), 200);
    await second.getByRole('textbox', { name: 'Style', exact: true }).fill('Seconde version.');
    assert.equal(await enregistrer(second), 409);
    await second.getByText(rx('Ce texte a changé depuis que vous l’avez ouvert.')).waitFor();
    await second.getByRole('button', { name: 'Recharger' }).waitFor();
    assert.equal((await api(antor, uid, 'direction')).corps.texte, 'Première version.', 'rien n’a écrasé la première');
    await second.getByRole('button', { name: 'Recharger' }).click();
    await second.waitForFunction(() => (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value === 'Première version.');
    await second.screenshot({ path: join(CAPTURES, 'antor-texte-perime.png') });
  });

  test('E-26 · « Demander à l’assistant » reste désactivé', opts, async () => {
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    const bouton = antor.getByRole('button', { name: 'Demander à l’assistant' });
    await bouton.waitFor();
    assert.equal(await bouton.getAttribute('aria-disabled'), 'true', 'le bouton est désactivé jusqu’à la tranche assistant');
    assert.equal(await antor.getByRole('dialog').count(), 0, 'il n’ouvre rien');
    await bouton.click({ force: true });
    assert.equal(await antor.getByRole('dialog').count(), 0, 'un clic sur le bouton désactivé n’ouvre rien');
  });

  // ---------------------------------------------------------------- droits de l'API
  test('B-96 · par l’API, Léa qui écrit un asset ou la direction reçoit « introuvable » (404) et rien ne change', opts, async () => {
    const avant = await listeAssets(antor, uid);
    const cible = avant.find((x: Any) => x.nom === 'Tonneau');
    const url = `/api/univers/${uid}/outils/battlemap`;
    const post = await lea.request.post(`${url}/assets`, { multipart: { categorie: 'objet', fichier: fichierPng('intrus.png') } });
    const patch = await lea.request.patch(`${url}/assets`, { data: { ids: [cible.id], nom: 'Piraté' } });
    const suppr = await lea.request.delete(`${url}/assets`, { data: { ids: [cible.id] } });
    const direction = await lea.request.put(`${url}/direction`, { data: { texte: 'piraté', version: 1 } });
    const ref = await lea.request.post(`${url}/direction/images`, { multipart: { fichier: fichierPng('intrus-ref.png') } });
    for (const [nom, r] of [['POST', post], ['PATCH', patch], ['DELETE', suppr], ['PUT direction', direction], ['POST ref', ref]] as const) {
      assert.equal(r.status(), 404, `${nom} par un joueur`);
    }
    const apres = await listeAssets(antor, uid);
    assert.deepEqual(apres.map((x: Any) => x.nom).sort(), avant.map((x: Any) => x.nom).sort());
    assert.equal(apres.find((x: Any) => x.id === cible.id).nom, 'Tonneau');
    assert.notEqual((await api(antor, uid, 'direction')).corps.texte, 'piraté');
  });

  test('B-96 · Antor en mode Joueur lit comme une joueuse : pas d’onglet, E-26 « Page introuvable. », écriture refusée', opts, async () => {
    const ctx = await connecte(browser, srv.base, 'antor');
    const p = ctx.page;
    await ouvrirBibliotheque(p, uid);
    await carte(p, 'Coffre piégé').waitFor();
    await p.getByRole('radio', { name: 'Mode Joueur' }).click();
    await carte(p, 'Coffre piégé').waitFor({ state: 'detached' });
    await carte(p, 'Tonneau').waitFor();
    assert.equal(await p.getByRole('tab').count(), 0);
    assert.equal(await p.getByRole('checkbox').count(), 0);
    assert.equal(await p.getByRole('button', { name: 'Ajouter des images' }).count(), 0);
    const ecriture = await p.request.patch(`/api/univers/${uid}/outils/battlemap/assets?mode=joueur`, { data: { ids: [1], nom: 'X' } });
    assert.equal(ecriture.status(), 403, 'écriture du MJ en mode Joueur : refuse');
    const dir = await p.request.get(`/api/univers/${uid}/outils/battlemap/direction?mode=joueur`);
    assert.equal(dir.status(), 404, 'direction illisible en mode Joueur');
    await p.evaluate(() => {
      history.pushState({}, '', '?onglet=direction');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await p.getByText(rx('Page introuvable.')).first().waitFor();
    assert.notEqual((await listeAssets(antor, uid)).find((x: Any) => x.id === 1)?.nom, 'X');
    await ctx.ctx.close();
  });
});

// ==================================================================================================
// Monde bouchon sans le semis de la bibliothèque : l'outil est éteint, la bibliothèque vide.
// B-110 (l'outil suit le registre), « Supprimer les données de l'outil… », bibliothèque pleine.
// ==================================================================================================
describe('outil du registre, suppression des données et limite — bibliothèque vierge', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid: number;
  const regionOutil = (page: Any) => page.getByRole('region', { name: 'Bibliothèque' });
  const lien = (page: Any) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Bibliothèque', exact: true });
  async function ouvrirReglages(page: Any): Promise<void> {
    await page.goto(`/univers/${uid}/parametres`);
    await page.getByRole('tab', { name: 'Outils' }).click();
    await regionOutil(page).waitFor();
  }
  async function depotApi(page: Any, nom: string, categorie = 'objet'): Promise<number> {
    const r = await page.request.post(`/api/univers/${uid}/outils/battlemap/assets`, {
      multipart: { categorie, fichier: fichierPng(nom) },
    });
    return r.status();
  }

  before(async () => {
    if (skipBrowser) return;
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    uid = await universId(antor, "Éneria d'essai");
  });
  after(async () => {
    await browser?.close();
    await srv?.stop();
  });

  test('B-110 · outil éteint : ni entrée « Bibliothèque » dans la barre, ni écran, ni API', opts, async () => {
    await antor.goto(`/univers/${uid}`);
    await antor.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
    await antor.getByRole('link', { name: 'Concepteur de vaisseaux' }).waitFor();
    assert.equal(await lien(antor).count(), 0);
    await ouvrirBibliotheque(antor, uid);
    await antor.getByText(rx('Page introuvable.')).first().waitFor();
    assert.equal((await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).status(), 404);
    assert.equal((await antor.request.get(`/api/univers/${uid}/outils/battlemap/direction`)).status(), 404);
    await ouvrirReglages(antor);
    await antor.screenshot({ path: join(CAPTURES, 'reglages-outil-eteint.png') });
  });

  test('B-110 · le MJ active l’outil dans les réglages : l’entrée paraît, la bibliothèque est vide (MJ et joueuse)', opts, async () => {
    await ouvrirReglages(antor);
    await regionOutil(antor).getByRole('radio', { name: 'Activé', exact: true }).check();
    await regionOutil(antor).getByText(rx('Univers · Activé')).waitFor();
    await antor.goto(`/univers/${uid}`);
    await lien(antor).waitFor();
    await lien(antor).click();
    await antor.getByText(rx('Aucun asset. Déposez des images.')).waitFor();
    await segment(antor, 'Tous', 0).waitFor();
    await antor.screenshot({ path: join(CAPTURES, 'antor-bibliotheque-vide.png') });
    await lea.goto(`/univers/${uid}`);
    await lien(lea).waitFor();
    await lien(lea).click();
    await lea.getByText(rx('La bibliothèque est vide.')).waitFor();
    await lea.screenshot({ path: join(CAPTURES, 'lea-bibliotheque-vide.png') });
    // E-26 vide : le champ s'offre tel quel.
    await ouvrirBibliotheque(antor, uid, '?onglet=direction');
    await antor.getByText(rx('Aucune direction artistique.')).waitFor();
    await antor.getByText(rx('Aucune image de référence.')).waitFor();
  });

  test('B-110 · masquer la bibliothèque aux joueurs la retire de leur barre et de leur écran, pas de celle du MJ', opts, async () => {
    await ouvrirReglages(antor);
    const joueurs = regionOutil(antor).getByRole('checkbox', { name: 'Joueurs' });
    // Un clic force « oui », un second « non » (ce qui est vérifié par l'état, pas par un délai).
    await joueurs.click();
    await joueurs.click();
    await antor.waitForFunction(() => {
      const c = [...document.querySelectorAll('section, [role=region]')]
        .find((r) => r.getAttribute('aria-label') === 'Bibliothèque' || r.querySelector('h2')?.textContent === 'Bibliothèque')
        ?.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
      const j = c && c[1];
      return !!j && !j.checked && !j.indeterminate;
    });
    await lea.goto(`/univers/${uid}`);
    await lea.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
    assert.equal(await lien(lea).count(), 0, 'plus d’entrée pour la joueuse');
    await ouvrirBibliotheque(lea, uid);
    await lea.getByText(rx('Page introuvable.')).first().waitFor();
    assert.equal((await lea.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).status(), 404);
    await antor.goto(`/univers/${uid}`);
    await lien(antor).waitFor();
    assert.equal((await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).status(), 200, 'le MJ la lit encore');
    await lea.screenshot({ path: join(CAPTURES, 'lea-outil-masque.png') });
    // On remet la visibilité (un clic de plus : retour à « suit le système »).
    await ouvrirReglages(antor);
    await regionOutil(antor).getByRole('checkbox', { name: 'Joueurs' }).click();
    await antor.waitForFunction(() => {
      const r = [...document.querySelectorAll('section, [role=region]')].find((x) => x.querySelector('h2')?.textContent === 'Bibliothèque');
      const j = r?.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1];
      return !!j && j.checked && j.indeterminate;
    });
    await lea.goto(`/univers/${uid}`);
    await lien(lea).waitFor();
  });

  test('B-110 · « Supprimer les données de l’outil… » compte 3 assets, 1 image de référence et 1 direction puis les efface sans toucher aux fichiers', opts, async () => {
    // Une bibliothèque vide n'a rien à effacer.
    await ouvrirReglages(antor);
    await regionOutil(antor).getByRole('button', { name: 'Supprimer les données de l’outil…' }).click();
    await antor.getByRole('dialog').getByText(rx('Cet outil n’a aucune donnée à supprimer.')).waitFor();
    await antor.getByRole('dialog').getByRole('button', { name: 'Fermer' }).first().click();
    // Trois assets, une direction écrite, une référence.
    for (const nom of ['lit.png', 'console.png', 'sas.png']) assert.equal(await depotApi(antor, nom), 201);
    const dir = await antor.request.put(`/api/univers/${uid}/outils/battlemap/direction`, { data: { texte: 'Métal usé.', version: 0 } });
    assert.equal(dir.status(), 200);
    const ref = await antor.request.post(`/api/univers/${uid}/outils/battlemap/direction/images`, { multipart: { fichier: fichierPng('ref.png') } });
    assert.equal(ref.status(), 201);
    const fichiers = [
      ...(await listeAssets(antor, uid)).map((a: Any) => a.fichierId),
      ...(await api(antor, uid, 'direction')).corps.images.map((i: Any) => i.fichierId),
    ];
    assert.equal(fichiers.length, 4);
    // Léa ne peut ni compter ni effacer.
    const parLea = await lea.request.get(`/api/univers/${uid}/outils/battlemap/assets/suppression`);
    assert.ok([403, 404].includes(parLea.status()), `Léa compte les données de l’outil : ${parLea.status()}`);
    await ouvrirReglages(antor);
    await regionOutil(antor).getByRole('button', { name: 'Supprimer les données de l’outil…' }).click();
    const dialogue = antor.getByRole('dialog');
    await dialogue.getByText('3 assets, 1 image de référence et 1 direction artistique seront effacés.').waitFor();
    await antor.screenshot({ path: join(CAPTURES, 'suppression-comptes.png') });
    // Compter n'efface rien.
    assert.equal((await listeAssets(antor, uid)).length, 3);
    await dialogue.getByRole('button', { name: 'Annuler' }).click();
    await dialogue.waitFor({ state: 'detached' });
    assert.equal((await listeAssets(antor, uid)).length, 3, 'annuler n’efface rien');
    await regionOutil(antor).getByRole('button', { name: 'Supprimer les données de l’outil…' }).click();
    await antor.getByRole('dialog').getByText('3 assets, 1 image de référence et 1 direction artistique seront effacés.').waitFor();
    await antor.getByRole('dialog').getByRole('button', { name: 'Supprimer les données' }).click();
    await antor.getByRole('dialog').getByText('Données supprimées : 3 assets, 1 image de référence, 1 direction artistique.').waitFor();
    await antor.getByRole('dialog').getByRole('button', { name: 'Fermer' }).first().click();
    assert.equal((await listeAssets(antor, uid)).length, 0, 'les assets sont effacés');
    const d = (await api(antor, uid, 'direction')).corps;
    assert.equal(d.images.length, 0);
    assert.ok(!d.texte, 'le texte de la direction est effacé');
    for (const id of fichiers) {
      assert.equal((await antor.request.get(`/api/univers/${uid}/fichiers/${id}`)).status(), 200, `le fichier ${id} reste dans la médiathèque`);
    }
    const media = JSON.stringify(await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json());
    for (const nom of ['lit.png', 'console.png', 'sas.png', 'ref.png']) assert.ok(media.includes(nom), `${nom} est encore listé`);
    await ouvrirReglages(antor);
    await regionOutil(antor).getByRole('button', { name: 'Supprimer les données de l’outil…' }).click();
    await antor.getByRole('dialog').getByText(rx('Cet outil n’a aucune donnée à supprimer.')).waitFor();
  });

  test('B-110 · désactiver l’outil garde tout : les assets reparaissent à la réactivation', opts, async () => {
    assert.equal(await depotApi(antor, 'garde.png'), 201);
    await ouvrirReglages(antor);
    await regionOutil(antor).getByRole('radio', { name: 'Désactivé', exact: true }).check();
    await regionOutil(antor).getByText(rx('Univers · Désactivé')).waitFor();
    assert.equal((await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).status(), 404);
    await regionOutil(antor).getByRole('radio', { name: 'Activé', exact: true }).check();
    await regionOutil(antor).getByText(rx('Univers · Activé')).waitFor();
    assert.deepEqual((await listeAssets(antor, uid)).map((a: Any) => a.nom), ['garde']);
  });

  test('B-96 · bibliothèque pleine à 5 000 assets : le 5 001e est refusé et l’écran le dit', opts, async () => {
    const dejaLa = (await listeAssets(antor, uid)).length;
    assert.equal(dejaLa, 1);
    const cible = 5000 - dejaLa;
    let suivant = 0;
    const echecs: number[] = [];
    async function ouvrier(): Promise<void> {
      while (suivant < cible) {
        const i = suivant++;
        const r = await antor.request.post(`/api/univers/${uid}/outils/battlemap/assets`, {
          multipart: { categorie: 'decor', fichier: fichierPng(`masse-${i}.png`) },
        });
        if (r.status() !== 201) echecs.push(r.status());
      }
    }
    await Promise.all(Array.from({ length: 12 }, ouvrier));
    assert.deepEqual(echecs, [], 'les 4 999 premiers entrent');
    const plein = await antor.request.post(`/api/univers/${uid}/outils/battlemap/assets`, {
      multipart: { categorie: 'decor', fichier: fichierPng('de-trop.png') },
    });
    assert.equal(plein.status(), 409);
    assert.ok(JSON.stringify(await plein.json()).includes('bibliotheque_pleine'));
    assert.equal((await listeAssets(antor, uid)).length, 5000);
    await ouvrirBibliotheque(antor, uid);
    await antor.getByText(rx('Bibliothèque pleine (5 000 assets).')).first().waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Ajouter des images' }).isDisabled(), true);
    assert.equal(await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).isDisabled(), true);
    await antor.screenshot({ path: join(CAPTURES, 'antor-bibliotheque-pleine.png') });
  });
});
