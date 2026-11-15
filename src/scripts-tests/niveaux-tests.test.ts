import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
// @ts-expect-error plain .mjs module shared with the scripts (no declaration file)
import * as niveaux from '../../scripts/niveaux-tests.mjs';

const { choisirFichiers, decouperTests, nomPropre, trouverFichiers, resoudre, motif } = niveaux as {
  choisirFichiers: (f: string[], o?: { local?: boolean }) => string[];
  decouperTests: (a: string[]) => string[];
  nomPropre: (n: string) => string;
  trouverFichiers: (n: string, f: string[], lire: (f: string) => string) => string[];
  resoudre: (a: string[], f: string[], lire: (f: string) => string) => { parFichier: Map<string, Set<string>>; introuvables: string[] };
  motif: (n: string) => string;
};

const FICHIERS = ['src/e2e/a.test.ts', 'src/routes/b.test.ts', 'src/services/c.test.ts', 'src/services/c.ts', 'frontend/src/d.test.ts'];
const SOURCES: Record<string, string> = {
  'src/routes/b.test.ts': "test('liste les fiches', () => {})",
  'src/services/c.test.ts': "describe('x', () => { test('crée une fiche', () => {}) })",
  'src/e2e/a.test.ts': "test('écran', () => {})",
  'frontend/src/d.test.ts': '',
};
const lire = (f: string) => SOURCES[f] ?? '';

describe('niveaux de la suite', () => {
  test('la suite entière garde tous les fichiers de test', () => {
    assert.equal(choisirFichiers(FICHIERS).length, 4);
  });
  test('--local écarte src/e2e/ et les fichiers qui ne sont pas des tests', () => {
    assert.deepEqual(choisirFichiers(FICHIERS, { local: true }), [
      'frontend/src/d.test.ts', 'src/routes/b.test.ts', 'src/services/c.test.ts',
    ]);
  });
});

describe('rejouer-tests', () => {
  test('un nom à espaces reste un seul nom, le | et les fins de ligne séparent', () => {
    assert.deepEqual(decouperTests(['a b > c d']), ['a b > c d']);
    assert.deepEqual(decouperTests(['a b', 'c']), ['a b', 'c']);
    assert.deepEqual(decouperTests(['a|b\nc']), ['a', 'b', 'c']);
  });
  test('le nom propre est le dernier segment de « describe > test »', () => {
    assert.equal(nomPropre('x > crée une fiche'), 'crée une fiche');
    assert.equal(nomPropre('crée une fiche'), 'crée une fiche');
  });
  test('les fichiers sont retrouvés par le nom', () => {
    assert.deepEqual(trouverFichiers('x > crée une fiche', choisirFichiers(FICHIERS), lire), ['src/services/c.test.ts']);
    assert.deepEqual(trouverFichiers('inconnu', choisirFichiers(FICHIERS), lire), []);
  });
  test('un nom introuvable est rendu tel quel', () => {
    const r = resoudre(['liste les fiches', 'nulle part'], choisirFichiers(FICHIERS), lire);
    assert.deepEqual([...r.parFichier.keys()], ['src/routes/b.test.ts']);
    assert.deepEqual(r.introuvables, ['nulle part']);
  });
  test('des noms à espaces passés en arguments séparés retombent sur un par un', () => {
    const r = resoudre(['liste les fiches', 'x > crée une fiche'], choisirFichiers(FICHIERS), lire);
    assert.equal(r.parFichier.size, 2);
    assert.deepEqual(r.introuvables, []);
  });
  test('le motif échappe la regex', () => {
    assert.ok(new RegExp(motif('a (b) [c]')).test('a (b) [c]'));
    assert.ok(!new RegExp(motif('a.c')).test('abc'));
  });
});
