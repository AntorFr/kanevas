import assert from 'node:assert/strict';
import { test } from 'node:test';

// Review of kanevas-outils-format-vaisseaux-effets-calcul (X-2 to X-5, X-8): the invented trial catalogue is written by the test,
// imported through the session route, then POST calcul / PUT conceptions are played. Expectations are hard-coded by hand. Nothing of Éneria.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { poserActivation } = await import('../services/outils.js');
const { calculer } = await import('../outils/swn/regles/vaisseau.js');

const T = 'swn/vaisseaux';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = {
  catalogue: T, version: 'v1',
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', ...coque, vitesse: 3, armure: 5 },
    { cle: 'rond', nom: 'Rond', ...coque, cout: 333335, vitesse: 3, armure: 5 },
    { cle: 'classe-3', nom: 'Classe 3', ...coque, classe: 3, vitesse: 3, armure: 5 },
  ],
  moteurs: [{ cle: 'm1', nom: 'M1', niveau: 1, ...el }],
  amenagements: [
    { cle: 'soute-r', nom: 'Soute R', ...el, soute: 10 },
    { cle: 'moteur-sys', nom: 'Moteur système', ...el, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] },
    { cle: 'vide', nom: 'Vide', ...el },
  ],
  defenses: [{ cle: 'voiles', nom: 'Voiles', ...el }],
  armes: [{ cle: 'canon-r', nom: 'Canon R', emport: 1, munitions: 20, cout_munition: 100, classe_min: 2, ...el }],
  modifications: [
    { cle: 'blindage', nom: 'Blindage', ...el, cout_pct: 10, effet: 'armure', valeur: 2 },
    { cle: 'cale', nom: 'Cale', ...el, limite: 1, effet: 'soutes_doublees' },
    { cle: 'reacteur', nom: 'Réacteur', ...el, limite: 1, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5 },
    { cle: 'munitions-x', nom: 'Munitions X', ...el, limite: 1, effet: 'magasins_doubles' },
    { cle: 'atelier', nom: 'Atelier', ...el, effet: 'reparation_min', valeur: 2 },
    { cle: 'blind-rep', nom: 'Blindage rép', ...el, cout_pct: 10, effet: 'reparation_min', valeur: 2 },
    { cle: 'vif', nom: 'Vif', ...el, effet: 'vitesse', valeur: -9 },
    { cle: 'simple', nom: 'Simple', ...el },
  ],
  exemples: [],
};

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  poserActivation(app.db, antor, { niveau: 'univers', id: E }, T, true);
  const c = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const cookie = `kanevas_session=${c.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  const base = `/api/univers/${E}/outils/${T}`;
  const imp = await app.inject({ method: 'POST', url: `${base}/catalogue/application`, headers: { cookie }, payload: catalogue as any });
  assert.equal(imp.statusCode, 200, imp.body);
  assert.deepEqual(imp.json().refus, []);
  const calcul = (corps: object) => app.inject({ method: 'POST', url: `${base}/calcul`, headers: { cookie }, payload: corps as any });
  const ok = async (corps: object) => { const r = await calcul(corps); assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const aube = (app.db.prepare("SELECT id FROM fiches WHERE univers_id = ? AND titre = 'Aube de Sel'").get(E) as any).id as number;
  return { app, E, base, cookie, calcul, ok, aube };
}
const L = (nature: string, cle: string, extra: object = {}) => ({ nature, cle, quantite: 1, ...extra });
const codes = (r: any) => r.alertes.map((a: any) => a.code);

test('X-3 : blindage 10 % sur la coque à 300 000 : +30 000 au total et à la ligne, armure 7', async () => {
  const w = await monde();
  const a = (await w.ok({ coque: 'fregate-r', choix: [] })).resultat;
  const b = (await w.ok({ coque: 'fregate-r', choix: [L('modifications', 'blindage')] })).resultat;
  assert.equal(a.prix, 300000); assert.equal(b.prix, 330000);
  assert.equal(b.lignes[0].cout, 30000);
  assert.equal(a.armure, 5); assert.equal(b.armure, 7);
  assert.ok(!('cout' in (await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'vide')] })).resultat.lignes[0]));
  // quantity 3 : percentage counted per unit, never multiplied by a class factor
  const c = (await w.ok({ coque: 'fregate-r', choix: [{ ...L('modifications', 'blindage'), quantite: 3 }] })).resultat;
  assert.equal(c.prix, 390000); assert.equal(c.lignes[0].cout, 90000); assert.equal(c.armure, 11);
});

test('X-3 : arrondi au demi supérieur au crédit (333 335 à 10 % → 33 334) et vitesse plancher 0', async () => {
  const w = await monde();
  const r = (await w.ok({ coque: 'rond', choix: [L('modifications', 'blindage')] })).resultat;
  assert.equal(r.prix, 333335 + 33334); assert.equal(r.lignes[0].cout, 33334);
  const v = (await w.ok({ coque: 'fregate-r', choix: [L('modifications', 'vif')] })).resultat;
  assert.equal(v.vitesse, 0);
});

test('X-3 : cale visant soute-r rend des soutes 20 au lieu de 10 ; sans modification 10, sans soute null', async () => {
  const w = await monde();
  assert.equal((await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'soute-r')] })).resultat.soutes, 10);
  assert.equal((await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'vide')] })).resultat.soutes, null);
  const r = await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'soute-r'), L('modifications', 'cale', { vise: { nature: 'amenagements', cle: 'soute-r' } })] });
  assert.equal(r.resultat.soutes, 20);
  assert.deepEqual(r.resultat.lignes[1].vise, { nature: 'amenagements', cle: 'soute-r' });
  assert.deepEqual(codes(r).filter((c: string) => c === 'cible_invalide'), []);
  // two units of the fitting : 2 × 10 × 2
  const deux = await w.ok({ coque: 'fregate-r', choix: [{ ...L('amenagements', 'soute-r'), quantite: 2 }, L('modifications', 'cale', { vise: { nature: 'amenagements', cle: 'soute-r' } })] });
  assert.equal(deux.resultat.soutes, 40);
});

test('X-3/X-4 : reacteur à 3 points : −3 puissance, +1,5 masse ; 5 passe, 6 refusé champ points', async () => {
  const w = await monde();
  const base = (await w.ok({ coque: 'fregate-r', choix: [] })).resultat;
  const r = (await w.ok({ coque: 'fregate-r', choix: [L('modifications', 'reacteur', { points: 3 })] })).resultat;
  assert.equal(r.puissanceLibre, base.puissanceLibre - 3); assert.equal(r.masseLibre, base.masseLibre + 1.5);
  assert.equal(r.lignes[0].points, 3); assert.deepEqual(r.lignes[0].echange, { puissance: -3, masse: 1.5 });
  const zero = (await w.ok({ coque: 'fregate-r', choix: [L('modifications', 'reacteur')] })).resultat;
  assert.deepEqual(zero.lignes[0].echange, { puissance: 0, masse: 0 }); assert.equal(zero.puissanceLibre, base.puissanceLibre);
  const cinq = (await w.ok({ coque: 'fregate-r', choix: [L('modifications', 'reacteur', { points: 5 })] })).resultat;
  assert.deepEqual(cinq.lignes[0].echange, { puissance: -5, masse: 2.5 });
  const six = await w.calcul({ coque: 'fregate-r', choix: [L('modifications', 'reacteur', { points: 6 })] });
  assert.equal(six.statusCode, 400, six.body); assert.equal(six.json().champ, 'points');
  assert.equal((await w.calcul({ coque: 'fregate-r', choix: [L('modifications', 'reacteur', { points: -1 })] })).statusCode, 400);
  assert.equal((await w.calcul({ coque: 'fregate-r', choix: [L('modifications', 'reacteur', { points: 1.5 })] })).statusCode, 400);
});

test('X-4 : points ou vise sur un élément qui n\'a pas l\'effet est invalide avec son champ', async () => {
  const w = await monde();
  const p = await w.calcul({ coque: 'fregate-r', choix: [L('modifications', 'blindage', { points: 1 })] });
  assert.equal(p.statusCode, 400, p.body); assert.equal(p.json().champ, 'points');
  const v = await w.calcul({ coque: 'fregate-r', choix: [L('amenagements', 'soute-r'), L('modifications', 'blindage', { vise: { nature: 'amenagements', cle: 'soute-r' } })] });
  assert.equal(v.statusCode, 400, v.body); assert.equal(v.json().champ, 'vise');
  assert.equal((await w.calcul({ coque: 'fregate-r', choix: [L('modifications', 'reacteur', { vise: { nature: 'armes', cle: 'canon-r' } })] })).json().champ, 'vise');
});

test('X-3 : munitions-x sur l\'arme à 2 magasins : munitions 6 000 → 12 000, masse de chargeurs 2 → 4', async () => {
  const w = await monde();
  const arme = L('armes', 'canon-r', { magasins: 2 });
  const sans = (await w.ok({ coque: 'fregate-r', choix: [arme] })).resultat;
  const avec = (await w.ok({ coque: 'fregate-r', choix: [arme, L('modifications', 'munitions-x', { vise: { nature: 'armes', cle: 'canon-r' } })] })).resultat;
  assert.equal(sans.prix, 300000 + 6000); assert.equal(avec.prix, 300000 + 12000);
  assert.equal(sans.masseLibre, 8 - 2); assert.equal(avec.masseLibre, 8 - 4);
});

test('X-3 : moteur-sys rend puissance 3 / masse 1,5 en classe 2 et 4 / 2 en classe 3', async () => {
  const w = await monde();
  const delta = async (c: string) => {
    const a = (await w.ok({ coque: c, choix: [] })).resultat;
    const b = (await w.ok({ coque: c, choix: [L('amenagements', 'moteur-sys')] })).resultat;
    return [b.puissanceLibre - a.puissanceLibre, b.masseLibre - a.masseLibre];
  };
  assert.deepEqual(await delta('fregate-r'), [3, 1.5]);
  assert.deepEqual(await delta('classe-3'), [4, 2]);
});

test('X-3 : l\'ordre — le moteur système est rendu avant l\'échange, tous deux sans plancher', async () => {
  const w = await monde();
  const r = (await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'moteur-sys'), L('modifications', 'reacteur', { points: 5 })] })).resultat;
  assert.equal(r.puissanceLibre, 10 + 3 - 5); assert.equal(r.masseLibre, 8 + 1.5 + 2.5);
});

test('X-5 : deux unités de moteur système lèvent moteur_systeme_multiple, bloquante, une seule non', async () => {
  const w = await monde();
  const un = await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'moteur-sys')] });
  assert.ok(!codes(un).includes('moteur_systeme_multiple'));
  const deux = await w.ok({ coque: 'fregate-r', choix: [{ ...L('amenagements', 'moteur-sys'), quantite: 2 }] });
  const a = deux.alertes.find((x: any) => x.code === 'moteur_systeme_multiple');
  assert.equal(a.niveau, 'bloquante'); assert.equal(a.texte, 'Un seul moteur système par vaisseau.');
});

test('X-5 : cible_invalide — sans visé, visé absent, visé sans soute ni arme ; bloquante, texte et ligne', async () => {
  const w = await monde();
  const cible = async (vise: object | undefined, extra: object[] = []) => {
    const r = await w.ok({ coque: 'fregate-r', choix: [...extra, L('modifications', 'cale', vise ? { vise } : {})] });
    return r.alertes.filter((a: any) => a.code === 'cible_invalide');
  };
  const sans = await cible(undefined, [L('amenagements', 'soute-r')]);
  assert.equal(sans.length, 1); assert.equal(sans[0].niveau, 'bloquante');
  assert.equal(sans[0].texte, '« Cale » : choisissez l\'élément visé.'); assert.equal(sans[0].ligne, 1);
  const absent = await cible({ nature: 'amenagements', cle: 'soute-r' }, [L('amenagements', 'vide')]);
  assert.equal(absent[0].texte, '« Cale » : l\'élément visé n\'est pas dans cette conception.');
  const vide = await cible({ nature: 'amenagements', cle: 'vide' }, [L('amenagements', 'vide')]);
  assert.equal(vide[0].texte, '« Cale » : cet élément ne peut pas être visé.');
  const m = await w.ok({ coque: 'fregate-r', choix: [L('armes', 'canon-r'), L('modifications', 'munitions-x', { vise: { nature: 'amenagements', cle: 'soute-r' } })] });
  assert.ok(codes(m).includes('cible_invalide'));
  const m2 = await w.ok({ coque: 'fregate-r', choix: [L('amenagements', 'vide'), L('modifications', 'munitions-x', { vise: { nature: 'amenagements', cle: 'vide' } })] });
  assert.equal(m2.alertes.find((a: any) => a.code === 'cible_invalide').texte, '« Munitions X » : cet élément ne peut pas être visé.');
});

test('X-5 : un choix bloquant n\'est pas enregistré (422), une cible valide l\'est', async () => {
  const w = await monde();
  await w.app.inject({ method: 'POST', url: `${w.base}/conceptions`, headers: { cookie: w.cookie }, payload: { ficheId: w.aube, coque: 'fregate-r' } });
  const v = (await w.app.inject({ method: 'GET', url: `${w.base}/conceptions/${w.aube}`, headers: { cookie: w.cookie } })).json().version;
  const put = (corps: object) => w.app.inject({ method: 'PUT', url: `${w.base}/conceptions/${w.aube}`, headers: { cookie: w.cookie }, payload: corps as any });
  const r = await put({ coque: 'fregate-r', choix: [L('modifications', 'cale')], version: v });
  assert.equal(r.statusCode, 422, r.body); assert.equal(r.json().alertes[0].code, 'cible_invalide');
});

test('X-5 : réparation 1 face à un minimum 2 : reparation_insuffisante à surveiller ; 2 ne lève rien ; exacte à la borne', async () => {
  const w = await monde();
  const choix = [L('modifications', 'atelier')];
  const un = await w.ok({ coque: 'fregate-r', choix, reparation: 1 });
  const a = un.alertes.find((x: any) => x.code === 'reparation_insuffisante');
  assert.equal(a.niveau, 'a_surveiller'); assert.equal(a.texte, '« Atelier » : réparation 2 au moins (1 choisie).'); assert.equal(a.ligne, 0);
  assert.deepEqual(un.resultat.reparation, { choisie: 1, min: 2 });
  const deux = await w.ok({ coque: 'fregate-r', choix, reparation: 2 });
  assert.ok(!codes(deux).includes('reparation_insuffisante')); assert.deepEqual(deux.resultat.reparation, { choisie: 2, min: 2 });
  const defaut = await w.ok({ coque: 'fregate-r', choix });
  assert.ok(codes(defaut).includes('reparation_insuffisante')); assert.deepEqual(defaut.resultat.reparation, { choisie: 0, min: 2 });
  // no line asks and skill 0 → null ; skill 4 alone → {4, null}
  assert.equal((await w.ok({ coque: 'fregate-r', choix: [] })).resultat.reparation, null);
  assert.deepEqual((await w.ok({ coque: 'fregate-r', choix: [], reparation: 4 })).resultat.reparation, { choisie: 4, min: null });
  // two lines, one alert each for the ones above the skill
  const deuxl = await w.ok({ coque: 'fregate-r', choix: [...choix, L('modifications', 'blind-rep')], reparation: 1 });
  assert.equal(codes(deuxl).filter((c: string) => c === 'reparation_insuffisante').length, 2);
});

test('X-4 : réparation hors 0 à 20 refusée avec champ reparation (calcul et enregistrement), 0 et 20 passent', async () => {
  const w = await monde();
  for (const mauvais of [-1, 21, 1.5, '3']) {
    const r = await w.calcul({ coque: 'fregate-r', choix: [], reparation: mauvais });
    assert.equal(r.statusCode, 400, String(mauvais)); assert.equal(r.json().champ, 'reparation');
  }
  for (const bon of [0, 20]) assert.equal((await w.calcul({ coque: 'fregate-r', choix: [], reparation: bon })).statusCode, 200);
  await w.app.inject({ method: 'POST', url: `${w.base}/conceptions`, headers: { cookie: w.cookie }, payload: { ficheId: w.aube, coque: 'fregate-r' } });
  const v = (await w.app.inject({ method: 'GET', url: `${w.base}/conceptions/${w.aube}`, headers: { cookie: w.cookie } })).json().version;
  const r = await w.app.inject({ method: 'PUT', url: `${w.base}/conceptions/${w.aube}`, headers: { cookie: w.cookie }, payload: { coque: 'fregate-r', choix: [], version: v, reparation: 21 } });
  assert.equal(r.statusCode, 400, r.body); assert.equal(r.json().champ, 'reparation');
});

test('X-4 : la réparation et les points/vise enregistrés survivent à un import du catalogue et au recalcul, le texte gagne Soutes et les mentions', async () => {
  const w = await monde();
  await w.app.inject({ method: 'POST', url: `${w.base}/conceptions`, headers: { cookie: w.cookie }, payload: { ficheId: w.aube, coque: 'fregate-r' } });
  const lire = async () => (await w.app.inject({ method: 'GET', url: `${w.base}/conceptions/${w.aube}`, headers: { cookie: w.cookie } })).json();
  const choix = [L('amenagements', 'soute-r'), L('modifications', 'cale', { vise: { nature: 'amenagements', cle: 'soute-r' } }),
    L('modifications', 'reacteur', { points: 3 }), L('modifications', 'atelier'), L('modifications', 'blindage')];
  const put = await w.app.inject({ method: 'PUT', url: `${w.base}/conceptions/${w.aube}`, headers: { cookie: w.cookie },
    payload: { coque: 'fregate-r', choix, version: (await lire()).version, reparation: 2 } });
  assert.equal(put.statusCode, 200, put.body);
  assert.deepEqual(put.json().resultat.reparation, { choisie: 2, min: 2 });
  const row = () => w.app.db.prepare('SELECT reparation, choix FROM swn_conceptions WHERE fiche_id = ?').get(w.aube) as any;
  assert.equal(row().reparation, 2);
  assert.deepEqual(JSON.parse(row().choix)[1].vise, { nature: 'amenagements', cle: 'soute-r' });
  assert.equal(JSON.parse(row().choix)[2].points, 3);
  const contenu = () => (w.app.db.prepare('SELECT s.contenu c FROM sections s JOIN swn_conceptions c ON c.section_id = s.id WHERE c.fiche_id = ?').get(w.aube) as any).c as string;
  const t = contenu();
  assert.match(t, /Soutes/); assert.match(t, /20/);
  assert.match(t, /Cale \(→ Soute R\)/); assert.match(t, /Réacteur \(3 points\)/); assert.match(t, /Blindage — 30.000.cr/);
  // an import that changes the catalogue, then the recalculation
  const cat2 = JSON.parse(JSON.stringify(catalogue)); cat2.version = 'v2'; cat2.amenagements[0].soute = 11;
  assert.equal((await w.app.inject({ method: 'POST', url: `${w.base}/catalogue/application`, headers: { cookie: w.cookie }, payload: cat2 })).statusCode, 200);
  assert.equal(row().reparation, 2);
  const apres = await lire();
  assert.equal(apres.perime, true);
  const rec = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/fiches/${w.aube}/sections/${apres.sectionId}/recalcul`,
    headers: { cookie: w.cookie }, payload: { version: apres.sectionVersion } });
  assert.equal(rec.statusCode, 200, rec.body);
  assert.equal(row().reparation, 2);
  const relu = await lire();
  assert.equal(relu.perime, false);
  assert.deepEqual(relu.resultat.reparation, { choisie: 2, min: 2 });
  assert.equal(relu.resultat.soutes, 22);
  assert.deepEqual(codes(relu).filter((c: string) => c === 'reparation_insuffisante'), []);
});

test('X-3 : un catalogue sans aucun des champs donne le résultat d\'avant clé pour clé (soutes et reparation null)', () => {
  const e = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0 };
  const c = { cle: 'c', nom: 'C', classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 10, masse: 8, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5 };
  const r = calculer(c as any, [{ nature: 'amenagements', cle: 'a', nom: 'A', quantite: 2, element: e } as any], { porteeSaut: 1 }, null);
  assert.deepEqual(r.lignes, [{ nature: 'amenagements', cle: 'a', nom: 'A', quantite: 2 }]);
  assert.equal(r.prix, 302000); assert.equal(r.vitesse, 3); assert.equal(r.armure, 5);
  assert.equal(r.puissanceLibre, 8); assert.equal(r.masseLibre, 6);
  assert.equal(r.soutes, null); assert.equal(r.reparation, null);
  assert.deepEqual(Object.keys(r).sort(), ['alertes', 'armure', 'ca', 'chantierJours', 'coque', 'emports', 'entretien', 'equipage', 'lignes', 'masseLibre', 'porteeSaut', 'prix', 'puissanceLibre', 'pv', 'reparation', 'soutes', 'vitesse']);
});
