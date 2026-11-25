// Compléments d'ensemble de kanevas-systemes-jeu-elements, écrits depuis le besoin (B-119, B-114, AD-152, AD-156, AD-157) :
// ce que les tests d'ensemble de systemes-elements-ensemble-besoin.test.ts ne disent pas. Routes réelles, base réelle, mode bouchon.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c, `connexion de ${compte}`);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });
const lignes = (j: Any): Any[] => (Array.isArray(j) ? j : (j.fiches ?? j.items ?? j.resultats ?? []));

// Antor : MJ de l'univers « Lame » et créateur du système « Zeta » (rattaché) ; Léa : joueuse ; Mira : MJ du système seulement.
async function monde() {
  const app = await buildApp();
  const h = {
    antor: await connecter(app, 'antor'),
    lea: await connecter(app, 'lea'),
    mira: await connecter(app, 'mira'),
    admin: await connecter(app, 'admin'),
  };
  const lame = (await appel(app, h.antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  assert.equal((await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' })).statusCode, 201);
  const sys = (await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  assert.equal((await appel(app, h.admin, 'POST', `/api/instance/systemes/${sys.id}/membres`, { username: 'mira' })).statusCode, 201);
  const cree = await appel(app, h.mira, 'POST', `/api/systemes/${sys.id}/fiches`, {
    type: 'objet',
    titre: 'Pistolet laser',
    sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Forge secrète', joueursLisent: false }],
  });
  assert.equal(cree.statusCode, 201, cree.body);
  const f = cree.json();
  const v = (await appel(app, h.mira, 'GET', `/api/systemes/${sys.id}/fiches/${f.id}`)).json();
  const [pub, mj] = v.sections as { id: number; version: number }[];
  assert.equal((await appel(app, h.mira, 'PUT', `/api/systemes/${sys.id}/fiches/${f.id}/sections/${pub!.id}/contenu`, { contenu: 'Dégâts 1d8', version: pub!.version })).statusCode, 200);
  assert.equal((await appel(app, h.mira, 'PUT', `/api/systemes/${sys.id}/fiches/${f.id}/sections/${mj!.id}/contenu`, { contenu: 'Cristal de Vorsk', version: mj!.version })).statusCode, 200);
  return { app, h, lame, sys, f, base: `/api/systemes/${sys.id}` };
}

test('B-119 exclusion : Antor, MJ de l’univers rattaché mais pas MJ du système, ne lit que les sections lisibles des joueurs, par l’espace comme par l’univers, et la recherche ne trouve pas le secret', async () => {
  const w = await monde();
  for (const url of [`${w.base}/fiches/${w.f.id}`, `/api/univers/${w.lame.id}/fiches/${w.f.id}`]) {
    const res = await appel(w.app, w.h.antor, 'GET', url);
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().sections.map((s: Any) => s.titre), ['Description'], url);
    assert.ok(!res.body.includes('Vorsk') && !res.body.includes('Forge secrète'), `aucune fuite par ${url}`);
  }
  const secret = lignes((await appel(w.app, w.h.antor, 'GET', `/api/univers/${w.lame.id}/fiches?q=Vorsk`)).json());
  assert.deepEqual(secret, []);
  await w.app.close();
});

test('AD-157 : GET /api/systemes/:sid ne porte plus de gabarits ; peutEcrire vaut vrai pour le MJ du système, faux pour la joueuse et pour Antor', async () => {
  const w = await monde();
  const dit = async (qui: H) => (await appel(w.app, qui, 'GET', w.base)).json();
  const mira = await dit(w.h.mira);
  assert.equal(mira.nom, 'Zeta');
  assert.equal(mira.peutEcrire, true);
  assert.equal('gabarits' in mira, false);
  assert.equal((await dit(w.h.lea)).peutEcrire, false);
  assert.equal((await dit(w.h.antor)).peutEcrire, false);
  assert.equal('gabarits' in (await dit(w.h.lea)), false);
  await w.app.close();
});

test('B-114 exclusion : un MJ du système ne peut ni ajouter ni retirer de MJ (porte d’instance réservée à l’admin)', async () => {
  const w = await monde();
  const base = `/api/instance/systemes/${w.sys.id}/membres`;
  assert.equal((await appel(w.app, w.h.mira, 'POST', base, { username: 'lea' })).statusCode, 404);
  assert.equal((await appel(w.app, w.h.mira, 'GET', base)).statusCode, 404);
  const liste = (await appel(w.app, w.h.admin, 'GET', base)).json();
  assert.equal(lignes(liste).length, 1, 'seul Mira reste MJ du système');
  await w.app.close();
});
