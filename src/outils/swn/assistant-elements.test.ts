import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-outils-elements: placer/compléter élément, masquer, retirer through `catalogueDe`
// (B-94, B-96, B-97, AD-outils-3, AD-outils-4), the GM only; a reserved element never reaches a player.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('../../services/swn/cache-blocs.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');

const lireJson = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const FS = lireJson('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json');
const tire = { q: FS.systemes[0].entree.q as number, r: FS.systemes[0].entree.r as number };
const DEF = { q: 40, r: -7 };
const NOMS = ['swn_placer_element', 'swn_completer_element', 'swn_masquer_systeme', 'swn_retirer'];

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const FG = lireJson('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json');
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  const sid = db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
    .run(g, univers, 'sdef', 'Port défini', DEF.q, DEF.r).lastInsertRowid as number;
  db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,0,?,?,?,?,0.1,'{}')")
    .run(sid, 'e', 'etoile', null, 'orange', null, 0, 0);
  const fiche = (titre: string) => {
    const id = db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('k' || hex(randomblob(6)), 'ecran', ?, 'lieu', ?, '{}', 1, 1)").run(univers, titre).lastInsertRowid as number;
    db.prepare("INSERT INTO sections (cle, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES ('k' || hex(randomblob(6)), ?, 'Texte', 1, '', '2026-01-01', 1)").run(id);
    return id;
  };
  const outils = (u: string) => (catalogueDe(db, cid(u), univers) as any).outils as any[];
  const jouer = async (nom: string, args: object, u = 'antor') => await outils(u).find((o) => o.nom === nom).executer(args) as any;
  const lire = (args: object, u = 'antor') => jouer('swn_lire_systeme', args, u);
  const photo = () => JSON.stringify(['swn_astres', 'swn_elements', 'swn_systemes', 'swn_formations'].map((t) => q(`SELECT * FROM ${t} ORDER BY id`)));
  return { db, q, outils, jouer, lire, fiche, photo };
}

test('catalogue : le MJ a les quatre outils, la joueuse aucun', () => {
  const w = monde();
  const mj = w.outils('antor').map((o) => o.nom);
  for (const n of NOMS) assert.ok(mj.includes(n), n);
  assert.deepEqual(w.outils('lea').map((o) => o.nom).filter((n: string) => NOMS.includes(n)), []);
});

test('parcours : vaisseau sur un corps, suit le corps, complété (description, lien, secret), retiré', async () => {
  const w = monde();
  const f = w.fiche('Le Faucon');
  const p = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, type: 'rocheux', nom: 'Bellone' });
  const planete = p.donnees.corps.find((c: any) => c.nom === 'Bellone');
  const v = await w.jouer('swn_placer_element', { ...DEF, genre: 'vaisseau', nom: 'Faucon', sur: planete.cle });
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.evenement.type, 'systeme_modifie');
  const el = v.donnees.elements.find((e: any) => e.nom === 'Faucon');
  assert.equal(el.sur, planete.cle);
  assert.deepEqual(w.q('SELECT orbite, heure FROM swn_elements WHERE cle=?', el.cle)[0], { orbite: null, heure: null });
  assert.equal(el.interieur.orbite, 3);
  const d = await w.jouer('swn_deplacer_astre', { ...DEF, cle: planete.cle, version_lue: planete.version, orbite: 6, heure: 9 });
  assert.equal(d.ok, true, JSON.stringify(d));
  const suit = d.donnees.elements.find((e: any) => e.cle === el.cle);
  assert.equal(suit.sur, planete.cle);
  assert.equal(suit.interieur.orbite, 6);
  const c = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: suit.version, description: 'Cargo', lien: f, secret: true });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.ok(c.evenement);
  const ce = c.donnees.elements.find((e: any) => e.cle === el.cle);
  assert.equal(ce.lien.id, f);
  assert.equal(ce.secret, true);
  assert.equal(w.q('SELECT description, secret FROM swn_elements WHERE cle=?', el.cle)[0].description, 'Cargo');
  const x = await w.jouer('swn_retirer', { ...DEF, cle: el.cle, version_lue: ce.version });
  assert.equal(x.ok, true, JSON.stringify(x));
  assert.ok(x.evenement);
  assert.equal(x.donnees.elements.length, 0);
  assert.equal(x.donnees.retire.type, 'element');
});

test('un élément secret : la joueuse ne le voit pas, la lecture du MJ le marque', async () => {
  const w = monde();
  const r = await w.jouer('swn_placer_element', { ...DEF, genre: 'base', nom: 'Base noire', orbite: 2, heure: 3, secret: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.donnees.elements[0].secret, true);
  const lea = await w.lire(DEF, 'lea');
  assert.equal(lea.ok, true);
  assert.equal(JSON.stringify(lea).includes('Base noire'), false);
  assert.deepEqual(lea.donnees.elements, []);
  const mj = await w.lire(DEF);
  assert.equal(mj.donnees.elements.length, 1);
  // ni lecture ni écriture par la joueuse : l'outil n'existe pas pour elle
  assert.equal(w.outils('lea').some((o) => o.nom === 'swn_retirer'), false);
});

test('masquer : un système tiré s’ancre, la joueuse reçoit « Introuvable. », le démasquer le rend', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const m = await w.jouer('swn_masquer_systeme', { ...tire, secret: true, version_systeme: lu.donnees.version_systeme });
  assert.equal(m.ok, true, JSON.stringify(m));
  assert.ok(m.evenement);
  assert.equal(m.donnees.etat, 'defini');
  assert.equal(m.donnees.masque, true);
  assert.deepEqual(await w.lire(tire, 'lea'), { ok: false, erreur: 'Introuvable.' });
  const d = await w.jouer('swn_masquer_systeme', { ...tire, secret: false, version_systeme: m.donnees.version_systeme });
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.equal(d.donnees.masque, false);
  assert.equal((await w.lire(tire, 'lea')).ok, true);
});

test('masquer sans version_systeme ou périmée : refus, rien écrit, aucun événement', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const avant = w.photo();
  const sans = await w.jouer('swn_masquer_systeme', { ...tire, secret: true });
  assert.equal(sans.ok, false);
  assert.equal('evenement' in sans, false);
  const vieux = await w.jouer('swn_masquer_systeme', { ...tire, secret: true, version_systeme: lu.donnees.version_systeme + 4 });
  assert.equal(vieux.code, 'a_change', JSON.stringify(vieux));
  // a defined system with a stale token
  const defini = await w.lire(DEF);
  const vd = await w.jouer('swn_masquer_systeme', { ...DEF, secret: true, version_systeme: defini.donnees.version_systeme + 9 });
  assert.equal(vd.code, 'a_change', JSON.stringify(vd));
  assert.equal(w.photo(), avant);
});

test('un schéma qui nomme un masque de corps ou un secret de corps est refusé', async () => {
  const w = monde();
  const p = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, type: 'rocheux' });
  const planete = p.donnees.corps.find((c: any) => c.genre === 'planete');
  const avant = w.photo();
  const refus = { ok: false, erreur: 'Paramètres invalides.' };
  assert.deepEqual(await w.jouer('swn_completer_astre', { ...DEF, cle: planete.cle, version_lue: planete.version, masque: true }), refus);
  assert.deepEqual(await w.jouer('swn_masquer_systeme', { ...DEF, secret: true, version_systeme: 1, corps: planete.cle }), refus);
  assert.deepEqual(await w.jouer('swn_retirer', { ...DEF, cle: planete.cle, version_lue: 1, secret: true }), refus);
  assert.deepEqual(await w.jouer('swn_placer_element', { ...DEF, genre: 'vaisseau', nom: 'X', sur: planete.cle, masque: true }), refus);
  assert.equal(w.photo(), avant);
});

test('élément à l’orbite −1 ou à l’heure 12 : orbite_invalide, ni ligne ni événement, en pose comme en déplacement', async () => {
  const w = monde();
  const ok = await w.jouer('swn_placer_element', { ...DEF, genre: 'station', nom: 'Halte', orbite: 2, heure: 1 });
  const el = ok.donnees.elements[0];
  const avant = w.photo();
  for (const [orbite, heure] of [[-1, 3], [2, 12], [1001, 0]]) {
    const r = await w.jouer('swn_placer_element', { ...DEF, genre: 'vaisseau', nom: 'Bad', orbite, heure });
    assert.equal(r.ok, false, `${orbite}/${heure}`);
    assert.equal(r.code, 'orbite_invalide', JSON.stringify(r));
    assert.equal('evenement' in r, false);
    const c = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: el.version, orbite, heure });
    assert.equal(c.ok, false);
    assert.equal(c.code, 'orbite_invalide', JSON.stringify(c));
    assert.equal('evenement' in c, false);
  }
  assert.equal(w.photo(), avant);
});

test('compléter : version_lue périmée a_change, et un échec tardif annule les écritures précédentes', async () => {
  const w = monde();
  const ok = await w.jouer('swn_placer_element', { ...DEF, genre: 'station', nom: 'Halte', orbite: 2, heure: 1 });
  const el = ok.donnees.elements[0];
  const avant = w.photo();
  const vieux = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: el.version + 3, nom: 'Neuf' });
  assert.equal(vieux.code, 'a_change', JSON.stringify(vieux));
  assert.equal('evenement' in vieux, false);
  // name written first, then the link to an unknown sheet fails: nothing stays
  const tard = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: el.version, nom: 'Neuf', lien: 999999 });
  assert.equal(tard.ok, false);
  assert.equal(tard.code, 'fiche_inconnue', JSON.stringify(tard));
  assert.equal(w.photo(), avant);
  const rien = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: el.version });
  assert.equal(rien.ok, false);
});

test('compléter : lien null le retire ; place sur un corps inconnu refusée', async () => {
  const w = monde();
  const f = w.fiche('Halte publique');
  const ok = await w.jouer('swn_placer_element', { ...DEF, genre: 'station', nom: 'Halte', orbite: 2, heure: 1 });
  const el = ok.donnees.elements[0];
  const l = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: el.version, lien: f });
  const e1 = l.donnees.elements[0];
  assert.equal(e1.lien.id, f);
  const n = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: e1.version, lien: null });
  assert.equal(n.ok, true, JSON.stringify(n));
  assert.equal(n.donnees.elements[0].lien, null);
  const avant = w.photo();
  const sur = await w.jouer('swn_completer_element', { ...DEF, cle: el.cle, version_lue: n.donnees.elements[0].version, sur: 'nulle-part' });
  assert.equal(sur.ok, false);
  assert.equal('evenement' in sur, false);
  assert.equal(w.photo(), avant);
});

test('placer ou compléter sur un système tiré : version_systeme exigée, puis ancrage', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const avant = w.photo();
  const sans = await w.jouer('swn_placer_element', { ...tire, genre: 'vaisseau', nom: 'V', orbite: 2, heure: 1 });
  assert.equal(sans.ok, false);
  assert.equal('evenement' in sans, false);
  assert.equal(w.photo(), avant);
  const bon = await w.jouer('swn_placer_element', { ...tire, genre: 'vaisseau', nom: 'V', orbite: 2, heure: 1, version_systeme: lu.donnees.version_systeme });
  assert.equal(bon.ok, true, JSON.stringify(bon));
  assert.equal(bon.donnees.etat, 'defini');
  assert.equal(bon.donnees.elements.length, 1);
});

test('retirer un corps : le compte donne lunes et éléments, cachés compris ; ils partent tous', async () => {
  const w = monde();
  const p = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, type: 'rocheux', nom: 'Bellone' });
  const planete = p.donnees.corps.find((c: any) => c.nom === 'Bellone');
  const l = await w.jouer('swn_placer_astre', { ...DEF, genre: 'lune', parent: planete.cle, orbite: 1, heure: 2, nom: 'Lunette' });
  assert.equal(l.ok, true, JSON.stringify(l));
  const lune = l.donnees.corps.find((c: any) => c.nom === 'Lunette');
  await w.jouer('swn_placer_element', { ...DEF, genre: 'ville', nom: 'Capitale', sur: planete.cle });
  await w.jouer('swn_placer_element', { ...DEF, genre: 'base', nom: 'Cachée', sur: planete.cle, secret: true });
  await w.jouer('swn_placer_element', { ...DEF, genre: 'station', nom: 'Lunaire', sur: lune.cle, secret: true });
  await w.jouer('swn_placer_element', { ...DEF, genre: 'station', nom: 'Libre', orbite: 8, heure: 1 });
  const x = await w.jouer('swn_retirer', { ...DEF, cle: planete.cle, version_lue: planete.version });
  assert.equal(x.ok, true, JSON.stringify(x));
  assert.ok(x.evenement);
  assert.deepEqual(x.donnees.retire, { type: 'corps', corps: 2, lunes: 1, elements: 3 });
  assert.deepEqual(x.donnees.elements.map((e: any) => e.nom), ['Libre']);
  assert.equal(w.q("SELECT count(*) n FROM swn_astres WHERE cle IN (?,?)", planete.cle, lune.cle)[0].n, 0);
});

test('retirer : l’étoile principale est refusée etoile_principale ; une formation part ; version périmée a_change', async () => {
  const w = monde();
  const lu = await w.lire(DEF);
  const etoile = lu.donnees.corps.find((c: any) => c.genre === 'etoile');
  const avant = w.photo();
  const e = await w.jouer('swn_retirer', { ...DEF, cle: etoile.cle, version_lue: etoile.version });
  assert.equal(e.ok, false);
  assert.equal(e.code, 'etoile_principale', JSON.stringify(e));
  assert.equal('evenement' in e, false);
  assert.equal(w.photo(), avant);
  const t = await w.jouer('swn_tracer_formation', { ...DEF, forme: 'anneau', nom: 'Anneau', parametres: { de: 4.9, a: 5.3 } });
  const fo = t.donnees.formations[0];
  const vieux = await w.jouer('swn_retirer', { ...DEF, cle: fo.cle, version_lue: fo.version + 4 });
  assert.equal(vieux.code, 'a_change', JSON.stringify(vieux));
  const x = await w.jouer('swn_retirer', { ...DEF, cle: fo.cle, version_lue: fo.version });
  assert.equal(x.ok, true, JSON.stringify(x));
  assert.equal(x.donnees.formations.length, 0);
  assert.equal(x.donnees.retire.type, 'formation');
  const inconnu = await w.jouer('swn_retirer', { ...DEF, cle: 'nulle-part', version_lue: 1 });
  assert.equal(inconnu.ok, false);
  assert.equal('evenement' in inconnu, false);
});

test('retirer un corps d’un système tiré sans version_systeme : refus, rien d’ancré', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const corps = lu.donnees.corps.find((c: any) => c.genre === 'planete');
  const avant = w.photo();
  const r = await w.jouer('swn_retirer', { ...tire, cle: corps.cle, version_lue: 1 });
  assert.equal(r.ok, false);
  assert.equal('evenement' in r, false);
  assert.equal(w.photo(), avant);
});

test('le fichier des gestes ne lit ni swn_elements.secret ni swn_systemes.secret', () => {
  const src = readFileSync(fileURLToPath(new URL('./assistant-ecriture.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /swn_(elements|systemes|astres)/);
  assert.doesNotMatch(src, /\bFROM\b|\bINSERT\b/);
});
