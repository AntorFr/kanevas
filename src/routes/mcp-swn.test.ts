import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// P-24 end to end (kanevas-carte-spatiale-outils-mcp, AD-outils-5): a real MCP client against the stub server, the
// ten `swn_*` tools fed by `catalogueDe` (no transport of its own), then the E-23 read of what the agent wrote.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { cleDeUnivers } = await import('../services/cles.js');
const { changerRole } = await import('../services/membres.js');
const { viderCacheBlocs } = await import('../services/swn/cache-blocs.js');

const lireJson = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const FS = lireJson('../../rust/modules/coeur/tests/fixtures/generation-systemes.json');
const FG = lireJson('../../rust/modules/coeur/tests/fixtures/generation-galaxie.json');
const tire = { q: FS.systemes[0].entree.q as number, r: FS.systemes[0].entree.r as number };
const DEF = { q: 40, r: -7 };
const DIX = [
  'swn_lire_systeme', 'swn_placer_astre', 'swn_deplacer_astre', 'swn_completer_astre', 'swn_tracer_formation',
  'swn_ancrer_systeme', 'swn_placer_element', 'swn_completer_element', 'swn_masquer_systeme', 'swn_retirer',
];

async function monter() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  viderCacheBlocs();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const un = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = un('SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  const sid = app.db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
    .run(g, E, 'sdef', 'Port défini', DEF.q, DEF.r).lastInsertRowid as number;
  app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,0,?,?,?,?,0.1,'{}')")
    .run(sid, 'e', 'etoile', null, 'orange', null, 0, 0);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const cle = cleDeUnivers(app.db, E)!;
  const jeton = (compte: string, niveau = 'ecriture') =>
    creerJeton(app.db, id(compte), { nom: 'Agent', dureeJours: 30, acces: { tous: true, niveauTous: niveau } } as never, app.horloge());
  const client = async (chemin: string, valeur: string) => {
    const c = new Client({ name: 't', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(base + chemin), { requestInit: { headers: { authorization: `Bearer ${valeur}` } } }));
    return c;
  };
  const appel = async (c: InstanceType<typeof Client>, name: string, args: object) => {
    const r = await c.callTool({ name, arguments: args }) as { isError?: boolean; structuredContent?: any; content: { text: string }[] };
    const texte = r.content[0]!.text;
    let json: any = null;
    try { json = JSON.parse(texte); } catch { /* a refusal is text */ }
    return { erreur: r.isError === true, texte, json, structure: r.structuredContent };
  };
  // What the E-23 screen reads on reload: the interior route, with the GM's session.
  const ecran = async (q: number, r: number, compte = 'antor') => {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
    const cookie = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
    return app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${q}/${r}`, headers: { cookie } });
  };
  const fiche = (titre: string, lisent = true) => {
    const f = app.db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('k' || hex(randomblob(6)), 'ecran', ?, 'lieu', ?, '{}', 1, 1)").run(E, titre).lastInsertRowid as number;
    app.db.prepare("INSERT INTO sections (cle, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES ('k' || hex(randomblob(6)), ?, 'Texte', 1, '', '2026-01-01', ?)").run(f, lisent ? 1 : 0);
    return f;
  };
  const photo = () => JSON.stringify(['swn_astres', 'swn_elements', 'swn_systemes', 'swn_formations'].map((t) => app.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()));
  return { app, E, g, cle, id, jeton, client, appel, ecran, fiche, photo, un };
}

test('P-24 : jeton MJ, dix outils swn_*, un système tiré lu, corps complété (nom, aspect, lien) puis ancré, relu par l’écran', async () => {
  const m = await monter();
  try {
    const { valeur } = m.jeton('antor');
    const c = await m.client(`/mcp/${m.cle}`, valeur);
    const noms = (await c.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('swn_')).sort();
    assert.deepEqual(noms, [...DIX].sort());

    const lu = await m.appel(c, 'swn_lire_systeme', tire);
    assert.equal(lu.erreur, false, lu.texte);
    assert.equal(lu.json.etat, 'tire');
    const versionSysteme = lu.json.version_systeme as number;
    const cible = lu.json.corps.find((x: any) => x.genre === 'planete') ?? lu.json.corps.find((x: any) => x.genre !== 'etoile');
    assert.ok(cible, 'le tirage porte un corps à compléter');
    const f = m.fiche('Bellone');

    // Nothing is a row until the agent writes: the drawn system has none.
    assert.equal((m.un('SELECT count(*) n FROM swn_systemes WHERE q=? AND r=?', tire.q, tire.r) as any).n, 0);

    const ecrit = await m.appel(c, 'swn_completer_astre', {
      ...tire, cle: cible.cle, version_lue: cible.version, version_systeme: versionSysteme,
      nom: 'Bellone', aspect: { couleur: '#b5651d' }, lien: f,
    });
    assert.equal(ecrit.erreur, false, ecrit.texte);
    assert.equal(ecrit.json.evenement.type, 'systeme_modifie');
    assert.equal(ecrit.json.etat, 'defini', 'le premier geste ancre le système tiré');
    const apres = ecrit.json.corps.find((x: any) => x.cle === cible.cle);
    assert.equal(apres.nom, 'Bellone');
    assert.equal(apres.lien.id, f);

    // The explicit anchoring on a defined system is the gesture's own refusal, not a second write.
    const ancre = await m.appel(c, 'swn_ancrer_systeme', { ...tire, version_systeme: ecrit.json.version_systeme });
    assert.equal(ancre.json?.etat ?? 'defini', 'defini');

    // The GM reloads E-23: the body is named, linked, and the system is defined.
    const vue = (await m.ecran(tire.q, tire.r)).json();
    assert.equal(vue.etat, 'defini');
    const corps = vue.astres.find((x: any) => x.cle === cible.cle);
    assert.equal(corps.nom, 'Bellone');
    assert.equal(corps.fiche?.id, f);
    await c.close();
  } finally { await m.app.close(); }
});

test('P-24 : un ancrage direct d’un système tiré par l’agent, avec la version lue', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    const lu = await m.appel(c, 'swn_lire_systeme', tire);
    const r = await m.appel(c, 'swn_ancrer_systeme', { ...tire, version_systeme: lu.json.version_systeme });
    assert.equal(r.erreur, false, r.texte);
    assert.equal(r.json.etat, 'defini');
    assert.equal((await m.ecran(tire.q, tire.r)).json().etat, 'defini');
    await c.close();
  } finally { await m.app.close(); }
});

test('refus : système inconnu « Introuvable. », orbite hors bornes avec son code, version périmée, sans écriture', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    const inconnu = await m.appel(c, 'swn_lire_systeme', { ...tire, galaxie: 'Galaxie fantôme' });
    assert.equal(inconnu.erreur, true);
    assert.equal(inconnu.texte, 'Introuvable.');

    const avant = m.photo();
    const orbite = await m.appel(c, 'swn_placer_astre', { ...DEF, genre: 'planete', orbite: -1, heure: 3 });
    assert.equal(orbite.erreur, true);
    assert.ok(orbite.structure?.code || /\[[a-z_]+/.test(orbite.texte), `un code accompagne le refus : ${orbite.texte}`);
    const heure = await m.appel(c, 'swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 12 });
    assert.equal(heure.erreur, true);
    assert.ok(!('evenement' in (heure.json ?? {})));
    assert.equal(m.photo(), avant, 'un refus n’écrit rien');

    const lu = await m.appel(c, 'swn_lire_systeme', tire);
    const perime = await m.appel(c, 'swn_ancrer_systeme', { ...tire, version_systeme: lu.json.version_systeme + 7 });
    assert.equal(perime.erreur, true);
    assert.equal(m.photo(), avant);
    await c.close();
  } finally { await m.app.close(); }
});

test('jeton : révoqué → 401 jeton_invalide ; créateur rétrogradé → plus aucun outil d’écriture swn ', async () => {
  const m = await monter();
  try {
    const base = `http://127.0.0.1:${(m.app.server.address() as { port: number }).port}`;
    const brut = (valeur: string) => fetch(`${base}/mcp/${m.cle}`, {
      method: 'POST', headers: { authorization: `Bearer ${valeur}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    // The agent's creator is a GM by a promotion that is then withdrawn.
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'joueur');
    const j = m.jeton('mira');
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'mj');
    const mj = await m.client(`/mcp/${m.cle}`, j.valeur);
    assert.deepEqual((await mj.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('swn_')).sort(), [...DIX].sort());
    await mj.close();
    changerRole(m.app.db, m.id('antor'), m.E, m.id('mira'), 'joueur');
    const joueur = await m.client(`/mcp/${m.cle}`, j.valeur);
    assert.deepEqual((await joueur.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('swn_')), ['swn_lire_systeme']);
    const avant = m.photo();
    const ecrit = await m.appel(joueur, 'swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 3 });
    assert.equal(ecrit.erreur, true);
    assert.equal(ecrit.texte, 'Introuvable.');
    assert.equal(m.photo(), avant);
    await joueur.close();

    const revoque = m.jeton('antor');
    revoquerJeton(m.app.db, { compteId: m.id('antor'), admin: false }, revoque.jeton.id);
    const r = await brut(revoque.valeur);
    assert.equal(r.status, 401);
    assert.equal((await r.json() as any).code, 'jeton_invalide');
  } finally { await m.app.close(); }
});

test('le MJ de l’agent reçoit un élément secret et un système masqué, marqués secret: true / masque: true', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    const el = await m.appel(c, 'swn_placer_element', { ...DEF, genre: 'base', nom: 'Base noire', orbite: 2, heure: 3, secret: true });
    assert.equal(el.erreur, false, el.texte);
    assert.equal(el.json.elements.find((e: any) => e.nom === 'Base noire').secret, true);
    const relu = await m.appel(c, 'swn_lire_systeme', DEF);
    assert.equal(relu.json.elements.find((e: any) => e.nom === 'Base noire').secret, true);

    const lu = await m.appel(c, 'swn_lire_systeme', tire);
    const mq = await m.appel(c, 'swn_masquer_systeme', { ...tire, secret: true, version_systeme: lu.json.version_systeme });
    assert.equal(mq.erreur, false, mq.texte);
    assert.equal(mq.json.masque, true);
    assert.equal((await m.appel(c, 'swn_lire_systeme', tire)).json.masque, true);
    await c.close();
  } finally { await m.app.close(); }
});
