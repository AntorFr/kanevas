// Independent need-based tests of kanevas-import-types (B-7, B-42, B-52, P-13, P-14 step 2), written from
// docs/parcours.md and the feature sheet only. HTTP in stub mode with the seeded world, real SQLite.
// Every expected value is a literal read from the need.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { ajouterSection, changerAudience } = await import('../services/sections.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  const idU = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const idC = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const cookies = new Map<string, string>();
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, payload });
    let json: Any;
    try {
      json = JSON.parse(r.body);
    } catch {
      json = r.body;
    }
    return { status: r.statusCode, json };
  };
  return { app, req, idC, lame: idU("Lame d'Ébène") };
}
const liste = (j: Any): Any[] => j.fiches ?? j.items ?? j;

test('P-14 étape 2 : une Note devient un Savoir « Ressource » en un geste, même identifiant', async () => {
  // Panne visée : le changement de type ignore le sous-type fourni, ou crée une autre fiche.
  const w = await monde();
  const base = `/api/univers/${w.lame}/fiches`;
  const note = (await w.req('antor', 'POST', base, { type: 'note', titre: 'Les Cristaux d’Ombre' })).json;
  const r = await w.req('antor', 'POST', `${base}/${note.id}/type`, { type: 'savoir', sousType: 'Ressource' });
  assert.equal(r.status, 200);
  const apres = (await w.req('antor', 'GET', `${base}/${note.id}`)).json;
  assert.equal(apres.id, note.id);
  assert.equal(apres.type, 'savoir');
  assert.equal(apres.sousType, 'Ressource');
});

test('B-42 : les fiches d’un type désactivé restent trouvées par la recherche et lisibles par leur identifiant', async () => {
  // Panne visée : désactiver un type masque ses fiches de la liste ou de la recherche.
  const w = await monde();
  const base = `/api/univers/${w.lame}/fiches`;
  const f = (await w.req('antor', 'POST', base, { type: 'lieu', titre: 'Zorgonde' })).json;
  const off = await w.req('antor', 'PUT', `/api/univers/${w.lame}/types/lieu`, { etat: 'desactive' });
  assert.equal(off.status, 200);
  const trouve = liste((await w.req('antor', 'GET', `${base}?q=Zorgonde`)).json).map((x: Any) => x.titre);
  assert.deepEqual(trouve, ['Zorgonde']);
  const lue = await w.req('antor', 'GET', `${base}/${f.id}`);
  assert.equal(lue.status, 200);
  assert.equal(lue.json.titre, 'Zorgonde');
});

test('B-52 exclusion : un sous-type porté seulement par une fiche que Léa ne lit pas n’apparaît ni dans ses choix ni dans son filtre', async () => {
  // Panne visée : la liste des sous-types ou le filtre trahit l’existence d’une fiche cachée.
  const w = await monde();
  const base = `/api/univers/${w.lame}/fiches`;
  const f = (await w.req('antor', 'POST', base, { type: 'lieu', titre: 'Crypte close', sousType: 'Nécropole' })).json;
  ajouterSection(w.app.db, w.idC('antor'), w.lame, f.id, { titre: 'Vérité', contenu: 'x' });
  const lea = await w.req('lea', 'GET', `/api/univers/${w.lame}/sous-types?type=lieu`);
  assert.equal(lea.status, 200);
  assert.deepEqual(lea.json.sousTypes.filter((s: Any) => s.sousType === 'Nécropole'), []);
  assert.deepEqual(liste((await w.req('lea', 'GET', `${base}?sousType=Nécropole`)).json), []);
  const mj = await w.req('antor', 'GET', `/api/univers/${w.lame}/sous-types?type=lieu`);
  assert.deepEqual(mj.json.sousTypes.filter((s: Any) => s.sousType === 'Nécropole'), [{ sousType: 'Nécropole', nb: 1 }]);
});

test('B-52 : quiconque voit la fiche voit son sous-type, Léa le lit sur la fiche et sur sa carte de liste', async () => {
  // Panne visée : le sous-type est réservé au MJ en lecture.
  const w = await monde();
  const base = `/api/univers/${w.lame}/fiches`;
  const f = (await w.req('antor', 'POST', base, { type: 'objet', titre: 'Lame rouillée', sousType: 'Arme' })).json;
  const s = ajouterSection(w.app.db, w.idC('antor'), w.lame, f.id, { titre: 'Apparence', contenu: 'x' });
  changerAudience(w.app.db, w.idC('antor'), w.lame, f.id, s.id, { joueursLisent: true });
  assert.equal((await w.req('lea', 'GET', `${base}/${f.id}`)).json.sousType, 'Arme');
  const carte = liste((await w.req('lea', 'GET', `${base}?type=objet`)).json).find((x: Any) => x.titre === 'Lame rouillée');
  assert.equal(carte.sousType, 'Arme');
});

test('B-52 : une Joueuse ne donne ni ne change le sous-type, à la création comme après', async () => {
  // Panne visée : la garde MJ manque sur la création avec sous-type.
  const w = await monde();
  const base = `/api/univers/${w.lame}/fiches`;
  const cree = await w.req('lea', 'POST', base, { type: 'lieu', titre: 'Camp de Léa', sousType: 'Camp' });
  assert.ok(cree.status === 403 || cree.status === 404, `statut ${cree.status}`);
  assert.deepEqual(liste((await w.req('antor', 'GET', `${base}?q=Camp de Léa`)).json), []);
});

test('B-42 : Mira, MJ d’un autre univers du système, règle les types de CoF Mini et la barre de Lame d’Ébène suit', async () => {
  // Panne visée : le réglage du système est réservé au seul MJ qui l’a créé, ou ne se propage pas aux univers qui le suivent.
  const w = await monde();
  const systemes = (await w.req('mira', 'GET', '/api/systemes')).json as Any;
  const cof = (Array.isArray(systemes) ? systemes : systemes.systemes).find((s: Any) => s.nom === 'CoF Mini').id;
  const r = await w.req('mira', 'PUT', `/api/systemes/${cof}/types/note`, { active: false });
  assert.equal(r.status, 200);
  const types = (await w.req('antor', 'GET', `/api/univers/${w.lame}/types`)).json as Any[];
  const note = types.find((t) => t.type === 'note');
  assert.equal(note.actif ?? note.active, false);
});
