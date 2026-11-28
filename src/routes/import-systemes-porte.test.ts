// kanevas-systemes-jeu-api-porte (review): a key reads and writes the elements of a system (AD-systemes-api-1, 2),
// and the universe's door reads the elements of its attached system at player level (AD-155).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type Any = Record<string, any>;

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

// antor: GM of Lame and, named by the admin, GM of the system Zeta; lea: player of Lame (reads Zeta only);
// teo: no link; mira: GM of Zeta only.
async function monde() {
  const app = await buildApp();
  const [antor, lea, teo, admin] = [await connecter(app, 'antor'), await connecter(app, 'lea'), await connecter(app, 'teo'), await connecter(app, 'admin')];
  const appel = (h: H, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const compte = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const lame = (await appel(antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const zeta = (await appel(antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'joueur')").run(lame.id, compte('lea'));
  assert.equal((await appel(admin, 'POST', `/api/instance/systemes/${zeta.id}/membres`, { username: 'antor' })).statusCode, 201);
  const autre = (await appel(antor, 'POST', '/api/systemes', { nom: 'Autre' })).json();
  const jeton = async (h: H, extra: object, nom = 'k') => {
    const r = await appel(h, 'POST', '/api/compte/jetons', { nom, dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' }, ...extra });
    assert.equal(r.statusCode, 201, r.body);
    return { authorization: `Bearer ${r.json().valeur ?? r.json().jeton.valeur}` };
  };
  const v1 = (h: Record<string, string>, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, payload?: object, extra: Record<string, string> = {}) =>
    app.inject({ method, url: `/api/v1${url}`, headers: { ...h, ...extra }, payload });
  return { app, antor, lea, teo, admin, appel, compte, lame, zeta, autre, jeton, v1 };
}
type W = Awaited<ReturnType<typeof monde>>;

const elem = { type: 'objet', titre: 'Épée runique', sections: [{ cle: 'description', titre: 'Description', joueursLisent: true }, { cle: 'secret', titre: 'Secret', joueursLisent: false }] };

test('écriture : un MJ du système crée un objet, le relit, écrit une section avec empreinte, la retire, supprime l’élément', async () => {
  const w = await monde();
  const k = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const info = await w.v1(k, 'GET', `/systemes/${w.zeta.id}`);
  assert.equal(info.statusCode, 200, info.body);
  assert.deepEqual(info.json(), { id: w.zeta.id, nom: 'Zeta', niveau: 'ecriture' });
  const c = await w.v1(k, 'POST', `/systemes/${w.zeta.id}/fiches`, elem);
  assert.equal(c.statusCode, 201, c.body);
  const id = c.json().id;
  const espace = (w.app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(w.zeta.id) as Any).id;
  assert.equal((w.app.db.prepare('SELECT univers_id, type FROM fiches WHERE id = ?').get(id) as Any).univers_id, espace);
  const lu = await w.v1(k, 'GET', `/systemes/${w.zeta.id}/fiches/${id}`);
  assert.equal(lu.statusCode, 200, lu.body);
  assert.equal(lu.json().entete.titre, 'Épée runique');
  assert.equal(lu.json().entete.type, 'objet');
  const liste = await w.v1(k, 'GET', `/systemes/${w.zeta.id}/fiches`);
  assert.deepEqual(liste.json().fiches.map((f: Any) => f.id), [id]);
  // section: create, then rewrite under If-Match
  const s1 = await w.v1(k, 'PUT', `/systemes/${w.zeta.id}/fiches/${id}/sections/notes`, { titre: 'Notes', contenu: 'un', joueursLisent: true });
  assert.equal(s1.statusCode, 200, s1.body);
  assert.ok(s1.json().empreinte, s1.body);
  const perime = await w.v1(k, 'PUT', `/systemes/${w.zeta.id}/fiches/${id}/sections/notes`, { contenu: 'deux' }, { 'if-match': `"${'0'.repeat(s1.json().empreinte.length)}"` });
  assert.equal(perime.statusCode, 412, perime.body);
  const s2 = await w.v1(k, 'PUT', `/systemes/${w.zeta.id}/fiches/${id}/sections/notes`, { contenu: 'deux' }, { 'if-match': `"${s1.json().empreinte}"` });
  assert.equal(s2.statusCode, 200, s2.body);
  assert.equal((w.app.db.prepare("SELECT contenu FROM sections WHERE fiche_id = ? AND cle = 'notes'").get(id) as Any).contenu, 'deux');
  const p = await w.v1(k, 'PATCH', `/systemes/${w.zeta.id}/fiches/${id}`, { titre: 'Épée d’aube' });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal((await w.v1(k, 'GET', `/systemes/${w.zeta.id}/fiches/${id}`)).json().entete.titre, 'Épée d’aube');
  assert.equal((await w.v1(k, 'DELETE', `/systemes/${w.zeta.id}/fiches/${id}/sections/notes`)).statusCode, 204);
  assert.equal((w.app.db.prepare("SELECT COUNT(*) n FROM sections WHERE fiche_id = ? AND cle = 'notes'").get(id) as Any).n, 0);
  assert.equal((await w.v1(k, 'DELETE', `/systemes/${w.zeta.id}/fiches/${id}`)).statusCode, 204);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(id) as Any).n, 0);
  assert.equal((await w.v1(k, 'GET', `/systemes/${w.zeta.id}/fiches/${id}`)).statusCode, 404);
  await w.app.close();
});

test('jeton lecture : la lecture passe, toute écriture rend 403 lecture_seule et ne change rien', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  const k = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] }, 'l');
  assert.equal((await w.v1(k, 'GET', `/systemes/${w.zeta.id}`)).json().niveau, 'lecture');
  assert.equal((await w.v1(k, 'GET', `/systemes/${w.zeta.id}/fiches/${id}`)).statusCode, 200);
  assert.equal((await w.v1(k, 'GET', `/systemes/${w.zeta.id}/fiches`)).statusCode, 200);
  const n0 = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n;
  const ecritures: [any, string, object?][] = [
    ['POST', `/systemes/${w.zeta.id}/fiches`, elem],
    ['PATCH', `/systemes/${w.zeta.id}/fiches/${id}`, { titre: 'x' }],
    ['DELETE', `/systemes/${w.zeta.id}/fiches/${id}`],
    ['PUT', `/systemes/${w.zeta.id}/fiches/${id}/sections/a`, { titre: 'a', contenu: 'x' }],
    ['DELETE', `/systemes/${w.zeta.id}/fiches/${id}/sections/a`],
  ];
  for (const [m, u, b] of ecritures) {
    const r = await w.v1(k, m, u, b);
    assert.equal(r.statusCode, 403, `${m} ${u}: ${r.body}`);
    assert.equal(r.json().code, 'lecture_seule');
  }
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n, n0);
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(id) as Any).titre, 'Épée runique');
  await w.app.close();
});

test('compte seulement lecteur du système, jeton écriture : lit, et reçoit 403 refuse en écrivant', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  // lea reads Zeta as a player; a write token cannot be created for her, so the row is laid by hand.
  const kl = await w.jeton(w.lea, {});
  const jid = (w.app.db.prepare('SELECT id FROM jetons_api WHERE compte_id = ? ORDER BY id DESC').get(w.compte('lea')) as Any).id;
  w.app.db.prepare("INSERT INTO jetons_systemes (jeton_id, systeme_id, niveau) VALUES (?, ?, 'ecriture')").run(jid, w.zeta.id);
  const info = await w.v1(kl, 'GET', `/systemes/${w.zeta.id}`);
  assert.equal(info.statusCode, 200, info.body);
  assert.equal(info.json().niveau, 'lecture');
  const lu = await w.v1(kl, 'GET', `/systemes/${w.zeta.id}/fiches/${id}`);
  assert.equal(lu.statusCode, 200, lu.body);
  assert.deepEqual(lu.json().sections.map((s: Any) => s.titre), ['Description'], 'player level: public sections only');
  const n0 = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n;
  const ecritures: [any, string, object?][] = [
    ['POST', `/systemes/${w.zeta.id}/fiches`, elem],
    ['PATCH', `/systemes/${w.zeta.id}/fiches/${id}`, { titre: 'x' }],
    ['DELETE', `/systemes/${w.zeta.id}/fiches/${id}`],
    ['PUT', `/systemes/${w.zeta.id}/fiches/${id}/sections/a`, { titre: 'a', contenu: 'x' }],
    ['DELETE', `/systemes/${w.zeta.id}/fiches/${id}/sections/a`],
  ];
  for (const [m, u, b] of ecritures) {
    const r = await w.v1(kl, m, u, b);
    assert.equal(r.statusCode, 403, `${m} ${u}: ${r.body}`);
    assert.notEqual(r.json().code, 'lecture_seule');
    assert.equal(r.json().message, 'Action réservée au MJ.');
  }
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n, n0);
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(id) as Any).titre, 'Épée runique');
  await w.app.close();
});

test('un même 404 : sans droit, sans ligne, id inconnu ou non entier ; un jeton d’outils seul : 401 ; jeton sans ligne ailleurs', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  const sansLigne = await w.jeton(w.antor, {}, 's');
  const teo = await w.jeton(w.teo, {}, 't');
  w.app.db.prepare("INSERT INTO jetons_systemes (jeton_id, systeme_id, niveau) VALUES ((SELECT id FROM jetons_api WHERE compte_id = ? ORDER BY id DESC), ?, 'lecture')").run(w.compte('teo'), w.zeta.id);
  const cas: [Record<string, string>, string][] = [
    [sansLigne, `/systemes/${w.zeta.id}`],
    [sansLigne, `/systemes/${w.zeta.id}/fiches`],
    [teo, `/systemes/${w.zeta.id}`],            // a row, but the account reads nothing of the system
    [teo, `/systemes/${w.zeta.id}/fiches/${id}`],
    [ke, `/systemes/${w.zeta.id + 999}`],
    [ke, '/systemes/abc'],
    [ke, '/systemes/1.5'],
    [ke, '/systemes/-1/fiches'],
    [ke, `/systemes/${w.autre.id}/fiches`],      // a system the token has no row on
  ];
  const corps = new Set<string>();
  for (const [h, u] of cas) {
    const r = await w.v1(h, 'GET', u);
    assert.equal(r.statusCode, 404, `${u}: ${r.body}`);
    corps.add(r.body);
  }
  assert.equal(corps.size, 1, `same body for all: ${[...corps].join(' | ')}`);
  for (const m of ['POST', 'PATCH', 'DELETE'] as const) {
    assert.equal((await w.v1(teo, m, `/systemes/${w.zeta.id}/fiches${m === 'POST' ? '' : `/${id}`}`, m === 'DELETE' ? undefined : { ...elem })).statusCode, 404, m);
  }
  // tool-only token
  const outils = await w.appel(w.antor, 'POST', '/api/compte/jetons', { nom: 'o', dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' }, contenu: false, outils: ['essai/g'] });
  const ko = { authorization: `Bearer ${outils.json().valeur ?? outils.json().jeton.valeur}` };
  const r = await w.v1(ko, 'GET', `/systemes/${w.zeta.id}`);
  assert.equal(r.statusCode, 401, r.body);
  assert.equal(r.json().code, 'jeton_invalide');
  assert.equal((await w.v1({}, 'GET', `/systemes/${w.zeta.id}`)).statusCode, 401);
  await w.app.close();
});

test('routes qui n’existent pas pour un système : relations, export, lots, historique, fichiers → 404 ; ?lot= → 400 ; l’alias n’en sait rien', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  const s = `/systemes/${w.zeta.id}`;
  for (const [m, u] of [['GET', `${s}/relations`], ['POST', `${s}/relations`], ['GET', `${s}/export`], ['POST', `${s}/lots`], ['GET', `${s}/historique`],
    ['GET', `${s}/fichiers`], ['GET', `${s}/cartes`], ['GET', `${s}/fiches/${id}/relations`], ['GET', `${s}/fiches/${id}/historique`]] as const) {
    const r = await w.v1(ke, m, u, m === 'POST' ? {} : undefined);
    assert.equal(r.statusCode, 404, `${m} ${u}: ${r.body}`);
  }
  for (const [m, u, b] of [['GET', `${s}/fiches`], ['GET', `${s}`], ['POST', `${s}/fiches`, elem], ['PATCH', `${s}/fiches/${id}`, { titre: 'x' }], ['DELETE', `${s}/fiches/${id}`]] as [any, string, object?][]) {
    const r = await w.v1(ke, m, `${u}?lot=1`, b);
    assert.equal(r.statusCode, 400, `${m} ${u}: ${r.body}`);
    assert.equal(r.json().champ, 'lot');
  }
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(id) as Any).titre, 'Épée runique');
  const alias = await w.app.inject({ method: 'GET', url: `/api/import/v1/systemes/${w.zeta.id}`, headers: ke });
  assert.equal(alias.statusCode, 404);
  await w.app.close();
});

test('le même jeton lit toujours ses univers ; l’origine d’historique des écritures est import', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const r = await w.v1(ke, 'GET', `/univers/${w.lame.id}/fiches`);
  assert.equal(r.statusCode, 200, r.body);
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  const h = w.app.db.prepare("SELECT origine FROM historique WHERE fiche_id = ?").all(id) as Any[];
  assert.ok(h.length > 0);
  assert.ok(h.every((x) => x.origine === 'import'), JSON.stringify(h));
  await w.app.close();
});

test('porte de l’univers : un jeton sans ligne de système lit l’élément et le trouve en liste ; export et historique n’en portent aucun ; 404 sur /systemes', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  await w.v1(ke, 'PUT', `/systemes/${w.zeta.id}/fiches/${id}/sections/description`, { contenu: 'visible' });
  const pr = await w.appel(w.antor, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'lieu', titre: 'Port' });
  assert.equal(pr.statusCode, 201, pr.body);
  const propre = pr.json();
  for (const [nom, h] of [['antor', await w.jeton(w.antor, {}, 'u')], ['lea', await w.jeton(w.lea, {}, 'u')]] as const) {
    const un = await w.v1(h, 'GET', `/univers/${w.lame.id}/fiches/id/${id}`);
    assert.equal(un.statusCode, 200, `${nom}: ${un.body}`);
    assert.equal(un.json().entete.titre, 'Épée runique');
    assert.ok(!un.json().sections.some((s: Any) => s.titre === 'Secret'), `${nom}: GM-only section leaks`);
    assert.ok(un.json().sections.some((s: Any) => s.titre === 'Description'));
    const l = await w.v1(h, 'GET', `/univers/${w.lame.id}/fiches`);
    const ids = l.json().fiches.map((f: Any) => f.id);
    assert.ok(ids.includes(id), `${nom}: element in list`);
    if (nom === 'antor') assert.ok(ids.includes(propre.id));
    assert.equal((await w.v1(h, 'GET', `/systemes/${w.zeta.id}`)).statusCode, 404);
    const ex = await w.v1(h, 'GET', `/univers/${w.lame.id}/export`);
    assert.equal(ex.statusCode, 200, ex.body);
    assert.ok(!ex.body.includes('Épée runique'), `${nom}: export carries the element`);
    const hi = await w.v1(h, 'GET', `/univers/${w.lame.id}/historique`);
    assert.equal(hi.statusCode, nom === 'antor' ? 200 : 403, hi.body);
    assert.ok(!hi.body.includes('Épée runique') && !hi.body.includes(`"ficheId":${id},`), `${nom}: history carries the element`);
  }
  await w.app.close();
});

test('porte de l’univers : un compte qui ne lit pas le système, ou un univers sans système, ne voit aucun élément', async () => {
  const w = await monde();
  const ke = await w.jeton(w.antor, { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
  const id = (await w.v1(ke, 'POST', `/systemes/${w.zeta.id}/fiches`, elem)).json().id;
  // an unattached universe of antor's: the element is unknown there
  const nu = (await w.appel(w.antor, 'POST', '/api/univers', { nom: 'Nu' })).json();
  const h = await w.jeton(w.antor, {}, 'n');
  assert.equal((await w.v1(h, 'GET', `/univers/${nu.id}/fiches/id/${id}`)).statusCode, 404);
  assert.deepEqual((await w.v1(h, 'GET', `/univers/${nu.id}/fiches`)).json().fiches, []);
  // lea leaves Lame: she no longer reads Zeta
  w.app.db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(w.lame.id, w.compte('lea'));
  const hl = await w.jeton(w.lea, {}, 'l');
  assert.equal((await w.v1(hl, 'GET', `/univers/${w.lame.id}/fiches/id/${id}`)).statusCode, 404);
  // an id of Lame's own sheets still resolves; an element is not reachable by a key
  const cle = (w.app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(id) as Any).cle;
  assert.equal((await w.v1(h, 'GET', `/univers/${w.lame.id}/fiches/${cle}`)).statusCode, 404);
  await w.app.close();
});
