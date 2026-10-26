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

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  const lame = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as { id: number }).id;
  const landes = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Les Landes grises') as { id: number }).id;
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const base = `/api/univers/${lame}`;
  const req = (h: H, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const n = (t: string) => (app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  const creer = async (h: H, corps: object) => req(h, 'POST', `${base}/fiches`, corps);
  return { app, antor, lea, mira, lame, landes, base, req, n, creer };
}

test('aventure : type listé, naît en_preparation, charge {v:1,statut}', async () => {
  const w = await monde();
  const types = (await w.req(w.antor, 'GET', `${w.base}/types`)).json() as Record<string, unknown>[];
  const t = types.find((x) => x.type === 'aventure')!;
  assert.equal(t.reglable, true);
  assert.equal(t.icone, 'flag');
  assert.equal(t.slug, 'aventures');
  assert.equal(t.nouveau, 'Nouvelle aventure');
  assert.equal(t.aucun, 'Aucune aventure');
  const r = await w.creer(w.antor, { type: 'aventure', titre: 'Les Ombres' });
  assert.equal(r.statusCode, 201, r.body);
  assert.deepEqual(r.json().charge, { v: 1, statut: 'en_preparation' });
});

test('POST : statut refusé (premier niveau et dans charge), rien écrit', async () => {
  const w = await monde();
  const avant = w.n('fiches');
  for (const corps of [
    { type: 'aventure', titre: 'A', statut: 'en_cours' },
    { type: 'aventure', titre: 'A', charge: { statut: 'en_cours' } },
    { type: 'aventure', titre: 'A', charge: { v: 1, statut: 'prete' } },
  ]) {
    assert.equal((await w.creer(w.antor, corps)).statusCode, 400);
  }
  assert.equal(w.n('fiches'), avant);
});

test('service : creerFiche accepte chaque statut valide, refuse hors des quatre', async () => {
  const w = await monde();
  const { creerFiche } = await import('../services/fiches.js');
  const mj = (w.app.db.prepare("SELECT compte_id c FROM membres WHERE univers_id = ? AND role = 'mj' LIMIT 1").get(w.lame) as { c: number }).c;
  for (const s of ['en_preparation', 'prete', 'en_cours', 'terminee']) {
    const f = creerFiche(w.app.db, mj, w.lame, { type: 'aventure', titre: `A ${s}`, charge: { v: 1, statut: s } } as never);
    assert.equal((f.charge as { statut: string }).statut, s);
  }
  const avant = w.n('fiches');
  for (const s of ['finie', '', null, 3]) {
    assert.throws(
      () => creerFiche(w.app.db, mj, w.lame, { type: 'aventure', titre: 'X', charge: { v: 1, statut: s } } as never),
      (e: { code?: string; kind?: string }) => JSON.stringify(e).includes('invalide') || (e as Error).message.length > 0,
    );
  }
  assert.equal(w.n('fiches'), avant);
});

test('création entière : parent et sections fermée/ouverte aux joueurs', async () => {
  const w = await monde();
  const parent = (await w.creer(w.antor, { type: 'lieu', titre: 'Port' })).json();
  const r = await w.creer(w.antor, {
    type: 'aventure',
    titre: 'Sous le port',
    parent: parent.id,
    sections: [
      { titre: 'Présentation', joueursLisent: false },
      { titre: 'Ouverte', joueursLisent: true },
    ],
  });
  assert.equal(r.statusCode, 201, r.body);
  const id = r.json().id;
    const lignes = w.app.db
    .prepare('SELECT titre, contenu, joueurs_lisent j FROM sections WHERE fiche_id = ? ORDER BY ordre')
    .all(id) as { titre: string; contenu: string; j: number }[];
  assert.deepEqual(lignes.map((l) => [l.titre, l.contenu, l.j]), [['Présentation', '', 0], ['Ouverte', '', 1]]);
  assert.equal((w.app.db.prepare('SELECT parent_id p FROM fiches WHERE id = ?').get(id) as { p: number }).p, parent.id);
  // Léa lit la section ouverte, donc la fiche ; elle ne voit pas la fermée.
  const lue = (await w.req(w.lea, 'GET', `${w.base}/fiches/${id}`)).json();
  assert.deepEqual(lue.sections.map((s: { titre: string }) => s.titre), ['Ouverte']);
});

test('création entière : tout ou rien (parent inconnu/autre univers, 11 sections, section tardive fausse)', async () => {
  const w = await monde();
  const etranger = (await w.req(w.mira, 'POST', `/api/univers/${w.landes}/fiches`, { type: 'lieu', titre: 'Ailleurs' })).json();
  const avantF = w.n('fiches');
  const avantS = w.n('sections');
  const onze = Array.from({ length: 11 }, (_, i) => ({ titre: `S${i}` }));
  const dix = Array.from({ length: 10 }, (_, i) => ({ titre: `S${i}` }));
  const cas: [string, object][] = [
    ['inconnu', { parent: 999999 }],
    ['autre univers', { parent: etranger.id }],
    ['onze', { sections: onze }],
    ['tardive vide', { sections: [{ titre: 'Ok' }, { titre: '' }] }],
    ['tardive trop longue', { sections: [{ titre: 'Ok' }, { titre: 'x'.repeat(81) }] }],
    ['joueursLisent non booléen', { sections: [{ titre: 'Ok', joueursLisent: 'oui' }] }],
  ];
  for (const [nom, extra] of cas) {
    const r = await w.creer(w.antor, { type: 'aventure', titre: 'Atomique', ...extra });
    assert.ok(r.statusCode === 400 || r.statusCode === 404, `${nom}: ${r.statusCode}`);
    assert.equal(w.n('fiches'), avantF, nom);
    assert.equal(w.n('sections'), avantS, nom);
  }
  const ok = await w.creer(w.antor, { type: 'aventure', titre: 'Dix', sections: dix });
  assert.equal(ok.statusCode, 201, ok.body);
  assert.equal(w.n('sections'), avantS + 10);
});

test('PATCH statut : MJ 200 sans toucher modifie_le ; joueur 403 / 404 ; mode Joueur 403 ; autre type 400 ; valeur 400', async () => {
  const w = await monde();
  const ouverte = (await w.creer(w.antor, { type: 'aventure', titre: 'Lue', sections: [{ titre: 'P', joueursLisent: true }] })).json();
  const fermee = (await w.creer(w.antor, { type: 'aventure', titre: 'Secrète', sections: [{ titre: 'P' }] })).json();
  const pnj = (await w.creer(w.antor, { type: 'lieu', titre: 'Lieu' })).json();
  const modif = (id: number) => (w.app.db.prepare('SELECT modifie_le m FROM fiches WHERE id = ?').get(id) as { m: string }).m;
  const avant = modif(ouverte.id);
  await new Promise((r) => setTimeout(r, 15));
  const r = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${ouverte.id}`, { statut: 'en_cours' });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().charge, { v: 1, statut: 'en_cours' });
  assert.equal(modif(ouverte.id), avant);
  assert.equal((await w.req(w.antor, 'PATCH', `${w.base}/fiches/${ouverte.id}?mode=joueur`, { statut: 'prete' })).statusCode, 403);
  assert.equal((await w.req(w.lea, 'PATCH', `${w.base}/fiches/${ouverte.id}`, { statut: 'prete' })).statusCode, 403);
  assert.equal((await w.req(w.lea, 'PATCH', `${w.base}/fiches/${fermee.id}`, { statut: 'prete' })).statusCode, 404);
  assert.equal((await w.req(w.mira, 'PATCH', `${w.base}/fiches/${ouverte.id}`, { statut: 'prete' })).statusCode, 404);
  assert.equal((await w.req(w.antor, 'PATCH', `${w.base}/fiches/${pnj.id}`, { statut: 'prete' })).statusCode, 400);
  for (const v of ['finie', 3, null, '']) {
    assert.equal((await w.req(w.antor, 'PATCH', `${w.base}/fiches/${ouverte.id}`, { statut: v })).statusCode, 400, String(v));
  }
  const final = (await w.req(w.antor, 'GET', `${w.base}/fiches/${ouverte.id}`)).json();
  assert.equal(final.charge.statut, 'en_cours');
  const f2 = (await w.req(w.antor, 'GET', `${w.base}/fiches/${fermee.id}`)).json();
  assert.equal(f2.charge.statut, 'en_preparation');
});

test('PATCH {titre, statut} : transaction, une erreur annule tout', async () => {
  const w = await monde();
  const a = (await w.creer(w.antor, { type: 'aventure', titre: 'Avant' })).json();
  const r1 = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${a.id}`, { titre: 'Après', statut: 'terminee' });
  assert.equal(r1.statusCode, 200, r1.body);
  assert.deepEqual([r1.json().titre, r1.json().charge.statut], ['Après', 'terminee']);
  for (const mauvais of [{ titre: '', statut: 'prete' }, { titre: 'Autre', statut: 'zzz' }, { titre: 'Autre', statut: 'prete', parent: 999999 }]) {
    const r = await w.req(w.antor, 'PATCH', `${w.base}/fiches/${a.id}`, mauvais);
    assert.ok(r.statusCode >= 400, r.body);
    const l = (await w.req(w.antor, 'GET', `${w.base}/fiches/${a.id}`)).json();
    assert.deepEqual([l.titre, l.charge.statut], ['Après', 'terminee'], JSON.stringify(mauvais));
  }
});

test('filtre statut : seulement type aventure + valeur valide ; jamais une fiche illisible', async () => {
  const w = await monde();
  const mk = async (titre: string, ouverte: boolean, statut?: string) => {
    const f = (await w.creer(w.antor, { type: 'aventure', titre, sections: [{ titre: 'P', joueursLisent: ouverte }] })).json();
    if (statut) await w.req(w.antor, 'PATCH', `${w.base}/fiches/${f.id}`, { statut });
    return f;
  };
  await mk('Cours ouverte', true, 'en_cours');
  await mk('Cours fermée', false, 'en_cours');
  await mk('Prête', true, 'prete');
  const titres = async (h: H, qs: string) => {
    const r = await w.req(h, 'GET', `${w.base}/fiches?${qs}`);
    assert.equal(r.statusCode, 200, r.body);
    const j = r.json();
    return (j.fiches ?? j.items ?? j).map((f: { titre: string }) => f.titre).sort();
  };
  assert.deepEqual(await titres(w.antor, 'type=aventure&statut=en_cours'), ['Cours fermée', 'Cours ouverte']);
  assert.deepEqual(await titres(w.lea, 'type=aventure&statut=en_cours'), ['Cours ouverte']);
  assert.deepEqual(await titres(w.antor, 'type=aventure&statut=terminee'), []);
  for (const qs of ['statut=en_cours', 'type=lieu&statut=en_cours', 'type=aventure&statut=zzz', 'type=aventure&statut=']) {
    assert.equal((await w.req(w.antor, 'GET', `${w.base}/fiches?${qs}`)).statusCode, 400, qs);
  }
});

test('le titre d’une aventure sans section lue ne fuit ni en liste, ni en recherche, ni en arbre', async () => {
  const w = await monde();
  await w.creer(w.antor, { type: 'aventure', titre: 'Zorglub secret', sections: [{ titre: 'P' }] });
  await w.creer(w.antor, { type: 'aventure', titre: 'Zorglub sans section' });
  for (const url of [`${w.base}/fiches?type=aventure`, `${w.base}/fiches?q=Zorglub`, `${w.base}/fiches?type=aventure&parent=racine`, `${w.base}/fiches`]) {
    const r = await w.req(w.lea, 'GET', url);
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(!r.body.includes('Zorglub'), url);
  }
  assert.ok((await w.req(w.antor, 'GET', `${w.base}/fiches?q=Zorglub`)).body.includes('Zorglub'));
});

test('type désactivé : création refusée, lecture et écriture existantes intactes', async () => {
  const w = await monde();
  const a = (await w.creer(w.antor, { type: 'aventure', titre: 'Existante', sections: [{ titre: 'P', joueursLisent: true }] })).json();
  const cof = (w.app.db.prepare('SELECT systeme_id s FROM univers WHERE id = ?').get(w.lame) as { s: number }).s;
  assert.equal((await w.req(w.antor, 'PUT', `/api/systemes/${cof}/types/aventure`, { active: false })).statusCode, 200);
  const r = await w.creer(w.antor, { type: 'aventure', titre: 'Nouvelle' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'type_desactive');
  assert.equal((await w.req(w.lea, 'GET', `${w.base}/fiches/${a.id}`)).statusCode, 200);
  assert.equal((await w.req(w.antor, 'PATCH', `${w.base}/fiches/${a.id}`, { statut: 'prete' })).statusCode, 200);
  assert.equal((await w.req(w.antor, 'PUT', `/api/systemes/${cof}/types/aventure`, { active: true })).statusCode, 200);
  assert.equal((await w.creer(w.antor, { type: 'aventure', titre: 'Rouverte' })).statusCode, 201);
});

test('changement de type : devient aventure en_preparation, en sort sans statut ; compte_rendu infixable', async () => {
  const w = await monde();
  const l = (await w.creer(w.antor, { type: 'lieu', titre: 'Devient' })).json();
  const r = await w.req(w.antor, 'POST', `${w.base}/fiches/${l.id}/type`, { type: 'aventure' });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().charge, { v: 1, statut: 'en_preparation' });
  await w.req(w.antor, 'PATCH', `${w.base}/fiches/${l.id}`, { statut: 'terminee' });
  const s = await w.req(w.antor, 'POST', `${w.base}/fiches/${l.id}/type`, { type: 'note' });
  assert.equal(s.statusCode, 200, s.body);
  assert.ok(!JSON.stringify(s.json().charge).includes('statut'));
  const brut = (w.app.db.prepare('SELECT charge FROM fiches WHERE id = ?').get(l.id) as { charge: string }).charge;
  assert.ok(!brut.includes('statut'));
  const r2 = await w.req(w.antor, 'POST', `${w.base}/fiches/${l.id}/type`, { type: 'compte_rendu' });
  assert.equal(r2.statusCode, 400);
  assert.equal(r2.json().code, 'type_non_reglable');
});
