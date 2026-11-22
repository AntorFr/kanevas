// Review tests of kanevas-battlemap-editeur-cartes-api (B-101, B-104, AD-155, AD-162, AD-battlemap-editeur-2 and 8):
// the routes of the composed maps, the cell-size setting and the stub map « Cantine de la station ».
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type App = Awaited<ReturnType<typeof buildApp>>;
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde(cartesActives = true) {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-cartes-')));
  const h: Record<string, string> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) {
    const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
    h[c] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  }
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const antorId = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  poserActivation(app.db, antorId, { niveau: 'systeme', id: S }, 'battlemap/cartes', cartesActives);
  const R = `/api/univers/${E}/outils/battlemap/cartes`;
  const req = (method: M, who: string | null, url: string, payload?: any) =>
    app.inject({ method, url, headers: who ? { cookie: h[who] } : {}, payload });
  const assetId = (nom: string) => String(one(app, 'SELECT id FROM bm_assets WHERE univers_id = ? AND nom = ?', E, nom).id);
  const cantine = one(app, "SELECT id FROM bm_cartes WHERE titre = 'Cantine de la station'").id as number;
  return { app, E, S, R, req, assetId, cantine };
}

test('un MJ crée une carte, applique un lot et relit le même document ; la version d’avant est 409 conflit', async () => {
  const w = await monde();
  const c = await w.req('POST', 'antor', w.R, { titre: 'Soute', largeur: 12, hauteur: 8 });
  assert.equal(c.statusCode, 201, c.body);
  const { id } = c.json();
  const v1 = (await w.req('GET', 'antor', `${w.R}/${id}`)).json();
  assert.equal(v1.version, 1);
  assert.equal(v1.peutEcrire, true);
  const lot = { version: 1, commandes: [{ type: 'poser_element', id: 'e1', calque: 'objets', asset_id: w.assetId('Tonneau'), x: 2.5, y: 3.5 }] };
  const ok = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, lot);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().version, 2);
  assert.equal(ok.json().inverses.length, 1);
  const v2 = (await w.req('GET', 'antor', `${w.R}/${id}`)).json();
  assert.equal(v2.version, 2);
  assert.equal(JSON.stringify(v2.document).includes('"e1"'), true);
  const rejeu = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, lot);
  assert.equal(rejeu.statusCode, 409);
  assert.equal(rejeu.json().code ?? rejeu.json().detail, 'version');
  assert.equal((await w.req('GET', 'antor', `${w.R}/${id}`)).json().version, 2, 'le lot refusé n’écrit rien');
});

test('un lot qui dépasse 5 000 éléments est 409 carte_pleine et ne laisse rien', async () => {
  const w = await monde();
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Pleine' })).json();
  const asset = w.assetId('Tonneau');
  const lot = (de: number, n: number) => Array.from({ length: n }, (_, i) =>
    ({ type: 'poser_element', id: `e${de + i}`, calque: 'objets', asset_id: asset, x: 0.5 + ((de + i) % 30), y: 0.5 + ((de + i) % 20) }));
  const plein = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, { version: 1, commandes: lot(0, 4000) });
  assert.equal(plein.statusCode, 200, plein.body.slice(0, 200));
  const r = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, { version: 2, commandes: lot(4000, 1001) });
  assert.equal(r.statusCode, 409, r.body.slice(0, 200));
  assert.equal(r.json().code ?? r.json().detail, 'carte_pleine');
  assert.equal((await w.req('GET', 'antor', `${w.R}/${id}`)).json().version, 2, 'le lot refusé n’écrit rien');
  const juste = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, { version: 2, commandes: lot(4000, 1000) });
  assert.equal(juste.statusCode, 200, 'le 5 000e élément passe : la limite est au-delà');
});

test('un redimensionnement qui laisse des éléments dehors est 400 limite_depassee, champ taille', async () => {
  const w = await monde();
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Petite', largeur: 20, hauteur: 20 })).json();
  const lot = { version: 1, commandes: [{ type: 'poser_element', id: 'loin', calque: 'objets', asset_id: w.assetId('Tonneau'), x: 15.5, y: 3.5 }] };
  assert.equal((await w.req('POST', 'antor', `${w.R}/${id}/commandes`, lot)).statusCode, 200);
  const r = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, largeur: 10 });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().code ?? r.json().detail, 'limite_depassee');
  assert.equal(r.json().champ, 'taille');
  const ok = await w.req('PATCH', 'antor', `${w.R}/${id}`, { version: 2, largeur: 16 });
  assert.equal(ok.statusCode, 200, ok.body);
});

test('ids étrangers : asset_inconnu et fiche_inconnue sont 400', async () => {
  const w = await monde();
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'X' })).json();
  const a = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, { version: 1,
    commandes: [{ type: 'poser_element', id: 'z', calque: 'objets', asset_id: '999999', x: 1.5, y: 1.5 }] });
  assert.equal(a.statusCode, 400, a.body);
  assert.equal(a.json().code ?? a.json().detail, 'asset_inconnu');
  const f = await w.req('POST', 'antor', `${w.R}/${id}/commandes`, { version: 1,
    commandes: [{ type: 'poser_element', id: 'z', calque: 'objets', asset_id: w.assetId('Tonneau'), x: 1.5, y: 1.5, fiche_id: '999999' }] });
  assert.equal(f.statusCode, 400, f.body);
  assert.equal(f.json().code ?? f.json().detail, 'fiche_inconnue');
});

test('la bibliothèque semée compte un asset mur', async () => {
  const w = await monde();
  assert.equal(one(w.app, "SELECT COUNT(*) n FROM bm_assets WHERE univers_id = ? AND categorie = 'mur'", w.E).n, 1);
});

test('Léa lit la Cantine sans le calque « Réservé au MJ » ni ses éléments ; Antor les lit', async () => {
  const w = await monde();
  const mj = (await w.req('GET', 'antor', `${w.R}/${w.cantine}`)).json();
  const joueuse = await w.req('GET', 'lea', `${w.R}/${w.cantine}`);
  assert.equal(joueuse.statusCode, 200, joueuse.body);
  const jd = joueuse.json();
  assert.ok(JSON.stringify(mj.document).includes('Réservé au MJ'), 'le MJ voit le calque');
  assert.ok(!joueuse.body.includes('Réservé au MJ'), 'le calque MJ seul est absent');
  assert.equal(jd.peutEcrire, false);
  // la salle piège (calque mj) n’a aucun segment pour la joueuse : moins de murs que le MJ
  const murs = (j: any) => JSON.stringify(j.document).length;
  assert.ok(murs(jd) < murs(mj));
});

test('Cantine : trois éléments, un lié à une fiche, un sol, deux portes dans les murs publics et une dans le calque MJ', async () => {
  const w = await monde();
  const d = (await w.req('GET', 'antor', `${w.R}/${w.cantine}`)).json().document;
  const doc = JSON.stringify(d);
  assert.equal(d.elements.length, 3);
  assert.equal(d.elements.filter((e: any) => e.fiche_id).length, 1);
  assert.equal(d.calques.length, 4);
  assert.equal(d.calques.filter((c: any) => c.mj_seul).length, 1);
  assert.equal(doc.includes('"porte":true') ? (doc.match(/"porte":true/g) ?? []).length : 0, 3);
});

test('une carte masquée répond introuvable à un joueur, une écriture de joueur ou de MJ en mode Joueur est refusée', async () => {
  const w = await monde();
  const { id } = (await w.req('POST', 'antor', w.R, { titre: 'Secrète' })).json();
  const masquee = await w.req('GET', 'lea', `${w.R}/${id}`);
  assert.equal(masquee.statusCode, 404);
  assert.ok(!masquee.body.includes('Secrète'));
  const inconnue = await w.req('GET', 'lea', `${w.R}/987654`);
  assert.equal(inconnue.statusCode, 404);
  assert.equal(inconnue.body, masquee.body, 'masquée = inconnue');
  const lot = { version: 1, commandes: [{ type: 'poser_element', id: 'e', calque: 'objets', asset_id: w.assetId('Tonneau'), x: 1.5, y: 1.5 }] };
  // visible carte, joueur : écriture refusée comme au service (introuvable)
  for (const [m, url, p] of [['POST', `${w.R}/${w.cantine}/commandes`, lot], ['PATCH', `${w.R}/${w.cantine}`, { version: 3, titre: 'Pwned' }],
    ['DELETE', `${w.R}/${w.cantine}`, undefined], ['POST', w.R, { titre: 'Intruse' }]] as [M, string, any][]) {
    const r = await w.req(m, 'lea', url, p);
    assert.equal(r.statusCode, 404, `${m} ${url} : ${r.body}`);
  }
  // MJ en mode Joueur : refuse (403)
  for (const [m, url, p] of [['POST', `${w.R}/${w.cantine}/commandes`, lot], ['PATCH', `${w.R}/${w.cantine}`, { version: 3, titre: 'Pwned' }],
    ['DELETE', `${w.R}/${w.cantine}`, undefined], ['POST', w.R, { titre: 'Intruse' }]] as [M, string, any][]) {
    const r = await w.req(m, 'antor', `${url}?mode=joueur`, p);
    assert.equal(r.statusCode, 403, `${m} ${url} : ${r.body}`);
  }
  // MJ en mode Joueur sur une carte masquée : refuse mode_joueur
  const mj = await w.req('GET', 'antor', `${w.R}/${id}?mode=joueur`);
  assert.equal(mj.statusCode, 403, mj.body);
  assert.equal(one(w.app, "SELECT COUNT(*) n FROM bm_cartes WHERE titre IN ('Pwned', 'Intruse')").n, 0);
  assert.equal(one(w.app, "SELECT COUNT(*) n FROM bm_cartes WHERE id = ?", w.cantine).n, 1);
});

test('outil désactivé, ou compte hors univers : comme un chemin non enregistré', async () => {
  const w = await monde(false);
  const ref = await w.req('GET', 'antor', `/api/univers/${w.E}/outils/battlemap/nexiste-pas`);
  for (const [m, url, p] of [['GET', `${w.R}/${w.cantine}`, undefined], ['POST', w.R, { titre: 'x' }], ['POST', `${w.R}/${w.cantine}/commandes`, { version: 1, commandes: [] }],
    ['PATCH', `${w.R}/${w.cantine}`, { version: 1, titre: 'y' }], ['DELETE', `${w.R}/${w.cantine}`, undefined]] as [M, string, any][]) {
    const r = await w.req(m, 'antor', url, p);
    assert.equal(r.statusCode, 404, `${m} ${url}`);
    assert.equal(r.body, ref.body, `${m} ${url}`);
  }
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_cartes').n, 1, 'rien n’a été écrit');
  const w2 = await monde();
  const ref2 = await w2.req('GET', 'antor', `/api/univers/${w2.E}/outils/battlemap/nexiste-pas`);
  const teo = await w2.req('GET', 'teo', `${w2.R}/${w2.cantine}`);
  assert.equal(teo.statusCode, 404);
  assert.equal(teo.body, ref2.body);
  assert.notEqual((await w2.req('GET', null, `${w2.R}/${w2.cantine}`)).statusCode, 200);
});

test('le cadre : POST titre/largeur/hauteur, tailles refusées, DELETE retire la carte', async () => {
  const w = await monde();
  const cadre = `/api/univers/${w.E}/outils/battlemap/cartes/cartes`;
  const c = await w.req('POST', 'antor', cadre, { titre: 'Hangar', largeur: 40, hauteur: 25 });
  assert.equal(c.statusCode, 201, c.body);
  const id = c.json().id;
  const bad = await w.req('POST', 'antor', cadre, { titre: 'Trop', largeur: 201, hauteur: 5 });
  assert.equal(bad.statusCode, 400, bad.body);
  const frac = await w.req('POST', 'antor', cadre, { titre: 'Frac', largeur: 10.5 });
  assert.equal(frac.statusCode, 400, frac.body);
  assert.equal(one(w.app, "SELECT COUNT(*) n FROM bm_cartes WHERE titre IN ('Trop','Frac')").n, 0);
  assert.equal((await w.req('DELETE', 'lea', `${cadre}/${id}`)).statusCode, 404);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_cartes WHERE id = ?', id).n, 1, 'une joueuse ne supprime rien');
  const del = await w.req('DELETE', 'antor', `${cadre}/${id}`);
  assert.equal(del.statusCode, 204, del.body);
  assert.equal(one(w.app, 'SELECT COUNT(*) n FROM bm_cartes WHERE id = ?', id).n, 0);
  assert.equal((await w.req('DELETE', 'antor', `${cadre}/${id}`)).statusCode, 404);
});

test('le réglage taille de case : 70 par défaut, 100 donne 100 à la carte créée ensuite et laisse les autres ; hors 20–300 refusé', async () => {
  const w = await monde();
  const taille = async (titre: string) => {
    const { id } = (await w.req('POST', 'antor', w.R, { titre })).json();
    return one(w.app, 'SELECT taille_case t FROM bm_cartes WHERE id = ?', id).t;
  };
  assert.equal(await taille('Avant'), 70);
  const regl = `/api/univers/${w.E}/outils/battlemap/cartes/reglages`;
  for (const mauvais of [19, 301, 70.5, 'x']) {
    const r = await w.req('PUT', 'antor', regl, { version: 0, valeurs: { tailleCase: mauvais } });
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${mauvais} : ${r.statusCode}`);
  }
  const ok = await w.req('PUT', 'antor', regl, { version: 0, valeurs: { tailleCase: 100 } });
  assert.equal(ok.statusCode, 204, ok.body);
  assert.equal(await taille('Apres'), 100);
  assert.equal(one(w.app, "SELECT taille_case t FROM bm_cartes WHERE titre = 'Avant'").t, 70, 'les autres cartes gardent leur taille');
  assert.equal(one(w.app, "SELECT taille_case t FROM bm_cartes WHERE titre = 'Cantine de la station'").t, 70);
  const borne = await w.req('PUT', 'antor', regl, { version: 1, valeurs: { tailleCase: 300 } });
  assert.equal(borne.statusCode, 204, borne.body);
  assert.equal(await taille('Bord'), 300);
});

test('la liste des cartes (E-10) rend pour la carte composée sa taille et l’adresse d’ouverture', async () => {
  const w = await monde();
  const { id } = (await w.req('POST', 'antor', `/api/univers/${w.E}/outils/battlemap/cartes/cartes`, { titre: 'Hangar', largeur: 40, hauteur: 25 })).json();
  const liste = await w.req('GET', 'antor', `/api/univers/${w.E}/cartes`);
  assert.equal(liste.statusCode, 200);
  const hangar = liste.json().cartes.find((x: any) => x.titre === 'Hangar');
  assert.equal(hangar.adresse, `/univers/${w.E}/outils/battlemap/cartes/${id}`);
  assert.deepEqual([hangar.largeur, hangar.hauteur], [40, 25]);
});
