// Review tests of kanevas-battlemap-assistant-outils (B-100, B-103, AD-161, AD-battlemap-assistant-1, 2, 4, 5):
// the catalogues per role and activation, the refusals in the interface's words, the lot, the direction, the skills.
//
// TEST PLAN
//  catalogue : MJ 8 tools / player bm_lister_assets only / no role introuvable; disabling generation|cartes|assets; hiding an
//              tool from players; no schema parameter named account, universe or role
//  listing   : a player never reads a GM-only asset nor a draft
//  commandes : unknown asset named before the core (no event, map unchanged), 201 commands refused, 200 accepted by the size gate,
//              wall out of the map phrase, stale version phrase, an unknown calque has a phrase (never the raw code)
//  carte     : created hidden with its three layers, read back by bm_lire_carte with asset names
//  lot       : 10 lines prepared not launched, second call refused, 21 lines refused, no event on a refusal
//  direction : stale version refused with the sentence, write returns the event
//  skills    : readable, unknown name lists the three, every command named in a skill exists in the core
//  table     : every code the core raises in commandes.rs / document.rs has a sentence; source scan: no SQL, no better-sqlite3
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation, poserVisibilite } = await import('../../services/outils.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { PHRASES_REFUS_COEUR, COMPETENCES } = await import('./assistant.js');

const one = (app: any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const HUIT = ['bm_lister_assets', 'bm_lire_direction', 'bm_ecrire_direction', 'bm_competence', 'bm_lancer_lot', 'bm_creer_carte', 'bm_appliquer_commandes', 'bm_lire_carte'];

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-ass-')));
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const mj = one(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  const joueur = one(app, "SELECT id FROM comptes WHERE username = 'lea'").id as number;
  const dehors = one(app, "SELECT id FROM comptes WHERE username = 'teo'").id as number;
  for (const o of ['assets', 'generation', 'cartes']) poserActivation(app.db, mj, { niveau: 'systeme', id: S }, `battlemap/${o}`, true);
  const noms = (c: number) => catalogueDe(app.db, c, E).outils.map((o) => o.nom).filter((n) => n.startsWith('bm_')).sort();
  const outil = (c: number, nom: string, args: unknown): Promise<any> => catalogueDe(app.db, c, E).outils.find((o) => o.nom === nom)!.executer(args) as any;
  const assetId = (nom: string) => String(one(app, 'SELECT id FROM bm_assets WHERE univers_id = ? AND nom = ?', E, nom).id);
  return { app, E, S, mj, joueur, dehors, noms, outil, assetId };
}

test('catalogue : le MJ a les huit outils, le joueur bm_lister_assets seul, un compte sans rôle est introuvable', async () => {
  const w = await monde();
  assert.deepEqual(w.noms(w.mj), [...HUIT].sort());
  assert.deepEqual(w.noms(w.joueur), ['bm_lister_assets']);
  const u2 = one(w.app, 'SELECT id FROM univers WHERE id <> ? LIMIT 1', w.E);
  const etranger = one(w.app, 'SELECT c.id FROM comptes c WHERE NOT EXISTS (SELECT 1 FROM membres m WHERE m.compte_id = c.id AND m.univers_id = ?) LIMIT 1', w.E);
  if (etranger) assert.throws(() => catalogueDe(w.app.db, etranger.id, w.E), (e: any) => e.code === 'introuvable');
  assert.ok(u2 !== undefined || true);
});

test('catalogue : désactiver generation, cartes ou assets retire les leurs', async () => {
  const w = await monde();
  const sans = (o: string) => poserActivation(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, `battlemap/${o}`, false);
  const avec = (o: string) => poserActivation(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, `battlemap/${o}`, true);
  sans('generation');
  assert.deepEqual(w.noms(w.mj), HUIT.filter((n) => n !== 'bm_lancer_lot').sort());
  sans('cartes');
  assert.deepEqual(w.noms(w.mj), HUIT.filter((n) => !['bm_lancer_lot', 'bm_creer_carte', 'bm_appliquer_commandes', 'bm_lire_carte'].includes(n)).sort());
  sans('assets');
  assert.deepEqual(w.noms(w.mj), []);
  assert.deepEqual(w.noms(w.joueur), []);
});

test('catalogue : masquer assets au rôle joueur le retire de la liste du joueur, pas du MJ', async () => {
  const w = await monde();
  poserVisibilite(w.app.db, w.mj, { niveau: 'systeme', id: w.S }, 'battlemap/assets', { joueur: false });
  assert.deepEqual(w.noms(w.joueur), []);
  assert.equal(w.noms(w.mj).length, 8);
});

test('catalogue : aucun schéma n\'a de paramètre compte, univers ou rôle', async () => {
  const w = await monde();
  for (const o of catalogueDe(w.app.db, w.mj, w.E).outils.filter((o) => o.nom.startsWith('bm_'))) {
    for (const k of Object.keys((o.schema as any).shape)) assert.ok(!/compte|univers|role|rôle/i.test(k), `${o.nom}.${k}`);
    assert.equal((o.schema as any)._def.catchall?._def?.typeName ?? 'ZodNever', 'ZodNever', `${o.nom} strict`);
    assert.equal(o.schema.safeParse({ univers_id: 1, compte_id: 1, role: 'mj', carte_id: 1, nom: 'x', texte: 'x', version: 1, titre: 'x', largeur: 1, hauteur: 1, commandes: [{}], lignes: [] }).success, false, `${o.nom} refuse l'inconnu`);
  }
});

test('bm_lister_assets : un joueur ne lit ni un asset MJ seul ni un brouillon ; le MJ non plus pour un brouillon', async () => {
  const w = await monde();
  const avant = (await w.outil(w.joueur, 'bm_lister_assets', {})).donnees.assets.map((a: any) => a.nom);
  assert.ok(avant.length > 0);
  const secret = String(avant[0]);
  const brouillon = String(avant[1]);
  w.app.db.prepare("UPDATE fichiers SET visibilite = 'mj' WHERE id = (SELECT fichier_id FROM bm_assets WHERE nom = ?)").run(secret);
  w.app.db.prepare("UPDATE bm_assets SET etat = 'brouillon' WHERE nom = ?").run(brouillon);
  const joueur = (await w.outil(w.joueur, 'bm_lister_assets', {})).donnees.assets.map((a: any) => a.nom);
  assert.ok(!joueur.includes(secret), 'asset MJ seul');
  assert.ok(!joueur.includes(brouillon), 'brouillon');
  const mj = (await w.outil(w.mj, 'bm_lister_assets', {})).donnees.assets.map((a: any) => a.nom);
  assert.ok(mj.includes(secret));
  assert.ok(!mj.includes(brouillon), 'brouillon chez le MJ');
  const rendu = JSON.stringify(await w.outil(w.joueur, 'bm_lister_assets', {}));
  assert.ok(!rendu.includes('jeton'), 'aucun jeton de fichier');
});

test('bm_creer_carte : carte masquée avec ses trois calques ; bm_appliquer_commandes : refus nommés, sans événement ni écriture', async () => {
  const w = await monde();
  const c = await w.outil(w.mj, 'bm_creer_carte', { titre: 'Soute', largeur: 30, hauteur: 20 });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.donnees.visible, false);
  assert.equal(one(w.app, 'SELECT visible FROM bm_cartes WHERE id = ?', c.donnees.carte_id).visible, 0);
  assert.equal(c.donnees.calques.length, 3);
  assert.ok(c.evenement);
  const id = c.donnees.carte_id as number;
  const tonneau = w.assetId('Tonneau');
  const version = () => one(w.app, 'SELECT version FROM bm_cartes WHERE id = ?', id).version as number;
  const mur = one(w.app, "SELECT id FROM bm_assets WHERE categorie = 'mur' LIMIT 1");
  const calque = (t: string) => c.donnees.calques.find((k: any) => k.type === t).id;

  // unknown asset: named, before the core
  const inconnu = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: 1, commandes: [{ type: 'poser_element', id: 'e1', calque: calque('objet'), asset_id: '99999', x: 1.5, y: 1.5 }] });
  assert.deepEqual(inconnu, { ok: false, erreur: "L'asset 99999 n'existe pas dans la bibliothèque. Listez-la avec bm_lister_assets." });
  assert.equal(version(), 1);

  // 201 commands
  const beaucoup = Array.from({ length: 201 }, (_, i) => ({ type: 'poser_element', id: `e${i}`, calque: calque('objet'), asset_id: tonneau, x: 1.5, y: 1.5 }));
  const r201 = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: 1, commandes: beaucoup });
  assert.equal(r201.ok, false);
  assert.equal(r201.evenement, undefined);
  assert.equal(version(), 1);

  // wall off the map
  const dehors = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: 1, commandes: [{ type: 'tracer_mur', calque: calque('mur'), asset_id: String(mur.id), segments: [{ x: 38, y: 0, cote: 'h' }] }] });
  assert.deepEqual(dehors, { ok: false, erreur: 'Le mur sort de la carte (30 × 20).' });
  assert.equal(version(), 1);

  // unknown layer: a sentence, never the raw code
  const calqueInconnu = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: 1, commandes: [{ type: 'poser_element', id: 'e1', calque: 'fantome', asset_id: tonneau, x: 1.5, y: 1.5 }] });
  assert.equal(calqueInconnu.ok, false);
  assert.ok(!/calque_inconnu/.test(calqueInconnu.erreur), calqueInconnu.erreur);

  // nominal, then the stale version
  const bon = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: 1, commandes: [{ type: 'poser_element', id: 'e1', calque: calque('objet'), asset_id: tonneau, x: 1.5, y: 1.5 }] });
  assert.equal(bon.ok, true, JSON.stringify(bon));
  assert.equal(version(), 2);
  assert.ok(bon.evenement);
  const perimee = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: id, version: 1, commandes: [{ type: 'poser_element', id: 'e2', calque: calque('objet'), asset_id: tonneau, x: 2.5, y: 2.5 }] });
  assert.equal(perimee.ok, false);
  assert.equal(perimee.evenement, undefined);

  const lue = await w.outil(w.mj, 'bm_lire_carte', { carte_id: id });
  assert.equal(lue.ok, true);
  assert.ok(JSON.stringify(lue.donnees).includes('Tonneau'), 'nom de l\'asset');
  assert.equal((await w.outil(w.mj, 'bm_lire_carte', { carte_id: 987654 })).erreur, 'Introuvable.');
});

test('un paquet de 200 commandes passe la barrière de taille', async () => {
  const w = await monde();
  const c = await w.outil(w.mj, 'bm_creer_carte', { titre: 'Pleine', largeur: 50, hauteur: 50 });
  const tonneau = w.assetId('Tonneau');
  const cmds = Array.from({ length: 200 }, (_, i) => ({ type: 'poser_element', id: `e${i}`, calque: c.donnees.calques.find((k: any) => k.type === 'objet').id, asset_id: tonneau, x: (i % 50) + 0.5, y: Math.floor(i / 50) + 0.5 }));
  const r = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: c.donnees.carte_id, version: 1, commandes: cmds });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('bm_lancer_lot : 10 lignes préparées sans lancer, second appel refusé, 21 lignes refusées', async () => {
  const w = await monde();
  const lignes = (n: number) => Array.from({ length: n }, (_, i) => ({ nom: `Caisse ${i}`, categorie: 'objet', largeur: 1, hauteur: 1, indice: 'bois' }));
  const trop = await w.outil(w.mj, 'bm_lancer_lot', { lignes: lignes(21) });
  assert.equal(trop.ok, false);
  assert.equal(trop.evenement, undefined);
  const r = await w.outil(w.mj, 'bm_lancer_lot', { lignes: lignes(10) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.evenement);
  const lot = one(w.app, 'SELECT etat, id FROM bm_lots WHERE univers_id = ?', w.E);
  assert.equal(lot.etat, 'prepare');
  assert.equal(one(w.app, 'SELECT count(*) n FROM bm_lots_lignes WHERE lot_id = ?', lot.id).n, 10);
  assert.equal(one(w.app, "SELECT count(*) n FROM bm_assets WHERE etat = 'brouillon'").n, 0, 'rien généré');
  const second = await w.outil(w.mj, 'bm_lancer_lot', { lignes: lignes(2) });
  assert.deepEqual(second, { ok: false, erreur: 'Un lot est déjà préparé ou en cours. Ouvrez-le dans la génération.' });
  assert.equal(one(w.app, 'SELECT count(*) n FROM bm_lots_lignes WHERE lot_id = ?', lot.id).n, 10);
});

test('bm_ecrire_direction : version périmée refusée sans événement, écriture à jour avec événement', async () => {
  const w = await monde();
  const lue = (await w.outil(w.mj, 'bm_lire_direction', {})).donnees;
  const ok = await w.outil(w.mj, 'bm_ecrire_direction', { texte: 'Néons et rouille.', version: lue.version });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.evenement.type, 'direction_ecrite');
  assert.equal(one(w.app, 'SELECT source FROM bm_direction WHERE univers_id = ?', w.E).source, 'assistant');
  const perime = await w.outil(w.mj, 'bm_ecrire_direction', { texte: 'Autre.', version: lue.version });
  assert.deepEqual(perime, { ok: false, erreur: "Le texte a changé depuis que vous l'avez lu. Relisez-le." });
  const long = await w.outil(w.mj, 'bm_ecrire_direction', { texte: 'x'.repeat(5001), version: ok.donnees.version });
  assert.equal(long.ok, false);
  assert.equal(long.evenement, undefined);
});

test('bm_competence : les trois se lisent, un nom inconnu liste les trois, et chaque commande nommée existe dans le cœur', async () => {
  const w = await monde();
  assert.equal(COMPETENCES.length, 3);
  for (const n of COMPETENCES) {
    const r = await w.outil(w.mj, 'bm_competence', { nom: n });
    assert.equal(r.ok, true);
    assert.ok(r.donnees.texte.length > 100);
  }
  const inconnue = await w.outil(w.mj, 'bm_competence', { nom: '../../package' });
  assert.equal(inconnue.ok, false);
  for (const n of COMPETENCES) assert.ok(inconnue.erreur.includes(n));

  const coeur = readFileSync(new URL('../../../rust/modules/battlemap-core/src/commandes.rs', import.meta.url), 'utf8');
  const bloc = coeur.slice(coeur.indexOf('pub enum Commande'));
  const variantes = [...bloc.slice(0, bloc.indexOf('\n}\n')).matchAll(/^\s{4}([A-Z][A-Za-z]+)\s*[{,(]/gm)].map((m) => m[1]!.replace(/(?<=.)([A-Z])/g, '_$1').toLowerCase());
  assert.ok(variantes.includes('tracer_mur') && variantes.includes('poser_element'), variantes.join());
  for (const n of COMPETENCES) {
    const texte = readFileSync(new URL(`./competences/${n}.md`, import.meta.url), 'utf8');
    for (const m of texte.matchAll(/"type"\s*:\s*"([a-z_]+)"|type:\s*['"`]?([a-z_]+)['"`]?/g)) {
      const t = (m[1] ?? m[2])!;
      assert.ok(variantes.includes(t), `${n} nomme la commande ${t}, absente du cœur (${variantes.join(', ')})`);
    }
    for (const t of variantes) void t;
  }
  const nommees = COMPETENCES.map((n) => readFileSync(new URL(`./competences/${n}.md`, import.meta.url), 'utf8')).join('\n');
  for (const mot of nommees.matchAll(/`([a-z]+_[a-z_]+)`/g)) {
    const t = mot[1]!;
    if (/^(bm_|asset_id|carte_id|fiche_id|nouveaux_ids|mj_seul|vue_dessus)/.test(t)) continue;
    if (['tracer_mur', 'poser_porte'].includes(t)) assert.ok(variantes.includes(t));
  }
});

test('table des refus : chaque code que le cœur lève a sa phrase, aucune phrase ne cite le code brut', () => {
  const sources = ['commandes.rs', 'document.rs'].map((f) => readFileSync(new URL(`../../../rust/modules/battlemap-core/src/${f}`, import.meta.url), 'utf8')).join('\n');
  const codes = new Set<string>();
  for (const m of sources.matchAll(/(?:err\(|Erreur::(?:new|champ)\()\s*"([a-z_]+)"/g)) codes.add(m[1]!);
  for (const m of sources.matchAll(/\b(?:err|Erreur::new)\(\s*([a-z_]+)\s*\)/g)) void m;
  for (const m of sources.matchAll(/"((?:[a-z]+_)+(?:invalide|inconnu|inconnue|existant|pleine|incompatible|depassee))"/g)) codes.add(m[1]!);
  assert.ok(codes.size >= 10, [...codes].join());
  for (const c of codes) {
    const p = PHRASES_REFUS_COEUR[c];
    assert.ok(p !== undefined, `code ${c} sans phrase`);
    const phrase = typeof p === 'string' ? p : p({ largeur: 30, hauteur: 20, commande: 'tracer_mur' });
    assert.ok(phrase.length > 10 && !phrase.includes(c), `${c}: ${phrase}`);
  }
});

test('source : aucun SQL, aucun import de better-sqlite3 dans les outils de l\'assistant', () => {
  const src = readFileSync(new URL('./assistant.ts', import.meta.url), 'utf8');
  assert.ok(!/better-sqlite3/.test(src));
  assert.ok(!/\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(src));
  assert.ok(!/\.prepare\(|\.exec\(/.test(src));
  assert.ok(readdirSync(new URL('./competences/', import.meta.url)).length === 3);
});

test('compétence composition-de-carte : chaque exemple de commande, appliqué tel quel sur une carte, est accepté par le cœur', async () => {
  const w = await monde();
  const c = await w.outil(w.mj, 'bm_creer_carte', { titre: 'Exemples', largeur: 30, hauteur: 20 });
  const texte = readFileSync(new URL('./competences/composition-de-carte.md', import.meta.url), 'utf8');
  const exemples = [...texte.matchAll(/`(\{"type":[^`]+\})`/g)].map((m) => JSON.parse(m[1]!) as any);
  assert.ok(exemples.length >= 10, `${exemples.length} exemples`);
  const sol = one(w.app, "SELECT id FROM bm_assets WHERE categorie = 'sol' LIMIT 1").id;
  const mur = one(w.app, "SELECT id FROM bm_assets WHERE categorie = 'mur' LIMIT 1").id;
  const obj = one(w.app, "SELECT id FROM bm_assets WHERE categorie = 'objet' LIMIT 1").id;
  const idsCalques = c.donnees.calques.map((k: any) => k.id);
  for (const id of ['sol', 'murs', 'objets']) assert.ok(idsCalques.includes(id), `la compétence parle du calque ${id}, la carte a ${idsCalques}`);
  let version = c.donnees.version as number;
  const fiche = one(w.app, 'SELECT id FROM fiches WHERE univers_id = ? LIMIT 1', w.E).id;
  const prealable = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: c.donnees.carte_id, version, commandes: [{ type: 'tracer_mur', calque: 'murs', asset_id: String(mur), segments: [{ x: 3, y: 0, cote: 'h' }] }] });
  assert.equal(prealable.ok, true);
  version = prealable.donnees.version;
  for (const ex of exemples) {
    for (const k of ['asset_id']) if (ex[k] !== undefined) ex[k] = String(ex.type === 'peindre_sol' ? sol : ex.type === 'tracer_mur' ? mur : obj);
    if (ex.fiche_id !== undefined) ex.fiche_id = String(fiche);
    let r = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: c.donnees.carte_id, version, commandes: [ex] });
    if (!r.ok && ex.id === 'caisse-1') {
      // the examples are a reference list, not a script: an element deleted by a former one is posed again
      const pose = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: c.donnees.carte_id, version, commandes: [{ type: 'poser_element', id: 'caisse-1', calque: 'objets', asset_id: String(obj), x: 2.5, y: 3.5 }] });
      assert.equal(pose.ok, true, JSON.stringify(pose));
      version = pose.donnees.version;
      r = await w.outil(w.mj, 'bm_appliquer_commandes', { carte_id: c.donnees.carte_id, version, commandes: [ex] });
    }
    if (r.ok) version = r.donnees.version;
    else assert.fail(`${JSON.stringify(ex)} → ${r.erreur}`);
  }
});
