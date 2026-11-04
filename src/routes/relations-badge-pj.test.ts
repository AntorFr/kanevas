// Review of kanevas-relation-badge-pj-cible: the target of a relation carries what its badge reads (AD-64).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: Hote, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Badge' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const fiche = async (type: string, titre: string, charge?: object) =>
    (await appel(app, antor, 'POST', `${base}/fiches`, { type, titre, charge })).json() as { id: number };
  const depart = await fiche('lieu', 'Départ');
  const s = (await appel(app, antor, 'POST', `${base}/fiches/${depart.id}/sections`, { titre: 'Liens', contenu: 'x' })).json();
  await appel(app, antor, 'PATCH', `${base}/fiches/${depart.id}/sections/${s.id}`, { joueursLisent: true });
  const rel = `${base}/fiches/${depart.id}/sections/${s.id}/relations`;
  const ouvrir = async (id: number) => {
    const sec = (await appel(app, antor, 'POST', `${base}/fiches/${id}/sections`, { titre: 'P', contenu: 'y' })).json();
    await appel(app, antor, 'PATCH', `${base}/fiches/${id}/sections/${sec.id}`, { joueursLisent: true });
  };
  return { app, antor, lea, base, rel, fiche, ouvrir };
}

test('cible_personnage_PJ_et_PNJ_porte_charge_pj_dans_le_POST_et_le_GET', async () => {
  const { app, antor, rel, fiche } = await monter();
  const pj = await fiche('personnage', 'Léandre', { pj: true });
  const pnj = await fiche('personnage', 'Aldric', { pj: false });
  const p1 = await appel(app, antor, 'POST', rel, { cibleFicheId: pj.id, type: 'ami' });
  const p2 = await appel(app, antor, 'POST', rel, { cibleFicheId: pnj.id, type: 'maître' });
  assert.equal(p1.statusCode, 201, p1.body);
  assert.deepEqual(p1.json().cible, { id: pj.id, titre: 'Léandre', type: 'personnage', charge: { pj: true } });
  assert.deepEqual(p2.json().cible, { id: pnj.id, titre: 'Aldric', type: 'personnage', charge: { pj: false } });
  const g = (await appel(app, antor, 'GET', rel)).json().relations;
  assert.deepEqual(g[0].cible, { id: pj.id, titre: 'Léandre', type: 'personnage', charge: { pj: true } });
  assert.deepEqual(g[1].cible, { id: pnj.id, titre: 'Aldric', type: 'personnage', charge: { pj: false } });
});

test('cible_personnage_sans_pj_en_base_rend_pj_false_et_aucune_autre_cle_de_charge', async () => {
  const { app, antor, rel, fiche } = await monter();
  const p = await fiche('personnage', 'Sans drapeau', { pj: false, secret: 'MJ', autre: 1 });
  const q = await fiche('personnage', 'Vide', {});
  for (const f of [p, q]) await appel(app, antor, 'POST', rel, { cibleFicheId: f.id, type: 'x' });
  const g = (await appel(app, antor, 'GET', rel)).json().relations;
  for (const r of g) assert.deepEqual(r.cible.charge, { pj: false });
  assert.ok(!JSON.stringify(g).includes('secret'));
});

test('cible_autre_type_ne_porte_aucune_charge', async () => {
  const { app, antor, lea, rel, fiche, ouvrir } = await monter();
  const f = await fiche('faction', 'Lames Grises');
  await ouvrir(f.id);
  const p = await appel(app, antor, 'POST', rel, { cibleFicheId: f.id, type: 'x' });
  assert.ok(!p.json().cible.charge || Object.keys(p.json().cible.charge).length === 0, p.body);
  for (const h of [antor, lea]) {
    const r = (await appel(app, h, 'GET', rel)).json().relations[0];
    assert.ok(!r.cible.charge || Object.keys(r.cible.charge).length === 0, JSON.stringify(r));
  }
});

test('joueur_lit_la_charge_pj_d_une_cible_lisible', async () => {
  const { app, antor, lea, rel, fiche, ouvrir } = await monter();
  const pj = await fiche('personnage', 'Léandre', { pj: true });
  await ouvrir(pj.id);
  await appel(app, antor, 'POST', rel, { cibleFicheId: pj.id, type: 'ami' });
  const r = (await appel(app, lea, 'GET', rel)).json().relations;
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].cible.charge, { pj: true });
});
