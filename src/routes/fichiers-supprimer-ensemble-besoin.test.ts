// Ensemble tests of kanevas-api-supprimer-fichier, written from the need alone (the feature sheet's « Livre »):
// a token deletes a file of the media library of its universe, with the screen's right (GM) and effect (the
// file leaves the library and the sections, illustrations are emptied, texts that cited it read « supprimé »).
// The effect is proved at its doors (the import API route, the library list, the bytes route, the section
// read); no screen is touched by this feature. Expectations are literals.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'fichiers-suppr-ens-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon, semerIllustrations } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6]);
const PDF = Buffer.from('%PDF-1.4 suppression');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = Record<string, string>;

async function connecter(app: App, compte: string): Promise<H> {
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

function multipart(nom: string, contenu: Buffer, champs: Record<string, string> = {}) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  await semerIllustrations(app.db, process.env.ATTACHMENTS_DIR!);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const autre = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const antorId = (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');

  const suffixe = (lot?: number) => (lot ? `?lot=${lot}` : '');
  const pousser = (cle: string, contenu: Buffer, nom: string, lot?: number) => {
    const m = multipart(nom, contenu, { nom });
    return app.inject({
      method: 'PUT',
      url: `${base}/fichiers/${encodeURIComponent(cle)}${suffixe(lot)}`,
      headers: { ...auth, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const supprimer = (cle: string | number, headers: H = auth, lot?: number) =>
    app.inject({ method: 'DELETE', url: `${base}/fichiers/${encodeURIComponent(String(cle))}${suffixe(lot)}`, headers });
  const ajouterEcran = async (h: H, nom: string, contenu: Buffer, champs: Record<string, string> = {}) => {
    const m = multipart(nom, contenu, champs);
    const r = await app.inject({ method: 'POST', url: `/api/univers/${u.id}/fichiers`, headers: { ...h, 'content-type': m.type }, payload: m.payload });
    assert.ok(r.statusCode < 300, r.body);
    return r;
  };
  const bibliotheque = async (id = u.id) =>
    ((await app.inject({ method: 'GET', url: `/api/univers/${id}/fichiers`, headers: antor })).json() as { fichiers: { id: number; nom: string }[] }).fichiers;
  const noms = async () => (await bibliotheque()).map((f) => f.nom).sort();
  const octets = (id: number, idU = u.id) => app.inject({ method: 'GET', url: `/api/univers/${idU}/fichiers/${id}`, headers: antor });
  const idDe = (cle: string) => (app.db.prepare('SELECT id FROM fichiers WHERE cle_origine = ?').get(cle) as { id: number }).id;
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const lecture = creerJeton(app.db, antorId, { nom: 'Lecteur', dureeJours: 30, acces: { tous: false, univers: [{ universId: u.id, niveau: 'lecture' }] } }).valeur;
  return { app, u, autre, antorId, auth, base, antor, lea, pousser, supprimer, ajouterEcran, bibliotheque, noms, octets, idDe, lot, clore, lire, lecture };
}

const FICHE = {
  type: 'lieu',
  titre: 'Quais',
  illustration: 'img:plan',
  sections: [
    { cle: 'desc', titre: 'Description', contenu: 'Vue : ![](fichier:cle:img:quais)', joueursLisent: true, fichiers: ['doc:tarifs'] },
  ],
};

async function fichePosee(m: Awaited<ReturnType<typeof monter>>) {
  assert.equal((await m.pousser('img:plan', PNG, 'plan.png')).statusCode, 200);
  assert.equal((await m.pousser('img:quais', PNG2, 'quais.png')).statusCode, 200);
  assert.equal((await m.pousser('doc:tarifs', PDF, 'tarifs.pdf')).statusCode, 200);
  const r = await m.app.inject({ method: 'PUT', url: `${m.base}/fiches/${encodeURIComponent('lieu:quais')}`, headers: m.auth, payload: FICHE });
  assert.equal(r.statusCode, 200, r.body);
  const ficheId = r.json().id as number;
  const sectionId = (m.app.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').get(ficheId) as { id: number }).id;
  const section = async () => (await m.app.inject({ method: 'GET', url: `/api/univers/${m.u.id}/fiches/${ficheId}/sections/${sectionId}`, headers: m.antor })).json();
  return { ficheId, sectionId, section };
}

// Panne visée : la route DELETE /fichiers/:cle n'existe pas, ou n'efface pas ce que l'écran efface.
test('critère : un script supprime un fichier posé par la synchro, la médiathèque ne le montre plus', async () => {
  const m = await monter();
  assert.equal((await m.pousser('doc:tarifs', PDF, 'tarifs.pdf')).statusCode, 200);
  const id = m.idDe('doc:tarifs');
  assert.ok((await m.noms()).includes('tarifs.pdf'));
  assert.equal((await m.octets(id)).statusCode, 200);
  const r = await m.supprimer('doc:tarifs');
  assert.equal(r.statusCode, 204, r.body);
  assert.ok(!(await m.noms()).includes('tarifs.pdf'));
  assert.equal((await m.octets(id)).statusCode, 404);
  assert.equal(m.app.db.prepare('SELECT COUNT(*) n FROM fichiers WHERE cle_origine = ?').get('doc:tarifs')!.n, 0);
});

// Panne visée : la route ne retrouve pas un fichier sans clé (id en chiffres).
test('critère : un script supprime un fichier ajouté à l’écran (sans clé), par son id', async () => {
  const m = await monter();
  const avant = await m.noms();
  const ajout = await m.ajouterEcran(m.antor, 'croquis-ecran.png', PNG);
  const id = (await m.bibliotheque()).find((f) => f.nom === 'croquis-ecran.png')!.id;
  assert.ok(id > 0, ajout.body);
  assert.deepEqual(await m.noms(), [...avant, 'croquis-ecran.png'].sort());
  const r = await m.supprimer(id);
  assert.equal(r.statusCode, 204, r.body);
  assert.deepEqual(await m.noms(), avant);
  assert.equal((await m.octets(id)).statusCode, 404);
});

// Panne visée : l'effet de la suppression diffère de celui de l'écran (illustration non vidée, rattachement gardé).
test('effet : illustration vidée, fichier joint retiré de la section, texte qui le citait lit « supprimé »', async () => {
  const m = await monter();
  const { ficheId, sectionId, section } = await fichePosee(m);
  const idQuais = m.idDe('img:quais');
  const avant = await section();
  assert.ok(!JSON.stringify(avant).includes('supprimé'), JSON.stringify(avant));
  const jointes = () => (m.app.db.prepare('SELECT COUNT(*) n FROM fichiers_sections WHERE section_id = ?').get(sectionId) as { n: number }).n;
  assert.equal(jointes(), 2); // the attached file and the one cited in the text
  assert.notEqual((m.app.db.prepare('SELECT illustration_fichier_id i FROM fiches WHERE id = ?').get(ficheId) as { i: number | null }).i, null);

  assert.equal((await m.supprimer('img:plan')).statusCode, 204);
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id i FROM fiches WHERE id = ?').get(ficheId) as { i: number | null }).i, null);
  assert.ok(!(await m.noms()).includes('plan.png'));

  assert.equal((await m.supprimer('doc:tarifs')).statusCode, 204);
  assert.equal(jointes(), 1);

  assert.equal((await m.supprimer('img:quais')).statusCode, 204);
  assert.equal(jointes(), 0);
  const apres = JSON.stringify(await section());
  assert.match(apres, /Fichier supprimé de la médiathèque\./, apres);
  assert.ok(!apres.includes(`/fichiers/${idQuais}`), apres);
});

// Bords : clé inconnue, rejeu.
test('bords : clé inconnue → 204, rejeu d’une suppression → 204, rien d’autre ne bouge', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  await m.pousser('doc:autre', PDF, 'autre.pdf');
  assert.equal((await m.supprimer('doc:inconnu')).statusCode, 204);
  assert.equal((await m.supprimer('99999')).statusCode, 204);
  assert.equal((await m.supprimer('doc:tarifs')).statusCode, 204);
  assert.equal((await m.supprimer('doc:tarifs')).statusCode, 204);
  const noms = await m.noms();
  assert.ok(noms.includes('autre.pdf'));
  assert.ok(!noms.includes('tarifs.pdf'));
});

// Bords : la clé qui revient après suppression peut être reposée.
test('bords : après suppression, la même clé se repose comme un fichier neuf', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  const ancien = m.idDe('doc:tarifs');
  assert.equal((await m.supprimer('doc:tarifs')).statusCode, 204);
  const r = await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  assert.equal(r.statusCode, 200, r.body);
  assert.notEqual(m.idDe('doc:tarifs'), ancien);
  assert.ok((await m.noms()).includes('tarifs.pdf'));
});

// Exclusion : le droit est celui de l'écran, MJ seul.
test('exclusion : un jeton dont le compte est joueur de l’univers reçoit 403, quelle que soit la clé, et le fichier reste', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  m.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE compte_id = ? AND univers_id = ?").run(m.antorId, m.u.id);
  const r = await m.supprimer('doc:tarifs');
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().message, 'Action réservée au MJ.', r.body);
  assert.equal((await m.supprimer('doc:inconnu')).statusCode, 403);
  assert.equal(m.app.db.prepare('SELECT COUNT(*) n FROM fichiers WHERE cle_origine = ?').get('doc:tarifs')!.n, 1);
});

// Exclusion : un jeton en lecture n'écrit pas.
test('exclusion : un jeton « lecture » reçoit 403 lecture_seule, le fichier reste', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  const r = await m.supprimer('doc:tarifs', { authorization: `Bearer ${m.lecture}` });
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().code, 'lecture_seule', r.body);
  assert.ok((await m.noms()).includes('tarifs.pdf'));
});

test('exclusion : sans jeton ou avec un jeton faux, 401 et le fichier reste', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  assert.equal((await m.supprimer('doc:tarifs', {})).statusCode, 401);
  assert.equal((await m.supprimer('doc:tarifs', { authorization: 'Bearer kvs_faux' })).statusCode, 401);
  assert.ok((await m.noms()).includes('tarifs.pdf'));
});

// Exclusion : un fichier d'un autre univers n'est pas atteint, même par son id.
test('exclusion : l’id d’un fichier d’un autre univers → 204 sans effet, ce fichier reste lisible', async () => {
  const m = await monter();
  const etranger = (await m.bibliotheque(m.autre.id))[0];
  assert.ok(etranger, 'le bouchon sème des fichiers dans Lame d’Ébène');
  const avant = (await m.bibliotheque(m.autre.id)).length;
  const r = await m.supprimer(etranger.id);
  assert.equal(r.statusCode, 204, r.body);
  assert.equal((await m.bibliotheque(m.autre.id)).length, avant);
  assert.equal((await m.octets(etranger.id, m.autre.id)).statusCode, 200);
});

// Échec : lot clos.
test('échec : lot clos → 409 lot_clos, le fichier reste', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  const l = await m.lot();
  assert.equal((await m.clore(l)).statusCode, 200);
  const r = await m.supprimer('doc:tarifs', m.auth, l);
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().code, 'lot_clos', r.body);
  assert.ok((await m.noms()).includes('tarifs.pdf'));
});

// Échec : le fichier de la bibliothèque d'assets reste refusé, comme à l'écran.
test('échec : un fichier utilisé par la bibliothèque d’assets → 409 fichier_bibliotheque, le fichier reste', async () => {
  const m = await monter();
  await m.pousser('img:asset', PNG, 'asset.png');
  const id = m.idDe('img:asset');
  m.app.db
    .prepare("INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, cree_le) VALUES (?, ?, 'a', 'objet', 1, 1, 'x')")
    .run(m.u.id, id);
  const r = await m.supprimer('img:asset');
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().code, 'fichier_bibliotheque', r.body);
  assert.equal((await m.octets(id)).statusCode, 200);
});

// Le lot compte les suppressions de fichiers.
test('lot : chaque suppression compte fichiers.supprimees, et la nature n’a pas d’autre effet sur les compteurs', async () => {
  const m = await monter();
  await m.pousser('doc:a', PDF, 'a.pdf');
  await m.pousser('doc:b', PDF, 'b.pdf');
  const l = await m.lot();
  assert.equal((await m.supprimer('doc:a', m.auth, l)).statusCode, 204);
  assert.equal((await m.lire(l)).compteurs.fichiers.supprimees, 1, JSON.stringify(await m.lire(l)));
  assert.equal((await m.supprimer('doc:b', m.auth, l)).statusCode, 204);
  const lu = await m.lire(l);
  assert.equal(lu.compteurs.fichiers.supprimees, 2, JSON.stringify(lu));
  assert.equal(lu.compteurs.fichiers.refusees ?? 0, 0, JSON.stringify(lu));
  assert.equal(lu.compteurs.fiches?.supprimees ?? 0, 0, JSON.stringify(lu));
});

// Le jeton qui a supprimé est celui de l'historique : l'alias /api/v1 vaut /api/import/v1.
test('alias : /api/v1/univers/:u/fichiers/:cle supprime comme /api/import/v1', async () => {
  const m = await monter();
  await m.pousser('doc:tarifs', PDF, 'tarifs.pdf');
  const r = await m.app.inject({ method: 'DELETE', url: `/api/v1/univers/${m.u.id}/fichiers/doc%3Atarifs`, headers: m.auth });
  assert.equal(r.statusCode, 204, r.body);
  assert.ok(!(await m.noms()).includes('tarifs.pdf'));
});
