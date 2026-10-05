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
  listerGabarits,
  listerSystemes,
  modifierGabarit,
  rattacherSysteme,
} from './systemes.js';
import { creerUnivers, lireUnivers, modifierUnivers } from './univers.js';

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
  assert.deepEqual(migrate(db), [2, 3]);
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
  assert.equal(code(() => listerSystemes(db, zoe.id)), 'refuse');
  assert.equal(n(db, 'systemes_jeu'), 0);
});

test('créer et rattacher : un geste ; nom pris → ni système ni rattachement', () => {
  const { db, marc, u1, u2 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'CoF Mini' });
  assert.equal(lireSysteme(db, marc.id, u1.id).id, s.id);
  assert.equal(code(() => creerEtRattacherSysteme(db, marc.id, u2.id, { nom: 'COF MINI' })), 'conflit');
  assert.equal(n(db, 'systemes_jeu'), 1);
  assert.equal(code(() => lireSysteme(db, marc.id, u2.id)), 'introuvable');
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
  creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'G', contenu: 'c' });
  assert.equal(code(() => rattacherSysteme(db, lea.id, u1.id, null)), 'refuse');
  assert.equal(lireSysteme(db, lea.id, u1.id).id, s.id);
  rattacherSysteme(db, marc.id, u1.id, null);
  assert.equal(code(() => lireSysteme(db, marc.id, u1.id)), 'introuvable');
  assert.equal(n(db, 'systemes_jeu'), 1);
  assert.equal(n(db, 'gabarits'), 1);
});

test('gabarits : création, bornes, doublon même type (casse), autre type accepté, version périmée', () => {
  const { db, marc, u1 } = monde();
  creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  const g = creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'Garde du sceau', contenu: 'PV 10' });
  assert.equal(g.version, 1);
  assert.equal(code(() => creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'GARDE DU SCEAU' })), 'conflit');
  assert.equal(creerGabarit(db, marc.id, u1.id, { type: 'objet', nom: 'garde du sceau' }).type, 'objet');
  assert.equal(code(() => creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: '' })), 'invalide');
  assert.equal(code(() => creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'y'.repeat(121) })), 'invalide');
  creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'y'.repeat(120), contenu: 'z'.repeat(20000) });
  assert.equal(code(() => creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'w', contenu: 'z'.repeat(20001) })), 'invalide');
  assert.equal(code(() => creerGabarit(db, marc.id, u1.id, { type: 'monstre', nom: 'w' })), 'invalide');
  const m = modifierGabarit(db, marc.id, u1.id, g.id, { nom: 'Garde', contenu: 'PV 12', version: 1 });
  assert.equal(m.version, 2);
  assert.equal(m.type, 'creature');
  const e = err(() => modifierGabarit(db, marc.id, u1.id, g.id, { nom: 'Périmé', contenu: 'X', version: 1 }));
  assert.equal(e.code, 'conflit');
  const apres = listerGabarits(db, marc.id, u1.id, { type: 'creature' }).gabarits.find((x) => x.id === g.id)!;
  assert.equal(apres.nom, 'Garde');
  assert.equal(apres.contenu, 'PV 12');
  assert.equal(apres.version, 2);
  // renaming onto a sibling of the same type is refused, version untouched
  const h = creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'Autre' });
  assert.equal(code(() => modifierGabarit(db, marc.id, u1.id, h.id, { nom: 'GARDE', contenu: '', version: 1 })), 'conflit');
  // content over the limit on modification
  assert.equal(code(() => modifierGabarit(db, marc.id, u1.id, h.id, { nom: 'Autre', contenu: 'z'.repeat(20001), version: 1 })), 'invalide');
});

test('lecture partagée : MJ d’un second univers lit ; joueur lit sans écrire', () => {
  const { db, marc, lea, u1, u2 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  creerGabarit(db, marc.id, u1.id, { type: 'creature', nom: 'Garde du sceau', contenu: 'PV' });
  rattacherSysteme(db, marc.id, u2.id, s.id);
  assert.deepEqual(listerGabarits(db, marc.id, u2.id, { type: 'creature' }).gabarits.map((g) => g.nom), ['Garde du sceau']);
  const g = listerGabarits(db, lea.id, u1.id, { type: 'creature' }).gabarits[0]!;
  assert.equal(code(() => creerGabarit(db, lea.id, u1.id, { type: 'creature', nom: 'X' })), 'refuse');
  assert.equal(code(() => modifierGabarit(db, lea.id, u1.id, g.id, { nom: 'X', contenu: '', version: 1 })), 'refuse');
  assert.equal(lireSysteme(db, lea.id, u1.id).peutEcrire, false);
  assert.equal(listerGabarits(db, lea.id, u1.id, { type: 'creature' }).gabarits[0]!.nom, 'Garde du sceau');
});

test('exclusions : sans rôle ou univers non rattaché → même refus qu’un identifiant inconnu ; pas de fuite d’univers', () => {
  const { db, marc, zoe, paul, u1, u2, u3 } = monde();
  const s = creerEtRattacherSysteme(db, marc.id, u1.id, { nom: 'S' });
  const g = creerGabarit(db, marc.id, u1.id, { type: 'regle', nom: 'R' });
  rattacherSysteme(db, marc.id, u2.id, s.id);
  // zoe: no role anywhere; paul: GM of an unattached universe
  const inconnu = err(() => lireSysteme(db, marc.id, 9999)); // unknown universe
  for (const [c, u] of [[zoe.id, u1.id], [paul.id, u3.id], [paul.id, u1.id], [zoe.id, u2.id]] as const) {
    for (const fn of [
      () => lireSysteme(db, c, u),
      () => listerGabarits(db, c, u, { type: 'regle' }),
      () => creerGabarit(db, c, u, { type: 'regle', nom: 'Z' }),
      () => modifierGabarit(db, c, u, g.id, { nom: 'Z', contenu: '', version: 1 }),
    ]) {
      const e = err(fn);
      assert.equal(e.code, inconnu.code);
      assert.equal(e.message, inconnu.message);
    }
  }
  // the gabarit of a system another universe uses cannot be reached through an unattached universe of the same GM
  const u4 = creerUnivers(db, marc.id, { nom: 'U4' });
  assert.equal(code(() => modifierGabarit(db, marc.id, u4.id, g.id, { nom: 'Z', contenu: '', version: 1 })), 'introuvable');
  const vue = lireSysteme(db, marc.id, u1.id);
  assert.equal(vue.universUtilisateurs, 2);
  assert.deepEqual(Object.keys(vue).sort(), ['id', 'nom', 'peutEcrire', 'universUtilisateurs']);
  assert.equal(JSON.stringify(vue).includes('U2'), false);
  assert.equal(JSON.stringify(listerSystemes(db, marc.id)).includes('U2'), false);
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
