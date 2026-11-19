// Doors of the effects that « kanevas-outils-galaxie-lire » (B-68 to B-73, B-78, AD-132) proved without any screen in
// src/e2e/galaxie-lire-ensemble-besoin.test.ts: the galaxy map read side, by its routes (trajet, recherche, blocs, systeme), the
// guards of the secret system / route / zone, the hidden galaxy and the disabled tool, and the assistant tool. Moved as they were,
// the server being the app in-process (monde-lot-cartes.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, lire, type Monde, monde, put, type Rep, sql } from './monde-lot-cartes.js';

const api = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
const trajet = (m: Monde, compte: string, de: string, vers: string, moteur: number, routes: string) =>
  lire(m, compte, api(m, `/trajet?depart=${de}&arrivee=${vers}&moteur=${moteur}&routes=${routes}`));
const blocs = (m: Monde, compte: string, de: string, a: string, mode = '') =>
  lire(m, compte, api(m, `/blocs?de=${de}&a=${a}${mode}`));
function blocDe(rep: Rep, bx: number, by: number): Any {
  return rep.json.blocs.find((b: Any) => b.bx === bx && b.by === by);
}

test('B-72 nominal : Léa, Port-Sel vers Vael, moteur 2, routes publiques : « 7 cases · 4,5 jours »', async () => {
  const m = await monde();
  const r = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
  assert.equal(r.status, 200);
  assert.equal(r.json.libelle, '7 cases · 4,5 jours');
  assert.equal(r.json.cases, 7);
  assert.equal(r.json.jours, 4.5);
});

test('B-72 : Antor (toutes) Port-Sel vers Hesper par la route privée : 6 cases · 4 jours ; Léa : 13 cases · 8,5 jours par Vael sans tronçon privé', async () => {
  const m = await monde();
  const antor = await trajet(m, 'antor', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(antor.json.libelle, '6 cases · 4 jours');
  assert.deepEqual(antor.json.etapes.map((e: Any) => e.cle), ['port-sel', 'hesper']);
  const lea = await trajet(m, 'lea', 'port-sel', 'hesper', 2, 'publiques');
  assert.equal(lea.json.libelle, '13 cases · 8,5 jours');
  assert.deepEqual(lea.json.etapes.map((e: Any) => e.cle), ['port-sel', 'vael', 'hesper']);
  for (const t of lea.json.troncons) {
    const bout = new Set([t.depuis, t.vers]);
    assert.ok(!(bout.has('port-sel') && bout.has('hesper')), 'aucun tronçon de la route privée pour Léa');
  }
});

test('B-72 exclusion : Léa demandant « toutes » n’obtient pas la route privée', async () => {
  const m = await monde();
  const r = await trajet(m, 'lea', 'port-sel', 'hesper', 2, 'toutes');
  assert.equal(r.json.libelle, '13 cases · 8,5 jours');
});

test('B-72 bords : moteur 1 (7 cases = 7 ÷ 1 + 1 = 8 jours) et moteur 6 (7 ÷ 6 + 1 = 2,2 jours, arrondi au dixième)', async () => {
  const m = await monde();
  assert.equal((await trajet(m, 'lea', 'port-sel', 'vael', 1, 'publiques')).json.libelle, '7 cases · 8 jours');
  assert.equal((await trajet(m, 'lea', 'port-sel', 'vael', 6, 'publiques')).json.libelle, '7 cases · 2,2 jours');
});

test('B-72 bords : la route privée se prend dans les deux sens (Hesper vers Port-Sel pour Antor)', async () => {
  const m = await monde();
  const r = await trajet(m, 'antor', 'hesper', 'port-sel', 2, 'toutes');
  assert.equal(r.json.libelle, '6 cases · 4 jours');
});

test('B-72 / P-18 échec : aucune route ne mène à « Station fantôme » : « Aucun trajet avec ce moteur. »', async () => {
  const m = await monde();
  const r = await trajet(m, 'antor', 'port-sel', 'station-fantome', 2, 'toutes');
  assert.equal(r.status, 200);
  assert.equal(r.json.trouve, false);
  assert.equal(r.json.libelle, 'Aucun trajet avec ce moteur.');
});

test('B-73 / E-21 exclusion : un trajet vers « Station fantôme » est, pour Léa, la même 404 qu’un système inconnu', async () => {
  const m = await monde();
  const secret = await trajet(m, 'lea', 'port-sel', 'station-fantome', 2, 'publiques');
  const inconnu = await trajet(m, 'lea', 'port-sel', 'nulle-part', 2, 'publiques');
  assert.equal(secret.status, 404);
  assert.equal(secret.status, inconnu.status);
  assert.equal(secret.texte, inconnu.texte);
});

test('B-73 / E-21 exclusion : en mode Joueur, Antor obtient le trajet et la recherche de Léa', async () => {
  const m = await monde();
  const t = await lire(m, 'antor', api(m, '/trajet?depart=port-sel&arrivee=hesper&moteur=2&routes=toutes&mode=joueur'));
  assert.equal(t.json.libelle, '13 cases · 8,5 jours');
  const s = await lire(m, 'antor', api(m, '/recherche?q=fant&mode=joueur'));
  assert.deepEqual(s.json, []);
});

test('E-21 nominal et bords de la recherche : « Vael » (casse libre) trouvé, une seule lettre : rien', async () => {
  const m = await monde();
  const a = await lire(m, 'lea', api(m, '/recherche?q=vael'));
  assert.deepEqual(a.json.map((x: Any) => x.nom), ['Vael']);
  const b = await lire(m, 'lea', api(m, '/recherche?q=VAEL'));
  assert.deepEqual(b.json.map((x: Any) => x.nom), ['Vael']);
  const c = await lire(m, 'lea', api(m, '/recherche?q=v'));
  assert.deepEqual(c.json, []);
});

test('P-18 échec : Léa cherche « Station fantôme », « fant », « Station » : aucun résultat, même réponse qu’une recherche sans objet', async () => {
  const m = await monde();
  const vide = await lire(m, 'lea', api(m, '/recherche?q=zzzz'));
  for (const q of ['Station%20fant%C3%B4me', 'fant', 'Station']) {
    const r = await lire(m, 'lea', api(m, `/recherche?q=${q}`));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
    assert.equal(r.texte, vide.texte, 'aucune trace d’un masquage');
  }
});

test('E-21 : Antor (MJ) trouve « Station fantôme » en cherchant « fant »', async () => {
  const m = await monde();
  const r = await lire(m, 'antor', api(m, '/recherche?q=fant'));
  assert.deepEqual(r.json.map((x: Any) => x.nom), ['Station fantôme']);
});

test('B-71 : deux appels du même bloc rendent les mêmes systèmes générés', async () => {
  const m = await monde();
  const a = await blocs(m, 'lea', '-2,-2', '2,2');
  const b = await blocs(m, 'lea', '-2,-2', '2,2');
  assert.equal(a.status, 200);
  assert.deepEqual(a.json, b.json);
  assert.ok(a.json.blocs.length === 25);
  assert.ok(a.json.blocs.some((x: Any) => x.generes.length > 0));
});

test('B-71 / B-78 : deux serveurs neufs sur la galaxie d’essai génèrent les mêmes blocs (identique à chaque redémarrage)', async () => {
  const m1 = await monde();
  const m2 = await monde();
  const a = await blocs(m1, 'lea', '-2,-2', '2,2');
  const b = await blocs(m2, 'lea', '-2,-2', '2,2');
  assert.deepEqual(a.json.blocs, b.json.blocs);
});

test('B-71 bords : la vue ne rend que le rectangle demandé ; 12 × 12 blocs passe, 13 × 13 est refusé', async () => {
  const m = await monde();
  const un = await blocs(m, 'lea', '0,0', '0,0');
  assert.equal(un.json.blocs.length, 1);
  assert.deepEqual(un.json.systemes.map((s: Any) => s.nom), ['Port-Sel']);
  assert.ok(!un.texte.includes('Vael'));
  assert.ok(!un.texte.includes('Hesper'));
  assert.equal((await blocs(m, 'lea', '0,0', '11,11')).status, 200);
  assert.equal((await blocs(m, 'lea', '0,0', '12,12')).status, 400);
});

test('B-71 bords : les blocs de coordonnées négatives existent (bloc −1,−1)', async () => {
  const m = await monde();
  const r = await blocs(m, 'lea', '-1,-1', '-1,-1');
  assert.equal(r.json.blocs.length, 1);
  assert.equal(r.json.blocs[0].bx, -1);
  assert.equal(r.json.blocs[0].by, -1);
  for (const [q, rr] of r.json.blocs[0].generes) {
    assert.ok(q >= -5 && q <= -1 && rr >= -5 && rr <= -1, `(${q},${rr}) hors du bloc (-1,-1)`);
  }
});

test('B-73 exclusion : la vue de Léa ne contient ni système secret, ni route privée, ni zone secrète, ni trace de masquage', async () => {
  const m = await monde();
  const r = await blocs(m, 'lea', '-2,-2', '2,2');
  assert.deepEqual(r.json.systemes.map((s: Any) => s.nom).sort(), ['Hesper', 'Port-Sel', 'Vael']);
  assert.equal(r.json.routes.length, 2);
  assert.deepEqual(r.json.zones, []);
  for (const mot of ['fant', 'Station', 'Marches', 'secret', 'publique', 'Priv', 'masqu', 'cach']) {
    assert.ok(!r.texte.includes(mot), `« ${mot} » ne doit pas apparaître dans la vue de Léa`);
  }
});

test('B-73 : la vue d’Antor (MJ) porte le système secret, la route privée et la zone secrète', async () => {
  const m = await monde();
  const r = await blocs(m, 'antor', '-2,-2', '2,2');
  assert.deepEqual(r.json.systemes.map((s: Any) => s.nom).sort(), ['Hesper', 'Port-Sel', 'Station fantôme', 'Vael']);
  assert.equal(r.json.routes.length, 3);
  assert.deepEqual(r.json.zones.map((z: Any) => z.nom), ['Marches interdites']);
});

test('B-73 : Antor en mode Joueur voit la vue de Léa, le bloc (−2,0) recouvrant la zone secrète compris', async () => {
  const m = await monde();
  const lea = await blocs(m, 'lea', '-2,-2', '2,2');
  const mj = await blocs(m, 'antor', '-2,-2', '2,2');
  const joueur = await blocs(m, 'antor', '-2,-2', '2,2', '&mode=joueur');
  assert.deepEqual(joueur.json, lea.json);
  assert.notDeepEqual(blocDe(mj, -2, 0).generes, blocDe(lea, -2, 0).generes, 'le MJ voit le bloc modifié par la zone secrète');
});

test('B-71 / AD-132 : un bloc dont la densité dépend d’un territoire secret est identique pour Léa avec ou sans ce territoire', async () => {
  const m = await monde();
  const avec = await blocs(m, 'lea', '-2,-1', '-1,1');
  const mjAvec = await blocs(m, 'antor', '-2,-1', '-1,1');
  sql(m, 'DELETE FROM swn_zones');
  const sans = await blocs(m, 'lea', '-2,-1', '-1,1');
  const mjSans = await blocs(m, 'antor', '-2,-1', '-1,1');
  assert.deepEqual(avec.json.blocs, sans.json.blocs);
  assert.notDeepEqual(mjAvec.json.blocs, mjSans.json.blocs, 'la zone secrète change bien la densité vue par le MJ');
  assert.deepEqual(mjSans.json.blocs, sans.json.blocs, 'sans zone, MJ et joueur voient les mêmes blocs');
});

test('B-71 / AD-132 : un bloc chauffé par Antor est lu par Léa comme à froid ; et inversement', async () => {
  const froidLea = await (async () => blocs(await monde(), 'lea', '-2,-2', '2,2'))();
  const froidAntor = await (async () => blocs(await monde(), 'antor', '-2,-2', '2,2'))();
  const m1 = await monde();
  await blocs(m1, 'antor', '-2,-2', '2,2');
  const leaApres = await blocs(m1, 'lea', '-2,-2', '2,2');
  assert.deepEqual(leaApres.json, froidLea.json);
  const m2 = await monde();
  await blocs(m2, 'lea', '-2,-2', '2,2');
  const antorApres = await blocs(m2, 'antor', '-2,-2', '2,2');
  assert.deepEqual(antorApres.json, froidAntor.json);
});

test('B-68 : le panneau de « Vael » porte nom, distance de la position, routes publiques et le lien stable sans contenu', async () => {
  const m = await monde();
  const r = await lire(m, 'lea', api(m, '/systemes/vael'));
  assert.equal(r.status, 200);
  assert.equal(r.json.nom, 'Vael');
  assert.equal(r.json.lien, `/univers/${m.uid}/outils/swn/galaxie/${m.gid}?systeme=vael`);
  assert.deepEqual(r.json.routes.map((x: Any) => x.avec.nom).sort(), ['Hesper', 'Port-Sel']);
});

test('B-73 exclusion : le panneau de « Hesper » montre à Léa sa seule route publique, à Antor aussi la privée', async () => {
  const m = await monde();
  const lea = await lire(m, 'lea', api(m, '/systemes/hesper'));
  assert.deepEqual(lea.json.routes.map((x: Any) => x.avec.nom), ['Vael']);
  const antor = await lire(m, 'antor', api(m, '/systemes/hesper'));
  assert.deepEqual(antor.json.routes.map((x: Any) => x.avec.nom).sort(), ['Port-Sel', 'Vael']);
});

test('B-68 exclusion : le système secret est « introuvable » pour Léa, comme un système inconnu (même réponse)', async () => {
  const m = await monde();
  const secret = await lire(m, 'lea', api(m, '/systemes/station-fantome'));
  const inconnu = await lire(m, 'lea', api(m, '/systemes/nulle-part'));
  assert.equal(secret.status, 404);
  assert.equal(secret.status, inconnu.status);
  assert.equal(secret.texte, inconnu.texte);
  assert.equal((await lire(m, 'antor', api(m, '/systemes/station-fantome'))).status, 200);
});

test('B-68 / B-71 exclusion : Teo (sans rôle dans l’univers) et une galaxie inconnue : la 404 d’un chemin inexistant', async () => {
  const m = await monde();
  const absent = await lire(m, 'lea', `/api/univers/${m.uid}/outils/swn/galaxie/nulle-part`);
  assert.equal(absent.status, 404);
  for (const compte of ['teo']) {
    const r = await lire(m, compte, api(m));
    assert.equal(r.status, 404, compte);
    assert.equal(r.texte, absent.texte, compte);
    const s = await lire(m, compte, api(m, '/systemes/vael'));
    assert.equal(s.status, 404, compte);
  }
  const inconnue = await lire(m, 'lea', `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/9999`);
  assert.equal(inconnue.status, 404);
});

test('B-71 : une galaxie non visible est introuvable pour Léa, entière pour Antor ; absente de sa liste de cartes', async () => {
  const m = await monde();
  sql(m, 'UPDATE swn_galaxies SET visible = 0');
  for (const suite of ['', '/blocs?de=0,0&a=0,0', '/systemes/vael', '/recherche?q=vael', '/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=publiques']) {
    assert.equal((await lire(m, 'lea', api(m, suite))).status, 404, suite);
    assert.equal((await lire(m, 'antor', api(m, suite))).status, 200, suite);
  }
  const lea = await lire(m, 'lea', `/api/univers/${m.uid}/cartes`);
  assert.ok(!lea.texte.includes("Galaxie d'essai"));
  const antor = await lire(m, 'antor', `/api/univers/${m.uid}/cartes`);
  assert.equal(antor.json.cartes.find((c: Any) => c.titre === "Galaxie d'essai").visible, false);
});

test('B-70 : l’outil désactivé au système rend la galaxie introuvable à Léa et à Antor, et la retire de la liste des cartes', async () => {
  const m = await monde();
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/activation`, { active: false }), 204);
  for (const compte of ['lea', 'antor']) {
    assert.equal((await lire(m, compte, api(m))).status, 404, compte);
    const l = await lire(m, compte, `/api/univers/${m.uid}/cartes`);
    assert.ok(!l.texte.includes("Galaxie d'essai"), compte);
  }
});

test('B-70 : l’outil invisible des joueurs est introuvable pour Léa, lisible par Antor', async () => {
  const m = await monde();
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/visibilite`, { joueur: false }), 204);
  assert.equal((await lire(m, 'lea', api(m))).status, 404);
  assert.equal((await lire(m, 'antor', api(m))).status, 200);
});

test('B-69 : l’outil d’assistant swn_galaxie_trajet rend le résultat de l’écran, pour le même compte', async () => {
  const m = await monde();
  const { catalogueDe } = await import('../services/assistant/catalogue.js');
  const db = m.app.db;
  {
    const ids: Record<string, number> = {};
    for (const c of db.prepare('SELECT id, username FROM comptes').all() as { id: number; username: string }[]) ids[c.username] = c.id;
    const outil = (compte: string) => catalogueDe(db, ids[compte], m.uid).outils.find((o) => o.nom === 'swn_galaxie_trajet');

    const lea = outil('lea');
    assert.ok(lea, 'l’outil est dans le catalogue de Léa');
    const ecran = await trajet(m, 'lea', 'port-sel', 'vael', 2, 'publiques');
    const r: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Vael', moteur: 2, routes: 'publiques' });
    assert.equal(r.ok, true);
    const d = (x: Any): Any => x.donnees ?? x;
    assert.equal(d(r).libelle, '7 cases · 4,5 jours');
    assert.deepEqual({ etapes: d(r).etapes, troncons: d(r).troncons, cases: d(r).cases, jours: d(r).jours, libelle: d(r).libelle },
      { etapes: ecran.json.etapes, troncons: ecran.json.troncons, cases: ecran.json.cases, jours: ecran.json.jours, libelle: ecran.json.libelle });

    const leaToutes: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Hesper', moteur: 2, routes: 'toutes' });
    assert.equal(d(leaToutes).libelle, '13 cases · 8,5 jours');
    const antor: Any = await outil('antor')!.executer({ depart: 'Port-Sel', arrivee: 'Hesper', moteur: 2, routes: 'toutes' });
    assert.equal(d(antor).libelle, '6 cases · 4 jours');

    const secret: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Station fantôme' });
    const inconnu: Any = await lea.executer({ depart: 'Port-Sel', arrivee: 'Nulle part' });
    assert.equal(secret.ok, false);
    assert.deepEqual(secret, inconnu, 'le système secret n’a pas d’autre réponse qu’un système inconnu');

    assert.throws(() => catalogueDe(db, ids.teo, m.uid), 'Teo, sans rôle, n’a pas de catalogue');
  }
  assert.equal(await put(m, 'antor', `/api/systemes/${m.sid}/outils/swn/galaxie/activation`, { active: false }), 204);
  {
    const lea = (db.prepare("SELECT id FROM comptes WHERE username = 'lea'").get() as { id: number }).id;
    assert.ok(!catalogueDe(db, lea, m.uid).outils.some((o) => o.nom === 'swn_galaxie_trajet'), 'outil désactivé : absent du catalogue');
  }
});
