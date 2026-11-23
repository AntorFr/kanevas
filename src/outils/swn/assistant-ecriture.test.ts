import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-outils-corps: the five write tools of `swn/galaxie` through `catalogueDe`
// (B-94, AD-outils-1, AD-outils-2, AD-outils-4), the GM only, under version preconditions.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('../../services/swn/cache-blocs.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');

const lireJson = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const FS = lireJson('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json');
const tire = { q: FS.systemes[0].entree.q as number, r: FS.systemes[0].entree.r as number };
const voisins = FS.systemes.slice(1, 4).map((s: any) => ({ q: s.entree.q as number, r: s.entree.r as number }));
const DEF = { q: 40, r: -7 };
const NOMS = ['swn_placer_astre', 'swn_deplacer_astre', 'swn_completer_astre', 'swn_tracer_formation', 'swn_ancrer_systeme'];

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
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',0,0)")
    .run(g, univers, 'sdef', 'Port défini', DEF.q, DEF.r).lastInsertRowid as number;
  db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,0,?,?,?,?,0.1,'{}')")
    .run(sid, 'e', 'etoile', null, 'orange', null, 0, 0);
  const fiche = (u: number, titre: string, lisent: boolean) => {
    const id = db.prepare("INSERT INTO fiches (cle, creee_via, univers_id, type, titre, charge, cree_le, modifie_le) VALUES ('k' || hex(randomblob(6)), 'ecran', ?, 'lieu', ?, '{}', 1, 1)").run(u, titre).lastInsertRowid as number;
    db.prepare("INSERT INTO sections (cle, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES ('k' || hex(randomblob(6)), ?, 'Texte', 1, '', '2026-01-01', ?)").run(id, lisent ? 1 : 0);
    return id;
  };
  const outils = (u: string) => (catalogueDe(db, cid(u), univers) as any).outils as any[];
  const outil = (u: string, nom: string) => outils(u).find((o) => o.nom === nom);
  const jouer = async (nom: string, args: object, u = 'antor') => await outil(u, nom).executer(args) as any;
  const lire = (args: object, u = 'antor') => jouer('swn_lire_systeme', args, u);
  const lignes = () => ({
    astres: q('SELECT s.q, s.r, a.cle, a.genre, a.orbite, a.heure, a.nom, a.fiche_id FROM swn_astres a JOIN swn_systemes s ON s.id=a.systeme_id ORDER BY s.q, s.r, a.cle'),
    formations: q('SELECT systeme_id, cle, forme, parametres FROM swn_formations ORDER BY id'),
    systemes: q('SELECT q, r, nom, promu FROM swn_systemes WHERE galaxie_id=? ORDER BY q, r', g),
    version: q('SELECT version FROM swn_galaxies WHERE id=?', g)[0].version,
  });
  return { db, q, cid, univers, g, jouer, lire, outils, fiche, lignes };
}

test('catalogue : le MJ a les cinq outils d’écriture, la joueuse aucun', () => {
  const w = monde();
  const mj = w.outils('antor').map((o) => o.nom);
  for (const n of NOMS) assert.ok(mj.includes(n), n);
  assert.deepEqual(w.outils('lea').map((o) => o.nom).filter((n: string) => NOMS.includes(n)), []);
});

test('ancrer un système tiré : les lignes égalent le tirage, les voisins tirés sont identiques', async () => {
  const w = monde();
  const avant = await w.lire(tire);
  assert.equal(avant.donnees.etat, 'tire');
  const vAvant = await Promise.all(voisins.map((v: any) => w.lire(v)));
  const r = await w.jouer('swn_ancrer_systeme', { ...tire, version_systeme: avant.donnees.version_systeme });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.evenement.type, 'systeme_modifie');
  assert.equal(r.evenement.cible.q, tire.q);
  assert.equal(r.donnees.etat, 'defini');
  const lignes = w.lignes().astres.filter((a: any) => a.q === tire.q && a.r === tire.r);
  assert.equal(lignes.length, avant.donnees.corps.length);
  assert.deepEqual(lignes.map((a: any) => a.cle).sort(), avant.donnees.corps.map((c: any) => c.cle).sort());
  assert.equal(r.donnees.formations.length, avant.donnees.formations.length);
  const relu = await w.lire(tire);
  assert.deepEqual(relu.donnees.corps.map((c: any) => [c.cle, c.genre, c.type, c.interieur.orbite, c.interieur.heure]),
    avant.donnees.corps.map((c: any) => [c.cle, c.genre, c.type, c.interieur.orbite, c.interieur.heure]));
  const vApres = await Promise.all(voisins.map((v: any) => w.lire(v)));
  assert.deepEqual(vApres.map((v: any) => ({ ...v.donnees, version_systeme: undefined })), vAvant.map((v: any) => ({ ...v.donnees, version_systeme: undefined })));
  assert.ok(vApres.every((v: any) => v.donnees.etat === 'tire'));
});

test('ancrer sans version_systeme ou avec une version périmée : refus a_change, rien d’écrit', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const avant = JSON.stringify(w.lignes());
  for (const args of [{ ...tire }, { ...tire, version_systeme: lu.donnees.version_systeme + 7 }, { ...tire, version_systeme: 0 }]) {
    const r = await w.jouer('swn_ancrer_systeme', args);
    assert.equal(r.ok, false, JSON.stringify(args));
    assert.equal('evenement' in r, false);
  }
  const perime = await w.jouer('swn_ancrer_systeme', { ...tire, version_systeme: lu.donnees.version_systeme + 7 });
  assert.equal(perime.code, 'a_change', JSON.stringify(perime));
  assert.equal(JSON.stringify(w.lignes()), avant);
});

test('un MJ place un corps, le déplace, complète nom, aspect et lien, trace un anneau — chaque succès avec son événement', async () => {
  const w = monde();
  const f = w.fiche(w.univers, 'Port public', true);
  const p = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, type: 'rocheux', nom: 'Bellone' });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.evenement.type, 'systeme_modifie');
  const corps = p.donnees.corps.find((c: any) => c.nom === 'Bellone');
  assert.deepEqual([corps.interieur.orbite, corps.interieur.heure], [3, 4]);
  const d = await w.jouer('swn_deplacer_astre', { ...DEF, cle: corps.cle, version_lue: corps.version, orbite: 5, heure: 11 });
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.ok(d.evenement);
  const c2 = d.donnees.corps.find((c: any) => c.cle === corps.cle);
  assert.deepEqual([c2.interieur.orbite, c2.interieur.heure], [5, 11]);
  assert.ok(c2.version > corps.version);
  const c = await w.jouer('swn_completer_astre', { ...DEF, cle: corps.cle, version_lue: c2.version, nom: 'Bellone II', lien: f });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.ok(c.evenement);
  const c3 = c.donnees.corps.find((x: any) => x.cle === corps.cle);
  assert.deepEqual([c3.nom, c3.lien?.id], ['Bellone II', f]);
  const t = await w.jouer('swn_tracer_formation', { ...DEF, forme: 'anneau', nom: 'Anneau', parametres: { de: 4.9, a: 5.3 } });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.ok(t.evenement);
  assert.equal(t.donnees.formations.length, 1);
  // replacement with cle + version_lue
  const fo = t.donnees.formations[0];
  const t2 = await w.jouer('swn_tracer_formation', { ...DEF, cle: fo.cle, version_lue: fo.version, forme: 'anneau', nom: 'Anneau bis', parametres: { de: 4.8, a: 5.4 } });
  assert.equal(t2.ok, true, JSON.stringify(t2));
  assert.equal(t2.donnees.formations.length, 1);
  assert.equal(t2.donnees.formations[0].nom, 'Anneau bis');
  // stale version on the replacement
  const t3 = await w.jouer('swn_tracer_formation', { ...DEF, cle: fo.cle, version_lue: fo.version, forme: 'anneau', parametres: { de: 4.8, a: 5.4 } });
  assert.equal(t3.ok, false);
  assert.equal(t3.code, 'a_change');
  assert.equal('evenement' in t3, false);
});

test('orbite −1, orbite hors bornes, heure 12 : refus avec son code, sans événement ni ligne', async () => {
  const w = monde();
  const avant = JSON.stringify(w.lignes());
  for (const [orbite, heure] of [[-1, 3], [1001, 3], [3, 12], [3, -0.5]]) {
    const r = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite, heure, type: 'rocheux' });
    assert.equal(r.ok, false, `${orbite}/${heure}`);
    assert.equal(r.code, 'orbite_invalide', JSON.stringify(r));
    assert.equal('evenement' in r, false);
  }
  const lu = await w.lire(DEF);
  const etoile = lu.donnees.corps[0];
  const d = await w.jouer('swn_deplacer_astre', { ...DEF, cle: etoile.cle, version_lue: etoile.version, orbite: 2, heure: 12 });
  assert.equal(d.ok, false);
  assert.equal(JSON.stringify(w.lignes()), avant);
});

test('déplacer : corps inconnu astre_inconnu, version_lue périmée a_change, aucun effet', async () => {
  const w = monde();
  const p = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, type: 'rocheux' });
  const corps = p.donnees.corps.find((c: any) => c.genre === 'planete');
  const avant = JSON.stringify(w.lignes());
  const inconnu = await w.jouer('swn_deplacer_astre', { ...DEF, cle: 'nulle-part', version_lue: 1, orbite: 2 });
  assert.equal(inconnu.ok, false);
  assert.equal(inconnu.code, 'astre_inconnu', JSON.stringify(inconnu));
  const vieux = await w.jouer('swn_deplacer_astre', { ...DEF, cle: corps.cle, version_lue: corps.version + 5, orbite: 2 });
  assert.equal(vieux.ok, false);
  assert.equal(vieux.code, 'a_change', JSON.stringify(vieux));
  assert.equal('evenement' in vieux, false);
  assert.equal(JSON.stringify(w.lignes()), avant);
});

test('compléter un corps tiré avec la version_systeme lue : le système est ancré (P-24, puis ancrage, même version)', async () => {
  const w = monde();
  const f = w.fiche(w.univers, 'Port', true);
  const lu = await w.lire(tire);
  const corps = lu.donnees.corps.find((c: any) => c.genre === 'planete') ?? lu.donnees.corps[0];
  assert.equal(corps.version, 1);
  const r = await w.jouer('swn_completer_astre', { ...tire, cle: corps.cle, version_lue: 1, version_systeme: lu.donnees.version_systeme, nom: 'Nommée', lien: f });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.evenement);
  assert.equal(r.donnees.etat, 'defini');
  const c = r.donnees.corps.find((x: any) => x.cle === corps.cle);
  assert.deepEqual([c.nom, c.lien?.id], ['Nommée', f]);
  assert.equal(r.donnees.corps.length, lu.donnees.corps.length);
  assert.equal(w.q('SELECT promu FROM swn_systemes WHERE q=? AND r=?', tire.q, tire.r)[0].promu, 1);
});

test('compléter un corps tiré sans version_systeme, ou périmée : a_change, ni ancrage ni ligne', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const corps = lu.donnees.corps[0];
  const avant = JSON.stringify(w.lignes());
  for (const vs of [undefined, lu.donnees.version_systeme + 3]) {
    const r = await w.jouer('swn_completer_astre', { ...tire, cle: corps.cle, version_lue: 1, ...(vs === undefined ? {} : { version_systeme: vs }), nom: 'X' });
    assert.equal(r.ok, false);
    assert.equal(r.code, vs === undefined ? undefined : 'a_change', JSON.stringify(r));
    if (vs === undefined) assert.equal(r.champ, 'versionSysteme');
    assert.equal('evenement' in r, false);
  }
  assert.equal(JSON.stringify(w.lignes()), avant);
});

test('lien vers une fiche illisible ou inconnue : fiche_inconnue, zéro ligne, ancrage compris, aucun événement', async () => {
  const w = monde();
  const autre = w.db.prepare("INSERT INTO univers (cle, nom, systeme_id, cree_le) VALUES ('autre', 'Autre', NULL, 1)");
  let etrangere: number | null = null;
  try { const u = autre.run().lastInsertRowid as number; etrangere = w.fiche(u, 'Étrangère', true); } catch { etrangere = null; }
  const lu = await w.lire(tire);
  const corps = lu.donnees.corps[0];
  const avant = JSON.stringify(w.lignes());
  for (const lien of [999999, ...(etrangere === null ? [] : [etrangere])]) {
    const r = await w.jouer('swn_completer_astre', { ...tire, cle: corps.cle, version_lue: 1, version_systeme: lu.donnees.version_systeme, nom: 'Nom', lien });
    assert.equal(r.ok, false, String(lien));
    assert.equal(r.code, 'fiche_inconnue', JSON.stringify(r));
    assert.equal('evenement' in r, false);
  }
  assert.equal(JSON.stringify(w.lignes()), avant);
  // the name was not kept either: the two writes are one transaction
  assert.equal(w.q('SELECT count(*) n FROM swn_astres WHERE nom = ?', 'Nom')[0].n, 0);
});

test('compléter : un lien retiré par null, rien à modifier refusé, paramètres hors schéma refusés', async () => {
  const w = monde();
  const f = w.fiche(w.univers, 'Port', true);
  const p = await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, type: 'rocheux' });
  const corps = p.donnees.corps.find((c: any) => c.genre === 'planete');
  const l = await w.jouer('swn_completer_astre', { ...DEF, cle: corps.cle, version_lue: corps.version, lien: f });
  assert.equal(l.ok, true, JSON.stringify(l));
  const c1 = l.donnees.corps.find((c: any) => c.cle === corps.cle);
  const n = await w.jouer('swn_completer_astre', { ...DEF, cle: corps.cle, version_lue: c1.version, lien: null });
  assert.equal(n.ok, true, JSON.stringify(n));
  assert.equal(n.donnees.corps.find((c: any) => c.cle === corps.cle).lien, null);
  const c2 = n.donnees.corps.find((c: any) => c.cle === corps.cle);
  assert.equal((await w.jouer('swn_completer_astre', { ...DEF, cle: corps.cle, version_lue: c2.version })).ok, false);
  assert.deepEqual(await w.jouer('swn_completer_astre', { ...DEF, cle: corps.cle, version_lue: c2.version, masque: true }), { ok: false, erreur: 'Paramètres invalides.' });
  assert.deepEqual(await w.jouer('swn_placer_astre', { ...DEF, genre: 'planete', orbite: 3, heure: 4, secret: true }), { ok: false, erreur: 'Paramètres invalides.' });
});

test('placer sur un système tiré avec la version lue l’ancre ; un refus ne laisse aucune ligne', async () => {
  const w = monde();
  const lu = await w.lire(tire);
  const avant = JSON.stringify(w.lignes());
  const mauvais = await w.jouer('swn_placer_astre', { ...tire, version_systeme: lu.donnees.version_systeme, genre: 'planete', orbite: -1, heure: 1, type: 'rocheux' });
  assert.equal(mauvais.code, 'orbite_invalide');
  assert.equal(JSON.stringify(w.lignes()), avant);
  const sans = await w.jouer('swn_placer_astre', { ...tire, genre: 'comete', orbite: 7, heure: 1 });
  assert.equal(sans.ok, false);
  assert.equal(sans.champ, 'versionSysteme', JSON.stringify(sans));
  assert.equal(JSON.stringify(w.lignes()), avant);
  const bon = await w.jouer('swn_placer_astre', { ...tire, version_systeme: lu.donnees.version_systeme, genre: 'comete', orbite: 7, heure: 1 });
  assert.equal(bon.ok, true, JSON.stringify(bon));
  assert.equal(bon.donnees.etat, 'defini');
  assert.equal(bon.donnees.corps.length, lu.donnees.corps.length + 1);
});

test('les fichiers des gestes ne contiennent ni SQL ni nom de table swn_', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const fichiers = readdirSync(dir).filter((f) => /^assistant.*\.ts$/.test(f) && !f.endsWith('.test.ts'));
  assert.ok(fichiers.includes('assistant-ecriture.ts'));
  for (const f of fichiers) {
    const src = readFileSync(dir + f, 'utf8').replace(/'swn_[a-z_]+'|"swn_[a-z_]+"|`swn_[a-z_]+`|swn_(placer|deplacer|completer|tracer|ancrer|lire|masquer|retirer|trajet|[a-z]+_astre|[a-z]+_systeme|[a-z]+_formation)/g, '');
    assert.doesNotMatch(src, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|SELECT\s+[\w*,\s]+\s+FROM)\b/i, f);
    assert.doesNotMatch(src, /swn_(astres|formations|systemes|galaxies|elements|zones|routes|reglages|aspects)/, f);
  }
});
