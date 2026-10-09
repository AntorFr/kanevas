import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerProposition } = await import('../services/propositions.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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

const appel = (app: App, h: Hote | undefined, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

/** Antor GM and Teo (second GM), Léa player, Mira without role; Admin has no role either. */
async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'teo', role: 'mj' });
  const membres = (await appel(app, antor, 'GET', `${base}/membres`)).json() as
    | { compteId: number; username: string }[]
    | { membres: { compteId: number; username: string }[] };
  const liste = Array.isArray(membres) ? membres : membres.membres;
  const antorId = liste.find((m) => m.username === 'antor')!.compteId;
  const camp = (await appel(app, antor, 'POST', `${base}/campagnes`, { nom: 'Camp' })).json();
  const cr = (
    await appel(app, antor, 'POST', `${base}/comptes-rendus`, {
      campagneId: camp.id,
      titre: 'Séance 3',
      texte: 'Aldric est le roi déchu.',
    })
  ).json();
  const fiche = (
    await appel(app, antor, 'POST', `${base}/fiches`, { type: 'personnage', titre: 'Aldric', charge: { pj: false } })
  ).json();
  const sec = (
    await appel(app, antor, 'POST', `${base}/fiches/${fiche.id}/sections`, { titre: 'Vérité', contenu: 'Ancien' })
  ).json() as { id: number; version: number };
  const prop = creerProposition(app.db, antorId, u.id, {
    sectionId: sec.id,
    crId: cr.id,
    contenu: 'Nouveau',
    version: sec.version,
  });
  const url = `${base}/propositions/${prop.id}`;
  const lireSec = async () =>
    (await appel(app, antor, 'GET', `${base}/fiches/${fiche.id}/sections/${sec.id}`)).json() as {
      contenu: string;
      version: number;
    };
  return { app, antor, lea, teo, mira, admin, u, base, antorId, cr, fiche, sec, prop, url, lireSec };
}

test('critère : lire, appliquer, second appliquer, état appliquee', async () => {
  const { app, antor, url, prop, sec, cr, lireSec } = await monter();
  const g = await appel(app, antor, 'GET', url);
  assert.equal(g.statusCode, 200);
  const v = g.json();
  assert.equal(v.etat, 'en_attente');
  assert.equal(v.sectionId, sec.id);
  assert.equal(v.contenuActuel, 'Ancien');
  assert.equal(v.contenuPropose, 'Nouveau');
  assert.equal(v.crId, cr.id);
  assert.equal(v.id, prop.id);

  const a = await appel(app, antor, 'POST', `${url}/appliquer`);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal((await lireSec()).contenu, 'Nouveau');

  const again = await appel(app, antor, 'POST', `${url}/appliquer`);
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().code, 'proposition_appliquee');
  assert.equal((await appel(app, antor, 'GET', url)).json().etat, 'appliquee');
  // An applied proposal cannot be abandoned.
  const ab = await appel(app, antor, 'POST', `${url}/abandonner`);
  assert.equal(ab.statusCode, 409);
  assert.equal(ab.json().code, 'proposition_appliquee');
});

test('critère : section modifiée → perimee, appliquer 409 section_modifiee sans rien écrire', async () => {
  const { app, antor, url, base, fiche, sec, lireSec } = await monter();
  const put = await appel(app, antor, 'PUT', `${base}/fiches/${fiche.id}/sections/${sec.id}/contenu`, {
    contenu: 'Autre',
    version: sec.version,
  });
  assert.equal(put.statusCode, 200, put.body);
  const apres = await lireSec();
  assert.equal((await appel(app, antor, 'GET', url)).json().etat, 'perimee');
  const r = await appel(app, antor, 'POST', `${url}/appliquer`);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'section_modifiee');
  const fin = await lireSec();
  assert.equal(fin.contenu, 'Autre');
  assert.equal(fin.version, apres.version);
  assert.equal((await appel(app, antor, 'GET', url)).json().etat, 'perimee');
});

test('critère : abandonner rend 204 puis 404', async () => {
  const { app, antor, url, lireSec } = await monter();
  const r = await appel(app, antor, 'POST', `${url}/abandonner`);
  assert.equal(r.statusCode, 204);
  assert.equal(r.body, '');
  assert.equal((await appel(app, antor, 'GET', url)).statusCode, 404);
  assert.equal((await appel(app, antor, 'POST', `${url}/appliquer`)).statusCode, 404);
  assert.equal((await lireSec()).contenu, 'Ancien');
});

test('exclusions : Léa, autre MJ, sans rôle, Admin, autre univers, inconnu → même 404', async () => {
  const { app, antor, lea, teo, mira, admin, url, base, prop } = await monter();
  const autre = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Autre' })).json();
  const refs: string[] = [];
  const essais: [Hote, string][] = [
    [lea, url],
    [teo, url],
    [mira, url],
    [admin, url],
    [antor, `${base}/propositions/99999`],
    [antor, `${base}/propositions/abc`],
    [antor, `/api/univers/${autre.id}/propositions/${prop.id}`],
    [mira, `/api/univers/${autre.id}/propositions/${prop.id}`],
  ];
  for (const [h, u] of essais) {
    for (const [m, suffixe] of [['GET', ''], ['POST', '/appliquer'], ['POST', '/abandonner']] as const) {
      const r = await appel(app, h, m, u + suffixe);
      assert.equal(r.statusCode, 404, `${m} ${u}${suffixe}`);
      refs.push(r.body);
    }
  }
  assert.equal(new Set(refs).size, 1, 'même corps pour tous les refus');
  // Nothing was touched by the refused attempts.
  assert.equal((await appel(app, antor, 'GET', url)).json().etat, 'en_attente');
});

test('sans session : 401, et aucune route de création', async () => {
  const { app, url, base } = await monter();
  for (const [m, u] of [
    ['GET', url],
    ['POST', `${url}/appliquer`],
    ['POST', `${url}/abandonner`],
  ] as const) {
    assert.equal((await appel(app, undefined, m, u)).statusCode, 401, `${m} ${u}`);
  }
  const antor = await connecter(app, 'antor');
  const c = await appel(app, antor, 'POST', `${base}/propositions`, { sectionId: 1, crId: 1, contenu: 'x', version: 1 });
  assert.ok(c.statusCode === 404 || c.statusCode === 405, String(c.statusCode));
});

test('aucune réponse ne porte un identifiant de compte autre que celui de l’appelant', async () => {
  const { app, antor, url } = await monter();
  const corps = (await appel(app, antor, 'GET', url)).body + (await appel(app, antor, 'POST', `${url}/appliquer`)).body;
  assert.ok(!/demandeur|compte_?id|"auteur/i.test(corps), corps);
});
