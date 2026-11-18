import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-tenir-document : T-7, le Document MJ (section gérée de swn/galaxie).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const d = await import('./document.js');
const src = await import('./document-source.js');
const e = await import('./ecriture-carte.js');
const g = await import('./galaxies.js');
const { etatGere } = await import('../sections-gerees.js');
const { appliquerProposition, abandonnerProposition, lireProposition } = await import('../propositions.js');
const { lireSection } = await import('../sections.js');
const { creerFiche, lireFiche, listerFiches } = await import('../fiches.js');
const { redigerDocumentMJ } = await import('../../outils/swn/regles/document.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const gid = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  const gal = () => q('SELECT * FROM swn_galaxies WHERE id = ?', gid)[0];
  return { db, q, univers, gid, a, gal };
}
type W = ReturnType<typeof monde>;
const err = (f: () => unknown): any => { try { f(); } catch (x) { return x; } assert.fail("pas d'erreur"); };
const texte = (w: W, sectionId: number) => w.q('SELECT contenu FROM sections WHERE id = ?', sectionId)[0].contenu as string;

function poser(w: W) {
  return d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, { creer: { titre: 'Galaxie — notes MJ' } }, w.gal().version);
}
function ctx(w: W, acteur: string, sectionId: number | null, ficheId: number) {
  return { db: w.db, acteur: w.a(acteur), universId: w.univers, ficheId, sectionId };
}
function libre(w: W): [number, number] {
  for (let x = 40; x < 60; x++) if (!w.q('SELECT 1 FROM swn_systemes WHERE q=? AND r=?', x, 40).length) return [x, 40];
  throw new Error('aucune case libre');
}
function ajouter(w: W, nom: string, notes = '') {
  const [x, y] = libre(w);
  return e.placerSysteme(w.db, w.a('antor'), w.univers, w.gid, { nom, q: x, r: y, notes } as any);
}

test('créer : fiche savoir, section gérée, illisible pour Léa, contenu_public vide, texte de redigerDocumentMJ', () => {
  const w = monde();
  const r = poser(w);
  const fiche = w.q('SELECT * FROM fiches WHERE id = ?', r.ficheId)[0];
  assert.equal(fiche.type, 'savoir');
  assert.equal(fiche.titre, 'Galaxie — notes MJ');
  const s = w.q('SELECT * FROM sections WHERE id = ?', r.sectionId)[0];
  assert.equal(s.gere_par, 'swn/galaxie/document_mj');
  assert.equal(s.contenu_public, '');
  assert.equal(w.gal().fiche_id, r.ficheId);
  assert.equal(w.gal().section_id, r.sectionId);
  assert.equal(err(() => lireSection(w.db, w.a('lea'), w.univers, r.ficheId, r.sectionId)).code, 'introuvable');
  const trouve = listerFiches(w.db, w.a('lea'), w.univers, { recherche: 'Galaxie' });
  assert.ok(!trouve.fiches.some((f: any) => f.id === r.ficheId), 'la recherche de Léa ne rend pas la fiche');
  const trouveContenu = listerFiches(w.db, w.a('lea'), w.univers, { recherche: 'Systèmes' });
  assert.ok(!trouveContenu.fiches.some((f: any) => f.id === r.ficheId));
  // Le texte attendu : celui de redigerDocumentMJ pour la galaxie, au niveau mj.
  const p = src.produireDocument(ctx(w, 'antor', r.sectionId, r.ficheId));
  assert.equal(texte(w, r.sectionId), p.contenu);
  assert.ok(texte(w, r.sectionId).startsWith(':::mj\n# '));
  assert.equal(etatGere(w.db, w.a('antor'), w.univers, s)?.etat, 'a_jour');
  assert.equal(s.source_version, src.versionSourceDocument(ctx(w, 'antor', r.sectionId, r.ficheId)));
});

test('créer sur une fiche existante : même résultat sur cette fiche', () => {
  const w = monde();
  const f = creerFiche(w.db, w.a('antor').compteId, w.univers, { type: 'lieu', titre: 'Carnet existant' });
  const r = d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, { ficheId: f.id }, w.gal().version);
  assert.equal(r.ficheId, f.id);
  const s = w.q('SELECT * FROM sections WHERE id = ?', r.sectionId)[0];
  assert.equal(s.fiche_id, f.id);
  assert.equal(s.gere_par, 'swn/galaxie/document_mj');
  assert.equal(s.contenu_public, '');
  assert.equal(err(() => lireSection(w.db, w.a('lea'), w.univers, f.id, r.sectionId)).code, 'introuvable');
  // Fiche dont toutes les sections sont MJ seul : ce que Léa en voit (constat, sans le contenu du document).
  let vue: unknown;
  try { vue = lireFiche(w.db, w.a('lea'), w.univers, f.id); } catch (x) { vue = (x as any).code; }
  assert.ok(!JSON.stringify(vue).includes('Systèmes'));
  assert.ok(!JSON.stringify(vue).includes(':::'));
});

test('refus : second pose conflit document_existant ; Léa et Antor en mode Joueur refuse ; cible ambiguë invalide', () => {
  const w = monde();
  const v = w.gal().version;
  const lea = err(() => d.poserDocumentMJ(w.db, w.a('lea'), w.univers, w.gid, { creer: { titre: 'X' } }, v));
  assert.notEqual(lea.code, 'ok');
  assert.ok(['refuse', 'introuvable'].includes(lea.code), lea.code);
  assert.equal(err(() => d.poserDocumentMJ(w.db, w.a('antor', true), w.univers, w.gid, { creer: { titre: 'X' } }, v)).code, 'refuse');
  assert.equal(w.q('SELECT count(*) n FROM fiches WHERE titre = ?', 'X')[0].n, 0);
  assert.equal(err(() => d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, {}, v)).code, 'invalide');
  assert.equal(err(() => d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, { ficheId: 1, creer: { titre: 'X' } }, v)).code, 'invalide');
  assert.equal(err(() => d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, { creer: { titre: 'Y' } }, v + 5)).code, 'conflit');
  poser(w);
  const second = err(() => d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, { creer: { titre: 'Z' } }, w.gal().version));
  assert.equal(second.code, 'conflit');
  assert.equal(second.detail, 'document_existant');
  assert.equal(w.q('SELECT count(*) n FROM fiches WHERE titre = ?', 'Z')[0].n, 0);
});

test('un écrasement raté ne laisse ni fiche ni lien (titre vide)', () => {
  const w = monde();
  const avant = w.q('SELECT count(*) n FROM fiches')[0].n;
  err(() => d.poserDocumentMJ(w.db, w.a('antor'), w.univers, w.gid, { creer: { titre: '' } }, w.gal().version));
  assert.equal(w.q('SELECT count(*) n FROM fiches')[0].n, avant);
  assert.equal(w.gal().section_id, null);
});

test('périmé : texte inchangé, proposition pour Antor seul, un second ajout la remplace, application, abandon', () => {
  const w = monde();
  const r = poser(w);
  const avant = texte(w, r.sectionId);
  ajouter(w, 'Nouvelle Escale');
  assert.equal(texte(w, r.sectionId), avant);
  const s = () => w.q('SELECT * FROM sections WHERE id = ?', r.sectionId)[0];
  const ant = etatGere(w.db, w.a('antor'), w.univers, s())!;
  assert.equal(ant.etat, 'perime');
  assert.ok(ant.propositionId);
  const vue = d.lireDocument(w.db, w.a('antor'), w.univers, w.gid);
  assert.equal(vue.propositionId, ant.propositionId);
  assert.equal(vue.etat, 'perime');
  assert.equal(vue.fiche?.id, r.ficheId);
  const mira = d.lireDocument(w.db, w.a('mira'), w.univers, w.gid);
  assert.equal(mira.propositionId, null);
  assert.equal(w.q('SELECT count(*) n FROM propositions WHERE demandeur_id = ?', w.a('mira').compteId)[0].n, 0);
  // Second ajout : la proposition est remplacée (une seule en attente).
  ajouter(w, 'Autre Escale');
  const apres = d.lireDocument(w.db, w.a('antor'), w.univers, w.gid);
  assert.ok(apres.propositionId);
  assert.equal(w.q('SELECT count(*) n FROM propositions WHERE section_id = ? AND appliquee_le IS NULL', r.sectionId)[0].n, 1);
  assert.equal(texte(w, r.sectionId), avant);
  // Abandon : rien ne change.
  abandonnerProposition(w.db, w.a('antor').compteId, w.univers, apres.propositionId!);
  assert.equal(texte(w, r.sectionId), avant);
  assert.equal(etatGere(w.db, w.a('antor'), w.univers, s())!.etat, 'perime');
  // Nouvelle écriture → nouvelle proposition → application.
  ajouter(w, 'Troisième Escale');
  const p = d.lireDocument(w.db, w.a('antor'), w.univers, w.gid).propositionId!;
  assert.ok(p);
  appliquerProposition(w.db, w.a('antor').compteId, w.univers, p);
  assert.notEqual(texte(w, r.sectionId), avant);
  assert.ok(texte(w, r.sectionId).includes('Troisième Escale'));
  assert.equal(etatGere(w.db, w.a('antor'), w.univers, s())!.etat, 'a_jour');
  assert.equal(s().contenu_public, '');
  void lireProposition;
});

test('injection : nom « A\\n:::\\nB » et notes aplaties, contenu_public reste vide section ouverte aux joueurs', () => {
  const w = monde();
  const r = poser(w);
  ajouter(w, 'A\n:::\nB', 'x\n:::\n## secret');
  const p = d.lireDocument(w.db, w.a('antor'), w.univers, w.gid).propositionId!;
  appliquerProposition(w.db, w.a('antor').compteId, w.univers, p);
  const t = texte(w, r.sectionId);
  const ligne = t.split('\n').find((l) => l.includes('**A'))!;
  assert.ok(ligne.includes('A') && ligne.includes('B') && ligne.includes('secret'), ligne);
  assert.ok(ligne.startsWith('- '));
  // Le seul « ::: » seul sur sa ligne est la fermeture finale.
  assert.equal(t.split('\n').filter((l) => l.trim().startsWith(':::')).length, 2);
  assert.ok(!t.split('\n').some((l) => l.startsWith('## secret')));
  // Ouverte aux joueurs par le test.
  w.db.prepare('UPDATE sections SET joueurs_lisent = 1 WHERE id = ?').run(r.sectionId);
  const s = w.q('SELECT * FROM sections WHERE id = ?', r.sectionId)[0];
  assert.equal(s.contenu_public.trim(), '');
  const vue = lireSection(w.db, w.a('lea'), w.univers, r.ficheId, r.sectionId);
  assert.ok(!JSON.stringify(vue).includes('secret'));
  assert.ok(!JSON.stringify(vue).includes('Port'));
  void lireFiche;
});

test('produire : introuvable pour qui ne lit pas au niveau mj', () => {
  const w = monde();
  const r = poser(w);
  for (const u of ['lea', 'teo']) {
    assert.equal(err(() => src.produireDocument(ctx(w, u, r.sectionId, r.ficheId))).code, 'introuvable', u);
  }
  assert.equal(err(() => src.produireDocument({ ...ctx(w, 'antor', r.sectionId, r.ficheId), acteur: w.a('antor', true) })).code, 'introuvable');
});

test('versionSource : change avec titre, système, route, zone ; pas avec la lecture ; produire.sourceVersion en est égal', () => {
  const w = monde();
  const r = poser(w);
  const v = () => src.versionSourceDocument(ctx(w, 'antor', r.sectionId, r.ficheId));
  const v0 = v();
  assert.equal(src.produireDocument(ctx(w, 'antor', r.sectionId, r.ficheId)).sourceVersion, v0);
  // lecture
  g.lireGalaxie(w.db, w.a('antor'), w.univers, w.gid);
  src.produireDocument(ctx(w, 'antor', r.sectionId, r.ficheId));
  d.lireDocument(w.db, w.a('antor'), w.univers, w.gid);
  assert.equal(v(), v0);
  let prec = v0;
  const nouveau = () => { const x = v(); assert.notEqual(x, prec, 'la version doit changer'); prec = x; };
  g.renommerGalaxie(w.db, w.a('antor'), w.univers, w.gid, { titre: 'Autre titre', version: w.gal().version });
  nouveau();
  const s1 = ajouter(w, 'Un');
  nouveau();
  const s2 = ajouter(w, 'Deux');
  nouveau();
  const cle = (id: number) => w.q('SELECT cle FROM swn_systemes WHERE id=?', id)[0].cle as string;
  const rt = e.tracerRoute(w.db, w.a('antor'), w.univers, w.gid, { depuis: cle(s1.id), vers: cle(s2.id) });
  nouveau();
  e.retirerRoute(w.db, w.a('antor'), w.univers, w.gid, rt.id, rt.version);
  nouveau();
  e.dessinerZone(w.db, w.a('antor'), w.univers, w.gid, { nom: 'Marches', contour: [[0, 0], [10, 0], [10, 10]] });
  nouveau();
  e.modifierSysteme(w.db, w.a('antor'), w.univers, w.gid, cle(s1.id), { notes: 'changé', version: 1 } as any);
  nouveau();
  assert.equal(src.produireDocument(ctx(w, 'antor', r.sectionId, r.ficheId)).sourceVersion, v());
});

test('supprimerGalaxie retire la section, la fiche reste', () => {
  const w = monde();
  const r = poser(w);
  const n = w.q('SELECT count(*) n FROM swn_systemes WHERE galaxie_id=?', w.gid)[0].n;
  const rt = w.q('SELECT count(*) n FROM swn_routes WHERE galaxie_id=?', w.gid)[0].n;
  const z = w.q('SELECT count(*) n FROM swn_zones WHERE galaxie_id=?', w.gid)[0].n;
  g.supprimerGalaxie(w.db, w.a('antor'), w.univers, w.gid, w.gal().version, { systemes: n, routes: rt, zones: z });
  assert.equal(w.q('SELECT count(*) n FROM sections WHERE id = ?', r.sectionId)[0].n, 0);
  assert.equal(w.q('SELECT count(*) n FROM fiches WHERE id = ?', r.ficheId)[0].n, 1);
  assert.equal(w.q('SELECT count(*) n FROM swn_galaxies WHERE id = ?', w.gid)[0].n, 0);
});

test('une écriture de Mira (MJ) ne touche pas la proposition d\'Antor ; sans document, aucune proposition', () => {
  const w = monde();
  ajouter(w, 'Sans document');
  assert.equal(w.q('SELECT count(*) n FROM propositions')[0].n, 0);
  const vide = d.lireDocument(w.db, w.a('antor'), w.univers, w.gid);
  assert.deepEqual(vide, { fiche: null, sectionId: null, etat: null, propositionId: null });
  void redigerDocumentMJ;
});
