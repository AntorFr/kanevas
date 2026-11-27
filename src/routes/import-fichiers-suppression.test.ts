// DELETE /fichiers/:cle of the import API (AD-fichiers-suppr-1, AD-117 (5), AD-104, AD-149), through the door.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-fichiers-suppr-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { ajouterMembreNoyau } = await import('../services/membres.js');
const { cleDeUnivers } = await import('../services/cles.js');
const { ajouterFichier } = await import('../services/fichiers.js');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  await connecter(app, 'lea');
  const u = (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'Alpha' } })).json() as { id: number };
  ajouterMembreNoyau(app.db, u.id, 'lea', 'joueur');
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const bearer = (v: string) => ({ authorization: `Bearer ${v}` });
  const jeton = (nom: string, niveau: 'lecture' | 'ecriture', compte = 'antor') =>
    creerJeton(app.db, id(compte), { nom, dureeJours: 30, acces: { tous: false, univers: [{ universId: u.id, niveau }] } } as never, app.horloge());
  const mj = jeton('Foundry', 'ecriture');
  const cle = cleDeUnivers(app.db, u.id)!;
  const base = `/api/v1/univers/${cle}`;
  const B = 'XB';
  const putFichier = (k: string, octets: Buffer, lot?: number) =>
    app.inject({ method: 'PUT', url: `${base}/fichiers/${k}${lot ? `?lot=${lot}` : ''}`,
      headers: { ...bearer(mj.valeur), 'content-type': `multipart/form-data; boundary=${B}` },
      payload: Buffer.concat([
        Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="nom"\r\n\r\n${k}.png\r\n`),
        Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        octets, Buffer.from(`\r\n--${B}--\r\n`)]) });
  const del = (k: string, h: Record<string, string> = bearer(mj.valeur), suite = '', b = base) =>
    app.inject({ method: 'DELETE', url: `${b}/fichiers/${encodeURIComponent(k)}${suite}`, headers: h });
  const liste = async () =>
    ((await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fichiers`, headers: antor })).json() as Any).fichiers as { id: number }[];
  const n = (sql: string, ...p: unknown[]) => (app.db.prepare(sql).get(...p) as Any).n as number;
  const lot = async () => ((await app.inject({ method: 'POST', url: `${base}/lots`, headers: bearer(mj.valeur) })).json() as Any).lotId as number;
  return { app, antor, u, id, bearer, jeton, mj, cle, base, putFichier, del, liste, n, lot };
}
type M = Awaited<ReturnType<typeof monter>>;

async function fiche(w: M, titre: string, contenu: string) {
  const r = await w.app.inject({ method: 'PUT', url: `${w.base}/fiches/f:${titre}`, headers: w.bearer(w.mj.valeur),
    payload: { type: 'personnage', titre, sections: [{ cle: 's:h', titre: 'Histoire', contenu }] } });
  assert.equal(r.statusCode, 200, r.body);
  const f = w.app.db.prepare('SELECT id FROM fiches WHERE titre = ?').get(titre) as Any;
  const s = w.app.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').get(f.id) as Any;
  return { fid: f.id as number, sid: s.id as number };
}
const idDe = (w: M, k: string) => (w.app.db.prepare('SELECT id FROM fichiers WHERE cle_origine = ?').get(k) as Any).id as number;
const disque = (w: M, id: number) => join(RACINE, (w.app.db.prepare('SELECT disque FROM fichiers WHERE id = ?').get(id) as Any).disque);

test('fichier à clé : 204 par les deux préfixes, plus listé, octets partis, illustration vidée, jointure retirée, texte « supprimé », lignes d’historique au jeton', async () => {
  const w = await monter();
  for (const base of [w.base, `/api/import/v1/univers/${w.cle}`]) {
    const k = `i:${base.length}`;
    assert.equal((await w.putFichier(k, Buffer.concat([PNG, Buffer.from(k)]))).statusCode, 200);
    const id = idDe(w, k);
    const { fid, sid } = await fiche(w, `Z${base.length}`, `Voir ![x](fichier:${id})`);
    w.app.db.prepare('UPDATE fiches SET illustration_fichier_id = ? WHERE id = ?').run(id, fid);
    w.app.db.prepare('INSERT OR REPLACE INTO fichiers_sections (fichier_id, section_id, joint, dans_texte) VALUES (?, ?, 1, 1)').run(id, sid);
    const chemin = disque(w, id);
    assert.ok(existsSync(chemin));
    assert.ok((await w.liste()).some((f) => f.id === id));
    const avant = w.n('SELECT COALESCE(MAX(id), 0) n FROM historique');
    const r = await w.del(k, w.bearer(w.mj.valeur), '', base);
    assert.equal(r.statusCode, 204, r.body);
    assert.ok(!(await w.liste()).some((f) => f.id === id));
    assert.equal(existsSync(chemin), false);
    assert.equal(w.n('SELECT COUNT(*) n FROM fiches WHERE illustration_fichier_id = ?', id), 0);
    assert.equal(w.n('SELECT COUNT(*) n FROM fichiers_sections WHERE fichier_id = ?', id), 0);
    const vue = await w.app.inject({ method: 'GET', url: `/api/univers/${w.u.id}/fiches/${fid}`, headers: w.antor });
    assert.equal((vue.json() as Any).illustration ?? null, null);
    assert.match(vue.body, /supprimé/);
    const lignes = w.app.db.prepare('SELECT origine, jeton_id FROM historique WHERE id > ?').all(avant) as Any[];
    assert.ok(lignes.length >= 1, 'la suppression laisse une ligne');
    assert.ok(lignes.every((l) => l.origine === 'import' && l.jeton_id === w.mj.jeton.id), JSON.stringify(lignes));
  }
});

test('fichier ajouté à l’écran : supprimé par son id en chiffres, jamais par une clé qui n’est pas la sienne', async () => {
  const w = await monter();
  const v = await ajouterFichier(w.app.db, { compteId: w.id('antor') }, w.u.id, Readable.from([PNG]), 'ecran.png', { ou: 'mediatheque' });
  const autre = await w.putFichier('i:autre', Buffer.concat([PNG, Buffer.from('z')]));
  assert.equal(autre.statusCode, 200);
  const chemin = disque(w, v.id);
  assert.equal((await w.del(`${v.id + 1000}`)).statusCode, 204);
  assert.equal(w.n('SELECT COUNT(*) n FROM fichiers WHERE id = ?', v.id), 1);
  assert.equal((await w.del(String(v.id))).statusCode, 204);
  assert.equal(w.n('SELECT COUNT(*) n FROM fichiers WHERE id = ?', v.id), 0);
  assert.equal(existsSync(chemin), false);
  assert.equal(w.n("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'i:autre'"), 1, 'l’autre fichier reste');
});

test('jeton joueur 403 refuse (même clé inconnue, rien n’est supprimé), jeton lecture 403 lecture_seule, sans jeton 401', async () => {
  const w = await monter();
  await w.putFichier('i:a', PNG);
  const j = await w.del('i:a', w.bearer(w.jeton('J', 'ecriture', 'lea').valeur));
  assert.equal(j.statusCode, 403);
  assert.match(j.json().message, /réservée au MJ/);
  assert.equal((await w.del('i:inconnu', w.bearer(w.jeton('J2', 'ecriture', 'lea').valeur))).statusCode, 403);
  const l = await w.del('i:a', w.bearer(w.jeton('L', 'lecture').valeur));
  assert.equal(l.statusCode, 403);
  assert.equal(l.json().code, 'lecture_seule');
  assert.equal((await w.del('i:a', {})).statusCode, 401);
  assert.equal(w.n("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'i:a'"), 1);
});

test('clé inconnue : 204, rien d’écrit, rejouer la suppression aussi', async () => {
  const w = await monter();
  await w.putFichier('i:a', PNG);
  const avant = w.n('SELECT COUNT(*) n FROM historique');
  assert.equal((await w.del('i:nulle')).statusCode, 204);
  assert.equal(w.n('SELECT COUNT(*) n FROM historique'), avant);
  assert.equal((await w.del('i:a')).statusCode, 204);
  assert.equal((await w.del('i:a')).statusCode, 204);
});

test('fichier d’un autre univers : jamais touché, ni par clé ni par id', async () => {
  const w = await monter();
  const v2 = (await w.app.inject({ method: 'POST', url: '/api/univers', headers: w.antor, payload: { nom: 'Beta' } })).json() as Any;
  const v = await ajouterFichier(w.app.db, { compteId: w.id('antor') }, v2.id, Readable.from([PNG]), 'b.png', { ou: 'mediatheque' });
  assert.equal((await w.del(String(v.id))).statusCode, 204);
  assert.equal(w.n('SELECT COUNT(*) n FROM fichiers WHERE id = ?', v.id), 1);
});

test('fichier de la bibliothèque d’assets : 409 fichier_bibliotheque, ligne et octets gardés, compteur du lot non posé', async () => {
  const w = await monter();
  await w.putFichier('i:asset', PNG);
  const id = idDe(w, 'i:asset');
  w.app.db.prepare("INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, cree_le) VALUES (?, ?, 'a', 'objet', 1, 1, 'x')").run(w.u.id, id);
  const lot = await w.lot();
  const r = await w.del('i:asset', w.bearer(w.mj.valeur), `?lot=${lot}`);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'fichier_bibliotheque');
  assert.equal(w.n('SELECT COUNT(*) n FROM fichiers WHERE id = ?', id), 1);
  assert.ok(existsSync(disque(w, id)));
  const rap = (await w.app.inject({ method: 'GET', url: `${w.base}/lots/${lot}`, headers: w.bearer(w.mj.valeur) })).json() as Any;
  assert.ok(!rap.compteurs.fichiers.supprimees, JSON.stringify(rap.compteurs));
});

test('lot : ouvert, compte fichiers.supprimees (rien pour une clé inconnue) ; clos, 409 lot_clos et le fichier reste', async () => {
  const w = await monter();
  await w.putFichier('i:a', PNG);
  await w.putFichier('i:b', Buffer.concat([PNG, Buffer.from('b')]));
  const lot = await w.lot();
  assert.equal((await w.del('i:a', w.bearer(w.mj.valeur), `?lot=${lot}`)).statusCode, 204);
  assert.equal((await w.del('i:nulle', w.bearer(w.mj.valeur), `?lot=${lot}`)).statusCode, 204);
  const lire = async () => ((await w.app.inject({ method: 'GET', url: `${w.base}/lots/${lot}`, headers: w.bearer(w.mj.valeur) })).json() as Any);
  assert.equal((await lire()).compteurs.fichiers.supprimees, 1);
  assert.equal((await w.app.inject({ method: 'POST', url: `${w.base}/lots/${lot}/clore`, headers: w.bearer(w.mj.valeur) })).statusCode, 200);
  const r = await w.del('i:b', w.bearer(w.mj.valeur), `?lot=${lot}`);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'lot_clos');
  assert.equal(w.n("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'i:b'"), 1);
  assert.equal((await lire()).compteurs.fichiers.supprimees, 1);
  assert.equal((await w.del('i:b', w.bearer(w.mj.valeur), '?lot=99999')).statusCode >= 400, true);
});
