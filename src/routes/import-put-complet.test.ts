// PUT /fiches/:cle and PUT /fichiers/:cle under precondition (kanevas-synchro-ecriture-put-complet, B-85, B-86,
// AD-140, AD-146, AD-ecriture-1), written from the exit criterion: the full PUT replays without a duplicate,
// by key or former key, and a stale precondition writes nothing.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-put-complet-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { changerCleFiche } = await import('../services/cles.js');
const { renommerFiche, creerFiche } = await import('../services/fiches.js');
const { modifierFichier } = await import('../services/fichiers.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);

function multipart(contenu: Buffer, champs: Record<string, string>) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const antor = trouverCompte(app.db, 'antor')!.id;
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/v1/univers/${u.id}`;
  const enc = encodeURIComponent;
  const inj = (method: string, url: string, payload?: unknown, h: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url: `${base}${url}`, headers: { ...auth, ...h }, payload: payload as object });
  const putF = (cle: string, p: unknown, h: Record<string, string> = {}, q = '') => inj('PUT', `/fiches/${enc(cle)}${q}`, p, h);
  const putFich = (cle: string, contenu: Buffer, champs: Record<string, string>, h: Record<string, string> = {}, q = '') => {
    const m = multipart(contenu, champs);
    return app.inject({
      method: 'PUT', url: `${base}/fichiers/${enc(cle)}${q}`,
      headers: { ...auth, ...h, 'content-type': m.type }, payload: m.payload,
    });
  };
  const lire = async (cle: string) => (await inj('GET', `/fiches/${enc(cle)}`)).json();
  const fichiers = async () => (await inj('GET', '/fichiers')).json().fichiers as any[];
  const lot = async () => (await inj('POST', '/lots')).json().lotId as number;
  const lotLu = async (l: number) => (await inj('GET', `/lots/${l}`)).json();
  const un = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const nb = (t: string) => un(`SELECT COUNT(*) n FROM ${t}`).n;
  return { app, u, antor, inj, putF, putFich, lire, fichiers, lot, lotLu, un, nb };
}

const corps = (titre: string, sections: any[]) => ({ type: 'lieu', titre, sections });
const sec = (cle: string, contenu: string) => ({ cle, titre: cle.toUpperCase(), contenu, joueursLisent: true });

test('PUT par l\'ancienne clé après renommage : la même fiche est mise à jour, pas de seconde fiche', async () => {
  const m = await monter();
  const r0 = await m.putF('lieu:port', corps('Port', [sec('a', 'un')]));
  assert.equal(r0.statusCode, 200, r0.body);
  assert.equal(r0.json().etat, 'creee');
  const id = r0.json().id as number;
  changerCleFiche(m.app.db, { compteId: m.antor }, m.u.id, id, 'lieu:havre');
  const n = m.nb('fiches');
  const r = await m.putF('lieu:port', corps('Port rejoué', [sec('a', 'deux')]));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().id, id);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.equal(m.nb('fiches'), n);
  assert.equal(m.un('SELECT titre, cle FROM fiches WHERE id = ?', id).titre, 'Port rejoué');
  assert.equal(m.un('SELECT cle FROM fiches WHERE id = ?', id).cle, 'lieu:havre');
  assert.equal(m.un("SELECT COUNT(*) n FROM fiches WHERE cle = 'lieu:port'").n, 0);
  // La nouvelle clé aussi.
  assert.equal((await m.putF('lieu:havre', corps('Port rejoué', [sec('a', 'deux')]))).json().etat, 'inchangee');
});

test('If-None-Match: * : 412 sur une fiche existante, par sa clé comme par une ancienne ; rien d\'écrit ; absente : créée', async () => {
  const m = await monter();
  const id = (await m.putF('lieu:port', corps('Port', [sec('a', 'un')]))).json().id as number;
  const h = { 'if-none-match': '*' };
  const avant = m.un('SELECT f.titre, s.version, f.modifie_le FROM fiches f JOIN sections s ON s.fiche_id=f.id WHERE f.id = ?', id);
  const histo = m.nb('historique');
  const l = await m.lot();
  const r = await m.putF('lieu:port', corps('Écrasé', [sec('a', 'écrasé'), sec('z', 'neuf')]), h, `?lot=${l}`);
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(r.json().code, 'empreinte_perimee');
  assert.deepEqual(m.un('SELECT f.titre, s.version, f.modifie_le FROM fiches f JOIN sections s ON s.fiche_id=f.id WHERE f.id = ?', id), avant);
  assert.equal(m.nb('historique'), histo);
  assert.equal(m.un('SELECT COUNT(*) n FROM sections WHERE fiche_id = ?', id).n, 1);
  const c = (await m.lotLu(l)).compteurs.fiches;
  assert.equal(c.refusees, 1);
  assert.equal(c.creees + c.mises_a_jour + c.inchangees, 0);
  // Par une ancienne clé.
  changerCleFiche(m.app.db, { compteId: m.antor }, m.u.id, id, 'lieu:havre');
  const n = m.nb('fiches');
  const r2 = await m.putF('lieu:port', corps('Écrasé', [sec('a', 'écrasé')]), h);
  assert.equal(r2.statusCode, 412, r2.body);
  assert.equal(m.nb('fiches'), n);
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', id).titre, 'Port');
  // Absente : créée.
  const r3 = await m.putF('lieu:neuf', corps('Neuf', [sec('a', 'x')]), h);
  assert.equal(r3.statusCode, 200, r3.body);
  assert.equal(r3.json().etat, 'creee');
});

test('If-None-Match: * : fiche née dans Kanevas qui a pris la clé du script → 412, rien d\'écrit', async () => {
  const m = await monter();
  const f = creerFiche(m.app.db, m.antor, m.u.id, { type: 'lieu', titre: 'Né au navigateur' } as never) as any;
  const cle = m.un('SELECT cle FROM fiches WHERE id = ?', f.id).cle as string;
  const n = m.nb('fiches');
  const r = await m.putF(cle, corps('Script', [sec('a', 'x')]), { 'if-none-match': '*' });
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', f.id).titre, 'Né au navigateur');
  assert.equal(m.nb('fiches'), n);
});

test('If-Match : ancienne empreinte 412 (rien d\'écrit), courante passe et la réponse porte les nouvelles empreintes', async () => {
  const m = await monter();
  const id = (await m.putF('lieu:port', corps('Port', [sec('a', 'un')]))).json().id as number;
  const lue = await m.lire('lieu:port');
  renommerFiche(m.app.db, m.antor, m.u.id, id, 'Changé au navigateur');
  const apres = await m.lire('lieu:port');
  assert.notEqual(apres.empreinte, lue.empreinte);
  const histo = m.nb('historique');
  const r = await m.putF('lieu:port', corps('Script', [sec('a', 'script')]), { 'if-match': `"${lue.empreinte}"` });
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(r.json().code, 'empreinte_perimee');
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', id).titre, 'Changé au navigateur');
  assert.equal(m.un('SELECT contenu FROM sections WHERE fiche_id = ?', id).contenu, 'un');
  assert.equal(m.nb('historique'), histo);
  const ok = await m.putF('lieu:port', corps('Script', [sec('a', 'script')]), { 'if-match': `"${apres.empreinte}"` });
  assert.equal(ok.statusCode, 200, ok.body);
  const j = ok.json();
  assert.equal(j.etat, 'mise_a_jour');
  assert.match(j.empreinte, /^[0-9a-f]{32}$/);
  assert.match(j.empreinteEnTete, /^[0-9a-f]{32}$/);
  assert.notEqual(j.empreinte, apres.empreinte);
  const relue = await m.lire('lieu:port');
  assert.equal(relue.empreinte, j.empreinte);
  assert.equal(relue.empreinteEntete, j.empreinteEnTete);
  // Rejouée à l'identique avec les nouvelles empreintes : inchangée, mêmes empreintes.
  const again = await m.putF('lieu:port', corps('Script', [sec('a', 'script')]), { 'if-match': `"${j.empreinte}"` });
  assert.equal(again.json().etat, 'inchangee');
  assert.equal(again.json().empreinte, j.empreinte);
});

test('If-Match sur une fiche absente : 412 sans création ; en-têtes mal formés : 400 ; les deux ensemble : 400', async () => {
  const m = await monter();
  const n = m.nb('fiches');
  const r = await m.putF('lieu:fantome', corps('X', []), { 'if-match': `"${'a'.repeat(32)}"` });
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(m.nb('fiches'), n);
  const mal = await m.putF('lieu:fantome', corps('X', []), { 'if-match': 'pas-une-empreinte' });
  assert.equal(mal.statusCode, 400, mal.body);
  assert.equal(mal.json().champ, 'if_match');
  const mal2 = await m.putF('lieu:fantome', corps('X', []), { 'if-none-match': '"abc"' });
  assert.equal(mal2.statusCode, 400, mal2.body);
  assert.equal(mal2.json().champ, 'if_none_match');
  const deux = await m.putF('lieu:fantome', corps('X', []), { 'if-match': `"${'a'.repeat(32)}"`, 'if-none-match': '*' });
  assert.equal(deux.statusCode, 400, deux.body);
  assert.equal(m.nb('fiches'), n);
});

test('PUT rejoué deux fois : ni doublon ni section orpheline ; une section absente de l\'envoi reste', async () => {
  const m = await monter();
  const body = corps('Port', [sec('a', 'un'), sec('b', 'deux')]);
  const r1 = await m.putF('lieu:port', body);
  const nf = m.nb('fiches');
  const ns = m.nb('sections');
  const r2 = await m.putF('lieu:port', body);
  const r3 = await m.putF('lieu:port', body);
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(r3.json().etat, 'inchangee');
  assert.equal(r2.json().id, r1.json().id);
  assert.equal(m.nb('fiches'), nf);
  assert.equal(m.nb('sections'), ns);
  const r4 = await m.putF('lieu:port', corps('Port', [sec('a', 'un modifié')]));
  assert.equal(r4.json().etat, 'mise_a_jour');
  assert.equal(m.nb('sections'), ns);
  const lue = await m.lire('lieu:port');
  assert.deepEqual(lue.sections.map((s: any) => s.cle).sort(), ['a', 'b']);
  assert.equal(m.un("SELECT contenu FROM sections WHERE cle = 'b' AND fiche_id = ?", r1.json().id).contenu, 'deux');
});

test('PUT fichier : If-Match périmé → 412, octets, ligne et nom intacts ; courant → passe avec la nouvelle empreinte', async () => {
  const m = await monter();
  const r0 = await m.putFich('img:a', PNG, { nom: 'a.png' });
  assert.equal(r0.statusCode, 200, r0.body);
  assert.match(r0.json().empreinte, /^[0-9a-f]+$/);
  const vue = (await m.fichiers()).find((f) => f.cle === 'img:a');
  assert.equal(r0.json().empreinte, vue.empreinte);
  const disque0 = m.un('SELECT disque, nom, visibilite FROM fichiers WHERE id = ?', vue.id);
  const octets0 = readFileSync(join(RACINE, disque0.disque));
  modifierFichier(m.app.db, { compteId: m.antor }, m.u.id, vue.id, { nom: 'renommé.png' });
  const fichiersAvant = readdirSync(RACINE).sort();
  const l = await m.lot();
  const r = await m.putFich('img:a', PNG2, { nom: 'script.png' }, { 'if-match': `"${vue.empreinte}"` }, `?lot=${l}`);
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(r.json().code, 'empreinte_perimee');
  const apres = m.un('SELECT disque, nom, visibilite FROM fichiers WHERE id = ?', vue.id);
  assert.equal(apres.nom, 'renommé.png');
  assert.equal(apres.disque, disque0.disque);
  assert.deepEqual(readFileSync(join(RACINE, apres.disque)), octets0);
  assert.deepEqual(readdirSync(RACINE).sort(), fichiersAvant);
  assert.equal((await m.lotLu(l)).compteurs.fichiers.refusees, 1);
  const courante = (await m.fichiers()).find((f) => f.cle === 'img:a').empreinte;
  const ok = await m.putFich('img:a', PNG2, { nom: 'script.png' }, { 'if-match': `"${courante}"` });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().etat, 'mise_a_jour');
  const nouvelle = (await m.fichiers()).find((f) => f.cle === 'img:a');
  assert.equal(ok.json().empreinte, nouvelle.empreinte);
  assert.notEqual(nouvelle.empreinte, courante);
  assert.equal(nouvelle.nom, 'script.png');
});

test('PUT fichier : If-None-Match: * sur un fichier existant → 412 sans rien écrire ; absent → créé', async () => {
  const m = await monter();
  await m.putFich('img:a', PNG, { nom: 'a.png' });
  const avant = m.un('SELECT disque, nom FROM fichiers WHERE cle_origine = ?', 'img:a');
  const n = m.nb('fichiers');
  const r = await m.putFich('img:a', PNG2, { nom: 'autre.png' }, { 'if-none-match': '*' });
  assert.equal(r.statusCode, 412, r.body);
  assert.deepEqual(m.un('SELECT disque, nom FROM fichiers WHERE cle_origine = ?', 'img:a'), avant);
  assert.equal(m.nb('fichiers'), n);
  const neuf = await m.putFich('img:b', PNG2, { nom: 'b.png' }, { 'if-none-match': '*' });
  assert.equal(neuf.statusCode, 200, neuf.body);
  assert.equal(neuf.json().etat, 'creee');
  // If-Match sur un fichier absent : 412 sans création.
  const fant = await m.putFich('img:fantome', PNG, { nom: 'f.png' }, { 'if-match': `"${'a'.repeat(32)}"` });
  assert.equal(fant.statusCode, 412, fant.body);
  assert.equal(m.un("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'img:fantome'").n, 0);
  // En-tête mal formé : 400 avant stockage.
  const mal = await m.putFich('img:c', PNG, { nom: 'c.png' }, { 'if-match': 'zzz' });
  assert.equal(mal.statusCode, 400, mal.body);
  assert.equal(m.un("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'img:c'").n, 0);
});

test('scénario de bout en bout : lecture, modif au navigateur, PATCH périmé 412 puis relu et passé, PUT rejoué deux fois, section absente reste', async () => {
  const m = await monter();
  const id = (await m.putF('lieu:port', corps('Port', [sec('a', 'un'), sec('b', 'deux')]))).json().id as number;
  const lue = await m.lire('lieu:port');
  renommerFiche(m.app.db, m.antor, m.u.id, id, 'Port-au-Large');
  const patch = (empreinte: string, titre: string) =>
    m.inj('PATCH', '/fiches/lieu%3Aport', { titre }, { 'if-match': `"${empreinte}"` });
  const p1 = await patch(lue.empreinteEntete, 'Script');
  assert.equal(p1.statusCode, 412, p1.body);
  assert.equal(m.un('SELECT titre FROM fiches WHERE id = ?', id).titre, 'Port-au-Large');
  const relue = await m.lire('lieu:port');
  const p2 = await patch(relue.empreinteEntete, 'Script');
  assert.equal(p2.statusCode, 200, p2.body);
  const corpsPut = corps('Script', [sec('a', 'un')]);
  const nf = m.nb('fiches');
  const a = await m.putF('lieu:port', corpsPut);
  const b = await m.putF('lieu:port', corpsPut);
  assert.equal(a.json().etat, 'inchangee');
  assert.equal(b.json().etat, 'inchangee');
  assert.equal(m.nb('fiches'), nf);
  assert.deepEqual((await m.lire('lieu:port')).sections.map((s: any) => s.cle).sort(), ['a', 'b']);
});
