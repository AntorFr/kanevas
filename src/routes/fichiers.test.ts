// Tests of kanevas-mediatheque-service, written from the exit criterion (AD-111, AD-117): the one
// upload function through the session API, with the accounts of the seed. Expectations are literals.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'fichiers-routes-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, semerIllustrations } = await import('../bouchon/depart.js');
const { ajouterFichier } = await import('../services/fichiers.js');
const { Readable } = await import('node:stream');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = Record<string, string>;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = Buffer.from('%PDF-1.4 tarifs');

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
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: image/png\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

const octets = () => readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  await semerIllustrations(app.db, RACINE);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const base = `/api/univers/${u.id}`;
  const fiche = (t: string) => (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, u.id) as { id: number }).id;
  const section = (f: string, t: string) =>
    (app.db.prepare('SELECT id FROM sections WHERE titre = ? AND fiche_id = ?').get(t, fiche(f)) as { id: number }).id;
  const compte = (n: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as { id: number }).id;
  const envoyer = (h: H, nom: string, contenu: Buffer, champs: Record<string, string> = {}) => {
    const m = multipart(nom, contenu, champs);
    return app.inject({ method: 'POST', url: `${base}/fichiers`, headers: { ...h, 'content-type': m.type }, payload: m.payload });
  };
  const liste = async (h: H) => (await app.inject({ method: 'GET', url: `${base}/fichiers`, headers: h })).json() as {
    fichiers: { id: number; nom: string; visibilite: string; ajoutePar: number }[];
    suite: number | null;
  };
  const ajouterMembre = (compteId: number, role: string) =>
    app.db.prepare('INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, ?)').run(u.id, compteId, role);
  return { app, antor, lea, teo, u, base, fiche, section, compte, envoyer, liste, ajouterMembre };
}

test('Antor envoie « tarifs-du-port.pdf » vers « Description » de Port-Sel : 201, joueurs, ajoute_par Antor, joint', async () => {
  const m = await monter();
  const sec = m.section('Port-Sel', 'Description');
  const r = await m.envoyer(m.antor, 'tarifs-du-port.pdf', PDF, { section: String(sec), maniere: 'joint' });
  assert.equal(r.statusCode, 201, r.body);
  const v = r.json();
  assert.equal(v.nom, 'tarifs-du-port.pdf');
  assert.equal(v.visibilite, 'joueurs');
  assert.equal(v.ajoutePar, m.compte('antor'));
  assert.equal(v.type, 'application/octet-stream');
  const dans = (await m.liste(m.antor)).fichiers.find((f) => f.id === v.id);
  assert.ok(dans);
  assert.equal(dans.visibilite, 'joueurs');
  assert.equal(dans.ajoutePar, m.compte('antor'));
  assert.deepEqual(
    m.app.db.prepare('SELECT joint FROM fichiers_sections WHERE fichier_id = ? AND section_id = ?').all(v.id, sec),
    [{ joint: 1 }],
  );
  // Léa reads the section: she sees the joined file and can download it.
  const lu = await m.app.inject({ method: 'GET', url: `${m.base}/fichiers/${v.id}`, headers: m.lea });
  assert.equal(lu.statusCode, 200);
  assert.ok(lu.rawPayload.equals(PDF));
});

test('envoyé depuis un bloc MJ, « plan.png » entre mj ; une visibilité du client est ignorée', async () => {
  const m = await monter();
  const sec = m.section('Port-Sel', 'Description');
  const r = await m.envoyer(m.antor, 'plan.png', PNG, { section: String(sec), maniere: 'texte', blocMj: 'true', visibilite: 'joueurs' });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().visibilite, 'mj');
  assert.equal(r.json().reference, `fichier:${r.json().id}`);
  // The other way round: a client claiming « mj » on a section read by players gets « joueurs ».
  const r2 = await m.envoyer(m.antor, 'quai.png', PNG, { section: String(sec), maniere: 'joint', visibilite: 'mj', secrete: 'true' });
  assert.equal(r2.json().visibilite, 'joueurs');
  // And one claiming « joueurs » into the library page still gets the place's answer.
  const r3 = await m.envoyer(m.antor, 'lib.png', PNG, { visibilite: 'mj' });
  assert.equal(r3.statusCode, 201);
  assert.equal(r3.json().visibilite, 'joueurs');
});

test('un envoi dans une section fermée aux joueurs entre mj, même sans bloc', async () => {
  const m = await monter();
  const sec = m.section('Port-Sel', 'Vérité');
  const r = await m.envoyer(m.antor, 'v.png', PNG, { section: String(sec), maniere: 'joint' });
  assert.equal(r.json().visibilite, 'mj');
});

test('Léa, auteur de « Notes de la table », y envoie « carnet.pdf » : mj, ajoute_par Léa ; ni médiathèque ni illustration', async () => {
  const m = await monter();
  m.ajouterMembre(m.compte('teo'), 'joueur');
  const sec = m.section('Léa Brisefer', 'Notes de la table');
  const r = await m.envoyer(m.lea, 'carnet.pdf', PDF, { section: String(sec), maniere: 'joint' });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().visibilite, 'mj');
  assert.equal(r.json().ajoutePar, m.compte('lea'));
  // Léa sees her own file in the library, Teo does not.
  assert.ok((await m.liste(m.lea)).fichiers.some((f) => f.nom === 'carnet.pdf'));
  assert.ok(!(await m.liste(m.teo)).fichiers.some((f) => f.nom === 'carnet.pdf'));
  assert.equal((await m.app.inject({ method: 'GET', url: `${m.base}/fichiers/${r.json().id}`, headers: m.teo })).statusCode, 404);
  assert.equal((await m.app.inject({ method: 'GET', url: `${m.base}/fichiers/${r.json().id}`, headers: m.lea })).statusCode, 200);

  const avant = octets();
  const med = await m.envoyer(m.lea, 'x.png', PNG);
  assert.equal(med.statusCode, 403);
  const ill = await m.envoyer(m.lea, 'x.png', PNG, { fiche: String(m.fiche('Léa Brisefer')) });
  assert.equal(ill.statusCode, 403);
  assert.equal(octets(), avant, 'un refus ne laisse aucun octet');
  assert.equal((await m.liste(m.lea)).fichiers.filter((f) => f.nom === 'x.png').length, 0);
});

test('Léa ne peut pas envoyer dans un bloc MJ ni dans une section qu’elle ne peut pas écrire', async () => {
  const m = await monter();
  const notes = m.section('Léa Brisefer', 'Notes de la table');
  const avant = octets();
  const bloc = await m.envoyer(m.lea, 'b.png', PNG, { section: String(notes), maniere: 'texte', blocMj: 'true' });
  assert.equal(bloc.statusCode, 403);
  const desc = await m.envoyer(m.lea, 'b.png', PNG, { section: String(m.section('Port-Sel', 'Description')), maniere: 'joint' });
  assert.equal(desc.statusCode, 403);
  const cachee = await m.envoyer(m.lea, 'b.png', PNG, { section: String(m.section('Port-Sel', 'Vérité')), maniere: 'joint' });
  assert.equal(cachee.statusCode, 404);
  assert.equal(octets(), avant);
});

test('un fichier de 0 octet : 400 fichier_vide, aucune ligne, aucun octet dans tmp/ ni sur le volume', async () => {
  const m = await monter();
  const lignes = (m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers').get() as { n: number }).n;
  const avant = octets();
  for (const champs of [{}, { section: String(m.section('Port-Sel', 'Description')), maniere: 'joint' }, { fiche: String(m.fiche('Port-Sel')) }]) {
    const r = await m.envoyer(m.antor, 'vide.pdf', Buffer.alloc(0), champs);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().code, 'fichier_vide');
  }
  assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers').get() as { n: number }).n, lignes);
  assert.equal(octets(), avant);
  assert.equal(existsSync(join(RACINE, 'tmp')) ? readdirSync(join(RACINE, 'tmp')).length : 0, 0);
});

test('une illustration qui n’est pas une image : refusée, ni ligne ni octet ni référence', async () => {
  const m = await monter();
  const f = m.fiche('Suie');
  const avant = octets();
  const lignes = (m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers').get() as { n: number }).n;
  const ancienne = (m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(f) as { i: number | null }).i;
  const r = await m.envoyer(m.antor, 'a.pdf', PDF, { fiche: String(f) });
  assert.equal(r.statusCode, 400);
  assert.equal(octets(), avant);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers').get() as { n: number }).n, lignes);
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(f) as { i: number | null }).i, ancienne);
});

test('la 101e jointure : 409 limite_pieces pour Antor, 403 pour Léa ; 100 fichiers existants joints tiennent', async () => {
  const m = await monter();
  const a = { compteId: m.compte('antor') };
  // Antor fills « Notes de la table » (Léa's) up to 100 joined files, through the one function.
  const notes = m.section('Léa Brisefer', 'Notes de la table');
  for (let i = 0; i < 100; i++) {
    await ajouterFichier(m.app.db, a, m.u.id, Readable.from([PDF]), `n${i}.pdf`, { ou: 'section', sectionId: notes, maniere: 'joint' });
  }
  assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers_sections WHERE section_id = ? AND joint = 1').get(notes) as { n: number }).n, 100);
  const lea = await m.envoyer(m.lea, 'de-trop.pdf', PDF, { section: String(notes), maniere: 'joint' });
  assert.equal(lea.statusCode, 403);
  assert.equal(lea.json().message ?? lea.json().erreur, "Cette section ne peut pas recevoir d'autre fichier.");
  assert.equal(lea.json().code, 'limite_pieces');
  const antor = await m.envoyer(m.antor, 'de-trop.pdf', PDF, { section: String(notes), maniere: 'joint' });
  assert.equal(antor.statusCode, 409);
  assert.equal(antor.json().code, 'limite_pieces');
  assert.equal((m.app.db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE nom = 'de-trop.pdf'").get() as { n: number }).n, 0);

  // 100 existing files joined to a fresh section hold; the 101st join is a conflict.
  const val = m.fiche('Val-Fortin');
  const s2 = m.section('Val-Fortin', 'Description');
  const ids: number[] = [];
  for (let i = 0; i < 101; i++) {
    ids.push((await ajouterFichier(m.app.db, a, m.u.id, Readable.from([PDF]), `e${i}.pdf`, { ou: 'mediatheque' })).id);
  }
  for (let i = 0; i < 100; i++) {
    const r = await m.app.inject({ method: 'POST', url: `${m.base}/fiches/${val}/sections/${s2}/fichiers`, headers: m.antor, payload: { fichierId: ids[i] } });
    assert.equal(r.statusCode, 201, `jointure ${i + 1}: ${r.body}`);
  }
  const trop = await m.app.inject({ method: 'POST', url: `${m.base}/fiches/${val}/sections/${s2}/fichiers`, headers: m.antor, payload: { fichierId: ids[100] } });
  assert.equal(trop.statusCode, 409);
  assert.equal(trop.json().code, 'limite_pieces');
});

test('choisir un fichier existant le joint sans changer sa visibilité ; le supprimer enlève jointures et illustrations, octets après', async () => {
  const m = await monter();
  const plan = (await m.liste(m.antor)).fichiers.find((f) => f.nom === 'Plan secret de la Guilde')!;
  assert.equal(plan.visibilite, 'mj');
  const val = m.fiche('Val-Fortin');
  const sec = m.section('Val-Fortin', 'Description');
  const j = await m.app.inject({ method: 'POST', url: `${m.base}/fiches/${val}/sections/${sec}/fichiers`, headers: m.antor, payload: { fichierId: plan.id } });
  assert.equal(j.statusCode, 201, j.body);
  assert.equal(j.json().visibilite, 'mj', 'joindre ne change pas la visibilité');
  assert.equal((await m.liste(m.antor)).fichiers.find((f) => f.id === plan.id)!.visibilite, 'mj');

  // « Carte des Sphères »: illustration of Port-Sel, joined to Aldric, cited in Val-Fortin.
  const carte = (await m.liste(m.antor)).fichiers.find((f) => f.nom === 'Carte des Sphères')!;
  const port = m.fiche('Port-Sel');
  const disque = (m.app.db.prepare('SELECT disque FROM fichiers WHERE id = ?').get(carte.id) as { disque: string }).disque;
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(port) as { i: number }).i, carte.id);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers_sections WHERE fichier_id = ?').get(carte.id) as { n: number }).n, 2);
  assert.ok(readdirSync(RACINE, { recursive: true }).some((e) => String(e).endsWith(disque)));

  const d = await m.app.inject({ method: 'DELETE', url: `${m.base}/fichiers/${carte.id}`, headers: m.antor });
  assert.equal(d.statusCode, 204);
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(port) as { i: number | null }).i, null);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers_sections WHERE fichier_id = ?').get(carte.id) as { n: number }).n, 0);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fichiers WHERE id = ?').get(carte.id) as { n: number }).n, 0);
  assert.ok(!readdirSync(RACINE, { recursive: true }).some((e) => String(e).endsWith(disque)), 'octets partis');
  assert.equal((await m.app.inject({ method: 'GET', url: `${m.base}/fichiers/${carte.id}`, headers: m.antor })).statusCode, 404);
});

test('Léa ne peut ni supprimer, ni renommer, ni changer la visibilité d’un fichier', async () => {
  const m = await monter();
  const f = (await m.liste(m.antor)).fichiers.find((x) => x.nom === 'port-sel-quais.webp')!;
  for (const [verbe, payload] of [['PATCH', { nom: 'z' }], ['PATCH', { visibilite: 'mj' }], ['DELETE', undefined]] as const) {
    const r = await m.app.inject({ method: verbe, url: `${m.base}/fichiers/${f.id}`, headers: m.lea, payload });
    assert.equal(r.statusCode, 403);
  }
  assert.equal((await m.liste(m.antor)).fichiers.find((x) => x.id === f.id)!.nom, 'port-sel-quais.webp');
});

test('la liste : le fichier mj d’Antor est invisible de Léa, curseur de 100 par page', async () => {
  const m = await monter();
  const noms = (await m.liste(m.lea)).fichiers.map((f) => f.nom);
  assert.ok(!noms.includes('Plan secret de la Guilde'));
  assert.ok(noms.includes('Carte des Sphères'));
  const a = { compteId: m.compte('antor') };
  for (let i = 0; i < 105; i++) await ajouterFichier(m.app.db, a, m.u.id, Readable.from([PDF]), `p${i}.pdf`, { ou: 'mediatheque' });
  const p1 = await m.liste(m.antor);
  assert.equal(p1.fichiers.length, 100);
  assert.ok(p1.suite !== null);
  const p2 = (await m.app.inject({ method: 'GET', url: `${m.base}/fichiers?apres=${p1.suite}`, headers: m.antor })).json();
  assert.ok(p2.fichiers.length > 0 && p2.fichiers.length <= 100);
  assert.equal(new Set([...p1.fichiers, ...p2.fichiers].map((f: { id: number }) => f.id)).size, p1.fichiers.length + p2.fichiers.length);
});

test('les anciennes routes des pièces jointes et d’illustration en octets sont retirées', async () => {
  const m = await monter();
  const f = m.fiche('Port-Sel');
  const s = m.section('Port-Sel', 'Description');
  for (const [verbe, url] of [
    ['POST', `${m.base}/fiches/${f}/sections/${s}/pieces-jointes`],
    ['GET', `${m.base}/fiches/${f}/pieces-jointes/1/fichier`],
    ['GET', `${m.base}/fiches/${f}/illustration`],
  ] as const) {
    const r = await m.app.inject({ method: verbe, url, headers: m.antor });
    assert.equal(r.statusCode, 404, `${verbe} ${url}`);
  }
});

test('ajouterFichier avec {compteId} seul, cible illustration : le fichier entre en médiathèque et est posé en illustration', async () => {
  const m = await monter();
  const f = m.fiche('Suie');
  const v = await ajouterFichier(m.app.db, { compteId: m.compte('antor') }, m.u.id, Readable.from([PNG]), 'image-generee.png', { ou: 'illustration', ficheId: f });
  assert.equal(v.nom, 'image-generee.png');
  assert.equal(v.type, 'image/png');
  assert.equal(v.ajoutePar, m.compte('antor'));
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(f) as { i: number }).i, v.id);
  assert.ok((await m.liste(m.antor)).fichiers.some((x) => x.id === v.id));
  // Same call without being a member of the universe: not found, nothing written.
  const avant = octets();
  await assert.rejects(() => ajouterFichier(m.app.db, { compteId: 999999 }, m.u.id, Readable.from([PNG]), 'x.png', { ou: 'illustration', ficheId: f }));
  assert.equal(octets(), avant);
});

test('le type est lu aux octets : un HTML nommé x.png est servi en téléchargement opaque', async () => {
  const m = await monter();
  const r = await m.envoyer(m.antor, 'x.png', Buffer.from('<html><script>1</script></html>'));
  assert.equal(r.json().type, 'application/octet-stream');
  assert.equal(r.json().image, false);
  const lu = await m.app.inject({ method: 'GET', url: `${m.base}/fichiers/${r.json().id}`, headers: m.antor });
  assert.equal(lu.headers['content-type'], 'application/octet-stream');
  assert.match(String(lu.headers['content-disposition']), /^attachment; filename="x\.png"/);
  assert.equal(lu.headers['x-content-type-options'], 'nosniff');
});

test('sans session, aucune route de fichier ne répond autre chose qu’un refus', async () => {
  const m = await monter();
  for (const [verbe, url] of [['GET', `${m.base}/fichiers`], ['GET', `${m.base}/fichiers/1`], ['POST', `${m.base}/fichiers`], ['DELETE', `${m.base}/fichiers/1`]] as const) {
    const r = await m.app.inject({ method: verbe, url });
    assert.ok(r.statusCode === 401 || r.statusCode === 302 || r.statusCode === 403, `${verbe} ${url} → ${r.statusCode}`);
  }
});

test('illustration : le MJ envoie (multipart) ou choisit ({fichierId}) ; retirer garde le fichier ; Léa 403 ; fiche invisible 404', async () => {
  const m = await monter();
  const f = m.fiche('Léa Brisefer');
  const url = `${m.base}/fiches/${f}/illustration`;
  const mp = multipart('neuve.png', PNG);
  const put = await m.app.inject({ method: 'PUT', url, headers: { ...m.antor, 'content-type': mp.type }, payload: mp.payload });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().illustration.type, 'image/png');
  const id = put.json().illustration.id;
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(f) as { i: number }).i, id);
  assert.equal((await m.liste(m.antor)).fichiers.find((x) => x.id === id)!.nom, 'neuve.png');

  // Léa (a player who reads the sheet) can neither change nor remove it.
  assert.equal((await m.app.inject({ method: 'PUT', url, headers: m.lea, payload: { fichierId: id } })).statusCode, 403);
  assert.equal((await m.app.inject({ method: 'DELETE', url, headers: m.lea })).statusCode, 403);

  // Choosing a non-image of the library is refused, an image is accepted.
  const pdf = (await m.envoyer(m.antor, 'n.pdf', PDF)).json();
  const refus = await m.app.inject({ method: 'PUT', url, headers: m.antor, payload: { fichierId: pdf.id } });
  assert.equal(refus.statusCode, 400);
  assert.equal(refus.json().code, 'pas_une_image');
  const carte = (await m.liste(m.antor)).fichiers.find((x) => x.nom === 'Carte des Sphères')!;
  assert.equal((await m.app.inject({ method: 'PUT', url, headers: m.antor, payload: { fichierId: carte.id } })).statusCode, 200);

  const del = await m.app.inject({ method: 'DELETE', url, headers: m.antor });
  assert.equal(del.statusCode, 204);
  assert.equal((m.app.db.prepare('SELECT illustration_fichier_id AS i FROM fiches WHERE id = ?').get(f) as { i: number | null }).i, null);
  assert.ok((await m.liste(m.antor)).fichiers.some((x) => x.id === carte.id), 'le fichier reste en médiathèque');
  assert.equal((await m.app.inject({ method: 'DELETE', url, headers: m.antor })).statusCode, 204, 'retirer sans image : 204');

  // A sheet of another universe is not found.
  const ailleurs = (m.app.db.prepare("SELECT f.id FROM fiches f JOIN univers u ON u.id = f.univers_id WHERE u.nom = 'Essai Kanka' LIMIT 1").get() as { id: number }).id;
  const inc = await m.app.inject({ method: 'PUT', url: `${m.base}/fiches/${ailleurs}/illustration`, headers: m.antor, payload: { fichierId: carte.id } });
  assert.equal(inc.statusCode, 404);
});

test('un fichier d’un autre univers ne se joint ni ne se choisit : introuvable', async () => {
  const m = await monter();
  const autre = (m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const etr = await ajouterFichier(m.app.db, { compteId: m.compte('antor') }, autre, Readable.from([PNG]), 'etranger.png', { ou: 'mediatheque' }, RACINE);
  const j = await m.app.inject({
    method: 'POST',
    url: `${m.base}/fiches/${m.fiche('Port-Sel')}/sections/${m.section('Port-Sel', 'Description')}/fichiers`,
    headers: m.antor,
    payload: { fichierId: etr.id },
  });
  assert.equal(j.statusCode, 404);
  assert.equal((await m.app.inject({ method: 'GET', url: `${m.base}/fichiers/${etr.id}`, headers: m.antor })).statusCode, 404);
});

test('retirer une jointure garde le fichier ; Léa ne retire pas dans une section qu’elle n’écrit pas', async () => {
  const m = await monter();
  const f = (await m.liste(m.antor)).fichiers.find((x) => x.nom === 'port-sel-quais.webp')!;
  const fiche = m.fiche('Port-Sel');
  const sec = m.section('Port-Sel', 'Description');
  const url = `${m.base}/fiches/${fiche}/sections/${sec}/fichiers/${f.id}`;
  assert.equal((await m.app.inject({ method: 'DELETE', url, headers: m.lea })).statusCode, 403);
  assert.equal((await m.app.inject({ method: 'DELETE', url, headers: m.antor })).statusCode, 204);
  assert.equal((await m.app.inject({ method: 'DELETE', url, headers: m.antor })).statusCode, 404);
  assert.ok((await m.liste(m.antor)).fichiers.some((x) => x.id === f.id));
});

test('AD-93 : fiche invisible de Léa → 404 de corps identique à un identifiant inconnu à PUT (envoi, choix) et DELETE ; fiche visible → 403', async () => {
  const m = await monter();
  const cachee = m.fiche('Le Prieur masqué');
  const visible = m.fiche('Maître Aldric');
  const carte = (await m.liste(m.antor)).fichiers.find((x) => x.nom === 'Carte des Sphères')!;
  const mp = multipart('a.png', PNG);
  const essais = (id: number) => [
    () => m.app.inject({ method: 'PUT', url: `${m.base}/fiches/${id}/illustration`, headers: { ...m.lea, 'content-type': mp.type }, payload: mp.payload }),
    () => m.app.inject({ method: 'PUT', url: `${m.base}/fiches/${id}/illustration`, headers: m.lea, payload: { fichierId: carte.id } }),
    () => m.app.inject({ method: 'DELETE', url: `${m.base}/fiches/${id}/illustration`, headers: m.lea }),
  ];
  const inconnues = await Promise.all(essais(999999).map((f) => f()));
  const cachees = await Promise.all(essais(cachee).map((f) => f()));
  const visibles = await Promise.all(essais(visible).map((f) => f()));
  for (let i = 0; i < 3; i++) {
    assert.equal(inconnues[i]!.statusCode, 404, `inconnue ${i}`);
    assert.equal(cachees[i]!.statusCode, 404, `cachée ${i}`);
    assert.equal(cachees[i]!.body, inconnues[i]!.body, `corps identique ${i}`);
    assert.equal(visibles[i]!.statusCode, 403, `visible ${i}`);
  }
});
