// Tests d'ensemble de kanevas-systemes-jeu-elements, écrits depuis le besoin (B-113, B-114, B-119, B-120, critère de la fiche),
// à la porte de chaque effet : routes réelles, base réelle, mode bouchon. Les attendus sont des littéraux tirés de la doc du produit.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c, `connexion de ${compte}`);
  return { cookie: `kanevas_session=${c.value}` };
}

const appel = (app: App, h: H, method: Verbe, url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
const lignes = (j: Any): Any[] => (Array.isArray(j) ? j : (j.fiches ?? j.items ?? j.resultats ?? []));

// Antor est MJ de l'univers « Lame » et a créé le système « Zeta » en le rattachant ; Léa y est joueuse ; Mira est ajoutée
// aux MJ du système par l'admin sans appartenir à aucun univers ; Téo n'a aucun lien.
async function monde() {
  const app = await buildApp();
  const h = {
    antor: await connecter(app, 'antor'),
    lea: await connecter(app, 'lea'),
    mira: await connecter(app, 'mira'),
    teo: await connecter(app, 'teo'),
    admin: await connecter(app, 'admin'),
  };
  const lame = (await appel(app, h.antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  assert.equal((await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' })).statusCode, 201);
  const sys = (await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  const ajout = await appel(app, h.admin, 'POST', `/api/instance/systemes/${sys.id}/membres`, { username: 'mira' });
  assert.equal(ajout.statusCode, 201, ajout.body);
  const miraId = (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get('mira') as { id: number }).id;
  return { app, h, lame, sys, base: `/api/systemes/${sys.id}`, miraId };
}

async function pistolet(w: Awaited<ReturnType<typeof monde>>) {
  const cree = await appel(w.app, w.h.mira, 'POST', `${w.base}/fiches`, {
    type: 'objet',
    titre: 'Pistolet laser',
    sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Forge secrète', joueursLisent: false }],
  });
  assert.equal(cree.statusCode, 201, cree.body);
  const f = cree.json();
  const v = (await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${f.id}`)).json();
  const [pub, mj] = v.sections as { id: number; version: number }[];
  const ecrire = async (s: { id: number; version: number }, contenu: string) =>
    assert.equal((await appel(w.app, w.h.mira, 'PUT', `${w.base}/fiches/${f.id}/sections/${s.id}/contenu`, { contenu, version: s.version })).statusCode, 200);
  await ecrire(pub!, 'Dégâts 1d8, portée quarante mètres');
  await ecrire(mj!, 'Cristal de Vorsk');
  return { f, pub: pub!, mj: mj! };
}

test('B-113 : un MJ du système crée un objet avec deux sections et le relit entier ; il le renomme', async () => {
  const w = await monde();
  const { f } = await pistolet(w);
  const v = (await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${f.id}`)).json();
  assert.equal(v.titre, 'Pistolet laser');
  assert.equal(v.type, 'objet');
  assert.deepEqual(v.sections.map((s: Any) => [s.titre, s.contenu]), [['Description', 'Dégâts 1d8, portée quarante mètres'], ['Forge secrète', 'Cristal de Vorsk']]);
  const ren = await appel(w.app, w.h.mira, 'PATCH', `${w.base}/fiches/${f.id}`, { titre: 'Pistolet à ions' });
  assert.equal(ren.statusCode, 200, ren.body);
  assert.equal((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${f.id}`)).json().titre, 'Pistolet à ions');
  const liste = lignes((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches`)).json());
  assert.deepEqual(liste.map((l: Any) => l.titre), ['Pistolet à ions']);
  await w.app.close();
});

test('B-113 échec : titre vide ou type inconnu refusés (400), rien n’est créé', async () => {
  const w = await monde();
  const vide = await appel(w.app, w.h.mira, 'POST', `${w.base}/fiches`, { type: 'objet', titre: '' });
  assert.equal(vide.statusCode, 400, vide.body);
  const inconnu = await appel(w.app, w.h.mira, 'POST', `${w.base}/fiches`, { type: 'inexistant', titre: 'X' });
  assert.equal(inconnu.statusCode, 400, inconnu.body);
  assert.deepEqual(lignes((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches`)).json()), []);
  await w.app.close();
});

test('B-114 exclusion : le créateur du système, membre d’un univers rattaché mais pas MJ du système, reçoit 403 en écrivant', async () => {
  const w = await monde();
  const { f, pub } = await pistolet(w);
  const cible = `${w.base}/fiches/${f.id}`;
  assert.equal((await appel(w.app, w.h.antor, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Intrus' })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.antor, 'PATCH', cible, { titre: 'Pris' })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `${cible}/sections/${pub.id}/contenu`, { contenu: 'pris', version: pub.version + 1 })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.antor, 'DELETE', cible)).statusCode, 403);
  // rien n'a bougé
  const v = (await appel(w.app, w.h.mira, 'GET', cible)).json();
  assert.equal(v.titre, 'Pistolet laser');
  assert.equal(v.sections[0].contenu, 'Dégâts 1d8, portée quarante mètres');
  await w.app.close();
});

test('B-114 exclusion : le créateur qui n’est membre d’aucun univers rattaché reçoit 404 en écrivant, et ne voit plus le système', async () => {
  const w = await monde();
  const { f } = await pistolet(w);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: null })).statusCode, 204);
  assert.equal((await appel(w.app, w.h.antor, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Intrus' })).statusCode, 404);
  assert.equal((await appel(w.app, w.h.antor, 'DELETE', `${w.base}/fiches/${f.id}`)).statusCode, 404);
  assert.equal((await appel(w.app, w.h.antor, 'GET', `${w.base}/fiches/${f.id}`)).statusCode, 404);
  // Mira, MJ du système sans univers rattaché, le garde en liste
  const liste = (await appel(w.app, w.h.mira, 'GET', '/api/systemes')).json() as Any[];
  const z = liste.find((s) => s.id === w.sys.id);
  assert.ok(z, 'le système de Mira est listé sans univers');
  assert.equal(z.nbUnivers, 0);
  assert.deepEqual(z.mesUnivers, []);
  assert.equal(z.peutEcrire, true);
  // Léa n'a plus de lien : le système disparaît de sa liste
  assert.equal(((await appel(w.app, w.h.lea, 'GET', '/api/systemes')).json() as Any[]).some((s) => s.id === w.sys.id), false);
  await w.app.close();
});

test('B-119 : une joueuse de l’univers rattaché lit l’élément, sections lisibles des joueurs seulement, et reçoit 403 en écrivant', async () => {
  const w = await monde();
  const { f, pub } = await pistolet(w);
  const cible = `${w.base}/fiches/${f.id}`;
  const v = (await appel(w.app, w.h.lea, 'GET', cible)).json();
  assert.equal(v.titre, 'Pistolet laser');
  assert.deepEqual(v.sections.map((s: Any) => [s.titre, s.html]), [['Description', '<p>Dégâts 1d8, portée quarante mètres</p>\n']]);
  assert.ok(!JSON.stringify(v).includes('Cristal de Vorsk'), 'le secret ne fuit pas');
  assert.ok(!JSON.stringify(v).includes('Forge secrète'), 'le titre de la section réservée ne fuit pas');
  const liste = lignes((await appel(w.app, w.h.lea, 'GET', `${w.base}/fiches`)).json());
  assert.deepEqual(liste.map((l: Any) => l.titre), ['Pistolet laser']);
  assert.equal((await appel(w.app, w.h.lea, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Intrus' })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.lea, 'PATCH', cible, { titre: 'Pris' })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.lea, 'PUT', `${cible}/sections/${pub.id}/contenu`, { contenu: 'pris', version: pub.version + 1 })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.lea, 'DELETE', cible)).statusCode, 403);
  await w.app.close();
});

test('B-119 bord : un élément dont aucune section n’est lisible des joueurs est introuvable (404) pour la joueuse, ouvert pour le MJ du système', async () => {
  const w = await monde();
  const cree = await appel(w.app, w.h.mira, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Plan caché', sections: [{ titre: 'Secret', joueursLisent: false }] });
  assert.equal(cree.statusCode, 201, cree.body);
  assert.equal((await appel(w.app, w.h.lea, 'GET', `${w.base}/fiches/${cree.json().id}`)).statusCode, 404);
  assert.equal((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${cree.json().id}`)).statusCode, 200);
  await w.app.close();
});

test('B-113 exclusion : un compte sans lien reçoit 404 partout ; un MJ d’un autre système n’y écrit pas', async () => {
  const w = await monde();
  const { f } = await pistolet(w);
  for (const [m, u, p] of [
    ['GET', `${w.base}`, undefined],
    ['GET', `${w.base}/fiches`, undefined],
    ['GET', `${w.base}/fiches/${f.id}`, undefined],
    ['POST', `${w.base}/fiches`, { type: 'objet', titre: 'X' }],
    ['PATCH', `${w.base}/fiches/${f.id}`, { titre: 'X' }],
    ['DELETE', `${w.base}/fiches/${f.id}`, undefined],
  ] as [Verbe, string, object | undefined][]) {
    assert.equal((await appel(w.app, w.h.teo, m, u, p)).statusCode, 404, `${m} ${u}`);
  }
  await w.app.close();
});

test('AD-156 : les routes de gabarits répondent 404 à tous, même au MJ du système', async () => {
  const w = await monde();
  for (const who of [w.h.mira, w.h.antor, w.h.admin]) {
    assert.equal((await appel(w.app, who, 'GET', `${w.base}/gabarits`)).statusCode, 404);
    assert.equal((await appel(w.app, who, 'POST', `${w.base}/gabarits`, { type: 'objet', nom: 'X', contenu: 'c' })).statusCode, 404);
  }
  await w.app.close();
});

test('AD-152 : PUT …/types/:type est réservé aux MJ du système (403 à un MJ d’univers rattaché, 404 sans lien)', async () => {
  const w = await monde();
  const url = `${w.base}/types/objet`;
  assert.equal((await appel(w.app, w.h.antor, 'PUT', url, { active: false })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.lea, 'PUT', url, { active: false })).statusCode, 403);
  assert.equal((await appel(w.app, w.h.teo, 'PUT', url, { active: false })).statusCode, 404);
  const ok = await appel(w.app, w.h.mira, 'PUT', url, { active: false });
  assert.equal(ok.statusCode, 200, ok.body);
  const sys = (await appel(w.app, w.h.mira, 'GET', w.base)).json();
  assert.deepEqual(sys.types.filter((t: Any) => t.type === 'objet'), [{ type: 'objet', active: false }]);
  await w.app.close();
});

test('B-114 : l’admin retire le dernier MJ ; plus personne ne peut écrire, la lecture reste', async () => {
  const w = await monde();
  const { f } = await pistolet(w);
  const liste = (await appel(w.app, w.h.admin, 'GET', `/api/instance/systemes/${w.sys.id}/membres`)).json() as Any[];
  assert.deepEqual(liste.map((m) => m.username), ['mira']);
  assert.equal((await appel(w.app, w.h.admin, 'DELETE', `/api/instance/systemes/${w.sys.id}/membres/${w.miraId}`)).statusCode, 204);
  assert.deepEqual((await appel(w.app, w.h.admin, 'GET', `/api/instance/systemes/${w.sys.id}/membres`)).json(), []);
  const reste = ((await appel(w.app, w.h.admin, 'GET', '/api/instance/systemes')).json() as Any[]).find((s) => s.id === w.sys.id);
  assert.deepEqual(reste, { id: w.sys.id, nom: 'Zeta', nbUnivers: 1, nbMJ: 0 });
  for (const who of [w.h.antor, w.h.mira, w.h.lea]) {
    const r = await appel(w.app, who, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Intrus' });
    assert.ok(r.statusCode === 403 || r.statusCode === 404, String(r.statusCode));
  }
  assert.equal((await appel(w.app, w.h.lea, 'GET', `${w.base}/fiches/${f.id}`)).statusCode, 200);
  await w.app.close();
});

test('B-114 échec : compte inconnu, doublon, retrait d’un non-MJ refusés sans changer la liste ; un non-admin reçoit 404', async () => {
  const w = await monde();
  const base = `/api/instance/systemes/${w.sys.id}/membres`;
  const inconnu = await appel(w.app, w.h.admin, 'POST', base, { username: 'personne-ici' });
  assert.ok(inconnu.statusCode >= 400 && inconnu.statusCode < 500, String(inconnu.statusCode));
  const doublon = await appel(w.app, w.h.admin, 'POST', base, { username: 'mira' });
  assert.ok(doublon.statusCode >= 400 && doublon.statusCode < 500, String(doublon.statusCode));
  assert.equal(((await appel(w.app, w.h.admin, 'GET', base)).json() as Any[]).length, 1);
  assert.equal((await appel(w.app, w.h.admin, 'DELETE', `${base}/999999`)).statusCode, 404);
  assert.equal((await appel(w.app, w.h.admin, 'POST', '/api/instance/systemes/999999/membres', { username: 'lea' })).statusCode, 404);
  for (const who of [w.h.antor, w.h.mira, w.h.lea]) {
    assert.equal((await appel(w.app, who, 'GET', '/api/instance/systemes')).statusCode, 404);
    assert.equal((await appel(w.app, who, 'GET', base)).statusCode, 404);
    assert.equal((await appel(w.app, who, 'POST', base, { username: 'lea' })).statusCode, 404);
    assert.equal((await appel(w.app, who, 'DELETE', `${base}/${w.miraId}`)).statusCode, 404);
  }
  assert.equal(((await appel(w.app, w.h.admin, 'GET', base)).json() as Any[]).length, 1);
  await w.app.close();
});

test('B-114 : l’admin ajoute un compte aux MJ et ce compte écrit aussitôt ; le retirer lui ôte l’écriture', async () => {
  const w = await monde();
  const base = `/api/instance/systemes/${w.sys.id}/membres`;
  assert.equal((await appel(w.app, w.h.teo, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Avant' })).statusCode, 404);
  assert.equal((await appel(w.app, w.h.admin, 'POST', base, { username: 'teo' })).statusCode, 201);
  assert.equal((await appel(w.app, w.h.teo, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Pendant', sections: [{ titre: 'Texte', joueursLisent: true }] })).statusCode, 201);
  const teoId = (w.app.db.prepare('SELECT id FROM comptes WHERE username = ?').get('teo') as { id: number }).id;
  assert.equal((await appel(w.app, w.h.admin, 'DELETE', `${base}/${teoId}`)).statusCode, 204);
  assert.equal((await appel(w.app, w.h.teo, 'POST', `${w.base}/fiches`, { type: 'objet', titre: 'Après' })).statusCode, 404);
  await w.app.close();
});

test('P-27 étape 3 : l’élément entre dans la liste et la recherche de l’univers rattaché, une ligne, sans fuite de la section réservée', async () => {
  const w = await monde();
  const { f } = await pistolet(w);
  const u = `/api/univers/${w.lame.id}/fiches`;
  const liste = lignes((await appel(w.app, w.h.lea, 'GET', u)).json());
  assert.equal(liste.filter((l) => l.titre === 'Pistolet laser').length, 1, 'une ligne par élément');
  const trouve = lignes((await appel(w.app, w.h.lea, 'GET', `${u}?q=pistolet`)).json());
  assert.deepEqual(trouve.map((l) => l.titre), ['Pistolet laser']);
  const dedans = lignes((await appel(w.app, w.h.lea, 'GET', `${u}?q=quarante`)).json());
  assert.deepEqual(dedans.map((l) => l.titre), ['Pistolet laser']);
  const secret = lignes((await appel(w.app, w.h.lea, 'GET', `${u}?q=Vorsk`)).json());
  assert.deepEqual(secret, [], 'un mot seulement dans la section réservée ne trouve rien');
  // l'élément s'ouvre depuis l'univers, lecture seule : l'écriture est refusée
  const ouvert = await appel(w.app, w.h.lea, 'GET', `${u}/${f.id}`);
  assert.equal(ouvert.statusCode, 200, ouvert.body);
  assert.equal(ouvert.json().titre, 'Pistolet laser');
  assert.ok(!JSON.stringify(ouvert.json()).includes('Vorsk'));
  assert.equal((await appel(w.app, w.h.lea, 'PATCH', `${u}/${f.id}`, { titre: 'Pris' })).statusCode >= 400, true);
  assert.equal((await appel(w.app, w.h.antor, 'PATCH', `${u}/${f.id}`, { titre: 'Pris' })).statusCode >= 400, true, 'même un MJ d’univers ne l’écrit pas par l’univers');
  assert.equal((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${f.id}`)).json().titre, 'Pistolet laser');
  await w.app.close();
});

test('P-27 exclusion : un univers non rattaché ne voit pas l’élément ; détacher l’univers le retire de sa liste', async () => {
  const w = await monde();
  await pistolet(w);
  const autre = (await appel(w.app, w.h.teo, 'POST', '/api/univers', { nom: 'Ailleurs' })).json();
  assert.deepEqual(lignes((await appel(w.app, w.h.teo, 'GET', `/api/univers/${autre.id}/fiches`)).json()).filter((l) => l.titre === 'Pistolet laser'), []);
  assert.deepEqual(lignes((await appel(w.app, w.h.teo, 'GET', `/api/univers/${autre.id}/fiches?q=pistolet`)).json()), []);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: null })).statusCode, 204);
  assert.deepEqual(lignes((await appel(w.app, w.h.lea, 'GET', `/api/univers/${w.lame.id}/fiches?q=pistolet`)).json()), []);
  await w.app.close();
});

test('B-120 : supprimer un élément sans copie le retire du système et des listes de l’univers', async () => {
  const w = await monde();
  const { f } = await pistolet(w);
  assert.equal((await appel(w.app, w.h.mira, 'DELETE', `${w.base}/fiches/${f.id}`)).statusCode, 204);
  assert.equal((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${f.id}`)).statusCode, 404);
  assert.deepEqual(lignes((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches`)).json()), []);
  assert.deepEqual(lignes((await appel(w.app, w.h.lea, 'GET', `/api/univers/${w.lame.id}/fiches?q=pistolet`)).json()), []);
  assert.equal((await appel(w.app, w.h.mira, 'DELETE', `${w.base}/fiches/${f.id}`)).statusCode, 404, 'une seconde suppression : introuvable');
  await w.app.close();
});

test('AD-151 exclusion : l’espace caché n’est listé nulle part et on n’y entre pas comme dans un univers', async () => {
  const w = await monde();
  await pistolet(w);
  const espace = (w.app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(w.sys.id) as { id: number } | undefined)?.id;
  assert.ok(espace, 'le système a son espace');
  for (const [who, url] of [[w.h.antor, '/api/univers'], [w.h.mira, '/api/univers'], [w.h.lea, '/api/univers'], [w.h.admin, '/api/univers'], [w.h.admin, '/api/instance/univers']] as [H, string][]) {
    const l = (await appel(w.app, who, 'GET', url)).json() as Any[];
    assert.equal(l.some((u) => u.id === espace), false, url);
  }
  for (const who of [w.h.mira, w.h.antor, w.h.admin, w.h.lea]) {
    assert.equal((await appel(w.app, who, 'GET', `/api/univers/${espace}`)).statusCode, 404);
    assert.equal((await appel(w.app, who, 'GET', `/api/univers/${espace}/fiches`)).statusCode, 404);
  }
  await w.app.close();
});

test('AD-151 : un système créé a son espace dès la création, sans MJ ; un second système a le sien', async () => {
  const w = await monde();
  const z2 = (await appel(w.app, w.h.antor, 'POST', '/api/systemes', { nom: 'Omega' }));
  assert.equal(z2.statusCode, 201, z2.body);
  const n = (w.app.db.prepare('SELECT COUNT(*) n FROM univers WHERE espace_systeme_id IS NOT NULL').get() as { n: number }).n;
  assert.equal(n, 2);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM membres WHERE univers_id IN (SELECT id FROM univers WHERE espace_systeme_id = ?)').get(z2.json().id) as { n: number }).n, 0);
  await w.app.close();
});
