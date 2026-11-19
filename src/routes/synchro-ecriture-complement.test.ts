// Compléments aux tests d'ensemble de kanevas-synchro-ecriture : B-107 (champs de type), B-108 (création d'une
// section par sa clé, précondition sur la section), B-47 (rejeu), depuis la fiche de la feature, à la porte HTTP du jeton.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'synchro-compl-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const inj = (method: string, url: string, payload?: unknown, h: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url: `/api/v1/univers/${u.id}${url}`, headers: { authorization: `Bearer ${JETON_BOUCHON}`, ...h }, payload: payload as object });
  const lire = async (cle: string) => (await inj('GET', `/fiches/${encodeURIComponent(cle)}`)).json();
  return { app, inj, lire };
}
const sec = (cle: string, contenu: string) => ({ cle, titre: cle.toUpperCase(), contenu, joueursLisent: true });

test('B-107 : PATCH du seul statut d\'une aventure laisse titre, sections et alias ; empreinte périmée → 412, statut inchangé', async () => {
  const m = await monter();
  const mise = await m.inj('PUT', '/fiches/aventure:nuit', { type: 'aventure', titre: 'Nuit noire', alias: ['La Nuit'], sections: [sec('a', 'aa')] });
  assert.equal(mise.statusCode, 200, mise.body);
  const lu = await m.lire('aventure:nuit');
  const ok = await m.inj('PATCH', '/fiches/aventure:nuit', { statut: 'terminee' }, { 'if-match': `"${lu.empreinteEntete}"` });
  assert.equal(ok.statusCode, 200, ok.body);
  const f = await m.lire('aventure:nuit');
  assert.equal(f.entete.titre, 'Nuit noire');
  assert.deepEqual(f.entete.alias, ['La Nuit']);
  assert.deepEqual(f.sections.map((s: any) => s.contenu), ['aa']);
  // la même ancienne empreinte ne passe plus : l'en-tête a changé depuis la lecture
  const refus = await m.inj('PATCH', '/fiches/aventure:nuit', { statut: 'en_cours' }, { 'if-match': `"${lu.empreinteEntete}"` });
  assert.equal(refus.statusCode, 412, refus.body);
  assert.equal(refus.json().code, 'empreinte_perimee');
  assert.equal(JSON.stringify(await m.lire('aventure:nuit')).includes('terminee'), true);
});

test('B-108 : PUT d\'une section à clé neuve la crée sans toucher aux autres ; rejeu identique sans doublon ; empreinte périmée → 412', async () => {
  const m = await monter();
  await m.inj('PUT', '/fiches/lieu:quai', { type: 'lieu', titre: 'Quai', sections: [sec('a', 'aa')] });
  const c = await m.inj('PUT', '/fiches/lieu:quai/sections/b', { titre: 'B', contenu: 'bb', joueursLisent: true });
  assert.equal(c.statusCode, 200, c.body);
  assert.deepEqual((await m.lire('lieu:quai')).sections.map((s: any) => s.cle), ['a', 'b']);
  assert.equal((await m.inj('PUT', '/fiches/lieu:quai/sections/b', { titre: 'B', contenu: 'bb', joueursLisent: true })).statusCode, 200);
  assert.equal((await m.lire('lieu:quai')).sections.length, 2);
  const lue = (await m.lire('lieu:quai')).sections[1];
  await m.inj('PUT', '/fiches/lieu:quai/sections/b', { titre: 'B', contenu: 'bb modifié', joueursLisent: true });
  const refus = await m.inj('PUT', '/fiches/lieu:quai/sections/b', { titre: 'B', contenu: 'écrasé', joueursLisent: true }, { 'if-match': `"${lue.empreinte}"` });
  assert.equal(refus.statusCode, 412, refus.body);
  assert.equal((await m.lire('lieu:quai')).sections[1].contenu, 'bb modifié');
});

test('B-110 : DELETE d\'une fiche inconnue ou PUT section d\'une fiche inconnue → 404, rien créé', async () => {
  const m = await monter();
  const n = (m.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as { n: number }).n;
  assert.equal((await m.inj('PUT', '/fiches/lieu:fantome/sections/a', { titre: 'A', contenu: 'x', joueursLisent: true })).statusCode, 404);
