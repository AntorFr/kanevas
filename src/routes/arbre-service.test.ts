import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerFiche, deplacerFiche } = await import('../services/fiches.js');

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
  const row = (nom: string) => app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number };
  const lame = row("Lame d'Ébène").id;
  const fid = (t: string, u = lame) =>
    (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, u) as { id: number }).id;
  const appel = (who: string, method: 'GET' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url: `/api/univers/${lame}${url}`, headers: { cookie: cookies[who]! }, payload });
  return { app, lame, fid, appel, antor: trouverCompte(app.db, 'antor')!.id, row };
}

test('Léa : ancêtres de Port-Sel vides (Les Sphères illisible) ; Antor : [Les Sphères]', async () => {
  const { appel, fid } = await monter();
  const p = fid('Port-Sel');
  const lea = (await appel('lea', 'GET', `/fiches/${p}`)).json();
  assert.deepEqual(lea.ancetres, []);
  const antor = (await appel('antor', 'GET', `/fiches/${p}`)).json();
  assert.deepEqual(antor.ancetres.map((a: { titre: string }) => a.titre), ['Les Sphères']);
});

test('enfants de Port-Sel : quatre pour Léa, cinq pour Antor, sans trace du Repaire pour Léa', async () => {
  const { appel, fid } = await monter();
  const p = fid('Port-Sel');
  const l = await appel('lea', 'GET', `/fiches/${p}/enfants`);
  assert.equal(l.statusCode, 200);
  const corps = l.json();
  assert.deepEqual(
    corps.enfants.map((e: { titre: string }) => e.titre),
    ['Les Docks', 'La Taverne du Kraken', 'Le Phare aux Sels', 'Quartier des Cordiers'].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' }),
    ),
  );
  assert.equal(corps.suivant, null);
  assert.ok(!/Repaire|contrebandiers/i.test(l.body));
  assert.deepEqual(Object.keys(corps).sort(), ['enfants', 'suivant']);
  const a = (await appel('antor', 'GET', `/fiches/${p}/enfants`)).json();
  assert.equal(a.enfants.length, 5);
});

test('enfants d’une fiche illisible : 404 pour Léa', async () => {
  const { appel, fid } = await monter();
  assert.equal((await appel('lea', 'GET', `/fiches/${fid('Les Sphères')}/enfants`)).statusCode, 404);
});

test('arbre du type lieu à la racine : Port-Sel (dans null, aDesEnfants) pour Léa, Les Sphères pour Antor', async () => {
  const { appel, fid } = await monter();
  const l = (await appel('lea', 'GET', '/fiches?type=lieu&parent=racine')).json();
  const port = l.fiches.find((f: { titre: string }) => f.titre === 'Port-Sel');
  assert.ok(port);
  assert.equal(port.dans, null);
  assert.equal(port.aDesEnfants, true);
  assert.ok(!l.fiches.some((f: { titre: string }) => f.titre === 'Les Sphères'));
  const a = (await appel('antor', 'GET', '/fiches?type=lieu&parent=racine')).json();
  assert.ok(a.fiches.some((f: { titre: string }) => f.titre === 'Les Sphères'));
  assert.ok(!a.fiches.some((f: { titre: string }) => f.titre === 'Port-Sel'));
  const sph = a.fiches.find((f: { titre: string }) => f.titre === 'Les Sphères');
  assert.equal(sph.aDesEnfants, true);
  // children of Port-Sel in the type tree, Léa side: four, none a parent
  const e = (await appel('lea', 'GET', `/fiches?type=lieu&parent=${fid('Port-Sel')}`)).json();
  assert.equal(e.fiches.length, 4);
  assert.ok(e.fiches.every((f: { aDesEnfants: boolean }) => f.aDesEnfants === false));
  // without parent, no tree field
  const plat = (await appel('lea', 'GET', '/fiches?type=lieu')).json();
  assert.ok(plat.fiches.every((f: object) => !('aDesEnfants' in f) && !('dans' in f)));
});

test('aDesEnfants ne trahit pas un enfant illisible : Léa, Quartier sans enfant lisible', async () => {
  const { appel, fid, app, antor, lame } = await monter();
  const docks = fid('Les Docks');
  const hideout = fid('Le Repaire des contrebandiers');
  deplacerFiche(app.db, { compteId: antor }, lame, hideout, docks);
  const l = (await appel('lea', 'GET', `/fiches?type=lieu&parent=${fid('Port-Sel')}`)).json();
  assert.equal(l.fiches.find((f: { titre: string }) => f.titre === 'Les Docks').aDesEnfants, false);
  const a = (await appel('antor', 'GET', `/fiches?type=lieu&parent=${fid('Port-Sel')}`)).json();
  assert.equal(a.fiches.find((f: { titre: string }) => f.titre === 'Les Docks').aDesEnfants, true);
});

test('cycles : Les Sphères sous Port-Sel et sous elle-même → 400 cycle', async () => {
  const { appel, fid } = await monter();
  const s = fid('Les Sphères');
  for (const cible of [fid('Port-Sel'), s]) {
    const r = await appel('antor', 'PATCH', `/fiches/${s}`, { parent: cible });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().code, 'cycle');
  }
  // unchanged
  assert.deepEqual((await appel('antor', 'GET', `/fiches/${fid('Port-Sel')}`)).json().ancetres.length, 1);
});

test('Léa qui déplace : 403, et rien ne bouge', async () => {
  const { appel, fid } = await monter();
  const r = await appel('lea', 'PATCH', `/fiches/${fid('Les Docks')}`, { parent: fid('Le Phare aux Sels') });
  assert.equal(r.statusCode, 403);
  const e = (await appel('antor', 'GET', `/fiches/${fid('Port-Sel')}/enfants`)).json();
  assert.equal(e.enfants.length, 5);
});

test('MJ en mode Joueur ne déplace pas : 403', async () => {
  const { appel, fid } = await monter();
  const res = await appel('antor', 'PATCH', `/fiches/${fid('Les Docks')}?mode=joueur`, { parent: null });
  assert.equal(res.statusCode, 403);
});

test('parent d’un autre univers ou inconnu : 404', async () => {
  const { appel, fid, row } = await monter();
  const anse = fid('Anse-aux-Sels', row('Essai Kanka').id);
  const d = fid('Les Docks');
  assert.equal((await appel('antor', 'PATCH', `/fiches/${d}`, { parent: anse })).statusCode, 404);
  assert.equal((await appel('antor', 'PATCH', `/fiches/${d}`, { parent: 999999 })).statusCode, 404);
});

test('parent invalide dans le corps : 400', async () => {
  const { appel, fid } = await monter();
  const d = fid('Les Docks');
  assert.equal((await appel('antor', 'PATCH', `/fiches/${d}`, { parent: 'x' })).statusCode, 400);
  assert.equal((await appel('antor', 'PATCH', `/fiches/${d}`, { parent: 1.5 })).statusCode, 400);
});

test('chaîne de 51 niveaux : 400 trop_profond ; une chaîne courte passe ; parent null remet à la racine', async () => {
  const { app, appel, fid, lame, antor } = await monter();
  let prec: number | null = null;
  for (let i = 0; i < 51; i++) {
    const f = creerFiche(app.db, antor, lame, { type: 'lieu', titre: `Niveau ${i}` });
    if (prec !== null) deplacerFiche(app.db, { compteId: antor }, lame, f.id, prec);
    prec = f.id;
  }
  const d = fid('Les Docks');
  const r = await appel('antor', 'PATCH', `/fiches/${d}`, { parent: prec });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'trop_profond');
  assert.equal((await appel('antor', 'PATCH', `/fiches/${d}`, { parent: fid('Niveau 3') })).statusCode, 200);
  assert.equal((await appel('antor', 'PATCH', `/fiches/${d}`, { parent: null })).statusCode, 200);
  const racine = (await appel('antor', 'GET', '/fiches?type=lieu&parent=racine')).json();
  assert.ok(racine.fiches.some((f: { titre: string }) => f.titre === 'Les Docks'));
});

test('un déplacement ne change ni version ni modifie_le des sections', async () => {
  const { app, appel, fid } = await monter();
  const d = fid('Les Docks');
  const avant = app.db.prepare('SELECT id, version, modifie_le FROM sections WHERE fiche_id = ? ORDER BY id').all(d);
  assert.ok(avant.length > 0);
  const r = await appel('antor', 'PATCH', `/fiches/${d}`, { parent: fid('Le Phare aux Sels') });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(app.db.prepare('SELECT id, version, modifie_le FROM sections WHERE fiche_id = ? ORDER BY id').all(d), avant);
});

test('Contient : 50 par page, curseur, ordre type puis titre, sans doublon', async () => {
  const { app, appel, fid, lame, antor } = await monter();
  const p = creerFiche(app.db, antor, lame, { type: 'lieu', titre: 'Parent large' });
  const ids: number[] = [];
  for (let i = 0; i < 55; i++) {
    const f = creerFiche(app.db, antor, lame, { type: 'lieu', titre: `Enfant ${String(i).padStart(2, '0')}` });
    deplacerFiche(app.db, { compteId: antor }, lame, f.id, p.id);
    ids.push(f.id);
  }
  const pers = creerFiche(app.db, antor, lame, { type: 'personnage', titre: 'Zed', charge: { pj: false } });
  deplacerFiche(app.db, { compteId: antor }, lame, pers.id, p.id);
  void fid;
  const p1 = (await appel('antor', 'GET', `/fiches/${p.id}/enfants`)).json();
  assert.equal(p1.enfants.length, 50);
  assert.ok(p1.suivant);
  const p2 = (await appel('antor', 'GET', `/fiches/${p.id}/enfants?curseur=${p1.suivant}`)).json();
  assert.equal(p2.enfants.length, 6);
  assert.equal(p2.suivant, null);
  const tous = [...p1.enfants, ...p2.enfants];
  assert.equal(new Set(tous.map((e: { id: number }) => e.id)).size, 56);
  // personnage precedes lieu in the product's type order; within a type, by title
  assert.equal(p1.enfants[0].titre, 'Zed');
  assert.equal(p1.enfants[1].titre, 'Enfant 00');
  assert.equal(tous[tous.length - 1].titre, 'Enfant 54');
  assert.equal((await appel('antor', 'GET', `/fiches/${p.id}/enfants?curseur=zzz`)).statusCode, 400);
});
