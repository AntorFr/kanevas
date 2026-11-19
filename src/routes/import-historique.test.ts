// Historique par jeton (B-96, B-102, AD-149, AD-147): lecture par un jeton de MJ, écritures d'import
// qui portent le compte et le nom du jeton, droits (joueur 403, révoqué 401, hors accès 404).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { ajouterMembreNoyau } = await import('../services/membres.js');
const { cleDeUnivers } = await import('../services/cles.js');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  await connecter(app, 'lea');
  const u = (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'Alpha' } })).json() as { id: number };
  const v = (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'Beta' } })).json() as { id: number };
  ajouterMembreNoyau(app.db, u.id, 'lea', 'joueur');
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const bearer = (valeur: string) => ({ authorization: `Bearer ${valeur}` });
  const jeton = (nom: string, niveau: 'lecture' | 'ecriture', compte = 'antor', univers = u.id) =>
    creerJeton(app.db, id(compte), { nom, dureeJours: 30, acces: { tous: false, univers: [{ universId: univers, niveau }] } } as never, app.horloge());
  const cle = cleDeUnivers(app.db, u.id)!;
  const put = (valeur: string, base: string, suite: string, payload: object) =>
    app.inject({ method: 'PUT', url: `${base}${suite}`, headers: bearer(valeur), payload });
  return { app, antor, u, v, id, bearer, jeton, cle, put };
}
const BASES = (u: string | number) => [`/api/v1/univers/${u}`, `/api/import/v1/univers/${u}`];
const corps = (t: string) => ({ type: 'personnage', titre: 'Zed', sections: [{ cle: 's:h', titre: 'Histoire', contenu: t }] });

test('PUT fiche et PUT fichier par un jeton MJ : lignes avec compte, nom du jeton, origine import et lot ; filtres et curseur', async () => {
  const w = await monter();
  const ecr = w.jeton('Foundry', 'ecriture');
  const lec = w.jeton('Lecteur', 'lecture');
  const lot = (await w.app.inject({ method: 'POST', url: `/api/v1/univers/${w.cle}/lots`, headers: w.bearer(ecr.valeur) })).json() as { lotId: number };
  assert.ok(lot.lotId);
  assert.equal((await w.put(ecr.valeur, BASES(w.cle)[0]!, `/fiches/f:zed?lot=${lot.lotId}`, corps('v1'))).statusCode, 200);
  assert.equal((await w.put(ecr.valeur, BASES(w.cle)[1]!, `/fiches/f:zed?lot=${lot.lotId}`, corps('v2'))).statusCode, 200);

  const B = 'XB';
  const payload = Buffer.concat([
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="nom"\r\n\r\nimg.png\r\n`),
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    PNG, Buffer.from(`\r\n--${B}--\r\n`)]);
  const pf = await w.app.inject({ method: 'PUT', url: `${BASES(w.cle)[0]}/fichiers/i:img?lot=${lot.lotId}`,
    headers: { ...w.bearer(ecr.valeur), 'content-type': `multipart/form-data; boundary=${B}` }, payload });
  assert.equal(pf.statusCode, 200, pf.body);

  for (const jt of [ecr, lec]) for (const base of BASES(w.cle)) {
    const r = await w.app.inject({ method: 'GET', url: `${base}/historique?jeton=Foundry`, headers: w.bearer(jt.valeur) });
    assert.equal(r.statusCode, 200, r.body);
    const { lignes } = r.json() as { lignes: any[] };
    assert.ok(lignes.length >= 3, JSON.stringify(lignes));
    for (const l of lignes) {
      assert.equal(l.jeton.nom, 'Foundry');
      assert.equal(l.jeton.id, ecr.jeton.id);
      assert.equal(l.compte.id, w.id('antor'));
      assert.equal(l.origine, 'import');
      assert.equal(l.lotId, lot.lotId);
    }
    assert.ok(lignes.some((l) => l.objet === 'fiche' && l.action === 'creee'));
    assert.ok(lignes.some((l) => l.objet === 'section' && l.action === 'modifiee'));
  }
  const get = async (q: string) => {
    const r = await w.app.inject({ method: 'GET', url: `${BASES(w.cle)[0]}/historique${q}`, headers: w.bearer(lec.valeur) });
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as { lignes: any[]; curseur: string | null };
  };
  assert.equal((await get('?jeton=Inconnu')).lignes.length, 0);
  const cre = (await get('?action=creee')).lignes;
  assert.ok(cre.length >= 1 && cre.every((l) => l.action === 'creee'));
  const mod = (await get('?action=modifiee')).lignes;
  assert.ok(mod.length >= 1 && mod.every((l) => l.action === 'modifiee'));
  assert.equal((await get('?depuis=2999-01-01T00:00:00Z')).lignes.length, 0);
  const tout = (await get('?depuis=2000-01-01T00:00:00Z')).lignes;
  assert.ok(tout.length >= 3);
  assert.equal((await get(`?compte=${w.id('antor')}`)).lignes.length, tout.length);
  // Curseur : `apres` rend les lignes strictement plus anciennes.
  const ids = tout.map((l) => l.id);
  const suite = (await get(`?apres=${ids[0]}`)).lignes.map((l) => l.id);
  assert.deepEqual(suite, ids.slice(1));
  assert.deepEqual((await get(`?apres=${ids[ids.length - 1]}`)).lignes, []);
  // Entrées fausses.
  for (const q of ['?action=nimporte', '?depuis=pasunedate', '?apres=abc', '?jeton=', '?fiche=&compte=1', '?compte=x']) {
    const r = await w.app.inject({ method: 'GET', url: `${BASES(w.cle)[0]}/historique${q}`, headers: w.bearer(lec.valeur) });
    assert.equal(r.statusCode, 400, `${q}: ${r.body}`);
  }
  // Filtre fiche par clé.
  const parFiche = (await get('?fiche=f:zed')).lignes;
  assert.ok(parFiche.length >= 2 && parFiche.every((l) => l.ficheCle === 'f:zed' || l.ficheId !== null));
  // Visible dans la liste de session du MJ, avec le nom du jeton.
  const s = await w.app.inject({ method: 'GET', url: `/api/univers/${w.u.id}/historique?jeton=Foundry`, headers: w.antor });
  assert.equal(s.statusCode, 200, s.body);
  assert.ok(s.json().lignes.length >= 3);
  assert.ok(s.json().lignes.every((l: any) => l.jeton.nom === 'Foundry' && l.origine === 'import'));
});

test('suppression par import : la ligne porte le jeton ; relations aussi', async () => {
  const w = await monter();
  const ecr = w.jeton('Sup', 'ecriture');
  const base = BASES(w.cle)[0]!;
  await w.put(ecr.valeur, base, '/fiches/f:a', { type: 'personnage', titre: 'A' });
  await w.put(ecr.valeur, base, '/fiches/f:b', { type: 'personnage', titre: 'B' });
  const rel = await w.app.inject({ method: 'GET', url: `${base}`, headers: w.bearer(ecr.valeur) });
  assert.equal(rel.statusCode, 200);
  const del = await w.app.inject({ method: 'DELETE', url: `${base}/fiches/f:b`, headers: w.bearer(ecr.valeur) });
  assert.ok(del.statusCode < 300, del.body);
  const r = await w.app.inject({ method: 'GET', url: `${base}/historique?action=supprimee`, headers: w.bearer(ecr.valeur) });
  const { lignes } = r.json() as { lignes: any[] };
  assert.ok(lignes.length >= 1);
  assert.ok(lignes.every((l) => l.jeton?.nom === 'Sup' && l.compte?.id === w.id('antor') && l.origine === 'import'));
});

test('droits : jeton de joueur 403, révoqué 401 jeton_invalide, sans jeton 401, univers hors accès 404, cookie ignoré', async () => {
  const w = await monter();
  const joueur = w.jeton('J', 'ecriture', 'lea');
  const jl = w.jeton('JL', 'lecture', 'lea');
  for (const base of BASES(w.cle)) {
    for (const j of [joueur, jl]) {
      const r = await w.app.inject({ method: 'GET', url: `${base}/historique`, headers: w.bearer(j.valeur) });
      assert.equal(r.statusCode, 403, r.body);
      assert.ok(!('lignes' in r.json()));
    }
  }
  const mj = w.jeton('M', 'lecture');
  await w.put(w.jeton('E', 'ecriture').valeur, BASES(w.cle)[0]!, '/fiches/f:x', { type: 'personnage', titre: 'X' });
  revoquerJeton(w.app.db, { compteId: w.id('antor') }, mj.jeton.id);
  for (const base of BASES(w.cle)) {
    const r = await w.app.inject({ method: 'GET', url: `${base}/historique`, headers: w.bearer(mj.valeur) });
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().code, 'jeton_invalide');
    const n = await w.app.inject({ method: 'GET', url: `${base}/historique` });
    assert.equal(n.statusCode, 401);
    const c = await w.app.inject({ method: 'GET', url: `${base}/historique`, headers: w.antor });
    assert.equal(c.statusCode, 401, 'le cookie est ignoré');
  }
  // Un jeton limité à Alpha n'atteint pas Beta : 404, comme un univers inconnu.
  const lim = w.jeton('Lim', 'lecture');
  for (const ref of [String(w.v.id), 'inconnu', '99999']) {
    const r = await w.app.inject({ method: 'GET', url: `/api/v1/univers/${ref}/historique`, headers: w.bearer(lim.valeur) });
    assert.equal(r.statusCode, 404, `${ref}: ${r.body}`);
  }
  // Un jeton d'outil n'ouvre pas la route de contenu : voir import-garde-jetons.
});

test('un univers voisin : un jeton MJ des deux ne voit que l’univers demandé', async () => {
  const w = await monter();
  const deux = creerJeton(w.app.db, w.id('antor'), { nom: 'Deux', dureeJours: 30, acces: { tous: true, niveauTous: 'ecriture' } } as never, w.app.horloge());
  const base = (u: number) => `/api/v1/univers/${u}`;
  await w.put(deux.valeur, base(w.u.id), '/fiches/f:a', { type: 'personnage', titre: 'A' });
  await w.put(deux.valeur, base(w.v.id), '/fiches/f:b', { type: 'personnage', titre: 'B' });
  for (const [u, titre] of [[w.u.id, 'A'], [w.v.id, 'B']] as const) {
    const r = await w.app.inject({ method: 'GET', url: `${base(u)}/historique`, headers: w.bearer(deux.valeur) });
    const t = r.json().lignes.map((l: any) => l.ficheTitre);
    assert.ok(t.length > 0 && t.every((x: string) => x === titre), JSON.stringify(t));
  }
});
