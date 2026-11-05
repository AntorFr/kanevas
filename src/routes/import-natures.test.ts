import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const q = (lot?: number) => (lot ? `?lot=${lot}` : '');
  const inj = (method: 'PUT' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url: `${base}${url}`, headers: auth, payload: payload as object });
  const put = (cle: string, p: unknown, lot?: number) => inj('PUT', `/fiches/${encodeURIComponent(cle)}${q(lot)}`, p);
  const rel = (cle: string, p: unknown, lot?: number) => inj('POST', `/fiches/${encodeURIComponent(cle)}/relations${q(lot)}`, p);
  const lot = async () => (await inj('POST', '/lots')).json().lotId as number;
  const clore = (l: number) => inj('POST', `/lots/${l}/clore`);
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  await put('perso:aldric', { type: 'personnage', titre: 'Aldric', sections: [{ cle: 'app', titre: 'Apparence', contenu: 'x' }] });
  await put('lieu:port', { type: 'lieu', titre: 'Port', sections: [] });
  await put('fac:guilde', { type: 'faction', titre: 'Guilde', sections: [] });
  const rows = (sql = '') => app.db.prepare(`SELECT r.nature, r.qualificatif FROM relations r JOIN sections s ON s.id = r.section_id JOIN fiches f ON f.id = s.fiche_id WHERE f.cle_origine = 'perso:aldric' ${sql} ORDER BY r.id`).all() as { nature: string; qualificatif: string }[];
  return { app, put, rel, lot, clore, lire, rows };
}
const E = { section: 'app', cible: 'lieu:port' };

test('nature + qualificatif : créée, comptée, stockée ; rejouée inchangée', async () => {
  const m = await monter();
  const l = await m.lot();
  const r = await m.rel('perso:aldric', [{ ...E, nature: 'se_situe', qualificatif: 'habite' }], l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json()[0].etat, 'creee');
  assert.deepEqual(m.rows(), [{ nature: 'se_situe', qualificatif: 'habite' }]);
  assert.equal((await m.lire(l)).compteurs.relations.creees, 1);
  await m.clore(l);
  const l2 = await m.lot();
  const r2 = await m.rel('perso:aldric', [{ ...E, nature: 'se_situe', qualificatif: 'habite' }], l2);
  assert.equal(r2.json()[0].etat, 'inchangee');
  assert.equal((await m.lire(l2)).compteurs.relations.inchangees, 1);
  assert.equal(m.rows().length, 1);
});

test('même cible, même nature, qualificatif différent → deux relations ; sans qualificatif accepté avec une nature', async () => {
  const m = await monter();
  await m.rel('perso:aldric', [
    { ...E, nature: 'se_situe', qualificatif: 'habite' },
    { ...E, nature: 'se_situe', qualificatif: 'visite' },
    { ...E, nature: 'se_situe' },
  ]);
  assert.equal(m.rows().length, 3);
});

test('type seul → relation libre au qualificatif, avec avertissement de dépréciation', async () => {
  const m = await monter();
  const r = await m.rel('perso:aldric', [{ ...E, type: 'habite' }]);
  const x = r.json()[0];
  assert.equal(x.etat, 'creee');
  assert.match(x.avertissements[0], /déprécié/);
  assert.deepEqual(m.rows(), [{ nature: '', qualificatif: 'habite' }]);
});

test('qualificatif seul : relation libre sans avertissement', async () => {
  const m = await monter();
  const r = await m.rel('perso:aldric', [{ ...E, qualificatif: 'maître de port' }]);
  assert.equal(r.json()[0].etat, 'creee');
  assert.deepEqual(r.json()[0].avertissements, []);
  assert.deepEqual(m.rows(), [{ nature: '', qualificatif: 'maître de port' }]);
});

test('nature "dirige" ou hors du couple → refusée nature_incompatible, champ nature, comptée, rien écrit', async () => {
  const m = await monter();
  const l = await m.lot();
  const r = await m.rel('perso:aldric', [
    { ...E, nature: 'dirige', qualificatif: 'x' },
    { ...E, nature: 'membre', qualificatif: 'x' },
    { section: 'app', cible: 'fac:guilde', nature: 'se_situe' },
    { ...E, nature: 'inconnue', type: 'habite' },
  ], l);
  assert.equal(r.statusCode, 200, r.body);
  for (const x of r.json()) {
    assert.equal(x.etat, 'refusee');
    assert.equal(x.code, 'nature_incompatible');
    assert.equal(x.champ, 'nature');
  }
  assert.equal(m.rows().length, 0);
  const lt = await m.lire(l);
  assert.equal(lt.compteurs.relations.refusees, 4);
  assert.equal(lt.compteurs.relations.creees, 0);
  assert.equal(lt.rapport[0].code, 'nature_incompatible');
});

test('nature_incompatible sans lot : refusée, rien écrit, aucun lot touché', async () => {
  const m = await monter();
  const r = await m.rel('perso:aldric', [{ ...E, nature: 'dirige', qualificatif: 'x' }]);
  assert.equal(r.json()[0].code, 'nature_incompatible');
  assert.equal(m.rows().length, 0);
});

test('lot clos → 409 lot_clos, même avec une nature', async () => {
  const m = await monter();
  const l = await m.lot();
  await m.clore(l);
  const r = await m.rel('perso:aldric', [{ ...E, nature: 'se_situe', qualificatif: 'habite' }], l);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'lot_clos');
  assert.equal(m.rows().length, 0);
});

test('ni nature ni qualificatif, ni type → refusée invalide ; qualificatif de 81 caractères refusé', async () => {
  const m = await monter();
  const r = await m.rel('perso:aldric', [{ ...E }, { ...E, qualificatif: 'a'.repeat(81) }, { ...E, nature: 5 }]);
  assert.deepEqual(r.json().map((x: any) => x.etat), ['refusee', 'refusee', 'refusee']);
  assert.equal(m.rows().length, 0);
});

test('PUT type famille : crée une famille, rejouée inchangée ; type inconnu refusé', async () => {
  const m = await monter();
  const l = await m.lot();
  const a = await m.put('fam:corvalis', { type: 'famille', titre: 'Les Corvalis', sections: [] }, l);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().etat, 'creee');
  assert.equal((m.app.db.prepare("SELECT type FROM fiches WHERE cle_origine='fam:corvalis'").get() as any).type, 'famille');
  await m.clore(l);
  const l2 = await m.lot();
  const b = await m.put('fam:corvalis', { type: 'famille', titre: 'Les Corvalis', sections: [] }, l2);
  assert.equal(b.json().etat, 'inchangee');
  const c = await m.put('fam:x', { type: 'clan', titre: 'X', sections: [] });
  assert.equal(c.statusCode, 400);
});

test('une famille se relie par nature : membre de Famille accepté, Famille se situe à Lieu accepté', async () => {
  const m = await monter();
  await m.put('fam:c', { type: 'famille', titre: 'C', sections: [{ cle: 's', titre: 'S', contenu: 'x' }] });
  const r = await m.rel('perso:aldric', [{ section: 'app', cible: 'fam:c', nature: 'membre', qualificatif: 'aîné' }]);
  assert.equal(r.json()[0].etat, 'creee');
  const r2 = await m.rel('fam:c', [{ section: 's', cible: 'lieu:port', nature: 'se_situe' }]);
  assert.equal(r2.json()[0].etat, 'creee');
});
