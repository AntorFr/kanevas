// Feature kanevas-socle-rust, revérification : le texte neuf de la doc est en anglais (CLAUDE.md : « new text is
// English »). Les quatre lignes de la table « Structure » du README ajoutées pour le socle Rust (Dockerfile, rust/,
// src/wasm/, scripts/rust-wasm.sh) étaient en français. Panne attrapée : ces lignes redeviennent françaises.
// L'ajout d'un module est dit dans le README (renvoi) et dans ARCHITECTURE.md (« Adding a module »).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const README = readFileSync('README.md', 'utf8');
const ARCHI = readFileSync('ARCHITECTURE.md', 'utf8');

const DEBUTS = ['Dockerfile ', 'rust/ ', 'src/wasm/, frontend/src/wasm/ ', 'scripts/rust-wasm.sh '];
// Marqueurs français : accents et mots-outils, absents d'une phrase anglaise de ces lignes.
const FRANCAIS = /[éèêàùçôî]|\b(le|la|les|un|une|du|des|de|pour|dans|plus|bas|chaque|vers|par|et|ou|à)\b/i;

test('README : les lignes Structure du socle Rust sont en anglais', () => {
  const lignes = README.split('\n');
  for (const debut of DEBUTS) {
    const ligne = lignes.find((l) => l.startsWith(debut));
    assert.ok(ligne, `ligne « ${debut}» absente du README`);
    const description = ligne.slice(debut.length);
    assert.doesNotMatch(description, FRANCAIS, `ligne en français : ${ligne}`);
    assert.match(description, /\b(the|a|an|of|to|in|is|are|into|each|per|one|only|single|no)\b/i, `pas d'anglais : ${ligne}`);
  }
});

test('la doc dit comment ajouter un module', () => {
  assert.match(ARCHI, /^### Adding a module$/m);
  assert.match(README, /To add a module: `ARCHITECTURE\.md`/);
  assert.match(ARCHI, /rust\/modules\//);
});
