// Tests d'ensemble écrits depuis le besoin (kanevas-cr-aventure-import : B-cr-aventure-2, B-cr-aventure-3, P-10),
// par la porte de l'import : PUT et PATCH /fiches/:cle, lots, GET /export. Attendus en dur.
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
  const patch = (cle: string, p: unknown, lot?: number) => inj('PATCH', `/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`, p);
  const lot = async () => (await inj('POST', '/lots')).json().lotId as number;
  const clore = (l: number) => inj('POST', `/lots/${l}/clore`);
  const lire = async (l: number) => (await inj('GET', `/lots/${l}`)).json();
  const exporter = async () => {
    const r = await inj('GET', '/export');
    assert.equal(r.statusCode, 200);
    return r.body.trimEnd().split('\n').map((x) => JSON.parse(x) as Record<string, any>);
  };
  // Une campagne, deux scénarios A et B dessous, un lieu qui cite le compte rendu, le compte rendu sous la campagne.
  await put('camp:eneria', { type: 'aventure', titre: 'Éneria', sousType: 'Campagne', sections: [] });
  await put('scen:a', { type: 'aventure', titre: 'Scénario A', sousType: 'Scénario', parent: 'camp:eneria', sections: [] });
  await put('scen:b', { type: 'aventure', titre: 'Scénario B', sousType: 'Scénario', parent: 'camp:eneria', sections: [] });
  const cr = (extra: object = {}) => ({
    type: 'compte_rendu', titre: 'Séance 1', campagne: 'camp:eneria', creeLe: '2021-03-03T20:00:00Z',
    sections: [{ cle: 's1', titre: 'x', contenu: 'Récit.', joueursLisent: true }], ...extra,
  });
  const premier = await put('cr:1', cr());
  assert.equal(premier.statusCode, 200, premier.body);
  const id = (cle: string) => (app.db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?').get(u.id, cle) as { id: number }).id;
  const lieu = await put('lieu:port', { type: 'lieu', titre: 'Port', sections: [{ cle: 'p', titre: 'P', contenu: `Vu dans [[${id('cr:1')}|la séance]].`, joueursLisent: true }] });
  assert.equal(lieu.statusCode, 200, lieu.body);
  const contenuLieu = () => (app.db.prepare("SELECT s.contenu c FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.cle = 'lieu:port'").get() as { c: string }).c;
  const campagneExport = async (cle: string) => {
    const f = (await exporter()).find((l) => l.type === 'fiche' && l.cle === cle);
    assert.ok(f, `fiche ${cle} absente de l'export`);
    return f.entete.charge.campagne_id as number; // l'export rend l'aventure par son id (charge.campagne_id)
  };
  return { app, put, patch, lot, clore, lire, cr, id, contenuLieu, campagneExport, inj };
}

test('PUT d’un compte rendu existant avec la clé d’un scénario : mise_a_jour, lot mises_a_jour 1, aucun avertissement, id et lien inchangés, export à jour', async () => {
  const m = await monter();
  const idAvant = m.id('cr:1');
  const lienAvant = m.contenuLieu();
  const l = await m.lot();
  const r = await m.put('cr:1', m.cr({ campagne: 'scen:a' }), l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.deepEqual(r.json().avertissements ?? [], []);
  await m.clore(l);
  const lt = await m.lire(l);
  assert.equal(lt.compteurs.fiches.mises_a_jour, 1);
  assert.equal(lt.compteurs.fiches.refusees, 0);
  assert.ok(!JSON.stringify(lt).includes('non modifiable'));
  assert.equal(m.id('cr:1'), idAvant);
  assert.equal(m.contenuLieu(), lienAvant);
  assert.equal(await m.campagneExport('cr:1'), m.id('scen:a'));
});

test('rejoué à l’identique après le déplacement : inchangee, rien de compté en mise à jour', async () => {
  const m = await monter();
  await m.put('cr:1', m.cr({ campagne: 'scen:b' }));
  const l = await m.lot();
  const r = await m.put('cr:1', m.cr({ campagne: 'scen:b' }), l);
  assert.equal(r.json().etat, 'inchangee');
  await m.clore(l);
  assert.equal((await m.lire(l)).compteurs.fiches.mises_a_jour, 0);
});

test('retour de scénario à la campagne : mise_a_jour, export rend la campagne', async () => {
  const m = await monter();
  await m.put('cr:1', m.cr({ campagne: 'scen:a' }));
  const r = await m.put('cr:1', m.cr({ campagne: 'camp:eneria' }));
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.equal(await m.campagneExport('cr:1'), m.id('camp:eneria'));
});

test('relation d’un compte rendu déplacé conservée', async () => {
  const m = await monter();
  const rel = await m.inj('POST', '/fiches/cr:1/relations', { relations: [{ section: 's1', cible: 'lieu:port', nature: 'vu' }] });
  const nbAvant = (m.app.db.prepare('SELECT COUNT(*) n FROM relations').get() as { n: number }).n;
  assert.ok(nbAvant >= 1, `relation non posée : ${rel.statusCode} ${rel.body}`);
  await m.put('cr:1', m.cr({ campagne: 'scen:a' }));
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM relations').get() as { n: number }).n, nbAvant, `relation POST ${rel.statusCode} ${rel.body}`);
});

test('campagne non envoyée en PATCH d’un autre champ : l’aventure reste, export inchangé', async () => {
  const m = await monter();
  await m.put('cr:1', m.cr({ campagne: 'scen:a' }));
  const r = await m.patch('cr:1', { titre: 'Séance un' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(await m.campagneExport('cr:1'), m.id('scen:a'));
});

test('clé inconnue ou qui n’est pas une aventure : refusée « campagne inconnue », comptée une refusée, compte rendu resté sous sa campagne', async () => {
  const m = await monter();
  for (const cle of ['scen:absent', 'lieu:port']) {
    const l = await m.lot();
    const r = await m.put('cr:1', m.cr({ campagne: cle }), l);
    assert.equal(r.statusCode, 400, `${cle} ${r.body}`);
    assert.equal(r.json().code, 'invalide');
    assert.equal(r.json().champ, 'campagne');
    await m.clore(l);
    const lt = await m.lire(l);
    assert.equal(lt.compteurs.fiches.refusees, 1);
    assert.match(lt.rapport[0].raison, /campagne inconnue/);
    assert.equal(await m.campagneExport('cr:1'), m.id('camp:eneria'));
  }
});

test('PATCH {campagne: scénario} : 200, empreinte nouvelle, export à jour ; même valeur : inchangee, empreinte stable', async () => {
  const m = await monter();
  const avant = (await m.inj('GET', '/fiches/cr:1')).json().empreinteEntete;
  const r = await m.patch('cr:1', { campagne: 'scen:b' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.notEqual(r.json().empreinteEnTete, avant);
  assert.equal(await m.campagneExport('cr:1'), m.id('scen:b'));
  const r2 = await m.patch('cr:1', { campagne: 'scen:b' });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(r2.json().empreinteEnTete, r.json().empreinteEnTete);
});

test('PATCH {campagne} qui n’est pas une aventure ou inconnue : 400 invalide champ campagne, rien changé', async () => {
  const m = await monter();
  for (const v of ['lieu:port', 'nulle:part']) {
    const r = await m.patch('cr:1', { campagne: v });
    assert.equal(r.statusCode, 400, `${v} ${r.body}`);
    assert.equal(r.json().code, 'invalide');
    assert.equal(r.json().champ, 'campagne');
  }
  assert.equal(await m.campagneExport('cr:1'), m.id('camp:eneria'));
});

test('PATCH {campagne} sur une fiche qui n’est pas un compte rendu : 400 champ_inconnu champ campagne', async () => {
  const m = await monter();
  for (const cle of ['lieu:port', 'scen:a']) {
    const r = await m.patch(cle, { campagne: 'scen:b' });
    assert.equal(r.statusCode, 400, `${cle} ${r.body}`);
    assert.equal(r.json().code, 'champ_inconnu');
    assert.equal(r.json().champ, 'campagne');
  }
});
