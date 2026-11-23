import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

// antor: creator of the system and GM of Lame (attached), no GM status on the system; lea: player of Lame;
// mira: GM of the system only (her universe is not attached); teo: no link; admin: instance admin, no link.
async function monde() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube' });
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  const espace = (app.db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(sys.id) as { id: number }).id;
  app.db
    .prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, (SELECT id FROM comptes WHERE username = 'mira'), 'mj')")
    .run(espace);
  return { app, antor, lea, teo, mira, admin, lame, sys, espace };
}

type Monde = Awaited<ReturnType<typeof monde>>;

/** Mira creates an « objet » with a public and a GM-only section, both written. */
async function creerElement(w: Monde) {
  const r = await appel(w.app, w.mira, 'POST', `/api/systemes/${w.sys.id}/fiches`, {
    type: 'objet',
    titre: 'Épée runique',
    sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Secret de forge', joueursLisent: false }],
  });
  assert.equal(r.statusCode, 201, r.body);
  const fiche = r.json();
  const vue = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${fiche.id}`)).json();
  const [pub, secret] = vue.sections as { id: number; version: number; titre: string }[];
  const textes: [typeof pub, string][] = [[pub!, 'Lame bleutée visible'], [secret!, 'Forgée avec du sang de dragon']];
  for (const [s, texte] of textes) {
    const e = await appel(w.app, w.mira, 'PUT', `/api/systemes/${w.sys.id}/fiches/${fiche.id}/sections/${s.id}/contenu`, { contenu: texte, version: s.version });
    assert.equal(e.statusCode, 200, e.body);
  }
  return fiche as { id: number };
}

test('un MJ du système crée un objet avec sections par la route et le relit ; l’élément vit dans l’espace', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const vue = await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches/${f.id}`);
  assert.equal(vue.statusCode, 200);
  const v = vue.json();
  assert.equal(v.titre, 'Épée runique');
  assert.equal(v.type, 'objet');
  assert.equal(v.origine, 'systeme');
  assert.deepEqual(v.systeme, { id: w.sys.id, nom: 'Chroniques' });
  assert.equal(v.sections.length, 2);
  assert.equal(v.sections[1].contenu, 'Forgée avec du sang de dragon');
  const ligne = w.app.db.prepare('SELECT univers_id u FROM fiches WHERE id = ?').get(f.id) as { u: number };
  assert.equal(ligne.u, w.espace);
  // PATCH and list by the same door
  const p = await appel(w.app, w.mira, 'PATCH', `/api/systemes/${w.sys.id}/fiches/${f.id}`, { titre: 'Épée d’aube' });
  assert.equal(p.statusCode, 200, p.body);
  const liste = (await appel(w.app, w.mira, 'GET', `/api/systemes/${w.sys.id}/fiches`)).json();
  assert.deepEqual(liste.fiches.map((x: { titre: string }) => x.titre), ['Épée d’aube']);
});

test('écriture : le créateur sans statut de MJ et un membre rattaché reçoivent 403, un compte sans lien 404, avant toute validation du corps', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const base = `/api/systemes/${w.sys.id}/fiches`;
  for (const [nom, h, attendu] of [['antor', w.antor, 403], ['lea', w.lea, 403], ['teo', w.teo, 404], ['admin', w.admin, 404]] as const) {
    for (const [m, u, corps] of [
      ['POST', base, { type: 'objet', titre: 'X' }],
      ['POST', base, {}],
      ['PATCH', `${base}/${f.id}`, { titre: 'Pirate' }],
      ['DELETE', `${base}/${f.id}`, undefined],
      ['POST', `${base}/${f.id}/sections`, { titre: 'S' }],
    ] as const) {
      const r = await appel(w.app, h, m, u, corps);
      assert.equal(r.statusCode, attendu, `${nom} ${m} ${u} → ${r.statusCode} ${r.body}`);
    }
  }
  const intact = w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(f.id) as { titre: string };
  assert.equal(intact.titre, 'Épée runique');
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(w.espace) as { n: number }).n, 1);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM sections WHERE fiche_id = ?').get(f.id) as { n: number }).n, 2);
});

test('le créateur d’un système détaché, sans univers rattaché ni statut de MJ, reçoit 404 en écrivant', async () => {
  const w = await monde();
  const detache = (await appel(w.app, w.antor, 'POST', '/api/systemes', { nom: 'Seul' })).json();
  for (const [m, u] of [['POST', `/api/systemes/${detache.id}/fiches`], ['GET', `/api/systemes/${detache.id}/fiches`]] as const) {
    const r = await appel(w.app, w.antor, m, u, { type: 'objet', titre: 'X' });
    assert.equal(r.statusCode, 404, `${m} ${u}`);
  }
  assert.equal((await appel(w.app, w.antor, 'GET', '/api/systemes/99999/fiches')).statusCode, 404);
  assert.equal((await appel(w.app, null, 'GET', `/api/systemes/${detache.id}/fiches`)).statusCode, 401);
});

test('un membre rattaché (joueur ou MJ d’univers) lit l’élément dans la liste et par l’univers : sections lisibles des joueurs seulement', async () => {
  const w = await monde();
  const f = await creerElement(w);
  for (const [nom, h] of [['lea', w.lea], ['antor', w.antor]] as const) {
    // by the system's door
    const parSysteme = await appel(w.app, h, 'GET', `/api/systemes/${w.sys.id}/fiches/${f.id}`);
    assert.equal(parSysteme.statusCode, 200, nom);
    // by the universe's door, in every mode: the right is the account's on the system
    for (const q of ['', '?mode=joueur']) {
      const r = await appel(w.app, h, 'GET', `/api/univers/${w.lame.id}/fiches/${f.id}${q}`);
      assert.equal(r.statusCode, 200, `${nom} ${q}`);
      const v = r.json();
      assert.equal(v.origine, 'systeme');
      assert.deepEqual(v.systeme, { id: w.sys.id, nom: 'Chroniques' });
      assert.deepEqual(v.sections.map((s: { titre: string }) => s.titre), ['Description'], `${nom} ${q}`);
      assert.ok(!r.body.includes('sang de dragon'), `${nom} ${q} : le secret fuit`);
      assert.ok(!r.body.includes('Secret de forge'), `${nom} ${q} : le titre de la section secrète fuit`);
      assert.ok(r.body.includes('Lame bleutée'));
    }
    assert.ok(!parSysteme.body.includes('sang de dragon'), `${nom} par le système`);
  }
});

test('un membre rattaché ne peut rien écrire sur l’élément, ni par l’univers ni par le système', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const sec = (w.app.db.prepare('SELECT id, version FROM sections WHERE fiche_id = ? ORDER BY id').all(f.id) as { id: number; version: number }[])[0]!;
  const portes = [`/api/univers/${w.lame.id}/fiches/${f.id}`, `/api/systemes/${w.sys.id}/fiches/${f.id}`];
  for (const h of [w.lea, w.antor]) {
    for (const u of portes) {
      const patch = await appel(w.app, h, 'PATCH', u, { titre: 'Pirate' });
      assert.ok(patch.statusCode >= 400 && patch.statusCode < 500, `PATCH ${u} → ${patch.statusCode}`);
      const put = await appel(w.app, h, 'PUT', `${u}/sections/${sec.id}/contenu`, { contenu: 'pirate', version: sec.version });
      assert.ok(put.statusCode >= 400 && put.statusCode < 500, `PUT ${u} → ${put.statusCode}`);
      const del = await appel(w.app, h, 'DELETE', u);
      assert.ok(del.statusCode >= 400 && del.statusCode < 500, `DELETE ${u} → ${del.statusCode}`);
    }
  }
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(f.id) as { titre: string }).titre, 'Épée runique');
  assert.equal((w.app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(sec.id) as { contenu: string }).contenu, 'Lame bleutée visible');
});

test('un compte sans lien reçoit 404 (corps identique à un id inconnu) en lisant l’élément, par le système comme par un univers', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const inconnu = await appel(w.app, w.teo, 'GET', '/api/systemes/99999/fiches/1');
  for (const h of [w.teo, w.admin]) {
    for (const u of [`/api/systemes/${w.sys.id}/fiches`, `/api/systemes/${w.sys.id}/fiches/${f.id}`]) {
      const r = await appel(w.app, h, 'GET', u);
      assert.equal(r.statusCode, 404, u);
      assert.equal(r.body, inconnu.body, u);
    }
  }
  // the universe of another account: the element's id opens nothing there
  const mesU = (await appel(w.app, w.teo, 'POST', '/api/univers', { nom: 'Teo' })).json();
  assert.equal((await appel(w.app, w.teo, 'GET', `/api/univers/${mesU.id}/fiches/${f.id}`)).statusCode, 404);
  assert.equal((await appel(w.app, w.teo, 'GET', `/api/univers/${w.lame.id}/fiches/${f.id}`)).statusCode, 404);
});

test('un élément ne s’ouvre pas depuis un univers rattaché à un autre système', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const autre = (await appel(w.app, w.antor, 'POST', '/api/univers', { nom: 'Autre' })).json();
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/univers/${autre.id}/fiches/${f.id}`)).statusCode, 404);
  const s2 = (await appel(w.app, w.antor, 'POST', `/api/univers/${autre.id}/systeme-nouveau`, { nom: 'Second' })).json();
  assert.ok(s2.id !== w.sys.id);
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/univers/${autre.id}/fiches/${f.id}`)).statusCode, 404);
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/univers/${autre.id}/fiches`)).json().fiches.length, 0);
});

test('la liste et la recherche de l’univers rattaché portent l’élément une fois, avec son origine ; un secret ne se trouve pas', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const propre = (await appel(w.app, w.antor, 'POST', `/api/univers/${w.lame.id}/fiches`, { type: 'objet', titre: 'Dague d’Aldric' })).json();
  for (const h of [w.antor, w.lea]) {
    const liste = (await appel(w.app, h, 'GET', `/api/univers/${w.lame.id}/fiches`)).json();
    const lignes = liste.fiches.filter((x: { id: number }) => x.id === f.id);
    assert.equal(lignes.length, 1, 'une ligne par élément');
    assert.equal(lignes[0].origine, 'systeme');
    assert.deepEqual(lignes[0].systeme, { id: w.sys.id, nom: 'Chroniques' });
    if (h === w.antor) assert.equal(liste.fiches.find((x: { id: number }) => x.id === propre.id).origine, 'univers');

    const rech = (await appel(w.app, h, 'GET', `/api/univers/${w.lame.id}/fiches?q=${encodeURIComponent('Épée')}`)).json();
    assert.deepEqual(rech.fiches.map((x: { id: number }) => x.id), [f.id], 'la recherche renvoie l’élément une fois');
    const mot = (await appel(w.app, h, 'GET', `/api/univers/${w.lame.id}/fiches?q=bleut%C3%A9e`)).json();
    assert.deepEqual(mot.fiches.map((x: { id: number }) => x.id), [f.id]);
    const secret = (await appel(w.app, h, 'GET', `/api/univers/${w.lame.id}/fiches?q=dragon`)).json();
    assert.deepEqual(secret.fiches, [], 'le mot de la section réservée au MJ du système ne trouve rien');
  }
  // the filter by type reaches the elements too, a type none carries does not
  const parType = (await appel(w.app, w.lea, 'GET', `/api/univers/${w.lame.id}/fiches?type=objet`)).json();
  assert.ok(parType.fiches.some((x: { id: number }) => x.id === f.id));
  const autreType = (await appel(w.app, w.lea, 'GET', `/api/univers/${w.lame.id}/fiches?type=lieu`)).json();
  assert.ok(!autreType.fiches.some((x: { id: number }) => x.id === f.id));
});

test('les éléments d’un univers non rattaché ou détaché disparaissent de ses listes, un autre univers rattaché les voit', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const autre = (await appel(w.app, w.antor, 'POST', '/api/univers', { nom: 'Autre' })).json();
  await appel(w.app, w.antor, 'PUT', `/api/univers/${autre.id}/systeme`, { systemeId: w.sys.id });
  assert.deepEqual((await appel(w.app, w.antor, 'GET', `/api/univers/${autre.id}/fiches`)).json().fiches.map((x: { id: number }) => x.id), [f.id]);
  await appel(w.app, w.antor, 'PUT', `/api/univers/${autre.id}/systeme`, { systemeId: null });
  assert.deepEqual((await appel(w.app, w.antor, 'GET', `/api/univers/${autre.id}/fiches`)).json().fiches, []);
  assert.equal((await appel(w.app, w.antor, 'GET', `/api/univers/${autre.id}/fiches/${f.id}`)).statusCode, 404);
});

test('GET /api/systemes/:sid : liste des éléments pour un MJ du système et un membre rattaché, en-tête seul pour l’admin sans lien, 404 pour les autres', async () => {
  const w = await monde();
  const f = await creerElement(w);
  const url = `/api/systemes/${w.sys.id}`;
  for (const [nom, h] of [['mira', w.mira], ['antor', w.antor], ['lea', w.lea]] as const) {
    const r = await appel(w.app, h, 'GET', url);
    assert.equal(r.statusCode, 200, nom);
    const c = r.json();
    assert.equal(c.nom, 'Chroniques');
    assert.deepEqual(c.fiches.map((x: { id: number }) => x.id), [f.id], nom);
    assert.ok(Array.isArray(c.types), nom);
    assert.ok(!r.body.includes('sang de dragon'), nom);
  }
  assert.equal((await appel(w.app, w.mira, 'GET', url)).json().peutEcrire, true);
  assert.equal((await appel(w.app, w.antor, 'GET', url)).json().peutEcrire, false);
  assert.equal((await appel(w.app, w.lea, 'GET', url)).json().peutEcrire, false);

  const admin = await appel(w.app, w.admin, 'GET', url);
  assert.equal(admin.statusCode, 200);
  const a = admin.json();
  assert.equal(a.nom, 'Chroniques');
  assert.ok(Array.isArray(a.types));
  assert.equal(a.fiches, undefined, 'l’admin sans lien ne reçoit aucun élément');
  assert.ok(!admin.body.includes('Épée'), 'ni titre');
  assert.ok(!admin.body.includes('Lame bleutée'));
  assert.deepEqual(a.mj.map((m: { username: string }) => m.username), ['mira']);

  const teo = await appel(w.app, w.teo, 'GET', url);
  assert.equal(teo.statusCode, 404);
  assert.equal(teo.body, (await appel(w.app, w.teo, 'GET', '/api/systemes/99999')).body);
});

test('GET /api/systemes/:sid : ?type filtre la liste, la requête mal formée est refusée', async () => {
  const w = await monde();
  await creerElement(w);
  const url = `/api/systemes/${w.sys.id}`;
  assert.equal((await appel(w.app, w.mira, 'GET', `${url}?type=objet`)).json().fiches.length, 1);
  assert.equal((await appel(w.app, w.mira, 'GET', `${url}?type=lieu`)).json().fiches.length, 0);
  assert.equal((await appel(w.app, w.mira, 'GET', `${url}?type=a&type=b`)).statusCode, 400);
});

test('un MJ du système supprime un élément ; les autres le perdent de leurs listes', async () => {
  const w = await monde();
  const f = await creerElement(w);
  assert.equal((await appel(w.app, w.mira, 'DELETE', `/api/systemes/${w.sys.id}/fiches/${f.id}`)).statusCode, 204);
  assert.equal(w.app.db.prepare('SELECT 1 FROM fiches WHERE id = ?').get(f.id), undefined);
  assert.equal((await appel(w.app, w.lea, 'GET', `/api/univers/${w.lame.id}/fiches/${f.id}`)).statusCode, 404);
  assert.deepEqual((await appel(w.app, w.lea, 'GET', `/api/univers/${w.lame.id}/fiches`)).json().fiches, []);
});

test('l’espace caché reste fermé comme univers : ni id ni clé, même pour son MJ', async () => {
  const w = await monde();
  const f = await creerElement(w);
  for (const u of [`/api/univers/${w.espace}/fiches`, `/api/univers/${w.espace}/fiches/${f.id}`]) {
    assert.equal((await appel(w.app, w.mira, 'GET', u)).statusCode, 404, u);
  }
});
