// Doors of the effects that « kanevas-outils-galaxie-tenir » (B-64, B-65, B-71, B-73, B-74, AD-130) proved without any screen in
// src/e2e/galaxie-tenir-ensemble-besoin.test.ts: the galaxy map write side by its routes (place, trace, draw, move with a version,
// seed, GM document, create / rename / delete a galaxy, import of the galaxy file), the guards of every write and the secrecy of what
// the GM keeps from the players. Moved as they were, the server being the app in-process (monde-lot-cartes.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, appel, lire, type Monde, monde, type Rep } from './monde-lot-cartes.js';
import { trouverCompte } from '../services/comptes.js';
import { creerJeton } from '../services/jetons.js';

const galerie = (m: Monde, gid = m.gid, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${gid}${suite}`;
const blocs = (m: Monde, compte: string, mode = '') => lire(m, compte, galerie(m, m.gid, `/blocs?de=-2,-2&a=2,2${mode}`));
const recherche = (m: Monde, compte: string, q: string, mode = '') => lire(m, compte, galerie(m, m.gid, `/recherche?q=${encodeURIComponent(q)}${mode}`));
const noms = (r: Rep, cle: string) => r.json[cle].map((x: Any) => x.nom).sort();

async function placerPortNoir(m: Monde): Promise<void> {
  const s = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Port Noir', q: 1, r: 1, secret: true });
  assert.equal(s.status, 201, s.texte);
  const r = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/routes'), { depuis: 'port-noir', vers: 'vael', publique: false });
  assert.equal(r.status, 201, r.texte);
  const z = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/zones'), { nom: 'Second territoire', contour: [[10, 3], [14, 3], [14, 7]], secret: true });
  assert.equal(z.status, 201, z.texte);
}

async function listeCartes(m: Monde, compte: string): Promise<string[]> {
  const r = await lire(m, compte, `/api/univers/${m.uid}/cartes`);
  return r.json.cartes.map((c: Any) => c.titre);
}
async function jeton(m: Monde, outils: string[] | undefined): Promise<string> {
  // A tool token has no session door any more (E-23 will offer the tools): the service, as the account.
  if (outils) return creerJeton(m.app.db, trouverCompte(m.app.db, 'antor')!.id, m.uid, { nom: 'Script galaxie', dureeJours: 30, outils }).valeur;
  const r = await appel(m, 'antor', 'POST', '/api/compte/jetons', {
    nom: 'Script galaxie', dureeJours: 30, acces: { tous: false, univers: [{ universId: m.uid, niveau: 'ecriture' }] },
  });
  assert.equal(r.status, 201, r.texte);
  return r.json.valeur;
}
async function imp(m: Monde, valeur: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const r = await m.app.inject({
    method: methode as 'GET',
    url: `/api/import/v1/univers/${m.uid}${chemin}`,
    headers: { authorization: `Bearer ${valeur}` },
    payload: corps === undefined ? undefined : (corps as object),
  });
  let json: Any = null;
  try {
    json = JSON.parse(r.body);
  } catch {
    /* not JSON */
  }
  return { status: r.statusCode, texte: r.body, json };
}
const FICHIER = {
  systemes: [
    { cle: 'port-sel', nom: 'Port-Sel', q: 0, r: 0, taille: 3 },
    { cle: 'vael', nom: 'Vael', q: 7, r: 0, taille: 2 },
    { cle: 'hesper', nom: 'Hesper', q: 1, r: 5 },
    { cle: 'station-fantome', nom: 'Station fantôme', q: -4, r: 2, secret: true },
  ],
  zones: [{ cle: 'marches', nom: 'Marches interdites', contour: [[-12, 2], [-4, 2], [-4, 8], [-12, 8]], secret: true }],
  routes: [
    { depuis: 'port-sel', vers: 'vael' },
    { depuis: 'vael', vers: 'hesper' },
    { depuis: 'port-sel', vers: 'hesper', publique: false },
  ],
};


test('B-73 nominal : Antor place « Port Noir » (1,1) secret, trace une route privée vers « Vael » (6 cases calculées), dessine un 2e territoire secret ; Léa n’en voit rien', async () => {
  const m = await monde();
  const s = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Port Noir', q: 1, r: 1, secret: true });
  assert.equal(s.status, 201);
  assert.equal(s.json.cle, 'port-noir');
  assert.equal(s.json.nom, 'Port Noir');
  assert.deepEqual([s.json.q, s.json.r], [1, 1]);
  const r = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/routes'), { depuis: 'port-noir', vers: 'vael', publique: false });
  assert.equal(r.status, 201);
  assert.equal(r.json.longueur, 6); // distance de grille (1,1) -> (7,0) : max(|6|,|-1|,|5|) = 6
  assert.equal(r.json.publique, false);
  const z = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/zones'), { nom: 'Second territoire', contour: [[10, 3], [14, 3], [14, 7]], secret: true });
  assert.equal(z.status, 201);

  const antor = await blocs(m, 'antor');
  assert.deepEqual(noms(antor, 'systemes'), ['Hesper', 'Port Noir', 'Port-Sel', 'Station fantôme', 'Vael']);
  assert.equal(antor.json.routes.length, 4);
  assert.deepEqual(noms(antor, 'zones'), ['Marches interdites', 'Second territoire']);

  const lea = await blocs(m, 'lea');
  assert.deepEqual(noms(lea, 'systemes'), ['Hesper', 'Port-Sel', 'Vael']);
  assert.equal(lea.json.routes.length, 2);
  assert.deepEqual(lea.json.zones, []);
  for (const mot of ['Noir', 'noir', 'Second', 'secret']) assert.ok(!lea.texte.includes(mot), `« ${mot} » dans la vue de Léa`);
  assert.deepEqual((await recherche(m, 'lea', 'noir')).json, []);
  assert.deepEqual((await recherche(m, 'antor', 'noir')).json.map((x: Any) => x.nom), ['Port Noir']);
  const t = await lire(m, 'lea', galerie(m, m.gid, '/trajet?depart=port-sel&arrivee=port-noir&moteur=2&routes=publiques'));
  const inconnu = await lire(m, 'lea', galerie(m, m.gid, '/trajet?depart=port-sel&arrivee=nulle-part&moteur=2&routes=publiques'));
  assert.equal(t.status, 404);
  assert.equal(t.texte, inconnu.texte);
  assert.equal((await lire(m, 'lea', galerie(m, m.gid, '/systemes/port-noir'))).status, 404);
});

test('B-73 exclusion : Antor en mode Joueur voit exactement la vue, la recherche et le trajet de Léa', async () => {
  const m = await monde();
  await placerPortNoir(m);
  const lea = await blocs(m, 'lea');
  const joueur = await blocs(m, 'antor', '&mode=joueur');
  assert.deepEqual(joueur.json, lea.json);
  assert.deepEqual((await recherche(m, 'antor', 'noir', '&mode=joueur')).json, []);
  const t = await lire(m, 'antor', galerie(m, m.gid, '/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=toutes&mode=joueur'));
  assert.equal(t.json.libelle, '7 cases · 4,5 jours');
});

test('B-73 exclusion : la route privée de « Port Noir » n’existe pas pour Léa, même demandée « toutes » : son trajet Port-Sel → Vael reste de 7 cases', async () => {
  const m = await monde();
  await placerPortNoir(m);
  await appel(m, 'antor', 'POST', galerie(m, m.gid, '/routes'), { depuis: 'port-sel', vers: 'port-noir', publique: false });
  const t = await lire(m, 'lea', galerie(m, m.gid, '/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=toutes'));
  assert.equal(t.json.libelle, '7 cases · 4,5 jours');
  const antor = await lire(m, 'antor', galerie(m, m.gid, '/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=toutes'));
  assert.equal(antor.json.libelle, '7 cases · 4,5 jours');
});

test('B-73 exclusion : Léa lit la même densité de systèmes générés avant et après un territoire secret dessiné par Antor', async () => {
  const m = await monde();
  const avant = await blocs(m, 'lea');
  const z = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/zones'), { nom: 'Dense', contour: [[10, 3], [14, 3], [14, 7]], secret: true, densite: 1 });
  assert.equal(z.status, 201, z.texte);
  const apres = await blocs(m, 'lea');
  assert.deepEqual(apres.json.blocs, avant.json.blocs);
  const mj = await blocs(m, 'antor');
  assert.notDeepEqual(mj.json.blocs, avant.json.blocs, 'le MJ voit bien la zone changer la densité');
});

test('B-73 / T-1 exclusion : Léa (joueuse) 403, Teo (sans rôle) 404, Antor en mode Joueur 403 : aucun geste d’écriture, rien n’est écrit', async () => {
  const m = await monde();
  const corps = { nom: 'Intrus', q: 1, r: 1 };
  assert.equal((await appel(m, 'lea', 'POST', galerie(m, m.gid, '/systemes'), corps)).status, 403);
  assert.equal((await appel(m, 'teo', 'POST', galerie(m, m.gid, '/systemes'), corps)).status, 404);
  assert.equal((await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes?mode=joueur'), corps)).status, 403);
  assert.equal((await appel(m, 'antor', 'POST', galerie(m, m.gid, '/routes?mode=joueur'), { depuis: 'vael', vers: 'hesper' })).status, 403);
  assert.equal((await appel(m, 'lea', 'POST', galerie(m, m.gid, '/zones'), { nom: 'Z', contour: [[0, 0], [3, 0], [3, 3]] })).status, 403);
  assert.equal((await appel(m, 'antor', 'POST', galerie(m, m.gid, '/zones?mode=joueur'), { nom: 'Z', contour: [[0, 0], [3, 0], [3, 3]] })).status, 403);
  assert.equal((await appel(m, 'antor', 'PUT', galerie(m, m.gid, '/graine?mode=joueur'), { graine: 'x', version: 1, confirme: true })).status, 403);
  assert.equal((await appel(m, 'antor', 'DELETE', galerie(m, m.gid, '?version=1&systemes=4&routes=3&zones=1&mode=joueur'))).status, 403);
  const c = await lire(m, 'antor', galerie(m, m.gid, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes, c.json.zones], [4, 3, 1]);
});

test('B-73 bords : longueur jamais saisie, deux extrémités distinctes, paire unique dans les deux sens, hexagone occupé', async () => {
  const m = await monde();
  await placerPortNoir(m);
  const ro = (corps: unknown) => appel(m, 'antor', 'POST', galerie(m, m.gid, '/routes'), corps);
  const avecLongueur = await ro({ depuis: 'hesper', vers: 'port-noir', longueur: 3 });
  assert.equal(avecLongueur.status, 400);
  assert.equal(avecLongueur.json.champ, 'longueur');
  assert.equal((await ro({ depuis: 'vael', vers: 'vael' })).status, 400);
  assert.equal((await ro({ depuis: 'vael', vers: 'port-noir' })).status, 409, 'Port Noir → Vael existe déjà, dans l’autre sens');
  assert.equal((await ro({ depuis: 'vael', vers: 'port-sel' })).status, 409);
  assert.equal((await ro({ depuis: 'vael', vers: 'nulle-part' })).status, 400);
  const occupe = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Doublon', q: 1, r: 1 });
  assert.equal(occupe.status, 409);
  assert.equal(occupe.json.code, 'case_occupee');
});

test('B-73 bords : nom 1 à 80 caractères, coordonnées ±100 000, notes 2 000, couleur de la palette', async () => {
  const m = await monde();
  const place = (c: Any) => appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { q: 20, r: 20, ...c });
  assert.equal((await place({ nom: '' })).status, 400);
  assert.equal((await place({ nom: '   ' })).status, 400);
  assert.equal((await place({ nom: 'a'.repeat(81) })).status, 400);
  assert.equal((await place({ nom: 'a'.repeat(80) })).status, 201);
  assert.equal((await place({ nom: 'Loin', q: 100001 })).status, 400);
  assert.equal((await place({ nom: 'Loin', q: 100000, r: -100000 })).status, 201);
  assert.equal((await place({ nom: 'Notes', q: 21, notes: 'n'.repeat(2001) })).status, 400);
  assert.equal((await place({ nom: 'Notes', q: 21, notes: 'n'.repeat(2000) })).status, 201);
  assert.equal((await place({ nom: 'Couleur', q: 22, couleur: 'fuchsia' })).status, 400);
  assert.equal((await place({ nom: 'Couleur', q: 22, couleur: 'ambre', taille: 'grande' })).status, 201);
});

test('B-73 bords : le contour d’une zone compte 3 à 64 sommets, simple (ni croisé, ni points répétés)', async () => {
  const m = await monde();
  const zone = (contour: unknown, nom = 'Z') => appel(m, 'antor', 'POST', galerie(m, m.gid, '/zones'), { nom, contour });
  assert.equal((await zone([[0, 0], [3, 0]])).status, 400);
  assert.equal((await zone([[0, 0], [3, 3], [3, 0], [0, 3]])).status, 400, 'nœud papillon');
  const croise = await zone([[0, 0], [3, 3], [3, 0], [0, 3]]);
  assert.equal(croise.json.code, 'invalide');
  assert.equal((await zone([[0, 0], [0, 0], [3, 0], [3, 3]])).status, 400, 'sommet répété');
  assert.equal((await zone([[0, 0], [1, 0], [2, 0]])).status, 400, 'aire nulle');
  assert.equal((await zone([[0, 0], [3, 0], [3, 3]])).status, 201);
  const cercle = (n: number) => Array.from({ length: n }, (_, i) => [Math.round(30 * Math.cos((2 * Math.PI * i) / n)) + 60, Math.round(30 * Math.sin((2 * Math.PI * i) / n)) + 60]);
  assert.equal((await zone(cercle(64), 'Soixante-quatre')).status, 201);
  assert.equal((await zone(cercle(65), 'Soixante-cinq')).status, 400);
});

test('B-64 : Antor déplace « Vael » d’un hexagone ; Mira, avec la version qu’elle avait lue, est refusée 409 « donnee_modifiee » ; avec la nouvelle version elle passe', async () => {
  const m = await monde();
  const lu = await lire(m, 'mira', galerie(m, m.gid, '/systemes/vael'));
  const v = lu.json.version;
  assert.equal(v, 1);
  const deplace = await appel(m, 'antor', 'PATCH', galerie(m, m.gid, '/systemes/vael'), { q: 8, r: 0, version: v });
  assert.equal(deplace.status, 200, deplace.texte);
  assert.equal(deplace.json.version, 2);
  const refus = await appel(m, 'mira', 'PATCH', galerie(m, m.gid, '/systemes/vael'), { nom: 'Vael bis', version: v });
  assert.equal(refus.status, 409);
  assert.equal(refus.json.code, 'donnee_modifiee');
  assert.equal((await lire(m, 'mira', galerie(m, m.gid, '/systemes/vael'))).json.nom, 'Vael');
  const ok = await appel(m, 'mira', 'PATCH', galerie(m, m.gid, '/systemes/vael'), { nom: 'Vael bis', version: 2 });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.nom, 'Vael bis');
});

test('B-64 / B-73 : déplacer « Vael » d’un hexagone recalcule la longueur de ses routes (Port-Sel–Vael : 8 cases) et périme la version de la route', async () => {
  const m = await monde();
  await appel(m, 'antor', 'PATCH', galerie(m, m.gid, '/systemes/vael'), { q: 8, r: 0, version: 1 });
  const v = await blocs(m, 'antor');
  const ps = v.json.routes.find((x: Any) => x.id === 1);
  assert.equal(ps.longueur, 8);
  assert.equal(ps.version, 2);
  const refus = await appel(m, 'mira', 'PATCH', galerie(m, m.gid, '/routes/1'), { publique: false, version: 1 });
  assert.equal(refus.status, 409);
  const t = await lire(m, 'lea', galerie(m, m.gid, '/trajet?depart=port-sel&arrivee=vael&moteur=2&routes=publiques'));
  assert.equal(t.json.libelle, '8 cases · 5 jours');
});

test('B-64 bords : une zone et une route retirées avec une version périmée sont refusées, avec la bonne elles partent ; « Vael » retiré emporte ses 2 routes', async () => {
  const m = await monde();
  await appel(m, 'antor', 'PATCH', galerie(m, m.gid, '/zones/marches-interdites'), { nom: 'Marches', version: 1 });
  const z = await appel(m, 'mira', 'DELETE', galerie(m, m.gid, '/zones/marches-interdites?version=1'));
  assert.equal(z.status, 409);
  assert.equal((await appel(m, 'mira', 'DELETE', galerie(m, m.gid, '/zones/marches-interdites?version=2'))).status, 204);
  const r = await appel(m, 'mira', 'DELETE', galerie(m, m.gid, '/systemes/vael?version=1'));
  assert.ok(r.status === 200 || r.status === 204, r.texte);
  const c = await lire(m, 'antor', galerie(m, m.gid, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes, c.json.zones], [3, 1, 0]);
});

test('B-64 / P-18 étape 4 : « Relais » promu sur un hexagone généré (2,0) garde sa place quand la graine change ; les systèmes non définis changent ; sans confirme : refusé', async () => {
  const m = await monde();
  const initial = await blocs(m, 'antor');
  assert.ok(initial.json.blocs.find((b: Any) => b.bx === 0 && b.by === 0).generes.some((p: number[]) => p[0] === 2 && p[1] === 0), '(2,0) est un système généré');
  const relais = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Relais', q: 2, r: 0 });
  assert.equal(relais.status, 201);
  assert.equal(relais.json.promu, true);
  const avant = await blocs(m, 'antor');
  const g = await lire(m, 'antor', galerie(m, m.gid, '/graine'));
  assert.equal(g.json.graine, 'essai-1');
  const sans = await appel(m, 'antor', 'PUT', galerie(m, m.gid, '/graine'), { graine: 'autre-graine', version: 1 });
  assert.equal(sans.status, 400);
  const faux = await appel(m, 'antor', 'PUT', galerie(m, m.gid, '/graine'), { graine: 'autre-graine', version: 1, confirme: 'oui' });
  assert.equal(faux.status, 400);
  assert.deepEqual((await blocs(m, 'antor')).json.blocs, avant.json.blocs, 'rien n’a changé sans confirmation');
  const ok = await appel(m, 'antor', 'PUT', galerie(m, m.gid, '/graine'), { graine: 'autre-graine', version: 1, confirme: true });
  assert.equal(ok.status, 200, ok.texte);
  const apres = await blocs(m, 'antor');
  assert.deepEqual(apres.json.systemes.map((s: Any) => [s.nom, s.q, s.r]).sort(), avant.json.systemes.map((s: Any) => [s.nom, s.q, s.r]).sort());
  assert.notDeepEqual(apres.json.blocs.map((b: Any) => b.generes), avant.json.blocs.map((b: Any) => b.generes), 'les non définis ont changé de place');
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/graine'))).json.graine, 'autre-graine');
});

test('B-64 bords : la graine fait 1 à 64 caractères ; une version périmée est refusée ; Léa ne lit pas la graine', async () => {
  const m = await monde();
  const set = (graine: string, version = 1) => appel(m, 'antor', 'PUT', galerie(m, m.gid, '/graine'), { graine, version, confirme: true });
  assert.equal((await set('')).status, 400);
  assert.equal((await set('g'.repeat(65))).status, 400);
  assert.equal((await set('g'.repeat(64))).status, 200);
  assert.equal((await set('x', 1)).status, 409);
  assert.ok([403, 404].includes((await lire(m, 'lea', galerie(m, m.gid, '/graine'))).status));
  assert.ok(!(await lire(m, 'lea', galerie(m, m.gid, '/blocs?de=0,0&a=0,0'))).texte.includes('g'.repeat(64)));
});

test('B-74 / P-18 étape 5 : « Document MJ » crée une fiche Savoir, section « Document MJ » lue par Antor, introuvable pour Léa ; un système placé périme le document, une proposition attend, le texte ne change qu’à l’application', async () => {
  const m = await monde();
  const cree = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/document'), { creer: { titre: 'Galaxie — notes MJ' }, version: 1 });
  assert.equal(cree.status, 201, cree.texte);
  assert.equal(cree.json.fiche.titre, 'Galaxie — notes MJ');
  assert.equal(cree.json.etat, 'a_jour');
  const fid = cree.json.fiche.id;
  const fiche = await lire(m, 'antor', `/api/univers/${m.uid}/fiches/${fid}`);
  assert.equal(fiche.json.type, 'savoir');
  const section = fiche.json.sections.find((s: Any) => s.titre === 'Document MJ');
  assert.ok(section, 'section « Document MJ »');
  for (const mot of ['Port-Sel', 'Vael', 'Hesper', 'Station fantôme']) assert.ok(section.html.includes(mot), mot);
  assert.equal((await lire(m, 'lea', `/api/univers/${m.uid}/fiches/${fid}`)).status, 404);
  const avant = section.html;
  await appel(m, 'antor', 'POST', galerie(m, m.gid, '/systemes'), { nom: 'Port Noir', q: 1, r: 1, secret: true });
  const d = await lire(m, 'antor', galerie(m, m.gid, '/document'));
  assert.equal(d.json.etat, 'perime');
  assert.ok(d.json.propositionId, 'une proposition est déposée');
  const apres = (await lire(m, 'antor', `/api/univers/${m.uid}/fiches/${fid}`)).json.sections.find((s: Any) => s.titre === 'Document MJ');
  assert.equal(apres.html, avant, 'le texte ne change pas de lui-même');
  assert.ok(!apres.html.includes('Port Noir'));
  const ap = await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/propositions/${d.json.propositionId}/appliquer`, {});
  assert.equal(ap.status, 200, ap.texte);
  const final = (await lire(m, 'antor', `/api/univers/${m.uid}/fiches/${fid}`)).json.sections.find((s: Any) => s.titre === 'Document MJ');
  assert.ok(final.html.includes('Port Noir'));
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/document'))).json.etat, 'a_jour');
  assert.equal((await lire(m, 'lea', `/api/univers/${m.uid}/fiches/${fid}`)).status, 404);
});

test('B-74 exclusion : le document ne porte rien à Léa, même par la recherche de fiches ; la section est protégée de l’écriture directe', async () => {
  const m = await monde();
  const cree = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/document'), { creer: { titre: 'Galaxie — notes MJ' }, version: 1 });
  const fid = cree.json.fiche.id;
  const rech = await lire(m, 'lea', `/api/univers/${m.uid}/fiches?recherche=${encodeURIComponent('Station')}`);
  assert.ok(!rech.texte.includes('Station fantôme'));
  assert.ok(!rech.texte.includes('Galaxie — notes MJ'));
  const sec = (await lire(m, 'antor', `/api/univers/${m.uid}/fiches/${fid}`)).json.sections[0];
  const ecr = await appel(m, 'antor', 'PUT', `/api/univers/${m.uid}/fiches/${fid}/sections/${sec.id}/contenu`, { contenu: 'à la main', version: 1 });
  assert.ok(ecr.status >= 400, 'une section gérée ne s’écrit pas à la main');
});

test('B-74 bords : un 2e document est refusé (document_existant) ; une fiche existante peut être choisie ; la fiche inconnue est refusée', async () => {
  const m = await monde();
  const a = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/document'), { creer: { titre: 'Notes' }, version: 1 });
  assert.equal(a.status, 201);
  const b = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/document'), { creer: { titre: 'Autres' }, version: 1 });
  assert.ok(b.status === 409 || b.status === 400, b.texte);
  const inconnue = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/document'), { ficheId: 999999, version: 1 });
  assert.ok(inconnue.status >= 400);
});

test('B-71 : « Galaxie neuve » créée invisible (Léa ne la voit pas), renommée « Galaxie du bord », rendue visible (Léa la voit), recachée : « Page introuvable. »', async () => {
  const m = await monde();
  const cree = await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/outils/swn/galaxie/cartes`, { titre: 'Galaxie neuve' });
  assert.equal(cree.status, 201);
  const gid = cree.json.id;
  assert.ok((await listeCartes(m, 'antor')).includes('Galaxie neuve'));
  assert.ok(!(await listeCartes(m, 'lea')).includes('Galaxie neuve'));
  assert.equal((await lire(m, 'lea', galerie(m, gid, '/blocs?de=0,0&a=0,0'))).status, 404);
  const ren = await appel(m, 'antor', 'PATCH', galerie(m, gid), { titre: 'Galaxie du bord', version: 1 });
  assert.equal(ren.status, 200, ren.texte);
  const vis = await appel(m, 'antor', 'PATCH', galerie(m, gid), { visible: true, version: 2 });
  assert.equal(vis.status, 200, vis.texte);
  assert.ok((await listeCartes(m, 'lea')).includes('Galaxie du bord'));
  assert.ok(!(await listeCartes(m, 'lea')).includes('Galaxie neuve'));
  assert.equal((await lire(m, 'lea', galerie(m, gid, '/blocs?de=0,0&a=0,0'))).status, 200);
  const cache = await appel(m, 'antor', 'PATCH', galerie(m, gid), { visible: false, version: 3 });
  assert.equal(cache.status, 200);
  assert.ok(!(await listeCartes(m, 'lea')).includes('Galaxie du bord'));
  const l = await lire(m, 'lea', galerie(m, gid, '/blocs?de=0,0&a=0,0'));
  const inconnu = await lire(m, 'lea', galerie(m, 999999, '/blocs?de=0,0&a=0,0'));
  assert.equal(l.status, 404);
  assert.equal(l.texte, inconnu.texte);
});

test('B-71 bords : titre de galaxie 1 à 80 caractères ; Léa et Teo ne créent pas ; Antor en mode Joueur non plus', async () => {
  const m = await monde();
  const cree = (compte: string, titre: string, q = '') => appel(m, compte, 'POST', `/api/univers/${m.uid}/outils/swn/galaxie/cartes${q}`, { titre });
  assert.equal((await cree('antor', '')).status, 400);
  assert.equal((await cree('antor', 'g'.repeat(81))).status, 400);
  assert.equal((await cree('antor', 'g'.repeat(80))).status, 201);
  assert.equal((await cree('lea', 'Intrus')).status, 403);
  assert.equal((await cree('teo', 'Intrus')).status, 404);
  assert.equal((await cree('antor', 'Intrus', '?mode=joueur')).status, 403);
  assert.ok(!(await listeCartes(m, 'antor')).includes('Intrus'));
});

test('B-71 : « Supprimer la galaxie » compte 5 systèmes, 4 routes, 2 zones après les gestes d’Antor ; un décompte faux ne supprime rien ; le bon efface tout', async () => {
  const m = await monde();
  await placerPortNoir(m);
  const c = await lire(m, 'antor', galerie(m, m.gid, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes, c.json.zones], [5, 4, 2]);
  const faux = await appel(m, 'antor', 'DELETE', galerie(m, m.gid, '?version=1&systemes=4&routes=3&zones=1'));
  assert.equal(faux.status, 409);
  assert.ok((await listeCartes(m, 'antor')).includes("Galaxie d'essai"));
  const ok = await appel(m, 'antor', 'DELETE', galerie(m, m.gid, '?version=1&systemes=5&routes=4&zones=2'));
  assert.ok(ok.status === 200 || ok.status === 204, ok.texte);
  assert.ok(!(await listeCartes(m, 'antor')).includes("Galaxie d'essai"));
  assert.equal((await lire(m, 'antor', galerie(m, m.gid, '/blocs?de=0,0&a=0,0'))).status, 404);
});

test('B-71 / B-74 : supprimer une galaxie qui porte un document retire la section « Document MJ », la fiche reste', async () => {
  const m = await monde();
  const cree = await appel(m, 'antor', 'POST', galerie(m, m.gid, '/document'), { creer: { titre: 'Galaxie — notes MJ' }, version: 1 });
  const fid = cree.json.fiche.id;
  const c = await lire(m, 'antor', galerie(m, m.gid, '/contenu'));
  assert.equal(c.json.document.titre, 'Galaxie — notes MJ');
  const version = (await lire(m, 'antor', `/api/univers/${m.uid}/cartes`)).json.cartes.find((x: Any) => x.id === m.gid).version;
  const del = await appel(m, 'antor', 'DELETE', galerie(m, m.gid, `?version=${version}&systemes=4&routes=3&zones=1`));
  assert.ok(del.status === 200 || del.status === 204, del.texte);
  const f = await lire(m, 'antor', `/api/univers/${m.uid}/fiches/${fid}`);
  assert.equal(f.status, 200);
  assert.ok(!f.json.sections.some((s: Any) => s.titre === 'Document MJ'));
});

test('B-65 / AD-130 : un jeton à la portée « galaxie » pousse le fichier de la galaxie d’essai dans « Galaxie du bord » : 8 créés, puis rejeu : 8 inchangés, sans doublon ; la galaxie montre les éléments', async () => {
  const m = await monde();
  const bord = (await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/outils/swn/galaxie/cartes`, { titre: 'Galaxie du bord' })).json.id;
  const t = await jeton(m, ['swn/galaxie']);
  const liste = await imp(m, t, 'GET', '/outils/swn/galaxie/galaxies');
  assert.equal(liste.status, 200, liste.texte);
  assert.ok(liste.json.some((g: Any) => g.id === bord && g.titre === 'Galaxie du bord'));
  const lot = await imp(m, t, 'POST', '/lots?outil=swn/galaxie');
  assert.equal(lot.status, 201, lot.texte);
  const lotId = lot.json.lotId;
  const un = await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}?lot=${lotId}`, FICHIER);
  assert.equal(un.status, 200, un.texte);
  assert.equal(un.json.refusTotal, 0);
  assert.deepEqual([un.json.natures.systemes.creees, un.json.natures.zones.creees, un.json.natures.routes.creees], [4, 1, 3]);
  const rapport = await imp(m, t, 'GET', `/lots/${lotId}`);
  assert.equal(rapport.json.compteurs.systemes.creees, 4);
  const deux = await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}?lot=${lotId}`, FICHIER);
  assert.deepEqual([deux.json.natures.systemes.inchangees, deux.json.natures.zones.inchangees, deux.json.natures.routes.inchangees], [4, 1, 3]);
  assert.equal(deux.json.natures.systemes.creees + deux.json.natures.zones.creees + deux.json.natures.routes.creees, 0);
  const c = await lire(m, 'antor', galerie(m, bord, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes, c.json.zones], [4, 3, 1]);
  const v = await lire(m, 'antor', galerie(m, bord, '/blocs?de=-2,-2&a=2,2'));
  assert.equal(v.json.routes.find((r: Any) => r.depuis.cle === 'port-sel' && r.vers.cle === 'vael').longueur, 7);
});

test('B-65 échec : une route entre deux systèmes absents du lot est refusée avec son champ, le reste passe ; une « longueur » dans le fichier est refusée', async () => {
  const m = await monde();
  const bord = (await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/outils/swn/galaxie/cartes`, { titre: 'Galaxie du bord' })).json.id;
  const t = await jeton(m, ['swn/galaxie']);
  const corps = {
    systemes: [{ cle: 'vael', nom: 'Vael', q: 7, r: 0 }, { cle: 'hesper', nom: 'Hesper', q: 1, r: 5 }],
    routes: [{ depuis: 'vael', vers: 'hesper' }, { depuis: 'nulle-part', vers: 'ailleurs' }, { depuis: 'vael', vers: 'hesper', longueur: 2 }],
  };
  const r = await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}`, corps);
  assert.equal(r.status, 200, r.texte);
  assert.equal(r.json.natures.systemes.creees, 2);
  assert.equal(r.json.natures.routes.creees, 1);
  assert.equal(r.json.natures.routes.refusees, 2);
  assert.ok(r.texte.includes('routes[1]'), `champ de la route refusée dans la réponse : ${r.texte}`);
  const c = await lire(m, 'antor', galerie(m, bord, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes], [2, 1]);
});

test('B-65 exclusions : un jeton d’une autre portée, révoqué ou sans portée d’outil est refusé 401 ; une galaxie inconnue est 404 ; le jeton n’ouvre aucune route de session', async () => {
  const m = await monde();
  const bord = (await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/outils/swn/galaxie/cartes`, { titre: 'Galaxie du bord' })).json.id;
  const sansPortee = await jeton(m, undefined);
  const r1 = await imp(m, sansPortee, 'PUT', `/outils/swn/galaxie/galaxies/${bord}`, FICHIER);
  assert.ok(r1.status === 401 || r1.status === 403 || r1.status === 404, `sans portée d’outil : ${r1.status}`);
  const t = await jeton(m, ['swn/galaxie']);
  const inconnu = await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/999999`, FICHIER);
  assert.equal(inconnu.status, 404);
  const faux = await imp(m, 'kvs_pasunjeton', 'PUT', `/outils/swn/galaxie/galaxies/${bord}`, FICHIER);
  assert.equal(faux.status, 401);
  assert.equal(faux.json.code, 'jeton_invalide');
  const session = await m.app.inject({ method: 'GET', url: galerie(m, bord, '/contenu'), headers: { authorization: `Bearer ${t}` } });
  assert.notEqual(session.statusCode, 200);
  const jetons = (await lire(m, 'antor', '/api/compte/jetons')).json.jetons as Any[];
  const jid = jetons.find((j) => j.nom === 'Script galaxie' && j.outils.includes('swn/galaxie'))?.id;
  assert.ok(jid);
  assert.equal((await appel(m, 'antor', 'DELETE', `/api/compte/jetons/${jid}`)).status, 200);
  assert.equal((await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}`, FICHIER)).status, 401);
  const c = await lire(m, 'antor', galerie(m, bord, '/contenu'));
  assert.deepEqual([c.json.systemes, c.json.routes, c.json.zones], [0, 0, 0], 'rien n’a été écrit');
});

test('B-65 bords : l’import ne remplace pas ce qu’Antor a modifié dans Kanevas depuis (refusé « Modifié dans Kanevas depuis le dernier import. »)', async () => {
  const m = await monde();
  const bord = (await appel(m, 'antor', 'POST', `/api/univers/${m.uid}/outils/swn/galaxie/cartes`, { titre: 'Galaxie du bord' })).json.id;
  const t = await jeton(m, ['swn/galaxie']);
  await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}`, FICHIER);
  const edit = await appel(m, 'antor', 'PATCH', galerie(m, bord, '/systemes/vael'), { nom: 'Vael modifié', version: 1 });
  assert.equal(edit.status, 200, edit.texte);
  const r = await imp(m, t, 'PUT', `/outils/swn/galaxie/galaxies/${bord}`, FICHIER);
  assert.equal(r.json.natures.systemes.refusees, 1);
  assert.ok(r.texte.includes('Modifié dans Kanevas depuis le dernier import.'));
  assert.equal((await lire(m, 'antor', galerie(m, bord, '/systemes/vael'))).json.nom, 'Vael modifié');
});
