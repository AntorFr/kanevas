import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { deplacerFiche } = await import('../services/fiches.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, payload: object, lot?: number) =>
    app.inject({
      method: 'PUT',
      url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: auth,
      payload,
    });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const antor = trouverCompte(app.db, 'antor')!.id;
  const parentDe = (id: number) =>
    (app.db.prepare('SELECT parent_id p FROM fiches WHERE id = ?').get(id) as { p: number | null }).p;
  return { app, u, put, lot, clore, lire, antor, parentDe };
}
const F = (titre: string, extra: object = {}) => ({ type: 'lieu', titre, sections: [], ...extra });

test('critère : parent absent → écrit sans parent, avertissement, 1 en attente ; arrivée de la cible → rejeu pose le parent', async () => {
  const { put, lot, clore, lire, parentDe } = await monter();
  // The seed may already hold waiting links: the criterion is the difference the parent makes.
  const l0 = await lot();
  await clore(l0);
  const base0 = (await lire(l0)).enAttente as number;
  const l1 = await lot();
  const r = await put('lieu:les-docks', F('Les Docks', { parent: 'lieu:port-sel-absent' }), l1);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  assert.deepEqual(r.json().avertissements, ['parent lieu:port-sel-absent inconnu : fiche écrite sans parent']);
  assert.equal(parentDe(r.json().id), null);
  await clore(l1);
  assert.equal((await lire(l1)).enAttente, base0 + 1);

  const l2 = await lot();
  const port = await put('lieu:port-sel-absent', F('Port-Sel'), l2);
  const rejeu = await put('lieu:les-docks', F('Les Docks', { parent: 'lieu:port-sel-absent' }), l2);
  assert.equal(rejeu.json().etat, 'mise_a_jour');
  assert.deepEqual(rejeu.json().avertissements, []);
  assert.equal(parentDe(r.json().id), port.json().id);
  await clore(l2);
  assert.equal((await lire(l2)).enAttente, base0);
});

test('parent posé à la création quand la cible existe ; rejeu inchangé : ni version ni modifie_le', async () => {
  const { app, put, parentDe } = await monter();
  const p = await put('lieu:port', F('Port'));
  const r = await put('lieu:quai', F('Quai', { parent: 'lieu:port' }));
  assert.equal(parentDe(r.json().id), p.json().id);
  assert.deepEqual(r.json().avertissements, []);
  const avant = app.db.prepare('SELECT id, modifie_le FROM fiches ORDER BY id').all();
  const r2 = await put('lieu:quai', F('Quai', { parent: 'lieu:port' }));
  assert.equal(r2.json().etat, 'inchangee');
  assert.deepEqual(app.db.prepare('SELECT id, modifie_le FROM fiches ORDER BY id').all(), avant);
});

test('parent déplacé à la main : non écrasé, avertissement ; même avec une cible absente', async () => {
  const { app, put, antor, u, parentDe } = await monter();
  const a = await put('lieu:a', F('A'));
  const b = await put('lieu:b', F('B'));
  const f = await put('lieu:f', F('F', { parent: 'lieu:a' }));
  deplacerFiche(app.db, { compteId: antor }, u.id, f.json().id, b.json().id);
  const r = await put('lieu:f', F('F', { parent: 'lieu:a' }));
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(r.json().avertissements, ['parent modifié dans Kanevas : non écrasé']);
  assert.equal(parentDe(f.json().id), b.json().id);
  assert.ok(a.json().id);
  // Parent mis à la main sur une fiche importée sans parent (cible absente) : non écrasé non plus.
  const g = await put('lieu:g', F('G', { parent: 'lieu:absent' }));
  deplacerFiche(app.db, { compteId: antor }, u.id, g.json().id, a.json().id);
  await put('lieu:absent', F('Absent'));
  const r2 = await put('lieu:g', F('G', { parent: 'lieu:absent' }));
  assert.deepEqual(r2.json().avertissements, ['parent modifié dans Kanevas : non écrasé']);
  assert.equal(parentDe(g.json().id), a.json().id);
});

test('cycle : parent inchangé, avertissement, compté en attente', async () => {
  const { put, lot, clore, lire, parentDe } = await monter();
  const a = await put('lieu:a', F('A'));
  const b = await put('lieu:b', F('B', { parent: 'lieu:a' }));
  const l0 = await lot();
  await clore(l0);
  const base0 = (await lire(l0)).enAttente as number;
  const l = await lot();
  const r = await put('lieu:a', F('A', { parent: 'lieu:b' }), l);
  assert.deepEqual(r.json().avertissements, ['parent lieu:b ferait un cycle : non posé']);
  assert.equal(r.json().etat, 'inchangee');
  assert.equal(parentDe(a.json().id), null);
  assert.equal(parentDe(b.json().id), a.json().id);
  await clore(l);
  assert.equal((await lire(l)).enAttente, base0 + 1);
});

test('parent null remet à la racine ; absent du corps : laissé ; auto-parent = cycle ; clé invalide refusée', async () => {
  const { put, parentDe } = await monter();
  await put('lieu:a', F('A'));
  const f = await put('lieu:f', F('F', { parent: 'lieu:a' }));
  assert.equal((await put('lieu:f', F('F'))).json().etat, 'inchangee');
  assert.notEqual(parentDe(f.json().id), null);
  const r = await put('lieu:f', F('F', { parent: null }));
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.equal(parentDe(f.json().id), null);
  const s = await put('lieu:f', F('F', { parent: 'lieu:f' }));
  assert.match(s.json().avertissements[0], /cycle/);
  const bad = await put('lieu:f', F('F', { parent: 12 }));
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().champ, 'parent');
  assert.equal(bad.json().code, 'invalide');
});
