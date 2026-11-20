// Layer 2 of AD-battlemap-table-9: the shared fixtures (rust/modules/battlemap-core/tests/fixtures/table)
// played through the Wasm module the server loads — the same files `cargo test` plays natively.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type * as Coeur from '../../rust/pkg/battlemap_core/battlemap_core.js';
import { chargerModule } from './charger.js';

const dossier = fileURLToPath(new URL('../../rust/modules/battlemap-core/tests/fixtures/table/', import.meta.url));
const lire = (nom: string) => JSON.parse(readFileSync(`${dossier}${nom}.json`, 'utf8')) as any;
const coeur = () => chargerModule<typeof Coeur>('battlemap_core');
const J = JSON.stringify;

// Independent decoder of the bitmap (row-major, least significant bit first, base64).
function revelees(etat: any, l: number, h: number): string[] {
  const octets = Buffer.from(etat.brouillard, 'base64');
  assert.equal(octets.length, Math.ceil((l * h) / 8));
  const sortie: string[] = [];
  for (let i = 0; i < l * h; i++) if ((octets[i >> 3]! >> (i & 7)) & 1) sortie.push(`${i % l},${Math.floor(i / l)}`);
  return sortie;
}
const cles = (cases: number[][]) => cases.map(([x, y]) => `${x},${y}`).sort();

test('le lot nominal donne l’état et la vue joueur attendus, sans un secret', async () => {
  const m = await coeur();
  const f = lire('lot-nominal');
  const { largeur, hauteur } = f.document;
  const vide = JSON.parse(m.etatVide(largeur, hauteur));
  const r = JSON.parse(m.appliquerTable(J(f.document), J(vide), J(f.lot), J(f.contexte)));
  assert.equal(r.ok, true, J(r));
  assert.deepEqual(r.etat.pions, f.attendu.pions);
  assert.deepEqual(r.etat.vue, f.attendu.vue);
  assert.deepEqual(r.etat.calques_masques, f.attendu.calques_masques);
  assert.deepEqual(revelees(r.etat, largeur, hauteur).sort(), cles(f.attendu.revele));
  const brut = m.vueJoueur(J(f.document), J(r.etat), J(f.contexte));
  assert.deepEqual(JSON.parse(brut), { ...f.attendu_vue, brouillard: r.etat.brouillard });
  for (const secret of f.secrets) assert.ok(!brut.includes(secret), secret);
});

function depart(m: typeof Coeur, f: any, cas: any) {
  const doc = cas.document ?? f.document;
  const { largeur, hauteur } = doc;
  let etat = JSON.parse(m.etatVide(largeur, hauteur));
  for (let i = 0; i < (cas.pions_generes ?? 0); i++) {
    etat.pions.push({ id: `g${i}`, nom: 'G', asset_id: null, fiche_id: null, x: 0, y: 0, visible: true });
  }
  if (cas.preparation) {
    const p = JSON.parse(m.appliquerTable(J(doc), J(etat), J(cas.preparation), J(f.contexte)));
    assert.equal(p.ok, true, `${cas.nom}: ${J(p)}`);
    etat = p.etat;
  }
  return { doc, etat, largeur, hauteur };
}

function jouer(nomFichier: string) {
  return async () => {
    const m = await coeur();
    const f = lire(nomFichier);
    for (const cas of f.cas) {
      const { doc, etat, largeur, hauteur } = depart(m, f, cas);
      let l = largeur, h = hauteur;
      let r: any;
      if (cas.nouvelle_taille) {
        [l, h] = cas.nouvelle_taille;
        r = JSON.parse(m.redimensionnerEtat(J(etat), largeur, hauteur, l, h, J(f.contexte)));
      } else {
        const ctx = cas.acteur ? { ...f.contexte, acteur: cas.acteur } : f.contexte;
        r = JSON.parse(m.appliquerTable(J(doc), J(etat), J(cas.lot), J(ctx)));
      }
      const a = cas.attendu;
      assert.equal(r.ok, a.ok, `${cas.nom}: ${J(r)}`);
      if (!a.ok) {
        assert.equal(r.code, a.code, cas.nom);
        if (a.index !== undefined) assert.equal(r.index, a.index, cas.nom);
        if (a.champ !== undefined) assert.equal(r.champ, a.champ, cas.nom);
        assert.equal(r.etat, undefined, cas.nom);
        continue;
      }
      const vues = revelees(r.etat, l, h);
      if (a.revele) assert.deepEqual([...vues].sort(), cles(a.revele), cas.nom);
      if (a.revele_tout) assert.equal(vues.length, l * h, cas.nom);
      if (a.revele_hors) {
        const [x0, y0, w, hh] = a.revele_hors;
        assert.ok(vues.length > 0, cas.nom);
        assert.ok(!vues.some((c) => { const [x, y] = c.split(',').map(Number) as [number, number]; return x >= x0 && x < x0 + w && y >= y0 && y < y0 + hh; }), cas.nom);
      }
      if (a.masque) assert.ok(!vues.some((c) => cles(a.masque).includes(c)), cas.nom);
      if (a.vue) assert.deepEqual(r.etat.vue, a.vue, cas.nom);
    }
  };
}

test('une commande invalide refuse le lot entier', jouer('refus'));
test('reveler_piece s’arrête à un mur et à une porte', jouer('pieces'));
test('reveler_piece remplit la carte pour une pièce ouverte', jouer('piece-ouverte'));
test('redimensionnerEtat étend, rogne, borne la vue et refuse', jouer('redimensionner'));
