import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
import type { DeclarationAide, DeclarationGenerateur, DeclarationModule } from './declaration.js';

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('../services/comptes.js');
const { ajouterMembre } = await import('../services/membres.js');
const { creerEtRattacherSysteme } = await import('../services/systemes.js');
const { creerUnivers } = await import('../services/univers.js');
const { applicable, verifierDeclaration } = await import('./declaration.js');
const { modulesActifs, verifierRegistre } = await import('./registre.js');
const { essai } = await import('./essai/index.js');
const { exigerUsage, listerCartesOutil, peutUsage, poserActivation, declarationOutil } =
  await import('../services/outils.js');

const base = { portee: 'tous' as const, dependances: [], visibiliteParDefaut: { mj: true, joueur: true },
  usages: [], reglages: {}, ecran: { libelle: 'X', icone: 'Map' }, description: 'd' };
const aide = (cle: string, plus: Partial<DeclarationAide> = {}): DeclarationAide =>
  ({ ...base, cle, libelle: cle, type: 'aide', ...plus });
const module = (outils: DeclarationAide[], plus: Partial<DeclarationModule> = {}): DeclarationModule =>
  ({ nom: 'm', libelle: 'M', reglagesCommuns: {}, outils, ...plus });
const refus = (m: DeclarationModule, motif?: RegExp) => assert.throws(() => verifierDeclaration(m), motif);
const reglage = (forme: any, defaut: any) => ({ libelle: 'R', niveau: 'univers' as const, forme, defaut });

test('verifierDeclaration accepte le module d\'essai et une déclaration minimale', () => {
  verifierDeclaration(essai);
  verifierDeclaration(module([aide('m/a'), aide('m/b', { dependances: ['m/a'] })]));
  verifierRegistre();
});

test('verifierDeclaration refuse une clé en double', () => {
  refus(module([aide('m/a'), aide('m/a')]), /duplicate/i);
});
test('verifierDeclaration refuse une clé hors du préfixe du module', () => {
  refus(module([aide('autre/a')]));
});
test('verifierDeclaration refuse une dépendance inconnue', () => {
  refus(module([aide('m/a', { dependances: ['m/zzz'] })]), /unknown dependency/i);
});
test('verifierDeclaration refuse une dépendance sur soi et un cycle', () => {
  refus(module([aide('m/a', { dependances: ['m/a'] })]), /cyclic/i);
  refus(module([aide('m/a', { dependances: ['m/b'] }), aide('m/b', { dependances: ['m/c'] }),
    aide('m/c', { dependances: ['m/a'] })]), /cyclic/i);
});
test('verifierDeclaration accepte un losange (pas un cycle)', () => {
  verifierDeclaration(module([aide('m/a'), aide('m/b', { dependances: ['m/a'] }),
    aide('m/c', { dependances: ['m/a'] }), aide('m/d', { dependances: ['m/b', 'm/c'] })]));
});
test('verifierDeclaration refuse un défaut hors de sa forme', () => {
  const cas: [any, any][] = [
    [{ type: 'booleen' }, 1], [{ type: 'booleen' }, 'true'],
    [{ type: 'nombre', min: 0, max: 10 }, 11], [{ type: 'nombre', min: 0, max: 10 }, -1],
    [{ type: 'nombre', min: 0, max: 10 }, '5'], [{ type: 'nombre', min: 0, max: 10, entier: true }, 2.5],
    [{ type: 'texte', max: 3 }, 'abcd'], [{ type: 'texte', max: 3 }, 3],
    [{ type: 'choix', valeurs: ['a', 'b'] }, 'c'],
  ];
  for (const [forme, defaut] of cas) {
    refus(module([aide('m/a', { reglages: { r: reglage(forme, defaut) } })]));
    refus(module([aide('m/a')], { reglagesCommuns: { r: reglage(forme, defaut) } }));
  }
  // bornes incluses acceptées
  verifierDeclaration(module([aide('m/a', { reglages: { r: reglage({ type: 'nombre', min: 0, max: 10 }, 10) } })]));
});
test('verifierDeclaration refuse une forme incohérente ou un champ inconnu', () => {
  refus(module([aide('m/a', { reglages: { r: reglage({ type: 'nombre', min: 5, max: 1 }, 3) } })]));
  refus(module([aide('m/a', { reglages: { r: reglage({ type: 'choix', valeurs: [] }, 'a') } })]));
  refus(module([aide('m/a', { reglages: { r: reglage({ type: 'inconnue' }, 1) } })]));
  refus(module([aide('m/a', { ...({ surprise: 1 } as object) })]));
  refus({ ...module([aide('m/a')]), nom: 'Pas Valide' });
});

test('portée par noms : comparaison après trim et pliage de casse', () => {
  const o = aide('m/a', { portee: { noms: ['  Stars Without Number '] } });
  assert.equal(applicable(o, 'stars without number'), true);
  assert.equal(applicable(o, ' STARS WITHOUT NUMBER  '), true);
  assert.equal(applicable(o, 'Stars Without Numbers'), false);
  assert.equal(applicable(aide('m/b'), 'Quoi que ce soit'), true);
});

test('registre : le module d\'essai n\'existe qu\'en test ou sous KANEVAS_STUB', () => {
  assert.deepEqual(modulesActifs().map((m) => m.nom), ['essai', 'swn']);
  assert.throws(() => verifierRegistre([essai, essai]), /duplicate/i);
  const code = `const m = await import('./src/outils/registre.js'); console.log(JSON.stringify(m.modulesActifs().map(x => x.nom)));`;
  const lancer = (env: Record<string, string>) => {
    const base: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(NODE_ENV|KANEVAS_STUB|OIDC_)/.test(k)) base[k] = v;
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code],
      { env: { ...base, ...env }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split('\n').pop()!);
  };
  assert.deepEqual(lancer({ NODE_ENV: 'production' }), []);
  assert.deepEqual(lancer({ NODE_ENV: 'development' }), []);
  assert.deepEqual(lancer({ NODE_ENV: 'development', KANEVAS_STUB: '1' }), ['essai', 'swn']);
  assert.deepEqual(lancer({ NODE_ENV: 'test' }), ['essai', 'swn']);
});

// --- un test par type de contrat : la déclaration seule, sans toucher routeur ni barre ---

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'U' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  creerEtRattacherSysteme(db, antor.id, u.id, { nom: 'Sys' });
  return { db, antor, lea, u };
}

const cle = (c: string) => declarationOutil(c);
test('contrat carte : la déclaration seule donne ses {id, titre, visible} ; un joueur ne reçoit que les visibles', () => {
  const { db, antor, lea, u } = monde();
  assert.equal(cle('essai/a').type, 'carte');
  poserActivation(db, antor.id, { niveau: 'univers', id: u.id }, 'essai/a', true);
  assert.deepEqual(listerCartesOutil(db, { compteId: antor.id }, u.id, 'essai/a'),
    [{ id: 1, titre: 'Carte visible', visible: true }, { id: 2, titre: 'Carte MJ', visible: false }]);
  assert.deepEqual(listerCartesOutil(db, { compteId: lea.id }, u.id, 'essai/a'), [{ id: 1, titre: 'Carte visible', visible: true }]);
  // MJ en mode Joueur : lu comme un joueur
  assert.deepEqual(listerCartesOutil(db, { compteId: antor.id, modeJoueur: true }, u.id, 'essai/a'),
    [{ id: 1, titre: 'Carte visible', visible: true }]);
  // un outil qui n'est pas une carte n'a pas de cartes
  poserActivation(db, antor.id, { niveau: 'univers', id: u.id }, 'essai/g', true);
  assert.throws(() => listerCartesOutil(db, { compteId: antor.id }, u.id, 'essai/g'), { code: 'introuvable' });
});
test('contrat générateur : l\'usage « concevoir » est offert au MJ seul', () => {
  const { db, antor, lea, u } = monde();
  const g = cle('essai/g') as DeclarationGenerateur;
  assert.equal(g.type, 'generateur');
  assert.ok(g.usages.some((x) => x.nom === 'concevoir'));
  poserActivation(db, antor.id, { niveau: 'univers', id: u.id }, 'essai/g', true);
  assert.equal(peutUsage(db, { compteId: antor.id }, u.id, 'essai/g', 'concevoir'), true);
  assert.equal(peutUsage(db, { compteId: antor.id, modeJoueur: true }, u.id, 'essai/g', 'concevoir'), false);
  assert.equal(peutUsage(db, { compteId: lea.id }, u.id, 'essai/g', 'concevoir'), false);
  assert.equal(peutUsage(db, { compteId: antor.id }, u.id, 'essai/g', 'inconnu'), false);
  assert.throws(() => exigerUsage(db, { compteId: lea.id }, u.id, 'essai/g', 'concevoir'), { code: 'refuse' });
  exigerUsage(db, { compteId: antor.id }, u.id, 'essai/g', 'concevoir');
});
test('contrat aide : a son point d\'entrée (écran) et se retrouve par sa seule déclaration', () => {
  const b = cle('essai/b') as DeclarationAide;
  assert.equal(b.type, 'aide');
  assert.deepEqual(b.ecran, { libelle: 'Essai B', icone: 'BookOpen' });
  assert.throws(() => cle('essai/inconnu'), { code: 'introuvable' });
});
