// Tests d'ensemble de kanevas-systemes-jeu-surcharge, écrits depuis le besoin (B-115, B-116, B-120, P-27 étapes 4, 6, 7, 8,
// critère de la fiche), à la porte de chaque effet : routes réelles, base réelle, mode bouchon. Les attendus sont des
// littéraux tirés de la doc du produit (docs/parcours.md, docs/donnees.md), jamais de ce que le code rend.
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
const titres = (j: Any): string[] => lignes(j).map((l) => l.titre);

// Antor est MJ de quatre univers (Lame = 1, puis Brume, Cendre, Dune) tous rattachés au système « Zeta » ; Léa est joueuse de
// Lame et de Cendre ; Mira est MJ du système, sans aucun univers ; Téo est MJ d'un univers sans lien avec Zeta.
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
  const sys = (await appel(app, h.antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  const autres: Any[] = [];
  for (const nom of ['Brume', 'Cendre', 'Dune']) {
    const u = (await appel(app, h.antor, 'POST', '/api/univers', { nom })).json();
    assert.equal((await appel(app, h.antor, 'PUT', `/api/univers/${u.id}/systeme`, { systemeId: sys.id })).statusCode, 204);
    autres.push(u);
  }
  const [brume, cendre, dune] = autres;
  for (const u of [lame, cendre]) assert.equal((await appel(app, h.antor, 'POST', `/api/univers/${u.id}/membres`, { username: 'lea' })).statusCode, 201);
  assert.equal((await appel(app, h.admin, 'POST', `/api/instance/systemes/${sys.id}/membres`, { username: 'mira' })).statusCode, 201);
  const ailleurs = (await appel(app, h.teo, 'POST', '/api/univers', { nom: 'Ailleurs' })).json();
  const base = `/api/systemes/${sys.id}`;
  const cree = await appel(app, h.mira, 'POST', `${base}/fiches`, {
    type: 'objet',
    titre: 'Pistolet laser',
    sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Forge secrète', joueursLisent: false }],
  });
  assert.equal(cree.statusCode, 201, cree.body);
  const el = cree.json();
  const v = (await appel(app, h.mira, 'GET', `${base}/fiches/${el.id}`)).json();
  for (const [i, texte] of ['Dégâts 1d8, portée quarante mètres', 'Cristal de Vorsk'].entries()) {
    const r = await appel(app, h.mira, 'PUT', `${base}/fiches/${el.id}/sections/${v.sections[i].id}/contenu`, { contenu: texte, version: v.sections[i].version });
    assert.equal(r.statusCode, 200, r.body);
  }
  const u = (univers: { id: number }) => `/api/univers/${univers.id}/fiches`;
  const lire = async (h2: H, univers: { id: number }, fid: number) => (await appel(app, h2, 'GET', `${u(univers)}/${fid}`)).json();
  return { app, h, lame, brume, cendre, dune, ailleurs, sys, base, el, u, lire };
}
type Monde = Awaited<ReturnType<typeof monde>>;

const personnaliser = (w: Monde, h: H, univers: { id: number }, suffixe = '') =>
  appel(w.app, h, 'POST', `${w.u(univers)}/${w.el.id}/personnaliser${suffixe}`);

// Réécrit la première section de la copie d'une fiche d'un univers.
async function ecrireSection(w: Monde, h: H, univers: { id: number }, fid: number, contenu: string, rang = 0) {
  const v = await w.lire(h, univers, fid);
  const s = v.sections[rang];
  const r = await appel(w.app, h, 'PUT', `${w.u(univers)}/${fid}/sections/${s.id}/contenu`, { contenu, version: s.version });
  assert.equal(r.statusCode, 200, r.body);
}

async function personnalisee(w: Monde, univers: { id: number } = w.lame, contenu = 'Dégâts 2d6, portée vingt mètres') {
  const r = await personnaliser(w, w.h.antor, univers);
  assert.equal(r.statusCode, 201, r.body);
  const copie = r.json();
  await ecrireSection(w, w.h.antor, univers, copie.id, contenu);
  return copie;
}

const ORIGINAL = 'Dégâts 1d8, portée quarante mètres';
const MODIFIE = 'Dégâts 2d6, portée vingt mètres';
// Le texte lu : la source Markdown pour qui l'écrit, sinon le texte rendu (une joueuse ne reçoit que le rendu).
const contenuDe = (v: Any) => (v.sections as Any[]).map((s) => s.contenu ?? String(s.html).replace(/<[^>]+>/g, '').trim()).join('|');

test('B-115 critère : une copie faite dans l’univers 1 change la lecture de l’univers 1 seul, les univers 2 à 4 et le système lisent l’original', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  assert.notEqual(copie.id, w.el.id, 'la copie est une fiche à part');
  // l'univers 1 : une seule entrée, la version modifiée, pour le MJ comme pour la joueuse
  for (const h of [w.h.antor, w.h.lea]) {
    const liste = await appel(w.app, h, 'GET', w.u(w.lame));
    assert.deepEqual(titres(liste.json()), ['Pistolet laser']);
    assert.equal(contenuDe(await w.lire(h, w.lame, copie.id)), MODIFIE);
  }
  // les univers 2 à 4 lisent l'original, au niveau joueur
  for (const [h, u] of [[w.h.antor, w.brume], [w.h.lea, w.cendre], [w.h.antor, w.dune]] as const) {
    assert.deepEqual(titres((await appel(w.app, h, 'GET', w.u(u))).json()), ['Pistolet laser']);
    assert.equal(contenuDe(await w.lire(h, u, w.el.id)), ORIGINAL);
  }
  // le système n'a pas bougé
  const sys = (await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${w.el.id}`)).json();
  assert.equal(contenuDe(sys), `${ORIGINAL}|Cristal de Vorsk`);
  await w.app.close();
});

test('B-115 bord : « personnaliser » deux fois rend la même copie, 201 puis 200, et il n’y en a qu’une', async () => {
  const w = await monde();
  const a = await personnaliser(w, w.h.antor, w.lame);
  const b = await personnaliser(w, w.h.antor, w.lame);
  assert.equal(a.statusCode, 201, a.body);
  assert.equal(b.statusCode, 200, b.body);
  assert.equal(b.json().id, a.json().id);
  const n = w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE univers_id = ? AND surcharge_de = ?').get(w.lame.id, w.el.id) as { n: number };
  assert.equal(n.n, 1);
  assert.equal(lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json()).length, 1);
  await w.app.close();
});

test('B-115 bord : la copie naît avec le titre, le type et la section lisible des joueurs, et sans la section réservée au MJ du système', async () => {
  const w = await monde();
  const r = await personnaliser(w, w.h.antor, w.lame);
  const copie = await w.lire(w.h.antor, w.lame, r.json().id);
  assert.equal(copie.titre, 'Pistolet laser');
  assert.equal(copie.type, 'objet');
  assert.deepEqual(copie.sections.map((s: Any) => [s.titre, s.contenu]), [['Description', ORIGINAL]]);
  assert.ok(!JSON.stringify(copie).includes('Vorsk'));
  assert.ok(!JSON.stringify(copie).includes('Forge secrète'));
  // le mot du secret ne trouve rien dans l'univers, même pour son MJ
  assert.deepEqual(lignes((await appel(w.app, w.h.antor, 'GET', `${w.u(w.lame)}?q=Vorsk`)).json()), []);
  // la joueuse lit la copie comme une fiche d'univers, sans pouvoir l'écrire
  assert.equal((await appel(w.app, w.h.lea, 'PATCH', `${w.u(w.lame)}/${r.json().id}`, { titre: 'Pris' })).statusCode >= 400, true);
  await w.app.close();
});

test('B-115 : le MJ renomme et complète sa copie ; le système et les autres univers gardent titre et sections', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  assert.equal((await appel(w.app, w.h.antor, 'PATCH', `${w.u(w.lame)}/${copie.id}`, { titre: 'Pistolet de Lame' })).statusCode, 200);
  const ajout = await appel(w.app, w.h.antor, 'POST', `${w.u(w.lame)}/${copie.id}/sections`, { titre: 'Légende' });
  assert.ok(ajout.statusCode < 300, ajout.body);
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json()), ['Pistolet de Lame']);
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.brume))).json()), ['Pistolet laser']);
  const sys = (await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${w.el.id}`)).json();
  assert.equal(sys.titre, 'Pistolet laser');
  assert.deepEqual(sys.sections.map((s: Any) => s.titre), ['Description', 'Forge secrète']);
  await w.app.close();
});

test('B-115 échec : une joueuse reçoit 403 en personnalisant et en revenant, rien n’est créé ni supprimé', async () => {
  const w = await monde();
  const refus = await personnaliser(w, w.h.lea, w.lame);
  assert.equal(refus.statusCode, 403, refus.body);
  const n = () => (w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n;
  assert.equal(n(), 0);
  const copie = await personnalisee(w);
  const dep = await appel(w.app, w.h.lea, 'DELETE', `${w.u(w.lame)}/${w.el.id}/personnalisation`);
  assert.equal(dep.statusCode, 403, dep.body);
  const dep2 = await appel(w.app, w.h.lea, 'DELETE', `${w.u(w.lame)}/${copie.id}/personnalisation`);
  assert.equal(dep2.statusCode, 403, dep2.body);
  assert.equal(n(), 1, 'la copie est toujours là');
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, copie.id)), MODIFIE);
  await w.app.close();
});

test('B-115 exclusion : un MJ en mode joueur reçoit 403 sur personnaliser et sur revenir', async () => {
  const w = await monde();
  const refus = await personnaliser(w, w.h.antor, w.lame, '?mode=joueur');
  assert.equal(refus.statusCode, 403, refus.body);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n, 0);
  const copie = await personnalisee(w);
  const dep = await appel(w.app, w.h.antor, 'DELETE', `${w.u(w.lame)}/${copie.id}/personnalisation?mode=joueur`);
  assert.equal(dep.statusCode, 403, dep.body);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, copie.id)), MODIFIE);
  await w.app.close();
});

test('B-115 exclusion : on ne personnalise pas un élément inconnu, une fiche ordinaire, ni depuis un univers sans ce système ou étranger', async () => {
  const w = await monde();
  const inconnu = await appel(w.app, w.h.antor, 'POST', `${w.u(w.lame)}/99999/personnaliser`);
  assert.equal(inconnu.statusCode, 404, inconnu.body);
  const ordinaire = (await appel(w.app, w.h.antor, 'POST', w.u(w.lame), { type: 'objet', titre: 'Épée' })).json();
  const sur = await appel(w.app, w.h.antor, 'POST', `${w.u(w.lame)}/${ordinaire.id}/personnaliser`);
  assert.ok(sur.statusCode >= 400 && sur.statusCode < 500, `fiche ordinaire : ${sur.statusCode}`);
  // l'univers de Téo n'est pas rattaché à Zeta
  const etranger = await personnaliser(w, w.h.teo, w.ailleurs);
  assert.ok(etranger.statusCode >= 400 && etranger.statusCode < 500, `univers sans le système : ${etranger.statusCode}`);
  // Téo ne personnalise pas dans l'univers d'Antor
  const intrus = await personnaliser(w, w.h.teo, w.lame);
  assert.ok(intrus.statusCode >= 400 && intrus.statusCode < 500, `MJ étranger : ${intrus.statusCode}`);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n, 0);
  await w.app.close();
});

test('B-115 / P-27 étape 6 : « revenir » supprime la copie seule ; l’entrée redevient l’élément, les autres univers et le système n’ont pas bougé', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  await personnalisee(w, w.brume, 'Dégâts 3d4, portée dix mètres');
  const r = await appel(w.app, w.h.antor, 'DELETE', `${w.u(w.lame)}/${copie.id}/personnalisation`);
  assert.ok(r.statusCode === 200 || r.statusCode === 204, `revenir : ${r.statusCode} ${r.body}`);
  assert.equal((await appel(w.app, w.h.antor, 'GET', `${w.u(w.lame)}/${copie.id}`)).statusCode, 404, 'la copie n’existe plus');
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json()), ['Pistolet laser']);
  assert.equal(contenuDe(await w.lire(w.h.lea, w.lame, w.el.id)), ORIGINAL, 'la lecture est l’original');
  // la copie de Brume, elle, reste
  const brume = lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.brume))).json());
  assert.equal(brume.length, 1);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.brume, brume[0].id)), 'Dégâts 3d4, portée dix mètres');
  const sys = (await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${w.el.id}`)).json();
  assert.equal(contenuDe(sys), `${ORIGINAL}|Cristal de Vorsk`);
  await w.app.close();
});

test('B-115 échec : revenir deux fois refuse la seconde sans rien casser ; on peut personnaliser de nouveau après être revenu', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  const url = `${w.u(w.lame)}/${copie.id}/personnalisation`;
  assert.ok((await appel(w.app, w.h.antor, 'DELETE', url)).statusCode < 300);
  const encore = await appel(w.app, w.h.antor, 'DELETE', url);
  assert.ok(encore.statusCode >= 400 && encore.statusCode < 500, `seconde suppression : ${encore.statusCode}`);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, w.el.id)), ORIGINAL);
  const neuve = await personnaliser(w, w.h.antor, w.lame);
  assert.equal(neuve.statusCode, 201, neuve.body);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, neuve.json().id)), ORIGINAL);
  await w.app.close();
});

test('B-116 : dans l’univers, l’élément et sa copie sont une seule entrée, en liste comme en recherche ; l’identifiant de l’élément ouvre la copie', async () => {
  const w = await monde();
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json()), ['Pistolet laser'], 'avant : l’élément seul');
  const copie = await personnalisee(w);
  assert.equal((await appel(w.app, w.h.antor, 'PATCH', `${w.u(w.lame)}/${copie.id}`, { titre: 'Pistolet de Lame' })).statusCode, 200);
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json()), ['Pistolet de Lame']);
  assert.deepEqual(titres((await appel(w.app, w.h.lea, 'GET', `${w.u(w.lame)}?q=pistolet`)).json()), ['Pistolet de Lame']);
  assert.deepEqual(titres((await appel(w.app, w.h.lea, 'GET', `${w.u(w.lame)}?q=vingt`)).json()), ['Pistolet de Lame'], 'le texte de la copie se cherche');
  assert.deepEqual(lignes((await appel(w.app, w.h.lea, 'GET', `${w.u(w.lame)}?q=quarante`)).json()), [], 'le texte de l’original ne se cherche plus dans l’univers');
  const parId = await w.lire(w.h.lea, w.lame, w.el.id);
  assert.equal(parId.titre, 'Pistolet de Lame');
  assert.equal(contenuDe(parId), MODIFIE);
  await w.app.close();
});

test('B-116 : un lien écrit vers l’élément avant la personnalisation ouvre la copie ; revenu, un lien vers la copie n’est plus un lien', async () => {
  const w = await monde();
  const armurerie = (await appel(w.app, w.h.antor, 'POST', w.u(w.lame), { type: 'objet', titre: 'Armurerie', sections: [{ titre: 'Stock' }] })).json();
  await ecrireSection(w, w.h.antor, w.lame, armurerie.id, `Voir [[${w.el.id}|le pistolet]] ici`);
  const html = async () => (await w.lire(w.h.antor, w.lame, armurerie.id)).sections[0].html as string;
  assert.ok((await html()).includes(`href="/univers/${w.lame.id}/fiche/${w.el.id}"`), 'avant : le lien ouvre l’élément');
  const copie = await personnalisee(w);
  const apres = await html();
  assert.ok(apres.includes(`href="/univers/${w.lame.id}/fiche/${copie.id}"`), `après : le lien ouvre la copie (${apres})`);
  assert.ok(!apres.includes(`/fiche/${w.el.id}"`), 'plus de lien vers l’élément seul');
  // un lien écrit vers la copie, puis retour à l'élément : texte simple, aucun lien
  await ecrireSection(w, w.h.antor, w.lame, armurerie.id, `Voir [[${copie.id}|ma version]] ici`);
  assert.ok((await html()).includes('href='), 'la copie existe : le lien vit');
  assert.ok((await appel(w.app, w.h.antor, 'DELETE', `${w.u(w.lame)}/${copie.id}/personnalisation`)).statusCode < 300);
  const fin = await html();
  assert.ok(fin.includes('ma version'), 'le titre écrit reste visible');
  assert.ok(!fin.includes('<a '), `le lien vers la copie supprimée n’est plus un lien (${fin})`);
  await w.app.close();
});

test('B-120 / P-27 étape 7 : supprimer l’élément laisse la copie en fiche ordinaire dans l’univers, avec « detachee » dans son historique', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  await personnalisee(w, w.brume, 'Dégâts 3d4, portée dix mètres');
  assert.equal((await appel(w.app, w.h.mira, 'DELETE', `${w.base}/fiches/${w.el.id}`)).statusCode, 204);
  // l'élément a disparu partout où il n'y avait pas de copie, et du système
  assert.deepEqual(lignes((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches`)).json()), []);
  assert.deepEqual(lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.dune))).json()), []);
  assert.deepEqual(lignes((await appel(w.app, w.h.lea, 'GET', w.u(w.cendre))).json()), []);
  // les deux copies restent, entières
  const l1 = lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json());
  assert.deepEqual(l1.map((x) => [x.id, x.titre]), [[copie.id, 'Pistolet laser']]);
  assert.equal(contenuDe(await w.lire(w.h.lea, w.lame, copie.id)), MODIFIE);
  const l2 = lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.brume))).json());
  assert.equal(l2.length, 1);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.brume, l2[0].id)), 'Dégâts 3d4, portée dix mètres');
  // sans surcharge_de ni original
  const rest = w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number };
  assert.equal(rest.n, 0);
  // une fiche ordinaire : le MJ l'écrit, la lecture n'est plus celle d'un élément
  assert.equal((await appel(w.app, w.h.antor, 'PATCH', `${w.u(w.lame)}/${copie.id}`, { titre: 'Pistolet de Lame' })).statusCode, 200);
  // l'historique de l'univers porte la ligne, au nom du compte qui a supprimé
  const h = (await appel(w.app, w.h.antor, 'GET', `/api/univers/${w.lame.id}/historique`)).json();
  const detachees = (h.lignes as Any[]).filter((x) => x.action === 'detachee');
  assert.equal(detachees.length, 1);
  assert.equal(detachees[0].ficheId, copie.id);
  assert.equal(detachees[0].compte.username, 'mira');
  // elle n'apparaît que dans l'univers de la copie : une seule ligne par copie
  const hb = (await appel(w.app, w.h.antor, 'GET', `/api/univers/${w.brume.id}/historique`)).json();
  assert.equal((hb.lignes as Any[]).filter((x) => x.action === 'detachee').length, 1);
  await w.app.close();
});

test('B-120 / P-27 étape 8 : détacher l’univers de son système laisse la copie en fiche ordinaire ; les autres univers et leurs copies ne bougent pas', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  const autre = await personnalisee(w, w.brume, 'Dégâts 3d4, portée dix mètres');
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: null })).statusCode, 204);
  const l1 = lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json());
  assert.deepEqual(l1.map((x) => [x.id, x.titre]), [[copie.id, 'Pistolet laser']]);
  assert.equal(contenuDe(await w.lire(w.h.lea, w.lame, copie.id)), MODIFIE);
  assert.equal((await appel(w.app, w.h.antor, 'PATCH', `${w.u(w.lame)}/${copie.id}`, { titre: 'Pistolet de Lame' })).statusCode, 200);
  const lignesH = ((await appel(w.app, w.h.antor, 'GET', `/api/univers/${w.lame.id}/historique`)).json().lignes as Any[]).filter((x) => x.action === 'detachee');
  assert.equal(lignesH.length, 1);
  assert.equal(lignesH[0].compte.username, 'antor');
  // Brume : sa copie reste liée, aucune ligne de détachement ; l'élément du système est intact
  const surcharges = w.app.db.prepare('SELECT id, surcharge_de FROM fiches WHERE surcharge_de IS NOT NULL').all() as Any[];
  assert.deepEqual(surcharges.map((s) => [s.id, s.surcharge_de]), [[autre.id, w.el.id]]);
  assert.equal(((await appel(w.app, w.h.antor, 'GET', `/api/univers/${w.brume.id}/historique`)).json().lignes as Any[]).some((x) => x.action === 'detachee'), false);
  assert.equal((await appel(w.app, w.h.mira, 'GET', `${w.base}/fiches/${w.el.id}`)).json().titre, 'Pistolet laser');
  await w.app.close();
});

test('B-120 / P-27 étape 8 : passer l’univers à un autre système laisse la copie en fiche ordinaire, l’élément du premier système n’y est plus', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  const autre = await appel(w.app, w.h.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Eta' });
  assert.equal(autre.statusCode, 201, autre.body);
  const l1 = lignes((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json());
  assert.deepEqual(l1.map((x) => [x.id, x.titre]), [[copie.id, 'Pistolet laser']]);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, copie.id)), MODIFIE);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n, 0);
  assert.equal(((await appel(w.app, w.h.antor, 'GET', `/api/univers/${w.lame.id}/historique`)).json().lignes as Any[]).filter((x) => x.action === 'detachee').length, 1);
  // Zeta et ses autres univers n'ont rien perdu
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.brume))).json()), ['Pistolet laser']);
  await w.app.close();
});

test('B-120 exclusion : détacher un univers sans copie, ou en rattacher un, ne touche aucune copie d’un autre univers', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.dune.id}/systeme`, { systemeId: null })).statusCode, 204);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.dune.id}/systeme`, { systemeId: w.sys.id })).statusCode, 204);
  const s = w.app.db.prepare('SELECT id, surcharge_de FROM fiches WHERE surcharge_de IS NOT NULL').all() as Any[];
  assert.deepEqual(s.map((x) => [x.id, x.surcharge_de]), [[copie.id, w.el.id]]);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, copie.id)), MODIFIE);
  await w.app.close();
});

test('B-120 : une fiche devenue ordinaire ne se rattache pas d’elle-même au retour du système ; on peut personnaliser de nouveau, la fiche ordinaire reste', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: null })).statusCode, 204);
  assert.equal((await appel(w.app, w.h.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: w.sys.id })).statusCode, 204);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE surcharge_de IS NOT NULL').get() as { n: number }).n, 0, 'rattacher ne touche pas la fiche ordinaire');
  const neuve = await personnaliser(w, w.h.antor, w.lame);
  assert.equal(neuve.statusCode, 201, neuve.body);
  assert.notEqual(neuve.json().id, copie.id);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, copie.id)), MODIFIE, 'l’ancienne copie garde son texte');
  await w.app.close();
});

test('B-120 / P-27 étape 7 échec : un MJ du système qui n’est membre d’aucun univers supprime l’élément ; l’univers ne perd rien et l’univers de Téo non plus', async () => {
  const w = await monde();
  const copie = await personnalisee(w);
  const ord = (await appel(w.app, w.h.teo, 'POST', w.u(w.ailleurs), { type: 'objet', titre: 'Dague' })).json();
  assert.equal((await appel(w.app, w.h.mira, 'DELETE', `${w.base}/fiches/${w.el.id}`)).statusCode, 204);
  assert.deepEqual(titres((await appel(w.app, w.h.antor, 'GET', w.u(w.lame))).json()), ['Pistolet laser']);
  assert.equal(contenuDe(await w.lire(w.h.antor, w.lame, copie.id)), MODIFIE);
  assert.deepEqual(titres((await appel(w.app, w.h.teo, 'GET', w.u(w.ailleurs))).json()), ['Dague']);
  assert.equal((await w.lire(w.h.teo, w.ailleurs, ord.id)).titre, 'Dague');
  await w.app.close();
});
