import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { listerComptesRendus } = await import('../services/comptes_rendus.js');
const { changerAudience } = await import('../services/sections.js');
const { morceauxLot } = await import('../../frontend/src/ecrans/acces-api/format.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const q = (lot?: number) => (lot ? `?lot=${lot}` : '');
  const inj = (method: 'PUT' | 'POST', url: string, payload: unknown) =>
    app.inject({ method, url: `${base}${url}`, headers: auth, payload: payload as object });
  // The import of adventures belongs to a later slice: the sheet is made directly, with its origin key.
  const putC = async (cle: string, p: { nom: string }, universId: number = u.id) => {
    const info = app.db
      .prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle_origine, sous_type) VALUES (?, 'aventure', ?, '{\"v\":1,\"statut\":\"en_cours\"}', '2020-01-01', '2020-01-01', ?, 'Campagne')")
      .run(universId, p.nom, cle);
    app.db
      .prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, contenu_public, modifie_le, joueurs_lisent) VALUES (?, 'Présentation', 1, '', '', '2020-01-01', 1)")
      .run(info.lastInsertRowid);
    return Number(info.lastInsertRowid);
  };
  const put = (cle: string, p: unknown, lot?: number) => inj('PUT', `/fiches/${encodeURIComponent(cle)}${q(lot)}`, p);
  const rel = (cle: string, p: unknown, lot?: number) => inj('POST', `/fiches/${encodeURIComponent(cle)}/relations${q(lot)}`, p);
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const antor = trouverCompte(app.db, 'antor')!.id;
  const lea = trouverCompte(app.db, 'lea')!.id;
  const liste = (compteId: number) => listerComptesRendus(app.db, { compteId }, u.id).comptesRendus;
  return { app, u, putC, put, rel, lot, clore, lire, antor, lea, liste };
}
const n = (app: { db: any }, sql: string, ...a: unknown[]) => (app.db.prepare(sql).get(...a) as { n: number }).n;
const NR = "SELECT COUNT(*) n FROM relations r JOIN sections s ON s.id = r.section_id JOIN fiches f ON f.id = s.fiche_id WHERE f.cle_origine = 'lieu:a'";
const cr = (titre: string, creeLe: string, extra: object = {}) => ({
  type: 'compte_rendu', titre, campagne: 'c:brumes', creeLe,
  sections: [{ cle: 's1', titre: 'Peu importe', contenu: 'Récit.', joueursLisent: true }, { cle: 's2', titre: 'Notes', contenu: 'x', joueursLisent: true }],
  ...extra,
});
async function troisCR(m: Awaited<ReturnType<typeof monter>>, l?: number) {
  await m.putC('c:brumes', { nom: 'Les Brumes' });
  await m.put('cr:mars', cr('Mars', '2021-03-03T20:00:00Z'), l);
  await m.put('cr:fev', cr('Février', '2021-02-10T20:00:00Z'), l);
  await m.put('cr:avr', cr('Avril', '2021-04-18T20:00:00Z'), l);
}

test('critère : mars, février, avril poussés → E-13 liste avril, mars, février avec leurs dates, sans auteur ; lot « Fiches : 3 créées »', async () => {
  const m = await monter();
  const l = await m.lot();
  await troisCR(m, l);
  await m.clore(l);
  const lignes = m.liste(m.antor);
  assert.deepEqual(lignes.map((x) => x.titre), ['Avril', 'Mars', 'Février']);
  assert.deepEqual(lignes.map((x) => x.creeLe), ['2021-04-18T20:00:00.000Z', '2021-03-03T20:00:00.000Z', '2021-02-10T20:00:00.000Z']);
  assert.ok(lignes.every((x) => x.auteur === null && x.campagneNom === 'Les Brumes'));
  assert.equal(morceauxLot(await m.lire(l))[0], 'Fiches : 3 créées');
  // the first section is the « Compte-rendu » section, the next one is ordinary
  const fiche = (m.app.db.prepare("SELECT id FROM fiches WHERE cle_origine='cr:mars'").get() as { id: number }).id;
  const titres = (m.app.db.prepare('SELECT titre FROM sections WHERE fiche_id=? ORDER BY ordre').all(fiche) as { titre: string }[]).map((x) => x.titre);
  assert.deepEqual(titres, ['Compte-rendu', 'Notes']);
});

test('échec : campagne absente ou inconnue → 400 champ campagne, rien d’écrit, un refus au rapport avec clé et raison', async () => {
  const m = await monter();
  const l = await m.lot();
  await m.putC('c:brumes', { nom: 'Les Brumes' });
  const r = await m.put('cr:x', cr('X', '2021-03-03T20:00:00Z', { campagne: 'c:absente' }), l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'campagne');
  assert.equal(r.json().code, 'invalide');
  const sans = await m.put('cr:y', { type: 'compte_rendu', titre: 'Y', sections: [] }, l);
  assert.equal(sans.statusCode, 400);
  assert.equal(sans.json().champ, 'campagne');
  assert.equal(n(m.app, "SELECT COUNT(*) n FROM fiches WHERE type='compte_rendu' AND cle_origine IS NOT NULL"), 0);
  const lt = await m.lire(l);
  assert.equal(lt.compteurs.fiches.refusees, 2);
  assert.equal(lt.rapport[0].cle, 'cr:x');
  assert.match(lt.rapport[0].raison, /campagne inconnue : c:absente/);
});

test('exclusion : une campagne d’un autre univers n’est pas résolue', async () => {
  const m = await monter();
  const autre = (m.app.db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('Autre', '2020-01-01')").run().lastInsertRowid) as number;
  await m.putC('c:etr', { nom: 'Etrangère' }, autre);
  const r = await m.put('cr:z', cr('Z', '2021-03-03T20:00:00Z', { campagne: 'c:etr' }));
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'campagne');
  assert.equal(n(m.app, "SELECT COUNT(*) n FROM fiches WHERE type='compte_rendu' AND cle_origine IS NOT NULL"), 0);
});

test('bords : creeLe dans le futur → 400 ; sans creeLe, la date est celle de la création', async () => {
  const m = await monter();
  await m.putC('c:brumes', { nom: 'Les Brumes' });
  const f = await m.put('cr:f', cr('Futur', '2999-01-01T00:00:00Z'));
  assert.equal(f.statusCode, 400);
  assert.equal(f.json().champ, 'creeLe');
  assert.equal(n(m.app, "SELECT COUNT(*) n FROM fiches WHERE type='compte_rendu' AND cle_origine IS NOT NULL"), 0);
  const ok = await m.put('cr:nd', { type: 'compte_rendu', titre: 'Sans date', campagne: 'c:brumes', sections: [] });
  assert.equal(ok.statusCode, 200, ok.body);
  const d = (m.app.db.prepare("SELECT cree_le FROM fiches WHERE cle_origine='cr:nd'").get() as { cree_le: string }).cree_le;
  assert.ok(Date.now() - new Date(d).getTime() < 60_000);
});

test('rejeu : 3 inchangées, ordre et dates intacts ; autre campagne ou autre date : inchangée + avertissement, rien ne bouge', async () => {
  const m = await monter();
  await troisCR(m);
  await m.putC('c:autre', { nom: 'Autre' });
  const avant = m.liste(m.antor);
  const sections = m.app.db.prepare('SELECT id, version, modifie_le FROM sections ORDER BY id').all();
  const l = await m.lot();
  for (const [k, t, d] of [['cr:mars', 'Mars', '2021-03-03T20:00:00Z'], ['cr:fev', 'Février', '2021-02-10T20:00:00Z'], ['cr:avr', 'Avril', '2021-04-18T20:00:00Z']]) {
    const r = await m.put(k, cr(t, d), l);
    assert.equal(r.json().etat, 'inchangee', r.body);
    assert.deepEqual(r.json().avertissements, []);
  }
  assert.equal(morceauxLot(await m.lire(l))[0], 'Fiches : 3 inchangées');
  const r2 = await m.put('cr:mars', cr('Mars', '2021-03-03T20:00:00Z', { campagne: 'c:autre' }), l);
  assert.equal(r2.json().etat, 'inchangee');
  assert.ok(r2.json().avertissements.some((a: string) => /campagne/.test(a)), r2.body);
  const r3 = await m.put('cr:mars', cr('Mars', '2021-05-01T20:00:00Z'), l);
  assert.equal(r3.json().etat, 'inchangee');
  assert.ok(r3.json().avertissements.length >= 1);
  assert.deepEqual(m.liste(m.antor), avant);
  assert.deepEqual(m.app.db.prepare('SELECT id, version, modifie_le FROM sections ORDER BY id').all(), sections);
  const camp = m.app.db.prepare("SELECT json_extract(charge,'$.campagne_id') c FROM fiches WHERE cle_origine='cr:mars'").get() as { c: number };
  assert.equal(camp.c, (m.app.db.prepare("SELECT id FROM fiches WHERE type='aventure' AND cle_origine='c:brumes'").get() as { id: number }).id);
});

test('exclusion : le MJ ferme aux joueurs la section d’un des trois → Léa ne voit que deux lignes (total 2), Antor trois', async () => {
  const m = await monter();
  await troisCR(m);
  assert.equal(m.liste(m.lea).length, 3);
  const row = m.app.db.prepare("SELECT f.id fid, s.id sid FROM fiches f JOIN sections s ON s.fiche_id=f.id WHERE f.cle_origine='cr:mars'").all() as { fid: number; sid: number }[];
  for (const r of row) changerAudience(m.app.db, m.antor, m.u.id, r.fid, r.sid, { joueursLisent: false, joueursEcrivent: false });
  assert.deepEqual(m.liste(m.lea).map((x) => x.titre), ['Avril', 'Février']);
  assert.equal(listerComptesRendus(m.app.db, { compteId: m.lea }, m.u.id).total, 2);
  assert.equal(m.liste(m.antor).length, 3);
});

async function base2(m: Awaited<ReturnType<typeof monter>>) {
  await m.put('lieu:a', { type: 'lieu', titre: 'A', sections: [{ cle: 'd', titre: 'D', contenu: 'x' }] });
  await m.put('lieu:b', { type: 'lieu', titre: 'B', sections: [] });
  await m.put('lieu:c', { type: 'lieu', titre: 'C', sections: [] });
}

test('relations : 3 dont une vers clé inconnue → 2 créées + avertissement ; rejouées 2 inchangées ; auto_relation refusée avec son code', async () => {
  const m = await monter();
  await base2(m);
  const corps = [
    { section: 'd', cible: 'lieu:b', type: 'voisin' },
    { section: 'd', cible: 'lieu:c', type: 'voisin' },
    { section: 'd', cible: 'lieu:fantome', type: 'voisin' },
  ];
  const l = await m.lot();
  const r = await m.rel('lieu:a', corps, l);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().map((x: any) => x.etat), ['creee', 'creee', 'ignoree']);
  assert.match(r.json()[2].avertissements[0], /lieu:fantome/);
  assert.equal(n(m.app, NR), 2);
  let lt = await m.lire(l);
  assert.equal(lt.compteurs.relations.creees, 2);
  assert.equal(lt.compteurs.relations.refusees, 0);
  assert.equal(lt.avertissements, 1);
  assert.equal(morceauxLot(lt).find((x: string) => x.startsWith('Relations')), 'Relations : 2 créées');
  await m.clore(l);
  const l2 = await m.lot();
  const r2 = await m.rel('lieu:a', corps, l2);
  assert.deepEqual(r2.json().map((x: any) => x.etat), ['inchangee', 'inchangee', 'ignoree']);
  lt = await m.lire(l2);
  assert.equal(lt.compteurs.relations.inchangees, 2);
  assert.equal(lt.compteurs.relations.creees, 0);
  assert.equal(n(m.app, NR), 2);
  await m.clore(l2);
  const l3 = await m.lot();
  const r3 = await m.rel('lieu:a', [{ section: 'd', cible: 'lieu:a', type: 'soi' }], l3);
  assert.equal(r3.json()[0].etat, 'refusee');
  assert.equal(r3.json()[0].code, 'auto_relation');
  lt = await m.lire(l3);
  assert.equal(lt.compteurs.relations.refusees, 1);
  assert.equal(lt.rapport[0].code, 'auto_relation');
  assert.equal(n(m.app, NR), 2);
});

test('relations bords : section inconnue avertie ; fiche source inconnue 404 ; corps non-liste 400 ; lot clos 409 ; limite de 100 refusée sans défaire les voisines', async () => {
  const m = await monter();
  await base2(m);
  const sec = await m.rel('lieu:a', [{ section: 'nope', cible: 'lieu:b', type: 't' }]);
  assert.equal(sec.json()[0].etat, 'ignoree');
  assert.equal((await m.rel('lieu:zzz', [{ section: 'd', cible: 'lieu:b', type: 't' }])).statusCode, 404);
  assert.equal((await m.rel('lieu:a', { section: 'd' })).statusCode, 400);
  const l = await m.lot();
  await m.clore(l);
  assert.equal((await m.rel('lieu:a', [], l)).statusCode, 409);
  const types = Array.from({ length: 101 }, (_, i) => ({ section: 'd', cible: 'lieu:b', type: `t${i}` }));
  const l2 = await m.lot();
  const r = await m.rel('lieu:a', [...types, { section: 'd', cible: 'lieu:b', type: 't0' }], l2);
  const etats = r.json().map((x: any) => x.etat);
  assert.equal(etats.filter((e: string) => e === 'creee').length, 100);
  assert.equal(r.json()[100].code, 'limite_relations');
  assert.equal(r.json()[101].etat, 'inchangee');
  assert.equal(n(m.app, NR), 100);
  assert.equal((await m.lire(l2)).compteurs.relations.refusees, 1);
});

test('exclusion : sans jeton valide, ni compte-rendu ni relation (401), et aucune relation n’est écrite', async () => {
  const m = await monter();
  await base2(m);
  const r = await m.app.inject({
    method: 'POST', url: `/api/import/v1/univers/${m.u.id}/fiches/lieu%3Aa/relations`,
    headers: { authorization: 'Bearer kvs_faux' }, payload: [{ section: 'd', cible: 'lieu:b', type: 't' }] as any,
  });
  assert.equal(r.statusCode, 401);
  assert.equal(n(m.app, NR), 0);
});
