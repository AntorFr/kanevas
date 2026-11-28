import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { importerConceptions } = await import('./import-conceptions.js');
const c = await import('../catalogues.js');
const k = await import('./conceptions.js');

const OUTIL = 'swn/vaisseaux';
const ex = (nom: string) => JSON.parse(readFileSync(new URL(`../../outils/swn/exemples/${nom}`, import.meta.url), 'utf8'));

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const antor = { compteId: (db.prepare('SELECT id FROM comptes WHERE username = ?').get('antor') as any).id as number };
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, ex('catalogue-essai.json'));
  c.appliquerCatalogue(db, antor, { niveau: 'univers', id: u }, OUTIL, ex('catalogue-essai-conceptions.json'));
  const imp = (corps: unknown) => importerConceptions(db, antor, u, corps);
  const fiches = () => (db.prepare("SELECT COUNT(*) n FROM fiches WHERE univers_id = ? AND type = 'vaisseau'").get(u) as any).n as number;
  const id = (cle: string) => (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND cle = ?').get(u, cle) as any)?.id as number;
  return { db, antor, u, imp, fiches, id };
}
const cpt = (r: any) => r.natures.conceptions;


const L = (nature: string, cle: string, quantite = 1, extra: Record<string, unknown> = {}) => ({ nature, cle, quantite, ...extra });
const conc = (cle: string, choix: unknown[], extra: Record<string, unknown> = {}) => ({ cle, titre: `T ${cle}`, coque: 'fregate', choix, ...extra });
const FREG = [L('moteurs', 'moteur-2'), L('amenagements', 'cabines'), L('armes', 'laser', 2)];
const lireRangee = (m: ReturnType<typeof monde>, cle: string) => m.db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(m.id(cle)) as any;
const bilan = (m: ReturnType<typeof monde>) => ({
  fiches: m.db.prepare('SELECT id, modifie_le, titre FROM fiches ORDER BY id').all(),
  conceptions: m.db.prepare('SELECT fiche_id, version, choix FROM swn_conceptions ORDER BY fiche_id').all(),
  sections: m.db.prepare('SELECT id, version, contenu FROM sections ORDER BY id').all(),
  historique: (m.db.prepare('SELECT COUNT(*) n FROM historique').get() as any).n,
});

test('quatre conceptions : 4 créées aux prix, PV, puissance et masse calculés à la main', () => {
  const m = monde();
  const r = m.imp(ex('conceptions-essai.json'));
  assert.deepEqual(cpt(r), { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
  assert.deepEqual(r.refus, []);
  // [prix, pv, ca, puissance libre, masse libre, emports utilisés, emports]
  const attendu: Record<string, number[]> = {
    'essai-eclaireur-leger': [25000, 8, 14, 8, 7, 0, 1],
    'essai-eclaireur-blinde': [29000, 13, 15, 8, 5, 0, 1],
    'essai-fregate-de-ligne': [650000, 30, 14, 5, 10, 2, 3],
    // croiseur : 1 000 000 + moteur 120 000 + soute 100 000 + automatisation 6 000 + lasers 500 000 + canon 120 000
    // + 3 chargeurs 3 000 (renforts 10 000 and montage 3 000 stay on their lines, B-95) ; puissance 50 − 9 − 1 − (12 − 3 du montage) − 1 = 30 ; masse 40 − 28 = 12 ; PV 60 + 2 × 4
    'essai-croiseur-complet': [1849000, 68, 15, 30, 12, 3, 5],
  };
  for (const [cle, att] of Object.entries(attendu)) {
    const x: any = k.lireConception(m.db, m.antor, m.u, m.id(cle)).resultat;
    assert.deepEqual([x.prix, x.pv, x.ca, x.puissanceLibre, x.masseLibre, x.emports.utilises, x.emports.total], att, cle);
  }
  const ligne = lireRangee(m, 'essai-croiseur-complet');
  assert.deepEqual([ligne.pj, ligne.robots, ligne.equipage], [2, 1, 10]);
  const choix = JSON.parse(ligne.choix);
  assert.equal(choix.find((l: any) => l.cle === 'canon-leger').magasins, 2);
  assert.equal(choix.find((l: any) => l.cle === 'renfort').integre, 1);
  assert.deepEqual(choix.find((l: any) => l.cle === 'montage').cibles, [{ nature: 'armes', cle: 'laser', quantite: 1 }]);
});

test('rejeu à l’identique : 4 inchangées, rien ne bouge ; ordre des lignes changé : inchangée ; une ligne changée : 1 mise à jour', () => {
  const m = monde();
  m.imp(ex('conceptions-essai.json'));
  const avant = bilan(m);
  assert.deepEqual(cpt(m.imp(ex('conceptions-essai.json'))), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  assert.deepEqual(bilan(m), avant);

  const f = ex('conceptions-essai.json');
  f.conceptions[3].choix.reverse();
  f.conceptions[2].choix.reverse();
  assert.deepEqual(cpt(m.imp(f)), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  assert.deepEqual(bilan(m), avant);

  const g = ex('conceptions-essai.json');
  g.conceptions[0].choix.push({ nature: 'defenses', cle: 'blindage', quantite: 1 });
  assert.deepEqual(cpt(m.imp(g)), { creees: 0, mises_a_jour: 1, inchangees: 3, refusees: 0 });
  const apres = bilan(m);
  assert.equal(apres.fiches.length, avant.fiches.length);
  const diff = apres.conceptions.filter((c: any, i: number) => JSON.stringify(c) !== JSON.stringify(avant.conceptions[i]));
  assert.equal(diff.length, 1);
  assert.equal((diff[0] as any).fiche_id, m.id('essai-eclaireur-leger'));
  assert.equal((diff[0] as any).version, (avant.conceptions.find((c: any) => c.fiche_id === m.id('essai-eclaireur-leger')) as any).version + 1);
  assert.equal(((k.lireConception(m.db, m.antor, m.u, m.id('essai-eclaireur-leger')).resultat) as any).prix, 29000);
  // le retour au fichier d'origine est lui aussi une mise à jour
  assert.deepEqual(cpt(m.imp(ex('conceptions-essai.json'))), { creees: 0, mises_a_jour: 1, inchangees: 3, refusees: 0 });
});

test('visibilité : mj par défaut, joueurs si demandé ; rejeu avec un autre titre ne renomme pas', () => {
  const m = monde();
  m.imp(ex('conceptions-essai.json'));
  const lisent = (cle: string) => (m.db.prepare("SELECT joueurs_lisent v FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL").get(m.id(cle)) as any).v;
  assert.equal(lisent('essai-eclaireur-leger'), 0);
  assert.equal(lisent('essai-fregate-de-ligne'), 1);
  const f = ex('conceptions-essai.json');
  f.conceptions[0].titre = 'Un autre titre';
  assert.deepEqual(cpt(m.imp(f)), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  assert.equal((m.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(m.id('essai-eclaireur-leger')) as any).titre, 'Éclaireur léger');
  // un rejeu qui met à jour ne renomme pas non plus
  f.conceptions[0].choix.push({ nature: 'defenses', cle: 'blindage', quantite: 1 });
  assert.equal(cpt(m.imp(f)).mises_a_jour, 1);
  assert.equal((m.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(m.id('essai-eclaireur-leger')) as any).titre, 'Éclaireur léger');
});

test('refus : chacun porte son champ, laisse passer les autres et ne laisse aucune fiche', () => {
  const m = monde();
  const bonne = conc('bonne-conception', FREG);
  const cas: Array<[string, unknown, string]> = [
    ['coque inconnue', { ...conc('r-coque', FREG), coque: 'nimporte' }, 'coque'],
    ['élément inconnu', conc('r-inconnu', [L('moteurs', 'moteur-9')]), 'choix[0].cle'],
    ['élément en double', conc('r-double', [L('moteurs', 'moteur-2'), L('moteurs', 'moteur-2')]), 'choix[1]'],
    ['quantité 0', conc('r-q0', [L('moteurs', 'moteur-2', 0)]), 'choix[0].quantite'],
    ['quantité 100', conc('r-q100', [L('moteurs', 'moteur-2', 100)]), 'choix[0].quantite'],
    ['cible_invalide', conc('r-cible', [...FREG, L('modifications', 'montage', 1, { cibles: [{ nature: 'armes', cle: 'canon-leger', quantite: 1 }] })]), 'choix'],
    ['cible_deja_visee', conc('r-deja', [...FREG, L('modifications', 'montage', 2, { cibles: [{ nature: 'armes', cle: 'laser', quantite: 1 }, { nature: 'armes', cle: 'laser', quantite: 1 }] })]), 'choix'],
    ['alerte bloquante', conc('r-bloquee', [L('moteurs', 'moteur-2'), L('amenagements', 'cabines', 3), L('armes', 'laser', 3)]), 'choix'],
    ['champ inconnu', { ...conc('r-champ', FREG), couleur: 'rouge' }, 'couleur'],
    ['choix : clé de ligne inconnue', conc('r-ligne', [{ nature: 'moteurs', cle: 'moteur-2', quantite: 1, bidule: 1 }]), 'choix[0].bidule'],
  ];
  const avantFiches = m.fiches();
  const r = m.imp({ conceptions: [...cas.map((c) => c[1]), bonne] });
  assert.deepEqual(cpt(r), { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: cas.length });
  assert.equal(r.refusTotal, cas.length);
  assert.deepEqual(r.refus.map((x) => [x.cle, x.champ]), cas.map((c, i) => [(c[1] as any).cle, `conceptions[${i}].${c[2]}`]));
  assert.equal(m.fiches(), avantFiches + 1);
  for (const c of cas) assert.equal(m.id((c[1] as any).cle), undefined, c[0]);
  assert.ok(m.id('bonne-conception'));
});

test('élément masqué : refusé en nouvelle ligne, aucune fiche', () => {
  const m = monde();
  const v = (c.lireCatalogueGestion(m.db, m.antor, m.u, OUTIL, { nature: 'armes' } as any) as any).elements.find((x: any) => x.cle === 'laser').version;
  c.masquerElement(m.db, m.antor, m.u, OUTIL, 'armes', 'laser', { masque: true, version: v });
  const r = m.imp({ conceptions: [conc('masque', FREG), conc('sans-laser', [L('moteurs', 'moteur-2')])] });
  assert.deepEqual(cpt(r), { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 1 });
  assert.deepEqual(r.refus.map((x) => [x.cle, x.champ]), [['masque', 'conceptions[0].choix[2].cle']]);
  assert.equal(m.id('masque'), undefined);
});

test('clé d’une fiche d’un autre type refusée ; clé d’un vaisseau existant sans conception acceptée', () => {
  const m = monde();
  m.db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('un-lieu', 'ecran', ?, 'lieu', 'Un lieu', '{}', 'x', 'x')").run(m.u);
  const avant = m.db.prepare("SELECT titre, type FROM fiches WHERE cle = 'un-lieu'").get();
  const r = m.imp({ conceptions: [conc('un-lieu', FREG)] });
  assert.deepEqual(cpt(r), { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 1 });
  assert.equal(r.refus[0]!.champ, 'conceptions[0].cle');
  assert.deepEqual(m.db.prepare("SELECT titre, type FROM fiches WHERE cle = 'un-lieu'").get(), avant);
  assert.equal(m.db.prepare("SELECT COUNT(*) n FROM swn_conceptions WHERE fiche_id = ?").get(m.id('un-lieu')) !== undefined, true);
  assert.equal((m.db.prepare("SELECT COUNT(*) n FROM swn_conceptions WHERE fiche_id = ?").get(m.id('un-lieu')) as any).n, 0);
  // doublon de clé dans le fichier
  const d = m.imp({ conceptions: [conc('meme', FREG), conc('meme', FREG)] });
  assert.deepEqual(cpt(d), { creees: 1, mises_a_jour: 0, inchangees: 0, refusees: 1 });
  assert.equal(d.refus[0]!.champ, 'conceptions[1].cle');
});

test('conception périmée rejouée à l’identique : reste périmée et inchangée', () => {
  const m = monde();
  m.imp(ex('conceptions-essai.json'));
  const f = ex('catalogue-essai.json');
  f.version = '2026-12-nouvelle';
  f.moteurs[0].cout = 5500;
  c.appliquerCatalogue(m.db, m.antor, { niveau: 'univers', id: m.u }, OUTIL, f);
  const etat = () => k.lireConception(m.db, m.antor, m.u, m.id('essai-eclaireur-leger')).perime;
  assert.equal(etat(), true);
  const avant = bilan(m);
  assert.deepEqual(cpt(m.imp(ex('conceptions-essai.json'))), { creees: 0, mises_a_jour: 0, inchangees: 4, refusees: 0 });
  assert.equal(etat(), true);
  assert.deepEqual(bilan(m), avant);
});

test('taille : 501 éléments invalide sans écriture ; forme du corps', () => {
  const m = monde();
  const avant = bilan(m);
  const trop = Array.from({ length: 501 }, (_, i) => conc(`lot-${i}`, FREG));
  let e: any;
  try { m.imp({ conceptions: trop }); } catch (x) { e = x; }
  assert.equal(e?.code, 'invalide');
  assert.deepEqual(bilan(m), avant);
  for (const mauvais of [null, [], { conceptions: 'x' }, { conceptions: [], autre: 1 }]) {
    let x: any;
    try { m.imp(mauvais); } catch (err) { x = err; }
    assert.equal(x?.code, 'invalide', JSON.stringify(mauvais));
  }
  assert.deepEqual(cpt(m.imp({ conceptions: [] })), { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 });
  assert.deepEqual(bilan(m), avant);
});

test('élément masqué après coup : la conception qui le porte déjà se rejoue inchangée', () => {
  const m = monde();
  m.imp({ conceptions: [conc('avec-laser', FREG)] });
  const v = (c.lireCatalogueGestion(m.db, m.antor, m.u, OUTIL, { nature: 'armes' } as any) as any).elements.find((x: any) => x.cle === 'laser').version;
  c.masquerElement(m.db, m.antor, m.u, OUTIL, 'armes', 'laser', { masque: true, version: v });
  const avant = bilan(m);
  assert.deepEqual(cpt(m.imp({ conceptions: [conc('avec-laser', FREG)] })), { creees: 0, mises_a_jour: 0, inchangees: 1, refusees: 0 });
  assert.deepEqual(bilan(m), avant);
});
