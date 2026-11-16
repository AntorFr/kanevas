// ecrans: fiche, fiches, vue-ensemble
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

});
