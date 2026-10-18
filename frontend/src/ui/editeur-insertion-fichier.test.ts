// kanevas-mediatheque-fiche (B-55, P-16 étape 3): a file reference lands on its own line, so it never
// glues to a closing ":::" (which would swallow it into the GM block) nor to a table row.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dansBlocMJ, insererTexte, sansBlocsMJ } from './editeur-logique';

const REF = '[tarifs-du-port.pdf](fichier:14)';

test('curseur juste après une fermeture ::: : la référence passe à la ligne et sort du bloc MJ', () => {
  const t = 'Texte\n:::mj\nsecret\n:::';
  const r = insererTexte(t, t.length, t.length, REF);
  assert.equal(r.texte, `${t}\n${REF}`);
  assert.equal(r.debut, r.texte.length);
  assert.equal(r.fin, r.debut);
  assert.equal(dansBlocMJ(r.texte, r.debut), false);
  assert.ok(sansBlocsMJ(r.texte).includes(REF), 'un lecteur joueur garde la référence');
  assert.ok(!sansBlocsMJ(r.texte).includes('secret'));
});

test('après une ligne de tableau : pas de collage à la dernière cellule', () => {
  const t = '| a | b |\n|---|---|\n| Cordages et voiles | x |';
  const r = insererTexte(t, t.length, t.length, '![Plan](fichier:11)');
  assert.equal(r.texte, `${t}\n![Plan](fichier:11)`);
});

test('au milieu d’une ligne : saut avant et après, curseur après la référence', () => {
  const r = insererTexte('abcdef', 3, 3, REF);
  assert.equal(r.texte, `abc\n${REF}\ndef`);
  assert.equal(r.debut, 4 + REF.length);
  assert.equal(r.fin, r.debut);
  assert.equal(r.texte.slice(r.debut), '\ndef');
});

test('début de ligne et ligne suivante : aucun saut superflu', () => {
  assert.equal(insererTexte('a\nb', 2, 2, REF).texte, `a\n${REF}\nb`);
  assert.equal(insererTexte('a\n\nb', 2, 2, REF).texte, `a\n${REF}\nb`);
});

test('champ vide : la référence seule', () => {
  assert.deepEqual(insererTexte('', 0, 0, REF), { texte: REF, debut: REF.length, fin: REF.length });
});

test('la sélection est remplacée, même à l’envers', () => {
  assert.equal(insererTexte('un mot ici', 6, 3, REF).texte, `un \n${REF}\n ici`);
});

test('juste avant une fermeture ::: : la référence reste dans le bloc MJ, sur sa ligne', () => {
  const t = ':::mj\nsecret\n:::';
  const p = ':::mj\nsecret\n'.length;
  const r = insererTexte(t, p, p, REF);
  assert.equal(r.texte, `:::mj\nsecret\n${REF}\n:::`);
  assert.equal(dansBlocMJ(r.texte, r.debut), true);
  assert.ok(!sansBlocsMJ(r.texte).includes(REF));
});

test('positions hors limites : bornées au texte', () => {
  assert.equal(insererTexte('ab', 99, 99, REF).texte, `ab\n${REF}`);
  assert.equal(insererTexte('ab', -5, -5, REF).texte, `${REF}\nab`);
});
