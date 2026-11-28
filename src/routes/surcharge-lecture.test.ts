// kanevas-systemes-jeu-surcharge-lecture : liste, recherche, lecture par id et liens lisent la copie dans l'univers qui
// l'a faite, l'original ailleurs ; par les routes. antor : MJ de Lame ; lea : joueuse de Lame ; mira : MJ du système et
// d'Aube (rattachée au même système, sans copie).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type Sec = { id: number; version: number; html?: string; contenu?: string; titre: string };

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: h ?? {}, payload });

async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  const aube = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube' })).json();
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  const espace = (app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(sys.id) as { id: number }).id;
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'mira'), 'mj')").run(espace);
  assert.equal((await appel(app, mira, 'PUT', `/api/univers/${aube.id}/systeme`, { systemeId: sys.id })).statusCode, 204);
  const r = await appel(app, mira, 'POST', `/api/systemes/${sys.id}/fiches`, {
    type: 'objet', titre: 'Épée runique', sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Secret de forge', joueursLisent: false }],
  });
  assert.equal(r.statusCode, 201, r.body);
  const el = r.json().id as number;
  const vue = (await appel(app, mira, 'GET', `/api/systemes/${sys.id}/fiches/${el}`)).json();
  const [pub, sec] = vue.sections as Sec[];
  for (const [s, t] of [[pub!, 'Lame bleutée'], [sec!, 'Sang de dragon']] as const) {
    assert.equal((await appel(app, mira, 'PUT', `/api/systemes/${sys.id}/fiches/${el}/sections/${s.id}/contenu`, { contenu: t, version: s.version })).statusCode, 200);
  }
  return { app, antor, lea, mira, lame, aube, sys, el };
}
type Monde = Awaited<ReturnType<typeof monde>>;

const liste = async (w: Monde, h: H, u: number, qs = '') => ((await appel(w.app, h, 'GET', `/api/univers/${u}/fiches${qs}`)).json().fiches ?? []) as { id: number; titre: string; origine: string }[];
const lire = (w: Monde, h: H, u: number, id: number) => appel(w.app, h, 'GET', `/api/univers/${u}/fiches/${id}`);

// A sheet of `u` whose text links the element by id; returns the rendered html of its section.
async function pageAvecLien(w: Monde, h: H, u: number, cible: number) {
  const f = (await appel(w.app, h, 'POST', `/api/univers/${u}/fiches`, { type: 'objet', titre: `Page ${u}`, sections: [{ titre: 'Texte', joueursLisent: true }] })).json();
  const v = (await appel(w.app, h, 'GET', `/api/univers/${u}/fiches/${f.id}`)).json();
  const s = v.sections[0] as Sec;
  const e = await appel(w.app, h, 'PUT', `/api/univers/${u}/fiches/${f.id}/sections/${s.id}/contenu`, { contenu: `Voir [[${cible}|Epee]] ici`, version: s.version });
  assert.equal(e.statusCode, 200, e.body);
  return async (lecteur: H) => ((await lire(w, lecteur, u, f.id)).json().sections[0] as Sec).html as string;
}

test('sans copie : liste, recherche et lecture donnent l’élément du système (origine systeme)', async () => {
  const w = await monde();
  const l = await liste(w, w.antor, w.lame.id);
  assert.deepEqual(l.map((f) => [f.id, f.origine]), [[w.el, 'systeme']]);
  assert.deepEqual((await liste(w, w.antor, w.lame.id, '?q=runique')).map((f) => f.id), [w.el]);
  const v = (await lire(w, w.antor, w.lame.id, w.el)).json();
  assert.equal(v.id, w.el);
  assert.equal(v.origine, 'systeme');
});

test('après copie dans Lame : liste, recherche et lecture par l’id de l’original donnent la copie ; Aube garde l’original', async () => {
  const w = await monde();
  const c = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${w.el}/personnaliser`)).json().id as number;
  await appel(w.app, w.antor, 'PATCH', `/api/univers/${w.lame.id}/fiches/${c}`, { titre: 'Épée de Zéphyr' });
  // liste : une seule entrée, la copie
  assert.deepEqual((await liste(w, w.antor, w.lame.id)).map((f) => [f.id, f.titre, f.origine]), [[c, 'Épée de Zéphyr', 'surcharge']]);
  // recherche : par le titre de la copie, pas par celui de l'original
  assert.deepEqual((await liste(w, w.antor, w.lame.id, '?q=Zéphyr')).map((f) => [f.id, f.origine]), [[c, 'surcharge']]);
  assert.deepEqual((await liste(w, w.antor, w.lame.id, '?q=runique')).map((f) => f.id), []);
  // filtre de type
  assert.deepEqual((await liste(w, w.antor, w.lame.id, '?type=objet')).map((f) => f.id), [c]);
  // lecture par l'id de l'original : la vue de la copie
  const v = (await lire(w, w.antor, w.lame.id, w.el)).json();
  assert.equal(v.id, c);
  assert.equal(v.titre, 'Épée de Zéphyr');
  assert.equal(v.origine, 'surcharge');
  assert.equal(v.surchargeDe, w.el);
  // lecture par l'id de la copie
  const v2 = (await lire(w, w.antor, w.lame.id, c)).json();
  assert.equal(v2.id, c);
  assert.equal(v2.surchargeDe, w.el);
  // Aube : l'original, rien de la copie
  assert.deepEqual((await liste(w, w.mira, w.aube.id)).map((f) => [f.id, f.titre, f.origine]), [[w.el, 'Épée runique', 'systeme']]);
  assert.deepEqual((await liste(w, w.mira, w.aube.id, '?q=Zéphyr')).map((f) => f.id), []);
  const va = (await lire(w, w.mira, w.aube.id, w.el)).json();
  assert.equal(va.id, w.el);
  assert.equal(va.origine, 'systeme');
  assert.equal(va.surchargeDe, undefined);
  // la copie n'est pas lisible depuis Aube
  assert.equal((await lire(w, w.mira, w.aube.id, c)).statusCode, 404);
});

test('revenir : la liste, la recherche et la lecture rendent l’original', async () => {
  const w = await monde();
  const c = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${w.el}/personnaliser`)).json().id as number;
  await appel(w.app, w.antor, 'PATCH', `/api/univers/${w.lame.id}/fiches/${c}`, { titre: 'Épée de Zéphyr' });
  assert.equal((await appel(w.app, w.antor, 'DELETE', `/api/univers/${w.lame.id}/fiches/${w.el}/personnalisation`)).statusCode, 204);
  assert.deepEqual((await liste(w, w.antor, w.lame.id)).map((f) => [f.id, f.origine]), [[w.el, 'systeme']]);
  assert.deepEqual((await liste(w, w.antor, w.lame.id, '?q=runique')).map((f) => f.id), [w.el]);
  assert.deepEqual((await liste(w, w.antor, w.lame.id, '?q=Zéphyr')).map((f) => f.id), []);
  const v = (await lire(w, w.antor, w.lame.id, w.el)).json();
  assert.equal(v.id, w.el);
  assert.equal(v.origine, 'systeme');
  assert.equal((await lire(w, w.antor, w.lame.id, c)).statusCode, 404);
});

test('joueuse de Lame : lit la copie sans section MJ, par l’id de l’original comme par celui de la copie', async () => {
  const w = await monde();
  const c = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${w.el}/personnaliser`)).json().id as number;
  // une section MJ ajoutée à la copie
  const nouvelle = await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${c}/sections`, { titre: 'Note MJ', joueursLisent: false });
  assert.equal(nouvelle.statusCode, 201, nouvelle.body);
  const l = await liste(w, w.lea, w.lame.id);
  assert.deepEqual(l.map((f) => [f.id, f.origine]), [[c, 'surcharge']]);
  for (const id of [w.el, c]) {
    const r = await lire(w, w.lea, w.lame.id, id);
    assert.equal(r.statusCode, 200, r.body);
    const v = r.json();
    assert.equal(v.id, c);
    assert.deepEqual((v.sections as Sec[]).map((s) => s.titre), ['Description']);
    assert.ok(!r.body.includes('Note MJ') && !r.body.includes('Sang de dragon') && !r.body.includes('Secret de forge'));
  }
});

test('lien [[id]] vers l’élément : la copie dans Lame, l’original dans Aube ; revenir rend l’original', async () => {
  const w = await monde();
  const lameLien = await pageAvecLien(w, w.antor, w.lame.id, w.el);
  const aubeLien = await pageAvecLien(w, w.mira, w.aube.id, w.el);
  assert.match(await lameLien(w.antor), /Epee/);
  const c = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${w.el}/personnaliser`)).json().id as number;
  const h = await lameLien(w.antor);
  assert.ok(h.includes(`${c}`), `le lien pointe la copie ${c} : ${h}`);
  assert.ok(!h.includes(`/${w.el}"`) && !h.includes(`/${w.el}?`), `le lien ne pointe plus l'original : ${h}`);
  const ha = await aubeLien(w.mira);
  assert.ok(ha.includes(`${w.el}`) && !ha.includes(`${c}`), ha);
  // la joueuse suit le lien jusqu'à la copie
  assert.ok((await lameLien(w.lea)).includes(`${c}`));
  // revenir : le lien (réécrit sur l'id original) rend l'original
  await appel(w.app, w.antor, 'DELETE', `/api/univers/${w.lame.id}/fiches/${w.el}/personnalisation`);
  const apres = await lameLien(w.antor);
  assert.ok(apres.includes(`${w.el}`) && !apres.includes(`${c}`), apres);
});

test('un lien écrit sur la copie, une fois revenu, se lit comme une fiche supprimée', async () => {
  const w = await monde();
  const c = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${w.el}/personnaliser`)).json().id as number;
  const lien = await pageAvecLien(w, w.antor, w.lame.id, c);
  assert.ok((await lien(w.antor)).includes(`${c}`));
  await appel(w.app, w.antor, 'DELETE', `/api/univers/${w.lame.id}/fiches/${w.el}/personnalisation`);
  const h = await lien(w.antor);
  assert.ok(!h.includes('<a '), `plus de lien actif : ${h}`);
});

test('exclusion : un joueur d’un univers non rattaché ne lit ni l’élément ni la copie par un lien', async () => {
  const w = await monde();
  const teo = await connecter(w.app, 'teo');
  const nu = (await appel(w.app, teo, 'POST', '/api/univers', { nom: 'Nu' })).json();
  await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches/${w.el}/personnaliser`);
  assert.equal((await lire(w, teo, nu.id, w.el)).statusCode, 404);
  assert.deepEqual(await liste(w, teo, nu.id), []);
  assert.equal((await lire(w, teo, w.lame.id, w.el)).statusCode, 404);
});
