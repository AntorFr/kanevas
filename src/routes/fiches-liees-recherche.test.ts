// Tests of kanevas-fiches-liees-recherche-serveur written from the exit criterion (B-65, AD-129):
// the list filtered by `lie`, `nature`, `descendants` under both relation guards.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
  const res = await app.inject({
    method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: Hote, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

type F = { id: number; sec: number; secret: number };

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Liees' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  // A sheet has a public section ("Texte") and a GM-only one ("Secret — MJ seul").
  const fiche = async (type: string, titre: string, publique = true): Promise<F> => {
    const charge = type === 'personnage' ? { pj: false } : undefined;
    const r = await appel(app, antor, 'POST', `${base}/fiches`, { type, titre, charge });
    assert.equal(r.statusCode, 201, r.body);
    const id = (r.json() as { id: number }).id;
    const s = (await appel(app, antor, 'POST', `${base}/fiches/${id}/sections`, { titre: 'Texte', contenu: 'x' })).json();
    if (publique) await appel(app, antor, 'PATCH', `${base}/fiches/${id}/sections/${s.id}`, { joueursLisent: true });
    const m = (await appel(app, antor, 'POST', `${base}/fiches/${id}/sections`, { titre: 'Secret — MJ seul', contenu: 'y' })).json();
    return { id, sec: s.id, secret: m.id };
  };
  const relier = async (de: F, cible: F, nature: string | null, secret = false, qualificatif?: string) => {
    const r = await appel(app, antor, 'POST', `${base}/fiches/${de.id}/sections/${secret ? de.secret : de.sec}/relations`,
      { cibleFicheId: cible.id, nature, ...(qualificatif ? { qualificatif } : {}) });
    assert.equal(r.statusCode, 201, r.body);
  };
  const sous = async (enfant: F, parent: F) => {
    const r = await appel(app, antor, 'PATCH', `${base}/fiches/${enfant.id}`, { parent: parent.id });
    assert.equal(r.statusCode, 200, r.body);
  };
  const liste = async (h: Hote, qs: string) => {
    const r = await appel(app, h, 'GET', `${base}/fiches?${qs}`);
    return { r, corps: r.json() as { fiches: Array<{ id: number; titre: string; via?: { id: number; titre: string } }>; suivant: unknown } };
  };
  const titres = (c: { fiches: Array<{ titre: string }> }) => c.fiches.map((f) => f.titre);
  return { app, antor, lea, base, fiche, relier, sous, liste, titres };
}

async function monde() {
  const m = await monter();
  const port = await m.fiche('lieu', 'Port-Sel');
  const docks = await m.fiche('lieu', 'Les Docks');
  await m.sous(docks, port);
  const aldric = await m.fiche('personnage', 'Aldric');
  const prieur = await m.fiche('personnage', 'Le Prieur');
  const suie = await m.fiche('personnage', 'Suie');
  const guilde = await m.fiche('faction', 'La Guilde des Brumes');
  const rapport = await m.fiche('objet', "Rapport secret de l'amirauté");
  await m.relier(aldric, port, 'se_situe');
  await m.relier(prieur, port, 'se_situe', true);
  await m.relier(suie, docks, 'se_situe');
  await m.relier(guilde, port, null, false, 'rôde');
  await m.relier(rapport, port, null, false, 'cité');
  return { ...m, port, docks, aldric, prieur, suie, guilde, rapport };
}

test('lie+nature+descendants : Aldric, le Prieur, Suie (via Les Docks) ; sans descendants Suie disparaît', async () => {
  const m = await monde();
  const { r, corps } = await m.liste(m.antor, `type=personnage&lie=${m.port.id}&nature=se_situe&descendants=1`);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(m.titres(corps), ['Aldric', 'Le Prieur', 'Suie']);
  assert.equal(corps.fiches[0]!.via, undefined);
  assert.equal(corps.fiches[1]!.via, undefined);
  assert.deepEqual(corps.fiches[2]!.via, { id: m.docks.id, titre: 'Les Docks' });
  const sans = await m.liste(m.antor, `type=personnage&lie=${m.port.id}&nature=se_situe`);
  assert.deepEqual(m.titres(sans.corps), ['Aldric', 'Le Prieur']);
  assert.ok(sans.corps.fiches.every((f) => f.via === undefined));
});

test('lie seul : relations libres comprises, tous types', async () => {
  const m = await monde();
  const { corps } = await m.liste(m.antor, `lie=${m.port.id}`);
  assert.deepEqual(m.titres(corps), ['Aldric', 'La Guilde des Brumes', 'Le Prieur', "Rapport secret de l'amirauté"]);
  // a free relation is not found by a nature
  const n = await m.liste(m.antor, `lie=${m.port.id}&nature=se_situe`);
  assert.deepEqual(m.titres(n.corps), ['Aldric', 'Le Prieur']);
});

test('Léa et ?mode=joueur : Aldric et Suie, la relation du Prieur est secrète', async () => {
  const m = await monde();
  const qs = `type=personnage&lie=${m.port.id}&nature=se_situe&descendants=1`;
  const lea = await m.liste(m.lea, qs);
  assert.deepEqual(m.titres(lea.corps), ['Aldric', 'Suie']);
  const joueur = await m.liste(m.antor, `${qs}&mode=joueur`);
  assert.deepEqual(m.titres(joueur.corps), ['Aldric', 'Suie']);
});

test('une fiche liée deux fois n’est listée qu’une fois', async () => {
  const m = await monde();
  await m.relier(m.aldric, m.port, 'se_situe', true);
  await m.relier(m.aldric, m.port, null, false, 'né ici');
  const { corps } = await m.liste(m.antor, `lie=${m.port.id}&type=personnage`);
  assert.deepEqual(m.titres(corps), ['Aldric', 'Le Prieur']);
});

test('lien direct ET par un sous-lieu : pas de via ; Suie liée aussi à Port-Sel perd son via', async () => {
  const m = await monde();
  await m.relier(m.suie, m.port, 'se_situe');
  const { corps } = await m.liste(m.antor, `type=personnage&lie=${m.port.id}&nature=se_situe&descendants=1`);
  assert.deepEqual(m.titres(corps), ['Aldric', 'Le Prieur', 'Suie']);
  assert.ok(corps.fiches.every((f) => f.via === undefined));
});

test('lieu caché entre Port-Sel et un lieu lisible : jamais nommé, la relation vers le lisible compte', async () => {
  const m = await monde();
  const cache = await m.fiche('lieu', 'Crypte oubliée', false);
  const profond = await m.fiche('lieu', 'Le Phare');
  await m.sous(cache, m.port);
  await m.sous(profond, cache);
  const rodeur = await m.fiche('personnage', 'Rôdeur');
  await m.relier(rodeur, profond, 'se_situe');
  const { corps, r } = await m.liste(m.lea, `type=personnage&lie=${m.port.id}&nature=se_situe&descendants=1`);
  assert.ok(titres(corps).includes('Rôdeur'));
  const f = corps.fiches.find((x) => x.titre === 'Rôdeur')!;
  assert.deepEqual(f.via, { id: profond.id, titre: 'Le Phare' });
  assert.ok(!r.body.includes('Crypte oubliée'));
  function titres(c: { fiches: Array<{ titre: string }> }) { return c.fiches.map((x) => x.titre); }
});

test('relation vers un sous-lieu illisible (Le Repaire) : non comptée pour Léa, comptée pour Antor', async () => {
  const m = await monde();
  const repaire = await m.fiche('lieu', 'Le Repaire', false);
  await m.sous(repaire, m.port);
  const chef = await m.fiche('personnage', 'Chef de bande');
  await m.relier(chef, repaire, 'se_situe');
  const qs = `type=personnage&lie=${m.port.id}&nature=se_situe&descendants=1`;
  assert.ok(m.titres((await m.liste(m.antor, qs)).corps).includes('Chef de bande'));
  const lea = await m.liste(m.lea, qs);
  assert.ok(!m.titres(lea.corps).includes('Chef de bande'));
  assert.ok(!JSON.stringify(lea.corps).includes('Repaire'));
});

test('nature symétrique : A→B se trouve par lie=B et par lie=A ; section fermée : non ; via inverse', async () => {
  const m = await monter();
  const a = await m.fiche('faction', 'Alpha');
  const b = await m.fiche('faction', 'Beta');
  await m.relier(a, b, 'allie');
  const parB = await m.liste(m.lea, `lie=${b.id}&nature=allie`);
  assert.deepEqual(m.titres(parB.corps), ['Alpha']);
  const parA = await m.liste(m.lea, `lie=${a.id}&nature=allie`);
  assert.deepEqual(m.titres(parA.corps), ['Beta']);
  // a non-symmetric nature is not read backwards
  const c = await m.fiche('faction', 'Gamma');
  await m.relier(c, a, null, false, 'rival');
  assert.deepEqual(m.titres((await m.liste(m.antor, `lie=${c.id}`)).corps), []);
  // closed section: invisible for Léa, visible for the GM
  const d = await m.fiche('faction', 'Delta');
  const e = await m.fiche('faction', 'Epsilon');
  await m.relier(d, e, 'ennemi', true);
  assert.deepEqual(m.titres((await m.liste(m.lea, `lie=${e.id}&nature=ennemi`)).corps), []);
  assert.deepEqual(m.titres((await m.liste(m.lea, `lie=${d.id}&nature=ennemi`)).corps), []);
  assert.deepEqual(m.titres((await m.liste(m.antor, `lie=${e.id}&nature=ennemi`)).corps), ['Delta']);
  assert.deepEqual(m.titres((await m.liste(m.antor, `lie=${d.id}&nature=ennemi`)).corps), ['Epsilon']);
});

test('symétrique + descendants : le via d’une lecture inverse est le sous-lieu source', async () => {
  const m = await monter();
  const maison = await m.fiche('famille', 'Maison Mère');
  const branche = await m.fiche('famille', 'Branche');
  await m.sous(branche, maison);
  const rival = await m.fiche('famille', 'Rivale');
  await m.relier(branche, rival, 'allie');
  // lie=Maison Mère has no direct link; the descendant Branche is the source of an alliance with Rivale.
  const { corps } = await m.liste(m.antor, `lie=${maison.id}&nature=allie&descendants=1`);
  assert.deepEqual(m.titres(corps), ['Rivale']);
  assert.deepEqual(corps.fiches[0]!.via, { id: branche.id, titre: 'Branche' });
});

test('lie illisible, d’un autre univers ou inconnu : 200 page vide, mêmes octets', async () => {
  const m = await monde();
  const cache = await m.fiche('lieu', 'Lieu caché', false);
  const autre = (await appel(m.app, m.antor, 'POST', '/api/univers', { nom: 'Autre' })).json();
  const etranger = (await appel(m.app, m.antor, 'POST', `/api/univers/${autre.id}/fiches`, { type: 'lieu', titre: 'Ailleurs' })).json();
  const corps: string[] = [];
  for (const id of [cache.id, etranger.id, 999999]) {
    const r = await appel(m.app, m.lea, 'GET', `${m.base}/fiches?lie=${id}&descendants=1`);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { fiches: [], suivant: null });
    corps.push(r.body);
  }
  assert.equal(new Set(corps).size, 1);
  const gm = await appel(m.app, m.antor, 'GET', `${m.base}/fiches?lie=${etranger.id}`);
  assert.equal(gm.body, corps[0]);
});

test('arbres de 50, 60 niveaux et boucle en base : sans erreur', async () => {
  const m = await monter();
  const racine = await m.fiche('lieu', 'Racine');
  const hote = await m.fiche('personnage', 'Hôte');
  let courant = racine;
  const chaine: F[] = [];
  for (let i = 1; i <= 60; i++) {
    const l = await m.fiche('lieu', `Niveau ${i}`);
    m.app.db.prepare('UPDATE fiches SET parent_id = ? WHERE id = ?').run(courant.id, l.id);
    chaine.push(l);
    courant = l;
  }
  await m.relier(hote, chaine[48]!, 'se_situe'); // level 49: within the bound
  const proche = await m.liste(m.antor, `lie=${racine.id}&descendants=1`);
  assert.equal(proche.r.statusCode, 200);
  assert.deepEqual(m.titres(proche.corps), ['Hôte']);
  const bout = await m.fiche('personnage', 'Au bout');
  await m.relier(bout, chaine[59]!, 'se_situe'); // level 60: out of the bound, must not error
  const loin = await m.liste(m.antor, `lie=${racine.id}&descendants=1&type=personnage`);
  assert.equal(loin.r.statusCode, 200);
  m.app.db.prepare('UPDATE fiches SET parent_id = ? WHERE id = ?').run(chaine[59]!.id, racine.id);
  const boucle = await m.liste(m.antor, `lie=${racine.id}&descendants=1&type=personnage`);
  assert.equal(boucle.r.statusCode, 200);
  assert.ok(m.titres(boucle.corps).includes('Hôte'));
});

test('400 Requête invalide. : nature/descendants sans lie, nature inconnue, lie=abc, descendants=2', async () => {
  const m = await monde();
  for (const qs of [
    'nature=se_situe', 'descendants=1', `lie=${m.port.id}&nature=inconnue`, 'lie=abc',
    `lie=${m.port.id}&descendants=2`, `lie=${m.port.id}&descendants=`, `lie=-1`, `lie=${m.port.id}&lie=${m.port.id}`,
  ]) {
    const r = await appel(m.app, m.antor, 'GET', `${m.base}/fiches?${qs}`);
    assert.equal(r.statusCode, 400, qs);
    assert.equal(r.json().erreur ?? r.json().message, 'Requête invalide.', qs);
  }
});

test('intersection avec q, sousType, etiquette, parent', async () => {
  const m = await monde();
  const qs = `lie=${m.port.id}&nature=se_situe&descendants=1`;
  assert.deepEqual(m.titres((await m.liste(m.antor, `${qs}&q=Suie`)).corps), ['Suie']);
  assert.deepEqual(m.titres((await m.liste(m.antor, `${qs}&q=Guilde`)).corps), []);
  await appel(m.app, m.antor, 'PATCH', `${m.base}/fiches/${m.aldric.id}`, { sousType: 'Marin' });
  assert.deepEqual(m.titres((await m.liste(m.antor, `${qs}&sousType=Marin`)).corps), ['Aldric']);
  await appel(m.app, m.antor, 'PUT', `${m.base}/fiches/${m.suie.id}/etiquetage`, { alias: [], etiquettes: ['voleur'] });
  assert.deepEqual(m.titres((await m.liste(m.antor, `${qs}&etiquette=voleur`)).corps), ['Suie']);
  await m.sous(m.suie, m.aldric);
  assert.deepEqual(m.titres((await m.liste(m.antor, `${qs}&type=personnage&parent=${m.aldric.id}`)).corps), ['Suie']);
  assert.deepEqual(m.titres((await m.liste(m.antor, `${qs}&type=personnage&parent=${m.aldric.id}&q=Aldric`)).corps), []);
});

test('la page filtrée est complète et sans curseur', async () => {
  const m = await monde();
  const premiere = await m.app.inject({ method: 'GET', url: `${m.base}/fiches?lie=${m.port.id}`, headers: m.antor });
  assert.equal((premiere.json().fiches as unknown[]).length, 4);
  assert.equal(premiere.json().suivant, null);
});
