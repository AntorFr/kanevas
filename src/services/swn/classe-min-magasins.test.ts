import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère amendé de kanevas-outils-vaisseaux-calcul (E-2, E-3) : classe_min des armes et magasins d'une ligne de choix,
// du fichier de catalogue jusqu'au calcul. Valeurs calculées à la main (croiseur : classe 3, 1 000 000 cr, masse 40).
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../../db/db.js');
const { assurerCompte } = await import('../comptes.js');
const { ajouterMembre } = await import('../membres.js');
const { creerEtRattacherSysteme } = await import('../systemes.js');
const { creerUnivers } = await import('../univers.js');
const o = await import('../outils.js');
const c = await import('../catalogues.js');
const calc = await import('./calcul-vaisseau.js');
const { readFileSync } = await import('node:fs');

const OUTIL = 'swn/vaisseaux';
const essai = () => JSON.parse(readFileSync(new URL('../../outils/swn/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
const U = (id: number) => ({ niveau: 'univers' as const, id });
const S = (id: number) => ({ niveau: 'systeme' as const, id });
const A = (compteId: number) => ({ compteId });

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  assurerCompte(db, 'lea');
  const u1 = creerUnivers(db, antor, { nom: 'U' }).id;
  ajouterMembre(db, antor, u1, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u1, { nom: 'Sys' }).id;
  o.poserActivation(db, antor, U(u1), OUTIL, true);
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, essai());
  return { db, antor, u1 };
}
const bidule = (extra: Record<string, unknown> = {}) => ({
  cle: 'bidule', nom: 'Bidule', emport: 1, munitions: 5, cout_munition: 200, cout: 10000, puissance: 1, masse: 2,
  x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0, ...extra,
});
const fichier = (extra: Record<string, unknown>) => ({ catalogue: OUTIL, version: 'cm-essai', armes: [bidule(extra)] });
const lu = (db: any, u: number) => (c.resoudreElements(db, u, OUTIL, 'armes') as any[]).find((e) => e.cle === 'bidule');

test('classe_min absent du fichier : stocké 1, rejeu identique et rejeu avec 1 explicite inchangés', () => {
  const { db, antor, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({}));
  assert.equal(lu(db, u1).donnees.classe_min, 1);
  const r = c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({}));
  assert.equal(Object.values(r.natures).reduce((s: number, x: any) => s + x.inchanges, 0), 1);
  const r2 = c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({ classe_min: 1 }));
  assert.equal(Object.values(r2.natures).reduce((s: number, x: any) => s + x.inchanges, 0), 1);
});

test('classe_min 2 : stocké, puis modifié par un second fichier', () => {
  const { db, antor, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({ classe_min: 2 }));
  assert.equal(lu(db, u1).donnees.classe_min, 2);
  const r = c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({ classe_min: 4 }));
  assert.equal(Object.values(r.natures).reduce((s: number, x: any) => s + x.modifies, 0), 1);
  assert.equal(lu(db, u1).donnees.classe_min, 4);
});

test('classe_min 0, 5 ou 2.5 : refusé avec champ classe_min, rien écrit', () => {
  const { db, antor, u1 } = monde();
  for (const v of [0, 5, 2.5, '2']) {
    const r = c.previsualiserCatalogue(db, A(antor), U(u1), OUTIL, fichier({ classe_min: v }));
    assert.equal(r.refus.length, 1, String(v));
    assert.equal(r.refus[0]!.champ, 'classe_min', String(v));
  }
  assert.equal(lu(db, u1), undefined);
});

test('exemple avec magasins sur une arme accepté ; magasins 0, 10, 1.5 ou sur un moteur refusés', () => {
  const { db, antor, u1 } = monde();
  const ex = (choix: unknown) => ({ catalogue: OUTIL, version: 'ex', exemples: [{ cle: 'ex-mag', nom: 'Ex', coque: 'croiseur', choix }] });
  const ok = c.previsualiserCatalogue(db, A(antor), U(u1), OUTIL, ex([{ nature: 'armes', cle: 'laser', quantite: 1, magasins: 2 }]));
  assert.deepEqual(ok.refus, []);
  for (const m of [0, 10, 1.5]) {
    const r = c.previsualiserCatalogue(db, A(antor), U(u1), OUTIL, ex([{ nature: 'armes', cle: 'laser', quantite: 1, magasins: m }]));
    assert.equal(r.refus.length, 1, String(m));
  }
  const r = c.previsualiserCatalogue(db, A(antor), U(u1), OUTIL, ex([{ nature: 'moteurs', cle: 'moteur-1', quantite: 1, magasins: 1 }]));
  assert.equal(r.refus.length, 1);
});

test('validerChoix : magasins 1–9 sur les armes seulement', () => {
  const ligne = (extra: Record<string, unknown>) => ({ nature: 'armes', cle: 'laser', quantite: 1, ...extra });
  assert.deepEqual(calc.validerChoix('croiseur', [ligne({ magasins: 9 })]).choix, [ligne({ magasins: 9 })]);
  assert.deepEqual(calc.validerChoix('croiseur', [ligne({})]).choix, [ligne({})]);
  for (const m of [0, 10, 1.5, '2', null]) {
    assert.throws(() => calc.validerChoix('croiseur', [ligne({ magasins: m })]), (e: any) => e.champ === 'choix', String(m));
  }
  assert.throws(() => calc.validerChoix('croiseur', [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1, magasins: 1 }]), (e: any) => e.champ === 'choix');
});

test('de bout en bout : croiseur + 2 bidules classe_min 1 + 1 magasin = 1 036 000 cr, masse libre 34 ; sans magasin 1 028 000, 36', () => {
  const { db, antor, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({ classe_min: 1 }));
  const avec = calc.calculerDepuisChoix(db, A(antor), u1, { coque: 'croiseur', choix: [{ nature: 'armes', cle: 'bidule', quantite: 2, magasins: 1 }] });
  assert.equal(avec.resultat!.prix, 1036000);
  assert.equal(avec.resultat!.masseLibre, 34);
  assert.equal(avec.resultat!.entretien, 51800);
  const sans = calc.calculerDepuisChoix(db, A(antor), u1, { coque: 'croiseur', choix: [{ nature: 'armes', cle: 'bidule', quantite: 2 }] });
  assert.equal(sans.resultat!.prix, 1028000);
  assert.equal(sans.resultat!.masseLibre, 36);
});

test('de bout en bout : un bidule importé sans classe_min est multiplié comme classe_min 1', () => {
  const { db, antor, u1 } = monde();
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, fichier({}));
  const r = calc.calculerDepuisChoix(db, A(antor), u1, { coque: 'croiseur', choix: [{ nature: 'armes', cle: 'bidule', quantite: 2 }] });
  assert.equal(r.resultat!.prix, 1028000);
});
