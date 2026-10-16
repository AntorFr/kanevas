// Tests of kanevas-fichiers-references, written from the exit criterion (B-48, B-56, AD-104, AD-111, E-9):
// sheets of the import API reference files by origin key, waiting then resolved.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'import-refs-'));
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);
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

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const suffixe = (lot?: number) => (lot ? `?lot=${lot}` : '');
  const putFichier = (cle: string, contenu: Buffer, champs: Record<string, string>, lot?: number) => {
    const m = multipart(contenu, champs);
    return app.inject({
      method: 'PUT',
      url: `${base}/fichiers/${encodeURIComponent(cle)}${suffixe(lot)}`,
      headers: { ...auth, 'content-type': m.type },
      payload: m.payload,
    });
  };
  const putFiche = (cle: string, payload: unknown, lot?: number) =>
    app.inject({ method: 'PUT', url: `${base}/fiches/${encodeURIComponent(cle)}${suffixe(lot)}`, headers: auth, payload: payload as object });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const lea = await connecter(app, 'lea');
  const antor = await connecter(app, 'antor');
  const voir = async (h: Record<string, string>, id: number, mode = '') =>
    app.inject({ method: 'GET', url: `/api/univers/${u.id}/fiches/${id}${mode}`, headers: h });
  const attente = () => (app.db.prepare('SELECT COUNT(*) n FROM fichiers_attente').get() as { n: number }).n;
  return { app, u, putFichier, putFiche, lot, clore, lire, lea, antor, voir, attente };
}

const FICHE = {
  type: 'lieu',
  titre: 'Quais',
  illustration: 'img:plan',
  sections: [
    {
      cle: 'desc',
      titre: 'Description',
      contenu: 'Vue : ![](fichier:cle:img:quais)',
      joueursLisent: true,
      fichiers: ['doc:tarifs'],
    },
  ],
};

const sectionVersions = (app: App) =>
  app.db.prepare('SELECT id, version, version_importee, modifie_le FROM sections ORDER BY id').all();

test('critère : fiche poussée avant ses fichiers, en attente, puis résolue sans bouger la version', async () => {
  const { app, putFichier, putFiche, lot, clore, lire, lea, antor, voir, attente } = await monter();
  const l0 = await lot();
  await clore(l0);
  const base0 = (await lire(l0)).enAttente as number; // links of the seed waiting for their key, not ours
  const l1 = await lot();
  // img:plan already exists (the sheet takes it for its illustration).
  assert.equal((await putFichier('img:plan', PNG2, { nom: 'plan.png' }, l1)).statusCode, 200);
  assert.equal((await putFichier('doc:secret', PDF, { nom: 'secret.pdf', visibilite: 'mj' }, l1)).statusCode, 200);
  const r = await putFiche('lieu:quais', FICHE, l1);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  const avert: string[] = r.json().avertissements;
  assert.equal(avert.length, 2, JSON.stringify(avert));
  assert.ok(avert.some((a) => a.includes('img:quais')));
  assert.ok(avert.some((a) => a.includes('doc:tarifs')));
  await clore(l1);
  const lt = await lire(l1);
  assert.equal(lt.enAttente, base0 + 2, JSON.stringify(lt));
  assert.equal(attente(), 2);

  const id = r.json().id as number;
  const vA = await voir(antor, id);
  assert.equal(vA.statusCode, 200);
  assert.ok(vA.body.includes("Fichier en attente d'import : « img:quais »."), vA.body);
  assert.ok(vA.body.includes("Fichier en attente d'import : « doc:tarifs »."), vA.body);
  const vL = await voir(lea, id);
  assert.equal(vL.statusCode, 200);
  assert.ok(!vL.body.includes('img:quais') && !vL.body.includes('doc:tarifs') && !vL.body.includes('attente'), vL.body);
  const vJ = await voir(antor, id, '?mode=joueur');
  assert.ok(!vJ.body.includes('img:quais') && !vJ.body.includes('doc:tarifs'), vJ.body);

  const avant = sectionVersions(app);
  const ficheAvant = app.db.prepare('SELECT modifie_le FROM fiches').all();
  const l2 = await lot();
  assert.equal((await putFichier('img:quais', PNG, { nom: 'quais.png' }, l2)).statusCode, 200);
  assert.equal((await putFichier('doc:tarifs', PDF, { nom: 'tarifs.pdf' }, l2)).statusCode, 200);
  await clore(l2);
  assert.equal(attente(), 0);
  assert.deepEqual(sectionVersions(app), avant);
  assert.deepEqual(app.db.prepare('SELECT modifie_le FROM fiches').all(), ficheAvant);
  const texte = (app.db.prepare('SELECT s.contenu FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.cle_origine = \'lieu:quais\'').get() as { contenu: string }).contenu;
  const idq = (app.db.prepare("SELECT id FROM fichiers WHERE cle_origine = 'img:quais'").get() as { id: number }).id;
  assert.equal(texte, `Vue : ![](fichier:${idq})`);
  const vA2 = await voir(antor, id);
  assert.ok(!vA2.body.includes('en attente'), vA2.body);
  assert.ok(vA2.body.includes('tarifs.pdf'), vA2.body);
  assert.ok(vA2.body.includes(`/fichiers/${idq}`), vA2.body);

  // Replay of everything: unchanged everywhere, nothing created.
  const l3 = await lot();
  assert.equal((await putFichier('img:plan', PNG2, { nom: 'plan.png' }, l3)).json().etat, 'inchangee');
  assert.equal((await putFichier('img:quais', PNG, { nom: 'quais.png' }, l3)).json().etat, 'inchangee');
  assert.equal((await putFichier('doc:tarifs', PDF, { nom: 'tarifs.pdf' }, l3)).json().etat, 'inchangee');
  const r3 = await putFiche('lieu:quais', FICHE, l3);
  assert.equal(r3.json().etat, 'inchangee', r3.body);
  assert.deepEqual(r3.json().avertissements, []);
  await clore(l3);
  const c = (await lire(l3)).compteurs;
  assert.equal(c.fiches.creees, 0);
  assert.equal(c.fiches.inchangees, 1);
  assert.equal(c.fichiers.creees, 0);
  assert.deepEqual(sectionVersions(app), avant);
});

test('critère : l’illustration en attente s’affiche en tuile pour le MJ seul, puis se pose à l’arrivée', async () => {
  const { app, putFichier, putFiche, lea, antor, voir } = await monter();
  const r = await putFiche('lieu:quais', { ...FICHE, sections: [] });
  const id = r.json().id as number;
  assert.equal(r.json().avertissements.length, 1);
  const vA = await voir(antor, id);
  assert.deepEqual(vA.json().illustration, { attente: true, cle: 'img:plan' });
  const vL = await voir(lea, id);
  assert.ok(!vL.body.includes('img:plan'));
  assert.equal((await putFichier('img:plan', PNG, { nom: 'plan.png' })).statusCode, 200);
  assert.notEqual((app.db.prepare("SELECT illustration_fichier_id i FROM fiches WHERE cle_origine = 'lieu:quais'").get() as { i: number | null }).i, null);
  assert.ok(!(await voir(antor, id)).body.includes('en attente'));
});

test('illustration qui nomme un document : 400 pas_une_image, rien de la fiche écrit', async () => {
  const { app, putFichier, putFiche, lot, clore, lire } = await monter();
  await putFichier('doc:tarifs', PDF, { nom: 'tarifs.pdf' });
  const l = await lot();
  const r = await putFiche('lieu:quais', { ...FICHE, illustration: 'doc:tarifs', sections: [] }, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'pas_une_image');
  assert.equal((app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE cle_origine = 'lieu:quais'").get() as { n: number }).n, 0);
  await clore(l);
  assert.equal((await lire(l)).compteurs.fiches.refusees, 1);
});

test('illustration qui nomme un document arrivé après l’attente : non posée, avertissement', async () => {
  const { app, putFichier, putFiche } = await monter();
  const r = await putFiche('lieu:quais', { ...FICHE, sections: [] });
  assert.equal(r.statusCode, 200);
  const a = await putFichier('img:plan', PDF, { nom: 'plan.pdf' });
  assert.equal(a.statusCode, 200);
  assert.equal(app.db.prepare('SELECT illustration_fichier_id i FROM fiches').get().i, null);
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fichiers_attente').get() as { n: number }).n, 0);
  assert.ok(a.json().avertissements.length >= 1, a.body);
});

test('illustration remplacée par Antor : non rétablie au rejeu, avertissement', async () => {
  const { app, putFichier, putFiche, lot, clore, lire } = await monter();
  await putFichier('img:plan', PNG, { nom: 'plan.png' });
  const r = await putFiche('lieu:quais', { ...FICHE, sections: [] });
  const id = r.json().id as number;
  const autre = (await putFichier('img:autre', PNG2, { nom: 'autre.png' })).json().id as number;
  app.db.prepare('UPDATE fiches SET illustration_fichier_id = ? WHERE id = ?').run(autre, id);
  const l = await lot();
  const r2 = await putFiche('lieu:quais', { ...FICHE, sections: [] }, l);
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(r2.json().avertissements.length, 1);
  assert.equal(app.db.prepare('SELECT illustration_fichier_id i FROM fiches WHERE id = ?').get(id).i, autre);
  await clore(l);
  assert.equal((await lire(l)).avertissements, 1);
});

test('101 clés de fichiers : 400 invalide, champ fichiers, 1 refusée, rien d’écrit', async () => {
  const { app, putFiche, lot, clore, lire } = await monter();
  const l = await lot();
  const fichiers = Array.from({ length: 101 }, (_, i) => `doc:${i}`);
  const r = await putFiche('lieu:quais', { type: 'lieu', titre: 'Quais', sections: [{ cle: 'd', titre: 'D', contenu: 'x', fichiers }] }, l);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'invalide');
  assert.equal(r.json().champ, 'fichiers');
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE cle_origine IS NOT NULL').get() as { n: number }).n, 0);
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fichiers_attente').get() as { n: number }).n, 0);
  await clore(l);
  assert.equal((await lire(l)).compteurs.fiches.refusees, 1);
});

test('100 clés : acceptées (en attente) ; 100 jointures posées puis une 101e qui arrive reste en attente', async () => {
  const { app, putFichier, putFiche, lot, clore, lire } = await monter();
  const cles = Array.from({ length: 100 }, (_, i) => `doc:${i}`);
  for (const c of cles) assert.equal((await putFichier(c, Buffer.from(`%PDF-1.4 ${c}`), { nom: `${c}.pdf` })).statusCode, 200);
  const corps = (fichiers: string[]) => ({ type: 'lieu', titre: 'Quais', sections: [{ cle: 'd', titre: 'D', contenu: 'x', fichiers }] });
  assert.equal((await putFiche('lieu:quais', corps(cles))).statusCode, 200);
  const joints = () => (app.db.prepare('SELECT COUNT(*) n FROM fichiers_sections WHERE joint = 1').get() as { n: number }).n;
  assert.equal(joints(), 100);
  const r = await putFiche('lieu:quais', corps([...cles, 'doc:cent-un']));
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(joints(), 100);
  // The 101st waits only through a section that has room: free a slot's worth by a section of its own.
  const l = await lot();
  const r2 = await putFiche('lieu:quais', { ...corps(cles), sections: [{ cle: 'd', titre: 'D', contenu: 'x', fichiers: cles }] }, l);
  assert.equal(r2.json().etat, 'inchangee');
  app.db
    .prepare("INSERT INTO fichiers_attente (univers_id, cle, section_id, maniere) SELECT (SELECT id FROM univers WHERE nom = 'Essai Kanka'), 'doc:cent-un', s.id, 'joint' FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.cle_origine = 'lieu:quais'")
    .run();
  const a = await putFichier('doc:cent-un', Buffer.from('%PDF-1.4 un'), { nom: 'un.pdf' }, l);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(joints(), 100);
  assert.equal((app.db.prepare("SELECT COUNT(*) n FROM fichiers_attente WHERE cle = 'doc:cent-un'").get() as { n: number }).n, 1);
  assert.ok(a.json().avertissements.length >= 1, a.body);
  await clore(l);
  assert.equal((await lire(l)).compteurs.fiches.refusees, 0);
});

test('clés jointes retirées à la main par Antor puis rejouées : non rétablies, avertissement', async () => {
  const { app, putFichier, putFiche } = await monter();
  await putFichier('doc:tarifs', PDF, { nom: 'tarifs.pdf' });
  const corps = { type: 'lieu', titre: 'Quais', sections: [{ cle: 'd', titre: 'D', contenu: 'x', joueursLisent: true, fichiers: ['doc:tarifs'] }] };
  assert.equal((await putFiche('lieu:quais', corps)).statusCode, 200);
  const joints = () => (app.db.prepare('SELECT COUNT(*) n FROM fichiers_sections WHERE joint = 1').get() as { n: number }).n;
  assert.equal(joints(), 1);
  app.db.prepare('DELETE FROM fichiers_sections WHERE joint = 1').run();
  const r = await putFiche('lieu:quais', corps);
  assert.equal(joints(), 0);
  assert.equal(r.json().avertissements.length, 1, r.body);
});

test('fichier mj joint dans une section lue des joueurs : Léa lit « Fichier réservé au MJ. », jamais son nom', async () => {
  const { putFichier, putFiche, lea, voir } = await monter();
  await putFichier('doc:secret', PDF, { nom: 'plan-secret.pdf', visibilite: 'mj' });
  const corps = { type: 'lieu', titre: 'Quais', sections: [{ cle: 'd', titre: 'D', contenu: '[le doc](fichier:cle:doc:secret)', joueursLisent: true, fichiers: ['doc:secret'] }] };
  const r = await putFiche('lieu:quais', corps);
  assert.equal(r.statusCode, 200, r.body);
  const v = await voir(lea, r.json().id);
  assert.ok(v.body.includes('Fichier réservé au MJ.'), v.body);
  assert.ok(!v.body.includes('plan-secret') && !v.body.includes('doc:secret'), v.body);
});
