// kanevas-systemes-jeu-mcp-assistant-lectures (review): the agent reads the elements of the universe's system
// through the MCP door and `catalogueDe` (AD-159, AD-mcp-sj-1 to 4).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { buildApp } = await import('../app.js');
const { catalogueDe } = await import('../services/assistant/catalogue.js');
type Any = Record<string, any>;
type H = { cookie: string };

const LECTURES = ['systeme_chercher', 'systeme_lire_fiche', 'systeme_lire_section'];
const IMAGES = { nom: 'aucun' } as never;

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

// antor: GM of Lame and (named by the admin) GM of the system Zeta; lea: player of Lame; mira: GM of Lame but not of Zeta;
// teo: no role in Lame; Nue: a universe with no system.
async function monde() {
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const hs: Record<string, H> = {};
  for (const c of ['antor', 'lea', 'mira', 'teo', 'admin']) hs[c] = await connecter(app, c);
  const appel = (h: H, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...h, ...headers }, payload });
  const compte = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const lame = (await appel(hs.antor!, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const nue = (await appel(hs.antor!, 'POST', '/api/univers', { nom: 'Nue' })).json();
  const zeta = (await appel(hs.antor!, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  for (const [c, r] of [['lea', 'joueur'], ['mira', 'mj']] as const) {
    app.db.prepare('INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, ?)').run(lame.id, compte(c), r);
  }
  assert.equal((await appel(hs.admin!, 'POST', `/api/instance/systemes/${zeta.id}/membres`, { username: 'antor' })).statusCode, 201);
  const cleLame = (app.db.prepare('SELECT cle FROM univers WHERE id = ?').get(lame.id) as Any).cle as string;
  const cleNue = (app.db.prepare('SELECT cle FROM univers WHERE id = ?').get(nue.id) as Any).cle as string;
  const jeton = async (c: string, extra: object) => {
    const r = await appel(hs[c]!, 'POST', '/api/compte/jetons', { nom: 'k', dureeJours: 30, acces: { tous: true, niveauTous: 'ecriture' }, ...extra });
    assert.equal(r.statusCode, 201, r.body);
    return { valeur: (r.json().valeur ?? r.json().jeton.valeur) as string, id: (r.json().id ?? r.json().jeton.id) as number };
  };
  const client = async (cle: string, valeur: string) => {
    const c = new Client({ name: 't', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${cle}`), { requestInit: { headers: { authorization: `Bearer ${valeur}` } } }));
    return c;
  };
  const noms = async (c: InstanceType<typeof Client>) => (await c.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('systeme_')).sort();
  const appelOutil = async (c: InstanceType<typeof Client>, name: string, args: Record<string, unknown>) => {
    const r = await c.callTool({ name, arguments: args });
    const t = (r.content as { text: string }[])[0]!.text;
    return { erreur: r.isError === true, t, sc: r.structuredContent as { code?: string } | undefined, d: r.isError ? null : JSON.parse(t) };
  };
  // An element with a players' section and a GM-only one, created by the GM's own key.
  const kEcr = await jeton('antor', { systemes: [{ id: zeta.id, niveau: 'ecriture' }] });
  const cree = await app.inject({ method: 'POST', url: `/api/v1/systemes/${zeta.id}/fiches`, headers: { authorization: `Bearer ${kEcr.valeur}` },
    payload: { type: 'objet', titre: 'Épée runique', sections: [
      { cle: 'description', titre: 'Description', contenu: 'Lame claire.', joueursLisent: true },
      { cle: 'secret', titre: 'Secret', contenu: 'Maudite par Vorn.', joueursLisent: false }] } });
  assert.equal(cree.statusCode, 201, cree.body);
  const elem = cree.json().id as number;
  const secId = (cle: string) => (app.db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND cle = ?').get(elem, cle) as Any).id as number;
  return { app, hs, appel, compte, lame, nue, zeta, cleLame, cleNue, jeton, client, noms, appelOutil, elem, secId };
}

test('jeton lecture sur le système, compte MJ du système : trois lectures seules, toutes les sections ; joueur : sections joueurs seules', async () => {
  const w = await monde();
  try {
    const kMj = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const c = await w.client(w.cleLame, kMj.valeur);
    assert.deepEqual(await w.noms(c), [...LECTURES].sort());
    const lu = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    assert.equal(lu.erreur, false, lu.t);
    assert.equal(lu.d.titre, 'Épée runique');
    assert.deepEqual(lu.d.sections.map((s: Any) => s.titre).sort(), ['Description', 'Secret']);
    const sec = await w.appelOutil(c, 'systeme_lire_section', { fiche: String(w.elem), sectionId: w.secId('secret') });
    assert.match(sec.d.contenu, /Vorn/);
    const ch = await w.appelOutil(c, 'systeme_chercher', { mots: 'Épée' });
    assert.equal(ch.erreur, false, ch.t);
    assert.deepEqual(ch.d.fiches.map((f: Any) => f.titre), ['Épée runique']);

    // Player: reads the players' section only, never the GM-only one.
    const kLea = await w.jeton('lea', { acces: { tous: true, niveauTous: 'lecture' }, systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const cl = await w.client(w.cleLame, kLea.valeur);
    assert.deepEqual(await w.noms(cl), [...LECTURES].sort());
    const lj = await w.appelOutil(cl, 'systeme_lire_fiche', { fiche: String(w.elem) });
    assert.equal(lj.erreur, false, lj.t);
    assert.deepEqual(lj.d.sections.map((s: Any) => s.titre), ['Description']);
    assert.doesNotMatch(lj.t, /Vorn/);
    const sj = await w.appelOutil(cl, 'systeme_lire_section', { fiche: String(w.elem), sectionId: w.secId('secret') });
    assert.equal(sj.erreur, true);
    assert.match(sj.t, /Introuvable/);
    assert.doesNotMatch(sj.t, /Vorn/);
    const cj = await w.appelOutil(cl, 'systeme_chercher', { mots: 'Vorn' });
    assert.equal(cj.erreur, true, 'a GM-only passage is not searchable by a player');
  } finally { await w.app.close(); }
});

test('sans ligne dans jetons_systemes, ou univers sans système : aucun systeme_*, l’appel par nom est introuvable', async () => {
  const w = await monde();
  try {
    const sans = await w.jeton('antor', {});
    const c = await w.client(w.cleLame, sans.valeur);
    assert.deepEqual(await w.noms(c), []);
    for (const [name, args] of [['systeme_lire_fiche', { fiche: String(w.elem) }], ['systeme_chercher', { mots: 'Épée' }], ['systeme_ecrire_section', { fiche: String(w.elem), sectionId: 1, contenu: 'x', empreinte: 'x' }]] as const) {
      const r = await w.appelOutil(c, name, args as never);
      assert.equal(r.erreur, true, name);
      assert.equal(r.sc?.code, undefined, `${name}: no lecture_seule for a token with no row`);
      assert.match(r.t, /Introuvable/, name);
    }
    // A token with a row, on a universe with no system: nothing listed.
    const avec = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const cn = await w.client(w.cleNue, avec.valeur);
    assert.deepEqual(await w.noms(cn), []);
    const r = await w.appelOutil(cn, 'systeme_lire_fiche', { fiche: String(w.elem) });
    assert.equal(r.erreur, true);
    assert.match(r.t, /Introuvable/);
  } finally { await w.app.close(); }
});

test('un écrivain systeme_* appelé par nom : lecture_seule avec une ligne, introuvable sans', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    const r = await w.appelOutil(c, 'systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: 'x' });
    assert.equal(r.erreur, true);
    assert.equal(r.sc?.code, 'lecture_seule');
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(w.elem) as Any).n, 1);
    // A jeton `lecture` on the universe, no system row: the generic writers keep their own branch.
    const lu = await w.jeton('antor', { acces: { tous: true, niveauTous: 'lecture' } });
    const cl = await w.client(w.cleLame, lu.valeur);
    const r2 = await w.appelOutil(cl, 'systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: 'x' });
    assert.equal(r2.erreur, true);
    assert.equal(r2.sc?.code, undefined);
    assert.match(r2.t, /Introuvable/);
  } finally { await w.app.close(); }
});

test('baisser le niveau du jeton ou retirer la ligne entre deux requêtes change la liste de la seconde', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    assert.deepEqual(await w.noms(await w.client(w.cleLame, k.valeur)), [...LECTURES].sort());
    w.app.db.prepare('DELETE FROM jetons_systemes WHERE jeton_id = ?').run(k.id);
    const c2 = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c2), []);
    assert.match((await w.appelOutil(c2, 'systeme_lire_fiche', { fiche: String(w.elem) })).t, /Introuvable/);
    // The account loses its right (removed from the universe's players): the listing follows too.
    const kl = await w.jeton('lea', { acces: { tous: true, niveauTous: 'lecture' }, systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    assert.deepEqual(await w.noms(await w.client(w.cleLame, kl.valeur)), [...LECTURES].sort());
    w.app.db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(w.lame.id, w.compte('lea'));
    await assert.rejects(w.client(w.cleLame, kl.valeur));
  } finally { await w.app.close(); }
});

test('assistant : joueur et MJ d’univers non MJ du système reçoivent les trois lectures ; sans rôle, introuvable ; MCP sans option : aucune', async () => {
  const w = await monde();
  try {
    const ids = (p: string) => w.compte(p);
    const liste = (c: string, opts: Any = {}) => catalogueDe(w.app.db, ids(c), w.lame.id, { porte: 'assistant', images: IMAGES, ...opts }).outils.map((o) => o.nom).filter((n) => n.startsWith('systeme_')).sort();
    for (const c of ['mira', 'lea']) assert.deepEqual(liste(c), [...LECTURES].sort(), c);
    // The GM of the system on the assistant door: today the three reads only (writes belong to another task).
    for (const n of LECTURES) assert.ok(liste('antor').includes(n), n);
    assert.throws(() => catalogueDe(w.app.db, ids('teo'), w.lame.id, { porte: 'assistant', images: IMAGES }), (e: Any) => e.code === 'introuvable');
    assert.deepEqual(catalogueDe(w.app.db, ids('antor'), w.nue.id, { porte: 'assistant', images: IMAGES }).outils.filter((o) => o.nom.startsWith('systeme_')), []);
    assert.deepEqual(liste('mira', { porte: 'mcp' }), [], 'MCP door with no token level lists none');
    assert.deepEqual(liste('mira', { porte: 'mcp', systeme: null }), []);
    // Read by the assistant's tool as a non-GM of the system: players' sections only.
    const cat = catalogueDe(w.app.db, ids('mira'), w.lame.id, { porte: 'assistant', images: IMAGES });
    const lire = cat.outils.find((o) => o.nom === 'systeme_lire_fiche')!;
    const r = lire.executer({ fiche: String(w.elem) }) as Any;
    assert.equal(r.ok, true);
    assert.deepEqual(r.donnees.sections.map((s: Any) => s.titre), ['Description']);
    // A token's level 'lecture' on the MCP door still lists reads only for a GM of the system.
    assert.deepEqual(liste('antor', { porte: 'mcp', niveau: 'lecture', systeme: { niveau: 'lecture' } }), [...LECTURES].sort());
  } finally { await w.app.close(); }
});

test('aucun schéma d’outil ne porte d’identifiant de système ; le fichier outils-systeme.ts n’a ni SQL ni jetons_systemes', async () => {
  const w = await monde();
  try {
    const cat = catalogueDe(w.app.db, w.compte('antor'), w.lame.id, { porte: 'assistant', images: IMAGES });
    for (const o of cat.outils.filter((x) => x.nom.startsWith('systeme_'))) {
      const cles = Object.keys((o.schema as Any).shape);
      assert.ok(cles.length > 0, o.nom);
      assert.deepEqual(cles.filter((k) => /systeme/i.test(k)), [], o.nom);
      assert.throws(() => (o.schema as Any).parse({ fiche: '1', mots: 'x', sectionId: 1, systemeId: 1 }), o.nom);
    }
  } finally { await w.app.close(); }
  const src = readFileSync(new URL('../services/assistant/outils-systeme.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /better-sqlite3|\.prepare\(|jetons_systemes|\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
  assert.doesNotMatch(src, /systemeId\s*:\s*z\./);
});
