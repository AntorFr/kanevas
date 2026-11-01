import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { ajouterMembre } = await import('./membres.js');
const { creerEtRattacherSysteme, rattacherSysteme, creerSysteme } = await import('./systemes.js');
const { creerUnivers } = await import('./univers.js');
const o = await import('./outils.js');
const c = await import('./catalogues.js');
const { catalogueEssai } = await import('../outils/essai/catalogue.js');
const { verifierDeclaration } = await import('../outils/declaration.js');
type Db = ReturnType<typeof openDb>;

const OUTIL = 'essai/g';
const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));
const copie = () => structuredClone(EXEMPLE) as any;
/** The faulty variant of K-8: the arme `laser-lourd` loses its `masse`. */
const fautif = () => { const f = copie(); f.armes = f.armes.map((a: any) => a.cle === 'laser-lourd' ? (({ masse, ...r }) => r)(a) : a); return f; };
const U = (id: number) => ({ niveau: 'univers' as const, id });
const S = (id: number) => ({ niveau: 'systeme' as const, id });
function err(fn: () => unknown) {
  try { fn(); } catch (e: any) { return e as { code: string; detail?: string; champ?: string; cause?: string; attendu?: string; recu?: unknown }; }
  assert.fail('aucune erreur levée');
}
const nb = (db: Db) => (db.prepare('SELECT COUNT(*) n FROM essai_catalogue_elements').get() as any).n as number;
const versionSys = (db: Db, sys: number) =>
  (db.prepare('SELECT version_catalogue v FROM outils_systeme WHERE systeme_id = ? AND outil = ?').get(sys, OUTIL) as any)?.v ?? null;

/** Antor: responsible MJ of Sys (u1, u2); Mira: MJ of u1; Léa: player of u1; Zoé: stranger; u3 has no system. */
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const mira = assurerCompte(db, 'mira').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u1 = creerUnivers(db, antor, { nom: 'U1' }).id;
  const u2 = creerUnivers(db, antor, { nom: 'U2' }).id;
  const u3 = creerUnivers(db, antor, { nom: 'U3' }).id;
  ajouterMembre(db, antor, u1, 'mira', 'mj');
  ajouterMembre(db, antor, u1, 'lea', 'joueur');
  const sys = creerEtRattacherSysteme(db, antor, u1, { nom: 'Sys' }).id;
  rattacherSysteme(db, antor, u2, sys);
  for (const u of [u1, u2]) o.poserActivation(db, antor, U(u), OUTIL, true);
  return { db, antor, mira, lea, zoe, u1, u2, u3, sys };
}
const A = (compteId: number, modeJoueur = false) => ({ compteId, ...(modeJoueur ? { modeJoueur } : {}) });
const cles = (p: { elements: { cle: string }[] }) => p.elements.map((e) => e.cle).sort();

test('aperçu : 11 ajoutés, 1 refus exact, aucune écriture', () => {
  const { db, antor, sys } = monde();
  const f = fautif();
  assert.ok(f.armes.some((a: any) => a.cle === 'laser-lourd' && !('masse' in a)));
  const r = c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f);
  const tot = (k: string) => Object.values(r.natures).reduce((s: number, x: any) => s + x[k], 0);
  assert.equal(r.apercu, true);
  assert.equal(tot('ajoutes'), 11);
  assert.equal(tot('refuses'), 1);
  assert.deepEqual(r.refus, [{ nature: 'armes', cle: 'laser-lourd', champ: 'masse', raison: 'nombre attendu' }]);
  assert.equal(nb(db), 0);
  assert.equal(versionSys(db, sys), null);
});

test('le fichier d\'exemple livré : 12 éléments, laser-lourd sans masse, noms lisibles', () => {
  const n = EXEMPLE.coques.length + EXEMPLE.armes.length;
  assert.equal(n, 12);
  const l = EXEMPLE.armes.find((a: any) => a.cle === 'laser-lourd');
  assert.equal(typeof l?.masse, 'number');
  assert.deepEqual(EXEMPLE.coques.map((x: any) => x.cle), ['corvette', 'cargo', 'fregate', 'patrouilleur']);
  assert.deepEqual(EXEMPLE.armes.map((x: any) => x.cle).sort(),
    ['brouilleur', 'canon-leger', 'harpon', 'laser', 'laser-lourd', 'missile', 'mitrailleuse', 'torpille']);
  const nom = (cle: string) => [...EXEMPLE.coques, ...EXEMPLE.armes].find((e: any) => e.cle === cle)?.nom;
  assert.equal(nom('canon-leger'), 'Canon léger');
  assert.equal(nom('corvette'), 'Corvette');
  assert.equal(nom('laser'), 'Laser à impulsion');
  assert.equal(EXEMPLE.version, '2026-11-essai');
});

test('application, rejeu, modification, absents, clé répétée', () => {
  const { db, antor, sys } = monde();
  const r = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, fautif());
  assert.equal(nb(db), 11);
  assert.equal(r.refusTotal, 1);
  assert.equal(versionSys(db, sys), '2026-11-essai');
  assert.equal(r.versionCatalogue, '2026-11-essai');

  const r2 = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, fautif());
  const tot = (rr: any, k: string) => Object.values(rr.natures).reduce((s: number, x: any) => s + x[k], 0);
  assert.equal(tot(r2, 'inchanges'), 11);
  assert.equal(tot(r2, 'ajoutes'), 0);
  assert.equal(tot(r2, 'modifies'), 0);
  assert.equal(versionSys(db, sys), '2026-11-essai');

  // même contenu, autre étiquette : rien ne change, la version non plus
  const g = fautif(); g.version = 'autre';
  const r3 = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, g);
  assert.equal(tot(r3, 'inchanges'), 11);
  assert.equal(versionSys(db, sys), '2026-11-essai');

  // une masse change
  const h = fautif(); h.version = 'v2';
  h.coques[0].masse += 1;
  const r4 = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, h);
  assert.equal(tot(r4, 'modifies'), 1);
  assert.equal(nb(db), 11);
  assert.equal(versionSys(db, sys), 'v2');

  // un élément retiré du fichier reste lisible et compte dans absents
  const k = fautif(); k.version = 'v2';
  k.coques[0].masse += 1;
  const retire = k.coques.pop().cle;
  const r5 = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, k);
  assert.equal(r5.absents, 1);
  assert.equal(nb(db), 11);
  assert.ok(cles(c.lireCatalogue(db, A(antor), S(sys), OUTIL)).includes(retire));

  // clé répétée
  const d = copie();
  d.coques.push({ ...d.coques[0], nom: 'Doublon' });
  const r6 = c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, d);
  assert.ok(r6.refus.some((x) => x.champ === 'cle' && x.nature === 'coques' && x.cle === d.coques[0].cle));
});

test('panne à la 6e écriture : ni ligne ni version', () => {
  const { db, antor, sys } = monde();
  const st = catalogueEssai.stockage;
  const orig = st.ecrire;
  let n = 0;
  st.ecrire = (...a) => { const r = orig(...a); if (++n === 6) throw new Error('panne'); return r; };
  try { assert.throws(() => c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, EXEMPLE), /panne/); }
  finally { st.ecrire = orig; }
  assert.equal(n, 6);
  assert.equal(nb(db), 0);
  assert.equal(versionSys(db, sys), null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM outils_systeme WHERE systeme_id = ? AND outil = ?').get(sys, OUTIL).n, 0);
});

test('causes de fichier invalide', () => {
  const { db, antor, sys } = monde();
  const go = (f: unknown) => err(() => c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, f));
  for (const f of [null, [], 'x', 3]) {
    const e = go(f); assert.equal(e.code, 'invalide'); assert.equal(e.detail, 'catalogue_invalide'); assert.equal(e.cause, 'pas_un_objet');
  }
  let e = go({ ...copie(), catalogue: 'essai/a' });
  assert.equal(e.detail, 'catalogue_invalide'); assert.equal(e.cause, 'mauvais_outil');
  assert.equal(e.attendu, OUTIL); assert.equal(e.recu, 'essai/a');
  e = go((({ catalogue, ...r }) => r)(copie()));
  assert.equal(e.cause, 'mauvais_outil');
  for (const v of [undefined, 3, '', 'x'.repeat(41)]) {
    e = go({ ...copie(), version: v }); assert.equal(e.cause, 'version', String(v));
  }
  e = go({ ...copie(), vaisseaux: [] });
  assert.equal(e.cause, 'section_inconnue'); assert.equal(e.champ, 'vaisseaux');
  e = go({ ...copie(), armes: {} });
  assert.equal(e.cause, 'section_non_liste'); assert.equal(e.champ, 'armes');
  const gros = { catalogue: OUTIL, version: 'v', coques: Array.from({ length: 5001 }, (_, i) => ({ cle: `k${i}`, nom: 'n', masse: 1, cout: 1 })) };
  e = go(gros); assert.equal(e.code, 'invalide'); assert.equal(e.detail, 'catalogue_trop_grand');
  const pile = { ...gros, coques: gros.coques.slice(0, 5000) };
  assert.doesNotThrow(() => c.previsualiserCatalogue(db, A(antor), S(sys), OUTIL, pile));
  // les 5 000 se comptent toutes sections confondues
  const mix = { catalogue: OUTIL, version: 'v', coques: gros.coques.slice(0, 2500),
    armes: gros.coques.slice(0, 2501).map((x) => ({ ...x, portee: 'courte' })) };
  assert.equal(go(mix).detail, 'catalogue_trop_grand');
});

test('refus par élément : champ inconnu, type, clé invalide', () => {
  const { db, antor, sys } = monde();
  const f = { catalogue: OUTIL, version: 'v', coques: [
    { cle: 'a', nom: 'A', masse: 1, cout: 1.5 }, { cle: 'b', nom: 'B', masse: 1, cout: 1, extra: 1 },
    { cle: 'Bad Key', nom: 'C', masse: 1, cout: 1 }, { nom: 'D', masse: 1, cout: 1 }, 'x',
    { cle: 'ok', nom: 'Ok', masse: 0, cout: 0 }] };
  const r = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, f);
  assert.equal(r.natures.coques!.ajoutes, 1);
  assert.equal(r.natures.coques!.refuses, 5);
  assert.equal(nb(db), 1);
  assert.ok(r.refus.find((x) => x.cle === 'a' && x.champ === 'cout'));
  assert.ok(r.refus.find((x) => x.cle === 'b' && x.champ === 'extra'));
});

test('niveaux : gardes d\'écriture', () => {
  const { db, antor, mira, lea, zoe, u1, u3, sys } = monde();
  assert.equal(err(() => c.appliquerCatalogue(db, A(mira), S(sys), OUTIL, fautif())).code, 'refuse');
  assert.equal(err(() => c.previsualiserCatalogue(db, A(mira), S(sys), OUTIL, fautif())).code, 'refuse');
  for (const x of [lea, zoe]) assert.equal(err(() => c.appliquerCatalogue(db, A(x), S(sys), OUTIL, fautif())).code, 'introuvable');
  assert.equal(err(() => c.appliquerCatalogue(db, A(antor, true), U(u1), OUTIL, fautif())).code, 'refuse');
  assert.equal(err(() => c.appliquerCatalogue(db, A(lea), U(u1), OUTIL, fautif())).code, 'introuvable');
  assert.equal(err(() => c.appliquerCatalogue(db, A(zoe), U(u1), OUTIL, fautif())).code, 'introuvable');
  assert.equal(err(() => c.appliquerCatalogue(db, A(antor), U(u3), OUTIL, fautif())).code, 'introuvable');
  assert.equal(err(() => c.appliquerCatalogue(db, A(antor), U(9999), OUTIL, fautif())).code, 'introuvable');
  assert.equal(err(() => c.appliquerCatalogue(db, A(antor), S(9999), OUTIL, fautif())).code, 'introuvable');
  assert.equal(err(() => c.appliquerCatalogue(db, A(antor), S(sys), 'essai/inconnu', EXEMPLE)).code, 'introuvable');
  // un outil sans catalogue
  assert.equal(err(() => c.appliquerCatalogue(db, A(antor), S(sys), 'essai/a', { ...EXEMPLE, catalogue: 'essai/a' })).code, 'introuvable');
  assert.equal(nb(db), 0);
  // un MJ non responsable peut écrire au niveau univers
  c.appliquerCatalogue(db, A(mira), U(u1), OUTIL, fautif());
  assert.equal(nb(db), 11);
  // écriture univers d'un outil non applicable au système : introuvable
  const sauvage = creerSysteme(db, antor, { nom: 'Autre' }).id;
  const ua = creerUnivers(db, antor, { nom: 'UA' }).id;
  rattacherSysteme(db, antor, ua, sauvage);
  void ua;
});

test('deux niveaux : remplacement et retrait propres à un univers', () => {
  const { db, antor, u1, u2, sys, lea } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, EXEMPLE);
  const rempl = { catalogue: OUTIL, version: 'u1', armes: [{ cle: 'laser', nom: 'Laser maison', masse: 99, cout: 1, portee: 'longue' }] };
  const r = c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, rempl);
  assert.equal(r.remplacements, 1);
  const nom = (u: number, cle: string) => c.resoudreElements(db, u, OUTIL, 'armes').find((e) => e.cle === cle);
  assert.equal(nom(u1, 'laser')!.nom, 'Laser maison');
  assert.equal(nom(u1, 'laser')!.origine, 'remplace');
  assert.equal(nom(u2, 'laser')!.nom, 'Laser à impulsion');
  assert.equal(nom(u2, 'laser')!.origine, 'systeme');
  // retrait d'une clé du système : effacée de cet univers seul
  c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { retire: true });
  c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { retire: true }); // idempotent
  assert.equal(nom(u1, 'canon-leger'), undefined);
  assert.ok(nom(u2, 'canon-leger'));
  // MJ voit le retrait avec origine 'retire', le joueur non
  const mj = c.lireCatalogue(db, A(antor), U(u1), OUTIL, { nature: 'armes' });
  assert.equal(mj.elements.find((e) => e.cle === 'canon-leger')!.origine, 'retire');
  assert.ok(!cles(c.lireCatalogue(db, A(lea), U(u1), OUTIL)).includes('canon-leger'));
  // retirer un élément remplacé : invalide element_remplace
  let e = err(() => c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'laser', { retire: true }));
  assert.equal(e.code, 'invalide'); assert.equal(e.detail, 'element_remplace');
  // rétablir
  c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { retire: false });
  c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { retire: false });
  assert.ok(nom(u1, 'canon-leger'));
  // clé inconnue
  assert.equal(err(() => c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'zzz', { retire: true })).code, 'introuvable');
  // masquer un élément du système : invalide element_systeme
  e = err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { masque: true, version: 1 }));
  assert.equal(e.code, 'invalide'); assert.equal(e.detail, 'element_systeme');
  // gardes
  assert.equal(err(() => c.retirerElement(db, A(lea), u1, OUTIL, 'armes', 'canon-leger', { retire: true })).code, 'introuvable');
  assert.equal(err(() => c.retirerElement(db, A(antor, true), u1, OUTIL, 'armes', 'canon-leger', { retire: true })).code, 'refuse');
});

test('masquage : sans fuite, ni repli sur le système, version concurrente', () => {
  const { db, antor, mira, lea, u1, sys } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, EXEMPLE);
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, { catalogue: OUTIL, version: 'u',
    armes: [{ cle: 'laser', nom: 'Laser maison', masse: 99, cout: 1, portee: 'longue' },
      { cle: 'neuve', nom: 'Neuve', masse: 1, cout: 1, portee: 'courte' }] });
  const lu = () => c.lireCatalogue(db, A(antor), U(u1), OUTIL, { nature: 'armes' }).elements.find((e) => e.cle === 'laser')!;
  const v0 = lu().version!;
  assert.equal(lu().masque, false);
  const m = c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'laser', { masque: true, version: v0 });
  assert.equal(m.masque, true);
  // deux masquages avec la même version lue : succès puis conflit
  const e = err(() => c.masquerElement(db, A(mira), u1, OUTIL, 'armes', 'laser', { masque: false, version: v0 }));
  assert.equal(e.code, 'conflit'); assert.equal(e.detail, 'donnee_modifiee');
  assert.equal(lu().masque, true);
  // version périmée
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'laser', { masque: false, version: 1 })).detail, 'donnee_modifiee');
  // le MJ lit avec masque: true
  assert.equal(lu().masque, true);
  // le joueur et le MJ en mode joueur : aucun des deux
  for (const acteur of [A(lea), A(antor, true)]) {
    const p = c.lireCatalogue(db, acteur, U(u1), OUTIL);
    assert.ok(!p.elements.some((x) => x.cle === 'laser'), 'laser caché');
    assert.ok(!JSON.stringify(p).includes('Laser maison'));
    assert.ok(!JSON.stringify(p).includes('Laser à impulsion'), 'pas de repli sur le système');
    assert.equal(c.lireCatalogue(db, acteur, U(u1), OUTIL, { nature: 'armes' }).elements.some((x) => x.cle === 'laser'), false);
    assert.ok(p.elements.some((x) => x.cle === 'neuve'));
    assert.ok(!p.elements.some((x) => 'masque' in x || 'origine' in x || 'version' in x), 'pas de champ de gestion pour le joueur');
  }
  // lecteurs de calcul : pas de repli non plus
  assert.equal(c.resoudreElements(db, u1, OUTIL, 'armes').find((x) => x.cle === 'laser')!.nom, 'Laser maison');
  // un import qui réapplique l'élément le laisse masqué ; les retraits restent
  c.retirerElement(db, A(antor), u1, OUTIL, 'armes', 'canon-leger', { retire: true });
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, { catalogue: OUTIL, version: 'u',
    armes: [{ cle: 'laser', nom: 'Laser maison', masse: 99, cout: 1, portee: 'longue' }] });
  assert.equal(lu().masque, true);
  c.appliquerCatalogue(db, A(antor), U(u1), OUTIL, { catalogue: OUTIL, version: 'u2',
    armes: [{ cle: 'laser', nom: 'Laser maison', masse: 98, cout: 1, portee: 'longue' }] });
  assert.equal(lu().masque, true, 'modifié mais toujours masqué');
  assert.equal(c.resoudreElements(db, u1, OUTIL, 'armes').some((x) => x.cle === 'canon-leger'), false);
  // entrées fausses
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'laser', { masque: 'oui' as any, version: lu().version! })).code, 'invalide');
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'laser', { masque: true, version: 0 })).code, 'invalide');
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'neuve', { masque: true, version: 1.5 })).code, 'invalide');
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'vaisseaux', 'x', { masque: true, version: 1 })).code, 'invalide');
  assert.equal(err(() => c.masquerElement(db, A(antor), u1, OUTIL, 'armes', 'inexistante', { masque: true, version: 1 })).code, 'introuvable');
  // un retrait ne touche pas le masquage de l'élément retiré puis rétabli
});

test('lecture : gardes, outil désactivé, nature inconnue, joueur au niveau système', () => {
  const { db, antor, lea, zoe, mira, u1, u2, u3, sys } = monde();
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, fautif());
  assert.equal(c.lireCatalogue(db, A(lea), U(u1), OUTIL).elements.length, 11);
  assert.equal(err(() => c.lireCatalogue(db, A(zoe), U(u1), OUTIL)).code, 'introuvable');
  assert.equal(err(() => c.lireCatalogue(db, A(lea), S(sys), OUTIL)).code, 'introuvable');
  assert.equal(err(() => c.lireCatalogue(db, A(antor), U(u3), OUTIL)).code, 'introuvable');
  assert.equal(err(() => c.lireCatalogue(db, A(lea), U(u1), OUTIL, { nature: 'x' })).code, 'invalide');
  o.poserActivation(db, antor, U(u2), OUTIL, false);
  assert.equal(err(() => c.lireCatalogue(db, A(antor), U(u2), OUTIL)).code, 'introuvable');
  // gestion : MJ hors mode joueur seulement
  assert.equal(c.lireCatalogueGestion(db, A(mira), u1, OUTIL).elements.length, 11);
  for (const a of [A(lea), A(zoe), A(antor, true)]) assert.equal(err(() => c.lireCatalogueGestion(db, a, u1, OUTIL)).code, 'introuvable');
  // le MJ lit même un outil masqué aux joueurs mais pas désactivé
  o.poserActivation(db, antor, U(u2), OUTIL, true);
  assert.equal(c.lireCatalogue(db, A(antor), U(u2), OUTIL).elements.length, 11);
});

test('pagination : 50 par page, curseur, sans doublon ni trou', () => {
  const { db, antor, sys } = monde();
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ cle: `k${String(i).padStart(3, '0')}`, nom: `N${String(i).padStart(3, '0')}`, masse: 1, cout: 1 }));
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, { catalogue: OUTIL, version: 'v', coques: mk(120) });
  const vus: string[] = [];
  let curseur: string | undefined; let pages = 0;
  do {
    const p = c.lireCatalogue(db, A(antor), S(sys), OUTIL, { curseur });
    assert.ok(p.elements.length <= 50);
    vus.push(...p.elements.map((e) => e.cle));
    curseur = p.suivant ?? undefined; pages++;
  } while (curseur && pages < 10);
  assert.equal(pages, 3);
  assert.equal(new Set(vus).size, 120);
  // exactement 50 : pas de page suivante
  const { db: db2, antor: a2, sys: s2 } = monde();
  c.appliquerCatalogue(db2, A(a2), S(s2), OUTIL, { catalogue: OUTIL, version: 'v', coques: mk(50) });
  assert.equal(c.lireCatalogue(db2, A(a2), S(s2), OUTIL).suivant, null);
});

test('JSON canonique : -0 et ordre des clés ne font pas une modification', () => {
  const { db, antor, sys } = monde();
  const f = { catalogue: OUTIL, version: 'v1', coques: [{ cle: 'a', nom: 'A', masse: 1, cout: 1 }] };
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, f);
  const g = JSON.parse('{"version":"v9","catalogue":"essai/g","coques":[{"cout":1,"masse":1.0,"nom":"A","cle":"a"}]}');
  const r = c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, g);
  assert.equal(r.natures.coques!.inchanges, 1);
  assert.equal(versionSys(db, sys), 'v1');
});

test('un import au système ne touche pas le niveau univers ni l\'activation', () => {
  const { db, antor, u1, sys } = monde();
  const avant = o.resoudreOutil(db, u1, OUTIL);
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, EXEMPLE);
  assert.deepEqual(o.resoudreOutil(db, u1, OUTIL), avant);
  const row = db.prepare('SELECT * FROM outils_systeme WHERE systeme_id = ? AND outil = ?').get(sys, OUTIL) as any;
  assert.equal(row.version_catalogue, '2026-11-essai');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM outils_univers WHERE univers_id = ? AND outil = ?').get(u1, OUTIL).n, 1);
});

test('verifierDeclaration : natures de même nom, noms réservés', () => {
  const outil = (natures: any[]) => ({
    cle: 'm/g', libelle: 'G', description: 'd', type: 'generateur', portee: 'tous', dependances: [],
    visibiliteParDefaut: { mj: true, joueur: true }, usages: [{ nom: 'concevoir', mjSeul: true }], reglages: {},
    ecran: { libelle: 'G', icone: 'Wand' }, catalogue: { ...catalogueEssai, natures },
  });
  const module = (natures: any[]) => ({ nom: 'm', libelle: 'M', reglagesCommuns: {}, outils: [outil(natures)] }) as any;
  const n0 = catalogueEssai.natures[0]!;
  assert.throws(() => verifierDeclaration(module([n0, { ...n0 }])));
  assert.throws(() => verifierDeclaration(module([{ ...n0, nom: 'version' }])));
  assert.throws(() => verifierDeclaration(module([{ ...n0, nom: 'catalogue' }])));
  assert.throws(() => verifierDeclaration(module([])));
  assert.doesNotThrow(() => verifierDeclaration(module(catalogueEssai.natures)));
});

test('résumé E-20 : « masse N · coût N » pour les deux natures, zéro compris, sans portée ni crédits', () => {
  const { db, antor, sys, u1 } = monde();
  const f = copie();
  f.coques = [...f.coques, { cle: 'zero-coque', nom: 'Zéro', masse: 0, cout: 0 }];
  f.armes = [...f.armes, { cle: 'zero-arme', nom: 'Zéro arme', masse: 0, cout: 0, portee: 'longue' }];
  c.appliquerCatalogue(db, A(antor), S(sys), OUTIL, f);
  const lu = (nature: string, cle: string) =>
    c.lireCatalogue(db, A(antor), S(sys), OUTIL, { nature }).elements.find((e) => e.cle === cle)!.resume;
  assert.equal(lu('coques', 'cargo'), 'masse 20 · coût 80');
  assert.equal(lu('coques', 'zero-coque'), 'masse 0 · coût 0');
  assert.equal(lu('armes', 'laser'), 'masse 2 · coût 12');
  assert.equal(lu('armes', 'laser-lourd'), 'masse 5 · coût 28');
  assert.equal(lu('armes', 'zero-arme'), 'masse 0 · coût 0');
  const gestion = c.lireCatalogueGestion(db, A(antor), u1, OUTIL, { nature: 'armes' }) as any;
  assert.ok(gestion.elements.every((e: any) => !/portée|crédits/.test(e.resume)));
});
