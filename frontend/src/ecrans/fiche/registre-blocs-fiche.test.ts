// Sheet-block registry (AD-124): a block renders only for its types and its roles, in rank order.
// « Préparation » is the GM's alone and « Comptes-rendus » is every member's, both on adventures only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createServer } from 'vite';


const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { blocsFiche, blocsFicheVisibles } = (await vite.ssrLoadModule('./registre-blocs-fiche.ts')) as typeof import('./registre-blocs-fiche');
test.after(() => vite.close());

const ids = (type: string, role: 'mj' | 'joueur') => blocsFicheVisibles(type, role).map((b) => b.id);

test('aventure, MJ : Préparation puis Comptes-rendus', () => {
  assert.deepEqual(ids('aventure', 'mj'), ['preparation', 'comptes-rendus', 'cartes']);
});

test('aventure, joueur (ou MJ en mode Joueur) : Comptes-rendus puis Cartes, jamais Préparation', () => {
  assert.deepEqual(ids('aventure', 'joueur'), ['comptes-rendus', 'cartes']);
});

test('« Fiches liées » : les six types cibles d\'une nature, tous rôles, jamais les autres', () => {
  for (const type of ['lieu', 'faction', 'famille', 'personnage', 'objet', 'vaisseau']) {
    assert.deepEqual(ids(type, 'mj'), ['cartes', 'liees'], type);
    assert.deepEqual(ids(type, 'joueur'), ['cartes', 'liees'], type);
  }
});

test('« Cartes » : les seize types de fiche, tous rôles, en place basse ; un type inconnu n\'en reçoit aucun', () => {
  const types = ['personnage', 'lieu', 'faction', 'famille', 'objet', 'evenement', 'quete', 'creature', 'race', 'vaisseau',
    'savoir', 'recit', 'regle', 'note', 'aventure', 'compte_rendu'];
  for (const type of types) {
    for (const role of ['mj', 'joueur'] as const) {
      const c = blocsFicheVisibles(type, role).find((b) => b.id === 'cartes');
      assert.ok(c, `${type} ${role}`);
      assert.equal(c.place, 'bas');
    }
  }
  for (const type of ['scenario', 'inconnu', 'toString']) assert.deepEqual(ids(type, 'mj'), [], type);
});

test('les types sans « Fiches liées » ni préparation ne reçoivent que « Cartes »', () => {
  for (const type of ['quete', 'compte_rendu', 'scenario', 'inconnu', 'toString']) {
    const attendu = type === 'quete' || type === 'compte_rendu' ? ['cartes'] : [];
    assert.deepEqual(ids(type, 'mj'), attendu, type);
    assert.deepEqual(ids(type, 'joueur'), attendu, type);
  }
});

test('le filtre tient types, rôles et rang sur un registre donné, égalité de rang départagée par id', () => {
  const c = () => null;
  const reg = [
    { id: 'z', types: ['lieu'], roles: ['mj', 'joueur'], rang: 1, composant: c },
    { id: 'b', types: ['lieu'], roles: ['mj'], rang: 5, composant: c },
    { id: 'a', types: ['lieu'], roles: ['mj'], rang: 5, composant: c },
    { id: 'x', types: ['aventure'], roles: ['mj'], rang: 0, composant: c },
  ];
  assert.deepEqual(blocsFicheVisibles('lieu', 'mj', reg as never).map((b) => b.id), ['z', 'a', 'b']);
  assert.deepEqual(blocsFicheVisibles('lieu', 'joueur', reg as never).map((b) => b.id), ['z']);
});

test('le registre déclare chaque bloc une fois', () => {
  assert.equal(new Set(blocsFiche.map((b) => b.id)).size, blocsFiche.length);
});
