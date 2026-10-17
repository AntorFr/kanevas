// Black-box tests of kanevas-import-types written from the need only (docs/parcours.md P-13, P-10 step 2,
// P-14 step 2; docs/ecrans.md E-8, E-9, E-14, E-15 and « Les types »; the feature's « Critère de sortie »).
// Expected values are literals taken from those documents. Real server in stub mode (AD-55, seeded world) +
// real Chromium through Playwright; the API and migration cases need no browser.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

import { migrate, openDb } from '../db/db.js';
import {
  type Any,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rx,
  skipBrowser,
  startServer,
  texte,
  type Server,
} from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const TREIZE = [
  'personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete', 'creature', 'race', 'vaisseau', 'savoir',
  'recit', 'regle', 'note',
];

describe('kanevas-import-types : migration sur une base d’avant', () => {
  test('les fiches, sections, relations, places sur une carte et propositions sont toutes là après la migration', async () => {
    // Panne visée : la recréation de `fiches` perd des lignes, des colonnes (illustration, clé d’origine) ou casse une clé étrangère.
    const dir = mkdtempSync(join(tmpdir(), 'kanevas-mig-'));
    let srv: Server | undefined;
    try {
      const avant = join(dir, 'avant');
      cpSync('src/db/migrations', avant, { recursive: true });
      rmSync(join(avant, '0013-types.sql'));
      rmSync(join(avant, '0014-alias-etiquettes.sql'));
      rmSync(join(avant, '0015-mediatheque.sql'));
      const chemin = join(dir, 'k.db');
      const db = openDb(chemin);
      migrate(db, avant + '/');
      const t = '2026-01-01T00:00:00.000Z';
      db.exec(`
        INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', '${t}');
        INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Avant', '${t}');
        INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj');
        INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, illustration_fichier, illustration_type, illustration_taille, cle_origine, dernier_import)
          VALUES (1, 1, 'lieu', 'Port-Sel', '{}', '${t}', '${t}', 'abc.png', 'image/png', 12, 'lieu:port-sel', '"${t}"');
        INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (2, 1, 'personnage', 'Aldric', '{"pj":false}', '${t}', '${t}');
        INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (3, 1, 'compte_rendu', 'Séance 1', '{}', '${t}', '${t}');
        INSERT INTO sections (id, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (1, 1, 'Description', 0, 'Un port.', '${t}', 1);
        INSERT INTO sections (id, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (2, 2, 'Apparence', 0, 'Grand.', '${t}', 1);
        INSERT INTO relations (section_id, cible_fiche_id, type, cree_le) VALUES (2, 1, 'habite', '${t}');
        INSERT INTO cartes (id, univers_id, titre, forme, visible, cree_le) VALUES (1, 1, 'Brume', 'graphe', 1, '${t}');
        INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (1, 1, 10, 20, '${t}');
        INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le) VALUES (1, 1, 2, 3, 'Plus grand.', 1, '${t}');
      `);
      db.close();
      const compter = (): Record<string, number> => {
        const d = new Database(chemin, { readonly: true });
        const r: Record<string, number> = {};
        for (const tbl of ['fiches', 'sections', 'relations', 'elements_carte', 'propositions', 'cartes']) {
          r[tbl] = (d.prepare(`SELECT count(*) AS n FROM ${tbl}`).get() as { n: number }).n;
        }
        d.close();
        return r;
      };
      assert.deepEqual(compter(), { fiches: 3, sections: 2, relations: 1, elements_carte: 1, propositions: 1, cartes: 1 });

      srv = await startServer({ DB_PATH: chemin, KANEVAS_SANS_SEMIS: '1' });
      assert.deepEqual(compter(), { fiches: 3, sections: 2, relations: 1, elements_carte: 1, propositions: 1, cartes: 1 });
      const d = new Database(chemin, { readonly: true });
      const port = d.prepare("SELECT titre, type, illustration_fichier AS ill, cle_origine AS cle FROM fiches WHERE id = 1").get();
      assert.deepEqual(port, { titre: 'Port-Sel', type: 'lieu', ill: 'abc.png', cle: 'lieu:port-sel' });
      assert.deepEqual(d.prepare('PRAGMA foreign_key_check').all(), []);
      d.close();
    } finally {
      srv?.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('kanevas-import-types : API d’import', () => {
  let srv: Server;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  });
  after(() => srv?.stop());

  const B = () => `${srv.base}/api/import/v1/univers/4`;
  async function put(cle: string, corps: object) {
    const r = await fetch(`${B()}/fiches/${cle}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    return { status: r.status, corps: (await r.json()) as Any };
  }

  test('PUT /fiches/vaisseau:aube de sous-type « Frégate » répond creee, puis inchangee au rejeu', async () => {
    // Panne visée : le type vaisseau ou le champ sousType n’est pas accepté.
    const f = { type: 'vaisseau', titre: 'Aube', sousType: 'Frégate' };
    const a = await put('vaisseau:aube', f);
    assert.equal(a.status, 200);
    assert.equal(a.corps.etat, 'creee');
    const b = await put('vaisseau:aube', f);
    assert.equal(b.corps.etat, 'inchangee');
  });

  for (const type of TREIZE) {
    test(`l’API accepte le type ${type}`, async () => {
      const r = await put(`${type}:essai-treize`, { type, titre: `Essai ${type}`, sousType: 'Essai' });
      assert.equal(r.status, 200, JSON.stringify(r.corps));
      assert.equal(r.corps.etat, 'creee');
    });
  }

  test('bords : un sous-type de 60 caractères passe, de 61 est refusé sur le champ sousType', async () => {
    const ok = await put('lieu:bord-60', { type: 'lieu', titre: 'Bord 60', sousType: 'a'.repeat(60) });
    assert.equal(ok.corps.etat, 'creee');
    const ko = await put('lieu:bord-61', { type: 'lieu', titre: 'Bord 61', sousType: 'a'.repeat(61) });
    assert.equal(ko.status, 400);
    assert.equal(ko.corps.code, 'invalide');
    assert.equal(ko.corps.champ, 'sousType');
  });

  test('échec : un type inconnu et un compte_rendu sont refusés (400, champ type), rien n’est créé', async () => {
    const inconnu = await put('dragon:x', { type: 'dragon', titre: 'Dragon' });
    assert.equal(inconnu.status, 400);
    assert.equal(inconnu.corps.champ, 'type');
    const cr = await put('compte_rendu:x', { type: 'compte_rendu', titre: 'CR' });
    assert.equal(cr.status, 400);
    assert.equal(cr.corps.champ, 'type');
  });

  test('exclusion : sans jeton valide, PUT avec un sous-type est refusé 401 jeton_invalide', async () => {
    const r = await fetch(`${B()}/fiches/lieu:sans-jeton`, {
      method: 'PUT',
      headers: { authorization: 'Bearer kvs_faux', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'lieu', titre: 'X', sousType: 'Port' }),
    });
    assert.equal(r.status, 401);
    assert.equal(((await r.json()) as Any).code, 'jeton_invalide');
  });
});

describe('kanevas-import-types : écrans', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const lien = (page: Any, nom: string) =>
    page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: nom, exact: true });
  async function barre(page: Any): Promise<string[]> {
    await page.getByRole('link', { name: 'Vue d’ensemble' }).first().waitFor();
    await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Personnages', exact: true }).waitFor();
    await attendre(page);
    const t = await page.getByRole('complementary', { name: 'Barre latérale' }).innerText();
    return t.split('\n').map((s: string) => s.trim());
  }
  async function ouvrir(page: Any, chemin: string) {
    await page.goto(chemin);
    await attendre(page);
  }
  /** The universe ids of the seeded world: 1 Lame d’Ébène, 2 Les Landes grises, 4 Essai Kanka. */
  const LAME = '/univers/1';
  const LANDES = '/univers/2';

  test('P-13 étape 1 : Antor désactive « Vaisseau » et « Note » pour CoF Mini, la barre de Mira (Les Landes grises) les perd', async () => {
    // Panne visée : le réglage du système n’atteint pas la barre des univers qui le suivent.
    const mira = await connecte(browser, srv.base, 'mira');
    await ouvrir(mira.page, LANDES);
    const avant = await barre(mira.page);
    assert.ok(avant.includes('Vaisseaux') && avant.includes('Notes'), `départ : ${avant.join('|')}`);

    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, '/systemes');
    await antor.page.getByRole('link', { name: /CoF Mini/ }).first().click();
    await attendre(antor.page);
    await antor.page.getByRole('tab', { name: 'Types de fiche' }).click();
    const vaisseau = antor.page.getByRole('switch', { name: /Vaisseau/ });
    await vaisseau.click();
    await antor.page.getByText(rx('Vaisseau désactivé pour CoF Mini.')).waitFor();
    await antor.page.getByRole('switch', { name: /Note/ }).click();
    await antor.page.getByText(rx('Note désactivé pour CoF Mini.')).or(antor.page.getByText(rx('Note désactivée pour CoF Mini.'))).waitFor();
    assert.equal(await antor.page.getByRole('switch', { name: /Vaisseau/ }).getAttribute('aria-checked'), 'false');
    await antor.page.screenshot({ path: '/tmp/shots/e15-types.png' });

    await ouvrir(mira.page, LANDES);
    const apres = await barre(mira.page);
    assert.ok(!apres.includes('Vaisseaux'), `Vaisseaux encore là : ${apres.join('|')}`);
    assert.ok(!apres.includes('Notes'), `Notes encore là : ${apres.join('|')}`);
    for (const nom of ['Personnages', 'Lieux', 'Factions', 'Objets', 'Événements', 'Quêtes', 'Créatures', 'Savoirs']) {
      assert.ok(apres.includes(nom), `${nom} doit rester : ${apres.join('|')}`);
    }
    await mira.page.screenshot({ path: '/tmp/shots/landes-barre.png' });
    await antor.ctx.close();
    await mira.ctx.close();
  });

  test('P-13 étapes 2-3 : sur E-14 de Lame d’Ébène Antor force « Vaisseau » à Activé, la barre montre « Vaisseaux », pas « Notes »', async () => {
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, LAME);
    const avant = await barre(antor.page);
    assert.ok(!avant.includes('Vaisseaux') && !avant.includes('Notes'), `départ : ${avant.join('|')}`);
    await antor.page.getByRole('link', { name: 'Paramètres', exact: true }).click();
    await antor.page.getByRole('heading', { name: 'Types de fiche' }).waitFor();
    const groupe = antor.page.getByRole('radiogroup', { name: 'Vaisseau' });
    assert.match(await groupe.getByRole('radio', { checked: true }).innerText(), /Système\s*·\s*désactivé/);
    await groupe.getByRole('radio', { name: 'Activé', exact: true }).click();
    await antor.page.getByText(rx('Vaisseau : activé dans Lame d’Ébène.')).waitFor();
    assert.match(await texte(antor.page), /Le système le désactive\./);
    await antor.page.screenshot({ path: '/tmp/shots/e14-types.png', fullPage: true });
    await ouvrir(antor.page, LAME);
    const apres = await barre(antor.page);
    assert.ok(apres.includes('Vaisseaux'), apres.join('|'));
    assert.ok(!apres.includes('Notes'), apres.join('|'));
    await antor.ctx.close();
  });

  test('rôles : Léa voit « Vaisseaux » dans la barre, E-14 lui est « Page introuvable. » et E-15 est en « Lecture seule »', async () => {
    const lea = await connecte(browser, srv.base, 'Léa');
    await ouvrir(lea.page, LAME);
    const b = await barre(lea.page);
    assert.ok(b.includes('Vaisseaux') && !b.includes('Notes'), b.join('|'));
    assert.ok(!b.includes('Régler les types'));
    await ouvrir(lea.page, `${LAME}/parametres`);
    assert.match(await texte(lea.page), /Page introuvable\./);
    await ouvrir(lea.page, '/systemes/1');
    await lea.page.getByRole('tab', { name: 'Types de fiche' }).click();
    assert.match(await texte(lea.page), /Lecture seule/);
    for (const s of await lea.page.getByRole('switch').all()) {
      assert.ok(await s.isDisabled() || (await s.getAttribute('aria-disabled')) === 'true', 'interrupteur actif pour une joueuse');
    }
    await lea.ctx.close();
  });

  test('P-14 étape 2 : Savoir « Les Cristaux d’Ombre » sous-type « Ressource », changé en Note : sous-type vidé, boîte annoncée', async () => {
    // Panne visée : le sous-type survit au changement de type, ou la boîte ne l’annonce pas.
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, `${LAME}/fiches/savoirs`);
    await antor.page.getByRole('button', { name: /^Nouveau savoir$/ }).first().click();
    const f = antor.page.getByRole('dialog');
    await f.getByLabel('Titre').fill('Les Cristaux d’Ombre');
    await f.getByLabel('Sous-type').fill('Ressource');
    await f.getByRole('button', { name: 'Créer la fiche', exact: true }).click();
    await attendre(antor.page);
    await antor.page.getByRole('heading', { level: 1, name: /Les Cristaux d.Ombre/ }).waitFor();
    assert.match(await texte(antor.page), /Savoir\s*·\s*Ressource/);
    await antor.page.screenshot({ path: '/tmp/shots/fiche-savoir.png' });

    await antor.page.getByRole('button', { name: /^Autres actions sur « Les Cristaux/ }).click();
    await antor.page.getByRole('menuitem', { name: /Changer le type/ }).click();
    const boite = antor.page.getByRole('dialog', { name: /Changer le type de/ });
    await boite.waitFor();
    assert.match(await boite.innerText(), /Autres types/);
    assert.match(await boite.innerText(), /Le sous-type « Ressource » sera retiré\./);
    // Note is disabled in Lame d’Ébène: it sits under « Autres types ».
    await boite.getByRole('radio', { name: /Note/ }).click();
    await antor.page.screenshot({ path: '/tmp/shots/changer-type.png' });
    await boite.getByRole('button', { name: 'Changer le type', exact: true }).click();
    await antor.page.getByText(rx('Type changé : Savoir → Note.')).waitFor();
    const t = await texte(antor.page);
    assert.match(t, /Note/);
    assert.doesNotMatch(t, /Ressource/);
    await ouvrir(antor.page, `${LAME}/fiches/notes`);
    await antor.page.getByText(/Les Cristaux d.Ombre/).first().waitFor();
    assert.doesNotMatch(await texte(antor.page), /Ressource/);
    await antor.ctx.close();
  });

  test('E-8 : Léa filtre « Lieux » sur « Taverne » et ne voit que « Le Pendu Joyeux »', async () => {
    // Panne visée : le filtre ne filtre pas, ou le semis n’a pas posé le sous-type.
    const lea = await connecte(browser, srv.base, 'Léa');
    await ouvrir(lea.page, `${LAME}/fiches/lieux`);
    await lea.page.getByText('Val-Fortin').first().waitFor();
    assert.match(await texte(lea.page), /Ville/);
    await lea.page.getByLabel('Sous-type').selectOption({ label: 'Taverne (1)' });
    await attendre(lea.page);
    await lea.page.getByText('Le Pendu Joyeux').first().waitFor();
    const t = await texte(lea.page);
    assert.doesNotMatch(t, /Val-Fortin/);
    assert.doesNotMatch(t, /Rue des Cordiers/);
    await lea.page.screenshot({ path: '/tmp/shots/filtre-taverne.png' });
    await lea.ctx.close();
  });

  test('E-8 exclusion : le filtre d’une joueuse ne compte pas la fiche qu’elle ne lit pas (« Port (2) »)', async () => {
    const importer = async (cle: string, titre: string, lisible: boolean) => {
      const r = await fetch(`${srv.base}/api/import/v1/univers/4/fiches/${cle}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'lieu', titre, sousType: 'Port',
          sections: [lisible ? { cle: 'desc', titre: 'Description', contenu: 'x', joueursLisent: true } : { cle: 'verite', titre: 'Vérité', contenu: 'x' }],
        }),
      });
      assert.equal(r.status, 200);
    };
    await importer('lieu:port-sel', 'Port-Sel', true);
    await importer('lieu:havre-gris', 'Havre-Gris', true);
    await importer('lieu:port-noir', 'Port-Noir', false);
    const lea = await connecte(browser, srv.base, 'Léa');
    await ouvrir(lea.page, '/univers/4/fiches/lieux');
    await lea.page.getByText('Port-Sel').first().waitFor();
    await lea.page.getByLabel('Sous-type').selectOption({ label: 'Port (2)' });
    await lea.page.getByText('Havre-Gris').first().waitFor();
    await attendre(lea.page);
    await lea.page.waitForFunction(() => !document.body.innerText.includes('Chargement des fiches'));
    const t = await texte(lea.page);
    assert.match(t, /Port-Sel/);
    assert.match(t, /Havre-Gris/);
    assert.doesNotMatch(t, /Port-Noir/);
    await lea.ctx.close();
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, '/univers/4/fiches/lieux');
    await antor.page.getByText('Port-Noir').first().waitFor();
    assert.ok((await antor.page.getByLabel('Sous-type').innerText()).includes('Port (3)'));
    await antor.ctx.close();
  });

  test('E-8 bord : un sous-type de 61 caractères à la création est refusé (« Erreur : 60 caractères au plus. »), 60 passe', async () => {
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, `${LAME}/fiches/lieux`);
    await antor.page.getByRole('button', { name: /^Nouveau lieu$/ }).first().click();
    const f = antor.page.getByRole('dialog');
    await f.getByLabel('Titre').fill('Lieu bord');
    await f.getByLabel('Sous-type').fill('a'.repeat(61));
    await f.getByRole('button', { name: 'Créer la fiche', exact: true }).click();
    await f.getByText('Erreur : 60 caractères au plus.').waitFor();
    assert.equal(await antor.page.getByRole('dialog').count(), 1, 'la fenêtre reste ouverte');
    await f.getByLabel('Sous-type').fill('a'.repeat(60));
    await f.getByRole('button', { name: 'Créer la fiche', exact: true }).click();
    await antor.page.getByRole('heading', { level: 1, name: 'Lieu bord' }).waitFor();
    await antor.ctx.close();
  });

  test('B-42 : désactiver « Lieu » demande confirmation (Annuler ne change rien), puis « Lieux » quitte la barre et la création', async () => {
    // Panne visée : pas de confirmation, ou le type désactivé reste proposé / sa liste reste créable.
    const antor = await connecte(browser, srv.base, 'antor');
    await creerUnivers(antor.page, 'Désactivation');
    await antor.page.getByRole('link', { name: 'Lieux', exact: true }).click();
    await antor.page.getByRole('button', { name: /^Nouveau lieu$/ }).first().click();
    await antor.page.getByRole('dialog').getByLabel('Titre').fill('Seul lieu');
    await antor.page.getByRole('dialog').getByRole('button', { name: 'Créer la fiche', exact: true }).click();
    await antor.page.getByRole('heading', { level: 1, name: 'Seul lieu' }).waitFor();
    const base = new URL(antor.page.url()).pathname.split('/').slice(0, 3).join('/');
    await ouvrir(antor.page, `${base}/parametres`);
    const groupe = antor.page.getByRole('radiogroup', { name: 'Lieu' });
    assert.match(await groupe.getByRole('radio', { checked: true }).innerText(), /Par défaut\s*·\s*activé/);
    assert.match(await texte(antor.page), /1 fiche/);
    await groupe.getByRole('radio', { name: 'Désactivé', exact: true }).click();
    const conf = antor.page.getByRole('alertdialog');
    await conf.waitFor();
    assert.match(await conf.innerText(), /Désactiver « Lieu » dans Désactivation \?\s+Le seul lieu reste ; on l.atteint par un lien, la recherche ou l.arbre\./);
    await antor.page.screenshot({ path: '/tmp/shots/confirmer.png' });
    await conf.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.match(await groupe.getByRole('radio', { checked: true }).innerText(), /Par défaut\s*·\s*activé/);
    await groupe.getByRole('radio', { name: 'Désactivé', exact: true }).click();
    await antor.page.getByRole('alertdialog').getByRole('button', { name: 'Désactiver', exact: true }).click();
    await antor.page.getByText(rx('Lieu : désactivé dans Désactivation.')).waitFor();
    await ouvrir(antor.page, base);
    const b = await barre(antor.page);
    assert.ok(!b.includes('Lieux'), b.join('|'));
    // The list stays reachable by address, without creation; the fiche is still there.
    await ouvrir(antor.page, `${base}/fiches/lieux`);
    await antor.page.getByText('Ce type est désactivé dans cet univers.').waitFor();
    assert.equal(await antor.page.getByRole('button', { name: /^Nouveau lieu$/ }).count(), 0);
    await antor.page.getByText('Seul lieu').first().waitFor();
    // Creation no longer offers Lieu.
    await ouvrir(antor.page, `${base}/fiches/personnages`);
    await antor.page.getByRole('button', { name: /^Nouveau personnage$/ }).first().click();
    const types = await antor.page.getByRole('dialog').getByLabel('Type').locator('option').allInnerTexts();
    assert.ok(!types.includes('Lieu'), types.join('|'));
    assert.ok(types.includes('Personnage'));
    await antor.ctx.close();
  });

  test('E-9 : Antor change le sous-type en place (Entrée enregistre), le vide (« Sous-type retiré. »), Léa le lit sans pouvoir le changer', async () => {
    // Panne visée : l’édition en place n’enregistre pas, ne retire pas, ou s’offre à une joueuse.
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, `${LAME}/fiche/8`);
    await antor.page.getByRole('heading', { level: 1, name: 'Val-Fortin' }).waitFor();
    assert.match(await texte(antor.page), /Lieu\s*·\s*Ville/);
    await antor.page.getByTitle('Modifier le sous-type').click();
    const champ = antor.page.getByRole('combobox', { name: /Sous-type/ }).or(antor.page.getByLabel('Sous-type'));
    await champ.first().fill('Cité franche');
    await champ.first().press('Enter');
    await antor.page.getByText('Cité franche').first().waitFor();
    assert.match(await texte(antor.page), /Lieu\s*·\s*Cité franche/);
    await antor.page.screenshot({ path: '/tmp/shots/sous-type-place.png' });
    const lea = await connecte(browser, srv.base, 'Léa');
    await ouvrir(lea.page, `${LAME}/fiche/8`);
    await lea.page.getByRole('heading', { level: 1, name: 'Val-Fortin' }).waitFor();
    assert.match(await texte(lea.page), /Lieu\s*·\s*Cité franche/);
    assert.equal(await lea.page.getByTitle('Modifier le sous-type').count(), 0);
    assert.equal(await lea.page.getByRole('button', { name: /^Autres actions sur « Val-Fortin »/ }).count(), 0, 'pas de menu « ⋯ » pour une joueuse');
    await lea.ctx.close();
    await antor.page.getByTitle('Modifier le sous-type').click();
    await champ.first().fill('');
    await champ.first().press('Enter');
    await antor.page.getByText('Sous-type retiré.').waitFor();
    assert.doesNotMatch(await texte(antor.page), /Cité franche/);
    await antor.ctx.close();
  });

  test('E-8 : la création propose en tapant les sous-types de lieu déjà employés, et changer le type vide le champ', async () => {
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, `${LAME}/fiches/lieux`);
    await antor.page.getByRole('button', { name: /^Nouveau lieu$/ }).first().click();
    const f = antor.page.getByRole('dialog');
    await f.getByLabel('Sous-type').fill('Tav');
    const propositions = await f.locator('datalist option').evaluateAll((os: Any[]) => os.map((o) => o.value));
    assert.ok(propositions.includes('Taverne') && propositions.includes('Rue'), propositions.join('|'));
    assert.equal(await f.locator('datalist').getAttribute('title'), 'Sous-types de lieu déjà employés');
    await f.getByLabel('Sous-type').fill('Taverne');
    await f.getByLabel('Type', { exact: true }).selectOption({ label: 'Faction' });
    assert.equal(await f.getByLabel('Sous-type').inputValue(), '');
    await antor.ctx.close();
  });

  test('P-13 étape 4 : le système réactive « Note », Lame d’Ébène (qui le suit) la montre au chargement suivant, « Vaisseau » forcé ne bouge pas', async () => {
    const antor = await connecte(browser, srv.base, 'antor');
    await ouvrir(antor.page, '/systemes/1');
    await antor.page.getByRole('tab', { name: 'Types de fiche' }).click();
    await antor.page.getByRole('switch', { name: /Note/ }).click();
    await antor.page.getByText(/Note activée? pour CoF Mini\./).waitFor();
    await ouvrir(antor.page, LAME);
    const b = await barre(antor.page);
    assert.ok(b.includes('Notes') && b.includes('Vaisseaux'), b.join('|'));
    await antor.ctx.close();
  });
});
