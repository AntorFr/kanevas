import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { empreinte, empreinteEntete, empreinteSection, jsonCanonique, type EnteteEmpreinte, type SectionEmpreinte } from './empreintes.js';

const sansCle = () => null;
const cles: Record<string, string> = { 'fiche:7': 'aldric', 'fichier:3': 'carte-png' };
const avecCles = (id: number, nature: 'fiche' | 'fichier' = 'fiche') => cles[`${nature}:${id}`] ?? null;

const section = (sur: Partial<SectionEmpreinte> = {}): SectionEmpreinte => ({
  cle: 's1', titre: 'Histoire', contenu: 'Texte', ordre: 1,
  joueurs_lisent: 1, joueurs_ecrivent: 0, auteur_id: null, auteur_lit: 1, auteur_ecrit: 1,
  gere_par: null, fichiers: [], ...sur,
});
const entete = (sur: Partial<EnteteEmpreinte> = {}): EnteteEmpreinte => ({
  titre: 'Aldric', type: 'personnage', sousType: null, parentId: null, alias: ['Al', 'Ric'], etiquettes: ['pnj'],
  charge: { v: 1, pj: false }, creeLe: '2026-01-01T00:00:00Z', ...sur,
});

describe('jsonCanonique et empreinte', () => {
  test('clés triées à tous les niveaux, sans espace', () => {
    assert.equal(jsonCanonique({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
  });
  test("l'ordre des clés ne change pas l'empreinte ; 32 caractères hexadécimaux", () => {
    const a = empreinte({ x: 1, y: 2 });
    assert.equal(a, empreinte({ y: 2, x: 1 }));
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, empreinte({ x: 1, y: 3 }));
  });
});

describe('empreinteSection', () => {
  test("même contenu, champs donnés dans un autre ordre : même empreinte", () => {
    const a = section();
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as SectionEmpreinte;
    assert.equal(empreinteSection(a, sansCle), empreinteSection(b, sansCle));
  });
  test('titre, contenu, audience, fichier joint, ordre, clé et gérée la changent', () => {
    const base = empreinteSection(section(), sansCle);
    for (const v of [
      { titre: 'Autre' }, { contenu: 'Texte.' }, { joueurs_lisent: 0 }, { joueurs_ecrivent: 1 },
      { auteur_id: 4 }, { auteur_lit: 0 }, { auteur_ecrit: 0 }, { fichiers: [3] }, { ordre: 2 }, { cle: 's2' },
      { gere_par: 'swn/outil/type' },
    ]) {
      assert.notEqual(empreinteSection(section(v), sansCle), base, JSON.stringify(v));
    }
  });
  test("un fichier joint en plus ou en moins change l'empreinte, son ordre non", () => {
    const un = empreinteSection(section({ fichiers: [3] }), sansCle);
    const deux = empreinteSection(section({ fichiers: [3, 4] }), sansCle);
    assert.notEqual(un, deux);
    assert.equal(deux, empreinteSection(section({ fichiers: [4, 3] }), sansCle));
  });
  test("modifie_le et version ne la changent pas", () => {
    const a = { ...section(), modifie_le: '2026-01-01', version: 1 };
    const b = { ...section(), modifie_le: '2030-05-05', version: 9 };
    assert.equal(empreinteSection(a, sansCle), empreinteSection(b, sansCle));
  });
  test('lien écrit par id = même lien écrit par clé quand le résolveur donne la clé', () => {
    const parId = empreinteSection(section({ contenu: 'Voir [[7|Aldric]].' }), avecCles);
    const parCle = empreinteSection(section({ contenu: 'Voir [[cle:aldric|Aldric]].' }), avecCles);
    assert.equal(parId, parCle);
  });
  test("sans clé connue, l'id reste écrit : deux cibles différentes, deux empreintes", () => {
    assert.notEqual(
      empreinteSection(section({ contenu: 'Voir [[8|X]].' }), avecCles),
      empreinteSection(section({ contenu: 'Voir [[9|X]].' }), avecCles),
    );
  });
  test('un lien vers une autre cible ou un autre texte change l’empreinte', () => {
    const a = empreinteSection(section({ contenu: '[[cle:aldric|Aldric]]' }), avecCles);
    assert.notEqual(a, empreinteSection(section({ contenu: '[[cle:autre|Aldric]]' }), avecCles));
    assert.notEqual(a, empreinteSection(section({ contenu: '[[cle:aldric|Al]]' }), avecCles));
  });
  test('référence de fichier par id = par clé ; un lien dans un bloc de code reste du texte', () => {
    assert.equal(
      empreinteSection(section({ contenu: '![c](fichier:3)' }), avecCles),
      empreinteSection(section({ contenu: '![c](fichier:cle:carte-png)' }), avecCles),
    );
    assert.notEqual(
      empreinteSection(section({ contenu: '```\n[c](fichier:3)\n```' }), avecCles),
      empreinteSection(section({ contenu: '```\n[c](fichier:cle:carte-png)\n```' }), avecCles),
    );
  });
  test('contenu vide et sans résolveur utile : stable et distinct du contenu non vide', () => {
    const v = empreinteSection(section({ contenu: '' }), sansCle);
    assert.equal(v, empreinteSection(section({ contenu: '' }), sansCle));
    assert.notEqual(v, empreinteSection(section(), sansCle));
  });
});

describe('empreinteEntete', () => {
  test("l'ordre et les doublons des alias et des étiquettes ne la changent pas", () => {
    assert.equal(
      empreinteEntete(entete({ alias: ['Al', 'Ric'], etiquettes: ['a', 'b'] }), sansCle),
      empreinteEntete(entete({ alias: ['Ric', 'Al', 'Al'], etiquettes: ['b', 'a'] }), sansCle),
    );
  });
  test('titre, type, sous-type, alias, étiquette, parent, PJ, cree_le la changent', () => {
    const base = empreinteEntete(entete(), sansCle);
    for (const v of [
      { titre: 'Autre' }, { type: 'lieu', charge: {} }, { sousType: 'ville' }, { alias: ['Al'] }, { alias: ['Al', 'Ric', 'Z'] },
      { etiquettes: [] }, { etiquettes: ['pnj', 'x'] }, { parentId: 5 }, { charge: { v: 1, pj: true } },
      { creeLe: '2026-02-02T00:00:00Z' },
    ]) {
      assert.notEqual(empreinteEntete(entete(v), sansCle), base, JSON.stringify(v));
    }
  });
  test('le parent compte par sa clé quand elle existe : id ou clé, même empreinte via résolveur ; deux parents distincts diffèrent', () => {
    assert.notEqual(empreinteEntete(entete({ parentId: 7 }), avecCles), empreinteEntete(entete({ parentId: 8 }), avecCles));
    assert.notEqual(empreinteEntete(entete({ parentId: 7 }), avecCles), empreinteEntete(entete({ parentId: null }), avecCles));
  });
  test("un champ de charge non déclaré par le registre, ou la version, ne la change pas", () => {
    assert.equal(
      empreinteEntete(entete({ charge: { v: 1, pj: false } }), sansCle),
      empreinteEntete(entete({ charge: { v: 2, pj: false, inconnu: 'x' } }), sansCle),
    );
  });
  test("ajouter une section ne la change pas (aucune section dans l'entrée), une section en plus dans l'objet non plus", () => {
    const base = entete();
    const avecSection = { ...base, sections: [section()] } as unknown as EnteteEmpreinte;
    assert.equal(empreinteEntete(base, sansCle), empreinteEntete(avecSection, sansCle));
  });
  test('type inconnu du registre : ne plante pas, charge vide', () => {
    assert.match(empreinteEntete(entete({ type: 'fantome', charge: { pj: true } }), sansCle), /^[0-9a-f]{32}$/);
  });
});
