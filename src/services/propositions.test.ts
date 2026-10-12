import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { creerCampagne } from './campagnes.js';
import { assurerCompte } from './comptes.js';
import { creerCompteRendu } from './comptes_rendus.js';
import { ErreurService } from './erreurs.js';
import { creerFiche } from './fiches.js';
import { ajouterMembre, retirerMembre } from './membres.js';
import {
  abandonnerProposition,
  appliquerProposition,
  creerProposition,
  lireProposition,
} from './propositions.js';
import { ajouterSection, ecrireContenu, lireSection, retirerSection } from './sections.js';
import { creerUnivers } from './univers.js';

function err(fn: () => unknown): ErreurService {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  assert.fail('aucune erreur levée');
}
const nProp = (db: Db) =>
  (db.prepare('SELECT count(*) n FROM propositions').get() as { n: number }).n;

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const bob = assurerCompte(db, 'bob'); // second GM
  const zed = assurerCompte(db, 'zed'); // no role
  const paul = assurerCompte(db, 'paul');
  const u = creerUnivers(db, antor.id, { nom: 'U' });
  const u2 = creerUnivers(db, paul.id, { nom: 'U2' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  ajouterMembre(db, antor.id, u.id, 'bob', 'mj');
  const camp = creerCampagne(db, antor.id, u.id, { nom: 'C' });
  const cr = creerCompteRendu(db, antor.id, u.id, camp.id, { titre: 'Séance 3', texte: 'Texte' });
  const fiche = creerFiche(db, antor.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  const sec = ajouterSection(db, antor.id, u.id, fiche.id, { titre: 'Vérité', contenu: 'Ancien' });
  return { db, antor, lea, bob, zed, paul, u, u2, camp, cr, fiche, sec };
}
type M = ReturnType<typeof monde>;
const cree = (m: M, contenu = 'Nouveau', version = m.sec.version) =>
  creerProposition(m.db, m.antor.id, m.u.id, {
    sectionId: m.sec.id,
    crId: m.cr.id,
    contenu,
    version,
  });
const contenuSection = (m: M) =>
  lireSection(m.db, { compteId: m.antor.id }, m.u.id, m.fiche.id, m.sec.id);

test('créer : en attente, section intacte ; lecture rend actuel, proposé, état', () => {
  const m = monde();
  const p = cree(m);
  assert.equal(p.etat, 'en_attente');
  assert.equal(p.contenuActuel, 'Ancien');
  assert.equal(p.contenuPropose, 'Nouveau');
  assert.equal(p.appliqueeLe, null);
  const s = contenuSection(m);
  assert.equal(s.contenu, 'Ancien');
  assert.equal(s.version, m.sec.version);
  assert.equal(lireProposition(m.db, m.antor.id, m.u.id, p.id).etat, 'en_attente');
});

test('lecture : Léa, autre MJ, sans rôle, mauvais univers = identifiant inconnu', () => {
  const m = monde();
  const p = cree(m);
  const inconnu = err(() => lireProposition(m.db, m.antor.id, m.u.id, 9999)).code;
  assert.equal(inconnu, 'introuvable');
  for (const c of [m.lea, m.bob, m.zed]) {
    const e = err(() => lireProposition(m.db, c.id, m.u.id, p.id));
    assert.equal(e.code, inconnu);
    assert.equal(e.message, err(() => lireProposition(m.db, m.antor.id, m.u.id, 9999)).message);
    assert.equal(err(() => appliquerProposition(m.db, c.id, m.u.id, p.id)).code, 'introuvable');
    assert.equal(err(() => abandonnerProposition(m.db, c.id, m.u.id, p.id)).code, 'introuvable');
  }
  assert.equal(err(() => lireProposition(m.db, m.antor.id, m.u2.id, p.id)).code, 'introuvable');
  assert.equal(nProp(m.db), 1);
});

test('une seconde création remplace la première (une seule en attente)', () => {
  const m = monde();
  const p1 = cree(m, 'Un');
  const p2 = cree(m, 'Deux');
  assert.equal(nProp(m.db), 1);
  assert.equal(err(() => lireProposition(m.db, m.antor.id, m.u.id, p1.id)).code, 'introuvable');
  assert.equal(lireProposition(m.db, m.antor.id, m.u.id, p2.id).contenuPropose, 'Deux');
});

test('un autre MJ a sa propre proposition en attente sur la même section', () => {
  const m = monde();
  cree(m, 'Antor');
  creerProposition(m.db, m.bob.id, m.u.id, {
    sectionId: m.sec.id,
    crId: m.cr.id,
    contenu: 'Bob',
    version: m.sec.version,
  });
  assert.equal(nProp(m.db), 2);
});

test('refus sans ligne créée : vide, blanc, trop long, CR non CR, autre univers, version périmée', () => {
  const m = monde();
  assert.equal(err(() => cree(m, '')).code, 'invalide');
  assert.equal(err(() => cree(m, '   \n')).code, 'invalide');
  assert.equal(err(() => cree(m, 'x'.repeat(20001))).code, 'invalide');
  cree(m, 'x'.repeat(20000)); // boundary accepted
  m.db.prepare('DELETE FROM propositions').run();
  // not a report
  assert.equal(
    err(() =>
      creerProposition(m.db, m.antor.id, m.u.id, {
        sectionId: m.sec.id, crId: m.fiche.id, contenu: 'N', version: m.sec.version,
      }),
    ).code,
    'invalide',
  );
  // report from another universe
  const camp2 = creerCampagne(m.db, m.paul.id, m.u2.id, { nom: 'C2' });
  const cr2 = creerCompteRendu(m.db, m.paul.id, m.u2.id, camp2.id, { titre: 'Autre', texte: 't' });
  assert.notEqual(
    err(() =>
      creerProposition(m.db, m.antor.id, m.u.id, {
        sectionId: m.sec.id, crId: cr2.id, contenu: 'N', version: m.sec.version,
      }),
    ).code,
    undefined,
  );
  // section from another universe
  const f2 = creerFiche(m.db, m.paul.id, m.u2.id, { type: 'lieu', titre: 'L' });
  const s2 = ajouterSection(m.db, m.paul.id, m.u2.id, f2.id, { titre: 'S', contenu: 'c' });
  assert.equal(
    err(() =>
      creerProposition(m.db, m.antor.id, m.u.id, {
        sectionId: s2.id, crId: m.cr.id, contenu: 'N', version: s2.version,
      }),
    ).code,
    'introuvable',
  );
  // stale version
  assert.equal(err(() => cree(m, 'N', m.sec.version + 1)).code, 'conflit');
  // player cannot create
  assert.notEqual(
    err(() =>
      creerProposition(m.db, m.lea.id, m.u.id, {
        sectionId: m.sec.id, crId: m.cr.id, contenu: 'N', version: m.sec.version,
      }),
    ).code,
    undefined,
  );
  assert.equal(nProp(m.db), 0);
});

test('un refus de création ne détruit pas la proposition en attente existante', () => {
  const m = monde();
  cree(m, 'Gardée');
  err(() => cree(m, ''));
  err(() => cree(m, 'N', m.sec.version + 5));
  assert.equal(nProp(m.db), 1);
});

test('appliquer : écrit, version +1, appliquée ; second appliquer refusé', () => {
  const m = monde();
  const p = cree(m);
  const a = appliquerProposition(m.db, m.antor.id, m.u.id, p.id);
  assert.equal(a.etat, 'appliquee');
  assert.ok(a.appliqueeLe);
  const s = contenuSection(m);
  assert.equal(s.contenu, 'Nouveau');
  assert.equal(s.version, m.sec.version + 1);
  const e = err(() => appliquerProposition(m.db, m.antor.id, m.u.id, p.id));
  assert.equal(e.code, 'conflit');
  assert.equal(e.detail, 'proposition_appliquee');
  assert.equal(contenuSection(m).version, m.sec.version + 1);
  // applied stays "appliquée", never périmée, although the version moved
  assert.equal(lireProposition(m.db, m.antor.id, m.u.id, p.id).etat, 'appliquee');
});

test('section modifiée entre-temps : appliquer refusé, rien écrit, lecture « perimee »', () => {
  const m = monde();
  const p = cree(m);
  ecrireContenu(m.db, m.bob.id, m.u.id, m.fiche.id, m.sec.id, 'Bob a écrit', m.sec.version);
  const e = err(() => appliquerProposition(m.db, m.antor.id, m.u.id, p.id));
  assert.equal(e.code, 'conflit');
  assert.equal(e.detail, 'section_modifiee');
  const s = contenuSection(m);
  assert.equal(s.contenu, 'Bob a écrit');
  assert.equal(s.version, m.sec.version + 1);
  const l = lireProposition(m.db, m.antor.id, m.u.id, p.id);
  assert.equal(l.etat, 'perimee');
  assert.equal(l.appliqueeLe, null);
});

test('abandonner : supprime la ligne ; refusé si appliquée (ligne conservée)', () => {
  const m = monde();
  const p = cree(m);
  abandonnerProposition(m.db, m.antor.id, m.u.id, p.id);
  assert.equal(nProp(m.db), 0);
  assert.equal(err(() => lireProposition(m.db, m.antor.id, m.u.id, p.id)).code, 'introuvable');
  assert.equal(contenuSection(m).contenu, 'Ancien');
  const p2 = cree(m, 'Deux');
  appliquerProposition(m.db, m.antor.id, m.u.id, p2.id);
  const e = err(() => abandonnerProposition(m.db, m.antor.id, m.u.id, p2.id));
  assert.equal(e.detail, 'proposition_appliquee');
  assert.equal(nProp(m.db), 1);
});

test('après application, une nouvelle proposition en attente reste possible et la ligne appliquée reste', () => {
  const m = monde();
  const p = cree(m);
  appliquerProposition(m.db, m.antor.id, m.u.id, p.id);
  const v = contenuSection(m).version;
  const p2 = cree(m, 'Suite', v);
  assert.equal(p2.etat, 'en_attente');
  assert.equal(nProp(m.db), 2);
  assert.equal(lireProposition(m.db, m.antor.id, m.u.id, p.id).etat, 'appliquee');
});

test('retirer la section supprime ses propositions (y compris appliquées)', () => {
  const m = monde();
  const p = cree(m);
  appliquerProposition(m.db, m.antor.id, m.u.id, p.id);
  cree(m, 'Autre', contenuSection(m).version);
  assert.equal(nProp(m.db), 2);
  retirerSection(m.db, m.antor.id, m.u.id, m.fiche.id, m.sec.id);
  assert.equal(nProp(m.db), 0);
});

test('un MJ retiré de l’univers ne lit ni n’applique plus la sienne', () => {
  const m = monde();
  const p = creerProposition(m.db, m.bob.id, m.u.id, {
    sectionId: m.sec.id, crId: m.cr.id, contenu: 'Bob', version: m.sec.version,
  });
  retirerMembre(m.db, m.antor.id, m.u.id, m.bob.id);
  assert.equal(err(() => lireProposition(m.db, m.bob.id, m.u.id, p.id)).code, 'introuvable');
  assert.equal(err(() => appliquerProposition(m.db, m.bob.id, m.u.id, p.id)).code, 'introuvable');
  assert.equal(err(() => abandonnerProposition(m.db, m.bob.id, m.u.id, p.id)).code, 'introuvable');
  assert.equal(contenuSection(m).contenu, 'Ancien');
});

test('un MJ rétrogradé joueur ne lit ni n’applique plus la sienne', async () => {
  const m = monde();
  const p = cree(m);
  m.db.prepare("UPDATE membres SET role = 'joueur' WHERE compte_id = ? AND univers_id = ?").run(m.antor.id, m.u.id);
  m.db.prepare("UPDATE membres SET role = 'mj' WHERE compte_id = ? AND univers_id = ?").run(m.lea.id, m.u.id);
  assert.equal(err(() => lireProposition(m.db, m.antor.id, m.u.id, p.id)).code, 'introuvable');
  assert.equal(err(() => appliquerProposition(m.db, m.antor.id, m.u.id, p.id)).code, 'introuvable');
});

test('contraintes de la table : index unique partiel et contenu vide/long refusés par la base', () => {
  const m = monde();
  cree(m);
  const ins = (c: string, applied: string | null) =>
    m.db
      .prepare(
        `INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le, appliquee_le)
         VALUES (?, ?, ?, ?, ?, 1, 'x', ?)`,
      )
      .run(m.u.id, m.antor.id, m.sec.id, m.cr.id, c, applied);
  assert.throws(() => ins('autre', null));
  assert.throws(() => ins('', 'x'));
  assert.throws(() => ins('x'.repeat(20001), 'x'));
  ins('appliquée', 'x');
  ins('appliquée 2', 'x');
});
