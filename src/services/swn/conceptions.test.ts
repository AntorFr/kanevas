import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-vaisseaux-conceptions : les valeurs attendues sont celles de V-11, écrites en dur.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const k = await import('./conceptions.js');
const calc = await import('./calcul-vaisseau.js');
const c = await import('../catalogues.js');
const o = await import('../outils.js');
const sg = await import('../sections-gerees.js');
const { lireFiche } = await import('../fiches.js');
type Db = ReturnType<typeof openDb>;

const OUTIL = 'swn/vaisseaux';
const NB = ' ';
const ex = (nom: string) => JSON.parse(readFileSync(new URL('../../outils/swn/exemples/catalogue-essai.json', import.meta.url), 'utf8')).exemples
  .find((e: any) => e.cle === nom || e.nom === nom);

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare("SELECT id FROM univers WHERE nom = ?").get("Éneria d'essai") as any).id as number;
  const fiche = (t: string) => (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, t) as any).id as number;
  const a = (n: string, modeJoueur = false) => ({ compteId: compte(n), ...(modeJoueur ? { modeJoueur: true } : {}) });
  return { db, u, fiche, a, antor: a('antor'), lea: a('lea'), roxane: a('roxane'), teo: a('teo'), mira: a('mira'),
    orak: fiche("Vent d'Orak"), etoile: fiche('Étoile du soir'), aube: fiche('Aube de Sel') };
}
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string; message: string; alertes?: any[] }; }
  return assert.fail('aucune erreur levée');
}
const ligne = (nature: string, cle: string, quantite = 1) => ({ nature, cle, quantite });
const section = (db: Db, ficheId: number) => db.prepare("SELECT * FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL").get(ficheId) as any;
const rangee = (db: Db, ficheId: number) => db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(ficheId) as any;
const poserPortee = (db: Db, a: any, u: number, n: number) =>
  o.poserReglages(db, a, { niveau: 'univers', id: u }, 'swn', { version: o.lireLigneOutil(db, { niveau: 'univers', id: u }, 'swn')?.version_reglages ?? 0, valeurs: { portee_saut: n } });
const CHOIX_ORAK = [ligne('moteurs', 'moteur-2'), ligne('amenagements', 'soute'), ligne('armes', 'laser'), ligne('armes', 'lance-d-essai')];

test('calculerDepuisChoix rend les sept exemples de V-11', () => {
  const { db, u, antor } = monde();
  const attendu: Record<string, [number, number, number, number, number, number, number, number, number, number | null, number]> = {
    // prix, pv, ca, puissanceLibre, masseLibre, emportsUtilises, emportsTotal, chantier, entretien, portee, nbAlertes
    'eclaireur-nu': [25000, 8, 14, 8, 7, 0, 1, 1, 1250, 10, 0],
    'eclaireur-arme': [54000, 13, 15, 6, 4, 1, 1, 3, 2700, 10, 0],
    'fregate-de-ligne': [700000, 30, 14, 5, 1, 2, 3, 28, 35000, 15, 0],
    'fregate-a-l-extreme': [815000, 30, 14, 0, 3, 3, 3, 33, 40750, 15, 1],
    'fregate-gourmande': [855000, 30, 14, -1, -3, 3, 3, 35, 42750, 15, 2],
    'croiseur-de-transport': [1966000, 69, 16, 27, 3, 3, 5, 79, 98300, 15, 0],
    'fregate-sans-moteur': [465000, 30, 14, 15, 13, 1, 3, 19, 23250, null, 1],
  };
  const exemples = JSON.parse(readFileSync(new URL('../../outils/swn/exemples/catalogue-essai.json', import.meta.url), 'utf8')).exemples;
  assert.equal(exemples.length, 7);
  for (const e of exemples) {
    const att = attendu[e.cle ?? e.nom];
    assert.ok(att, `exemple inattendu ${e.cle ?? e.nom}`);
    const s = calc.calculerDepuisChoix(db, antor, u, { coque: e.coque, choix: e.choix });
    const r = s.resultat!;
    assert.ok(r, e.cle);
    assert.deepEqual([r.prix, r.pv, r.ca, r.puissanceLibre, r.masseLibre, r.emports.utilises, r.emports.total, r.chantierJours,
      r.entretien, r.porteeSaut, s.alertes.length], att, e.cle ?? e.nom);
  }
  const gourmande = calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [ligne('moteurs', 'moteur-2'), ligne('amenagements', 'cabines', 3), ligne('armes', 'laser', 3)] });
  assert.deepEqual(gourmande.alertes.map((a) => [a.niveau, a.code]), [['bloquante', 'puissance_insuffisante'], ['bloquante', 'masse_insuffisante']]);
});

test('calculerDepuisChoix : ligne non résolue → resultat null et alertes', () => {
  const { db, u, antor } = monde();
  const s = calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [ligne('moteurs', 'moteur-9')] });
  assert.equal(s.resultat, null);
  assert.equal(s.alertes.length, 1);
  assert.equal(s.alertes[0]!.code, 'element_retire');
  assert.equal(calc.calculerDepuisChoix(db, antor, u, { coque: 'inconnue', choix: [] }).resultat, null);
});

test('calculerDepuisChoix : entrée fausse et droits', () => {
  const { db, u, antor, teo } = monde();
  assert.equal(err(() => calc.calculerDepuisChoix(db, teo, u, { coque: 'fregate', choix: [] })).code, 'introuvable');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [ligne('moteurs', 'moteur-1', 0)] })).code, 'invalide');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [ligne('moteurs', 'moteur-1', 100)] })).code, 'invalide');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [ligne('moteurs', 'moteur-1'), ligne('moteurs', 'moteur-1')] })).detail, 'choix_en_double');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [ligne('tourelles', 'x')] })).code, 'invalide');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: Array.from({ length: 101 }, (_, i) => ligne('moteurs', `m${i}`)) })).code, 'invalide');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, null)).code, 'invalide');
});

test("« Vent d'Orak » semé : chiffres, texte V-6 et source_version", () => {
  const { db, u, lea, orak } = monde();
  const v = k.lireConception(db, lea, u, orak);
  const r = v.resultat;
  assert.deepEqual([r.prix, r.chantierJours, r.entretien, r.pv, r.ca, r.puissanceLibre, r.masseLibre, r.porteeSaut],
    [685000, 28, 34250, 30, 14, 4, 7, 15]);
  assert.equal(v.version, 2);
  assert.equal(v.peutEcrire, true);
  const s = section(db, orak);
  assert.equal(s.gere_par, 'swn/vaisseaux/caracteristiques');
  const attendu = [
    `**Frégate d'essai** — classe 2`, '',
    '| Mesure | Valeur |', '|---|---|',
    `| Prix | 685${NB}000${NB}cr |`, '| PV | 30 |', '| CA | 14 |', '| Chantier | 28 jours |',
    `| Entretien | 34${NB}250${NB}cr / an |`, '| Portée de saut | 15 cases |', '| Puissance libre | 4 |', '| Masse libre | 7 |', '| Emports | 2 / 3 |', '',
    '**Choix**', '- 1 × Moteur 2', '- 1 × Soute', `- 1 × Lance d'essai`, '- 1 × Laser', '',
  ].join('\n');
  assert.equal(s.contenu.replace(/\n+$/, '\n').replace(/^(\|[ -]+\|)$/m, '$1'), attendu.replace(/\n+$/, '\n'));
  assert.equal(s.source_version, calc.versionSourceVaisseaux(db, u));
  assert.equal(rangee(db, orak).section_id, s.id);
});

test("création de « Aube de Sel » : Antor oui, Léa refusé, Teo introuvable, doublon et mauvais type", () => {
  const { db, u, antor, lea, teo, aube, orak } = monde();
  assert.equal(err(() => k.creerConception(db, lea, u, { ficheId: aube, coque: 'eclaireur' })).code, 'refuse');
  assert.equal(err(() => k.creerConception(db, teo, u, { ficheId: aube, coque: 'eclaireur' })).code, 'introuvable');
  assert.equal(err(() => k.creerConception(db, { ...antor, modeJoueur: true }, u, { ficheId: aube, coque: 'eclaireur' })).code, 'refuse');
  assert.equal(rangee(db, aube), undefined);
  const v = k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur', auteurId: lea.compteId });
  assert.equal(section(db, aube).gere_par, 'swn/vaisseaux/caracteristiques');
  assert.equal(section(db, aube).auteur_id, lea.compteId);
  assert.equal(v.resultat.prix, 20000);
  assert.deepEqual(v.alertes.map((a) => a.texte), ['Aucun moteur de saut : ce vaisseau ne peut pas voyager.']);
  const d = err(() => k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur' }));
  assert.deepEqual([d.code, d.detail], ['conflit', 'deja_concue']);
  assert.equal(err(() => k.creerConception(db, antor, u, { ficheId: orak, coque: 'fregate' })).detail, 'deja_concue');
  const autre = (db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Un lieu', '{}', 'x', 'x')").run(u).lastInsertRowid) as number;
  assert.equal(err(() => k.creerConception(db, antor, u, { ficheId: Number(autre), coque: 'eclaireur' })).code, 'invalide');
  // atomicité : une coque inconnue ne laisse ni ligne ni section
  const nouvelle = Number(db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'vaisseau', 'Neuf', '{}', 'x', 'x')").run(u).lastInsertRowid);
  const e = err(() => k.creerConception(db, antor, u, { ficheId: nouvelle, coque: 'nimporte' }));
  assert.equal(e.code, 'invalide');
  assert.equal(rangee(db, nouvelle), undefined);
  assert.equal(section(db, nouvelle), undefined);
  assert.equal(err(() => k.creerConception(db, antor, u, { ficheId: 999999, coque: 'eclaireur' })).code, 'introuvable');
});

test("enregistrement : seconde lance bloquée sans rien écrire, puis succès et conflit de version", () => {
  const { db, u, lea, orak } = monde();
  const avantL = rangee(db, orak);
  const avantS = section(db, orak);
  const choix2 = [...CHOIX_ORAK, ligne('armes', 'lance-d-essai', 2)].slice(0, 3).concat([ligne('armes', 'lance-d-essai', 2)]);
  const e = err(() => k.enregistrerConception(db, lea, u, orak, { coque: 'fregate', choix: choix2, version: avantL.version }));
  assert.deepEqual([e.code, e.detail], ['invalide', 'conception_bloquee']);
  assert.ok(e.alertes!.some((a) => a.texte === 'Puissance insuffisante : −2'));
  assert.deepEqual(rangee(db, orak), avantL);
  assert.deepEqual(section(db, orak), avantS);
  // sans elle
  const v = k.enregistrerConception(db, lea, u, orak, { coque: 'fregate', choix: CHOIX_ORAK.slice(0, 3), version: avantL.version });
  assert.equal(v.version, avantL.version + 1);
  assert.equal(v.resultat.prix, 535000);
  // deuxième enregistrement de la même version lue
  const d = err(() => k.enregistrerConception(db, lea, u, orak, { coque: 'fregate', choix: CHOIX_ORAK, version: avantL.version }));
  assert.deepEqual([d.code, d.detail], ['conflit', 'donnee_modifiee']);
  assert.equal(rangee(db, orak).version, avantL.version + 1);
  // entrées fausses
  assert.equal(err(() => k.enregistrerConception(db, lea, u, orak, { coque: 'fregate', choix: [], version: 'x' })).code, 'invalide');
  assert.equal(err(() => k.enregistrerConception(db, lea, u, orak, { coque: 'fregate', choix: 'x', version: v.version })).code, 'invalide');
});

test("droits de lecture : Roxane, Teo, étranger, mode Joueur", () => {
  const { db, u, antor, roxane, teo, etoile, orak } = monde();
  const r = k.lireConception(db, roxane, u, etoile);
  assert.equal(r.peutEcrire, false);
  assert.deepEqual([r.resultat.prix, r.resultat.chantierJours, r.resultat.entretien, r.resultat.pv, r.resultat.puissanceLibre, r.resultat.masseLibre, r.resultat.porteeSaut],
    [50000, 2, 2500, 8, 6, 6, 10]);
  assert.equal(err(() => k.enregistrerConception(db, roxane, u, etoile, { coque: 'eclaireur', choix: [], version: r.version })).code, 'refuse');
  const hidden = err(() => k.lireConception(db, roxane, u, orak));
  const inconnu = err(() => k.lireConception(db, roxane, u, 999999));
  assert.deepEqual([hidden.code, hidden.message], ['introuvable', inconnu.message].map((x, i) => i === 0 ? 'introuvable' : x));
  assert.equal(inconnu.code, 'introuvable');
  for (const f of [orak, etoile]) assert.equal(err(() => k.lireConception(db, teo, u, f)).code, 'introuvable');
  assert.equal(err(() => k.listerConceptions(db, teo, u)).code, 'introuvable');
  const etranger = { compteId: (db.prepare("INSERT INTO comptes (username, cree_le) VALUES ('etranger', 'x')").run().lastInsertRowid as number) };
  assert.equal(err(() => k.lireConception(db, etranger, u, etoile)).code, 'introuvable');
  assert.equal(err(() => k.listerConceptions(db, etranger, u)).code, 'introuvable');
  const mj = { ...antor, modeJoueur: true };
  assert.equal(k.lireConception(db, mj, u, etoile).peutEcrire, false);
  assert.equal(err(() => k.lireConception(db, mj, u, orak)).code, 'introuvable');
  assert.equal(err(() => k.enregistrerConception(db, mj, u, etoile, { coque: 'eclaireur', choix: [], version: 2 })).code, 'refuse');
});

test('listes : Léa 2, Roxane 1, Antor 2 avec Aube de Sel sans conception', () => {
  const { db, u, antor, lea, roxane, mira } = monde();
  const titres = (l: any) => l.conceptions.map((x: any) => x.titre);
  assert.deepEqual(titres(k.listerConceptions(db, lea, u)).sort(), ["Vent d'Orak", 'Étoile du soir'].sort());
  assert.deepEqual(titres(k.listerConceptions(db, roxane, u)), ['Étoile du soir']);
  const a = k.listerConceptions(db, antor, u);
  assert.equal(a.conceptions.length, 2);
  assert.deepEqual(a.fichesSansConception!.map((f) => f.titre), ['Aube de Sel']);
  assert.equal(a.peutCreer, true);
  assert.equal(k.listerConceptions(db, lea, u).peutCreer, false);
  assert.equal(k.listerConceptions(db, lea, u).fichesSansConception, undefined);
  assert.equal(k.listerConceptions(db, roxane, u).fichesSansConception, undefined);
  assert.equal(k.listerConceptions(db, { ...antor, modeJoueur: true }, u).conceptions.length, 1);
  assert.equal(k.listerConceptions(db, mira, u).conceptions.length, 2);
});

test("coque retirée : texte inchangé, bloquante à la lecture, enregistrement refusé, remplacement accepté", () => {
  const { db, u, antor, lea, etoile } = monde();
  const avant = section(db, etoile).contenu;
  const vAvant = k.lireConception(db, lea, u, etoile);
  c.retirerElement(db, antor, u, OUTIL, 'coques', 'eclaireur', { retire: true });
  assert.equal(section(db, etoile).contenu, avant);
  const v = k.lireConception(db, lea, u, etoile);
  assert.ok(v.alertes.some((a) => a.niveau === 'bloquante' && a.texte === 'Élément retiré de cet univers : Éclaireur. Remplacez-le pour enregistrer.'));
  assert.equal(v.resultat.prix, vAvant.resultat.prix);
  const choix = [ligne('moteurs', 'moteur-1')];
  const e = err(() => k.enregistrerConception(db, lea, u, etoile, { coque: 'eclaireur', choix, version: v.version }));
  assert.deepEqual([e.code, e.detail], ['invalide', 'conception_bloquee']);
  assert.equal(section(db, etoile).contenu, avant);
  const ok = k.enregistrerConception(db, lea, u, etoile, { coque: 'croiseur', choix, version: v.version });
  assert.equal(ok.coque.cle, 'croiseur');
  assert.ok(!ok.alertes.some((a) => a.code === 'element_retire'));
});

test("création sur une coque retirée : element_indisponible, rien d'écrit", () => {
  const { db, u, antor, aube } = monde();
  c.retirerElement(db, antor, u, OUTIL, 'coques', 'eclaireur', { retire: true });
  const e = err(() => k.creerConception(db, antor, u, { ficheId: aube, coque: 'eclaireur' }));
  assert.deepEqual([e.code, e.detail], ['invalide', 'element_indisponible']);
  assert.equal(rangee(db, aube), undefined);
});

test("lance masquée : conservée par Léa sans alerte, absente du catalogue, refusée en nouvelle ligne", () => {
  const { db, u, antor, lea, orak, etoile } = monde();
  const page = (a: any) => JSON.stringify(c.lireCatalogue(db, a, { niveau: 'univers', id: u }, OUTIL, { nature: 'armes' } as any));
  assert.ok(page(lea).includes('lance-d-essai'));
  const ligneCat = c.lireCatalogueGestion(db, antor, u, OUTIL, { nature: 'armes' } as any) as any;
  const version = (ligneCat.elements ?? ligneCat.lignes ?? []).find((x: any) => x.cle === 'lance-d-essai')?.version ?? 1;
  c.masquerElement(db, antor, u, OUTIL, 'armes', 'lance-d-essai', { masque: true, version });
  assert.ok(!page(lea).includes('lance-d-essai'));
  const cur = k.lireConception(db, lea, u, orak);
  assert.ok(cur.lignes.some((l) => l.cle === 'lance-d-essai'));
  assert.deepEqual(cur.alertes, []);
  const v = k.enregistrerConception(db, lea, u, orak, { coque: 'fregate', choix: CHOIX_ORAK, version: cur.version });
  assert.deepEqual(v.alertes, []);
  assert.equal(v.resultat.prix, 685000);
  const e = err(() => k.enregistrerConception(db, lea, u, etoile, { coque: 'eclaireur',
    choix: [ligne('moteurs', 'moteur-1'), ligne('armes', 'lance-d-essai')], version: 2 }));
  assert.deepEqual([e.code, e.detail], ['invalide', 'element_indisponible']);
  // même refus qu'une clé inconnue
  const e2 = err(() => k.enregistrerConception(db, lea, u, etoile, { coque: 'eclaireur',
    choix: [ligne('moteurs', 'moteur-1'), ligne('armes', 'xxx')], version: 2 }));
  assert.deepEqual([e2.code, e2.detail, e2.message], [e.code, e.detail, e.message]);
});

test("recalculerSection après portee_saut = 6 : 18 cases, ligne et section s'accordent", () => {
  const { db, u, antor, orak } = monde();
  const sec = section(db, orak);
  const avant = rangee(db, orak);
  poserPortee(db, antor, u, 6);
  const vue = sg.recalculerSection(db, antor.compteId, u, orak, sec.id, sec.version);
  const apres = rangee(db, orak);
  const s2 = section(db, orak);
  assert.ok(s2.contenu.includes('18 cases'), s2.contenu);
  assert.ok(!s2.contenu.includes('15 cases'));
  assert.equal(JSON.parse(apres.resultat).porteeSaut, 18);
  assert.equal(apres.version, avant.version + 1);
  assert.notEqual(apres.version_reglages, avant.version_reglages);
  assert.equal(s2.source_version, calc.versionSourceVaisseaux(db, u));
  assert.equal(s2.version, sec.version + 1);
  assert.equal(apres.version_catalogue, avant.version_catalogue);
  void vue;
  assert.equal(k.lireConception(db, antor, u, orak).resultat.porteeSaut, 18);
});

test("recalculerSection avec un élément retiré : element_retire, rien d'écrit", () => {
  const { db, u, antor, etoile } = monde();
  const sec = section(db, etoile);
  const avantL = rangee(db, etoile);
  poserPortee(db, antor, u, 6); // rend la section périmée : sans cela le recalcul est un no-op
  c.retirerElement(db, antor, u, OUTIL, 'moteurs', 'moteur-1', { retire: true });
  const e = err(() => sg.recalculerSection(db, antor.compteId, u, etoile, sec.id, sec.version));
  assert.deepEqual([e.code, e.detail], ['invalide', 'element_retire']);
  assert.deepEqual(section(db, etoile), sec);
  assert.deepEqual(rangee(db, etoile), avantL);
});

test('outil désactivé : tout est introuvable', () => {
  const { db, u, antor, lea, orak } = monde();
  const sys = (db.prepare('SELECT systeme_id s FROM univers WHERE id = ?').get(u) as any).s;
  o.poserActivation(db, antor, { niveau: 'systeme', id: sys }, OUTIL, false);
  assert.equal(err(() => k.lireConception(db, lea, u, orak)).code, 'introuvable');
  assert.equal(err(() => k.listerConceptions(db, antor, u)).code, 'introuvable');
  assert.equal(err(() => calc.calculerDepuisChoix(db, antor, u, { coque: 'fregate', choix: [] })).code, 'introuvable');
});


test("Étoile du soir : un réenregistrement par Léa garde la section lisible des joueurs et le texte à jour", () => {
  const { db, u, lea, roxane, etoile } = monde();
  const avant = section(db, etoile);
  assert.equal(avant.joueurs_lisent, 1);
  const r0 = k.lireConception(db, roxane, u, etoile);
  const v = k.enregistrerConception(db, lea, u, etoile, { coque: 'eclaireur', choix: [ligne('moteurs', 'moteur-1'), ligne('armes', 'laser')], version: r0.version });
  assert.equal(v.version, r0.version + 1);
  const apres = section(db, etoile);
  assert.deepEqual([apres.joueurs_lisent, apres.auteur_id, apres.gere_par], [1, avant.auteur_id, avant.gere_par]);
  const r1 = k.lireConception(db, roxane, u, etoile);
  assert.equal(r1.version, r0.version + 1);
  assert.equal(r1.resultat.prix, 50000);
});
