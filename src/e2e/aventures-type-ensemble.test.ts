import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Feature `kanevas-scenarios-type`, assembled, written from the need only (the sheet's « Livre » and
// critère de sortie, B-58, B-59, E-8, E-9, E-17 of docs/): « Aventure » type, creation window, status
// badge / menu / filter, what a player sees, the status route. Black box: the real server in stub mode,
// a real Chromium. Screenshots: $E2E_SHOTS or the OS temp dir (never committed).
//
// Test plan (besoin -> case -> proof):
//  B-58 nominal   Antor creates a campaign then a scenario « dans » it, from « Aventures »   -> tree + API
//  B-58 bords     title 0 / 120 / 121 characters ; « Visible des joueurs » ticked opens « Présentation »
//  B-58 échec     the creation call fails -> « L'action n'a pas abouti. Réessayez. », nothing created
//  B-58 exclus.   a player: no « Nouvelle aventure », no creation by API ; GM in player mode likewise
//  B-59 nominal   header menu, tree-line menu, no reload, « Statut » filter lists only what matches
//  B-59 bords     the four values settable ; a change touches no other adventure ; unknown ?statut= ignored
//  B-59 échec     the status call fails -> « L'action n'a pas abouti. Réessayez. », badge unchanged
//  B-59 exclus.   Léa: badge without menu, never a closed scenario ; PATCH refused to player / player mode /
//                 other type / out-of-range value ; filter route
//  E-17           status badge on a search result ; a closed scenario is not a result for Léa
//  type désactivé the entry leaves the bar, creation is gone, an existing adventure keeps its status menu
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
type Locator = import('playwright').Locator;

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
  stop: () => void;
}

async function demarrer(): Promise<Serveur> {
  const port = await freePort();
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-e2e-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    KANEVAS_STUB: '1',
    KANEVAS_SANS_SEMIS: '1',
    DB_PATH: join(dossier, 'kanevas.db'),
    SESSION_SECRET: 'e2e-secret-0123456789',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
  const child: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(`${base}/healthz`);
      return {
        base,
        stop: () => {
          child.kill('SIGKILL');
          rmSync(dossier, { recursive: true, force: true });
        },
      };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill('SIGKILL');
  throw new Error('server did not start');
}

const NOMS: Record<string, string> = { antor: 'Antor', lea: 'Léa' };

async function connecter(s: Serveur, compte: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: `Se connecter en tant que ${NOMS[compte]}` }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion-bouchon'));
  await page.close();
  return ctx;
}

interface Monde {
  s: Serveur;
  antor: BrowserContext;
  lea: BrowserContext;
}
let monde: Monde;
let compteur = 0;

/** A fresh universe per test: antor MJ, lea Joueuse. */
async function univers(): Promise<number> {
  const rep = await monde.antor.request.post('/api/univers', { data: { nom: `Lame d'Ébène ${++compteur}`, description: '' } });
  assert.equal(rep.status(), 201, 'seed: create universe');
  const id = ((await rep.json()) as { id: number }).id;
  const m = await monde.antor.request.post(`/api/univers/${id}/membres`, { data: { username: 'lea', role: 'joueur' } });
  assert.equal(m.status(), 201, 'seed: add lea');
  return id;
}

async function aventure(u: number, titre: string, o: { sousType?: string; parent?: number; joueursLisent?: boolean } = {}): Promise<number> {
  const rep = await monde.antor.request.post(`/api/univers/${u}/fiches`, {
    data: {
      type: 'aventure',
      titre,
      ...(o.sousType ? { sousType: o.sousType } : {}),
      ...(o.parent ? { parent: o.parent } : {}),
      sections: [{ titre: 'Présentation', joueursLisent: o.joueursLisent ?? false }],
    },
  });
  assert.equal(rep.status(), 201, `seed: create ${titre}`);
  return ((await rep.json()) as { id: number }).id;
}

async function titresListes(ctx: BrowserContext, u: number, query: string): Promise<string[]> {
  const rep = await ctx.request.get(`/api/univers/${u}/fiches?${query}`);
  assert.equal(rep.status(), 200, `GET fiches?${query}`);
  return ((await rep.json()) as { fiches: { titre: string }[] }).fiches.map((f) => f.titre);
}

async function page(ctx: BrowserContext, chemin: string): Promise<Page> {
  const p = await ctx.newPage();
  await p.goto(chemin);
  return p;
}

async function capture(p: Page, nom: string) {
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `aventures-${nom}.png`), fullPage: true });
}

const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const declencheur = (portee: Page | Locator, nom: string, statut?: string) =>
  portee.getByRole('button', {
    name: new RegExp(`^${statut ? `${echapper(statut)} ` : ''}.*changer le statut de « ${echapper(nom)} »$`),
  });
/** Opens the status menu of `nom` and picks `label`; waits until the new badge is the button's text. */
async function choisirStatut(p: Page, nom: string, label: string, portee: Page | Locator = p) {
  await declencheur(portee, nom).click();
  await p.getByRole('menuitem', { name: label, exact: true }).click();
  await declencheur(portee, nom, label).waitFor();
}
const AUCUNE_A_VOIR = /Aucune aventure à voir pour l.instant\./;
const AUCUNE_MJ = /Aucune aventure pour l.instant\./;
const ECHEC = /L.action n.a pas abouti\. Réessayez\./;

async function ouvrirCreation(p: Page): Promise<Locator> {
  await p.getByRole('button', { name: 'Nouvelle aventure' }).first().click();
  const dlg = p.getByRole('dialog');
  await dlg.getByLabel('Titre').waitFor();
  return dlg;
}

describe('kanevas-scenarios-type : les aventures, du besoin à l’écran', { skip: raisonSaut }, () => {
  before(async () => {
    if (!existsSync(join(process.cwd(), 'dist/public/index.html'))) {
      const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
      assert.equal(r.status, 0, 'npm run build');
    }
    browser = await pw!.chromium.launch();
    const s = await demarrer();
    monde = { s, antor: await connecter(s, 'antor'), lea: await connecter(s, 'lea') };
  });
  after(async () => {
    await browser?.close();
    monde?.s.stop();
  });

  // ---------------------------------------------------------------- B-58
  // Fails if « Aventure » is missing from the Lore bar, if the window does not create a sheet born
  // « En préparation » with « Présentation » closed, or if « Dans » does not make the tree nest.
  test('antor_cree_la_campagne_puis_le_scenario_dans_elle_et_lea_ne_voit_rien', async () => {
    const u = await univers();
    const p = await page(monde.antor, `/univers/${u}`);
    await p.getByRole('link', { name: 'Aventures', exact: true }).click();
    await p.getByText(AUCUNE_MJ).waitFor();

    // The campaign, « Visible des joueurs » left unticked.
    let dlg = await ouvrirCreation(p);
    assert.equal(await dlg.getByRole('checkbox', { name: 'Visible des joueurs' }).isChecked(), false, 'décochée par défaut');
    await dlg.getByLabel('Titre').fill('La Couronne brisée');
    await dlg.getByLabel('Sous-type').fill('Campagne');
    await dlg.getByRole('button', { name: "Créer l'aventure" }).click();
    await p.waitForURL(/\/fiche\/\d+$/);
    await p.getByRole('heading', { name: 'La Couronne brisée' }).waitFor();
    await declencheur(p, 'La Couronne brisée', 'En préparation').waitFor();
    await p.getByRole('heading', { name: 'Présentation' }).waitFor();
    await p.getByRole('button', { name: /MJ seul/ }).first().waitFor();
    await capture(p, 'creation-campagne');

    // The scenario, in the campaign.
    await p.goto(`/univers/${u}/fiches/aventures`);
    dlg = await ouvrirCreation(p);
    await dlg.getByLabel('Titre').fill('Acte II — Le sceau brisé');
    await dlg.getByLabel('Sous-type').fill('Scénario');
    await dlg.getByLabel('Dans').click();
    await dlg.getByRole('radio', { name: 'La Couronne brisée' }).check();
    await dlg.getByRole('button', { name: "Créer l'aventure" }).click();
    await p.waitForURL(/\/fiche\/\d+$/);
    await declencheur(p, 'Acte II — Le sceau brisé', 'En préparation').waitFor();

    // In the tree: the scenario is under the campaign, not at the root.
    await p.goto(`/univers/${u}/fiches/aventures`);
    const arbre = p.getByRole('tree', { name: 'Aventures' });
    const racine = arbre.getByRole('treeitem', { level: 1 });
    await racine.first().waitFor();
    assert.equal(await racine.count(), 1, 'seule la campagne est à la racine');
    assert.match(await racine.first().innerText(), /La Couronne brisée/);
    await racine.first().getByRole('button', { name: 'Déplier' }).click();
    const enfant = arbre.getByRole('treeitem', { level: 2 });
    await enfant.first().waitFor();
    assert.match(await enfant.first().innerText(), /Acte II — Le sceau brisé/);
    await capture(p, 'arbre-campagne-scenario');

    // Léa: nothing, no section being open (grid of the list, by API, and the sheets by address).
    const l = await page(monde.lea, `/univers/${u}/fiches/aventures`);
    await l.getByText(AUCUNE_A_VOIR).waitFor();
    await capture(l, 'lea-rien');
    assert.deepEqual(await titresListes(monde.lea, u, 'type=aventure'), []);
    const fiches = await titresListes(monde.antor, u, 'type=aventure');
    assert.deepEqual([...fiches].sort(), ['Acte II — Le sceau brisé', 'La Couronne brisée']);
  });

  // Fails if the title bounds (1 to 120) are not held by the window, or if ticking « Visible des joueurs »
  // does not open « Présentation » to the players.
  test('fenetre_titre_vide_ou_trop_long_refuse_et_visible_des_joueurs_ouvre_la_presentation', async () => {
    const u = await univers();
    const p = await page(monde.antor, `/univers/${u}/fiches/aventures`);
    await p.getByText(AUCUNE_MJ).waitFor();
    const dlg = await ouvrirCreation(p);
    const creer = dlg.getByRole('button', { name: "Créer l'aventure" });
    const MSG = 'Donnez un titre de 1 à 120 caractères.';
    // No fault announced before any action (as « Nouveau lieu »); the button is simply inactive.
    await dlg.getByLabel('Titre').waitFor();
    assert.equal(await dlg.getByText(MSG).count(), 0, 'aucun message à l\'ouverture');
    assert.notEqual(await dlg.getByLabel('Titre').getAttribute('aria-invalid'), 'true', 'pas invalide à l\'ouverture');
    assert.equal(await creer.isDisabled(), true, 'titre vide');
    // Typed then erased: now the fault shows.
    await dlg.getByLabel('Titre').fill('a');
    await dlg.getByLabel('Titre').fill('');
    await dlg.getByText(MSG).waitFor();
    assert.equal(await creer.isDisabled(), true, 'titre effacé');
    await dlg.getByLabel('Titre').fill('   ');
    await dlg.getByText(MSG).waitFor();
    await dlg.getByLabel('Titre').fill('x'.repeat(121));
    await dlg.getByText('Donnez un titre de 1 à 120 caractères.').waitFor();
    assert.equal(await creer.isDisabled(), true, '121 caractères');
    await capture(p, 'fenetre-titre-trop-long');
    const titre120 = 'La Couronne brisée'.padEnd(120, '.');
    await dlg.getByLabel('Titre').fill(titre120);
    await creer.waitFor();
    await p.waitForFunction(() => !document.body.innerText.includes('Donnez un titre de 1 à 120 caractères.'));
    assert.equal(await creer.isDisabled(), false, '120 caractères');
    await dlg.getByLabel('Sous-type').fill('Campagne');
    await dlg.getByRole('checkbox', { name: 'Visible des joueurs' }).check();
    await creer.click();
    await p.waitForURL(/\/fiche\/\d+$/);
    await p.getByRole('heading', { name: 'Présentation' }).waitFor();
    // Léa now reads it (the section is open), with the status.
    assert.deepEqual(await titresListes(monde.lea, u, 'type=aventure'), [titre120]);
    const l = await page(monde.lea, `/univers/${u}/fiches/aventures`);
    await l.getByText(titre120).first().waitFor();
    assert.match(await l.locator('main').innerText(), /En préparation/);
  });

  // Fails if a failed creation leaves a sheet behind, or closes the window, or says nothing.
  test('creation_en_echec_message_fenetre_ouverte_et_rien_de_cree', async () => {
    const u = await univers();
    const p = await page(monde.antor, `/univers/${u}/fiches/aventures`);
    await p.getByText(AUCUNE_MJ).waitFor();
    const dlg = await ouvrirCreation(p);
    await dlg.getByLabel('Titre').fill('Jamais créée');
    await dlg.getByLabel('Sous-type').fill('Campagne');
    await p.route(new RegExp(`/api/univers/${u}/fiches$`), (route) => {
      if (route.request().method() === 'POST') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boum"}' });
      return route.continue();
    });
    await dlg.getByRole('button', { name: "Créer l'aventure" }).click();
    await dlg.getByText(ECHEC).waitFor();
    assert.equal(await dlg.getByLabel('Titre').inputValue(), 'Jamais créée', 'la saisie est gardée');
    await capture(p, 'creation-echec');
    await p.unroute(new RegExp(`/api/univers/${u}/fiches$`));
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure'), []);
  });

  // Fails if a player (or the GM in player mode) can create an adventure, or sees the creation button.
  test('joueur_et_mj_en_mode_joueur_n_ont_pas_de_bouton_de_creation_et_joueur_ne_cree_pas_par_l_api', async () => {
    const u = await univers();
    await aventure(u, 'La Couronne brisée', { sousType: 'Campagne', joueursLisent: true });
    const l = await page(monde.lea, `/univers/${u}/fiches/aventures`);
    await l.getByText('La Couronne brisée').first().waitFor();
    assert.equal(await l.getByRole('button', { name: 'Nouvelle aventure' }).count(), 0, 'Léa : pas de bouton');
    await capture(l, 'lea-liste-sans-bouton');
    const rep = await monde.lea.request.post(`/api/univers/${u}/fiches`, { data: { type: 'aventure', titre: 'Pirate' } });
    assert.equal(rep.status(), 403);
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure'), ['La Couronne brisée']);

    const a = await page(monde.antor, `/univers/${u}/fiches/aventures`);
    await declencheur(a, 'La Couronne brisée').waitFor();
    await a.getByRole('radio', { name: 'Mode Joueur' }).check();
    await a.getByText(/Mode Joueur : vous voyez ce que voit un joueur\./).waitFor();
    await a.getByText('La Couronne brisée').first().waitFor();
    assert.equal(await declencheur(a, 'La Couronne brisée').count(), 0, 'mode Joueur : pas de menu de statut');
    assert.equal(await a.getByRole('button', { name: 'Nouvelle aventure' }).count(), 0, 'mode Joueur : pas de bouton');
    await capture(a, 'mj-mode-joueur-liste');
  });

  // ---------------------------------------------------------------- B-59
  // Fails if the header menu, the tree-line menu or the filter do not do what the critère says, or need a reload.
  test('antor_regle_les_statuts_depuis_l_entete_et_la_ligne_d_arbre_sans_recharger_et_le_filtre_suit', async () => {
    const u = await univers();
    const camp = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne' });
    await aventure(u, 'Acte II — Le sceau brisé', { sousType: 'Scénario', parent: camp });

    // From the header of the campaign.
    const p = await page(monde.antor, `/univers/${u}/fiche/${camp}`);
    await declencheur(p, 'La Couronne brisée', 'En préparation').waitFor();
    let rechargements = 0;
    p.on('load', () => rechargements++);
    await choisirStatut(p, 'La Couronne brisée', 'En cours');
    assert.equal(rechargements, 0, 'sans recharger');
    await capture(p, 'entete-en-cours');

    // From the tree line of the scenario.
    await p.goto(`/univers/${u}/fiches/aventures`);
    const arbre = p.getByRole('tree', { name: 'Aventures' });
    await arbre.getByRole('treeitem', { level: 1 }).first().getByRole('button', { name: 'Déplier' }).click();
    const ligne = arbre.getByRole('treeitem', { level: 2 }).first();
    await ligne.waitFor();
    let rech2 = 0;
    p.on('load', () => rech2++);
    await choisirStatut(p, 'Acte II — Le sceau brisé', 'Prête', ligne);
    assert.equal(rech2, 0, 'sans recharger');
    // The campaign's own line carries « En cours »: a change touched no other adventure.
    await declencheur(arbre.getByRole('treeitem', { level: 1 }).first(), 'La Couronne brisée', 'En cours').waitFor();
    await capture(p, 'arbre-statuts');

    // Persisted, by the API.
    const rep = await monde.antor.request.get(`/api/univers/${u}/fiches?type=aventure`);
    const fiches = ((await rep.json()) as { fiches: { titre: string; charge: { statut: string } }[] }).fiches;
    const parTitre = Object.fromEntries(fiches.map((f) => [f.titre, f.charge.statut]));
    assert.deepEqual(parTitre, { 'La Couronne brisée': 'en_cours', 'Acte II — Le sceau brisé': 'prete' });

    // Filter « Statut » ▸ « En cours »: the grid lists the campaign only; the address keeps it.
    await p.getByLabel('Statut').selectOption({ label: 'En cours' });
    await p.waitForURL(/statut=en_cours/);
    await p.getByText('La Couronne brisée').first().waitFor();
    await p.waitForFunction(() => !document.body.innerText.includes('Acte II'));
    // The grid card carries the badge, and its menu.
    await declencheur(p, 'La Couronne brisée', 'En cours').waitFor();
    await capture(p, 'filtre-en-cours');
    // A reload on that address keeps the filter.
    await p.reload();
    await p.getByText('La Couronne brisée').first().waitFor();
    assert.equal(await p.getByText('Acte II — Le sceau brisé').count(), 0);
    // A status nobody has.
    await p.getByLabel('Statut').selectOption({ label: 'Terminée' });
    await p.waitForURL(/statut=terminee/);
    await p.getByText(/Aucune aventure avec ce statut\./).waitFor();
    await p.getByRole('button', { name: 'Voir toutes les aventures' }).or(p.getByRole('link', { name: 'Voir toutes les aventures' })).first().waitFor();
    // An unknown value in the address is ignored: « Tous ».
    await p.goto(`/univers/${u}/fiches/aventures?statut=bidon`);
    await p.getByText('La Couronne brisée').first().waitFor();
    assert.equal(await p.getByLabel('Statut').inputValue(), '', 'valeur inconnue : « Tous »');
    assert.equal(await p.getByText(/Aucune aventure avec ce statut\./).count(), 0);
  });

  // Fails if the status menu of the header sets another value than the chosen one, for any of the four.
  test('les_quatre_statuts_se_posent_depuis_l_entete', async () => {
    const u = await univers();
    const id = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne' });
    const p = await page(monde.antor, `/univers/${u}/fiche/${id}`);
    await declencheur(p, 'La Couronne brisée', 'En préparation').waitFor();
    for (const [label, valeur] of [['Prête', 'prete'], ['En cours', 'en_cours'], ['Terminée', 'terminee'], ['En préparation', 'en_preparation']] as const) {
      await choisirStatut(p, 'La Couronne brisée', label);
      const l = await titresListes(monde.antor, u, `type=aventure&statut=${valeur}`);
      assert.deepEqual(l, ['La Couronne brisée'], `statut ${valeur}`);
    }
  });

  // Fails if a failed status call changes the badge or says nothing.
  test('changement_de_statut_en_echec_message_et_badge_inchange', async () => {
    const u = await univers();
    const id = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne' });
    const p = await page(monde.antor, `/univers/${u}/fiche/${id}`);
    await declencheur(p, 'La Couronne brisée', 'En préparation').waitFor();
    await p.route(new RegExp(`/api/univers/${u}/fiches/${id}$`), (route) => {
      if (route.request().method() === 'PATCH') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boum"}' });
      return route.continue();
    });
    await declencheur(p, 'La Couronne brisée').click();
    await p.getByRole('menuitem', { name: 'En cours', exact: true }).click();
    await p.getByText(ECHEC).first().waitFor();
    await declencheur(p, 'La Couronne brisée', 'En préparation').waitFor();
    await capture(p, 'statut-echec');
    await p.unroute(new RegExp(`/api/univers/${u}/fiches/${id}$`));
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure&statut=en_preparation'), ['La Couronne brisée']);
  });

  // Fails if Léa sees the status menu, a scenario whose sections are closed, or not the campaign once opened.
  test('lea_voit_la_campagne_en_cours_quand_presentation_est_ouverte_jamais_acte_ii_et_aucun_menu', async () => {
    const u = await univers();
    const camp = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne' });
    await aventure(u, 'Acte II — Le sceau brisé', { sousType: 'Scénario', parent: camp });
    const a = await page(monde.antor, `/univers/${u}/fiche/${camp}`);
    await choisirStatut(a, 'La Couronne brisée', 'En cours');

    // Present but closed: still nothing for Léa.
    const l = await page(monde.lea, `/univers/${u}/fiches/aventures`);
    await l.getByText(AUCUNE_A_VOIR).waitFor();

    // Antor opens « Présentation » from its audience menu.
    await a.getByRole('button', { name: /régler l.audience de « Présentation »/ }).click();
    const lisent = a.getByRole('switch', { name: 'Les joueurs la lisent' });
    await lisent.click();
    await a.waitForFunction(() => document.querySelector('[role=switch][aria-checked=true]') !== null);
    assert.deepEqual(await titresListes(monde.lea, u, 'type=aventure'), ['La Couronne brisée']);

    await l.reload();
    await l.getByText('La Couronne brisée').first().waitFor();
    const texte = await l.locator('main').innerText();
    assert.match(texte, /La Couronne brisée[\s\S]*En cours/);
    assert.doesNotMatch(texte, /Acte II/);
    assert.equal(await l.getByRole('button', { name: /changer le statut/ }).count(), 0, 'aucun menu de statut');
    await capture(l, 'lea-voit-la-campagne');

    // Same on the sheet: the badge, no menu; the scenario's address answers as an unknown one.
    await l.getByRole('link', { name: /La Couronne brisée/ }).first().click();
    await l.getByRole('heading', { name: 'La Couronne brisée' }).waitFor();
    assert.match(await l.locator('main').innerText(), /Statut[\s\S]*En cours/);
    assert.equal(await l.getByRole('button', { name: /changer le statut/ }).count(), 0);
    await capture(l, 'lea-fiche-campagne');
    const liste = await monde.antor.request.get(`/api/univers/${u}/fiches?type=aventure`);
    const sc = ((await liste.json()) as { fiches: { id: number; titre: string }[] }).fiches.find((f) => f.titre.startsWith('Acte II'))!;
    assert.equal((await monde.lea.request.get(`/api/univers/${u}/fiches/${sc.id}`)).status(), 404);
  });

  // Fails if the GM in player mode keeps a status menu.
  test('mj_en_mode_joueur_voit_le_statut_sans_menu_sur_la_fiche', async () => {
    const u = await univers();
    const id = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne', joueursLisent: true });
    const p = await page(monde.antor, `/univers/${u}/fiche/${id}`);
    await declencheur(p, 'La Couronne brisée').waitFor();
    await p.getByRole('radio', { name: 'Mode Joueur' }).check();
    await p.getByText(/Mode Joueur : vous voyez ce que voit un joueur\./).waitFor();
    await p.getByText('En préparation', { exact: true }).first().waitFor();
    assert.equal(await declencheur(p, 'La Couronne brisée').count(), 0, 'aucun menu de statut en mode Joueur');
    await capture(p, 'mj-mode-joueur-fiche');
  });

  // ------------------------------------------------------ B-59, par l'API
  // Fails if the status route lets through a player, the player mode, another type, or a value out of the four.
  test('api_patch_statut_refuse_joueur_mode_joueur_autre_type_valeur_hors_des_quatre', async () => {
    const u = await univers();
    const id = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne', joueursLisent: true });
    const caché = await aventure(u, 'Acte II', { sousType: 'Scénario', parent: id });
    const lieu = await monde.antor.request.post(`/api/univers/${u}/fiches`, { data: { type: 'lieu', titre: 'Port-Sel' } });
    const lieuId = ((await lieu.json()) as { id: number }).id;
    const patch = (ctx: BrowserContext, fid: number, statut: unknown, q = '') =>
      ctx.request.patch(`/api/univers/${u}/fiches/${fid}${q}`, { data: { statut } });
    const statutDe = async () => {
      const l = await monde.antor.request.get(`/api/univers/${u}/fiches?type=aventure`);
      return ((await l.json()) as { fiches: { id: number; charge: { statut: string } }[] }).fiches.find((f) => f.id === id)!.charge.statut;
    };

    assert.equal((await patch(monde.lea, id, 'en_cours')).status(), 403, 'joueur qui lit');
    assert.equal((await patch(monde.antor, id, 'en_cours', '?mode=joueur')).status(), 403, 'MJ en mode Joueur');
    assert.equal((await patch(monde.lea, caché, 'en_cours')).status(), 404, 'joueur qui ne lit pas');
    assert.equal((await patch(monde.antor, lieuId, 'en_cours')).status(), 400, 'autre type');
    for (const mauvais of ['active', 'En cours', '', 'jouee', 42, null]) {
      assert.equal((await patch(monde.antor, id, mauvais)).status(), 400, `valeur ${JSON.stringify(mauvais)}`);
    }
    assert.equal(await statutDe(), 'en_preparation', 'rien n a bougé');

    const ok = await patch(monde.antor, id, 'en_cours');
    assert.equal(ok.status(), 200);
    assert.equal(((await ok.json()) as { charge: { statut: string } }).charge.statut, 'en_cours');
    assert.equal(await statutDe(), 'en_cours');
  });

  // Fails if the filter ignores the status, mixes in other adventures, or leaks what a player does not read.
  test('api_liste_filtre_par_statut_et_ne_montre_au_joueur_que_ce_qu_il_lit', async () => {
    const u = await univers();
    const a = await aventure(u, 'Alpha', { joueursLisent: true });
    const b = await aventure(u, 'Bravo', { joueursLisent: true });
    const c = await aventure(u, 'Charlie');
    const d = await aventure(u, 'Delta', { joueursLisent: true });
    for (const [id, st] of [[a, 'en_cours'], [b, 'prete'], [c, 'en_cours']] as const) {
      const r = await monde.antor.request.patch(`/api/univers/${u}/fiches/${id}`, { data: { statut: st } });
      assert.equal(r.status(), 200);
    }
    void d;
    assert.deepEqual((await titresListes(monde.antor, u, 'type=aventure&statut=en_cours')).sort(), ['Alpha', 'Charlie']);
    assert.deepEqual(await titresListes(monde.lea, u, 'type=aventure&statut=en_cours'), ['Alpha'], 'Charlie est fermée à Léa');
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure&statut=prete'), ['Bravo']);
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure&statut=terminee'), []);
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure&statut=en_preparation'), ['Delta']);
    assert.deepEqual((await titresListes(monde.lea, u, 'type=aventure')).sort(), ['Alpha', 'Bravo', 'Delta']);
  });

  // ---------------------------------------------------------------- E-17
  // Fails if a result of the search carries no status badge, or if Léa finds a scenario she cannot read.
  test('recherche_montre_le_badge_de_statut_et_cache_a_lea_le_scenario_ferme', async () => {
    const u = await univers();
    const camp = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne', joueursLisent: true });
    await aventure(u, 'Couronne : Acte II', { sousType: 'Scénario', parent: camp });
    await monde.antor.request.patch(`/api/univers/${u}/fiches/${camp}`, { data: { statut: 'en_cours' } });
    const chercher = async (ctx: BrowserContext) => {
      const p = await page(ctx, `/univers/${u}/recherche`);
      await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('Couronne');
      await p.keyboard.press('Enter');
      await p.getByText('La Couronne brisée').first().waitFor();
      return p;
    };
    const a = await chercher(monde.antor);
    await a.getByText('Couronne : Acte II').first().waitFor();
    const carte = a.locator('li, article, a').filter({ hasText: 'La Couronne brisée' }).filter({ hasText: 'En cours' });
    assert.ok((await carte.count()) > 0, 'résultat de la campagne avec « En cours »');
    await capture(a, 'recherche-antor');
    const l = await chercher(monde.lea);
    assert.match(await l.locator('main').innerText(), /En cours/);
    assert.doesNotMatch(await l.locator('main').innerText(), /Acte II/);
    await capture(l, 'recherche-lea');
  });

  // ------------------------------------------------------ type désactivé
  // Fails if deactivating the type does not remove its entry and its creation, or hides existing adventures' menu.
  test('type_desactive_sort_de_la_barre_sans_creation_et_l_aventure_existante_garde_son_menu', async () => {
    const u = await univers();
    const id = await aventure(u, 'La Couronne brisée', { sousType: 'Campagne', joueursLisent: true });
    const rep = await monde.antor.request.put(`/api/univers/${u}/types/aventure`, { data: { etat: 'desactive' } });
    assert.equal(rep.status(), 200);
    const p = await page(monde.antor, `/univers/${u}/fiche/${id}`);
    await declencheur(p, 'La Couronne brisée', 'En préparation').waitFor();
    // The sidebar reads the types after the page has loaded: wait for the entry to leave, then assert (no read before the action ends).
    await p.getByRole('link', { name: 'Aventures', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await p.getByRole('link', { name: 'Aventures', exact: true }).count(), 0, 'plus d’entrée dans la barre');
    await choisirStatut(p, 'La Couronne brisée', 'En cours');
    const creer = await monde.antor.request.post(`/api/univers/${u}/fiches`, { data: { type: 'aventure', titre: 'Refusée' } });
    assert.ok([400, 403, 409].includes(creer.status()), `création refusée (obtenu ${creer.status()})`);
    assert.deepEqual(await titresListes(monde.antor, u, 'type=aventure'), ['La Couronne brisée']);
    await capture(p, 'type-desactive');
  });
});
