// Layer 2 of AD-165 for `battlemap-core`: the shared fixtures (rust/modules/battlemap-core/tests/fixtures)
// played through the Wasm module the server loads — the same files `cargo test` plays natively.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type * as Coeur from '../../rust/pkg/battlemap_core/battlemap_core.js';
import { chargerModule } from './charger.js';

const dossier = fileURLToPath(new URL('../../rust/modules/battlemap-core/tests/fixtures/', import.meta.url));
const lire = (nom: string) => JSON.parse(readFileSync(`${dossier}${nom}.json`, 'utf8')) as any;
const coeur = () => chargerModule<typeof Coeur>('battlemap_core');
const lot = (m: typeof Coeur, doc: unknown, commandes: unknown) =>
  JSON.parse(m.appliquerLot(JSON.stringify(doc), JSON.stringify(commandes))) as any;

test('chaque commande puis son inverse rend le document d’origine', async () => {
  const m = await coeur();
  const doc = lire('document');
  for (const cas of lire('commandes')) {
    const r = lot(m, doc, cas.lot);
    assert.equal(r.ok, true, cas.nom);
    const retour = lot(m, r.document, r.inverses);
    assert.deepEqual(retour.document, doc, cas.nom);
  }
});

test('le lot complet donne le résultat attendu', async () => {
  const m = await coeur();
  assert.deepEqual(lot(m, lire('document'), lire('lot')), lire('resultat-lot'));
});

test('les refus portent leur code, champ et index', async () => {
  const m = await coeur();
  for (const cas of lire('limites')) {
    const doc = cas.document === 'carte_vide' ? JSON.parse(m.carte_vide(20, 20)) : lire(cas.document);
    const r = lot(m, doc, cas.lot);
    assert.equal(r.ok, false, cas.nom);
    assert.equal(r.code, cas.code, cas.nom);
    if (cas.champ) assert.equal(r.champ, cas.champ, cas.nom);
    if (cas.index !== undefined) assert.equal(r.index, cas.index, cas.nom);
  }
});

test('carte_vide : trois calques nommés dans l’ordre, sans contenu', async () => {
  const m = await coeur();
  const d = JSON.parse(m.carte_vide(30, 20));
  assert.deepEqual(d.calques.map((c: any) => c.nom), ['Sol', 'Murs', 'Objets']);
  assert.ok(d.calques.every((c: any) => !c.mj_seul));
  assert.deepEqual([d.sols, d.murs, d.elements], [[], [], []]);
  assert.throws(() => m.carte_vide(201, 5));
});

test('le document filtré d’un joueur est celui attendu', async () => {
  const m = await coeur();
  const f = m.filtrerPourJoueur(JSON.stringify(lire('document')), JSON.stringify(lire('contexte')));
  assert.deepEqual(JSON.parse(f), lire('document-filtre'));
  for (const secret of ['secret-', 'piege', 'coffre-secret', 'vieille-lampe', 'fiche-mj']) assert.ok(!f.includes(secret), secret);
});

test('compterUsages compte sols, murs et éléments', async () => {
  const m = await coeur();
  assert.equal(m.compterUsages(JSON.stringify(lire('document')), 'dalle'), 8);
});

test('alphaPng et detourerFondUni', async () => {
  const m = await coeur();
  const png = lire('png');
  const oct = (nom: string) => new Uint8Array(Buffer.from(png[nom], 'base64'));
  assert.equal(m.alphaPng(oct('sans_alpha')), false);
  assert.equal(m.alphaPng(oct('avec_alpha')), true);
  const sortie = m.detourerFondUni(oct('fond_uni'));
  assert.equal(m.alphaPng(sortie), true);
  assert.throws(() => m.detourerFondUni(new Uint8Array([1, 2, 3])));
});
