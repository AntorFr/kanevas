// Doors of `src/e2e/arbre-ensemble-besoin.test.ts` (lot « écrans »): the hierarchy of sheets (B-35, P-10, P-14, AD-99, AD-104) through
// the API and the import, on the starting world, in-process. The screen file keeps the tree, the trail and the « Contient » block.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const monde = await monter({ semis: true });
const { antor, lea, dire, app } = monde;

const us = (await dire(antor, 'GET', '/api/univers')).corps as Any[];
const U = us.find((u) => u.nom === "Lame d'Ébène").id as number;
const E = us.find((u) => u.nom === 'Essai Kanka').id as number;
const ids: Record<string, number> = {};
for (const f of (await dire(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`)).corps.fiches as Any[]) ids[f.titre] = f.id;
for (const f of (await dire(antor, 'GET', `/api/univers/${U}/fiches?q=Sphères`)).corps.fiches as Any[]) ids[f.titre] = f.id;

const texte = (r: { corps: Any }) => (typeof r.corps === 'string' ? r.corps : JSON.stringify(r.corps));
const patch = (h: typeof antor, fid: number, parent: number | null, mode = '', univers = U) =>
  dire(h, 'PATCH', `/api/univers/${univers}/fiches/${fid}${mode}`, { parent });
const creer = async (type: string, titre: string): Promise<number> => {
  const r = await dire(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre });
  assert.equal(r.status, 201);
  return r.corps.id;
};
async function importer(method: 'POST' | 'PUT', chemin: string, corps?: object, jeton = JETON) {
  const r = await app.inject({
    method,
    url: `/api/import/v1/univers/${E}${chemin}`,
    headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    payload: corps === undefined ? undefined : JSON.stringify(corps),
  });
  return { status: r.statusCode, corps: r.body ? (r.json() as Any) : null };
}

test('B-35 exclusion : aucune réponse de l’API à Léa ne nomme, ne numérote ni ne compte une fiche qu’elle ne lit pas', async () => {
  const p = ids['Port-Sel'];
  const reponses = [
    await dire(lea, 'GET', `/api/univers/${U}/fiches/${p}`),
    await dire(lea, 'GET', `/api/univers/${U}/fiches/${p}/enfants`),
    await dire(lea, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=racine`),
    await dire(lea, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=${p}`),
    await dire(lea, 'GET', `/api/univers/${U}/fiches?q=Repaire`),
    await dire(lea, 'GET', `/api/univers/${U}/fiches?q=Sphères`),
  ];
  for (const r of reponses) {
    const t = texte(r);
    assert.equal(r.status, 200, t.slice(0, 200));
    assert.ok(!t.includes('Repaire'), 'titre caché: ' + t.slice(0, 300));
    assert.ok(!t.includes('Sphères'), 'titre caché: ' + t.slice(0, 300));
    const listes = [r.corps.ancetres, r.corps.enfants, r.corps.fiches].filter(Array.isArray).flat() as Any[];
    assert.ok(!listes.some((x) => x.id === ids['Les Sphères'] || x.id === ids['Le Repaire des contrebandiers']), 'id caché');
    assert.ok(!/"(total|nombre|count|compte|masques|caches|cachees)\w*"/i.test(t), 'compteur: ' + t.slice(0, 300));
  }
  assert.equal(reponses[1]!.corps.enfants.length, 4);
  assert.deepEqual(reponses[4]!.corps.fiches, []);
  assert.deepEqual(reponses[5]!.corps.fiches, []);
  // 404 of an unreadable sheet: the same answer as an unknown address
  const cachee = await dire(lea, 'GET', `/api/univers/${U}/fiches/${ids['Les Sphères']}/enfants`);
  const inconnue = await dire(lea, 'GET', `/api/univers/${U}/fiches/987654/enfants`);
  assert.equal(cachee.status, 404);
  assert.equal(cachee.status, inconnue.status);
  assert.equal(texte(cachee), texte(inconnue));
});

test('B-35 : Antor en mode Joueur ne voit plus le Repaire ni Les Sphères dans l’API', async () => {
  const e = await dire(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}/enfants?mode=joueur`);
  assert.equal(e.status, 200);
  assert.equal(e.corps.enfants.length, 4);
  assert.ok(!texte(e).includes('Repaire'));
  const f = await dire(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}?mode=joueur`);
  assert.ok(!texte(f).includes('Sphères'), 'ancêtre illisible en mode Joueur');
  const racine = await dire(antor, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=racine&mode=joueur`);
  assert.ok(racine.corps.fiches.some((x: Any) => x.titre === 'Port-Sel'));
  assert.ok(!racine.corps.fiches.some((x: Any) => x.titre === 'Les Sphères'));
});

test('P-14 échec : ranger Les Sphères sous un de ses descendants est refusé « cycle », la hiérarchie ne bouge pas', async () => {
  const libre = await creer('lieu', 'Cible du cycle');
  assert.equal((await patch(antor, libre, ids['Port-Sel'])).status, 200);
  assert.equal((await patch(antor, ids['Les Sphères'], libre)).status, 400);
  const ancetres = (await dire(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}`)).corps.ancetres;
  assert.deepEqual(ancetres.map((a: Any) => a.titre), ['Les Sphères']);
  const r = await patch(antor, ids['Les Sphères'], ids['Port-Sel']);
  assert.equal(r.status, 400);
  assert.equal(r.corps.code, 'cycle');
  assert.equal((await dire(antor, 'DELETE', `/api/univers/${U}/fiches/${libre}`)).status, 204);
});

test('B-35 exclusion : le PATCH de Léa est refusé sans rien changer, celui d’un MJ en mode Joueur aussi', async () => {
  const r = await patch(lea, ids['Les Docks'], ids['Le Phare aux Sels']);
  assert.equal(r.status, 403);
  const mode = await patch(antor, ids['Les Docks'], ids['Le Phare aux Sels'], '?mode=joueur');
  assert.equal(mode.status, 403, 'un MJ en mode Joueur ne déplace pas');
  const e = (await dire(antor, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}/enfants`)).corps;
  assert.ok(e.enfants.some((x: Any) => x.titre === 'Les Docks'));
});

test('B-35 : un événement rangé sous Port-Sel est dans ses enfants et dans « dans Port-Sel », pas dans les lieux', async () => {
  const ev = await creer('evenement', 'Le Pillage des Docks');
  const s = await dire(antor, 'POST', `/api/univers/${U}/fiches/${ev}/sections`, { titre: 'Récit', contenu: 'Les docks brûlent.' });
  assert.equal((await dire(antor, 'PATCH', `/api/univers/${U}/fiches/${ev}/sections/${s.corps.id}`, { joueursLisent: true })).status, 200);
  assert.equal((await patch(antor, ev, ids['Port-Sel'])).status, 200);
  const enfants = (await dire(lea, 'GET', `/api/univers/${U}/fiches/${ids['Port-Sel']}/enfants`)).corps.enfants as Any[];
  assert.ok(enfants.some((x) => x.titre === 'Le Pillage des Docks'), 'absent de Contient');
  const fiche = (await dire(lea, 'GET', `/api/univers/${U}/fiches/${ev}`)).corps;
  assert.deepEqual(fiche.ancetres.map((a: Any) => a.titre), ['Port-Sel']);
  const racines = (await dire(lea, 'GET', `/api/univers/${U}/fiches?type=lieu&parent=${ids['Port-Sel']}`)).corps.fiches as Any[];
  assert.ok(!racines.some((x) => x.titre === 'Le Pillage des Docks'));
});

test('AD-99 bord : en rangeant une chaîne de 60 fiches, le déplacement est refusé « trop_profond » vers le 51e niveau, la fiche reste à la racine', async () => {
  const f: number[] = [];
  for (let i = 0; i < 60; i++) f.push(await creer('lieu', `Maillon ${i}`));
  let refus = -1;
  for (let i = 1; i < f.length; i++) {
    const r = await patch(antor, f[i]!, f[i - 1]!);
    if (r.status !== 200) {
      assert.equal(r.status, 400);
      assert.equal(r.corps.code, 'trop_profond');
      refus = i;
      break;
    }
  }
  assert.ok(refus >= 49 && refus <= 52, `premier refus au maillon ${refus}`);
  const v = (await dire(antor, 'GET', `/api/univers/${U}/fiches/${f[refus]!}`)).corps;
  assert.deepEqual(v.ancetres, []);
});

test('P-10 / AD-104 : import de Les Docks avec un parent absent → fiche sans parent et avertissement ; la clé arrive → le parent est posé ; changé à la main → plus écrasé', async () => {
  const lot1 = (await importer('POST', '/lots')).corps.lotId;
  const r1 = await importer('PUT', `/fiches/${encodeURIComponent('lieu:les-docks')}?lot=${lot1}`, {
    type: 'lieu', titre: 'Les Docks', sections: [], parent: 'lieu:port-sel-absent',
  });
  assert.equal(r1.status, 200, JSON.stringify(r1.corps));
  assert.equal(r1.corps.avertissements.length, 1);
  assert.ok(r1.corps.avertissements[0].includes('lieu:port-sel-absent'), r1.corps.avertissements[0]);
  const docks = r1.corps.id;
  const sans = (await dire(antor, 'GET', `/api/univers/${E}/fiches/${docks}`)).corps;
  assert.deepEqual(sans.ancetres, []);

  const lot2 = (await importer('POST', '/lots')).corps.lotId;
  const port = await importer('PUT', `/fiches/${encodeURIComponent('lieu:port-sel-absent')}?lot=${lot2}`, {
    type: 'lieu', titre: 'Port-Sel Kanka', sections: [],
  });
  assert.equal(port.status, 200);
  const rejeu = await importer('PUT', `/fiches/${encodeURIComponent('lieu:les-docks')}?lot=${lot2}`, {
    type: 'lieu', titre: 'Les Docks', sections: [], parent: 'lieu:port-sel-absent',
  });
  assert.equal(rejeu.status, 200);
  assert.deepEqual(rejeu.corps.avertissements, []);
  const place = (await dire(antor, 'GET', `/api/univers/${E}/fiches/${docks}`)).corps;
  assert.deepEqual(place.ancetres.map((a: Any) => a.titre), ['Port-Sel Kanka']);

  // a parent changed by hand is no more overwritten
  const anse = (await dire(antor, 'GET', `/api/univers/${E}/fiches?q=Anse-aux-Sels`)).corps.fiches[0].id;
  assert.equal((await patch(antor, docks, anse, '', E)).status, 200);
  const lot3 = (await importer('POST', '/lots')).corps.lotId;
  const encore = await importer('PUT', `/fiches/${encodeURIComponent('lieu:les-docks')}?lot=${lot3}`, {
    type: 'lieu', titre: 'Les Docks', sections: [], parent: 'lieu:port-sel-absent',
  });
  assert.equal(encore.status, 200);
  const fin = (await dire(antor, 'GET', `/api/univers/${E}/fiches/${docks}`)).corps;
  assert.deepEqual(fin.ancetres.map((a: Any) => a.titre), ['Anse-aux-Sels']);
});

test('P-10 échec : sans jeton valide, l’import avec parent est refusé 401 et n’écrit rien', async () => {
  const r = await importer('PUT', `/fiches/${encodeURIComponent('lieu:intrus')}`, { type: 'lieu', titre: 'Intrus', sections: [], parent: 'lieu:les-docks' }, 'kvs_faux');
  assert.equal(r.status, 401);
  const cherche = (await dire(antor, 'GET', `/api/univers/${E}/fiches?q=Intrus`)).corps;
  assert.deepEqual(cherche.fiches, []);
});
