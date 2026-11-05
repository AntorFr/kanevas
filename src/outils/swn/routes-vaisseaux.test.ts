import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-vaisseaux-api : routes V-8 et outil d'assistant V-9, attendus écrits en dur (V-11).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');
const cat = await import('../../services/catalogues.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const cid = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  const h = (u: string): H => ({ cookie: `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: cid(u), groups: [] }))}` });
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const fiche = (t: string) => one(app, 'SELECT id FROM fiches WHERE univers_id = ? AND titre = ?', E, t).id as number;
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const req = (u: string | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url: B + url, headers: u ? h(u) : {}, ...(payload ? { payload } : {}) });
  const versions = () => app.db.prepare('SELECT fiche_id, version FROM swn_conceptions ORDER BY fiche_id').all();
  return { app, cid, h, E, S, B, req, versions, orak: fiche("Vent d'Orak"), etoile: fiche('Étoile du soir'), aube: fiche('Aube de Sel') };
}
const FREGATE = { coque: 'fregate', choix: [
  { nature: 'moteurs', cle: 'moteur-2', quantite: 1 }, { nature: 'amenagements', cle: 'cabines', quantite: 1 },
  { nature: 'amenagements', cle: 'soute', quantite: 1 }, { nature: 'armes', cle: 'laser', quantite: 2 }] };

test('listes : Léa 2, Roxane 1, Antor 2 avec peutCreer et Aube de Sel', async () => {
  const w = await monde();
  const titres = (r: any) => r.json().conceptions.map((c: any) => c.titre).sort();
  const lea = await w.req('lea', 'GET', '/conceptions');
  assert.equal(lea.statusCode, 200);
  assert.deepEqual(titres(lea), ["Vent d'Orak", 'Étoile du soir']);
  assert.equal(lea.json().peutCreer, false);
  assert.equal(lea.json().fichesSansConception, undefined);
  assert.deepEqual(titres(await w.req('roxane', 'GET', '/conceptions')), ['Étoile du soir']);
  const antor = (await w.req('antor', 'GET', '/conceptions')).json();
  assert.equal(antor.conceptions.length, 2);
  assert.equal(antor.peutCreer, true);
  assert.deepEqual(antor.fichesSansConception.map((f: any) => f.titre), ['Aube de Sel']);
});

test('lecture : 404 octet pour octet identique à un chemin non enregistré', async () => {
  const w = await monde();
  const ref = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/outils/swn/vaisseaux/nexiste`, headers: w.h('lea') });
  assert.equal(ref.statusCode, 404);
  const pareil = (r: any, q: string) => {
    assert.equal(r.statusCode, 404, q);
    assert.equal(r.body, ref.body, q);
    assert.equal(r.headers['content-type'], ref.headers['content-type'], q);
  };
  pareil(await w.req('roxane', 'GET', `/conceptions/${w.orak}`), 'Roxane / Orak caché');
  pareil(await w.req('teo', 'GET', `/conceptions/${w.orak}`), 'Teo non membre');
  pareil(await w.req('teo', 'GET', '/conceptions'), 'Teo liste');
  pareil(await w.req('lea', 'GET', '/conceptions/999999'), 'inconnu');
  pareil(await w.req('lea', 'GET', '/conceptions/abc'), 'non numérique');
  pareil(await w.req('roxane', 'POST', '/calcul', { ...FREGATE, ficheId: w.orak }), 'calcul sur fiche cachée');
  pareil(await w.req('roxane', 'PUT', `/conceptions/${w.orak}`, { ...FREGATE, version: 1 }), 'PUT caché');
  assert.equal((await w.req('lea', 'GET', `/conceptions/${w.orak}`)).statusCode, 200);
  const ok = (await w.req('roxane', 'GET', `/conceptions/${w.etoile}`)).json();
  assert.equal(ok.peutEcrire, false);
  assert.equal(ok.resultat.prix, 50000);
  // Outil désactivé pour le système : même 404, pour tous les rôles.
  assert.equal((await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/vaisseaux/activation`,
    headers: w.h('antor'), payload: { active: false } })).statusCode, 204);
  for (const u of ['antor', 'lea']) {
    pareil(await w.req(u, 'GET', '/conceptions'), `désactivé liste ${u}`);
    pareil(await w.req(u, 'GET', `/conceptions/${w.orak}`), `désactivé ${u}`);
    pareil(await w.req(u, 'POST', '/calcul', FREGATE), `désactivé calcul ${u}`);
  }
});

test('calcul : fregate-de-ligne 700 000 cr / 28 jours, rien écrit, entrées fausses', async () => {
  const w = await monde();
  const avant = w.versions();
  const r = await w.req('lea', 'POST', '/calcul', FREGATE);
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().resultat.prix, 700000);
  assert.equal(r.json().resultat.chantierJours, 28);
  assert.deepEqual(r.json().alertes, []);
  // Calcul avec alerte bloquante : rendu en 200, pas une erreur, rien écrit.
  const bloque = await w.req('lea', 'POST', '/calcul', { coque: 'fregate', choix: [
    { nature: 'moteurs', cle: 'moteur-2', quantite: 1 }, { nature: 'amenagements', cle: 'cabines', quantite: 3 }, { nature: 'armes', cle: 'laser', quantite: 3 }] });
  assert.equal(bloque.statusCode, 200);
  assert.deepEqual(bloque.json().alertes.map((a: any) => a.code), ['puissance_insuffisante', 'masse_insuffisante']);
  assert.equal((await w.req('lea', 'POST', '/calcul', { coque: 'inconnue', choix: [] })).statusCode, 200);
  for (const corps of [{ coque: 'fregate', choix: 'x' }, { coque: 'fregate', choix: [{ nature: 'moteurs', cle: 'moteur-2', quantite: 0 }] }, { ficheId: 'x', ...FREGATE }]) {
    const e = await w.req('lea', 'POST', '/calcul', corps);
    assert.ok([400, 422].includes(e.statusCode), JSON.stringify(corps) + e.statusCode);
  }
  assert.equal((await w.req('teo', 'POST', '/calcul', FREGATE)).statusCode, 404);
  assert.deepEqual(w.versions(), avant);
});

test('PUT : 422 conception_bloquee avec alertes, 409 périmée, 403 Roxane, 200 sinon', async () => {
  const w = await monde();
  const lue = (await w.req('lea', 'GET', `/conceptions/${w.orak}`)).json();
  const avant = w.versions();
  const lourd = { coque: 'fregate', choix: [...FREGATE.choix.slice(0, 3), { nature: 'armes', cle: 'laser', quantite: 2 },
    { nature: 'armes', cle: 'lance-d-essai', quantite: 2 }], version: lue.version };
  const b = await w.req('lea', 'PUT', `/conceptions/${w.orak}`, lourd);
  assert.equal(b.statusCode, 422);
  assert.equal(b.json().code, 'conception_bloquee');
  assert.ok(b.json().alertes.some((a: any) => /Puissance insuffisante/.test(a.texte)));
  assert.deepEqual(w.versions(), avant);
  const ok = await w.req('lea', 'PUT', `/conceptions/${w.orak}`, { coque: 'fregate', choix: FREGATE.choix.slice(0, 3).concat([{ nature: 'armes', cle: 'laser', quantite: 1 }]), version: lue.version });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().version, lue.version + 1);
  const perime = await w.req('lea', 'PUT', `/conceptions/${w.orak}`, { ...FREGATE, version: lue.version });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'donnee_modifiee');
  const rox = await w.req('roxane', 'PUT', `/conceptions/${w.etoile}`, { coque: 'eclaireur', choix: [], version: 2 });
  assert.equal(rox.statusCode, 403);
  // Corps absent ou version non numérique : refus d'entrée, pas un 500.
  const sans = await w.app.inject({ method: 'PUT', url: `${w.B}/conceptions/${w.orak}`, headers: w.h('lea') });
  assert.ok(sans.statusCode >= 400 && sans.statusCode < 500, String(sans.statusCode));
  const nonNum = await w.req('lea', 'PUT', `/conceptions/${w.orak}`, { ...FREGATE, version: 'x' });
  assert.ok(nonNum.statusCode >= 400 && nonNum.statusCode < 500, String(nonNum.statusCode));
});

test('POST conceptions : 201 pour Antor sur Aube de Sel, 403 Léa, doublon refusé', async () => {
  const w = await monde();
  const lea = await w.req('lea', 'POST', '/conceptions', { ficheId: w.aube, coque: 'eclaireur' });
  assert.equal(lea.statusCode, 403);
  assert.deepEqual(Object.keys(lea.json()).sort(), ['message']);
  assert.equal(w.versions().length, 2);
  const a = await w.req('antor', 'POST', '/conceptions', { ficheId: w.aube, coque: 'eclaireur' });
  assert.equal(a.statusCode, 201);
  assert.equal(w.versions().length, 3);
  const bis = await w.req('antor', 'POST', '/conceptions', { ficheId: w.aube, coque: 'eclaireur' });
  assert.ok(bis.statusCode >= 400 && bis.statusCode < 500, String(bis.statusCode));
  assert.equal(w.versions().length, 3);
  assert.ok([400, 404, 422].includes((await w.req('antor', 'POST', '/conceptions', {})).statusCode));
  assert.equal((await w.req('teo', 'POST', '/conceptions', { ficheId: w.aube, coque: 'eclaireur' })).statusCode, 404);
});

test("outil d'assistant : mêmes chiffres que le HTTP, Introuvable pour Roxane, exclusivité, doublon, catalogue", async () => {
  const w = await monde();
  const outil = (u: string) => catalogueDe(w.app.db, w.cid(u), w.E).outils.find((t) => t.nom === 'swn_vaisseau_calculer')!;
  const choix = [{ nature: 'moteurs', nom: 'Moteur 2' }, { nature: 'amenagements', nom: 'Cabines' },
    { nature: 'amenagements', nom: 'Soute' }, { nature: 'armes', nom: 'Laser', quantite: 2 }];
  const a = outil('antor');
  assert.ok(a);
  const calc: any = await a.executer({ coque: "Frégate d'essai", choix });
  assert.equal(calc.ok, true);
  assert.equal(calc.donnees.resultat.prix, 700000);
  assert.equal(calc.donnees.resultat.chantierJours, 28);
  assert.deepEqual(calc.donnees, (await w.req('antor', 'POST', '/calcul', FREGATE)).json());
  assert.equal(calc.evenement, undefined);
  const orak: any = await a.executer({ conception: "Vent d'Orak" });
  assert.equal(orak.ok, true);
  assert.deepEqual(orak.donnees, (await w.req('antor', 'GET', `/conceptions/${w.orak}`)).json());
  assert.deepEqual(await outil('roxane').executer({ conception: "Vent d'Orak" }), { ok: false, erreur: 'Introuvable.' });
  assert.equal(((await outil('roxane').executer({ conception: 'Étoile du soir' })) as any).ok, true);
  const exclus = { ok: false, erreur: 'Précisez une conception, ou une coque et des choix.' };
  assert.deepEqual(await a.executer({ conception: "Vent d'Orak", coque: "Frégate d'essai" }), exclus);
  assert.deepEqual(await a.executer({}), exclus);
  assert.deepEqual(await a.executer({ conception: "Vent d'Orak", choix: [] }), exclus);
  assert.deepEqual(await a.executer({ coque: 'Zzz' }), { ok: false, erreur: 'Introuvable.' });
  assert.deepEqual(await a.executer({ coque: "Frégate d'essai", choix: [{ nature: 'armes', nom: 'Zzz' }] }), { ok: false, erreur: 'Introuvable.' });
  // Nom présent deux fois (deux clés) : message fixe.
  const rap = cat.appliquerCatalogue(w.app.db, { compteId: w.cid('antor') }, { niveau: 'univers', id: w.E }, 'swn/vaisseaux', {
    catalogue: 'swn/vaisseaux', version: 'dbl', armes: [{ cle: 'laser-bis', nom: 'Laser', emport: 1, munitions: 0, cout_munition: 0, cout: 1,
      puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }] });
  assert.equal(rap.refusTotal, 0, JSON.stringify(rap));
  assert.deepEqual(await a.executer({ coque: "Frégate d'essai", choix: [{ nature: 'armes', nom: 'Laser' }] }),
    { ok: false, erreur: 'Plusieurs éléments portent ce nom.' });
  // Élément masqué : pour Léa il disparaît, sans trace dans la réponse.
  const lea = outil('lea');
  const ligne = (cat.lireCatalogueGestion(w.app.db, { compteId: w.cid('antor') }, w.E, 'swn/vaisseaux', { nature: 'armes' }) as any).elements
    .find((x: any) => x.cle === 'laser-bis');
  cat.masquerElement(w.app.db, { compteId: w.cid('antor') }, w.E, 'swn/vaisseaux', 'armes', 'laser-bis', { masque: true, version: ligne.version });
  const l: any = await lea.executer({ coque: "Frégate d'essai", choix: [{ nature: 'armes', nom: 'Laser' }] });
  assert.equal(l.ok, true);
  assert.deepEqual(await lea.executer({ coque: "Frégate d'essai", choix: [{ nature: 'armes', nom: 'Laser bis' }] }), { ok: false, erreur: 'Introuvable.' });
  // Absent du catalogue sans accès à l'outil.
  assert.equal(catalogueDe(w.app.db, w.cid('antor'), w.E).outils.some((t) => t.nom === 'swn_vaisseau_calculer'), true);
  w.app.db.prepare('SELECT 1').get();
  await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/vaisseaux/activation`, headers: w.h('antor'), payload: { active: false } });
  for (const u of ['antor', 'lea'])
    assert.equal(catalogueDe(w.app.db, w.cid(u), w.E).outils.some((t) => t.nom === 'swn_vaisseau_calculer'), false, u);
});
