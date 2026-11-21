// kanevas-synchro-cartes-noyau (AD-142, AD-114, AD-38): attachment, text and version of a map.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import {
  cartesDeFiche,
  creerCarte,
  detacherCarte,
  ecrireTexteCarte,
  lireCarte,
  listerCartes,
  rattacherCarte,
  reglerCarte,
} from './cartes.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche, supprimerFiche } from './fiches.js';
import { ajouterMembre } from './membres.js';
import { fondCarteMaxMo, lireReglage, poserReglage } from './reglages.js';
import { ajouterSection, changerAudience } from './sections.js';
import { creerUnivers } from './univers.js';

function err(fn: () => unknown): ErreurService | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurService) return e;
    throw e;
  }
  return null;
}

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const racine = mkdtempSync(join(tmpdir(), 'cartes-noyau-'));
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const teo = assurerCompte(db, 'teo');
  const u = creerUnivers(db, antor.id, { nom: 'Lame' });
  const u2 = creerUnivers(db, antor.id, { nom: 'Autre' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const ouvert = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Port-Sel', charge: {} });
  const sO = ajouterSection(db, antor.id, u.id, ouvert.id, { titre: 'Pub', contenu: 'x' });
  changerAudience(db, antor.id, u.id, ouvert.id, sO.id, { joueursLisent: true });
  const cache = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Crypte Secrète', charge: {} });
  ajouterSection(db, antor.id, u.id, cache.id, { titre: 'S', contenu: 'y' });
  const ailleurs = creerFiche(db, antor.id, u2.id, { type: 'lieu', titre: 'Ailleurs', charge: {} });
  return { db, racine, antor, lea, teo, u, u2, ouvert, cache, ailleurs };
}
type M = ReturnType<typeof monde>;

async function carte(m: M, visible = true) {
  const c = await creerCarte(m.db, m.antor.id, false, m.u.id, { titre: 'Carte', forme: 'graphe' }, m.racine);
  if (visible) reglerCarte(m.db, m.antor.id, false, c.id, { visible: true });
  return c;
}
const ligne = (db: Db, id: number) =>
  db.prepare('SELECT fiche_id, texte, texte_public, version FROM cartes WHERE id = ?').get(id) as {
    fiche_id: number | null; texte: string; texte_public: string; version: number;
  };

test('rattacher : le MJ rattache, cartesDeFiche rend la carte visible au joueur, pas la cachée', async () => {
  const m = monde();
  const vis = await carte(m, true);
  const cach = await carte(m, false);
  const v = rattacherCarte(m.db, m.antor.id, false, vis.id, m.ouvert.id);
  assert.deepEqual(v.fiche, { id: m.ouvert.id, titre: 'Port-Sel', type: 'lieu' });
  rattacherCarte(m.db, m.antor.id, false, cach.id, m.ouvert.id);
  const joueur = cartesDeFiche(m.db, { compteId: m.lea.id, modeJoueur: false }, m.u.id, m.ouvert.id);
  assert.deepEqual(joueur.map((c) => c.id), [vis.id]);
  const mj = cartesDeFiche(m.db, { compteId: m.antor.id, modeJoueur: false }, m.u.id, m.ouvert.id);
  assert.deepEqual(mj.map((c) => c.id).sort(), [vis.id, cach.id].sort());
  // GM in player mode sees what the player sees.
  const enJoueur = cartesDeFiche(m.db, { compteId: m.antor.id, modeJoueur: true }, m.u.id, m.ouvert.id);
  assert.deepEqual(enJoueur.map((c) => c.id), [vis.id]);
  // re-attaching moves it; detaching frees it; detaching twice stays free.
  rattacherCarte(m.db, m.antor.id, false, vis.id, m.cache.id);
  assert.equal(ligne(m.db, vis.id).fiche_id, m.cache.id);
  assert.equal(detacherCarte(m.db, m.antor.id, false, vis.id).fiche, null);
  assert.equal(detacherCarte(m.db, m.antor.id, false, vis.id).fiche, null);
  assert.equal(ligne(m.db, vis.id).fiche_id, null);
});

test('rattacher : la fiche supprimée détache la carte, la carte reste', async () => {
  const m = monde();
  const c = await carte(m);
  rattacherCarte(m.db, m.antor.id, false, c.id, m.ouvert.id);
  supprimerFiche(m.db, { compteId: m.antor.id, modeJoueur: false }, m.u.id, m.ouvert.id);
  assert.equal(ligne(m.db, c.id).fiche_id, null);
  assert.equal(lireCarte(m.db, m.antor.id, false, c.id).carte.fiche, null);
});

test('rattacher : refus — joueur introuvable, mode joueur refusé, fiche d’un autre univers / inconnue / non entière invalide champ fiche', async () => {
  const m = monde();
  const c = await carte(m);
  assert.equal(err(() => rattacherCarte(m.db, m.lea.id, false, c.id, m.ouvert.id))?.code, 'introuvable');
  assert.equal(err(() => rattacherCarte(m.db, m.teo.id, false, c.id, m.ouvert.id))?.code, 'introuvable');
  assert.equal(err(() => detacherCarte(m.db, m.lea.id, false, c.id))?.code, 'introuvable');
  assert.equal(err(() => rattacherCarte(m.db, m.antor.id, false, 99999, m.ouvert.id))?.code, 'introuvable');
  assert.equal(err(() => rattacherCarte(m.db, m.antor.id, true, c.id, m.ouvert.id))?.code, 'refuse');
  for (const f of [m.ailleurs.id, 99999, 1.5, Number.NaN, undefined as unknown as number, '1' as unknown as number]) {
    const e = err(() => rattacherCarte(m.db, m.antor.id, false, c.id, f));
    assert.equal(e?.code, 'invalide', String(f));
    assert.equal(e?.champ, 'fiche', String(f));
  }
  assert.equal(ligne(m.db, c.id).fiche_id, null, 'rien écrit');
  // a GM of another universe cannot touch it either
  const autre = assurerCompte(m.db, 'autre');
  assert.equal(err(() => rattacherCarte(m.db, autre.id, false, c.id, m.ouvert.id))?.code, 'introuvable');
});

test('AD-38 : la fiche rattachée n’est nommée qu’à qui la lit ; cartesDeFiche d’une fiche cachée est introuvable', async () => {
  const m = monde();
  const c = await carte(m, true);
  rattacherCarte(m.db, m.antor.id, false, c.id, m.cache.id);
  const joueur = lireCarte(m.db, m.lea.id, false, c.id);
  assert.equal(joueur.carte.fiche, undefined);
  assert.ok(!JSON.stringify(joueur).includes('Crypte'));
  const liste = listerCartes(m.db, m.lea.id, false, m.u.id, {});
  assert.ok(!JSON.stringify(liste).includes('Crypte'));
  assert.equal(liste.cartes[0].fiche, undefined);
  const enJoueur = lireCarte(m.db, m.antor.id, true, c.id);
  assert.equal(enJoueur.carte.fiche, undefined);
  assert.ok(!JSON.stringify(enJoueur).includes('Crypte'));
  assert.equal(lireCarte(m.db, m.antor.id, false, c.id).carte.fiche?.titre, 'Crypte Secrète');
  assert.equal(err(() => cartesDeFiche(m.db, { compteId: m.lea.id, modeJoueur: false }, m.u.id, m.cache.id))?.code, 'introuvable');
  assert.equal(err(() => cartesDeFiche(m.db, { compteId: m.teo.id, modeJoueur: false }, m.u.id, m.ouvert.id))?.code, 'introuvable');
  // a sheet of another universe is unknown under this one
  assert.equal(err(() => cartesDeFiche(m.db, { compteId: m.antor.id, modeJoueur: false }, m.u.id, m.ailleurs.id))?.code, 'introuvable');
  // la fiche cachée devient lisible → nommée
  const s = m.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').get(m.cache.id) as { id: number };
  changerAudience(m.db, m.antor.id, m.u.id, m.cache.id, s.id, { joueursLisent: true });
  assert.equal(lireCarte(m.db, m.lea.id, false, c.id).carte.fiche?.titre, 'Crypte Secrète');
});

test('texte : le bloc MJ est servi au MJ, jamais au joueur (HTML et source) ; texte_public écrit avec texte', async () => {
  const m = monde();
  const c = await carte(m, true);
  const v = ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'Public.\n\n:::mj\nSecret du MJ\n:::\n\nFin **gras**.', 0);
  assert.equal(v.version, 1);
  assert.ok(v.html.includes('Secret du MJ'), 'le MJ voit tout');
  assert.ok(v.texte?.includes(':::mj'));
  const row = ligne(m.db, c.id);
  assert.ok(!row.texte_public.includes('Secret'));
  assert.ok(row.texte_public.includes('Public.') && row.texte_public.includes('Fin'));
  for (const lue of [
    lireCarte(m.db, m.lea.id, false, c.id).carte,
    lireCarte(m.db, m.antor.id, true, c.id).carte,
    listerCartes(m.db, m.lea.id, false, m.u.id, {}).cartes[0],
  ]) {
    assert.ok(!JSON.stringify(lue).includes('Secret'));
    assert.ok(lue.html.includes('<strong>gras</strong>'));
    assert.equal(lue.texte, undefined);
    assert.equal(lue.version, undefined);
    assert.equal(lue.cleOrigine, undefined);
  }
});

test('texte : HTML brut inerte, [[lien]] non actif et aucune ligne dans liens', async () => {
  const m = monde();
  const c = await carte(m, true);
  const avant = (m.db.prepare('SELECT count(*) n FROM liens').get() as { n: number }).n;
  const v = ecrireTexteCarte(m.db, m.antor.id, false, c.id, `<script>alert(1)</script> voir [[${m.ouvert.id}]] et [[${m.cache.id}|Crypte]]`);
  assert.ok(!v.html.includes('<script'));
  assert.ok(!/<a [^>]*fiche/.test(v.html), v.html);
  assert.equal((m.db.prepare('SELECT count(*) n FROM liens').get() as { n: number }).n, avant);
  const j = lireCarte(m.db, m.lea.id, false, c.id).carte;
  assert.ok(!/<a [^>]*fiche/.test(j.html));
});

test('texte : 5 000 caractères au plus ; refus sans rien écrire ; non-chaîne invalide', async () => {
  const m = monde();
  const c = await carte(m);
  ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'x'.repeat(5000), 0);
  const e = err(() => ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'x'.repeat(5001), 1));
  assert.equal(e?.code, 'invalide');
  assert.equal(e?.champ, 'texte');
  assert.equal(ligne(m.db, c.id).version, 1);
  assert.equal(ligne(m.db, c.id).texte.length, 5000);
  assert.equal(err(() => ecrireTexteCarte(m.db, m.antor.id, false, c.id, 12 as unknown as string, 1))?.code, 'invalide');
  // vide : permis, efface
  const v = ecrireTexteCarte(m.db, m.antor.id, false, c.id, '', 1);
  assert.equal(v.texte, '');
  assert.equal(ligne(m.db, c.id).texte_public, '');
});

test('version : deux écritures de la même version → 409 carte_modifiee à la seconde ; sans version passe ; refus ne bouge rien', async () => {
  const m = monde();
  const c = await carte(m);
  assert.equal(ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'un', 0).version, 1);
  const e = err(() => ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'deux', 0));
  assert.equal(e?.code, 'conflit');
  assert.equal(e?.detail, 'carte_modifiee');
  assert.deepEqual(ligne(m.db, c.id), { fiche_id: null, texte: 'un', texte_public: 'un', version: 1 });
  // version in the future is stale too
  assert.equal(err(() => ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'trois', 5))?.detail, 'carte_modifiee');
  // without version: passes (the import's door) and bumps
  assert.equal(ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'trois').version, 2);
  assert.equal(ecrireTexteCarte(m.db, m.antor.id, false, c.id, 'quatre', 2).version, 3);
});

test('texte : joueur introuvable, mode joueur refusé, carte inconnue introuvable', async () => {
  const m = monde();
  const c = await carte(m);
  assert.equal(err(() => ecrireTexteCarte(m.db, m.lea.id, false, c.id, 'x', 0))?.code, 'introuvable');
  assert.equal(err(() => ecrireTexteCarte(m.db, m.teo.id, false, c.id, 'x', 0))?.code, 'introuvable');
  assert.equal(err(() => ecrireTexteCarte(m.db, m.antor.id, true, c.id, 'x', 0))?.code, 'refuse');
  assert.equal(err(() => ecrireTexteCarte(m.db, m.antor.id, false, 99999, 'x', 0))?.code, 'introuvable');
  assert.equal(ligne(m.db, c.id).version, 0);
});

test('lecture : le MJ lit texte, version, cleOrigine ; le texte d’une carte neuve est vide', async () => {
  const m = monde();
  const c = await carte(m);
  const v = lireCarte(m.db, m.antor.id, false, c.id).carte;
  assert.equal(v.texte, '');
  assert.equal(v.version, 0);
  assert.equal(v.cleOrigine, null);
  assert.equal(v.fiche, null);
  assert.equal(v.html, '');
});

test('reglages : fondCarteMaxMo 75 par défaut, valeur posée, valeur hors bornes ignorée', () => {
  const m = monde();
  assert.equal(fondCarteMaxMo(m.db), 75);
  poserReglage(m.db, 'fond_carte_max_mo', '120', m.antor.id);
  assert.equal(fondCarteMaxMo(m.db), 120);
  assert.equal(lireReglage(m.db, 'fond_carte_max_mo'), '120');
  for (const x of ['0', '501', '-3', '1.5', 'abc', '']) {
    poserReglage(m.db, 'fond_carte_max_mo', x, null);
    assert.equal(fondCarteMaxMo(m.db), 75, x);
  }
  assert.equal(lireReglage(m.db, 'inconnu'), null);
});
