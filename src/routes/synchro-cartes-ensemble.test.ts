// Ensemble tests of kanevas-synchro-cartes, written from the need only (B-112, B-88, B-89, B-90; exit criterion of the
// feature sheet): the door of each effect, in stub mode (stub token + stub sessions), real routes, base and rights.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'synchro-cartes-ensemble-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

const entete = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG = Buffer.from([...entete, 1, 2, 3, 4]);
const PNG_B = Buffer.from([...entete, 9, 9, 9, 9]);
const gros = (mo: number) => Buffer.concat([Buffer.from(entete), Buffer.alloc(mo * 1024 * 1024)]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const fichiersSurDisque = () => readdirSync(RACINE, { recursive: true, withFileTypes: true } as never).length;

function multipart(champs: Record<string, string>, fond: Buffer | null) {
  const B = 'EnsembleB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (fond) {
    parts.push(
      Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fond"; filename="f.png"\r\nContent-Type: image/png\r\n\r\n`),
      fond,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${B}--\r\n`));
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

type App = Awaited<ReturnType<typeof buildApp>>;
async function session(app: App, compte: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c, `session de ${compte}`);
  return { cookie: `kanevas_session=${c.value}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await session(app, 'antor');
  const lea = await session(app, 'lea');
  const admin = await session(app, 'admin');
  // the stub token reaches the seed universe only
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const api = `/api/univers/${u.id}`;
  const fiche = async (titre: string, ouverte: boolean) => {
    const f = (await app.inject({ method: 'POST', url: `${api}/fiches`, headers: antor, payload: { type: 'lieu', titre } })).json() as { id: number };
    const s = (await app.inject({ method: 'POST', url: `${api}/fiches/${f.id}/sections`, headers: antor, payload: { titre: 'S', contenu: 'x' } })).json() as { id: number };
    if (ouverte) await app.inject({ method: 'PATCH', url: `${api}/fiches/${f.id}/sections/${s.id}`, headers: antor, payload: { joueursLisent: true } });
    const cle = (await app.inject({ method: 'GET', url: `${api}/fiches/${f.id}`, headers: antor })).json().cle as string | undefined;
    return { id: f.id, cle };
  };
  const base = `/api/import/v1/univers/${u.id}`;
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const put = (cle: string, champs: Record<string, string>, fond: Buffer | null, lot?: number, h: Record<string, string> = {}) => {
    const m = multipart(champs, fond);
    return app.inject({
      method: 'PUT',
      url: `${base}/cartes/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: { ...auth, ...h, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const lire = async () =>
    (await app.inject({ method: 'GET', url: `/api/v1/univers/${u.id}/cartes`, headers: auth })).json().cartes as {
      id: number; cle: string; titre: string; visible: boolean; sha256Fond: string | null; texte: string; empreinte: string;
      fiche: { id: number; cle: string; titre: string } | null;
    }[];
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const lireLot = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const bloc = async (h: object, f: { id: number }) =>
    (await app.inject({ method: 'GET', url: `${api}/fiches/${f.id}/cartes`, headers: h })).json().cartes as { id: number; titre: string }[];
  return { app, antor, lea, admin, u, api, fiche, put, lire, lot, lireLot, bloc };
}

test('critère : fond + lieu envoyés, rejeu sans fond, le fond et le rattachement restent ; le joueur voit la carte dans le bloc du lieu', async () => {
  const m = await monter();
  const lieu = await m.fiche('Port-Sel', true);
  assert.ok(lieu.cle, 'la fiche porte une clé');
  const r1 = await m.put('car:port', { titre: 'Plan du port', visible: 'true', fiche: lieu.cle!, texte: 'Quais.\n\n:::mj\nCache secrète\n:::' }, PNG);
  assert.equal(r1.statusCode, 200, r1.body);
  const r2 = await m.put('car:port', { titre: 'Plan du port', visible: 'true' }, null);
  assert.equal(r2.statusCode, 200, r2.body);
  const cartes = await m.lire();
  const c = cartes.find((x) => x.titre === 'Plan du port')!;
  assert.equal(cartes.filter((x) => x.titre === 'Plan du port').length, 1, 'aucun doublon');
  assert.equal(c.sha256Fond, sha(PNG));
  assert.equal(c.fiche?.id, lieu.id);
  assert.match(c.texte, /Cache secrète/, 'le script lit le texte complet');
  assert.deepEqual((await m.bloc(m.lea, lieu)).map((x) => x.titre), ['Plan du port']);
  assert.deepEqual((await m.bloc(m.antor, lieu)).map((x) => x.titre), ['Plan du port']);
  // le joueur lit le texte sans le bloc MJ
  const vue = (await m.app.inject({ method: 'GET', url: `${m.api}/cartes/${c.id}`, headers: m.lea })).json() as { carte: { html: string } };
  assert.match(vue.carte.html, /Quais/);
  assert.doesNotMatch(JSON.stringify(vue), /Cache secrète/);
});

test('exclusion : une carte cachée n’apparaît ni dans le bloc du joueur ni dans sa lecture ; le MJ la voit', async () => {
  const m = await monter();
  const lieu = await m.fiche('Port-Sel', true);
  await m.put('car:cachee', { titre: 'Plan caché', visible: 'false', fiche: lieu.cle! }, PNG);
  assert.deepEqual(await m.bloc(m.lea, lieu), []);
  assert.deepEqual((await m.bloc(m.antor, lieu)).map((x) => x.titre), ['Plan caché']);
  const c = (await m.lire()).find((x) => x.titre === 'Plan caché')!;
  const r = await m.app.inject({ method: 'GET', url: `${m.api}/cartes/${c.id}`, headers: m.lea });
  assert.ok([403, 404].includes(r.statusCode), `lecture directe par le joueur : ${r.statusCode}`);
});

test('exclusion : une carte visible rattachée à une fiche que le joueur ne lit pas ne paraît pas dans son bloc', async () => {
  const m = await monter();
  const secret = await m.fiche('Crypte', false);
  await m.put('car:crypte', { titre: 'Plan de la crypte', visible: 'true', fiche: secret.cle! }, PNG);
  const r = await m.app.inject({ method: 'GET', url: `${m.api}/fiches/${secret.id}/cartes`, headers: m.lea });
  assert.ok(r.statusCode >= 400 || r.json().cartes.length === 0, `le joueur ne reçoit aucune carte (${r.statusCode} ${r.body})`);
  assert.doesNotMatch(r.body, /Plan de la crypte/);
});

test('bords du rattachement : fiche absente garde, fiche null détache, autre fiche change', async () => {
  const m = await monter();
  const a = await m.fiche('Lieu A', true);
  const b = await m.fiche('Lieu B', true);
  await m.put('car:x', { titre: 'X', visible: 'true', fiche: a.cle! }, PNG);
  await m.put('car:x', { titre: 'X renommée', visible: 'true' }, null);
  assert.equal((await m.lire())[0]!.fiche?.id, a.id, 'absente : le rattachement reste');
  await m.put('car:x', { titre: 'X renommée', fiche: b.cle! }, null);
  assert.equal((await m.lire())[0]!.fiche?.id, b.id, 'autre fiche : elle change');
  const r = await m.put('car:x', { titre: 'X renommée', fiche: 'null' }, null);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await m.lire())[0]!.fiche, null, 'null : détachée');
  assert.deepEqual(await m.bloc(m.antor, b), []);
});

test('bords : carte neuve sans fond (empreinte du fond nulle), puis fond ajouté au rejeu', async () => {
  const m = await monter();
  const r = await m.put('car:nue', { titre: 'Nue', visible: 'true' }, null);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await m.lire())[0]!.sha256Fond, null);
  await m.put('car:nue', { titre: 'Nue' }, PNG_B);
  assert.equal((await m.lire())[0]!.sha256Fond, sha(PNG_B));
});

test('échec : clé de fiche inconnue → 400 sur le champ fiche, rien d’écrit, refus compté dans le lot', async () => {
  const m = await monter();
  const l = await m.lot();
  const disque0 = fichiersSurDisque();
  const r = await m.put('car:z', { titre: 'Z', fiche: 'fiche-inconnue-xyz' }, PNG, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'fiche');
  assert.deepEqual(await m.lire(), []);
  assert.equal(fichiersSurDisque(), disque0, 'aucun fond posé');
  assert.equal((await m.lireLot(l)).compteurs.cartes.refusees, 1);
});

test('échec : forme autre qu’illustrée → 400, rien d’écrit', async () => {
  const m = await monter();
  const r = await m.put('car:g', { titre: 'G', forme: 'graphe' }, null);
  assert.equal(r.statusCode, 400, r.body);
  assert.deepEqual(await m.lire(), []);
});

test('échec : fond qui n’est pas une image → refusé, rien d’écrit', async () => {
  const m = await monter();
  const r = await m.put('car:t', { titre: 'T' }, Buffer.from('ceci est du texte, pas une image'));
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${r.statusCode} ${r.body}`);
  assert.deepEqual(await m.lire(), []);
});

test('empreinte lue périmée → 412, rien d’écrit ; empreinte courante → acceptée', async () => {
  const m = await monter();
  await m.put('car:e', { titre: 'E1' }, PNG);
  const lue = (await m.lire())[0]!.empreinte;
  await m.put('car:e', { titre: 'E2' }, null);
  const l = await m.lot();
  const r = await m.put('car:e', { titre: 'E3' }, null, l, { 'if-match': `"${lue}"` });
  assert.equal(r.statusCode, 412, r.body);
  assert.equal((await m.lire())[0]!.titre, 'E2');
  const fraiche = (await m.lire())[0]!.empreinte;
  const ok = await m.put('car:e', { titre: 'E4' }, null, l, { 'if-match': `"${fraiche}"` });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((await m.lire())[0]!.titre, 'E4');
});

test('lot : la carte créée puis la carte inchangée sont comptées sous « cartes »', async () => {
  const m = await monter();
  const l = await m.lot();
  await m.put('car:l', { titre: 'L' }, PNG, l);
  await m.put('car:l', { titre: 'L' }, null, l);
  const c = (await m.lireLot(l)).compteurs.cartes;
  assert.equal(c.creees, 1);
  assert.equal(c.inchangees, 1);
});

test('plafond : fond de 2 Mo refusé 413 fond_trop_lourd avec la limite à 1 Mo ; l’admin relève sur E-5, le même envoi passe', async () => {
  const m = await monter();
  const defaut = await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin });
  assert.equal(defaut.json().fondCarteMaxMo, 75, 'défaut 75 Mo');
  const poser = (mo: number) => m.app.inject({ method: 'PUT', url: '/api/instance/reglages', headers: m.admin, payload: { fondCarteMaxMo: mo } });
  assert.equal((await poser(1)).statusCode, 200);
  const disque0 = fichiersSurDisque();
  const gros2 = gros(2);
  const refus = await m.put('car:gros', { titre: 'Gros' }, gros2);
  assert.equal(refus.statusCode, 413, refus.body);
  assert.match(refus.body, /fond_trop_lourd/);
  assert.match(refus.body, /\b1\b/, 'la limite figure dans la réponse');
  assert.deepEqual(await m.lire(), []);
  assert.equal(fichiersSurDisque(), disque0);
  assert.equal((await poser(5)).statusCode, 200);
  const ok = await m.put('car:gros', { titre: 'Gros' }, gros2);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((await m.lire())[0]!.sha256Fond, sha(gros2));
});

test('plafond : s’applique aussi au fond posé sur l’écran E-11 (PUT …/fond) → 413', async () => {
  const m = await monter();
  await m.app.inject({ method: 'PUT', url: '/api/instance/reglages', headers: m.admin, payload: { fondCarteMaxMo: 1 } });
  await m.put('car:f', { titre: 'F' }, PNG);
  const c = (await m.lire())[0]!;
  const mp = multipart({}, gros(2));
  const r = await m.app.inject({ method: 'PUT', url: `${m.api}/cartes/${c.id}/fond`, headers: { ...m.antor, 'content-type': mp.type.replace('EnsembleB', 'EnsembleB') }, payload: mp.payload.toString('latin1').replace('name="fond"', 'name="fichier"') });
  assert.equal(r.statusCode, 413, r.body);
  assert.match(r.body, /fond_trop_lourd/);
  assert.equal((await m.lire())[0]!.sha256Fond, sha(PNG), 'le fond posé reste');
});

test('plafond : bornes du réglage 0 et 501 refusés, 1 et 500 acceptés ; un joueur et un MJ non admin n’y accèdent pas', async () => {
  const m = await monter();
  const poser = (h: object, mo: unknown) => m.app.inject({ method: 'PUT', url: '/api/instance/reglages', headers: h, payload: { fondCarteMaxMo: mo } });
  for (const mauvais of [0, 501, -3, 2.5, 'beaucoup']) {
    const r = await poser(m.admin, mauvais);
    assert.equal(r.statusCode, 400, `${mauvais} : ${r.body}`);
  }
  assert.equal((await poser(m.admin, 1)).statusCode, 200);
  assert.equal((await poser(m.admin, 500)).statusCode, 200);
  assert.equal((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin })).json().fondCarteMaxMo, 500);
  assert.equal((await poser(m.lea, 10)).statusCode, 404);
  assert.equal((await poser(m.antor, 10)).statusCode, 404);
  assert.equal((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.lea })).statusCode, 404);
  assert.equal((await m.app.inject({ method: 'GET', url: '/api/instance/reglages', headers: m.admin })).json().fondCarteMaxMo, 500);
});

test('B-88 : le MJ rattache, change et détache la carte ; le texte écrit est servi au joueur sans bloc MJ ; le joueur ne peut ni rattacher ni écrire', async () => {
  const m = await monter();
  const a = await m.fiche('Lieu A', true);
  const b = await m.fiche('Lieu B', true);
  const c = (await m.app.inject({ method: 'POST', url: `${m.api}/cartes`, headers: m.antor, payload: { titre: 'Plan', forme: 'illustree' } })).json() as { id: number };
  await m.app.inject({ method: 'PATCH', url: `${m.api}/cartes/${c.id}`, headers: m.antor, payload: { visible: true } });
  assert.equal((await m.app.inject({ method: 'PUT', url: `${m.api}/cartes/${c.id}/fiche`, headers: m.antor, payload: { ficheId: a.id } })).statusCode, 200);
  assert.deepEqual((await m.bloc(m.lea, a)).map((x) => x.titre), ['Plan']);
  assert.equal((await m.app.inject({ method: 'PUT', url: `${m.api}/cartes/${c.id}/fiche`, headers: m.antor, payload: { ficheId: b.id } })).statusCode, 200);
  assert.deepEqual(await m.bloc(m.lea, a), []);
  assert.deepEqual((await m.bloc(m.lea, b)).map((x) => x.titre), ['Plan']);
  assert.equal((await m.app.inject({ method: 'DELETE', url: `${m.api}/cartes/${c.id}/fiche`, headers: m.antor })).statusCode, 200);
  assert.deepEqual(await m.bloc(m.lea, b), []);
  // le joueur n'a aucun geste
  assert.ok((await m.app.inject({ method: 'PUT', url: `${m.api}/cartes/${c.id}/fiche`, headers: m.lea, payload: { ficheId: a.id } })).statusCode >= 400);
  assert.ok((await m.app.inject({ method: 'PUT', url: `${m.api}/cartes/${c.id}/texte`, headers: m.lea, payload: { texte: 'pirate', version: 1 } })).statusCode >= 400);
  assert.deepEqual(await m.bloc(m.lea, a), []);
});
