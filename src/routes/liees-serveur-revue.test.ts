// Review tests of kanevas-fiches-liees-bloc-serveur written from the exit criterion (B-64, B-69, AD-130, AD-64):
// the linked sheets of a sheet by nature and type, under both guards, and « Mentionnée dans » without natures.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT';

async function connecter(app: App, compte: string): Promise<Hote> {
  const res = await app.inject({
    method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

type Ligne = { id: number; titre: string; type: string; qualificatif?: string; via?: { id: number; titre: string } };
type Groupe = {
  nature: string; libelle: string; suivant: string | null; fiches: Ligne[];
  types: { type: string; total: number; totalAvecDescendants: number }[];
};
type Reponse = { profondeurAtteinte: boolean; groupes: Groupe[] };

async function bouchon() {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as { id: number };
  const base = `/api/univers/${u.id}`;
  const id = (titre: string) =>
    (app.db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u.id, titre) as { id: number }).id;
  const get = (h: Hote, titre: string, qs = '') =>
    app.inject({ method: 'GET', url: `${base}/fiches/${id(titre)}/liees${qs}`, headers: h });
  return { app, antor, lea, base, id, get };
}

const perso = (g: Groupe | undefined) => g?.types.find((t) => t.type === 'personnage');

test('bouchon : Port-Sel, Antor — s’y trouvent, Personnage 2 / 3, Suie via Les Docks avec descendants', async () => {
  const m = await bouchon();
  const r = await m.get(m.antor, 'Port-Sel');
  assert.equal(r.statusCode, 200, r.body);
  const c = r.json() as Reponse;
  assert.equal(c.profondeurAtteinte, false);
  const g = c.groupes.find((x) => x.nature === 'se_situe');
  assert.ok(g);
  assert.equal(g.libelle, "s'y trouvent");
  assert.deepEqual(perso(g), { type: 'personnage', total: 2, totalAvecDescendants: 3 });
  assert.ok(g.fiches.every((f) => f.via === undefined));
  const d = (await m.get(m.antor, 'Port-Sel', '?descendants=1')).json() as Reponse;
  const suie = d.groupes.find((x) => x.nature === 'se_situe')!.fiches.find((f) => f.titre === 'Suie');
  assert.deepEqual(suie?.via, { id: m.id('Les Docks'), titre: 'Les Docks' });
  assert.deepEqual(perso(d.groupes.find((x) => x.nature === 'se_situe')), { type: 'personnage', total: 2, totalAvecDescendants: 3 });
});

test('bouchon : Port-Sel pour Léa et en mode joueur — Aldric seul, le Prieur nulle part', async () => {
  const m = await bouchon();
  for (const [h, qs] of [[m.lea, ''], [m.antor, '?mode=joueur'], [m.lea, '?mode=joueur']] as const) {
    const r = await m.get(h, 'Port-Sel', qs);
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(!r.body.includes('Prieur'), r.body);
    const g = (r.json() as Reponse).groupes.find((x) => x.nature === 'se_situe')!;
    assert.deepEqual(perso(g), { type: 'personnage', total: 1, totalAvecDescendants: 2 });
    const page = (await m.get(h, 'Port-Sel', `${qs ? `${qs}&` : '?'}nature=se_situe`)).json() as Reponse;
    const n = page.groupes[0]!.fiches.filter((f) => f.type === 'personnage').length;
    assert.equal(n, 1);
    assert.ok(page.groupes[0]!.fiches.every((f) => f.id !== m.id('Le Prieur masqué')));
  }
});

test('bouchon : Les Sphères 0 / 3, Guilde et Corvalis, quête sans groupe', async () => {
  const m = await bouchon();
  const s = (await m.get(m.antor, 'Les Sphères')).json() as Reponse;
  assert.deepEqual(perso(s.groupes.find((x) => x.nature === 'se_situe')), { type: 'personnage', total: 0, totalAvecDescendants: 3 });
  const gd = (await m.get(m.antor, 'La Guilde des Brumes')).json() as Reponse;
  const gm = gd.groupes.find((x) => x.nature === 'membre')!;
  assert.equal(gm.libelle, 'membres');
  assert.deepEqual(perso(gm), { type: 'personnage', total: 2, totalAvecDescendants: 2 });
  const quals = gm.fiches.map((f) => f.qualificatif ?? '').sort();
  assert.ok(quals.includes('trésorier') && quals.includes('dirige'), JSON.stringify(quals));
  const gdd = (await m.get(m.antor, 'La Guilde des Brumes', '?descendants=1')).json() as Reponse;
  assert.deepEqual(gdd.groupes.find((x) => x.nature === 'membre')!.types, gm.types);
  const cv = (await m.get(m.antor, 'Les Corvalis')).json() as Reponse;
  assert.equal(perso(cv.groupes.find((x) => x.nature === 'membre'))?.total, 2);
  const q = m.app.db.prepare("SELECT id FROM fiches WHERE type = 'quete' LIMIT 1").get() as { id: number } | undefined;
  if (q) {
    const r = await m.app.inject({ method: 'GET', url: `${m.base}/fiches/${q.id}/liees`, headers: m.antor });
    assert.deepEqual(r.json(), { profondeurAtteinte: false, groupes: [] });
  }
});

test('bouchon : validation 400 et fiche inconnue = fiche non lue', async () => {
  const m = await bouchon();
  for (const qs of ['?nature=xx', '?descendants=2', '?curseur=a', '?curseur=-1', '?nature=se_situe&nature=membre']) {
    assert.equal((await m.get(m.antor, 'Port-Sel', qs)).statusCode, 400, qs);
  }
  const inconnue = await m.app.inject({ method: 'GET', url: `${m.base}/fiches/999999/liees`, headers: m.lea });
  assert.equal(inconnue.statusCode, 404);
  // a GM-only sheet for Léa: same answer as an unknown id
  const cachee = await m.get(m.lea, 'Les Sphères');
  assert.equal(cachee.statusCode, 404);
  assert.equal(cachee.body, inconnue.body);
  const sans = await m.app.inject({ method: 'GET', url: `${m.base}/fiches/${m.id('Port-Sel')}/liees` });
  assert.ok(sans.statusCode === 401 || sans.statusCode === 302 || sans.statusCode === 403, String(sans.statusCode));
});

// ---------- own data ----------

async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const appel = (h: Hote, method: Verbe, url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
  const u = (await appel(antor, 'POST', '/api/univers', { nom: 'Liees' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(antor, 'POST', `${base}/membres`, { username: 'lea' });
  type F = { id: number; sec: number; secret: number };
  const fiche = async (type: string, titre: string, publique = true): Promise<F> => {
    const charge = type === 'personnage' ? { pj: false } : undefined;
    const r = await appel(antor, 'POST', `${base}/fiches`, { type, titre, charge });
    assert.equal(r.statusCode, 201, r.body);
    const id = (r.json() as { id: number }).id;
    const s = (await appel(antor, 'POST', `${base}/fiches/${id}/sections`, { titre: 'Texte', contenu: 'x' })).json();
    if (publique) await appel(antor, 'PATCH', `${base}/fiches/${id}/sections/${s.id}`, { joueursLisent: true });
    const m = (await appel(antor, 'POST', `${base}/fiches/${id}/sections`, { titre: 'Secret — MJ seul', contenu: 'y' })).json();
    return { id, sec: s.id, secret: m.id };
  };
  const relier = async (de: F, cible: F, nature: string | null, secret = false, qualificatif?: string) => {
    const r = await appel(antor, 'POST', `${base}/fiches/${de.id}/sections/${secret ? de.secret : de.sec}/relations`,
      { cibleFicheId: cible.id, nature, ...(qualificatif ? { qualificatif } : {}) });
    assert.equal(r.statusCode, 201, r.body);
  };
  const sous = async (enfant: F, parent: F) => {
    const r = await appel(antor, 'PATCH', `${base}/fiches/${enfant.id}`, { parent: parent.id });
    assert.equal(r.statusCode, 200, r.body);
  };
  const liees = async (h: Hote, f: F, qs = '') => {
    const r = await appel(h, 'GET', `${base}/fiches/${f.id}/liees${qs}`);
    return { r, c: r.json() as Reponse };
  };
  return { app, antor, lea, appel, base, fiche, relier, sous, liees };
}

test('lieu caché entre deux : jamais nommé ni compté, le descendant lisible reste compté', async () => {
  const m = await monde();
  const port = await m.fiche('lieu', 'Port');
  const repaire = await m.fiche('lieu', 'Repaire', false);
  const cave = await m.fiche('lieu', 'Cave');
  await m.sous(repaire, port);
  await m.sous(cave, repaire);
  const a = await m.fiche('personnage', 'Alpha');
  const b = await m.fiche('personnage', 'Bravo');
  const c = await m.fiche('personnage', 'Charlie');
  await m.relier(a, port, 'se_situe');
  await m.relier(b, repaire, 'se_situe');
  await m.relier(c, cave, 'se_situe');
  const mj = (await m.liees(m.antor, port, '?descendants=1')).c.groupes[0]!;
  assert.deepEqual(mj.types, [{ type: 'personnage', total: 1, totalAvecDescendants: 3 }]);
  const lea = await m.liees(m.lea, port, '?descendants=1');
  assert.equal(lea.r.statusCode, 200);
  const g = lea.c.groupes[0]!;
  assert.deepEqual(g.types, [{ type: 'personnage', total: 1, totalAvecDescendants: 2 }]);
  assert.deepEqual(g.fiches.map((f) => f.titre), ['Alpha', 'Charlie']);
  assert.ok(!lea.r.body.includes('Repaire') && !lea.r.body.includes('Bravo'));
  assert.deepEqual(g.fiches[1]!.via, { id: cave.id, titre: 'Cave' });
});

test('section porteuse fermée : relation ni comptée ni listée pour Léa', async () => {
  const m = await monde();
  const port = await m.fiche('lieu', 'Port');
  const a = await m.fiche('personnage', 'Alpha');
  const b = await m.fiche('personnage', 'Bravo');
  await m.relier(a, port, 'se_situe');
  await m.relier(b, port, 'se_situe', true);
  const lea = (await m.liees(m.lea, port)).c.groupes[0]!;
  assert.deepEqual(lea.types, [{ type: 'personnage', total: 1, totalAvecDescendants: 1 }]);
  assert.deepEqual(lea.fiches.map((f) => f.titre), ['Alpha']);
  const mj = (await m.liees(m.antor, port)).c.groupes[0]!;
  assert.equal(mj.types[0]!.total, 2);
  const joueur = (await m.liees(m.antor, port, '?mode=joueur')).c.groupes[0]!;
  assert.equal(joueur.types[0]!.total, 1);
});

test('fiche comptée une fois par groupe et type, qualificatifs dédupliqués, via direct prioritaire', async () => {
  const m = await monde();
  const port = await m.fiche('lieu', 'Port');
  const docks = await m.fiche('lieu', 'Docks');
  await m.sous(docks, port);
  const a = await m.fiche('personnage', 'Alpha');
  await m.relier(a, docks, 'se_situe', false, 'né');
  await m.relier(a, docks, 'se_situe', true, 'né');
  await m.relier(a, docks, 'se_situe', false, 'vit');
  const sansDirect = (await m.liees(m.antor, port, '?descendants=1')).c.groupes[0]!;
  assert.equal(sansDirect.fiches.length, 1);
  assert.deepEqual(sansDirect.types, [{ type: 'personnage', total: 0, totalAvecDescendants: 1 }]);
  assert.equal(sansDirect.fiches[0]!.qualificatif, 'né · vit');
  assert.equal(sansDirect.fiches[0]!.via?.titre, 'Docks');
  await m.relier(a, port, 'se_situe');
  const avecDirect = (await m.liees(m.antor, port, '?descendants=1')).c.groupes[0]!;
  assert.equal(avecDirect.fiches.length, 1);
  assert.equal(avecDirect.fiches[0]!.via, undefined);
  assert.deepEqual(avecDirect.types, [{ type: 'personnage', total: 1, totalAvecDescendants: 1 }]);
  // without descendants the sheet linked only below is not listed but is counted in totalAvecDescendants
  const sans = (await m.liees(m.antor, docks)).c.groupes[0]!;
  assert.equal(sans.types[0]!.total, 1);
});

test('sans descendants : les lignes ne portent que le lien direct, mais les deux totaux sont envoyés', async () => {
  const m = await monde();
  const port = await m.fiche('lieu', 'Port');
  const docks = await m.fiche('lieu', 'Docks');
  await m.sous(docks, port);
  const a = await m.fiche('personnage', 'Alpha');
  await m.relier(a, docks, 'se_situe');
  const g = (await m.liees(m.antor, port)).c.groupes[0]!;
  assert.deepEqual(g.fiches, []);
  assert.deepEqual(g.types, [{ type: 'personnage', total: 0, totalAvecDescendants: 1 }]);
});

test('pages : 5 lignes sans nature, 50 avec nature et curseur, total = lignes paginées, types dans l’ordre de la liste', async () => {
  const m = await monde();
  const port = await m.fiche('lieu', 'Port');
  for (let i = 0; i < 57; i++) {
    const p = await m.fiche('personnage', `P${String(i).padStart(2, '0')}`);
    await m.relier(p, port, 'se_situe');
  }
  const o = await m.fiche('objet', 'Objet');
  await m.relier(o, port, 'se_situe').catch(() => undefined);
  const brut = (await m.liees(m.antor, port)).c.groupes[0]!;
  assert.equal(brut.fiches.length, 5);
  assert.equal(brut.suivant, '5');
  assert.equal(brut.types.find((t) => t.type === 'personnage')!.total, 57);
  assert.equal(brut.types.find((t) => t.type === 'objet')!.total, 1);
  assert.deepEqual(brut.types.map((t) => t.type), ['personnage', 'objet']);
  const p1 = (await m.liees(m.antor, port, '?nature=se_situe')).c.groupes[0]!;
  assert.equal(p1.fiches.length, 50);
  assert.equal(p1.suivant, '50');
  const p2 = (await m.liees(m.antor, port, `?nature=se_situe&curseur=${p1.suivant}`)).c.groupes[0]!;
  assert.equal(p2.fiches.length, 8);
  assert.equal(p2.suivant, null);
  assert.equal(p2.fiches[0]!.titre, 'P49');
  const tous = [...p1.fiches, ...p2.fiches];
  assert.equal(new Set(tous.map((f) => f.id)).size, 58);
  // exactly at the page edge: 5 lines of 5 — suivant null
  const lea = (await m.liees(m.lea, port, '?nature=se_situe')).c.groupes[0]!;
  assert.equal(lea.fiches.length, 50);
  const bord = (await m.liees(m.antor, port, '?nature=se_situe&curseur=58')).c.groupes[0];
  assert.ok(!bord || bord.fiches.length === 0);
});

test('nature symétrique : lue des deux côtés, absente si l’autre bout est caché', async () => {
  const m = await monde();
  const x = await m.fiche('faction', 'Xenon');
  const y = await m.fiche('faction', 'Yodel');
  const z = await m.fiche('faction', 'Zed', false);
  const w = await m.fiche('personnage', 'Wanda');
  await m.relier(x, y, 'allie');
  await m.relier(z, x, 'ennemi');
  await m.relier(x, w, 'ennemi');
  const deY = (await m.liees(m.antor, y)).c.groupes.find((g) => g.nature === 'allie')!;
  assert.deepEqual(deY.fiches.map((f) => f.titre), ['Xenon']);
  const deX = (await m.liees(m.antor, x)).c;
  assert.deepEqual(deX.groupes.find((g) => g.nature === 'allie')!.fiches.map((f) => f.titre), ['Yodel']);
  assert.deepEqual(deX.groupes.find((g) => g.nature === 'ennemi')!.fiches.map((f) => f.titre), ['Wanda', 'Zed']);
  assert.deepEqual(deX.groupes.map((g) => g.nature), ['allie', 'ennemi']);
  const lea = await m.liees(m.lea, x);
  assert.deepEqual(lea.c.groupes.find((g) => g.nature === 'ennemi')!.fiches.map((f) => f.titre), ['Wanda']);
  assert.ok(!lea.r.body.includes('Zed'));
  // only a hidden holder: the group does not exist for Léa
  const solo = await m.fiche('faction', 'Solo');
  await m.relier(z, solo, 'ennemi');
  const l2 = await m.liees(m.lea, solo);
  assert.deepEqual(l2.c.groupes, []);
  assert.equal((await m.liees(m.antor, solo)).c.groupes.length, 1);
});

test('descendants sur une fiche qui n’est pas un lieu : sans effet ; fiche vers qui rien ne pointe : groupes []', async () => {
  const m = await monde();
  const g = await m.fiche('faction', 'Guilde');
  const p = await m.fiche('personnage', 'Alpha');
  await m.relier(p, g, 'membre', false, 'dirige');
  const a = (await m.liees(m.antor, g)).c;
  const b = (await m.liees(m.antor, g, '?descendants=1')).c;
  assert.deepEqual(a, b);
  assert.deepEqual(a.groupes[0]!.types, [{ type: 'personnage', total: 1, totalAvecDescendants: 1 }]);
  const quete = await m.fiche('quete', 'Q');
  assert.deepEqual((await m.liees(m.antor, quete)).c, { profondeurAtteinte: false, groupes: [] });
  const lieuVide = await m.fiche('lieu', 'Vide');
  assert.deepEqual((await m.liees(m.antor, lieuVide)).c.groupes, []);
});

test('arbre de 50 niveaux : profondeurAtteinte ; 49 : non', async () => {
  const m = await monde();
  let parent = await m.fiche('lieu', 'N00', true);
  const racine = parent;
  for (let i = 1; i <= 49; i++) {
    const f = await m.fiche('lieu', `N${String(i).padStart(2, '0')}`, true);
    await m.sous(f, parent);
    parent = f;
  }
  const p = await m.fiche('personnage', 'Alpha');
  await m.relier(p, parent, 'se_situe');
  const r49 = (await m.liees(m.antor, racine, '?descendants=1')).c;
  assert.equal(r49.profondeurAtteinte, false);
  assert.equal(r49.groupes[0]!.types[0]!.totalAvecDescendants, 1);
  const f = await m.fiche('lieu', 'N50', true);
  await m.sous(f, parent);
  const r50 = (await m.liees(m.antor, racine, '?descendants=1')).c;
  assert.equal(r50.profondeurAtteinte, true);
});

test('fiche d’un autre univers : introuvable', async () => {
  const m = await monde();
  const autre = (await m.appel(m.antor, 'POST', '/api/univers', { nom: 'Autre' })).json();
  const l = (await m.appel(m.antor, 'POST', `/api/univers/${autre.id}/fiches`, { type: 'lieu', titre: 'Ailleurs' })).json();
  const r = await m.appel(m.antor, 'GET', `${m.base}/fiches/${l.id}/liees`);
  assert.equal(r.statusCode, 404);
});

test('mentions : liens et relations libres gardés, relations à nature retirées, compte de page aligné', async () => {
  const m = await monde();
  const port = await m.fiche('lieu', 'Port');
  const a = await m.fiche('personnage', 'Alpha');
  const b = await m.fiche('personnage', 'Bravo');
  const c = await m.fiche('personnage', 'Charlie');
  await m.relier(a, port, 'se_situe');
  await m.relier(b, port, null, false, 'rôde');
  await m.appel(m.antor, 'PUT', `${m.base}/fiches/${c.id}/sections/${c.sec}/contenu`, { contenu: `Vu à [[${port.id}]].`, version: (m.app.db.prepare('SELECT version FROM sections WHERE id = ?').get(c.sec) as { version: number }).version });
  const r = await m.appel(m.antor, 'GET', `${m.base}/fiches/${port.id}/mentions`);
  assert.equal(r.statusCode, 200, r.body);
  const mentions = r.json().mentions as { titre: string; pourquoi: { genre: string }[] }[];
  assert.deepEqual(mentions.map((x) => x.titre), ['Bravo', 'Charlie']);
  assert.equal(mentions[0]!.pourquoi[0]!.genre, 'relation');
  assert.equal(mentions[1]!.pourquoi[0]!.genre, 'lien');
});

test('visibleJoueurs sur les lignes : rendu au MJ hors mode joueur (Prieur faux, Aldric vrai), jamais à Léa ni en mode joueur', async () => {
  const m = await bouchon();
  type L = Ligne & { visibleJoueurs?: boolean };
  const lignes = async (h: Hote, qs: string) =>
    ((await m.get(h, 'Port-Sel', `${qs}nature=se_situe`)).json() as { groupes: { fiches: L[] }[] }).groupes[0]!.fiches;
  const mj = await lignes(m.antor, '?');
  assert.equal(mj.find((f) => f.id === m.id('Le Prieur masqué'))?.visibleJoueurs, false);
  assert.equal(mj.find((f) => f.titre === 'Aldric')?.visibleJoueurs, true);
  const mj5 = ((await m.get(m.antor, 'Port-Sel')).json() as { groupes: { fiches: L[] }[] }).groupes.find((_, i) => i === 0)!;
  assert.ok(mj5.fiches.every((f) => typeof f.visibleJoueurs === 'boolean'));
  for (const [h, qs] of [[m.lea, '?'], [m.antor, '?mode=joueur&'], [m.lea, '?mode=joueur&']] as const) {
    assert.ok((await lignes(h, qs)).every((f) => !('visibleJoueurs' in f)));
  }
});
