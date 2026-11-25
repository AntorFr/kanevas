// kanevas-cr-aventure-import-ecriture (B-cr-aventure-2, B-cr-aventure-3, AD-cr-aventure-2): the import moves an existing
// session report to another adventure, by PUT and by PATCH; the export gives the new `campagne`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const inj = (method: 'PUT' | 'PATCH' | 'POST' | 'GET', url: string, payload?: unknown) =>
    app.inject({ method, url: `${base}${url}`, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
  const put = (cle: string, p: unknown, lot?: number) => inj('PUT', `/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`, p);
  const patch = (cle: string, p: unknown) => inj('PATCH', `/fiches/${encodeURIComponent(cle)}`, p);
  const lot = async () => ((await inj('POST', '/lots')).json().lotId as number);
  const lire = async (l: number) => (await inj('GET', `/lots/${l}`)).json();
  const aventure = (cle: string, titre: string, sousType: string) => {
    const r = app.db
      .prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, sous_type) VALUES (?, 'aventure', ?, '{\"v\":1,\"statut\":\"en_cours\"}', '2020-01-01', '2020-01-01', ?, 'import', ?)")
      .run(u.id, titre, cle, sousType);
    app.db.prepare("INSERT INTO sections (fiche_id, titre, cle, ordre, contenu, contenu_public, modifie_le, joueurs_lisent) VALUES (?, 'Présentation', 'presentation', 1, '', '', '2020-01-01', 1)").run(r.lastInsertRowid);
    return Number(r.lastInsertRowid);
  };
  const campagneDe = (cle: string) =>
    (app.db.prepare("SELECT json_extract(charge,'$.campagne_id') c FROM fiches WHERE univers_id = ? AND cle = ?").get(u.id, cle) as { c: number }).c;
  const id = (cle: string) => (app.db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?').get(u.id, cle) as { id: number }).id;
  const exporter = async () => {
    const r = await inj('GET', '/export');
    return r.body.trimEnd().split('\n').map((l) => JSON.parse(l) as Record<string, any>);
  };
  return { app, u, put, patch, lot, lire, aventure, campagneDe, id, exporter, inj };
}
const cr = (extra: object = {}) => ({
  type: 'compte_rendu', titre: 'Mars', campagne: 'c:brumes', creeLe: '2021-03-03T20:00:00Z',
  sections: [{ cle: 's1', titre: 'x', contenu: 'Récit.', joueursLisent: true }], ...extra,
});
async function preparer() {
  const m = await monter();
  const brumes = m.aventure('c:brumes', 'Les Brumes', 'Campagne');
  const acte = m.aventure('s:acte', 'Acte 1', 'Scénario');
  await m.put('cr:mars', cr());
  // another sheet links to the report
  const lieu = (await m.put('lieu:a', { type: 'lieu', titre: 'Port', sections: [{ cle: 'p', titre: 'P', contenu: `Vu dans [[${m.id('cr:mars')}]].`, joueursLisent: true }] }));
  assert.equal(lieu.statusCode, 200, lieu.body);
  return { m, brumes, acte };
}

test('PUT : la clé d’un scénario déplace le compte rendu — mise_a_jour, lot mises_a_jour, sans avertissement, id et lien inchangés', async () => {
  const { m, brumes, acte } = await preparer();
  const idAvant = m.id('cr:mars');
  const texteLieu = () => (m.app.db.prepare("SELECT s.contenu c FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.cle = 'lieu:a'").get() as { c: string }).c;
  const lienAvant = texteLieu();
  assert.equal(m.campagneDe('cr:mars'), brumes);
  const l = await m.lot();
  const r = await m.put('cr:mars', cr({ campagne: 's:acte' }), l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.deepEqual(r.json().avertissements, []);
  assert.equal(r.json().id, idAvant);
  assert.equal(m.id('cr:mars'), idAvant);
  assert.equal(m.campagneDe('cr:mars'), acte);
  assert.equal(texteLieu(), lienAvant);
  const lt = await m.lire(l);
  assert.equal(lt.compteurs.fiches.mises_a_jour, 1);
  assert.equal(lt.compteurs.fiches.refusees ?? 0, 0);
  assert.ok(!JSON.stringify(lt.rapport ?? []).includes('non modifiable'));
});

test('PUT : rejeu à l’identique inchangé ; campagne non envoyée laisse l’aventure', async () => {
  const { m, acte } = await preparer();
  await m.put('cr:mars', cr({ campagne: 's:acte' }));
  const r = await m.put('cr:mars', cr({ campagne: 's:acte' }));
  assert.equal(r.json().etat, 'inchangee', r.body);
  assert.deepEqual(r.json().avertissements, []);
  // not sent: a PATCH of another field leaves the adventure
  const r2 = await m.patch('cr:mars', { titre: 'Mars bis' });
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(m.campagneDe('cr:mars'), acte);
});

test('PUT : clé qui n’est pas une aventure ou inconnue → 400 campagne inconnue, une refusée, rien déplacé', async () => {
  const { m, brumes } = await preparer();
  const l = await m.lot();
  for (const cle of ['lieu:a', 'c:absente']) {
    const r = await m.put('cr:mars', cr({ campagne: cle }), l);
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().champ, 'campagne');
    assert.equal(r.json().code, 'invalide');
  }
  const lt = await m.lire(l);
  assert.equal(lt.compteurs.fiches.refusees, 2);
  assert.match(lt.rapport[0].raison, /campagne inconnue : lieu:a/);
  assert.equal(m.campagneDe('cr:mars'), brumes);
});

test('PATCH : campagne = clé d’un scénario → 200, empreinte d’en-tête nouvelle ; même valeur → inchangee', async () => {
  const { m, acte } = await preparer();
  const avant = (await m.inj('GET', '/fiches/cr:mars')).json().empreinteEntete;
  const r = await m.patch('cr:mars', { campagne: 's:acte' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.notEqual(r.json().empreinteEnTete, avant);
  assert.equal(m.campagneDe('cr:mars'), acte);
  const r2 = await m.patch('cr:mars', { campagne: 's:acte' });
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(r2.json().empreinteEnTete, r.json().empreinteEnTete);
});

test('PATCH : clé qui n’est pas une aventure, inconnue, ou mal formée → 400 invalide champ campagne, rien changé', async () => {
  const { m, brumes } = await preparer();
  for (const v of ['lieu:a', 'c:absente', '', 5, null, String(m.id('lieu:a'))]) {
    const r = await m.patch('cr:mars', { campagne: v });
    assert.equal(r.statusCode, 400, `${JSON.stringify(v)} ${r.body}`);
    assert.equal(r.json().code, 'invalide');
    assert.equal(r.json().champ, 'campagne');
  }
  assert.equal(m.campagneDe('cr:mars'), brumes);
});

test('PATCH : campagne sur une fiche qui n’est pas un compte rendu → 400 champ_inconnu champ campagne', async () => {
  const { m } = await preparer();
  for (const cle of ['lieu:a', 'c:brumes']) {
    const r = await m.patch(cle, { campagne: 's:acte' });
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().code, 'champ_inconnu');
    assert.equal(r.json().champ, 'campagne');
  }
});

test('PATCH : campagne d’un autre univers → 400 invalide, jamais résolue', async () => {
  const { m, brumes } = await preparer();
  const autre = (m.app.db.prepare("INSERT INTO univers (cle, nom, cree_le) VALUES ('u-' || lower(hex(randomblob(6))), 'Autre', '2020-01-01')").run().lastInsertRowid) as number;
  m.app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, sous_type) VALUES (?, 'aventure', 'Etr', '{\"v\":1,\"statut\":\"en_cours\"}', '2020-01-01', '2020-01-01', 'c:etr', 'import', 'Campagne')").run(autre);
  const r = await m.patch('cr:mars', { campagne: 'c:etr' });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'campagne');
  assert.equal(m.campagneDe('cr:mars'), brumes);
});

test('export : GET /export rend la nouvelle campagne après PUT puis après PATCH', async () => {
  const { m, brumes, acte } = await preparer();
  const campagneExport = async () => {
    const f = (await m.exporter()).find((x) => x.type === 'fiche' && x.id === m.id('cr:mars'))!;
    return f.entete.charge.campagne_id as number;
  };
  assert.equal(await campagneExport(), brumes);
  await m.put('cr:mars', cr({ campagne: 's:acte' }));
  assert.equal(await campagneExport(), acte);
  await m.patch('cr:mars', { campagne: 'c:brumes' });
  assert.equal(await campagneExport(), brumes);
});
