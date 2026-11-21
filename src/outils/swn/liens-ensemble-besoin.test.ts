import assert from 'node:assert/strict';
import { test } from 'node:test';

// Whole-feature tests of kanevas-carte-spatiale-liens (B-92, P-22 steps 3 and 5, E-9 « Sur la carte spatiale », E-23 link and illustrate):
// the doors the screens call — PUT/DELETE …/astres|zones/:cle/fiche, GET …/interieur, GET /fiches/:fid, DELETE /fiches/:fid,
// POST …/illustrer-fiche. Real routes, real database, stub login. Written from the sheet and docs/ecrans.md (E-23 « liens », E-9),
// not from the code; every expected value is a literal.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const sys = (cle: string, nom: string, q: number, r: number, secret = 0) => app.db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
    .run(g, E, cle, nom, q, r, secret).lastInsertRowid as number;
  const astre = (sid: number, cle: string, nom: string | null, orbite: number, heure: number, genre = 'planete') =>
    app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, nom, orbite, heure, taille) VALUES (?,?,?,'rocheux',?,?,?,0.1)").run(sid, cle, genre, nom, orbite, heure);
  // A sheet Léa reads (one section the players read) or one she does not (a GM-only section).
  const fiche = (titre: string, lue: boolean) => {
    const f = app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', ?, '{}', 1, 1)").run(E, titre).lastInsertRowid as number;
    app.db.prepare("INSERT INTO sections (fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (?, 'Texte', 1, 'x', '2026-01-01', ?)").run(f, lue ? 1 : 0);
    return f;
  };
  const api = `/api/univers/${E}`;
  const base = `${api}/outils/swn/galaxie/galaxies/${g}/interieur`;
  const req = (who: string, method: 'GET' | 'PUT' | 'DELETE' | 'POST', url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(h[who] ?? {}), ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const interieur = async (who: string, q: number, r: number, suffixe = '') => (await req(who, 'GET', `${base}/${q}/${r}${suffixe}`)).json();
  const lier = async (who: string, q: number, r: number, cible: 'astres' | 'zones', cle: string, ficheId: unknown) => {
    const v = await interieur('antor', q, r);
    const el = (cible === 'astres' ? v.astres : v.formations).find((x: any) => x.cle === cle);
    return req(who, 'PUT', `${base}/${q}/${r}/${cible}/${cle}/fiche`, { ficheId, version: el.version, versionSysteme: v.versionSysteme });
  };
  const blocs = async (who: string, f: number) => (await req(who, 'GET', `${api}/fiches/${f}`)).json().blocs;
  return { app, E, g, sys, astre, fiche, req, interieur, lier, blocs, api, base, h };
}

test('B-92 · Léa suit le lien d\'une planète liée à une fiche qu\'elle lit : le panneau donne {id, titre}, la fiche « Sur la carte spatiale » avec la ligne', async () => {
  const w = await monde();
  const f = w.fiche('Vael II (colonie)', true);
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p2', 'Vael II', 4, 7);
  const r = await w.lier('antor', 62, 63, 'astres', 'p2', f);
  assert.equal(r.statusCode, 200, r.body);
  const lea = await w.interieur('lea', 62, 63);
  assert.deepEqual(lea.astres.find((a: any) => a.cle === 'p2').fiche, { id: f, titre: 'Vael II (colonie)' });
  const b = await w.blocs('lea', f);
  assert.equal(b.length, 1);
  assert.equal(b[0].titre, 'Sur la carte spatiale');
  assert.equal(b[0].lignes.length, 1);
  assert.equal(b[0].lignes[0].texte, 'Vael II — système Vael, orbite 4 · 7 h');
  assert.equal(typeof b[0].lignes[0].adresse, 'string');
  assert.ok(b[0].lignes[0].adresse.length > 0);
});

test('B-92 · une fiche que Léa ne lit pas : la planète est rendue à Léa comme une planète non liée, et la fiche n\'apparaît nulle part', async () => {
  const w = await monde();
  const secrete = w.fiche('Projet Zéphyr', false);
  const s = w.sys('vael', 'Vael', 62, 63);
  w.astre(s, 'p3', 'Vael III', 5, 2); w.astre(s, 'p4', 'Vael III', 5, 2);
  assert.equal((await w.lier('antor', 62, 63, 'astres', 'p3', secrete)).statusCode, 200);
  const lea = await w.interieur('lea', 62, 63);
  const lie = lea.astres.find((a: any) => a.cle === 'p3'); const libre = lea.astres.find((a: any) => a.cle === 'p4');
  assert.equal(lie.fiche, null);
  assert.deepEqual({ ...lie, cle: '', version: 0 }, { ...libre, cle: '', version: 0 });
  const corps = JSON.stringify(lea);
  assert.ok(!corps.includes('Projet Zéphyr') && !corps.includes(`"id":${secrete},`) && !corps.includes('fiche_id'));
  assert.equal((await w.req('lea', 'GET', `${w.api}/fiches/${secrete}`)).statusCode, 404);
  const liste = await w.req('lea', 'GET', `${w.api}/fiches?recherche=Z%C3%A9phyr`);
  assert.ok(!liste.body.includes('Projet Zéphyr'));
  // The GM still reads the link, and the block on the sheet.
  const antor = await w.interieur('antor', 62, 63);
  assert.deepEqual(antor.astres.find((a: any) => a.cle === 'p3').fiche, { id: secrete, titre: 'Projet Zéphyr' });
  assert.deepEqual((await w.blocs('antor', secrete))[0].lignes.map((l: any) => l.texte), ['Vael III — système Vael, orbite 5 · 2 h']);
});

test('B-92 · le MJ en mode joueur voit ce que voit Léa : pas de lien vers la fiche réservée, pas de bloc', async () => {
  const w = await monde();
  const secrete = w.fiche('Projet Zéphyr', false);
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p3', 'Vael III', 5, 2);
  assert.equal((await w.lier('antor', 62, 63, 'astres', 'p3', secrete)).statusCode, 200);
  const mj = await w.interieur('antor', 62, 63, '?mode=joueur');
  assert.equal(mj.astres.find((a: any) => a.cle === 'p3').fiche, null);
  const fiche = await w.req('antor', 'GET', `${w.api}/fiches/${secrete}?mode=joueur`);
  assert.ok(fiche.statusCode === 404 || fiche.json().blocs.length === 0, fiche.body.slice(0, 200));
});

test('B-92 · supprimer la fiche délie la planète sans la supprimer, sans erreur, et le MJ peut la relier', async () => {
  const w = await monde();
  const f = w.fiche('Vael II (colonie)', true);
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p2', 'Vael II', 4, 7);
  await w.lier('antor', 62, 63, 'astres', 'p2', f);
  const del = await w.req('antor', 'DELETE', `${w.api}/fiches/${f}`);
  assert.equal(del.statusCode, 204, del.body);
  for (const who of ['lea', 'antor']) {
    const v = await w.interieur(who, 62, 63);
    const p = v.astres.find((a: any) => a.cle === 'p2');
    assert.ok(p, `${who} : la planète reste`);
    assert.equal(p.fiche, null);
  }
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_astres WHERE cle = ?', 'p2').n, 1);
  const g2 = w.fiche('Vael II (ruines)', true);
  assert.equal((await w.lier('antor', 62, 63, 'astres', 'p2', g2)).statusCode, 200);
});

test('B-92 · délier retire le lien et la ligne de la fiche ; une zone se lie comme un corps', async () => {
  const w = await monde();
  const f = w.fiche('Ceinture de Vael', true);
  const s = w.sys('vael', 'Vael', 62, 63);
  w.astre(s, 'p2', 'Vael II', 4, 7);
  w.app.db.prepare("INSERT INTO swn_formations (systeme_id, cle, forme, nom, parametres) VALUES (?, 'z1', 'anneau', 'Ceinture', ?)").run(s, JSON.stringify({ de: 2.9, a: 3.3 }));
  assert.equal((await w.lier('antor', 62, 63, 'zones', 'z1', f)).statusCode, 200);
  assert.deepEqual((await w.blocs('lea', f))[0].lignes.map((l: any) => l.texte), ['Ceinture — système Vael, orbite 2,9 à 3,3']);
  const v = await w.interieur('antor', 62, 63);
  const z = v.formations.find((x: any) => x.cle === 'z1');
  assert.deepEqual(z.fiche, { id: f, titre: 'Ceinture de Vael' });
  const d = await w.req('antor', 'DELETE', `${w.base}/62/63/zones/z1/fiche?version=${z.version}&versionSysteme=${v.versionSysteme}`);
  assert.equal(d.statusCode, 200, d.body);
  assert.equal(d.json().formations.find((x: any) => x.cle === 'z1').fiche, null);
  assert.deepEqual(await w.blocs('lea', f), []);
});

test('E-9 · plusieurs corps d\'une fiche : une ligne chacun, ordre de la galaxie puis hexagone puis orbite ; corps sans nom', async () => {
  const w = await monde();
  const f = w.fiche('Empire', true);
  const a = w.sys('a', 'Aldo', 10, 10); const b = w.sys('b', 'Bêta', 11, 10);
  w.astre(a, 'x2', 'Deux', 6, 1); w.astre(a, 'x1', 'Un', 2, 3); w.astre(a, 'x0', null, 3, 11); w.astre(b, 'y1', 'Trois', 1, 5);
  for (const [q, r, c] of [[10, 10, 'x2'], [10, 10, 'x1'], [10, 10, 'x0'], [11, 10, 'y1']] as const) assert.equal((await w.lier('antor', q, r, 'astres', c, f)).statusCode, 200);
  assert.deepEqual((await w.blocs('lea', f))[0].lignes.map((l: any) => l.texte), [
    'Un — système Aldo, orbite 2 · 3 h',
    'Astre sans nom — système Aldo, orbite 3 · 11 h',
    'Deux — système Aldo, orbite 6 · 1 h',
    'Trois — système Bêta, orbite 1 · 5 h',
  ]);
});

test('E-9 · un système masqué : aucune ligne, aucun bloc pour Léa, un bloc pour le MJ ; un seul lisible parmi deux : une ligne', async () => {
  const w = await monde();
  const f = w.fiche('Empire', true);
  const cache = w.sys('c', 'Caché', 40, 41, 1); const ouvert = w.sys('o', 'Ouvert', 42, 43);
  w.astre(cache, 'c1', 'Noir', 1, 1); w.astre(ouvert, 'o1', 'Clair', 1, 1);
  assert.equal((await w.lier('antor', 40, 41, 'astres', 'c1', f)).statusCode, 200);
  assert.deepEqual(await w.blocs('lea', f), []);
  assert.deepEqual((await w.blocs('antor', f))[0].lignes.map((l: any) => l.texte), ['Noir — système Caché, orbite 1 · 1 h']);
  assert.equal((await w.lier('antor', 42, 43, 'astres', 'o1', f)).statusCode, 200);
  assert.deepEqual((await w.blocs('lea', f))[0].lignes.map((l: any) => l.texte), ['Clair — système Ouvert, orbite 1 · 1 h']);
  const brut = JSON.stringify(await w.blocs('lea', f));
  assert.ok(!brut.includes('Caché') && !brut.includes('Noir'));
});

test('E-9 · 51 liens : 50 lignes et aucun compte ; une fiche non liée n\'a pas de bloc', async () => {
  const w = await monde();
  const f = w.fiche('Archipel', true); const vide = w.fiche('Seule', true);
  const s = w.sys('arc', 'Arc', 50, 50);
  for (let i = 0; i < 51; i++) w.app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, nom, orbite, heure, taille, fiche_id) VALUES (?,?,'planete','rocheux',?,?,?,0.1,?)").run(s, `m${i}`, `Îlot ${i}`, 1 + i / 100, 1, f);
  const b = await w.blocs('lea', f);
  assert.equal(b.length, 1);
  assert.equal(b[0].lignes.length, 50);
  assert.deepEqual(Object.keys(b[0]).sort(), ['cle', 'lignes', 'titre']);
  assert.ok(!/\b(total|count|nombre|reste|autres)\b/i.test(JSON.stringify(b)));
  assert.deepEqual(await w.blocs('lea', vide), []);
});

test('E-9 · l\'outil désactivé n\'ajoute aucun bloc, et rien n\'est effacé : réactivé, la ligne revient', async () => {
  const w = await monde();
  const f = w.fiche('Vael II (colonie)', true);
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p2', 'Vael II', 4, 7);
  await w.lier('antor', 62, 63, 'astres', 'p2', f);
  const systemeId = one(w.app, 'SELECT systeme_id s FROM univers WHERE id = ?', w.E).s;
  const put = (active: boolean) => w.req('antor', 'PUT', `/api/systemes/${systemeId}/outils/swn/galaxie/activation`, { active });
  assert.equal((await put(false)).statusCode, 204);
  assert.deepEqual(await w.blocs('lea', f), []);
  assert.deepEqual(await w.blocs('antor', f), []);
  assert.equal((await put(true)).statusCode, 204);
  assert.equal((await w.blocs('lea', f))[0].lignes.length, 1);
});

test('B-92 · échecs du lien : fiche d\'un autre univers ou inconnue → fiche_inconnue champ ficheId ; Léa refusée ; l\'en-tête Authorization n\'ouvre rien', async () => {
  const w = await monde();
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p2', 'Vael II', 4, 7);
  const autre = one(w.app, 'SELECT id FROM univers WHERE id != ? LIMIT 1', w.E).id as number;
  const etrangere = w.app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Ailleurs', '{}', 1, 1)").run(autre).lastInsertRowid;
  const f = w.fiche('Vael II (colonie)', true);
  for (const id of [etrangere, 999999]) {
    const r = await w.lier('antor', 62, 63, 'astres', 'p2', id);
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().code, 'fiche_inconnue');
    assert.equal(r.json().champ, 'ficheId');
  }
  const refus = await w.lier('lea', 62, 63, 'astres', 'p2', f);
  assert.equal(refus.statusCode, 403, refus.body);
  const v = await w.interieur('antor', 62, 63);
  const pas = await w.req('personne', 'PUT', `${w.base}/62/63/astres/p2/fiche`, { ficheId: f, version: v.astres[0].version, versionSysteme: v.versionSysteme }, { authorization: 'Bearer kvs_x', cookie: '' });
  assert.ok([401, 302, 403].includes(pas.statusCode), String(pas.statusCode));
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle = ?', 'p2').f, null);
});

test('B-92 · deux écritures de même version : la seconde est a_change (409) et le lien de la première reste', async () => {
  const w = await monde();
  const f1 = w.fiche('Une', true); const f2 = w.fiche('Deux', true);
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p2', 'Vael II', 4, 7);
  const v = await w.interieur('antor', 62, 63);
  const corps = (ficheId: number) => ({ ficheId, version: v.astres[0].version, versionSysteme: v.versionSysteme });
  assert.equal((await w.req('antor', 'PUT', `${w.base}/62/63/astres/p2/fiche`, corps(f1))).statusCode, 200);
  const r = await w.req('antor', 'PUT', `${w.base}/62/63/astres/p2/fiche`, corps(f2));
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().code, 'a_change');
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle = ?', 'p2').f, f1);
});

test('B-92 · lier un système tiré (non défini) l\'ancre dans la même requête ; un système masqué reste « introuvable » pour Léa', async () => {
  const w = await monde();
  const f = w.fiche('Vael II (colonie)', true);
  const s = w.sys('vael', 'Vael', 62, 63);
  w.astre(s, 'p2', 'Vael II', 4, 7);
  const r = await w.lier('antor', 62, 63, 'astres', 'p2', f);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'defini');
  const cache = w.sys('c', 'Caché', 40, 41, 1);
  w.astre(cache, 'c1', 'Noir', 1, 1);
  assert.equal((await w.req('lea', 'GET', `${w.base}/40/41`)).statusCode, 404);
});

test('B-92 · « Illustrer la fiche » : l\'image arrive dans l\'illustration d\'une fiche que Léa lit (visible pour elle) ; corps non lié → non_liee ; Léa refusée', async () => {
  const w = await monde();
  const f = w.fiche('Vael II (colonie)', true);
  const s = w.sys('vael', 'Vael', 62, 63);
  w.astre(s, 'p2', 'Vael II', 4, 7); w.astre(s, 'p9', 'Libre', 5, 1);
  await w.lier('antor', 62, 63, 'astres', 'p2', f);
  const url = (c: string) => `${w.base}/62/63/astres/${c}/illustrer-fiche`;
  assert.equal((await w.req('lea', 'POST', url('p2'), { cote: 256 })).statusCode, 403);
  const non = await w.req('antor', 'POST', url('p9'), { cote: 256 });
  assert.equal(non.statusCode, 400, non.body);
  assert.equal(non.json().code, 'non_liee');
  assert.equal(one(w.app, 'SELECT illustration_fichier_id i FROM fiches WHERE id = ?', f).i, null);
  const ok = await w.req('antor', 'POST', url('p2'), { cote: 256 });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.deepEqual(ok.json(), { fichierId: ok.json().fichierId, ficheId: f, titre: 'Vael II (colonie)' });
  const fiche = (await w.req('lea', 'GET', `${w.api}/fiches/${f}`)).json();
  assert.equal(fiche.illustration.id, ok.json().fichierId);
  const img = await w.req('lea', 'GET', `${w.api}/fichiers/${ok.json().fichierId}`);
  assert.equal(img.statusCode, 200);
  assert.ok(img.headers['content-type']!.toString().startsWith('image/'));
  assert.ok(img.rawPayload.length > 200);
  // The map is untouched by the illustration.
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle = ?', 'p2').f, f);
}, { timeout: 60_000 });

test('B-92 · « Illustrer la fiche » sur une fiche que Léa ne lit pas : le fichier lui reste fermé', async () => {
  const w = await monde();
  const secrete = w.fiche('Projet Zéphyr', false);
  w.astre(w.sys('vael', 'Vael', 62, 63), 'p3', 'Vael III', 5, 2);
  await w.lier('antor', 62, 63, 'astres', 'p3', secrete);
  const ok = await w.req('antor', 'POST', `${w.base}/62/63/astres/p3/illustrer-fiche`, { cote: 256 });
  assert.equal(ok.statusCode, 200, ok.body);
  const id = ok.json().fichierId;
  assert.equal(one(w.app, 'SELECT visibilite v FROM fichiers WHERE id = ?', id).v, 'mj');
  assert.equal((await w.req('antor', 'GET', `${w.api}/fiches/${secrete}`)).json().illustration.id, id);
  assert.ok([403, 404].includes((await w.req('lea', 'GET', `${w.api}/fichiers/${id}`)).statusCode));
  assert.equal((await w.req('lea', 'GET', `${w.api}/fiches/${secrete}`)).statusCode, 404);
}, { timeout: 60_000 });
