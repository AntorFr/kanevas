import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { ajouterMembre } from './membres.js';
import {
  creerEtRattacherSysteme,
  creerGabarit,
  creerSysteme,
  lireSysteme,
  listerCatalogue,
  listerGabarits,
  listerSystemes,
  modifierGabarit,
  rattacherSysteme,
} from './systemes.js';
import { creerUnivers, lireUnivers, listerUnivers, modifierUnivers } from './univers.js';

function err(fn: () => unknown): ErreurService {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  assert.fail('aucune erreur levée');
}
const code = (fn: () => unknown) => err(fn).code;
const n = (db: Db, t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const marc = assurerCompte(db, 'marc'); // MJ of u1 and u2
  const lea = assurerCompte(db, 'lea'); // player of u1
  const zoe = assurerCompte(db, 'zoe'); // no role anywhere
  const paul = assurerCompte(db, 'paul'); // MJ of u3 only, not attached
  const u1 = creerUnivers(db, marc.id, { nom: 'U1' });
  const u2 = creerUnivers(db, marc.id, { nom: 'U2 secret' });
  const u3 = creerUnivers(db, paul.id, { nom: 'U3' });
  ajouterMembre(db, marc.id, u1.id, 'lea', 'joueur');
  return { db, marc, lea, zoe, paul, u1, u2, u3 };
}

test('migration: base 0001 avec univers → systeme_id NULL partout, seconde exécution sans effet', () => {
  const db = openDb(':memory:');
  const dir = new URL('../db/migrations/', import.meta.url).pathname;
  db.exec(readFileSync(`${dir}0001-premiere-fiche.sql`, 'utf8'));
  db.exec("CREATE TABLE migrations (numero INTEGER PRIMARY KEY, nom TEXT NOT NULL, applique_le TEXT NOT NULL)");
  db.exec("INSERT INTO migrations VALUES (1,'0001-premiere-fiche.sql','x')");
  db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('a','x'), ('b','x')").run();
  assert.deepEqual(migrate(db), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(db.prepare('SELECT systeme_id FROM univers').all(), [{ systeme_id: null }, { systeme_id: null }]);
  assert.equal(n(db, 'systemes_jeu'), 0);
  assert.deepEqual(migrate(db), []);
  assert.equal(n(db, 'univers'), 2);
});

test('MJ crée « CoF Mini » ; « cof mini » refusé, aucune ligne ajoutée', () => {
  const { db, marc } = monde();
  const s = creerSysteme(db, marc.id, { nom: 'CoF Mini' });
  assert.equal(s.nom, 'CoF Mini');
  const e = err(() => creerSysteme(db, marc.id, { nom: 'cof mini' }));
  assert.equal(e.code, 'conflit');
  assert.equal(n(db, 'systemes_jeu'), 1);
  assert.equal(code(() => creerSysteme(db, marc.id, { nom: '   ' })), 'invalide');
  assert.equal(code(() => creerSysteme(db, marc.id, { nom: 'x'.repeat(81) })), 'invalide');
  creerSysteme(db, marc.id, { nom: 'x'.repeat(80) });
  assert.equal(n(db, 'systemes_jeu'), 2);
});

test('joueur seul ou compte sans rôle ne crée aucun système', () => {
  const { db, lea, zoe } = monde();
  assert.equal(code(() => creerSysteme(db, lea.id, { nom: 'A' })), 'refuse');
  assert.equal(code(() => creerSysteme(db, zoe.id, { nom: 'A' })), 'refuse');
  assert.equal(code(() => listerCatalogue(db, zoe.id)), 'refuse');
  assert.deepEqual(listerSystemes(db, zoe.id), []);
  assert.equal(n(db, 'systemes_jeu'), 0);
});

test('créer et rattacher : un geste ; nom pris → ni système ni rattachement', () => {
  const { db, marc, u1, u2 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'CoF Mini' });
  assert.equal(lireSysteme(db, marc.id, s.id).id, s.id);
  assert.equal(lireUnivers(db, marc.id, u1.id).systeme?.nom, 'CoF Mini');
  assert.equal(code(() => creerEtRattacherSysteme(db, marc.id, u2.id, { nom: 'COF MINI' })), 'conflit');
  assert.equal(n(db, 'systemes_jeu'), 1);
  assert.equal(lireUnivers(db, marc.id, u2.id).systeme, null);
});

test('créer et rattacher refusé au joueur et au compte sans rôle, rien créé', () => {
  const { db, lea, zoe, u1 } = monde();
  assert.equal(code(() => creerEtRattacherSysteme(db, lea.id, u1.id, { nom: 'A' })), 'refuse');
  assert.equal(code(() => creerEtRattacherSysteme(db, zoe.id, u1.id, { nom: 'A' })), 'introuvable');
  assert.equal(n(db, 'systemes_jeu'), 0);
});

test('rattacher/détacher : joueur et sans rôle refusés, id inconnu refusé, détacher garde système et gabarits', () => {
  const { db, marc, lea, zoe, u1 } = monde();
  const s = creerSysteme(db, marc.id, { nom: 'S' });
  assert.equal(code(() => rattacherSysteme(db, lea.id, u1.id, s.id)), 'refuse');
  assert.equal(code(() => rattacherSysteme(db, zoe.id, u1.id, s.id)), 'introuvable');
  assert.equal(code(() => rattacherSysteme(db, marc.id, u1.id, 999)), 'invalide');
  rattacherSysteme(db, marc.id, u1.id, s.id);
  creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'G', contenu: 'c' });
  assert.equal(code(() => rattacherSysteme(db, lea.id, u1.id, null)), 'refuse');
  assert.equal(lireSysteme(db, lea.id, s.id).id, s.id);
  rattacherSysteme(db, marc.id, u1.id, null);
  assert.equal(code(() => lireSysteme(db, marc.id, s.id)), 'introuvable');
  assert.equal(lireUnivers(db, marc.id, u1.id).systeme, null);
  assert.equal(n(db, 'systemes_jeu'), 1);
  assert.equal(n(db, 'gabarits'), 1);
});

test('gabarits : création, bornes, doublon même type (casse), autre type accepté, version périmée', () => {
  const { db, marc, u1 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  const g = creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'Garde du sceau', contenu: 'PV 10' });
  assert.equal(g.version, 1);
  assert.equal(code(() => creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'GARDE DU SCEAU' })), 'conflit');
  assert.equal(creerGabarit(db, marc.id, s.id, { type: 'objet', nom: 'garde du sceau' }).type, 'objet');
  assert.equal(code(() => creerGabarit(db, marc.id, s.id, { type: 'creature', nom: '' })), 'invalide');
  assert.equal(code(() => creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'y'.repeat(121) })), 'invalide');
  creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'y'.repeat(120), contenu: 'z'.repeat(20000) });
  assert.equal(code(() => creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'w', contenu: 'z'.repeat(20001) })), 'invalide');
  assert.equal(code(() => creerGabarit(db, marc.id, s.id, { type: 'monstre', nom: 'w' })), 'invalide');
  const m = modifierGabarit(db, marc.id, s.id, g.id, { nom: 'Garde', contenu: 'PV 12', version: 1 });
  assert.equal(m.version, 2);
  assert.equal(m.type, 'creature');
  const e = err(() => modifierGabarit(db, marc.id, s.id, g.id, { nom: 'Périmé', contenu: 'X', version: 1 }));
  assert.equal(e.code, 'conflit');
  const apres = listerGabarits(db, marc.id, s.id, { type: 'creature' }).gabarits.find((x) => x.id === g.id)!;
  assert.equal(apres.nom, 'Garde');
  assert.equal(apres.contenu, 'PV 12');
  assert.equal(apres.version, 2);
  // renaming onto a sibling of the same type is refused, version untouched
  const h = creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'Autre' });
  assert.equal(code(() => modifierGabarit(db, marc.id, s.id, h.id, { nom: 'GARDE', contenu: '', version: 1 })), 'conflit');
  // content over the limit on modification
  assert.equal(code(() => modifierGabarit(db, marc.id, s.id, h.id, { nom: 'Autre', contenu: 'z'.repeat(20001), version: 1 })), 'invalide');
});

test('lecture partagée : le MJ d’un second univers rattaché lit et écrit ; le joueur lit sans écrire', () => {
  const { db, marc, lea, u1, u2 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  creerGabarit(db, marc.id, s.id, { type: 'creature', nom: 'Garde du sceau', contenu: 'PV' });
  rattacherSysteme(db, marc.id, u2.id, s.id);
  assert.deepEqual(listerGabarits(db, marc.id, s.id, { type: 'creature' }).gabarits.map((g) => g.nom), ['Garde du sceau']);
  const g = listerGabarits(db, lea.id, s.id, { type: 'creature' }).gabarits[0]!;
  assert.equal(code(() => creerGabarit(db, lea.id, s.id, { type: 'creature', nom: 'X' })), 'refuse');
  assert.equal(code(() => modifierGabarit(db, lea.id, s.id, g.id, { nom: 'X', contenu: '', version: 1 })), 'refuse');
  assert.equal(lireSysteme(db, lea.id, s.id).peutEcrire, false);
  assert.equal(lireSysteme(db, marc.id, s.id).peutEcrire, true);
  assert.equal(listerGabarits(db, lea.id, s.id, { type: 'creature' }).gabarits[0]!.nom, 'Garde du sceau');
});

test('AD-94 : le rôle se calcule sur tous les univers rattachés du compte (joueur ici, MJ là)', () => {
  const { db, marc, paul, u1, u3 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  ajouterMembre(db, marc.id, u1.id, 'paul', 'joueur');
  // Paul: player of u1 (attached), GM of u3 (not attached) → reads, cannot write
  assert.equal(lireSysteme(db, paul.id, s.id).peutEcrire, false);
  assert.equal(code(() => creerGabarit(db, paul.id, s.id, { type: 'regle', nom: 'R' })), 'refuse');
  rattacherSysteme(db, paul.id, u3.id, s.id);
  const vue = lireSysteme(db, paul.id, s.id);
  assert.equal(vue.peutEcrire, true);
  assert.deepEqual(vue.mesUnivers.map((u) => [u.nom, u.role]), [['U1', 'joueur'], ['U3', 'mj']]);
  assert.equal(creerGabarit(db, paul.id, s.id, { type: 'regle', nom: 'R' }).version, 1);
});

test('listerSystemes : seuls les systèmes d’un univers du compte, sans nommer les autres univers', () => {
  const { db, marc, lea, zoe, paul, u1, u2, u3 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  rattacherSysteme(db, marc.id, u2.id, s.id);
  creerEtRattacherSysteme(db, paul.id, u3.id, { nom: 'Autre' });
  creerSysteme(db, marc.id, { nom: 'Détaché' });
  creerGabarit(db, marc.id, s.id, { type: 'objet', nom: 'O' });
  assert.deepEqual(listerSystemes(db, marc.id).map((x) => x.nom), ['S']);
  assert.deepEqual(listerSystemes(db, paul.id).map((x) => x.nom), ['Autre']);
  assert.deepEqual(listerSystemes(db, zoe.id), []);
  const [vl] = listerSystemes(db, lea.id);
  assert.deepEqual(Object.keys(vl!).sort(), ['entrees', 'id', 'mesUnivers', 'nbUnivers', 'nom', 'peutEcrire']);
  assert.equal(vl!.nbUnivers, 2);
  assert.deepEqual(vl!.entrees, { regle: 0, creature: 0, objet: 1 });
  assert.deepEqual(vl!.mesUnivers, [{ id: u1.id, nom: 'U1', role: 'joueur' }]);
  assert.equal(vl!.peutEcrire, false);
  assert.equal(JSON.stringify(listerSystemes(db, lea.id)).includes('U2'), false);
});

test('exclusions : inconnu, sans univers rattaché, détaché → même refus ; l’écriture aussi', () => {
  const { db, marc, zoe, paul, u1, u3 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  const g = creerGabarit(db, marc.id, s.id, { type: 'regle', nom: 'R' });
  creerEtRattacherSysteme(db, paul.id, u3.id, { nom: 'P' });
  const detache = creerSysteme(db, marc.id, { nom: 'D' });
  const inconnu = err(() => lireSysteme(db, marc.id, 9999));
  assert.equal(inconnu.code, 'introuvable');
  for (const [c, sid] of [[zoe.id, s.id], [paul.id, s.id], [marc.id, detache.id]] as const) {
    for (const fn of [
      () => lireSysteme(db, c, sid),
      () => listerGabarits(db, c, sid, { type: 'regle' }),
      () => creerGabarit(db, c, sid, { type: 'regle', nom: 'Z' }),
      () => modifierGabarit(db, c, sid, g.id, { nom: 'Z', contenu: '', version: 1 }),
    ]) {
      const e = err(fn);
      assert.equal(e.code, inconnu.code);
      assert.equal(e.message, inconnu.message);
    }
  }
  // a template of another system cannot be reached through a system the caller sees
  const p = listerSystemes(db, paul.id)[0]!;
  assert.equal(code(() => modifierGabarit(db, paul.id, p.id, g.id, { nom: 'Z', contenu: '', version: 1 })), 'introuvable');
  assert.equal(listerGabarits(db, marc.id, s.id, { type: 'regle' }).gabarits[0]!.nom, 'R');
});

test('listerUnivers / lireUnivers : système {id, nom} ou null, nbMembres', () => {
  const { db, marc, lea, u1, u2 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  assert.deepEqual(lireUnivers(db, lea.id, u1.id).systeme, { id: s.id, nom: 'S' });
  assert.equal(lireUnivers(db, marc.id, u2.id).systeme, null);
  const l = listerUnivers(db, marc.id);
  assert.deepEqual(l.map((u) => [u.nom, u.systeme, u.nbMembres]), [
    ['U1', { id: s.id, nom: 'S' }, 2],
    ['U2 secret', null, 1],
  ]);
});

test('listerCatalogue : couples id, nom pour un MJ ; refusé au joueur seul', () => {
  const { db, marc, lea } = monde();
  creerSysteme(db, marc.id, { nom: 'b' });
  creerSysteme(db, marc.id, { nom: 'A' });
  assert.deepEqual(listerCatalogue(db, marc.id).map((x) => x.nom), ['A', 'b']);
  assert.deepEqual(Object.keys(listerCatalogue(db, marc.id)[0]!).sort(), ['id', 'nom']);
  assert.equal(code(() => listerCatalogue(db, lea.id)), 'refuse');
});
test('modifierUnivers : MJ nom 1–80 et description ≤ 500 ; joueur refusé ; sans rôle introuvable', () => {
  const { db, marc, lea, zoe, u1 } = monde();
  const m = modifierUnivers(db, marc.id, u1.id, { nom: 'Nouveau', description: 'd'.repeat(500) });
  assert.equal(m.nom, 'Nouveau');
  assert.equal(lireUnivers(db, marc.id, u1.id).description.length, 500);
  assert.equal(code(() => modifierUnivers(db, marc.id, u1.id, { nom: '', description: '' })), 'invalide');
  assert.equal(code(() => modifierUnivers(db, marc.id, u1.id, { nom: 'x'.repeat(81), description: '' })), 'invalide');
  assert.equal(code(() => modifierUnivers(db, marc.id, u1.id, { nom: 'ok', description: 'd'.repeat(501) })), 'invalide');
  assert.equal(lireUnivers(db, marc.id, u1.id).nom, 'Nouveau');
  modifierUnivers(db, marc.id, u1.id, { nom: 'x'.repeat(80), description: '' });
  assert.equal(code(() => modifierUnivers(db, lea.id, u1.id, { nom: 'Pirate', description: '' })), 'refuse');
  assert.equal(code(() => modifierUnivers(db, zoe.id, u1.id, { nom: 'Pirate', description: '' })), 'introuvable');
  assert.equal(lireUnivers(db, marc.id, u1.id).nom, 'x'.repeat(80));
});

test('aucune fonction ne supprime : modules sans DELETE', () => {
  for (const f of ['systemes.ts', 'univers.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    assert.equal(/DELETE\s+FROM\s+(systemes_jeu|gabarits)/i.test(src), false);
  }
});
