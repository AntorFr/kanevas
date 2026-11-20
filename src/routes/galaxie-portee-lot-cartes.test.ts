// Doors of the effects that « kanevas-outils-galaxie-lire » (B-72, the setting « portée de saut ») proved in
// src/e2e/galaxie-lire-ensemble-complements.test.ts without any screen: the jump range of a step is read from the system's common
// setting, so a route longer than one step is usable or not, by the route of the trajet. Moved as they were, on the app in-process.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appel, lire, type Monde, monde } from './monde-lot-cartes.js';

const api = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
const trajet = (m: Monde, compte: string, de: string, vers: string, moteur: number, routes: string) =>
  lire(m, compte, api(m, `/trajet?depart=${de}&arrivee=${vers}&moteur=${moteur}&routes=${routes}`));

/** The module's common setting « portée de saut » (cases per engine level), set the way a GM does it. */
async function poserPortee(m: Monde, valeur: number): Promise<void> {
  const r = await appel(m, 'antor', 'PUT', `/api/systemes/${m.sid}/outils/swn/reglages`, { version: 0, valeurs: { portee_saut: valeur } });
  assert.equal(r.status, 204, 'le réglage de portée de saut est posé par un MJ');
}

test('B-72 portée 1 : portée d’une étape = 1 × (moteur + 1) ; moteur 2 (portée 3) : aucun tronçon de 6 ou 7 cases n’est utilisable', async () => {
  const m = await monde();
  await poserPortee(m, 1);
  const r = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
  assert.equal(r.status, 200);
  assert.equal(r.json.trouve, false);
  const a = await trajet(m, 'antor', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(a.json.trouve, false, 'même pour un MJ : la portée vaut pour tous les comptes');
});

test('B-72 bord : portée 1, moteur 6 → portée d’une étape 7 : la route de 7 cases est utilisable (« 7 cases · 2,2 jours », 7 ÷ 6 + 1 = 2,17) ; moteur 5 → 6 : elle ne l’est plus', async () => {
  const m = await monde();
  await poserPortee(m, 1);
  const six = await trajet(m, 'lea', 'port-sel', 'vael', 6, 'publiques');
  assert.equal(six.json.trouve, true);
  assert.equal(six.json.libelle, '7 cases · 2,2 jours');
  const cinq = await trajet(m, 'lea', 'port-sel', 'vael', 5, 'publiques');
  assert.equal(cinq.json.trouve, false);
});

test('B-72 bord : portée 2, moteur 2 → 6 : le tronçon de 6 cases passe (Antor, Port-Sel vers Hesper : « 6 cases · 4 jours »), celui de 7 non (Léa, Port-Sel vers Vael)', async () => {
  const m = await monde();
  await poserPortee(m, 2);
  const a = await trajet(m, 'antor', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(a.json.libelle, '6 cases · 4 jours'); // 6 ÷ 2 + 1
  const l = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
  assert.equal(l.json.trouve, false);
});

test('B-72 : portée 3, moteur 1 → 6 : Antor, Port-Sel vers Hesper, « 6 cases · 7 jours » (6 ÷ 1 + 1)', async () => {
  const m = await monde();
  await poserPortee(m, 3);
  const a = await trajet(m, 'antor', 'port-sel', 'hesper', 1, 'toutes');
  assert.equal(a.json.libelle, '6 cases · 7 jours');
});
