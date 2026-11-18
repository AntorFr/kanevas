// Besoin « kanevas-tests-hors-ecran » (R25 : l'effet par sa porte, l'affichage à l'écran), relu depuis la fiche :
//  - chaque test d'écran est classé (affichage / effet / les deux) dans l'inventaire du dépôt ;
//  - aucun attendu d'affichage n'est retiré : seul un test « effet » (dont la porte hors écran existe) disparaît ;
//  - la durée des tests d'écran avant/après est dite dans le README.
// Les attendus sont écrits en dur (275 fichiers avant, 19 retirés, 256 restants, 4 904,5 s avant, 3 651,0 s après).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
// @ts-expect-error plain .mjs module shared with the scripts (no declaration file)
import * as inventaire from '../../scripts/inventaire-ecrans.mjs';

type Ligne = { fichier: string; test: string; classe: string; porte: string; decision: string };
const { lignesInventaire, titresDeTests, portesDe } = inventaire as {
  lignesInventaire: (m: string) => Ligne[];
  titresDeTests: (s: string) => string[];
  portesDe: (c: string) => unknown[];
};

const lire = (f: string): string => readFileSync(f, 'utf8');
const lots = readdirSync('docs/tests-ecran').filter((f) => /^lot-.*\.md$/.test(f)).sort();
const lignes: Ligne[] = lots.flatMap((f) => lignesInventaire(lire(`docs/tests-ecran/${f}`)));
const decision = (l: Ligne): string => l.decision.split(/[ —]/)[0];
// Un titre est « encore à l'écran » s'il est déclaré en littéral (describe/test/it ou le helper `cas`), ou, pour un test
// engendré par une boucle ou un helper, si son dernier segment figure entre guillemets dans le fichier.
const HELPERS = /(?<![.\w$])cas\(\s*(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const declare = (l: Ligne): boolean => {
  if (!existsSync(l.fichier)) return false;
  const src = lire(l.fichier);
  const titres = [...titresDeTests(src), ...[...src.matchAll(HELPERS)].map((m) => m[2].replace(/\\(['"`\\])/g, '$1'))];
  if (titres.some((t) => l.test === t || l.test.endsWith(` > ${t}`))) return true;
  const dernier = l.test.split(' > ').pop()!;
  return [`'${dernier}'`, `"${dernier}"`, `\`${dernier}\``].some((q) => src.includes(q));
};
const espaces = (s: string): string => s.replace(/[\s ]+/g, ' ');

describe('tests d’écran hors écran (R25) : inventaire des lots', () => {
  test('chaque ligne a une classe et une décision du vocabulaire de la règle', () => {
    assert.ok(lignes.length > 2000, `lignes: ${lignes.length}`);
    for (const l of lignes) {
      assert.ok(['affichage', 'effet', 'les deux'].includes(l.classe), `${l.fichier}: classe « ${l.classe} »`);
      assert.ok(['gardé', 'allégé', 'retiré', 'scindé'].includes(decision(l)), `${l.fichier}: « ${l.test} » décision « ${l.decision} »`);
    }
  });

  test('aucun test d’affichage, ni test « les deux », n’est retiré de l’écran : il y est encore déclaré', () => {
    const fautes = lignes
      .filter((l) => l.classe !== 'effet')
      .filter((l) => decision(l) === 'retiré' || !declare(l))
      .map((l) => `${l.fichier}: « ${l.test} » (${l.classe}, ${decision(l)})`);
    assert.deepEqual(fautes, []);
  });

  test('la décision dit vrai : « retiré » = plus déclaré à l’écran, les autres = encore déclaré', () => {
    const fautes = lignes
      .filter((l) => (decision(l) === 'retiré') === declare(l))
      .map((l) => `${l.fichier}: « ${l.test} » (${decision(l)}, déclaré: ${declare(l)})`);
    assert.deepEqual(fautes, []);
  });

  test('un test retiré de l’écran avait une porte hors écran nommée', () => {
    const fautes = lignes.filter((l) => decision(l) === 'retiré' && portesDe(l.porte).length === 0).map((l) => `${l.fichier}: « ${l.test} »`);
    assert.deepEqual(fautes, []);
  });
});

describe('tests d’écran hors écran (R25) : les 19 fichiers retirés et la durée avant/après', () => {
  const apres = lire('docs/tests-ecran/apres.md');
  const avant = lire('docs/tests-ecran/avant.md');
  const readme = espaces(lire('README.md'));
  const retires = [...apres.split('## The 19 removed files')[1].split('## Per file')[0].matchAll(/^\| `(src\/e2e\/[^`]+)` \|/gm)].map((m) => m[1]);

  test('19 fichiers retirés : absents de src/e2e, présents dans avant.md, toutes leurs lignes « retiré » ; 264 restent', () => {
    assert.equal(retires.length, 19);
    const ecrans = readdirSync('src/e2e').filter((f) => f.endsWith('.test.ts'));
    assert.equal(ecrans.length, 264);
    for (const f of retires) {
      assert.equal(existsSync(f), false, `${f} existe encore`);
      assert.ok(avant.includes(`\`${f}\``), `${f} absent de avant.md`);
      const siennes = lignes.filter((l) => l.fichier === f);
      assert.ok(siennes.length > 0, `${f}: aucune ligne d’inventaire`);
      assert.deepEqual(siennes.filter((l) => decision(l) !== 'retiré').map((l) => l.test), []);
    }
  });

  test('avant.md : 275 fichiers, 4904.5 s ; apres.md : 256 fichiers, 3651.0 s', () => {
    assert.match(avant, /Screen files[^\n]*\*\*275\*\*/);
    assert.match(avant, /Total, sum of the screen files\*\* \| \*\*4904\.5 s/);
    assert.match(apres, /Screen files[^\n]*\*\*256\*\*/);
    assert.match(apres, /Total, sum of the screen files\*\* \| \*\*3651\.0 s/);
  });

  test('le README dit les deux durées, le nombre de fichiers, la machine et la concurrence', () => {
    assert.match(readme, /before 4 904\.5 s \(81\.7 min, 275 files\)/);
    assert.match(readme, /after 3 651\.0 s \(60\.9 min, 256 files\)/);
    assert.match(readme, /two files at a time/);
    assert.match(readme, /i5-13500/);
    assert.match(readme, /docs\/tests-ecran\//);
  });
});
