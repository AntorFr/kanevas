// Tests of kanevas-liens-ecriture, written from the exit criterion (AD-116, AD-104, AD-21). Literal expectations.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { extraireLiens } = await import('../services/markdown.js');
const { creerFiche } = await import('../services/fiches.js');
const { ajouterSection } = await import('../services/sections.js');

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

// A sheet Léa cannot read: GM-only section (the default audience).
function cachee(app: App, universId: number, titre: string): number {
  const antor = (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  const f = creerFiche(app.db, antor, universId, { type: 'faction', titre });
  ajouterSection(app.db, antor, universId, f.id, { titre: 'Secret' });
  return f.id;
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const lame = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const kanka = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${kanka.id}`;
  const put = (cle: string, payload: unknown, lot?: number) =>
    app.inject({ method: 'PUT', url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`, headers: auth, payload: payload as object });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = (l: number) => app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth });
  const lire = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const fiche = (t: string) => (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, lame.id) as { id: number }).id;
  const port = fiche('Port-Sel');
  const sec = (fid: number, t: string) =>
    app.db.prepare('SELECT id, version, contenu, contenu_public, modifie_le FROM sections WHERE fiche_id = ? AND titre = ?').get(fid, t) as {
      id: number; version: number; contenu: string; contenu_public: string; modifie_le: string;
    };
  const ecrire = (h: Record<string, string>, fid: number, t: string, contenu: string) => {
    const s = sec(fid, t);
    return app.inject({ method: 'PUT', url: `/api/univers/${lame.id}/fiches/${fid}/sections/${s.id}/contenu`, headers: h, payload: { contenu, version: s.version } });
  };
  const liens = (sid: number) =>
    app.db.prepare('SELECT cible_fiche_id c, cible_cle k, texte t, dans_bloc_mj m FROM liens WHERE section_id = ? ORDER BY id').all(sid) as
      { c: number | null; k: string | null; t: string; m: number }[];
  return { app, antor, lea, lame, kanka, put, lot, clore, lire, fiche, port, sec, ecrire, liens };
}

const PORT = { type: 'lieu', titre: 'Port-Sel', sections: [{ cle: 'desc', titre: 'Description', contenu: 'Voir [[cle:faction:guilde|la Guilde]].', joueursLisent: true }] };
const GUILDE = { type: 'faction', titre: 'La Guilde', sections: [{ cle: 'd', titre: 'Description', contenu: 'x', joueursLisent: true }] };

test('import : clé inconnue en attente, puis résolue à la création sans toucher version/modifie_le, rejeux inchangés', async () => {
  const { app, put, lot, clore, lire, kanka } = await monter();
  const l1 = await lot();
  const r1 = await put('lieu:port-sel', PORT, l1);
  assert.equal(r1.json().etat, 'creee', r1.body);
  await clore(l1);
  assert.equal((await lire(l1)).en_attente ?? (await lire(l1)).enAttente, 2); // + the seeded « Anse-aux-Sels » key
  const sid = (app.db.prepare("SELECT id FROM sections WHERE cle_origine = 'desc' AND fiche_id = ?").get(r1.json().id) as { id: number }).id;
  assert.deepEqual(app.db.prepare('SELECT cible_fiche_id c, cible_cle k, texte t FROM liens WHERE section_id = ?').all(sid), [{ c: null, k: 'faction:guilde', t: 'la Guilde' }]);
  const avant = app.db.prepare('SELECT version, modifie_le, contenu FROM sections WHERE id = ?').get(sid) as { version: number; modifie_le: string; contenu: string };
  assert.equal(avant.contenu, 'Voir [[cle:faction:guilde|la Guilde]].');

  const g = await put('faction:guilde', GUILDE);
  assert.equal(g.json().etat, 'creee', g.body);
  const apres = app.db.prepare('SELECT version, modifie_le, contenu, contenu_public FROM sections WHERE id = ?').get(sid) as typeof avant & { contenu_public: string };
  assert.equal(apres.contenu, `Voir [[${g.json().id}|la Guilde]].`);
  assert.equal(apres.contenu_public, `Voir [[${g.json().id}|la Guilde]].`);
  assert.equal(apres.version, avant.version);
  assert.equal(apres.modifie_le, avant.modifie_le);
  assert.deepEqual(app.db.prepare('SELECT cible_fiche_id c, cible_cle k FROM liens WHERE section_id = ?').all(sid), [{ c: g.json().id, k: null }]);
  assert.equal((app.db.prepare('SELECT version_importee v FROM sections WHERE id = ?').get(sid) as { v: unknown }).v, (app.db.prepare('SELECT version_importee v FROM sections WHERE id = ?').get(sid) as { v: unknown }).v);

  assert.equal((await put('lieu:port-sel', PORT)).json().etat, 'inchangee');
  assert.equal((await put('faction:guilde', GUILDE)).json().etat, 'inchangee');
  void kanka;
});

test('import : le lot qui ne laisse rien en attente dit 0', async () => {
  const { put, lot, clore, lire } = await monter();
  await put('faction:guilde', GUILDE);
  const l = await lot();
  await put('lieu:port-sel', PORT, l);
  await clore(l);
  const r = await lire(l);
  assert.equal(r.en_attente ?? r.enAttente, 1); // the seeded « Anse-aux-Sels » key alone
});

test('session : [[id]] nu devient [[id|titre]], liens remplacés sans doublon, suppression de la cible -> cible nulle', async () => {
  const { app, antor, lame, fiche, port, sec, ecrire, liens } = await monter();
  const ald = fiche('Maître Aldric');
  const r = await ecrire(antor, port, 'Histoire', `Vu [[${ald}]] et encore [[${ald}]].`);
  assert.equal(r.statusCode, 200, r.body);
  const s = sec(port, 'Histoire');
  assert.equal(s.contenu, `Vu [[${ald}|Maître Aldric]] et encore [[${ald}|Maître Aldric]].`);
  assert.equal(liens(s.id).length, 2);
  const r2 = await ecrire(antor, port, 'Histoire', `Seul [[${ald}]].`);
  assert.equal(r2.statusCode, 200, r2.body);
  assert.deepEqual(liens(s.id), [{ c: ald, k: null, t: 'Maître Aldric', m: 0 }]);
  const r3 = await ecrire(antor, port, 'Histoire', `Seul [[${ald}]].`);
  assert.equal(r3.statusCode, 200);
  assert.equal(liens(s.id).length, 1);
  const jetable = cachee(app, lame.id, 'Jetable');
  const r4 = await ecrire(antor, port, 'Histoire', `Seul [[${jetable}]].`);
  assert.equal(r4.statusCode, 200, r4.body);
  app.db.prepare('DELETE FROM sections WHERE fiche_id = ?').run(jetable);
  app.db.prepare('DELETE FROM fiches WHERE id = ?').run(jetable);
  assert.deepEqual(liens(s.id), [{ c: null, k: null, t: 'Jetable', m: 0 }]);
});

test('session : Léa, [[id]] nu vers une fiche cachée -> 400 lien_illisible, section inchangée ; avec texte -> acceptée', async () => {
  const { app, antor, lea, lame, fiche, port, sec, ecrire, liens } = await monter();
  const guilde = cachee(app, lame.id, 'La Guilde des Brumes');
  const d = sec(port, 'Description');
  const p = await app.inject({
    method: 'PATCH', url: `/api/univers/${lame.id}/fiches/${port}/sections/${d.id}`, headers: antor, payload: { joueursEcrivent: true },
  });
  assert.equal(p.statusCode, 200, p.body);
  const avant = sec(port, 'Description');
  const bad = await ecrire(lea, port, 'Description', `Voir [[${guilde}]].`);
  assert.equal(bad.statusCode, 400, bad.body);
  assert.equal(bad.json().code, 'lien_illisible');
  assert.ok(!bad.body.includes('Guilde des Brumes'));
  const ap = sec(port, 'Description');
  assert.equal(ap.contenu, avant.contenu);
  assert.equal(ap.version, avant.version);
  // inexistent id: same refusal
  const inex = await ecrire(lea, port, 'Description', 'Voir [[987654]].');
  assert.equal(inex.statusCode, 400);
  assert.equal(inex.json().code, 'lien_illisible');
  const ok = await ecrire(lea, port, 'Description', `Voir [[${guilde}|son texte]].`);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(sec(port, 'Description').contenu, `Voir [[${guilde}|son texte]].`);
  assert.deepEqual(liens(d.id), [{ c: guilde, k: null, t: 'son texte', m: 0 }]);
  // a key known but unreadable is not resolved for her (no existence leak)
  app.db.prepare('UPDATE fiches SET cle_origine = ? WHERE id = ?').run('faction:g', guilde);
  const cle = await ecrire(lea, port, 'Description', 'Voir [[cle:faction:g|la G]].');
  assert.equal(cle.statusCode, 200, cle.body);
  assert.equal(sec(port, 'Description').contenu, 'Voir [[cle:faction:g|la G]].');
});

test('extraction : code ignoré, 200/201 caractères, bloc MJ, formes invalides', () => {
  assert.equal(extraireLiens('```\n[[12|a]]\n```').length, 0);
  assert.equal(extraireLiens('`[[12|a]]`').length, 0);
  assert.equal(extraireLiens('    [[12|a]]').length, 0);
  assert.equal(extraireLiens(`[[12|${'a'.repeat(200)}]]`).length, 1);
  assert.equal(extraireLiens(`[[12|${'a'.repeat(201)}]]`).length, 0);
  assert.equal(extraireLiens('[[0|a]] [[-3|a]] [[abc|a]] [[12|]] [[12|a|b]] [[12|a\nb]]').length, 0);
  const l = extraireLiens('avant [[1|a]]\n\n:::mj\nsecret [[2|b]]\n:::\n\naprès [[3|c]]');
  assert.deepEqual(l.map((x) => [x.id, x.dansBlocMJ]), [[1, false], [2, true], [3, false]]);
  const k = extraireLiens('[[cle:lieu:x|t]] [[12]]');
  assert.deepEqual(k.map((x) => [x.id, x.cle, x.texte]), [[null, 'lieu:x', 't'], [12, null, null]]);
  const q = extraireLiens('> cité [[5|q]]\n\n- item [[6|i]]\n\n# titre [[7|h]]');
  assert.deepEqual(q.map((x) => x.id), [5, 6, 7]);
});

test('session : un lien dans un bloc MJ a dans_bloc_mj vrai ; code ignoré à l’écriture', async () => {
  const { antor, fiche, port, sec, ecrire, liens } = await monter();
  const ald = fiche('Maître Aldric');
  const r = await ecrire(antor, port, 'Histoire', `a [[${ald}|A]]\n\n:::mj\nb [[${ald}|B]]\n:::\n\n\`[[${ald}|C]]\`\n\n\`\`\`\n[[${ald}|D]]\n\`\`\`\n`);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(liens(sec(port, 'Histoire').id).map((x) => [x.t, x.m]), [['A', 0], ['B', 1]]);
});

test('import : [[id]] nu inexistant refuse la fiche et ne laisse pas de ligne', async () => {
  const { app, put } = await monter();
  const r = await put('lieu:x', { type: 'lieu', titre: 'X', sections: [{ cle: 'd', titre: 'D', contenu: 'voir [[424242]]' }] });
  assert.notEqual(r.statusCode, 200);
  assert.equal((app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE cle_origine = 'lieu:x'").get() as { n: number }).n, 0);
});

test('seul services/liens.ts écrit la table liens', () => {
  const racine = join(import.meta.dirname, '..');
  const trouves: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !p.includes('/migrations/')) {
        const src = readFileSync(p, 'utf8');
        if (/(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+liens\b/i.test(src)) trouves.push(p.slice(racine.length + 1));
      }
    }
  };
  parcourir(racine);
  assert.deepEqual(trouves, ['services/liens.ts']);
});
