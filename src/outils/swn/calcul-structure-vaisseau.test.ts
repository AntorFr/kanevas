import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-concepteur-vaisseaux-regles-calcul-structure (H-2, H-3, B-94): invented catalogue imported through the route,
// computed by POST calcul. Expected values hard-coded.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');

const T = 'swn/vaisseaux';
const el = { cout: 10, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 3, cout: 10, pv: 5, ca: 10, puissance: 50, masse: 50, emports: 5, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = {
  catalogue: T, version: 'v1',
  coques: [
    { cle: 'station', nom: 'Station', ...coque, moteur_spike: 0 },
    { cle: 'navire', nom: 'Navire', ...coque, moteur_spike: 1, vitesse: 3 },
    { cle: 'ancienne', nom: 'Ancienne', ...coque },
  ],
  moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el }],
  amenagements: [
    { cle: 'auto', nom: 'Auto-ciblage', ...el, limite_par: 'armes' },
    { cle: 'tuyere', nom: 'Tuyère', ...el, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] },
  ],
  defenses: [], armes: [{ cle: 'canon', nom: 'Canon', emport: 1, munitions: 0, cout_munition: 0, ...el }],
  modifications: [], exemples: [],
};
const L = (nature: string, cle: string, quantite = 1) => ({ nature, cle, quantite });

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const one = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const id = one('SELECT id FROM comptes WHERE username = ?', 'antor').id as number;
  const headers = { cookie: `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id, groups: [] }))}` };
  const E = one('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const imp = await app.inject({ method: 'POST', url: `/api/univers/${E}/outils/${T}/catalogue/application`, headers, payload: catalogue as any });
  assert.equal(imp.statusCode, 200, imp.body);
  return async (corps: object) => {
    const r = await app.inject({ method: 'POST', url: `/api/univers/${E}/outils/swn/vaisseaux/calcul`, headers, payload: corps as any });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().resultat;
  };
}
const codes = (r: any, niveau?: string) => r.alertes.filter((a: any) => !niveau || a.niveau === niveau).map((a: any) => a.code);

test('H-2 : station sans moteur acceptée (saut null, vitesse null, pas de moteur_absent) ; avec moteur ou moteur système, bloquée sur la ligne', async () => {
  const calcul = await monde();
  const nue = await calcul({ coque: 'station', choix: [] });
  assert.equal(nue.porteeSaut, null); assert.equal(nue.vitesse, null);
  assert.deepEqual(codes(nue), []);
  const m = await calcul({ coque: 'station', choix: [L('moteurs', 'm1')] });
  assert.deepEqual(m.alertes.filter((a: any) => a.code === 'moteur_sur_station').map((a: any) => [a.niveau, a.texte, a.ligne]),
    [['bloquante', "« M1 » : une station n'a pas de moteur de saut ni de moteur système.", 0]]);
  const t = await calcul({ coque: 'station', choix: [L('amenagements', 'auto'), L('amenagements', 'tuyere')] });
  assert.deepEqual(t.alertes.filter((a: any) => a.code === 'moteur_sur_station').map((a: any) => a.ligne), [1]);
});

test('H-2/B-94 : coque à moteur_spike 1 ou sans champ sans moteur → moteur_absent à surveiller, vitesse conservée', async () => {
  const calcul = await monde();
  const n = await calcul({ coque: 'navire', choix: [] });
  assert.deepEqual(codes(n), ['moteur_absent']); assert.equal(n.alertes[0].niveau, 'a_surveiller'); assert.equal(n.vitesse, 3);
  assert.deepEqual(codes(await calcul({ coque: 'ancienne', choix: [] })), ['moteur_absent']);
  assert.equal((await calcul({ coque: 'navire', choix: [L('moteurs', 'm1')] })).porteeSaut > 0, true);
});

test('H-3 : auto-ciblage limité au nombre d’armes (1 arme/2 auto bloqué, 2 armes/2 auto libre, 0 arme/1 auto bloqué)', async () => {
  const calcul = await monde();
  const trop = await calcul({ coque: 'navire', choix: [L('moteurs', 'm1'), L('armes', 'canon'), L('amenagements', 'auto', 2)] });
  assert.deepEqual(trop.alertes.filter((a: any) => a.code === 'limite_depassee').map((a: any) => [a.niveau, a.texte, a.ligne]),
    [['bloquante', "Limite dépassée : 2 système(s) d'auto-ciblage pour 1 arme(s)", 2]]);
  assert.deepEqual(codes(await calcul({ coque: 'navire', choix: [L('moteurs', 'm1'), L('armes', 'canon', 2), L('amenagements', 'auto', 2)] })), []);
  assert.deepEqual(codes(await calcul({ coque: 'navire', choix: [L('moteurs', 'm1'), L('amenagements', 'auto')] }), 'bloquante'), ['limite_depassee']);
});
