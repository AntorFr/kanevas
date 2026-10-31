import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });
const un = (app: App, sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const [antor, lea, teo] = await Promise.all(['antor', 'lea', 'teo'].map((c) => connecter(app, c)));
  const E = un(app, "SELECT id FROM univers WHERE nom = ?", "Éneria d'essai").id as number;
  const S = un(app, "SELECT id FROM systemes_jeu WHERE nom = ?", "Système d'essai").id as number;
  const leaId = un(app, 'SELECT id FROM comptes WHERE username = ?', 'lea').id as number;
  const w = { app, antor: antor!, lea: lea!, teo: teo!, E, S, leaId };
  assert.equal((await appel(app, w.antor, 'PUT', `/api/systemes/${S}/outils/essai/g/activation`, { active: true })).statusCode, 204);
  await appel(app, w.antor, 'PUT', `/api/systemes/${S}/outils/essai/g/visibilite`, { mj: true, joueur: true });
  const f = await appel(app, w.antor, 'POST', `/api/univers/${E}/fiches`, { type: 'vaisseau', titre: "Vaisseau d'essai" });
  assert.equal(f.statusCode, 201, f.body);
  const fid = f.json().id as number;
  const c = await appel(app, w.antor, 'POST', `/api/univers/${E}/outils/essai/g/sections`,
    { ficheId: fid, type: 'caracteristiques', auteurId: leaId });
  assert.equal(c.statusCode, 201, c.body);
  return { ...w, fid, sid: c.json().id as number, vueCreation: c.json() };
}
const fiche = async (w: Awaited<ReturnType<typeof monde>>, h: H, q = '') => {
  const r = await appel(w.app, h, 'GET', `/api/univers/${w.E}/fiches/${w.fid}${q}`);
  assert.equal(r.statusCode, 200, r.body);
  const s = (r.json().sections as any[]).find((x) => x.id === w.sid);
  assert.ok(s, 'section absente de la fiche');
  return s;
};
const sec = (w: { E: number; fid: number; sid: number }) => `/api/univers/${w.E}/fiches/${w.fid}/sections/${w.sid}`;
const marge = async (w: Awaited<ReturnType<typeof monde>>, v: number) => {
  const lu = await appel(w.app, w.antor, 'GET', `/api/univers/${w.E}/outils`);
  const g = (lu.json().outils as any[]).find((o) => o.cle === 'essai/g');
  const version = g.univers.versionReglages as number;
  const r = await appel(w.app, w.antor, 'PUT', `/api/univers/${w.E}/outils/essai/g/reglages`, { version, valeurs: { marge: v } });
  assert.equal(r.statusCode, 204, r.body);
};

test('vue : geree à jour pour Léa (sans source), peutOuvrir pour Antor ; contenu absent', async () => {
  const w = await monde();
  const l = await fiche(w, w.lea);
  assert.equal(l.geree.etat, 'a_jour');
  assert.equal(l.geree.libelle, 'Essai G');
  assert.ok(l.geree.lien.startsWith(`/univers/${w.E}/outils/essai/g`));
  assert.equal(l.geree.peutRecalculer, false);
  assert.equal(l.geree.peutOuvrir, true); // Léa est l'autrice
  assert.equal(l.contenu, undefined);
  assert.match(l.html, /Marge d.essai/);
  assert.equal(l.peutEcrire, false);
  const a = await fiche(w, w.antor);
  assert.equal(a.geree.peutOuvrir, true);
  assert.equal(a.contenu, undefined);
  assert.equal(a.peutEcrire, false);
});

test('PUT contenu : 403 section_geree pour Antor et Léa ; route d essai 403 pour Léa', async () => {
  const w = await monde();
  const v = (await fiche(w, w.antor)).version;
  for (const h of [w.antor, w.lea]) {
    const r = await appel(w.app, h, 'PUT', `${sec(w)}/contenu`, { contenu: 'Libre', version: v });
    assert.equal(r.statusCode, 403, r.body);
    assert.equal(r.json().code, 'section_geree');
  }
  assert.equal(un(w.app, 'SELECT contenu FROM sections WHERE id = ?', w.sid).contenu, "Marge d'essai : 10 %");
  const r = await appel(w.app, w.lea, 'POST', `/api/univers/${w.E}/outils/essai/g/sections`,
    { ficheId: w.fid, sectionId: w.sid, type: 'caracteristiques', version: v });
  assert.equal(r.statusCode, 403, r.body);
  const creation = await appel(w.app, w.lea, 'POST', `/api/univers/${w.E}/outils/essai/g/sections`,
    { ficheId: w.fid, type: 'caracteristiques' });
  assert.equal(creation.statusCode, 403);
});

test('périmé après changement de marge ; recalcul : Antor 200, Léa 403, version périmée 409, notes 400', async () => {
  const w = await monde();
  await marge(w, 25);
  const l = await fiche(w, w.lea);
  assert.equal(l.geree.etat, 'perime');
  assert.match(l.html, /10 %/);
  const v = l.version as number;
  const rl = await appel(w.app, w.lea, 'POST', `${sec(w)}/recalcul`, { version: v });
  assert.equal(rl.statusCode, 403, rl.body);
  const vieux = await appel(w.app, w.antor, 'POST', `${sec(w)}/recalcul`, { version: v - 1 });
  assert.equal(vieux.statusCode, 409);
  assert.equal(vieux.json().code, 'section_modifiee');
  const sansVersion = await appel(w.app, w.antor, 'POST', `${sec(w)}/recalcul`, {});
  assert.equal(sansVersion.statusCode, 400);
  const ok = await appel(w.app, w.antor, 'POST', `${sec(w)}/recalcul`, { version: v });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().version, v + 1);
  assert.equal(ok.json().geree.etat, 'a_jour');
  assert.match(ok.json().html, /25 %/);
  assert.equal((await fiche(w, w.lea)).geree.etat, 'a_jour');
  // Mode Joueur : le geste est refusé, rien ne bouge.
  await marge(w, 30);
  const mj = await appel(w.app, w.antor, 'POST', `${sec(w)}/recalcul?mode=joueur`, { version: v + 1 });
  assert.equal(mj.statusCode, 403, mj.body);
  assert.equal(un(w.app, 'SELECT version FROM sections WHERE id = ?', w.sid).version, v + 1);
});

test('notes : recalcul 400 recalcul_sur_proposition ; proposition 201 / joueur 404 / mode Joueur 403 ; source recalcul', async () => {
  const w = await monde();
  const n = await appel(w.app, w.antor, 'POST', `/api/univers/${w.E}/outils/essai/g/sections`, { ficheId: w.fid, type: 'notes' });
  assert.equal(n.statusCode, 201, n.body);
  const nid = n.json().id as number;
  const sn = `/api/univers/${w.E}/fiches/${w.fid}/sections/${nid}`;
  const r = await appel(w.app, w.antor, 'POST', `${sn}/recalcul`, { version: n.json().version });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code, 'recalcul_sur_proposition');
  await marge(w, 40);
  assert.equal((await appel(w.app, w.lea, 'POST', `${sn}/recalcul/proposition`, {})).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'POST', `${sn}/recalcul/proposition`, {})).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'POST', `${sn}/recalcul/proposition?mode=joueur`, {})).statusCode, 403);
  const p = await appel(w.app, w.antor, 'POST', `${sn}/recalcul/proposition`, {});
  assert.equal(p.statusCode, 201, p.body);
  const pj = p.json();
  assert.equal(pj.source, 'recalcul');
  assert.equal(pj.outilLibelle, 'Essai G');
  assert.equal(pj.crId, null);
  const lu = await appel(w.app, w.antor, 'GET', `/api/univers/${w.E}/propositions/${pj.id}`);
  assert.equal(lu.statusCode, 200);
  assert.equal(lu.json().source, 'recalcul');
  assert.equal((await appel(w.app, w.lea, 'GET', `/api/univers/${w.E}/propositions/${pj.id}`)).statusCode, 404);
  // Mauvaise fiche dans l'adresse : introuvable.
  const autre = await appel(w.app, w.antor, 'POST', `/api/univers/${w.E}/fiches`, { type: 'vaisseau', titre: 'Autre' });
  assert.equal((await appel(w.app, w.antor, 'POST',
    `/api/univers/${w.E}/fiches/${autre.json().id}/sections/${nid}/recalcul/proposition`, {})).statusCode, 404);
});

test('outil désactivé : desactive sans libellé ; route d essai comme une adresse absente ; mode Joueur refuse l écriture', async () => {
  const w = await monde();
  const mj = await appel(w.app, w.antor, 'POST', `/api/univers/${w.E}/outils/essai/g/sections?mode=joueur`,
    { ficheId: w.fid, type: 'notes' });
  assert.equal(mj.statusCode, 403, mj.body);
  const inconnue = await appel(w.app, w.antor, 'POST', `/api/univers/${w.E}/outils/essai/zz/sections`, { ficheId: w.fid, type: 'notes' });
  await appel(w.app, w.antor, 'PUT', `/api/systemes/${w.S}/outils/essai/g/activation`, { active: false });
  const g = (await fiche(w, w.lea)).geree;
  assert.equal(g.etat, 'desactive');
  assert.equal(g.libelle, null);
  const r = await appel(w.app, w.antor, 'POST', `/api/univers/${w.E}/outils/essai/g/sections`, { ficheId: w.fid, type: 'notes' });
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, inconnue.body);
});

test('section libre : pas de geree, recalcul et proposition introuvables ; sections-gerees.ts reste le seul à passer geree', async () => {
  const w = await monde();
  const a = await appel(w.app, w.antor, 'POST', `/api/univers/${w.E}/fiches/${w.fid}/sections`, { titre: 'Libre', contenu: 'x' });
  assert.equal(a.statusCode, 201, a.body);
  const id = a.json().id as number;
  assert.equal(a.json().geree, undefined);
  const s = `/api/univers/${w.E}/fiches/${w.fid}/sections/${id}`;
  assert.equal((await appel(w.app, w.antor, 'POST', `${s}/recalcul`, { version: a.json().version })).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'POST', `${s}/recalcul/proposition`, {})).statusCode, 404);
  // Sans session : 401.
  assert.equal((await appel(w.app, null, 'POST', `${s}/recalcul`, { version: 1 })).statusCode, 401);
  assert.equal((await appel(w.app, null, 'POST', `/api/univers/${w.E}/outils/essai/g/sections`, {})).statusCode, 401);
});
