// Porte MCP (kanevas-synchro-mcp : B-97, B-98, B-102, P-24), écrite depuis le critère de sortie de la fiche et de
// docs/parcours.md, à la porte HTTP `/mcp` avec un vrai client MCP et de vrais jetons (mode bouchon : seule la connexion change).
// Les attendus sont des littéraux du besoin. Aucun écran : la feature n'en porte pas (la porte est le point d'entrée).
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
const { ajouterMembre, changerRole } = await import('../services/membres.js');
const { creerUnivers } = await import('../services/univers.js');

const LECTURE = { tous: true, niveauTous: 'lecture' };
const ECRITURE = { tous: true, niveauTous: 'ecriture' };
const LECTURE_SEULE = ['chercher', 'chercher_texte', 'lire_fiche', 'lire_section', 'mentions'];
const ECRITURE_OUTILS = ['creer_fiche', 'modifier_entete', 'ecrire_section', 'supprimer_section', 'relier', 'modifier_relation', 'retirer_relation'];

async function monter() {
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  for (const compte of ['antor', 'lea']) {
    await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  }
  const antor = id('antor');
  const u = creerUnivers(app.db, antor, { nom: 'Lame' });
  const autre = creerUnivers(app.db, antor, { nom: 'Autre' });
  ajouterMembre(app.db, antor, u.id, 'lea', 'joueur');
  const f = creerFiche(app.db, antor, u.id, { type: 'lieu', titre: 'Ormevane' });
  const histoire = ajouterSection(app.db, antor, u.id, f.id, { titre: 'Histoire', contenu: 'Fondée sous un ciel de cendre.\n\n:::mj\nle mot zorglub du traitre\n:::\n' });
  changerAudience(app.db, antor, u.id, f.id, histoire.id, { joueursLisent: true });
  const secret = ajouterSection(app.db, antor, u.id, f.id, { titre: 'Vérité', contenu: 'quasimodo seul chez le MJ' });
  const cle = cleDeUnivers(app.db, u.id)!;
  const jeton = (compte: string, acces: unknown = LECTURE, nom = 'Agent') =>
    creerJeton(app.db, id(compte), { nom, dureeJours: 30, acces } as never, app.horloge());
  const client = async (chemin: string, valeur: string) => {
    const c = new Client({ name: 't', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(base + chemin), { requestInit: { headers: { authorization: `Bearer ${valeur}` } } }));
    return c;
  };
  const brut = (chemin: string, headers: Record<string, string>, method = 'POST') =>
    fetch(base + chemin, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), accept: 'application/json, text/event-stream', ...headers },
      body: method === 'POST' ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) : undefined });
  const appel = async (c: InstanceType<typeof Client>, name: string, args: Record<string, unknown> = {}) => {
    const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { erreur: r.isError === true, texte: r.content[0]!.text, json: () => JSON.parse(r.content[0]!.text) };
  };
  const contenu = (sectionId: number) => (app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(sectionId) as { contenu: string }).contenu;
  return { app, u, autre, f, histoire, secret, cle, id, antor, jeton, client, brut, appel, contenu };
}
const noms = async (c: InstanceType<typeof Client>) => (await c.listTools()).tools.map((t) => t.name).sort();

test('B-97 jeton lecture de la joueuse : cinq outils de lecture, ni écriture, ni historique, ni génération d’image', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('lea').valeur);
    assert.deepEqual(await noms(c), ['chercher', 'chercher_texte', 'lire_fiche', 'lire_section', 'mentions']);
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97/B-102 jeton lecture d’un MJ : lire_historique en plus, toujours sans outil d’écriture ni generer_image', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    assert.deepEqual(await noms(c), [...LECTURE_SEULE, 'lire_historique'].sort());
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 jeton écriture d’un MJ : les sept outils d’écriture, jamais generer_image', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE).valeur);
    const liste = await noms(c);
    assert.deepEqual(liste, [...LECTURE_SEULE, 'lire_historique', ...ECRITURE_OUTILS].sort());
    assert.ok(!liste.includes('generer_image'));
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 le catalogue suit le rôle courant du compte : un MJ rétrogradé joueur perd lire_historique, sans changer de jeton', async () => {
  const m = await monter();
  try {
    ajouterMembre(m.app.db, m.antor, m.u.id, 'lea', 'joueur');
  } catch { /* déjà membre */ }
  try {
    changerRole(m.app.db, m.antor, m.u.id, m.id('lea'), 'mj');
    const { valeur } = m.jeton('lea');
    const avant = await m.client(`/mcp/${m.cle}`, valeur);
    assert.ok((await noms(avant)).includes('lire_historique'));
    await avant.close();
    changerRole(m.app.db, m.antor, m.u.id, m.id('lea'), 'joueur');
    const apres = await m.client(`/mcp/${m.cle}`, valeur);
    assert.ok(!(await noms(apres)).includes('lire_historique'));
    await apres.close();
  } finally { await m.app.close(); }
});

test('B-97 /mcp seul n’offre que lister_univers : les univers du jeton avec l’adresse /mcp/<clé>, pas ceux où le compte n’a pas de rôle', async () => {
  const m = await monter();
  try {
    const c = await m.client('/mcp', m.jeton('lea').valeur);
    assert.deepEqual(await noms(c), ['lister_univers']);
    const l = (await m.appel(c, 'lister_univers')).json();
    assert.deepEqual(l.univers.map((x: { adresse: string }) => x.adresse), [`/mcp/${m.cle}`]);
    assert.equal(l.curseur, null);
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 lister_univers pagine : 21 univers = 20 puis 1, sans doublon (bord de page)', async () => {
  const m = await monter();
  try {
    for (let i = 0; i < 19; i++) creerUnivers(m.app.db, m.antor, { nom: `U${i}` });
    const c = await m.client('/mcp', m.jeton('antor').valeur);
    const p1 = (await m.appel(c, 'lister_univers')).json();
    assert.equal(p1.univers.length, 20);
    assert.ok(p1.curseur);
    const p2 = (await m.appel(c, 'lister_univers', { curseur: p1.curseur })).json();
    assert.equal(p2.univers.length, 1);
    assert.equal(p2.curseur, null);
    const cles = [...p1.univers, ...p2.univers].map((x: { cle: string }) => x.cle);
    assert.equal(new Set(cles).size, 21);
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 refus à la porte : sans jeton, jeton inconnu, révoqué, cookie de session seul = 401 ; univers sans rôle ou inconnu = 404 ; Origin = 403 ; GET = 405', async () => {
  const m = await monter();
  try {
    const bearer = (v: string) => ({ authorization: `Bearer ${v}` });
    const lea = m.jeton('lea');
    assert.equal((await m.brut(`/mcp/${m.cle}`, {})).status, 401);
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer('kvs_inconnu00000000000000000000000'))).status, 401);
    const conn = await m.app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
    const ck = conn.cookies.find((x) => x.name === 'kanevas_session')!;
    assert.equal((await m.brut(`/mcp/${m.cle}`, { cookie: `kanevas_session=${ck.value}` })).status, 401);
    const autreCle = cleDeUnivers(m.app.db, m.autre.id)!;
    assert.equal((await m.brut(`/mcp/${autreCle}`, bearer(lea.valeur))).status, 404);
    assert.equal((await m.brut('/mcp/univers-qui-nexiste-pas', bearer(lea.valeur))).status, 404);
    assert.equal((await m.brut(`/mcp/${m.cle}`, { ...bearer(lea.valeur), origin: 'http://evil.example' })).status, 403);
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer(lea.valeur), 'GET')).status, 405);
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer(lea.valeur))).status, 200);
    revoquerJeton(m.app.db, { compteId: m.id('lea') } as never, lea.jeton.id);
    assert.equal((await m.brut(`/mcp/${m.cle}`, bearer(lea.valeur))).status, 401);
  } finally { await m.app.close(); }
});

test('B-98 chercher_texte rend le passage : fiche, section et extrait autour du mot (jeton lecture de la joueuse)', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('lea').valeur);
    const r = (await m.appel(c, 'chercher_texte', { mots: 'cendre' })).json();
    assert.equal(r.passages.length, 1);
    assert.equal(r.passages[0].fiche, 'lieu:ormevane');
    assert.equal(r.passages[0].titreFiche, 'Ormevane');
    assert.equal(r.passages[0].titre, 'Histoire');
    assert.equal(r.passages[0].extrait, 'Fondée sous un ciel de **cendre**.');
    assert.equal(r.curseur, null);
    await c.close();
  } finally { await m.app.close(); }
});

test('B-98 la joueuse ne trouve jamais un mot présent seulement dans un bloc MJ ou une section MJ seul ; le MJ le trouve', async () => {
  const m = await monter();
  try {
    const lea = await m.client(`/mcp/${m.cle}`, m.jeton('lea').valeur);
    for (const mot of ['zorglub', 'quasimodo']) {
      for (const outil of ['chercher_texte', 'chercher']) {
        const r = await m.appel(lea, outil, { mots: mot });
        assert.ok(!r.texte.includes(mot), `${outil} ${mot} : ${r.texte}`);
        assert.ok(!r.texte.includes('lieu:ormevane'), `${outil} ${mot} : ${r.texte}`);
      }
    }
    // lire_fiche / lire_section ne livrent pas non plus le contenu caché
    const fiche = await m.appel(lea, 'lire_fiche', { fiche: 'lieu:ormevane' });
    assert.ok(!fiche.texte.includes('zorglub') && !fiche.texte.includes('quasimodo'));
    const sec = await m.appel(lea, 'lire_section', { fiche: 'lieu:ormevane', sectionId: m.secret.id });
    assert.equal(sec.erreur, true);
    assert.ok(!sec.texte.includes('quasimodo'));
    await lea.close();

    const mj = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    for (const mot of ['zorglub', 'quasimodo']) {
      const r = (await m.appel(mj, 'chercher_texte', { mots: mot })).json();
      assert.equal(r.passages.length, 1, mot);
      assert.equal(r.passages[0].fiche, 'lieu:ormevane');
    }
    await mj.close();
  } finally { await m.app.close(); }
});

test('B-98 un mot absent partout : aucun passage rendu (le besoin ne dit pas la forme du « rien », voir les trous)', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    const r = await m.appel(c, 'chercher_texte', { mots: 'introuvablemotxyz' });
    assert.ok(r.erreur || r.json().passages.length === 0, r.texte);
    assert.ok(!r.texte.includes('lieu:ormevane'));
    await c.close();
  } finally { await m.app.close(); }
});

test('B-98 une recherche large se rend page par page : 60 fiches, plusieurs pages, chacune une fois, dernière page sans curseur', async () => {
  const m = await monter();
  try {
    for (let i = 0; i < 60; i++) {
      const g = creerFiche(m.app.db, m.antor, m.u.id, { type: 'lieu', titre: `Halte ${i}` });
      const s = ajouterSection(m.app.db, m.antor, m.u.id, g.id, { titre: 'Notes', contenu: `Le convoi passe la halte numéro ${i} sous le mot hydrocarbure.` });
      changerAudience(m.app.db, m.antor, m.u.id, g.id, s.id, { joueursLisent: true });
    }
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('lea').valeur);
    for (const outil of ['chercher_texte', 'chercher']) {
      const vus: string[] = [];
      let curseur: string | null = null;
      let pages = 0;
      do {
        const r = (await m.appel(c, outil, { mots: 'hydrocarbure', ...(curseur ? { curseur } : {}) })).json();
        const items = (r.passages ?? r.fiches) as { fiche: string }[];
        if (pages === 0) assert.ok(items.length < 60, `${outil} : la première page rend tout`);
        vus.push(...items.map((x) => x.fiche));
        curseur = r.curseur;
        pages++;
      } while (curseur && pages < 40);
      assert.ok(pages >= 2, `${outil} : une seule page`);
      assert.equal(curseur, null);
      assert.equal(vus.length, 60, outil);
      assert.equal(new Set(vus).size, 60, `${outil} : doublons`);
    }
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 mentions : les fiches qui en citent une autre, lues avec le jeton lecture', async () => {
  const m = await monter();
  try {
    const sevrak = creerFiche(m.app.db, m.antor, m.u.id, { type: 'lieu', titre: 'Sevrak' });
    const ecr = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE, 'Ecr').valeur);
    const lue = (await m.appel(ecr, 'lire_fiche', { fiche: 'lieu:ormevane' })).json();
    const r = await m.appel(ecr, 'relier', { fiche: 'lieu:ormevane', sectionId: lue.sections[0].id, cible: 'lieu:sevrak', qualificatif: 'voisine' });
    assert.equal(r.erreur, false, r.texte);
    await ecr.close();
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    const ment = (await m.appel(c, 'mentions', { fiche: `lieu:sevrak` })).json();
    assert.equal(ment.mentions.length, 1);
    assert.ok(JSON.stringify(ment.mentions).includes('lieu:ormevane'));
    assert.equal(ment.curseur, null);
    void sevrak;
    await c.close();
  } finally { await m.app.close(); }
});

test('B-102 lire_historique rend l’historique d’une fiche au MJ ; la joueuse n’a pas l’outil et l’appeler ne rend rien', async () => {
  const m = await monter();
  try {
    const mj = await m.client(`/mcp/${m.cle}`, m.jeton('antor').valeur);
    const h = await m.appel(mj, 'lire_historique', { fiche: 'lieu:ormevane' });
    assert.equal(h.erreur, false);
    assert.ok(h.json().lignes.length >= 1);
    assert.ok(h.json().lignes.every((l: { ficheCle: string }) => l.ficheCle === 'lieu:ormevane'));
    await mj.close();
    const lea = await m.client(`/mcp/${m.cle}`, m.jeton('lea').valeur);
    const r = await m.appel(lea, 'lire_historique', { fiche: 'lieu:ormevane' });
    assert.equal(r.erreur, true);
    assert.ok(!r.texte.includes('ficheCle'));
    await lea.close();
  } finally { await m.app.close(); }
});

test('B-97/B-110 écriture : empreinte lue → la section est écrite et l’historique porte l’origine mcp avec le nom du jeton', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE, 'Agent Éneria').valeur);
    const lue = (await m.appel(c, 'lire_fiche', { fiche: 'lieu:ormevane' })).json();
    const sec = lue.sections.find((s: { titre: string }) => s.titre === 'Histoire');
    const w = await m.appel(c, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: sec.id, contenu: 'Fondée sous un ciel de braise.', empreinte: sec.empreinte });
    assert.equal(w.erreur, false, w.texte);
    assert.equal(m.contenu(sec.id), 'Fondée sous un ciel de braise.');
    const lignes = (await m.appel(c, 'lire_historique', { fiche: 'lieu:ormevane' })).json().lignes;
    const ligne = lignes.find((l: { origine: string }) => l.origine === 'mcp');
    assert.ok(ligne, JSON.stringify(lignes));
    assert.equal(ligne.action, 'modifiee');
    assert.equal(ligne.compte.username, 'antor');
    assert.equal(ligne.jeton.nom, 'Agent Éneria');
    await c.close();
  } finally { await m.app.close(); }
});

test('B-110 écriture : une section changée depuis la lecture n’est pas écrasée (section_modifiee), puis relue et réécrite', async () => {
  const m = await monter();
  try {
    const agent = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE, 'Agent A').valeur);
    const autre = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE, 'Agent B').valeur);
    const lue = (await m.appel(agent, 'lire_fiche', { fiche: 'lieu:ormevane' })).json();
    const sec = lue.sections.find((s: { titre: string }) => s.titre === 'Histoire');
    const deB = (await m.appel(autre, 'lire_section', { fiche: 'lieu:ormevane', sectionId: sec.id })).json();
    assert.equal((await m.appel(autre, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: sec.id, contenu: 'Version de B.', empreinte: deB.empreinte })).erreur, false);

    const refus = await m.appel(agent, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: sec.id, contenu: 'Version de A.', empreinte: sec.empreinte });
    assert.equal(refus.erreur, true);
    assert.match(refus.texte, /section_modifiee/);
    assert.equal(m.contenu(sec.id), 'Version de B.');

    const relue = (await m.appel(agent, 'lire_section', { fiche: 'lieu:ormevane', sectionId: sec.id })).json();
    const ok = await m.appel(agent, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: sec.id, contenu: 'Version de A.', empreinte: relue.empreinte });
    assert.equal(ok.erreur, false, ok.texte);
    assert.equal(m.contenu(sec.id), 'Version de A.');
    await agent.close(); await autre.close();
  } finally { await m.app.close(); }
});

test('B-110 écriture sans empreinte : refusée (invalide), rien n’est écrit', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE).valeur);
    const r = await m.appel(c, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: m.histoire.id, contenu: 'Sans empreinte.' });
    assert.equal(r.erreur, true);
    assert.notEqual(m.contenu(m.histoire.id), 'Sans empreinte.');
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 un jeton lecture ne peut pas écrire en appelant l’outil par son nom : lecture_seule, rien n’est écrit', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor', LECTURE).valeur);
    const avant = m.contenu(m.histoire.id);
    const r = await m.appel(c, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: m.histoire.id, contenu: 'Piraté.', empreinte: 'abc' });
    assert.equal(r.erreur, true);
    assert.match(r.texte, /lecture_seule/);
    assert.equal(m.contenu(m.histoire.id), avant);
    const cr = await m.appel(c, 'creer_fiche', { type: 'lieu', titre: 'Pirate' });
    assert.equal(cr.erreur, true);
    assert.equal((m.app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE titre = 'Pirate'").get() as { n: number }).n, 0);
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 le droit effectif est le plus faible du jeton et du rôle : un jeton écriture de joueuse n’écrit pas la section du MJ', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('lea', ECRITURE).valeur);
    const lue = (await m.appel(c, 'lire_fiche', { fiche: 'lieu:ormevane' })).json();
    const sec = lue.sections.find((s: { titre: string }) => s.titre === 'Histoire');
    const avant = m.contenu(m.histoire.id);
    const r = await m.appel(c, 'ecrire_section', { fiche: 'lieu:ormevane', sectionId: sec.id, contenu: 'Réécrite par Léa.', empreinte: sec.empreinte });
    assert.equal(r.erreur, true, r.texte);
    assert.equal(m.contenu(m.histoire.id), avant);
    const h = await m.appel(c, 'lire_historique', { fiche: 'lieu:ormevane' });
    assert.equal(h.erreur, true);
    await c.close();
  } finally { await m.app.close(); }
});

test('B-97 creer_fiche : la fiche créée reçoit une clé lisible, se relit, et sa ligne d’historique porte l’origine mcp', async () => {
  const m = await monter();
  try {
    const c = await m.client(`/mcp/${m.cle}`, m.jeton('antor', ECRITURE, 'Agent Éneria').valeur);
    const cr = await m.appel(c, 'creer_fiche', { type: 'lieu', titre: 'Les Veilleurs' });
    assert.equal(cr.erreur, false, cr.texte);
    assert.equal(cr.json().fiche, 'lieu:les-veilleurs');
    const lue = await m.appel(c, 'lire_fiche', { fiche: 'lieu:les-veilleurs' });
    assert.equal(lue.json().titre, 'Les Veilleurs');
    const lignes = (await m.appel(c, 'lire_historique', { fiche: 'lieu:les-veilleurs' })).json().lignes;
    assert.ok(lignes.some((l: { origine: string; action: string }) => l.origine === 'mcp' && l.action === 'creee'), JSON.stringify(lignes));
    await c.close();
  } finally { await m.app.close(); }
});
