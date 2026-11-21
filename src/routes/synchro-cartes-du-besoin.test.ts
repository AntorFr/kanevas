// kanevas-synchro-cartes, tests d'ensemble écrits du besoin (B-112, B-88, B-89 ; P-22, P-23), sans lire le code livré.
// Porte : l'import à jeton (`/api/v1`), les routes de session des cartes, `/api/instance/reglages`, le bouchon `KANEVAS_STUB`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'synchro-cartes-besoin-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9, 9]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const gros = (mo: number) => Buffer.concat([PNG, Buffer.alloc(mo * 1024 * 1024)]);

function multipart(champs: Record<string, string>, fond?: Buffer) {
  const B = 'XBESOIN';
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

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/v1/univers/${u.id}`;
  const connecter = async (compte: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `compte=${compte}`,
    });
    return { cookie: `kanevas_session=${r.cookies.find((c) => c.name === 'kanevas_session')!.value}` };
  };
  const antor = await connecter('antor');
  const lea = await connecter('lea');
  const admin = await connecter('admin');
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = async (l: number) => (await app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth })).json() as Any;
  const putCarte = (cle: string, champs: Record<string, string>, fond?: Buffer, l?: number, entetes: Record<string, string> = {}) => {
    const m = multipart(champs, fond);
    return app.inject({
      method: 'PUT',
      url: `${base}/cartes/${encodeURIComponent(cle)}${l ? `?lot=${l}` : ''}`,
      headers: { ...auth, ...entetes, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const lire = async () => ((await app.inject({ method: 'GET', url: `${base}/cartes`, headers: auth })).json() as Any).cartes as Any[];
  const ficheApi = async (cle: string, titre: string, lisible: boolean) =>
    (
      await app.inject({
        method: 'PUT',
        url: `${base}/fiches/${encodeURIComponent(cle)}`,
        headers: auth,
        payload: { type: 'lieu', titre, sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un lieu.', joueursLisent: lisible }] },
      })
    ).json().id as number;
  const carte = (h: Record<string, string>, id: number, mode = '') =>
    app.inject({ method: 'GET', url: `/api/univers/${u.id}/cartes/${id}${mode}`, headers: h });
  const bloc = (h: Record<string, string>, ficheId: number) =>
    app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${ficheId}/cartes`, headers: h });
  const reglage = (h: Record<string, string>, mo: unknown) =>
    app.inject({ method: 'PUT', url: '/api/instance/reglages', headers: h, payload: { fondCarteMaxMo: mo } as Any });
  const nbCartes = () => (app.db.prepare('SELECT COUNT(*) n FROM cartes').get() as { n: number }).n;
  return { app, u, auth, base, antor, lea, admin, lot, clore, putCarte, lire, ficheApi, carte, bloc, reglage, nbCartes };
}

const TEXTE = 'Vue du port.\n\n:::mj\nLe passage secret est sous le quai.\n:::\n';

// ---------------------------------------------------------------- B-112 : l'import

test('B-112 nominal : un script envoie la carte avec fond, rattachement et texte ; elle est comptée « cartes » et lue avec son SHA-256', async () => {
  const m = await monter();
  const fiche = await m.ficheApi('lieu:tyros-7', 'Tyros-7', true);
  const l = await m.lot();
  const r = await m.putCarte('carte:tyros-7', { titre: 'Cartes de combat', visible: 'true', fiche: 'lieu:tyros-7', texte: TEXTE }, PNG, l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  const cartes = await m.lire();
  assert.equal(cartes.length, 1);
  assert.equal(cartes[0].titre, 'Cartes de combat');
  assert.equal(cartes[0].forme, 'illustree');
  assert.equal(cartes[0].visible, true);
  assert.equal(cartes[0].sha256Fond, sha(PNG));
  assert.equal(cartes[0].fiche.cle, 'lieu:tyros-7');
  assert.equal(cartes[0].fiche.id, fiche);
  assert.equal(cartes[0].texte, TEXTE);
  const rap = await m.clore(l);
  assert.deepEqual(rap.compteurs.cartes, { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 0 });
});

test('B-112 rejeu sans fond : le fond reste (SHA et octets servis), aucun doublon, « inchangee » compté', async () => {
  const m = await monter();
  await m.ficheApi('lieu:tyros-7', 'Tyros-7', true);
  const champs = { titre: 'Cartes de combat', visible: 'true', fiche: 'lieu:tyros-7', texte: TEXTE };
  await m.putCarte('carte:tyros-7', champs, PNG);
  const l = await m.lot();
  const r = await m.putCarte('carte:tyros-7', champs, undefined, l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'inchangee');
  const cartes = await m.lire();
  assert.equal(cartes.length, 1);
  assert.equal(m.nbCartes(), 1);
  assert.equal(cartes[0].sha256Fond, sha(PNG));
  const fond = await m.app.inject({ method: 'GET', url: `/api/univers/${m.u.id}/cartes/${cartes[0].id}/fond`, headers: m.antor });
  assert.equal(fond.statusCode, 200);
  assert.deepEqual(fond.rawPayload, PNG);
  assert.equal((await m.clore(l)).compteurs.cartes.inchangees, 1);
});

test('B-112 rejeu avec un autre titre et sans fond : mise à jour, fond gardé ; avec un autre fond : le fond change', async () => {
  const m = await monter();
  await m.putCarte('c', { titre: 'Avant' }, PNG);
  const l = await m.lot();
  const r = await m.putCarte('c', { titre: 'Après' }, undefined, l);
  assert.equal(r.json().etat, 'mise_a_jour');
  let c = (await m.lire())[0];
  assert.equal(c.titre, 'Après');
  assert.equal(c.sha256Fond, sha(PNG));
  assert.equal((await m.clore(l)).compteurs.cartes.mises_a_jour, 1);
  const r2 = await m.putCarte('c', { titre: 'Après' }, PNG2);
  assert.equal(r2.json().etat, 'mise_a_jour');
  c = (await m.lire())[0];
  assert.equal(c.sha256Fond, sha(PNG2));
  assert.equal(m.nbCartes(), 1);
});

test('B-112 bord : une carte neuve sans fond est créée, son SHA-256 est null', async () => {
  const m = await monter();
  const r = await m.putCarte('c', { titre: 'Cadre neutre' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  const c = (await m.lire())[0];
  assert.equal(c.sha256Fond, null);
  assert.equal(c.fiche, null);
});

test('B-112 fiche : absente laisse le rattachement, vide ou « null » le détache', async () => {
  const m = await monter();
  await m.ficheApi('lieu:a', 'A', true);
  await m.putCarte('c', { titre: 'C', fiche: 'lieu:a' });
  await m.putCarte('c', { titre: 'C', texte: 'autre' });
  assert.equal((await m.lire())[0].fiche.cle, 'lieu:a');
  await m.putCarte('c', { titre: 'C', texte: 'autre', fiche: '' });
  assert.equal((await m.lire())[0].fiche, null);
  await m.putCarte('c', { titre: 'C', fiche: 'lieu:a' });
  assert.equal((await m.lire())[0].fiche.cle, 'lieu:a');
  await m.putCarte('c', { titre: 'C', fiche: 'null' });
  assert.equal((await m.lire())[0].fiche, null);
});

test('B-112 échec : une clé de fiche inconnue est refusée 400 champ fiche, comptée « refusée », rien d’écrit', async () => {
  const m = await monter();
  const l = await m.lot();
  const r = await m.putCarte('c', { titre: 'C', fiche: 'lieu:nexiste-pas' }, PNG, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'invalide');
  assert.equal(r.json().champ, 'fiche');
  assert.equal(m.nbCartes(), 0);
  assert.deepEqual((await m.clore(l)).compteurs.cartes, { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 1 });
  // sur une carte existante : le refus ne touche à rien
  await m.putCarte('d', { titre: 'D' }, PNG);
  const r2 = await m.putCarte('d', { titre: 'Autre', fiche: 'lieu:nexiste-pas' });
  assert.equal(r2.statusCode, 400);
  const d = (await m.lire())[0];
  assert.equal(d.titre, 'D');
});

test('B-112 échec : un fond qui n’est pas une image est refusé 400 fond_invalide, rien d’écrit', async () => {
  const m = await monter();
  const r = await m.putCarte('c', { titre: 'C' }, Buffer.from('%PDF-1.4 pas une image'));
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'fond_invalide');
  assert.equal(m.nbCartes(), 0);
});

test('B-112 exclusion : l’import ne crée que des cartes illustrées (forme graphe → 400)', async () => {
  const m = await monter();
  const r = await m.putCarte('g', { titre: 'G', forme: 'graphe' });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(m.nbCartes(), 0);
});

test('B-112 empreinte : une écriture avec l’empreinte lue passe, avec une périmée → 412 empreinte_perimee, comptée refusée, carte intacte', async () => {
  const m = await monter();
  const cree = await m.putCarte('c', { titre: 'V1' }, PNG);
  const e1 = cree.json().empreinte as string;
  const r = await m.putCarte('c', { titre: 'V2' }, undefined, undefined, { 'if-match': `"${e1}"` });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'mise_a_jour');
  const l = await m.lot();
  const r2 = await m.putCarte('c', { titre: 'V3' }, undefined, l, { 'if-match': `"${e1}"` });
  assert.equal(r2.statusCode, 412, r2.body);
  assert.equal(r2.json().code, 'empreinte_perimee');
  assert.equal((await m.lire())[0].titre, 'V2');
  assert.equal((await m.clore(l)).compteurs.cartes.refusees, 1);
});

test('B-112 exclusion : un jeton invalide → 401 et rien d’écrit', async () => {
  const m = await monter();
  const r = await m.putCarte('c', { titre: 'C' }, PNG, undefined, { authorization: 'Bearer kvs_pas_un_jeton' });
  assert.equal(r.statusCode, 401, r.body);
  assert.equal(m.nbCartes(), 0);
});

// ---------------------------------------------------------------- B-88 : rattachement, texte, bloc « Cartes »

test('B-88 / critère : la carte importée, visible et rattachée, apparaît dans le bloc « Cartes » de la fiche pour la joueuse, texte sans le bloc MJ', async () => {
  const m = await monter();
  const fiche = await m.ficheApi('lieu:tyros-7', 'Tyros-7', true);
  await m.putCarte('c', { titre: 'Cartes de combat', visible: 'true', fiche: 'lieu:tyros-7', texte: TEXTE }, PNG);
  const b = await m.bloc(m.lea, fiche);
  assert.equal(b.statusCode, 200, b.body);
  const liste = b.json().cartes as Any[];
  assert.equal(liste.length, 1);
  assert.equal(liste[0].titre, 'Cartes de combat');
  assert.ok(liste[0].html.includes('Vue du port.'));
  assert.ok(!b.body.includes('passage secret'), 'le bloc MJ ne sort pas dans le bloc « Cartes »');
  assert.equal(liste[0].texte, undefined, 'la source du texte n’est pas servie à la joueuse');
  const id = liste[0].id as number;
  const d = await m.carte(m.lea, id);
  assert.equal(d.statusCode, 200);
  assert.ok(d.json().carte.html.includes('Vue du port.'));
  assert.ok(!d.body.includes('passage secret'));
  assert.ok(!d.body.includes('Bloc MJ'));
  // le MJ voit le bloc MJ
  const dm = await m.carte(m.antor, id);
  assert.ok(dm.json().carte.html.includes('passage secret'));
  assert.equal(dm.json().carte.texte, TEXTE);
});

test('B-88 exclusion : une carte cachée est dans le bloc du MJ, jamais dans celui de la joueuse ni détaillée pour elle', async () => {
  const m = await monter();
  const fiche = await m.ficheApi('lieu:a', 'A', true);
  await m.putCarte('c', { titre: 'Secrète', visible: 'false', fiche: 'lieu:a', texte: 'x' }, PNG);
  const mj = (await m.bloc(m.antor, fiche)).json().cartes as Any[];
  assert.equal(mj.length, 1);
  assert.equal(mj[0].visible, false);
  const joueuse = await m.bloc(m.lea, fiche);
  assert.deepEqual(joueuse.json().cartes, []);
  assert.ok(!joueuse.body.includes('Secrète'));
  assert.equal((await m.carte(m.lea, mj[0].id)).statusCode, 404);
});

test('B-88 exclusion : une carte rattachée à une fiche que la joueuse ne lit pas ne révèle pas cette fiche (bloc 404, carte sans « Rattachée à »)', async () => {
  const m = await monter();
  const fiche = await m.ficheApi('lieu:secret', 'Repaire des Ombres', false);
  await m.putCarte('c', { titre: 'Carte visible', visible: 'true', fiche: 'lieu:secret' }, PNG);
  assert.equal((await m.bloc(m.lea, fiche)).statusCode, 404);
  const id = (await m.lire())[0].id as number;
  const d = await m.carte(m.lea, id);
  assert.equal(d.statusCode, 200);
  assert.ok(!d.body.includes('Repaire des Ombres'));
  assert.equal(d.json().carte.fiche, undefined);
});

test('B-88 bord : une fiche sans carte → bloc vide ; deux cartes → les deux, une seule fiche par carte', async () => {
  const m = await monter();
  const f1 = await m.ficheApi('lieu:a', 'A', true);
  const f2 = await m.ficheApi('lieu:b', 'B', true);
  assert.deepEqual((await m.bloc(m.antor, f1)).json().cartes, []);
  await m.putCarte('c1', { titre: 'C1', visible: 'true', fiche: 'lieu:a' });
  await m.putCarte('c2', { titre: 'C2', visible: 'true', fiche: 'lieu:a' });
  assert.equal(((await m.bloc(m.antor, f1)).json().cartes as Any[]).length, 2);
  await m.putCarte('c1', { titre: 'C1', fiche: 'lieu:b' });
  assert.deepEqual(((await m.bloc(m.antor, f1)).json().cartes as Any[]).map((c) => c.titre), ['C2']);
  assert.deepEqual(((await m.bloc(m.antor, f2)).json().cartes as Any[]).map((c) => c.titre), ['C1']);
});

test('B-88 : le MJ rattache, change, détache la carte depuis l’écran (routes de E-11), le bloc de chaque fiche suit', async () => {
  const m = await monter();
  const f1 = await m.ficheApi('lieu:a', 'A', true);
  const f2 = await m.ficheApi('lieu:b', 'B', true);
  await m.putCarte('c', { titre: 'C', visible: 'true' });
  const id = (await m.lire())[0].id as number;
  const put = (fid: number) =>
    m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/fiche`, headers: m.antor, payload: { ficheId: fid } });
  assert.equal((await put(f1)).statusCode, 200);
  assert.equal(((await m.bloc(m.lea, f1)).json().cartes as Any[]).length, 1);
  assert.equal((await put(f2)).statusCode, 200);
  assert.equal(((await m.bloc(m.lea, f1)).json().cartes as Any[]).length, 0);
  assert.equal(((await m.bloc(m.lea, f2)).json().cartes as Any[]).length, 1);
  const d = await m.app.inject({ method: 'DELETE', url: `/api/univers/${m.u.id}/cartes/${id}/fiche`, headers: m.antor });
  assert.equal(d.statusCode, 200, d.body);
  assert.equal(((await m.bloc(m.lea, f2)).json().cartes as Any[]).length, 0);
  assert.equal((await m.lire())[0].fiche, null);
});

test('B-88 échec et exclusion : rattacher à une fiche inconnue est refusé ; la joueuse ne rattache ni ne détache (carte intacte)', async () => {
  const m = await monter();
  const f1 = await m.ficheApi('lieu:a', 'A', true);
  await m.putCarte('c', { titre: 'C', visible: 'true', fiche: 'lieu:a' });
  const id = (await m.lire())[0].id as number;
  const inconnue = await m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/fiche`, headers: m.antor, payload: { ficheId: 999999 } });
  assert.ok(inconnue.statusCode >= 400 && inconnue.statusCode < 500, inconnue.body);
  const l1 = await m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/fiche`, headers: m.lea, payload: { ficheId: f1 } });
  assert.ok(l1.statusCode >= 400 && l1.statusCode < 500, l1.body);
  const l2 = await m.app.inject({ method: 'DELETE', url: `/api/univers/${m.u.id}/cartes/${id}/fiche`, headers: m.lea });
  assert.ok(l2.statusCode >= 400 && l2.statusCode < 500, l2.body);
  assert.equal((await m.lire())[0].fiche.cle, 'lieu:a');
});

test('B-88 texte : le MJ écrit, réécrit, vide ; la version avance ; une version périmée → 409 carte_modifiee et le texte n’est pas touché', async () => {
  const m = await monter();
  await m.putCarte('c', { titre: 'C', visible: 'true', texte: 'Un.' });
  const id = (await m.lire())[0].id as number;
  const lireV = async () => (await m.carte(m.antor, id)).json().carte as Any;
  const ecrire = (texte: string, version: number, h = m.antor) =>
    m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/texte`, headers: h, payload: { texte, version } });
  const v0 = (await lireV()).version as number;
  const r = await ecrire('Deux.\n\n:::mj\nSecret.\n:::\n', v0);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await lireV()).version, v0 + 1);
  assert.ok(!(await m.carte(m.lea, id)).body.includes('Secret.'));
  const perimee = await ecrire('Écrasé.', v0);
  assert.equal(perimee.statusCode, 409, perimee.body);
  assert.equal(perimee.json().code, 'carte_modifiee');
  assert.equal((await lireV()).texte, 'Deux.\n\n:::mj\nSecret.\n:::\n');
  const vide = await ecrire('', v0 + 1);
  assert.equal(vide.statusCode, 200, vide.body);
  assert.equal((await lireV()).texte, '');
});

test('B-88 texte bords : 5 000 caractères passent, 5 001 → 400 champ texte et rien d’écrit', async () => {
  const m = await monter();
  await m.putCarte('c', { titre: 'C', visible: 'true' });
  const id = (await m.lire())[0].id as number;
  const ecrire = async (texte: string) => {
    const v = (await m.carte(m.antor, id)).json().carte.version as number;
    return m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/texte`, headers: m.antor, payload: { texte, version: v } });
  };
  assert.equal((await ecrire('a'.repeat(5000))).statusCode, 200);
  const r = await ecrire('b'.repeat(5001));
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'texte');
  assert.equal(((await m.carte(m.antor, id)).json().carte.texte as string).length, 5000);
});

test('B-88 exclusion : la joueuse n’écrit pas le texte ; un texte fait seulement de blocs MJ ne lui montre rien', async () => {
  const m = await monter();
  await m.putCarte('c', { titre: 'C', visible: 'true', texte: ':::mj\nRien que du MJ.\n:::\n' });
  const id = (await m.lire())[0].id as number;
  const v = (await m.carte(m.antor, id)).json().carte.version as number;
  const r = await m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/texte`, headers: m.lea, payload: { texte: 'Piratée', version: v } });
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, r.body);
  assert.equal((await m.carte(m.antor, id)).json().carte.texte, ':::mj\nRien que du MJ.\n:::\n');
  const d = await m.carte(m.lea, id);
  assert.ok(!d.body.includes('Rien que du MJ'));
  assert.ok(!/<p>|<div/.test(d.json().carte.html ?? ''), 'aucun contenu rendu pour la joueuse');
});

test('B-88 : le MJ en mode Joueur ne modifie ni texte ni rattachement (il voit ce que voit une joueuse)', async () => {
  const m = await monter();
  await m.putCarte('c', { titre: 'C', visible: 'true', texte: 'T' });
  const id = (await m.lire())[0].id as number;
  const v = (await m.carte(m.antor, id)).json().carte.version as number;
  const r = await m.app.inject({ method: 'PUT', url: `/api/univers/${m.u.id}/cartes/${id}/texte?mode=joueur`, headers: m.antor, payload: { texte: 'Z', version: v } });
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, r.body);
  assert.equal((await m.carte(m.antor, id)).json().carte.texte, 'T');
});

test('B-88 : supprimer la fiche détache la carte, qui reste', async () => {
  const m = await monter();
  await m.ficheApi('lieu:a', 'A', true);
  await m.putCarte('c', { titre: 'C', visible: 'true', fiche: 'lieu:a' });
  const d = await m.app.inject({ method: 'DELETE', url: `${m.base}/fiches/${encodeURIComponent('lieu:a')}`, headers: m.auth });
  assert.equal(d.statusCode, 204, d.body);
  const cartes = await m.lire();
  assert.equal(cartes.length, 1);
  assert.equal(cartes[0].fiche, null);
});

// ---------------------------------------------------------------- B-89 : le plafond du fond

test('B-89 / critère : 76 Mo au-dessus du plafond par défaut (75) → 413 fond_trop_lourd avec la limite, rien d’écrit ; l’admin relève à 80, le même envoi passe', async () => {
  const m = await monter();
  assert.deepEqual((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin })).json(), { fondCarteMaxMo: 75 });
  const fond = gros(76);
  const r = await m.putCarte('c', { titre: 'Grosse' }, fond);
  assert.equal(r.statusCode, 413, r.body);
  assert.equal(r.json().code, 'fond_trop_lourd');
  assert.equal(r.json().limiteMo, 75);
  assert.equal(m.nbCartes(), 0);
  const relev = await m.reglage(m.admin, 80);
  assert.equal(relev.statusCode, 200, relev.body);
  assert.deepEqual((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin })).json(), { fondCarteMaxMo: 80 });
  const r2 = await m.putCarte('c', { titre: 'Grosse' }, fond);
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal((await m.lire())[0].sha256Fond, sha(fond));
});

test('B-89 le plafond est appliqué à l’écran (route du fond d’E-11) comme à l’import : refus 413 avec la limite, fond inchangé ; relevé, le même envoi passe', async () => {
  const m = await monter();
  assert.equal((await m.reglage(m.admin, 1)).statusCode, 200);
  await m.putCarte('c', { titre: 'C' }, PNG);
  const id = (await m.lire())[0].id as number;
  const B = 'XB2';
  const corps = (b: Buffer) =>
    Buffer.concat([Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="f"\r\nContent-Type: image/png\r\n\r\n`), b, Buffer.from(`\r\n--${B}--\r\n`)]);
  const envoyer = (b: Buffer) =>
    m.app.inject({
      method: 'PUT',
      url: `/api/univers/${m.u.id}/cartes/${id}/fond`,
      headers: { ...m.antor, 'content-type': `multipart/form-data; boundary=${B}` },
      payload: corps(b),
    });
  const deux = gros(2);
  const r = await envoyer(deux);
  assert.equal(r.statusCode, 413, r.body);
  assert.equal(r.json().code, 'fond_trop_lourd');
  assert.equal(r.json().limiteMo, 1);
  assert.equal((await m.lire())[0].sha256Fond, sha(PNG));
  assert.equal((await m.reglage(m.admin, 3)).statusCode, 200);
  const r2 = await envoyer(deux);
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal((await m.lire())[0].sha256Fond, sha(deux));
});

test('B-89 bords : 1 et 500 acceptés, 0, 501, texte et vide refusés 400 champ fondCarteMaxMo, la valeur ne bouge pas', async () => {
  const m = await monter();
  const lireMo = async () => (await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin })).json().fondCarteMaxMo;
  assert.equal((await m.reglage(m.admin, 500)).statusCode, 200);
  assert.equal(await lireMo(), 500);
  assert.equal((await m.reglage(m.admin, 1)).statusCode, 200);
  assert.equal(await lireMo(), 1);
  for (const mauvais of [0, 501, -5, 'abc', null, 2.5]) {
    const r = await m.reglage(m.admin, mauvais);
    assert.equal(r.statusCode, 400, `${JSON.stringify(mauvais)} : ${r.body}`);
    assert.equal(r.json().champ, 'fondCarteMaxMo');
    assert.equal(await lireMo(), 1);
  }
});

test('B-89 exclusion : seul l’admin d’instance lit ou change le plafond (le MJ et la joueuse : 404), valeur inchangée', async () => {
  const m = await monter();
  for (const h of [m.antor, m.lea]) {
    assert.equal((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: h })).statusCode, 404);
    assert.equal((await m.reglage(h, 500)).statusCode, 404);
  }
  assert.deepEqual((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin })).json(), { fondCarteMaxMo: 75 });
});

test('B-89 : baisser le plafond ne retire pas un fond déjà posé (« les fonds déjà posés restent »)', async () => {
  const m = await monter();
  await m.putCarte('c', { titre: 'C' }, gros(2));
  assert.equal((await m.reglage(m.admin, 1)).statusCode, 200);
  const c = (await m.lire())[0];
  assert.equal(c.sha256Fond, sha(gros(2)));
  const fondMj = await m.app.inject({ method: 'GET', url: `/api/univers/${m.u.id}/cartes/${c.id}/fond`, headers: m.antor });
  assert.equal(fondMj.statusCode, 200);
});
