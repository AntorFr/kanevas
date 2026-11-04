// kanevas-scenarios-suivi-pivot: preparation tasks and session reports on adventure sheets (AD-124, AD-127).
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

/** Antor MJ of « Lame » (Léa and Teo players) and of « Autre »; Marc GM of « Ailleurs » only. */
async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const marc = await connecter(app, 'mira');
  const appel = (h: Hote, method: Verbe, url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
  const u = (await appel(antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(antor, 'POST', `${base}/membres`, { username: 'lea' });
  await appel(antor, 'POST', `${base}/membres`, { username: 'teo' });
  const ailleurs = (await appel(marc, 'POST', '/api/univers', { nom: 'Ailleurs' })).json();
  const baseAilleurs = `/api/univers/${ailleurs.id}`;
  const n = (t: string) => (app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;

  const creer = async (h: Hote, b: string, corps: object) => {
    const r = await appel(h, 'POST', `${b}/fiches`, corps);
    assert.equal(r.statusCode, 201, r.body);
    return r.json() as { id: number; titre: string };
  };
  /** An open campaign « En cours » (Présentation read by the players). */
  const campagneOuverte = async (titre = 'La Couronne brisée') => {
    const c = await creer(antor, base, { type: 'aventure', sousType: 'Campagne', titre, sections: [{ titre: 'Présentation', joueursLisent: true }] });
    assert.equal((await appel(antor, 'PATCH', `${base}/fiches/${c.id}`, { statut: 'en_cours' })).statusCode, 200);
    return c;
  };
  /** A scenario under a campaign, closed to the players. */
  const scenarioFerme = (parent: number, titre = 'Acte II') =>
    creer(antor, base, { type: 'aventure', sousType: 'Scénario', titre, parent, sections: [{ titre: 'Scénario', joueursLisent: false }] });
  return { app, antor, lea, teo, marc, base, baseAilleurs, appel, n, creer, campagneOuverte, scenarioFerme };
}

test('tâches : Antor ajoute, liste et coche sur la fiche de l\'aventure', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const url = `${w.base}/fiches/${c.id}/taches`;
  const t = await w.appel(w.antor, 'POST', url, { categorie: 'cartes', libelle: 'Plan de la crypte' });
  assert.equal(t.statusCode, 201, t.body);
  assert.equal(t.json().ficheId, c.id);
  assert.equal(t.json().faite, false);
  assert.deepEqual((await w.appel(w.antor, 'GET', url)).json().taches.map((x: { libelle: string }) => x.libelle), ['Plan de la crypte']);
  const fait = await w.appel(w.antor, 'PUT', `/api/taches/${t.json().id}`, { faite: true });
  assert.equal(fait.json().faite, true);
  assert.ok(fait.json().faiteLe);
  const defait = await w.appel(w.antor, 'PUT', `/api/taches/${t.json().id}`, { faite: false });
  assert.equal(defait.json().faiteLe, null);
  // a scenario (also an adventure sheet) carries tasks too
  const s = await w.scenarioFerme(c.id);
  assert.equal((await w.appel(w.antor, 'POST', `${w.base}/fiches/${s.id}/taches`, { categorie: 'pnj', libelle: 'Le roi' })).statusCode, 201);
  // bad input
  assert.equal((await w.appel(w.antor, 'POST', url, { categorie: 'zzz', libelle: 'x' })).statusCode, 400);
  assert.equal((await w.appel(w.antor, 'POST', url, { categorie: 'pnj', libelle: '' })).statusCode, 400);
  assert.equal((await w.appel(w.antor, 'POST', url, { categorie: 'pnj', libelle: 'x'.repeat(201) })).statusCode, 400);
  assert.equal((await w.appel(w.antor, 'PUT', `/api/taches/${t.json().id}`, { faite: 'oui' })).statusCode, 400);
  assert.equal(w.n('taches_preparation'), 2);
});

test('tâches : joueur, MJ d\'un autre univers, id inconnu, fiche non aventure, mauvais univers du chemin : le même 404', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const lieu = await w.creer(w.antor, w.base, { type: 'lieu', titre: 'Port-Sel' });
  const t = (await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'autre', libelle: 'Secret' })).json();
  const inconnu = await w.appel(w.marc, 'GET', `${w.baseAilleurs}/fiches/999999/taches`);
  assert.equal(inconnu.statusCode, 404);
  const essais = [
    await w.appel(w.lea, 'GET', `${w.base}/fiches/${c.id}/taches`),
    await w.appel(w.lea, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'autre', libelle: 'Piège' }),
    await w.appel(w.teo, 'GET', `${w.base}/fiches/${c.id}/taches`),
    await w.appel(w.marc, 'GET', `${w.base}/fiches/${c.id}/taches`),
    await w.appel(w.marc, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'autre', libelle: 'Piège' }),
    await w.appel(w.marc, 'GET', `${w.baseAilleurs}/fiches/${c.id}/taches`), // right GM, wrong path universe
    await w.appel(w.antor, 'GET', `${w.baseAilleurs}/fiches/${c.id}/taches`), // not a member of the path universe
    await w.appel(w.antor, 'GET', `${w.base}/fiches/${lieu.id}/taches`), // not an adventure
    await w.appel(w.antor, 'POST', `${w.base}/fiches/${lieu.id}/taches`, { categorie: 'autre', libelle: 'x' }),
    await w.appel(w.antor, 'GET', `${w.base}/fiches/999999/taches`),
    await w.appel(w.lea, 'PUT', `/api/taches/${t.id}`, { faite: true }),
    await w.appel(w.marc, 'PUT', `/api/taches/${t.id}`, { faite: true }),
  ];
  for (const r of essais) {
    assert.equal(r.statusCode, 404, r.body);
    assert.equal(r.body, inconnu.body, 'distinguable d\'un id inconnu');
  }
  assert.equal(w.n('taches_preparation'), 1);
  assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${c.id}/taches`)).json().taches[0].faite, false);
  // The old addresses are gone.
  assert.equal((await w.appel(w.antor, 'GET', `/api/campagnes/${c.id}/taches`)).statusCode, 404);
  assert.equal((await w.appel(w.antor, 'GET', `${w.base}/campagnes`)).statusCode, 404);
  assert.equal((await w.appel(w.antor, 'POST', `${w.base}/campagnes`, { nom: 'X' })).statusCode, 404);
  assert.equal((await w.appel(w.antor, 'GET', `/api/scenarios/1`)).statusCode, 404);
});

test('comptes-rendus : création refusée sur une aventure que l\'appelant ne lit pas, identique à un id inconnu', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const s = await w.scenarioFerme(c.id);
  const lieu = await w.creer(w.antor, w.base, { type: 'lieu', titre: 'Port-Sel' });
  const etrangere = await w.creer(w.marc, w.baseAilleurs, { type: 'aventure', titre: 'Ailleurs' });
  const cr = (h: Hote, id: unknown) => w.appel(h, 'POST', `${w.base}/comptes-rendus`, { campagneId: id, titre: 'Séance' });
  const ok = await cr(w.lea, c.id);
  assert.equal(ok.statusCode, 201, ok.body);
  const inconnu = await cr(w.lea, 999999);
  assert.equal(inconnu.statusCode, 404);
  for (const r of [await cr(w.lea, s.id), await cr(w.lea, lieu.id), await cr(w.lea, etrangere.id), await cr(w.antor, etrangere.id), await cr(w.antor, lieu.id)]) {
    assert.equal(r.statusCode, 404, r.body);
    assert.equal(r.body, inconnu.body);
  }
  assert.equal((await cr(w.antor, s.id)).statusCode, 201, 'le MJ lit tout scénario');
  assert.equal((await cr(w.lea, '1')).statusCode, 400);
  assert.equal(w.n("(SELECT 1 FROM fiches WHERE type = 'compte_rendu')"), 2, 'rien écrit par les refus');
  // Léa cannot name a closed adventure after the fact either: opening it makes it readable.
  await w.appel(w.antor, 'PATCH', `${w.base}/fiches/${s.id}/sections/${(w.app.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').get(s.id) as { id: number }).id}`, { joueursLisent: true });
  assert.equal((await cr(w.lea, s.id)).statusCode, 201);
});

test('comptes-rendus : le nom de l\'aventure n\'est donné qu\'à qui la lit (liste, fiche, filtre) ; fermée = supprimée pour un joueur', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const s = await w.scenarioFerme(c.id);
  const ouvert = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance ouverte' })).json();
  const ferme = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Séance fermée' })).json();
  const supprime = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance orpheline' })).json();
  const liste = async (h: Hote, q = '') => (await w.appel(h, 'GET', `${w.base}/comptes-rendus${q}`)).json().comptesRendus as Record<string, unknown>[];
  const par = (l: Record<string, unknown>[], t: string) => l.find((x) => x.titre === t)!;

  // MJ: names both, in the list and on the sheet.
  let l = await liste(w.antor);
  assert.equal(par(l, 'Séance ouverte').campagneNom, 'La Couronne brisée');
  assert.equal(par(l, 'Séance ouverte').campagneId, c.id);
  assert.equal(par(l, 'Séance fermée').campagneNom, 'Acte II');
  // Léa: the open one only.
  l = await liste(w.lea);
  assert.equal(par(l, 'Séance ouverte').campagneNom, 'La Couronne brisée');
  assert.deepEqual(Object.keys(par(l, 'Séance fermée')).sort(), Object.keys(par(l, 'Séance fermée')).sort());
  assert.ok(!('campagneNom' in par(l, 'Séance fermée')) && !('campagneId' in par(l, 'Séance fermée')) && !('campagneSupprimee' in par(l, 'Séance fermée')));
  assert.ok(!JSON.stringify(l).includes('Acte II'));
  // Delete the campaign: its reports stay, its scenario goes to the root (AD-119).
  const bilan = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${c.id}/suppression`)).json();
  assert.equal(bilan.scenarios, 1);
  assert.equal(bilan.comptesRendus, 2, 'les CR nommant la campagne');
  // Delete the scenario rather: Léa cannot tell closed from deleted.
  const avantLea = JSON.stringify(await liste(w.lea));
  assert.equal((await w.appel(w.antor, 'DELETE', `${w.base}/fiches/${s.id}`)).statusCode, 204);
  assert.equal(JSON.stringify(await liste(w.lea)), avantLea, 'fermé et supprimé : même silence pour Léa');
  l = await liste(w.antor);
  assert.equal(par(l, 'Séance fermée').campagneSupprimee, true);
  assert.ok(!('campagneNom' in par(l, 'Séance fermée')));
  // a GM in player mode reads as a player
  const modeJoueur = (await w.appel(w.antor, 'GET', `${w.base}/comptes-rendus?mode=joueur`)).json().comptesRendus as Record<string, unknown>[];
  assert.ok(!('campagneSupprimee' in par(modeJoueur, 'Séance fermée')));
  assert.equal(par(modeJoueur, 'Séance ouverte').campagneNom, 'La Couronne brisée');

  // The sheet of the report: same rule, and charge.campagne_id never leaves for a hidden adventure.
  const fiche = async (h: Hote, id: number) => (await w.appel(h, 'GET', `${w.base}/fiches/${id}`)).json();
  const fLea = await fiche(w.lea, ferme.id);
  const fAntor = await fiche(w.antor, ferme.id);
  assert.equal(fAntor.campagneSupprimee, true);
  assert.ok(!('campagneSupprimee' in fLea) && !('campagneNom' in fLea) && !('campagneId' in fLea));
  assert.ok(!JSON.stringify(fLea).includes('Acte II'));
  assert.ok(!('campagne_id' in (fLea.charge ?? {})), 'charge.campagne_id absent pour qui ne lit pas l\'aventure');
  const fOuvert = await fiche(w.lea, ouvert.id);
  assert.equal(fOuvert.campagneNom, 'La Couronne brisée');
  void supprime;

  // Filter: an adventure the caller does not read answers 404, identical to an unknown id (E-13).
  const s2 = await w.scenarioFerme(c.id, 'Acte III');
  await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s2.id, titre: 'Séance III' });
  const parFerme = await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=${s2.id}`);
  const parInconnu = await w.appel(w.lea, 'GET', `${w.base}/comptes-rendus?campagne=999999`);
  assert.equal(parFerme.statusCode, 404);
  assert.equal(parInconnu.statusCode, 404);
  assert.equal(parFerme.body, parInconnu.body);
  assert.ok(!parFerme.body.includes('Acte III'));
  // the GM: unknown id, deleted, other universe's sheet, non-adventure, and player mode on a closed one
  const perso = (await w.appel(w.antor, 'POST', `${w.base}/fiches`, { titre: 'Un PNJ', type: 'personnage' })).json();
  const jetable = await w.scenarioFerme(c.id, 'Acte jetable');
  assert.equal((await w.appel(w.antor, 'DELETE', `${w.base}/fiches/${jetable.id}`)).statusCode, 204);
  for (const id of [999999, jetable.id, perso.id]) {
    assert.equal((await w.appel(w.antor, 'GET', `${w.base}/comptes-rendus?campagne=${id}`)).statusCode, 404, `MJ campagne=${id}`);
  }
  assert.equal((await w.appel(w.antor, 'GET', `${w.base}/comptes-rendus?campagne=${s2.id}&mode=joueur`)).statusCode, 404);
  assert.equal((await liste(w.antor, `?campagne=${s2.id}`)).length, 1);
  assert.equal((await liste(w.lea, `?campagne=${c.id}`)).length, 2);
  assert.ok(!JSON.stringify(await liste(w.teo)).includes('Acte III'));
});

test('comptes-rendus : un titre d\'aventure fermée ne sort par aucune voie de lecture du CR (recherche, relations)', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const s = await w.scenarioFerme(c.id, 'Titre Introuvable Zorglub');
  const cr = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Séance X' })).json();
  for (const url of [`${w.base}/fiches?recherche=Zorglub`, `${w.base}/fiches/${cr.id}`, `${w.base}/comptes-rendus`, `${w.base}/fiches?recherche=Séance`]) {
    const r = await w.appel(w.lea, 'GET', url);
    assert.ok(!r.body.includes('Zorglub'), `${url}: ${r.body}`);
  }
});

test('suppression : le bilan d\'une aventure compte tâches, scénarios, CR ; supprimer emporte les tâches et laisse les CR', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  await w.scenarioFerme(c.id);
  await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'pnj', libelle: 'A' });
  await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'pnj', libelle: 'B' });
  const cr = (await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 1' })).json();
  const bilan = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${c.id}/suppression`)).json();
  assert.equal(bilan.taches, 2);
  assert.equal(bilan.scenarios, 1);
  assert.equal(bilan.comptesRendus, 1);
  assert.notEqual((await w.appel(w.lea, 'GET', `${w.base}/fiches/${c.id}/suppression`)).statusCode, 200);
  assert.equal((await w.appel(w.antor, 'DELETE', `${w.base}/fiches/${c.id}`)).statusCode, 204);
  assert.equal(w.n('taches_preparation'), 0);
  const scen = w.app.db.prepare("SELECT parent_id FROM fiches WHERE titre = 'Acte II'").get() as { parent_id: number | null };
  assert.equal(scen.parent_id, null, 'le scénario remonte à la racine');
  assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${cr.id}`)).statusCode, 200, 'le CR reste');
  assert.equal((await w.appel(w.antor, 'GET', `${w.base}/fiches/${cr.id}`)).json().campagneSupprimee, true);
  // a lieu has no such counters
  const lieu = await w.creer(w.antor, w.base, { type: 'lieu', titre: 'Port' });
  const b2 = (await w.appel(w.antor, 'GET', `${w.base}/fiches/${lieu.id}/suppression`)).json();
  assert.ok(!('taches' in b2) || b2.taches === undefined);
});

test('suppression d\'univers : emporte aventures, tâches et CR sans trace', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  await w.appel(w.antor, 'POST', `${w.base}/fiches/${c.id}/taches`, { categorie: 'pnj', libelle: 'A' });
  await w.appel(w.lea, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 1' });
  const id = Number(w.base.split('/').pop());
  const r = await w.appel(w.antor, 'DELETE', `/api/univers/${id}`, { nom: 'Lame' });
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(w.n('taches_preparation'), 0);
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id = ?').get(id) as { n: number }).n, 0);
  assert.deepEqual(w.app.db.pragma('foreign_key_check'), []);
});

test('import : les routes des campagnes et scénarios répondent 404, un lot ne compte plus « campagnes » ni « scénarios »', async () => {
  const w = await monter();
  // Mint a token through the API as the GM and use it.
  const jeton = await w.appel(w.antor, 'POST', `${w.base}/jetons`, { nom: 'essai', dureeJours: 30 });
  if (jeton.statusCode !== 201) return assert.fail(`pas de jeton: ${jeton.statusCode} ${jeton.body}`);
  const secret = jeton.json().jeton as string;
  const id = w.base.split('/').pop();
  const imp = (method: 'PUT' | 'GET' | 'POST', url: string, payload?: object) =>
    w.app.inject({ method, url: `/api/import/v1/univers/${id}${url}`, headers: { authorization: `Bearer ${secret}` }, payload });
  assert.equal((await imp('PUT', '/campagnes/x', { nom: 'X' })).statusCode, 404);
  assert.equal((await imp('PUT', '/campagnes/x/scenarios/y', { titre: 'Y' })).statusCode, 404);
  assert.equal((await imp('PUT', '/scenarios/y', { titre: 'Y' })).statusCode, 404);
  const lot = await imp('POST', '/lots', {});
  if (lot.statusCode === 201 || lot.statusCode === 200) {
    const corps = JSON.stringify(lot.json());
    assert.ok(!/campagnes|scenarios|scénarios/.test(corps), corps);
  }
  const limites = await imp('GET', '/');
  assert.ok(!/nomCampagne|titreScenario|contenuScenario/.test(limites.body), limites.body);
});

test('assistant : le catalogue n\'a plus creer_campagne, creer_scenario ni lister_campagnes', async () => {
  const w = await monter();
  const { catalogueDe } = await import('../services/assistant/catalogue.js');
  const mj = (w.app.db.prepare("SELECT compte_id c FROM membres WHERE role = 'mj' LIMIT 1").get() as { c: number }).c;
  const u = (w.app.db.prepare('SELECT univers_id u FROM membres WHERE compte_id = ? LIMIT 1').get(mj) as { u: number }).u;
  const noms = catalogueDe(w.app.db, mj, u).outils.map((t) => t.nom);
  assert.ok(noms.length > 0);
  for (const n of ['creer_campagne', 'creer_scenario', 'lister_campagnes']) assert.ok(!noms.includes(n), n);
});

test('fuite : charge.campagne_id d\'un CR ne sort pas, par liste ni recherche, vers qui ne lit pas l\'aventure (fermée ou supprimée, même silence)', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const s = await w.scenarioFerme(c.id, 'Titre Fermé Quux');
  const ouvert = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: c.id, titre: 'Séance Ouverte', texte: 't' })).json();
  const ferme = (await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Séance Fermée', texte: 't' })).json();
  const charge = async (h: Hote, url: string, titre: string) => {
    const r = await w.appel(h, 'GET', url);
    assert.equal(r.statusCode, 200, r.body);
    const f = (r.json().fiches as { titre: string; charge: Record<string, unknown> }[]).find((x) => x.titre === titre);
    assert.ok(f, `${titre} absent de ${url}`);
    return f.charge;
  };
  for (const url of [`${w.base}/fiches?type=compte_rendu`, `${w.base}/fiches?recherche=${encodeURIComponent('Séance')}`]) {
    // a reader of the adventure may carry its id ; the others get none
    assert.equal((await charge(w.lea, url, 'Séance Ouverte')).campagne_id, c.id, url);
    assert.ok(!('campagne_id' in (await charge(w.lea, url, 'Séance Fermée'))), `${url} : l'id d'une aventure fermée sort par charge`);
    assert.equal((await charge(w.antor, url, 'Séance Fermée')).campagne_id, s.id, url);
  }
  // deleted: still silent for the player
  assert.equal((await w.appel(w.antor, 'DELETE', `${w.base}/fiches/${s.id}`)).statusCode, 204);
  const l = await charge(w.lea, `${w.base}/fiches?type=compte_rendu`, 'Séance Fermée');
  assert.ok(!('campagne_id' in l));
  void ouvert; void ferme;
});

test('fuite : un MJ en mode Joueur ne reçoit pas charge.campagne_id d\'un CR sur aventure fermée ; le MJ hors mode le garde ; l\'arbre non plus ne la porte pas pour Léa', async () => {
  const w = await monter();
  const c = await w.campagneOuverte();
  const s = await w.scenarioFerme(c.id, 'Titre Fermé Quux');
  assert.equal((await w.appel(w.antor, 'POST', `${w.base}/comptes-rendus`, { campagneId: s.id, titre: 'Séance Fermée', texte: 't' })).statusCode, 201);
  const charge = async (h: Hote, url: string) => {
    const r = await w.appel(h, 'GET', url);
    assert.equal(r.statusCode, 200, r.body);
    const f = (r.json().fiches as { titre: string; charge: Record<string, unknown> }[]).find((x) => x.titre === 'Séance Fermée');
    assert.ok(f, url);
    return f.charge;
  };
  for (const q of ['type=compte_rendu', 'recherche=S%C3%A9ance']) {
    assert.equal((await charge(w.antor, `${w.base}/fiches?${q}`)).campagne_id, s.id, q);
    assert.ok(!('campagne_id' in (await charge(w.antor, `${w.base}/fiches?${q}&mode=joueur`))), `${q} mode joueur`);
  }
  const arbre = await w.appel(w.lea, 'GET', `${w.base}/fiches?parent=racine`);
  assert.doesNotMatch(arbre.body, /campagne_id/);
});
