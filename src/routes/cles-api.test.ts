import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Keys on the session routes (kanevas-synchro-cles-api): id / key / former key, `cle` in the bodies, PATCH {cle}, 302 of numeric addresses.
const racine = mkdtempSync(join(tmpdir(), 'kanevas-cles-'));
writeFileSync(join(racine, 'index.html'), '<html><head><!--KANEVAS_BOUCHON--></head><body>SHELL</body></html>');
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;
mkdirSync(join(racine, 'assets'), { recursive: true });

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const etranger = await connecter(app, 'teo');
  const req = (h: { cookie: string }, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const u = (await req(antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  await req(antor, 'POST', `/api/univers/${u.id}/membres`, { username: 'lea' });
  const base = `/api/univers/${u.id}`;
  const creer = async (type: string, titre: string) =>
    (await req(antor, 'POST', `${base}/fiches`, { type, titre })).json() as { id: number; cle: string };
  const sec = async (f: number, contenu: string, lisent: boolean) => {
    const s = (await req(antor, 'POST', `${base}/fiches/${f}/sections`, { titre: 'Texte', contenu })).json();
    if (lisent) await req(antor, 'PATCH', `${base}/fiches/${f}/sections/${s.id}`, { joueursLisent: true });
    return s;
  };
  return { app, antor, lea, etranger, req, u: u as { id: number; cle: string }, base, creer, sec };
}

test('la fiche née dans Kanevas porte cle ; id, clé et ancienne clé lisent la même fiche', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Les Docks');
  assert.equal(f.cle, 'lieu:les-docks');
  await w.sec(f.id, 'texte', true);
  const ch = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}`, { cle: 'lieu:port' });
  assert.equal(ch.statusCode, 200, ch.body);
  assert.equal(ch.json().cle, 'lieu:port');
  for (const ref of [f.id, 'lieu:port', 'lieu:les-docks']) {
    const r = await w.req(w.antor, 'GET', `${w.base}/fiches/${encodeURIComponent(String(ref))}`);
    assert.equal(r.statusCode, 200, String(ref));
    assert.equal(r.json().id, f.id, String(ref));
    assert.equal(r.json().cle, 'lieu:port', String(ref));
    assert.ok(r.json().sections.every((s: { cle?: string }) => typeof s.cle === 'string'));
  }
  // The universe by key too.
  const parCle = await w.req(w.antor, 'GET', `/api/univers/${w.u.cle}/fiches/lieu:port`);
  assert.equal(parCle.statusCode, 200);
  assert.equal(parCle.json().id, f.id);
  await w.app.close();
});

test('changer la clé : redemandée 409 cle_prise ; lieu, a:b:c, chiffres seuls, vide, non-texte → 400 invalide champ cle ; joueuse 403/404', async () => {
  const w = await monter();
  const a = await w.creer('lieu', 'Les Docks');
  const b = await w.creer('lieu', 'La Tour');
  const patch = (h: { cookie: string }, id: number, cle: unknown) => w.req(h, 'PATCH', `${w.base}/fiches/${id}`, { cle } as object);
  assert.equal((await patch(w.antor, a.id, 'lieu:port')).statusCode, 200);
  const pris = await patch(w.antor, b.id, 'lieu:port');
  assert.equal(pris.statusCode, 409);
  assert.equal(pris.json().code, 'cle_prise');
  // A former key is taken too.
  assert.equal((await patch(w.antor, b.id, 'lieu:les-docks')).statusCode, 409);
  for (const mauvaise of ['lieu', 'a:b:c', '12345', '', 'Majuscule', 42, null]) {
    const r = await patch(w.antor, b.id, mauvaise);
    assert.equal(r.statusCode, 400, JSON.stringify(mauvaise));
    assert.equal(r.json().code, 'invalide', JSON.stringify(mauvaise));
    assert.equal(r.json().champ, 'cle', JSON.stringify(mauvaise));
  }
  const l = await patch(w.lea, b.id, 'lieu:tour');
  assert.ok([403, 404].includes(l.statusCode), String(l.statusCode));
  const mj = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${b.id}?mode=joueur`, { cle: 'lieu:tour' });
  assert.equal(mj.statusCode, 403);
  assert.equal((await w.req(w.antor, 'GET', `${w.base}/fiches/${b.id}`)).json().cle, 'lieu:la-tour');
  await w.app.close();
});

test('le titre et la clé ensemble : une clé refusée n’enregistre pas le titre', async () => {
  const w = await monter();
  const a = await w.creer('lieu', 'Les Docks');
  const b = await w.creer('lieu', 'La Tour');
  const r = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${a.id}`, { titre: 'Nouveau', cle: 'lieu:la-tour' });
  assert.equal(r.statusCode, 409);
  assert.equal((await w.req(w.antor, 'GET', `${w.base}/fiches/${a.id}`)).json().titre, 'Les Docks');
  void b;
  await w.app.close();
});

test('corps : la joueuse et le MJ en mode Joueur ne reçoivent ni cle de fiche ni cle de section, ni dans la liste ; l’univers porte cle', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Les Docks');
  await w.sec(f.id, 'texte', true);
  for (const [h, q] of [[w.lea, ''], [w.antor, '?mode=joueur']] as const) {
    const r = (await w.req(h, 'GET', `${w.base}/fiches/${f.id}${q}`)).json();
    assert.equal('cle' in r, false, JSON.stringify(r));
    assert.ok(r.sections.length > 0);
    assert.ok(r.sections.every((s: object) => !('cle' in s)));
    const liste = await w.req(h, 'GET', `${w.base}/fiches${q}`);
    assert.doesNotMatch(liste.body, /lieu:les-docks/, 'liste');
    assert.doesNotMatch((await w.req(h, 'GET', `${w.base}/fiches/${f.id}${q}`)).body, /lieu:les-docks/);
    // by key a reader still reads the sheet
    assert.equal((await w.req(h, 'GET', `${w.base}/fiches/lieu:les-docks${q}`)).statusCode, 200);
  }
  const un = (await w.req(w.lea, 'GET', `/api/univers`)).json() as Array<{ id: number; cle?: string }>;
  assert.equal(un.find((x) => x.id === w.u.id)!.cle, w.u.cle);
  assert.equal((await w.req(w.lea, 'GET', `/api/univers/${w.u.id}`)).json().cle, w.u.cle);
  await w.app.close();
});

test('302 : adresse numérique → adresse lisible ; clé hors type → /fiche/<clé> ; joueuse lectrice suit, fiche MJ seul = 404 comme inconnue', async () => {
  const w = await monter();
  const f = await w.creer('lieu', 'Les Docks');
  await w.sec(f.id, 'texte', true);
  const secret = await w.creer('lieu', 'Crypte');
  await w.sec(secret.id, 'mj', false);
  const get = (h: { cookie: string }, url: string) => w.app.inject({ url, headers: h });
  const r = await get(w.antor, `/univers/${w.u.id}/fiche/${f.id}`);
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, `/univers/${w.u.cle}/lieu/les-docks`);
  // Universe numeric address too, query kept.
  const ru = await get(w.antor, `/univers/${w.u.id}/fiches?q=a`);
  assert.equal(ru.statusCode, 302);
  assert.equal(ru.headers.location, `/univers/${w.u.cle}/fiches?q=a`);
  // The readable address serves the application.
  const ok = await get(w.antor, `/univers/${w.u.cle}/lieu/les-docks`);
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.body.includes('SHELL'));
  // key not starting with a type
  await w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}`, { cle: 'docks' });
  assert.equal((await get(w.antor, `/univers/${w.u.id}/fiche/${f.id}`)).headers.location, `/univers/${w.u.cle}/fiche/docks`);
  await w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}`, { cle: 'zzz:docks' });
  assert.equal((await get(w.antor, `/univers/${w.u.id}/fiche/${f.id}`)).headers.location, `/univers/${w.u.cle}/fiche/zzz:docks`);
  // reader
  const l = await get(w.lea, `/univers/${w.u.id}/fiche/${f.id}`);
  assert.equal(l.statusCode, 302);
  assert.equal(l.headers.location, `/univers/${w.u.cle}/fiche/zzz:docks`);
  const cache = await get(w.lea, `/univers/${w.u.id}/fiche/${secret.id}`);
  const inconnu = await get(w.lea, `/univers/${w.u.id}/fiche/999999`);
  assert.equal(cache.statusCode, 404);
  assert.equal(inconnu.statusCode, 404);
  assert.equal(cache.body, inconnu.body);
  // a non-member learns nothing: same answer for a real and an unknown sheet
  const e1 = await get(w.etranger, `/univers/${w.u.id}/fiche/${f.id}`);
  const e2 = await get(w.etranger, `/univers/${w.u.id}/fiche/999999`);
  assert.equal(e1.statusCode, e2.statusCode);
  assert.equal(e1.body, e2.body);
  assert.notEqual(e1.statusCode, 302);
  await w.app.close();
});

test('univers : le MJ change l’identifiant, l’ancien mène encore à l’univers ; 409, 400 ; joueuse refusée', async () => {
  const w = await monter();
  const autre = (await w.req(w.antor, 'POST', '/api/univers', { nom: 'Autre monde' })).json();
  const r = await w.req(w.antor, 'PATCH', `/api/univers/${w.u.id}`, { cle: 'lame' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().cle, 'lame');
  assert.equal(r.json().nom, 'Lame d’Ébène');
  for (const ref of [w.u.id, 'lame', w.u.cle]) {
    const g = await w.req(w.antor, 'GET', `/api/univers/${ref}`);
    assert.equal(g.statusCode, 200, String(ref));
    assert.equal(g.json().id, w.u.id);
  }
  const pris = await w.req(w.antor, 'PATCH', `/api/univers/${autre.id}`, { cle: 'lame' });
  assert.equal(pris.statusCode, 409);
  assert.equal(pris.json().code, 'cle_prise');
  const ancienne = await w.req(w.antor, 'PATCH', `/api/univers/${autre.id}`, { cle: w.u.cle });
  assert.equal(ancienne.statusCode, 409);
  for (const m of ['a:b', '123', 'x', 'A B']) {
    const b = await w.req(w.antor, 'PATCH', `/api/univers/${w.u.id}`, { cle: m });
    assert.equal(b.statusCode, 400, m);
    assert.equal(b.json().champ, 'cle', m);
  }
  // refused identifier saves not the name
  const mixte = await w.req(w.antor, 'PATCH', `/api/univers/${w.u.id}`, { cle: 'lame', nom: 'Renommé', description: 'd' });
  assert.equal(mixte.statusCode, 200);
  const mixteRefus = await w.req(w.antor, 'PATCH', `/api/univers/${w.u.id}`, { cle: 'a:b', nom: 'Perdu', description: 'd' });
  assert.equal(mixteRefus.statusCode, 400);
  assert.equal((await w.req(w.antor, 'GET', `/api/univers/${w.u.id}`)).json().nom, 'Renommé');
  const l = await w.req(w.lea, 'PATCH', `/api/univers/${w.u.id}`, { cle: 'lea' });
  assert.ok([403, 404].includes(l.statusCode), String(l.statusCode));
  assert.equal((await w.req(w.antor, 'GET', `/api/univers/${w.u.id}`)).json().cle, 'lame');
  // numeric address now leads to the new one; an old key is not a numeric address
  const n = await w.app.inject({ url: `/univers/${w.u.id}/fiches`, headers: w.antor });
  assert.equal(n.headers.location, '/univers/lame/fiches');
  await w.app.close();
});

test('univers : un non-membre qui nomme l’univers par clé ou par id a la même réponse qu’un univers inconnu', async () => {
  const w = await monter();
  const a = await w.req(w.etranger, 'GET', `/api/univers/${w.u.cle}`);
  const b = await w.req(w.etranger, 'GET', `/api/univers/${w.u.id}`);
  const c = await w.req(w.etranger, 'GET', `/api/univers/inconnu-total`);
  assert.equal(a.statusCode, c.statusCode);
  assert.equal(b.statusCode, c.statusCode);
  assert.equal(a.body, c.body);
  assert.equal(b.body, c.body);
  await w.app.close();
});

test('import : une clé sans lettre est un 400 invalide champ cle ; la clé d’une fiche née dans Kanevas la met à jour sans doublon', async () => {
  const app = await buildApp();
  semerBouchon(app.db);
  const w = { app, req: (h: { cookie: string }, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: h, payload }) };
  const u = w.app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const put = (cle: string, payload: object) =>
    w.app.inject({
      method: 'PUT',
      url: `/api/import/v1/univers/${u.id}/fiches/${encodeURIComponent(cle)}`,
      headers: { authorization: `Bearer ${JETON_BOUCHON}` },
      payload,
    });
  for (const cle of ['12345', '-_-', '007']) {
    const r = await put(cle, { type: 'lieu', titre: 'X', sections: [] });
    assert.equal(r.statusCode, 400, cle);
    assert.equal(r.json().code, 'invalide', cle);
    assert.equal(r.json().champ, 'cle', cle);
  }
  const antor = await connecter(w.app, 'antor');
  const f = (await w.req(antor, 'POST', `/api/univers/${u.id}/fiches`, { type: 'lieu', titre: 'Le Phare' })).json();
  assert.equal(f.cle, 'lieu:le-phare');
  const avant = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(u.id) as { n: number }).n;
  const r = await put('lieu:le-phare', { type: 'lieu', titre: 'Le Phare', sections: [{ cle: 'histoire', titre: 'Histoire', contenu: 'Bâti au dernier siècle.' }] });
  assert.ok(r.statusCode === 200 || r.statusCode === 201, r.body);
  const apres = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(u.id) as { n: number }).n;
  assert.equal(apres, avant);
  const lue = (await w.req(antor, 'GET', `/api/univers/${u.id}/fiches/${f.id}`)).json();
  assert.equal(r.json().id, f.id, r.body);
  assert.equal(lue.sections.length, 1);
  assert.equal(lue.sections[0].titre, 'Histoire');
  await w.app.close();
});
