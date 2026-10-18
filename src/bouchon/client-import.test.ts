import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('./depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { listerComptesRendus } = await import('../services/comptes_rendus.js');
const { listerFiches, lireFiche } = await import('../services/fiches.js');
const { listerCampagnes, changerStatutCampagne } = await import('../services/campagnes.js');
const { creerJeton } = await import('../services/jetons.js');
const { listerScenarios } = await import('../services/scenarios.js');

const CLIENT = fileURLToPath(new URL('./client-import.ts', import.meta.url));
const DOSSIER = fileURLToPath(new URL('./echantillon/', import.meta.url));

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;
let origine: string;
let univers: number;
let antor: number;
let lea: number;

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  origine = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  univers = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  antor = trouverCompte(app.db, 'antor')!.id;
  lea = trouverCompte(app.db, 'lea')!.id;
});
after(async () => { await app.close(); });

function client(args: string[]) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile('node', ['--import', 'tsx', CLIENT, ...args], { timeout: 120_000 }, (e, out, err) => {
      resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out, err });
    });
  });
}
const pousser = (extra: string[] = [], u = univers, jeton = JETON_BOUCHON) =>
  client([origine, String(u), jeton, ...extra]);

test('critère : premier lot → fiches 11 créées, fichiers 3, campagnes 2, scénarios 2, relations 3, un avertissement, zéro refus', async () => {
  const r = await pousser();
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^Fiches : 11 créées, 0 mise à jour, 0 inchangée, 0 refusée$/m);
  assert.match(r.out, /^Fichiers : 3 créés, 0 mis à jour, 0 inchangé, 0 refusé$/m);
  assert.match(r.out, /^Campagnes : 2 créées, /m);
  assert.match(r.out, /^Scénarios : 2 créés, /m);
  assert.match(r.out, /^Relations : 3 créées, /m);
  assert.match(r.out, /^Avertissements : 1 ;/m);
  assert.ok(!/ [1-9]\d* refusé/.test(r.out));
  assert.ok(!r.out.includes(JETON_BOUCHON) && !r.err.includes(JETON_BOUCHON));
});

test('critère E-13 : les trois comptes-rendus sont rangés par date d’origine, du plus récent au plus ancien', () => {
  const l = listerComptesRendus(app.db, { compteId: antor }, univers).comptesRendus;
  assert.deepEqual(l.map((x) => [x.titre, x.creeLe]), [
    ['Journal de bord — Jour 2', '2021-04-18T12:00:00.000Z'],
    ['Journal de bord — Jour 1', '2021-03-03T12:00:00.000Z'],
    ['Journal de bord — Jour 0', '2021-02-10T12:00:00.000Z'],
  ]);
});

test('critère : le lien vers la clé tardive est résolu, celui vers la clé qui n’arrive jamais reste en attente', () => {
  const id = (app.db.prepare("SELECT id FROM fiches WHERE cle_origine = 'lieu:eneria-prime'").get() as { id: number }).id;
  const html = lireFiche(app.db, { compteId: antor }, univers, id).sections.map((x) => x.html).join('\n');
  assert.match(html, /<a [^>]*href="\/univers\/\d+\/fiche\/\d+"[^>]*>Base Éneria-1<\/a>/);
  assert.match(html, /<span class="lien-attente"[^>]*>Nyx<\/span>/);
});

test('critère : rejeu sans changement → 0 créée, 11 inchangées, rien de créé ailleurs', async () => {
  const avant = (t: string) => (app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  const tables = ['fiches', 'sections', 'fichiers', 'campagnes', 'scenarios', 'relations'];
  const comptes = tables.map(avant);
  const r = await pousser();
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^Fiches : 0 créée, 0 mise à jour, 11 inchangées, 0 refusée$/m);
  assert.match(r.out, /^Fichiers : 0 créé, /m);
  assert.match(r.out, /^Campagnes : 0 créée, /m);
  assert.match(r.out, /^Scénarios : 0 créé, /m);
  assert.match(r.out, /^Relations : 0 créée, /m);
  assert.deepEqual(tables.map(avant), comptes);
});

test('critère : une fiche de plus dans le JSON → 1 créée, 11 inchangées', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'echantillon-'));
  const s = JSON.parse(await readFile(join(DOSSIER, 'echantillon.json'), 'utf8'));
  s.fichiers = s.fichiers.map((f: { chemin: string }) => ({ ...f, chemin: join(DOSSIER, f.chemin) }));
  s.fiches.push({
    cle: 'lieu:ajoute', type: 'lieu', titre: 'Lieu ajouté',
    sections: [{ cle: 'description', titre: 'Description', contenu: 'Neuf.', joueursLisent: true, joueursEcrivent: false }],
  });
  const chemin = join(dir, 'plus-un.json');
  await writeFile(chemin, JSON.stringify(s));
  const r = await pousser([chemin]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^Fiches : 1 créée, 0 mise à jour, 11 inchangées, 0 refusée$/m);
});

test('critère : un statut de campagne changé à la main n’est pas écrasé au rejeu suivant', async () => {
  const c = listerCampagnes(app.db, antor, univers).find((x) => x.nom === 'Éneria')!;
  assert.equal(c.statut, 'active');
  changerStatutCampagne(app.db, antor, c.id, 'terminee');
  const r = await pousser();
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(listerCampagnes(app.db, antor, univers).find((x) => x.nom === 'Éneria')!.statut, 'terminee');
});

test('critère : le scénario de 60 000 caractères est importé en entier, avec son lien par clé', () => {
  const c = listerCampagnes(app.db, antor, univers).find((x) => x.nom === 'Éneria')!;
  const longs = listerScenarios(app.db, antor, c.id).filter((s) => s.contenu.length >= 60_000);
  assert.equal(longs.length, 1);
  assert.match(longs[0]!.contenu, /\[\[[^\]]+\]\]/);
});

test('exclusion : en mode Joueur ni le bloc MJ ni la faction « MJ seul » n’apparaissent, fiche ou recherche', () => {
  const joueur = { compteId: antor, modeJoueur: true };
  const titres = (recherche: string, a: { compteId: number; modeJoueur?: boolean }) =>
    listerFiches(app.db, a, univers, { recherche }).fiches.map((f) => f.titre);
  assert.deepEqual(titres('Obscura', joueur), []);
  assert.deepEqual(titres('tempêtes énergétiques', joueur), []);
  assert.deepEqual(titres('Obscura', { compteId: lea }), []);
  assert.deepEqual(titres('tempêtes énergétiques', { compteId: lea }), []);
  // the GM outside player mode does find them: the filter is the mode, not an empty index
  assert.deepEqual(titres('Obscura', { compteId: antor }), ['Obscura']);
  assert.ok(titres('tempêtes énergétiques', { compteId: antor }).length >= 1);
});

test('échec : refus.json → compte-rendu d’une campagne absente refusé avec sa raison, sortie non nulle', async () => {
  const avant = (app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE type='compte_rendu'").get() as { n: number }).n;
  const r = await pousser([join(DOSSIER, 'refus.json')]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /^Fiches : 0 créée, 0 mise à jour, 0 inchangée, 1 refusée$/m);
  assert.match(r.out, /cr:campagne-absente : .*campagne inconnue : c:absente/);
  assert.equal((app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE type='compte_rendu'").get() as { n: number }).n, avant);
});

test('échec : jeton faux ou univers étranger → sortie non nulle, aucun lot, jeton jamais imprimé', async () => {
  const lots = () => (app.db.prepare('SELECT COUNT(*) n FROM lots_import').get() as { n: number }).n;
  const avant = lots();
  const faux = 'kvs_' + 'x'.repeat(40);
  const r = await pousser([], univers, faux);
  assert.notEqual(r.code, 0);
  assert.ok(!(r.out + r.err).includes(faux));
  const autre = await pousser([], univers + 999);
  assert.notEqual(autre.code, 0);
  assert.equal(lots(), avant);
});

test('échec : arguments manquants ou invalides → usage, sortie non nulle', async () => {
  for (const args of [[], [origine, 'abc', JETON_BOUCHON], [origine, '0', JETON_BOUCHON], ['ftp://x', '1', JETON_BOUCHON]]) {
    const r = await client(args);
    assert.notEqual(r.code, 0, args.join(' '));
  }
});

test('critère : univers neuf et jeton neuf → mêmes comptes ; le Jeton du bouchon n’y ouvre rien', async () => {
  const nouveau = Number(app.db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('Neuf', '2026-01-01')").run().lastInsertRowid);
  app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'mj')").run(nouveau, antor);
  const refuse = await pousser([], nouveau);
  assert.notEqual(refuse.code, 0);
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(nouveau) as { n: number }).n, 0);
  const { valeur } = creerJeton(app.db, antor, nouveau, { nom: 'recette', dureeJours: 7 });
  const r = await pousser([], nouveau, valeur);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^Fiches : 11 créées, 0 mise à jour, 0 inchangée, 0 refusée$/m);
  assert.match(r.out, /^Fichiers : 3 créés, /m);
  assert.match(r.out, /^Campagnes : 2 créées, /m);
  assert.match(r.out, /^Scénarios : 2 créés, /m);
  assert.match(r.out, /^Relations : 3 créées, /m);
  assert.ok(!(r.out + r.err).includes(valeur));
});
