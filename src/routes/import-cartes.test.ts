// Tests of kanevas-synchro-cartes-import, written from the exit criterion (B-87, B-90, AD-140, AD-142, AD-143,
// AD-104, E-18): PUT /cartes/:cle of the import API, with the stub token and the seed « Essai Kanka ».
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-cartes-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserReglage } = await import('../services/reglages.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function multipart(champs: Record<string, string>, fond: Buffer | null) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (fond) {
    parts.push(
      Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fond"; filename="f"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      fond,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${B}--\r\n`));
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

const nbOctetsBrut = () => readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;

async function monter() {
  const octets0 = nbOctetsBrut();
  const nbOctets = () => nbOctetsBrut() - octets0;
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const antor = trouverCompte(app.db, 'antor')!.id;
  const lea = trouverCompte(app.db, 'lea')!.id;
  const jeton = (compteId: number) =>
    creerJeton(app.db, compteId, { nom: 'L', dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' } } as never, app.horloge()).valeur;
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const lecteurMj = { authorization: `Bearer ${jeton(antor)}` };
  const lectrice = { authorization: `Bearer ${jeton(lea)}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, champs: Record<string, string>, fond: Buffer | null, lot?: number, headers: Record<string, string> = {}) => {
    const m = multipart(champs, fond);
    return app.inject({
      method: 'PUT',
      url: `${base}/cartes/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: { ...auth, ...headers, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const lireLot = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const liste = async (h: Record<string, string>) =>
    (await app.inject({ method: 'GET', url: `/api/v1/univers/${u.id}/cartes`, headers: h })).json().cartes as {
      id: number; titre: string; visible: boolean; sha256Fond: string | null; texte: string; empreinte: string;
      fiche: { id: number; cle: string; titre: string } | null;
    }[];
  const nb0 = (app.db.prepare('SELECT COUNT(*) n FROM cartes').get() as { n: number }).n;
  const nb = () => (app.db.prepare('SELECT COUNT(*) n FROM cartes').get() as { n: number }).n - nb0;
  const fiche = app.db.prepare("SELECT id, cle FROM fiches WHERE univers_id = ? AND titre = 'Anse-aux-Sels'").get(u.id) as { id: number; cle: string };
  return { app, u, antor, nbOctets, put, lot, lireLot, liste, nb, fiche, auth, lecteurMj, lectrice, base };
}

test('envoi avec fond et lieu, rejeu sans fond : le fond reste, le rattachement reste', async () => {
  const { put, liste, lecteurMj, fiche } = await monter();
  const r1 = await put('car:a', { titre: 'Royaume', visible: 'true', fiche: fiche.cle, texte: 'Vue\n\n:::mj\nsecret\n:::' }, PNG);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().etat, 'creee');
  const r2 = await put('car:a', { titre: 'Royaume' }, null);
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(r2.json().etat, 'inchangee');
  const c = (await liste(lecteurMj)).find((x) => x.titre === 'Royaume')!;
  assert.equal(c.sha256Fond, sha(PNG));
  assert.equal(c.fiche?.cle, fiche.cle);
  assert.equal(c.visible, true);
  assert.ok(c.texte.includes('secret'));
});

test('fiche absente laisse le rattachement, fiche vide le défait ; fond remplacé change le sha', async () => {
  const { put, liste, lecteurMj, fiche, nbOctets } = await monter();
  await put('car:b', { titre: 'B', fiche: fiche.cle }, PNG);
  assert.equal((await put('car:b', { titre: 'B2' }, null)).json().etat, 'mise_a_jour');
  assert.equal((await liste(lecteurMj)).find((x) => x.titre === 'B2')!.fiche?.cle, fiche.cle);
  assert.equal((await put('car:b', { titre: 'B2', fiche: '' }, null)).json().etat, 'mise_a_jour');
  assert.equal((await liste(lecteurMj)).find((x) => x.titre === 'B2')!.fiche, null);
  const r = await put('car:b', { titre: 'B2' }, PNG2);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.equal((await liste(lecteurMj)).find((x) => x.titre === 'B2')!.sha256Fond, sha(PNG2));
  assert.equal(nbOctets(), 1, 'l’ancien fond est effacé du volume');
});

test('carte neuve sans fond : sha nul ; rejeu inchangé ; compteur « cartes » du lot', async () => {
  const { put, lot, lireLot, liste, lecteurMj } = await monter();
  const l = await lot();
  assert.equal((await put('car:c', { titre: 'Sans fond' }, null, l)).json().etat, 'creee');
  assert.equal((await put('car:c', { titre: 'Sans fond' }, null, l)).json().etat, 'inchangee');
  assert.equal((await liste(lecteurMj)).find((x) => x.titre === 'Sans fond')!.sha256Fond, null);
  const lot1 = await lireLot(l);
  assert.deepEqual(
    { creees: lot1.compteurs.cartes.creees, inchangees: lot1.compteurs.cartes.inchangees },
    { creees: 1, inchangees: 1 },
  );
});

test('un jeton qui lit comme joueur : ni texte MJ ni carte cachée', async () => {
  const { put, liste, lectrice } = await monter();
  await put('car:v', { titre: 'Visible', visible: 'true', texte: 'public\n\n:::mj\nsecret-mj\n:::' }, PNG);
  await put('car:h', { titre: 'Cachee-crypte', visible: 'false' }, PNG2);
  const cartes = await liste(lectrice);
  assert.deepEqual(cartes.map((c) => c.titre), ['Visible']);
  assert.ok(!JSON.stringify(cartes).includes('secret-mj'));
  assert.ok(cartes[0]!.texte.includes('public'));
});

test('carte rattachée visible : le joueur la lit dans le bloc Cartes de la fiche, sans le bloc MJ', async () => {
  const { app, put, fiche, u } = await monter();
  await put('car:f', { titre: 'Du port', visible: 'true', fiche: fiche.cle, texte: 'Vue\n\n:::mj\nsecret-mj\n:::' }, PNG);
  const co = await app.inject({
    method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=lea',
  });
  const cookie = `kanevas_session=${co.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  const r = await app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${fiche.id}/cartes`, headers: { cookie } });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().cartes.map((c: { titre: string }) => c.titre), ['Du port']);
  assert.ok(!r.body.includes('secret-mj'));
  assert.ok(r.body.includes('Vue'));
});

test('clé de fiche inconnue : 400 invalide champ fiche, rien d’écrit, « 1 refusée » au lot', async () => {
  const { put, lot, lireLot, nb, nbOctets } = await monter();
  const l = await lot();
  const r = await put('car:x', { titre: 'X', fiche: 'inconnue-zz' }, PNG, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'invalide');
  assert.equal(r.json().champ, 'fiche');
  assert.equal(nb(), 0);
  assert.equal(nbOctets(), 0);
  assert.equal((await lireLot(l)).compteurs.cartes.refusees, 1);
});

test('texte de 5 001 caractères : 400 invalide champ texte et 1 refusée ; 5 000 passe', async () => {
  const { put, lot, lireLot, nb, nbOctets } = await monter();
  const l = await lot();
  const r = await put('car:t', { titre: 'T', texte: 'a'.repeat(5001) }, PNG, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'texte');
  assert.equal(nb(), 0);
  assert.equal(nbOctets(), 0);
  assert.equal((await lireLot(l)).compteurs.cartes.refusees, 1);
  assert.equal((await put('car:t', { titre: 'T', texte: 'a'.repeat(5000) }, PNG, l)).statusCode, 200);
});

test('forme autre qu’illustree : 400', async () => {
  const { put, nb } = await monter();
  const r = await put('car:g', { titre: 'G', forme: 'graphe' }, null);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(nb(), 0);
});

test('fond au-dessus du plafond : 413 fond_trop_lourd avec la limite ; plafond relevé, le même envoi passe', async () => {
  const { app, put, nb, nbOctets } = await monter();
  poserReglage(app.db, 'fond_carte_max_mo', '1', null);
  const gros = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 10, 1)]);
  const r = await put('car:l', { titre: 'Gros' }, gros);
  assert.equal(r.statusCode, 413, r.body);
  assert.equal(r.json().code, 'fond_trop_lourd');
  assert.match(r.body, /1/);
  assert.equal(nb(), 0);
  assert.equal(nbOctets(), 0);
  poserReglage(app.db, 'fond_carte_max_mo', '100', null);
  assert.equal((await put('car:l', { titre: 'Gros' }, gros)).statusCode, 200);
});

test('empreinte changée depuis la lecture : 412, rien d’écrit, le lot nomme la clé', async () => {
  const { put, liste, lecteurMj, lot, lireLot, nbOctets } = await monter();
  await put('car:p', { titre: 'P' }, PNG);
  const lue = (await liste(lecteurMj))[0]!.empreinte;
  await put('car:p', { titre: 'P renommée' }, null);
  const l = await lot();
  const r = await put('car:p', { titre: 'Autre', texte: 'nouveau' }, PNG2, l, { 'if-match': `"${lue}"` });
  assert.equal(r.statusCode, 412, r.body);
  const apres = (await liste(lecteurMj))[0]!;
  assert.equal(apres.titre, 'P renommée');
  assert.equal(apres.sha256Fond, sha(PNG));
  assert.equal(apres.texte, '');
  assert.equal(nbOctets(), 1);
  const lt = await lireLot(l);
  assert.equal(lt.compteurs.cartes.refusees, 1);
  assert.ok(JSON.stringify(lt).includes('car:p'));
  // empreinte à jour : passe
  const ok = await put('car:p', { titre: 'P2' }, null, undefined, { 'if-match': `"${apres.empreinte}"` });
  assert.equal(ok.statusCode, 200, ok.body);
});

test('jeton en lecture : 403 ; sans jeton : 401 ; rien d’écrit', async () => {
  const { app, base, lecteurMj, put, nb } = await monter();
  const m = multipart({ titre: 'Z' }, PNG);
  const r = await app.inject({ method: 'PUT', url: `${base}/cartes/car:z`, headers: { ...lecteurMj, 'content-type': m.type }, payload: m.payload });
  assert.equal(r.statusCode, 403, r.body);
  const s = await app.inject({ method: 'PUT', url: `${base}/cartes/car:z`, headers: { 'content-type': m.type }, payload: m.payload });
  assert.equal(s.statusCode, 401);
  assert.equal(nb(), 0);
  assert.equal((await put('car:z', { titre: 'Z' }, PNG)).statusCode, 200);
});

test('fond qui n’est pas une image : refusé, rien d’écrit', async () => {
  const { put, nb, nbOctets } = await monter();
  const r = await put('car:i', { titre: 'I' }, Buffer.from('%PDF-1.4 x'));
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(nb(), 0);
  assert.equal(nbOctets(), 0);
});

test('plafond relevé à 100 Mo : un fond de 80 Mo traverse la limite multipart, refusé à 75 Mo par défaut', async () => {
  const { app, put, liste, lecteurMj } = await monter();
  const gros = Buffer.concat([PNG, Buffer.alloc(80 * 1024 * 1024, 1)]);
  const defaut = await put('car:m', { titre: 'M' }, gros);
  assert.equal(defaut.statusCode, 413, defaut.body.slice(0, 200));
  poserReglage(app.db, 'fond_carte_max_mo', '100', null);
  const r = await put('car:m', { titre: 'M' }, gros);
  assert.equal(r.statusCode, 200, r.body.slice(0, 200));
  assert.equal((await liste(lecteurMj)).find((c) => c.titre === 'M')!.sha256Fond, sha(gros));
});
