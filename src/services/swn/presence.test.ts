import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-liens-bloc-fiche (AD-liens-3, E-9): presenceDeFiche and the block lireFiche rends.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { presenceDeFiche } = await import('./presence.js');
const { creerFiche, lireFiche } = await import('../fiches.js');
const { poserActivation } = await import('../outils.js');

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const cid = (u: string) => q('SELECT id FROM comptes WHERE username=?', u)[0].id as number;
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const g = q('SELECT id FROM swn_galaxies WHERE univers_id = ?', univers)[0].id as number;
  db.prepare('UPDATE swn_galaxies SET visible = 1 WHERE id = ?').run(g);
  const a = (u: string, modeJoueur = false) => ({ compteId: cid(u), modeJoueur });
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const poser = (q_: number, r: number, o: { secret?: boolean; nom?: string } = {}) =>
    db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, transition) VALUES (?,?,?,?,?,?,3,'accent','',?,0,NULL)")
      .run(g, univers, `s${q_}_${r}`, o.nom ?? `S ${q_} ${r}`, q_, r, o.secret ? 1 : 0).lastInsertRowid as number;
  let n = 0;
  const astre = (sid: number, genre: string, fiche: number, extra: Record<string, unknown> = {}) => {
    const o = { nom: null, orbite: 1, heure: 3, parent: null, rang: 0, ...extra } as any;
    return db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect, fiche_id) VALUES (?,?,?,?,?,'rocheux',?,?,?,0.1,'{}',?)")
      .run(sid, `a${n++}`, genre, o.parent, o.rang, o.nom, o.orbite, o.heure, fiche).lastInsertRowid as number;
  };
  const zone = (sid: number, forme: string, nom: string | null, p: object, fiche: number) =>
    db.prepare('INSERT INTO swn_formations (systeme_id, cle, forme, nom, parametres, fiche_id) VALUES (?,?,?,?,?,?)')
      .run(sid, `z${n++}`, forme, nom, JSON.stringify(p), fiche);
  const fiche = (titre = 'Fiche') => creerFiche(db, cid('antor'), univers, { type: 'lieu', titre }).id as number;
  return { db, univers, g, a, poser, astre, zone, fiche };
}
const textes = (b: any) => b?.lignes.map((l: any) => l.texte);

test('un corps d\'un système masqué : aucun bloc pour Léa, un pour le MJ, aucun pour le MJ en mode joueur', () => {
  const w = monde();
  const f = w.fiche();
  w.astre(w.poser(1, 1, { secret: true, nom: 'Vael' }), 'planete', f, { nom: 'Orak', orbite: 4, heure: 7 });
  assert.equal(presenceDeFiche(w.db, w.a('lea'), w.univers, f), null);
  assert.deepEqual(textes(presenceDeFiche(w.db, w.a('antor'), w.univers, f)), ['Orak — système Vael, orbite 4 · 7 h']);
  assert.equal(presenceDeFiche(w.db, w.a('antor', true), w.univers, f), null);
  assert.equal(lireFiche(w.db, w.a('antor'), w.univers, f).blocs.length, 1);
});

test('galaxie masquée aux joueurs : pas de bloc pour Léa', () => {
  const w = monde();
  const f = w.fiche();
  w.astre(w.poser(1, 1, { nom: 'Vael' }), 'planete', f, { nom: 'Orak' });
  assert.equal(presenceDeFiche(w.db, w.a('lea'), w.univers, f)?.lignes.length, 1);
  w.db.prepare('UPDATE swn_galaxies SET visible = 0 WHERE id = ?').run(w.g);
  assert.equal(presenceDeFiche(w.db, w.a('lea'), w.univers, f), null);
  assert.equal(presenceDeFiche(w.db, w.a('antor'), w.univers, f)?.lignes.length, 1);
});

test('un outil désactivé n\'ajoute rien, et rien n\'est effacé', () => {
  const w = monde();
  const f = w.fiche();
  w.astre(w.poser(1, 1, { nom: 'Vael' }), 'planete', f, { nom: 'Orak' });
  assert.equal(lireFiche(w.db, w.a('antor'), w.univers, f).blocs.length, 1);
  poserActivation(w.db, w.a('antor'), { niveau: 'univers', id: w.univers }, 'swn/galaxie', false);
  assert.deepEqual(lireFiche(w.db, w.a('antor'), w.univers, f).blocs, []);
  assert.equal((w.db.prepare('SELECT COUNT(*) n FROM swn_astres WHERE fiche_id = ?').get(f) as any).n, 1);
});

test('trois corps de deux systèmes : trois lignes ordonnées galaxie, hexagone, orbite', () => {
  const w = monde();
  const f = w.fiche();
  const s2 = w.poser(2, 0, { nom: 'Bel' });
  const s1 = w.poser(1, 5, { nom: 'Vael' });
  w.astre(s2, 'planete', f, { nom: 'C', orbite: 1 });
  w.astre(s1, 'planete', f, { nom: 'B', orbite: 6 });
  w.astre(s1, 'planete', f, { nom: 'A', orbite: 2.5, heure: 4.25 });
  const b = presenceDeFiche(w.db, w.a('lea'), w.univers, f)!;
  assert.deepEqual(textes(b), ['A — système Vael, orbite 2,5 · 4,25 h', 'B — système Vael, orbite 6 · 3 h', 'C — système Bel, orbite 1 · 3 h']);
  assert.equal(b.lignes[0].adresse, `/univers/${w.univers}/outils/swn/galaxie/${w.g}/interieur/1/5`);
  assert.equal(b.titre, 'Sur la carte spatiale');
});

test('textes : corps sans nom, lune, anneau, nuage, zone sans nom, système sans nom', () => {
  const w = monde();
  const f = w.fiche();
  const s = w.poser(1, 1, { nom: 'Vael' });
  w.astre(s, 'planete', f, { orbite: 1 });
  const p = w.astre(s, 'planete', w.fiche(), { nom: 'Vael II', orbite: 3 });
  w.astre(s, 'lune', f, { nom: 'Lunule', parent: p, orbite: 3.5, heure: 2 });
  w.zone(s, 'anneau', 'Poussière', { de: 2.9, a: 3.3 }, f);
  w.zone(s, 'anneau', null, { de: 8, a: 9 }, f);
  w.zone(s, 'nuage', 'Brume', { orbite: 5, rayon: 1 }, f);
  const défaut = w.poser(4, 4, { nom: 'Système (4, 4)' });
  w.astre(défaut, 'planete', f, { nom: 'Y', orbite: 1 });
  assert.deepEqual(textes(presenceDeFiche(w.db, w.a('lea'), w.univers, f)), [
    'Astre sans nom — système Vael, orbite 1 · 3 h',
    'Poussière — système Vael, orbite 2,9 à 3,3',
    'Lunule — système Vael, lune de Vael II, orbite 3,5 · 2 h',
    'Brume — système Vael, nuage',
    'Zone sans nom — système Vael, orbite 8 à 9',
    'Y — Système (4, 4), orbite 1 · 3 h',
  ]);
});

test('51 liens donnent 50 lignes et aucun compte dans la réponse', () => {
  const w = monde();
  const f = w.fiche();
  const s = w.poser(1, 1, { nom: 'Vael' });
  for (let i = 0; i < 51; i++) w.astre(s, 'planete', f, { nom: `P${i}`, orbite: i + 1 });
  const b = presenceDeFiche(w.db, w.a('antor'), w.univers, f)!;
  assert.equal(b.lignes.length, 50);
  assert.deepEqual(Object.keys(b).sort(), ['cle', 'lignes', 'titre']);
  const v = lireFiche(w.db, w.a('antor'), w.univers, f);
  assert.ok(!/\b51\b/.test(JSON.stringify(v.blocs)));
});

test('une fiche liée à rien : pas de bloc ; autre fiche non concernée', () => {
  const w = monde();
  const f = w.fiche(), autre = w.fiche('Autre');
  w.astre(w.poser(1, 1, { nom: 'Vael' }), 'planete', f, { nom: 'Orak' });
  assert.equal(presenceDeFiche(w.db, w.a('antor'), w.univers, autre), null);
  assert.deepEqual(lireFiche(w.db, w.a('antor'), w.univers, autre).blocs, []);
});
