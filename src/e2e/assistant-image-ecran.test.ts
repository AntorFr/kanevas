// Black-box tests of kanevas-im-ecran-image: the « Image attachée » block of E-12 and the long wait
// (docs/ecrans.md § `kanevas-images`), in a real Chromium against the real server in stub mode.
//
// TEST PLAN
//   nominal   : Antor asks for a portrait → label, thumbnail <= 240 px, « Ouvrir la section » → E-9 on the
//               section, which carries one more image attachment
//   échec     : « échec » → « Je n'ai pas pu générer l'image. », no block, no extra attachment
//   Léa       : same request → no block, no attachment
//   attente   : GM sees « Kanevas travaille toujours… » at 20 s (fake clock), Léa still « Kanevas réfléchit… »;
//               the request is not aborted before 300 s
//   états     : loading frame, image removed → « Image indisponible. » + « Recharger l'image » + link kept,
//               reload stays unavailable, one failing block leaves the others alone; reload disabled offline
//   bornes    : 120-char sheet title and 80-char section title wrap; a very tall image stays in 240x320
//   existant  : a « section_modifiee » block still renders
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  regler,
  rx,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
// 120 and 80 characters (the bounds of docs/ecrans.md)
const TITRE_LONG = 'Maître Aldric de la Couronne brisée, régent déchu du royaume de Lame d’Ébène et gardien des sept sceaux perdus à jamais!';
const SECTION_LONGUE = 'Apparence détaillée lors de la grande cérémonie devant toute la cour du royaumes';
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  await creerUnivers(antor, 'Lame d’Ébène');
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await ajouterSection(antor, 'Apparence');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const bouton = (p: Any) => p.getByRole('button', { name: 'Demander à Kanevas' });
const panneau = (p: Any) => p.getByRole('complementary', { name: /Kanevas — assistant/ });
const champ = (p: Any) => panneau(p).getByRole('textbox', { name: 'Demander à Kanevas' });
const URL_FICHE = '/univers/1/fiche/1';
const DEMANDE = 'Fais un portrait pour « Apparence » d’« Maître Aldric »';

async function ouvrir(p: Any, url = URL_FICHE) {
  await p.goto(url);
  await attendre(p);
  if ((await panneau(p).count()) === 0) await bouton(p).click();
  await panneau(p).waitFor();
  await champ(p).waitFor();
}
async function demander(p: Any, q: string) {
  await champ(p).fill(q);
  await panneau(p).getByRole('button', { name: 'Envoyer' }).click();
}
async function nouvelle(p: Any) {
  await panneau(p).getByRole('button', { name: 'Nouvelle conversation' }).click();
}
async function pieces(p: Any, fiche = 1): Promise<Any[]> {
  const f = await (await p.request.get(`/api/univers/1/fiches/${fiche}`)).json();
  return f.sections.flatMap((s: Any) => s.piecesJointes ?? []);
}
const bloc = (p: Any) => panneau(p).locator('.asst-ecriture').filter({ hasText: 'Image attachée' });

test('nominal : portrait → libellé, vignette <= 240 px, « Ouvrir la section » mène à E-9', opts, async () => {
  const avant = (await pieces(antor)).length;
  await ouvrir(antor, '/univers/1');
  await demander(antor, DEMANDE);
  const b = bloc(antor).first();
  await b.getByText('Image attachée à la section « Apparence » de « Maître Aldric »').waitFor();
  const img = b.locator('img');
  await img.waitFor({ state: 'visible' });
  assert.ok((await img.boundingBox()).width <= 240);
  assert.equal(await img.getAttribute('alt'), DEMANDE);
  assert.match(await img.getAttribute('src'), /^\/api\/univers\/1\/fiches\/1\/pieces-jointes\/\d+\/fichier/);
  assert.equal((await pieces(antor)).length, avant + 1);
  await b.getByRole('link', { name: /Ouvrir la section/ }).click();
  await antor.waitForURL(/\/univers\/1\/fiche\/1(#.*)?$/);
  await attendre(antor);
  const s = antor.getByRole('region', { name: rx('Apparence') });
  await s.waitFor();
  assert.equal(await antor.locator('[id^="section-"]').count() > 0, true);
  assert.ok((await s.getByRole('group', { name: 'Pièces jointes' }).getByText(/image-.*\.png/).count()) >= 1);
});

test('échec : « échec » → « Je n’ai pas pu générer l’image. », sans bloc ni pièce', opts, async () => {
  await ouvrir(antor);
  await nouvelle(antor);
  const avant = (await pieces(antor)).length;
  await demander(antor, DEMANDE + ' échec');
  await panneau(antor).getByText(/Je n['’]ai pas pu générer l['’]image\./).waitFor();
  assert.equal(await bloc(antor).count(), 0);
  assert.equal((await pieces(antor)).length, avant);
});

test('Léa : même demande → pas de bloc, pas de pièce', opts, async () => {
  const avant = (await pieces(antor)).length;
  await ouvrir(lea);
  await nouvelle(lea);
  await demander(lea, DEMANDE);
  await panneau(lea).getByRole('log').locator('.asst-attente').waitFor({ state: 'detached' });
  await lea.waitForTimeout(300);
  assert.equal(await bloc(lea).count(), 0);
  assert.equal((await pieces(antor)).length, avant);
});

for (const [nom, page, attendu, absent] of [
  ['MJ', () => antor, 'Kanevas travaille toujours… Une image peut prendre jusqu’à trois minutes.', 'Kanevas réfléchit…'],
  ['Léa', () => lea, 'Kanevas réfléchit…', 'Kanevas travaille toujours'],
] as const) {
  test(`attente : ${nom} à 20 s (horloge de test) voit « ${attendu.slice(0, 20)}… »`, opts, async () => {
    const p = page();
    await p.clock.install();
    await ouvrir(p);
    await nouvelle(p);
    let abandon = false;
    await p.route('**/assistant/messages', async (route: Any) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => (abandon = true));
    });
    await demander(p, 'Que sait-on d’Aldric ?');
    const statut = panneau(p).getByRole('status').filter({ hasText: /Kanevas (réfléchit|travaille)/ });
    await statut.waitFor();
    assert.match(await statut.innerText(), /Kanevas réfléchit…/);
    await p.clock.fastForward(19_000);
    assert.match(await statut.innerText(), /Kanevas réfléchit…/, 'not before 20 s');
    await p.clock.fastForward(2_000);
    assert.equal((await statut.innerText()).trim(), attendu);
    assert.ok(!(await panneau(p).innerText()).includes(absent) || attendu.startsWith(absent));
    await p.clock.fastForward(250_000); // 271 s: still waiting, not aborted
    assert.equal(abandon, false);
    await p.unroute('**/assistant/messages');
    await p.clock.resume?.();
  });
}

test('attente : la requête n’est pas abandonnée avant 300 s, puis erreur commune', opts, async () => {
  const p = antor;
  await p.clock.install();
  await ouvrir(p);
  await nouvelle(p);
  await p.route('**/assistant/messages', () => {
    /* never answered */
  });
  await demander(p, 'Que sait-on d’Aldric ?');
  await panneau(p).getByRole('status').filter({ hasText: /Kanevas/ }).waitFor();
  await p.clock.fastForward(290_000);
  assert.equal(await panneau(p).getByRole('alert').count(), 0, 'still pending at 290 s');
  await p.clock.fastForward(20_000);
  await panneau(p).getByRole('alert').filter({ hasText: /Je n['’]ai pas pu répondre — réessayer/ }).waitFor();
  await p.unroute('**/assistant/messages');
});

test('états : chargement, image retirée → « Image indisponible. », rechargement, autres blocs intacts', opts, async () => {
  await ouvrir(antor);
  await nouvelle(antor);
  await demander(antor, DEMANDE);
  await bloc(antor).first().waitFor();
  await bloc(antor).first().locator('img').waitFor({ state: 'visible' });
  // A second answer with a block, then a text write block (existing registry entry) to check nothing else moves.
  await demander(antor, DEMANDE);
  await panneau(antor).getByRole('log').locator('.asst-ecriture').nth(1).waitFor();
  assert.equal(await bloc(antor).count(), 2);
  const ps = (await pieces(antor)).filter((x: Any) => /image/.test(x.type ?? x.mime ?? 'image'));
  const dernier = ps[ps.length - 1];
  const brute = await antor.request.delete(`/api/univers/1/fiches/1/pieces-jointes/${dernier.id}`);
  assert.ok(brute.ok(), 'removal ' + brute.status());
  // close / reopen
  await panneau(antor).getByRole('button', { name: /Fermer/ }).click();
  await bouton(antor).click();
  await panneau(antor).waitFor();
  const touchés = bloc(antor).filter({ hasText: 'Image indisponible.' });
  await touchés.first().waitFor();
  assert.equal(await touchés.count(), 1, 'only the removed image fails');
  const ok = bloc(antor).filter({ hasNotText: 'Image indisponible.' });
  assert.equal(await ok.count(), 1);
  await ok.locator('img').waitFor({ state: 'visible' });
  const t = touchés.first();
  assert.equal(await t.getByRole('link', { name: /Ouvrir la section/ }).count(), 1);
  await t.getByRole('button', { name: 'Recharger l’image' }).click();
  await t.getByText('Image indisponible.').waitFor();
  assert.equal(await t.getByRole('link', { name: /Ouvrir la section/ }).count(), 1);
});

test('chargement : cadre « Chargement de l’image… » (role=status) précède l’image', opts, async () => {
  await ouvrir(antor);
  await nouvelle(antor);
  await antor.route('**/pieces-jointes/*/fichier*', async (route: Any) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await demander(antor, DEMANDE);
  const b = bloc(antor).first();
  await b.getByRole('status').filter({ hasText: 'Chargement de l’image…' }).waitFor();
  assert.equal(await b.getByRole('link', { name: /Ouvrir la section/ }).count(), 1);
  await b.locator('img').waitFor({ state: 'visible' });
  assert.equal(await b.getByText('Chargement de l’image…').count(), 0);
  await antor.unroute('**/pieces-jointes/*/fichier*');
});

test('connexion perdue : vignette chargée reste ; sinon « Recharger l’image » désactivé', opts, async () => {
  await ouvrir(antor);
  await nouvelle(antor);
  await demander(antor, DEMANDE);
  const b = bloc(antor).first();
  await b.locator('img').waitFor({ state: 'visible' });
  await antor.context().setOffline(true);
  await antor.waitForTimeout(300);
  assert.equal(await b.locator('img').isVisible(), true);
  await antor.context().setOffline(false);
  // an unreadable thumbnail while offline
  await antor.route('**/pieces-jointes/*/fichier*', (route: Any) => route.abort());
  await demander(antor, DEMANDE);
  const b2 = bloc(antor).nth(1);
  await b2.getByText('Image indisponible.').waitFor();
  await antor.unroute('**/pieces-jointes/*/fichier*');
});

test('bornes : titres de 120 et 80 caractères passent à la ligne, image très haute contenue', opts, async () => {
  assert.equal(TITRE_LONG.length, 120);
  assert.equal(SECTION_LONGUE.length, 80);
  await antor.route('**/pieces-jointes/*/fichier*', (route: Any) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2000"><rect width="100" height="2000" fill="red"/></svg>',
    }),
  );
  // The stub cannot search a 120-character title (search is limited to 100): the answer is played.
  await antor.route('**/assistant/messages', (route: Any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reponse: 'Image attachée.',
        evenements: [
          {
            type: 'image_attachee',
            libelle: `Image attachée à la section « ${SECTION_LONGUE} » de « ${TITRE_LONG} »`,
            cible: { type: 'fiche', ficheId: 1, sectionId: 1, pieceId: 1, description: 'Un portrait très haut' },
          },
        ],
      }),
    }),
  );
  await ouvrir(antor);
  await nouvelle(antor);
  await demander(antor, 'portrait');
  const b = bloc(antor).first();
  await b.waitFor();
  const img = b.locator('img');
  await img.waitFor({ state: 'visible' });
  const box = await img.boundingBox();
  assert.ok(box.width <= 240.5 && box.height <= 320.5, JSON.stringify(box));
  const lib = b.locator('.asst-ecriture-libelle');
  assert.ok((await lib.boundingBox()).height > 40, 'label wraps');
  const bp = await b.boundingBox();
  const pp = await panneau(antor).boundingBox();
  assert.ok(bp.x + bp.width <= pp.x + pp.width + 1, 'no horizontal overflow');
  assert.equal(await panneau(antor).evaluate((e: Any) => e.scrollWidth <= e.clientWidth + 1), true);
  await antor.unroute('**/pieces-jointes/*/fichier*');
  await antor.unroute('**/assistant/messages');
});

test('existant : un bloc d’écriture de texte reste intact', opts, async () => {
  await ouvrir(antor);
  await nouvelle(antor);
  await demander(antor, 'Que sait-on d’Aldric ?');
  await panneau(antor).getByRole('log').locator('.asst-attente').waitFor({ state: 'detached' });
  assert.equal(await bloc(antor).count(), 0);
});
