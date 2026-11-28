import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-regles-livre-calcul (W-2, W-3, W-4, W-6): the invented catalogue of W-4 is written by the test,
// imported through the route, computed by POST calcul. Expected values hard-coded from W-4, never recomputed.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { texteVaisseau } = await import('./regles/texte-vaisseau.js');

const T = 'swn/vaisseaux';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5 };
const arme = (cle: string, puissance: number, masse: number) => ({ cle, nom: cle, emport: 1, munitions: 0, cout_munition: 0, ...el, puissance, masse });
const VISE = (cle: string) => ({ nature: 'armes', cle });
function catalogue(): any {
  return {
    catalogue: T, version: 'v1',
    coques: [
      { cle: 'fregate-r', nom: 'Frégate R', ...coque },
      { cle: 'c3', nom: 'C3', ...coque, classe: 3 },
      { cle: 'c4', nom: 'C4', ...coque, classe: 4 },
    ],
    moteurs: [],
    amenagements: [
      { cle: 'soute-z', nom: 'soute-z', ...el, masse: 8, soute: 10 },
      { cle: 'amen-75', nom: 'amen-75', ...el, masse: 7.5, soute: 10 },
      { cle: 'amen-3', nom: 'amen-3', ...el, masse: 3 },
      { cle: 'amen-22', nom: 'amen-22', ...el, masse: 22 },
      { cle: 'amen-19-5', nom: 'amen-19-5', ...el, masse: 19.5 },
    ],
    defenses: [],
    armes: [arme('laser-z', 10, 1), arme('canon-z', 7, 3), arme('canon-p', 6, 4), arme('laser-u', 1, 1), arme('canon-m', 4, 2.5), arme('canon-q', 3, 1)],
    modifications: [
      { cle: 'optimise-l', nom: 'optimise-l', ...el, effet: 'soutes_optimisees_livre', limite: 1 },
      { cle: 'optimise-2', nom: 'optimise-2', ...el, effet: 'soutes_optimisees_livre', limite: 1 },
      { cle: 'blindage-l', nom: 'blindage-l', ...el, effet: 'blindage_renforce', limite: 1, valeur: 2 },
      { cle: 'blindage-0', nom: 'blindage-0', ...el, effet: 'blindage_renforce', limite: 1, valeur: 0 },
      { cle: 'montage-l', nom: 'montage-l', ...el, effet: 'montages_specialises', limite: 1, vise: VISE('laser-z') },
      { cle: 'surcharge-l', nom: 'surcharge-l', ...el, effet: 'surcharge_cumulable', limite: 3, effet_pct: 50, vise: VISE('laser-z') },
      { cle: 'reacteur-i', nom: 'reacteur-i', ...el, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation', limite: 3 },
      { cle: 'simple', nom: 'simple', ...el },
    ],
    exemples: [],
  };
}

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const one = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const cid = one('SELECT id FROM comptes WHERE username = ?', 'antor').id as number;
  const cookie = `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: cid, groups: [] }))}`;
  const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const imp = await app.inject({ method: 'POST', url: `/api/univers/${E}/outils/${T}/catalogue/application`, headers: { cookie }, payload: catalogue() });
  assert.equal(imp.statusCode, 200, imp.body);
  assert.deepEqual(imp.json().refus, []);
  const brut = (corps: object) => app.inject({ method: 'POST', url: `${B}/calcul`, headers: { cookie }, payload: corps as any });
  const ok = async (corps: object) => { const r = await brut(corps); assert.equal(r.statusCode, 200, r.body); return r.json().resultat; };
  return { app, E, cid, ok };
}
const L = (nature: string, cle: string, quantite = 1, extra: object = {}) => ({ nature, cle, quantite, ...extra });
const M = (cle: string, quantite = 1, extra: object = {}) => L('modifications', cle, quantite, extra);
const A = (cle: string, quantite = 1) => L('armes', cle, quantite);
const AM = (cle: string, quantite = 1) => L('amenagements', cle, quantite);
const sur = (cle: string, q = 1) => M('montage-l', q, { cibles: [{ nature: 'armes', cle, quantite: q }] });
const cod = (r: any) => r.alertes.map((a: any) => a.code);
const ajuste = (r: any, i: number) => r.lignes[i].ajuste;

test('W-4 soutes optimisées : masse libre finale, ajuste, soute doublée', async () => {
  const w = await monde();
  const c = (choix: object[]) => w.ok({ coque: 'fregate-r', choix });
  let r = await c([M('optimise-l')]);
  assert.equal(r.masseLibre, 18); assert.deepEqual(ajuste(r, 0), { masse: -2 }); assert.equal(r.soutes, null);
  r = await c([AM('soute-z'), M('optimise-l')]);
  assert.equal(r.masseLibre, 11); assert.equal(r.soutes, 20); assert.deepEqual(ajuste(r, 1), { masse: -1 });
  r = await c([AM('amen-75'), M('optimise-l')]);
  assert.equal(r.masseLibre, 11.5);
  r = await c([AM('amen-3'), M('optimise-l')]);
  assert.equal(r.masseLibre, 15.5);
  r = await c([AM('amen-19-5'), M('optimise-l')]);
  assert.equal(r.masseLibre, 0.5); assert.equal(ajuste(r, 1)?.masse ?? 0, 0);
  r = await c([AM('amen-22'), M('optimise-l')]);
  assert.equal(r.masseLibre, -2); assert.equal(ajuste(r, 1), undefined); assert.ok(cod(r).includes('masse_insuffisante'));
  r = await c([M('reacteur-i', 1, { points: 4 }), M('optimise-l')]);
  assert.equal(r.masseLibre, 20);
  r = await c([M('optimise-l'), M('optimise-2')]);
  assert.equal(r.masseLibre, 18);
  r = await c([AM('soute-z'), M('optimise-l'), M('optimise-2')]);
  assert.equal(r.masseLibre, 11); assert.equal(r.soutes, 20);
  // the laser's mass is 1 and the mounting leaves it at 1 (half of 1 is under the floor of 1): 19 before the optimised holds (last step), 19 -> 17,5
  r = await c([A('laser-z'), sur('laser-z'), M('optimise-l')]);
  assert.equal(r.masseLibre, 17.5);
});

test('W-4 blindage renforcé : valeur + Réparation, une fois, toute classe', async () => {
  const w = await monde();
  const c = (coq: string, choix: object[], reparation?: number) => w.ok({ coque: coq, choix, ...(reparation === undefined ? {} : { reparation }) });
  let r = await c('fregate-r', [M('blindage-l')]);
  assert.equal(r.armure, 7); assert.deepEqual(ajuste(r, 0), { armure: 2 });
  assert.equal((await c('fregate-r', [M('blindage-l')], 3)).armure, 10);
  assert.equal((await c('fregate-r', [M('blindage-0')], 4)).armure, 9);
  assert.equal((await c('fregate-r', [M('blindage-l')], 20)).armure, 27);
  assert.equal((await c('c3', [M('blindage-l')])).armure, 7);
  assert.equal((await c('c4', [M('blindage-l')], 3)).armure, 10);
  assert.equal((await c('fregate-r', [])).armure, 5);
  r = await c('fregate-r', [M('blindage-l'), M('blindage-0')], 3);
  assert.equal(r.armure, 10, 'applied once');
});

test('W-4 montages spécialisés', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'fregate-r', choix: [A('laser-z'), sur('laser-z')] });
  // laser 10 / 1: the halving brings the need to 5 and (floor of 1) 1: the use drops by 5 power and 0 mass (H-8 (1), W-3 rounded down)
  assert.deepEqual(ajuste(r, 1), { masse: 0, puissance: -5 });
  assert.equal(r.puissanceLibre, 15); assert.equal(r.masseLibre, 19);
  // one mounting halves ONE unit of its target: the line's quantity is not a factor
  const deux = await w.ok({ coque: 'fregate-r', choix: [A('laser-z', 2), sur('laser-z')] });
  assert.deepEqual(ajuste(deux, 1), { masse: 0, puissance: -5 });
  assert.equal(deux.puissanceLibre, 5); assert.equal(deux.masseLibre, 18);
});

test('W-4 montages : les autres armes de W-4 par une visée choisie dans la demande', async () => {
  const w = await monde();
  // [weapon, power drop, mass drop]: 7/3 → 3/1 ; 6/4 → 3/2 ; 1/1 unchanged (nothing to halve) ; 4/2.5 → 2/1 (2.5 / 2 = 1.25, rounded down)
  const cas: [string, number, number][] = [['canon-z', -4, -2], ['canon-p', -3, -2], ['laser-u', 0, 0], ['canon-m', -2, -1.5]];
  for (const [arme, p, m] of cas) {
    const r = await w.ok({ coque: 'fregate-r', choix: [A(arme), sur(arme)] });
    assert.deepEqual(ajuste(r, 1), { masse: m, puissance: p }, arme);
    assert.equal(cod(r).includes('effet_sans_objet'), arme === 'laser-u', arme);
  }
});

test('W-3 cible_invalide pour montage et surcharge', async () => {
  const w = await monde();
  for (const m of ['montage-l', 'surcharge-l']) {
    // no target ; a fitting (only a mounting may aim at one: the overcharge aims at weapons alone) ; a target absent from the design
    const amenagement = [A('laser-z'), M(m, 1, { cibles: [{ nature: 'amenagements', cle: 'soute-z', quantite: 1 }] }), AM('soute-z')]
    const sansCible = [M(m, 1, { vise: undefined })]
    const absente = [M(m, 1, { cibles: [{ nature: 'armes', cle: 'canon-z', quantite: 1 }] })]
    for (const choix of [sansCible, ...(m === 'surcharge-l' ? [amenagement] : []), absente]) {
      const r = await w.ok({ coque: 'fregate-r', choix });
      assert.ok(cod(r).includes('cible_invalide'), `${m} ${JSON.stringify(choix)}`);
      assert.equal(r.lignes.find((l: any) => l.cle === m).ajuste, undefined);
      const bloc = r.alertes.find((a: any) => a.code === 'cible_invalide');
      assert.equal(bloc.niveau, 'bloquante');
    }
  }
});

test('W-4 surcharge cumulable', async () => {
  const w = await monde();
  const s = (q: number, ...autres: object[]) => w.ok({ coque: 'fregate-r', choix: [A('laser-z'), M('surcharge-l', q, { vise: VISE('laser-z') }), ...autres] });
  let r = await s(1);
  assert.deepEqual(ajuste(r, 1), { puissance: 5 }); assert.equal(r.puissanceLibre, 5);
  r = await s(2);
  assert.deepEqual(ajuste(r, 1), { puissance: 10 }); assert.equal(r.puissanceLibre, 0);
  r = await s(3);
  assert.deepEqual(ajuste(r, 1), { puissance: 15 }); assert.equal(r.puissanceLibre, -5);
  assert.ok(cod(r).includes('puissance_insuffisante'));
  assert.ok(!cod(r).includes('limite_depassee'));
  r = await s(4);
  assert.ok(cod(r).includes('limite_depassee'));
});

test('W-4 surcharge : arrondi par installation (canon-q, 3 à 50 %)', async () => {
  const w = await monde();
  // surcharge-l is bound to laser-z; the rounding is read on canon-q through an explicit target
  const s = (q: number) => w.ok({ coque: 'fregate-r', choix: [A('canon-q'), M('surcharge-l', q, { vise: VISE('canon-q') })] });
  assert.deepEqual(ajuste(await s(1), 1), { puissance: 2 });
  assert.deepEqual(ajuste(await s(2), 1), { puissance: 4 });
});

test('W-2 ordre : le montage et la surcharge lisent la ligne avant tout ajustement', async () => {
  const w = await monde();
  const r = await w.ok({ coque: 'fregate-r', choix: [A('laser-z'), sur('laser-z'), M('surcharge-l', 1, { vise: VISE('laser-z') })] });
  // halving first (10 → 5), then the overcharge on the halved 5: ⌊5 × 50 / 100 + ½⌋ = 3 (not 5 on the whole 10)
  assert.deepEqual(ajuste(r, 1), { masse: 0, puissance: -5 });
  assert.deepEqual(ajuste(r, 2), { puissance: 3 });
  assert.equal(r.puissanceLibre, 12);
});

test('W-6 texte du vaisseau et assistant : (→ nom visé) et résultat identique à POST calcul', async () => {
  const w = await monde();
  const choix = [A('laser-z'), sur('laser-z'), M('optimise-l'), M('blindage-l')];
  const http = await w.ok({ coque: 'fregate-r', choix, reparation: 3 });
  assert.match(texteVaisseau(http), /montage-l \(→ laser-z\)/);
  assert.equal(http.armure, 10);
  const outil = catalogueDe(w.app.db, w.cid, w.E).outils.find((t) => t.nom === 'swn_vaisseau_calculer')!;
  const a: any = await outil.executer({
    coque: 'Frégate R', reparation: 3,
    choix: [{ nature: 'armes', nom: 'laser-z' }, { nature: 'modifications', nom: 'montage-l', vise: { nature: 'armes', nom: 'laser-z' } }, { nature: 'modifications', nom: 'optimise-l' }, { nature: 'modifications', nom: 'blindage-l' }],
  });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.deepEqual(a.donnees.resultat, http);
});
