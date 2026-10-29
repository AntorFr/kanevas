// Tests de l'arbre fusionné de kanevas-fiches-liees-rattrapage, depuis le critère de sortie et les notes de la tâche :
// « aucune marque de conflit dans l'arbre » ; « les AD dans l'ordre sans doublon de numéro » ; l'AD-128 de `main` garde son
// numéro et son texte, ceux de l'epic sont décalés de un (129 natures, 130 recherche, 131 « Fiches liées », 132 « disparu »,
// 133 Famille, 134 import). Les attendus sont les littéraux de la décision de renumérotation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const ARCHI = readFileSync('ARCHITECTURE.md', 'utf8');
const lignesAd = ARCHI.split('\n').filter((l) => /^\| AD-\d+ \|/.test(l));
const ad = (n: number) => lignesAd.find((l) => l.startsWith(`| AD-${n} |`)) ?? '';

describe('kanevas-fiches-liees-rattrapage, l’arbre fusionné', () => {
  // Panne visée : une marque de conflit oubliée dans un fichier suivi.
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

  // Panne visée : deux AD portent le même numéro après la fusion.
  test('chaque numéro d’AD ne porte qu’une ligne dans ARCHITECTURE.md', () => {
    const numeros = lignesAd.map((l) => /^\| (AD-\d+) \|/.exec(l)![1]);
    const doublons = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    assert.deepEqual(doublons, []);
  });

  // Panne visée : l'AD-128 de main est écrasé par celui de l'epic, ou les AD de l'epic ne sont pas décalés.
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
