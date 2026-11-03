import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { creerCompteRendu } = await import('./comptes_rendus.js');
const { creerCampagne } = await import('./campagnes.js');
const { creerFiche, listerFiches } = await import('./fiches.js');
const { ajouterMembre } = await import('./membres.js');
const { creerProposition } = await import('./propositions.js');
const { ajouterSection, ecrireContenu, lireSection } = await import('./sections.js');
const { creerEtRattacherSysteme } = await import('./systemes.js');
const { creerUnivers } = await import('./univers.js');
const { poserActivation, poserReglages, poserVisibilite, declarationOutil } = await import('./outils.js');
const { poserSectionGeree, etatGere } = await import('./sections-gerees.js');
const { catalogueDe } = await import('./assistant/catalogue.js');
const { assurerFiche } = await import('./import-fiches.js');
const { creerJeton } = await import('./jetons.js');
const { verifierDeclaration } = await import('../outils/declaration.js');
const { essai } = await import('../outils/essai/index.js');

function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string; message: string }; }
  assert.fail('aucune erreur levée');
}

/** Antor MJ, Léa joueuse, Zoé étrangère ; « Essai G » activé et visible aux deux rôles. */
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u, { nom: 'Sys' }).id;
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', true);
  poserVisibilite(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { mj: true, joueur: true });
  const fiche = creerFiche(db, antor, u, { type: 'personnage', titre: 'Aldric', charge: { pj: false } }).id;
  const pose = (extra: Record<string, unknown> = {}) =>
    poserSectionGeree(db, antor, u, {
      ficheId: fiche, outil: 'essai/g', type: 'caracteristiques', contenu: 'Texte v1', sourceVersion: 'sv1',
      audience: { joueursLisent: true, auteurId: lea, auteurLit: true, auteurEcrit: true }, ...extra,
    } as any);
  const ligne = (id: number) => db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as any;
  const acteur = (compteId: number, modeJoueur = false) => ({ compteId, ...(modeJoueur ? { modeJoueur } : {}) });
  return { db, antor, lea, zoe, u, sys, fiche, pose, ligne, acteur };
}

test('verrou : ecrireContenu sans geree → refuse section_geree pour Antor et Léa ; introuvable pour qui ne la lit pas', () => {
  const { db, antor, lea, zoe, u, fiche, pose } = monde();
  const s = pose();
  for (const c of [antor, lea]) {
    const e = err(() => ecrireContenu(db, c, u, fiche, s.id, 'Pirate', 1));
    assert.deepEqual([e.code, e.detail], ['refuse', 'section_geree'], `compte ${c}`);
  }
  assert.equal(err(() => ecrireContenu(db, zoe, u, fiche, s.id, 'Pirate', 1)).code, 'introuvable');
  // Section MJ seul (pas de lecture joueur, pas d'autrice) : introuvable pour Léa.
  const mj = pose({ type: 'notes', audience: {} });
  assert.equal(err(() => ecrireContenu(db, lea, u, fiche, mj.id, 'Pirate', 1)).code, 'introuvable');
  assert.equal(err(() => lireSection(db, { compteId: lea }, u, fiche, mj.id)).code, 'introuvable');
  assert.equal((db.prepare('SELECT contenu FROM sections WHERE id = ?').get(s.id) as any).contenu, 'Texte v1');
});

test('verrou : une section libre est inchangée', () => {
  const { db, antor, lea, u, fiche } = monde();
  const libre = ajouterSection(db, antor, u, fiche, { titre: 'Libre', contenu: 'a' });
  assert.equal(ecrireContenu(db, antor, u, fiche, libre.id, 'b', 1).version, 2);
  const e = err(() => ecrireContenu(db, lea, u, fiche, libre.id, 'c', 2));
  assert.notEqual(e.detail, 'section_geree');
});

test('verrou : mauvaise version de la section libre → conflit, pas section_geree (ordre des gardes)', () => {
  const { db, antor, u, fiche } = monde();
  const libre = ajouterSection(db, antor, u, fiche, { titre: 'Libre', contenu: 'a' });
  assert.equal(err(() => ecrireContenu(db, antor, u, fiche, libre.id, 'b', 9)).code, 'conflit');
});

test('verrou : l\'assistant (modifier_section, ajouter_a_section) et creerProposition refusent, rien n\'est écrit', () => {
  const { db, antor, u, fiche, pose, ligne } = monde();
  const s = pose();
  const outils = catalogueDe(db, antor, u).outils;
  for (const [nom, args] of [
    ['modifier_section', { ficheId: fiche, sectionId: s.id, contenu: 'X', version: 1 }],
    ['ajouter_a_section', { ficheId: fiche, sectionId: s.id, texte: 'X', version: 1 }],
  ] as const) {
    const r: any = outils.find((o) => o.nom === nom)!.executer(args);
    assert.equal(r.ok, false, nom);
    assert.equal(r.evenement, undefined, nom);
  }
  const camp = creerCampagne(db, antor, u, { nom: 'C' });
  const cr = creerCompteRendu(db, antor, u, camp.id, { titre: 'S1', texte: 't' });
  const e = err(() => creerProposition(db, antor, u, { sectionId: s.id, crId: cr.id, contenu: 'X', version: 1 }));
  assert.deepEqual([e.code, e.detail], ['refuse', 'section_geree']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propositions').get().n, 0);
  assert.equal(ligne(s.id).contenu, 'Texte v1');
  assert.equal(ligne(s.id).version, 1);
});

test('verrou : l\'import refuse (champ sections[i], code section_geree) avant la transaction', () => {
  const { db, antor, u, fiche, pose } = monde();
  const s = pose();
  db.prepare("UPDATE fiches SET cle_origine = 'f:aldric' WHERE id = ?").run(fiche);
  db.prepare("UPDATE sections SET cle_origine = 's:car' WHERE id = ?").run(s.id);
  const { jeton } = creerJeton(db, antor, u, { nom: 't', dureeJours: 7 });
  const avant = db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(s.id);
  let r: any;
  try {
    r = assurerFiche(db, jeton, null, 'f:aldric', {
      type: 'personnage', titre: 'Aldric', sections: [
        { cle: 's:autre', titre: 'Autre', contenu: 'ok' },
        { cle: 's:car', titre: 'Caractéristiques', contenu: 'Pirate' },
      ],
    });
  } catch (e: any) { r = e; }
  const dump = JSON.stringify(r, Object.getOwnPropertyNames(r ?? {}));
  assert.match(dump, /section_geree/);
  assert.match(dump, /sections\[1\]/);
  assert.deepEqual(db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(s.id), avant);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE titre = 'Autre'").get().n, 0, 'rien écrit avant la transaction');
});

test('poserSectionGeree : crée avec Léa autrice au nom d\'Antor ; réécrit au nom d\'Antor une section dont Léa est l\'autrice', () => {
  const { db, antor, lea, u, fiche, pose, ligne } = monde();
  const s = pose({ titre: undefined });
  assert.equal(s.titre, 'Caractéristiques');
  const row = ligne(s.id);
  assert.deepEqual(
    [row.auteur_id, row.auteur_lit, row.auteur_ecrit, row.gere_par, row.source_version, row.joueurs_lisent, row.joueurs_ecrivent],
    [lea, 1, 1, 'essai/g/caracteristiques', 'sv1', 1, 0],
  );
  const v = poserSectionGeree(db, antor, u, {
    ficheId: fiche, outil: 'essai/g', type: 'caracteristiques', sectionId: s.id, contenu: 'Texte v2',
    sourceVersion: 'sv2', version: 1,
  });
  assert.equal(v.version, 2);
  const r2 = ligne(s.id);
  assert.deepEqual([r2.contenu, r2.source_version, r2.auteur_id, r2.gere_par], ['Texte v2', 'sv2', lea, 'essai/g/caracteristiques']);
  // Mauvaise version → conflit, source_version intacte.
  const e = err(() => poserSectionGeree(db, antor, u, {
    ficheId: fiche, outil: 'essai/g', type: 'caracteristiques', sectionId: s.id, contenu: 'v3', sourceVersion: 'sv3', version: 1,
  }));
  assert.equal(e.code, 'conflit');
  assert.equal(ligne(s.id).source_version, 'sv2');
});

test('poserSectionGeree : sans l\'usage « concevoir » refuse ; outil désactivé ou invisible introuvable ; type inconnu introuvable', () => {
  const { db, antor, lea, u, sys, fiche, pose } = monde();
  const entree = { ficheId: fiche, outil: 'essai/g', type: 'caracteristiques', contenu: 'x', sourceVersion: 's' };
  assert.equal(err(() => poserSectionGeree(db, lea, u, entree)).code, 'refuse');
  assert.equal(err(() => poserSectionGeree(db, antor, u, { ...entree, type: 'inconnu' })).code, 'introuvable');
  assert.equal(err(() => poserSectionGeree(db, antor, u, { ...entree, outil: 'essai/zzz' })).code, 'introuvable');
  const s = pose();
  poserVisibilite(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { mj: false });
  assert.equal(err(() => poserSectionGeree(db, antor, u, entree)).code, 'introuvable');
  poserVisibilite(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { mj: true });
  poserActivation(db, antor, { niveau: 'univers', id: u }, 'essai/g', false);
  assert.equal(err(() => poserSectionGeree(db, antor, u, entree)).code, 'introuvable');
  assert.equal(err(() => poserSectionGeree(db, antor, u, { ...entree, sectionId: s.id, version: 1 })).code, 'introuvable');
});

test('poserSectionGeree : bloc :::mj pour un compte non MJ refusé ; contenu vide, auteur non joueur invalides', () => {
  const { db, antor, lea, u, fiche, pose, ligne } = monde();
  const s = pose();
  const e = err(() => poserSectionGeree(db, lea, u, {
    ficheId: fiche, outil: 'essai/g', type: 'caracteristiques', sectionId: s.id, sourceVersion: 'x', version: 1,
    contenu: 'a\n\n:::mj\nsecret\n:::\n',
  }));
  assert.notEqual(e.code, undefined);
  assert.equal(ligne(s.id).contenu, 'Texte v1');
  assert.equal(err(() => pose({ type: 'notes', contenu: '   ' })).code, 'invalide');
  assert.equal(err(() => pose({ type: 'notes', audience: { auteurId: antor } })).code, 'invalide');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sections WHERE gere_par = 'essai/g/notes'").get().n, 0);
  // Un MJ peut écrire un bloc :::mj : contenu_public le retire.
  const m = pose({ type: 'notes', contenu: 'pub\n\n:::mj\nsecret\n:::\n', audience: { joueursLisent: true } });
  const r = ligne(m.id);
  assert.ok(!r.contenu_public.includes('secret'));
});

test('etatGere : a_jour, perime après un réglage (rien de stocké), desactive, libelle null, jamais de source', () => {
  const { db, antor, lea, zoe, u, sys, fiche, pose, ligne, acteur } = monde();
  const { versionSource } = essai.outils.find((o) => o.cle === 'essai/g')!.sections![0]!;
  const sv = versionSource({ db, acteur: acteur(antor), universId: u, ficheId: fiche, sectionId: null });
  const s = pose({ sourceVersion: sv });
  const avant = ligne(s.id);
  let g = etatGere(db, acteur(antor), u, ligne(s.id))!;
  assert.equal(g.etat, 'a_jour');
  assert.equal(g.libelle, 'Essai G');
  assert.equal(g.outil, 'essai/g');
  assert.ok(g.lien?.includes('essai/g'));
  poserReglages(db, antor, { niveau: 'univers', id: u }, 'essai/g', { version: 0, valeurs: { marge: 25 } });
  g = etatGere(db, acteur(antor), u, ligne(s.id))!;
  assert.equal(g.etat, 'perime');
  assert.equal(etatGere(db, acteur(lea), u, ligne(s.id))!.etat, 'perime');
  const apres = ligne(s.id);
  assert.deepEqual([apres.contenu, apres.version, apres.source_version], [avant.contenu, avant.version, avant.source_version]);
  // Vue : pas de source, pas de droit d'écriture, pour tous.
  for (const c of [antor, lea]) {
    const v = lireSection(db, { compteId: c }, u, fiche, s.id);
    assert.equal(v.peutEcrire, false);
    assert.equal(v.contenu, undefined);
    assert.ok(!('contenu' in v), 'aucun source dans la vue');
  }
  assert.equal(etatGere(db, acteur(zoe), u, ligne(s.id))?.etat === 'perime', false);
  // Outil non visible du lecteur : pas de nom.
  poserVisibilite(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', { joueur: false });
  g = etatGere(db, acteur(lea), u, ligne(s.id))!;
  assert.equal(g.libelle, null);
  assert.equal(g.lien, null);
  assert.equal(etatGere(db, acteur(antor), u, ligne(s.id))!.libelle, 'Essai G');
  // Désactivé : desactive, sans nom ni lien.
  poserActivation(db, antor, { niveau: 'univers', id: u }, 'essai/g', false);
  g = etatGere(db, acteur(antor), u, ligne(s.id))!;
  assert.deepEqual([g.etat, g.libelle, g.lien, g.outil], ['desactive', null, null, null]);
  // Section libre : null.
  const libre = ajouterSection(db, antor, u, fiche, { titre: 'L', contenu: 'a' });
  assert.equal(etatGere(db, acteur(antor), u, ligne(libre.id)), null);
});

test('l\'activation ne périme pas : désactiver puis réactiver ramène a_jour', () => {
  const { db, antor, u, fiche, pose, ligne, acteur } = monde();
  const g0 = essai.outils.find((o) => o.cle === 'essai/g')!.sections![0]!;
  const s = pose({ sourceVersion: g0.versionSource({ db, acteur: acteur(antor), universId: u, ficheId: fiche, sectionId: null }) });
  poserActivation(db, antor, { niveau: 'univers', id: u }, 'essai/g', false);
  poserActivation(db, antor, { niveau: 'univers', id: u }, 'essai/g', null);
  assert.equal(etatGere(db, acteur(antor), u, ligne(s.id))!.etat, 'a_jour');
});

test('la recherche trouve le texte d\'une section gérée ; MJ seul reste caché à Léa', () => {
  const { db, antor, lea, u, pose, fiche } = monde();
  pose({ contenu: 'Vigueur zorglub' });
  pose({ type: 'notes', contenu: 'secretissime quibble', audience: {} });
  const trouve = (c: number, q: string) => listerFiches(db, { compteId: c }, u, { recherche: q }).fiches.map((f: any) => f.id);
  assert.deepEqual(trouve(antor, 'zorglub'), [fiche]);
  assert.deepEqual(trouve(lea, 'zorglub'), [fiche]);
  assert.deepEqual(trouve(antor, 'quibble'), [fiche]);
  assert.deepEqual(trouve(lea, 'quibble'), []);
});

test('chaque section déclarée : versionSource et produire s\'accordent ; la déclaration passe sa vérification', () => {
  const { db, antor, u, fiche, acteur } = monde();
  verifierDeclaration(essai);
  const ctx = { db, acteur: acteur(antor), universId: u, ficheId: fiche, sectionId: null };
  let n = 0;
  for (const o of essai.outils) {
    if (o.type !== 'generateur') continue;
    for (const s of o.sections ?? []) {
      n++;
      assert.equal(s.produire(ctx).sourceVersion, s.versionSource(ctx), s.type);
      assert.equal(typeof s.produire(ctx).contenu, 'string');
      poserReglages(db, antor, { niveau: 'univers', id: u }, 'essai/g', { version: n - 1, valeurs: { marge: 40 + n } });
      assert.equal(s.produire(ctx).sourceVersion, s.versionSource(ctx), `${s.type} après réglage`);
    }
  }
  assert.equal(n, 2);
  assert.deepEqual(declarationOutil('essai/g').type, 'generateur');
});

test('la vérification refuse une section mal déclarée', () => {
  const g = essai.outils.find((o) => o.cle === 'essai/g') as any;
  const avec = (sections: unknown[]) => ({ ...essai, outils: essai.outils.map((o) => (o === g ? { ...g, sections } : o)) });
  const [a] = g.sections;
  assert.throws(() => verifierDeclaration(avec([a, { ...a }]) as any), /Duplicate section/);
  assert.throws(() => verifierDeclaration(avec([{ ...a, usage: 'inconnu' }]) as any), /Unknown usage/);
  assert.throws(() => verifierDeclaration(avec([{ ...a, recalcul: 'autre' }]) as any));
  assert.throws(() => verifierDeclaration(avec([{ ...a, type: 'Mauvais Type' }]) as any));
  const aide = { ...essai, outils: essai.outils.map((o) => (o.type === 'aide' ? { ...o, sections: [a] } : o)) };
  assert.throws(() => verifierDeclaration(aide as any), /Only a generator/);
});

test('seul services/sections-gerees.ts passe geree à ecrireContenu', () => {
  const racine = new URL('..', import.meta.url).pathname;
  const fichiers: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) fichiers.push(p);
    }
  };
  parcourir(racine);
  const appelants = fichiers.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return /ecrireContenu\s*\(/.test(src) && /sourceVersion\s*:/.test(src) && !f.endsWith('services/sections.ts');
  });
  assert.deepEqual(appelants.map((f) => f.slice(racine.length)), ['services/sections-gerees.ts']);
});

test('migration 0018 sur une base au schéma 0017 : sections et propositions conservées, cr_id gardé', () => {
  const dir = new URL('../db/migrations/', import.meta.url).pathname;
  const tous = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const f18 = tous.find((f) => f.startsWith('0018'))!;
  // Copie des migrations jusqu'à 0017 dans un dossier temporaire.
  const t = mkdtempSync(join(tmpdir(), 'mig-')) + '/';
  try {
    for (const f of tous.filter((x) => x < f18)) copyFileSync(join(dir, f), join(t, f));
    const db = openDb(':memory:');
    migrate(db, t);
    const antor = assurerCompte(db, 'antor').id;
    const u = creerUnivers(db, antor, { nom: 'U' }).id;
    const fiche = creerFiche(db, antor, u, { type: 'personnage', titre: 'A', charge: { pj: false } }).id;
    const s = ajouterSection(db, antor, u, fiche, { titre: 'V', contenu: 'Texte' });
    const camp = creerCampagne(db, antor, u, { nom: 'C' });
    const cr = creerCompteRendu(db, antor, u, camp.id, { titre: 'S', texte: 't' });
    creerProposition(db, antor, u, { sectionId: s.id, crId: cr.id, contenu: 'Propose', version: 1 });
    const avantS = db.prepare('SELECT * FROM sections ORDER BY id').all();
    const avantP = db.prepare('SELECT * FROM propositions ORDER BY id').all() as any[];
    assert.equal(avantP.length, 1);
    copyFileSync(join(dir, f18), join(t, f18));
    assert.equal(migrate(db, t).length, 1, 'une seule migration appliquée : 0018');
    const apresS = db.prepare('SELECT * FROM sections ORDER BY id').all() as any[];
    assert.equal(apresS.length, avantS.length);
    for (const [i, a] of (avantS as any[]).entries()) {
      for (const k of Object.keys(a)) assert.deepEqual(apresS[i][k], a[k], `sections.${k}`);
      assert.equal(apresS[i].gere_par, null);
      assert.equal(apresS[i].source_version, null);
    }
    const apresP = db.prepare('SELECT * FROM propositions ORDER BY id').all() as any[];
    assert.equal(apresP.length, 1);
    for (const k of Object.keys(avantP[0])) assert.deepEqual(apresP[0][k], avantP[0][k], `propositions.${k}`);
    assert.equal(apresP[0].cr_id, cr.id);
    assert.equal(apresP[0].source_version, null);
    // cr_id nullable : une proposition de recalcul (cr_id null + source_version) passe, l'inverse non.
    const ins = (cr_id: number | null, sv: string | null) =>
      db.prepare(`INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le, source_version)
        VALUES (?, ?, ?, ?, 'x', 1, 'now', ?)`).run(u, antor, s.id, cr_id, sv);
    assert.throws(() => ins(null, null));
    assert.throws(() => ins(cr.id, 'sv'));
    // Un seul en attente par (demandeur, section) : l'index unique survit.
    assert.throws(() => ins(cr.id, null));
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { rmSync(t, { recursive: true, force: true }); }
});
