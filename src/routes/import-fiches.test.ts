import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON } = await import('../bouchon/depart.js');
const { ecrireContenu, renommerSection } = await import('../services/sections.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
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

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, payload: unknown, lot?: number) =>
    app.inject({
      method: 'PUT',
      url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: auth,
      payload: payload as object,
    });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const antor = trouverCompte(app.db, 'antor')!.id;
  return { app, u, put, lot, clore, lire, antor, auth, base };
}

const PORT = {
  type: 'lieu',
  titre: 'Port-Sel',
  sections: [
    { cle: 'desc', titre: 'Description', contenu: 'Un port.', joueursLisent: true },
    { cle: 'verite', titre: 'Vérité', contenu: 'Secret.' },
  ],
};
const compte = (app: { db: any }, sql: string, ...a: unknown[]) => (app.db.prepare(sql).get(...a) as { n: number }).n;

test('critère : créée, rejouée inchangée (ni version ni modifie_le), Léa sans Vérité', async () => {
  const { app, u, put, lot, clore, lire } = await monter();
  const l1 = await lot();
  const r1 = await put('lieu:port-sel', PORT, l1);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().etat, 'creee');
  await clore(l1);
  assert.equal((await lire(l1)).compteurs.fiches.creees, 1);

  const avant = app.db.prepare('SELECT modifie_le FROM fiches').all();
  const vers = app.db.prepare('SELECT id, version, modifie_le FROM sections ORDER BY id').all();
  const l2 = await lot();
  assert.notEqual(l1, l2);
  const r2 = await put('lieu:port-sel', PORT, l2);
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(r2.json().id, r1.json().id);
  await clore(l2);
  const c = (await lire(l2)).compteurs.fiches;
  assert.equal(c.creees, 0);
  assert.equal(c.inchangees, 1);
  assert.deepEqual(app.db.prepare('SELECT modifie_le FROM fiches').all(), avant);
  assert.deepEqual(app.db.prepare('SELECT id, version, modifie_le FROM sections ORDER BY id').all(), vers);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL'), 1);

  const lea = await connecter(app, 'lea');
  const f = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${r1.json().id}`, headers: lea });
  assert.equal(f.statusCode, 200);
  const titres = f.json().sections.map((s: { titre: string }) => s.titre);
  assert.deepEqual(titres, ['Description']);
  assert.ok(!f.body.includes('Secret.') && !f.body.includes('Vérité'));
  const ant = await connecter(app, 'antor');
  const fa = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${r1.json().id}`, headers: ant });
  assert.equal(fa.json().sections.length, 2);
});

test('titre de section changé par le service : non écrasé, avertissement au lot', async () => {
  const { app, u, put, lot, antor, lire } = await monter();
  const id = (await put('lieu:port-sel', PORT)).json().id;
  const sid = (app.db.prepare("SELECT id FROM sections WHERE cle_origine='desc'").get() as { id: number }).id;
  renommerSection(app.db, antor, u.id, id, sid, 'Aperçu');
  const l = await lot();
  const r = await put('lieu:port-sel', PORT, l);
  assert.equal(r.json().etat, 'inchangee');
  assert.equal(r.json().avertissements.length, 1);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM sections WHERE titre = ?', 'Aperçu'), 1);
  const lt = await lire(l);
  assert.equal(lt.avertissements, 1);
  assert.equal(lt.rapport[0].gravite, 'avertissement');
  assert.equal(lt.rapport[0].cle, 'lieu:port-sel');
});

test('titre de fiche changé en base : non écrasé, avertissement', async () => {
  const { app, put, lot, lire } = await monter();
  const id = (await put('lieu:port-sel', PORT)).json().id;
  app.db.prepare("UPDATE fiches SET titre = 'Port Salé' WHERE id = ?").run(id);
  const l = await lot();
  const r = await put('lieu:port-sel', PORT, l);
  assert.equal(r.json().avertissements.length, 1);
  assert.equal((app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(id) as { titre: string }).titre, 'Port Salé');
  assert.equal((await lire(l)).avertissements, 1);
});

test('rejeu : titre modifié à la source mis à jour tant que personne n’y a touché', async () => {
  const { app, put } = await monter();
  const id = (await put('lieu:port-sel', PORT)).json().id;
  const r = await put('lieu:port-sel', { ...PORT, titre: 'Port-Sel II' });
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.deepEqual(r.json().avertissements, []);
  assert.equal((app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(id) as { titre: string }).titre, 'Port-Sel II');
});

test('contenu : mis à jour si intact, protégé si modifié dans Kanevas', async () => {
  const { app, u, put, antor } = await monter();
  const id = (await put('lieu:port-sel', PORT)).json().id;
  const maj = { ...PORT, sections: [{ ...PORT.sections[0]!, contenu: 'Un grand port.' }, PORT.sections[1]!] };
  assert.equal((await put('lieu:port-sel', maj)).json().etat, 'mise_a_jour');
  const s = app.db.prepare("SELECT id, contenu, version FROM sections WHERE cle_origine='desc'").get() as { id: number; contenu: string; version: number };
  assert.equal(s.contenu, 'Un grand port.');
  ecrireContenu(app.db, antor, u.id, id, s.id, 'Réécrit à la main.', s.version);
  const maj2 = { ...PORT, sections: [{ ...PORT.sections[0]!, contenu: 'Source 3.' }, PORT.sections[1]!] };
  const r = await put('lieu:port-sel', maj2);
  assert.equal(r.json().etat, 'inchangee');
  assert.equal(r.json().avertissements.length, 1);
  assert.equal((app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(s.id) as { contenu: string }).contenu, 'Réécrit à la main.');
});

test('section sans clé jamais touchée ; rien ne se supprime par omission', async () => {
  const { app, put, antor, u } = await monter();
  const id = (await put('lieu:port-sel', PORT)).json().id;
  const { ajouterSection } = await import('../services/sections.js');
  ajouterSection(app.db, antor, u.id, id, { titre: 'Notes MJ', contenu: 'à moi' });
  const r = await put('lieu:port-sel', { ...PORT, sections: [PORT.sections[0]] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM sections WHERE fiche_id = ?', id), 3);
  assert.equal((app.db.prepare("SELECT contenu FROM sections WHERE titre='Notes MJ'").get() as { contenu: string }).contenu, 'à moi');
  // a nouvelle section arrives before those born in Kanevas
  const r2 = await put('lieu:port-sel', { ...PORT, sections: [...PORT.sections, { cle: 'hist', titre: 'Histoire', contenu: 'x' }] });
  assert.equal(r2.json().etat, 'mise_a_jour');
  const ordre = (app.db.prepare('SELECT titre FROM sections WHERE fiche_id = ? ORDER BY ordre').all(id) as { titre: string }[]).map((x) => x.titre);
  assert.deepEqual(ordre, ['Description', 'Vérité', 'Histoire', 'Notes MJ']);
});

test('refus : compte_rendu sans campagne (champ campagne) et type hors liste (champ type) → 400, rien d’écrit, 1 refusée au lot', async () => {
  const { app, put, lot, lire } = await monter();
  const l = await lot();
  for (const type of ['compte_rendu', 'monstre']) {
    const r = await put(`x:${type}`, { type, titre: 'T', sections: [{ cle: 'a', titre: 'A' }] }, l);
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().champ, type === 'compte_rendu' ? 'campagne' : 'type');
    assert.equal(r.json().code, 'invalide');
  }
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL'), 0);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM sections WHERE cle_origine IS NOT NULL'), 0);
  const lt = await lire(l);
  assert.equal(lt.compteurs.fiches.refusees, 2);
  assert.equal(lt.rapport[0].cle, 'x:compte_rendu');
  assert.equal(lt.rapport[0].gravite, 'refus');
  assert.ok(lt.rapport[0].raison.length > 0);
});

test('refus sans lot : aucune trace ; entrées fausses : rien d’écrit', async () => {
  const { app, put, lot, lire } = await monter();
  const l = await lot();
  const mauvais: [string, unknown, string][] = [
    ['a', { type: 'lieu', titre: '   ' }, 'titre'],
    ['a', { type: 'lieu', titre: 'x'.repeat(121) }, 'titre'],
    ['a', { type: 'lieu' }, 'titre'],
    ['a', { titre: 'T' }, 'type'],
    ['a', { type: 'lieu', titre: 'T', creeLe: 'pas une date' }, 'creeLe'],
    ['a', { type: 'lieu', titre: 'T', creeLe: '2999-01-01T00:00:00Z' }, 'creeLe'],
    ['a', { type: 'lieu', titre: 'T', sections: [{ titre: 'S' }] }, 'sections[0].cle'],
    ['a', { type: 'lieu', titre: 'T', sections: [{ cle: 'k', titre: 'S' }, { cle: 'k', titre: 'S2' }] }, 'sections[1].cle'],
    ['a', { type: 'lieu', titre: 'T', sections: [{ cle: 'a|b', titre: 'S' }] }, 'sections[0].cle'],
    ['a', { type: 'lieu', titre: 'T', sections: [{ cle: 'k', titre: '' }] }, 'sections[0].titre'],
    ['a', { type: 'lieu', titre: 'T', sections: 'oops' }, 'sections'],
    ['a', { type: 'lieu', titre: 'T', sections: [{ cle: 'k', titre: 'S', contenu: 5 }] }, 'sections[0].contenu'],
    ['a|b', { type: 'lieu', titre: 'T' }, 'cle'],
  ];
  for (const [cle, corps, champ] of mauvais) {
    const r = await put(cle, corps, l);
    assert.equal(r.statusCode, 400, JSON.stringify(corps) + r.body);
    assert.equal(r.json().champ, champ, JSON.stringify(corps));
  }
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL'), 0);
  assert.equal((await lire(l)).compteurs.fiches.refusees, mauvais.length);
  const l2 = await lot(); // same open batch resumed
  assert.equal(l2, l);
  const avant = (await lire(l)).compteurs.fiches.refusees;
  const r = await put('a', { type: 'monstre', titre: 'T' });
  assert.equal(r.statusCode, 400);
  assert.equal((await lire(l)).compteurs.fiches.refusees, avant);
});

test('lot clos : 409 lot_clos, rien d’écrit ; lot inconnu : 404 ; autre univers : lot introuvable', async () => {
  const { app, put, lot, clore } = await monter();
  const l = await lot();
  await clore(l);
  const r = await put('lieu:a', PORT, l);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'lot_clos');
  assert.equal((await put('lieu:a', PORT, 9999)).statusCode, 404);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL'), 0);
});

test('sans jeton : 401 et rien d’écrit', async () => {
  const { app, base } = await monter();
  const r = await app.inject({ method: 'PUT', url: `${base}/fiches/lieu:a`, payload: PORT });
  assert.equal(r.statusCode, 401);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL'), 0);
});

test('envois concurrents de la même clé : une seule fiche', async () => {
  const { app, put } = await monter();
  const rs = await Promise.all(Array.from({ length: 6 }, () => put('lieu:port-sel', PORT)));
  for (const r of rs) assert.equal(r.statusCode, 200, r.body);
  assert.equal(rs.filter((r) => r.json().etat === 'creee').length, 1);
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine = ?', 'lieu:port-sel'), 1);
  assert.equal(compte(app, "SELECT COUNT(*) n FROM sections WHERE cle_origine IN ('desc','verite')"), 2);
});

test('creeLe donné par la source devient la date de la fiche ; atomicité d’un échec en cours de route', async () => {
  const { app, put } = await monter();
  const r = await put('pj:ana', { type: 'personnage', titre: 'Ana', pj: true, creeLe: '2020-05-01T10:00:00Z', sections: [] });
  assert.equal(r.statusCode, 200, r.body);
  const f = app.db.prepare('SELECT cree_le FROM fiches WHERE id = ?').get(r.json().id) as { cree_le: string };
  assert.equal(f.cree_le, '2020-05-01T10:00:00.000Z');
  // 8 Mio+ content refused before anything is written
  const gros = await put('lieu:gros', { type: 'lieu', titre: 'G', sections: [{ cle: 'a', titre: 'A', contenu: 'x'.repeat(2_000_000) }] });
  assert.equal(gros.statusCode, 400, gros.body.slice(0, 200));
  assert.equal(compte(app, "SELECT COUNT(*) n FROM fiches WHERE cle_origine = 'lieu:gros'"), 0);
});

test('changement de type à la source : appliqué si intact, protégé sinon', async () => {
  const { app, put } = await monter();
  const id = (await put('x', { type: 'lieu', titre: 'X' })).json().id;
  const r = await put('x', { type: 'faction', titre: 'X' });
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.equal((app.db.prepare('SELECT type FROM fiches WHERE id = ?').get(id) as { type: string }).type, 'faction');
  app.db.prepare("UPDATE fiches SET type = 'objet' WHERE id = ?").run(id);
  const r2 = await put('x', { type: 'lieu', titre: 'X' });
  assert.equal(r2.json().avertissements.length, 1);
  assert.equal((app.db.prepare('SELECT type FROM fiches WHERE id = ?').get(id) as { type: string }).type, 'objet');
});

test('B-47 bords : clé d’origine de 1, 100, 150, 200 caractères acceptée ; 201 → 400 champ cle ; 200 multioctets acceptée', async () => {
  const { app, put } = await monter();
  const lieu = { type: 'lieu', titre: 'Clé longue' };
  for (const n of [1, 100, 101, 150, 200]) {
    const r = await put('k'.repeat(n), lieu);
    assert.equal(r.statusCode, 200, `${n} car. : ${r.body}`);
    assert.equal(r.json().etat, 'creee');
  }
  const rejeu = await put('k'.repeat(150), lieu);
  assert.equal(rejeu.json().etat, 'inchangee');
  const multi = await put('é'.repeat(200), lieu);
  assert.equal(multi.statusCode, 200, multi.body);
  const trop = await put('k'.repeat(201), lieu);
  assert.equal(trop.statusCode, 400, trop.body);
  assert.equal(trop.json().champ, 'cle');
  assert.equal(compte(app, 'SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL'), 6);
});
