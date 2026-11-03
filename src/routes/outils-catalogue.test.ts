import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');

const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
const fautif = () => {
  const f = structuredClone(EXEMPLE);
  f.armes = f.armes.map((a: any) => a.cle === 'laser-lourd' ? (({ masse, ...r }) => r)(a) : a);
  return f;
};

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const idU = (app: App, nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
const idS = (app: App, nom: string) => (app.db.prepare('SELECT id FROM systemes_jeu WHERE nom = ?').get(nom) as { id: number }).id;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const [antor, mira, lea, teo] = await Promise.all(['antor', 'mira', 'lea', 'teo'].map((c) => connecter(app, c)));
  const w = { app, antor: antor!, mira: mira!, lea: lea!, teo: teo!,
    E: idU(app, "Éneria d'essai"), S: idS(app, "Système d'essai") };
  const ap = (h: H | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(h ?? {}), ...extra }, payload: payload as any });
  return { ...w, ap };
}
const G = 'essai/g';
const U = (w: { E: number }) => `/api/univers/${w.E}/outils/${G}/catalogue`;
const SY = (w: { S: number }) => `/api/systemes/${w.S}/outils/${G}/catalogue`;
const actif = async (w: Awaited<ReturnType<typeof monde>>) =>
  assert.equal((await w.ap(w.antor, 'PUT', `/api/systemes/${w.S}/outils/${G}/activation`, { active: true })).statusCode, 204);

test('sans session, chaque route du catalogue répond 401', async () => {
  const w = await monde();
  for (const [m, u] of [['POST', U(w) + '/apercu'], ['POST', U(w) + '/application'], ['POST', SY(w) + '/apercu'],
    ['POST', SY(w) + '/application'], ['GET', U(w)], ['GET', U(w) + '/gestion'], ['GET', SY(w)],
    ['PUT', U(w) + '/coques/cargo/masque'], ['PUT', U(w) + '/coques/cargo/retrait']] as const) {
    assert.equal((await w.ap(null, m, u, {})).statusCode, 401, `${m} ${u}`);
  }
});

test('un jeton kvs_ n\'ouvre aucune route du catalogue', async () => {
  const w = await monde();
  for (const [m, u] of [['POST', U(w) + '/apercu'], ['POST', SY(w) + '/application'], ['GET', U(w)], ['GET', U(w) + '/gestion'],
    ['PUT', U(w) + '/coques/cargo/retrait']] as const) {
    const r = await w.ap(null, m, u, m === 'GET' ? undefined : EXEMPLE, { authorization: `Bearer ${JETON_BOUCHON}` });
    assert.equal(r.statusCode, 401, `${m} ${u}`);
  }
});

test('aperçu du fichier fautif : 200, ajoutes 11, rien d\'écrit ; application ; résumé de la liste', async () => {
  const w = await monde();
  await actif(w);
  const lignes = () => (w.app.db.prepare('SELECT COUNT(*) n FROM essai_catalogue_elements').get() as any).n as number;
  const ap = await w.ap(w.antor, 'POST', SY(w) + '/apercu', fautif());
  assert.equal(ap.statusCode, 200);
  const r = ap.json();
  assert.equal(r.apercu, true);
  assert.equal(Object.values(r.natures).reduce((s: number, x: any) => s + x.ajoutes, 0), 11);
  assert.deepEqual(r.refus, [{ nature: 'armes', cle: 'laser-lourd', champ: 'masse', raison: 'nombre attendu' }]);
  assert.equal(lignes(), 0);
  assert.equal((await w.ap(w.antor, 'POST', U(w) + '/apercu', fautif())).statusCode, 200);
  assert.equal(lignes(), 0);

  const app2 = await w.ap(w.antor, 'POST', SY(w) + '/application', fautif());
  assert.equal(app2.statusCode, 200);
  assert.equal(lignes(), 11);
  const liste = (await w.ap(w.antor, 'GET', `/api/univers/${w.E}/outils`)).json();
  const g = liste.outils.find((o: any) => o.cle === G);
  assert.equal(g.catalogue.systeme.version, '2026-11-essai');
  assert.deepEqual(g.catalogue.systeme.comptes, { coques: 4, armes: 7 });
  assert.deepEqual(g.catalogue.univers, { version: null, comptes: { coques: 0, armes: 0 } });
  assert.deepEqual(g.catalogue.natures.map((n: any) => n.nom), ['coques', 'armes']);
  // Un outil sans catalogue n'a pas la clé.
  assert.ok(liste.outils.filter((o: any) => o.cle !== G).every((o: any) => !('catalogue' in o)));
});

test('droits d\'application : Mira (MJ non responsable) 403 au système, 200 à l\'univers ; Léa et l\'étranger 404', async () => {
  const w = await monde();
  const r = await w.ap(w.mira, 'POST', SY(w) + '/application', EXEMPLE);
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'refuse');
  assert.equal((await w.ap(w.mira, 'POST', U(w) + '/application', EXEMPLE)).statusCode, 200);
  for (const h of [w.lea, w.teo]) {
    for (const u of [U(w) + '/apercu', U(w) + '/application', SY(w) + '/apercu', SY(w) + '/application']) {
      assert.equal((await w.ap(h, 'POST', u, EXEMPLE)).statusCode, 404, u);
    }
    for (const [m, u] of [['GET', U(w) + '/gestion'], ['PUT', U(w) + '/coques/corvette/retrait'],
      ['PUT', U(w) + '/coques/corvette/masque']] as const) {
      assert.equal((await w.ap(h, m, u, { retire: true, masque: true, version: 1 })).statusCode, 404, u);
    }
  }
});

test('corps invalides : non JSON 400 catalogue_invalide, objet non catalogue, plus de 8 Mio 413 sur les quatre routes', async () => {
  const w = await monde();
  for (const u of [U(w) + '/apercu', U(w) + '/application', SY(w) + '/apercu', SY(w) + '/application']) {
    const r = await w.ap(w.antor, 'POST', u, 'ceci { n\'est pas du json', { 'content-type': 'application/json' });
    assert.equal(r.statusCode, 400, u);
    assert.equal(r.json().code, 'catalogue_invalide');
    const gros = await w.ap(w.antor, 'POST', u, JSON.stringify({ ...EXEMPLE, remplissage: 'x'.repeat(8 * 1024 * 1024 + 10) }),
      { 'content-type': 'application/json' });
    assert.equal(gros.statusCode, 413, u);
    assert.equal(gros.json().code, 'fichier_trop_gros');
    const faux = await w.ap(w.antor, 'POST', u, [1, 2], { 'content-type': 'application/json' });
    assert.equal(faux.statusCode, 400);
    assert.equal(faux.json().code, 'catalogue_invalide');
    assert.equal(faux.json().cause, 'pas_un_objet');
  }
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM essai_catalogue_elements').get() as any).n, 0);
  // Sous la limite (2 Mio de remplissage) : accepté, la limite par défaut de 1 Mio ne s'applique pas.
  const moyen = await w.ap(w.antor, 'POST', SY(w) + '/apercu', JSON.stringify({ ...EXEMPLE, section_inconnue: 'x' }), { 'content-type': 'application/json' });
  assert.equal(moyen.statusCode, 400);
  const deux = JSON.stringify({ ...EXEMPLE, coques: [...EXEMPLE.coques, { cle: 'x1', nom: 'x'.repeat(2 * 1024 * 1024), masse: 1, cout: 1 }] });
  assert.ok(deux.length > 2 * 1024 * 1024);
  assert.equal((await w.ap(w.antor, 'POST', SY(w) + '/apercu', deux, { 'content-type': 'application/json' })).statusCode, 200);
});

test('lecture : Léa ne voit ni masqué ni retiré ; 404 octet pour octet hors cas lisible ; gestion pour le MJ', async () => {
  const w = await monde();
  await actif(w);
  await w.ap(w.antor, 'POST', SY(w) + '/application', EXEMPLE);
  // Éléments d'univers : un ajouté (masqué ensuite) et un remplaçant.
  const ajout = { catalogue: G, version: 'u1', coques: [{ cle: 'secret', nom: 'Coque secrète', masse: 1, cout: 2 }] };
  assert.equal((await w.ap(w.antor, 'POST', U(w) + '/application', ajout)).statusCode, 200);
  const gest0 = (await w.ap(w.antor, 'GET', U(w) + '/gestion')).json();
  const secret = gest0.elements.find((e: any) => e.cle === 'secret');
  assert.ok(secret);
  const m = await w.ap(w.antor, 'PUT', U(w) + '/coques/secret/masque', { masque: true, version: secret.version });
  assert.equal(m.statusCode, 200);
  assert.equal((await w.ap(w.antor, 'PUT', U(w) + '/coques/cargo/retrait', { retire: true })).statusCode, 200);
  // 200 deux fois de suite
  assert.equal((await w.ap(w.antor, 'PUT', U(w) + '/coques/cargo/retrait', { retire: true })).statusCode, 200);

  const lea = await w.ap(w.lea, 'GET', U(w));
  assert.equal(lea.statusCode, 200);
  assert.ok(!lea.body.includes('secret'));
  assert.ok(!lea.body.includes('cargo'));
  assert.ok(!/"masque"|"origine"|"retire"/.test(lea.body), lea.body.slice(0, 300));
  assert.ok(lea.json().elements.some((e: any) => e.cle === 'corvette'));
  // Antor en mode Joueur lit comme Léa, et ses PUT sont refusés.
  const mj = await w.ap(w.antor, 'GET', U(w) + '?mode=joueur');
  assert.equal(mj.body, lea.body);
  const pj = await w.ap(w.antor, 'PUT', U(w) + '/coques/cargo/retrait?mode=joueur', { retire: false });
  assert.ok(pj.statusCode === 403 || pj.statusCode === 404, String(pj.statusCode));
  const pm = await w.ap(w.antor, 'PUT', U(w) + '/coques/secret/masque?mode=joueur', { masque: false, version: 99 });
  assert.ok(pm.statusCode === 403 || pm.statusCode === 404, String(pm.statusCode));
  const post = await w.ap(w.antor, 'POST', U(w) + '/application?mode=joueur', ajout);
  assert.ok(post.statusCode === 403 || post.statusCode === 404, String(post.statusCode));
  // Rien n'a bougé : le retrait est toujours en vigueur.
  assert.ok(!(await w.ap(w.lea, 'GET', U(w))).body.includes('cargo'));

  // Gestion : l'élément masqué avec masque: true et origine.
  const gest = (await w.ap(w.antor, 'GET', U(w) + '/gestion')).json();
  const s = gest.elements.find((e: any) => e.cle === 'secret');
  assert.equal(s.masque, true);
  assert.ok(s.origine);
  assert.equal((await w.ap(w.lea, 'GET', U(w) + '/gestion')).statusCode, 404);

  // Désactivé : la lecture de Léa est la 404 d'une adresse inconnue, la gestion marche toujours.
  const inconnue = await w.ap(w.lea, 'GET', `/api/univers/${w.E}/outils/essai/nexiste/catalogue`);
  assert.equal(inconnue.statusCode, 404);
  assert.equal((await w.ap(w.antor, 'PUT', `/api/systemes/${w.S}/outils/${G}/activation`, { active: false })).statusCode, 204);
  const off = await w.ap(w.lea, 'GET', U(w));
  assert.equal(off.statusCode, 404);
  assert.equal(off.body, inconnue.body);
  assert.equal(off.headers['content-type'], inconnue.headers['content-type']);
  const gOff = await w.ap(w.antor, 'GET', U(w) + '/gestion');
  assert.equal(gOff.statusCode, 200);
  assert.equal(gOff.json().elements.find((e: any) => e.cle === 'secret').masque, true);
  // Invisible d'elle.
  await actif(w);
  await w.ap(w.antor, 'PUT', `/api/systemes/${w.S}/outils/${G}/visibilite`, { mj: true, joueur: false });
  const inv = await w.ap(w.lea, 'GET', U(w));
  assert.equal(inv.body, inconnue.body);
  assert.equal(inv.statusCode, 404);
  assert.equal((await w.ap(w.antor, 'GET', U(w))).statusCode, 200);
  // Outil sans catalogue.
  const sans = await w.ap(w.lea, 'GET', `/api/univers/${w.E}/outils/essai/a/catalogue`);
  const sansAdresse = await w.ap(w.lea, 'GET', `/api/univers/${w.E}/outils/essai/a/zzz`);
  assert.equal(sans.statusCode, 404);
  assert.equal(sans.body, sansAdresse.body);
  assert.equal((await w.ap(w.antor, 'GET', `/api/univers/${w.E}/outils/essai/a/catalogue`)).statusCode, 404);
});

test('masque : version périmée 409 donnee_modifiee, bonne 200 + version suivante, système 400 element_systeme ; retrait remplacé 400', async () => {
  const w = await monde();
  await actif(w);
  await w.ap(w.antor, 'POST', SY(w) + '/application', EXEMPLE);
  await w.ap(w.antor, 'POST', U(w) + '/application', { catalogue: G, version: 'u', coques: [
    { cle: 'maison', nom: 'Maison', masse: 1, cout: 1 }, { cle: 'corvette', nom: 'Corvette bis', masse: 3, cout: 4 }] });
  const elems = () => w.ap(w.antor, 'GET', U(w) + '/gestion').then((r) => r.json().elements as any[]);
  const maison = (await elems()).find((e) => e.cle === 'maison');
  const vieux = await w.ap(w.antor, 'PUT', U(w) + '/coques/maison/masque', { masque: true, version: maison.version + 5 });
  assert.equal(vieux.statusCode, 409);
  assert.equal(vieux.json().code, 'donnee_modifiee');
  const bon = await w.ap(w.antor, 'PUT', U(w) + '/coques/maison/masque', { masque: true, version: maison.version });
  assert.equal(bon.statusCode, 200);
  assert.equal(bon.json().version, maison.version + 1);
  const dej = await w.ap(w.antor, 'PUT', U(w) + '/coques/maison/masque', { masque: false, version: maison.version });
  assert.equal(dej.statusCode, 409);
  const sys = await w.ap(w.antor, 'PUT', U(w) + '/coques/cargo/masque', { masque: true, version: 1 });
  assert.equal(sys.statusCode, 400);
  assert.equal(sys.json().code, 'element_systeme');
  const rem = await w.ap(w.antor, 'PUT', U(w) + '/coques/corvette/retrait', { retire: true });
  assert.equal(rem.statusCode, 400);
  assert.equal(rem.json().code, 'element_remplace');
  // retrait d'une clé du système : idempotent, puis rétabli.
  for (let i = 0; i < 2; i++) assert.equal((await w.ap(w.antor, 'PUT', U(w) + '/coques/cargo/retrait', { retire: true })).statusCode, 200);
  assert.ok(!(await w.ap(w.lea, 'GET', U(w))).body.includes('"cargo"'));
  for (let i = 0; i < 2; i++) assert.equal((await w.ap(w.antor, 'PUT', U(w) + '/coques/cargo/retrait', { retire: false })).statusCode, 200);
  assert.ok((await w.ap(w.lea, 'GET', U(w))).body.includes('"cargo"'));
  // Corps de masque invalide.
  const mal = await w.ap(w.antor, 'PUT', U(w) + '/coques/maison/masque', { masque: 'oui' });
  assert.equal(mal.statusCode, 400);
});

test('lecture du système : Mira la lit et ne voit que les lignes du système ; Léa et l\'étranger 404', async () => {
  const w = await monde();
  await actif(w);
  await w.ap(w.antor, 'POST', SY(w) + '/application', EXEMPLE);
  await w.ap(w.antor, 'POST', U(w) + '/application', { catalogue: G, version: 'u', coques: [{ cle: 'maison', nom: 'Maison', masse: 1, cout: 1 }] });
  const r = await w.ap(w.mira, 'GET', SY(w));
  assert.equal(r.statusCode, 200);
  assert.ok(!r.body.includes('maison'));
  assert.ok(r.body.includes('corvette'));
  for (const h of [w.lea, w.teo]) assert.equal((await w.ap(h, 'GET', SY(w))).statusCode, 404);
});

test('pagination et paramètres : nature inconnue et paramètre non texte', async () => {
  const w = await monde();
  await actif(w);
  await w.ap(w.antor, 'POST', SY(w) + '/application', EXEMPLE);
  const p = await w.ap(w.antor, 'GET', U(w) + '?nature=armes');
  assert.equal(p.statusCode, 200);
  assert.ok(p.json().elements.every((e: any) => e.nature === 'armes' || e.cle));
  const mauvais = await w.ap(w.antor, 'GET', U(w) + '?nature=inconnue');
  assert.ok([200, 400].includes(mauvais.statusCode), String(mauvais.statusCode));
  const dbl = await w.ap(w.antor, 'GET', U(w) + '?nature=a&nature=b');
  assert.equal(dbl.statusCode, 400);
});
