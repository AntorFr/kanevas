import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PUT' | 'PATCH';

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

/** Lame d'Ébène: Antor MJ, Léa and Teo players. Everything goes through HTTP. */
async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'teo' });
  return { app, antor, lea, teo, base };
}

async function campagne(app: App, h: Hote, base: string, nom: string) {
  const res = await appel(app, h, 'POST', `${base}/campagnes`, { nom });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as { id: number; nom: string; statut: string };
}

test('critère : Antor crée, active et termine une campagne ; Léa la lit, groupée par statut puis nom', async () => {
  const { app, antor, lea, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  assert.equal(c.statut, 'en_preparation');
  const act = await appel(app, antor, 'PATCH', `/api/campagnes/${c.id}`, { statut: 'active' });
  assert.equal(act.statusCode, 200);
  assert.equal(act.json().statut, 'active');
  const b = await campagne(app, antor, base, 'Brume');
  const a = await campagne(app, antor, base, 'Aube');
  const z = await campagne(app, antor, base, 'Zéphyr');
  await appel(app, antor, 'PATCH', `/api/campagnes/${z.id}`, { statut: 'terminee' });
  const ter = await appel(app, antor, 'PATCH', `/api/campagnes/${c.id}`, { statut: 'terminee' });
  assert.equal(ter.json().statut, 'terminee');
  await appel(app, antor, 'PATCH', `/api/campagnes/${c.id}`, { statut: 'active' });

  const vue = await appel(app, lea, 'GET', `${base}/campagnes/${c.id}`);
  assert.equal(vue.statusCode, 200);
  assert.equal(vue.json().nom, 'La Couronne brisée');
  assert.equal(vue.json().statut, 'active');
  const liste = await appel(app, lea, 'GET', `${base}/campagnes`);
  assert.deepEqual(
    liste.json().campagnes.map((x: { nom: string; statut: string }) => [x.nom, x.statut]),
    [
      ['La Couronne brisée', 'active'],
      ['Aube', 'en_preparation'],
      ['Brume', 'en_preparation'],
      ['Zéphyr', 'terminee'],
    ],
  );
  assert.ok(b.id && a.id);
});

test('exclusions : Léa ne crée ni ne change une campagne ; statut inconnu et corps faux : 400', async () => {
  const { app, antor, lea, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  assert.equal((await appel(app, lea, 'POST', `${base}/campagnes`, { nom: 'X' })).statusCode, 403);
  const patch = await appel(app, lea, 'PATCH', `/api/campagnes/${c.id}`, { statut: 'active' });
  assert.ok([403, 404].includes(patch.statusCode), String(patch.statusCode));
  assert.equal((await appel(app, antor, 'GET', `${base}/campagnes/${c.id}`)).json().statut, 'en_preparation');
  assert.equal((await appel(app, antor, 'PATCH', `/api/campagnes/${c.id}`, { statut: 'close' })).statusCode, 400);
  assert.equal((await appel(app, antor, 'PATCH', `/api/campagnes/${c.id}`, {})).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', `${base}/campagnes`, { nom: 3 })).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', `${base}/campagnes`, { nom: '' })).statusCode, 400);
  assert.equal((await appel(app, antor, 'GET', `${base}/campagnes/999999`)).statusCode, 404);
});

test('critère : Antor écrit un scénario et coche puis décoche « Plan de la crypte »', async () => {
  const { app, antor, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  const cree = await appel(app, antor, 'POST', `/api/campagnes/${c.id}/scenarios`, { titre: 'La crypte' });
  assert.equal(cree.statusCode, 201, cree.body);
  const s = cree.json();
  const w = await appel(app, antor, 'PUT', `/api/scenarios/${s.id}`, {
    titre: 'La crypte',
    contenu: 'Les héros descendent.',
    version: s.version,
  });
  assert.equal(w.statusCode, 200, w.body);
  assert.equal(w.json().contenu, 'Les héros descendent.');
  assert.equal(w.json().version, s.version + 1);
  assert.equal((await appel(app, antor, 'GET', `/api/scenarios/${s.id}`)).json().contenu, 'Les héros descendent.');
  const liste = await appel(app, antor, 'GET', `/api/campagnes/${c.id}/scenarios`);
  assert.deepEqual(liste.json().scenarios.map((x: { titre: string }) => x.titre), ['La crypte']);

  const t = await appel(app, antor, 'POST', `/api/campagnes/${c.id}/taches`, {
    categorie: 'cartes',
    libelle: 'Plan de la crypte',
  });
  assert.equal(t.statusCode, 201, t.body);
  assert.equal(t.json().categorie, 'cartes');
  assert.equal(t.json().faite, false);
  const coche = await appel(app, antor, 'PUT', `/api/taches/${t.json().id}`, { faite: true });
  assert.equal(coche.json().faite, true);
  assert.notEqual(coche.json().faiteLe, null);
  const decoche = await appel(app, antor, 'PUT', `/api/taches/${t.json().id}`, { faite: false });
  assert.equal(decoche.json().faite, false);
  assert.equal(decoche.json().faiteLe, null);
  const taches = await appel(app, antor, 'GET', `/api/campagnes/${c.id}/taches`);
  assert.equal(taches.json().taches[0].faite, false);
  // Wrong inputs.
  assert.equal(
    (await appel(app, antor, 'POST', `/api/campagnes/${c.id}/taches`, { categorie: 'dragons', libelle: 'x' })).statusCode,
    400,
  );
  assert.equal((await appel(app, antor, 'PUT', `/api/taches/${t.json().id}`, { faite: 'oui' })).statusCode, 400);
  assert.equal(
    (await appel(app, antor, 'PUT', `/api/scenarios/${s.id}`, { titre: 'a', contenu: 'b' })).statusCode,
    400,
  );
});

test('exclusion : Léa reçoit 404 partout en scénario et préparation, rien n’en fuit', async () => {
  const { app, antor, lea, teo, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  const s = (
    await appel(app, antor, 'POST', `/api/campagnes/${c.id}/scenarios`, { titre: 'Secret', contenu: 'Le roi est mort.' })
  ).json();
  const t = (
    await appel(app, antor, 'POST', `/api/campagnes/${c.id}/taches`, { categorie: 'cartes', libelle: 'Plan de la crypte' })
  ).json();
  const inconnu = await appel(app, lea, 'GET', `/api/scenarios/999999`);
  const reponses = [
    await appel(app, lea, 'GET', `/api/campagnes/${c.id}/scenarios`),
    await appel(app, lea, 'POST', `/api/campagnes/${c.id}/scenarios`, { titre: 'Piège' }),
    await appel(app, lea, 'GET', `/api/scenarios/${s.id}`),
    await appel(app, lea, 'PUT', `/api/scenarios/${s.id}`, { titre: 'a', contenu: 'b', version: s.version }),
    await appel(app, lea, 'GET', `/api/campagnes/${c.id}/taches`),
    await appel(app, lea, 'POST', `/api/campagnes/${c.id}/taches`, { categorie: 'autre', libelle: 'Piège' }),
    await appel(app, lea, 'PUT', `/api/taches/${t.id}`, { faite: true }),
    await appel(app, teo, 'GET', `/api/scenarios/${s.id}`),
  ];
  for (const r of reponses) {
    assert.equal(r.statusCode, 404, r.body);
    assert.equal(r.body, inconnu.body, 'distinguable d’un identifiant inconnu');
  }
  // Nothing written by Léa; what she can read never mentions them.
  const lecteurs = [
    await appel(app, lea, 'GET', `${base}/campagnes`),
    await appel(app, lea, 'GET', `${base}/campagnes/${c.id}`),
    await appel(app, lea, 'GET', `${base}/comptes-rendus`),
  ];
  for (const r of lecteurs) {
    assert.equal(r.statusCode, 200);
    assert.ok(!/scenario|sc[ée]nario|tache|tâche|Plan de la crypte|roi est mort/i.test(r.body), r.body);
  }
  assert.equal((await appel(app, antor, 'GET', `/api/scenarios/${s.id}`)).json().contenu, 'Le roi est mort.');
  assert.equal((await appel(app, antor, 'GET', `/api/campagnes/${c.id}/taches`)).json().taches[0].faite, false);
  assert.equal((await appel(app, antor, 'GET', `/api/campagnes/${c.id}/scenarios`)).json().scenarios.length, 1);
});

test('critère : deux écritures sur la même version, la seconde reçoit 409 scenario_modifie', async () => {
  const { app, antor, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  const s = (await appel(app, antor, 'POST', `/api/campagnes/${c.id}/scenarios`, { titre: 'La crypte' })).json();
  const premiere = await appel(app, antor, 'PUT', `/api/scenarios/${s.id}`, { titre: 'La crypte', contenu: 'Première.', version: s.version });
  assert.equal(premiere.statusCode, 200);
  const seconde = await appel(app, antor, 'PUT', `/api/scenarios/${s.id}`, { titre: 'La crypte', contenu: 'Seconde.', version: s.version });
  assert.equal(seconde.statusCode, 409);
  assert.equal(seconde.json().code, 'scenario_modifie');
  assert.equal((await appel(app, antor, 'GET', `/api/scenarios/${s.id}`)).json().contenu, 'Première.');
});

test('critère : compte-rendu de Léa lu par Teo sans écriture, en tête des deux listes ; section fermée → 404 pour Teo, Léa le lit', async () => {
  const { app, antor, lea, teo, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  const autre = await campagne(app, antor, base, 'Brume');
  const vieux = await appel(app, antor, 'POST', `${base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 0', texte: 'Intro.' });
  assert.equal(vieux.statusCode, 201, vieux.body);
  await appel(app, antor, 'POST', `${base}/comptes-rendus`, { campagneId: autre.id, titre: 'Autre campagne' });
  await new Promise((r) => setTimeout(r, 5));
  const cr = await appel(app, lea, 'POST', `${base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 1', texte: 'Ils ont fui.' });
  assert.equal(cr.statusCode, 201, cr.body);
  const fiche = cr.json();

  const lu = await appel(app, teo, 'GET', `${base}/fiches/${fiche.id}`);
  assert.equal(lu.statusCode, 200);
  assert.equal(lu.json().sections[0].contenu, 'Ils ont fui.');
  const sid = lu.json().sections[0].id;
  const ecr = await appel(app, teo, 'PUT', `${base}/fiches/${fiche.id}/sections/${sid}/contenu`, { contenu: 'Piraté', version: lu.json().sections[0].version ?? 0 });
  assert.ok(ecr.statusCode >= 400 && ecr.statusCode < 500, String(ecr.statusCode));
  assert.equal((await appel(app, teo, 'GET', `${base}/fiches/${fiche.id}`)).json().sections[0].contenu, 'Ils ont fui.');

  const titres = (r: { json: () => { comptesRendus: { titre: string }[] } }) => r.json().comptesRendus.map((x) => x.titre);
  assert.equal(titres(await appel(app, teo, 'GET', `${base}/comptes-rendus`))[0], 'Séance 1');
  assert.deepEqual(titres(await appel(app, teo, 'GET', `${base}/campagnes/${c.id}/comptes-rendus`)), ['Séance 1', 'Séance 0']);
  assert.deepEqual(titres(await appel(app, teo, 'GET', `${base}/comptes-rendus?campagne=${c.id}`)), ['Séance 1', 'Séance 0']);
  assert.deepEqual(titres(await appel(app, teo, 'GET', `${base}/comptes-rendus?campagne=${autre.id}`)), ['Autre campagne']);

  const ferme = await appel(app, antor, 'PATCH', `${base}/fiches/${fiche.id}/sections/${sid}`, { joueursLisent: false });
  assert.equal(ferme.statusCode, 200, ferme.body);
  assert.equal((await appel(app, teo, 'GET', `${base}/fiches/${fiche.id}`)).statusCode, 404);
  for (const url of [`${base}/comptes-rendus`, `${base}/campagnes/${c.id}/comptes-rendus`]) {
    const r = await appel(app, teo, 'GET', url);
    assert.ok(!titres(r).includes('Séance 1'), r.body);
    assert.ok(!r.body.includes('Ils ont fui'), r.body);
  }
  assert.equal((await appel(app, lea, 'GET', `${base}/fiches/${fiche.id}`)).statusCode, 200);
  assert.ok(titres(await appel(app, lea, 'GET', `${base}/comptes-rendus`)).includes('Séance 1'));
  assert.ok(titres(await appel(app, lea, 'GET', `${base}/campagnes/${c.id}/comptes-rendus`)).includes('Séance 1'));
});

test('échecs : compte-rendu sur campagne étrangère, inconnue ou corps faux', async () => {
  const { app, antor, lea, base } = await monter();
  const autreUnivers = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Autre' })).json();
  const etrangere = await campagne(app, antor, `/api/univers/${autreUnivers.id}`, 'Ailleurs');
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  assert.equal((await appel(app, lea, 'POST', `${base}/comptes-rendus`, { campagneId: etrangere.id, titre: 'X' })).statusCode, 404);
  assert.equal((await appel(app, lea, 'POST', `${base}/comptes-rendus`, { campagneId: 999999, titre: 'X' })).statusCode, 404);
  assert.equal((await appel(app, lea, 'POST', `${base}/comptes-rendus`, { campagneId: '1', titre: 'X' })).statusCode, 400);
  assert.equal((await appel(app, lea, 'POST', `${base}/comptes-rendus`, { campagneId: c.id, titre: '' })).statusCode, 400);
  assert.equal((await appel(app, lea, 'GET', `${base}/comptes-rendus?curseur=n-importe-quoi`)).statusCode, 400);
  assert.equal((await appel(app, lea, 'GET', `${base}/comptes-rendus?campagne=abc`)).statusCode, 404);
  // Nothing was stored.
  assert.equal((await appel(app, lea, 'GET', `${base}/comptes-rendus`)).json().comptesRendus.length, 0);
  // A non-member sees nothing of the universe.
  const chezLea = (await appel(app, lea, 'POST', '/api/univers', { nom: 'Chez Léa' })).json();
  const ailleurs = `/api/univers/${chezLea.id}`;
  assert.equal((await appel(app, antor, 'GET', `${ailleurs}/comptes-rendus`)).statusCode, 404);
  assert.equal((await appel(app, antor, 'GET', `${ailleurs}/campagnes`)).statusCode, 404);
  // Unauthenticated: no access.
  const anon = await app.inject({ method: 'GET', url: `${base}/campagnes` });
  assert.ok(anon.statusCode === 401 || anon.statusCode === 302, String(anon.statusCode));
});

test('bords : 100 comptes-rendus au plus par page et un curseur qui mène au reste', async () => {
  const { app, antor, base } = await monter();
  const c = await campagne(app, antor, base, 'La Couronne brisée');
  for (let i = 0; i < 101; i++) {
    const r = await appel(app, antor, 'POST', `${base}/comptes-rendus`, { campagneId: c.id, titre: `CR ${i}` });
    assert.equal(r.statusCode, 201);
  }
  const p1 = (await appel(app, antor, 'GET', `${base}/comptes-rendus`)).json();
  assert.equal(p1.comptesRendus.length, 100);
  assert.equal(typeof p1.suivant, 'string');
  assert.equal(p1.comptesRendus[0].titre, 'CR 100');
  const p2 = (await appel(app, antor, 'GET', `${base}/comptes-rendus?curseur=${p1.suivant}`)).json();
  assert.deepEqual(p2.comptesRendus.map((x: { titre: string }) => x.titre), ['CR 0']);
  assert.equal(p2.suivant, null);
  const pc = (await appel(app, antor, 'GET', `${base}/campagnes/${c.id}/comptes-rendus`)).json();
  assert.equal(pc.comptesRendus.length, 100);
  assert.equal(typeof pc.suivant, 'string');
});
