import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
// @ts-expect-error plain .mjs module shared with the scripts (no declaration file)
import * as inventaire from '../../scripts/inventaire-ecrans.mjs';

type Ligne = { fichier: string; test: string; classe: string; porte: string; decision: string };
const { controler, lignesInventaire, titresDeTests } = inventaire as {
  controler: (l: Ligne[], f: string[], lire: (f: string) => string | null) => string[];
  lignesInventaire: (m: string) => Ligne[];
  titresDeTests: (s: string) => string[];
};

const lire = (f: string): string | null => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const ecrans = readdirSync('src/e2e').filter((f) => f.endsWith('.test.ts')).map((f) => `src/e2e/${f}`).sort();
const lots = readdirSync('docs/tests-ecran').filter((f) => /^lot-.*\.md$/.test(f)).sort();
const lignes = lots.flatMap((f) => lignesInventaire(readFileSync(`docs/tests-ecran/${f}`, 'utf8')));

describe('inventaire des tests d’écran (docs/tests-ecran/lot-*.md)', () => {
  test('les sept lots sont là et chaque fichier de src/e2e et chacun de ses tests a une ligne, chaque porte existe', () => {
    assert.equal(lots.length, 7, `lots: ${lots.join(', ')}`);
    assert.ok(ecrans.length > 0);
    assert.deepEqual(controler(lignes, ecrans, lire), []);
  });

  test('un inventaire amputé de toutes les lignes d’un fichier échoue en le nommant', () => {
    const fichier = ecrans.find((f) => titresDeTests(lire(f) ?? '').length > 0)!;
    const fautes = controler(lignes.filter((l) => l.fichier !== fichier), ecrans, lire);
    assert.equal(fautes.length, 1);
    assert.match(fautes[0], new RegExp(`${fichier.replace(/[.]/g, '\\.')}: no line`));
  });

  test('un inventaire amputé d’une ligne échoue en nommant le test', () => {
    const f = ecrans.find((e) => titresDeTests(lire(e) ?? '').length > 0 && lignes.filter((l) => l.fichier === e).length > 1)!;
    const [premiere] = lignes.filter((l) => l.fichier === f);
    const fautes = controler(lignes.filter((l) => l !== premiere), ecrans, lire);
    assert.ok(fautes.some((m) => m.startsWith(`${f}: test «`)), fautes.join('\n'));
  });

  test('une ligne « effet » dont la porte n’existe pas, ou ne déclare pas le titre, échoue', () => {
    const effet = lignes.find((l) => l.classe === 'effet' && l.porte !== '—')!;
    const sansFichier = { ...effet, porte: '`src/routes/inexistant-xyz.test.ts` : `un test`' };
    assert.ok(controler([sansFichier], [], lire).some((m) => m.includes('does not exist')));
    const sansTitre = { ...effet, porte: '`src/scripts-tests/inventaire-ecrans.test.ts` : `un titre que personne ne déclare`' };
    assert.ok(controler([sansTitre], [], lire).some((m) => m.includes('is not declared')));
  });

  test('un effet sans porte doit être « gardé » ; une porte sous src/e2e n’est pas une porte', () => {
    const base: Ligne = { fichier: 'src/e2e/x.test.ts', test: 't', classe: 'effet', porte: '—', decision: 'retiré' };
    assert.equal(controler([base], [], lire).length, 1);
    assert.equal(controler([{ ...base, classe: 'les deux', decision: 'allégé' }], [], lire).length, 1);
    assert.deepEqual(controler([{ ...base, decision: 'gardé — no door: focus' }], [], lire), []);
    const dansEcran = { ...base, porte: '`src/e2e/harnais.test.ts` : `t`' };
    assert.ok(controler([dansEcran], [], lire).some((m) => m.includes('not an out-of-screen')));
  });

  test('la lecture des titres : littéraux, guillemets échappés, modèles gardés tels quels', () => {
    const src = "describe('d', () => { test('l\\'un', () => {}); it(\"deux\", () => {}); test(`${x} px`, () => {}) })";
    assert.deepEqual(titresDeTests(src), ["l'un", 'deux', '${x} px']);
  });
});
