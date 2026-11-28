// Les éléments du système de l'univers par la porte MCP et l'assistant (B-118, P-28 volet agent), écrit depuis le critère de sortie
// amendé de la fiche `kanevas-systemes-jeu-mcp-assistant` et de docs/parcours.md, sans lire le code des outils.
// Les attendus sont des littéraux du besoin. Aucun écran : la porte MCP et le catalogue de l'assistant sont le point d'entrée.
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
type Cli = InstanceType<typeof Client>;

const LECTURES = ['systeme_chercher', 'systeme_lire_fiche', 'systeme_lire_section'];
const HUIT = [
  'systeme_chercher', 'systeme_creer_fiche', 'systeme_ecrire_section', 'systeme_lire_fiche', 'systeme_lire_section',
  'systeme_modifier_entete', 'systeme_supprimer_fiche', 'systeme_supprimer_section',
];
const IMAGES = { nom: 'aucun' } as never;

// antor : MJ de Lame et MJ du système Zeta (nommé par l'admin) ; mira : MJ de Lame, pas de Zeta ; lea : joueuse de Lame ;
// teo : aucun rôle ; Nue : univers rattaché à un autre système, Omega.
async function monde() {
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const hs: Record<string, H> = {};
  for (const c of ['antor', 'lea', 'mira', 'teo', 'admin']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    hs[c] = { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  }
  const appel = (h: H, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...h, ...headers }, payload });
  const compte = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const lame = (await appel(hs.antor!, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const nue = (await appel(hs.antor!, 'POST', '/api/univers', { nom: 'Nue' })).json();
  const zeta = (await appel(hs.antor!, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  const omega = (await appel(hs.antor!, 'POST', `/api/univers/${nue.id}/systeme-nouveau`, { nom: 'Omega' })).json();
  for (const [c, r] of [['lea', 'joueur'], ['mira', 'mj']] as const) {
    app.db.prepare('INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, ?)').run(lame.id, compte(c), r);
  }
  for (const s of [zeta, omega]) assert.equal((await appel(hs.admin!, 'POST', `/api/instance/systemes/${s.id}/membres`, { username: 'antor' })).statusCode, 201);
  const cleLame = (app.db.prepare('SELECT cle FROM univers WHERE id = ?').get(lame.id) as Any).cle as string;
  const jeton = async (c: string, extra: object = {}) => {
    const r = await appel(hs[c]!, 'POST', '/api/compte/jetons', { nom: 'k', dureeJours: 30, acces: { tous: true, niveauTous: 'ecriture' }, ...extra });
    assert.equal(r.statusCode, 201, r.body);
    return { valeur: (r.json().valeur ?? r.json().jeton.valeur) as string, id: (r.json().id ?? r.json().jeton.id) as number };
  };
  const client = async (cle: string, valeur: string) => {
    const c = new Client({ name: 't', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${cle}`), { requestInit: { headers: { authorization: `Bearer ${valeur}` } } }));
    return c;
  };
  const tous = async (c: Cli) => (await c.listTools()).tools.map((t) => t.name).sort();
  const noms = async (c: Cli) => (await tous(c)).filter((n) => n.startsWith('systeme_'));
  const outil = async (c: Cli, name: string, args: Record<string, unknown>) => {
    const r = await c.callTool({ name, arguments: args });
    const t = (r.content as { text: string }[])[0]!.text;
    return { erreur: r.isError === true, t, code: (r.structuredContent as { code?: string } | undefined)?.code, d: r.isError ? null : JSON.parse(t) };
  };
  const creerElement = async (systeme: number, titre: string) => {
    const k = await jeton('antor', { systemes: [{ id: systeme, niveau: 'ecriture' }] });
    const r = await app.inject({ method: 'POST', url: `/api/v1/systemes/${systeme}/fiches`, headers: { authorization: `Bearer ${k.valeur}` },
      payload: { type: 'objet', titre, sections: [{ cle: 'description', titre: 'Description', contenu: 'Lame claire.', joueursLisent: true }] } });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().id as number;
  };
  const elem = await creerElement(zeta.id, 'Épée runique');
  const elem2 = await creerElement(zeta.id, 'Hache');
  const elemOmega = await creerElement(omega.id, 'Relique d’Omega');
  const nbFiches = () => (app.db.prepare('SELECT COUNT(*) n FROM fiches').get() as Any).n as number;
  const nbHist = () => (app.db.prepare('SELECT COUNT(*) n FROM historique').get() as Any).n as number;
  const ligne = (id: number) => app.db.prepare('SELECT univers_id u, surcharge_de s, type, titre FROM fiches WHERE id = ?').get(id) as Any | undefined;
  return { app, hs, appel, compte, lame, nue, zeta, omega, cleLame, jeton, client, tous, noms, outil, elem, elem2, elemOmega, nbFiches, nbHist, ligne };
}

test('B-118 nominal : jeton ecriture d’un MJ du système liste les huit systeme_* et crée un élément, visible à l’API du système, origine mcp', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), HUIT);
    const r = await w.outil(c, 'systeme_creer_fiche', { type: 'objet', titre: 'Pistolet laser' });
    assert.equal(r.erreur, false, r.t);
    const liste = await w.app.inject({ method: 'GET', url: `/api/v1/systemes/${w.zeta.id}/fiches`, headers: { authorization: `Bearer ${k.valeur}` } });
    assert.equal(liste.statusCode, 200);
    assert.ok(JSON.stringify(liste.json()).includes('Pistolet laser'), 'the element is in the system');
    assert.equal(w.ligne(r.d.id)!.u, w.ligne(w.elem)!.u, 'same space as the other system elements');
    const h = w.app.db.prepare("SELECT origine, jeton_id, compte_id FROM historique WHERE fiche_titre = 'Pistolet laser'").all() as Any[];
    assert.ok(h.length > 0);
    for (const x of h) assert.deepEqual(x, { origine: 'mcp', jeton_id: k.id, compte_id: w.compte('antor') });
  } finally { await w.app.close(); }
});

test('B-118 écriture complète : modifier l’en-tête et une section avec l’empreinte lue, puis supprimer — l’empreinte fausse n’écrit rien', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    const lu = await w.outil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    const sec = lu.d.sections[0];
    const avant = w.nbHist();
    const mauvais = await w.outil(c, 'systeme_ecrire_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: '0'.repeat(32), contenu: 'PIRATE' });
    assert.equal(mauvais.erreur, true);
    assert.equal(mauvais.code, 'section_modifiee');
    assert.equal(w.nbHist(), avant);
    const bon = await w.outil(c, 'systeme_ecrire_section', { fiche: String(w.elem), sectionId: sec.id, empreinte: sec.empreinte, contenu: 'Lame sombre.' });
    assert.equal(bon.erreur, false, bon.t);
    assert.equal((w.app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(sec.id) as Any).contenu, 'Lame sombre.');
    const ent = await w.outil(c, 'systeme_modifier_entete', { fiche: String(w.elem), empreinte: lu.d.empreinteEnTete, titre: 'Épée noire' });
    assert.equal(ent.erreur, false, ent.t);
    assert.equal(w.ligne(w.elem)!.titre, 'Épée noire');
    const relu = await w.outil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    const sup = await w.outil(c, 'systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: relu.d.empreinte });
    assert.equal(sup.erreur, false, sup.t);
    assert.equal(w.ligne(w.elem), undefined);
  } finally { await w.app.close(); }
});

test('B-118 jeton lecture : seulement les trois lectures ; un écrivain appelé par nom répond lecture_seule et n’écrit rien', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), LECTURES);
    const lu = await w.outil(c, 'systeme_lire_fiche', { fiche: String(w.elem) });
    assert.equal(lu.d.titre, 'Épée runique');
    const f = w.nbFiches(), h = w.nbHist();
    for (const [nom, args] of [
      ['systeme_creer_fiche', { type: 'objet', titre: 'X' }],
      ['systeme_supprimer_fiche', { fiche: String(w.elem), empreinte: lu.d.empreinte }],
      ['systeme_modifier_entete', { fiche: String(w.elem), empreinte: lu.d.empreinteEnTete, titre: 'Y' }],
    ] as const) {
      const r = await w.outil(c, nom, args as never);
      assert.equal(r.erreur, true, nom);
      assert.equal(r.code, 'lecture_seule', nom);
    }
    assert.equal(w.nbFiches(), f);
    assert.equal(w.nbHist(), h);
  } finally { await w.app.close(); }
});

test('B-118 jeton sans ligne dans jetons_systemes : aucun systeme_* listé, l’appel par nom est introuvable (pas lecture_seule)', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor');
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), []);
    const f = w.nbFiches();
    for (const [nom, args] of [['systeme_lire_fiche', { fiche: String(w.elem) }], ['systeme_chercher', { mots: 'Épée' }], ['systeme_creer_fiche', { type: 'objet', titre: 'Z' }]] as const) {
      const r = await w.outil(c, nom, args as never);
      assert.equal(r.erreur, true, nom);
      assert.equal(r.code, undefined, nom);
      assert.match(r.t, /Introuvable/, nom);
    }
    assert.equal(w.nbFiches(), f);
  } finally { await w.app.close(); }
});

test('B-118 compte non MJ du système : même un jeton lisant le système ne voit que les lectures, et l’écriture par nom est refusée', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('mira', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), LECTURES);
    const f = w.nbFiches();
    const r = await w.outil(c, 'systeme_creer_fiche', { type: 'objet', titre: 'Intrus' });
    assert.equal(r.erreur, true);
    assert.equal(w.nbFiches(), f);
  } finally { await w.app.close(); }
});

test('B-118 aucun outil ne prend d’identifiant de système ; un systemeId passé quand même n’écrit pas dans un autre système', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    for (const t of (await c.listTools()).tools.filter((x) => x.name.startsWith('systeme_') || x.name === 'personnaliser_fiche' || x.name === 'revenir_au_systeme')) {
      const cles = Object.keys((t.inputSchema as Any).properties ?? {});
      assert.ok(cles.length > 0, t.name);
      assert.deepEqual(cles.filter((x) => /syst/i.test(x)), [], t.name);
    }
    const avant = (w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(w.ligne(w.elemOmega)!.u) as Any).n;
    await w.outil(c, 'systeme_creer_fiche', { type: 'objet', titre: 'Détourné', systemeId: w.omega.id, systeme: w.omega.id }).catch(() => undefined);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(w.ligne(w.elemOmega)!.u) as Any).n, avant, 'Omega untouched');
  } finally { await w.app.close(); }
});

test('B-118 système fermé sur celui de l’univers : un élément d’Omega est introuvable par la porte de Lame, même avec un jeton ecriture', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }, { id: w.omega.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    const r = await w.outil(c, 'systeme_lire_fiche', { fiche: String(w.elemOmega) });
    assert.equal(r.erreur, true);
    assert.match(r.t, /Introuvable/);
    const ch = await w.outil(c, 'systeme_chercher', { mots: 'Relique' });
    assert.ok(!JSON.stringify(ch.d ?? ch.t).includes('Relique'), 'search does not leak Omega');
    const m = await w.outil(c, 'systeme_supprimer_fiche', { fiche: String(w.elemOmega), empreinte: '0'.repeat(32) });
    assert.equal(m.erreur, true);
    assert.ok(w.ligne(w.elemOmega));
  } finally { await w.app.close(); }
});

test('B-118 MJ d’univers non MJ du système : personnaliser_fiche et revenir_au_systeme listés avec ou sans ligne dans jetons_systemes', async () => {
  const w = await monde();
  try {
    const avecLigne = await w.client(w.cleLame, (await w.jeton('mira', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] })).valeur);
    const sansLigne = await w.client(w.cleLame, (await w.jeton('mira')).valeur);
    for (const c of [avecLigne, sansLigne]) {
      const t = await w.tous(c);
      assert.ok(t.includes('personnaliser_fiche') && t.includes('revenir_au_systeme'), JSON.stringify(t));
    }
    assert.deepEqual(await w.noms(avecLigne), LECTURES);
    assert.deepEqual(await w.noms(sansLigne), []);
  } finally { await w.app.close(); }
});

test('B-118 personnaliser_fiche / revenir_au_systeme par le MCP : même résultat que les routes, sans être MJ du système', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('mira');
    const c = await w.client(w.cleLame, k.valeur);
    // Le geste par la route, sur l'élément 2.
    const route = await w.appel(w.hs.mira!, 'POST', `/api/univers/${w.lame.id}/fiches/${w.elem2}/personnaliser`);
    assert.equal(route.statusCode, 201, route.body);
    // Le même geste par le MCP, sur l'élément 1.
    const p = await w.outil(c, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(p.erreur, false, p.t);
    assert.equal(p.d.creee, true);
    assert.deepEqual(w.ligne(p.d.id), { u: w.lame.id, s: w.elem, type: 'objet', titre: 'Épée runique' });
    assert.deepEqual(w.ligne(route.json().id), { u: w.lame.id, s: w.elem2, type: 'objet', titre: 'Hache' });
    const sec = (id: number) => (w.app.db.prepare('SELECT COUNT(*) n FROM sections WHERE fiche_id = ?').get(id) as Any).n;
    assert.equal(sec(p.d.id), sec(route.json().id), 'same sections in the copy');
    const h = w.app.db.prepare('SELECT origine, jeton_id FROM historique WHERE fiche_id = ?').all(p.d.id) as Any[];
    assert.ok(h.length > 0);
    for (const x of h) assert.deepEqual(x, { origine: 'mcp', jeton_id: k.id });
    // Seconde fois : la même copie, pas de doublon.
    const p2 = await w.outil(c, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(p2.d.id, p.d.id);
    assert.equal(p2.d.creee, false);
    // Revenir : la copie part, l'original reste ; la route fait de même pour l'élément 2.
    const rv = await w.outil(c, 'revenir_au_systeme', { fiche: String(p.d.id) });
    assert.equal(rv.erreur, false, rv.t);
    assert.equal(w.ligne(p.d.id), undefined);
    assert.ok(w.ligne(w.elem));
    const rr = await w.appel(w.hs.mira!, 'DELETE', `/api/univers/${w.lame.id}/fiches/${w.elem2}/personnalisation`);
    assert.equal(rr.statusCode, 204);
    assert.equal(w.ligne(route.json().id), undefined);
    assert.ok(w.ligne(w.elem2));
  } finally { await w.app.close(); }
});

test('B-118 exclusions : une joueuse ne personnalise pas (ni listé, ni par nom) ; personnaliser une fiche ordinaire ou inconnue n’écrit rien', async () => {
  const w = await monde();
  try {
    const cl = await w.client(w.cleLame, (await w.jeton('lea', { systemes: [{ id: w.zeta.id, niveau: 'lecture' }] })).valeur);
    const t = await w.tous(cl);
    assert.ok(!t.includes('personnaliser_fiche') && !t.includes('revenir_au_systeme'), JSON.stringify(t));
    const p = await w.outil(cl, 'personnaliser_fiche', { fiche: String(w.elem) });
    assert.equal(p.erreur, true);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE surcharge_de IS NOT NULL').get() as Any).n, 0);
    const ordinaire = (await w.appel(w.hs.antor!, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: 'Caillou' })).json().id as number;
    const cm = await w.client(w.cleLame, (await w.jeton('mira')).valeur);
    const h = w.nbHist();
    for (const ref of [String(ordinaire), '999999']) assert.equal((await w.outil(cm, 'personnaliser_fiche', { fiche: ref })).erreur, true, ref);
    assert.equal(w.nbHist(), h);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE surcharge_de IS NOT NULL').get() as Any).n, 0);
  } finally { await w.app.close(); }
});

test('B-118 droits relus à chaque appel : le MJ retiré du système perd les écrivains, et l’appel par nom n’écrit pas', async () => {
  const w = await monde();
  try {
    const k = await w.jeton('antor', { systemes: [{ id: w.zeta.id, niveau: 'ecriture' }] });
    const c = await w.client(w.cleLame, k.valeur);
    assert.deepEqual(await w.noms(c), HUIT);
    const m = ((await w.appel(w.hs.admin!, 'GET', `/api/instance/systemes/${w.zeta.id}/membres`)).json() as Any[]).find((x) => x.username === 'antor')!;
    const d = await w.appel(w.hs.admin!, 'DELETE', `/api/instance/systemes/${w.zeta.id}/membres/${m.compteId ?? m.id}`);
    assert.ok(d.statusCode < 300, d.body);
    assert.deepEqual(await w.noms(c), LECTURES);
    const f = w.nbFiches();
    const r = await w.outil(c, 'systeme_creer_fiche', { type: 'objet', titre: 'Fraude' });
    assert.equal(r.erreur, true);
    assert.equal(w.nbFiches(), f);
  } finally { await w.app.close(); }
});

test('B-118 assistant : MJ du système huit outils, MJ d’univers non MJ trois lectures + personnaliser/revenir, joueur trois lectures seules, sans rôle introuvable', async () => {
  const w = await monde();
  try {
    const cat = (c: string, u = w.lame.id) => catalogueDe(w.app.db, w.compte(c), u, { porte: 'assistant', images: IMAGES });
    const sys = (c: string) => cat(c).outils.map((o) => o.nom).filter((n) => n.startsWith('systeme_')).sort();
    const tous = (c: string) => cat(c).outils.map((o) => o.nom);
    assert.deepEqual(sys('antor'), HUIT);
    assert.deepEqual(sys('mira'), LECTURES);
    assert.deepEqual(sys('lea'), LECTURES);
    for (const n of ['personnaliser_fiche', 'revenir_au_systeme']) {
      assert.ok(tous('mira').includes(n), `mira ${n}`);
      assert.ok(tous('antor').includes(n), `antor ${n}`);
      assert.ok(!tous('lea').includes(n), `lea ${n}`);
    }
    assert.throws(() => cat('teo'), (e: Any) => e.code === 'introuvable');
  } finally { await w.app.close(); }
});

test('B-118 assistant : le MJ du système crée un élément (origine assistant, événement) ; le MJ d’univers personnalise et revient ; un refus n’émet aucun événement', async () => {
  const w = await monde();
  try {
    const cat = (c: string) => catalogueDe(w.app.db, w.compte(c), w.lame.id, { porte: 'assistant', images: IMAGES });
    const o = (c: string, n: string) => cat(c).outils.find((x) => x.nom === n)!;
    const r = o('antor', 'systeme_creer_fiche').executer({ type: 'objet', titre: 'Heaume' }) as Any;
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.evenement?.type, 'fiche_creee');
    const h = w.app.db.prepare('SELECT origine, jeton_id FROM historique WHERE fiche_id = ?').all(r.donnees.id) as Any[];
    assert.ok(h.length > 0);
    for (const x of h) assert.deepEqual(x, { origine: 'assistant', jeton_id: null });
    const avant = w.nbHist();
    const refus = o('antor', 'systeme_supprimer_fiche').executer({ fiche: String(w.elem), empreinte: '0'.repeat(32) }) as Any;
    assert.equal(refus.ok, false);
    assert.equal(refus.evenement, undefined);
    assert.equal(w.nbHist(), avant);
    const p = o('mira', 'personnaliser_fiche').executer({ fiche: String(w.elem) }) as Any;
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.ok(p.evenement, 'a successful write carries an event');
    assert.deepEqual(w.ligne(p.donnees.id), { u: w.lame.id, s: w.elem, type: 'objet', titre: 'Épée runique' });
    const rv = o('mira', 'revenir_au_systeme').executer({ fiche: String(p.donnees.id) }) as Any;
    assert.equal(rv.ok, true, JSON.stringify(rv));
    assert.equal(w.ligne(p.donnees.id), undefined);
    assert.ok(w.ligne(w.elem));
  } finally { await w.app.close(); }
});

test('B-118 les outils systeme_* ne portent pas de SQL (lecture de source)', () => {
  const src = readFileSync(new URL('../services/assistant/outils-systeme.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/);
  assert.doesNotMatch(src, /\.prepare\(|better-sqlite3|jetons_systemes/);
});
