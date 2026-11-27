import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton, listerJetons } = await import('../services/jetons.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');
const { trouverCompte } = await import('../services/comptes.js');

const G = 'swn/galaxie';
const INVALIDE = { message: 'Jeton invalide.', code: 'jeton_invalide' };

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = await connecter(app, 'antor');
  const id = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as { id: number }).id;
  const acces = { tous: false, univers: [{ universId: E, niveau: 'ecriture' }] };
  const tok = (corps: Record<string, unknown>) =>
    creerJeton(app.db, id, { nom: 'T', dureeJours: 30, acces, ...corps } as never, app.horloge()).valeur;
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as never });
  const mcp = (valeur: string) => app.inject({ method: 'POST', url: '/mcp',
    headers: { authorization: `Bearer ${valeur}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  return { app, antor, id, E, acces, tok, req, mcp };
}

type Etat = 200 | 201 | 401 | 404;
const MATRICE: { nom: string; corps: Record<string, unknown>; attendu: Record<string, number> }[] = [
  { nom: 'contenu seul', corps: { contenu: true },
    attendu: { contenu: 200, outil: 401, lotSans: 201, lotAvec: 401, mcp: 200 } },
  { nom: 'outils seuls', corps: { contenu: false, outils: [G] },
    attendu: { contenu: 401, outil: 200, lotSans: 401, lotAvec: 201, mcp: 401 } },
  { nom: 'les deux', corps: { contenu: true, outils: [G] },
    attendu: { contenu: 200, outil: 200, lotSans: 201, lotAvec: 201, mcp: 200 } },
  { nom: 'ancien corps sans outils', corps: {},
    attendu: { contenu: 200, outil: 401, lotSans: 201, lotAvec: 401, mcp: 200 } },
  { nom: 'ancien corps outils seuls', corps: { outils: [G] },
    attendu: { contenu: 401, outil: 200, lotSans: 401, lotAvec: 201, mcp: 401 } },
];

for (const { nom, corps, attendu } of MATRICE) {
  test(`matrice de gardes : jeton ${nom}`, async () => {
    const w = await monde();
    try {
      const v = w.tok(corps);
      const lire = async (p: Promise<{ statusCode: number; json(): unknown }>, att: number, lib: string) => {
        const r = await p;
        assert.equal(r.statusCode, att, `${nom} / ${lib}`);
        if (att === 401) assert.deepEqual(r.json(), INVALIDE, `${nom} / ${lib}`);
      };
      await lire(w.req(v, 'GET', ''), attendu.contenu!, 'route de contenu');
      await lire(w.req(v, 'GET', '/outils/swn/galaxie/galaxies'), attendu.outil === 200 ? 200 : 401, 'route d’outil');
      await lire(w.req(v, 'POST', '/lots'), attendu.lotSans!, 'lot sans ?outil=');
      await lire(w.req(v, 'POST', `/lots?outil=${G}`), attendu.lotAvec!, 'lot ?outil=');
      await lire(w.mcp(v), attendu.mcp!, '/mcp');
    } finally { await w.app.close(); }
  });
}

test('un lot est lisible par tout jeton, quelle que soit sa permission', async () => {
  const w = await monde();
  try {
    const t = w.tok({ contenu: false, outils: [G] });
    const lot = (await w.req(t, 'POST', `/lots?outil=${G}`)).json().lotId;
    assert.equal((await w.req(t, 'GET', `/lots/${lot}`)).statusCode, 200);
  } finally { await w.app.close(); }
});

test('création : aucune permission = invalide permissions, rien créé', async () => {
  const w = await monde();
  try {
    const avant = (w.app.db.prepare('SELECT COUNT(*) n FROM jetons_api').get() as { n: number }).n;
    for (const extra of [{ contenu: false }, { contenu: false, outils: [] }, { outils: [] }]) {
      const r = await w.app.inject({ method: 'POST', url: '/api/compte/jetons', headers: w.antor,
        payload: { nom: 'T', dureeJours: 30, acces: w.acces, ...extra } });
      assert.equal(r.statusCode, 400, JSON.stringify(extra) + r.body);
      assert.equal(r.json().code, 'invalide');
      assert.equal(r.json().champ, 'permissions', JSON.stringify(extra) + r.body);
    }
    const r = await w.app.inject({ method: 'POST', url: '/api/compte/jetons', headers: w.antor,
      payload: { nom: 'T', dureeJours: 30, acces: w.acces, contenu: 'oui' } });
    assert.equal(r.statusCode, 400);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM jetons_api').get() as { n: number }).n, avant);
  } finally { await w.app.close(); }
});

test('GET /api/compte/jetons rend contenu et outils de chaque jeton', async () => {
  const w = await monde();
  try {
    for (const corps of [{ contenu: true }, { contenu: false, outils: [G] }, { contenu: true, outils: [G] }]) {
      const r = await w.app.inject({ method: 'POST', url: '/api/compte/jetons', headers: w.antor,
        payload: { nom: JSON.stringify(corps), dureeJours: 30, acces: w.acces, ...corps } });
      assert.equal(r.statusCode, 201, r.body);
    }
    const l = (await w.app.inject({ method: 'GET', url: '/api/compte/jetons', headers: w.antor })).json() as { jetons?: any[] } | any[];
    const liste = (Array.isArray(l) ? l : l.jetons!) as { nom: string; contenu: boolean; outils: string[] }[];
    for (const j of liste.filter((x) => x.nom.startsWith('{'))) {
      const att = JSON.parse(j.nom);
      assert.equal(j.contenu, att.contenu);
      assert.deepEqual(j.outils, att.outils ?? []);
    }
    assert.equal(liste.filter((x) => x.nom.startsWith('{')).length, 3);
    void listerJetons;
  } finally { await w.app.close(); }
});

test('sortie : un seul jeton contenu + swn/galaxie importe une galaxie (lot outil) et écrit une fiche (lot sans outil)', async () => {
  const w = await monde();
  try {
    const t = w.tok({ contenu: true, outils: [G] });
    const lotOutil = (await w.req(t, 'POST', `/lots?outil=${G}`)).json().lotId as number;
    const lotFiche = (await w.req(t, 'POST', '/lots')).json().lotId as number;
    assert.notEqual(lotOutil, lotFiche);
    const gal = creerGalaxie(w.app.db, w.id, w.E, { titre: 'Galaxie du bord' }).id;
    const g = await w.req(t, 'PUT', `/outils/swn/galaxie/galaxies/${gal}?lot=${lotOutil}`, { systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }] });
    assert.equal(g.statusCode, 200, g.body);
    assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(gal, 'vael') as { n: number }).n, 1);
    const f = await w.req(t, 'PUT', `/fiches/pnj-un?lot=${lotFiche}`, { titre: 'Un PNJ', type: 'personnage' });
    assert.ok([200, 201].includes(f.statusCode), f.body);
    assert.equal((w.app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE titre = 'Un PNJ'").get() as { n: number }).n, 1);
    // chaque lot garde sa nature : la fiche ne passe pas dans le lot d'outil refusé pour un jeton sans contenu
  } finally { await w.app.close(); }
});
