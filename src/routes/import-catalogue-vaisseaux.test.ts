import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// kanevas-outils-vaisseaux-donnees : un jeton à la portée de l'outil écrit le catalogue de l'univers par la route d'import.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');

const T = 'swn/vaisseaux';
const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/swn/exemples/catalogue-essai.json', import.meta.url), 'utf8'));

test('jeton d\'outil : le catalogue des vaisseaux d\'un univers compte les sept natures du catalogue (et conceptions à 0) dans le lot ; une coque classe 5 est refusée avec son champ', async () => {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  poserActivation(app.db, antor, { niveau: 'univers', id: E }, T, true);
  const jeton = creerJeton(app.db, antor, E, { nom: 'T', dureeJours: 30, outils: [T] }, app.horloge()).valeur;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${jeton}` }, payload: payload as any });
  const lot = await req('POST', `/lots?outil=${T}`);
  assert.equal(lot.statusCode, 201, lot.body);
  const lid = lot.json().lotId;
  const f = structuredClone(EXEMPLE);
  f.coques.push({ ...f.coques[0], cle: 'dreadnought', nom: 'Dreadnought', classe: 5 });
  const r = await req('PUT', `/outils/${T}/catalogue?niveau=univers&lot=${lid}`, f);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().refus, [{ nature: 'coques', cle: 'dreadnought', champ: 'classe', raison: r.json().refus[0].raison }]);
  const l = (await req('GET', `/lots/${lid}`)).json();
  const crees = Object.fromEntries(Object.entries(l.compteurs).map(([k, v]: any) => [k, v.creees]));
  assert.deepEqual(crees, { coques: 3, moteurs: 2, amenagements: 2, defenses: 1, armes: 2, modifications: 1, exemples: 7, conceptions: 0 });
  assert.equal(l.compteurs.coques.refusees, 1);
  assert.equal((app.db.prepare('SELECT COUNT(*) n FROM swn_catalogue_coques WHERE proprietaire = ?').get('univers') as any).n, 3);
  // rejeu : tout inchangé
  const r2 = await req('PUT', `/outils/${T}/catalogue?niveau=univers&lot=${lid}`, f);
  assert.equal(r2.statusCode, 200);
  assert.equal((await req('GET', `/lots/${lid}`)).json().compteurs.exemples.inchangees, 7);
});
