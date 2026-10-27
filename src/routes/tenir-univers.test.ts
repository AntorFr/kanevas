// Tests of kanevas-tenir-univers, written from the exit criterion only (B-41, P-10, AD-105, AD-119 (5)).
// HTTP in stub mode, real SQLite; « Essai Kanka » is filled through service functions, the seed is untouched.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const DISQUE = mkdtempSync(join(tmpdir(), 'kv-disque-'));
process.env.ATTACHMENTS_DIR = DISQUE;

const { buildApp } = await import('../app.js');
const { semerBouchon, semerIllustrations, fichierDemo, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { ajouterTache } = await import('../services/preparation.js');
const { creerCompteRendu } = await import('../services/comptes_rendus.js');
const { creerProposition } = await import('../services/propositions.js');
const { ajouterFichier, choisirIllustration, joindreFichier } = await import('../services/fichiers.js');
const { creerCarte, ajouterElement } = await import('../services/cartes.js');
const { creerFiche, lireFiche } = await import('../services/fiches.js');
const { creerEtRattacherSysteme } = await import('../services/systemes.js');
const { ajouterSection } = await import('../services/sections.js');
const { relierSection } = await import('../services/relations.js');
const { poserEtiquetage } = await import('../services/etiquettes.js');
const HERITEE = randomUUID();
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function fichiersDuDisque(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === 'tmp') continue;
    if (statSync(p).isDirectory()) out.push(...fichiersDuDisque(p));
    else out.push(p);
  }
  return out.sort();
}

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  await semerIllustrations(app.db, DISQUE);
  const db = app.db;
  const idU = (nom: string) => (db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as Any).id as number;
  const idC = (u: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as Any).id as number;
  const cookies = new Map<string, string>();
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, payload });
    let json: Any = null;
    try {
      json = JSON.parse(r.body);
    } catch {
      json = r.body;
    }
    return { status: r.statusCode, json };
  };
  const lame = idU("Lame d'Ébène");
  const essai = idU('Essai Kanka');
  const antor = { compteId: idC('antor') };

  // Garnish « Essai Kanka » through the services: batch (+ token from the seed), sheets, map with a background,
  // library file, illustration, attachment, relation, label, campaign/scenario/task, proposal, system.
  const png = fichierDemo('portrait-ambre.png');
  const anse = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(essai, 'Anse-aux-Sels') as Any).id;
  const autre = creerFiche(db, antor.compteId, essai, { type: 'lieu', titre: 'Un passant' });
  const lot = await app.inject({
    method: 'POST',
    url: `/api/import/v1/univers/${essai}/lots`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
  });
  assert.ok(lot.statusCode < 300, lot.body);
  const f1 = await ajouterFichier(db, antor, essai, Readable.from([png]), 'bibliotheque.png', { ou: 'mediatheque' }, DISQUE);
  choisirIllustration(db, antor, essai, anse, f1.id);
  const ficheAnse = lireFiche(db, antor, essai, anse);
  const sectionAnse = ficheAnse.sections[0]!;
  joindreFichier(db, antor, essai, anse, sectionAnse.id, f1.id);
  await creerCarte(db, antor.compteId, false, essai, { titre: 'Carte avec fond', forme: 'illustree', fond: Readable.from([png]) } as Any, DISQUE);
  const graphe = await creerCarte(db, antor.compteId, false, essai, { titre: 'Graphe', forme: 'graphe' });
  ajouterElement(db, antor.compteId, false, graphe.id, { ficheId: anse });
  relierSection(db, antor.compteId, essai, autre.id, ajouterSection(db, antor.compteId, essai, autre.id, { titre: 'Notes', contenu: 'Croise [[cle:x]] ?' }).id, {
    cibleFicheId: anse,
    type: 'croise',
  });
  poserEtiquetage(db, antor, essai, anse, { alias: ['Anse'], etiquettes: ['Côte'] });
  const camp = creerFiche(db, antor.compteId, essai, { type: 'aventure', sousType: 'Campagne', titre: 'Brumes' });
  creerFiche(db, antor.compteId, essai, { type: 'aventure', sousType: 'Scénario', titre: 'Acte 1', parent: camp.id });
  ajouterTache(db, antor.compteId, camp.id, { categorie: 'autre', libelle: 'Préparer' });
  const cr = creerCompteRendu(db, antor.compteId, essai, camp.id, { titre: 'Séance 1' });
  creerProposition(db, antor.compteId, essai, {
    sectionId: sectionAnse.id,
    crId: cr.id,
    contenu: 'Nouveau',
    version: sectionAnse.version,
  });
  const systeme = creerEtRattacherSysteme(db, antor.compteId, essai, { nom: "Système d'essai tenu" });
  // A historical attachment (table kept by migration 0004) with its own bytes on the disk.
  writeFileSync(join(DISQUE, HERITEE), 'x');
  db.prepare(
    "INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, secrete, cree_le) VALUES (?, 'a', 'image/png', 1, ?, 0, 'now')",
  ).run(sectionAnse.id, HERITEE);
  return { app, db, req, lame, essai, idC, systeme, lot };
}

const D = (u: number) => `/api/univers/${u}`;

/** Rows (by rowid) owned by the universe: those carrying univers_id, then, to a fixed point, every row with a FK into an owned row. */
function possedees(db: Any, universId: number): Map<string, number[]> {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Any[]).map(
    (t) => t.name as string,
  );
  const cols = (t: string) => (db.prepare(`PRAGMA table_info("${t}")`).all() as Any[]).map((c) => c.name as string);
  const fks = (t: string) => db.prepare(`PRAGMA foreign_key_list("${t}")`).all() as Any[];
  const own = new Map<string, Set<number>>();
  own.set('univers', new Set([universId]));
  const pk = (t: string) => ((db.prepare(`PRAGMA table_info("${t}")`).all() as Any[]).find((c) => c.pk === 1 && c.type === 'INTEGER')?.name as string) ?? 'rowid';
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tables) {
      if (t === 'univers') continue;
      const where: string[] = [];
      const params: number[] = [];
      if (cols(t).includes('univers_id')) {
        where.push('univers_id = ?');
        params.push(universId);
      }
      for (const fk of fks(t)) {
        const proprietaires = own.get(fk.table);
        if (!proprietaires || proprietaires.size === 0) continue;
        const cible = fk.to ?? 'id';
        if (cible !== 'id' && cible !== pk(fk.table)) continue;
        where.push(`"${fk.from}" IN (${[...proprietaires].join(',')})`);
      }
      if (where.length === 0) continue;
      const ids = (db.prepare(`SELECT rowid AS r FROM "${t}" WHERE ${where.join(' OR ')}`).all(...params) as Any[]).map((r) => r.r as number);
      const s = own.get(t) ?? new Set<number>();
      for (const i of ids) if (!s.has(i)) (s.add(i), (changed = true));
      own.set(t, s);
    }
  }
  return new Map([...own].map(([t, s]) => [t, [...s]]));
}

function compteParTable(db: Any): Record<string, number> {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Any[]).map(
    (t) => t.name as string,
  );
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      out[t] = (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as Any).n;
    } catch {
      /* virtual table shadow without direct access */
    }
  }
  return out;
}

test('le_garnissage_couvre_les_tables_attendues', async () => {
  const w = await monde();
  const p = possedees(w.db, w.essai);
  for (const t of [
    'univers', 'membres', 'jetons_api', 'lots_import', 'fiches', 'sections', 'cartes', 'elements_carte', 'fichiers',
    'fichiers_sections', 'relations', 'taches_preparation', 'propositions', 'etiquettes',
    'fiche_etiquettes', 'fiche_alias', 'pieces_jointes',
  ]) {
    assert.ok((p.get(t) ?? []).length > 0, `table non garnie ou non détectée : ${t}`);
  }
});

test('le_nom_exact_supprime_tout_ce_qui_pend_de_l_univers_et_rien_d_autre', async () => {
  const w = await monde();
  const avantDisque = fichiersDuDisque(DISQUE);
  const proprietaires = possedees(w.db, w.essai);
  const avant = compteParTable(w.db);
  const ficheIds = proprietaires.get('fiches')!;
  const posees = [...proprietaires].filter(([t]) => t !== 'univers').reduce((n, [, ids]) => n + ids.length, 0);
  assert.ok(posees > 20, `garnissage trop pauvre (${posees})`);
  const lameAvant = {
    fiches: (w.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(w.lame) as Any).n,
    fichiers: (w.db.prepare('SELECT COUNT(*) n FROM fichiers WHERE univers_id = ?').get(w.lame) as Any).n,
    cartes: (w.db.prepare('SELECT COUNT(*) n FROM cartes WHERE univers_id = ?').get(w.lame) as Any).n,
  };
  const systemesAvant = (w.db.prepare('SELECT COUNT(*) n FROM systemes_jeu').get() as Any).n;
  assert.ok(lameAvant.fiches > 0 && lameAvant.fichiers > 0 && lameAvant.cartes > 0);

  // the seed deliberately holds one file whose bytes are missing (« La Fresque effacée »): only the present ones are compared
  const lamePresents = (w.db.prepare('SELECT disque d FROM fichiers WHERE univers_id = ?').all(w.lame) as Any[]).map((x) => x.d as string).filter((d) => existsSync(join(DISQUE, d)));
  assert.ok(lamePresents.length >= 10);
  const r = await w.req('antor', 'DELETE', D(w.essai), { nom: 'Essai Kanka' });
  assert.equal(r.status, 204, JSON.stringify(r.json));

  // no row left, table by table
  const apres = possedees(w.db, w.essai);
  for (const [t, ids] of apres) if (t !== 'univers') assert.deepEqual(ids, [], `lignes restantes dans ${t}`);
  for (const [t, ids] of proprietaires) {
    if (ids.length === 0) continue;
    const reste = (w.db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE rowid IN (${ids.join(',')})`).get() as Any).n;
    assert.equal(reste, 0, `${t} garde ${reste} ligne(s)`);
  }
  // the search indexes follow
  for (const t of ['recherche_fiches', 'recherche_sections']) {
    try {
      const n = (w.db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE rowid IN (${ficheIds.join(',')})`).get() as Any).n;
      if (t === 'recherche_fiches') assert.equal(n, 0, t);
    } catch {
      /* index absent under this name */
    }
  }
  assert.deepEqual(w.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM univers WHERE id = ?').get(w.essai) as Any).n, 0);

  // every other table lost exactly its owned rows, nothing more
  const apresCompte = compteParTable(w.db);
  for (const t of Object.keys(avant)) {
    const perdu = (proprietaires.get(t) ?? []).length;
    if (t.startsWith('recherche_')) continue;
    assert.equal(apresCompte[t], avant[t]! - perdu, `compte de ${t}`);
  }
  // Lame d'Ébène intact; the game system stays
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(w.lame) as Any).n, lameAvant.fiches);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM fichiers WHERE univers_id = ?').get(w.lame) as Any).n, lameAvant.fichiers);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM cartes WHERE univers_id = ?').get(w.lame) as Any).n, lameAvant.cartes);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM systemes_jeu').get() as Any).n, systemesAvant);
  assert.ok(w.db.prepare('SELECT 1 FROM systemes_jeu WHERE id = ?').get(w.systeme.id));
  const catalogue = await w.req('antor', 'GET', '/api/systemes/catalogue');
  assert.equal(catalogue.status, 200, JSON.stringify(catalogue.json));
  assert.ok(JSON.stringify(catalogue.json).includes("Système d'essai tenu"));

  // disk: the files of the universe are gone (library file, map background, historical attachment), Lame's stay
  const apresDisque = fichiersDuDisque(DISQUE);
  assert.ok(avantDisque.length - apresDisque.length >= 3, `${avantDisque.length} → ${apresDisque.length}`);
  assert.ok(!existsSync(join(DISQUE, HERITEE)));
  for (const d of lamePresents) assert.ok(existsSync(join(DISQUE, d)), d);

  // E-1 lists it for nobody; Léa's address answers 404; the stub token is refused
  for (const compte of ['antor', 'lea']) {
    const l = await w.req(compte, 'GET', '/api/univers');
    assert.ok(!(l.json as Any[]).some((u) => u.nom === 'Essai Kanka'), compte);
  }
  assert.equal((await w.req('lea', 'GET', D(w.essai))).status, 404);
  assert.equal((await w.req('antor', 'GET', D(w.essai))).status, 404);
  const jeton = await w.app.inject({
    method: 'POST',
    url: `/api/import/v1/univers/${w.essai}/lots`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
  });
  assert.equal(jeton.statusCode, 401);
  assert.equal(JSON.parse(jeton.body).code ?? JSON.parse(jeton.body).erreur, 'jeton_invalide');
  // deleting again: unknown
  assert.equal((await w.req('antor', 'DELETE', D(w.essai), { nom: 'Essai Kanka' })).status, 404);
});

test('un_autre_nom_est_400_nom_different_et_rien_n_est_supprime', async () => {
  const w = await monde();
  const avant = compteParTable(w.db);
  const disque = fichiersDuDisque(DISQUE);
  for (const nom of ['essai kanka', 'Essai Kanka ', ' Essai Kanka', 'ESSAI KANKA', 'Essai  Kanka', '', 'Essai Kank']) {
    const r = await w.req('antor', 'DELETE', D(w.essai), { nom });
    assert.equal(r.status, 400, `[${nom}] ${JSON.stringify(r.json)}`);
    assert.equal(r.json.code, 'nom_different', nom);
  }
  for (const corps of [undefined, {}, { nom: 7 }, { nom: null }]) {
    const r = await w.req('antor', 'DELETE', D(w.essai), corps as Any);
    assert.equal(r.status, 400, JSON.stringify(corps));
  }
  assert.deepEqual(compteParTable(w.db), avant);
  assert.deepEqual(fichiersDuDisque(DISQUE), disque);
});

test('lea_403_un_compte_sans_role_404_le_mode_joueur_refuse_le_mj', async () => {
  const w = await monde();
  const avant = compteParTable(w.db);
  const lea = await w.req('lea', 'DELETE', D(w.essai), { nom: 'Essai Kanka' });
  assert.equal(lea.status, 403, JSON.stringify(lea.json));
  // Léa with a wrong name is refused for her role first, not told the name
  assert.equal((await w.req('lea', 'DELETE', D(w.essai), { nom: 'x' })).status, 403);
  const mira = await w.req('mira', 'DELETE', D(w.essai), { nom: 'Essai Kanka' });
  assert.equal(mira.status, 404, JSON.stringify(mira.json));
  assert.equal((await w.req('mira', 'DELETE', D(w.essai), { nom: 'x' })).status, 404);
  const mode = await w.req('antor', 'DELETE', `${D(w.essai)}?mode=joueur`, { nom: 'Essai Kanka' });
  assert.equal(mode.status, 403, JSON.stringify(mode.json));
  assert.equal((await w.req('antor', 'DELETE', D(999999), { nom: 'Essai Kanka' })).status, 404);
  assert.deepEqual(compteParTable(w.db), avant);
});

test('un_autre_univers_n_est_pas_touche_par_le_nom_d_un_univers_voisin', async () => {
  const w = await monde();
  // Antor is GM of both: the name of Lame d'Ébène on Essai Kanka's id deletes nothing.
  const n = (w.db.prepare('SELECT COUNT(*) n FROM univers').get() as Any).n;
  const r = await w.req('antor', 'DELETE', D(w.essai), { nom: "Lame d'Ébène" });
  assert.equal(r.status, 400);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM univers').get() as Any).n, n);
});

test('une_transaction_qui_echoue_a_mi_course_ne_supprime_rien_ni_aucun_fichier', async () => {
  const w = await monde();
  const avant = compteParTable(w.db);
  const disque = fichiersDuDisque(DISQUE);
  // fails at the very last statement, after every other table was emptied
  w.db.exec(
    "CREATE TRIGGER echec_test BEFORE DELETE ON univers BEGIN SELECT RAISE(ABORT, 'echec de test'); END;",
  );
  const r = await w.req('antor', 'DELETE', D(w.essai), { nom: 'Essai Kanka' });
  assert.ok(r.status >= 500, `${r.status} ${JSON.stringify(r.json)}`);
  assert.deepEqual(compteParTable(w.db), avant);
  assert.deepEqual(fichiersDuDisque(DISQUE), disque);
  assert.deepEqual(w.db.prepare('PRAGMA foreign_key_check').all(), []);
  // and once the fault is gone, it goes through
  w.db.exec('DROP TRIGGER echec_test');
  assert.equal((await w.req('antor', 'DELETE', D(w.essai), { nom: 'Essai Kanka' })).status, 204);
});
