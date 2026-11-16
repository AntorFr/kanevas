// Doors of lot « acces » (docs/tests-ecran/lot-acces.md): what the screen tests of `src/e2e/import-fil-*.test.ts`
// proved through the browser, proved here through the API (Fastify `inject`, no browser).
// Tokens are made through the session route like the E-18 screen does; the server clock is moved with `app.horloge`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;

const T0 = Date.parse('2026-10-12T10:00:00Z');
const JOUR = 86400_000;
const SECRET = 'sous-main de la Guilde';
const UNIQUE = { message: 'Jeton invalide.', code: 'jeton_invalide' };
const PORT_SEL = {
  type: 'lieu',
  titre: 'Port-Sel',
  creeLe: '2021-03-03T12:00:00Z',
  sections: [
    { cle: 'description', titre: 'Description', contenu: 'Un port de sel gris sous les brumes.', joueursLisent: true, joueursEcrivent: false },
    { cle: 'verite', titre: 'Vérité', contenu: `Le phare cache un ${SECRET}.`, joueursLisent: false, joueursEcrivent: false },
  ],
};

async function connecter(app: App, compte: string) {
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

/** A world: Antor GM of « Essai » and « Autre », Léa a player of « Essai ». The clock is `monde.regler`. */
async function monde() {
  const app = await buildApp();
  let t = T0;
  app.horloge = () => new Date(t);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const cree = async (nom: string) => (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom } })).json() as { id: number };
  const essai = (await cree('Essai')).id;
  const autre = (await cree('Autre')).id;
  const r = await app.inject({ method: 'POST', url: `/api/univers/${essai}/membres`, headers: antor, payload: { username: 'lea', role: 'joueur' } });
  assert.equal(r.statusCode, 201, r.body);
  const m = {
    app,
    antor,
    lea,
    mira,
    essai,
    autre,
    regler: (v: number) => (t = v),
    /** A call of the session API as a stub account. */
    async rest(h: { cookie: string }, methode: string, url: string, payload?: unknown) {
      return app.inject({ method: methode as 'GET', url, headers: h, payload: payload as object | undefined });
    },
    /** A call of the import API with a Bearer token. */
    async imp(jeton: string | null, methode: string, chemin: string, corps?: unknown, univers = essai) {
      const headers: Record<string, string> = {};
      if (jeton !== null) headers.authorization = `Bearer ${jeton}`;
      return app.inject({ method: methode as 'GET', url: `/api/import/v1/univers/${univers}${chemin}`, headers, payload: corps as object | undefined });
    },
    async jeton(h = antor, nom = 'Script Kanka — Mac', dureeJours = 30, univers = essai): Promise<string> {
      const r = await app.inject({ method: 'POST', url: '/api/compte/jetons', headers: h, payload: { nom, dureeJours, acces: surUnivers(univers) } });
      assert.equal(r.statusCode, 201, r.body);
      return r.json().valeur;
    },
    pousser: (jeton: string, cle: string, corps: unknown, lot?: number) =>
      m.imp(jeton, 'PUT', `/fiches/${encodeURIComponent(cle)}${lot === undefined ? '' : `?lot=${lot}`}`, corps),
    async lotComplet(jeton: string, fiches: [string, unknown][]) {
      const ouvert = await m.imp(jeton, 'POST', '/lots');
      assert.equal(ouvert.statusCode, 201, ouvert.body);
      const lot = ouvert.json().lotId as number;
      const reps = [];
      for (const [cle, corps] of fiches) reps.push(await m.pousser(jeton, cle, corps, lot));
      const clos = await m.imp(jeton, 'POST', `/lots/${lot}/clore`);
      assert.equal(clos.statusCode, 200, clos.body);
      return { lot, reps, rapport: clos.json() };
    },
  };
  return m;
}

/** The accesses of a token that writes in one universe only (B-94). */
const surUnivers = (universId: number) => ({ tous: false, univers: [{ universId, niveau: 'ecriture' }] });

async function lots(m: Awaited<ReturnType<typeof monde>>, univers = m.essai) {
  return (await m.rest(m.antor, 'GET', `/api/univers/${univers}/lots`)).json() as Array<{ id: number; etat: string; compteurs: Record<string, Record<string, number>> }>;
}
async function jetons(m: Awaited<ReturnType<typeof monde>>) {
  return (await m.rest(m.antor, 'GET', '/api/compte/jetons')).json().jetons as Array<Record<string, any>>;
}

// ---------------------------------------------------------------- B-45

test('B-45 token creation > the value is shown once, the listing never carries it, and it opens the import API', async () => {
  const m = await monde();
  const cree = await m.rest(m.antor, 'POST', '/api/compte/jetons', { nom: 'Script Kanka — Mac', dureeJours: 30, acces: surUnivers(m.essai) });
  assert.equal(cree.statusCode, 201, cree.body);
  const valeur = cree.json().valeur as string;
  assert.match(valeur, /kvs_[A-Za-z0-9_-]{43}/);
  const liste = await m.rest(m.antor, 'GET', '/api/compte/jetons');
  assert.ok(!liste.body.includes(valeur), 'the listing never carries the value');
  const ligne = liste.json().jetons.find((j: any) => j.nom === 'Script Kanka — Mac');
  assert.equal(ligne.dernierUsageLe, null, 'never used yet');
  assert.equal(ligne.expireLe, new Date(T0 + 30 * JOUR).toISOString(), 'expires 30 days after the creation');
  assert.equal((await m.imp(valeur, 'GET', '')).statusCode, 200);
  assert.ok(!(await m.rest(m.antor, 'GET', '/api/compte/jetons')).body.includes(valeur), 'nor after its use');
  assert.notEqual((await jetons(m)).find((j) => j.nom === 'Script Kanka — Mac')!.dernierUsageLe, null, 'the first use is noted');
});

test('B-45 token creation > the default duration is 30 days, 7 days and 1 year are chosen, an empty name creates nothing', async () => {
  const m = await monde();
  await m.jeton(m.antor, 'Court', 7);
  await m.jeton(m.antor, 'Long', 365);
  const l = await jetons(m);
  assert.equal(l.find((j) => j.nom === 'Court')!.expireLe, new Date(T0 + 7 * JOUR).toISOString());
  assert.equal(l.find((j) => j.nom === 'Long')!.expireLe, new Date(T0 + 365 * JOUR).toISOString());
  const vide = await m.rest(m.antor, 'POST', '/api/compte/jetons', { nom: '', dureeJours: 30, acces: surUnivers(m.essai) });
  assert.equal(vide.statusCode, 400);
  assert.match(vide.json().message, /nom est obligatoire/i);
  assert.equal((await jetons(m)).length, 2, 'nothing half-created');
});

test('B-45 token creation > a name of 81 characters, 0 day and more than a year are refused; 80 characters and 365 days pass', async () => {
  const m = await monde();
  const cree = (nom: string, dureeJours: number) => m.rest(m.antor, 'POST', '/api/compte/jetons', { nom, dureeJours, acces: surUnivers(m.essai) });
  assert.equal((await cree('a'.repeat(80), 30)).statusCode, 201);
  assert.equal((await cree('a'.repeat(81), 30)).statusCode, 400);
  assert.equal((await cree('', 30)).statusCode, 400);
  assert.equal((await cree('x', 0)).statusCode, 400);
  assert.equal((await cree('x', 366)).statusCode, 400);
  assert.equal((await cree('x', 365)).statusCode, 201);
});

test('B-45 exclusions > the token acts in no other universe nor on session routes, the cookie does not open the import API', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  assert.equal((await m.imp(jeton, 'GET', '', undefined, m.autre)).statusCode, 404, 'another universe');
  assert.equal((await m.imp(jeton, 'POST', '/lots', undefined, m.autre)).statusCode, 404);
  assert.equal((await m.pousser(jeton, 'lieu:x', PORT_SEL).then(() => m.imp(jeton, 'PUT', '/fiches/lieu%3Ax', PORT_SEL, m.autre))).statusCode, 404);
  const surSession = await m.app.inject({ method: 'GET', url: `/api/univers/${m.essai}/fiches`, headers: { authorization: `Bearer ${jeton}` } });
  assert.notEqual(surSession.statusCode, 200, 'a Bearer token opens no session route');
  const cookie = await m.app.inject({ method: 'GET', url: `/api/import/v1/univers/${m.essai}`, headers: m.antor });
  assert.equal(cookie.statusCode, 401, 'the cookie is ignored by the import scope');
  assert.deepEqual(cookie.json(), UNIQUE);
  assert.deepEqual(await lots(m, m.autre), [], 'nothing opened in the other universe');
});

test('B-45 player > Léa sees none of Antor’s tokens nor any batch; her own token, capped by her role, opens no batch', async () => {
  const m = await monde();
  await m.jeton();
  const liste = await m.rest(m.lea, 'GET', '/api/compte/jetons');
  assert.equal(liste.statusCode, 200);
  assert.deepEqual(liste.json().jetons, [], 'a token is its owner’s: Antor’s is not in her list');
  assert.notEqual((await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/lots`)).statusCode, 200);
  const sien = await m.jeton(m.lea, 'Jeton de Léa');
  assert.equal((await m.imp(sien, 'GET', '')).statusCode, 200, 'a player reads the context');
  const lot = await m.imp(sien, 'POST', '/lots');
  assert.ok([403, 404].includes(lot.statusCode), `a player opens no batch: ${lot.statusCode}`);
  assert.deepEqual(await lots(m), []);
});

// ---------------------------------------------------------------- B-46

test('B-46 revocation > the revoked token receives 401 with the unique body, opens no batch and writes nothing', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  assert.equal((await m.imp(jeton, 'GET', '')).statusCode, 200);
  const id = (await jetons(m))[0]!.id;
  const r = await m.rest(m.antor, 'DELETE', `/api/compte/jetons/${id}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.notEqual((await jetons(m))[0]!.revoqueLe, null, 'the row says revoked');
  const refus = await m.imp(jeton, 'POST', '/lots');
  assert.equal(refus.statusCode, 401);
  assert.deepEqual(refus.json(), UNIQUE);
  assert.equal((await m.pousser(jeton, 'lieu:port-sel', PORT_SEL)).statusCode, 401);
  assert.deepEqual(await lots(m), []);
  assert.ok(!(await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches?type=lieu`)).body.includes('Port-Sel'), 'nothing written');
});

test('B-46 expiry > a 7-day token is valid at 6 d 23 h, receives 401 at 7 d 1 h, opens no batch and the listing keeps it expired', async () => {
  const m = await monde();
  const jeton = await m.jeton(m.antor, 'Court', 7);
  m.regler(T0 + 6 * JOUR + 23 * 3600_000);
  assert.equal((await m.imp(jeton, 'GET', '')).statusCode, 200);
  m.regler(T0 + 7 * JOUR + 3600_000);
  assert.equal((await m.imp(jeton, 'POST', '/lots')).statusCode, 401);
  assert.equal((await m.pousser(jeton, 'lieu:port-sel', PORT_SEL)).statusCode, 401);
  const ligne = (await jetons(m))[0]!;
  assert.ok(ligne.expireLe <= new Date(T0 + 7 * JOUR + 3600_000).toISOString(), 'its expiry is past');
  assert.equal(ligne.revoqueLe, null, 'expired is not revoked');
  assert.deepEqual(await lots(m), [], 'a refusal opens no batch');
});

test('B-46 refusals > an absent, unknown or malformed token always gets the same 401 and nothing is written', async () => {
  const m = await monde();
  for (const jeton of [null, 'kvs_inconnu', '', 'x'.repeat(300)]) {
    for (const [methode, chemin, corps] of [
      ['GET', '', undefined],
      ['POST', '/lots', undefined],
      ['PUT', `/fiches/${encodeURIComponent('lieu:port-sel')}`, PORT_SEL],
    ] as [string, string, unknown][]) {
      const r = await m.imp(jeton, methode, chemin, corps);
      assert.equal(r.statusCode, 401, `${methode} ${chemin} with ${jeton}`);
      assert.deepEqual(r.json(), UNIQUE);
    }
  }
  const mal = await m.app.inject({ method: 'GET', url: `/api/import/v1/univers/${m.essai}`, headers: { authorization: 'Basic abcdef' } });
  assert.equal(mal.statusCode, 401);
  assert.deepEqual(await lots(m), []);
  assert.ok(!(await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches?type=lieu`)).body.includes('Port-Sel'));
});

// Title kept (the screen inventory cites it): since B-46 revised the player's token is no longer a 401, see the body.
test('B-46 demoted GM > Mira’s token works while she is GM, receives 401 once a player, and is listed inactive; Antor’s token still works', async () => {
  const m = await monde();
  const jetonAntor = await m.jeton();
  const ajout = await m.rest(m.antor, 'POST', `/api/univers/${m.essai}/membres`, { username: 'mira', role: 'mj' });
  assert.equal(ajout.statusCode, 201, ajout.body);
  const jetonMira = await m.jeton(m.mira, 'Jeton de Mira');
  assert.equal((await m.imp(jetonMira, 'GET', '')).statusCode, 200, 'while she is GM');
  const miraId = (m.app.db.prepare('SELECT id FROM comptes WHERE username = ?').get('mira') as { id: number }).id;
  const pa = await m.rest(m.antor, 'PATCH', `/api/univers/${m.essai}/membres/${miraId}`, { role: 'joueur' });
  assert.equal(pa.statusCode, 200, pa.body);
  // B-46 revised (AD-144, AD-jetons-1): a lost role is no longer a 401; the token falls to what a player may,
  // and the batch and import writers need a GM.
  assert.equal((await m.imp(jetonMira, 'GET', '')).statusCode, 200, 'a player still reads the context');
  const r = await m.imp(jetonMira, 'POST', '/lots');
  assert.ok([403, 404].includes(r.statusCode), `a player opens no batch: ${r.statusCode}`);
  const p = await m.pousser(jetonMira, 'lieu:port-sel', PORT_SEL);
  assert.ok([403, 404].includes(p.statusCode), `a player writes no sheet: ${p.statusCode}`);
  assert.equal((await m.imp(jetonAntor, 'GET', '')).statusCode, 200, 'Antor’s token is untouched');
  const ligne = (await m.rest(m.mira, 'GET', '/api/compte/jetons')).json().jetons.find((j: any) => j.nom === 'Jeton de Mira');
  assert.equal(ligne.revoqueLe, null, 'not revoked');
  assert.deepEqual(await lots(m), [], 'no batch');
});

test('B-46 other GM > another GM of the universe sees nor revokes Antor’s token (B-95): 404, and Antor’s token still works', async () => {
  const m = await monde();
  const r = await m.rest(m.antor, 'POST', `/api/univers/${m.essai}/membres`, { username: 'mira', role: 'mj' });
  assert.equal(r.statusCode, 201, r.body);
  const jeton = await m.jeton();
  assert.equal((await m.imp(jeton, 'GET', '')).statusCode, 200);
  const id = (await jetons(m))[0]!.id;
  assert.deepEqual((await m.rest(m.mira, 'GET', '/api/compte/jetons')).json().jetons, [], 'not in the other GM’s list');
  assert.equal((await m.rest(m.mira, 'DELETE', `/api/compte/jetons/${id}`)).statusCode, 404);
  assert.equal((await m.imp(jeton, 'GET', '')).statusCode, 200, 'still valid');
  assert.equal((await m.rest(m.antor, 'DELETE', `/api/compte/jetons/${id}`)).statusCode, 200);
  assert.equal((await m.imp(jeton, 'GET', '')).statusCode, 401);
});

// ---------------------------------------------------------------- B-47

test('B-47 one sheet per origin key > created, replayed unchanged, one sheet with its two sections', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const a = await m.pousser(jeton, 'lieu:port-sel', PORT_SEL);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().etat, 'creee');
  const b = await m.pousser(jeton, 'lieu:port-sel', PORT_SEL);
  assert.equal(b.json().etat, 'inchangee');
  assert.equal(b.json().id, a.json().id, 'same sheet');
  const liste = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches?type=lieu`);
  assert.equal(liste.body.split('Port-Sel').length - 1, 1, 'exactly one Port-Sel');
  const fiche = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${a.json().id}`);
  assert.ok(fiche.body.includes('Description') && fiche.body.includes('Vérité'));
});

test('B-47 one sheet per origin key > the six types are created then replayed without duplicate', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  for (const [type, titre] of [
    ['personnage', 'Aldric le Gris'],
    ['lieu', 'Port-Sel'],
    ['faction', 'Guilde des Brumes'],
    ['objet', 'Sceptre de sel'],
    ['evenement', 'La Grande Marée'],
    ['quete', 'Retrouver le phare'],
  ]) {
    const corps = { type, titre, sections: [{ cle: 's', titre: 'Notes', contenu: 'x', joueursLisent: true, joueursEcrivent: false }] };
    assert.equal((await m.pousser(jeton, `${type}:k`, corps)).json().etat, 'creee', type);
    assert.equal((await m.pousser(jeton, `${type}:k`, corps)).json().etat, 'inchangee', type);
    const liste = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches?type=${type}`);
    assert.equal(liste.body.split(titre).length - 1, 1, `${type}: one sheet «${titre}»`);
  }
});

test('B-47 one sheet per origin key > a changed content is mise_a_jour, the text changes, the replay is inchangee', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  await m.pousser(jeton, 'lieu:port-sel', PORT_SEL);
  const v2 = structuredClone(PORT_SEL);
  v2.sections[0]!.contenu = 'Un port de sel blanc, désormais.';
  const r = await m.pousser(jeton, 'lieu:port-sel', v2);
  assert.equal(r.json().etat, 'mise_a_jour');
  const fiche = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${r.json().id}`);
  assert.ok(fiche.body.includes('Un port de sel blanc, désormais.'));
  assert.ok(!fiche.body.includes('Un port de sel gris'));
  assert.equal((await m.pousser(jeton, 'lieu:port-sel', v2)).json().etat, 'inchangee');
});

test('B-47 refusals > a compte_rendu without campaign (champ campagne) and an unknown type (champ type) get 400 and nothing is written', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const avant = (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches`)).body;
  for (const [cle, type] of [['cr:seance-1', 'compte_rendu'], ['monstre:k', 'monstre']]) {
    const r = await m.pousser(jeton, cle, { type, titre: 'Séance 1', sections: [] });
    assert.equal(r.statusCode, 400, `${type}: ${r.body}`);
    assert.equal(r.json().champ, type === 'compte_rendu' ? 'campagne' : 'type');
    assert.equal(r.json().code, 'invalide');
  }
  assert.equal((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches`)).body, avant, 'nothing written');
});

test('B-47 refusals > an empty or too long title, an empty, too long or « | » key get 400 and nothing is written', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const avant = (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches`)).body;
  const r1 = await m.pousser(jeton, 'lieu:x', { ...PORT_SEL, titre: '' });
  assert.equal(r1.statusCode, 400);
  assert.equal(r1.json().champ, 'titre');
  assert.equal((await m.pousser(jeton, 'lieu:x', { ...PORT_SEL, titre: 'T'.repeat(121) })).statusCode, 400, '121 characters');
  assert.equal((await m.pousser(jeton, 'lieu|x', PORT_SEL)).statusCode, 400, 'key with |');
  assert.equal((await m.pousser(jeton, 'lieu]x', PORT_SEL)).statusCode, 400, 'key with ]');
  assert.equal((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches`)).body, avant, 'nothing written');
  assert.equal((await m.pousser(jeton, 'lieu:x', { ...PORT_SEL, titre: 'T'.repeat(120) })).json().etat, 'creee', 'a title of 120 characters passes');
});

test('B-47 batches > opening twice gives the same batch, closing gives the report, an unknown batch is 404', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const a = (await m.imp(jeton, 'POST', '/lots')).json().lotId;
  assert.equal((await m.imp(jeton, 'POST', '/lots')).json().lotId, a, 'same open batch for the same token');
  await m.pousser(jeton, 'lieu:port-sel', PORT_SEL, a);
  const clos = await m.imp(jeton, 'POST', `/lots/${a}/clore`);
  assert.equal(clos.statusCode, 200);
  assert.equal(clos.json().compteurs.fiches.creees, 1);
  assert.equal(clos.json().compteurs.fiches.inchangees, 0);
  assert.equal((await m.imp(jeton, 'GET', `/lots/${a}`)).statusCode, 200);
  assert.equal((await m.imp(jeton, 'GET', '/lots/99999')).statusCode, 404);
});

// ---------------------------------------------------------------- B-48

test('B-48 protection > a section title renamed in Kanevas is not overwritten by the replay and the report names it', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const un = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json().id;
  const sid = (m.app.db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND titre = ?').get(fid, 'Description') as { id: number }).id;
  const ren = await m.rest(m.antor, 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}`, { titre: 'Aspect du port' });
  assert.equal(ren.statusCode, 200, ren.body);
  const deux = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  assert.match(deux.reps[0]!.json().etat, /inchangee|mise_a_jour/);
  const apres = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}`);
  assert.ok(apres.body.includes('Aspect du port'), 'Antor’s title stays');
  assert.ok(!apres.body.includes('"titre":"Description"'), 'the import did not put « Description » back');
  const rapport = JSON.stringify(deux.rapport);
  assert.match(rapport, /lieu:port-sel/);
  assert.match(rapport, /titre modifié dans Kanevas : non écrasé/);
  assert.match(rapport, /section « Aspect du port »|section « Description »/);
  const ouvert = (await lots(m))[0]!;
  assert.equal(ouvert.compteurs.fiches!.inchangees, 1, 'the lot counts « Fiches : 1 inchangée »');
});

test('B-48 protection > the sheet title changed in the base is not overwritten, the report says so, the rest is written', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const un = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json().id;
  m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Port-Sel-sur-Brume', fid);
  const v2 = structuredClone(PORT_SEL);
  v2.sections[1]!.contenu = `Le phare cache un ${SECRET}, et une cale.`;
  const deux = await m.lotComplet(jeton, [['lieu:port-sel', v2]]);
  assert.equal(deux.reps[0]!.json().etat, 'mise_a_jour', 'the rest is written');
  const apres = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}`);
  assert.ok(apres.body.includes('Port-Sel-sur-Brume'), 'title kept');
  assert.ok(apres.body.includes('et une cale.'), 'the other change is written');
  const rapport = JSON.stringify(deux.rapport);
  assert.match(rapport, /lieu:port-sel/);
  assert.match(rapport, /titre/);
  assert.match(rapport, /non écrasé/);
  const trois = await m.lotComplet(jeton, [['lieu:port-sel', v2]]);
  assert.equal(trois.reps[0]!.json().etat, 'inchangee');
  assert.ok((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}`)).body.includes('Port-Sel-sur-Brume'));
});

test('B-48 protection > the content and the audience of a section changed in Kanevas are not overwritten by the replay', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const un = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json().id;
  const lignes = m.app.db.prepare('SELECT id, titre FROM sections WHERE fiche_id = ?').all(fid) as { id: number; titre: string }[];
  const desc = lignes.find((s) => s.titre === 'Description')!.id;
  const ver = lignes.find((s) => s.titre === 'Vérité')!.id;
  const lue = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}`);
  const w = await m.rest(m.antor, 'PUT', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}/contenu`, { contenu: 'Texte de Léa et d’Antor.', version: lue.json().version });
  assert.equal(w.statusCode, 200, w.body);
  const p = await m.rest(m.antor, 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${ver}`, { joueursLisent: true });
  assert.equal(p.statusCode, 200, p.body);
  const deux = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const apres = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}`);
  assert.ok(apres.body.includes('Texte de Léa et d’Antor.'), 'human content stays');
  assert.ok(!apres.body.includes('Un port de sel gris'));
  const v = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${ver}`);
  assert.equal(v.json().audience.joueursLisent, true, 'human audience stays');
  const rapport = JSON.stringify(deux.rapport);
  assert.match(rapport, /Description/);
  assert.match(rapport, /Vérité/);
  assert.match(rapport, /non écrasée/);
});

// ---------------------------------------------------------------- B-49 (lots listed to the GM)

test('B-49 batches listed > two batches, the most recent first, each closed with its counters and its token named', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  assert.deepEqual(await lots(m), [], 'no batch yet');
  await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  m.regler(T0 + 3600_000);
  await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const l = (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/lots`)).json() as Array<Record<string, any>>;
  assert.equal(l.length, 2);
  assert.equal(l[0]!.compteurs.fiches.inchangees, 1, 'the most recent first: « 1 inchangée »');
  assert.equal(l[1]!.compteurs.fiches.creees, 1, 'then « 1 créée »');
  assert.ok(l.every((x) => x.etat === 'clos'), 'both closed');
  assert.ok(l.every((x) => JSON.stringify(x).includes('Script Kanka — Mac')), 'the token is named on each batch');
});

test('B-49 batches listed > a batch with a refusal reports 1 created and 1 refused with the key and the reason', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const { rapport } = await m.lotComplet(jeton, [
    ['lieu:port-sel', PORT_SEL],
    ['cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', sections: [] }],
  ]);
  assert.equal(rapport.compteurs.fiches.creees, 1);
  assert.equal(rapport.compteurs.fiches.refusees, 1);
  assert.equal(rapport.compteurs.fiches.inchangees, 0);
  const lu = JSON.stringify((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/lots`)).json());
  assert.match(lu, /cr:seance-1/);
  assert.match(lu, /campagne inconnue/);
});

test('B-49 batches listed > an open batch is en cours, abandoned after 24 h without a write; a refusal without a batch leaves no trace', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const sansLot = await m.pousser(jeton, 'cr:x', { type: 'compte_rendu', titre: 'X', sections: [] });
  assert.equal(sansLot.statusCode, 400);
  assert.deepEqual(await lots(m), [], 'a refusal without a batch leaves no trace');
  await m.imp(jeton, 'POST', '/lots');
  assert.equal((await lots(m))[0]!.etat, 'en_cours');
  m.regler(T0 + 25 * 3600_000);
  assert.equal((await lots(m))[0]!.etat, 'abandonne');
});

// ---------------------------------------------------------------- B-50

test('B-50 origin key > the GM reads the key and the origin date of an imported sheet, a sheet made in Kanevas has none', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const { reps } = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const f = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${reps[0]!.json().id}`);
  assert.equal(f.json().cleOrigine, 'lieu:port-sel');
  assert.match(String(f.json().creeLe ?? f.json().cree_le), /2021-03-03/);
  const faite = (await m.rest(m.antor, 'POST', `/api/univers/${m.essai}/fiches`, { type: 'lieu', titre: 'Fait main' })).json();
  const g = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${faite.id}`);
  assert.equal(g.json().cleOrigine ?? null, null, 'no origin key on a sheet made in Kanevas');
});

test('B-50 origin key > Léa never receives the origin key of a sheet, nor in the listing', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const { reps } = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  for (const url of [`/api/univers/${m.essai}/fiches/${reps[0]!.json().id}`, `/api/univers/${m.essai}/fiches?type=lieu`, `/api/univers/${m.essai}/fiches?q=Port`]) {
    const r = await m.rest(m.lea, 'GET', url);
    assert.equal(r.statusCode, 200, url);
    assert.ok(r.body.includes('Port-Sel'));
    assert.ok(!r.body.includes('lieu:port-sel'), `the key never reaches a player: ${url}`);
  }
});

test('B-50 origin key > the origin date stays the one of the first import at the replay', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const un = await m.pousser(jeton, 'lieu:port-sel', PORT_SEL);
  const f = (id: number) => m.app.db.prepare('SELECT cree_le FROM fiches WHERE id = ?').get(id) as { cree_le: string | number };
  const avant = f(un.json().id).cree_le;
  m.regler(T0 + 5 * JOUR);
  await m.pousser(jeton, 'lieu:port-sel', PORT_SEL);
  assert.equal(f(un.json().id).cree_le, avant);
  assert.match(String(avant), /2021-03-03/, 'creeLe is the sheet’s creation date');
});

// ---------------------------------------------------------------- P-10

test('P-10 secret > Léa reads « Description » and nothing of « Vérité »: not in the sheet, not in any search; the GM reads it', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const premier = await m.imp(jeton, 'PUT', `/fiches/${encodeURIComponent('lieu:port-sel')}`, PORT_SEL);
  assert.equal(premier.json().etat, 'creee');
  const lot = (await m.imp(jeton, 'POST', '/lots')).json().lotId;
  const rejoue = await m.imp(jeton, 'PUT', `/fiches/${encodeURIComponent('lieu:port-sel')}?lot=${lot}`, PORT_SEL);
  assert.equal(rejoue.json().etat, 'inchangee');
  await m.imp(jeton, 'POST', `/lots/${lot}/clore`);
  const id = premier.json().id;
  const lue = await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches/${id}`);
  assert.ok(lue.body.includes('Un port de sel gris sous les brumes.'));
  for (const secret of ['Vérité', SECRET]) assert.ok(!lue.body.includes(secret), `« ${secret} » is in no answer Léa receives`);
  const rech = await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches?q=${encodeURIComponent('sous-main')}`);
  assert.ok(!rech.body.includes('Port-Sel'), 'a word only in « Vérité » finds nothing for Léa');
  assert.ok((await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches?q=${encodeURIComponent('brumes')}`)).body.includes('Port-Sel'), 'a word of « Description » does');
  assert.ok((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${id}`)).body.includes(SECRET), 'the GM sees « Vérité »');
});

test('B-47 one sheet per origin key > a sheet without section is created, then replayed unchanged', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const a = await m.pousser(jeton, 'objet:vide', { type: 'objet', titre: 'Objet vide', sections: [] });
  const b = await m.pousser(jeton, 'objet:vide', { type: 'objet', titre: 'Objet vide', sections: [] });
  assert.equal(a.json().etat, 'creee');
  assert.equal(b.json().etat, 'inchangee');
});

test('B-48 protection > a human audience is kept both ways: opened by the GM Léa reads « Vérité », closed again it stays closed after a replay', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const un = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json().id;
  const ver = (m.app.db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND titre = ?').get(fid, 'Vérité') as { id: number }).id;
  const titres = async () => ((await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches/${fid}`)).json().sections as Array<{ titre: string }>).map((s) => s.titre);
  assert.deepEqual(await titres(), ['Description']);
  const url = `/api/univers/${m.essai}/fiches/${fid}/sections/${ver}`;
  assert.equal((await m.rest(m.antor, 'PATCH', url, { joueursLisent: true })).statusCode, 200);
  await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  assert.ok((await titres()).includes('Vérité'), 'the import did not close again an audience a human opened');
  assert.equal((await m.rest(m.antor, 'PATCH', url, { joueursLisent: false })).statusCode, 200);
  await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  assert.ok(!(await titres()).includes('Vérité'), 'the replay does not open what the human closed');
});

test('B-48 protection > the rest is written: a modified section is left, another one changed by the script is written, the sheet title is kept and the lot warns', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const un = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json().id;
  const lignes = m.app.db.prepare('SELECT id, titre FROM sections WHERE fiche_id = ?').all(fid) as { id: number; titre: string }[];
  const desc = lignes.find((s) => s.titre === 'Description')!.id;
  const ver = lignes.find((s) => s.titre === 'Vérité')!.id;
  const lue = await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}`);
  assert.equal((await m.rest(m.antor, 'PUT', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}/contenu`, { contenu: 'Texte réécrit par le MJ.', version: lue.json().version })).statusCode, 200);
  m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Port-Sel-sur-Brume', fid);
  const corps = { ...PORT_SEL, sections: [PORT_SEL.sections[0], { ...PORT_SEL.sections[1], contenu: 'Nouvelle vérité du script.' }] };
  const deux = await m.lotComplet(jeton, [['lieu:port-sel', corps]]);
  assert.equal(deux.reps[0]!.json().etat, 'mise_a_jour');
  assert.ok(deux.rapport.avertissements >= 1, 'the lot warns');
  const section = async (id: number) => (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${id}`)).json();
  assert.equal((await section(ver)).contenu, 'Nouvelle vérité du script.');
  assert.equal((await section(desc)).contenu, 'Texte réécrit par le MJ.');
  assert.equal((m.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(fid) as { titre: string }).titre, 'Port-Sel-sur-Brume');
});

test('B-50 origin date > without creeLe the creation date is the import day, an invalid creeLe is refused with nothing written', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const r = await m.pousser(jeton, 'objet:sans-date', { type: 'objet', titre: 'Sans date', sections: [] });
  const row = m.app.db.prepare('SELECT cree_le FROM fiches WHERE id = ?').get(r.json().id) as { cree_le: string };
  assert.ok(new Date(row.cree_le).getFullYear() >= 2026, `not 1970: ${row.cree_le}`);
  const avant = (await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches`)).body;
  const folle = await m.pousser(jeton, 'objet:date-folle', { type: 'objet', titre: 'Date folle', creeLe: 'hier soir', sections: [] });
  assert.equal(folle.statusCode, 400);
  assert.equal((await m.rest(m.antor, 'GET', `/api/univers/${m.essai}/fiches`)).body, avant, 'nothing written');
});

test('P-10 secret > Léa receives the section « Description » only, as html without source, no origin key, and the search finds only its words', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const { reps } = await m.lotComplet(jeton, [['lieu:port-sel', PORT_SEL]]);
  const r = await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches/${reps[0]!.json().id}`);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().sections.map((s: any) => s.titre), ['Description']);
  assert.equal(r.json().sections[0].contenu, undefined, 'a reader gets the html, never the source');
  assert.match(r.json().sections[0].html, /Un port de sel gris sous les brumes\./);
  assert.ok(!r.body.includes(SECRET) && !r.body.includes('lieu:port-sel'));
  const q = async (mot: string) => ((await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches?q=${encodeURIComponent(mot)}`)).json().fiches as unknown[]).length;
  assert.equal(await q('sous-main'), 0);
  assert.equal(await q('brumes'), 1);
});

// ---------------------------------------------------------------- complements

const AVEC_NOTES = (publique: boolean) => ({
  type: 'lieu',
  titre: 'Port-Sel',
  sections: [
    { cle: 'description', titre: 'Description', contenu: 'Un port brumeux.', joueursLisent: true, joueursEcrivent: false },
    { cle: 'notes', titre: 'Notes', contenu: 'Le capitaine boit.', joueursLisent: publique, joueursEcrivent: false },
  ],
});

test('B-47 audience > a section the script re-marks GM-only, untouched in Kanevas, is lost to Léa at the replay', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const a = await m.pousser(jeton, 'lieu:audience', AVEC_NOTES(true));
  assert.equal(a.json().etat, 'creee', a.body);
  const fid = a.json().id as number;
  const titres = async () => ((await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches/${fid}`)).json().sections as Array<{ titre: string }>).map((x) => x.titre).sort();
  assert.deepEqual(await titres(), ['Description', 'Notes']);
  const b = await m.pousser(jeton, 'lieu:audience', AVEC_NOTES(false));
  assert.equal(b.json().etat, 'mise_a_jour');
  assert.deepEqual(await titres(), ['Description']);
  assert.ok(!(await m.rest(m.lea, 'GET', `/api/univers/${m.essai}/fiches/${fid}`)).body.includes('Le capitaine boit.'));
});

test('B-48 type > the type of a sheet changed in Kanevas is not put back by the replay, the lot names the sheet and the type', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const fid = (await m.pousser(jeton, 'lieu:type', AVEC_NOTES(true))).json().id as number;
  m.app.db.prepare("UPDATE fiches SET type = 'faction' WHERE id = ?").run(fid);
  const lot = (await m.imp(jeton, 'POST', '/lots')).json().lotId as number;
  assert.equal((await m.pousser(jeton, 'lieu:type', AVEC_NOTES(true), lot)).statusCode, 200);
  const clos = (await m.imp(jeton, 'POST', `/lots/${lot}/clore`)).json();
  assert.equal((m.app.db.prepare('SELECT type FROM fiches WHERE id = ?').get(fid) as { type: string }).type, 'faction');
  assert.ok(JSON.stringify(clos).includes('lieu:type'));
  assert.match(JSON.stringify(clos.rapport), /type/);
  assert.ok(clos.avertissements >= 1);
});

test('B-47 without batch > a PUT without ?lot succeeds and no batch is listed', async () => {
  const m = await monde();
  const jeton = await m.jeton();
  const r = await m.pousser(jeton, 'lieu:sanslot', AVEC_NOTES(true));
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().etat, 'creee');
  assert.deepEqual(await lots(m), []);
});

test('B-46 open batch > a token revoked while its batch is open gets 401 on the next PUT, nothing is written or counted', async () => {
  const m = await monde();
  const jeton = await m.jeton(m.antor, 'Éphémère', 7);
  const lot = (await m.imp(jeton, 'POST', '/lots')).json().lotId as number;
  assert.equal((await m.pousser(jeton, 'lieu:revoque-1', AVEC_NOTES(true), lot)).statusCode, 200);
  const id = (await jetons(m))[0]!.id;
  assert.equal((await m.rest(m.antor, 'DELETE', `/api/compte/jetons/${id}`)).statusCode, 200);
  const r = await m.pousser(jeton, 'lieu:revoque-2', AVEC_NOTES(true), lot);
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.json(), UNIQUE);
  assert.equal((m.app.db.prepare("SELECT count(*) AS n FROM fiches WHERE cle = 'lieu:revoque-2'").get() as { n: number }).n, 0);
  const lu = ((await lots(m)) as Array<Record<string, any>>).find((l) => l.id === lot || l.lotId === lot);
  assert.ok(lu, 'the open batch is still listed');
  assert.equal(lu.compteurs.fiches!.creees, 1, 'only the first write is counted');
});

// ---------------------------------------------------------------- stub world

test('stub world > the token of the stub acts in « Essai Kanka », seeded with Antor GM and Léa a player', async () => {
  const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the stub world is seeded');
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  const imp = (methode: string, chemin: string, payload?: object) =>
    app.inject({ method: methode as 'GET', url: `/api/import/v1/univers/${essai}${chemin}`, headers: { authorization: `Bearer ${JETON_BOUCHON}` }, payload });
  const r = await imp('GET', '');
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().univers.nom, 'Essai Kanka');
  assert.equal(r.json().compte.username, 'antor');
  const antor = await connecter(app, 'antor');
  const membres = await app.inject({ method: 'GET', url: `/api/univers/${essai}/membres`, headers: antor });
  assert.match(membres.body, /antor/);
  assert.match(membres.body, /lea/);
  assert.equal((await imp('PUT', `/fiches/${encodeURIComponent('lieu:port-sel')}`, PORT_SEL)).json().etat, 'creee');
});
