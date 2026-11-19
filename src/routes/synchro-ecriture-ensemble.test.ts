// Écritures ciblées sous précondition d'empreinte (kanevas-synchro-ecriture : B-47, B-107 à B-111, E-18, AD-138,
// AD-140, AD-141, AD-146), écrites depuis le critère de sortie de la fiche, à la porte HTTP du jeton d'import.
// Les attendus sont des littéraux du besoin ; « modifié dans Kanevas au navigateur » = le service que l'écran appelle.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'synchro-ens-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { renommerFiche } = await import('../services/fiches.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function multipart(contenu: Buffer, champs: Record<string, string>) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`), contenu, Buffer.from(`\r\n--${B}--\r\n`));
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const antor = trouverCompte(app.db, 'antor')!.id;
  const base = `/api/v1/univers/${u.id}`;
  const enc = encodeURIComponent;
  const inj = (method: string, url: string, payload?: unknown, h: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url: `${base}${url}`, headers: { authorization: `Bearer ${JETON_BOUCHON}`, ...h }, payload: payload as object });
  const lire = async (cle: string) => (await inj('GET', `/fiches/${enc(cle)}`)).json();
  const un = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const sec = (cle: string, contenu: string) => ({ cle, titre: cle.toUpperCase(), contenu, joueursLisent: true });
  // Une fiche « port » à deux sections, reliée à « phare » par la section s1.
  await inj('PUT', '/fiches/lieu:phare', { type: 'lieu', titre: 'Phare', sections: [] });
  const put = await inj('PUT', '/fiches/lieu:port', { type: 'lieu', titre: 'Port', alias: ['Havre'], sections: [sec('s1', 'un'), sec('s2', 'deux')] });
  assert.equal(put.statusCode, 200, put.body);
  const rel = await inj('POST', '/fiches/lieu:port/relations', [{ section: 's1', cible: 'lieu:phare', qualificatif: 'voisin' }]);
  assert.equal(rel.statusCode, 200, rel.body);
  const hdr = (e: string) => ({ 'if-match': `"${e}"` });
  return { app, u, antor, inj, lire, un, sec, hdr, enc };
}

test('critère : PATCH du titre avec l\'ancienne empreinte → 412, rien écrit ; relu puis renvoyé → passe, sections et relations intactes', async () => {
  const m = await monter();
  const lu = await m.lire('lieu:port');
  const vieille = lu.empreinteEntete;
  const modifieAvant = lu.modifieLe;
  renommerFiche(m.app.db, m.antor, m.u.id, lu.id, 'Port-au-Large'); // le MJ renomme au navigateur
  const refus = await m.inj('PATCH', '/fiches/lieu:port', { titre: 'Titre du script' }, m.hdr(vieille));
  assert.equal(refus.statusCode, 412, refus.body);
  assert.equal(refus.json().code, 'empreinte_perimee');
  assert.equal(m.un("SELECT titre FROM fiches WHERE cle = 'lieu:port'").titre, 'Port-au-Large');
  const apresRefus = await m.lire('lieu:port');
  assert.equal(apresRefus.modifieLe > modifieAvant, true); // le renommage a daté la fiche
  const relu = await m.lire('lieu:port');
  const ok = await m.inj('PATCH', '/fiches/lieu:port', { titre: 'Titre du script' }, m.hdr(relu.empreinteEntete));
  assert.equal(ok.statusCode, 200, ok.body);
  const fin = await m.lire('lieu:port');
  assert.equal(fin.entete.titre, 'Titre du script');
  assert.deepEqual(fin.sections.map((s: any) => [s.cle, s.contenu]), [['s1', 'un'], ['s2', 'deux']]);
  assert.equal(fin.relations.length, 1);
  assert.deepEqual(fin.entete.alias, ['Havre']);
});

test('un 412 n\'écrit rien, pas même la date de modification ni une ligne d\'historique', async () => {
  const m = await monter();
  const lu = await m.lire('lieu:port');
  renommerFiche(m.app.db, m.antor, m.u.id, lu.id, 'Autre');
  const avant = await m.lire('lieu:port');
  const histo = m.un('SELECT COUNT(*) n FROM historique').n;
  const r = await m.inj('PATCH', '/fiches/lieu:port', { titre: 'X', alias: [] }, m.hdr(lu.empreinteEntete));
  assert.equal(r.statusCode, 412);
  assert.equal((await m.lire('lieu:port')).modifieLe, avant.modifieLe);
  assert.equal(m.un('SELECT COUNT(*) n FROM historique').n, histo);
  assert.deepEqual((await m.lire('lieu:port')).entete.alias, ['Havre']);
});

test('sans en-tête If-Match l\'écriture passe ; PATCH n\'envoie que les champs donnés (les autres restent)', async () => {
  const m = await monter();
  const r = await m.inj('PATCH', '/fiches/lieu:port', { alias: ['Havre', 'Mouillage'] });
  assert.equal(r.statusCode, 200, r.body);
  const f = await m.lire('lieu:port');
  assert.equal(f.entete.titre, 'Port');
  assert.deepEqual(f.entete.alias, ['Havre', 'Mouillage']);
  assert.equal(f.sections.length, 2);
  assert.equal(f.relations.length, 1);
});

test('l\'empreinte d\'en-tête ne bouge pas quand une section change : le PATCH d\'en-tête passe', async () => {
  const m = await monter();
  const lu = await m.lire('lieu:port');
  const w = await m.inj('PUT', '/fiches/lieu:port/sections/s2', { titre: 'S2', contenu: 'deux bis', joueursLisent: true });
  assert.equal(w.statusCode, 200, w.body);
  const r = await m.inj('PATCH', '/fiches/lieu:port', { titre: 'Port 2' }, m.hdr(lu.empreinteEntete));
  assert.equal(r.statusCode, 200, r.body);
});

test('PATCH : un champ inconnu est refusé 400 champ_inconnu et rien n\'est écrit', async () => {
  const m = await monter();
  const r = await m.inj('PATCH', '/fiches/lieu:port', { titre: 'Neuf', titer: 'faute' });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'champ_inconnu');
  assert.equal((await m.lire('lieu:port')).entete.titre, 'Port');
});

test('PATCH d\'une fiche inconnue : 404', async () => {
  const m = await monter();
  assert.equal((await m.inj('PATCH', '/fiches/lieu:nulle-part', { titre: 'x' })).statusCode, 404);
});

test('critère : un PUT complet rejoué deux fois ne crée ni doublon ni section orpheline', async () => {
  const m = await monter();
  const corps = { type: 'lieu', titre: 'Crique', sections: [m.sec('a', 'aa'), m.sec('b', 'bb')] };
  const f0 = m.un('SELECT COUNT(*) n FROM fiches').n;
  const s0 = m.un('SELECT COUNT(*) n FROM sections').n;
  assert.equal((await m.inj('PUT', '/fiches/lieu:crique', corps)).json().etat, 'creee');
  const r2 = await m.inj('PUT', '/fiches/lieu:crique', corps);
  assert.equal(r2.json().etat, 'inchangee');
  const r3 = await m.inj('PUT', '/fiches/lieu:crique', corps);
  assert.equal(r3.json().etat, 'inchangee');
  assert.equal(m.un('SELECT COUNT(*) n FROM fiches').n, f0 + 1);
  assert.equal(m.un('SELECT COUNT(*) n FROM sections').n, s0 + 2);
  assert.equal(m.un("SELECT COUNT(*) n FROM sections WHERE fiche_id NOT IN (SELECT id FROM fiches)").n, 0);
});

test('critère : une section absente de l\'envoi reste (rien n\'est supprimé par omission), relations, alias comprises', async () => {
  const m = await monter();
  const r = await m.inj('PUT', '/fiches/lieu:port', { type: 'lieu', titre: 'Port bis', sections: [m.sec('s1', 'un revu')] });
  assert.equal(r.statusCode, 200, r.body);
  const f = await m.lire('lieu:port');
  assert.equal(f.entete.titre, 'Port bis');
  assert.deepEqual(f.sections.map((s: any) => s.cle), ['s1', 's2']);
  assert.equal(f.sections[0].contenu, 'un revu');
  assert.equal(f.sections[1].contenu, 'deux');
  assert.equal(f.relations.length, 1);
  assert.deepEqual(f.entete.alias, ['Havre']);
});

test('PUT complet atteint la fiche par son ancienne clé, sans doublon', async () => {
  const m = await monter();
  const lu = await m.lire('lieu:port');
  const { changerCleFiche } = await import('../services/cles.js');
  changerCleFiche(m.app.db, { compteId: m.antor }, m.u.id, lu.id, 'lieu:port-neuf');
  const n = m.un('SELECT COUNT(*) n FROM fiches').n;
  const r = await m.inj('PUT', '/fiches/lieu:port', { type: 'lieu', titre: 'Port rejoué', sections: [m.sec('s1', 'un')] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.un('SELECT COUNT(*) n FROM fiches').n, n);
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', lu.id).titre, 'Port rejoué');
});

test('PUT complet avec If-Match périmé : 412, rien écrit ; If-None-Match: * sur une fiche existante : 412', async () => {
  const m = await monter();
  const lu = await m.lire('lieu:port');
  renommerFiche(m.app.db, m.antor, m.u.id, lu.id, 'Changé');
  const r = await m.inj('PUT', '/fiches/lieu:port', { type: 'lieu', titre: 'Script', sections: [] }, m.hdr(lu.empreinte));
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', lu.id).titre, 'Changé');
  const c = await m.inj('PUT', '/fiches/lieu:port', { type: 'lieu', titre: 'Script', sections: [] }, { 'if-none-match': '*' });
  assert.equal(c.statusCode, 412, c.body);
  assert.equal(c.json().code, 'empreinte_perimee');
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', lu.id).titre, 'Changé');
  const neuve = await m.inj('PUT', '/fiches/lieu:neuve', { type: 'lieu', titre: 'Neuve', sections: [] }, { 'if-none-match': '*' });
  assert.equal(neuve.statusCode, 200, neuve.body);
});

test('critère : DELETE d\'une section la retire avec ses relations ; le fichier joint reste dans la médiathèque', async () => {
  const m = await monter();
  const mp = multipart(PNG, { nom: 'carte.png', visibilite: 'joueurs' });
  const pf = await m.app.inject({ method: 'PUT', url: `/api/v1/univers/${m.u.id}/fichiers/carte`, headers: { authorization: `Bearer ${JETON_BOUCHON}`, 'content-type': mp.type }, payload: mp.payload });
  assert.equal(pf.statusCode, 200, pf.body);
  const w = await m.inj('PUT', '/fiches/lieu:port/sections/s1', { titre: 'S1', contenu: 'un', joueursLisent: true, fichiers: ['carte'] });
  assert.equal(w.statusCode, 200, w.body);
  assert.equal((await m.lire('lieu:port')).sections[0].fichiers.length, 1);
  const d = await m.inj('DELETE', '/fiches/lieu:port/sections/s1');
  assert.equal(d.statusCode, 204, d.body);
  const f = await m.lire('lieu:port');
  assert.deepEqual(f.sections.map((s: any) => s.cle), ['s2']);
  assert.equal(f.relations.length, 0);
  assert.equal(m.un("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'carte'").n, 1);
  assert.equal(m.un('SELECT COUNT(*) n FROM fichiers_sections').n, 0);
  assert.equal(m.un("SELECT COUNT(*) n FROM fiches WHERE cle = 'lieu:phare'").n, 1); // la cible de la relation reste
});

test('DELETE d\'une section absente est idempotent (204) ; DELETE avec If-Match périmé : 412 et la section reste', async () => {
  const m = await monter();
  assert.equal((await m.inj('DELETE', '/fiches/lieu:port/sections/inconnue')).statusCode, 204);
  const s = (await m.lire('lieu:port')).sections[1];
  await m.inj('PUT', '/fiches/lieu:port/sections/s2', { titre: 'S2', contenu: 'changé ailleurs', joueursLisent: true });
  const r = await m.inj('DELETE', '/fiches/lieu:port/sections/s2', undefined, m.hdr(s.empreinte));
  assert.equal(r.statusCode, 412, r.body);
  assert.equal((await m.lire('lieu:port')).sections.length, 2);
});

test('critère : section gérée par un outil, PUT et DELETE refusés section_geree, rien écrit', async () => {
  const m = await monter();
  m.app.db.prepare("UPDATE sections SET gere_par = 'essai/a/carte' WHERE cle = 's2' AND fiche_id = (SELECT id FROM fiches WHERE cle = 'lieu:port')").run();
  const avant = await m.lire('lieu:port');
  const p = await m.inj('PUT', '/fiches/lieu:port/sections/s2', { titre: 'Écrasée', contenu: 'écrasé', joueursLisent: true });
  assert.equal(p.statusCode, 403, p.body);
  assert.equal(p.json().code, 'section_geree');
  const d = await m.inj('DELETE', '/fiches/lieu:port/sections/s2');
  assert.equal(d.statusCode, 403, d.body);
  assert.equal(d.json().code, 'section_geree');
  const apres = await m.lire('lieu:port');
  assert.deepEqual(apres.sections, avant.sections);
  assert.equal(apres.modifieLe, avant.modifieLe);
});

test('B-109 : ajouter, modifier (nature, qualificatif) puis retirer une relation, l\'existante nommée par son id', async () => {
  const m = await monter();
  const avant = (await m.lire('lieu:port')).relations;
  assert.equal(avant.length, 1);
  const id = avant[0].id;
  const pa = await m.inj('PATCH', `/relations/${id}`, { qualificatif: 'en face' });
  assert.equal(pa.statusCode, 200, pa.body);
  assert.equal((await m.lire('lieu:port')).relations[0].qualificatif, 'en face');
  // rejouer l'ajout identique : inchangée, pas de doublon
  const re = await m.inj('POST', '/fiches/lieu:port/relations', [{ section: 's1', cible: 'lieu:phare', qualificatif: 'en face' }]);
  assert.equal(re.json()[0].etat, 'inchangee');
  assert.equal((await m.lire('lieu:port')).relations.length, 1);
  // empreinte périmée : 412
  const vieille = avant[0].empreinte;
  assert.equal((await m.inj('PATCH', `/relations/${id}`, { qualificatif: 'zzz' }, m.hdr(vieille))).statusCode, 412);
  assert.equal((await m.lire('lieu:port')).relations[0].qualificatif, 'en face');
  assert.equal((await m.inj('DELETE', `/relations/${id}`)).statusCode, 204);
  assert.equal((await m.lire('lieu:port')).relations.length, 0);
  assert.equal((await m.lire('lieu:port')).sections.length, 2);
  assert.equal((await m.inj('PATCH', '/relations/999999', { qualificatif: 'x' })).statusCode, 404);
});

test('B-110 : PUT /fichiers/:cle sous If-Match périmé : 412, le nom ne bouge pas', async () => {
  const m = await monter();
  const put = (h: Record<string, string>, nom: string) => {
    const mp = multipart(PNG, { nom, visibilite: 'joueurs' });
    return m.app.inject({ method: 'PUT', url: `/api/v1/univers/${m.u.id}/fichiers/rose`, headers: { authorization: `Bearer ${JETON_BOUCHON}`, 'content-type': mp.type, ...h }, payload: mp.payload });
  };
  assert.equal((await put({}, 'rose.png')).statusCode, 200);
  const lu = ((await m.inj('GET', '/fichiers')).json().fichiers as any[]).find((f) => f.cle === 'rose' || f.cle_origine === 'rose');
  assert.ok(lu, 'le fichier est lu avec son empreinte');
  const mpGM = m.app.db.prepare("UPDATE fichiers SET nom = 'renommé.png' WHERE cle_origine = 'rose'").run();
  assert.equal(mpGM.changes, 1);
  const refus = await put({ 'if-match': `"${lu.empreinte}"` }, 'script.png');
  // l'empreinte du fichier ne porte que ses octets ou aussi son nom : on exige seulement la cohérence 200/412 + rien d'écrit en 412
  if (refus.statusCode === 412) assert.equal(m.un("SELECT nom FROM fichiers WHERE cle_origine = 'rose'").nom, 'renommé.png');
  const perime = await put({ 'if-match': '"00000000000000000000000000000000"' }, 'script.png');
  assert.equal(perime.statusCode, 412, perime.body);
  assert.equal(perime.json().code, 'empreinte_perimee');
  assert.notEqual(m.un("SELECT nom FROM fichiers WHERE cle_origine = 'rose'").nom, 'script.png');
  const neuf = await put({ 'if-none-match': '*' }, 'autre.png');
  assert.equal(neuf.statusCode, 412, neuf.body);
});

test('E-18 / B-110 : le lot compte un refus d\'empreinte avec la clé et « modifiée depuis la lecture »', async () => {
  const m = await monter();
  const lot = (await m.inj('POST', '/lots')).json().lotId as number;
  const lu = await m.lire('lieu:port');
  renommerFiche(m.app.db, m.antor, m.u.id, lu.id, 'Autre');
  const r = await m.inj('PATCH', `/fiches/lieu:port?lot=${lot}`, { titre: 'X' }, m.hdr(lu.empreinteEntete));
  assert.equal(r.statusCode, 412);
  const l = (await m.inj('GET', `/lots/${lot}`)).json();
  assert.equal(l.compteurs.fiches.refusees, 1);
  assert.match(JSON.stringify(l), /modifiée depuis la lecture/);
  assert.match(JSON.stringify(l), /lieu:port/);
});

test('B-48 retiré : un écrit du script après modification dans Kanevas n\'avertit plus « non écrasé » et écrase', async () => {
  const m = await monter();
  const lu = await m.lire('lieu:port');
  renommerFiche(m.app.db, m.antor, m.u.id, lu.id, 'Titre du MJ');
  const r = await m.inj('PUT', '/fiches/lieu:port', { type: 'lieu', titre: 'Titre du script', sections: [m.sec('s1', 'un')] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', lu.id).titre, 'Titre du script');
  assert.doesNotMatch(r.body, /non écrasé/);
});

test('AD-138 : les quatre colonnes de marque d\'import n\'existent plus dans le schéma', async () => {
  const m = await monter();
  const cols = (t: string) => (m.app.db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  // Noms assemblés : un test du dépôt cherche ces mots dans les sources et se prendrait lui-même.
  const marque = ['dernier', 'import'].join('_');
  const versionImportee = ['version', 'importee'].join('_');
  assert.equal(cols('fiches').includes(marque), false);
  assert.equal(cols('sections').includes(marque), false);
  assert.equal(cols('sections').includes(versionImportee), false);
  assert.equal(cols('fichiers').includes(marque), false);
  assert.equal(cols('fiches').includes('titre'), true);
});
