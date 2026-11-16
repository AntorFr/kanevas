// Doors of the lot « outils » for the import cases of `src/e2e/types-besoin-verification.test.ts` (docs/tests-ecran/lot-outils.md): the import
// API takes the thirteen types and a sub-type of 60 characters, refuses the rest, and answers 401 without a valid token (`inject`, no browser).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const TREIZE = ['personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete', 'creature', 'race', 'vaisseau', 'savoir', 'recit', 'regle', 'note'];

async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db));
  const essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const put = async (cle: string, corps: object, jeton: string = JETON_BOUCHON) => {
    const r = await app.inject({ method: 'PUT', url: `/api/import/v1/univers/${essai}/fiches/${cle}`, headers: { authorization: `Bearer ${jeton}` }, payload: corps });
    return { status: r.statusCode, corps: r.json() as Any };
  };
  return { app, put };
}

test('PUT /fiches/vaisseau:aube with the sub-type « Frégate » answers creee, then inchangee on replay', async () => {
  const { put } = await monde();
  const f = { type: 'vaisseau', titre: 'Aube', sousType: 'Frégate' };
  const a = await put('vaisseau:aube', f);
  assert.equal(a.status, 200);
  assert.equal(a.corps.etat, 'creee');
  assert.equal((await put('vaisseau:aube', f)).corps.etat, 'inchangee');
});

test('the API accepts each of the thirteen types', async () => {
  const { put } = await monde();
  for (const type of TREIZE) {
    const r = await put(`${type}:essai-treize`, { type, titre: `Essai ${type}`, sousType: 'Essai' });
    assert.equal(r.status, 200, `${type}: ${JSON.stringify(r.corps)}`);
    assert.equal(r.corps.etat, 'creee', type);
  }
});

test('a sub-type of 60 characters passes, 61 is refused on the field sousType', async () => {
  const { put } = await monde();
  assert.equal((await put('lieu:bord-60', { type: 'lieu', titre: 'Bord 60', sousType: 'a'.repeat(60) })).corps.etat, 'creee');
  const ko = await put('lieu:bord-61', { type: 'lieu', titre: 'Bord 61', sousType: 'a'.repeat(61) });
  assert.equal(ko.status, 400);
  assert.equal(ko.corps.code, 'invalide');
  assert.equal(ko.corps.champ, 'sousType');
});

test('an unknown type and a compte_rendu without a campaign are refused (400, fields type and campagne)', async () => {
  const { put, app } = await monde();
  const avant = (app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n;
  const inconnu = await put('dragon:x', { type: 'dragon', titre: 'Dragon' });
  assert.equal(inconnu.status, 400);
  assert.equal(inconnu.corps.champ, 'type');
  const cr = await put('compte_rendu:x', { type: 'compte_rendu', titre: 'CR' });
  assert.equal(cr.status, 400);
  assert.equal(cr.corps.champ, 'campagne');
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n, avant, 'nothing is created');
});

test('without a valid token, a PUT with a sub-type is refused 401 jeton_invalide and creates nothing', async () => {
  const { put, app } = await monde();
  const avant = (app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n;
  const r = await put('lieu:sans-jeton', { type: 'lieu', titre: 'X', sousType: 'Port' }, 'kvs_faux');
  assert.equal(r.status, 401);
  assert.equal(r.corps.code, 'jeton_invalide');
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n, avant);
});
