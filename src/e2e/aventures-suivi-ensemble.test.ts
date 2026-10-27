import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

// Feature `kanevas-scenarios-suivi`, assembled, written from the need only (the sheet's « Livre » and
// « Critère de sortie », B-18/B-19 amended, B-49, B-60, E-3, E-9 blocks, E-13, E-14, E-18 of docs/).
// Black box: the real server in stub mode on a base built at the PREVIOUS schema (migrations 0001 to 0016
// then plain SQL rows: three campaigns, two scenarios, tasks, reports), started so that it converts it,
// and a real Chromium. Screenshots: $E2E_SHOTS or the OS temp dir (never committed).
//
// The tests of this file are ordered and share one server and one base: the story of the critère is one
// sitting (read what was converted, prepare, write reports, E-3, retired addresses, deactivate the type,
// retired import/assistant, then delete the campaign).
//
// Test plan (besoin -> case -> proof):
//  AD-127 nominal  the converted campaign is a sheet « En cours », « Présentation » open (active), the
//                  scenario under it, its text in a closed section, the tasks and reports on the campaign
//  AD-127 bords    a campaign « En préparation » stays closed and invisible to Léa ; a « Terminée » one is
//                  open and shown « Terminée » ; a scenario's :::mj block does not reach Léa
//  AD-127 échec    (none: the base is valid) -> the log carries the counts
//  B-60 nominal    « Plan de la crypte » (Cartes) added and ticked -> « Cochées (2) » without reload
//  B-60 bords      Acte II: « Rien à préparer pour l'instant. » ; empty title refused
//  B-60 exclus.    Léa sees no « Préparation » block, by screen and by API
//  B-19 nominal    Léa writes « Séance 12 » from the campaign: « Campagne : La Couronne brisée », first in the
//                  block, in E-13 and in « Derniers comptes-rendus »
//  B-19 exclus.    a report made from Acte II shows « Campagne : Acte II » to Antor and nothing to Léa
//  E-3             « Campagnes en cours » and « Préparation »
//  retraits        /campagnes, /scenarios answer « Page introuvable. » ; PUT …/campagnes/x 404 ; E-18 lines ;
//                  the assistant creates nothing
//  AD-122 (5)      the deactivated type keeps its sheets, blocks and menu
//  AD-119          the deletion announces tasks, scenarios and reports; Acte II at the root; « Aventure supprimée »
const require = createRequire(import.meta.url);
type PW = typeof import('playwright');
function chargerPlaywright(): PW | null {
  for (const chemin of ['playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try {
      return require(chemin) as PW;
    } catch {
      /* try the next one */
    }
  }
  return null;
}
const pw = chargerPlaywright();
const raisonSaut = pw ? false : 'playwright introuvable (ni local ni global)';
type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;

let browser: Browser;
const SHOTS = process.env.E2E_SHOTS ?? join(tmpdir(), 'kanevas-e2e-shots');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

interface Serveur {
  base: string;
  journal: () => string;
  stop: () => void;
}

const NOW = '2026-10-01T10:00:00.000Z';

/** The base at the schema before this feature: migrations 0001 to 0016, then rows. Returns the file. */
function baseAncienSchema(dossier: string): string {
  const src = join(process.cwd(), 'src/db/migrations');
  const dir = join(dossier, 'migrations-16');
  mkdirSync(dir);
  for (const f of readdirSync(src)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 16) copyFileSync(join(src, f), join(dir, f));
  const fichier = join(dossier, 'kanevas.db');
  const db = new Database(fichier);
  db.pragma('foreign_keys = ON');
  db.function('plier', { deterministic: true }, (t: unknown) => t);
  // The previous schema, played by the product's own runner restricted to those files.
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (numero INTEGER PRIMARY KEY, nom TEXT NOT NULL, applique_le TEXT NOT NULL)`);
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const sansCles = /^-- migrate: sans-cles-etrangeres/.test(sql);
    if (sansCles) db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (numero, nom, applique_le) VALUES (?, ?, ?)').run(Number(f.slice(0, 4)), f, NOW);
    })();
    if (sansCles) db.pragma('foreign_keys = ON');
  }
  const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p);
  run("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?), (2, 'lea', ?)", NOW, NOW);
  run("INSERT INTO univers (id, nom, description, cree_le) VALUES (1, 'Lame d''Ébène', '', ?)", NOW);
  run("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur')");
  // Campaigns: 1 active, 2 in preparation, 3 finished.
  run(
    "INSERT INTO campagnes (id, univers_id, nom, statut, cree_le) VALUES (1, 1, 'La Couronne brisée', 'active', ?), (2, 1, 'Les Cendres de Vaëlis', 'en_preparation', ?), (3, 1, 'Le Vieux Pacte', 'terminee', ?)",
    NOW, NOW, NOW,
  );
  // Scenarios: Acte II under campaign 1 (with a GM block), Prologue under campaign 2.
  run(
    "INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le) VALUES (1, 1, 'Acte II — Le sceau brisé', ?, 1, ?, ?), (2, 2, 'Prologue des Cendres', 'Une nuit sans lune.', 1, ?, ?)",
    'Le sceau cède à minuit.\n\n:::mj\nLe traître est Orrin.\n:::\n', NOW, NOW, NOW, NOW,
  );
  // Tasks: two on campaign 1 (one ticked), one on campaign 2.
  run(
    "INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, faite_le, cree_le) VALUES (1, 'monstres', 'Statistiques du Gardien', 0, NULL, ?), (1, 'pnj', 'Dessiner Orrin', 1, ?, ?), (2, 'autre', 'Choisir la musique', 0, NULL, ?)",
    NOW, NOW, NOW, NOW,
  );
  // Reports: Séance 11 on campaign 1, Cendres 0 on campaign 2 ; the text is read by the players.
  const cr = (id: number, titre: string, campagne: number, texte: string) => {
    run("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 1, 'compte_rendu', ?, ?, ?, ?)", id, titre, JSON.stringify({ v: 1, campagne_id: campagne }), NOW, NOW);
    run("INSERT INTO sections (fiche_id, titre, ordre, contenu, contenu_public, version, modifie_le, joueurs_lisent) VALUES (?, 'Compte-rendu', 1, ?, ?, 1, ?, 1)", id, texte, texte, NOW);
  };
  cr(1, 'Séance 11', 1, 'Les héros descendent dans la crypte.');
  cr(2, 'Séance zéro des Cendres', 2, 'Présentation des personnages.');
  db.close();
  return fichier;
}

async function demarrer(dossier: string, dbPath: string): Promise<Serveur> {
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    KANEVAS_STUB: '1',
    KANEVAS_SANS_SEMIS: '1',
    DB_PATH: dbPath,
    SESSION_SECRET: 'e2e-secret-0123456789',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
  const child: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = '';
  child.stdout?.on('data', (d) => (sortie += String(d)));
  child.stderr?.on('data', (d) => (sortie += String(d)));
  const base = `http://127.0.0.1:${port}`;
  const stop = () => {
    child.kill('SIGKILL');
    rmSync(dossier, { recursive: true, force: true });
  };
  for (let i = 0; i < 200; i++) {
    try {
      await fetch(`${base}/healthz`);
      return { base, journal: () => sortie, stop };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const vu = sortie;
  stop();
  throw new Error(`server did not start: ${vu}`);
}

const NOMS: Record<string, string> = { antor: 'Antor', lea: 'Léa' };
async function connecter(s: Serveur, compte: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(10000);
  const page = await ctx.newPage();
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: `Se connecter en tant que ${NOMS[compte]}` }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion-bouchon'));
  await page.close();
  return ctx;
}

let srv: Serveur;
let antor: BrowserContext;
let lea: BrowserContext;

async function ouvrir(ctx: BrowserContext, chemin: string): Promise<Page> {
  const p = await ctx.newPage();
  await p.goto(chemin);
  return p;
}
async function capture(p: Page, nom: string) {
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `suivi-${nom}.png`), fullPage: true });
}
const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const declencheur = (p: Page, nom: string, statut: string) =>
  p.getByRole('button', { name: new RegExp(`^${echapper(statut)} .*changer le statut de « ${echapper(nom)} »$`) });
let ids: Record<string, number> = {};
const texteDe = async (p: Page) => (await p.locator('body').innerText()).replace(/’/g, "'");

describe('kanevas-scenarios-suivi : du schéma précédent à la fiche de l’aventure', { skip: raisonSaut }, () => {
  before(async () => {
    if (!existsSync(join(process.cwd(), 'dist/public/index.html'))) {
      const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
      assert.equal(r.status, 0, 'npm run build');
    }
    browser = await pw!.chromium.launch();
    const dossier = mkdtempSync(join(tmpdir(), 'kanevas-suivi-'));
    srv = await demarrer(dossier, baseAncienSchema(dossier));
    antor = await connecter(srv, 'antor');
    lea = await connecter(srv, 'lea');
    const liste = await antor.request.get('/api/univers/1/fiches?type=aventure');
    ids = Object.fromEntries(((await liste.json()) as { fiches: { id: number; titre: string }[] }).fiches.map((f) => [f.titre, f.id]));
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });


  // ------------------------------------------------------------------ AD-127 : la conversion
  // Fails if the start-up does not convert, if the log does not carry the counts, if a campaign's status or
  // « Présentation » opening is wrong, or if the scenario / tasks / reports are not on the right sheet.
  test('la_base_est_convertie_et_le_journal_dit_les_comptes', async () => {
    assert.match(srv.journal(), /"campagnes":3/, 'journal : 3 campagnes');
    assert.match(srv.journal(), /"scenarios":2/, 'journal : 2 scénarios');
    assert.match(srv.journal(), /"taches":3/, 'journal : 3 tâches');
    assert.match(srv.journal(), /"comptesRendus":2/, 'journal : 2 comptes-rendus');

    const p = await ouvrir(antor, '/univers/1/fiches/aventures');
    await declencheur(p, 'La Couronne brisée', 'En cours').waitFor();
    await declencheur(p, 'Les Cendres de Vaëlis', 'En préparation').waitFor();
    await declencheur(p, 'Le Vieux Pacte', 'Terminée').waitFor();
    await capture(p, 'liste-antor-apres-conversion');
    const rep = await antor.request.get('/api/univers/1/fiches?type=aventure');
    const titres = ((await rep.json()) as { fiches: { titre: string; sousType?: string | null }[] }).fiches;
    assert.deepEqual(
      titres.map((f) => `${f.titre}|${f.sousType}`).sort(),
      [
        'Acte II — Le sceau brisé|Scénario',
        'La Couronne brisée|Campagne',
        'Le Vieux Pacte|Campagne',
        'Les Cendres de Vaëlis|Campagne',
        'Prologue des Cendres|Scénario',
      ],
    );
    await p.close();
  });

  // Fails if the campaign page does not carry the tasks (ticked ones apart), the report, the scenario under it,
  // and an open « Présentation » for an active campaign.
  test('la_campagne_active_porte_ses_taches_ses_cr_son_scenario_et_une_presentation_ouverte', async () => {
    const p = await ouvrir(antor, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    await declencheur(p, 'La Couronne brisée', 'En cours').waitFor();
    const prep = p.getByRole('region', { name: 'Préparation' });
    await prep.getByRole('checkbox', { name: 'Statistiques du Gardien' }).waitFor();
    assert.equal(await prep.getByRole('checkbox', { name: 'Statistiques du Gardien' }).isChecked(), false);
    assert.equal(await prep.getByRole('checkbox', { name: 'Choisir la musique' }).count(), 0, 'la tâche de l’autre campagne n’est pas ici');
    await prep.getByText('Cochées (1)').click();
    await prep.getByRole('button', { name: 'Décocher Dessiner Orrin' }).waitFor();
    const crs = p.getByRole('region', { name: 'Comptes-rendus' });
    await crs.getByRole('link', { name: 'Séance 11' }).waitFor();
    assert.equal(await crs.getByRole('link').count(), 1, 'seul le CR de cette campagne');
    const contient = p.getByRole('region', { name: 'Contient' });
    await contient.getByRole('link', { name: /Acte II — Le sceau brisé/ }).waitFor();
    await p.getByRole('button', { name: /^Lue des joueurs/ }).waitFor();
    await capture(p, 'campagne-convertie-antor');
    await p.close();
  });

  // Fails if the scenario's text is lost, open to the players, or if its tasks / reports are not empty.
  test('le_scenario_garde_son_texte_dans_une_section_fermee_et_n_a_ni_tache_ni_cr', async () => {
    const p = await ouvrir(antor, `/univers/1/fiche/${ids['Acte II — Le sceau brisé']}`);
    await declencheur(p, 'Acte II — Le sceau brisé', 'En préparation').waitFor();
    await p.getByText('Le sceau cède à minuit.').waitFor();
    await p.getByRole('button', { name: /^MJ seul/ }).first().waitFor();
    assert.equal(await p.getByRole('button', { name: /^Lue des joueurs/ }).count(), 0, 'aucune section lue des joueurs');
    await p.getByRole('region', { name: 'Préparation' }).getByText("Rien à préparer pour l'instant.").waitFor();
    await p.getByRole('region', { name: 'Comptes-rendus' }).getByText("Aucun compte-rendu pour l'instant.").waitFor();
    await capture(p, 'scenario-converti-antor');
    await p.close();
  });

  // Fails if a campaign in preparation (or its scenario) is visible to Léa, if a finished one is not
  // open, or if the scenario's GM block leaks.
  test('lea_ne_voit_que_la_campagne_en_cours_et_la_terminee_jamais_celle_en_preparation_ni_les_scenarios', async () => {
    const rep = await lea.request.get('/api/univers/1/fiches?type=aventure');
    const titres = ((await rep.json()) as { fiches: { titre: string }[] }).fiches.map((f) => f.titre).sort();
    assert.deepEqual(titres, ['La Couronne brisée', 'Le Vieux Pacte']);
    const p = await ouvrir(lea, '/univers/1/fiches/aventures');
    await p.getByText('La Couronne brisée').first().waitFor();
    const main = await p.locator('main').innerText();
    assert.match(main, /En cours/);
    assert.match(main, /Terminée/);
    assert.doesNotMatch(main, /Les Cendres de Vaëlis|Acte II|Prologue|changer le statut/);
    assert.equal(await p.getByRole('button', { name: /changer le statut/ }).count(), 0, 'pas de menu de statut');
    await capture(p, 'liste-lea-apres-conversion');
    for (const t of ['Les Cendres de Vaëlis', 'Acte II — Le sceau brisé', 'Prologue des Cendres']) {
      const q = await ouvrir(lea, `/univers/1/fiche/${ids[t]}`);
      await q.getByText('Page introuvable.').waitFor();
      assert.doesNotMatch(await texteDe(q), new RegExp(t.slice(0, 9)), `${t} : aucun titre`);
      await q.close();
    }
    // The text of a closed scenario does not come out of the search.
    const r = await lea.request.get('/api/univers/1/fiches?q=Orrin');
    assert.deepEqual(((await r.json()) as { fiches: unknown[] }).fiches, []);
    await p.close();
  });

  // Fails if Léa's page of the active campaign shows « Préparation » or the scenario, or lacks the status and the report.
  test('lea_lit_la_campagne_avec_son_statut_et_ses_cr_sans_preparation_ni_scenario', async () => {
    const p = await ouvrir(lea, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    await p.getByText('Statut :').waitFor();
    await p.getByText('En cours', { exact: true }).first().waitFor();
    await p.getByRole('region', { name: 'Comptes-rendus' }).getByRole('link', { name: 'Séance 11' }).waitFor();
    const t = await texteDe(p);
    assert.doesNotMatch(t, /Préparation|Statistiques du Gardien|Acte II/);
    await capture(p, 'campagne-lea');
    // By the API: no task for a player.
    const taches = await lea.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`);
    assert.equal(taches.status(), 404);
    assert.doesNotMatch(await taches.text(), /Statistiques/);
    await p.close();
  });

  // The CR of a campaign Léa cannot read is readable, without any trace of that campaign.
  test('lea_lit_le_cr_d_une_campagne_fermee_sans_ligne_campagne_ni_nom', async () => {
    const p = await ouvrir(lea, '/univers/1/fiche/2');
    await p.getByRole('heading', { name: 'Séance zéro des Cendres' }).waitFor();
    await p.getByText('Présentation des personnages.').waitFor();
    assert.doesNotMatch(await texteDe(p), /Campagne\s*:|Vaëlis|Aventure supprimée/);
    const rep = await lea.request.get('/api/univers/1/comptes-rendus');
    assert.doesNotMatch(await rep.text(), /Vaëlis|Aventure supprimée/);
    const fiche = await lea.request.get('/api/univers/1/fiches/2');
    assert.doesNotMatch(await fiche.text(), /Vaëlis|Aventure supprimée/);
    await capture(p, 'cr-campagne-fermee-lea');
    await p.close();
  });

  // ------------------------------------------------------------------ B-60 : la préparation
  // Fails if « Ajouter » + the tick do not move the task under « Cochées (2) » in place.
  test('antor_ajoute_plan_de_la_crypte_et_le_coche_il_passe_sous_cochees_sans_recharger', async () => {
    const p = await ouvrir(antor, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    const prep = p.getByRole('region', { name: 'Préparation' });
    await prep.getByRole('checkbox', { name: 'Statistiques du Gardien' }).waitFor();
    await p.evaluate(() => ((window as unknown as { __marque: string }).__marque = 'sans-rechargement'));
    await prep.getByRole('textbox', { name: 'Nouvelle tâche' }).fill('Plan de la crypte');
    await prep.getByRole('combobox', { name: 'Catégorie' }).selectOption({ label: 'Cartes' });
    await prep.getByRole('button', { name: 'Ajouter' }).click();
    const plan = prep.getByRole('checkbox', { name: 'Plan de la crypte' });
    await plan.waitFor();
    assert.equal(await plan.isChecked(), false);
    await prep.getByRole('heading', { name: 'Cartes' }).waitFor();
    await plan.click();
    await prep.getByText('Cochées (2)').waitFor();
    assert.equal(await prep.getByRole('checkbox', { name: 'Plan de la crypte' }).count(), 0, 'quitte la liste active');
    await prep.getByText('Cochées (2)').click();
    await prep.getByRole('button', { name: 'Décocher Plan de la crypte' }).waitFor();
    await prep.getByRole('button', { name: 'Décocher Dessiner Orrin' }).waitFor();
    assert.equal(await p.evaluate(() => (window as unknown as { __marque?: string }).__marque), 'sans-rechargement', 'la page n’a pas été rechargée');
    await capture(p, 'preparation-cochee');
    // Untick brings it back to the active list.
    await prep.getByRole('button', { name: 'Décocher Plan de la crypte' }).click();
    await prep.getByText('Cochées (1)').waitFor();
    await prep.getByRole('checkbox', { name: 'Plan de la crypte' }).click();
    await prep.getByText('Cochées (2)').waitFor();
    await p.close();
    // The tick is stored: a fresh load still says two.
    const q = await ouvrir(antor, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    await q.getByRole('region', { name: 'Préparation' }).getByText('Cochées (2)').waitFor();
    await q.close();
  });

  // Fails if the label bounds (1 to 200) are not held, if a failing add loses the field, or if a sheet that is not an adventure takes tasks.
  test('libelle_de_1_a_200_caracteres_echec_d_ajout_dit_et_garde_la_saisie_une_fiche_non_aventure_n_a_pas_de_taches', async () => {
    const base = `/api/univers/1/fiches/${ids['Prologue des Cendres']}/taches`;
    assert.equal((await antor.request.post(base, { data: { categorie: 'autre', libelle: '' } })).status(), 400, 'vide');
    assert.equal((await antor.request.post(base, { data: { categorie: 'autre', libelle: 'x'.repeat(201) } })).status(), 400, '201');
    assert.equal((await antor.request.post(base, { data: { categorie: 'autre', libelle: 'x'.repeat(200) } })).status(), 201, '200');
    assert.equal((await antor.request.post(base, { data: { categorie: 'dragons', libelle: 'a' } })).status(), 400, 'catégorie inconnue');
    assert.equal((await antor.request.post('/api/univers/1/fiches/1/taches', { data: { categorie: 'autre', libelle: 'a' } })).status(), 404, 'un CR n’est pas une aventure');
    assert.equal((await lea.request.post(`/api/univers/1/fiches/${ids['Acte II — Le sceau brisé']}/taches`, { data: { categorie: 'autre', libelle: 'a' } })).status(), 404, 'Léa');

    const p = await ouvrir(antor, `/univers/1/fiche/${ids['Acte II — Le sceau brisé']}`);
    const prep = p.getByRole('region', { name: 'Préparation' });
    await prep.getByText("Rien à préparer pour l'instant.").waitFor();
    await prep.getByRole('textbox', { name: 'Nouvelle tâche' }).fill('Caler le combat');
    await p.route(/\/api\/univers\/1\/fiches\/\d+\/taches$/, (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boum"}' }) : route.continue(),
    );
    await prep.getByRole('button', { name: 'Ajouter' }).click();
    await prep.getByText(/L.action n.a pas abouti\. Réessayez\./).waitFor();
    assert.equal(await prep.getByRole('textbox', { name: 'Nouvelle tâche' }).inputValue(), 'Caler le combat');
    assert.equal(await prep.getByRole('checkbox', { name: 'Caler le combat' }).count(), 0);
    await capture(p, 'preparation-echec-ajout');
    await p.unroute(/\/api\/univers\/1\/fiches\/\d+\/taches$/);
    await prep.getByRole('button', { name: 'Ajouter' }).click();
    await prep.getByRole('checkbox', { name: 'Caler le combat' }).waitFor();
    await p.close();
  });

  // Fails if the tick of a player is accepted (GM only).
  test('lea_ne_coche_aucune_tache_par_l_api', async () => {
    const r = await antor.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`);
    const taches = ((await r.json()) as { taches: { id: number; libelle: string; faite: boolean }[] }).taches;
    const stat = taches.find((t) => t.libelle === 'Statistiques du Gardien')!;
    assert.equal((await lea.request.put(`/api/taches/${stat.id}`, { data: { faite: true } })).status(), 404);
    const apres = await antor.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`);
    assert.equal(((await apres.json()) as { taches: { id: number; faite: boolean }[] }).taches.find((t) => t.id === stat.id)!.faite, false);
  });

  // ------------------------------------------------------------------ B-19 : les comptes-rendus
  // Fails if the CR does not name the campaign, or is not first in the block, E-13 and « Derniers comptes-rendus ».
  test('lea_ecrit_seance_12_depuis_la_campagne_le_cr_nomme_la_campagne_et_passe_en_tete_partout', async () => {
    const p = await ouvrir(lea, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    const bloc = p.getByRole('region', { name: 'Comptes-rendus' });
    await bloc.getByRole('link', { name: 'Séance 11' }).waitFor();
    await bloc.getByRole('button', { name: 'Nouveau compte-rendu' }).click();
    const dlg = p.getByRole('dialog', { name: 'Nouveau compte-rendu' });
    // Bord : titre vide -> pas de création.
    await dlg.getByRole('textbox', { name: 'Titre' }).fill('');
    await dlg.getByRole('button', { name: 'Créer' }).click();
    await dlg.getByText('Donnez un titre.').waitFor();
    await dlg.getByRole('textbox', { name: 'Titre' }).fill('Séance 12');
    await dlg.getByRole('textbox', { name: /^Texte/ }).fill('Ils ouvrent le sceau.');
    await dlg.getByRole('button', { name: 'Créer' }).click();
    await p.waitForURL(/\/fiche\/\d+$/);
    await p.getByRole('heading', { name: 'Séance 12' }).waitFor();
    await p.getByText(/Campagne\s*:\s*La Couronne brisée/).waitFor();
    await p.getByText('Ils ouvrent le sceau.').waitFor();
    await capture(p, 'cr-seance-12-lea');
    // The line leads back to the campaign.
    await p.getByRole('link', { name: 'La Couronne brisée' }).last().click();
    await p.waitForURL(new RegExp(`/fiche/${ids['La Couronne brisée']}$`));
    const bloc2 = p.getByRole('region', { name: 'Comptes-rendus' });
    await bloc2.getByRole('link', { name: 'Séance 12' }).waitFor();
    const liens = await bloc2.getByRole('link').allInnerTexts();
    assert.deepEqual(liens.map((l) => l.trim()).slice(0, 2), ['Séance 12', 'Séance 11']);
    // E-13.
    await p.getByRole('link', { name: 'Comptes-rendus', exact: true }).first().click();
    await p.getByRole('heading', { name: 'Comptes-rendus', level: 1 }).waitFor();
    const e13 = p.locator('main').getByRole('listitem');
    await e13.first().waitFor();
    assert.match(await e13.first().innerText(), /Séance 12/);
    assert.match(await e13.first().innerText(), /La Couronne brisée/);
    await capture(p, 'e13-lea');
    // E-3.
    await p.goto('/univers/1');
    const derniers = p.getByRole('region', { name: 'Derniers comptes-rendus' });
    await derniers.getByRole('link', { name: 'Séance 12' }).waitFor();
    const dt = await derniers.innerText();
    assert.ok(dt.indexOf('Séance 12') >= 0 && dt.indexOf('Séance 12') < dt.indexOf('Séance 11'), 'Séance 12 avant Séance 11');
    await capture(p, 'e3-lea');
    await p.close();
  });

  // Fails if a failing creation loses the title and text.
  test('cr_en_echec_message_et_saisie_gardee', async () => {
    const p = await ouvrir(lea, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    const bloc = p.getByRole('region', { name: 'Comptes-rendus' });
    await bloc.getByRole('button', { name: 'Nouveau compte-rendu' }).click();
    const dlg = p.getByRole('dialog', { name: 'Nouveau compte-rendu' });
    await dlg.getByRole('textbox', { name: 'Titre' }).fill('Jamais écrit');
    await dlg.getByRole('textbox', { name: /^Texte/ }).fill('Perdu ?');
    await p.route(/\/api\/univers\/1\/comptes-rendus$/, (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boum"}' }) : route.continue(),
    );
    await dlg.getByRole('button', { name: 'Créer' }).click();
    await dlg.getByText(/Le compte-rendu n.a pas pu être créé\. Réessayez\./).waitFor();
    assert.equal(await dlg.getByRole('textbox', { name: 'Titre' }).inputValue(), 'Jamais écrit');
    assert.equal(await dlg.getByRole('textbox', { name: /^Texte/ }).inputValue(), 'Perdu ?');
    await capture(p, 'cr-echec');
    await p.close();
    const liste = await antor.request.get('/api/univers/1/comptes-rendus');
    assert.doesNotMatch(await liste.text(), /Jamais écrit/);
  });

  // Fails if a CR made from a scenario names it to Léa, who cannot read it.
  test('cr_cree_depuis_acte_ii_montre_la_campagne_a_antor_et_rien_a_lea', async () => {
    const p = await ouvrir(antor, `/univers/1/fiche/${ids['Acte II — Le sceau brisé']}`);
    const bloc = p.getByRole('region', { name: 'Comptes-rendus' });
    await bloc.getByRole('button', { name: 'Nouveau compte-rendu' }).click();
    const dlg = p.getByRole('dialog', { name: 'Nouveau compte-rendu' });
    await dlg.getByRole('textbox', { name: 'Titre' }).fill('Répétition générale');
    await dlg.getByRole('textbox', { name: /^Texte/ }).fill('Les joueurs ne sont pas là.');
    await dlg.getByRole('button', { name: 'Créer' }).click();
    await p.waitForURL(/\/fiche\/\d+$/);
    await p.getByText(/Campagne\s*:\s*Acte II/).waitFor();
    await capture(p, 'cr-acte-ii-antor');
    const crId = Number(new URL(p.url()).pathname.split('/').pop());
    await p.close();

    const l = await ouvrir(lea, `/univers/1/fiche/${crId}`);
    await l.getByRole('heading', { name: 'Répétition générale' }).waitFor();
    await l.getByText('Les joueurs ne sont pas là.').waitFor();
    assert.doesNotMatch(await texteDe(l), /Campagne\s*:|Acte II|Aventure supprimée/);
    await capture(l, 'cr-acte-ii-lea');
    await l.close();
    for (const url of ['/api/univers/1/comptes-rendus', `/api/univers/1/fiches/${crId}`]) {
      const r = await lea.request.get(url);
      assert.doesNotMatch(await r.text(), /Acte II|sceau brisé/, url);
    }
    // The block of Acte II lists it for Antor.
    const a = await ouvrir(antor, `/univers/1/fiche/${ids['Acte II — Le sceau brisé']}`);
    await a.getByRole('region', { name: 'Comptes-rendus' }).getByRole('link', { name: 'Répétition générale' }).waitFor();
    await a.close();
  });

  // Fails if a report can be written under a sheet that is not an adventure or one the writer cannot read.
  test('cr_refuse_sous_une_fiche_qui_n_est_pas_une_aventure_ou_que_le_joueur_ne_lit_pas', async () => {
    const sous = (campagneId: number) => lea.request.post('/api/univers/1/comptes-rendus', { data: { campagneId, titre: 'Pirate', texte: 'x' } });
    assert.notEqual((await sous(1)).status(), 201, 'un CR n’est pas une aventure');
    assert.notEqual((await sous(ids['Les Cendres de Vaëlis'])).status(), 201, 'campagne fermée à Léa');
    assert.notEqual((await sous(ids['Acte II — Le sceau brisé'])).status(), 201, 'scénario fermé à Léa');
    assert.notEqual((await sous(999999)).status(), 201, 'inconnue');
    const r = await antor.request.get('/api/univers/1/comptes-rendus');
    assert.doesNotMatch(await r.text(), /Pirate/);
  });

  // ------------------------------------------------------------------ E-3
  // Fails if E-3 does not list the campaign « En cours » with its status, or its open tasks for the GM only.
  test('e3_campagnes_en_cours_avec_statut_et_preparation_pour_le_mj_seul', async () => {
    const a = await ouvrir(antor, '/univers/1');
    const campagnes = a.getByRole('region', { name: 'Campagnes en cours' });
    await campagnes.getByRole('link', { name: /La Couronne brisée/ }).waitFor();
    assert.match(await campagnes.innerText(), /En cours/);
    assert.doesNotMatch(await campagnes.innerText(), /Les Cendres|Le Vieux Pacte|Acte II/);
    const prep = a.getByRole('region', { name: 'Préparation' });
    await prep.getByText('Statistiques du Gardien').waitFor();
    const t = await prep.innerText();
    assert.doesNotMatch(t, /Plan de la crypte|Dessiner Orrin|Choisir la musique|Caler le combat/, 'ni cochées ni autre campagne ni scénario en préparation');
    await capture(a, 'e3-antor');
    await a.close();

    const l = await ouvrir(lea, '/univers/1');
    const cl = l.getByRole('region', { name: 'Campagnes en cours' });
    await cl.getByRole('link', { name: /La Couronne brisée/ }).waitFor();
    assert.match(await cl.innerText(), /En cours/);
    await l.getByRole('region', { name: 'Derniers comptes-rendus' }).waitFor();
    assert.equal(await l.getByRole('region', { name: 'Préparation' }).count(), 0);
    assert.doesNotMatch(await texteDe(l), /Statistiques du Gardien|Campagnes actives/);
    await capture(l, 'e3-lea-blocs');
    await l.close();
  });

  // Fails if a scenario « En cours » does not bring its open tasks into E-3 (the block reads adventures « En cours »,
  // not only campaigns) or lands in « Campagnes en cours », and if a campaign set « Terminée » stays listed.
  test('e3_suit_le_statut_scenario_en_cours_dans_preparation_campagne_terminee_hors_des_blocs', async () => {
    const patch = (id: number, statut: string) => antor.request.patch(`/api/univers/1/fiches/${id}`, { data: { statut } });
    const acte = ids['Acte II — Le sceau brisé'];
    const camp = ids['La Couronne brisée'];
    assert.equal((await patch(acte, 'en_cours')).status(), 200);
    try {
      const a = await ouvrir(antor, '/univers/1');
      const prep = a.getByRole('region', { name: 'Préparation' });
      await prep.getByText('Caler le combat').waitFor();
      await prep.getByText('Statistiques du Gardien').waitFor();
      assert.doesNotMatch(await a.getByRole('region', { name: 'Campagnes en cours' }).innerText(), /Acte II/);
      await a.close();
      assert.equal((await patch(camp, 'terminee')).status(), 200);
      const b = await ouvrir(antor, '/univers/1');
      await b.getByRole('region', { name: 'Préparation' }).getByText('Caler le combat').waitFor();
      assert.equal(await b.getByRole('region', { name: 'Préparation' }).getByText('Statistiques du Gardien').count(), 0);
      await b.getByRole('region', { name: 'Campagnes en cours' }).getByText('Aucune campagne en cours.').waitFor();
      await capture(b, 'e3-campagne-terminee');
      await b.close();
    } finally {
      assert.equal((await patch(camp, 'en_cours')).status(), 200);
      assert.equal((await patch(acte, 'en_preparation')).status(), 200);
    }
  });

  // ------------------------------------------------------------------ retraits
  // Fails if an old address still answers.
  test('les_adresses_campagnes_et_scenarios_repondent_page_introuvable_et_la_barre_n_a_plus_campagnes', async () => {
    for (const chemin of ['/univers/1/campagnes', `/univers/1/campagnes/${ids['La Couronne brisée']}`, '/univers/1/campagnes/1', '/univers/1/scenarios/1']) {
      for (const ctx of [antor, lea]) {
        const p = await ouvrir(ctx, chemin);
        await p.getByText('Page introuvable.').waitFor();
        await p.close();
      }
    }
    const p = await ouvrir(antor, '/univers/1');
    const barre = p.getByRole('navigation', { name: 'Navigation principale' });
    await barre.getByRole('link', { name: 'Comptes-rendus', exact: true }).waitFor();
    await barre.getByRole('link', { name: 'Aventures', exact: true }).waitFor();
    assert.equal(await barre.getByRole('link', { name: /^Campagnes?$/ }).count(), 0);
    await capture(p, 'barre-sans-campagnes');
    await p.close();
    for (const url of ['/api/univers/1/campagnes', '/api/univers/1/scenarios']) {
      assert.equal((await antor.request.get(url)).status(), 404, url);
    }
  });

  // Fails if the import API still takes campaigns/scenarios, or a lot still counts them.
  test('import_sans_routes_campagnes_ni_scenarios_et_lot_sans_ces_compteurs', async () => {
    const rep = await antor.request.post('/api/univers/1/jetons', { data: { nom: 'Script Kanka — Mac', dureeJours: 30 } });
    assert.equal(rep.status(), 201);
    const valeur = ((await rep.json()) as { valeur: string }).valeur;
    const h = { Authorization: `Bearer ${valeur}` };
    const api = (m: string, u: string, data?: unknown) => antor.request.fetch(`${srv.base}/api/import/v1/univers/1${u}`, { method: m, headers: h, data: data as object });
    const lot = ((await (await api('POST', '/lots')).json()) as { id?: number; lotId?: number });
    const lotId = lot.id ?? lot.lotId;
    assert.ok(lotId, 'lot ouvert');
    for (const [chemin, corps] of [
      ['/campagnes/x', { nom: 'Fantôme', statut: 'active' }],
      ['/scenarios/x', { campagne: 'x', titre: 'Fantôme', contenu: 'y' }],
    ] as const) {
      for (const q of ['', `?lot=${lotId}`]) {
        const r = await api('PUT', `${chemin}${q}`, corps);
        assert.equal(r.status(), 404, `PUT ${chemin}${q}`);
      }
    }
    const f = await api('PUT', `/fiches/aldric?lot=${lotId}`, { type: 'personnage', titre: 'Aldric du Gris', sections: [{ cle: 'apparence', titre: 'Apparence', contenu: 'Grand.', audience: 'joueurs' }] });
    assert.ok(f.status() < 300, `PUT fiche : ${f.status()} ${await f.text()}`);
    const clos = await api('POST', `/lots/${lotId}/clore`);
    assert.equal(clos.status(), 200);
    const brut = await (await antor.request.get('/api/univers/1/lots')).json();
    const lots = (Array.isArray(brut) ? brut : (brut as { lots: unknown[] }).lots) as { compteurs: Record<string, unknown> }[];
    assert.ok(lots.length >= 1);
    for (const l of lots) assert.deepEqual(Object.keys(l.compteurs).sort(), ['fiches', 'fichiers', 'relations'].sort());
    // E-18, on screen.
    const p = await ouvrir(antor, '/univers/1/acces-api');
    await p.getByText(/Fiches\s*:\s*1 créée/).waitFor();
    assert.doesNotMatch(await texteDe(p), /Campagnes\s*:|Scénarios\s*:/);
    await capture(p, 'e18-lot');
    await p.close();
  });

  // Fails if the assistant cannot create an adventure (B-62, AD-126), still lists campaigns, or lets the player create.
  test('l_assistant_d_antor_cree_une_campagne_en_preparation_et_ne_liste_pas_les_campagnes', async () => {
    const liste = async () => ((await (await antor.request.get('/api/univers/1/fiches?type=aventure')).json()) as { fiches: { titre: string; id: number; charge: { statut: string } }[] }).fiches;
    const nAvant = (await liste()).length;
    const r = await antor.request.post('/api/univers/1/assistant/messages', { data: { message: 'Crée une campagne « La Reine rouge »', historique: [] } });
    assert.equal(r.status(), 200, await r.text());
    const corps = (await r.json()) as { reponse: string; evenements: { type: string; libelle: string }[] };
    assert.equal(corps.reponse, 'Campagne « La Reine rouge » créée.');
    assert.deepEqual(corps.evenements.map((e) => [e.type, e.libelle]), [['fiche_creee', 'Fiche « La Reine rouge » créée']]);
    const f = await liste();
    assert.equal(f.length, nAvant + 1);
    assert.equal(f.find((x) => x.titre === 'La Reine rouge')!.charge.statut, 'en_preparation');
    const q = await antor.request.post('/api/univers/1/assistant/messages', { data: { message: 'Liste les campagnes de l’univers', historique: [] } });
    assert.equal(q.status(), 200);
    assert.match(await q.text(), /Je ne sais répondre qu/, 'pas de lister_campagnes');
    const l = await lea.request.post('/api/univers/1/assistant/messages', { data: { message: 'Crée une campagne « Pirate »', historique: [] } });
    const lc = (await l.json()) as { reponse: string; evenements: unknown[] };
    assert.deepEqual(lc.evenements, []);
    assert.match(lc.reponse, /creer_fiche/);
    assert.equal((await liste()).length, nAvant + 1);
  });

  // ------------------------------------------------------------------ AD-122 (5)
  // Fails if deactivating the type hides the adventures, their blocks or their menu, or leaves « Nouvelle aventure ».
  test('type_aventure_desactive_la_campagne_reste_lisible_avec_ses_blocs_et_e3_la_liste_encore', async () => {
    const p = await ouvrir(antor, '/univers/1/parametres');
    const groupe = p.getByRole('radiogroup', { name: 'Aventure' });
    await groupe.waitFor();
    await groupe.getByRole('radio', { name: 'Désactivé', exact: true }).click();
    await p.getByRole('alertdialog').getByRole('button', { name: 'Désactiver', exact: true }).click();
    await p.getByText(/Aventure : désactivé dans Lame d.Ébène\./).waitFor();
    await capture(p, 'type-desactive-parametres');

    const types = p.waitForResponse((r) => r.url().includes('/api/univers/1/types') && r.request().method() === 'GET');
    await p.goto(`/univers/1/fiche/${ids['La Couronne brisée']}`);
    await types;
    await declencheur(p, 'La Couronne brisée', 'En cours').waitFor();
    await p.getByRole('region', { name: 'Préparation' }).getByRole('checkbox', { name: 'Statistiques du Gardien' }).waitFor();
    await p.getByRole('region', { name: 'Comptes-rendus' }).getByRole('button', { name: 'Nouveau compte-rendu' }).waitFor();
    const barre = p.getByRole('navigation', { name: 'Navigation principale' });
    await barre.getByRole('link', { name: 'Comptes-rendus', exact: true }).waitFor();
    assert.equal(await barre.getByRole('link', { name: 'Aventures', exact: true }).count(), 0, 'plus d’entrée dans la barre');
    await capture(p, 'type-desactive-fiche');
    // The status menu still works.
    await p.getByRole('button', { name: /changer le statut de « La Couronne brisée »/ }).click();
    await p.getByRole('menuitem', { name: 'Prête', exact: true }).click();
    await declencheur(p, 'La Couronne brisée', 'Prête').waitFor();
    await p.getByRole('button', { name: /changer le statut de « La Couronne brisée »/ }).click();
    await p.getByRole('menuitem', { name: 'En cours', exact: true }).click();
    await declencheur(p, 'La Couronne brisée', 'En cours').waitFor();

    await p.goto('/univers/1/fiches/aventures');
    await p.getByText('Ce type est désactivé dans cet univers.').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Nouvelle aventure' }).count(), 0);
    await p.getByText('La Couronne brisée').first().waitFor();
    // E-3 lists it still.
    await p.goto('/univers/1');
    await p.getByRole('region', { name: 'Campagnes en cours' }).getByRole('link', { name: /La Couronne brisée/ }).waitFor();
    await p.getByRole('region', { name: 'Préparation' }).getByText('Statistiques du Gardien').waitFor();
    await capture(p, 'type-desactive-e3');

    // Reactivate.
    await p.goto('/univers/1/parametres');
    const g2 = p.getByRole('radiogroup', { name: 'Aventure' });
    await g2.getByRole('radio', { name: 'Activé', exact: true }).click();
    await p.getByText(/Aventure : activé dans Lame d.Ébène\./).waitFor();
    const types2 = p.waitForResponse((r) => r.url().includes('/api/univers/1/types') && r.request().method() === 'GET');
    await p.goto('/univers/1');
    await types2;
    await p.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Aventures', exact: true }).waitFor();
    await p.close();
  });

  // ------------------------------------------------------------------ AD-119 : la suppression
  // Fails if the confirmation does not count tasks, scenarios and reports, if « Annuler » deletes, or if the
  // consequences (scenario at the root, « Aventure supprimée » for the GM only) are wrong.
  test('supprimer_la_campagne_annonce_taches_scenarios_et_cr_puis_acte_ii_est_a_la_racine_et_le_cr_dit_aventure_supprimee', async () => {
    const p = await ouvrir(antor, `/univers/1/fiche/${ids['La Couronne brisée']}`);
    await declencheur(p, 'La Couronne brisée', 'En cours').waitFor();
    await p.getByRole('button', { name: 'Autres actions sur « La Couronne brisée »' }).click();
    await p.getByRole('menuitem', { name: /^Supprimer la fiche/ }).click();
    const dlg = p.getByRole('alertdialog');
    await dlg.waitFor();
    await dlg.getByText(/3 tâches de préparation supprimées/).waitFor();
    const t = await dlg.innerText();
    assert.match(t, /1 scénarios? (qui )?passe(nt)? à la racine/);
    assert.match(t, /2 comptes-rendus (qui )?resteront sans aventure/);
    await capture(p, 'suppression-bilan');
    // Annuler: nothing is deleted.
    await dlg.getByRole('button', { name: 'Annuler' }).click();
    await dlg.waitFor({ state: 'detached' });
    assert.equal((await antor.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}`)).status(), 200);
    assert.equal((await antor.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`)).status(), 200);
    // Confirm.
    await p.getByRole('button', { name: 'Autres actions sur « La Couronne brisée »' }).click();
    await p.getByRole('menuitem', { name: /^Supprimer la fiche/ }).click();
    await p.getByRole('alertdialog').getByRole('button', { name: /^Supprimer/ }).last().click();
    await p.waitForURL((u) => !u.pathname.endsWith(`/fiche/${ids['La Couronne brisée']}`));
    await p.close();

    assert.equal((await antor.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}`)).status(), 404);
    assert.equal((await antor.request.get(`/api/univers/1/fiches/${ids['La Couronne brisée']}/taches`)).status(), 404);
    // Acte II at the root of the tree.
    const arbre = await ouvrir(antor, '/univers/1/fiches/aventures');
    const racine = arbre.getByRole('tree', { name: 'Aventures' }).getByRole('treeitem', { level: 1 });
    await racine.first().waitFor();
    const noms = (await racine.allInnerTexts()).join('|');
    assert.match(noms, /Acte II — Le sceau brisé/);
    assert.doesNotMatch(noms, /La Couronne brisée/);
    await capture(arbre, 'arbre-apres-suppression');
    await arbre.close();
    // The report says « Aventure supprimée » to the GM.
    const cr = await ouvrir(antor, '/univers/1/fiche/1');
    await cr.getByText(/Campagne\s*:\s*Aventure supprimée/).waitFor();
    await capture(cr, 'cr-aventure-supprimee-antor');
    await cr.close();
    // E-3 forgets the campaign.
    const e3 = await ouvrir(antor, '/univers/1');
    await e3.getByRole('region', { name: 'Campagnes en cours' }).getByText('Aucune campagne en cours.').waitFor();
    await e3.close();
    // Léa: nothing about the deleted adventure, the report stays readable; the sheet's address is unknown.
    const l = await ouvrir(lea, '/univers/1/fiche/1');
    await l.getByRole('heading', { name: 'Séance 11' }).waitFor();
    assert.doesNotMatch(await texteDe(l), /Campagne\s*:|Aventure supprimée/);
    await capture(l, 'cr-aventure-supprimee-lea');
    await l.close();
    const e13 = await lea.request.get('/api/univers/1/comptes-rendus');
    assert.doesNotMatch(await e13.text(), /Aventure supprimée|La Couronne brisée/);
    const f1 = await lea.request.get('/api/univers/1/fiches/1');
    assert.doesNotMatch(await f1.text(), /Aventure supprimée|La Couronne brisée/);
  });

  // ------------------------------------------------------------------ AD-127 : le bloc :::mj d'un scénario ne sort pas
  // Fails if opening the converted scenario's section to the players shows them its :::mj text.
  test('scenario_converti_ouvert_aux_joueurs_ne_montre_pas_son_bloc_mj', async () => {
    const acte = ids['Acte II — Le sceau brisé'];
    const fiche = (await (await antor.request.get(`/api/univers/1/fiches/${acte}`)).json()) as { sections: { id: number; titre: string }[] };
    assert.equal(fiche.sections.length >= 1, true);
    const sid = fiche.sections.find((s) => s.titre === 'Scénario')?.id ?? fiche.sections[0]!.id;
    const ouvre = await antor.request.patch(`/api/univers/1/fiches/${acte}/sections/${sid}`, { data: { joueursLisent: true } });
    assert.equal(ouvre.status(), 200, await ouvre.text());
    const rep = await lea.request.get(`/api/univers/1/fiches/${acte}`);
    assert.equal(rep.status(), 200);
    assert.doesNotMatch(await rep.text(), /Orrin|traître/);
    const sec = await lea.request.get(`/api/univers/1/fiches/${acte}/sections/${sid}`);
    assert.doesNotMatch(await sec.text(), /Orrin|traître/);
    const p = await ouvrir(lea, `/univers/1/fiche/${acte}`);
    await p.getByRole('heading', { name: 'Acte II — Le sceau brisé' }).waitFor();
    assert.doesNotMatch(await texteDe(p), /Orrin|traître/);
    await capture(p, 'scenario-ouvert-lea');
    await p.close();
    const r = await lea.request.get('/api/univers/1/fiches?q=Orrin');
    assert.deepEqual(((await r.json()) as { fiches: unknown[] }).fiches, []);
  });
});
