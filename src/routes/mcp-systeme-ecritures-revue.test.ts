// kanevas-systemes-jeu-mcp-assistant-ecritures (review): the agent writes, customises and deletes the elements of the
// universe's system through the MCP door and `catalogueDe` (AD-mcp-sj-2 and 3, AD-153, AD-76, AD-140, AD-147).
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
const ECRIVAINS = ['systeme_creer_fiche', 'systeme_modifier_entete', 'systeme_ecrire_section', 'systeme_supprimer_fiche', 'systeme_supprimer_section'];
const TOUS = [...LECTURES, ...ECRIVAINS].sort();
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


const hist = (w: Awaited<ReturnType<typeof monde>>, ficheId: number) =>
  w.app.db.prepare('SELECT objet, action, origine, jeton_id, compte_id FROM historique WHERE fiche_id = ? ORDER BY id').all(ficheId) as Any[];
const nbHist = (w: Awaited<ReturnType<typeof monde>>) => (w.app.db.prepare('SELECT COUNT(*) n FROM historique').get() as Any).n as number;

test('jeton ecriture, MJ du système : huit outils ; créer, écrire une section avec son empreinte, supprimer — origine mcp et jeton', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), TOUS);
    assert.equal(TOUS.length, 8);
    const cree = await w.appelOutil(c, 'systeme_creer_fiche', { type: 'objet', titre: 'Bouclier' });
    assert.equal(cree.erreur, false, cree.t);
    const fid = cree.d.id as number;
    const espaceDe = (i: number) => (w.app.db.prepare('SELECT univers_id u FROM fiches WHERE id = ?').get(i) as Any).u;
    assert.equal(espaceDe(fid), espaceDe(w.elem), 'created in the system space');
    assert.notEqual(espaceDe(fid), w.lame.id);
    const lu = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(fid) });
    assert.equal(lu.erreur, false, lu.t);
    // Sheet with a section: use the seeded element, whose sections we know.
    const ec = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    const sec = ec.d.sections.find((s: Any) => s.titre === 'Description');
    const w1 = await w.appelOutil(c, 'systeme_ecrire_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: sec.empreinte, contenu: 'Nouvelle lame.' });
    assert.equal(w1.erreur, false, w1.t);
    const lu2 = await w.appelOutil(c, 'systeme_lire_section', { fiche: String(w.elem), sectionId: sec.id });
    assert.match(lu2.d.contenu, /Nouvelle lame/);
    const h = hist(w, w.elem).filter((x) => x.objet === 'section' && x.action === 'modifiee').pop()!;
    assert.equal(h.origine, 'mcp');
    assert.equal(h.jeton_id, k.id);
    assert.equal(h.compte_id, w.compte('antor'));
    const hc = hist(w, fid);
    assert.ok(hc.length > 0 && hc.every((x) => x.origine === 'mcp' && x.jeton_id === k.id), JSON.stringify(hc));
    // Delete the section with its fresh fingerprint, then the sheet.
    const apres = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    const s2 = apres.d.sections.find((s: Any) => s.id === sec.id);
    const ds = await w.appelOutil(c, 'systeme_supprimer_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: s2.empreinte });
    assert.equal(ds.erreur, false, ds.t);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM sections WHERE id = ?').get(sec.id) as Any).n, 0);
    const lf = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(fid) });
    const df = await w.appelOutil(c, 'systeme_supprimer_fiche', { fiche: String(fid), empreinte: lf.d.empreinte });
    assert.equal(df.erreur, false, df.t);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(fid) as Any).n, 0);
    const sup = w.app.db.prepare("SELECT origine, jeton_id FROM historique WHERE fiche_titre = 'Bouclier' AND action = 'supprimee'").all() as Any[];
    assert.ok(sup.length > 0 && sup.every((x) => x.origine === 'mcp' && x.jeton_id === k.id), JSON.stringify(sup));
  } finally { await w.app.close(); }
});

test('empreinte périmée : section_modifiee et rien n’écrit, pour la section, l’en-tête, la suppression de section et de fiche', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    const lu = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    const sec = lu.d.sections.find((s: Any) => s.titre === 'Description');
    const perimee = '0'.repeat(32);
    const avant = nbHist(w);
    const cas: [string, Any][] = [
      ['systeme_ecrire_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: perimee, contenu: 'PIRATE' }],
      ['systeme_supprimer_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: perimee }],
      ['systeme_modifier_entete', { fiche: String(w.elem), empreinte: perimee, titre: 'Pirate' }],
      ['systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: perimee }],
    ];
    for (const [nom, args] of cas) {
      const r = await w.appelOutil(c, nom, args);
      assert.equal(r.erreur, true, nom);
      assert.equal(r.sc?.code, 'section_modifiee', `${nom}: ${r.t}`);
    }
    assert.equal(nbHist(w), avant, 'nothing written');
    assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(w.elem) as Any).titre, 'Épée runique');
    assert.equal((w.app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(sec.id) as Any).contenu, 'Lame claire.');
    // A fingerprint of the wrong shape is refused as input, not written.
    const mal = await w.appelOutil(c, 'systeme_ecrire_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: 'abc', contenu: 'x' });
    assert.equal(mal.erreur, true);
    assert.equal((w.app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(sec.id) as Any).contenu, 'Lame claire.');
    // The right one on the entête works.
    const ok = await w.appelOutil(c, 'systeme_modifier_entete', { fiche: String(w.elem), empreinte: lu.d.empreinteEnTete, titre: 'Épée sacrée' });
    assert.equal(ok.erreur, false, ok.t);
    assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(w.elem) as Any).titre, 'Épée sacrée');
  } finally { await w.app.close(); }
});

test('jeton lecture : écrivains non listés, lecture_seule par nom, rien d’écrit ; personnaliser_fiche aussi pour un jeton lecture d’univers', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { acces: { tous: true, niveauTous: 'lecture' }, systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), [...LECTURES].sort());
    const avant = nbHist(w);
    for (const [nom, args] of [
      ['systeme_creer_fiche', { type: 'objet', titre: 'X' }],
      ['systeme_ecrire_section', { fiche: String(w.elem), sectionId: w.secId('secret'), empreinte: '0'.repeat(32), contenu: 'x' }],
      ['systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: '0'.repeat(32) }],
    ] as const) {
      const r = await w.appelOutil(c, nom, args as never);
      assert.equal(r.sc?.code, 'lecture_seule', nom);
    }
    assert.equal(nbHist(w), avant);
    const toutes = (await c.listTools()).tools.map((t) => t.name);
    assert.ok(!toutes.includes('personnaliser_fiche') || false, 'an ecriture-level tool is not offered at level lecture');
    const p = await w.appelOutil(c, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(p.erreur, true);
  } finally { await w.app.close(); }
});

test('MJ d’univers non MJ du système : trois lectures + personnaliser/revenir ; personnaliser = route (200 la seconde fois) ; revenir détache', async () => {
  const w = await monde();
  try {
    for (const systemes of [[{ id: w.zeta.id, niveau: 'lecture' }], undefined]) {
      const k = await w.jeton('mira', systemes ? { systemes } : {});
      const c = await w.client(w.cleLame, k.valeur);
      const tous = (await c.listTools()).tools.map((t) => t.name);
      assert.ok(tous.includes('personnaliser_fiche') && tous.includes('revenir_au_systeme'), JSON.stringify(tous));
      const sys = await w.noms(c);
      assert.deepEqual(sys, systemes ? [...LECTURES].sort() : [], 'no writer of the system for a GM who is not the system GM');
    }
    const k = await w.jeton('mira', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    const p1 = await w.appelOutil(c, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(p1.erreur, false, p1.t);
    assert.equal(p1.d.creee, true);
    const copie = p1.d.id as number;
    assert.notEqual(copie, w.elem);
    const row = w.app.db.prepare('SELECT univers_id u, surcharge_de s FROM fiches WHERE id = ?').get(copie) as Any;
    assert.deepEqual(row, { u: w.lame.id, s: w.elem });
    const p2 = await w.appelOutil(c, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(p2.d.creee, false);
    assert.equal(p2.d.id, copie);
    // The route says the same: 200 and the same copy.
    const route = await w.appel(w.hs.mira!, 'POST', `/api/univers/${w.lame.id}/fiches/${w.elem}/personnaliser`);
    assert.equal(route.statusCode, 200);
    assert.equal(route.json().id, copie);
    // Origin and token on the creation of the copy.
    assert.ok(hist(w, copie).length > 0 && hist(w, copie).every((x) => x.origine === 'mcp' && x.jeton_id === k.id), JSON.stringify(hist(w, copie)));
    // Revert: the copy goes, the original stays, no right on the system.
    const rv = await w.appelOutil(c, 'revenir_au_systeme', { fiche: String(copie) });
    assert.equal(rv.erreur, false, rv.t);
    assert.equal(rv.d.revenue, true);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(copie) as Any).n, 0);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(w.elem) as Any).n, 1);
    // A GM of the system who is not GM of the universe's… a player cannot customise.
    const kl = await w.jeton('lea', { acces: { tous: true, niveauTous: 'ecriture' } });
    const cl = await w.client(w.cleLame, kl.valeur);
    assert.ok(!(await cl.listTools()).tools.some((t) => t.name === 'personnaliser_fiche'));
    const pl = await w.appelOutil(cl, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(pl.erreur, true);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE surcharge_de = ?').get(w.elem) as Any).n, 0);
  } finally { await w.app.close(); }
});

test('personnaliser_fiche sur une fiche ordinaire de l’univers ou un id inconnu : refus sans événement ni écriture', async () => {
  const w = await monde();
  try {
    const ordinaire = (await w.appel(w.hs.antor!, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: 'Caillou' })).json().id as number;
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    const avant = nbHist(w);
    for (const ref of [String(ordinaire), '999999']) {
      const r = await w.appelOutil(c, 'personnaliser_fiche', { fiche: ref });
      assert.equal(r.erreur, true, ref);
    }
    const r2 = await w.appelOutil(c, 'revenir_au_systeme', { fiche: String(ordinaire) });
    assert.equal(r2.erreur, true);
    assert.equal(nbHist(w), avant);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE surcharge_de IS NOT NULL').get() as Any).n, 0);
  } finally { await w.app.close(); }
});

test('supprimer un élément personnalisé : la copie reste, détachée', async () => {
  const w = await monde();
  try {
    const kU = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, kU.valeur);
    const p = await w.appelOutil(c, 'personnaliser_fiche', { fiche: String(w.elem) });
    const copie = p.d.id as number;
    const lu = await w.appelOutil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    const d = await w.appelOutil(c, 'systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: lu.d.empreinte });
    assert.equal(d.erreur, false, d.t);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(w.elem) as Any).n, 0);
    const row = w.app.db.prepare('SELECT surcharge_de s FROM fiches WHERE id = ?').get(copie) as Any;
    assert.ok(row, 'the copy stays');
    assert.equal(row.s, null);
  } finally { await w.app.close(); }
});

test('assistant : MJ du système crée un élément (origine assistant, événement) ; refus sans événement ; MJ non MJ du système : pas d’écrivain, mais personnaliser', async () => {
  const w = await monde();
  try {
    const cat = (c: string) => catalogueDe(w.app.db, w.compte(c), w.lame.id, { porte: 'assistant', images: IMAGES });
    const nomsSys = (c: string) => cat(c).outils.map((o) => o.nom).filter((n) => n.startsWith('systeme_')).sort();
    assert.deepEqual(nomsSys('antor'), TOUS);
    assert.deepEqual(nomsSys('mira'), [...LECTURES].sort());
    assert.deepEqual(nomsSys('lea'), [...LECTURES].sort());
    const noms = (c: string) => cat(c).outils.map((o) => o.nom);
    assert.ok(noms('mira').includes('personnaliser_fiche') && noms('mira').includes('revenir_au_systeme'));
    assert.ok(!noms('lea').includes('personnaliser_fiche'));
    const creer = cat('antor').outils.find((o) => o.nom === 'systeme_creer_fiche')!;
    const r = creer.executer({ type: 'objet', titre: 'Heaume' }) as Any;
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.evenement?.type, 'fiche_creee');
    const h = hist(w, r.donnees.id);
    assert.ok(h.length > 0 && h.every((x) => x.origine === 'assistant' && x.jeton_id === null), JSON.stringify(h));
    const avant = nbHist(w);
    const sup = cat('antor').outils.find((o) => o.nom === 'systeme_supprimer_fiche')!;
    const ref = sup.executer({ fiche: String(w.elem), empreinte: '0'.repeat(32) }) as Any;
    assert.equal(ref.ok, false);
    assert.equal(ref.evenement, undefined);
    assert.equal(nbHist(w), avant);
    const inc = creer.executer({ type: 'compte_rendu', titre: 'x' }) as Any;
    assert.equal(inc.ok, false);
    assert.equal(inc.evenement, undefined);
    const sup2 = cat('antor').outils.find((o) => o.nom === 'systeme_supprimer_fiche')!;
    const lu = (cat('antor').outils.find((o) => o.nom === 'systeme_lire_fiche')!.executer({ fiche: String(r.donnees.id) }) as Any).donnees;
    const ok = sup2.executer({ fiche: String(r.donnees.id), empreinte: lu.empreinte }) as Any;
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.evenement.type, 'fiche_supprimee');
  } finally { await w.app.close(); }
});

test('un MJ du système perd son droit entre deux requêtes : les écrivains disparaissent et l’appel n’écrit pas', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), TOUS);
    const r = await w.appel(w.hs.admin!, 'GET', `/api/instance/systemes/${w.zeta.id}/membres`);
    const m = (r.json() as Any[]).find((x) => x.username === 'antor');
    if (m) await w.appel(w.hs.admin!, 'DELETE', `/api/instance/systemes/${w.zeta.id}/membres/${m.compteId ?? m.id}`);
    const c2 = await w.client(w.cleLame, k.valeur);
    const apres = await w.noms(c2);
    assert.ok(!apres.includes('systeme_creer_fiche'), JSON.stringify(apres));
    const avant = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n;
    const x = await w.appelOutil(c2, 'systeme_creer_fiche', { type: 'objet', titre: 'Fraude' });
    assert.equal(x.erreur, true);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n, avant);
  } finally { await w.app.close(); }
});
