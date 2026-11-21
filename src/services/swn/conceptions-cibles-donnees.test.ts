import assert from 'node:assert/strict';
import { test } from 'node:test';

// kanevas-concepteur-vaisseaux-cibles-donnees (B-94, H-8, H-10 (3) and (5), H-cibles-1 (1)): `cibles` from the import to the stored
// line, the single reading of an old `vise`, the replay fingerprint. The invented catalogue is written here; expectations are hand-written.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';

const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const k = await import('./conceptions.js');
const c = await import('../catalogues.js');
const { lireCatalogueGestion } = c;

const OUTIL = 'swn/vaisseaux';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const arme = (cle: string) => ({ cle, nom: cle.toUpperCase(), emport: 1, munitions: 0, cout_munition: 0, ...el, puissance: 2, masse: 1 });
function fichier(version: string, extra: Record<string, unknown[]> = {}): any {
  return {
    catalogue: OUTIL, version,
    coques: [{ cle: 'fr', nom: 'FR', classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 40, masse: 40, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, emports: 6 }],
    moteurs: [], amenagements: [{ cle: 'cargo', nom: 'Cargo', ...el, soute: 50 }], defenses: [],
    armes: [arme('la'), arme('lb')],
    modifications: [
      { cle: 'mont', nom: 'Mont', ...el, effet: 'montages_specialises', limite: 3 },
      { cle: 'surch', nom: 'Surch', ...el, effet: 'surcharge_cumulable', effet_pct: 50, limite: 2 },
      { cle: 'sdim', nom: 'Sdim', ...el, effet: 'surdimensionne', limite: 1 },
      { cle: 'mniv', nom: 'Mniv', ...el, effet: 'moteur_niveau', limite: 1 },
      { cle: 'mag', nom: 'Mag', ...el, effet: 'magasins_doubles', limite: 1 },
      { cle: 'sou', nom: 'Sou', ...el, effet: 'soutes_doublees', limite: 1 },
      { cle: 'simple', nom: 'Simple', ...el },
    ],
    exemples: [],
    ...extra,
  };
}
const exemple = (cle: string, choix: unknown[]) => ({ cle, nom: cle, coque: 'fr', choix });
const PAIRES = [{ nature: 'armes', cle: 'la', quantite: 2 }, { nature: 'armes', cle: 'lb', quantite: 1 }];

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const compte = (n: string) => (db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as any).id as number;
  const u = (db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const orak = (db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, "Vent d'Orak") as any).id as number;
  const antor = { compteId: compte('antor') };
  const cible = { niveau: 'univers' as const, id: u };
  const appliquer = (f: unknown) => c.appliquerCatalogue(db, antor, cible, OUTIL, f);
  return { db, u, orak, antor, lea: { compteId: compte('lea') }, cible, appliquer };
}
const rapport = (r: any) => ({ ajoutes: r.ajoutes, modifies: r.modifies, inchanges: r.inchanges, refuses: r.refuses?.length ?? r.refusees });
const donnees = (w: any, nature: string, cle: string) =>
  (lireCatalogueGestion(w.db, w.antor, w.u, OUTIL, { nature } as any).elements as any[]).find((e) => e.cle === cle);

test('catalogue : surdimensionne et moteur_niveau sont créés, inchangés au rejeu ; un vise du fichier est ignoré sans refus', () => {
  const w = monde();
  const f = fichier('d1');
  f.modifications.find((m: any) => m.cle === 'mont').vise = { nature: 'armes', cle: 'la' };
  f.modifications.find((m: any) => m.cle === 'simple').vise = 'la';
  f.modifications.find((m: any) => m.cle === 'mag').vise = { nature: 'armes', cle: 'la' };
  const r1: any = w.appliquer(f);
  assert.equal(JSON.stringify(r1).includes('refus') && (r1.refus?.length ?? r1.refuses?.length ?? 0) > 0, false, JSON.stringify(r1));
  const lu = (cle: string) => w.db.prepare("SELECT * FROM swn_catalogue_modifications WHERE univers_id = ? AND cle = ?").get(w.u, cle) as any;
  for (const [cle, effet] of [['sdim', 'surdimensionne'], ['mniv', 'moteur_niveau'], ['mont', 'montages_specialises'], ['simple', null]]) {
    assert.equal(lu(cle as string)?.effet ?? null, effet, cle as string);
  }
  const avant = w.db.prepare('SELECT * FROM swn_catalogue_modifications WHERE univers_id = ? ORDER BY cle').all(w.u);
  const r2: any = w.appliquer(f);
  assert.deepEqual(w.db.prepare('SELECT * FROM swn_catalogue_modifications WHERE univers_id = ? ORDER BY cle').all(w.u), avant);
  assert.ok(!JSON.stringify(r2).includes('"modifies":1'), JSON.stringify(r2));
});

test('catalogue : limite 1 exigée pour surdimensionne et moteur_niveau, plus pour montages_specialises', () => {
  const w = monde();
  const f = fichier('d1');
  f.modifications.find((m: any) => m.cle === 'sdim').limite = 2;
  f.modifications.find((m: any) => m.cle === 'mniv').limite = 0;
  const r: any = w.appliquer(f);
  const refus = (r.refuses ?? r.refus ?? []) as any[];
  assert.deepEqual(refus.map((x) => x.cle).sort(), ['mniv', 'sdim']);
  assert.ok(refus.every((x) => x.champ === 'limite'), JSON.stringify(refus));
  assert.ok(w.db.prepare("SELECT 1 FROM swn_catalogue_modifications WHERE cle = 'mont'").get());
  // montages_specialises: any limit
  for (const limite of [0, 1, 2, 9]) {
    const g = fichier(`m${limite}`); g.modifications.find((m: any) => m.cle === 'mont').limite = limite;
    const rr: any = w.appliquer(g);
    assert.equal((rr.refuses ?? rr.refus ?? []).some((x: any) => x.cle === 'mont'), false, `limite ${limite}`);
  }
  // no parameter, no target on the two new effects
  const h = fichier('p1');
  h.modifications.find((m: any) => m.cle === 'sdim').valeur = 2;
  h.modifications.find((m: any) => m.cle === 'mniv').effet_pct = 50;
  const rh: any = w.appliquer(h);
  assert.deepEqual(((rh.refuses ?? rh.refus) as any[]).map((x) => [x.cle, x.champ]).sort(), [['mniv', 'effet_pct'], ['sdim', 'valeur']]);
});

test('exemple : une ligne montages_specialises de quantité 3 et deux paires est créée, rendue, rejouée inchangée ; une quantité ou une clé changée est une modification', () => {
  const w = monde();
  const ligne = { nature: 'modifications', cle: 'mont', quantite: 3, cibles: PAIRES };
  const f = fichier('e1', { exemples: [exemple('ex', [{ nature: 'armes', cle: 'la', quantite: 1 }, { nature: 'armes', cle: 'lb', quantite: 1 }, ligne])] });
  const r1: any = w.appliquer(f);
  assert.deepEqual((r1.refuses ?? r1.refus ?? []), [], JSON.stringify(r1));
  const lu: any = donnees(w, 'exemples', 'ex');
  assert.ok(lu, 'exemple relu');
  const choix = (lu.donnees ?? lu).choix;
  assert.deepEqual(choix[2], ligne);
  // replay: same fingerprint, so nothing changes
  const avant = JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples').all());
  const vAvant = JSON.stringify(c.resumeCatalogue(w.db, w.cible, OUTIL));
  w.appliquer(f);
  assert.equal(JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples').all()), avant);
  assert.equal(JSON.stringify(c.resumeCatalogue(w.db, w.cible, OUTIL)), vAvant);
  // read data re-imported = same fingerprint
  const relu = JSON.parse(JSON.stringify(choix));
  const g = fichier('e1', { exemples: [exemple('ex', relu)] });
  w.appliquer(g);
  assert.equal(JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples').all()), avant);
  // a quantity moved: the example changes
  const q = JSON.parse(JSON.stringify(f)); q.exemples[0].choix[2].cibles[0].quantite = 3;
  const rq: any = w.appliquer(q);
  assert.notEqual(JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples').all()), avant);
  assert.ok(JSON.stringify(rq).includes('modifies'), JSON.stringify(rq));
  // a key moved: the example changes again
  const avant2 = JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples').all());
  const kk = JSON.parse(JSON.stringify(q)); kk.exemples[0].choix[2].cibles[1].cle = 'la';
  w.appliquer(kk);
  assert.notEqual(JSON.stringify(w.db.prepare('SELECT * FROM swn_catalogue_exemples').all()), avant2);
});

test('exemple : cibles sur une ligne qui ne vise rien est refusé (champ cibles), sur les trois effets visant il passe', () => {
  const w = monde();
  const paire = [{ nature: 'armes', cle: 'la', quantite: 1 }];
  const mauvais = ['mag', 'sou', 'simple', 'mniv'].map((cle) => exemple(`x-${cle}`, [{ nature: 'modifications', cle, quantite: 1, cibles: paire }]));
  mauvais.push(exemple('x-arme', [{ nature: 'armes', cle: 'la', quantite: 1, cibles: paire }]));
  const bons = ['mont', 'surch', 'sdim'].map((cle) => exemple(`ok-${cle}`, [{ nature: 'modifications', cle, quantite: 1, cibles: paire }]));
  const r: any = w.appliquer(fichier('e2', { exemples: [...mauvais, ...bons] }));
  const refus = (r.refuses ?? r.refus) as any[];
  assert.deepEqual(refus.map((x) => x.cle).sort(), mauvais.map((x) => x.cle).sort(), JSON.stringify(refus));
  assert.ok(refus.every((x) => x.champ === 'cibles'), JSON.stringify(refus));
  assert.ok(refus.every((x) => String(x.raison).includes('cibles_invalide')), JSON.stringify(refus));
  for (const b of bons) assert.ok(w.db.prepare('SELECT 1 FROM swn_catalogue_exemples WHERE cle = ?').get(b.cle), b.cle);
});

test('exemple : cibles mal formées (liste vide, quantité 0, nature inconnue, champ en trop) refusées', () => {
  const w = monde();
  const base = { nature: 'modifications', cle: 'mont', quantite: 1 };
  const cas: [string, unknown][] = [
    ['vide', []], ['q0', [{ nature: 'armes', cle: 'la', quantite: 0 }]], ['q100', [{ nature: 'armes', cle: 'la', quantite: 100 }]],
    ['nature', [{ nature: 'zzz', cle: 'la', quantite: 1 }]], ['extra', [{ nature: 'armes', cle: 'la', quantite: 1, x: 1 }]],
    ['chaine', 'la'], ['sans-cle', [{ nature: 'armes', quantite: 1 }]],
  ];
  const r: any = w.appliquer(fichier('e3', { exemples: cas.map(([n, v]) => exemple(`m-${n}`, [{ ...base, cibles: v }])) }));
  const refus = (r.refuses ?? r.refus) as any[];
  assert.equal(refus.length, cas.length, JSON.stringify(refus));
});

/** A design saved before the slice: saved through the service, then its stored `choix` and `resultat` put back to the old shape (`vise`, no `cibles`). */
function ancienne(w: any, choix: unknown[]) {
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix, version: cur.version });
  const ancien = (l: any) => {
    const { cibles, ...reste } = l;
    return cibles ? { ...reste, vise: { nature: cibles[0].nature, cle: cibles[0].cle } } : l;
  };
  const row = w.db.prepare('SELECT choix, resultat FROM swn_conceptions WHERE fiche_id = ?').get(w.orak) as any;
  const resultat = JSON.parse(row.resultat); resultat.lignes = resultat.lignes.map(ancien);
  w.db.prepare('UPDATE swn_conceptions SET choix = ?, resultat = ? WHERE fiche_id = ?')
    .run(JSON.stringify(JSON.parse(row.choix).map(ancien)), JSON.stringify(resultat), w.orak);
}
const rangee = (db: any, f: number) => JSON.stringify(db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ?').get(f));
const sectionG = (db: any, f: number) => JSON.stringify(db.prepare('SELECT * FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL').get(f));

test("conception d'avant : un vise sur une ligne de quantité 2 se relit en une paire de quantité 2, sans écriture ; magasins_doubles l'ignore ; soutes_doublees le garde", () => {
  const w = monde();
  w.appliquer(fichier('c1'));
  ancienne(w, [
    { nature: 'armes', cle: 'la', quantite: 1 },
    { nature: 'modifications', cle: 'mont', quantite: 2, cibles: [{ nature: 'armes', cle: 'la', quantite: 2 }] },
    { nature: 'modifications', cle: 'mag', quantite: 1, vise: { nature: 'armes', cle: 'la' } },
    { nature: 'amenagements', cle: 'cargo', quantite: 1 },
    { nature: 'modifications', cle: 'sou', quantite: 1, vise: { nature: 'amenagements', cle: 'cargo' } },
  ]);
  assert.ok(JSON.parse((w.db.prepare('SELECT choix FROM swn_conceptions WHERE fiche_id = ?').get(w.orak) as any).choix).every((l: any) => l.cibles === undefined));
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  const r0 = rangee(w.db, w.orak), s0 = sectionG(w.db, w.orak);
  const v: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  const ligne = (cle: string) => v.lignes.find((l: any) => l.cle === cle);
  assert.deepEqual(ligne('mont').cibles, [{ nature: 'armes', cle: 'la', quantite: 2 }]);
  assert.equal(ligne('mag').cibles, undefined);
  assert.equal(ligne('sou').cibles, undefined);
  assert.deepEqual(ligne('sou').vise, { nature: 'amenagements', cle: 'cargo' });
  assert.equal(v.version, cur.version);
  assert.equal(rangee(w.db, w.orak), r0);
  assert.equal(sectionG(w.db, w.orak), s0);
  // a second read, by the GM, writes nothing either
  k.lireConception(w.db, w.antor, w.u, w.orak);
  assert.equal(rangee(w.db, w.orak), r0);
});

test("l'enregistrement écrit cibles et plus de vise pour les trois effets visant ; soutes_doublees garde son vise ; ancien vise relu avec la quantité de la ligne", () => {
  const w = monde();
  w.appliquer(fichier('c2'));
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  ancienne(w, [
    { nature: 'armes', cle: 'la', quantite: 1 },
    { nature: 'armes', cle: 'lb', quantite: 1 },
    { nature: 'modifications', cle: 'mont', quantite: 2, cibles: [{ nature: 'armes', cle: 'la', quantite: 2 }] },
    { nature: 'amenagements', cle: 'cargo', quantite: 1 },
    { nature: 'modifications', cle: 'sou', quantite: 1, vise: { nature: 'amenagements', cle: 'cargo' } },
  ]);
  const v1: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  const entree = v1.lignes.map((l: any) => ({ nature: l.nature, cle: l.cle, quantite: l.quantite, ...(l.vise ? { vise: l.vise } : {}), ...(l.cibles ? { cibles: l.cibles } : {}) }));
  const v2: any = k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix: entree, version: v1.version });
  const stocke = JSON.parse((w.db.prepare('SELECT choix FROM swn_conceptions WHERE fiche_id = ?').get(w.orak) as any).choix);
  const s = (cle: string) => stocke.find((l: any) => l.cle === cle);
  assert.deepEqual(s('mont').cibles, [{ nature: 'armes', cle: 'la', quantite: 2 }]);
  assert.equal(s('mont').vise, undefined);
  assert.deepEqual(s('sou').vise, { nature: 'amenagements', cle: 'cargo' });
  assert.equal(s('sou').cibles, undefined);
  assert.equal(v2.version, v1.version + 1);
  void cur;
});

test("enregistrement : cibles sur un élément qui ne vise rien, ou mal formées, refusés sans rien écrire (champ choix / cibles)", () => {
  const w = monde();
  w.appliquer(fichier('c3'));
  const cur: any = k.lireConception(w.db, w.lea, w.u, w.orak);
  const r0 = rangee(w.db, w.orak);
  const essai = (ligne: any) => { try { k.enregistrerConception(w.db, w.lea, w.u, w.orak, { coque: 'fr', choix: [{ nature: 'armes', cle: 'la', quantite: 1 }, ligne], version: cur.version }); return null; } catch (x: any) { return x; } };
  const paire = [{ nature: 'armes', cle: 'la', quantite: 1 }];
  for (const cle of ['mag', 'sou', 'simple', 'mniv']) {
    const e = essai({ nature: 'modifications', cle, quantite: 1, cibles: paire });
    assert.deepEqual([e?.code, e?.detail, e?.champ], ['invalide', 'cibles_invalide', 'cibles'], cle);
  }
  for (const mal of [[{ nature: 'armes', cle: 'la', quantite: 0 }], [{ nature: 'armes', cle: 'la' }], 'la', [{ nature: 'zzz', cle: 'la', quantite: 1 }], [{ nature: 'armes', cle: 'la', quantite: 1, extra: 1 }]]) {
    const e = essai({ nature: 'modifications', cle: 'mont', quantite: 1, cibles: mal });
    assert.equal(e?.code, 'invalide', JSON.stringify(mal));
  }
  assert.equal(rangee(w.db, w.orak), r0);
});
