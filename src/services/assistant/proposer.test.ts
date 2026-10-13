import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, migrate, type Db } from '../../db/db.js';
import { creerCampagne } from '../campagnes.js';
import { assurerCompte } from '../comptes.js';
import { creerCompteRendu } from '../comptes_rendus.js';
import { creerFiche } from '../fiches.js';
import { ajouterMembre } from '../membres.js';
import { ajouterSection, ecrireContenu } from '../sections.js';
import { creerUnivers } from '../univers.js';
import { catalogueDe } from './catalogue.js';
import { repondre } from './repondre.js';

const PHRASE = 'Mets à jour la section « Vérité » de « Maître Aldric » d’après le compte-rendu « Séance 3 »';

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
  const verite = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Vérité — MJ seul', contenu: 'Traître.' });
  const camp = creerCampagne(db, antor.id, u.id, { nom: 'La Couronne brisée' });
  const cr = creerCompteRendu(db, antor.id, u.id, camp.id, { titre: 'Séance 3', texte: 'Aldric trahit.' });
  const autreFiche = creerFiche(db, paul.id, u2.id, { type: 'personnage', titre: 'Etranger', charge: { pj: false } });
  const autreSec = ajouterSection(db, paul.id, u2.id, autreFiche.id, { titre: 'Secret', contenu: 'x' });
  const nb = (t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;
  const outil = (compte: number, args: unknown) =>
    catalogueDe(db, compte, u.id).outils.find((o) => o.nom === 'proposer_mise_a_jour')!.executer(args);
  const dit = (compte: number, m: string) => repondre(db, compte, u.id, m, [], { config: { KANEVAS_STUB: '1' } });
  const contenu = () => (db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(verite.id) as any);
  return { db, antor, lea, u, aldric, verite, cr, autreSec, nb, outil, dit, contenu };
}

test('bouchon : Antor → proposition en attente, section intacte, événement proposition_creee', async () => {
  const { antor, dit, nb, db, verite, contenu } = monde();
  const r = await dit(antor.id, PHRASE);
  assert.equal(nb('propositions'), 1);
  const p = db.prepare('SELECT * FROM propositions').get() as any;
  assert.equal(p.section_id, verite.id);
  assert.equal(p.contenu_propose, "Traître.\n\nMise à jour d'après « Séance 3 ».");
  assert.deepEqual(contenu(), { contenu: 'Traître.', version: 1 });
  assert.equal(r.evenements.length, 1);
  const e = r.evenements[0]!;
  assert.equal(e.type, 'proposition_creee');
  assert.deepEqual(e.cible, { type: 'proposition', propositionId: p.id });
  assert.ok(e.libelle.includes('Maître Aldric') && e.libelle.includes('Vérité'), e.libelle);
});

test('bouchon : même phrase pour Léa → aucune proposition, aucun événement', async () => {
  const { lea, dit, nb, contenu } = monde();
  const r = await dit(lea.id, PHRASE);
  assert.equal(nb('propositions'), 0);
  assert.deepEqual(r.evenements, []);
  assert.deepEqual(contenu(), { contenu: 'Traître.', version: 1 });
});

test('bouchon : compte-rendu inconnu → Introuvable., rien créé', async () => {
  const { antor, dit, nb } = monde();
  const r = await dit(antor.id, PHRASE.replace('Séance 3', 'Séance 99'));
  assert.equal(r.reponse, 'Introuvable.');
  assert.deepEqual(r.evenements, []);
  assert.equal(nb('propositions'), 0);
});

test('bouchon : section inconnue → Introuvable., rien créé', async () => {
  const { antor, dit, nb } = monde();
  const r = await dit(antor.id, PHRASE.replace('Vérité', 'Inexistante'));
  assert.equal(r.reponse, 'Introuvable.');
  assert.equal(nb('propositions'), 0);
});

test('« lis-moi la section » reste lecture seule (la règle proposer ne l’avale pas)', async () => {
  const { antor, dit, nb } = monde();
  const r = await dit(antor.id, 'Lis-moi la section « Vérité »');
  assert.deepEqual(r.evenements, []);
  assert.equal(nb('propositions'), 0);
});

test('catalogues : proposer_mise_a_jour chez le MJ seul, aucun outil n’applique', () => {
  const { db, antor, lea, u } = monde();
  const noms = (id: number) => catalogueDe(db, id, u.id).outils.map((o) => o.nom);
  assert.ok(noms(antor.id).includes('proposer_mise_a_jour'));
  assert.ok(!noms(lea.id).includes('proposer_mise_a_jour'));
  for (const n of noms(antor.id)) assert.ok(!/appliqu|abandon/i.test(n), n);
  const o = catalogueDe(db, antor.id, u.id).outils.find((x) => x.nom === 'proposer_mise_a_jour')!;
  assert.deepEqual(Object.keys(o.schema.shape).sort(), ['contenu', 'cr_id', 'section_id', 'version']);
});

test('version périmée : message exact, ni proposition ni événement', () => {
  const { db, antor, u, aldric, verite, cr, outil, nb } = monde();
  ecrireContenu(db, antor.id, u.id, aldric.id, verite.id, 'Nouveau.', 1);
  const r: any = outil(antor.id, { section_id: verite.id, cr_id: cr.id, version: 1, contenu: 'X' });
  assert.deepEqual(r, { ok: false, erreur: "La section a changé depuis que vous l'avez lue. Relisez-la." });
  assert.equal(nb('propositions'), 0);
});

test('section d’un autre univers → Introuvable.', () => {
  const { antor, autreSec, cr, outil, nb } = monde();
  const r: any = outil(antor.id, { section_id: autreSec.id, cr_id: cr.id, version: 1, contenu: 'X' });
  assert.deepEqual(r, { ok: false, erreur: 'Introuvable.' });
  assert.equal(nb('propositions'), 0);
});

test('source qui n’est pas un compte-rendu, contenu vide, paramètre en trop : échec sans effet', () => {
  const { antor, aldric, verite, cr, outil, nb } = monde();
  const a: any = outil(antor.id, { section_id: verite.id, cr_id: aldric.id, version: 1, contenu: 'X' });
  assert.equal(a.ok, false);
  assert.equal(a.evenement, undefined);
  const b: any = outil(antor.id, { section_id: verite.id, cr_id: cr.id, version: 1, contenu: '   ' });
  assert.equal(b.ok, false);
  const c: any = outil(antor.id, { section_id: verite.id, cr_id: cr.id, version: 1, contenu: 'X', compte_id: 2 });
  assert.deepEqual(c, { ok: false, erreur: 'Paramètres invalides.' });
  assert.equal(nb('propositions'), 0);
});
