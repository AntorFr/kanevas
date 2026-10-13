// Black-box tests of kanevas-rv-fiche: the E-9 fiche redone (docs/ecrans.md § Détail de
// `kanevas-refonte-visuelle`: the audience badge and its dialog, the rule and the amber hatching, the
// « ⋯ » menu, « Modifier » on hover/focus, edit shortcuts, toasts, the role matrix). Expected values
// are the literals of that section. Real server in stub mode + real Chromium (harnais.test.ts).
//
// TEST PLAN (panne nommée → test)
//   critère 1 : « Lue des joueurs » → coupe « Les joueurs la lisent » → « MJ seul », hachure, toast
//               [la pastille ne se met pas à jour / le toast manque]            → critère 1
//   critère 2 : mode Joueur → bandeau, ni pastille ni filet ni ⋯                  → matrice, mode Joueur
//   matrice   : Joueur (Léa) : aucune pastille/filet/⋯, « Modifier » seulement sur ce qu'elle écrit
//   toasts    : un toast par action réussie, texte exact, ne prend pas le focus, part seul après 4 s,
//               « Fermer » le retire, trois au plus ; un échec n'en donne pas
//   édition   : compteur « n / 20 000 », aide ; Échap abandonne ; Ctrl+Entrée enregistre ;
//               > 20 000 et connexion perdue : Ctrl+Entrée ne part pas ; périmée : message
//   « Modifier » : au survol/focus ; toujours là sans survol (hover: none)
//   boîte d'audience : titre « Qui voit « … » », note, Échap ferme et rend le focus à la pastille
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  choisirAuteur,
  choisirDansMenuSection,
  confirmerRetraitSection,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  ouvrirMenuSection,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
  texte,
  titresSections,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const PERDU = /Connexion perdue\. Ce que vous voyez peut être dépassé/;
const BANDEAU_JOUEUR = 'Mode Joueur : vous voyez ce que voit un joueur.';
const PASTILLE = /régler l['’]audience de/;

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let urlFiche = '';

const toasts = (page: Any) => page.locator('.toasts .toast');
const toastDe = (page: Any, texte: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: texte });

async function ouvrir(page: Any, suffixe = ''): Promise<void> {
  await page.goto(urlFiche + suffixe);
  await page.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await (await connecte(browser, srv.base, 'Léa')).ctx.close();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Fiche refaite');
  await antor.getByRole('heading', { name: 'Fiche refaite', level: 1 }).waitFor();
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await antor.getByLabel('Rôle de lea').waitFor();
  await creerFiche(antor, 'faction', 'Lames Grises');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  urlFiche = new URL(antor.url()).pathname;
  await ajouterSection(antor, 'Apparence');
  await ajouterSection(antor, 'Vérité');
  await ajouterSection(antor, 'Rumeurs');
  await ajouterSection(antor, 'Notes de la table');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  await regler(antor, 'Rumeurs', 'Les joueurs la lisent', true);
  await regler(antor, 'Rumeurs', 'Les joueurs l’écrivent', true);
  await choisirAuteur(antor, 'Notes de la table', 'lea');
  await regler(antor, 'Notes de la table', 'L’auteur la lit', true);
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  lea.setDefaultTimeout(8000);
  antor.setDefaultTimeout(8000);
}, { timeout: 180000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

describe('E-9 refaite : audience, filet, hachure', { skip: skipBrowser }, () => {
  test('critère 1 : Antor coupe « Les joueurs la lisent » d’« Apparence » → « MJ seul », hachure, toast « Audience de « Apparence » enregistrée »', async () => {
    await ouvrir(antor);
    const s = section(antor, 'Apparence');
    await s.getByRole('button', { name: /^Lue des joueurs — régler/ }).click();
    const boite = antor.getByRole('dialog', { name: 'Qui voit « Apparence »' });
    await boite.waitFor();
    const lisent = boite.getByRole('switch', { name: rx('Les joueurs la lisent') });
    assert.equal(await lisent.getAttribute('aria-checked'), 'true');
    await lisent.click();
    await s.getByRole('button', { name: /^MJ seul — régler/ }).waitFor();
    assert.equal(await s.getAttribute('data-aud'), 'mj', 'hatched in amber');
    await toastDe(antor, 'Audience de « Apparence » enregistrée').waitFor();
    await antor.screenshot({ path: '/tmp/rv-fiche-critere1.png' });
    await antor.keyboard.press('Escape');
    // back to the shared state
    await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
    await s.getByRole('button', { name: /^Lue des joueurs — régler/ }).waitFor();
  });

  test('la boîte « Qui voit » : titre, cinq réglages, note ; Échap la ferme et rend le focus à la pastille', async () => {
    await ouvrir(antor);
    const s = section(antor, 'Vérité');
    const pastille = s.getByRole('button', { name: PASTILLE });
    assert.equal(await pastille.getAttribute('aria-expanded'), 'false');
    await pastille.click();
    assert.equal(await pastille.getAttribute('aria-expanded'), 'true');
    const boite = antor.getByRole('dialog', { name: 'Qui voit « Vérité »' });
    await boite.waitFor();
    for (const r of ['Les joueurs la lisent', 'Les joueurs l’écrivent', 'L’auteur la lit', 'L’auteur l’écrit']) {
      assert.equal(await boite.getByRole('switch', { name: rx(r) }).count(), 1, r);
    }
    assert.equal(await boite.getByRole('combobox', { name: /Auteur/ }).count(), 1);
    assert.ok((await boite.innerText()).includes('Chaque changement est enregistré aussitôt.'));
    // No author: the two author switches cannot be set.
    assert.equal(await boite.getByRole('switch', { name: rx('L’auteur la lit') }).isDisabled(), true);
    await boite.getByRole('switch', { name: rx('Les joueurs la lisent') }).focus();
    await antor.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached' });
    assert.equal(await antor.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), (await pastille.getAttribute('aria-label')) ?? '?', 'the focus is back on the badge');
  });

  test('la boîte « Qui voit » : Échap la ferme aussi juste après un interrupteur, pendant l’enregistrement (charte E-9)', async () => {
    await ouvrir(antor);
    const pastille = section(antor, 'Vérité').getByRole('button', { name: PASTILLE });
    await antor.route('**/api/**', async (route: Any) => {
      if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 600));
      await route.continue().catch(() => {});
    });
    try {
      await pastille.click();
      const boite = antor.getByRole('dialog', { name: 'Qui voit « Vérité »' });
      await boite.waitFor();
      await boite.getByRole('switch', { name: rx('Les joueurs la lisent') }).click({ noWaitAfter: true });
      await antor.keyboard.press('Escape');
      await boite.waitFor({ state: 'detached', timeout: 2000 });
    } finally {
      await antor.unroute('**/api/**');
    }
    // leave the section as found
    await regler(antor, 'Vérité', 'Les joueurs la lisent', false);
  });

  test('les quatre états de la pastille et du filet : lue, écrite, confiée à <auteur>, MJ seul', async () => {
    await ouvrir(antor);
    assert.equal(await section(antor, 'Apparence').getAttribute('data-aud'), 'table');
    assert.equal(await section(antor, 'Rumeurs').getAttribute('data-aud'), 'table-ecrit');
    assert.equal(await section(antor, 'Notes de la table').getAttribute('data-aud'), 'confiee');
    assert.equal(await section(antor, 'Vérité').getAttribute('data-aud'), 'mj');
    await section(antor, 'Apparence').getByRole('button', { name: /^Lue des joueurs — régler/ }).waitFor();
    await section(antor, 'Rumeurs').getByRole('button', { name: /^Écrite par les joueurs — régler/ }).waitFor();
    await section(antor, 'Notes de la table').getByRole('button', { name: /^Confiée à lea — régler/ }).waitFor();
    await section(antor, 'Vérité').getByRole('button', { name: /^MJ seul — régler/ }).waitFor();
    await antor.screenshot({ path: '/tmp/rv-fiche-etats-audience.png', fullPage: true });
  });

  test('l’audience s’écrit à chaque changement : retirer la lecture d’une section écrite la rend « MJ seul »', async () => {
    await ouvrir(antor);
    await ajouterSection(antor, 'Temporaire');
    await regler(antor, 'Temporaire', 'Les joueurs la lisent', true);
    await regler(antor, 'Temporaire', 'Les joueurs l’écrivent', true);
    await section(antor, 'Temporaire').getByRole('button', { name: /^Écrite par les joueurs/ }).waitFor();
    await antor.reload();
    await section(antor, 'Temporaire').getByRole('button', { name: /^Écrite par les joueurs/ }).waitFor();
    await choisirDansMenuSection(antor, 'Temporaire', 'Retirer la section');
    await confirmerRetraitSection(antor);
    await section(antor, 'Temporaire').waitFor({ state: 'detached' });
  });
});

describe('E-9 refaite : matrice des rôles', { skip: skipBrowser }, () => {
  test('critère 2 : Antor en mode Joueur voit le bandeau et ni pastille, ni filet, ni menu ⋯ ; en mode MJ tout revient', async () => {
    await ouvrir(antor);
    await antor.getByLabel('Mode Joueur').check();
    await antor.getByText(BANDEAU_JOUEUR).waitFor();
    await section(antor, 'Vérité').waitFor({ state: 'detached' });
    assert.equal(await antor.getByRole('button', { name: PASTILLE }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    assert.equal(await antor.locator('main section[data-aud]').count(), 0, 'no rule, no hatching');
    assert.ok(!(await texte(antor)).includes('MJ seul'));
    await antor.screenshot({ path: '/tmp/rv-fiche-mode-joueur.png' });
    await antor.getByLabel('Mode MJ').check();
    await antor.getByText(BANDEAU_JOUEUR).waitFor({ state: 'detached' });
    await section(antor, 'Vérité').getByRole('button', { name: PASTILLE }).waitFor();
  });

  test('mode Joueur : « Modifier » seulement sur ce que les joueurs écrivent (« Rumeurs »), pas sur « Apparence »', async () => {
    await ouvrir(antor);
    await antor.getByLabel('Mode Joueur').check();
    await antor.getByText(BANDEAU_JOUEUR).waitFor();
    await section(antor, 'Vérité').waitFor({ state: 'detached' });
    await section(antor, 'Rumeurs').getByRole('button', { name: rxExact('Modifier') }).waitFor();
    assert.equal(await section(antor, 'Apparence').getByRole('button', { name: rxExact('Modifier') }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: rxExact('Modifier') }).count(), 1);
    await antor.getByLabel('Mode MJ').check();
  });

  test('Joueur (Léa) : aucune pastille, filet, hachure ni menu ⋯ ; « Modifier » sur « Rumeurs » et « Notes de la table » seulement ; pas de bascule', async () => {
    await ouvrir(lea);
    assert.deepEqual(await titresSections(lea), ['Apparence', 'Rumeurs', 'Notes de la table']);
    assert.equal(await lea.getByRole('button', { name: PASTILLE }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    assert.equal(await lea.locator('main section[data-aud]').count(), 0);
    assert.equal(await lea.getByLabel('Mode Joueur').count(), 0, 'no mode switch for a player');
    assert.equal(await lea.getByText(BANDEAU_JOUEUR).count(), 0);
    assert.equal(await section(lea, 'Apparence').getByRole('button', { name: rxExact('Modifier') }).count(), 0);
    assert.equal(await section(lea, 'Rumeurs').getByRole('button', { name: rxExact('Modifier') }).count(), 1);
    assert.equal(await section(lea, 'Notes de la table').getByRole('button', { name: rxExact('Modifier') }).count(), 0, 'the author reads, does not write');
    const t = await texte(lea);
    for (const mot of ['MJ seul', 'Lue des joueurs', 'Confiée à', 'Monter', 'Descendre', 'Retirer la section', 'Ajouter une section', 'Vérité']) assert.ok(!t.includes(mot), mot);
    // Even the section she writes has no audience handle, and the text she writes is saved.
    await lea.screenshot({ path: '/tmp/rv-fiche-joueur.png' });
  });
});

describe('E-9 refaite : toasts', { skip: skipBrowser }, () => {
  test('un toast par action réussie, au texte exact : enregistrée, section ajoutée, montée, descendue, retirée', async () => {
    await ouvrir(antor);
    // « Section « <titre> » ajoutée — fermée aux joueurs »
    await ajouterSection(antor, 'Ajoutée');
    await toastDe(antor, 'Section « Ajoutée » ajoutée — fermée aux joueurs').waitFor();
    // « « <section> » montée d'un cran » / « descendue d'un cran »
    await choisirDansMenuSection(antor, 'Ajoutée', 'Monter');
    await toastDe(antor, /« Ajoutée » montée d['’]un cran/).waitFor();
    await choisirDansMenuSection(antor, 'Ajoutée', 'Descendre');
    await toastDe(antor, /« Ajoutée » descendue d['’]un cran/).waitFor();
    // « « <section> » enregistrée »
    const s = section(antor, 'Ajoutée');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill('Du texte.');
    await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await toastDe(antor, '« Ajoutée » enregistrée').waitFor();
    // « Section « <titre> » retirée »
    await choisirDansMenuSection(antor, 'Ajoutée', 'Retirer la section');
    await confirmerRetraitSection(antor);
    await toastDe(antor, 'Section « Ajoutée » retirée').waitFor();
    await antor.screenshot({ path: '/tmp/rv-fiche-toast.png' });
  });

  test('le toast ne prend jamais le focus, part seul après 4 s, et « Fermer » le retire', async () => {
    await ouvrir(antor);
    await regler(antor, 'Vérité', 'Les joueurs la lisent', true);
    const t = toastDe(antor, 'Audience de « Vérité » enregistrée');
    await t.waitFor();
    assert.equal(await antor.evaluate(() => !!document.activeElement?.closest('.toasts')), false, 'the toast did not take the focus');
    await t.getByRole('button', { name: 'Fermer' }).click();
    await t.waitFor({ state: 'detached' });
    await regler(antor, 'Vérité', 'Les joueurs la lisent', false);
    const t2 = toastDe(antor, 'Audience de « Vérité » enregistrée');
    await t2.last().waitFor();
    const debut = Date.now();
    await t2.last().waitFor({ state: 'detached', timeout: 7000 });
    const duree = Date.now() - debut;
    assert.ok(duree > 2500 && duree < 5500, `a toast leaves by itself after 4 s (left after ${duree} ms)`);
  });

  test('plusieurs actions de suite : les toasts s’empilent, le plus récent en bas, trois au plus', async () => {
    await ouvrir(antor);
    for (const t of ['A1', 'A2', 'A3', 'A4']) await ajouterSection(antor, t);
    const textes: string[] = await toasts(antor).evaluateAll((els: Element[]) => els.map((e) => (e.textContent ?? '').trim()));
    assert.equal(textes.length, 3, textes.join(' | '));
    assert.ok(textes[2]!.includes('« A4 »') && textes[1]!.includes('« A3 »') && textes[0]!.includes('« A2 »'), textes.join(' | '));
    const ys: number[] = await toasts(antor).evaluateAll((els: Element[]) => els.map((e) => e.getBoundingClientRect().top));
    assert.ok(ys[0]! < ys[1]! && ys[1]! < ys[2]!, 'the newest is at the bottom');
    for (const t of ['A1', 'A2', 'A3', 'A4']) {
      await choisirDansMenuSection(antor, t, 'Retirer la section');
      await confirmerRetraitSection(antor);
      await section(antor, t).waitFor({ state: 'detached' });
    }
  });

  test('relier et retirer une relation : « « Apparence » reliée à « Lames Grises » » / « Relation vers « Lames Grises » retirée »', async () => {
    await ouvrir(antor);
    const s = section(antor, 'Apparence');
    await s.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await s.getByLabel('Type de relation').fill('membre de');
    await s.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
    await s.getByRole('button', { name: /^Lames Grises/ }).click();
    await s.getByRole('button', { name: rxExact('Relier') }).click();
    await toastDe(antor, '« Apparence » reliée à « Lames Grises »').waitFor();
    await s.getByRole('button', { name: 'Retirer la relation membre de → Lames Grises', exact: true }).click();
    await toastDe(antor, 'Relation vers « Lames Grises » retirée').waitFor();
  });

  test('pièces jointes : « « portrait.png » ajouté », « est secrète », « Le secret de … est levé », « retiré »', async () => {
    await ouvrir(antor);
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const s = section(antor, 'Apparence');
    await s.locator('input[type=file]').setInputFiles([{ name: 'portrait.png', mimeType: 'image/png', buffer: PNG }]);
    await toastDe(antor, '« portrait.png » ajouté').waitFor();
    await s.getByRole('button', { name: /^Rendre secrète « portrait\.png »/ }).click();
    await toastDe(antor, '« portrait.png » est secrète').waitFor();
    await s.getByRole('button', { name: /^Lever le secret de « portrait\.png »/ }).click();
    await toastDe(antor, 'Le secret de « portrait.png » est levé').waitFor();
    await s.getByRole('button', { name: /^Retirer « portrait\.png »/ }).click();
    await s.getByRole('button', { name: rxExact('Retirer le fichier') }).click();
    await toastDe(antor, '« portrait.png » retiré').waitFor();
  });

  test('envoi annulé : « Envoi de « lent.png » annulé »', async () => {
    await ouvrir(antor);
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    let lacher!: () => void;
    const tenu = new Promise<void>((r) => (lacher = r));
    await antor.route('**/pieces-jointes', async (route: Any) => {
      if (route.request().method() !== 'POST') return route.continue();
      await tenu;
      await route.abort();
    });
    const s = section(antor, 'Apparence');
    await s.locator('input[type=file]').setInputFiles([{ name: 'lent.png', mimeType: 'image/png', buffer: PNG }]);
    await s.getByRole('status').getByRole('button', { name: rxExact('Annuler') }).click();
    await toastDe(antor, 'Envoi de « lent.png » annulé').waitFor();
    lacher();
    await antor.unroute('**/pieces-jointes', { behavior: 'ignoreErrors' });
  });

  test('un échec n’est jamais un toast : le PATCH d’audience refusé laisse un message en ligne et aucun toast', async () => {
    await ouvrir(antor);
    await antor.route(/\/sections\/\d+$/, (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
    await section(antor, 'Vérité').getByRole('button', { name: PASTILLE }).click();
    const boite = antor.getByRole('dialog', { name: 'Qui voit « Vérité »' });
    await boite.getByRole('switch', { name: rx('Les joueurs la lisent') }).click();
    await boite.getByText('L’action n’a pas abouti. Réessayez.').waitFor();
    assert.equal(await boite.getByRole('switch', { name: rx('Les joueurs la lisent') }).getAttribute('aria-checked'), 'false');
    assert.equal(await toasts(antor).count(), 0);
    await antor.unroute(/\/sections\/\d+$/);
    await antor.keyboard.press('Escape');
  });
});

describe('E-9 refaite : édition', { skip: skipBrowser }, () => {
  async function editer(page: Any, titre = 'Rumeurs'): Promise<Any> {
    const s = section(page, titre);
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    return s;
  }

  test('sous le champ : le compteur « n / 20 000 » suit la saisie et l’aide « Échap annuler · Ctrl ↵ enregistrer »', async () => {
    await ouvrir(antor);
    const s = await editer(antor);
    const t = (await s.innerText()).replace(/\s+/g, ' ');
    assert.ok(/0 \/ 20\s000/.test(t.replace(/ /g, ' ')), t);
    assert.ok(t.includes('Échap annuler · Ctrl ↵ enregistrer'), t);
    await s.getByRole('textbox').fill('abcde');
    assert.ok(/5 \/ 20\s000/.test((await s.innerText()).replace(/ /g, ' ')));
    await antor.keyboard.press('Escape');
  });

  test('Échap fait « Annuler » : le texte saisi est abandonné, la section garde l’ancien texte', async () => {
    await ouvrir(antor);
    const s = await editer(antor);
    await s.getByRole('textbox').fill('Brouillon jeté');
    await antor.keyboard.press('Escape');
    await s.getByRole('textbox').waitFor({ state: 'detached' });
    assert.ok(!(await texte(antor)).includes('Brouillon jeté'));
    assert.equal(await toasts(antor).count(), 0, 'cancelling is not a save');
    await antor.reload();
    assert.ok(!(await texte(antor)).includes('Brouillon jeté'), 'nothing was written nor kept');
    assert.ok(!(await antor.evaluate(() => JSON.stringify(sessionStorage))).includes('Brouillon jeté'), 'the draft is dropped');
  });

  test('Ctrl+Entrée fait « Enregistrer » : le texte part, la section le montre, le toast « enregistrée » paraît', async () => {
    await ouvrir(antor);
    const s = await editer(antor);
    await s.getByRole('textbox').fill('On dit qu’Aldric boite.');
    await antor.keyboard.press('Control+Enter');
    await s.getByRole('textbox').waitFor({ state: 'detached' });
    await toastDe(antor, '« Rumeurs » enregistrée').waitFor();
    await antor.reload();
    await section(antor, 'Rumeurs').getByText('On dit qu’Aldric boite.').waitFor();
  });

  test('au-delà de 20 000 caractères, Ctrl+Entrée ne part pas (comme le bouton) et le compteur le dit', async () => {
    await ouvrir(antor);
    const s = await editer(antor);
    let puts = 0;
    antor.on('request', (r: Any) => r.method() === 'PUT' && puts++);
    await s.getByRole('textbox').fill('x'.repeat(20001));
    await antor.keyboard.press('Control+Enter');
    await antor.waitForTimeout(500);
    assert.equal(puts, 0, 'no request left');
    assert.ok(await s.getByText(/20 000 caractères au plus\./).first().isVisible());
    await s.getByRole('textbox').fill('y'.repeat(20000));
    await antor.keyboard.press('Control+Enter');
    await s.getByRole('textbox').waitFor({ state: 'detached' });
    assert.equal(puts, 1);
    antor.removeAllListeners('request');
    // restore
    const s2 = await editer(antor);
    await s2.getByRole('textbox').fill('On dit qu’Aldric boite.');
    await antor.keyboard.press('Control+Enter');
    await s2.getByRole('textbox').waitFor({ state: 'detached' });
  });

  test('connexion perdue : Ctrl+Entrée ne part pas, le texte reste dans le champ', async () => {
    await ouvrir(antor);
    const s = await editer(antor);
    await s.getByRole('textbox').fill('Texte en attente');
    let puts = 0;
    antor.on('request', (r: Any) => r.method() === 'PUT' && puts++);
    await antor.context().setOffline(true);
    try {
      await antor.getByText(PERDU).waitFor();
      await antor.keyboard.press('Control+Enter');
      await antor.waitForTimeout(500);
      assert.equal(puts, 0);
      assert.equal(await s.getByRole('textbox').inputValue(), 'Texte en attente');
      assert.equal(await s.getByRole('button', { name: rxExact('Enregistrer') }).isDisabled(), true, 'the button says the same');
    } finally {
      await antor.context().setOffline(false);
    }
    antor.removeAllListeners('request');
    await antor.keyboard.press('Escape');
    await antor.getByText(PERDU).waitFor({ state: 'detached', timeout: 40000 });
  });

  test('écriture périmée : Ctrl+Entrée reçoit « La section a changé depuis que vous l’avez ouverte… » et garde le texte', async () => {
    await ouvrir(antor);
    const second = await antor.context().newPage();
    second.setDefaultTimeout(8000);
    await ouvrir(second);
    const a = await editer(antor);
    const b = await editer(second);
    await a.getByRole('textbox').fill('Premier onglet');
    await antor.keyboard.press('Control+Enter');
    await a.getByRole('textbox').waitFor({ state: 'detached' });
    await b.getByRole('textbox').fill('Second onglet');
    await second.keyboard.press('Control+Enter');
    await b.getByText(/La section a changé depuis que vous l['’]avez ouverte/).waitFor();
    assert.equal(await b.getByRole('textbox').inputValue(), 'Second onglet');
    await second.close();
    const s = await editer(antor);
    await s.getByRole('textbox').fill('On dit qu’Aldric boite.');
    await antor.keyboard.press('Control+Enter');
    await s.getByRole('textbox').waitFor({ state: 'detached' });
  });

  test('un Joueur qui écrit la section (Léa, « Rumeurs ») : Ctrl+Entrée enregistre aussi, et son toast paraît', async () => {
    await ouvrir(lea);
    const s = await editer(lea);
    await s.getByRole('textbox').fill('Léa a entendu cela.');
    await lea.keyboard.press('Control+Enter');
    await toastDe(lea, '« Rumeurs » enregistrée').waitFor();
    await section(lea, 'Rumeurs').getByText('Léa a entendu cela.').waitFor();
  });
});

describe('E-9 refaite : « Modifier », menu ⋯, retrait', { skip: skipBrowser }, () => {
  test('« Modifier » paraît au survol et au focus de la section (invisible sinon, sur un écran à souris)', async () => {
    await ouvrir(antor);
    await antor.mouse.move(2, 2);
    const s = section(antor, 'Apparence');
    const modifier = s.getByRole('button', { name: rxExact('Modifier') });
    const opacite = () => modifier.evaluate((e: Element) => getComputedStyle(e.closest('.sec-actions')!).opacity);
    assert.equal(await opacite(), '0', 'hidden without hover or focus');
    await s.hover();
    await antor.waitForTimeout(400);
    assert.equal(await opacite(), '1', 'shown on hover');
    await antor.mouse.move(2, 2);
    await antor.waitForTimeout(400);
    assert.equal(await opacite(), '0');
    await modifier.focus();
    await antor.waitForTimeout(400);
    assert.equal(await opacite(), '1', 'shown on focus');
  });

  test('sans survol (hover: none, téléphone ou tablette) « Modifier » est toujours là', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await ouvrir(page);
    assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true, 'the context really has no hover');
    const modifier = section(page, 'Apparence').getByRole('button', { name: rxExact('Modifier') });
    assert.equal(await modifier.evaluate((e: Element) => getComputedStyle(e.closest('.sec-actions')!).opacity), '1');
    await page.screenshot({ path: '/tmp/rv-fiche-telephone.png', fullPage: true });
    await ctx.close();
  });

  test('menu ⋯ : Monter, Descendre, Retirer la section ; Monter inerte sur la première, Descendre sur la dernière', async () => {
    await ouvrir(antor);
    const premier = (await titresSections(antor))[0]!;
    const dernier = (await titresSections(antor)).at(-1)!;
    let menu = await ouvrirMenuSection(antor, premier);
    assert.deepEqual(await menu.getByRole('menuitem').allInnerTexts(), ['Monter', 'Descendre', 'Retirer la section']);
    assert.equal(await menu.getByRole('menuitem', { name: rxExact('Monter') }).getAttribute('aria-disabled'), 'true');
    await antor.keyboard.press('Escape');
    menu = await ouvrirMenuSection(antor, dernier);
    assert.equal(await menu.getByRole('menuitem', { name: rxExact('Descendre') }).getAttribute('aria-disabled'), 'true');
    await antor.keyboard.press('Escape');
  });

  test('retrait : la boîte « Retirer la section « X » ? » prend le focus sur « Annuler », Échap la ferme sans rien retirer', async () => {
    await ouvrir(antor);
    await ajouterSection(antor, 'À jeter');
    await choisirDansMenuSection(antor, 'À jeter', 'Retirer la section');
    const d = antor.getByRole('alertdialog', { name: 'Retirer la section « À jeter » ?' });
    await d.waitFor();
    assert.equal(await antor.evaluate(() => document.activeElement?.textContent?.trim()), 'Annuler', 'Annuler has the focus on entry');
    await antor.keyboard.press('Escape');
    await d.waitFor({ state: 'detached' });
    assert.equal(await section(antor, 'À jeter').count(), 1, 'nothing removed');
    await choisirDansMenuSection(antor, 'À jeter', 'Retirer la section');
    await confirmerRetraitSection(antor);
    await section(antor, 'À jeter').waitFor({ state: 'detached' });
    // The focus does not fall to the page: it goes to the title of the fiche.
    assert.equal(await antor.evaluate(() => document.activeElement?.tagName), 'H1');
  });

  test('ajout de section replié : le formulaire s’ouvre, Échap le ferme, un titre vide ou de 81 caractères est refusé', async () => {
    await ouvrir(antor);
    assert.equal(await antor.getByLabel('Titre de la section').count(), 0, 'folded');
    await antor.getByRole('button', { name: /^Ajouter une section/ }).click();
    await antor.getByLabel('Titre de la section').waitFor();
    await antor.keyboard.press('Escape');
    await antor.getByLabel('Titre de la section').waitFor({ state: 'detached' });
    await antor.getByRole('button', { name: /^Ajouter une section/ }).click();
    await antor.getByRole('button', { name: rxExact('Ajouter la section') }).click();
    await antor.getByText('Erreur : le titre est obligatoire.').waitFor();
    await antor.getByLabel('Titre de la section').fill('t'.repeat(81));
    await antor.getByRole('button', { name: rxExact('Ajouter la section') }).click();
    await antor.getByText('Erreur : 80 caractères au plus.').waitFor();
    await antor.getByRole('button', { name: rxExact('Annuler') }).click();
  });

  test('fiche sans section : l’état vide propose « Ajouter une section » au MJ, rien au Joueur', async () => {
    await creerFiche(antor, 'lieu', 'Cave vide');
    await antor.getByRole('heading', { name: 'Cave vide', level: 1 }).waitFor();
    await antor.getByText(/n.a pas encore de section/).waitFor();
    await antor.getByRole('button', { name: /^Ajouter une section/ }).waitFor();
    await antor.screenshot({ path: '/tmp/rv-fiche-vide.png' });
  });
  test('V3 blocs vides : « Aucune pièce jointe. » et « Ajouter un fichier » sur une seule ligne, comme Relations (bureau et 390 px)', async () => {
    for (const largeur of [1440, 390]) {
      await antor.setViewportSize({ width: largeur, height: 900 });
      await ouvrir(antor);
      for (const titre of ['Vérité', 'Notes de la table']) {
        const s = section(antor, titre);
        for (const [bloc, action] of [['Pièces jointes', 'Ajouter un fichier'], ['Relations', 'Relier à une fiche']] as const) {
          const b = s.getByRole('group', { name: bloc });
          const vide = await b.locator('.bloc-vide').boundingBox();
          const bouton = await b.getByRole('button', { name: rxExact(action) }).boundingBox();
          assert.ok(vide && bouton, `${titre}/${bloc}@${largeur}`);
          const dy = Math.abs(vide.y + vide.height / 2 - (bouton.y + bouton.height / 2));
          assert.ok(dy < 8, `${titre}/${bloc}@${largeur}: text and action on one row (dy=${dy})`);
          assert.ok(bouton.x >= vide.x + vide.width - 1, `${titre}/${bloc}@${largeur}: action after the text`);
        }
      }
    }
    await antor.setViewportSize({ width: 1440, height: 900 });
  });

  test('B téléphone 390 px, MJ : les actions de section sont sur la ligne du titre, en icônes, sans recouvrir titre ni pastille', async () => {
    await antor.setViewportSize({ width: 390, height: 900 });
    try {
      await ouvrir(antor);
      const titres = await titresSections(antor);
      assert.ok(titres.length > 0);
      for (const titre of titres) {
        const s = section(antor, titre);
        await s.hover();
        const h = await s.getByRole('heading', { level: 2, name: titre }).boundingBox();
        const actions = await s.locator('.sec-actions').first().boundingBox();
        const menu = await s.getByRole('button', { name: /^Autres actions sur/ }).boundingBox();
        assert.ok(h && actions && menu, titre);
        const cy = (b: { y: number; height: number }) => b.y + b.height / 2;
        assert.ok(Math.abs(cy(menu) - cy(h)) < 20, `${titre}: actions on the title row (dy=${cy(menu) - cy(h)})`);
        assert.ok(actions.x >= h.x + 1 && menu.x + menu.width <= 390, `${titre}: inside the screen`);
        const pastille = await s.locator('.pastille').first().boundingBox();
        if (pastille) {
          const chevauche = pastille.x < actions.x + actions.width && actions.x < pastille.x + pastille.width
            && pastille.y < actions.y + actions.height && actions.y < pastille.y + pastille.height;
          assert.ok(!chevauche, `${titre}: actions overlap the pastille`);
        }
        const mod = s.getByRole('button', { name: rxExact('Modifier') });
        if (await mod.count()) {
          assert.ok(((await mod.boundingBox())!.width) <= 44, `${titre}: Modifier is icon-only`);
          assert.equal(await mod.innerText(), '', 'label hidden');
        }
        // The title text must not run under the actions.
        const textW = await s.getByRole('heading', { level: 2, name: titre }).evaluate((e: Element) => {
          const r = document.createRange(); r.selectNodeContents(e);
          return Math.max(...[...r.getClientRects()].map((q) => q.right));
        });
        assert.ok(textW <= actions.x + 1, `${titre}: title text runs under the actions (${textW} > ${actions.x})`);
      }
    } finally {
      await antor.setViewportSize({ width: 1440, height: 900 });
    }
  });
  test('boîte « Qui voit » : select Auteur habillé (appearance none + chevron) et panneau entièrement dans l’écran à 390 px, clair et sombre', async () => {
    await antor.setViewportSize({ width: 390, height: 900 });
    try {
      for (const theme of ['clair', 'sombre']) {
        await antor.evaluate((t: string) => localStorage.setItem('kanevas-theme', t), theme);
        await ouvrir(antor);
        const titres = await titresSections(antor);
        for (const titre of titres) {
          const s = section(antor, titre);
          const pastille = s.getByRole('button', { name: PASTILLE });
          if (!(await pastille.count())) continue;
          await pastille.click();
          const panneau = antor.locator('.menu.audience');
          await panneau.waitFor();
          const b = await panneau.boundingBox();
          assert.ok(b && b.x >= 0 && b.x + b.width <= 390, `${theme}/${titre}: panel inside the screen (x=${b?.x}, w=${b?.width})`);
          assert.equal(await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${theme}/${titre}: no horizontal scroll`);
          for (const sw of await panneau.getByRole('switch').all()) {
            const sb = await sw.boundingBox();
            assert.ok(sb && sb.x >= 0 && sb.x + sb.width <= 390, `${theme}/${titre}: switch inside the screen`);
          }
          const sel = panneau.locator('select').first();
          assert.equal(await sel.evaluate((e: Element) => getComputedStyle(e).appearance), 'none', 'Auteur select is styled');
          assert.equal(await panneau.locator('.champ-liste svg').count(), 1, 'chevron present');
          await antor.keyboard.press('Escape');
        }
      }
    } finally {
      await antor.evaluate(() => localStorage.removeItem('kanevas-theme'));
      await antor.setViewportSize({ width: 1440, height: 900 });
    }
  });
});
