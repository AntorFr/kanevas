import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, migrate, type Db } from '../../db/db.js';
import { creerCampagne } from '../campagnes.js';
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
  const camp = creerCampagne(db, antor.id, u.id, { nom: 'La Couronne brisée' });
  const campAutre = creerCampagne(db, paul.id, u2.id, { nom: 'Etrangère' });
  const outil = (compte: number, nom: string, args: unknown, univ = u.id) =>
    catalogueDe(db, compte, univ).outils.find((o) => o.nom === nom)!.executer(args);
  const nbSections = () => db.prepare('SELECT count(*) n FROM sections').get() as { n: number };
  return { db, antor, lea, paul, u, u2, aldric, app, verite, camp, campAutre, outil, nbSections };
}
const ok = (r: any) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
};

test('catalogues : creer_* seulement chez le MJ, aucun paramètre compte/univers/rôle', () => {
  const { db, antor, lea, u } = monde();
  const noms = (id: number) => catalogueDe(db, id, u.id).outils.map((o) => o.nom);
  assert.ok(!noms(lea.id).includes('creer_campagne'));
  assert.ok(!noms(lea.id).includes('creer_scenario'));
  assert.ok(noms(antor.id).includes('creer_campagne'));
  assert.ok(noms(antor.id).includes('creer_scenario'));
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
  assert.deepEqual(ok(outil(lea.id, 'chercher', { mots: 'Traître' })).donnees.fiches, []);
  assert.equal(ok(outil(antor.id, 'chercher', { mots: 'Traître' })).donnees.fiches.length, 1);
});

test('chercher Garde sans type : 20 fiches triées par type puis titre, tronquée', () => {
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
  // Order BETWEEN types is a gap (not pinned): types stay grouped, titles ascend inside a type.
  const types = r.fiches.map((f: any) => f.type);
  assert.deepEqual(types, [...types].sort((x, y) => types.indexOf(x) - types.indexOf(y)));
  for (const t of new Set(types)) {
    const titres = r.fiches.filter((f: any) => f.type === t).map((f: any) => f.titre);
    assert.deepEqual(titres, [...titres].sort());
  }
  assert.deepEqual(
    r.fiches.filter((f: any) => f.type === 'personnage').map((f: any) => f.titre),
    Array.from({ length: 8 }, (_, i) => `Garde-perso 0${i}`),
  );
  // exactly 20 → not truncated; with type → only that type
  const t = ok(outil(lea.id, 'chercher', { mots: 'Garde', type: 'lieu' })).donnees;
  assert.equal(t.fiches.length, 10);
  assert.equal(t.tronquee, false);
});

test('lister_campagnes, lire_fiche et lire_section selon le rôle', () => {
  const { lea, antor, outil, aldric, app, verite } = monde();
  assert.deepEqual(ok(outil(lea.id, 'lister_campagnes', {})).donnees.campagnes.map((c: any) => c.nom), ['La Couronne brisée']);
  const f = ok(outil(lea.id, 'lire_fiche', { ficheId: aldric.id })).donnees;
  assert.deepEqual(f.sections.map((s: any) => [s.titre, s.version]), [['Apparence', 1]]);
  assert.equal(ok(outil(antor.id, 'lire_fiche', { ficheId: aldric.id })).donnees.sections.length, 2);
  const cache = outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: verite.id });
  const inex = outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: 99999 });
  assert.deepEqual(cache, { ok: false, erreur: 'Introuvable.' });
  assert.deepEqual(inex, cache);
  assert.equal(ok(outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: app.id })).donnees.contenu, 'Grand.');
});

test('creer_campagne / creer_scenario : événements, visibilité, étanchéité entre univers', () => {
  const { antor, lea, outil, camp, campAutre, db } = monde();
  const c = ok(outil(antor.id, 'creer_campagne', { nom: 'Les Marches rouges' }));
  assert.equal(c.evenement.type, 'campagne_creee');
  assert.ok(c.evenement.libelle.includes('Les Marches rouges'));
  assert.ok(ok(outil(lea.id, 'lister_campagnes', {})).donnees.campagnes.some((x: any) => x.nom === 'Les Marches rouges'));
  const s = ok(outil(antor.id, 'creer_scenario', { campagneId: camp.id, titre: 'Le Siège' }));
  assert.equal(s.evenement.type, 'scenario_cree');
  assert.ok(s.evenement.libelle.includes('Le Siège') && s.evenement.libelle.includes('La Couronne brisée'));
  assert.equal((db.prepare('SELECT count(*) n FROM scenarios').get() as any).n, 1);
  // a campaign of another universe, even if Antor were its GM, and an unknown one
  const autre = outil(antor.id, 'creer_scenario', { campagneId: campAutre.id, titre: 'X' });
  assert.deepEqual(autre, { ok: false, erreur: 'Introuvable.' });
  assert.deepEqual(outil(antor.id, 'creer_scenario', { campagneId: 99999, titre: 'X' }), { ok: false, erreur: 'Introuvable.' });
  assert.equal((db.prepare('SELECT count(*) n FROM scenarios').get() as any).n, 1);
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
  assert.equal(ok(outil(lea.id, 'lire_section', { ficheId: aldric.id, sectionId: app.id })).donnees.contenu, 'Grand.');
});

test('paramètres inconnus ou invalides : échec sans effet', () => {
  const { lea, outil, aldric, antor } = monde();
  assert.equal(outil(lea.id, 'lire_fiche', { ficheId: aldric.id, compteId: antor.id }).ok, false);
  assert.equal(outil(antor.id, 'creer_campagne', { nom: '' }).ok, false);
});
