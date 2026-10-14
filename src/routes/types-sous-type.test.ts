// Tests of kanevas-types-sous-type, written from the exit criterion only (B-52, B-48, AD-120 (4)).
// HTTP in stub mode, real SQLite.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { ajouterSection, changerAudience } = await import('../services/sections.js');
const { relierSection } = await import('../services/relations.js');
const { creerCarte, ajouterElement, lireCarte } = await import('../services/cartes.js');
type App = Awaited<ReturnType<typeof buildApp>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function monde() {
  const app: App = await buildApp();
  semerBouchon(app.db);
  const idU = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const idC = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const cookies = new Map<string, string>();
  const cookie = async (compte: string) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    return cookies.get(compte)!;
  };
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: await cookie(compte) }, payload });
    let json: Any;
    try {
      json = JSON.parse(r.body);
    } catch {
      json = r.body;
    }
    return { status: r.statusCode, json };
  };
  const lame = idU("Lame d'Ébène");
  const essai = idU('Essai Kanka');
  const api = async (method: string, chemin: string, payload?: object) => {
    const r = await app.inject({
      method: method as 'GET',
      url: `/api/import/v1/univers/${essai}/${chemin}`,
      headers: { authorization: `Bearer ${JETON_BOUCHON}` },
      payload,
    });
    return { status: r.statusCode, json: JSON.parse(r.body) as Any };
  };
  return { app, req, api, lame, essai, idC };
}

const fiches = (u: number) => `/api/univers/${u}/fiches`;

test('critère : Savoir « Ressource » → note : même id, sousType nul, sections, relations et place conservées', async () => {
  const w = await monde();
  const antor = w.idC('antor');
  const c = await w.req('antor', 'POST', fiches(w.lame), { type: 'savoir', titre: "Les Cristaux d'Ombre", sousType: 'Ressource' });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal(c.json.sousType, 'Ressource');
  const id = c.json.id as number;
  const autre = (await w.req('antor', 'POST', fiches(w.lame), { type: 'lieu', titre: 'Autre' })).json.id as number;
  const s = ajouterSection(w.app.db, antor, w.lame, id, { titre: 'Origine', contenu: 'x' });
  const s2 = ajouterSection(w.app.db, antor, w.lame, id, { titre: 'Usage', contenu: 'y' });
  relierSection(w.app.db, antor, w.lame, id, s.id, { cibleFicheId: autre, type: 'lié' });
  const carte = await creerCarte(w.app.db, antor, false, w.lame, { titre: 'Graphe', forme: 'graphe' });
  ajouterElement(w.app.db, antor, false, carte.id, { ficheId: id });
  const compte = () => ({
    sections: (w.app.db.prepare('SELECT COUNT(*) n FROM sections WHERE fiche_id = ?').get(id) as Any).n,
    relations: (w.app.db.prepare('SELECT COUNT(*) n FROM relations').get() as Any).n,
    places: (w.app.db.prepare('SELECT COUNT(*) n FROM elements_carte WHERE fiche_id = ?').get(id) as Any).n,
  });
  const avant = compte();
  assert.deepEqual(avant, { sections: 2, relations: 1, places: 1 });
  const r = await w.req('antor', 'POST', `${fiches(w.lame)}/${id}/type`, { type: 'note' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.type, 'note');
  assert.equal(r.json.sousType, null);
  assert.equal(r.json.id, id);
  assert.deepEqual(compte(), avant);
  assert.equal(lireCarte(w.app.db, antor, false, carte.id).elements.length, 1);
  void s2;
});

test('PATCH sousType : vide et 61 caractères → 400 ; null l’ôte ; 60 passe ; Léa → 403', async () => {
  const w = await monde();
  const id = (await w.req('antor', 'POST', fiches(w.lame), { type: 'savoir', titre: 'S', sousType: 'A' })).json.id;
  const url = `${fiches(w.lame)}/${id}`;
  assert.equal((await w.req('antor', 'PATCH', url, { sousType: '' })).status, 400);
  assert.equal((await w.req('antor', 'PATCH', url, { sousType: 'x'.repeat(61) })).status, 400);
  assert.equal((await w.req('antor', 'PATCH', url, { sousType: 'x'.repeat(60) })).status, 200);
  assert.equal((await w.req('lea', 'PATCH', url, { sousType: 'B' })).status, 403);
  const n = await w.req('antor', 'PATCH', url, { sousType: null });
  assert.equal(n.status, 200);
  assert.equal(n.json.sousType, null);
  assert.equal((await w.req('antor', 'GET', url)).json.sousType, null);
});

test('POST type : compte_rendu → 400 type_non_reglable ; type courant → 400 meme_type ; Léa → 403 ; compte-rendu source refusé', async () => {
  const w = await monde();
  const id = (await w.req('antor', 'POST', fiches(w.lame), { type: 'savoir', titre: 'S' })).json.id;
  const url = `${fiches(w.lame)}/${id}/type`;
  const a = await w.req('antor', 'POST', url, { type: 'compte_rendu' });
  assert.equal(a.status, 400);
  assert.equal(a.json.code, 'type_non_reglable');
  const b = await w.req('antor', 'POST', url, { type: 'savoir' });
  assert.equal(b.status, 400);
  assert.equal(b.json.code, 'meme_type');
  assert.equal((await w.req('lea', 'POST', url, { type: 'note' })).status, 403);
  const inconnu = await w.req('antor', 'POST', url, { type: 'dragon' });
  assert.equal(inconnu.status, 400);
  const cr = (w.app.db.prepare("SELECT id FROM fiches WHERE type = 'compte_rendu' LIMIT 1").get() as Any)?.id;
  if (cr) {
    const u = (w.app.db.prepare('SELECT univers_id u FROM fiches WHERE id = ?').get(cr) as Any).u;
    assert.equal((await w.req('antor', 'POST', `${fiches(u)}/${cr}/type`, { type: 'note' })).status, 400);
  }
});

test('semis : Val-Fortin Ville, Le Pendu Joyeux Taverne, Rue des Cordiers Rue ; ?sousType=taverne', async () => {
  const w = await monde();
  const liste = (await w.req('lea', 'GET', `${fiches(w.lame)}?type=lieu`)).json;
  const par = new Map<string, unknown>((liste.fiches ?? liste.items ?? liste).map((f: Any) => [f.titre, f.sousType]));
  assert.equal(par.get('Val-Fortin'), 'Ville');
  assert.equal(par.get('Le Pendu Joyeux'), 'Taverne');
  assert.equal(par.get('Rue des Cordiers'), 'Rue');
  assert.equal(par.get('La Fresque effacée'), null);
  const t = (await w.req('lea', 'GET', `${fiches(w.lame)}?sousType=taverne`)).json;
  assert.deepEqual((t.fiches ?? t.items ?? t).map((f: Any) => f.titre), ['Le Pendu Joyeux']);
});

test('GET sous-types : Port / port regroupés (graphie du premier), nb 2 pour Léa, 3 pour le MJ', async () => {
  const w = await monde();
  const antor = w.idC('antor');
  const mk = async (titre: string, sousType: string, lue: boolean) => {
    const f = (await w.req('antor', 'POST', fiches(w.lame), { type: 'lieu', titre, sousType })).json;
    const s = ajouterSection(w.app.db, antor, w.lame, f.id, { titre: 'D', contenu: 'x' });
    if (lue) changerAudience(w.app.db, antor, w.lame, f.id, s.id, { joueursLisent: true });
  };
  await mk('Port-Noir', 'Port', false);
  await mk('Port-A', 'Port', true);
  await mk('Port-B', 'port', true);
  const find = (j: Any) => j.sousTypes.filter((x: Any) => x.sousType.toLowerCase() === 'port');
  const lea = await w.req('lea', 'GET', `/api/univers/${w.lame}/sous-types?type=lieu`);
  assert.equal(lea.status, 200);
  assert.deepEqual(find(lea.json), [{ sousType: 'Port', nb: 2 }]);
  const mj = await w.req('antor', 'GET', `/api/univers/${w.lame}/sous-types?type=lieu`);
  assert.deepEqual(find(mj.json), [{ sousType: 'Port', nb: 3 }]);
  // A GM in player mode reads like a player.
  const mode = await w.req('antor', 'GET', `/api/univers/${w.lame}/sous-types?type=lieu&mode=joueur`);
  assert.deepEqual(find(mode.json), [{ sousType: 'Port', nb: 2 }]);
  // Not a member: not found.
  assert.equal((await w.req('mira', 'GET', `/api/univers/${w.lame}/sous-types`)).status, 404);
  // Only the requested type.
  const objets = await w.req('antor', 'GET', `/api/univers/${w.lame}/sous-types?type=objet`);
  assert.deepEqual(find(objets.json), []);
});

test('import : vaisseau + Frégate creee, rejeu inchangee, sous-type changé par Antor protégé, lot le dit', async () => {
  const w = await monde();
  const corps = { type: 'vaisseau', titre: 'Aube', sousType: 'Frégate', sections: [] };
  const a = await w.api('PUT', 'fiches/vaisseau%3Aaube', corps);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(a.json.etat, 'creee');
  const id = a.json.id;
  assert.equal((await w.req('antor', 'GET', `${fiches(w.essai)}/${id}`)).json.sousType, 'Frégate');
  assert.equal((await w.api('PUT', 'fiches/vaisseau%3Aaube', corps)).json.etat, 'inchangee');
  assert.equal((await w.req('antor', 'PATCH', `${fiches(w.essai)}/${id}`, { sousType: 'Croiseur' })).status, 200);
  const lot = (await w.api('POST', 'lots')).json.lotId;
  const b = await w.api('PUT', `fiches/vaisseau%3Aaube?lot=${lot}`, corps);
  assert.equal(b.json.etat, 'inchangee');
  assert.equal((await w.req('antor', 'GET', `${fiches(w.essai)}/${id}`)).json.sousType, 'Croiseur');
  const l = await w.api('GET', `lots/${lot}`);
  assert.ok(/sous-type/.test(JSON.stringify(l.json)), JSON.stringify(l.json));
  assert.ok(l.json.avertissements >= 1);
});

test('import : compte_rendu et monde → 400 champ type ; sousType invalide → 400', async () => {
  const w = await monde();
  for (const type of ['compte_rendu', 'monde']) {
    const r = await w.api('PUT', 'fiches/x%3A1', { type, titre: 'T', sections: [] });
    assert.equal(r.status, 400, type);
    assert.equal(r.json.champ, 'type');
  }
  const r = await w.api('PUT', 'fiches/x%3A2', { type: 'lieu', titre: 'T', sousType: '', sections: [] });
  assert.equal(r.status, 400);
  const r2 = await w.api('PUT', 'fiches/x%3A3', { type: 'lieu', titre: 'T', sousType: 'y'.repeat(61), sections: [] });
  assert.equal(r2.status, 400);
});

test('import : lieu désactivé → creee avec avertissement type_desactive', async () => {
  const w = await monde();
  const off = await w.req('antor', 'PUT', `/api/univers/${w.essai}/types/lieu`, { etat: 'desactive' });
  assert.equal(off.status, 200, JSON.stringify(off.json));
  const lot = (await w.api('POST', 'lots')).json.lotId;
  const r = await w.api('PUT', `fiches/lieu%3Ax?lot=${lot}`, { type: 'lieu', titre: 'X', sections: [] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.etat, 'creee');
  const l = await w.api('GET', `lots/${lot}`);
  assert.ok(JSON.stringify(l.json).includes('type_desactive'), JSON.stringify(l.json));
  assert.ok(l.json.avertissements >= 1);
});
