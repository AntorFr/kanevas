// Tests of kanevas-synchro-export-route (B-92, B-93, AD-148, AD-149, AD-export-1): a token downloads the universe as
// NDJSON in one call, over a real HTTP socket on a file database (snapshot, back-pressure, client leaving).
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { Socket } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-export-route-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
process.env.DB_PATH = join(RACINE, 'k.db');

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerFiche, renommerFiche } = await import('../services/fiches.js');
const { relierSection } = await import('../services/relations.js');

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;
let origine: string;
let u: { id: number; cle: string };
let antor: number;
let lea: number;
const sockets = new Set<Socket>();
const pause = (ms = 30) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  app.server.on('connection', (s: Socket) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await app.listen({ port: 0, host: '127.0.0.1' });
  origine = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  u = app.db.prepare("SELECT id, cle FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number; cle: string };
  antor = trouverCompte(app.db, 'antor')!.id;
  lea = trouverCompte(app.db, 'lea')!.id;
});
after(async () => { await app.close(); });

const jeton = (compteId: number, niveau: 'lecture' | 'ecriture' = 'lecture') =>
  ({ authorization: `Bearer ${creerJeton(app.db, compteId, { nom: 'X', dureeJours: 30, acces: { tous: true, niveauTous: niveau } } as never, app.horloge()).valeur}` });

async function exporter(chemin: string, h: Record<string, string>) {
  const r = await fetch(`${origine}${chemin}`, { headers: h });
  const corps = await r.text();
  return { r, corps, lignes: corps === '' ? [] : corps.trimEnd().split('\n').map((l) => JSON.parse(l) as Record<string, any>) };
}
const url = (suffixe = '', base = '/api/v1/univers/') => `${base}${base.endsWith('/') ? u.id : u.id}/export${suffixe}`;
const fiche = (titre: string, sections?: { titre: string; joueursLisent?: boolean }[]) =>
  creerFiche(app.db, antor, u.id, { type: 'lieu', titre, sections });

test('un appel : en-tête, une ligne par fiche, fichiers, cartes, fin ; empreinte égale à celle de GET /fiches/<clé>', async () => {
  const f = fiche('Zorn-export');
  const mj = jeton(antor);
  const { r, lignes } = await exporter(url(), mj);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /^application\/x-ndjson/);
  assert.equal(lignes[0]!.type, 'entete');
  assert.equal(lignes[lignes.length - 1]!.type, 'fin');
  assert.equal(lignes[lignes.length - 1]!.lignes, lignes.length - 1);
  const fiches = lignes.filter((l) => l.type === 'fiche');
  assert.equal(lignes[0]!.fiches, fiches.length);
  assert.equal(lignes[0]!.fichiers, lignes.filter((l) => l.type === 'fichier').length);
  assert.equal(lignes[0]!.cartes, lignes.filter((l) => l.type === 'carte').length);
  const ligne = fiches.find((l) => l.id === f.id)!;
  const cle = (app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(f.id) as { cle: string }).cle;
  const g = await fetch(`${origine}/api/v1/univers/${u.id}/fiches/${cle}`, { headers: mj });
  assert.equal(ligne.empreinte, ((await g.json()) as { empreinte: string }).empreinte);
});

test('alias d\'import et univers par clé : même corps ; jeton écriture lit aussi', async () => {
  const mj = jeton(antor);
  const a = await exporter(url(), mj);
  const b = await exporter(`/api/import/v1/univers/${u.id}/export`, mj);
  const c = await exporter(`/api/v1/univers/${u.cle}/export`, jeton(antor, 'ecriture'));
  for (const x of [b, c]) {
    assert.equal(x.r.status, 200);
    assert.equal(x.lignes.length, a.lignes.length);
    assert.deepEqual(x.lignes.filter((l) => l.type === 'fiche'), a.lignes.filter((l) => l.type === 'fiche'));
  }
  const e = await exporter(url(), { authorization: `Bearer ${JETON_BOUCHON}` });
  assert.equal(e.r.status, 200);
});

test('refus : sans jeton et cookie seul 401 jeton_invalide, jeton faux 401, univers inconnu 404, compte sans rôle 404', async () => {
  for (const h of [{}, { cookie: 'kanevas_session=abc' }, { authorization: 'Bearer kvs_faux' }]) {
    const x = await exporter(url(), h);
    assert.equal(x.r.status, 401, x.corps);
    assert.equal(JSON.parse(x.corps).code, 'jeton_invalide');
  }
  assert.equal((await exporter('/api/v1/univers/99999/export', jeton(antor))).r.status, 404);
  assert.equal((await exporter('/api/v1/univers/pas-la/export', jeton(antor))).r.status, 404);
  const sansRole = app.db.prepare('SELECT id FROM comptes WHERE id NOT IN (SELECT compte_id FROM membres WHERE univers_id = ?) LIMIT 1').get(u.id) as { id: number } | undefined;
  if (sansRole) assert.equal((await exporter(url(), jeton(sansRole.id))).r.status, 404);
});

test('depuis mal formé : 400 invalide, champ depuis, JSON, aucune ligne de flux ; depuis non texte aussi', async () => {
  for (const q of ['?depuis=hier', '?depuis=', '?depuis=2023-13-45', '?depuis=a&depuis=b']) {
    const x = await exporter(url(q), jeton(antor));
    assert.equal(x.r.status, 400, `${q} ${x.corps}`);
    assert.match(x.r.headers.get('content-type') ?? '', /json/);
    const j = JSON.parse(x.corps);
    assert.equal(j.code, 'invalide');
    assert.equal(j.champ, 'depuis');
  }
});

test('depuis : une fiche dont seule une relation a changé est rendue, pas une inchangée ; empreintes=1 : la liste seule', async () => {
  const a = fiche('Rel-A', [{ titre: 'S' }]);
  const b = fiche('Rel-B');
  const inchangee = fiche('Inchangee');
  await pause(1100);
  const borne = new Date().toISOString();
  await pause(1100);
  const sec = (app.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').get(a.id) as { id: number }).id;
  relierSection(app.db, antor, u.id, a.id, sec, { cibleFicheId: b.id, qualificatif: 'voisin' });
  const x = await exporter(url(`?depuis=${encodeURIComponent(borne)}`), jeton(antor));
  const ids = x.lignes.filter((l) => l.type === 'fiche').map((l) => l.id);
  assert.ok(ids.includes(a.id), 'la fiche à relation modifiée manque');
  assert.ok(!ids.includes(inchangee.id));
  assert.equal(x.lignes[0]!.depuis, borne);
  assert.equal(x.lignes[0]!.fiches, ids.length);
  const e = await exporter(url('?empreintes=1'), jeton(antor));
  const fl = e.lignes.filter((l) => l.type === 'fiche');
  assert.ok(fl.length > 3);
  for (const l of fl) {
    assert.deepEqual(Object.keys(l).sort(), ['cle', 'empreinte', 'empreinte_entete', 'id', 'modifie_le', 'type']);
  }
  assert.equal(e.lignes[e.lignes.length - 1]!.type, 'fin');
});

test('joueuse : ni la fiche cachée ni la section réservée au MJ', async () => {
  const mixte = fiche('Mixte-visible', [{ titre: 'PubliqueSec', joueursLisent: true }, { titre: 'SecretSec', joueursLisent: false }]);
  const cachee = fiche('Cachee-totale', [{ titre: 'SecretSeul', joueursLisent: false }]);
  const x = await exporter(url(), jeton(lea));
  assert.equal(x.r.status, 200, x.corps);
  const ids = x.lignes.filter((l) => l.type === 'fiche').map((l) => l.id);
  assert.ok(ids.includes(mixte.id));
  assert.ok(!ids.includes(cachee.id));
  assert.ok(!x.corps.includes('SecretSec') && !x.corps.includes('SecretSeul') && !x.corps.includes('Cachee-totale'));
  assert.ok(x.corps.includes('PubliqueSec'));
  assert.equal(x.lignes[0]!.fiches, ids.length);
  const mj = await exporter(url(), jeton(antor));
  assert.ok(mj.corps.includes('SecretSec'));
});

test('cliché : une écriture faite entre la première ligne et la suite n\'entre pas dans le flux', async () => {
  const base = fiche('Cliche-base');
  const h = jeton(antor);
  const res = await new Promise<string>((resolve, reject) => {
    const req = request(`${origine}${url()}`, { headers: h }, (rep) => {
      let tampon = '';
      let ecrit = false;
      rep.setEncoding('utf8');
      rep.on('data', (d: string) => {
        tampon += d;
        if (!ecrit && tampon.includes('\n')) {
          ecrit = true;
          renommerFiche(app.db, antor, u.id, base.id, 'TITRE-APRES-LA-PREMIERE-LIGNE');
          fiche('Fiche-nee-pendant');
        }
      });
      rep.on('end', () => resolve(tampon));
      rep.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
  assert.ok(!res.includes('TITRE-APRES-LA-PREMIERE-LIGNE'));
  assert.ok(!res.includes('Fiche-nee-pendant'));
  assert.ok(res.includes('Cliche-base'));
  const apres = await exporter(url(), h);
  assert.ok(apres.corps.includes('TITRE-APRES-LA-PREMIERE-LIGNE'));
  assert.ok(apres.corps.includes('Fiche-nee-pendant'));
});

test('contre-pression : le client n\'a lu qu\'une ligne d\'un gros univers, le serveur n\'a pas tout écrit ; son départ libère la lecture', async () => {
  const gros = 'x'.repeat(20_000);
  const ins = app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (?, 'lieu', ?, '{}', ?, ?, ?, 'ecran')");
  const d = new Date().toISOString();
  app.db.transaction(() => {
    for (let i = 0; i < 1500; i++) {
      const id = Number(ins.run(u.id, `Gros ${i}`, d, d, `gros-${i}-${Math.random().toString(36).slice(2, 8)}`).lastInsertRowid);
      app.db.prepare("INSERT INTO sections (fiche_id, titre, contenu, ordre, joueurs_lisent, modifie_le, cle) VALUES (?, 'S', ?, 0, 1, '2026-01-01T00:00:00.000Z', 'sg' || ?)").run(id, gros, id);
    }
  })();
  const total = (await exporter(url(), jeton(antor))).corps.length;
  assert.ok(total > 20_000_000, `univers trop petit pour le test : ${total}`);
  const avant = new Set(sockets);
  await new Promise<void>((resolve, reject) => {
    const req = request(`${origine}${url()}`, { headers: jeton(antor) }, (rep) => {
      rep.pause();
      rep.once('readable', () => undefined);
      setTimeout(async () => {
        const srv = [...sockets].filter((s) => !avant.has(s));
        const ecrits = srv.reduce((n, s) => n + s.bytesWritten, 0);
        try {
          assert.ok(ecrits < total / 4, `le serveur a écrit ${ecrits} octets sur ${total} pour un client arrêté`);
          rep.destroy(); // le client part en cours de flux
          req.destroy();
          resolve();
        } catch (e) { reject(e); }
      }, 700);
    });
    req.on('error', () => undefined);
    req.end();
  });
  await pause(500);
  // La connexion de lecture est fermée : le WAL se vide sans lecteur retenu.
  const busy = app.db.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[];
  assert.equal(busy[0]!.busy, 0);
  assert.equal([...sockets].filter((s) => !avant.has(s) && !s.destroyed).length, 0);
  app.db.prepare("DELETE FROM sections WHERE fiche_id IN (SELECT id FROM fiches WHERE titre LIKE 'Gros %')").run();
  app.db.prepare("DELETE FROM fiches WHERE titre LIKE 'Gros %'").run();
});

test('erreur après la première ligne : le flux est coupé sans ligne fin', async () => {
  const mauvaise = fiche('Charge-cassee');
  app.db.pragma('foreign_keys = ON');
  app.db.prepare("UPDATE fiches SET charge = 'null' WHERE id = ?").run(mauvaise.id);
  let corps = '';
  let erreur = false;
  try {
    const r = await fetch(`${origine}${url()}`, { headers: jeton(antor) });
    corps = await r.text();
  } catch { erreur = true; }
  assert.ok(!corps.includes('"type":"fin"'), 'une ligne fin a été écrite après une erreur');
  assert.ok(erreur || corps.length > 0);
});
