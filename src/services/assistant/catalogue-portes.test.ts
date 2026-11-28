import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, migrate, type Db } from '../../db/db.js';
import { changerCleFiche } from '../cles.js';
import { assurerCompte } from '../comptes.js';
import { creerFiche } from '../fiches.js';
import { generateurBouchon } from '../images/bouchon.js';
import { ajouterMembre } from '../membres.js';
import { relierSection } from '../relations.js';
import { ajouterSection, changerAudience } from '../sections.js';
import { creerUnivers } from '../univers.js';
import { catalogueDe } from './catalogue.js';

const IMAGES = { nom: 'bouchon', generateur: generateurBouchon } as never;

function monde() {
  const db: Db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'Lame' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const ouverte = (ficheId: number, titre: string, contenu: string) => {
    const s = ajouterSection(db, antor.id, u.id, ficheId, { titre, contenu });
    changerAudience(db, antor.id, u.id, ficheId, s.id, { joueursLisent: true });
    return s;
  };
  const exec = (compte: number, porte: 'mcp' | 'assistant', nom: string, args: unknown) =>
    catalogueDe(db, compte, u.id, { porte, images: IMAGES }).outils.find((o) => o.nom === nom)!.executer(args) as any;
  return { db, antor, lea, u, ouverte, exec };
}
const ok = (r: any) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.donnees;
};

test('porte mcp : un joueur n’a que les cinq outils de lecture, sans écriture, historique ni image', () => {
  const { db, lea, u } = monde();
  const noms = catalogueDe(db, lea.id, u.id, { porte: 'mcp', images: IMAGES }).outils.map((o) => o.nom).sort();
  assert.deepEqual(noms, ['chercher', 'chercher_texte', 'lire_fiche', 'lire_section', 'mentions']);
});

test('porte mcp : même un MJ n’a ni écriture, ni generer_image, ni proposer_mise_a_jour, ni creer_fiche (lire_historique en plus, AD-mcp-6)', () => {
  const { db, antor, u } = monde();
  const c = catalogueDe(db, antor.id, u.id, { porte: 'mcp', images: IMAGES });
  const noms = c.outils.map((o) => o.nom).sort();
  assert.deepEqual(noms, ['chercher', 'chercher_texte', 'lire_fiche', 'lire_historique', 'lire_section', 'mentions']);
  assert.equal(c.porte, 'mcp');
  assert.equal(c.niveau, 'lecture');
});

test('porte assistant : le jeu d’avant reste (écriture, image pour le MJ), sans chercher_texte superflu pour la sécurité du joueur', () => {
  const { db, antor, lea, u } = monde();
  const mj = catalogueDe(db, antor.id, u.id, { porte: 'assistant', images: IMAGES }).outils.map((o) => o.nom);
  for (const n of ['chercher', 'lire_fiche', 'lire_section', 'modifier_section', 'ajouter_a_section', 'creer_fiche', 'proposer_mise_a_jour', 'generer_image']) {
    assert.ok(mj.includes(n), n);
  }
  const j = catalogueDe(db, lea.id, u.id, { porte: 'assistant', images: IMAGES }).outils.map((o) => o.nom);
  assert.ok(!j.includes('generer_image') && !j.includes('creer_fiche') && !j.includes('proposer_mise_a_jour'));
  assert.ok(j.includes('modifier_section'));
  // défaut : sans porte, c'est l'assistant
  assert.ok(catalogueDe(db, antor.id, u.id, IMAGES).outils.some((o) => o.nom === 'creer_fiche'));
  assert.ok(catalogueDe(db, antor.id, u.id).outils.some((o) => o.nom === 'creer_fiche'));
});

test('aucun outil d’aucune porte n’a de paramètre de compte, d’univers, de rôle, de niveau ni de jeton', async () => {
  const { db, antor, u } = monde();
  for (const porte of ['mcp', 'assistant'] as const) {
    for (const o of catalogueDe(db, antor.id, u.id, { porte, images: IMAGES, jeton: { id: 1 } }).outils) {
      for (const k of Object.keys(o.schema.shape)) assert.ok(!/compte|univers|role|rôle|niveau|jeton|porte/i.test(k), `${porte}.${o.nom}.${k}`);
      // et le schéma est strict : un paramètre de plus est refusé
      const r: any = await o.executer({ fiche: 1, mots: 'x', univers: 1, compteId: 1 });
      assert.equal(r.ok, false);
    }
  }
});

test('porte mcp sans rôle ou univers inconnu : introuvable, comme l’assistant', () => {
  const { db, u } = monde();
  const etr = assurerCompte(db, 'etranger');
  assert.throws(() => catalogueDe(db, etr.id, u.id, { porte: 'mcp' }), (e: any) => e.code === 'introuvable');
  assert.throws(() => catalogueDe(db, etr.id, 9999, { porte: 'mcp' }), (e: any) => e.code === 'introuvable');
});

test('chercher_texte : un mot d’une section lisible rend fiche, section et extrait ; un mot d’une section fermée, rien pour le joueur', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Ormevane' });
  const s = ouverte(f.id, 'Histoire', 'La cité fut fondée sous un ciel de cendre.');
  ajouterSection(db, antor.id, u.id, f.id, { titre: 'Secret', contenu: 'Une cendre noire cache le Traître.' });
  const d = ok(exec(lea.id, 'mcp', 'chercher_texte', { mots: 'cendre' }));
  assert.equal(d.curseur, null);
  assert.equal(d.passages.length, 1);
  const p = d.passages[0];
  assert.equal(p.ficheId, f.id);
  assert.equal(p.titreFiche, 'Ormevane');
  assert.equal(p.section, s.id);
  assert.equal(p.titre, 'Histoire');
  assert.match(p.extrait, /cendre/);
  assert.ok(!/Tra[iî]tre/.test(JSON.stringify(d)));
  assert.deepEqual(exec(lea.id, 'mcp', 'chercher_texte', { mots: 'Traître' }), { ok: false, erreur: 'Introuvable.' });
  // le MJ lit les deux passages
  assert.equal(ok(exec(antor.id, 'mcp', 'chercher_texte', { mots: 'cendre' })).passages.length, 2);
});

test('chercher : une page de 20 fiches puis la suivante par curseur, sans doublon, jusqu’à null (les deux portes)', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  for (let i = 0; i < 45; i++) {
    const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: `Garde ${String(i).padStart(2, '0')}` });
    ouverte(f.id, 'S', 'Garde du port.');
  }
  for (const porte of ['mcp', 'assistant'] as const) {
    const vus: number[] = [];
    const tailles: number[] = [];
    let curseur: string | null | undefined;
    let tours = 0;
    do {
      const d = ok(exec(lea.id, porte, 'chercher', { mots: 'Garde', ...(curseur ? { curseur } : {}) }));
      tailles.push(d.fiches.length);
      vus.push(...d.fiches.map((x: any) => x.id));
      assert.ok(!('tronquee' in d));
      curseur = d.curseur;
      assert.ok(curseur === null || typeof curseur === 'string');
    } while (curseur && ++tours < 10);
    assert.deepEqual(tailles, [20, 20, 5], porte);
    assert.equal(new Set(vus).size, 45, `${porte} : doublons`);
  }
});

test('chercher : exactement 20 résultats → curseur null (pas de page vide)', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  for (let i = 0; i < 20; i++) ouverte(creerFiche(db, antor.id, u.id, { type: 'lieu', titre: `Tour ${i}` }).id, 'S', 'x');
  const d = ok(exec(lea.id, 'mcp', 'chercher', { mots: 'Tour' }));
  assert.equal(d.fiches.length, 20);
  assert.equal(d.curseur, null);
});

test('chercher_texte : pagination par curseur sans doublon, y compris quand une page n’a que des titres', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  // 25 fiches dont le seul lien avec le mot est le titre (les 20 premières par titre), puis 5 avec le mot en texte
  for (let i = 0; i < 25; i++) {
    const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: `A Phare ${String(i).padStart(2, '0')}` });
    ouverte(f.id, 'S', 'rien');
  }
  for (let i = 0; i < 5; i++) {
    const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: `Z Autre ${i}` });
    ouverte(f.id, 'S', 'On voit un phare au loin.');
  }
  const fiches = new Set<string>();
  let curseur: string | null | undefined;
  let n = 0;
  do {
    const r = exec(lea.id, 'mcp', 'chercher_texte', { mots: 'phare', ...(curseur ? { curseur } : {}) });
    if (!r.ok) { assert.fail(`page ${n} : ${JSON.stringify(r)} (le curseur est perdu)`); }
    for (const p of r.donnees.passages) fiches.add(`${p.ficheId}/${p.section}`);
    curseur = r.donnees.curseur;
  } while (curseur && ++n < 10);
  assert.ok(fiches.size >= 5);
});

test('lire_fiche : lieu:ormevane, l’id, l’ancienne clé rendent la même fiche, avec les empreintes', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Ormevane' });
  const cle = (db.prepare('SELECT cle FROM fiches WHERE id = ?').get(f.id) as any).cle as string;
  assert.equal(cle, 'lieu:ormevane');
  ouverte(f.id, 'Histoire', 'Vieille cité.');
  const cible = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Port' });
  const s2 = ouverte(cible.id, 'Description', 'Un port.');
  const src = ajouterSection(db, antor.id, u.id, f.id, { titre: 'Liens', contenu: 'x' });
  changerAudience(db, antor.id, u.id, f.id, src.id, { joueursLisent: true });
  relierSection(db, antor.id, u.id, f.id, src.id, { cibleFicheId: cible.id, qualificatif: 'voisin' });
  void s2;
  for (const porte of ['mcp', 'assistant'] as const) {
    const a = ok(exec(lea.id, porte, 'lire_fiche', { fiche: 'lieu:ormevane' }));
    const b = ok(exec(lea.id, porte, 'lire_fiche', { fiche: f.id }));
    const c = ok(exec(lea.id, porte, 'lire_fiche', { fiche: String(f.id) }));
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
    assert.equal(a.id, f.id);
    assert.equal(a.fiche, 'lieu:ormevane');
    assert.ok(typeof a.empreinte === 'string' && a.empreinte.length > 0);
    assert.ok(typeof a.empreinteEnTete === 'string' && a.empreinteEnTete.length > 0);
    assert.ok(a.sections.length >= 2);
    for (const s of a.sections) assert.ok(typeof s.empreinte === 'string' && s.empreinte.length > 0, `section ${s.id}`);
    assert.equal(a.relations.length, 1);
    assert.ok(typeof a.relations[0].empreinte === 'string' && a.relations[0].empreinte.length > 0);
    assert.equal(a.relations[0].cible.id, cible.id);
  }
  // l'ancienne clé résout encore ; la fiche se cite alors par la nouvelle
  changerCleFiche(db, { compteId: antor.id }, u.id, f.id, 'lieu:ormevane-2');
  const apres = ok(exec(lea.id, 'mcp', 'lire_fiche', { fiche: 'lieu:ormevane' }));
  assert.equal(apres.id, f.id);
  assert.equal(apres.fiche, 'lieu:ormevane-2');
});

test('lire_fiche / lire_section : clé inconnue, fiche d’un autre univers ou section fermée → « Introuvable. », identique', () => {
  const { db, antor, lea, u, exec } = monde();
  const paul = assurerCompte(db, 'paul');
  const u2 = creerUnivers(db, paul.id, { nom: 'Autre' });
  const etr = creerFiche(db, paul.id, u2.id, { type: 'lieu', titre: 'Etranger' });
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Fermee' });
  const ferme = ajouterSection(db, antor.id, u.id, f.id, { titre: 'Sec', contenu: 'x' });
  const nope = { ok: false, erreur: 'Introuvable.' };
  assert.deepEqual(exec(lea.id, 'mcp', 'lire_fiche', { fiche: 'lieu:nexistepas' }), nope);
  assert.deepEqual(exec(lea.id, 'mcp', 'lire_fiche', { fiche: etr.id }), nope);
  assert.deepEqual(exec(lea.id, 'mcp', 'lire_fiche', { fiche: 'lieu:etranger' }), nope);
  assert.deepEqual(exec(lea.id, 'mcp', 'lire_section', { fiche: 'lieu:fermee', sectionId: ferme.id }), nope);
  assert.deepEqual(exec(lea.id, 'mcp', 'mentions', { fiche: 'lieu:fermee' }), nope);
  assert.ok(!('evenement' in exec(lea.id, 'mcp', 'lire_fiche', { fiche: 999999 })));
});

test('lire_section : empreinte rendue, et l’ancien champ ficheId est refusé', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'Ormevane' });
  const s = ouverte(f.id, 'Histoire', 'Vieille cité.');
  const d = ok(exec(lea.id, 'mcp', 'lire_section', { fiche: 'lieu:ormevane', sectionId: s.id }));
  assert.ok(typeof d.empreinte === 'string' && d.empreinte.length > 0);
  const lf = ok(exec(lea.id, 'mcp', 'lire_fiche', { fiche: f.id }));
  assert.equal(lf.sections.find((x: any) => x.id === s.id).empreinte, d.empreinte);
  assert.equal(exec(lea.id, 'mcp', 'lire_section', { ficheId: f.id, sectionId: s.id }).ok, false);
});

test('mentions : 60 fiches citant une fiche → page de 50 puis 10 par curseur, null à la fin, clés rendues', () => {
  const { db, antor, lea, u, ouverte, exec } = monde();
  const cible = creerFiche(db, antor.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  ouverte(cible.id, 'S', 'x');
  for (let i = 0; i < 60; i++) {
    const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: `Cite ${String(i).padStart(2, '0')}` });
    ouverte(f.id, 'S', `Voir [[${cible.id}]].`);
  }
  const p1 = ok(exec(lea.id, 'mcp', 'mentions', { fiche: 'personnage:aldric' }));
  assert.equal(p1.mentions.length, 50);
  assert.equal(typeof p1.curseur, 'string');
  const p2 = ok(exec(lea.id, 'mcp', 'mentions', { fiche: cible.id, curseur: p1.curseur }));
  assert.equal(p2.mentions.length, 10);
  assert.equal(p2.curseur, null);
  const ids = [...p1.mentions, ...p2.mentions].map((m: any) => m.id);
  assert.equal(new Set(ids).size, 60);
  assert.ok(p1.mentions.every((m: any) => typeof m.fiche === 'string' && m.fiche.includes(':')));
  assert.equal(exec(lea.id, 'mcp', 'mentions', { fiche: cible.id, curseur: 'abc' }).ok, false);
});

test('curseur invalide : refus sans exception ni fuite', () => {
  const { lea, exec } = monde();
  for (const nom of ['chercher', 'chercher_texte']) {
    const r = exec(lea.id, 'mcp', nom, { mots: 'x', curseur: '%%%pas-un-curseur' });
    assert.equal(r.ok, false, nom);
    assert.equal(typeof r.erreur, 'string');
  }
});
