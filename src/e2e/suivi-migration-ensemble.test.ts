// Migration AD-127 vue de l'extérieur : une base au schéma précédent (migrations 0001 à 0016 seules, puis des lignes écrites en SQL
// brut dans `campagnes`, `scenarios`, `taches_preparation` et des fiches compte_rendu) est ouverte par le vrai serveur, qui
// convertit au démarrage ; le navigateur et l'API disent ensuite ce que le critère de la feature annonce.
// Aucun fichier binaire committé : la base est construite ici, par le schéma d'avant (les fichiers .sql de src/db/migrations).
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { migrate, openDb } from '../db/db.js';
import { attendreServeurPret, withStartupLock, type Any, connecte, ensureBuilt, freePort, launch, skipBrowser, texte } from './harnais.test.js';

interface Appel {
  status: number;
  body: Any;
  text: string;
}
async function appel(page: Any, url: string): Promise<Appel> {
  const r = await page.request.fetch(url, { failOnStatusCode: false });
  const text = await r.text();
  let body: Any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non JSON */
  }
  return { status: r.status(), body, text };
}

/** La base d'exemple : le schéma d'avant l'aventure (0001-0016) et le monde du critère. */
function baseAvant(chemin: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-mig-src-'));
  const src = join(process.cwd(), 'src/db/migrations');
  for (const f of readdirSync(src)) if (/^\d{4}-/.test(f) && Number(f.slice(0, 4)) <= 16) copyFileSync(join(src, f), join(dir, f));
  const db = openDb(chemin);
  migrate(db, dir + '/');
  rmSync(dir, { recursive: true, force: true });
  const t = '2026-09-01T10:00:00.000Z';
  const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p);
  run('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?), (2, ?, ?)', 'antor', t, 'lea', t);
  run("INSERT INTO univers (id, nom, description, cree_le) VALUES (1, 'Lame d''Ébène', '', ?)", t);
  run("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur')");
  // un personnage d'abord : les identifiants de fiches des aventures ne coïncident pas avec ceux des anciennes tables
  run("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 1, 'personnage', 'Maître Aldric', '{\"v\":1,\"pj\":false}', ?, ?)", t, t);
  // campagnes : ids 1 (en préparation), 2 (active, clé 'couronne'), 3 (terminée)
  run("INSERT INTO campagnes (id, univers_id, nom, statut, cree_le) VALUES (1, 1, 'Les Brumes de Vaëlis', 'en_preparation', ?)", t);
  run("INSERT INTO campagnes (id, univers_id, nom, statut, cree_le, cle_origine) VALUES (2, 1, 'La Couronne brisée', 'active', ?, 'couronne')", t);
  run("INSERT INTO campagnes (id, univers_id, nom, statut, cree_le) VALUES (3, 1, 'La Vieille Garde', 'terminee', ?)", t);
  // scénarios : 'Acte II' (clé libre), 'Acte I' (clé déjà prise par la campagne), 'Prologue' sous les Brumes
  run("INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le, cle_origine, version_importee) VALUES (1, 2, 'Acte II — Le sceau brisé', 'La crypte s''ouvre sous le sceau brisé.', 3, ?, ?, 'acte-2', 3)", t, t);
  run("INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le, cle_origine) VALUES (2, 2, 'Acte I — Le couronnement', 'Le roi tombe.', 1, ?, ?, 'couronne')", t, t);
  run("INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le) VALUES (3, 1, 'Prologue', '', 1, ?, ?)", t, t);
  run("INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, faite_le, cree_le) VALUES (2, 'cartes', 'Plan de la crypte', 0, NULL, ?)", t);
  run("INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, faite_le, cree_le) VALUES (2, 'monstres', 'Statistiques du liche', 1, '2026-09-02T09:00:00.000Z', ?)", t);
  run("INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, faite_le, cree_le) VALUES (1, 'pnj', 'Le passeur des Brumes', 0, NULL, ?)", t);
  const cr = (id: number, titre: string, campagne: number, texte: string) => {
    run("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 1, 'compte_rendu', ?, ?, ?, ?)", id, titre, JSON.stringify({ v: 1, campagne_id: campagne }), t, t);
    run("INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (?, 'Compte-rendu', 1, ?, ?, 1)", id, texte, t);
  };
  cr(50, 'Séance 11', 2, 'Le sceau a cédé.'); // campagne d'id 2 : doit suivre la fiche de « La Couronne brisée »
  cr(51, 'Séance 0', 1, 'Les Brumes.');
  db.close();
}

describe('kanevas-scenarios-suivi : migration de la base d\'exemple (campagnes et scénarios deviennent des fiches)', { skip: skipBrowser }, () => {
  let dir: string;
  let base: string;
  let enfant: ChildProcess;
  let journal = '';
  let browser: Any;
  let antor: Any;
  let lea: Any;
  const ids: Record<string, number> = {};
  const dbPath = () => join(dir, 'k.db');

  const demarrer = () => withStartupLock(demarrerSansVerrou);
  async function demarrerSansVerrou(): Promise<void> {
    ensureBuilt();
    const port = await freePort();
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), NODE_ENV: 'production', KANEVAS_STUB: '1', KANEVAS_SANS_SEMIS: '1', DB_PATH: dbPath(), SESSION_SECRET: 'e2e-secret-e2e-secret-e2e' };
    for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
    enfant = spawn('node', ['dist/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    journal = '';
    enfant.stdout?.on('data', (d) => (journal += String(d)));
    enfant.stderr?.on('data', (d) => (journal += String(d)));
    base = `http://127.0.0.1:${port}`;
    try {
      await attendreServeurPret(enfant, base, () => journal);
    } catch (e) {
      enfant.kill('SIGKILL');
      throw e;
    }
  }
  const arreter = () => enfant?.kill('SIGKILL');

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanevas-mig-'));
    mkdirSync(dir, { recursive: true });
    baseAvant(dbPath());
    await demarrer();
    browser = await launch();
    antor = (await connecte(browser, base, 'antor')).page;
    lea = (await connecte(browser, base, 'Léa')).page;
    const liste = await appel(antor, '/api/univers/1/fiches?type=aventure');
    for (const f of liste.body.fiches) ids[f.titre] = f.id;
  });
  after(async () => {
    await browser?.close();
    arreter();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('journal_du_demarrage_dit_les_comptes_de_la_conversion', async () => {
    // Casse si : la conversion ne se dit pas au démarrage, ou compte autre chose que 3 campagnes, 3 scénarios, 3 tâches, 2 CR.
    assert.match(journal, /Migration 0017:/, journal);
    for (const [nature, n] of [['campagnes', 3], ['scenarios', 3], ['taches', 3], ['comptesRendus', 2]] as const) {
      assert.match(journal, new RegExp(`${nature}\\D{1,6}${n}\\b`), `${nature}=${n} absent du journal : ${journal}`);
    }
  });

  test('chaque_campagne_et_chaque_scenario_est_une_fiche_aventure_avec_son_statut', async () => {
    // Casse si : une ligne n'est pas convertie, le sous-type ou le statut est faux.
    assert.deepEqual(Object.keys(ids).sort(), ['Acte I — Le couronnement', 'Acte II — Le sceau brisé', 'La Couronne brisée', 'La Vieille Garde', 'Les Brumes de Vaëlis', 'Prologue']);
    const lit = async (t: string) => (await appel(antor, `/api/univers/1/fiches/${ids[t]}`)).body;
    const att: Array<[string, string, string]> = [
      ['La Couronne brisée', 'Campagne', 'en_cours'],
      ['Les Brumes de Vaëlis', 'Campagne', 'en_preparation'],
      ['La Vieille Garde', 'Campagne', 'terminee'],
      ['Acte II — Le sceau brisé', 'Scénario', 'en_preparation'],
      ['Acte I — Le couronnement', 'Scénario', 'en_preparation'],
      ['Prologue', 'Scénario', 'en_preparation'],
    ];
    for (const [titre, sousType, statut] of att) {
      const f = await lit(titre);
      assert.equal(f.type, 'aventure', titre);
      assert.equal(f.sousType, sousType, titre);
      assert.equal(f.charge.statut, statut, titre);
    }
  });

  test('presentation_ouverte_pour_campagne_active_ou_terminee_fermee_pour_celle_en_preparation', async () => {
    // Casse si : la section « Présentation » n'est pas créée, ou son audience ne suit pas le statut d'origine.
    const pres = async (t: string) => (await appel(antor, `/api/univers/1/fiches/${ids[t]}`)).body.sections.find((s: Any) => s.titre === 'Présentation');
    assert.equal((await pres('La Couronne brisée')).audience.joueursLisent, true);
    assert.equal((await pres('La Vieille Garde')).audience.joueursLisent, true);
    const brumes = await pres('Les Brumes de Vaëlis');
    assert.ok(brumes, 'pas de section « Présentation » sur la campagne en préparation');
    assert.equal(brumes.audience.joueursLisent, false);
  });

  test('scenario_est_sous_sa_campagne_texte_dans_une_section_fermee_cles_d_origine_gardees', async () => {
    // Casse si : le parent, le texte, la fermeture de la section ou les clés d'origine se perdent.
    const a2 = (await appel(antor, `/api/univers/1/fiches/${ids['Acte II — Le sceau brisé']}`)).body;
    assert.deepEqual(a2.ancetres.map((a: Any) => a.id), [ids['La Couronne brisée']]);
    assert.equal(a2.sections.length, 1);
    assert.equal(a2.sections[0].audience.joueursLisent, false);
    assert.equal(a2.sections[0].contenu, "La crypte s'ouvre sous le sceau brisé.");
    const pro = (await appel(antor, `/api/univers/1/fiches/${ids['Prologue']}`)).body;
    assert.deepEqual(pro.ancetres.map((a: Any) => a.id), [ids['Les Brumes de Vaëlis']]);
    // les clés d'origine : la campagne garde 'couronne', le scénario libre garde 'acte-2', le scénario en collision est préfixé
    const sqlite = openDb(dbPath());
    const cle = (t: string) => (sqlite.prepare('SELECT cle_origine FROM fiches WHERE id = ?').get(ids[t]) as { cle_origine: string | null }).cle_origine;
    const att = { couronne: cle('La Couronne brisée'), acte2: cle('Acte II — Le sceau brisé'), acte1: cle('Acte I — Le couronnement') };
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('campagnes', 'scenarios')").all() as unknown[]).length;
    sqlite.close();
    assert.deepEqual(att, { couronne: 'couronne', acte2: 'acte-2', acte1: 'scenario:couronne' });
    assert.equal(tables, 0, 'les tables campagnes / scenarios existent encore');
  });

  test('taches_rattachees_a_la_fiche_et_charges_des_cr_reecrites', async () => {
    // Casse si : une tâche perd sa campagne, la coche se perd, ou le CR pointe encore l'ancien identifiant (2) au lieu de la fiche.
    const t = (await appel(antor, `/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`)).body.taches;
    assert.deepEqual(t.map((x: Any) => [x.libelle, x.categorie, x.faite]).sort(), [['Plan de la crypte', 'cartes', false], ['Statistiques du liche', 'monstres', true]]);
    const b = (await appel(antor, `/api/univers/1/fiches/${ids['Les Brumes de Vaëlis']}/taches`)).body.taches;
    assert.deepEqual(b.map((x: Any) => x.libelle), ['Le passeur des Brumes']);
    const cr = (await appel(antor, '/api/univers/1/comptes-rendus')).body.comptesRendus;
    const s11 = cr.find((c: Any) => c.titre === 'Séance 11');
    assert.equal(s11.campagneId, ids['La Couronne brisée']);
    assert.equal(s11.campagneNom, 'La Couronne brisée');
    assert.equal(cr.find((c: Any) => c.titre === 'Séance 0').campagneNom, 'Les Brumes de Vaëlis');
    assert.ok(!cr.some((c: Any) => c.campagneSupprimee), 'un CR converti dit « Aventure supprimée »');
  });

  test('lea_voit_la_couronne_et_la_vieille_garde_pas_les_brumes_ni_les_actes', async () => {
    // Casse si : la conversion ouvre aux joueurs une campagne en préparation ou un scénario (fuite).
    const l = await appel(lea, '/api/univers/1/fiches?type=aventure');
    assert.deepEqual(l.body.fiches.map((f: Any) => f.titre).sort(), ['La Couronne brisée', 'La Vieille Garde']);
    for (const t of ['Les Brumes de Vaëlis', 'Acte II — Le sceau brisé', 'Acte I — Le couronnement', 'Prologue']) {
      assert.equal((await appel(lea, `/api/univers/1/fiches/${ids[t]}`)).status, 404, t);
    }
    assert.equal((await appel(lea, `/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`)).status, 404);
    const cr = (await appel(lea, '/api/univers/1/comptes-rendus')).body.comptesRendus;
    assert.equal(cr.find((c: Any) => c.titre === 'Séance 11').campagneNom, 'La Couronne brisée');
    const s0 = cr.find((c: Any) => c.titre === 'Séance 0');
    assert.ok(s0, 'le CR reste lisible');
    assert.ok(s0.campagneNom === undefined || s0.campagneNom === null, 'le nom de la campagne en préparation fuit par son CR');
    assert.ok(!JSON.stringify(cr).includes('Brumes de Vaëlis'));
  });

  test('au_navigateur_la_couronne_est_en_cours_ses_blocs_sont_garnis_et_acte_ii_est_dessous', async () => {
    // Casse si : ce que l'API dit n'arrive pas à l'écran (liste, blocs de la fiche, arbre, E-3).
    await lea.goto('/univers/1/fiches/aventures');
    await lea.getByText('La Couronne brisée').first().waitFor();
    const l = await texte(lea);
    assert.match(l, /En cours/);
    assert.ok(!l.includes('Les Brumes'));
    await lea.screenshot({ path: '/tmp/suivi-migration-lea.png', fullPage: true });

    await antor.goto(`/univers/1/fiche/${ids['La Couronne brisée']}`);
    await antor.getByRole('heading', { name: /^Préparation/ }).waitFor();
    await antor.getByText('Plan de la crypte', { exact: true }).waitFor();
    await antor.getByText(/Cochées \(1\)/).waitFor();
    await antor.getByText('Séance 11').first().waitFor();
    await antor.getByRole('link', { name: /Acte II — Le sceau brisé/ }).first().waitFor();
    await antor.screenshot({ path: '/tmp/suivi-migration-antor.png', fullPage: true });

    await antor.goto(`/univers/1/fiche/${ids['Acte II — Le sceau brisé']}`);
    await antor.getByText("La crypte s'ouvre sous le sceau brisé.").waitFor();

    await antor.goto('/univers/1');
    await antor.getByText('Plan de la crypte').first().waitFor();
    const e3 = await texte(antor);
    assert.match(e3.slice(e3.indexOf('Campagnes en cours'), e3.indexOf('Derniers comptes-rendus')), /La Couronne brisée/);
    assert.ok(!e3.slice(e3.indexOf('Campagnes en cours'), e3.indexOf('Derniers comptes-rendus')).includes('Vieille Garde'));
  });

  test('un_second_demarrage_ne_reconvertit_rien', async () => {
    // Casse si : la conversion se rejoue (doublons) ou empêche le redémarrage.
    arreter();
    await new Promise((r) => setTimeout(r, 500));
    await demarrer();
    const a = await connecte(browser, base, 'antor');
    const liste = await appel(a.page, '/api/univers/1/fiches?type=aventure');
    assert.equal(liste.body.fiches.length, 6);
    assert.ok(!/Migration 0017:/.test(journal), `le second démarrage reconvertit : ${journal}`);
    assert.ok(existsSync(dbPath()));
  });
});
