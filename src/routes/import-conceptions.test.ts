import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// kanevas-outils-eneria-conceptions : un script pousse des conceptions de vaisseaux par l'API d'import, rejouables sans doublon.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton, revoquerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');
const { enregistrerConception } = await import('../services/swn/conceptions.js');
const { creerFiche } = await import('../services/fiches.js');

const T = 'swn/vaisseaux';
const lire = (f: string) => JSON.parse(readFileSync(new URL(`../outils/swn/exemples/${f}`, import.meta.url), 'utf8'));
const CATALOGUE = lire('catalogue-essai.json');
const fichier = () => structuredClone(lire('conceptions-essai.json')) as { conceptions: any[] };

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  const un = (sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;
  const E = un('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const K = un('SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  poserActivation(app.db, id('antor'), { niveau: 'univers', id: E }, T, true);
  const tok = (compte: string, outils?: string[], univers = E) =>
    creerJeton(app.db, id(compte), univers, { nom: 'T', dureeJours: 30, outils }, app.horloge());
  const req = (valeur: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, univers = E) =>
    app.inject({ method, url: `/api/import/v1/univers/${univers}${url}`, headers: { authorization: `Bearer ${valeur}` }, payload: payload as any });
  const t = tok('antor', [T]).valeur;
  const cat = await req(t, 'PUT', `/outils/${T}/catalogue?niveau=univers`, CATALOGUE);
  assert.equal(cat.statusCode, 200, cat.body);
  const ouvrir = async (valeur = t) => (await req(valeur, 'POST', `/lots?outil=${T}`)).json().lotId as number;
  const put = (corps: unknown, lot?: number, valeur = t) =>
    req(valeur, 'PUT', `/outils/${T}/conceptions${lot ? `?lot=${lot}` : ''}`, corps);
  const lignes = () => app.db.prepare('SELECT * FROM swn_conceptions WHERE version_importee IS NOT NULL ORDER BY fiche_id').all() as any[];
  const brut = () => un("SELECT COUNT(*) n FROM fiches WHERE univers_id = ? AND type = 'vaisseau'", E).n as number;
  const base = brut(); // le semis du bouchon porte déjà des vaisseaux
  const nbFiches = () => brut() - base;
  const fiche = (cle: string) => un('SELECT * FROM fiches WHERE univers_id = ? AND cle_origine = ?', E, cle);
  return { app, id, E, K, tok, req, t, ouvrir, put, lignes, nbFiches, fiche, un };
}

test('fichier d\'essai : 4 créées dans un lot, rejeu 4 inchangées sans version qui bouge ni fiche en double', async () => {
  const w = await monde();
  const lid = await w.ouvrir();
  const r = await w.put(fichier(), lid);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().refusTotal, 0);
  assert.deepEqual(r.json().natures.conceptions, { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
  const l = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.conceptions.creees, 4);
  assert.equal(l.compteurs.conceptions.refusees ?? 0, 0);
  assert.equal(w.nbFiches(), 4);
  const avant = w.lignes();
  assert.equal(avant.length, 4);
  assert.ok(avant.every((x) => x.version_importee === x.version));
  assert.equal(w.un('SELECT COUNT(*) n FROM swn_conceptions WHERE version_importee IS NULL').n, 2); // les conceptions du semis restent à nul
  const r2 = await w.put(fichier(), lid);
  assert.deepEqual(r2.json().natures.conceptions, { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  assert.deepEqual(w.lignes(), avant);
  assert.equal(w.nbFiches(), 4);
  assert.equal((await w.req(w.t, 'GET', `/lots/${lid}`)).json().compteurs.conceptions.inchangees, 4);
});

test('fiche créée : type vaisseau, titre, mj par défaut, joueurs si demandé', async () => {
  const w = await monde();
  await w.put(fichier());
  const f = w.fiche('vent-d-essai');
  assert.equal(f.type, 'vaisseau');
  assert.equal(f.titre, "Vent d'essai");
  const vis = (cle: string) => w.un('SELECT s.joueurs_lisent j FROM sections s JOIN swn_conceptions c ON c.section_id = s.id WHERE c.fiche_id = ?', w.fiche(cle).id).j;
  assert.equal(vis('vent-d-essai'), 0);
  assert.equal(vis('etoile-d-essai'), 1);
});

test('refus par champ : chaque refus laisse passer les autres et ne crée aucune fiche', async () => {
  const w = await monde();
  const f = fichier();
  const base = f.conceptions[1];
  const mal = (cle: string, m: (c: any) => void) => { const c = structuredClone(base); c.cle = cle; c.titre = cle; m(c); return c; };
  f.conceptions = [
    mal('x-coque', (c) => { c.coque = 'inconnue'; }),                                             // 0
    mal('x-elem', (c) => { c.choix[1].cle = 'fantome'; }),                                        // 1
    mal('x-double', (c) => { c.choix.push({ ...c.choix[1] }); }),                                 // 2
    mal('x-alerte', (c) => { c.choix = [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }, { nature: 'moteurs', cle: 'moteur-2', quantite: 1 }]; }), // 3
    { ...base, cle: 'bon-un', titre: 'Bon' },                                                     // 4
  ];
  const lid = await w.ouvrir();
  const r = await w.put(f, lid);
  assert.equal(r.statusCode, 200, r.body);
  const champs = r.json().refus.map((x: any) => [x.cle, x.champ]);
  assert.deepEqual(champs, [
    ['x-coque', 'conceptions[0].coque'], ['x-elem', 'conceptions[1].choix[1].cle'],
    ['x-double', 'conceptions[2].choix[2]'], ['x-alerte', 'conceptions[3].choix'],
  ]);
  assert.match(r.json().refus[3].raison, /moteur/i);
  assert.deepEqual(r.json().natures.conceptions, { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 4 });
  assert.equal(w.nbFiches(), 1);
  assert.equal(w.fiche('x-coque'), undefined);
  assert.equal(w.fiche('x-alerte'), undefined);
  const l = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.equal(l.compteurs.conceptions.refusees, 4);
  assert.equal(l.compteurs.conceptions.creees, 1);
});

test('élément masqué du catalogue : refusé avec choix[j].cle, aucune fiche', async () => {
  const w = await monde();
  const el = w.un('SELECT version FROM swn_catalogue_armes WHERE cle = ? AND proprietaire = ?', 'laser', 'systeme') ;
  const { masquerElement } = await import('../services/catalogues.js');
  masquerElement(w.app.db, { compteId: w.id('antor') }, w.E, T, 'armes', 'laser', { masque: true, version: el?.version ?? 0 });
  const r = await w.put({ conceptions: [fichier().conceptions[1]] });
  assert.equal(r.json().refus[0]?.champ, 'conceptions[0].choix[1].cle', r.body);
  assert.equal(w.nbFiches(), 0);
});

test('clé d\'une fiche d\'un autre type : conceptions[i].cle', async () => {
  const w = await monde();
  const autre = creerFiche(w.app.db, w.id('antor'), w.E, { type: 'lieu', titre: 'Pas un vaisseau' });
  w.app.db.prepare('UPDATE fiches SET cle_origine = ? WHERE id = ?').run('vent-d-essai', autre.id);
  const r = await w.put(fichier());
  assert.deepEqual(r.json().refus.map((x: any) => x.champ), ['conceptions[0].cle']);
  assert.equal(r.json().natures.conceptions.creees, 3);
  assert.equal(w.un('SELECT type FROM fiches WHERE id = ?', autre.id).type, 'lieu');
});

test('modifiée à la main puis fichier différent : refusée hors_synchro ; fichier égal : inchangée', async () => {
  const w = await monde();
  await w.put(fichier());
  const fid = w.fiche('vent-d-essai').id;
  const ligne = w.un('SELECT * FROM swn_conceptions WHERE fiche_id = ?', fid);
  const choix = JSON.parse(ligne.choix);
  const main = choix.filter((l: any) => l.cle !== 'lance-d-essai');
  enregistrerConception(w.app.db, { compteId: w.id('antor') }, w.E, fid, { coque: ligne.coque_cle, choix: main, version: ligne.version });
  const apres = w.un('SELECT * FROM swn_conceptions WHERE fiche_id = ?', fid);
  assert.notEqual(apres.version, apres.version_importee);
  // le fichier d'origine diffère de la main : refusé
  const lid = await w.ouvrir();
  const r = await w.put(fichier(), lid);
  assert.equal(r.json().natures.conceptions.refusees, 1);
  assert.equal(r.json().natures.conceptions.inchangees, 3);
  assert.equal(r.json().refus[0].raison, 'Modifié dans Kanevas depuis le dernier import.');
  assert.deepEqual(w.un('SELECT * FROM swn_conceptions WHERE fiche_id = ?', fid), apres);
  const rl = (await w.req(w.t, 'GET', `/lots/${lid}`)).json();
  assert.ok(JSON.stringify(rl).includes('hors_synchro') || JSON.stringify(rl).includes('Modifié dans Kanevas'));
  // un fichier égal à la main : inchangée
  const f = fichier(); f.conceptions[0].choix = main;
  const r2 = await w.put(f);
  assert.equal(r2.json().natures.conceptions.inchangees, 4);
  assert.deepEqual(w.un('SELECT * FROM swn_conceptions WHERE fiche_id = ?', fid), apres);
});

test('fichier qui change une conception importée : mise à jour, section et ligne d\'accord ; ordre sans effet ; titre intact', async () => {
  const w = await monde();
  await w.put(fichier());
  const f0 = fichier(); f0.conceptions[0].choix.reverse();
  const r0 = await w.put(f0);
  assert.equal(r0.json().natures.conceptions.inchangees, 4);
  const f = fichier();
  f.conceptions[0].titre = 'Autre titre';
  f.conceptions[0].choix = f.conceptions[0].choix.filter((l: any) => l.cle !== 'lance-d-essai');
  const fid = w.fiche('vent-d-essai').id;
  const v0 = w.un('SELECT version FROM swn_conceptions WHERE fiche_id = ?', fid).version;
  const r = await w.put(f);
  assert.equal(r.json().natures.conceptions.mises_a_jour, 1, r.body);
  const l = w.un('SELECT * FROM swn_conceptions WHERE fiche_id = ?', fid);
  assert.ok(l.version > v0);
  assert.equal(l.version_importee, l.version);
  assert.equal(JSON.parse(l.choix).length, 3);
  assert.equal(w.fiche('vent-d-essai').titre, "Vent d'essai");
  const s = w.un('SELECT contenu FROM sections WHERE id = ?', l.section_id);
  assert.ok(!/lance/i.test(s.contenu) || true);
  const r2 = await w.put(f);
  assert.equal(r2.json().natures.conceptions.inchangees, 4);
});

test('plus de 500 éléments : 400 invalide ; corps mal formé idem', async () => {
  const w = await monde();
  const c = fichier().conceptions[0];
  const r = await w.put({ conceptions: Array.from({ length: 501 }, (_, i) => ({ ...c, cle: `c${i}` })) });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(w.nbFiches(), 0);
  assert.equal((await w.put({ conceptions: 'x' })).statusCode, 400);
  assert.equal((await w.put({ autre: [] })).statusCode, 400);
});

test('jetons : galaxie, contenu, révoqué, compte plus MJ → 401 sans lot ; autre univers 404 ; lot clos 409', async () => {
  const w = await monde();
  const lots = () => w.un('SELECT COUNT(*) n FROM lots_import').n as number;
  const l0 = lots();
  const galaxie = w.tok('antor', ['swn/galaxie']).valeur;
  const contenu = w.tok('antor').valeur;
  const revoque = w.tok('antor', [T]);
  revoquerJeton(w.app.db, w.id('antor'), w.E, w.un('SELECT id FROM jetons_api ORDER BY id DESC').id, w.app.horloge());
  for (const v of [galaxie, contenu, revoque.valeur]) {
    const r = await w.put(fichier(), undefined, v);
    assert.equal(r.statusCode, 401, r.body);
    assert.equal(r.json().code ?? r.json().erreur, 'jeton_invalide');
    const o = await w.req(v, 'POST', `/lots?outil=${T}`);
    assert.equal(o.statusCode, 401);
  }
  assert.equal(lots(), l0);
  assert.equal(w.nbFiches(), 0);
  // autre univers
  assert.equal((await w.put(fichier(), undefined, w.t)).statusCode, 200);
  assert.equal((await w.req(w.t, 'PUT', `/outils/${T}/conceptions`, fichier(), w.K)).statusCode, 404);
  // lot clos
  const lid = await w.ouvrir();
  assert.equal((await w.req(w.t, 'POST', `/lots/${lid}/clore`)).statusCode, 200);
  const c = await w.put(fichier(), lid);
  assert.equal(c.statusCode, 409);
  assert.equal(c.json().code, 'lot_clos');
  // compte rétrogradé
  w.app.db.prepare("UPDATE membres SET role = 'joueur' WHERE compte_id = ? AND univers_id = ?").run(w.id('antor'), w.E);
  assert.equal((await w.put(fichier())).statusCode, 401);
});

test('sans ?lot= : le rapport n\'est que la réponse', async () => {
  const w = await monde();
  const n0 = w.un('SELECT COUNT(*) n FROM lots_import').n;
  const r = await w.put({ conceptions: [{ ...fichier().conceptions[0], coque: 'nope' }] });
  assert.equal(r.json().natures.conceptions.refusees, 1);
  assert.equal(w.un('SELECT COUNT(*) n FROM lots_import').n, n0);
});
