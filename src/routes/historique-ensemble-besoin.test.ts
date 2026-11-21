// Feature-level black-box tests of kanevas-synchro-historique, written from the feature sheet (critère de sortie),
// docs/parcours.md (B-93, B-96, B-102, B-103, B-40, P-26) and docs/ecrans.md (E-24, E-9 « Historique »), not from the code.
// Door of every effect: the routes the screens and the tokens call (real server in stub mode, real SQLite, real guard).
// Expected values are literals. The screens are covered by src/e2e/historique-ensemble-ecran.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Rep = { status: number; json: Any };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

let app: Any;
let base = '';
let antor: Client;
let lea: Client;
let mira: Client;
let U = 0; // universe « Nyx », antor GM, lea player
let UCLE = '';

async function lire(r: Response): Promise<Rep> {
  const t = await r.text();
  let json: Any = null;
  try { json = JSON.parse(t); } catch { /* empty */ }
  return { status: r.status, json };
}
async function session(compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}`,
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session for ${compte}`);
  return async (m, p, c) => lire(await fetch(base + p, {
    method: m,
    headers: { cookie, ...(c === undefined ? {} : { 'content-type': 'application/json' }) },
    body: c === undefined ? undefined : JSON.stringify(c),
  }));
}
async function avecJeton(m: string, p: string, valeur: string | null, corps?: unknown): Promise<Rep> {
  return lire(await fetch(base + p, {
    method: m,
    headers: { ...(valeur ? { authorization: `Bearer ${valeur}` } : {}), ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }));
}
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (r: Rep, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.json)); return r.json; };

const H = () => `/api/univers/${U}/historique`;
const F = (fid: number) => `/api/univers/${U}/fiches/${fid}`;
async function fiche(titre: string, type = 'lieu'): Promise<number> {
  const charge = type === 'personnage' ? { pj: false } : undefined;
  return ok(await antor('POST', `/api/univers/${U}/fiches`, { type, titre, ...(charge ? { charge } : {}) }), 201).id;
}
async function section(fid: number, titre: string, contenu: string): Promise<{ id: number; version: number }> {
  return ok(await antor('POST', `${F(fid)}/sections`, { titre, contenu }), 201);
}
async function reecrire(fid: number, sid: number, contenu: string): Promise<number> {
  const v = ok(await antor('GET', `${F(fid)}/sections/${sid}`)).version;
  return ok(await antor('PUT', `${F(fid)}/sections/${sid}/contenu`, { contenu, version: v })).version;
}
async function lignes(q = '', c: Client = antor): Promise<Any[]> {
  return ok(await c('GET', `${H()}${q}`)).lignes;
}
const ligne = async (fid: number, objet: string, action: string, c: Client = antor) =>
  (await lignes(`?fiche=${fid}`, c)).find((l) => l.objet === objet && l.action === action);
const modifieLe = async (fid: number): Promise<string> => ok(await antor('GET', F(fid))).modifieLe;
const bd = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as Any;

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  antor = await session('antor');
  lea = await session('lea');
  mira = await session('mira');
  const u = ok(await antor('POST', '/api/univers', { nom: 'Nyx' }), 201);
  U = u.id;
  UCLE = u.cle;
  ok(await antor('POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' }), 201);
});
after(() => void app.close());

describe('B-93 : modifie_le bouge à chaque écriture de ce que la lecture rend', () => {
  it('une section réécrite, une section ajoutée, une section supprimée', async () => {
    const f = await fiche('Port-Sel');
    const s = await section(f, 'Aperçu', 'Un port.');
    let avant = await modifieLe(f);
    await attendre(15);
    await reecrire(f, s.id, 'Un grand port.');
    let apres = await modifieLe(f);
    assert.ok(apres > avant, `réécriture: ${avant} -> ${apres}`);
    avant = apres; await attendre(15);
    const s2 = await section(f, 'Quais', 'Bois.');
    apres = await modifieLe(f);
    assert.ok(apres > avant, `ajout: ${avant} -> ${apres}`);
    avant = apres; await attendre(15);
    assert.equal((await antor('DELETE', `${F(f)}/sections/${s2.id}`)).status, 204);
    apres = await modifieLe(f);
    assert.ok(apres > avant, `suppression: ${avant} -> ${apres}`);
  });

  it('le déplacement sous un parent, le titre, les alias, les étiquettes', async () => {
    const f = await fiche('Cap Brume');
    const p = await fiche('Côte des Brumes');
    const pas = [
      ['déplacement', () => antor('PATCH', F(f), { parent: p })],
      ['titre', () => antor('PATCH', F(f), { titre: 'Cap Brume-Noire' })],
      ['alias', () => antor('PUT', `${F(f)}/etiquetage`, { alias: ['Le Cap'], etiquettes: [] })],
      ['étiquette', () => antor('PUT', `${F(f)}/etiquetage`, { alias: ['Le Cap'], etiquettes: ['côtier'] })],
    ] as const;
    for (const [nom, geste] of pas) {
      const avant = await modifieLe(f);
      await attendre(15);
      ok(await geste());
      const apres = await modifieLe(f);
      assert.ok(apres > avant, `${nom}: ${avant} -> ${apres}`);
    }
  });

  it('une relation ajoutée puis retirée bouge la date de la fiche qui la porte', async () => {
    const f = await fiche('Phare');
    const cible = await fiche('Récif');
    const s = await section(f, 'Aperçu', 'Un phare.');
    let avant = await modifieLe(f);
    await attendre(15);
    const rel = ok(await antor('POST', `${F(f)}/sections/${s.id}/relations`, { cibleFicheId: cible, qualificatif: 'voisin' }), 201);
    let apres = await modifieLe(f);
    assert.ok(apres > avant, `ajout: ${avant} -> ${apres}`);
    avant = apres; await attendre(15);
    assert.equal((await antor('DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`)).status, 204);
    apres = await modifieLe(f);
    assert.ok(apres > avant, `retrait: ${avant} -> ${apres}`);
  });

  it('un fichier joint à une section, puis retiré : la date de la fiche bouge et une ligne s’ajoute sur la fiche de la section, à chaque fois', async () => {
    const f = await fiche('Archives');
    const s = await section(f, 'Pièces', 'Dossier.');
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('fichier', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
    const cookie = (await fetch(`${base}/connexion-bouchon`, { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'compte=antor' })).headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const up = await lire(await fetch(`${base}/api/univers/${U}/fichiers`, { method: 'POST', headers: { cookie }, body: form }));
    assert.equal(up.status, 201, JSON.stringify(up.json));
    const avantLignes = (await lignes(`?fiche=${f}`)).length;
    let avant = await modifieLe(f);
    await attendre(15);
    ok(await antor('POST', `${F(f)}/sections/${s.id}/fichiers`, { fichierId: up.json.id }), 201);
    let apres = await modifieLe(f);
    assert.ok(apres > avant, `joint: ${avant} -> ${apres}`);
    assert.equal((await lignes(`?fiche=${f}`)).length, avantLignes + 1, 'une ligne « Fichier joint »');
    avant = apres; await attendre(15);
    assert.equal((await antor('DELETE', `${F(f)}/sections/${s.id}/fichiers/${up.json.id}`)).status, 204);
    apres = await modifieLe(f);
    assert.ok(apres > avant, `retiré: ${avant} -> ${apres}`);
    assert.equal((await lignes(`?fiche=${f}`)).length, avantLignes + 2, 'une ligne « Fichier retiré »');
  });

  it('une écriture par jeton bouge aussi la date (« quiconque écrit »)', async () => {
    const jt = ok(await antor('POST', '/api/compte/jetons', { nom: 'Date', dureeJours: 30, acces: { tous: false, univers: [{ universId: U, niveau: 'ecriture' }] } }), 201);
    const put = (t: string) => avecJeton('PUT', `/api/v1/univers/${UCLE}/fiches/lieu:date-jeton`, jt.valeur,
      { type: 'lieu', titre: 'Date jeton', sections: [{ cle: 's:a', titre: 'A', contenu: t }] });
    ok(await put('v1'));
    const fid = bd("SELECT id FROM fiches WHERE univers_id = ? AND cle = 'lieu:date-jeton'", U).id;
    const avant = await modifieLe(fid);
    await attendre(15);
    ok(await put('v2'));
    assert.ok((await modifieLe(fid)) > avant);
  });
});

describe('B-102 : l’historique de chaque écriture', () => {
  it('chaque geste de l’écran laisse une ligne : objet, action, compte, origine ecran, date récente, fiche', async () => {
    const t0 = Date.now() - 5000;
    const f = await fiche('Aldric', 'personnage');
    const cible = await fiche('Garde');
    const s = await section(f, 'Histoire', 'v1');
    await reecrire(f, s.id, 'v2');
    const rel = ok(await antor('POST', `${F(f)}/sections/${s.id}/relations`, { cibleFicheId: cible, qualificatif: 'sert' }), 201);
    assert.equal((await antor('DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`)).status, 204);
    ok(await antor('PATCH', F(f), { titre: 'Maître Aldric' }));
    ok(await antor('PUT', `${F(f)}/etiquetage`, { alias: ['Al'], etiquettes: ['mentor'] }));
    assert.equal((await antor('DELETE', `${F(f)}/sections/${s.id}`)).status, 204);
    const l = await lignes(`?fiche=${f}`);
    const quoi = l.map((x) => `${x.objet}/${x.action}`);
    for (const attendu of ['fiche/creee', 'section/creee', 'section/modifiee', 'relation/creee', 'relation/supprimee', 'entete/modifiee', 'section/supprimee']) {
      assert.ok(quoi.includes(attendu), `${attendu} absente de ${quoi.join(', ')}`);
    }
    for (const x of l) {
      assert.equal(x.origine, 'ecran');
      assert.equal(x.compte.username, 'antor');
      assert.equal(x.jeton, null);
      assert.ok(Date.parse(x.creeLe) >= t0 && Date.parse(x.creeLe) <= Date.now() + 1000, x.creeLe);
    }
    const ids = l.map((x) => x.id);
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a), 'le plus récent d’abord');
  });

  it('la suppression d’une fiche laisse sa ligne (fiche/supprimee) et la fiche reste lisible dans l’historique', async () => {
    const f = await fiche('Ruines');
    const s = await section(f, 'Secret', 'Sous la dalle.');
    assert.equal((await antor('DELETE', F(f))).status, 204);
    const l = (await lignes()).find((x) => x.objet === 'fiche' && x.action === 'supprimee' && x.ficheCle.includes('ruines'));
    assert.ok(l, 'ligne de suppression');
    assert.equal(l.ficheTitre, 'Ruines');
    assert.equal(l.restaurable, false);
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.deepEqual(d.sections.map((x: Any) => [x.titre, x.contenu]), [['Secret', 'Sous la dalle.']]);
    assert.ok(s.id);
  });

  it('la ligne garde l’empreinte après : deux textes différents → deux empreintes ; la restauration retrouve la première', async () => {
    const f = await fiche('Empreintes');
    const s = await section(f, 'Texte', 'alpha');
    await reecrire(f, s.id, 'beta');
    const modifs = (await lignes(`?fiche=${f}&action=modifiee`)).filter((x) => x.objet === 'section');
    const crees = (await lignes(`?fiche=${f}&action=creee`)).filter((x) => x.objet === 'section');
    const emp = (id: number) => bd('SELECT empreinte_apres e FROM historique WHERE id = ?', id).e as string;
    assert.ok(emp(crees[0].id) && emp(modifs[0].id));
    assert.notEqual(emp(crees[0].id), emp(modifs[0].id));
    const d = ok(await antor('GET', `${H()}/${modifs[0].id}`));
    ok(await antor('POST', `${H()}/${modifs[0].id}/restaurer`, { version: d.version }));
    const derniere = (await lignes(`?fiche=${f}&action=modifiee`))[0];
    assert.equal(emp(derniere.id), emp(crees[0].id), 'même texte, même empreinte');
  });

  it('une résolution de lien (origine système) n’écrit aucune ligne', async () => {
    const f = await fiche('Chroniqueur');
    await section(f, 'Notes', 'Il parle de [[Cité Fantôme]].');
    const avant = (await lignes(`?fiche=${f}`)).length;
    const g = await fiche('Cité Fantôme');
    assert.ok(g);
    assert.equal((await lignes(`?fiche=${f}`)).length, avant);
  });

  it('filtres : compte, jeton, action, fiche, depuis ; valeur invalide → 400', async () => {
    const f = await fiche('Filtres');
    await section(f, 'A', 'x');
    const antorId = bd("SELECT id FROM comptes WHERE username = 'antor'").id;
    const parCompte = await lignes(`?compte=${antorId}&fiche=${f}`);
    assert.ok(parCompte.length >= 2 && parCompte.every((x) => x.compte.id === antorId));
    assert.deepEqual(await lignes(`?compte=999999&fiche=${f}`), []);
    assert.deepEqual(await lignes('?jeton=Nul-part-nomme'), []);
    const crees = await lignes(`?fiche=${f}&action=creee`);
    assert.ok(crees.length >= 2 && crees.every((x) => x.action === 'creee'));
    assert.deepEqual(await lignes('?depuis=2999-01-01T00:00:00Z'), []);
    assert.ok((await lignes('?depuis=2000-01-01T00:00:00Z')).length > 0);
    assert.equal((await antor('GET', `${H()}?action=nimporte`)).status, 400);
    assert.equal((await antor('GET', `${H()}?compte=abc`)).status, 400);
  });

  it('100 lignes par page, un curseur, la page suivante continue sans recouvrement ; aucun total', async () => {
    const f = await fiche('Pagination');
    const s = await section(f, 'Journal', 'v0');
    for (let i = 1; i <= 104; i++) await reecrire(f, s.id, `v${i}`);
    const p1 = ok(await antor('GET', `${H()}?fiche=${f}`));
    assert.equal(p1.lignes.length, 100);
    assert.ok(p1.curseur);
    assert.deepEqual(Object.keys(p1).sort(), ['curseur', 'lignes'], 'pas de total : une ligne pourrait trahir un bloc MJ');
    const p2 = ok(await antor('GET', `${H()}?fiche=${f}&apres=${encodeURIComponent(p1.curseur)}`));
    assert.equal(p2.lignes.length, 6, '1 fiche + 1 section + 104 réécritures = 106');
    assert.equal(p2.curseur, null);
    const tous = [...p1.lignes, ...p2.lignes].map((x: Any) => x.id);
    assert.equal(new Set(tous).size, 106);
    assert.ok(Math.max(...p2.lignes.map((x: Any) => x.id)) < Math.min(...p1.lignes.map((x: Any) => x.id)));
  });

  it('contributeurs : le compte d’antor y figure, pour le filtre de E-24', async () => {
    const r = ok(await antor('GET', `${H()}/contributeurs`));
    assert.ok(JSON.stringify(r).includes('antor'), JSON.stringify(r));
  });

  it('exclusion : une joueuse reçoit 403, une non-membre 404, un MJ en mode joueur 403 ; jamais une ligne', async () => {
    const f = await fiche('Secrets');
    await section(f, 'MJ seul', 'Le traître est X.');
    const l = (await lignes(`?fiche=${f}`))[0];
    for (const url of [H(), `${H()}/${l.id}`, `${H()}/contributeurs`]) {
      const r = await lea('GET', url);
      assert.equal(r.status, 403, url);
      assert.equal(JSON.stringify(r.json).includes('traître'), false);
      assert.equal((await mira('GET', url)).status, 404, `non-membre ${url}`);
    }
    assert.equal((await antor('GET', `${H()}?mode=joueur`)).status, 403, 'MJ en mode joueur (query)');
    assert.equal((await lea('POST', `${H()}/${l.id}/restaurer`, { version: 1 })).status, 403);
    assert.equal((await mira('POST', `${H()}/${l.id}/restaurer`, { version: 1 })).status, 404);
  });

  it('exclusion : une ligne d’un autre univers n’est pas lisible par son identifiant', async () => {
    const autre = ok(await antor('POST', '/api/univers', { nom: 'Autre monde' }), 201);
    const fo = ok(await antor('POST', `/api/univers/${autre.id}/fiches`, { type: 'lieu', titre: 'Ailleurs' }), 201);
    const lo = ok(await antor('GET', `/api/univers/${autre.id}/historique?fiche=${fo.id}`)).lignes[0];
    assert.equal((await antor('GET', `${H()}/${lo.id}`)).status, 404);
  });

  it('rétention : une valeur de 29 jours se lit, de 31 jours non ; la ligne reste (90 jours)', async () => {
    const f = await fiche('Rétention');
    const s = await section(f, 'Texte', 'ancien');
    await reecrire(f, s.id, 'récent');
    const l = await ligne(f, 'section', 'modifiee');
    const jours = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
    app.db.prepare('UPDATE historique SET cree_le = ? WHERE id = ?').run(jours(29), l.id);
    let d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal(d.avant.contenu, 'ancien');
    assert.equal(d.ligne.valeurConservee, true);
    app.db.prepare('UPDATE historique SET cree_le = ? WHERE id = ?').run(jours(31), l.id);
    d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal(d.avant, null);
    assert.equal(d.ligne.valeurConservee, false);
    assert.ok((await lignes(`?fiche=${f}`)).some((x) => x.id === l.id), 'la ligne de 31 jours est encore là');
  });
});

describe('B-103 : restaurer une valeur de moins de 30 jours', () => {
  it('une section : le texte revient, une ligne s’ajoute (origine ecran, compte antor), la version avance', async () => {
    const f = await fiche('Restauration');
    const s = await section(f, 'Histoire', 'Texte d’origine.');
    await reecrire(f, s.id, 'Texte gâché.');
    const l = await ligne(f, 'section', 'modifiee');
    assert.equal(l.restaurable, true);
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal(d.avant.contenu, 'Texte d’origine.');
    assert.equal(d.courante.contenu, 'Texte gâché.');
    const nb = (await lignes(`?fiche=${f}`)).length;
    ok(await antor('POST', `${H()}/${l.id}/restaurer`, { version: d.version }));
    assert.equal(ok(await antor('GET', `${F(f)}/sections/${s.id}`)).contenu, 'Texte d’origine.');
    const apres = await lignes(`?fiche=${f}`);
    assert.equal(apres.length, nb + 1);
    assert.equal(apres[0].objet, 'section');
    assert.equal(apres[0].action, 'modifiee');
    assert.equal(apres[0].origine, 'ecran');
    assert.equal(apres[0].compte.username, 'antor');
    assert.ok(apres[0].id > l.id);
  });

  it('refus historique_perime : la section a changé depuis l’affichage ; rien n’est écrit', async () => {
    const f = await fiche('Périmé');
    const s = await section(f, 'Histoire', 'v1');
    await reecrire(f, s.id, 'v2');
    const l = await ligne(f, 'section', 'modifiee');
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    await reecrire(f, s.id, 'v3 écrite par quelqu’un d’autre');
    const nb = (await lignes(`?fiche=${f}`)).length;
    const r = await antor('POST', `${H()}/${l.id}/restaurer`, { version: d.version });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'historique_perime');
    assert.equal(ok(await antor('GET', `${F(f)}/sections/${s.id}`)).contenu, 'v3 écrite par quelqu’un d’autre');
    assert.equal((await lignes(`?fiche=${f}`)).length, nb);
  });

  it('refus historique_perime aussi quand la section a été supprimée depuis l’affichage', async () => {
    const f = await fiche('Périmé supprimée');
    const s = await section(f, 'Histoire', 'v1');
    await reecrire(f, s.id, 'v2');
    const l = (await lignes(`?fiche=${f}&action=modifiee`)).find((x) => x.objet === 'section');
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal((await antor('DELETE', `${F(f)}/sections/${s.id}`)).status, 204);
    const r = await antor('POST', `${H()}/${l.id}/restaurer`, { version: d.version });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'historique_perime');
  });

  it('version absente → 400 ; version fausse → 409', async () => {
    const f = await fiche('Version');
    const s = await section(f, 'T', 'a');
    await reecrire(f, s.id, 'b');
    const l = await ligne(f, 'section', 'modifiee');
    assert.equal((await antor('POST', `${H()}/${l.id}/restaurer`, {})).status, 400);
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal((await antor('POST', `${H()}/${l.id}/restaurer`, { version: d.version + 7 })).status, 409);
  });

  it('une section supprimée revient sous sa clé, à la fin de la fiche, avec son dernier contenu', async () => {
    const f = await fiche('Retour');
    const a = await section(f, 'Première', 'un');
    const b = await section(f, 'Seconde', 'deux');
    const cleB = ok(await antor('GET', `${F(f)}/sections/${b.id}`)).cle;
    assert.equal((await antor('DELETE', `${F(f)}/sections/${a.id}`)).status, 204);
    const l = await ligne(f, 'section', 'supprimee');
    assert.equal(l.restaurable, true);
    ok(await antor('POST', `${H()}/${l.id}/restaurer`, {}));
    const fiche_ = ok(await antor('GET', F(f)));
    const sections = (fiche_.sections as Any[]).map((x) => [x.titre, x.contenu]);
    assert.deepEqual(sections, [['Seconde', 'deux'], ['Première', 'un']]);
    assert.ok(cleB);
  });

  it('refus cle_prise : une autre section porte la clé de la section supprimée', async () => {
    const f = await fiche('Clé prise');
    const a = await section(f, 'Histoire', 'ancienne');
    assert.equal((await antor('DELETE', `${F(f)}/sections/${a.id}`)).status, 204);
    await section(f, 'Histoire', 'nouvelle'); // même titre → même clé
    const l = await ligne(f, 'section', 'supprimee');
    const r = await antor('POST', `${H()}/${l.id}/restaurer`, {});
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'cle_prise');
    assert.deepEqual((ok(await antor('GET', F(f))).sections as Any[]).map((x) => x.contenu), ['nouvelle']);
  });

  it('un champ d’en-tête : le titre revient ; une empreinte périmée est refusée historique_perime', async () => {
    const f = await fiche('Ancien titre');
    ok(await antor('PATCH', F(f), { titre: 'Nouveau titre' }));
    const l = await ligne(f, 'entete', 'modifiee');
    assert.equal(l.restaurable, true);
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal(d.avant.titre, 'Ancien titre');
    assert.equal(d.courante.titre, 'Nouveau titre');
    ok(await antor('PATCH', F(f), { titre: 'Titre de quelqu’un d’autre' }));
    const r = await antor('POST', `${H()}/${l.id}/restaurer`, { empreinte: d.empreinte });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'historique_perime');
    assert.equal(ok(await antor('GET', F(f))).titre, 'Titre de quelqu’un d’autre');
    const d2 = ok(await antor('GET', `${H()}/${l.id}`));
    ok(await antor('POST', `${H()}/${l.id}/restaurer`, { empreinte: d2.empreinte }));
    assert.equal(ok(await antor('GET', F(f))).titre, 'Ancien titre');
    assert.equal((await lignes(`?fiche=${f}`))[0].origine, 'ecran');
  });

  it('en-tête : le parent revient ; les alias et étiquettes reviennent en ensemble', async () => {
    const p = await fiche('Parent');
    const f = await fiche('Enfant');
    ok(await antor('PUT', `${F(f)}/etiquetage`, { alias: ['Un', 'Deux'], etiquettes: ['t1'] }));
    ok(await antor('PATCH', F(f), { parent: p }));
    assert.deepEqual((ok(await antor('GET', `${F(p)}/enfants`)).fiches ?? ok(await antor('GET', `${F(p)}/enfants`)).enfants).map((x: Any) => x.id), [f]);
    const lp = (await lignes(`?fiche=${f}&action=modifiee`)).find((x) => x.objet === 'entete');
    const dp = ok(await antor('GET', `${H()}/${lp.id}`));
    ok(await antor('POST', `${H()}/${lp.id}/restaurer`, { empreinte: dp.empreinte }));
    assert.equal(bd('SELECT parent_id p FROM fiches WHERE id = ?', f).p, null);
    const dernierAvant = (await lignes(`?fiche=${f}`))[0].id;
    ok(await antor('PUT', `${F(f)}/etiquetage`, { alias: ['Trois'], etiquettes: [] }));
    // the gesture leaves one line per alias or label row; the oldest of them holds the set as it was before the gesture
    const du_geste = (await lignes(`?fiche=${f}`)).filter((x) => x.id > dernierAvant && x.objet === 'entete');
    assert.ok(du_geste.length >= 1);
    const la = du_geste[du_geste.length - 1];
    const da = ok(await antor('GET', `${H()}/${la.id}`));
    ok(await antor('POST', `${H()}/${la.id}/restaurer`, { empreinte: da.empreinte }));
    const apres = ok(await antor('GET', F(f)));
    assert.deepEqual([...apres.alias].sort(), ['Deux', 'Un']);
    assert.deepEqual(apres.etiquettes, ['t1']);
    assert.equal(bd('SELECT parent_id p FROM fiches WHERE id = ?', f).p, null);
  });

  it('exclusions : une relation, une « section créée » et une fiche supprimée ne se restaurent pas', async () => {
    const f = await fiche('Non restaurable');
    const cible = await fiche('Cible');
    const s = await section(f, 'Texte', 'x');
    const rel = ok(await antor('POST', `${F(f)}/sections/${s.id}/relations`, { cibleFicheId: cible, qualificatif: 'voisin' }), 201);
    assert.equal((await antor('DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`)).status, 204);
    for (const [objet, action] of [['relation', 'supprimee'], ['relation', 'creee'], ['section', 'creee'], ['fiche', 'creee']] as const) {
      const l = await ligne(f, objet, action);
      assert.ok(l, `${objet}/${action}`);
      assert.equal(l.restaurable, false, `${objet}/${action}`);
      const r = await antor('POST', `${H()}/${l.id}/restaurer`, { version: 1, empreinte: 'x' });
      assert.equal(r.status, 400, `${objet}/${action} : ${JSON.stringify(r.json)}`);
    }
    assert.equal((await antor('DELETE', F(f))).status, 204);
    const lf = (await lignes()).find((x) => x.objet === 'fiche' && x.action === 'supprimee' && x.ficheTitre === 'Non restaurable');
    assert.equal((await antor('POST', `${H()}/${lf.id}/restaurer`, {})).status, 400);
  });

  it('refus valeur_expiree : une valeur de plus de 30 jours', async () => {
    const f = await fiche('Expirée');
    const s = await section(f, 'T', 'avant');
    await reecrire(f, s.id, 'après');
    const l = await ligne(f, 'section', 'modifiee');
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    app.db.prepare('UPDATE historique SET cree_le = ? WHERE id = ?').run(new Date(Date.now() - 31 * 86400_000).toISOString(), l.id);
    const r = await antor('POST', `${H()}/${l.id}/restaurer`, { version: d.version });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'valeur_expiree');
    assert.equal(ok(await antor('GET', `${F(f)}/sections/${s.id}`)).contenu, 'après');
  });

  it('exclusion : une joueuse ne restaure rien (403) et le texte reste', async () => {
    const f = await fiche('Joueuse');
    const s = await section(f, 'T', 'a');
    await reecrire(f, s.id, 'b');
    const l = await ligne(f, 'section', 'modifiee');
    const d = ok(await antor('GET', `${H()}/${l.id}`));
    assert.equal((await lea('POST', `${H()}/${l.id}/restaurer`, { version: d.version })).status, 403);
    assert.equal(ok(await antor('GET', `${F(f)}/sections/${s.id}`)).contenu, 'b');
  });
});

describe('B-96 : les écritures d’un jeton sont attribuées à son compte, avec le nom du jeton', () => {
  let ecr: Any; let lecMJ: Any; let lecJoueuse: Any; let ecrJoueuse: Any;
  before(async () => {
    const mk = async (c: Client, nom: string, niveau: string) =>
      ok(await c('POST', '/api/compte/jetons', { nom, dureeJours: 30, acces: { tous: false, univers: [{ universId: U, niveau }] } }), 201);
    ecr = await mk(antor, 'Agent Éneria', 'ecriture');
    lecMJ = await mk(antor, 'Lecteur MJ', 'lecture');
    lecJoueuse = await mk(lea, 'Lecteur Léa', 'lecture');
    ecrJoueuse = await mk(lea, 'Écrivain Léa', 'ecriture');
    const put = (t: string, cle = 'lieu:agent-1') => avecJeton('PUT', `/api/v1/univers/${UCLE}/fiches/${cle}`, ecr.valeur,
      { type: 'lieu', titre: 'Écrite par agent', sections: [{ cle: 's:h', titre: 'Histoire', contenu: t }] });
    ok(await put('v1'));
    ok(await put('v2'));
  });
  const tokH = (q: string, valeur: string) => avecJeton('GET', `/api/v1/univers/${UCLE}/historique${q}`, valeur);

  it('GET /historique?jeton=<nom> avec un jeton de compte MJ rend les lignes, avec compte et nom du jeton', async () => {
    const r = await tokH('?jeton=' + encodeURIComponent('Agent Éneria'), lecMJ.valeur);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const l = r.json.lignes as Any[];
    assert.ok(l.length >= 2);
    for (const x of l) {
      assert.equal(x.jeton.nom, 'Agent Éneria');
      assert.equal(x.compte.username, 'antor');
      assert.equal(x.ficheCle, 'lieu:agent-1');
    }
    assert.ok(l.some((x) => x.objet === 'section' && x.action === 'modifiee'));
    assert.ok(l.some((x) => x.objet === 'fiche' && x.action === 'creee'));
  });

  it('le même jeton lit aussi sur le préfixe de la clé ou de l’identifiant, et filtre fiche / action / compte / depuis', async () => {
    const parId = await avecJeton('GET', `/api/v1/univers/${U}/historique?jeton=${encodeURIComponent('Agent Éneria')}`, ecr.valeur);
    assert.equal(parId.status, 200);
    const fid = bd("SELECT id FROM fiches WHERE univers_id = ? AND cle = 'lieu:agent-1'", U).id;
    const a = await tokH(`?fiche=${fid}&action=modifiee`, lecMJ.valeur);
    assert.ok(a.json.lignes.length >= 1 && a.json.lignes.every((x: Any) => x.action === 'modifiee' && x.ficheId === fid));
    const antorId = bd("SELECT id FROM comptes WHERE username = 'antor'").id;
    assert.ok((await tokH(`?compte=${antorId}`, lecMJ.valeur)).json.lignes.length > 0);
    assert.deepEqual((await tokH('?depuis=2999-01-01T00:00:00Z', lecMJ.valeur)).json.lignes, []);
    assert.equal((await tokH('?action=nimporte', lecMJ.valeur)).status, 400);
  });

  it('exclusion : un jeton de joueuse (lecture ou écriture) reçoit 403 ; sans jeton 401 ; hors accès 404', async () => {
    assert.equal((await tokH('', lecJoueuse.valeur)).status, 403);
    assert.equal((await tokH('?jeton=Agent', ecrJoueuse.valeur)).status, 403);
    assert.equal((await tokH('', 'kvs_pas-un-jeton')).status, 401);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${UCLE}/historique`, null)).status, 401);
    const autre = ok(await antor('POST', '/api/univers', { nom: 'Hors jeton' }), 201);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${autre.cle}/historique`, lecMJ.valeur)).status, 404);
  });

  it('une écriture de l’écran ne porte aucun nom de jeton, et le filtre ?jeton l’exclut', async () => {
    const f = await fiche('Écran seul');
    const l = await ligne(f, 'fiche', 'creee');
    assert.equal(l.jeton, null);
    const r = await tokH('?jeton=' + encodeURIComponent('Agent Éneria'), lecMJ.valeur);
    assert.equal(r.json.lignes.some((x: Any) => x.ficheId === f), false);
  });

  it('la même ligne se lit à l’écran de E-24 (route de session) avec le nom du jeton', async () => {
    const l = (await lignes('?jeton=' + encodeURIComponent('Agent Éneria')))[0];
    assert.equal(l.jeton.nom, 'Agent Éneria');
    assert.equal(l.compte.username, 'antor');
  });
});
