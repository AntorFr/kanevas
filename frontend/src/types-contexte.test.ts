import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createServer } from 'vite';

const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const ctx = (await vite.ssrLoadModule('./types-contexte.tsx')) as typeof import('./types-contexte');
const items = (await vite.ssrLoadModule('./items.ts')) as typeof import('./items');
test.after(() => vite.close());

const vue = (type: string, slug: string, pluriel: string, active: boolean) => ({
  type, slug, singulier: type, pluriel, nouveau: '', aucun: '', icone: 'ship', reglable: true, active, origine: 'univers' as const, forcage: null,
});
const LISTE = [vue('lieu', 'lieux', 'Lieux', true), vue('vaisseau', 'vaisseaux', 'Vaisseaux', true), vue('note', 'notes', 'Notes', false)];

test('itemsLore : un item par type donné, libellé = pluriel du serveur, adresse = slug', () => {
  const lore = items.itemsLore(ctx.typesActifs(LISTE));
  assert.deepEqual(lore.map((i) => i.libelle), ['Lieux', 'Vaisseaux']);
  assert.deepEqual(lore.map((i) => i.chemin(7)), ['/univers/7/fiches/lieux', '/univers/7/fiches/vaisseaux']);
  assert.ok(lore.every((i) => i.section === 'Lore'));
});

test('itemsLore : liste vide → aucun item (jamais une copie en dur)', () => {
  assert.deepEqual(items.itemsLore([]), []);
});

test('typeParSlug retrouve un type désactivé, et rien pour /fiches/monde', () => {
  assert.equal(ctx.typeParSlug(LISTE, 'notes')?.active, false);
  assert.equal(ctx.typeParSlug(LISTE, 'monde'), undefined);
  assert.deepEqual(ctx.typesActifs(LISTE).map((t) => t.type), ['lieu', 'vaisseau']);
});

test('iconeDeNom : nom inconnu ou absent → icône de fiche, pas d’exception', () => {
  assert.equal(ctx.iconeDeNom('nimporte-quoi'), ctx.iconeDeNom(undefined));
  assert.notEqual(ctx.iconeDeNom('ship'), ctx.iconeDeNom(undefined));
});

test('chaque icône que le serveur envoie a son composant (quinze types + compte-rendu)', async () => {
  const { TYPES } = await import('../../src/services/types-fiche.ts');
  const repli = ctx.iconeDeNom(undefined);
  assert.equal(TYPES.length, 16);
  for (const t of TYPES) {
    if (t.type === 'compte_rendu') continue;
    assert.notEqual(ctx.iconeDeNom(t.icone), repli, `icône ${t.icone} du type ${t.type} absente de la table`);
  }
});
