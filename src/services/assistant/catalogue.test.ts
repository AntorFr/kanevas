import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, migrate, type Db } from '../../db/db.js';
import { assurerCompte } from '../comptes.js';
import { creerFiche } from '../fiches.js';
import { ajouterMembre } from '../membres.js';
import { ajouterSection, changerAudience } from '../sections.js';
import { creerUnivers } from '../univers.js';
import { catalogueDe } from './catalogue.js';

function monde() {
  const db: Db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const paul = assurerCompte(db, 'paul');
  const u = creerUnivers(db, antor.id, { nom: 'Lame' });
  const u2 = creerUnivers(db, paul.id, { nom: 'Autre' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const aldric = creerFiche(db, antor.id, u.id, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } });
  const app = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Apparence', contenu: 'Grand.' });
  changerAudience(db, antor.id, u.id, aldric.id, app.id, { joueursLisent: true });
  const verite = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Vérité — MJ seul', contenu: 'Traître.' });
  const camp = creerFiche(db, antor.id, u.id, { type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée' });
  const campAutre = creerFiche(db, paul.id, u2.id, { type: 'aventure', sousType: 'Campagne', titre: 'Etrangère' });
  const outil = (compte: number, nom: string, args: unknown, univ = u.id) =>
    catalogueDe(db, compte, univ).outils.find((o) => o.nom === nom)!.executer(args);
  const nbSections = () => db.prepare('SELECT count(*) n FROM sections').get() as { n: number };
  return { db, antor, lea, paul, u, u2, aldric, app, verite, camp, campAutre, outil, nbSections };
}
const ok = (r: any) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
};

test('catalogues : plus de creer_campagne, creer_scenario ni lister_campagnes (AD-127), aucun paramètre compte/univers/rôle', () => {
  const { db, antor, lea, u } = monde();
  const noms = (id: number) => catalogueDe(db, id, u.id).outils.map((o) => o.nom);
  for (const retire of ['creer_campagne', 'creer_scenario', 'lister_campagnes']) {
    assert.ok(!noms(lea.id).includes(retire), retire);
    assert.ok(!noms(antor.id).includes(retire), retire);
  }
  for (const o of catalogueDe(db, antor.id, u.id).outils) {
    for (const k of Object.keys(o.schema.shape)) {
      assert.ok(!/compte|univers|role|rôle/i.test(k), `${o.nom}.${k}`);
    }
  }
});

test('sans rôle ou univers inconnu : même refus, pas de catalogue', () => {
  const { db, paul, u } = monde();
  assert.throws(() => catalogueDe(db, paul.id, 9999), (e: any) => e.code === 'introuvable');
  assert.throws(() => catalogueDe(db, paul.id, u.id), (e: any) => e.code === 'introuvable');
});

test('chercher Aldric sans type : la fiche, pas une autre', () => {
  const { lea, outil, aldric } = monde();
  const r = ok(outil(lea.id, 'chercher', { mots: 'Aldric' }));
  assert.deepEqual(r.donnees, { fiches: [{ id: aldric.id, type: 'personnage', titre: 'Maître Aldric' }], tronquee: false });
});

test('chercher Aldric : un mot présent seulement dans la section fermée ne trouve rien pour Léa', () => {
  const { lea, antor, outil } = monde();
  assert.deepEqual(outil(lea.id, 'chercher', { mots: 'Traître' }), { ok: false, erreur: 'Introuvable.' });
  assert.equal(ok(outil(antor.id, 'chercher', { mots: 'Traître' })).donnees.fiches.length, 1);
});

test('chercher Garde sans type : 20 fiches triées par titre (AD-118), tronquée', () => {
  const { db, antor, lea, u, outil } = monde();
  const mk = (type: string, n: number, pre: string) => {
    for (let i = 0; i < n; i++) {
      const f = creerFiche(db, antor.id, u.id, { type, titre: `${pre} ${String(i).padStart(2, '0')}`, charge: type === 'personnage' ? { pj: false } : undefined });
      const s = ajouterSection(db, antor.id, u.id, f.id, { titre: 'S', contenu: 'x' });
      changerAudience(db, antor.id, u.id, f.id, s.id, { joueursLisent: true });
    }
  };
  mk('lieu', 10, 'Garde-lieu');
  mk('personnage', 8, 'Garde-perso');
  mk('faction', 7, 'Garde-faction');
  const r = ok(outil(lea.id, 'chercher', { mots: 'Garde' })).donnees;
  assert.equal(r.fiches.length, 20);
  assert.equal(r.tronquee, true);
  // One call to listerFiches, every type: the list's order, by title without case.
  const titres = r.fiches.map((f: any) => f.titre);
  assert.deepEqual(titres, [...titres].sort((x: string, y: string) => x.toLowerCase().localeCompare(y.toLowerCase())));
  // exactly 20 → not truncated; with type → only that type
  const t = ok(outil(lea.id, 'chercher', { mots: 'Garde', type: 'lieu' })).donnees;
  assert.equal(t.fiches.length, 10);
  assert.equal(t.tronquee, false);
});

test('lire_fiche et lire_section selon le rôle', () => {
  const { lea, antor, outil, aldric, app, verite } = monde();
  const f = ok(outil(lea.id, 'lire_fiche', { ficheId: aldric.id })).donnees;
  assert.deepEqual(f.sections.map((s: any) => [s.titre, s.version]), [['Apparence', 1]]);
  assert.equal(ok(outil(antor.id, 'lire_fiche', { ficheId: aldric.id })).donnees.sections.length, 2);
  const cache = outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: verite.id });
  const inex = outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: 99999 });
  assert.deepEqual(cache, { ok: false, erreur: 'Introuvable.' });
  assert.deepEqual(inex, cache);
  assert.equal(ok(outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: app.id })).donnees.contenu, '<p>Grand.</p>\n');
});

test('une aventure créée par le MJ se cherche et se lit comme une fiche ; Léa ne lit pas une Présentation fermée', () => {
  const { antor, lea, outil, camp, db, u } = monde();
  ajouterSection(db, antor.id, u.id, camp.id, { titre: 'Présentation', contenu: 'Secret.' });
  assert.deepEqual(outil(lea.id, 'chercher', { mots: 'Couronne' }), { ok: false, erreur: 'Introuvable.' });
  assert.ok(JSON.stringify(ok(outil(antor.id, 'chercher', { mots: 'Couronne', type: 'aventure' })).donnees).includes('Couronne'));
  assert.deepEqual(outil(lea.id, 'lire_fiche', { ficheId: camp.id }), { ok: false, erreur: 'Introuvable.' });
});

test('modifier_section : remplace avec la version lue, refuse une version périmée sans événement', () => {
  const { antor, outil, aldric, verite } = monde();
  const a = { ficheId: aldric.id, sectionId: verite.id };
  const r = ok(outil(antor.id, 'modifier_section', { ...a, contenu: 'Nouveau.', version: 1 }));
  assert.equal(r.evenement.type, 'section_modifiee');
  assert.equal(ok(outil(antor.id, 'lire_section', a)).donnees.contenu, 'Nouveau.');
  const p = outil(antor.id, 'modifier_section', { ...a, contenu: 'Autre', version: 1 });
  assert.equal(p.ok, false);
  assert.ok(!('evenement' in p));
  assert.equal(ok(outil(antor.id, 'lire_section', a)).donnees.contenu, 'Nouveau.');
});

test('ajouter_a_section de Léa : écrit après l’existant ; lecture seule et version périmée refusent sans événement', () => {
  const { db, antor, lea, u, outil, aldric, app } = monde();
  const sec = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Notes', contenu: 'Avant.' });
  changerAudience(db, antor.id, u.id, aldric.id, sec.id, { auteurId: lea.id, auteurLit: true, auteurEcrit: true });
  const a = { ficheId: aldric.id, sectionId: sec.id };
  const r = ok(outil(lea.id, 'ajouter_a_section', { ...a, texte: 'Après.', version: 1 }));
  assert.equal(r.evenement.type, 'section_completee');
  assert.equal(ok(outil(lea.id, 'lire_section', a)).donnees.contenu, 'Avant.\n\nAprès.');
  const vieux = outil(lea.id, 'ajouter_a_section', { ...a, texte: 'Z', version: 1 });
  assert.deepEqual(vieux, { ok: false, erreur: "La section a changé depuis que vous l'avez lue. Relisez-la." });
  const ro = outil(lea.id, 'ajouter_a_section', { ficheId: aldric.id, sectionId: app.id, texte: 'Z', version: 1 });
  assert.deepEqual(ro, { ok: false, erreur: 'Vous ne pouvez pas modifier cette section.' });
  assert.equal(ok(outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: app.id })).donnees.contenu, '<p>Grand.</p>\n');
});

test('paramètres inconnus ou invalides : échec sans effet', () => {
  const { lea, outil, aldric, antor } = monde();
  assert.equal(outil(lea.id, 'lire_fiche', { ficheId: aldric.id, compteId: antor.id }).ok, false);
  assert.equal(outil(antor.id, 'lire_fiche', { ficheId: 'x' }).ok, false);
});

test('bouchon : chercher salport (Antor, sans type) rend Port-Sel ; sous-main (Léa) : Introuvable., aucun événement', async () => {
  const { semerBouchon } = await import('../../bouchon/depart.js');
  const db: Db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const lame = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as any).id;
  const cpt = (n: string) => assurerCompte(db, n).id;
  const run = (n: string, mots: string) =>
    catalogueDe(db, cpt(n), lame).outils.find((o) => o.nom === 'chercher')!.executer({ mots });
  const a: any = run('antor', 'salport');
  assert.equal(a.ok, true);
  assert.deepEqual(a.donnees.fiches.map((f: any) => f.titre), ['Port-Sel']);
  const l: any = run('lea', 'sous-main');
  assert.equal(l.ok, false, JSON.stringify(l));
  assert.equal(l.erreur, 'Introuvable.');
  assert.equal(l.evenement, undefined);
});

// ---- creer_fiche (B-62, AD-126) ----
import { reglerTypeUnivers } from '../types-fiche.js';
import { lireFiche } from '../fiches.js';

const nbFiches = (db: Db) => (db.prepare('SELECT count(*) n FROM fiches').get() as { n: number }).n;

test('creer_fiche : MJ seulement ; Léa ne l’a pas ; aucun paramètre de compte ou d’univers', () => {
  const { db, antor, lea, u } = monde();
  const noms = (id: number) => catalogueDe(db, id, u.id).outils.map((o) => o.nom);
  assert.ok(noms(antor.id).includes('creer_fiche'));
  assert.ok(!noms(lea.id).includes('creer_fiche'));
  const o = catalogueDe(db, antor.id, u.id).outils.find((x) => x.nom === 'creer_fiche')!;
  assert.deepEqual(Object.keys(o.schema.shape).sort(), ['parentId', 'sousType', 'titre', 'type']);
});

test('creer_fiche : campagne puis scénario dessous, En préparation, événement fiche_creee, fermé à Léa', () => {
  const { db, antor, lea, u, outil } = monde();
  const c = ok(outil(antor.id, 'creer_fiche', { type: 'aventure', titre: 'Les Cendres', sousType: 'Campagne' }));
  assert.equal(c.donnees.titre, 'Les Cendres');
  assert.deepEqual(c.evenement, {
    type: 'fiche_creee', libelle: 'Fiche « Les Cendres » créée', cible: { type: 'fiche', ficheId: c.donnees.id },
  });
  const s = ok(outil(antor.id, 'creer_fiche', { type: 'aventure', titre: 'Le Creuset', sousType: 'Scénario', parentId: c.donnees.id }));
  const f = lireFiche(db, { compteId: antor.id }, u.id, s.donnees.id) as any;
  assert.deepEqual(f.ancetres.map((a: any) => a.id), [c.donnees.id]);
  assert.equal(f.charge.statut, 'en_preparation');
  assert.equal(f.sousType, 'Scénario');
  // Léa ne voit ni l'un ni l'autre
  assert.deepEqual(outil(lea.id, 'chercher', { mots: 'Creuset' }), { ok: false, erreur: 'Introuvable.' });
  assert.deepEqual(outil(lea.id, 'chercher', { mots: 'Cendres' }), { ok: false, erreur: 'Introuvable.' });
});

test('creer_fiche : parent inconnu ou d’un autre univers → Introuvable., rien de créé, aucun événement', () => {
  const { db, antor, u, campAutre, outil } = monde();
  const avant = nbFiches(db);
  for (const parentId of [99999, campAutre.id]) {
    const r = outil(antor.id, 'creer_fiche', { type: 'aventure', titre: 'Orphelin', parentId }) as any;
    assert.deepEqual(r, { ok: false, erreur: 'Introuvable.' });
    assert.equal(r.evenement, undefined);
  }
  assert.equal(nbFiches(db), avant);
  assert.equal(db.prepare("SELECT count(*) n FROM fiches WHERE titre='Orphelin'").get().n, 0);
  void u;
});

test('creer_fiche : type désactivé refusé sans événement ; compte_rendu et type inconnu refusés', () => {
  const { db, antor, u, outil } = monde();
  reglerTypeUnivers(db, antor.id, u.id, 'aventure', 'desactive');
  const avant = nbFiches(db);
  const r = outil(antor.id, 'creer_fiche', { type: 'aventure', titre: 'X' }) as any;
  assert.equal(r.ok, false);
  assert.equal(r.evenement, undefined);
  for (const type of ['compte_rendu', 'dragon']) {
    const q = outil(antor.id, 'creer_fiche', { type, titre: 'Y' }) as any;
    assert.equal(q.ok, false, type);
    assert.equal(q.evenement, undefined);
  }
  assert.equal(nbFiches(db), avant);
});

test('creer_fiche : paramètres en trop (compteId, universId) refusés, titre vide refusé', () => {
  const { db, antor, u, outil } = monde();
  const avant = nbFiches(db);
  for (const extra of [{ compteId: 1 }, { universId: u.id }]) {
    assert.equal((outil(antor.id, 'creer_fiche', { type: 'lieu', titre: 'Z', ...extra }) as any).ok, false);
  }
  assert.equal((outil(antor.id, 'creer_fiche', { type: 'lieu', titre: '   ' }) as any).ok, false);
  assert.equal(nbFiches(db), avant);
});

test('creer_fiche : un personnage sans charge naît PNJ ; un lieu sans parent', () => {
  const { db, antor, u, outil } = monde();
  const p = ok(outil(antor.id, 'creer_fiche', { type: 'personnage', titre: 'Mara' }));
  assert.equal((lireFiche(db, { compteId: antor.id }, u.id, p.donnees.id) as any).charge.pj, false);
  ok(outil(antor.id, 'creer_fiche', { type: 'lieu', titre: 'Port' }));
});

test('creer_fiche : un MJ d’un autre univers ne crée rien ici (introuvable)', () => {
  const { db, paul, u } = monde();
  assert.throws(() => catalogueDe(db, paul.id, u.id), (e: any) => e.code === 'introuvable');
});
