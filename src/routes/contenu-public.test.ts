// Tests of kanevas-secrets-public, written from the exit criterion (AD-114): the public text of a
// section, kept at each write, alone searched by a non-GM. Expectations are literals.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { contenuPublic, rendreMarkdown } = await import('../services/markdown.js');
const { openDb, migrate } = await import('../db/db.js');

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

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  return { app, antor, lea, u, base: `/api/univers/${u.id}` };
}

const publicDe = (app: App, sid: number) =>
  (app.db.prepare('SELECT contenu_public AS p FROM sections WHERE id = ?').get(sid) as { p: string }).p;

test('semis : Histoire de Port-Sel garde son texte sans les lignes du bloc', async () => {
  const { app } = await monter();
  const row = app.db
    .prepare("SELECT contenu_public AS p, contenu AS c FROM sections WHERE titre = 'Histoire' AND fiche_id = (SELECT id FROM fiches WHERE titre = 'Port-Sel')")
    .get() as { p: string; c: string };
  assert.match(row.p, /^Le port a été fondé par des sauniers\.\n\n\nLes marins en parlent peu\.\n\nLe maître de port, \[\[\d+\|Maître Aldric\]\], tient les comptes ; \[\[\d+\|La Guilde des Brumes\]\] y a ses entrées\.$/);
  assert.ok(!row.p.includes('sous-main') && !row.p.includes('cargaisons'));
  assert.ok(row.c.includes('tenu en sous-main par la Guilde des Brumes'));
});

test('recherche « sous-main » : Léa non, Antor oui, Antor en mode joueur non ; « sauniers » pour tous', async () => {
  const { app, antor, lea, base } = await monter();
  const cherche = async (h: object, q: string, mode = '') => {
    const r = await app.inject({ method: 'GET', url: `${base}/fiches?type=lieu&q=${encodeURIComponent(q)}${mode}`, headers: h as Record<string, string> });
    assert.equal(r.statusCode, 200, r.body);
    return (r.json().fiches ?? r.json().items ?? r.json()).map((f: { titre: string }) => f.titre) as string[];
  };
  assert.deepEqual(await cherche(lea, 'sous-main'), []);
  assert.deepEqual(await cherche(antor, 'sous-main'), ['Port-Sel']);
  assert.deepEqual(await cherche(antor, 'sous-main', '&mode=joueur'), []);
  // several words, a prefix: the column filter covers the whole query
  assert.deepEqual(await cherche(lea, 'Guilde Brumes'), ['Port-Sel']); // public text (the link), not the block
  assert.deepEqual(await cherche(lea, 'Guil*'), ['Port-Sel']);
  assert.deepEqual(await cherche(lea, 'cargaisons'), []);
  assert.deepEqual(await cherche(lea, 'sauniers'), ['Port-Sel']);
  assert.deepEqual(await cherche(antor, 'sauniers', '&mode=joueur'), ['Port-Sel']);
});

test('recherche : un mot présent en public ET dans le titre d\'une fiche reste trouvé par Léa', async () => {
  const { app, lea, base } = await monter();
  const r = await app.inject({ method: 'GET', url: `${base}/fiches?q=Port-Sel`, headers: lea });
  assert.equal(r.statusCode, 200, r.body);
  assert.ok(r.body.includes('Port-Sel'));
});

test('écriture par l\'API : blocs en code, liste, citation, non fermé — public et recherche suivent', async () => {
  const { app, antor, lea, base } = await monter();
  const f = app.db.prepare("SELECT id FROM fiches WHERE titre = 'Maître Aldric'").get() as { id: number };
  const s = (
    await app.inject({ method: 'POST', url: `${base}/fiches/${f.id}/sections`, headers: antor, payload: { titre: 'Notes', contenu: '' } })
  ).json();
  await app.inject({ method: 'PATCH', url: `${base}/fiches/${f.id}/sections/${s.id}`, headers: antor, payload: { joueursLisent: true } });
  const texte = [
    'Début visible',
    '',
    '```',
    ':::mj',
    'dans le code visible',
    ':::',
    '```',
    '',
    '- item un',
    '',
    '  :::mj',
    '  secretliste',
    '  :::',
    '',
    '- item deux',
    '',
    '> :::mj',
    '> secretcitation',
    '> :::',
    '',
    'Milieu visible',
    '',
    ':::mj',
    'secretnonferme',
    'dernier',
  ].join('\n');
  const v0 = (await app.inject({ method: 'GET', url: `${base}/fiches/${f.id}/sections/${s.id}`, headers: antor })).json().version;
  const put = await app.inject({
    method: 'PUT', url: `${base}/fiches/${f.id}/sections/${s.id}/contenu`, headers: antor,
    payload: { contenu: texte, version: v0 },
  });
  assert.equal(put.statusCode, 200, put.body);
  const pub = publicDe(app, s.id);
  for (const secret of ['secretliste', 'secretcitation', 'secretnonferme', 'dernier']) assert.ok(!pub.includes(secret), `${secret} fuit: ${pub}`);
  for (const garde of ['Début visible', 'dans le code visible', 'item deux', 'Milieu visible']) assert.ok(pub.includes(garde), `${garde} perdu: ${pub}`);
  assert.ok(pub.includes('```\n:::mj\ndans le code visible'), pub);
  // search follows the write
  const q = async (h: object, mot: string) => (await app.inject({ method: 'GET', url: `${base}/fiches?q=${mot}`, headers: h as Record<string, string> })).body.includes('Maître Aldric');
  assert.equal(await q(lea, 'secretliste'), false);
  assert.equal(await q(lea, 'secretnonferme'), false);
  assert.equal(await q(antor, 'secretcitation'), true);
  // a rewrite without block gives the text back
  const v1 = (await app.inject({ method: 'GET', url: `${base}/fiches/${f.id}/sections/${s.id}`, headers: antor })).json().version;
  await app.inject({ method: 'PUT', url: `${base}/fiches/${f.id}/sections/${s.id}/contenu`, headers: antor, payload: { contenu: 'tout public', version: v1 } });
  assert.equal(publicDe(app, s.id), 'tout public');
  assert.equal(await q(lea, 'secretliste'), false);
});

test('contenuPublic : formes exactes, valeurs en dur', () => {
  assert.equal(contenuPublic('a\n\n:::mj\nb\n:::\n\nc'), 'a\n\n\nc');
  assert.equal(contenuPublic('sans bloc'), 'sans bloc');
  assert.equal(contenuPublic(''), '');
  // not the exact form: stays
  for (const forme of [':::MJ', '::: mj', ':::mj x', '::mj', ':::mjx']) {
    const src = `a\n\n${forme}\nb\n:::\n\nc`;
    assert.equal(contenuPublic(src), src, forme);
  }
  // two blocks, one unclosed at the end
  assert.equal(contenuPublic('x\n:::mj\ns1\n:::\ny\n:::mj\ns2'), 'x\ny');
  // in a code block: stays
  assert.equal(contenuPublic('```\n:::mj\ns\n:::\n```'), '```\n:::mj\ns\n:::\n```');
});

test('contenuPublic : un bloc dans un bloc se retire par le plus extérieur, rien après le premier ::: ne fuit', () => {
  assert.equal(contenuPublic('a\n:::mj\nx\n:::mj\ny\n:::\nz\n:::\nfin'), 'a\nfin');
  assert.equal(contenuPublic('a\n:::mj\nx\n:::\nb\n:::mj\ny\n:::\nc'), 'a\nb\nc');
  // unclosed inside a list or a quote: runs to the end of the source, not to the end of the parent
  assert.equal(contenuPublic('- a\n  :::mj\n  s\n- b\n\nc'), '- a');
  assert.equal(contenuPublic('> a\n> :::mj\n> s\n\nc'), '> a');
});

test('contenuPublic : un ":::" indenté de 4+ ne ferme pas le bloc, rien du secret ne fuit', () => {
  // Panne : fermer sur toute ligne ":::" même indentée, comme le moteur ne le fait pas.
  assert.equal(contenuPublic(':::mj\nsecret1\n\n    :::\n\nsecret2\n:::'), '');
  assert.equal(contenuPublic(':::mj\nsecret1\n\n\t:::\n\nsecret2\n:::'), '');
  assert.equal(contenuPublic('> :::mj\n> a\n>     :::\n> b\n> :::\nc'), 'c');
  assert.equal(contenuPublic('- :::mj\n  a\n      :::\n  b\n  :::\nc'), 'c');
  assert.equal(contenuPublic('a\n:::mj\nx\n   :::\npub'), 'a\npub');
});

test('contenuPublic : seuls l\'espace et la tabulation sont des blancs d\'un ferme-bloc', () => {
  // Panne : \\s dans la fermeture, que le moteur ne reconnaît pas (il garde le bloc ouvert).
  for (const w of ['\u2003', '\u3000', '\ufeff', '\u2028', '\v', '\f']) {
    assert.equal(contenuPublic(`:::mj\nS1\n${w}:::\nS2\n:::\npub`), 'pub');
    assert.equal(contenuPublic(`:::mj\nS1\n:::${w}\nS2\n:::\npub`), 'pub');
  }
  // lone CR is a line break for the engine
  assert.equal(contenuPublic(':::mj\rS1\r:::\rpub'), 'pub');
});

test('rendreMarkdown : le conteneur n\'existe que pour la nature section', () => {
  const src = ':::mj\nsecret\n:::';
  assert.ok(rendreMarkdown(src, { nature: 'section' }).includes('secret'));
  assert.ok(!rendreMarkdown(src, { nature: 'section' }).includes(':::'));
  assert.equal(rendreMarkdown(src), '<p>:::mj<br>\nsecret<br>\n:::</p>\n');
  assert.equal(rendreMarkdown(src, { nature: 'texte' }), '<p>:::mj<br>\nsecret<br>\n:::</p>\n');
});

test('scénario et entrée de système : :::mj reste du texte, trois lignes lues', async () => {
  const { app, antor, base } = await monter();
  const src = ':::mj\nsecret\n:::';
  const attendu = '<p>:::mj<br>\nsecret<br>\n:::</p>\n';
  const c = await app.inject({ method: 'POST', url: `${base}/campagnes`, headers: antor, payload: { nom: 'Camp', systemeId: null } });
  assert.equal(c.statusCode, 201, c.body);
  const sc = await app.inject({ method: 'POST', url: `/api/campagnes/${c.json().id}/scenarios`, headers: antor, payload: { titre: 'S', contenu: src } });
  assert.equal(sc.statusCode, 201, sc.body);
  assert.equal(sc.json().html, attendu);
  const lu = await app.inject({ method: 'GET', url: `/api/scenarios/${sc.json().id}`, headers: antor });
  assert.equal(lu.json().html, attendu);
  assert.equal(lu.json().contenu, src);
  // system entry (template)
  const sy = await app.inject({ method: 'POST', url: '/api/systemes', headers: antor, payload: { nom: 'Sys' } });
  assert.equal(sy.statusCode, 201, sy.body);
  const at = await app.inject({ method: 'PUT', url: `${base}/systeme`, headers: antor, payload: { systemeId: sy.json().id } });
  assert.equal(at.statusCode, 204, at.body);
  const g = await app.inject({ method: 'POST', url: `/api/systemes/${sy.json().id}/gabarits`, headers: antor, payload: { type: 'regle', nom: 'G', contenu: src } });
  assert.ok(g.statusCode === 201, g.body);
  assert.equal(g.json().html, attendu);
});

test('migration 0011 : contenu_public = contenu pour les sections existantes, comptées avant et après', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  const src = 'src/db/migrations/';
  for (const f of readdirSync(src).filter((n) => n.endsWith('.sql') && n < '0011')) copyFileSync(src + f, join(dir, f));
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db, dir + '/').slice(-1), [10]);
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; notnull: number }[]).map((c) => c.name);
  assert.ok(!cols('sections').includes('contenu_public'));
  db.prepare("INSERT INTO univers (nom, description, cree_le) VALUES ('U','','t')").run();
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1,'lieu','F','{}','t','t')").run();
  const textes = ['', 'simple', 'avec\n:::mj\nlitteral\n:::', 'é accentué'];
  textes.forEach((t, i) => db.prepare('INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le) VALUES (1, ?, ?, ?, ?)').run('S' + i, i + 1, t, 't'));
  const avant = (db.prepare('SELECT COUNT(*) AS n FROM sections').get() as { n: number }).n;
  assert.equal(avant, 4);
  assert.deepEqual(migrate(db), [11, 12, 13, 14, 15, 16, 17]);
  const apres = db.prepare('SELECT contenu, contenu_public AS p FROM sections ORDER BY id').all() as { contenu: string; p: string }[];
  assert.equal(apres.length, 4);
  assert.deepEqual(apres.map((r) => r.p), textes);
  // the rebuilt index finds them, on both columns
  const hits = (col: string, mot: string) => (db.prepare(`SELECT COUNT(*) AS n FROM recherche_sections WHERE recherche_sections MATCH ?`).get(`{${col}} : ${mot}`) as { n: number }).n;
  assert.equal(hits('contenu_public', 'simple'), 1);
  assert.equal(hits('contenu', 'litteral'), 1);
});

test('PUT import avec :::mj écrit le même contenu_public que l\'API de session', async () => {
  const { app } = await monter();
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const contenu = 'avant\n\n:::mj\nsecretimport\n:::\n\naprès';
  const r = await app.inject({
    method: 'PUT',
    url: `/api/import/v1/univers/${u.id}/fiches/${encodeURIComponent('lieu:x')}`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
    payload: { type: 'lieu', titre: 'X', sections: [{ cle: 'a', titre: 'A', contenu, joueursLisent: true }] },
  });
  assert.equal(r.statusCode, 200, r.body);
  const row = app.db.prepare("SELECT contenu_public AS p, contenu AS c FROM sections WHERE titre = 'A' AND fiche_id = (SELECT id FROM fiches WHERE titre = 'X')").get() as { p: string; c: string };
  assert.equal(row.c, contenu);
  assert.equal(row.p, 'avant\n\n\naprès');
  assert.equal(contenuPublic(contenu), row.p);
  // rejoué avec un contenu modifié : suit
  const r2 = await app.inject({
    method: 'PUT',
    url: `/api/import/v1/univers/${u.id}/fiches/${encodeURIComponent('lieu:x')}`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
    payload: { type: 'lieu', titre: 'X', sections: [{ cle: 'a', titre: 'A', contenu: 'a\n:::mj\nb', joueursLisent: true }] },
  });
  assert.equal(r2.statusCode, 200, r2.body);
  const p2 = app.db.prepare("SELECT contenu_public AS p FROM sections WHERE titre = 'A' AND fiche_id = (SELECT id FROM fiches WHERE titre = 'X')").get() as { p: string };
  assert.equal(p2.p, 'a');
});

test('balayage : aucun INSERT INTO sections / UPDATE sections SET contenu hors du point d\'écriture', () => {
  const fichiers: string[] = [];
  const marche = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) marche(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) fichiers.push(p);
    }
  };
  marche('src');
  const motif = /INSERT\s+INTO\s+sections\b|UPDATE\s+sections\s+SET\s+contenu\b/gi;
  const trouves = fichiers.filter((f) => motif.test(readFileSync(f, 'utf8')));
  motif.lastIndex = 0;
  assert.deepEqual(trouves, ['src/services/sections.ts']);
  const src = readFileSync('src/services/sections.ts', 'utf8');
  assert.equal((src.match(/INSERT\s+INTO\s+sections\b/gi) ?? []).length, 1);
  assert.equal((src.match(/UPDATE\s+sections\s+SET\s+contenu\b/gi) ?? []).length, 1);
});

test('contenuPublic : un « > ::: » ou « - ::: » dans un bloc de plus haut niveau ne le ferme pas', () => {
  // The engine keeps the text after a quoted/listed `:::` inside the GM block (it is a quote's content).
  for (const source of [
    ':::mj\n> :::\n\nsecret\n:::\nfin',
    ':::mj\nsecret0\n> :::\nsecret\n:::\nfin',
    ':::mj\n   > :::\n> :::\nsecret\n:::\nfin',
  ]) {
    const public_ = contenuPublic(source);
    assert.doesNotMatch(public_, /secret/, JSON.stringify(source));
  }
});
