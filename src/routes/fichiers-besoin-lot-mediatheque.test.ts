// Doors of the lot « médiathèque » for src/e2e/mediatheque-besoin-verification.test.ts: what the screen file read through
// the browser's request client (rights, statuses, visibility, joins, listing) proved with `inject`. Same literals.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, PDF, PNG, monter } from './monde-lot-mediatheque.js';

test('B-53 · Teo (pas membre) et Admin (sans rôle dans l’univers) : liste et octets 404 ; sans session, 401 et pas d’octets', async () => {
  const m = await monter();
  const carte = (await m.fichier(m.antor, 'Carte des Sphères')).id;
  for (const h of [m.teo, m.admin]) {
    assert.equal((await m.get(h, '/fichiers')).statusCode, 404);
    assert.equal((await m.get(h, `/fichiers/${carte}`)).statusCode, 404);
  }
  const anonyme = await m.app.inject({ method: 'GET', url: m.api(`/fichiers/${carte}`) });
  assert.equal(anonyme.statusCode, 401);
  assert.doesNotMatch(String(anonyme.headers['content-type']), /image\/png/);
});

test('B-53 · Léa ne renomme, ne réserve ni ne supprime : l’état du fichier ne bouge pas', async () => {
  const m = await monter();
  const id = (await m.fichier(m.antor, 'La Fresque effacée')).id;
  const avant = (await m.noms(m.antor), await m.fichier(m.antor, 'La Fresque effacée'));
  for (const r of [
    await m.patch(m.lea, `/fichiers/${id}`, { nom: 'Piraté' }),
    await m.patch(m.lea, `/fichiers/${id}`, { visibilite: 'mj' }),
    await m.suppr(m.lea, `/fichiers/${id}`),
  ]) {
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `refused, got ${r.statusCode}`);
  }
  const apres = await m.fichier(m.antor, 'La Fresque effacée');
  assert.equal(apres.nom, 'La Fresque effacée');
  assert.equal(apres.visibilite, 'joueurs');
  assert.deepEqual(apres, avant);
});

test('B-53 · nom de 200 caractères accepté, de 201 refusé ; Léa lit le nouveau nom dans sa médiathèque', async () => {
  const m = await monter();
  const id = (await m.fichier(m.antor, 'port-sel-quais.webp')).id;
  const long = 'q'.repeat(200);
  assert.equal((await m.patch(m.antor, `/fichiers/${id}`, { nom: 'q'.repeat(201) })).statusCode, 400);
  assert.equal((await m.patch(m.antor, `/fichiers/${id}`, { nom: long })).statusCode, 200);
  assert.equal((await m.fichier(m.lea, long)).id, id);
  assert.equal((await m.patch(m.antor, `/fichiers/${id}`, { nom: 'Quais de Port-Sel' })).statusCode, 200);
  assert.equal((await m.fichier(m.lea, 'Quais de Port-Sel')).id, id);
  assert.equal(await m.fichier(m.lea, 'port-sel-quais.webp'), undefined);
});

test('B-53 · « Ajouter des fichiers » : un PDF et un type inconnu entrent « Visible des joueurs » ; le fichier vide du même dépôt est refusé', async () => {
  const m = await monter();
  assert.equal((await m.envoyer(m.antor, {}, 'regles-de-la-guilde.pdf', 'application/pdf', PDF)).statusCode, 201);
  assert.equal((await m.envoyer(m.antor, {}, 'notes.xyz', 'application/octet-stream', Buffer.from('des notes'))).statusCode, 201);
  assert.equal((await m.envoyer(m.antor, {}, 'vide.txt', 'text/plain', Buffer.alloc(0))).statusCode, 400);
  const noms = await m.noms(m.antor);
  assert.ok(noms.includes('regles-de-la-guilde.pdf'));
  assert.ok(noms.includes('notes.xyz'));
  assert.ok(!noms.includes('vide.txt'));
  for (const nom of ['regles-de-la-guilde.pdf', 'notes.xyz']) {
    const f = await m.fichier(m.lea, nom);
    assert.equal(f.visibilite, 'joueurs');
    assert.equal(f.image, false);
  }
  assert.deepEqual(await m.noms(m.antor, '?nature=documents').then((n) => n.sort()), ['notes.xyz', 'regles-de-la-guilde.pdf']);
});

test('B-54 · réserver un fichier sans usage : il sort de la liste de Léa, le rendre visible l’y remet ; le supprimer le retire pour tous', async () => {
  const m = await monter();
  await m.envoyer(m.antor, {}, 'regles-de-la-guilde.pdf', 'application/pdf', PDF);
  const id = (await m.fichier(m.antor, 'regles-de-la-guilde.pdf')).id;
  const impact = await m.json(m.antor, `/fichiers/${id}/impact?action=supprimer`);
  assert.deepEqual(impact.usages, []);
  assert.equal((await m.patch(m.antor, `/fichiers/${id}`, { visibilite: 'mj' })).statusCode, 200);
  assert.equal((await m.noms(m.lea)).includes('regles-de-la-guilde.pdf'), false);
  assert.equal((await m.patch(m.antor, `/fichiers/${id}`, { visibilite: 'joueurs' })).statusCode, 200);
  assert.equal((await m.noms(m.lea)).includes('regles-de-la-guilde.pdf'), true);
  assert.equal((await m.suppr(m.antor, `/fichiers/${id}`)).statusCode, 204);
  assert.equal((await m.noms(m.antor)).includes('regles-de-la-guilde.pdf'), false);
});

test('B-44 · un document réservé lié dans le texte et une image dans un bloc MJ : Léa ne reçoit ni le bloc, ni le nom, ni le jeton de l’image', async () => {
  const m = await monter();
  const doc = (await m.envoyer(m.antor, {}, 'tarif-secret.pdf', 'application/pdf', PDF)).json();
  assert.equal((await m.patch(m.antor, `/fichiers/${doc.id}`, { visibilite: 'mj' })).statusCode, 200);
  const grise = await m.fichier(m.antor, 'Lames Grises');
  const fid = m.ficheId('Port-Sel');
  const fiche = await m.json(m.antor, `/fiches/${fid}`);
  const s = fiche.sections.find((x: Any) => x.titre === 'Description');
  const r = await m.app.inject({
    method: 'PUT',
    url: m.api(`/fiches/${fid}/sections/${s.id}/contenu`),
    headers: m.antor,
    payload: { version: s.version, contenu: `Voir [le tarif](fichier:${doc.id}).\n\n:::mj\n![blason](fichier:${grise.id})\n\nSecret du bloc.\n:::\n` },
  });
  assert.equal(r.statusCode, 200);
  const vueLea = await m.json(m.lea, `/fiches/${fid}`);
  assert.doesNotMatch(JSON.stringify(vueLea), new RegExp(`Secret du bloc|blason|${grise.jeton}`));
  assert.match(JSON.stringify(await m.json(m.antor, `/fiches/${fid}`)), /Secret du bloc/);
});

test('B-55 · le client ne choisit pas la visibilité ; Léa ne joint pas un fichier qu’elle ne voit pas', async () => {
  const m = await monter();
  const fid = m.ficheId('Port-Sel');
  const section = async (h: Any) => (await m.json(h, `/fiches/${fid}`)).sections.find((x: Any) => x.titre === 'Description');
  const s = await section(m.antor);
  const v = (await m.envoyer(m.antor, { section: String(s.id), maniere: 'joint', visibilite: 'mj' }, 'forcé.pdf', 'application/pdf', PDF)).json();
  assert.equal((await m.fichier(m.antor, 'forcé.pdf')).visibilite, 'joueurs');
  const plan = await m.fichier(m.antor, 'Plan secret de la Guilde');
  const r = await m.app.inject({ method: 'POST', url: m.api(`/fiches/${fid}/sections/${s.id}/fichiers`), headers: m.lea, payload: { fichierId: plan.id } });
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, `refused, got ${r.statusCode}`);
  assert.equal(JSON.stringify((await section(m.antor)).piecesJointes).includes('Plan secret'), false);

  // B-24 · « Retirer » ôte la référence de la section, jamais le fichier de la médiathèque
  assert.ok((await section(m.antor)).piecesJointes.some((p: Any) => p.nom === 'forcé.pdf'), 'joined');
  const d = await m.suppr(m.antor, `/fiches/${fid}/sections/${s.id}/fichiers/${v.id}`);
  assert.equal(d.statusCode, 204);
  assert.equal((await section(m.antor)).piecesJointes.some((p: Any) => p.nom === 'forcé.pdf'), false);
  assert.equal((await m.noms(m.lea)).includes('forcé.pdf'), true);
});

test('E-19 sélecteur · un fichier supprimé entre l’ouverture et le choix : 404, et le joindre refuse', async () => {
  const m = await monter();
  const eph = (await m.envoyer(m.antor, {}, 'ephemere-jointe.png', 'image/png', PNG)).json();
  assert.equal((await m.suppr(m.antor, `/fichiers/${eph.id}`)).statusCode, 204);
  const fid = m.ficheId('Port-Sel');
  const s = (await m.json(m.antor, `/fiches/${fid}`)).sections.find((x: Any) => x.titre === 'Description');
  const r = await m.app.inject({ method: 'POST', url: m.api(`/fiches/${fid}/sections/${s.id}/fichiers`), headers: m.antor, payload: { fichierId: eph.id } });
  assert.equal(r.statusCode, 404);
  assert.equal(JSON.stringify((await m.json(m.antor, `/fiches/${fid}`)).sections).includes(`fichier:${eph.id}`), false);
});

test('E-19 contenu long · 102 fichiers : 100 puis la suite par le curseur, le total dit 102 pour le MJ comme pour le joueur', async () => {
  const m = await monter();
  const avant = (await m.json(m.antor, '/fichiers')).total;
  for (let i = 0; i < 102; i++) {
    const r = await m.envoyer(m.antor, {}, `f${String(i).padStart(3, '0')}.pdf`, 'application/pdf', Buffer.from(`%PDF-1.4\n% ${i}\n%%EOF\n`));
    assert.equal(r.statusCode, 201);
  }
  const page = await m.json(m.antor, '/fichiers');
  assert.equal(page.fichiers.length, 100);
  assert.ok(page.suite !== null);
  const suite = await m.json(m.antor, `/fichiers?apres=${page.suite}`);
  assert.equal(suite.suite, null);
  assert.equal(page.fichiers.length + suite.fichiers.length, avant + 102);
  assert.equal((await m.json(m.antor, '/fichiers')).total, avant + 102);
  assert.equal((await m.json(m.lea, '/fichiers')).total, 10 + 102);
});

test('une section à 100 fichiers joints refuse le 101e : mots d’Antor, mots de Léa, et rien n’entre dans la médiathèque', async () => {
  const m = await monter();
  const sectionDe = async (h: Any, titre: string, section: string) =>
    (await m.json(h, `/fiches/${m.ficheId(titre)}`)).sections.find((x: Any) => x.titre === section);
  const joints = async (h: Any, titre: string, section: string) => (await sectionDe(h, titre, section)).piecesJointes.length as number;
  const pdf = (i: number) => Buffer.from(`%PDF-1.4\n% ${i}\n%%EOF\n`);

  const notes = await sectionDe(m.lea, 'Léa Brisefer', 'Notes de la table');
  let n = notes.piecesJointes.length;
  for (let i = 0; n < 100; i++, n++) {
    assert.equal((await m.envoyer(m.lea, { section: String(notes.id), maniere: 'joint' }, `lea-${i}.pdf`, 'application/pdf', pdf(i))).statusCode, 201);
  }
  const refusLea = await m.envoyer(m.lea, { section: String(notes.id), maniere: 'joint' }, 'lea-101.pdf', 'application/pdf', pdf(101));
  assert.ok(refusLea.statusCode >= 400 && refusLea.statusCode < 500, String(refusLea.statusCode));
  assert.ok(refusLea.body.includes('Cette section ne peut pas recevoir d’autre fichier.') || refusLea.body.includes("Cette section ne peut pas recevoir d'autre fichier."), refusLea.body);
  assert.equal(await joints(m.lea, 'Léa Brisefer', 'Notes de la table'), 100);
  assert.ok(!(await m.noms(m.lea)).includes('lea-101.pdf'));

  const desc = await sectionDe(m.antor, 'Port-Sel', 'Description');
  n = desc.piecesJointes.length;
  for (let i = 0; n < 100; i++, n++) {
    assert.equal((await m.envoyer(m.antor, { section: String(desc.id), maniere: 'joint' }, `antor-${i}.pdf`, 'application/pdf', pdf(1000 + i))).statusCode, 201);
  }
  const refus = await m.envoyer(m.antor, { section: String(desc.id), maniere: 'joint' }, 'antor-101.pdf', 'application/pdf', pdf(1101));
  assert.ok(refus.statusCode >= 400 && refus.statusCode < 500);
  assert.ok(refus.body.includes('Cette section porte déjà 100 fichiers joints.'), refus.body);
  assert.equal(await joints(m.antor, 'Port-Sel', 'Description'), 100);
  assert.ok(!(await m.noms(m.antor)).includes('antor-101.pdf'));
});

test('B-24 · retirer une section retire ses références, jamais le fichier : il reste en médiathèque, sans usage nommé, octets servis', async () => {
  const m = await monter();
  const fiche = (await m.app.inject({ method: 'POST', url: m.api('/fiches'), headers: m.antor, payload: { type: 'lieu', titre: 'Fiche à ranger' } })).json();
  const sec = (await m.app.inject({ method: 'POST', url: m.api(`/fiches/${fiche.id}/sections`), headers: m.antor, payload: { titre: 'Annexes' } })).json();
  const v = (await m.envoyer(m.antor, { section: String(sec.id), maniere: 'joint' }, 'annexe-orpheline.pdf', 'application/pdf', PDF)).json();
  const lue = async () => (await m.json(m.antor, `/fiches/${fiche.id}`)).sections.find((x: Any) => x.titre === 'Annexes');
  assert.equal((await lue()).piecesJointes.length, 1);
  const d = await m.suppr(m.antor, `/fiches/${fiche.id}/sections/${sec.id}`);
  assert.ok(d.statusCode >= 200 && d.statusCode < 300, String(d.statusCode));
  assert.ok((await m.noms(m.antor)).includes('annexe-orpheline.pdf'), 'the file stays in the library');
  assert.equal(JSON.stringify(await m.json(m.antor, `/fichiers/${v.id}/detail`)).includes('Annexes'), false, 'no usage names the removed section');
  assert.equal((await m.get(m.antor, `/fichiers/${v.id}`)).statusCode, 200, 'the bytes are still served to the GM');
});

test('E-19 · un fichier utilisé dans 40 fiches : le détail en nomme 10 et en garde 30 pour la suite', async () => {
  const m = await monter();
  const f = (await m.envoyer(m.antor, {}, 'affiche-des-quarante.png', 'image/png', PNG)).json();
  for (let i = 1; i <= 40; i++) {
    const fiche = (await m.app.inject({ method: 'POST', url: m.api('/fiches'), headers: m.antor, payload: { type: 'lieu', titre: `Affichage ${String(i).padStart(2, '0')}` } })).json();
    const r = await m.app.inject({ method: 'POST', url: m.api(`/fiches/${fiche.id}/sections`), headers: m.antor, payload: { titre: 'Mur', contenu: `![affiche](fichier:${f.id})` } });
    assert.equal(r.statusCode, 201);
  }
  const detail = await m.json(m.antor, `/fichiers/${f.id}/detail`);
  assert.equal(detail.usages.length, 10);
  assert.equal(detail.restantes, 30);
});
