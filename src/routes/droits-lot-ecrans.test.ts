// Doors of `barre-droits` and `parametres-systeme-besoin` (lot « écrans »): what a player's API calls are refused (B-14), and the
// system catalogue written by « Rattacher » / « Créer et rattacher » (B-13), in-process. The screens keep what is shown.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

test('Droits API : Léa ne peut ni ajouter un membre, ni créer une fiche, ni ajouter une section ; sa vue de la fiche ne nomme pas la section fermée', async () => {
  const m = await monter();
  const u = await m.univers('Droits API', ['lea']);
  const f = await m.creer(m.antor, u.base, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } });
  const lue = await m.dire(m.antor, 'POST', `${u.base}/fiches/${f.id}/sections`, { titre: 'Apparence', contenu: 'Texte.' });
  const close = await m.dire(m.antor, 'POST', `${u.base}/fiches/${f.id}/sections`, { titre: 'Vérité — MJ seul', contenu: 'Secret.' });
  assert.equal((await m.dire(m.antor, 'PATCH', `${u.base}/fiches/${f.id}/sections/${lue.corps.id}`, { joueursLisent: true })).status, 200);
  assert.equal(close.status, 201);
  const refuse = (s: number, quoi: string) => assert.ok(s === 403 || s === 404, `${quoi} : 403 ou 404 attendu, obtenu ${s}`);
  refuse((await m.dire(m.lea, 'POST', `${u.base}/membres`, { username: 'teo', role: 'mj' })).status, 'ajouter un membre');
  refuse((await m.dire(m.lea, 'POST', `${u.base}/fiches`, { type: 'lieu', titre: 'Taverne de Léa' })).status, 'créer une fiche');
  refuse((await m.dire(m.lea, 'POST', `${u.base}/fiches/${f.id}/sections`, { titre: 'Secret de Léa' })).status, 'ajouter une section');
  // Antor's world is unchanged
  const vue = await m.dire(m.antor, 'GET', `${u.base}/fiches/${f.id}`);
  assert.deepEqual((vue.corps.sections as Any[]).map((s) => s.titre), ['Apparence', 'Vérité — MJ seul']);
  const membres = JSON.stringify((await m.dire(m.antor, 'GET', `${u.base}/membres`)).corps);
  assert.ok(!membres.includes('teo'));
  assert.ok(!JSON.stringify((await m.dire(m.antor, 'GET', `${u.base}/fiches`)).corps).includes('Taverne de Léa'));
  // the player's own view carries no trace of the closed section
  const sienne = await m.dire(m.lea, 'GET', `${u.base}/fiches/${f.id}`);
  assert.equal(sienne.status, 200);
  const corps = JSON.stringify(sienne.corps);
  assert.ok(corps.includes('Apparence'));
  assert.ok(!corps.includes('Vérité'), 'la réponse API ne doit pas nommer la section fermée');
});

test('B-13 : « Aucun système » détache sans supprimer le système ; créer « cof mini » ne crée rien ; « Créer et rattacher » crée « Brumes » et y rattache l’univers', async () => {
  const m = await monter({ semis: true });
  const us = (await m.dire(m.antor, 'GET', '/api/univers')).corps;
  const U = ((us.univers ?? us) as Any[]).find((x) => x.nom === "Lame d'Ébène").id as number;
  const catalogue = async () => (await m.dire(m.antor, 'GET', '/api/systemes/catalogue')).corps as Any[];
  const cof = (await catalogue()).find((s) => /CoF Mini/.test(s.nom));
  assert.ok(cof, 'CoF Mini is in the catalogue');
  // detach: 204, the catalogue keeps the system
  assert.equal((await m.dire(m.antor, 'PUT', `/api/univers/${U}/systeme`, { systemeId: null })).status, 204);
  assert.ok((await catalogue()).some((s) => s.id === cof.id), 'le catalogue garde CoF Mini');
  // attach again
  assert.equal((await m.dire(m.antor, 'PUT', `/api/univers/${U}/systeme`, { systemeId: cof.id })).status, 204);
  // uniqueness is not case-sensitive
  const avant = (await catalogue()).length;
  const doublon = await m.dire(m.antor, 'POST', `/api/univers/${U}/systeme-nouveau`, { nom: 'cof mini' });
  assert.ok(doublon.status >= 400 && doublon.status < 500, `got ${doublon.status}`);
  assert.equal((await catalogue()).length, avant);
  assert.equal(JSON.stringify(await catalogue()).match(/cof mini/gi)?.length, 1);
  // bounds of the name
  assert.ok((await m.dire(m.antor, 'POST', `/api/univers/${U}/systeme-nouveau`, { nom: '' })).status >= 400);
  assert.ok((await m.dire(m.antor, 'POST', `/api/univers/${U}/systeme-nouveau`, { nom: 'x'.repeat(81) })).status >= 400);
  // create and attach
  const cree = await m.dire(m.antor, 'POST', `/api/univers/${U}/systeme-nouveau`, { nom: 'Brumes' });
  assert.equal(cree.status, 201);
  assert.ok(JSON.stringify(await catalogue()).includes('Brumes'));
  // a player cannot reach it
  assert.ok((await m.dire(m.lea, 'POST', `/api/univers/${U}/systeme-nouveau`, { nom: 'Pirate' })).status >= 400);
});
