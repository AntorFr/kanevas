// Tests of kanevas-fiches-liees-natures-serveur written from the exit criterion (AD-129, AD-133):
// the natures list and route, the relation rules, mentions, graph links, the type « famille ».
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
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const appel = (app: App, h: Hote, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

const TYPES = ['personnage', 'creature', 'lieu', 'faction', 'famille', 'objet', 'vaisseau', 'evenement', 'quete', 'note'];

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const mira = await connecter(app, 'mira');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Natures' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const fiche = async (type: string, titre: string) => {
    const charge = type === 'personnage' ? { pj: false } : undefined;
    const r = await appel(app, antor, 'POST', `${base}/fiches`, { type, titre, charge });
    assert.equal(r.statusCode, 201, `${type}: ${r.body}`);
    const f = r.json() as { id: number };
    const s = (await appel(app, antor, 'POST', `${base}/fiches/${f.id}/sections`, { titre: 'Texte', contenu: 'x' })).json();
    await appel(app, antor, 'PATCH', `${base}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
    return { id: f.id as number, sec: s.id as number, type };
  };
  const relier = (de: { id: number; sec: number }, corps: object) =>
    appel(app, antor, 'POST', `${base}/fiches/${de.id}/sections/${de.sec}/relations`, corps);
  const nbRelations = () => (app.db.prepare('SELECT COUNT(*) n FROM relations').get() as { n: number }).n;
  return { app, antor, lea, mira, base, fiche, relier, nbRelations };
}

test('GET natures : les cinq dans l’ordre avec libellés, symétrie et types ; un non-membre 404', async () => {
  const m = await monter();
  const r = await appel(m.app, m.antor, 'GET', `${m.base}/natures`);
  assert.equal(r.statusCode, 200);
  const n = r.json().natures as Array<Record<string, unknown>>;
  assert.deepEqual(n.map((x) => x.cle), ['se_situe', 'membre', 'detient', 'allie', 'ennemi']);
  assert.deepEqual(n[0], {
    cle: 'se_situe', libelleSource: 'se situe à', libelleCible: "s'y trouvent", symetrique: false,
    typesSource: ['personnage', 'creature', 'objet', 'faction', 'famille', 'vaisseau'], typesCible: ['lieu'],
  });
  assert.deepEqual(n.map((x) => x.symetrique), [false, false, false, true, true]);
  assert.deepEqual(n[1]!.typesCible, ['faction', 'famille']);
  assert.equal(n[2]!.libelleCible, 'détenu par');
  // a player member reads it too
  assert.equal((await appel(m.app, m.lea, 'GET', `${m.base}/natures`)).statusCode, 200);
  assert.equal((await appel(m.app, m.mira, 'GET', `${m.base}/natures`)).statusCode, 404);
});

test('relation à nature : personnage → lieu se_situe 201 {nature, qualificatif}', async () => {
  const m = await monter();
  const p = await m.fiche('personnage', 'Aldric');
  const l = await m.fiche('lieu', 'Port-Sel');
  const r = await m.relier(p, { cibleFicheId: l.id, nature: 'se_situe', qualificatif: 'habite' });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().nature, 'se_situe');
  assert.equal(r.json().qualificatif, 'habite');
  const lu = await appel(m.app, m.antor, 'GET', `${m.base}/fiches/${p.id}/sections/${p.sec}/relations`);
  assert.deepEqual(lu.json().relations.map((x: { nature: string; qualificatif: string }) => [x.nature, x.qualificatif]), [['se_situe', 'habite']]);
});

test('lieu → lieu, nature "dirige" ou clé inconnue : 400 nature_incompatible, rien écrit en base', async () => {
  const m = await monter();
  const a = await m.fiche('lieu', 'A');
  const b = await m.fiche('lieu', 'B');
  const p = await m.fiche('personnage', 'P');
  const f = await m.fiche('faction', 'F');
  for (const [de, vers, nature] of [[a, b, 'se_situe'], [p, f, 'dirige'], [p, f, 'zzz'], [p, f, 'SE_SITUE']] as const) {
    const r = await m.relier(de, { cibleFicheId: vers.id, nature, qualificatif: 'x' });
    assert.equal(r.statusCode, 400, `${nature} ${r.body}`);
    assert.equal(r.json().code, 'nature_incompatible');
  }
  const r = await m.relier(p, { cibleFicheId: f.id, nature: 42, qualificatif: 'x' });
  assert.equal(r.statusCode, 400);
  assert.equal(m.nbRelations(), 0);
});

// The matrix of docs/ecrans.md, « The natures »: [nature, sources, cibles, symmetric].
const MATRICE: Array<[string, string[], string[], boolean]> = [
  ['se_situe', ['personnage', 'creature', 'objet', 'faction', 'famille', 'vaisseau'], ['lieu'], false],
  ['membre', ['personnage', 'creature'], ['faction', 'famille'], false],
  ['detient', ['personnage', 'faction', 'famille', 'lieu'], ['objet', 'vaisseau'], false],
  ['allie', ['faction', 'famille', 'personnage'], ['faction', 'famille', 'personnage'], true],
  ['ennemi', ['faction', 'famille', 'personnage'], ['faction', 'famille', 'personnage'], true],
];

test('matrice des types : chaque couple de 10×10 est accepté ssi la table l’autorise (symétriques dans les deux sens)', async () => {
  const m = await monter();
  const fiches = new Map<string, { id: number; sec: number }>();
  for (const t of TYPES) fiches.set(t, await m.fiche(t, `Fiche ${t}`));
  let acceptes = 0;
  for (const [nature, src, cib, sym] of MATRICE) {
    for (const s of TYPES) {
      for (const c of TYPES) {
        if (s === c && !sym && !(src.includes(s) && cib.includes(c))) continue; // refused anyway; self-pair checked below
        const attendu = (src.includes(s) && cib.includes(c)) || (sym && src.includes(c) && cib.includes(s));
        // distinct sheets for same-type pairs
        const de = fiches.get(s)!;
        const vers = s === c ? await m.fiche(c, `Autre ${c} ${nature}`) : fiches.get(c)!;
        const r = await m.relier(de, { cibleFicheId: vers.id, nature, qualificatif: `${nature}-${s}-${c}` });
        assert.equal(r.statusCode, attendu ? 201 : 400, `${nature}: ${s} → ${c} ${r.body}`);
        if (attendu) acceptes++;
        else assert.equal(r.json().code, 'nature_incompatible', `${nature}: ${s} → ${c}`);
      }
    }
  }
  assert.equal(m.nbRelations(), acceptes);
  // 6 + 4 + 8... computed by hand from the table: se_situe 6, membre 4, detient 8, allie 9, ennemi 9
  assert.equal(acceptes, 6 + 4 + 8 + 9 + 9);
});

test('qualificatif : type synonyme, les deux = 400, ni nature ni qualificatif = 400, nature sans qualificatif ok', async () => {
  const m = await monter();
  const p = await m.fiche('personnage', 'P');
  const f = await m.fiche('faction', 'F');
  const t = await m.relier(p, { cibleFicheId: f.id, type: 'espion de' });
  assert.equal(t.statusCode, 201, t.body);
  assert.equal(t.json().qualificatif, 'espion de');
  assert.equal(t.json().nature, '');
  assert.equal((await m.relier(p, { cibleFicheId: f.id, type: 'x', qualificatif: 'y' })).statusCode, 400);
  assert.equal((await m.relier(p, { cibleFicheId: f.id })).statusCode, 400);
  assert.equal((await m.relier(p, { cibleFicheId: f.id, nature: '', qualificatif: '  ' })).statusCode, 400);
  assert.equal((await m.relier(p, { cibleFicheId: f.id, qualificatif: 'a'.repeat(81) })).statusCode, 400);
  assert.equal((await m.relier(p, { cibleFicheId: f.id, qualificatif: 'a'.repeat(80) })).statusCode, 201);
  const sans = await m.relier(p, { cibleFicheId: f.id, nature: 'membre' });
  assert.equal(sans.statusCode, 201, sans.body);
  assert.equal(sans.json().qualificatif, '');
  assert.equal(m.nbRelations(), 3);
});

test('doublons : rejeu 409 relation_existante ; nature ou qualificatif différent = nouvelle relation', async () => {
  const m = await monter();
  const p = await m.fiche('personnage', 'P');
  const f = await m.fiche('faction', 'F');
  const c = { cibleFicheId: f.id, nature: 'membre', qualificatif: 'dirige' };
  assert.equal((await m.relier(p, c)).statusCode, 201);
  const d = await m.relier(p, c);
  assert.equal(d.statusCode, 409);
  assert.equal(d.json().code, 'relation_existante');
  assert.equal((await m.relier(p, { ...c, qualificatif: 'recrue' })).statusCode, 201);
  assert.equal((await m.relier(p, { cibleFicheId: f.id, qualificatif: 'dirige' })).statusCode, 201); // free, same text
  assert.equal(m.nbRelations(), 3);
});

test('symétrique : A→B puis B→A au même qualificatif 409, qualificatif différent 201 ; une non-symétrique B→A reste permise', async () => {
  const m = await monter();
  const a = await m.fiche('faction', 'A');
  const b = await m.fiche('faction', 'B');
  assert.equal((await m.relier(a, { cibleFicheId: b.id, nature: 'allie', qualificatif: 'pacte' })).statusCode, 201);
  const inv = await m.relier(b, { cibleFicheId: a.id, nature: 'allie', qualificatif: 'pacte' });
  assert.equal(inv.statusCode, 409);
  assert.equal(inv.json().code, 'relation_existante');
  assert.equal((await m.relier(b, { cibleFicheId: a.id, nature: 'allie', qualificatif: 'commerce' })).statusCode, 201);
  // another symmetric nature on the same pair is another fact
  assert.equal((await m.relier(b, { cibleFicheId: a.id, nature: 'ennemi', qualificatif: 'pacte' })).statusCode, 201);
  // a free relation is not mirrored
  assert.equal((await m.relier(a, { cibleFicheId: b.id, qualificatif: 'rival' })).statusCode, 201);
  assert.equal((await m.relier(b, { cibleFicheId: a.id, qualificatif: 'rival' })).statusCode, 201);
  assert.equal(m.nbRelations(), 5);
});

test('joueur : aucune relation d’une section fermée (404), aucune vers une fiche illisible', async () => {
  const m = await monter();
  const p = await m.fiche('personnage', 'P');
  const f = await m.fiche('faction', 'F');
  const cachee = (await appel(m.app, m.antor, 'POST', `${m.base}/fiches`, { type: 'faction', titre: 'Secrète' })).json();
  await appel(m.app, m.antor, 'POST', `${m.base}/fiches/${cachee.id}/sections`, { titre: 'S', contenu: 'x' });
  const fermee = (await appel(m.app, m.antor, 'POST', `${m.base}/fiches/${p.id}/sections`, { titre: 'MJ', contenu: 'x' })).json();
  await m.relier(p, { cibleFicheId: f.id, nature: 'membre', qualificatif: 'ouvert' });
  await m.relier(p, { cibleFicheId: cachee.id, nature: 'membre', qualificatif: 'vers-cachee' });
  await m.relier({ id: p.id, sec: fermee.id }, { cibleFicheId: f.id, nature: 'membre', qualificatif: 'fermee' });
  const url = (s: number) => `${m.base}/fiches/${p.id}/sections/${s}/relations`;
  const l = await appel(m.app, m.lea, 'GET', url(p.sec));
  assert.deepEqual(l.json().relations.map((x: { qualificatif: string }) => x.qualificatif), ['ouvert']);
  assert.ok(!l.body.includes('Secrète') && !l.body.includes('vers-cachee'));
  const ferme = await appel(m.app, m.lea, 'GET', url(fermee.id));
  assert.equal(ferme.statusCode, 404);
  assert.ok(!ferme.body.includes('fermee'));
  const avant = m.nbRelations();
  const ecrit = await appel(m.app, m.lea, 'POST', url(p.sec), { cibleFicheId: f.id, nature: 'membre', qualificatif: 'intrus' });
  assert.ok([403, 404].includes(ecrit.statusCode), String(ecrit.statusCode));
  assert.equal(m.nbRelations(), avant);
});

test('« Mentionnée dans » ne liste plus une relation à nature, liste encore une relation libre', async () => {
  const m = await monter();
  const cible = await m.fiche('faction', 'Cible');
  const a = await m.fiche('personnage', 'Natureux');
  const b = await m.fiche('personnage', 'Libre');
  await m.relier(a, { cibleFicheId: cible.id, nature: 'membre', qualificatif: 'dirige' });
  await m.relier(b, { cibleFicheId: cible.id, qualificatif: 'surveille' });
  const f = (await appel(m.app, m.antor, 'GET', `${m.base}/fiches/${cible.id}`)).json();
  const ids = f.mentions.map((x: { ficheId?: number; fiche?: { id: number } }) => x.ficheId ?? x.fiche?.id);
  assert.deepEqual(ids, [b.id], JSON.stringify(f.mentions));
});

test('graphe : lien libre = son qualificatif ; lien à nature {nature, qualificatif, libelle} ; deux natures = deux liens', async () => {
  const m = await monter();
  const a = await m.fiche('faction', 'A');
  const b = await m.fiche('faction', 'B');
  const p = await m.fiche('personnage', 'P');
  await m.relier(a, { cibleFicheId: b.id, qualificatif: 'rival de' });
  await m.relier(a, { cibleFicheId: b.id, nature: 'allie', qualificatif: 'pacte' });
  await m.relier(a, { cibleFicheId: b.id, nature: 'ennemi', qualificatif: 'pacte' });
  await m.relier(p, { cibleFicheId: a.id, nature: 'membre', qualificatif: 'dirige' });
  const g = (await appel(m.app, m.antor, 'POST', `${m.base}/cartes`, { titre: 'G', forme: 'graphe' })).json();
  for (const f of [a, b, p]) await appel(m.app, m.antor, 'POST', `${m.base}/cartes/${g.id}/elements`, { ficheId: f.id });
  const c = (await appel(m.app, m.antor, 'GET', `${m.base}/cartes/${g.id}`)).json();
  const liens = c.liens.map((l: Record<string, unknown>) => [l.de, l.vers, l.nature, l.qualificatif, l.libelle]);
  assert.equal(liens.length, 4);
  assert.deepEqual(liens.find((l: unknown[]) => l[3] === 'rival de'), [a.id, b.id, '', 'rival de', 'rival de']);
  assert.deepEqual(liens.find((l: unknown[]) => l[2] === 'allie'), [a.id, b.id, 'allie', 'pacte', 'allié de — pacte']);
  assert.deepEqual(liens.find((l: unknown[]) => l[2] === 'ennemi'), [a.id, b.id, 'ennemi', 'pacte', 'ennemi de — pacte']);
  assert.deepEqual(liens.find((l: unknown[]) => l[2] === 'membre'), [p.id, a.id, 'membre', 'dirige', 'membre de — dirige']);
});

test('famille : dans GET types (icône users, « Nouvelle famille »), créable, désactivable et réactivable', async () => {
  const m = await monter();
  const ligne = async () =>
    (await appel(m.app, m.antor, 'GET', `${m.base}/types`)).json().find((t: { type: string }) => t.type === 'famille');
  const l = await ligne();
  assert.ok(l, 'famille absente de GET types');
  assert.equal(l.icone, 'users');
  assert.equal(l.nouveau, 'Nouvelle famille');
  assert.equal(l.singulier, 'Famille');
  assert.equal(l.active, true);
  assert.equal((await appel(m.app, m.antor, 'POST', `${m.base}/fiches`, { type: 'famille', titre: 'Corvalis' })).statusCode, 201);
  assert.equal((await appel(m.app, m.antor, 'PUT', `${m.base}/types/famille`, { etat: 'desactive' })).statusCode, 200);
  assert.equal((await ligne()).active, false);
  assert.equal((await appel(m.app, m.antor, 'POST', `${m.base}/fiches`, { type: 'famille', titre: 'Autre' })).json().code, 'type_desactive');
  assert.equal((await appel(m.app, m.antor, 'PUT', `${m.base}/types/famille`, { etat: 'active' })).statusCode, 200);
  assert.equal((await ligne()).active, true);
  assert.equal((await appel(m.app, m.antor, 'POST', `${m.base}/fiches`, { type: 'famille', titre: 'Autre' })).statusCode, 201);
});
