// Feature-level black-box tests of kanevas-synchro-lecture (token reads of sheets, files and maps), written from the feature
// sheet (critère de sortie), docs/parcours.md (B-105, B-106, B-90, B-91, B-99, B-93, P-22) and the contracts of ARCHITECTURE.md
// (AD-149 routes), not from the code. Expected values are literals. Real server in stub mode, real SQLite, real guard.
// World: the stub seed (« Lame d'Ébène »: antor GM, lea player; « Les Landes grises »: mira GM). No screen: E-18 does not change.
//
// Plan (besoin -> cases):
//  B-105 liste   nominal: champs de chaque entrée · bords: ?depuis futur / passé, ?depuis mal formé (400), ?apres, 1001 fiches = 2 pages sans
//                doublon ni trou, fiche modifiée entre les pages · exclusions: fiche cachée ni listée ni comptée · marque née dans Kanevas/importée
//  B-106 fiche   nominal: par clé = par id, deux lectures = même empreinte · une section / un champ d'en-tête / une relation / un alias / un
//                parent changés => empreinte de fiche et de la partie touchée, et pas les autres · retour à l'état d'avant => même empreinte ·
//                ancienne clé => fiche sous sa clé courante · échecs: inconnue, autre univers, 401 · exclusions: section MJ, bloc :::mj, relation
//                vers fiche cachée, parent caché, source Markdown seulement pour MJ (quel que soit le niveau du jeton)
//  B-90 fichiers nominal: liste avec empreinte stable, change au renommage / à la visibilité · contenu = octets exacts · exclusion: fichier MJ
//                404 pour joueuse, absent de sa liste · cartes: liste avec SHA-256 du fond, carte cachée absente
//  B-91 PUT      rejeu sans visibilite garde mj · création sans visibilite = joueurs · avec visibilite elle change
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Rep = { status: number; json: Any; texte: string };

let n = 0;
let app: Any;
let base = '';
const cookies: Record<string, string> = {};
const jetons: Record<string, string> = {};
const U: Record<string, number> = {};
const attente = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lire(r: Response): Promise<Rep> {
  const texte = await r.text();
  let json: Any = null;
  try { json = JSON.parse(texte); } catch { /* not json */ }
  return { status: r.status, json, texte };
}
async function ouvrirSession(compte: string): Promise<string> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}`,
  });
  const c = (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ');
  assert.ok(c, `no session for ${compte}`);
  return c;
}
/** A session call (the humans' screens' routes). */
async function ecran(compte: string, m: string, p: string, corps?: unknown): Promise<Rep> {
  return lire(await fetch(base + p, {
    method: m,
    headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }));
}
async function jetonAvecId(compte: string, niveau: 'lecture' | 'ecriture'): Promise<{ valeur: string; id: number }> {
  const r = await ecran(compte, 'POST', '/api/compte/jetons', { nom: `T ${compte} ${niveau} ${++n}`, dureeJours: 30, acces: { tous: true, niveauTous: niveau } });
  assert.equal(r.status, 201, r.texte);
  return { valeur: r.json.valeur, id: r.json.jeton.id };
}
const jeton = async (compte: string, niveau: 'lecture' | 'ecriture') => (await jetonAvecId(compte, niveau)).valeur;
/** A token call. */
async function api(valeur: string | null, p: string, init: RequestInit = {}): Promise<Rep> {
  return lire(await fetch(base + p, { ...init, headers: { ...(valeur ? { authorization: `Bearer ${valeur}` } : {}), ...(init.headers as Record<string, string> | undefined) } }));
}
const lame = (p: string) => `/api/v1/univers/${U.lame}${p}`;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const HEX32 = /^[0-9a-f]{32}$/;

type Fiche = { id: number; cle: string; sid: number };
/** A fresh sheet born in Kanevas, with one section « Corps » readable by players and some content. */
async function nouvelle(titre: string, contenu = 'Un texte de départ.', type = 'lieu'): Promise<Fiche> {
  const f = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches`, { type, titre: `${titre} ${++n}` });
  assert.equal(f.status, 201, f.texte);
  const s = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${f.json.id}/sections`, { titre: 'Corps', contenu: '' });
  assert.equal(s.status, 201, s.texte);
  const w = await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${f.json.id}/sections/${s.json.id}/contenu`, { contenu, version: s.json.version });
  assert.equal(w.status, 200, w.texte);
  const a = await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fiches/${f.json.id}/sections/${s.json.id}`, { joueursLisent: true });
  assert.equal(a.status, 200, a.texte);
  return { id: f.json.id, cle: f.json.cle, sid: s.json.id };
}
async function version(f: Fiche): Promise<number> {
  const r = await ecran('antor', 'GET', `/api/univers/${U.lame}/fiches/${f.id}/sections/${f.sid}`);
  return r.json.version;
}
async function reecrire(f: Fiche, contenu: string): Promise<void> {
  const w = await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${f.id}/sections/${f.sid}/contenu`, { contenu, version: await version(f) });
  assert.equal(w.status, 200, w.texte);
}
const lireFiche = async (t: string, ref: string) => (await api(t, lame(`/fiches/${encodeURIComponent(ref)}`)));
async function parId(titre: string, t = 'antorLec'): Promise<number> {
  const l = (await api(jetons[t], lame('/fiches'))).json.fiches as Any[];
  const f = l.find((x) => x.titre === titre);
  assert.ok(f, `fiche « ${titre} » absente de la liste`);
  return f.id;
}

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  for (const c of ['antor', 'lea', 'mira']) cookies[c] = await ouvrirSession(c);
  const us = (await ecran('antor', 'GET', '/api/univers')).json;
  const mira = (await ecran('mira', 'GET', '/api/univers')).json;
  for (const u of [...(us.univers ?? us), ...(mira.univers ?? mira)]) U[u.nom === "Lame d'Ébène" ? 'lame' : u.nom === 'Les Landes grises' ? 'landes' : u.nom] = u.id;
  jetons.antorLec = await jeton('antor', 'lecture');
  jetons.antorEcr = await jeton('antor', 'ecriture');
  jetons.leaLec = await jeton('lea', 'lecture');
  jetons.leaEcr = await jeton('lea', 'ecriture');
  jetons.miraLec = await jeton('mira', 'lecture');
});
after(() => void app.close());

describe('B-105 : la liste des fiches de l\'univers', () => {
  it('nominal : chaque entrée porte id, clé, marque, type, titre, deux empreintes de 32 hex et la date du dernier changement', async () => {
    const f = await nouvelle('Ténébria');
    const r = await api(jetons.antorLec, lame('/fiches'));
    assert.equal(r.status, 200, r.texte);
    const e = r.json.fiches.find((x: Any) => x.id === f.id);
    assert.ok(e, 'la fiche neuve est listée');
    assert.equal(e.cle, f.cle);
    assert.match(e.cle, /^lieu:tenebria-/);
    assert.equal(e.creee_via, 'ecran', 'née dans Kanevas');
    assert.equal(e.type, 'lieu');
    assert.equal(e.titre, `Ténébria ${n}`);
    assert.match(e.empreinte, HEX32);
    assert.match(e.empreinte_entete, HEX32);
    assert.match(e.modifie_le, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('marque : une fiche créée par l\'import est marquée « import », une fiche née à l\'écran « ecran »', async () => {
    const put = await api(jetons.antorEcr, `/api/v1/univers/${U.lame}/lots`, { method: 'POST' });
    assert.ok(put.status === 200 || put.status === 201, put.texte);
    const r = await api(jetons.antorEcr, lame('/fiches/lieu:importe-par-script'), {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'lieu', titre: 'Importé par script', sections: [{ cle: 'desc', titre: 'Description', contenu: 'Texte.', joueursLisent: true }] }),
    });
    assert.ok(r.status === 200 || r.status === 201, r.texte);
    const e = (await api(jetons.antorLec, lame('/fiches'))).json.fiches.find((x: Any) => x.cle === 'lieu:importe-par-script');
    assert.ok(e, 'listée sous sa clé d\'import');
    assert.equal(e.creee_via, 'import');
  });

  it('exclusion : la joueuse ne reçoit aucune fiche dont elle ne lit aucune section, ni total qui en trahirait le nombre', async () => {
    const mj = (await api(jetons.antorLec, lame('/fiches'))).json;
    const lea = (await api(jetons.leaLec, lame('/fiches'))).json;
    const titresLea = lea.fiches.map((x: Any) => x.titre);
    for (const cache of ['Le Prieur masqué', 'Les Sphères', 'Le Repaire des contrebandiers', 'Cercle des Cendres', 'La Guilde des Brumes', "Rapport secret de l'amirauté", 'Acte II — Le sceau brisé']) {
      assert.ok(mj.fiches.some((x: Any) => x.titre === cache), `le MJ voit « ${cache} »`);
      assert.equal(titresLea.includes(cache), false, `la joueuse ne voit pas « ${cache} »`);
    }
    assert.ok(titresLea.includes('Maître Aldric'));
    assert.deepEqual(Object.keys(lea).sort(), ['fiches', 'suivant'], 'aucun total ni compteur');
    assert.equal(lea.fiches.length, mj.fiches.length - 7);
  });

  it('bords ?depuis : une date future ne rend rien ; une date passée rend tout ; une date mal formée est 400 invalide, champ depuis', async () => {
    const tout = (await api(jetons.antorLec, lame('/fiches'))).json.fiches.length;
    const futur = await api(jetons.antorLec, lame('/fiches?depuis=2999-01-01T00:00:00.000Z'));
    assert.equal(futur.status, 200);
    assert.deepEqual(futur.json.fiches, []);
    const passe = await api(jetons.antorLec, lame('/fiches?depuis=2000-01-01T00:00:00.000Z'));
    assert.equal(passe.json.fiches.length, tout);
    const mal = await api(jetons.antorLec, lame('/fiches?depuis=hier'));
    assert.equal(mal.status, 400);
    assert.equal(mal.json.code, 'invalide');
    assert.equal(mal.json.champ, 'depuis');
  });

  it('?depuis ne rend que les fiches écrites depuis : section, déplacement sous un parent, alias, relation (B-93)', async () => {
    const [texte, deplacee, aliasee, reliee, intacte] = [await nouvelle('Dep texte'), await nouvelle('Dep parent'), await nouvelle('Dep alias'), await nouvelle('Dep relation'), await nouvelle('Dep intacte')];
    const parent = await nouvelle('Dep pere');
    await attente(30);
    const t = new Date().toISOString();
    await attente(30);
    await reecrire(texte, 'Un texte changé.');
    assert.equal((await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fiches/${deplacee.id}`, { parent: parent.id })).status, 200);
    assert.equal((await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${aliasee.id}/etiquetage`, { alias: ['Surnom'], etiquettes: [] })).status, 200);
    assert.equal((await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${reliee.id}/sections/${reliee.sid}/relations`, { cibleFicheId: intacte.id, qualificatif: 'voisin' })).status, 201);
    const r = await api(jetons.antorLec, lame(`/fiches?depuis=${encodeURIComponent(t)}`));
    assert.equal(r.status, 200, r.texte);
    const ids = r.json.fiches.map((x: Any) => x.id);
    for (const [nom, f] of [['section', texte], ['parent (fiche déplacée)', deplacee], ['alias', aliasee], ['relation', reliee]] as const) {
      assert.ok(ids.includes(f.id), `apparaît après : ${nom}`);
    }
    assert.equal(ids.includes(intacte.id), false, 'une fiche non écrite depuis n\'apparaît pas (la cible d\'une relation n\'est pas écrite)');
    assert.equal(ids.includes(await parId('Bran Corvalis')), false);
  });

  it('?apres : rend les fiches d\'id supérieur, dans l\'ordre des id', async () => {
    const tout = (await api(jetons.antorLec, lame('/fiches'))).json.fiches as Any[];
    const ids = tout.map((x) => x.id);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'ordre des id');
    const apres = ids[2];
    const r = await api(jetons.antorLec, lame(`/fiches?apres=${apres}`));
    assert.deepEqual(r.json.fiches.map((x: Any) => x.id), ids.filter((i) => i > apres));
  });

  it('bords : 1 001 fiches font deux pages, sans doublon ni trou, même si une fiche de la première page est modifiée entre les deux appels', async () => {
    for (let i = 0; i < 1001; i++) {
      const r = await ecran('mira', 'POST', `/api/univers/${U.landes}/fiches`, { type: 'lieu', titre: `Masse ${i}` });
      assert.equal(r.status, 201, r.texte);
    }
    const a = `/api/v1/univers/${U.landes}/fiches`;
    const p1 = await api(jetons.miraLec, a);
    assert.equal(p1.json.fiches.length, 1000);
    assert.ok(p1.json.suivant !== null && p1.json.suivant !== undefined, 'un curseur pour la suite');
    // a sheet of page 1 changes between the two calls: it moves in modifie_le, not in id order
    const premier = p1.json.fiches[0].id;
    const titre = (await ecran('mira', 'GET', `/api/univers/${U.landes}/fiches/${premier}`)).json.titre;
    assert.equal((await ecran('mira', 'PATCH', `/api/univers/${U.landes}/fiches/${premier}`, { titre: `${titre} !` })).status, 200);
    const p2 = await api(jetons.miraLec, `${a}?apres=${p1.json.fiches[999].id}`);
    const tous = [...p1.json.fiches, ...p2.json.fiches].map((x: Any) => x.id);
    assert.equal(new Set(tous).size, tous.length, 'aucun doublon');
    const attendu = (app.db.prepare('SELECT COUNT(*) AS c FROM fiches WHERE univers_id = ?').get(U.landes) as { c: number }).c;
    assert.equal(tous.length, attendu, 'aucun trou');
    assert.ok(p2.json.fiches.length >= 1);
    assert.equal(p2.json.suivant ?? null, null, 'dernière page');
  });
});

describe('B-106 : une fiche, par clé ou par id, avec une empreinte par partie', () => {
  it('nominal : par clé et par id, la même forme ; deux lectures rendent la même empreinte', async () => {
    const f = await nouvelle('Lecture');
    const a = await lireFiche(jetons.antorLec, f.cle);
    assert.equal(a.status, 200, a.texte);
    const b = await api(jetons.antorLec, lame(`/fiches/id/${f.id}`));
    assert.equal(b.status, 200, b.texte);
    assert.deepEqual(b.json, a.json);
    const c = await lireFiche(jetons.antorLec, f.cle);
    assert.equal(c.json.empreinte, a.json.empreinte);
    assert.match(a.json.empreinte, HEX32);
    assert.match(a.json.empreinteEntete, HEX32);
    assert.equal(a.json.cle, f.cle);
    assert.equal(a.json.entete.titre, `Lecture ${n}`);
    assert.equal(a.json.sections.length, 1);
    assert.equal(a.json.sections[0].titre, 'Corps');
    assert.equal(a.json.sections[0].contenu, 'Un texte de départ.');
    assert.match(a.json.sections[0].empreinte, HEX32);
  });

  it('une section modifiée change l\'empreinte de la fiche et de la section, pas celle d\'en-tête ; revenir au texte d\'avant rend l\'empreinte d\'avant', async () => {
    const f = await nouvelle('Section');
    const avant = (await lireFiche(jetons.antorLec, f.cle)).json;
    await reecrire(f, 'Un tout autre texte.');
    const apres = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.notEqual(apres.empreinte, avant.empreinte);
    assert.notEqual(apres.sections[0].empreinte, avant.sections[0].empreinte);
    assert.equal(apres.empreinteEntete, avant.empreinteEntete);
    assert.equal(apres.sections[0].contenu, 'Un tout autre texte.');
    await reecrire(f, 'Un texte de départ.');
    const retour = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.equal(retour.empreinte, avant.empreinte, 'rien de ce que la lecture rend n\'a changé');
    assert.equal(retour.sections[0].empreinte, avant.sections[0].empreinte);
  });

  it('un champ d\'en-tête modifié (titre) change l\'empreinte de la fiche et d\'en-tête, pas celle des sections ; la clé ne bouge pas', async () => {
    const f = await nouvelle('Entete');
    const avant = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.equal((await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fiches/${f.id}`, { titre: 'Un autre titre' })).status, 200);
    const apres = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.notEqual(apres.empreinte, avant.empreinte);
    assert.notEqual(apres.empreinteEntete, avant.empreinteEntete);
    assert.equal(apres.sections[0].empreinte, avant.sections[0].empreinte);
    assert.equal(apres.cle, f.cle);
    assert.equal(apres.entete.titre, 'Un autre titre');
  });

  it('un alias, une étiquette, un parent ajoutés changent l\'empreinte d\'en-tête et de fiche (chacun compte dans l\'en-tête)', async () => {
    const f = await nouvelle('Etiquetage');
    const pere = await nouvelle('Pere');
    let prec = (await lireFiche(jetons.antorLec, f.cle)).json;
    const etapes: [string, () => Promise<Rep>][] = [
      ['alias', () => ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${f.id}/etiquetage`, { alias: ['Surnom'], etiquettes: [] })],
      ['étiquette', () => ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${f.id}/etiquetage`, { alias: ['Surnom'], etiquettes: ['Côte'] })],
      ['parent', () => ecran('antor', 'PATCH', `/api/univers/${U.lame}/fiches/${f.id}`, { parent: pere.id })],
    ];
    for (const [nom, geste] of etapes) {
      assert.equal((await geste()).status, 200, nom);
      const cur = (await lireFiche(jetons.antorLec, f.cle)).json;
      assert.notEqual(cur.empreinteEntete, prec.empreinteEntete, `${nom} : empreinte d'en-tête`);
      assert.notEqual(cur.empreinte, prec.empreinte, `${nom} : empreinte de fiche`);
      assert.equal(cur.sections[0].empreinte, prec.sections[0].empreinte, `${nom} : sections inchangées`);
      prec = cur;
    }
    assert.deepEqual(prec.entete.alias, ['Surnom']);
    assert.deepEqual(prec.entete.etiquettes, ['Côte']);
  });

  it('une relation ajoutée change l\'empreinte de la fiche, porte la sienne, et laisse en-tête et section telles quelles', async () => {
    const f = await nouvelle('Relation');
    const cible = await nouvelle('Cible');
    const avant = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.deepEqual(avant.relations, []);
    assert.equal((await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${f.id}/sections/${f.sid}/relations`, { cibleFicheId: cible.id, qualificatif: 'voisin' })).status, 201);
    const apres = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.notEqual(apres.empreinte, avant.empreinte);
    assert.equal(apres.empreinteEntete, avant.empreinteEntete);
    assert.equal(apres.sections[0].empreinte, avant.sections[0].empreinte);
    assert.equal(apres.relations.length, 1);
    assert.equal(apres.relations[0].qualificatif, 'voisin');
    assert.equal(apres.relations[0].cible.id, cible.id);
    assert.equal(apres.relations[0].sectionId, f.sid);
    assert.match(apres.relations[0].empreinte, HEX32);
  });

  it('ancienne clé : après un changement de clé, GET /fiches/<ancienne clé> rend la fiche sous sa clé courante, sans redirection', async () => {
    const f = await nouvelle('Ancienne');
    const neuve = `lieu:nouvelle-cle-${n}`;
    assert.equal((await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fiches/${f.id}`, { cle: neuve })).status, 200);
    const r = await api(jetons.antorLec, lame(`/fiches/${encodeURIComponent(f.cle)}`), { redirect: 'manual' });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.id, f.id);
    assert.equal(r.json.cle, neuve);
    const liste = (await api(jetons.antorLec, lame('/fiches'))).json.fiches.filter((x: Any) => x.id === f.id);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].cle, neuve);
    const joueuse = await api(jetons.leaLec, lame(`/fiches/${encodeURIComponent(f.cle)}`));
    assert.equal(joueuse.status, 200, 'la joueuse atteint aussi la fiche par l\'ancienne clé');
    assert.equal(joueuse.json.id, f.id);
  });

  it('échecs : une clé inconnue, un id inconnu et une fiche d\'un autre univers sont le même 404 introuvable', async () => {
    const f = await nouvelle('Autre univers');
    const inconnue = await api(jetons.antorLec, lame('/fiches/lieu:nexiste-pas'));
    assert.equal(inconnue.status, 404);
    const idInconnu = await api(jetons.antorLec, lame('/fiches/id/999999'));
    assert.equal(idInconnu.status, 404);
    assert.deepEqual(idInconnu.json, inconnue.json);
    // the same sheet read through another universe (the MJ of Les Landes grises reads a Lame sheet's id)
    const autre = await api(jetons.miraLec, `/api/v1/univers/${U.landes}/fiches/id/${f.id}`);
    assert.equal(autre.status, 404);
    assert.deepEqual(autre.json, inconnue.json);
    const parCle = await api(jetons.miraLec, `/api/v1/univers/${U.landes}/fiches/${encodeURIComponent(f.cle)}`);
    assert.equal(parCle.status, 404);
  });

  it('échecs : sans jeton, avec un jeton inconnu, ou avec le seul cookie de session : 401 jeton_invalide', async () => {
    const f = await nouvelle('Garde');
    for (const [nom, rep] of [
      ['sans jeton', await api(null, lame(`/fiches/${encodeURIComponent(f.cle)}`))],
      ['jeton inconnu', await api('kvs_inconnu', lame(`/fiches/${encodeURIComponent(f.cle)}`))],
      ['cookie seul', await lire(await fetch(base + lame(`/fiches/${encodeURIComponent(f.cle)}`), { headers: { cookie: cookies.antor } }))],
      ['liste, cookie seul', await lire(await fetch(base + lame('/fiches'), { headers: { cookie: cookies.antor } }))],
    ] as const) {
      assert.equal(rep.status, 401, nom);
      assert.equal(rep.json.code, 'jeton_invalide', nom);
    }
  });

  it('échec : un jeton révoqué est 401 ; l\'alias /api/import/v1 répond à l\'identique', async () => {
    const f = await nouvelle('Alias');
    const v1 = await lireFiche(jetons.leaLec, f.cle);
    const alias = await api(jetons.leaLec, `/api/import/v1/univers/${U.lame}/fiches/${encodeURIComponent(f.cle)}`);
    assert.equal(alias.status, 200);
    assert.deepEqual(alias.json, v1.json);
    const liste = await api(jetons.leaLec, `/api/import/v1/univers/${U.lame}/fiches`);
    assert.equal(liste.status, 200);
    assert.ok(liste.json.fiches.some((x: Any) => x.id === f.id));
    const neuf = await jetonAvecId('lea', 'lecture');
    assert.equal((await lireFiche(neuf.valeur, f.cle)).status, 200);
    assert.equal((await ecran('lea', 'DELETE', `/api/compte/jetons/${neuf.id}`)).status, 200);
    assert.equal((await lireFiche(neuf.valeur, f.cle)).status, 401);
  });

  it('exclusion : la joueuse ne trouve ni la fiche cachée, par clé ou par id, ni la section réservée au MJ d\'une fiche qu\'elle lit', async () => {
    const prieur = await parId('Le Prieur masqué');
    assert.equal((await api(jetons.leaLec, lame(`/fiches/id/${prieur}`))).status, 404);
    const aldric = await parId('Maître Aldric');
    const mj = (await api(jetons.antorLec, lame(`/fiches/id/${aldric}`))).json;
    const lea = (await api(jetons.leaLec, lame(`/fiches/id/${aldric}`))).json;
    assert.deepEqual(mj.sections.map((s: Any) => s.titre), ['Apparence', 'Vérité — MJ seul']);
    assert.deepEqual(lea.sections.map((s: Any) => s.titre), ['Apparence']);
    assert.equal(JSON.stringify(lea).includes('Vérité'), false);
  });

  it('exclusion : un joueur reçoit le contenu public (sans bloc :::mj), un MJ la source ; le niveau du jeton n\'y change rien', async () => {
    const port = await parId('Port-Sel');
    const histoire = (jeton: string) => api(jeton, lame(`/fiches/id/${port}`)).then((r) => r.json.sections.find((s: Any) => s.titre === 'Histoire'));
    for (const t of ['leaLec', 'leaEcr']) {
      const s = await histoire(jetons[t]);
      assert.equal(s.contenu.includes(':::mj'), false, `${t} : pas de bloc MJ`);
      assert.equal(s.contenu.includes('sous-main'), false, `${t} : pas de secret MJ`);
      assert.equal(s.contenu.includes('Guilde des Brumes'), true, `${t} : le texte public reste`);
      assert.equal(s.contenu.includes('[[22|'), false, `${t} : pas de lien vers la fiche cachée`);
    }
    for (const t of ['antorLec', 'antorEcr']) {
      const s = await histoire(jetons[t]);
      assert.equal(s.contenu.includes(':::mj\nLe port est tenu en sous-main'), true, `${t} : la source avec son bloc MJ`);
    }
  });

  it('exclusion : une relation vers une fiche que la joueuse ne lit pas n\'est pas rendue, et le MJ la voit', async () => {
    const f = await nouvelle('Fuite relation');
    const prieur = await parId('Le Prieur masqué');
    assert.equal((await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${f.id}/sections/${f.sid}/relations`, { cibleFicheId: prieur, qualificatif: 'redoute' })).status, 201);
    const mj = (await lireFiche(jetons.antorLec, f.cle)).json;
    assert.equal(mj.relations.length, 1);
    assert.equal(mj.relations[0].cible.id, prieur);
    const lea = (await lireFiche(jetons.leaLec, f.cle)).json;
    assert.deepEqual(lea.relations, []);
    assert.equal(JSON.stringify(lea).includes('Prieur'), false);
    assert.equal(JSON.stringify(lea).includes('redoute'), false);
  });

  it('exclusion : le parent caché d\'une fiche lisible ne se trahit pas à la joueuse (Port-Sel est sous « Les Sphères », fiche MJ)', async () => {
    const port = await parId('Port-Sel');
    const mj = (await api(jetons.antorLec, lame(`/fiches/id/${port}`))).json;
    assert.ok(mj.entete.parent, 'le MJ voit le parent');
    const lea = (await api(jetons.leaLec, lame(`/fiches/id/${port}`))).json;
    assert.ok(lea.entete.parent === null || lea.entete.parent === undefined);
    assert.equal(JSON.stringify(lea).includes('Sphères'), false);
  });

  it('exclusion : les deux empreintes de la joueuse ne dépendent pas d\'une section qu\'elle ne lit pas', async () => {
    const f = await nouvelle('Empreinte cachee');
    const s2 = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${f.id}/sections`, { titre: 'Secret', contenu: 'Un secret MJ.' });
    assert.equal(s2.status, 201, s2.texte);
    const avant = (await lireFiche(jetons.leaLec, f.cle)).json;
    assert.deepEqual(avant.sections.map((s: Any) => s.titre), ['Corps']);
    const w = await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${f.id}/sections/${s2.json.id}/contenu`, { contenu: 'Un autre secret MJ.', version: s2.json.version });
    assert.equal(w.status, 200, w.texte);
    const apres = (await lireFiche(jetons.leaLec, f.cle)).json;
    assert.equal(apres.empreinte, avant.empreinte, 'la joueuse ne voit pas bouger ce qu\'elle ne lit pas');
  });
});

describe('B-90 : les fichiers et les cartes de l\'univers', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  async function envoyer(cle: string, octets: Buffer, champs: Record<string, string>): Promise<Rep> {
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) fd.append(k, v);
    fd.append('fichier', new Blob([octets]), 'x');
    return api(jetons.antorEcr, lame(`/fichiers/${cle}`), { method: 'PUT', body: fd });
  }
  const fichiers = async (t: string) => (await api(jetons[t], lame('/fichiers'))).json.fichiers as Any[];

  it('nominal : la liste porte id, clé, nom, visibilité, taille, SHA-256 et empreinte ; le contenu rend les octets exacts', async () => {
    assert.ok((await envoyer('img:nominal', PNG, { nom: 'nominal.png', visibilite: 'joueurs' })).status < 300);
    const e = (await fichiers('leaLec')).find((x) => x.cle === 'img:nominal');
    assert.ok(e);
    assert.equal(e.nom, 'nominal.png');
    assert.equal(e.visibilite, 'joueurs');
    assert.equal(e.taille, 12);
    assert.equal(e.sha256, '4353a1de7e0dcc4e87350e22d5c9ee9f3e70e8ce9c31533ec991bee8870c4814');
    assert.match(e.empreinte, HEX32);
    assert.ok(Number.isInteger(e.id));
    const c = await fetch(base + lame('/fichiers/img:nominal/contenu'), { headers: { authorization: `Bearer ${jetons.leaLec}` } });
    assert.equal(c.status, 200);
    assert.equal(sha(Buffer.from(await c.arrayBuffer())), e.sha256);
    const parId = await fetch(base + lame(`/fichiers/${e.id}/contenu`), { headers: { authorization: `Bearer ${jetons.leaLec}` } });
    assert.equal(parId.status, 200, 'l\'id est accepté comme la clé');
  });

  it('l\'empreinte d\'un fichier est la même deux fois, change au renommage et à la visibilité par l\'écran, et pas pour un autre fichier', async () => {
    assert.ok((await envoyer('img:emp', PNG, { nom: 'emp.png', visibilite: 'joueurs' })).status < 300);
    assert.ok((await envoyer('img:emp-autre', PNG, { nom: 'autre.png', visibilite: 'joueurs' })).status < 300);
    const lire1 = async (cle: string) => (await fichiers('antorLec')).find((x) => x.cle === cle)!;
    const a = await lire1('img:emp');
    const a2 = await lire1('img:emp');
    assert.equal(a2.empreinte, a.empreinte);
    const autre = await lire1('img:emp-autre');
    assert.equal((await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fichiers/${a.id}`, { nom: 'renomme.png' })).status, 200);
    const b = await lire1('img:emp');
    assert.notEqual(b.empreinte, a.empreinte);
    assert.equal(b.nom, 'renomme.png');
    assert.equal((await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fichiers/${a.id}`, { visibilite: 'mj' })).status, 200);
    const c = await lire1('img:emp');
    assert.notEqual(c.empreinte, b.empreinte);
    assert.equal(c.visibilite, 'mj');
    assert.equal((await lire1('img:emp-autre')).empreinte, autre.empreinte);
  });

  it('exclusion : un fichier réservé au MJ n\'est ni listé ni servi à la joueuse (404 comme l\'inconnu), le MJ le lit', async () => {
    assert.ok((await envoyer('img:secret', PNG, { nom: 'secret.png', visibilite: 'mj' })).status < 300);
    assert.equal((await fichiers('leaLec')).some((x) => x.cle === 'img:secret'), false);
    assert.equal((await fichiers('antorLec')).some((x) => x.cle === 'img:secret'), true);
    const a = await api(jetons.leaLec, lame('/fichiers/img:secret/contenu'));
    const b = await api(jetons.leaLec, lame('/fichiers/img:jamais-vu/contenu'));
    assert.equal(a.status, 404);
    assert.equal(b.status, 404);
    assert.deepEqual(a.json, b.json);
    assert.equal((await api(jetons.antorLec, lame('/fichiers/img:secret/contenu'))).status, 200);
  });

  it('bords : sans cookie ni jeton, 401 ; fichiers d\'un autre univers non lisibles (404)', async () => {
    assert.equal((await api(null, lame('/fichiers'))).status, 401);
    assert.equal((await api(null, lame('/fichiers/img:nominal/contenu'))).status, 401);
    assert.equal((await api(jetons.miraLec, `/api/v1/univers/${U.landes}/fichiers/img:nominal/contenu`)).status, 404);
    assert.equal((await api(jetons.leaLec, `/api/v1/univers/${U.landes}/fichiers`)).status, 404);
  });

  it('cartes : la liste porte id, titre, forme, visible, SHA-256 du fond et empreinte ; une carte cachée n\'est pas listée pour la joueuse', async () => {
    const c = await ecran('antor', 'POST', `/api/univers/${U.lame}/cartes`, { titre: 'Carte secrète', forme: 'graphe' });
    assert.equal(c.status, 201, c.texte);
    const mj = (await api(jetons.antorLec, lame('/cartes'))).json.cartes as Any[];
    const e = mj.find((x) => x.id === c.json.id);
    assert.ok(e);
    assert.equal(e.titre, 'Carte secrète');
    assert.equal(e.forme, 'graphe');
    assert.equal(e.visible, false);
    assert.equal(e.sha256Fond, null);
    assert.match(e.empreinte, HEX32);
    const lea = (await api(jetons.leaLec, lame('/cartes'))).json.cartes as Any[];
    assert.equal(lea.some((x) => x.id === c.json.id), false);
    assert.equal((await ecran('antor', 'PATCH', `/api/univers/${U.lame}/cartes/${c.json.id}`, { visible: true })).status, 200);
    const apres = (await api(jetons.leaLec, lame('/cartes'))).json.cartes as Any[];
    const v = apres.find((x) => x.id === c.json.id);
    assert.ok(v, 'rendue visible, la carte est listée');
    assert.notEqual(v.empreinte, e.empreinte);
  });

  it('cartes : une carte illustrée rend le SHA-256 de son fond', async () => {
    const fd = new FormData();
    fd.append('titre', 'Carte illustrée');
    fd.append('forme', 'illustree');
    fd.append('fichier', new Blob([PNG]), 'fond.png');
    const c = await lire(await fetch(base + `/api/univers/${U.lame}/cartes`, { method: 'POST', headers: { cookie: cookies.antor }, body: fd }));
    assert.equal(c.status, 201, c.texte);
    const e = ((await api(jetons.antorLec, lame('/cartes'))).json.cartes as Any[]).find((x) => x.id === c.json.id);
    assert.ok(e);
    assert.equal(e.sha256Fond, '4353a1de7e0dcc4e87350e22d5c9ee9f3e70e8ce9c31533ec991bee8870c4814');
  });
});

describe('B-91 : un rejeu de fichier n\'écrit que ce qu\'il envoie', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);
  async function envoyer(cle: string, champs: Record<string, string>): Promise<Rep> {
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) fd.append(k, v);
    fd.append('fichier', new Blob([PNG]), 'x');
    return api(jetons.antorEcr, lame(`/fichiers/${cle}`), { method: 'PUT', body: fd });
  }
  const visibilite = async (cle: string) => ((await api(jetons.antorLec, lame('/fichiers'))).json.fichiers as Any[]).find((x) => x.cle === cle)?.visibilite;

  it('un fichier réservé au MJ, rejoué sans visibilite, reste réservé au MJ', async () => {
    assert.ok((await envoyer('img:omission', { nom: 'o.png', visibilite: 'mj' })).status < 300);
    assert.equal(await visibilite('img:omission'), 'mj');
    const r = await envoyer('img:omission', { nom: 'o.png' });
    assert.ok(r.status < 300, r.texte);
    assert.equal(await visibilite('img:omission'), 'mj');
  });

  it('un fichier neuf sans visibilite est créé joueurs', async () => {
    assert.ok((await envoyer('img:neuf-sans', { nom: 'n.png' })).status < 300);
    assert.equal(await visibilite('img:neuf-sans'), 'joueurs');
  });

  it('un PUT avec visibilite la change, dans les deux sens', async () => {
    assert.ok((await envoyer('img:bascule', { nom: 'b.png', visibilite: 'joueurs' })).status < 300);
    assert.ok((await envoyer('img:bascule', { nom: 'b.png', visibilite: 'mj' })).status < 300);
    assert.equal(await visibilite('img:bascule'), 'mj');
    assert.ok((await envoyer('img:bascule', { nom: 'b.png', visibilite: 'joueurs' })).status < 300);
    assert.equal(await visibilite('img:bascule'), 'joueurs');
  });
});
