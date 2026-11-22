import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-concepteur-vaisseaux-capacites-equipage-calcul: the four settings, the staleness and the assistant tool, by their doors.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');
const o = await import('../../services/outils.js');

type App = Awaited<ReturnType<typeof buildApp>>;
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const cid = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  const h = (u: string) => ({ cookie: `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: cid(u), groups: [] }))}` });
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const orak = one(app, 'SELECT id FROM fiches WHERE univers_id = ? AND titre = ?', E, "Vent d'Orak").id as number;
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: h('antor'), ...(payload ? { payload } : {}) });
  const version = () => o.lireLigneOutil(app.db, { niveau: 'univers', id: E }, 'swn/vaisseaux')?.version_reglages ?? 0;
  const regler = (valeurs: object) => req('PUT', `${B}/reglages`, { version: version(), valeurs });
  return { app, cid, E, B, orak, req, regler };
}

test('quatre réglages : hors bornes refusés avec leur message, bornes acceptées', async () => {
  const w = await monde();
  for (const valeurs of [{ diviseur_prix: '3' }, { cadence_chantier: 0 }, { cadence_chantier: 1000001 }, { solde_jour: -1 }, { solde_jour: 100001 },
    { vivres_jour: -1 }, { vivres_jour: 100001 }, { solde_jour: 2.5 }, { cadence_chantier: 2.5 }]) {
    const r = await w.regler(valeurs);
    assert.equal(r.statusCode, 400, JSON.stringify(valeurs) + r.body);
    assert.equal(r.json().code, 'invalide', r.body); assert.equal(r.json().champ, Object.keys(valeurs)[0]);
  }
  for (const valeurs of [{ diviseur_prix: '4' }, { cadence_chantier: 1000000 }, { cadence_chantier: 1 }, { solde_jour: 0 }, { vivres_jour: 100000 }]) {
    const r = await w.regler(valeurs);
    assert.equal(r.statusCode, 204, JSON.stringify(valeurs) + r.body);
  }
});

test('changer un réglage rend la conception périmée sans réécrire son résultat ; POST calcul rend le résultat neuf ; ancien résultat relu à null', async () => {
  const w = await monde();
  // a result stored before the slice: the new keys are simply absent
  const ancien = JSON.parse(one(w.app, 'SELECT resultat FROM swn_conceptions WHERE fiche_id = ?', w.orak).resultat);
  for (const k of ['capacites', 'effetsJeu', 'fraisEquipage', 'diviseurPrix']) delete ancien[k];
  w.app.db.prepare('UPDATE swn_conceptions SET resultat = ? WHERE fiche_id = ?').run(JSON.stringify(ancien), w.orak);
  const avant = one(w.app, 'SELECT * FROM swn_conceptions WHERE fiche_id = ?', w.orak);
  const v0 = (await w.req('GET', `${w.B}/conceptions/${w.orak}`)).json();
  assert.equal(v0.perime, false);
  assert.equal(v0.resultat.capacites, null); assert.equal(v0.resultat.fraisEquipage, null); assert.equal(v0.resultat.effetsJeu, null);
  const calc = { coque: 'fregate', choix: [] as object[] };
  const p1 = (await w.req('POST', `${w.B}/calcul`, calc)).json().resultat;
  assert.equal(p1.diviseurPrix, 1);
  assert.equal((await w.regler({ diviseur_prix: '2' })).statusCode, 204);
  const v1 = (await w.req('GET', `${w.B}/conceptions/${w.orak}`)).json();
  assert.equal(v1.perime, true);
  assert.equal(v1.resultat.prix, v0.resultat.prix);
  assert.equal(one(w.app, 'SELECT * FROM swn_conceptions WHERE fiche_id = ?', w.orak).resultat, avant.resultat);
  const p2 = (await w.req('POST', `${w.B}/calcul`, calc)).json().resultat;
  assert.equal(p2.diviseurPrix, 2);
  assert.equal(p2.prix, Math.ceil(p1.prix / 2));
  assert.equal(p2.entretien, Math.floor(p2.prix * 0.05 + 0.5));
  // the cadence reaches the build days
  assert.equal((await w.regler({ cadence_chantier: 1000000 })).statusCode, 204);
  assert.equal((await w.req('POST', `${w.B}/calcul`, calc)).json().resultat.chantierJours, 1);
});

test('solde et vivres réglés atteignent le coût d\'équipage ; pj/robots par POST calcul et par l\'outil d\'assistant, sans calcul propre', async () => {
  const w = await monde();
  assert.equal((await w.regler({ solde_jour: 10, vivres_jour: 1 })).statusCode, 204);
  const http = await w.req('POST', `${w.B}/calcul`, { coque: 'fregate', choix: [], equipage: 8, pj: 2 });
  assert.equal(http.statusCode, 200, http.body);
  assert.deepEqual(http.json().resultat.fraisEquipage, { jour: 10 * 6 + 1 * 8, robots: 0 });
  const outil = catalogueDe(w.app.db, w.cid('antor'), w.E).outils.find((t) => t.nom === 'swn_vaisseau_calculer')!;
  const a: any = await outil.executer({ coque: "Frégate d'essai", choix: [], equipage: 8, pj: 2 });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.deepEqual(a.donnees.resultat.fraisEquipage, { jour: 68, robots: 0 });
  assert.deepEqual(a.donnees.resultat, http.json().resultat);
  assert.ok('capacites' in a.donnees.resultat && 'effetsJeu' in a.donnees.resultat);
  const sans: any = await outil.executer({ coque: "Frégate d'essai", choix: [] });
  assert.equal(sans.donnees.resultat.fraisEquipage === null, sans.donnees.resultat.equipage === null);
  const double: any = await outil.executer({ conception: "Vent d'Orak", pj: 1 });
  assert.equal(double.ok, false);
});
