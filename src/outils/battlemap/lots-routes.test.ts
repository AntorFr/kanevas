// Review tests of kanevas-battlemap-generation-api (B-99, AD-battlemap-generation-1 and 9, roles table of E-27): the routes of the
// generation batches, with the stub engine.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { executeurEnCours } = await import('../../services/battlemap-generation.js');
const V = await import('../../services/images/verrou.js');
const { env } = await import('../../config/env.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-lots-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antor = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  poserActivation(app.db, antor, { niveau: 'systeme', id: S }, 'battlemap/generation', true);
  const R = `/api/univers/${E}/outils/battlemap/lots`;
  const req = (method: M, who: string | null, url: string, payload?: any) =>
    app.inject({ method, url, headers: who ? { cookie: h[who] } : {}, payload });
  return { app, E, S, R, req, antor };
}
const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 1, hauteur: 1, indice: '', ...extra });
const code = (r: { json(): any }) => r.json().code ?? r.json().detail;

test('rôles : MJ lit ; joueur et non-membre introuvables sur chaque route ; MJ en mode Joueur introuvable en lecture', async () => {
  const w = await monde();
  assert.equal((await w.req('GET', 'antor', w.R)).statusCode, 200);
  for (const who of ['lea', 'teo', null]) {
    for (const [m, u, p] of [['GET', w.R], ['PUT', w.R, { lignes: [ligne('A')] }], ['POST', `${w.R}/lancer`], ['POST', `${w.R}/reprendre`],
      ['POST', `${w.R}/arreter`], ['POST', `${w.R}/lignes/1/accepter`], ['POST', `${w.R}/lignes/1/regenerer`, { remarque: 'x' }],
      ['POST', `${w.R}/lignes/1/ecarter`], ['POST', `${w.R}/lignes/1/reessayer`]] as [M, string, any?][]) {
      const r = await w.req(m, who, u, p);
      if (who === null) assert.ok([401, 302, 404].includes(r.statusCode), `${who} ${m} ${u} → ${r.statusCode}`);
      else assert.equal(r.statusCode, 404, `${who} ${m} ${u} → ${r.statusCode}`);
    }
  }
  // players: precisely introuvable (404), not refuse
  const joueur = await w.req('GET', 'lea', w.R);
  assert.equal(joueur.statusCode, 404);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots').n, 0, 'aucun refus n’écrit');
  assert.equal((await w.req('GET', 'antor', `${w.R}?mode=joueur`)).statusCode, 404);
});

// E-27 roles table: « GM in Player mode — API …/lots: refuse for a write, introuvable for a read ».
test('MJ en mode Joueur : écriture refusée (403, rien n’est écrit), lecture introuvable', async () => {
  const w = await monde();
  const ecr = await w.req('PUT', 'antor', `${w.R}?mode=joueur`, { lignes: [ligne('A')] });
  assert.equal(ecr.statusCode, 403, ecr.body);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots').n, 0);
  for (const a of ['lancer', 'arreter', 'reprendre', 'lignes/1/accepter', 'lignes/1/ecarter', 'lignes/1/reessayer']) {
    assert.equal((await w.req('POST', 'antor', `${w.R}/${a}?mode=joueur`)).statusCode, 403, a);
  }
  assert.equal((await w.req('POST', 'antor', `${w.R}/lignes/1/regenerer?mode=joueur`, { remarque: 'x' })).statusCode, 403, 'regenerer');
});

test('GET sans lot : lot null, moteurOccupe faux, directionArtistique du semis tronquée à 140 ; texte vide → null', async () => {
  const w = await monde();
  const r = await w.req('GET', 'antor', w.R);
  const b = r.json();
  assert.equal(b.lot, null);
  assert.equal(b.moteurOccupe, false);
  const texte = one(w.app, 'SELECT texte FROM bm_direction WHERE univers_id = ?', w.E)?.texte as string | undefined;
  if (texte && texte.trim() !== '') assert.equal(b.directionArtistique, Array.from(texte.trim()).slice(0, 140).join(''));
  const longue = 'é'.repeat(300);
  const D = `/api/univers/${w.E}/outils/battlemap/direction`;
  const v0 = (await w.req('GET', 'antor', D)).json().version;
  const ec = await w.req('PUT', 'antor', D, { texte: longue, version: v0 });
  assert.ok(ec.statusCode < 300, ec.body);
  assert.equal((await w.req('GET', 'antor', w.R)).json().directionArtistique, 'é'.repeat(140));
  const v1 = (await w.req('GET', 'antor', D)).json().version;
  const vide = await w.req('PUT', 'antor', D, { texte: '   ', version: v1 });
  assert.ok(vide.statusCode < 300, vide.body);
  assert.equal((await w.req('GET', 'antor', w.R)).json().directionArtistique, null);
});

test('moteurOccupe : vrai quand le verrou est tenu par un autre que le lot, faux une fois libéré', async () => {
  const w = await monde();
  let lacher!: () => void;
  const tenu = new Promise<void>((r) => { lacher = r; });
  let pris!: () => void;
  const entre = new Promise<void>((r) => { pris = r; });
  const tache = V.sousOrigine('assistant', () => V.sousVerrou(undefined, async () => { pris(); await tenu; }));
  await entre;
  assert.equal((await w.req('GET', 'antor', w.R)).json().moteurOccupe, true);
  lacher();
  await tache;
  assert.equal((await w.req('GET', 'antor', w.R)).json().moteurOccupe, false);
});

test('PUT remplace la liste d’un lot préparé : 1 à 20 lignes, 21 et 0 refusés champ, rien n’est écrit', async () => {
  const w = await monde();
  const a = await w.req('PUT', 'antor', w.R, { lignes: [ligne('A'), ligne('B')] });
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().lot.etat, 'prepare');
  assert.deepEqual(a.json().lot.lignes.map((l: any) => l.nom), ['A', 'B']);
  const b = await w.req('PUT', 'antor', w.R, { lignes: [ligne('C')] });
  assert.deepEqual(b.json().lot.lignes.map((l: any) => l.nom), ['C'], 'remplace');
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots').n, 1);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots_lignes').n, 1);
  const vingt = await w.req('PUT', 'antor', w.R, { lignes: Array.from({ length: 20 }, (_, i) => ligne(`L${i}`)) });
  assert.equal(vingt.statusCode, 200, vingt.body);
  const v21 = await w.req('PUT', 'antor', w.R, { lignes: Array.from({ length: 21 }, (_, i) => ligne(`L${i}`)) });
  assert.equal(v21.statusCode, 400, v21.body);
  assert.equal(v21.json().code, 'lignes_invalides');
  assert.ok(v21.json().champ, 'champ nommé');
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots_lignes').n, 20, 'les 20 d’avant restent');
  const v0 = await w.req('PUT', 'antor', w.R, { lignes: [] });
  assert.equal(v0.statusCode, 400, v0.body);
  for (const bad of [{}, { lignes: 'x' }, { lignes: [ligne('')] }, { lignes: [ligne('A', { categorie: 'dragon' })] }]) {
    const r = await w.req('PUT', 'antor', w.R, bad);
    assert.equal(r.statusCode, 400, JSON.stringify(bad) + r.body);
  }
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots_lignes').n, 20);
});

test('lot de trois lignes lancé par la route : trois brouillons dont « échec » ; reessayer ; accepter ; aucune route ne sert l’image', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('Tonneau rouge'), ligne('Caisse'), ligne('échec')] });
  const l = await w.req('POST', 'antor', `${w.R}/lancer`);
  assert.equal(l.statusCode, 200, l.body);
  await executeurEnCours();
  const g = (await w.req('GET', 'antor', w.R)).json();
  assert.deepEqual(g.lot.lignes.map((x: any) => x.etat), ['brouillon', 'brouillon', 'echec']);
  assert.equal(g.lot.lignes[2].codeEchec, 'moteur');
  assert.equal(g.lot.lignes[2].motEchec, "Échec : le moteur d'image n'a pas répondu.");
  // drafts are GM-only in the library
  const [a, b, c] = g.lot.lignes;
  assert.equal(one(w.app, 'SELECT f.visibilite v FROM fichiers f WHERE f.id = ?', a.fichierId).v, 'mj');
  // a player sees no draft
  const lib = await w.req('GET', 'lea', `/api/univers/${w.E}/outils/battlemap/assets`);
  assert.equal(JSON.stringify(lib.json()).includes('Tonneau rouge'), false);
  // retry the failing line: still named « échec », fails again, goes back to echec; accepting it is etat_ligne
  const acc = await w.req('POST', 'antor', `${w.R}/lignes/${c.id}/accepter`);
  assert.equal(acc.statusCode, 409, acc.body);
  assert.equal(code(acc), 'etat_ligne');
  const re = await w.req('POST', 'antor', `${w.R}/lignes/${c.id}/reessayer`);
  assert.equal(re.statusCode, 200, re.body);
  await executeurEnCours();
  assert.equal((await w.req('GET', 'antor', w.R)).json().lot.lignes[2].etat, 'echec');
  // reessayer on a draft: etat_ligne
  const bad = await w.req('POST', 'antor', `${w.R}/lignes/${a.id}/reessayer`);
  assert.equal(bad.statusCode, 409);
  assert.equal(code(bad), 'etat_ligne');
  // accept two, regenerate none, discard the failed one
  assert.equal((await w.req('POST', 'antor', `${w.R}/lignes/${a.id}/accepter`)).statusCode, 200);
  const rg = await w.req('POST', 'antor', `${w.R}/lignes/${b.id}/regenerer`, { remarque: 'plus usé' });
  assert.equal(rg.statusCode, 200, rg.body);
  await executeurEnCours();
  const apres = (await w.req('GET', 'antor', w.R)).json().lot.lignes;
  assert.equal(apres[1].remarque, 'plus usé');
  assert.equal(apres[1].etat, 'brouillon');
  assert.equal(apres[0].etat, 'accepte');
  // the accepted asset is now readable by a player
  const lib2 = await w.req('GET', 'lea', `/api/univers/${w.E}/outils/battlemap/assets`);
  assert.equal(JSON.stringify(lib2.json()).includes('Tonneau rouge'), true);
  assert.equal((await w.req('POST', 'antor', `${w.R}/lignes/${c.id}/ecarter`)).statusCode, 200);
  assert.equal((await w.req('POST', 'antor', `${w.R}/lignes/${b.id}/ecarter`)).statusCode, 200);
  const fin = await w.req('GET', 'antor', w.R);
  assert.equal(fin.json().lot, null, 'lot clos non montré');
  // no route of the batch serves bytes: every GET under lots/ other than the list is unregistered
  for (const u of [`${w.R}/lignes/${a.id}`, `${w.R}/lignes/${a.id}/image`, `${w.R}/lignes/${a.id}/fichier`, `${w.R}/${a.id}/image`]) {
    const r = await w.req('GET', 'antor', u);
    assert.equal(r.statusCode, 404, u);
    assert.doesNotMatch(String(r.headers['content-type']), /image/, u);
  }
  assert.equal(g.lot.lignes.every((x: any) => !('octets' in x) && !('chemin' in x)), true);
});

test('une ligne en échec ne fuit pas de chemin disque : la vue ne porte que le mot fixe', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('échec')] });
  await w.req('POST', 'antor', `${w.R}/lancer`);
  await executeurEnCours();
  const l = (await w.req('GET', 'antor', w.R)).json().lot.lignes[0];
  assert.equal(l.etat, 'echec');
  assert.equal(l.jeton, null);
  assert.equal(l.fichierId, null);
});

test('lot_en_cours : lancer deux fois / PUT sur un lot lancé ; arreter écarte ; reprendre sans interrompu : etat refusé', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('A')] });
  await w.req('POST', 'antor', `${w.R}/lancer`);
  await executeurEnCours();
  const put = await w.req('PUT', 'antor', w.R, { lignes: [ligne('B')] });
  assert.equal(put.statusCode, 409, put.body);
  assert.equal(code(put), 'lot_en_cours');
  const lan = await w.req('POST', 'antor', `${w.R}/lancer`);
  assert.equal(lan.statusCode, 409, lan.body);
  const rep = await w.req('POST', 'antor', `${w.R}/reprendre`);
  assert.equal(rep.statusCode, 409, rep.body);
  const ar = await w.req('POST', 'antor', `${w.R}/arreter`);
  assert.equal(ar.statusCode, 200, ar.body);
  assert.equal((await w.req('GET', 'antor', w.R)).json().lot, null);
  // nothing to launch / stop
  assert.equal((await w.req('POST', 'antor', `${w.R}/lancer`)).statusCode >= 400, true);
  assert.equal((await w.req('POST', 'antor', `${w.R}/arreter`)).statusCode >= 400, true);
});

test('reprendre relance les lignes interrompues', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('A'), ligne('B')] });
  await w.req('POST', 'antor', `${w.R}/lancer`);
  await executeurEnCours();
  w.app.db.prepare("UPDATE bm_lots_lignes SET etat = 'interrompu', asset_id = NULL WHERE rang = 2").run();
  const g = (await w.req('GET', 'antor', w.R)).json().lot;
  assert.equal(g.interrompu, true);
  const r = await w.req('POST', 'antor', `${w.R}/reprendre`);
  assert.equal(r.statusCode, 200, r.body);
  await executeurEnCours();
  assert.deepEqual((await w.req('GET', 'antor', w.R)).json().lot.lignes.map((x: any) => x.etat), ['brouillon', 'brouillon']);
});

test('accepter dans une bibliothèque de 5 000 assets : 409 bibliotheque_pleine, la ligne reste brouillon', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('A')] });
  await w.req('POST', 'antor', `${w.R}/lancer`);
  await executeurEnCours();
  const moi = w.antor;
  const ins = w.app.db.prepare("INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le) VALUES (?, 'f', 'image/png', 1, ?, 'joueurs', ?, 'x')");
  const n = one(w.app, "SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ? AND etat = 'valide'", w.E).n as number;
  w.app.db.transaction(() => {
    for (let i = 0; i < 5000 - n; i++) {
      const id = Number(ins.run(w.E, `plein${i}`, moi).lastInsertRowid);
      w.app.db.prepare("INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, etat, cree_le) VALUES (?, ?, 'a', 'objet', 1, 1, 'valide', 'x')").run(w.E, id);
    }
  })();
  const id = (await w.req('GET', 'antor', w.R)).json().lot.lignes[0].id;
  const r = await w.req('POST', 'antor', `${w.R}/lignes/${id}/accepter`);
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(code(r), 'bibliotheque_pleine');
  assert.equal((await w.req('GET', 'antor', w.R)).json().lot.lignes[0].etat, 'brouillon');
});

test('ligne inconnue ou d’un autre univers : introuvable ; id non numérique : chemin non enregistré', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('A')] });
  const r = await w.req('POST', 'antor', `${w.R}/lignes/99999/ecarter`);
  assert.ok(r.statusCode === 404 || r.statusCode === 409, r.body);
  const x = await w.req('POST', 'antor', `${w.R}/lignes/abc/ecarter`);
  assert.equal(x.statusCode, 404);
});

test('régénérer : remarque trop longue refusée, remarque non texte refusée', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('A')] });
  await w.req('POST', 'antor', `${w.R}/lancer`);
  await executeurEnCours();
  const id = (await w.req('GET', 'antor', w.R)).json().lot.lignes[0].id;
  const long = await w.req('POST', 'antor', `${w.R}/lignes/${id}/regenerer`, { remarque: 'x'.repeat(501) });
  assert.equal(long.statusCode, 400, long.body);
  const nombre = await w.req('POST', 'antor', `${w.R}/lignes/${id}/regenerer`, { remarque: 5 });
  assert.ok(nombre.statusCode === 400, nombre.body);
  assert.equal((await w.req('GET', 'antor', w.R)).json().lot.lignes[0].etat, 'brouillon');
});

test('sans moteur : chaque route répond comme un chemin non enregistré', async () => {
  const w = await monde();
  const avant = env.KANEVAS_STUB;
  const path = process.env.PATH;
  (env as any).KANEVAS_STUB = undefined;
  process.env.PATH = '/nonexistent';
  try {
    const inconnu = await w.req('GET', 'antor', `/api/univers/${w.E}/outils/battlemap/inexistant`);
    assert.equal(inconnu.statusCode, 404);
    for (const [m, u, p] of [['GET', ''], ['PUT', '', { lignes: [ligne('A')] }], ['POST', '/lancer'], ['POST', '/reprendre'], ['POST', '/arreter'],
      ['POST', '/lignes/1/accepter'], ['POST', '/lignes/1/regenerer', { remarque: 'x' }], ['POST', '/lignes/1/ecarter'], ['POST', '/lignes/1/reessayer']] as [M, string, any?][]) {
      const r = await w.req(m, 'antor', `${w.R}${u}`, p);
      assert.equal(r.statusCode, 404, `${m} ${u}`);
      assert.equal(r.body, inconnu.body, `${m} ${u} : même corps qu’un chemin non enregistré`);
    }
    assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots').n, 0);
  } finally {
    (env as any).KANEVAS_STUB = avant;
    process.env.PATH = path;
  }
});

test('outil désactivé : callNotFound identique, un lot stocké reste intact', async () => {
  const w = await monde();
  await w.req('PUT', 'antor', w.R, { lignes: [ligne('A')] });
  poserActivation(w.app.db, w.antor, { niveau: 'systeme', id: w.S }, 'battlemap/generation', false);
  const inconnu = await w.req('GET', 'antor', `/api/univers/${w.E}/outils/battlemap/inexistant`);
  const r = await w.req('GET', 'antor', w.R);
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, inconnu.body);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_lots').n, 1);
});

test('un jeton de lot d’import n’ouvre pas ces routes', async () => {
  const w = await monde();
  const r = await w.app.inject({ method: 'GET', url: w.R, headers: { authorization: 'Bearer kvs_x' } });
  assert.ok(r.statusCode === 401 || r.statusCode === 404 || r.statusCode === 302, String(r.statusCode));
});
