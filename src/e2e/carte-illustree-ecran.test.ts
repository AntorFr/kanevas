// Black-box tests of kanevas-cg-ecran-carte-illustree, written from its exit criterion and
// docs/ecrans.md « E-11 Carte ». Real server in stub mode + real Chromium; expected texts are literals.
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = '';
let cid = 0;
let aldric = 0;
let secrete = 0;

function crc(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
/** A w×h PNG of one colour. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => ligne));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const ROUGE = png(160, 100, [200, 40, 40]);
const BLEU = png(100, 100, [40, 40, 200]);

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}
const base = () => `/api/univers/${uid}/cartes/${cid}`;
async function ouvrir(page: Any, suffixe = '') {
  await page.goto(`/univers/${uid}/cartes/${cid}${suffixe}`);
  await page.locator('h1, [role=alert]').first().waitFor();
  await attendre(page);
}
const token = (page: Any, titre: string) => page.getByRole('button', { name: rxExact(titre) });
async function elements(): Promise<Any[]> {
  return (await api(antor, 'GET', base())).body.elements;
}
async function pos(page: Any, titre: string) {
  const b = await page.getByRole('button', { name: rxExact(titre) }).first().boundingBox();
  const c = await page.locator('.carte-cadre').boundingBox();
  return { b, c };
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Brume');
  await antor.getByRole('heading', { name: 'Brume', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
  const reglage = async (fid: number, lisent: boolean) => {
    const sec = (await api(antor, 'POST', `/api/univers/${uid}/fiches/${fid}/sections`, { titre: 'Présentation', contenu: 'x' })).body;
    assert.equal((await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${fid}/sections/${sec.id}`, { joueursLisent: lisent })).status, 200);
  };
  aldric = (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).body.id;
  secrete = (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'faction', titre: 'Les Ombres' })).body.id;
  await reglage(aldric, true);
  await reglage(secrete, false);
  cid = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'La ville de Brume', forme: 'illustree' })).body.id;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('sans fond : « Ajouter un fond », cadre 16/10, vide MJ ; puis le fond part dès le choix et se change', opts, async () => {
  await ouvrir(antor);
  let t = await texte(antor);
  assert.ok(t.includes('Aucun token. Ajoutez une fiche pour la placer sur la carte.'));
  assert.ok(t.includes('MJ seul'));
  const c = await antor.locator('.carte-cadre').boundingBox();
  assert.ok(Math.abs(c.width / c.height - 1.6) < 0.05, `16/10 attendu, ${c.width}x${c.height}`);
  await antor.screenshot({ path: '/tmp/e11-vide-mj.png' });

  await antor.getByLabel('Image de fond').setInputFiles({ name: 'brume.png', mimeType: 'image/png', buffer: ROUGE });
  await antor.getByRole('button', { name: rxExact('Changer le fond') }).waitFor();
  assert.equal(await antor.getByRole('button', { name: rxExact('Ajouter un fond') }).count(), 0);
  const f1 = await api(antor, 'GET', `${base()}/fond`);
  assert.equal(f1.status, 200);

  await antor.getByLabel('Image de fond').setInputFiles({ name: 'autre.png', mimeType: 'image/png', buffer: BLEU });
  await antor.waitForFunction(async (u: string) => {
    const r = await fetch(u);
    return (await r.arrayBuffer()).byteLength !== 0;
  }, `${base()}/fond`);
  const buf = await antor.evaluate(async (u: string) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), `${base()}/fond`);
  assert.deepEqual(Buffer.from(buf), BLEU, 'le nouveau fond remplace l’ancien');
  await ouvrir(antor);
  const c2 = await antor.locator('.carte-cadre').boundingBox();
  assert.ok(Math.abs(c2.width / c2.height - 1) < 0.05, 'cadre aux proportions du fond (1/1)');
  await antor.getByLabel('Image de fond').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await antor.getByText(rx("Erreur : ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP).")).waitFor();
  await antor.screenshot({ path: '/tmp/e11-fond-refuse.png' });
  const f2 = await antor.evaluate(async (u: string) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), `${base()}/fond`);
  assert.deepEqual(Buffer.from(f2), BLEU, 'le fond d’avant reste');
});

test('fenêtre Ajouter une fiche : type, recherche, Ajouter, Déjà sur la carte ; token au centre', opts, async () => {
  await ouvrir(antor);
  await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
  const dlg = antor.getByRole('dialog');
  await dlg.waitFor();
  await attendre(antor);
  await dlg.getByLabel('Type de fiche').selectOption('personnage');
  await dlg.getByLabel('Chercher une fiche').fill('Zzzz');
  await dlg.getByRole('button', { name: rxExact('Chercher') }).click();
  await dlg.getByText('Aucune fiche ne correspond.').waitFor();
  await antor.screenshot({ path: '/tmp/e11-fenetre-vide.png' });
  await dlg.getByLabel('Chercher une fiche').fill('Aldric');
  await dlg.getByRole('button', { name: rxExact('Chercher') }).click();
  await dlg.getByText('Maître Aldric').waitFor();
  await dlg.getByRole('button', { name: rxExact('Ajouter') }).click();
  await dlg.getByText('Déjà sur la carte').waitFor();
  assert.equal(await dlg.getByRole('button', { name: rxExact('Ajouter') }).count(), 0);
  await antor.screenshot({ path: '/tmp/e11-fenetre-deja.png' });
  await dlg.getByRole('button', { name: rxExact('Fermer') }).click();
  const e = await elements();
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].x, e[0].y], [50, 50]);
  await token(antor, 'Maître Aldric').waitFor();
});

test('type sans fiche : « Aucune fiche de ce type. »', opts, async () => {
  await ouvrir(antor);
  await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
  const dlg = antor.getByRole('dialog');
  await dlg.getByLabel('Type de fiche').selectOption('quete');
  await dlg.getByText('Aucune fiche de ce type.').waitFor();
  await antor.screenshot({ path: '/tmp/e11-fenetre-type-vide.png' });
});

test('token : zone ≥ 44 px, glisser puis recharger, clavier 1 % puis 5 %', opts, async () => {
  await ouvrir(antor);
  const { b, c } = await pos(antor, 'Maître Aldric');
  assert.ok(b.width >= 44 && b.height >= 44, `zone ${b.width}x${b.height}`);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await antor.mouse.move(cx, cy);
  await antor.mouse.down();
  await antor.mouse.move(cx + c.width * 0.2, cy + c.height * 0.1, { steps: 8 });
  await antor.mouse.up();
  await attendre(antor);
  const e = (await elements())[0];
  assert.ok(Math.abs(e.x - 70) < 3 && Math.abs(e.y - 60) < 3, `attendu ≈ (70, 60), obtenu (${e.x}, ${e.y})`);
  await antor.reload();
  await attendre(antor);
  const apres = await pos(antor, 'Maître Aldric');
  const rel = (apres.b.x + apres.b.width / 2 - apres.c.x) / apres.c.width * 100;
  assert.ok(Math.abs(rel - e.x) < 2, 'à sa nouvelle place après rechargement');
  await antor.screenshot({ path: '/tmp/e11-deplace.png' });

  const x0 = e.x;
  await token(antor, 'Maître Aldric').focus();
  await antor.keyboard.press('ArrowRight');
  await attendre(antor);
  assert.ok(Math.abs((await elements())[0].x - (x0 + 1)) < 0.01, 'flèche : +1 %');
  await antor.keyboard.press('Shift+ArrowRight');
  await attendre(antor);
  assert.ok(Math.abs((await elements())[0].x - (x0 + 6)) < 0.01, 'Maj+flèche : +5 %');
  assert.ok((await texte(antor)).includes('Flèches : déplacer de 1 % (Maj : 5 %)'));
});

test('panne pendant le déplacement : retour en place et message', opts, async () => {
  await ouvrir(antor);
  const avant = (await elements())[0];
  await antor.route('**/elements/*', (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
  await token(antor, 'Maître Aldric').focus();
  await antor.keyboard.press('ArrowLeft');
  await antor.getByText("L'action n'a pas abouti. Réessayez.").or(antor.getByText('L’action n’a pas abouti. Réessayez.')).first().waitFor();
  await antor.screenshot({ path: '/tmp/e11-echec-deplacement.png' });
  await antor.unroute('**/elements/*');
  const apres = (await elements())[0];
  assert.deepEqual([apres.x, apres.y], [avant.x, avant.y]);
  const p = await pos(antor, 'Maître Aldric');
  const rel = (p.b.x + p.b.width / 2 - p.c.x) / p.c.width * 100;
  assert.ok(Math.abs(rel - avant.x) < 2, 'le token est revenu à sa place');
});

test('visibilité : Léa voit le fond et Aldric, ni la faction secrète ni son titre ; touche le token → fiche sans édition', opts, async () => {
  const rs = await api(antor, 'POST', `${base()}/elements`, { ficheId: secrete, x: 10, y: 10 });
  assert.equal(rs.status, 201, JSON.stringify(rs.body));
  await ouvrir(antor);
  const ids = (await elements()).map((e: Any) => e.titre);
  assert.deepEqual(ids.sort(), ['Les Ombres', 'Maître Aldric']);
  // Léa on a hidden map
  await ouvrir(lea);
  await lea.getByText(rx('Page introuvable.')).waitFor();
  await lea.screenshot({ path: '/tmp/e11-joueuse-cachee.png' });

  await antor.getByRole('button', { name: rxExact('Rendre visible') }).click();
  await antor.getByText('Visible des joueurs').waitFor();
  await ouvrir(lea);
  await lea.getByRole('link', { name: rxExact('Maître Aldric') }).first().waitFor();
  const t = await texte(lea);
  assert.ok(!t.includes('Les Ombres') && !t.includes('faction secrète'), 'ni titre de la faction');
  assert.ok(!t.includes('Rendre visible') && !t.includes('Cacher aux joueurs') && !t.includes('Renommer') && !t.includes('Changer le fond') && !t.includes('Ajouter une fiche') && !t.includes('Retirer'));
  assert.equal(await lea.locator('.carte-fond').count() >= 1, true, 'le fond est là');
  assert.equal(await lea.locator('.carte-token').count(), 1, 'un seul token pour Léa');
  await lea.screenshot({ path: '/tmp/e11-joueuse.png' });
  assert.equal((await api(lea, 'GET', `${base()}`)).body.elements.length, 1);
  assert.equal((await api(lea, 'POST', `${base()}/elements`, { ficheId: aldric, x: 50, y: 50 })).status, 403);
  assert.equal((await api(lea, 'PUT', `${base()}/fond`)).status >= 400, true);
  await lea.locator('.carte-token').first().click();
  await lea.waitForURL(rx(`/fiche/${aldric}`));
  await lea.getByRole('heading', { name: 'Maître Aldric' }).first().waitFor();
});

test('mode Joueur : Antor voit comme Léa ; carte cachée → phrase et Quitter', opts, async () => {
  await ouvrir(antor);
  await antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check().catch(async () => antor.getByText('Mode Joueur').first().click());
  await attendre(antor);
  await antor.locator('.carte-fond').first().waitFor();
  const direct = await api(antor, 'GET', `${base()}?mode=joueur`);
  assert.deepEqual(direct.body.elements.map((e: Any) => e.titre), ['Maître Aldric'], 'le serveur filtre en mode Joueur');
  await antor.waitForFunction(() => document.querySelectorAll('.carte-token').length === 1);
  const t = await texte(antor);
  for (const interdit of ['Les Ombres', 'Retirer', 'Renommer', 'Changer le fond', 'Ajouter une fiche', 'Rendre visible', 'Cacher aux joueurs']) assert.ok(!t.includes(interdit), `« ${interdit} » en mode Joueur : ${t}`);
  assert.equal(await antor.locator('.carte-token').count(), 1);
  await antor.screenshot({ path: '/tmp/e11-mj-mode-joueur.png' });
  await antor.getByRole('radio', { name: rxExact('Mode MJ') }).check();
  await antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).click();
  await antor.getByText('MJ seul').waitFor();
  await antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
  await antor.getByText('Les joueurs ne voient pas cette carte : elle n’est pas visible.').or(antor.getByText("Les joueurs ne voient pas cette carte : elle n'est pas visible.")).first().waitFor();
  await antor.screenshot({ path: '/tmp/e11-mode-joueur-cachee.png' });
  await antor.getByRole('button', { name: rxExact('Quitter le mode Joueur') }).click();
  await antor.getByRole('button', { name: rxExact('Renommer') }).waitFor();
  await antor.getByRole('button', { name: rxExact('Rendre visible') }).click();
  await antor.getByText('Visible des joueurs').waitFor();
});

test('retrait : confirmation, rien au premier clic, Annuler, puis la fiche reste', opts, async () => {
  await ouvrir(antor);
  const ligne = antor.locator('li').filter({ has: antor.getByRole('link', { name: rxExact('Maître Aldric') }) });
  await ligne.getByRole('button', { name: rxExact('Retirer de la carte') }).click();
  await antor.getByText('Retirer « Maître Aldric » de cette carte ? La fiche reste.').waitFor();
  assert.equal((await elements()).filter((e: Any) => e.titre === 'Maître Aldric').length, 1);
  await antor.screenshot({ path: '/tmp/e11-retrait-confirme.png' });
  await antor.getByRole('button', { name: rxExact('Annuler') }).click();
  assert.equal((await elements()).filter((e: Any) => e.titre === 'Maître Aldric').length, 1);
  await ligne.getByRole('button', { name: rxExact('Retirer de la carte') }).click();
  await antor.getByRole('alertdialog').getByRole('button', { name: rxExact('Retirer de la carte') }).click();
  await attendre(antor);
  assert.equal((await elements()).filter((e: Any) => e.titre === 'Maître Aldric').length, 0);
  assert.equal((await api(antor, 'GET', `/api/univers/${uid}/fiches/${aldric}`)).status, 200);
  // via the token's panel
  await api(antor, 'POST', `${base()}/elements`, { ficheId: aldric, x: 50, y: 50 });
  await ouvrir(antor);
  await token(antor, 'Maître Aldric').click();
  await antor.getByRole('link', { name: rxExact('Ouvrir la fiche') }).waitFor();
  await antor.getByRole('button', { name: rxExact('Retirer de la carte') }).first().click();
  await antor.getByText('Retirer « Maître Aldric » de cette carte ? La fiche reste.').waitFor();
  assert.equal((await elements()).filter((e: Any) => e.titre === 'Maître Aldric').length, 1, 'rien retiré au premier clic');
});

test('renommer : champ, vide refusé, enregistré', opts, async () => {
  await ouvrir(antor);
  await antor.getByRole('button', { name: rxExact('Renommer') }).click();
  await antor.getByLabel('Titre').fill('');
  await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await antor.getByText('Erreur : le titre est obligatoire.').waitFor();
  await antor.getByLabel('Titre').fill('x'.repeat(81));
  await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await antor.getByText('Erreur : 80 caractères au plus.').waitFor();
  await antor.getByLabel('Titre').fill('Brume du soir');
  await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await antor.getByRole('heading', { name: 'Brume du soir', level: 1 }).waitFor();
  assert.equal((await api(antor, 'GET', base())).body.carte.titre, 'Brume du soir');
});

test('fond qui ne charge pas : message, Réessayer, liste « Sur la carte » ; tokens non posés', opts, async () => {
  await antor.route('**/cartes/*/fond*', (r: Any) => r.fulfill({ status: 500, body: '' }));
  await ouvrir(antor);
  await antor.getByText('Le fond de la carte n’a pas pu être chargé.').or(antor.getByText("Le fond de la carte n'a pas pu être chargé.")).first().waitFor();
  await antor.getByRole('button', { name: rxExact('Réessayer') }).waitFor();
  assert.equal(await antor.locator('.carte-cadre button.carte-token').count(), 0, 'tokens non posés');
  assert.ok((await texte(antor)).includes('Sur la carte'));
  await antor.getByRole('link', { name: rxExact('Maître Aldric') }).waitFor();
  await antor.screenshot({ path: '/tmp/e11-fond-casse.png' });
  await antor.unroute('**/cartes/*/fond*');
  await antor.getByRole('button', { name: rxExact('Réessayer') }).click();
  await token(antor, 'Maître Aldric').waitFor();
});

test('la 101e fiche : « Cette carte porte déjà 100 éléments. »', opts, async () => {
  const cur = (await elements()).length;
  for (let i = cur; i < 100; i++) {
    const rf = await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: `Lieu ${String(i).padStart(3, '0')}` });
    assert.equal(rf.status, 201, JSON.stringify(rf.body));
    const f = rf.body.id;
    const re = await api(antor, 'POST', `${base()}/elements`, { ficheId: f, x: 10, y: 10 });
    assert.equal(re.status, 201, `${i} ${JSON.stringify(re.body)}`);
  }
  await ouvrir(antor);
  await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
  const dlg = antor.getByRole('dialog');
  await dlg.getByLabel('Type de fiche').selectOption('personnage');
  await dlg.getByText('Maître Aldric').waitFor();
  const autre = (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'quete', titre: 'Quête de trop' })).body.id;
  await dlg.getByLabel('Type de fiche').selectOption('quete');
  await dlg.getByText('Quête de trop').waitFor();
  await dlg.getByRole('button', { name: rxExact('Ajouter') }).click();
  await antor.getByText('Cette carte porte déjà 100 éléments.').waitFor();
  await antor.screenshot({ path: '/tmp/e11-100.png' });
  assert.equal((await elements()).length, 100);
  assert.ok(autre > 0);
});

test('téléphone : une colonne, sans débordement horizontal', opts, async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, baseURL: srv.base });
  const page = await ctx.newPage();
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: /Antor/ }).click();
  await page.waitForLoadState('networkidle');
  await ouvrir(page);
  const larg = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert.ok(larg.s <= larg.w + 1, `débordement ${larg.s} > ${larg.w}`);
  await page.screenshot({ path: '/tmp/e11-telephone.png', fullPage: true });
  await ctx.close();
});

test('API : adresse inconnue → Page introuvable ; écriture de Léa 403', opts, async () => {
  await lea.goto(`/univers/${uid}/cartes/999999`);
  await lea.getByText(rx('Page introuvable.')).waitFor();
  assert.equal((await api(lea, 'PATCH', base(), { titre: 'pirate' })).status, 403);
});
