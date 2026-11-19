import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { creerFiche } = await import('./fiches.js');
const { ajouterMembre } = await import('./membres.js');
const { appliquerProposition } = await import('./propositions.js');
const { creerEtRattacherSysteme } = await import('./systemes.js');
const { creerUnivers } = await import('./univers.js');
const { poserActivation, poserReglages, poserVisibilite } = await import('./outils.js');
const { poserSectionGeree, recalculerSection } = await import('./sections-gerees.js');
const { deposerRecalcul } = await import('./propositions.js');
const { essaiG, appelsApresEcriture } = await import('../outils/essai/g.js');
const c = await import('./catalogues.js');
const { readFileSync } = await import('node:fs');

function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string }; }
  assert.fail('aucune erreur levée');
}

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u, { nom: 'Sys' }).id;
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', true);
  poserVisibilite(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { mj: true, joueur: true });
  const fiche = creerFiche(db, antor, u, { type: 'personnage', titre: 'Aldric', charge: { pj: false } }).id;
  const pose = (type: string, extra: object = {}) => poserSectionGeree(db, antor, u, {
    ficheId: fiche, outil: 'essai/g', type, contenu: 'Texte initial', sourceVersion: 'vieux',
    audience: { joueursLisent: true }, ...extra,
  } as any);
  const ligne = (id: number) => db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as any;
  return { db, antor, u, sys, fiche, pose, ligne };
}
const hook = () => essaiG.sections![0];

test('crochet : une fois par écriture (création, réécriture), avec {contenu, sourceVersion, charge}, après l\'écriture', () => {
  const { db, antor, u, fiche, pose, ligne } = monde();
  appelsApresEcriture.length = 0;
  const vu: any[] = [];
  const orig = hook().apresEcriture!;
  hook().apresEcriture = (ctx, ecrit) => { vu.push(ligne(ctx.sectionId!).contenu); orig(ctx, ecrit); };
  try {
    const s = pose('caracteristiques', { charge: { a: 1 } });
    assert.equal(appelsApresEcriture.length, 1);
    assert.deepEqual(appelsApresEcriture[0], { sectionId: s.id, contenu: 'Texte initial', sourceVersion: 'vieux', charge: { a: 1 } });
    assert.deepEqual(vu, ['Texte initial'], 'la section est déjà écrite quand le crochet tourne');
    poserSectionGeree(db, antor, u, { ficheId: fiche, outil: 'essai/g', type: 'caracteristiques', sectionId: s.id,
      contenu: 'Deux', sourceVersion: 'sv2', version: 1, charge: { a: 2 } } as any);
    assert.equal(appelsApresEcriture.length, 2);
    assert.deepEqual(appelsApresEcriture[1], { sectionId: s.id, contenu: 'Deux', sourceVersion: 'sv2', charge: { a: 2 } });
    assert.equal(ligne(s.id).version, 2);
    // Sans charge : le champ reste absent/indéfini.
    pose('caracteristiques');
    assert.equal(appelsApresEcriture[2].charge, undefined);
  } finally { hook().apresEcriture = orig; }
});

test('crochet : recalculerSection repasse la charge de produire, une seule fois', () => {
  const { db, antor, u, fiche, pose, ligne } = monde();
  const s = pose('caracteristiques');
  appelsApresEcriture.length = 0;
  recalculerSection(db, antor, u, fiche, s.id, 1);
  assert.equal(appelsApresEcriture.length, 1);
  assert.equal(appelsApresEcriture[0].contenu, "Marge d'essai : 10 %");
  assert.deepEqual(appelsApresEcriture[0].charge, { marge: 10 });
  assert.equal(appelsApresEcriture[0].sourceVersion, ligne(s.id).source_version);
  // À jour : aucune écriture, aucun appel.
  recalculerSection(db, antor, u, fiche, s.id, 2);
  assert.equal(appelsApresEcriture.length, 1);
});

test('crochet : appliquerProposition d\'une section à crochet l\'appelle une fois avec la charge fraîche', () => {
  const { db, antor, u, pose, ligne } = monde();
  const s = pose('caracteristiques');
  appelsApresEcriture.length = 0;
  const id = deposerRecalcul(db, { universId: u, compteId: antor, sectionId: s.id, contenu: 'Proposé', versionOrigine: 1, source: 'sv9' } as any);
  appliquerProposition(db, antor, u, (id as any));
  assert.equal(appelsApresEcriture.length, 1);
  assert.deepEqual(appelsApresEcriture[0], { sectionId: s.id, contenu: 'Proposé', sourceVersion: 'sv9', charge: { marge: 10 } });
  assert.equal(ligne(s.id).contenu, 'Proposé');
});

test('crochet qui lève : section (contenu, version, source_version) et transaction entière annulées, erreur telle quelle', () => {
  const { db, antor, u, fiche, pose, ligne } = monde();
  const s = pose('caracteristiques');
  const avant = ligne(s.id);
  const nbSections = (db.prepare('SELECT COUNT(*) n FROM sections').get() as any).n;
  const orig = hook().apresEcriture!;
  hook().apresEcriture = () => { throw Object.assign(new Error('boum'), { code: 'conflit' }); };
  try {
    // réécriture
    const e: any = err(() => poserSectionGeree(db, antor, u, { ficheId: fiche, outil: 'essai/g', type: 'caracteristiques',
      sectionId: s.id, contenu: 'Autre', sourceVersion: 'sv2', version: 1 } as any));
    assert.equal(e.message, 'boum');
    assert.deepEqual(ligne(s.id), avant);
    // création
    err(() => pose('caracteristiques'));
    assert.equal((db.prepare('SELECT COUNT(*) n FROM sections').get() as any).n, nbSections, 'aucune section créée');
    // recalcul
    err(() => recalculerSection(db, antor, u, fiche, s.id, 1));
    assert.deepEqual(ligne(s.id), avant);
    // proposition : non marquée appliquée
    const id = deposerRecalcul(db, { universId: u, compteId: antor, sectionId: s.id, contenu: 'P', versionOrigine: 1, source: 'sv9' } as any);
    err(() => appliquerProposition(db, antor, u, id as any));
    assert.deepEqual(ligne(s.id), avant);
    assert.equal((db.prepare('SELECT appliquee_le a FROM propositions WHERE id = ?').get(id) as any).a, null);
  } finally { hook().apresEcriture = orig; }
});

test('outil sans crochet (type notes) : écrit comme avant, charge ignorée', () => {
  const { db, antor, u, fiche, pose, ligne } = monde();
  appelsApresEcriture.length = 0;
  const s = pose('notes', { charge: { x: 1 } });
  poserSectionGeree(db, antor, u, { ficheId: fiche, outil: 'essai/g', type: 'notes', sectionId: s.id,
    contenu: 'N2', sourceVersion: 'sv2', version: 1 } as any);
  assert.equal(ligne(s.id).contenu, 'N2');
  assert.equal(ligne(s.id).version, 2);
  assert.equal(appelsApresEcriture.length, 0);
});

test('inclureMasques : un masqué est rendu avec l\'indicateur, pas sans ; un retiré jamais', () => {
  const { db, antor, u, sys } = monde();
  const OUTIL = 'essai/g';
  const exemple = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
  c.appliquerCatalogue(db, { compteId: antor }, { niveau: 'systeme', id: sys }, OUTIL, exemple);
  c.appliquerCatalogue(db, { compteId: antor }, { niveau: 'univers', id: u }, OUTIL,
    { catalogue: OUTIL, version: 'u', armes: [{ cle: 'laser', nom: 'Laser maison', masse: 9, cout: 1, portee: 'longue' }] });
  const l = c.lireCatalogueGestion(db, { compteId: antor }, u, OUTIL, { nature: 'armes' }).elements.find((x: any) => x.cle === 'laser') as any;
  c.masquerElement(db, { compteId: antor }, u, OUTIL, 'armes', 'laser', { masque: true, version: l.version });
  c.retirerElement(db, { compteId: antor }, u, OUTIL, 'armes', 'canon-leger', { retire: true });

  const sans = err(() => c.lireElement(db, u, OUTIL, 'armes', 'laser'));
  assert.equal(sans.code, 'introuvable', 'sans indicateur, le masqué n\'est pas rendu');
  assert.equal(c.lireElement(db, u, OUTIL, 'armes', 'laser', { inclureMasques: true }).nom, 'Laser maison');
  assert.equal(err(() => c.lireElement(db, u, OUTIL, 'armes', 'laser', { inclureMasques: false })).code, 'introuvable');
  assert.equal(c.resoudreElements(db, u, OUTIL, 'armes', { inclureMasques: true }).some((x) => x.cle === 'laser'), true);
  assert.equal(c.resoudreElements(db, u, OUTIL, 'armes', { inclureMasques: false }).some((x) => x.cle === 'laser'), false);
  // retiré : dans aucun cas
  for (const o of [undefined, { inclureMasques: true }, { inclureMasques: false }]) {
    assert.equal(err(() => c.lireElement(db, u, OUTIL, 'armes', 'canon-leger', o)).code, 'introuvable');
    assert.equal(c.resoudreElements(db, u, OUTIL, 'armes', o).some((x) => x.cle === 'canon-leger'), false);
  }
});
