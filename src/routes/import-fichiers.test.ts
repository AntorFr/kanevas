// Tests of kanevas-fichiers-put, written from the exit criterion (B-48, AD-104, AD-111, AD-117):
// PUT /fichiers/:cle of the import API, with the stub token and the seed « Essai Kanka ».
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-fichiers-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const PDF = Buffer.from('%PDF-1.4 tarifs');

type App = Awaited<ReturnType<typeof buildApp>>;

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

const nbOctets = () => readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, contenu: Buffer, champs: Record<string, string>, lot?: number, headers = auth) => {
    const m = multipart(contenu, champs);
    return app.inject({
      method: 'PUT',
      url: `${base}/fichiers/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: { ...headers, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const lea = await connecter(app, 'lea');
  const antor = await connecter(app, 'antor');
  const liste = async (h: Record<string, string>) =>
    (await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fichiers`, headers: h })).json() as {
      fichiers: { id: number; nom: string; visibilite: string }[];
    };
  const octets = async (h: Record<string, string>, id: number) =>
    app.inject({ method: 'GET', url: `/api/univers/${u.id}/fichiers/${id}`, headers: h });
  const lignes = () => (app.db.prepare('SELECT COUNT(*) n FROM fichiers').get() as { n: number }).n;
  return { app, u, put, lot, clore, lire, lea, antor, liste, octets, lignes, base, auth };
}

test('GET / rend 100 fichiers joints par section dans les limites', async () => {
  const { app, base, auth } = await monter();
  const r = await app.inject({ method: 'GET', url: base, headers: auth });
  assert.equal(r.json().limites.fichiersJointsParSection, 100);
});

test('PNG sans visibilité : créé (joueurs), rejoué inchangé, Léa le voit, compteurs du lot', async () => {
  const { put, lot, clore, lire, lea, liste, app } = await monter();
  const l1 = await lot();
  const r1 = await put('img:quais', PNG, { nom: 'quais.png' }, l1);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().etat, 'creee');
  await clore(l1);
  assert.deepEqual({ ...(await lire(l1)).compteurs.fichiers }, { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 0 });
  const ligne = app.db.prepare("SELECT type, visibilite, ajoute_par FROM fichiers WHERE cle_origine = 'img:quais'").get() as Record<string, unknown>;
  assert.equal(ligne.type, 'image/png');
  assert.equal(ligne.visibilite, 'joueurs');
  assert.equal(ligne.ajoute_par, (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id);

  const l2 = await lot();
  const r2 = await put('img:quais', PNG, { nom: 'quais.png' }, l2);
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(r2.json().id, r1.json().id);
  await clore(l2);
  assert.deepEqual({ ...(await lire(l2)).compteurs.fichiers }, { creees: 0, mises_a_jour: 0, inchangees: 1, refusees: 0 });
  assert.ok((await liste(lea)).fichiers.some((f) => f.nom === 'quais.png'));
});

test('PDF : créé puis inchangé, type document', async () => {
  const { put, app } = await monter();
  assert.equal((await put('doc:tarifs', PDF, { nom: 'tarifs.pdf' })).json().etat, 'creee');
  assert.equal((await put('doc:tarifs', PDF, { nom: 'tarifs.pdf' })).json().etat, 'inchangee');
  assert.equal((app.db.prepare("SELECT type FROM fichiers WHERE cle_origine = 'doc:tarifs'").get() as { type: string }).type, 'application/octet-stream');
});

test('fichier « mj » : absent de la liste de Léa, présent dans celle d’Antor', async () => {
  const { put, lea, antor, liste } = await monter();
  assert.equal((await put('img:secret', PNG, { nom: 'secret.png', visibilite: 'mj' })).statusCode, 200);
  assert.ok(!(await liste(lea)).fichiers.some((f) => f.nom === 'secret.png'));
  assert.ok((await liste(antor)).fichiers.some((f) => f.nom === 'secret.png'));
});

test('visibilité changée par Antor : non rétablie par le rejeu, avertissement au lot', async () => {
  const { put, lot, lire, app } = await monter();
  const id = (await put('img:s', PNG, { nom: 's.png', visibilite: 'mj' })).json().id;
  app.db.prepare("UPDATE fichiers SET visibilite = 'joueurs' WHERE id = ?").run(id);
  const l = await lot();
  const r = await put('img:s', PNG, { nom: 's.png', visibilite: 'mj' }, l);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(r.json().avertissements, ['visibilité modifiée dans Kanevas : non écrasée']);
  assert.equal((app.db.prepare('SELECT visibilite FROM fichiers WHERE id = ?').get(id) as { visibilite: string }).visibilite, 'joueurs');
  const lt = await lire(l);
  assert.equal(lt.avertissements, 1);
  assert.match(JSON.stringify(lt.rapport), /visibilité modifiée dans Kanevas : non écrasée/);
});

test('nom changé par Antor, mêmes octets : inchangé, nom conservé, avertissement', async () => {
  const { put, lot, lire, app } = await monter();
  const id = (await put('img:n', PNG, { nom: 'n.png' })).json().id;
  app.db.prepare("UPDATE fichiers SET nom = 'Renommé.png' WHERE id = ?").run(id);
  const l = await lot();
  const r = await put('img:n', PNG, { nom: 'n.png' }, l);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(r.json().avertissements, ['nom modifié dans Kanevas : non écrasé']);
  assert.equal((app.db.prepare('SELECT nom FROM fichiers WHERE id = ?').get(id) as { nom: string }).nom, 'Renommé.png');
  assert.equal((await lire(l)).avertissements, 1);
});

test('nom et visibilité protégés indépendamment : l’un modifié, l’autre suit encore la source', async () => {
  const { put, app } = await monter();
  const id = (await put('img:i', PNG, { nom: 'a.png', visibilite: 'mj' })).json().id;
  app.db.prepare("UPDATE fichiers SET nom = 'Perso.png' WHERE id = ?").run(id);
  const r = await put('img:i', PNG, { nom: 'a.png', visibilite: 'joueurs' });
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.deepEqual(r.json().avertissements, ['nom modifié dans Kanevas : non écrasé']);
  const l = app.db.prepare('SELECT nom, visibilite FROM fichiers WHERE id = ?').get(id);
  assert.deepEqual({ ...l as object }, { nom: 'Perso.png', visibilite: 'joueurs' });
});

test('nom non touché par Antor : un nouveau nom de la source est appliqué (mise à jour)', async () => {
  const { put, app } = await monter();
  const id = (await put('img:r', PNG, { nom: 'avant.png' })).json().id;
  const r = await put('img:r', PNG, { nom: 'apres.png' });
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.deepEqual(r.json().avertissements, []);
  assert.equal((app.db.prepare('SELECT nom FROM fichiers WHERE id = ?').get(id) as { nom: string }).nom, 'apres.png');
});

test('mêmes clé, octets différents : mis à jour, octets servis changent, un seul fichier disque, nom protégé gardé', async () => {
  const { put, lot, clore, lire, antor, octets, lignes, app } = await monter();
  const avant = nbOctets();
  const id = (await put('img:q', PNG, { nom: 'q.png' })).json().id;
  app.db.prepare("UPDATE fichiers SET nom = 'Perso.png' WHERE id = ?").run(id);
  assert.ok((await octets(antor, id)).rawPayload.equals(PNG));
  const l = await lot();
  const r = await put('img:q', PNG2, { nom: 'q.png' }, l);
  assert.equal(r.json().etat, 'mise_a_jour');
  await clore(l);
  assert.equal((await lire(l)).compteurs.fichiers.mises_a_jour, 1);
  assert.ok((await octets(antor, id)).rawPayload.equals(PNG2));
  assert.equal(lignes(), 1);
  assert.equal(nbOctets(), avant + 1);
  assert.equal((app.db.prepare('SELECT nom, taille FROM fichiers WHERE id = ?').get(id) as { nom: string }).nom, 'Perso.png');
});

test('fichier de 0 octet : 400 invalide champ fichier, refus au lot avec clé et raison, rien d’écrit', async () => {
  const { put, lot, clore, lire, lignes } = await monter();
  const avant = nbOctets();
  const l = await lot();
  const r = await put('img:vide', Buffer.alloc(0), { nom: 'vide.png' }, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'invalide');
  assert.equal(r.json().champ, 'fichier');
  await clore(l);
  const lt = await lire(l);
  assert.equal(lt.compteurs.fichiers.refusees, 1);
  assert.equal(lt.rapport[0].cle, 'img:vide');
  assert.equal(lt.rapport[0].gravite, 'refus');
  assert.ok(lt.rapport[0].raison.length > 0);
  assert.equal(lignes(), 0);
  assert.equal(nbOctets(), avant);
});

test('0 octet sur un fichier existant : refusé, l’existant est intact', async () => {
  const { put, antor, octets, lignes } = await monter();
  const id = (await put('img:e', PNG, { nom: 'e.png' })).json().id;
  assert.equal((await put('img:e', Buffer.alloc(0), { nom: 'e.png' })).statusCode, 400);
  assert.ok((await octets(antor, id)).rawPayload.equals(PNG));
  assert.equal(lignes(), 1);
});

test('refus sans lot : ne laisse aucune trace ; nom absent, visibilité fausse, clé invalide : 400, rien d’écrit', async () => {
  const { put, lignes } = await monter();
  const avant = nbOctets();
  assert.equal((await put('img:x', PNG, {})).json().champ, 'nom');
  assert.equal((await put('img:x', PNG, { nom: 'x.png', visibilite: 'tous' })).json().champ, 'visibilite');
  assert.equal((await put('img|x', PNG, { nom: 'x.png' })).statusCode, 400);
  assert.equal((await put('img:x', PNG, { nom: 'a'.repeat(201) })).statusCode, 400);
  assert.equal(lignes(), 0);
  assert.equal(nbOctets(), avant);
});

test('refus dans un lot : compté refusé, pas créé', async () => {
  const { put, lot, lire } = await monter();
  const l = await lot();
  assert.equal((await put('img:x', PNG, { nom: 'x.png', visibilite: 'tous' }, l)).statusCode, 400);
  assert.equal((await lire(l)).compteurs.fichiers.refusees, 1);
});

test('lot clos : 409 lot_clos, rien d’écrit', async () => {
  const { put, lot, clore, lignes } = await monter();
  const l = await lot();
  await clore(l);
  const r = await put('img:c', PNG, { nom: 'c.png' }, l);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'lot_clos');
  assert.equal(lignes(), 0);
});

test('jeton révoqué : 401, rien écrit ; sans jeton : 401', async () => {
  const { app, put, lignes } = await monter();
  assert.equal((await put('img:a', PNG, { nom: 'a.png' }, undefined, {} as any)).statusCode, 401);
  app.db.prepare("UPDATE jetons_api SET revoque_le = '2020-01-01T00:00:00.000Z'").run();
  const avant = nbOctets();
  assert.equal((await put('img:a', PNG, { nom: 'a.png' })).statusCode, 401);
  assert.equal(lignes(), 0);
  assert.equal(nbOctets(), avant);
});

test('Léa (session) ne peut pas passer par l’API d’import : cookie ignoré', async () => {
  const { put, lea, lignes } = await monter();
  assert.equal((await put('img:l', PNG, { nom: 'l.png' }, undefined, lea)).statusCode, 401);
  assert.equal(lignes(), 0);
});

test('deux envois simultanés de la même clé : une ligne, un créé et un inchangé', async () => {
  const { put, lignes } = await monter();
  const avant = nbOctets();
  const rs = await Promise.all([put('img:p', PNG, { nom: 'p.png' }), put('img:p', PNG, { nom: 'p.png' })]);
  assert.deepEqual(rs.map((r) => r.statusCode), [200, 200]);
  assert.deepEqual(rs.map((r) => r.json().etat).sort(), ['creee', 'inchangee']);
  assert.equal(lignes(), 1);
  assert.equal(nbOctets(), avant + 1);
});
