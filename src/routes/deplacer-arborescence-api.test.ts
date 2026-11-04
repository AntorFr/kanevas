import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerFiche, deplacerFiche } = await import('../services/fiches.js');

type Ligne = { id: number; titre: string; type: string; aDesEnfants: boolean };

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const cookies: Record<string, string> = {};
  for (const c of ['antor', 'lea']) {
    const res = await app.inject({
      method: 'POST',
      url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `compte=${c}`,
    });
    cookies[c] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  }
  const lame = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as { id: number }).id;
  const fid = (t: string) =>
    (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, lame) as { id: number }).id;
  const appel = (who: string, url: string) =>
    app.inject({ method: 'GET', url: `/api/univers/${lame}${url}`, headers: { cookie: cookies[who]! } });
  return { app, lame, fid, appel, antor: trouverCompte(app.db, 'antor')!.id };
}

test('racines : Antor voit Les Sphères (aDesEnfants) et pas Port-Sel', async () => {
  const { appel } = await monter();
  const r = await appel('antor', '/fiches/racines');
  assert.equal(r.statusCode, 200, r.body);
  const c = r.json() as { enfants: Ligne[]; suivant: string | null };
  assert.deepEqual(Object.keys(c).sort(), ['enfants', 'suivant']);
  const s = c.enfants.find((e) => e.titre === 'Les Sphères');
  assert.ok(s);
  assert.equal(s.aDesEnfants, true);
  assert.ok(!c.enfants.some((e) => e.titre === 'Port-Sel'));
  assert.ok(c.enfants.some((e) => e.type !== 'lieu'), 'tous types');
  assert.ok(c.enfants.some((e) => e.aDesEnfants === false));
});

test('racines : Léa 403, Antor en mode Joueur 403, curseur invalide 400', async () => {
  const { appel } = await monter();
  assert.equal((await appel('lea', '/fiches/racines')).statusCode, 403);
  assert.equal((await appel('antor', '/fiches/racines?mode=joueur')).statusCode, 403);
  assert.equal((await appel('antor', '/fiches/racines?curseur=zzz')).statusCode, 400);
});

test('racines : 50 par page, curseur, sans doublon ni trou', async () => {
  const { app, appel, antor, lame } = await monter();
  const avant = ((await appel('antor', '/fiches/racines')).json() as { enfants: Ligne[] }).enfants.length;
  for (let i = 0; i < 60; i++) creerFiche(app.db, antor, lame, { type: 'lieu', titre: `Racine ${String(i).padStart(2, '0')}` });
  const p1 = (await appel('antor', '/fiches/racines')).json() as { enfants: Ligne[]; suivant: string };
  assert.equal(p1.enfants.length, 50);
  assert.ok(p1.suivant);
  const p2 = (await appel('antor', `/fiches/racines?curseur=${p1.suivant}`)).json() as { enfants: Ligne[]; suivant: string | null };
  assert.equal(p2.enfants.length, avant + 10);
  assert.equal(p2.suivant, null);
  assert.equal(new Set([...p1.enfants, ...p2.enfants].map((e) => e.id)).size, avant + 60);
});

test('racines : une fiche déplacée à la racine y apparaît ; une fiche rangée en sort', async () => {
  const { app, appel, fid, lame, antor } = await monter();
  deplacerFiche(app.db, { compteId: antor }, lame, fid('Port-Sel'), null);
  const t = ((await appel('antor', '/fiches/racines')).json() as { enfants: Ligne[] }).enfants.map((e) => e.titre);
  assert.ok(t.includes('Port-Sel'));
  const s = ((await appel('antor', '/fiches/racines')).json() as { enfants: Ligne[] }).enfants.find((e) => e.titre === 'Les Sphères')!;
  assert.equal(s.aDesEnfants, false);
});

test('enfants de Les Sphères : Port-Sel aDesEnfants ; feuilles false ; Léa ne voit pas le Repaire comme enfant', async () => {
  const { appel, fid } = await monter();
  const e = ((await appel('antor', `/fiches/${fid('Les Sphères')}/enfants`)).json() as { enfants: Ligne[] }).enfants;
  assert.deepEqual(e.map((x) => [x.titre, x.aDesEnfants]), [['Port-Sel', true]]);
  const p = ((await appel('antor', `/fiches/${fid('Port-Sel')}/enfants`)).json() as { enfants: Ligne[] }).enfants;
  assert.equal(p.length, 5);
  assert.ok(p.every((x) => x.aDesEnfants === false));
});

test('aDesEnfants (Léa) ignore un enfant illisible, tous types confondus ; Antor le compte', async () => {
  const { app, appel, fid, lame, antor } = await monter();
  // Le Repaire (MJ seul) sous Les Docks : Léa ne le lit pas ; un personnage sans section lisible aussi
  deplacerFiche(app.db, { compteId: antor }, lame, fid('Le Repaire des contrebandiers'), fid('Les Docks'));
  const l = ((await appel('lea', `/fiches/${fid('Port-Sel')}/enfants`)).json() as { enfants: Ligne[] }).enfants;
  assert.equal(l.find((x) => x.titre === 'Les Docks')!.aDesEnfants, false);
  const a = ((await appel('antor', `/fiches/${fid('Port-Sel')}/enfants`)).json() as { enfants: Ligne[] }).enfants;
  assert.equal(a.find((x) => x.titre === 'Les Docks')!.aDesEnfants, true);
  // un enfant d'un autre type, lisible, compte pour Léa
  const f = creerFiche(app.db, antor, lame, { type: 'faction', titre: 'Guet des Docks' });
  deplacerFiche(app.db, { compteId: antor }, lame, f.id, fid('Le Phare aux Sels'));
  const l2 = ((await appel('lea', `/fiches/${fid('Port-Sel')}/enfants`)).json() as { enfants: Ligne[] }).enfants;
  assert.equal(l2.find((x) => x.titre === 'Le Phare aux Sels')!.aDesEnfants, false, 'sans section lisible, toujours caché');
  const a2 = ((await appel('antor', `/fiches/${fid('Port-Sel')}/enfants`)).json() as { enfants: Ligne[] }).enfants;
  assert.equal(a2.find((x) => x.titre === 'Le Phare aux Sels')!.aDesEnfants, true);
});

test('horsDe : sans, Les Docks sort ; avec Port-Sel, il est écarté ; Léa 400', async () => {
  const { appel, fid } = await monter();
  const sans = (await appel('antor', '/fiches?q=Doc')).json() as { fiches: { titre: string }[] };
  assert.ok(sans.fiches.some((f) => f.titre === 'Les Docks'));
  const avec = await appel('antor', `/fiches?q=Doc&horsDe=${fid('Port-Sel')}`);
  assert.equal(avec.statusCode, 200);
  assert.ok(!(avec.json() as { fiches: { titre: string }[] }).fiches.some((f) => f.titre === 'Les Docks'));
  assert.equal((await appel('lea', `/fiches?q=Doc&horsDe=${fid('Port-Sel')}`)).statusCode, 400);
});

test('horsDe : la fiche elle-même est écartée, ses voisines non ; erreurs 400/404', async () => {
  const { appel, fid } = await monter();
  const port = (await appel('antor', `/fiches?q=Port&horsDe=${fid('Port-Sel')}`)).json() as { fiches: { titre: string }[] };
  assert.ok(!port.fiches.some((f) => f.titre === 'Port-Sel'));
  const sph = (await appel('antor', `/fiches?q=Sph&horsDe=${fid('Port-Sel')}`)).json() as { fiches: { titre: string }[] };
  assert.ok(sph.fiches.some((f) => f.titre === 'Les Sphères'), 'l’ancêtre reste');
  assert.equal((await appel('antor', `/fiches?q=Doc&horsDe=abc`)).statusCode, 400);
  assert.equal((await appel('antor', `/fiches?q=Doc&horsDe=999999`)).statusCode, 404);
  assert.equal((await appel('antor', `/fiches?horsDe=${fid('Port-Sel')}`)).statusCode, 400);
  assert.equal((await appel('antor', `/fiches?q=Doc&horsDe=${fid('Port-Sel')}&mode=joueur`)).statusCode, 400);
});

test('horsDe : pages pleines (100) et curseur justes avec un sous-arbre qui occupe le début', async () => {
  const { app, appel, lame, antor } = await monter();
  const racine = creerFiche(app.db, antor, lame, { type: 'lieu', titre: 'Zone Alpha' });
  for (let i = 0; i < 120; i++) {
    const f = creerFiche(app.db, antor, lame, { type: 'lieu', titre: `Zone Alpha ${String(i).padStart(2, '0')}` });
    deplacerFiche(app.db, { compteId: antor }, lame, f.id, racine.id);
  }
  const dehors: number[] = [];
  for (let i = 0; i < 105; i++) dehors.push(creerFiche(app.db, antor, lame, { type: 'lieu', titre: `Zone Beta ${String(i).padStart(2, '0')}` }).id);
  const p1 = (await appel('antor', `/fiches?q=Zone&horsDe=${racine.id}`)).json() as { fiches: { id: number }[]; suivant: string | null };
  assert.equal(p1.fiches.length, 100);
  assert.ok(p1.suivant);
  const p2 = (await appel('antor', `/fiches?q=Zone&horsDe=${racine.id}&curseur=${p1.suivant}`)).json() as { fiches: { id: number }[]; suivant: string | null };
  const ids = [...p1.fiches, ...p2.fiches].map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...dehors].sort());
  assert.equal(p2.suivant, null);
});

test('horsDe : un sous-arbre de 50 niveaux est entièrement écarté', async () => {
  const { app, appel, lame, antor } = await monter();
  let parent = creerFiche(app.db, antor, lame, { type: 'lieu', titre: 'Chaine 00' });
  const tete = parent.id;
  for (let i = 1; i < 50; i++) {
    const f = creerFiche(app.db, antor, lame, { type: 'lieu', titre: `Chaine ${String(i).padStart(2, '0')}` });
    deplacerFiche(app.db, { compteId: antor }, lame, f.id, parent.id);
    parent = f;
  }
  const avec = (await appel('antor', `/fiches?q=Chaine&horsDe=${tete}`)).json() as { fiches: unknown[] };
  assert.equal(avec.fiches.length, 0);
  const sans = (await appel('antor', `/fiches?q=Chaine`)).json() as { fiches: unknown[] };
  assert.equal(sans.fiches.length, 50);
});
