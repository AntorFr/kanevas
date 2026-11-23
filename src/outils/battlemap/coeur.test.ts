// AD-battlemap-editeur-9: `coeur.ts` is the server's only road to the Wasm; the core's shared fixtures are played through it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as K from './coeur.js';

const dossier = fileURLToPath(new URL('../../../rust/modules/battlemap-core/tests/fixtures/', import.meta.url));
const lire = (nom: string) => JSON.parse(readFileSync(`${dossier}${nom}.json`, 'utf8')) as any;

test('coeur.ts : chaque commande puis son inverse rend le document d’origine', () => {
  const doc = lire('document');
  for (const cas of lire('commandes')) {
    const r = K.appliquerLot(JSON.stringify(doc), cas.lot);
    assert.equal(r.ok, true, cas.nom);
    if (!r.ok) continue;
    const retour = K.appliquerLot(r.document, r.inverses);
    assert.ok(retour.ok, cas.nom);
    if (retour.ok) assert.deepEqual(JSON.parse(retour.document), doc, cas.nom);
  }
});

test('coeur.ts : le lot complet donne le résultat attendu', () => {
  const r = K.appliquerLot(JSON.stringify(lire('document')), lire('lot'));
  assert.deepEqual({ ...r, document: r.ok ? JSON.parse(r.document) : undefined }, lire('resultat-lot'));
});

test('coeur.ts : les refus portent code, champ et index', () => {
  for (const cas of lire('limites')) {
    const doc = cas.document === 'carte_vide' ? K.carteVide(20, 20) : JSON.stringify(lire(cas.document));
    const r = K.appliquerLot(doc, cas.lot);
    assert.equal(r.ok, false, cas.nom);
    if (r.ok) continue;
    assert.equal(r.code, cas.code, cas.nom);
    if (cas.champ) assert.equal(r.champ, cas.champ, cas.nom);
    if (cas.index !== undefined) assert.equal(r.index, cas.index, cas.nom);
  }
});

test('coeur.ts : carte_vide, filtre et compterUsages', () => {
  const d = JSON.parse(K.carteVide(30, 20));
  assert.deepEqual(d.calques.map((c: any) => c.nom), ['Sol', 'Murs', 'Objets']);
  assert.throws(() => K.carteVide(201, 5), K.ErreurCoeur);
  const f = K.filtrerPourJoueur(JSON.stringify(lire('document')), lire('contexte'));
  assert.deepEqual(JSON.parse(f), lire('document-filtre'));
  assert.equal(K.compterUsages(JSON.stringify(lire('document')), 'dalle') > 0, true);
  assert.equal(K.compterUsages(JSON.stringify(lire('document')), 'inconnu'), 0);
  assert.equal(K.limites().elements_max, 5000);
});
