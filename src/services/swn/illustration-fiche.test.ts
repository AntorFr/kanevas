import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-liens-illustrer (AD-liens-4, B-92): illustrerFiche adds the picture of a linked body
// to the illustration of its sheet through ajouterFichier; non_liee, refuse, rendu_indisponible, bytes of the picture route.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { illustrationAstre, illustrerFiche } = await import('./illustration.js');

const octetsFaux = (aspect: string, cote: number) => new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, cote & 255, ...Buffer.from(aspect).subarray(0, 8)]);
const rendre = async (aspect: string, cote: number) => octetsFaux(aspect, cote);
const erreur = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e; } return null; };
const dossier = () => mkdtempSync(join(tmpdir(), 'illustrer-fiche-'));
const q0 = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8')).systemes[0].entree as { q: number; r: number };

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  const { q: hq, r: hr } = q0;
  const sid = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,'s','S',?,?,3,'accent','',0,0)")
    .run(g, univers, hq, hr).lastInsertRowid as number;
  const astre = (cle: string, nom: string | null, fiche: number | null) =>
    db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille, aspect, nom, fiche_id) VALUES (?,?,'planete','rocheux',1,3,0.1,'{}',?,?)").run(sid, cle, nom, fiche);
  const fiche = (titre: string, joueursLisent: boolean) => {
    const id = db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', ?, '{}', 1, 1)").run(univers, titre).lastInsertRowid as number;
    db.prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (?, 'Texte', 1, '', '2026-01-01', ?)").run(id, joueursLisent ? 1 : 0);
    return id;
  };
  const illu = (id: number) => q('SELECT f.* FROM fiches x JOIN fichiers f ON f.id = x.illustration_fichier_id WHERE x.id = ?', id)[0];
  const compte = (t: string) => q(`SELECT count(*) n FROM ${t}`)[0].n as number;
  const swn = () => ['swn_astres', 'swn_formations', 'swn_systemes', 'swn_zones'].map((t) => JSON.stringify(q(`SELECT * FROM ${t}`)));
  return { db, univers, g, a, astre, fiche, illu, compte, swn, q };
}
const deps = () => ({ racine: dossier(), racineFichiers: dossier(), rendre, versionRendu: 1 });

test('corps lié à une fiche lue des joueurs : fichier ajouté (joueurs), illustration posée, octets = route haute définition', async () => {
  const w = monde();
  const f = w.fiche('Port', true);
  w.astre('p1', 'Bellone', f);
  const d = deps();
  const avant = w.swn();
  const res = await illustrerFiche(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'p1', 512, d);
  assert.equal(res.ficheId, f);
  assert.equal(res.titre, 'Port');
  const ligne = w.illu(f);
  assert.equal(ligne.id, res.fichierId);
  assert.equal(ligne.visibilite, 'joueurs');
  assert.equal(ligne.type, 'image/webp');
  assert.equal(ligne.nom, 'Bellone.webp');
  const hd = (await illustrationAstre(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'p1', 512, {}, d)).octets!;
  const disque = readFileSync(join(d.racineFichiers, ligne.disque));
  assert.ok(disque.equals(hd));
  assert.deepEqual(w.swn(), avant); // writes no swn_* row
});

test('fiche non lue des joueurs : visibilité mj ; corps sans nom : le nom du fichier est la cle', async () => {
  const w = monde();
  const f = w.fiche('Secret', false);
  w.astre('p9', null, f);
  const res = await illustrerFiche(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'p9', 64, deps());
  const l = w.illu(f);
  assert.equal(l.id, res.fichierId);
  assert.equal(l.visibilite, 'mj');
  assert.equal(l.nom, 'p9.webp');
});

test('non_liee : corps sans fiche, invalide, message fixe, aucun fichier ; clé inconnue : introuvable', async () => {
  const w = monde();
  w.astre('p1', 'Libre', null);
  const avantF = w.compte('fichiers');
  const d = deps();
  const e = await erreur(illustrerFiche(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'p1', 64, d));
  assert.equal(e.code, 'invalide');
  assert.equal(e.detail, 'non_liee');
  assert.equal(e.message, "Ce corps n'est lié à aucune fiche.");
  assert.equal(w.compte('fichiers'), avantF);
  assert.equal(w.q('SELECT count(*) n FROM fichiers WHERE nom LIKE ?', 'Libre%')[0].n, 0);
  assert.equal((await erreur(illustrerFiche(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'zz', 64, d)))?.code, 'introuvable');
});

test('joueuse et MJ en mode joueur : refuse, aucun fichier, illustration inchangée', async () => {
  const w = monde();
  const f = w.fiche('Port', true);
  w.astre('p1', 'Bellone', f);
  const avant = w.compte('fichiers');
  for (const acteur of [w.a('lea'), w.a('antor', true)]) {
    const d = deps();
    const e = await erreur(illustrerFiche(w.db, acteur, w.univers, w.g, q0.q, q0.r, 'p1', 64, d));
    assert.equal(e?.code, 'refuse');
    assert.equal(readdirSync(d.racineFichiers).filter((n) => !n.startsWith('.') && n !== 'tmp').length, 0);
  }
  assert.equal(w.compte('fichiers'), avant);
  assert.equal(w.illu(f), undefined);
});

test('système secret et joueuse : introuvable (pas refuse)', async () => {
  const w = monde();
  const f = w.fiche('Port', true);
  w.astre('p1', 'B', f);
  w.db.prepare('UPDATE swn_systemes SET secret = 1').run();
  assert.equal((await erreur(illustrerFiche(w.db, w.a('lea'), w.univers, w.g, q0.q, q0.r, 'p1', 64, deps())))?.code, 'introuvable');
});

test('rendu en échec : indisponible / rendu_indisponible, aucun fichier ajouté, illustration inchangée', async () => {
  const w = monde();
  const f = w.fiche('Port', true);
  w.astre('p1', 'Bellone', f);
  const d = { ...deps(), rendre: async () => { throw new Error('boum'); } };
  const avant = w.compte('fichiers');
  const e = await erreur(illustrerFiche(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'p1', 64, d));
  assert.equal(e.code, 'indisponible');
  assert.equal(e.detail, 'rendu_indisponible');
  assert.equal(w.compte('fichiers'), avant);
  assert.equal(w.illu(f), undefined);
  assert.equal(readdirSync(d.racineFichiers).filter((n) => n !== 'tmp').length, 0);
});

test('cote invalide : invalide champ cote, aucun fichier', async () => {
  const w = monde();
  const f = w.fiche('Port', true);
  w.astre('p1', 'Bellone', f);
  for (const c of [63, 2049, 64.5, Number.NaN]) {
    const e = await erreur(illustrerFiche(w.db, w.a('antor'), w.univers, w.g, q0.q, q0.r, 'p1', c, deps()));
    assert.equal(e?.code, 'invalide', String(c));
    assert.equal(e.champ, 'cote');
  }
  assert.equal(w.illu(f), undefined);
});

test('balayage : ajouterFichier n\'est appelé que par illustration.ts dans services/swn et outils/swn', () => {
  const racine = fileURLToPath(new URL('../..', import.meta.url));
  const trouves: string[] = [];
  const parcourir = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && /\bajouterFichier\b/.test(readFileSync(p, 'utf8'))) trouves.push(p.slice(racine.length));
    }
  };
  for (const d of ['services/swn', 'outils/swn']) if (existsSync(join(racine, d))) parcourir(join(racine, d));
  assert.deepEqual(trouves, ['services/swn/illustration.ts']);
});
