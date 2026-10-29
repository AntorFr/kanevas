// Tests of the merged tree of kanevas-fiches-liees-rattrapage, from the task's exit criterion and notes:
// "no conflict marker in the tree"; "ADs in order, no duplicate number"; `main`'s AD-128 keeps its
// number and its text, the epic's are shifted by one (129 natures, 130 search, 131 "Fiches liées", 132 "gone",
// 133 Famille, 134 import). The expected values are the literals of the renumbering decision.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const ARCHI = readFileSync('ARCHITECTURE.md', 'utf8');
const lignesAd = ARCHI.split('\n').filter((l) => /^\| AD-\d+ \|/.test(l));
const ad = (n: number) => lignesAd.find((l) => l.startsWith(`| AD-${n} |`)) ?? '';

describe('kanevas-fiches-liees-rattrapage, l’arbre fusionné', () => {
  // Failure aimed at: a conflict marker forgotten in a tracked file.
  test('aucune marque de conflit dans les fichiers suivis', { skip: existsSync('.git') ? false : 'pas de dépôt git ici' }, () => {
    let sortie = '';
    try {
      sortie = execFileSync('git', ['grep', '-nE', '^(<<<<<<< |>>>>>>> |=======$)', '--', '.', ':!package-lock.json', ':!*.test.ts'], { encoding: 'utf8' });
    } catch (e) {
      // git grep exits 1 when nothing matches
      if ((e as { status?: number }).status !== 1) throw e;
    }
    assert.equal(sortie, '');
  });

  // Failure aimed at: two ADs carry the same number after the merge.
  test('chaque numéro d’AD ne porte qu’une ligne dans ARCHITECTURE.md', () => {
    const numeros = lignesAd.map((l) => /^\| (AD-\d+) \|/.exec(l)![1]);
    const doublons = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    assert.deepEqual(doublons, []);
  });

  // Failure aimed at: main's AD-128 is overwritten by the epic's, or the epic's ADs are not shifted.
  test('AD-128 reste « A sheet is created whole », les AD de l’epic sont 129 à 134', () => {
    assert.match(ad(128), /^\| AD-128 \| \*\*A sheet is created whole/);
    assert.match(ad(129), /^\| AD-129 \| \*\*A relation has a nature/);
    assert.match(ad(130), /^\| AD-130 \| \*\*The search knows the links and the tree/);
    assert.match(ad(131), /^\| AD-131 \| \*\*« Fiches liées » is a block of the sheet/);
    assert.match(ad(132), /^\| AD-132 \| \*\*« Gone » is a charge of the sheet/);
    assert.match(ad(133), /^\| AD-133 \| \*\*« Famille » is a type of the list/);
    assert.match(ad(134), /^\| AD-134 \| \*\*The import carries natures/);
  });
});
