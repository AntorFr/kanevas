import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { buildApp } = await import('../app.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { cleDeUnivers } = await import('../services/cles.js');
const { creerFiche } = await import('../services/fiches.js');
const { ajouterSection, changerAudience } = await import('../services/sections.js');
const { ajouterMembre } = await import('../services/membres.js');
const { creerUnivers } = await import('../services/univers.js');

async function monter() {
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=lea' });
  const antor = id('antor');
  const u = creerUnivers(app.db, antor, { nom: 'Lame' });
  const autre = creerUnivers(app.db, antor, { nom: 'Autre' });
  ajouterMembre(app.db, antor, u.id, 'lea', 'joueur');
  const f = creerFiche(app.db, antor, u.id, { type: 'lieu', titre: 'Tenebria' });
  const ouverte = ajouterSection(app.db, antor, u.id, f.id, { titre: 'Histoire', contenu: 'Fondée sous un ciel de cendre.\n\n:::mj\nle mot zorglub du traitre\n:::\n' });
  changerAudience(app.db, antor, u.id, f.id, ouverte.id, { joueursLisent: true });
  ajouterSection(app.db, antor, u.id, f.id, { titre: 'Secret', contenu: 'quasimodo seul chez le MJ' });
  const cle = cleDeUnivers(app.db, u.id)!;
  const jeton = (compte: string, acces: unknown = LECTURE) =>
    creerJeton(app.db, id(compte), { nom: 'T', dureeJours: 30, acces } as never, app.horloge());
  const client = async (chemin: string, valeur: string) => {
    const c = new Client({ name: 't', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(base + chemin), { requestInit: { headers: { authorization: `Bearer ${valeur}` } } }));
    return c;
  };
  const brut = (chemin: string, headers: Record<string, string>, method = 'POST', body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) =>
    fetch(base + chemin, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), accept: 'application/json, text/event-stream', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined });
  const texte = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;
  return { app, u, autre, f, cle, id, jeton, client, brut, texte };
}

const LECTURE = { tous: true, niveauTous: 'lecture' };

test('lecture : les outils sans écriture ; chercher_texte rend le passage et son extrait, jamais le bloc MJ à la joueuse', async () => {
  const m = await monter();
  try {
    const { valeur } = m.jeton('lea', { tous: false, univers: [{ universId: m.u.id, niveau: 'lecture' }] });
    const c = await m.client(`/mcp/${m.cle}`, valeur);
    const noms = (await c.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(noms, ['chercher', 'chercher_texte', 'lire_fiche', 'lire_section', 'mentions']);
    const r = await c.callTool({ name: 'chercher_texte', arguments: { mots: 'cendre' } });
    assert.match(m.texte(r), /Tenebria/);
    assert.match(m.texte(r), /cendre/);
    for (const mot of ['zorglub', 'quasimodo']) {
      const v = await c.callTool({ name: 'chercher_texte', arguments: { mots: mot } });
      assert.ok(!m.texte(v).includes(mot) || v.isError, mot);
      assert.ok(!/Tenebria/.test(m.texte(v)), `${mot} ne trouve rien`);
    }
    // lire_historique n'est pas offert ; l'appeler est « Introuvable. »
    const h = await c.callTool({ name: 'lire_historique', arguments: {} });
    assert.equal(h.isError, true);
    assert.equal(m.texte(h), 'Introuvable.');
    await c.close();
  } finally { await m.app.close(); }
});

test('MJ : lire_historique est offert et rend l’historique d’une fiche ; /mcp seul n’offre que lister_univers, paginé', async () => {
  const m = await monter();
  try {
    const { valeur } = m.jeton('antor', LECTURE);
    const c = await m.client(`/mcp/${m.cle}`, valeur);
    const noms = (await c.listTools()).tools.map((t) => t.name);
    assert.ok(noms.includes('lire_historique'));
    const h = await c.callTool({ name: 'lire_historique', arguments: { fiche: String(m.f.id) } });
    assert.ok(!h.isError, m.texte(h));
    assert.ok(JSON.parse(m.texte(h)).lignes.length > 0);
    await c.close();

    const b = await m.client('/mcp', valeur);
    assert.deepEqual((await b.listTools()).tools.map((t) => t.name), ['lister_univers']);
    const l = JSON.parse(m.texte(await b.callTool({ name: 'lister_univers', arguments: {} })));
    assert.equal(l.univers.length, 2);
    assert.ok(l.univers.every((u: { adresse: string; cle: string }) => u.adresse === `/mcp/${u.cle}`));
    assert.equal(l.curseur, null);
    await b.close();
  } finally { await m.app.close(); }
});

test('lister_univers : 20 par page avec curseur, sans doublon ni trou', async () => {
  const m = await monter();
  try {
    for (let i = 0; i < 24; i++) creerUnivers(m.app.db, m.id('antor'), { nom: `U${i}` });
    const { valeur } = m.jeton('antor', LECTURE);
    const b = await m.client('/mcp', valeur);
    const vus: string[] = [];
    let curseur: string | null = null;
    let pages = 0;
    do {
      const d = JSON.parse(m.texte(await b.callTool({ name: 'lister_univers', arguments: curseur ? { curseur } : {} })));
      vus.push(...d.univers.map((u: { cle: string }) => u.cle));
      curseur = d.curseur;
      pages++;
    } while (curseur && pages < 10);
    assert.equal(pages, 2);
    assert.equal(vus.length, 26);
    assert.equal(new Set(vus).size, 26);
    await b.close();
  } finally { await m.app.close(); }
});

test('lister_univers : un jeton limité à un univers ne voit que lui', async () => {
  const m = await monter();
  try {
    const { valeur } = m.jeton('antor', { tous: false, univers: [{ universId: m.u.id, niveau: 'lecture' }] });
    const b = await m.client('/mcp', valeur);
    const l = JSON.parse(m.texte(await b.callTool({ name: 'lister_univers', arguments: {} })));
    assert.deepEqual(l.univers.map((u: { cle: string }) => u.cle), [m.cle]);
    await b.close();
  } finally { await m.app.close(); }
});

test('refus : jeton inconnu = révoqué (même corps), expiré, d’outils, autre univers, cookie seul, Origin, GET/DELETE', async () => {
  const m = await monter();
  try {
    const bon = m.jeton('antor', { tous: false, univers: [{ universId: m.u.id, niveau: 'lecture' }] });
    const aRevoquer = m.jeton('antor', LECTURE);
    revoquerJeton(m.app.db, { compteId: m.id('antor') } as never, aRevoquer.jeton.id);
    const bearer = (v: string) => ({ authorization: `Bearer ${v}` });
    const inconnu = await m.brut('/mcp', bearer('kvs_inconnu0000000000000000000000000'));
    const revoque = await m.brut('/mcp', bearer(aRevoquer.valeur));
    assert.equal(inconnu.status, 401);
    assert.equal(revoque.status, 401);
    assert.equal(await inconnu.text(), await revoque.text());
    assert.equal((await m.brut('/mcp', {})).status, 401);
    assert.equal((await m.brut('/mcp', { authorization: 'Basic abc' })).status, 401);
    // autre univers que celui du jeton : 404 ; clé inconnue : 404
    assert.equal((await m.brut(`/mcp/${cleAutre(m)}`, bearer(bon.valeur))).status, 404);
    assert.equal((await m.brut('/mcp/inexistant', bearer(bon.valeur))).status, 404);
    // jeton d'outils : refusé comme tout autre
    const outils = m.jeton('antor', LECTURE);
    m.app.db.pragma('foreign_keys = OFF');
    m.app.db.prepare('INSERT INTO jetons_outils (jeton_id, outil) VALUES (?, ?)').run(outils.jeton.id, 'vaisseaux');
    assert.equal((await m.brut('/mcp', bearer(outils.valeur))).status, 401);
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer(outils.valeur))).status, 401);
    // Origin présent
    assert.equal((await m.brut('/mcp', { ...bearer(bon.valeur), origin: 'http://evil.example' })).status, 403);
    // GET, DELETE
    assert.equal((await m.brut('/mcp', bearer(bon.valeur), 'GET')).status, 405);
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer(bon.valeur), 'DELETE')).status, 405);
    // cookie de session seul
    const conn = await m.app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
    const ck = conn.cookies.find((x) => x.name === 'kanevas_session')!;
    const rc = await m.brut(`/mcp/${m.cle}`, { cookie: `kanevas_session=${ck.value}` });
    assert.equal(rc.status, 401);
    // le jeton valide, lui, ouvre
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer(bon.valeur))).status, 200);
  } finally { await m.app.close(); }
});

function cleAutre(m: { app: { db: never }; autre: { id: number } }) {
  return cleDeUnivers(m.app.db, m.autre.id)!;
}

test('refus : jeton expiré, rôle retiré, corps de plus de 1 Mo', async () => {
  const m = await monter();
  try {
    const bon = m.jeton('lea', { tous: false, univers: [{ universId: m.u.id, niveau: 'lecture' }] });
    const h = { authorization: `Bearer ${bon.valeur}` };
    const gros = await m.brut(`/mcp/${m.cle}`, h, 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { x: 'a'.repeat(1024 * 1024 + 10) } });
    assert.equal(gros.status, 413);
    m.app.db.prepare('UPDATE jetons_api SET cree_le = ?, expire_le = ? WHERE id = ?').run('1999-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z', bon.jeton.id);
    const r = await m.brut(`/mcp/${m.cle}`, h);
    assert.equal(r.status, 401);
    const autre = m.jeton('lea', { tous: false, univers: [{ universId: m.u.id, niveau: 'lecture' }] });
    m.app.db.prepare('DELETE FROM membres WHERE compte_id = ? AND univers_id = ?').run(m.id('lea'), m.u.id);
    assert.equal((await m.brut(`/mcp/${m.cle}`, { authorization: `Bearer ${autre.valeur}` })).status, 404);
  } finally { await m.app.close(); }
});
