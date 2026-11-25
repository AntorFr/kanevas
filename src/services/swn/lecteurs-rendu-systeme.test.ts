import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// kanevas-carte-rendu-galaxie-systemes-migration : après la montée 0052, les lecteurs de `taille` et `couleur`
// (lecture-carte, document-source) disent 0.75 et #f2a33c là où ils disaient 3 / « grande » et « ambre » ;
// l'écrivain accepte encore les anciens noms et entiers (AD-rendu-8).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
await import('../../bouchon/depart.js');
const { lireBlocs, lireSysteme } = await import('./lecture-carte.js');
const src = await import('./document-source.js');
const e = await import('./ecriture-carte.js');
const { creerEtRattacherSysteme } = await import('../systemes.js');
const { poserActivation } = await import('../outils.js');

const SRC = new URL('../../db/migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}
const D = '2026-10-01T00:00:00.000Z';

/** A GM and a player on a 0050 galaxy holding « grande » / « ambre » (size 3), a size 1 and a `neutre` system; then the migration plays. */
function monde() {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(50));
  const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p);
  run("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'mj', ?)", D);
  run("INSERT INTO comptes (id, username, cree_le) VALUES (2, 'lea', ?)", D);
  run("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U', ?, 'univers-un')", D);
  run("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur')");
  run("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 1, 'abc', 0.2, 1)");
  const s = `INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes) VALUES (?, 1, 1, ?, ?, ?, 0, ?, ?, '')`;
  run(s, 1, 'vael', 'Vael', 0, 3, 'ambre');
  run(s, 2, 'mince', 'Mince', 1, 1, 'neutre');
  run(s, 3, 'geant', 'Géant', 2, 5, 'accent');
  migrate(db);
  const sj = creerEtRattacherSysteme(db, 1, 1, { nom: 'Système' });
  poserActivation(db, 1, { niveau: 'systeme', id: sj.id }, 'swn/galaxie', true);
  const galaxie = db.prepare('SELECT * FROM swn_galaxies WHERE id = 1').get() as any;
  return { db, galaxie, mj: { compteId: 1, modeJoueur: false }, lea: { compteId: 2, modeJoueur: false } };
}
const R0 = { bx: -1, by: -1 }, R1 = { bx: 1, by: 1 };

test('lecteur 1, la vue de la carte : 0.75 et #f2a33c là où elle disait 3 et ambre ; null pour neutre', () => {
  const w = monde();
  for (const acteur of [w.mj, w.lea]) {
    const v = lireBlocs(w.db, acteur, 1, 1, R0, R1);
    const par = Object.fromEntries(v.systemes.map((s) => [s.cle, s]));
    assert.equal(par.vael!.taille, 0.75);
    assert.equal(par.vael!.couleur, '#f2a33c');
    assert.equal(par.mince!.taille, 0.15);
    assert.equal(par.mince!.couleur, null);
    assert.equal(par.geant!.taille, 1);
    assert.equal(par.geant!.couleur, '#8b9bf0');
  }
});

test('lecteur 2, le panneau d\'un système : 0.75 et #f2a33c', () => {
  const w = monde();
  const p = lireSysteme(w.db, w.mj, 1, 1, 'vael');
  assert.equal(p.taille, 0.75);
  assert.equal(p.couleur, '#f2a33c');
  assert.equal(lireSysteme(w.db, w.lea, 1, 1, 'mince').couleur, null);
});

test('lecteur 3, le document source : la taille 3 reste « grande » (texte inchangé), 1 « petite », 4 et 5 « grande »', () => {
  const w = monde();
  const { contenu } = src.produireGalaxie(w.db, w.mj, 1, w.galaxie);
  const ligne = (nom: string) => contenu.split('\n').find((l) => l.includes(nom)) ?? '';
  assert.match(ligne('Vael'), /grande/);
  assert.match(ligne('Mince'), /petite/);
  assert.match(ligne('Géant'), /grande/);
  assert.doesNotMatch(contenu, /0\.75|#f2a33c|neutre/);
  const moyen = w.db.prepare("UPDATE swn_systemes SET taille = 0.45 WHERE cle = 'vael'").run();
  assert.equal(moyen.changes, 1);
  assert.match(src.produireGalaxie(w.db, w.mj, 1, w.galaxie).contenu.split('\n').find((l) => l.includes('Vael')) ?? '', /moyenne/);
});

test('écrivain : les anciens noms et entiers restent acceptés et se convertissent, une forme nouvelle s\'écrit telle quelle', () => {
  const w = monde();
  const lire = (cle: string) => w.db.prepare('SELECT taille, couleur FROM swn_systemes WHERE cle = ?').get(cle) as { taille: number; couleur: string | null };
  const poser = (nom: string, q: number, extra: Record<string, unknown>) => e.placerSysteme(w.db, w.mj, 1, 1, { nom, q, r: 10, ...extra } as any);
  poser('Ancien', 20, { taille: 'grande', couleur: 'ambre' });
  assert.deepEqual(lire('ancien'), { taille: 0.75, couleur: '#f2a33c' });
  poser('Entier', 21, { taille: 4, couleur: 'danger' });
  assert.deepEqual(lire('entier'), { taille: 0.9, couleur: '#ec7b6f' });
  poser('Neutre', 22, { taille: 'petite', couleur: 'neutre' });
  assert.deepEqual(lire('neutre'), { taille: 0.15, couleur: null });
  poser('Neuf', 23, { taille: 0.3, couleur: '#a1b2c3' });
  assert.deepEqual(lire('neuf'), { taille: 0.3, couleur: '#a1b2c3' });
  poser('Zero', 24, { taille: 0 });
  assert.equal(lire('zero').taille, 0);
  poser('Defaut', 25, {});
  assert.deepEqual(lire('defaut'), { taille: 0.45, couleur: '#8b9bf0' });
});

test('écrivain : refus invalide avec champ pour une taille hors [0, 1], une couleur mal formée', () => {
  const w = monde();
  const refus = (extra: Record<string, unknown>) => {
    try { e.placerSysteme(w.db, w.mj, 1, 1, { nom: 'X', q: 30, r: 30, ...extra } as any); } catch (x: any) { return [x.code, x.champ]; }
    return ['aucun'];
  };
  assert.deepEqual(refus({ taille: 1.5 }), ['invalide', 'taille']);
  assert.deepEqual(refus({ taille: -0.2 }), ['invalide', 'taille']);
  assert.deepEqual(refus({ taille: 6 }), ['invalide', 'taille']);
  assert.deepEqual(refus({ taille: 'enorme' }), ['invalide', 'taille']);
  assert.deepEqual(refus({ couleur: '#FFF' }), ['invalide', 'couleur']);
  assert.deepEqual(refus({ couleur: 'bleu' }), ['invalide', 'couleur']);
  assert.deepEqual(refus({ couleur: '#A1B2C3' }), ['invalide', 'couleur']);
  assert.equal(w.db.prepare('SELECT count(*) AS n FROM swn_systemes WHERE q = 30').get().n, 0);
});
