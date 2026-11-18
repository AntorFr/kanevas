import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-masquer-lecture (B-97, AD-141, AD-150, AD-masquer-1): hiding a drawn system anchors it,
// then every read of a player answers as for an unknown system. The fixture is the first drawn system of the generation fixtures.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireInterieur } = await import('./interieur.js');
const { lireBlocs, lireSysteme, rechercherSystemes, lireRoute } = await import('./lecture-carte.js');
const { lireSorties } = await import('./sorties.js');
const { calculerTrajet } = await import('./trajet.js');
const { illustrationAstre } = await import('./illustration.js');
const { placerSysteme, tracerRoute } = await import('./ecriture-carte.js');
const { masquerSysteme, etatMasque } = await import('./ecriture-systeme.js');
const { systemeLisible, hexagonesMasques } = await import('./lisibilite.js');
const { plagesDe } = await import('../../outils/swn/regles/forme.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const FG = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const cible = FS.systemes[0].entree as { q: number; r: number };
const R0 = { bx: -11, by: -11 }, R1 = { bx: -7, by: -7 };

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
  db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run(FS.graine, FG.densites.defaut, g);
  for (const z of FG.densites.zones) {
    db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, univers, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const mj = { compteId: cid('antor') };
  const mjJoueur = { compteId: cid('antor'), modeJoueur: true };
  const lea = { compteId: cid('lea') };
  const teo = { compteId: cid('teo') };
  const ver = () => (q('SELECT version FROM swn_galaxies WHERE id=?', g)[0].version as number);
  const masquer = (secret: unknown, who: any = mj, jeton: unknown = ver(), c = cible) =>
    masquerSysteme(db, who, univers, g, c.q, c.r, { secret, versionSysteme: jeton } as any);
  return { db, q, univers, g, mj, mjJoueur, lea, teo, ver, masquer };
}
type W = ReturnType<typeof monde>;
const erreur = (f: () => unknown): any => { try { f(); } catch (e) { return e; } assert.fail('aucune erreur'); };
const ligne = (w: W) => w.q('SELECT * FROM swn_systemes WHERE galaxie_id=? AND q=? AND r=?', w.g, cible.q, cible.r)[0];
const voisinsTires = (w: W) => FS.systemes.slice(1).map((s: any) => JSON.stringify(lireInterieur(w.db, w.mj, w.univers, w.g, s.entree.q, s.entree.r)));
const contient = (v: unknown, ...mots: string[]) => { const t = JSON.stringify(v); for (const m of mots) assert.ok(!t.includes(m), `fuite : ${m}`); };

/** The galaxy once the target is hidden, with a readable neighbour joined to it by a public route. */
function masqueAvecVoisin(w: W) {
  const avantVoisins = voisinsTires(w);
  const avantLea = lireBlocs(w.db, w.lea, w.univers, w.g, R0, R1);
  assert.ok(avantLea.blocs.some((b) => b.generes.some(([q, r]) => q === cible.q && r === cible.r)), 'étoile tirée visible avant');
  const r = w.masquer(true);
  const l = ligne(w);
  const voisin = placerSysteme(w.db, w.mj, w.univers, w.g, { nom: 'Voisin Lisible', q: cible.q + 9, r: cible.r + 9 } as any);
  const cleVoisin = (voisin as any).cle ?? w.q('SELECT cle FROM swn_systemes WHERE nom=?', 'Voisin Lisible')[0].cle;
  tracerRoute(w.db, w.mj, w.univers, w.g, { depuis: l.cle, vers: cleVoisin, publique: true });
  return { r, l, cleVoisin, avantVoisins, avantLea };
}

test('masquer un système tiré : ancré (promu), secret, voisins tirés identiques, une seule transaction', () => {
  const w = monde();
  const avant = voisinsTires(w);
  assert.equal(ligne(w), undefined);
  const r = w.masquer(true);
  const l = ligne(w);
  assert.equal(l.promu, 1); assert.equal(l.secret, 1);
  assert.deepEqual(voisinsTires(w), avant);
  assert.equal(r.interieur.etat, 'defini');
  assert.ok(w.q('SELECT 1 FROM swn_astres WHERE systeme_id=?', l.id).length >= FS.systemes[0].sortie.astres.length);
});

test('masquer échoue sans rien écrire : jeton périmé → a_change, jeton absent → invalide, booléen faux → invalide', () => {
  const w = monde();
  const e1 = erreur(() => w.masquer(true, w.mj, w.ver() + 1));
  assert.equal(e1.code, 'conflit'); assert.equal(e1.detail, 'a_change');
  assert.equal(erreur(() => w.masquer(true, w.mj, null)).code, 'invalide');
  assert.equal(erreur(() => w.masquer('oui')).code, 'invalide');
  assert.equal(erreur(() => w.masquer(1)).code, 'invalide');
  assert.equal(ligne(w), undefined, 'rien d\'ancré');
  // Defined system: a stale token is a conflict too, and writes nothing.
  w.masquer(true);
  const v = ligne(w).version;
  const e2 = erreur(() => w.masquer(false, w.mj, v + 5));
  assert.equal(e2.detail, 'a_change');
  assert.equal(ligne(w).secret, 1);
});

test('systeme_inconnu : un hexagone sans système ni étoile tirée est introuvable, à un MJ aussi, sans ancrage', () => {
  const w = monde();
  const vide = { q: cible.q + 1, r: cible.r + 1 };
  const e = erreur(() => w.masquer(true, w.mj, w.ver(), vide));
  assert.equal(e.code, 'introuvable'); assert.equal(e.detail, 'systeme_inconnu');
  assert.equal(w.q('SELECT count(*) AS n FROM swn_systemes')[0].n, 0);
  assert.equal(erreur(() => etatMasque(w.db, w.mj, w.univers, w.g, vide.q, vide.r)).detail, 'systeme_inconnu');
});

test('écriture refusée à une joueuse, au MJ en mode joueur, à un étranger : rien d\'ancré, rien d\'écrit', () => {
  const w = monde();
  assert.equal(erreur(() => w.masquer(true, w.lea)).code, 'refuse');
  assert.equal(erreur(() => w.masquer(true, w.mjJoueur)).code, 'refuse');
  assert.equal(w.q('SELECT count(*) AS n FROM swn_systemes')[0].n, 0);
  w.masquer(true);
  // A system the caller cannot read is `introuvable` (it is hidden from them), never `refuse`: no hint that it exists.
  assert.equal(erreur(() => w.masquer(false, w.lea, ligne(w).version)).code, 'introuvable');
  assert.equal(erreur(() => w.masquer(false, w.mjJoueur, ligne(w).version)).code, 'introuvable');
  assert.equal(ligne(w).secret, 1);
  const etranger = { compteId: 999999 };
  assert.equal(erreur(() => w.masquer(false, etranger, ligne(w).version)).code, 'introuvable');
});

test('masqué : la galaxie d\'une joueuse (et du MJ en mode joueur) n\'a ni étoile, ni nom, ni route vers la case', () => {
  const w = monde();
  const { l, cleVoisin } = masqueAvecVoisin(w);
  for (const lecteur of [w.lea, w.mjJoueur]) {
    const vue = lireBlocs(w.db, lecteur, w.univers, w.g, R0, R1);
    assert.ok(!vue.blocs.some((b) => b.generes.some(([q, r]) => q === cible.q && r === cible.r)), 'pas d\'étoile tirée');
    assert.ok(!vue.systemes.some((s) => s.q === cible.q && s.r === cible.r));
    assert.ok(vue.systemes.some((s) => s.cle === cleVoisin), 'le voisin reste');
    assert.deepEqual(vue.routes, []);
    contient(vue, l.cle, l.nom);
    assert.equal(erreur(() => lireRoute(w.db, lecteur, w.univers, w.g, w.q('SELECT id FROM swn_routes')[0].id)).code, 'introuvable');
  }
  // The GM reads everything, the flag included.
  const mj = lireBlocs(w.db, w.mj, w.univers, w.g, R0, R1);
  assert.equal(mj.systemes.find((s) => s.q === cible.q && s.r === cible.r)!.secret, true);
  assert.equal(mj.routes.length, 1);
});

test('masqué : lireSysteme, lireInterieur, recherche, illustration, sorties, trajet répondent comme pour un inconnu', async () => {
  const w = monde();
  const { l, cleVoisin } = masqueAvecVoisin(w);
  const astre = w.q('SELECT cle FROM swn_astres WHERE systeme_id=? LIMIT 1', l.id)[0].cle;
  const vide = { q: cible.q + 1, r: cible.r + 1 };
  const code = (f: () => unknown) => { const e = erreur(f); return [e.code, e.message, e.detail]; };
  for (const lecteur of [w.lea, w.mjJoueur]) {
    assert.deepEqual(code(() => lireSysteme(w.db, lecteur, w.univers, w.g, l.cle)), code(() => lireSysteme(w.db, lecteur, w.univers, w.g, 'inexistant')));
    assert.deepEqual(code(() => lireInterieur(w.db, lecteur, w.univers, w.g, cible.q, cible.r)), code(() => lireInterieur(w.db, lecteur, w.univers, w.g, vide.q, vide.r)));
    assert.deepEqual(rechercherSystemes(w.db, lecteur, w.univers, w.g, l.nom), []);
    assert.deepEqual(rechercherSystemes(w.db, lecteur, w.univers, w.g, 'Système'), []);
    const ill = await illustrationAstre(w.db, lecteur, w.univers, w.g, cible.q, cible.r, astre, 128, {}, { racine: '/tmp/inexistant-kv', versionRendu: 'v', rendre: async () => Buffer.from('x') } as any).then(() => null, (e) => [e.code, e.message, e.detail]);
    const inc = await illustrationAstre(w.db, lecteur, w.univers, w.g, vide.q, vide.r, astre, 128, {}, { racine: '/tmp/inexistant-kv', versionRendu: 'v', rendre: async () => Buffer.from('x') } as any).then(() => null, (e) => [e.code, e.message, e.detail]);
    assert.deepEqual(ill, inc); assert.equal(ill![0], 'introuvable');
    // The neighbour's exits: the way to the hidden system is absent.
    const v = w.q('SELECT q, r FROM swn_systemes WHERE cle=?', cleVoisin)[0];
    assert.deepEqual(lireSorties(w.db, lecteur, w.univers, w.g, v.q, v.r), []);
    assert.deepEqual(code(() => lireSorties(w.db, lecteur, w.univers, w.g, cible.q, cible.r)), code(() => lireSorties(w.db, lecteur, w.univers, w.g, vide.q, vide.r)));
    const t = erreur(() => calculerTrajet(w.db, lecteur, w.univers, w.g, { depart: cleVoisin, arrivee: l.cle } as any));
    assert.ok(['introuvable', 'invalide'].includes(t.code));
    contient(t.message, l.cle, l.nom);
  }
  // The GM still reads the exit and the interior.
  const v = w.q('SELECT q, r FROM swn_systemes WHERE cle=?', cleVoisin)[0];
  assert.equal(lireSorties(w.db, w.mj, w.univers, w.g, v.q, v.r).length, 1);
  assert.equal(lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r).etat, 'defini');
});

test('le prédicat commun : MJ lit tout, joueuse et MJ en mode joueur seulement le non masqué, inconnu et étranger jamais', () => {
  const w = monde();
  w.masquer(true);
  const id = ligne(w).id as number;
  assert.equal(systemeLisible(w.db, w.mj, id), true);
  assert.equal(systemeLisible(w.db, w.lea, id), false);
  assert.equal(systemeLisible(w.db, w.mjJoueur, id), false);
  assert.equal(systemeLisible(w.db, { compteId: 999999 }, id), false);
  assert.equal(systemeLisible(w.db, w.mj, 424242), false);
  assert.equal(systemeLisible(w.db, w.mj, Number.NaN), false);
  assert.deepEqual([...hexagonesMasques(w.db, w.g, 'joueur')], [`${cible.q},${cible.r}`]);
  assert.deepEqual([...hexagonesMasques(w.db, w.g, 'mj')], []);
  w.masquer(false, w.mj, ligne(w).version);
  assert.equal(systemeLisible(w.db, w.lea, id), true);
  assert.equal(systemeLisible(w.db, w.mjJoueur, id), true);
  assert.equal(hexagonesMasques(w.db, w.g, 'joueur').size, 0);
});

test('démasqué : tout revient avec l\'intérieur stocké, et une écriture inchangée ne touche pas la version', () => {
  const w = monde();
  const { l, cleVoisin } = masqueAvecVoisin(w);
  const interieurMJ = JSON.stringify(lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r));
  const v = ligne(w).version;
  // Same value: nothing is written.
  w.masquer(true, w.mj, v);
  assert.equal(ligne(w).version, v);
  w.masquer(false, w.mj, v);
  assert.equal(ligne(w).secret, 0); assert.equal(ligne(w).promu, 1);
  for (const lecteur of [w.lea, w.mjJoueur]) {
    const vue = lireBlocs(w.db, lecteur, w.univers, w.g, R0, R1);
    assert.ok(vue.systemes.some((s) => s.cle === l.cle && s.nom === l.nom));
    assert.equal(vue.routes.length, 1);
    assert.equal(lireSysteme(w.db, lecteur, w.univers, w.g, l.cle).nom, l.nom);
    assert.equal(lireInterieur(w.db, lecteur, w.univers, w.g, cible.q, cible.r).etat, 'defini');
    assert.equal(rechercherSystemes(w.db, lecteur, w.univers, w.g, l.nom).length, 1);
    const vq = w.q('SELECT q, r FROM swn_systemes WHERE cle=?', cleVoisin)[0];
    assert.equal(lireSorties(w.db, lecteur, w.univers, w.g, vq.q, vq.r).length, 1);
  }
  assert.equal(JSON.stringify(lireInterieur(w.db, w.mj, w.univers, w.g, cible.q, cible.r)).replace(/"versionSysteme":\d+/, ''), interieurMJ.replace(/"versionSysteme":\d+/, ''));
});

test('le cache de lecture d\'une joueuse suit le masquage et le démasquage (lecture avant, puis après)', () => {
  const w = monde();
  const etoile = (lecteur: any) => lireBlocs(w.db, lecteur, w.univers, w.g, R0, R1).blocs.some((b) => b.generes.some(([q, r]) => q === cible.q && r === cible.r));
  assert.equal(etoile(w.lea), true);
  assert.equal(etoile(w.mj), true);
  w.masquer(true);
  assert.equal(etoile(w.lea), false, 'cache joueur périmé');
  w.masquer(false, w.mj, ligne(w).version);
  const rendu = lireBlocs(w.db, w.lea, w.univers, w.g, R0, R1);
  assert.ok(etoile(w.lea) || rendu.systemes.some((s) => s.q === cible.q && s.r === cible.r), 'la case revient (étoile ou système)');
});

test('etatMasque : {secret, promu} au MJ seul, un tiré est {false, false}, une joueuse ne lit rien', () => {
  const w = monde();
  assert.deepEqual(etatMasque(w.db, w.mj, w.univers, w.g, cible.q, cible.r), { secret: false, promu: false, versionSysteme: w.ver() });
  w.masquer(true);
  const e = etatMasque(w.db, w.mj, w.univers, w.g, cible.q, cible.r);
  assert.equal(e.secret, true); assert.equal(e.promu, true);
  for (const lecteur of [w.lea, w.mjJoueur]) {
    const err = erreur(() => etatMasque(w.db, lecteur, w.univers, w.g, cible.q, cible.r));
    assert.ok(err.code === 'introuvable' || err.code === 'refuse');
  }
  assert.equal(erreur(() => etatMasque(w.db, w.lea, w.univers, w.g, cible.q + 1, cible.r + 1)).code,
    erreur(() => etatMasque(w.db, w.lea, w.univers, w.g, cible.q, cible.r)).code, 'même réponse masqué ou vide');
});
