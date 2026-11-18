// Doors of the lot « médiathèque » (docs/tests-ecran/lot-mediatheque.md): the effects that
// src/e2e/mediatheque-verification.test.ts read through a browser's request client, proved here with
// Fastify `inject` on the seed (Lame d'Ébène). Same literals as the screen file.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, PDF, PNG, monter, multipart } from './monde-lot-mediatheque.js';

test('un joueur qui force l’adresse d’un fichier réservé au MJ : octets, panneau et liste disent « introuvable »', async () => {
  const m = await monter();
  const plan = await m.fichier(m.antor, 'Plan secret de la Guilde');
  assert.equal(plan.visibilite, 'mj');
  assert.equal((await m.get(m.antor, `/fichiers/${plan.id}`)).statusCode, 200);
  assert.equal((await m.get(m.lea, `/fichiers/${plan.id}`)).statusCode, 404);
  const detail = await m.get(m.lea, `/fichiers/${plan.id}/detail`);
  assert.equal(detail.statusCode, 404);
  assert.equal(detail.json().message, 'Page introuvable.');
  assert.deepEqual(await m.noms(m.lea, '?q=Plan%20secret'), []);
  assert.equal((await m.noms(m.lea)).length, 10);
});

test('un joueur ne modifie, ne supprime, n’interroge l’impact ni n’ajoute dans la médiathèque : refusé, rien ne change', async () => {
  const m = await monter();
  const carte = await m.fichier(m.antor, 'Carte des Sphères');
  assert.equal((await m.patch(m.lea, `/fichiers/${carte.id}`, { nom: 'Piratée', visibilite: 'mj' })).statusCode, 403);
  assert.equal((await m.suppr(m.lea, `/fichiers/${carte.id}`)).statusCode, 403);
  assert.equal((await m.get(m.lea, `/fichiers/${carte.id}/impact?action=supprimer`)).statusCode, 403);
  assert.equal((await m.envoyer(m.lea, {}, 'intrus.png', 'image/png', PNG)).statusCode, 403);
  const apres = await m.fichier(m.antor, 'Carte des Sphères');
  assert.equal(apres.visibilite, 'joueurs');
  assert.equal((await m.noms(m.antor)).includes('intrus.png'), false);
  assert.equal((await m.noms(m.antor)).length, 13);
});

test('un Admin d’instance sans rôle dans l’univers : la liste de la médiathèque répond « Page introuvable. »', async () => {
  const m = await monter();
  const r = await m.get(m.admin, '/fichiers');
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().message, 'Page introuvable.');
});

test('filtres de la médiathèque d’Antor : nom, Images, Documents, Visibilité, Usage, ordre Nom', async () => {
  const m = await monter();
  assert.deepEqual(await m.noms(m.antor, '?q=carte'), ['Carte des Sphères']);
  assert.deepEqual(await m.noms(m.antor, '?q=zzz-introuvable'), []);
  assert.equal((await m.noms(m.antor, '?nature=images')).length, 13);
  assert.deepEqual(await m.noms(m.antor, '?nature=documents'), []);
  assert.deepEqual((await m.noms(m.antor, '?visibilite=mj')).sort(), ['Cercle des Cendres', 'Le Prieur masqué', 'Plan secret de la Guilde']);
  assert.equal((await m.noms(m.antor, '?visibilite=joueurs')).length, 10);
  assert.deepEqual(await m.noms(m.antor, '?usage=non_utilises'), ['Plan secret de la Guilde']);
  assert.equal((await m.noms(m.antor, '?usage=utilises')).length, 12);
  const alpha = await m.noms(m.antor, '?tri=nom');
  assert.equal(alpha[0], 'Carte des Sphères');
  assert.equal(alpha[alpha.length - 1], 'Val-Fortin');
  assert.deepEqual(await m.noms(m.lea, '?visibilite=mj'), []);
});

test('renommer : 200 caractères acceptés, 201 et vide refusés, le nom reste celui d’avant', async () => {
  const m = await monter();
  await m.envoyer(m.antor, {}, 'nom-a-changer.pdf', 'application/pdf', PDF);
  const f = await m.fichier(m.antor, 'nom-a-changer.pdf');
  assert.equal(f.visibilite, 'joueurs');
  const long = 'a'.repeat(200);
  assert.equal((await m.patch(m.antor, `/fichiers/${f.id}`, { nom: long })).statusCode, 200);
  assert.equal((await m.fichier(m.antor, long)).id, f.id);
  assert.equal((await m.patch(m.antor, `/fichiers/${f.id}`, { nom: 'b'.repeat(201) })).statusCode, 400);
  assert.equal((await m.patch(m.antor, `/fichiers/${f.id}`, { nom: '' })).statusCode, 400);
  assert.equal((await m.fichier(m.antor, long)).id, f.id);
});

test('Léa ajoute à « Notes de la table » en envoyant « visibilite=joueurs » : le fichier entre quand même réservé au MJ', async () => {
  const m = await monter();
  const fiche = await m.json(m.lea, `/fiches/${m.ficheId('Léa Brisefer')}`);
  const notes = fiche.sections.find((s: Any) => s.titre === 'Notes de la table');
  const r = await m.envoyer(m.lea, { visibilite: 'joueurs', section: String(notes.id), maniere: 'joint' }, 'forcer.pdf', 'application/pdf', PDF);
  assert.ok(r.statusCode < 300, `statut ${r.statusCode}`);
  assert.equal((await m.fichier(m.antor, 'forcer.pdf')).visibilite, 'mj');
});

test('une illustration qui n’est pas une image (octets de texte nommés .png) est refusée et n’ajoute rien', async () => {
  const m = await monter();
  const avant = (await m.noms(m.antor)).length;
  const faux = multipart('faux.png', 'image/png', Buffer.from('ceci est du texte, pas une image'));
  const r = await m.app.inject({
    method: 'PUT',
    url: m.api(`/fiches/${m.ficheId('Port-Sel')}/illustration`),
    headers: { ...m.antor, 'content-type': faux.type },
    payload: faux.payload,
  });
  assert.equal(r.statusCode, 400);
  assert.equal((await m.noms(m.antor)).length, avant);
  const f = await m.json(m.antor, `/fiches/${m.ficheId('Port-Sel')}`);
  assert.ok(f.illustration, 'l’illustration de Port-Sel n’a pas changé');
});

test('P-16 étape 5 : après avoir remplacé l’illustration de Port-Sel, supprimer « Carte des Sphères » liste deux fiches', async () => {
  const m = await monter();
  const carte = await m.fichier(m.antor, 'Carte des Sphères');
  const avant = await m.json(m.antor, `/fichiers/${carte.id}/impact?action=supprimer`);
  assert.deepEqual(avant.usages.map((u: Any) => u.libelle).sort(), [
    'Maître Aldric — « Apparence » (jointe)',
    'Port-Sel (illustration)',
    'Val-Fortin — « Description »',
  ]);
  const autre = await m.fichier(m.antor, 'La Fresque effacée');
  const put = await m.app.inject({
    method: 'PUT',
    url: m.api(`/fiches/${m.ficheId('Port-Sel')}/illustration`),
    headers: m.antor,
    payload: { fichierId: autre.id },
  });
  assert.equal(put.statusCode, 200);
  const apres = await m.json(m.antor, `/fichiers/${carte.id}/impact?action=supprimer`);
  assert.deepEqual(apres.usages.map((u: Any) => u.libelle).sort(), ['Maître Aldric — « Apparence » (jointe)', 'Val-Fortin — « Description »']);
});

test('un document réservé au MJ après son ajout : Léa ne reçoit plus ses octets, Antor oui', async () => {
  const m = await monter();
  await m.envoyer(m.antor, {}, 'grille-des-tarifs.pdf', 'application/pdf', PDF);
  const f = await m.fichier(m.antor, 'grille-des-tarifs.pdf');
  assert.equal((await m.get(m.lea, `/fichiers/${f.id}`)).statusCode, 200);
  assert.equal((await m.patch(m.antor, `/fichiers/${f.id}`, { visibilite: 'mj' })).statusCode, 200);
  assert.equal((await m.get(m.lea, `/fichiers/${f.id}`)).statusCode, 404);
  assert.equal((await m.get(m.antor, `/fichiers/${f.id}`)).statusCode, 200);
});

test('un fichier supprimé n’existe plus pour personne : octets, panneau, liste', async () => {
  const m = await monter();
  await m.envoyer(m.antor, {}, 'ephemere.pdf', 'application/pdf', PDF);
  const f = await m.fichier(m.antor, 'ephemere.pdf');
  assert.equal((await m.suppr(m.antor, `/fichiers/${f.id}`)).statusCode, 204);
  for (const h of [m.antor, m.lea]) {
    assert.equal((await m.get(h, `/fichiers/${f.id}`)).statusCode, 404);
    assert.equal((await m.get(h, `/fichiers/${f.id}/detail`)).statusCode, 404);
    assert.equal((await m.noms(h)).includes('ephemere.pdf'), false);
  }
});
