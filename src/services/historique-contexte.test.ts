// Le contexte des écritures existantes (AD-147, kanevas-synchro-historique-contexte) : chaque service laisse
// une ligne du compte de l'acteur, d'origine `ecran` ; l'assistant `assistant`, l'import `import` et son lot ;
// la résolution d'un lien en attente aucune ; jamais `inconnu`.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Readable } from 'node:stream';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { creerFiche, deplacerFiche, renommerFiche, supprimerFiche } = await import('./fiches.js');
const { ajouterMembre } = await import('./membres.js');
const { ajouterSection, ecrireContenu } = await import('./sections.js');
const { creerUnivers } = await import('./univers.js');
const { relierSection, retirerRelation } = await import('./relations.js');
const { poserEtiquetage } = await import('./etiquettes.js');
const { ajouterFichier, joindreFichier } = await import('./fichiers.js');
const { catalogueDe } = await import('./assistant/catalogue.js');
const { assurerFiche, supprimerFicheImport } = await import('./import-fiches.js');
const { creerJeton } = await import('./jetons.js');
const { ouvrirLot } = await import('./lots.js');

interface L { objet: string; action: string; compte_id: number | null; jeton_id: number | null; origine: string; lot_id: number | null }
function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  const aldric = creerFiche(db, antor, u, { type: 'personnage', titre: 'Aldric', charge: { pj: false } }).id;
  const brune = creerFiche(db, antor, u, { type: 'personnage', titre: 'Brune', charge: { pj: false } }).id;
  const sec = ajouterSection(db, antor, u, aldric, { titre: 'Histoire', contenu: 'a' }).id;
  const lignes = () => db.prepare('SELECT objet, action, compte_id, jeton_id, origine, lot_id FROM historique ORDER BY id').all() as L[];
  const apres = (fn: () => unknown): L[] => {
    db.prepare('DELETE FROM historique').run();
    fn();
    return lignes();
  };
  return { db, antor, lea, u, aldric, brune, sec, apres };
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
const propres = (ls: L[], compte: number | null, origine: string, lot: number | null = null) => {
  assert.ok(ls.length > 0, 'au moins une ligne');
  for (const l of ls) assert.deepEqual([l.compte_id, l.origine, l.lot_id], [compte, origine, lot], JSON.stringify(l));
};

test('par les services : chaque geste laisse une ligne du compte de l’acteur, origine ecran, jamais inconnu', async () => {
  const m = monde();
  const { db, antor, u, aldric, brune, sec } = m;
  propres(m.apres(() => ecrireContenu(db, antor, u, aldric, sec, 'b', 1)), antor, 'ecran');
  const l = m.apres(() => ecrireContenu(db, antor, u, aldric, sec, 'c', 2));
  assert.deepEqual(l.map((x) => [x.objet, x.action]), [['section', 'modifiee']]);
  propres(m.apres(() => deplacerFiche(db, { compteId: antor }, u, aldric, brune)), antor, 'ecran');
  propres(m.apres(() => renommerFiche(db, { compteId: antor }, u, aldric, 'Aldric II')), antor, 'ecran');
  const rel = m.apres(() => relierSection(db, antor, u, aldric, sec, { cibleFicheId: brune, qualificatif: 'ami' }));
  propres(rel, antor, 'ecran');
  const id = (db.prepare('SELECT id FROM relations').get() as { id: number }).id;
  const sup = m.apres(() => retirerRelation(db, antor, u, id));
  propres(sup, antor, 'ecran');
  assert.ok(sup.some((x) => x.objet === 'relation' && x.action === 'supprimee'));
  propres(m.apres(() => poserEtiquetage(db, { compteId: antor }, u, brune, { alias: ['Br'], etiquettes: [] })), antor, 'ecran');
  propres(m.apres(() => poserEtiquetage(db, { compteId: antor }, u, brune, { alias: ['Br'], etiquettes: ['noble'] })), antor, 'ecran');
  const dir = mkdtempSync(join(tmpdir(), 'ctx-'));
  try {
    let fid = 0;
    const joint = m.apres(() => undefined);
    assert.deepEqual(joint, []);
    db.prepare('DELETE FROM historique').run();
    const f = await ajouterFichier(db, { compteId: antor }, u, Readable.from([PNG]), 'a.png', { ou: 'mediatheque' }, dir);
    fid = (f as any).id;
    const ls = m.apres(() => joindreFichier(db, { compteId: antor }, u, aldric, sec, fid));
    propres(ls, antor, 'ecran');
    assert.ok(ls.some((x) => x.objet === 'section' && x.action === 'modifiee'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  propres(m.apres(() => supprimerFiche(db, { compteId: antor }, u, brune)), antor, 'ecran');
  assert.equal((db.prepare("SELECT count(*) n FROM historique WHERE origine = 'inconnu'").get() as { n: number }).n, 0);
});

test('un geste refusé ne laisse aucune ligne et aucun contexte', () => {
  const { db, lea, u, aldric, sec, apres } = monde();
  const l = apres(() => assert.throws(() => ecrireContenu(db, lea, u, aldric, sec, 'x', 1)));
  assert.deepEqual(l, []);
  assert.equal((db.prepare('SELECT count(*) n FROM contexte_ecriture').get() as { n: number }).n, 0);
});

test('assistant : la même écriture porte assistant, avec le compte de l’acteur', () => {
  const { db, antor, u, aldric, sec, apres } = monde();
  const outil = catalogueDe(db, antor, u).outils.find((o) => o.nom === 'modifier_section')!;
  const l = apres(() => {
    const r: any = outil.executer({ fiche: aldric, sectionId: sec, contenu: 'par IA', version: 1 });
    assert.equal(r.ok, true, JSON.stringify(r));
  });
  propres(l, antor, 'assistant');
  // Hors de l'outil, l'origine revient à ecran (le contexte ambiant ne fuit pas).
  propres(apres(() => ecrireContenu(db, antor, u, aldric, sec, 'x', 2)), antor, 'ecran');
  const ajout = catalogueDe(db, antor, u).outils.find((o) => o.nom === 'ajouter_a_section')!;
  propres(apres(() => (ajout.executer({ fiche: aldric, sectionId: sec, texte: 'plus', version: 3 }) as any)), antor, 'assistant');
});

test('import : assurerFiche et supprimerFicheImport portent import, le lot, le compte et le jeton', () => {
  const { db, antor, u, apres } = monde();
  const { jeton } = creerJeton(db, antor, u, { nom: 't', dureeJours: 7 });
  const { lot } = ouvrirLot(db, jeton);
  const corps = (t: string) => ({ type: 'personnage', titre: 'Zed', sections: [{ cle: 's:h', titre: 'Histoire', contenu: t }] });
  const cree = apres(() => assurerFiche(db, jeton, lot.lotId, 'f:zed', corps('v1')));
  propres(cree, antor, 'import', lot.lotId);
  assert.ok(cree.every((x) => x.jeton_id === jeton.id));
  assert.ok(cree.some((x) => x.objet === 'fiche' && x.action === 'creee'));
  assert.ok(cree.some((x) => x.objet === 'section'));
  const rejoue = apres(() => assurerFiche(db, jeton, lot.lotId, 'f:zed', corps('v2')));
  propres(rejoue, antor, 'import', lot.lotId);
  assert.ok(rejoue.some((x) => x.objet === 'section' && x.action === 'modifiee'));
  // Sans lot : lot_id nul.
  propres(apres(() => assurerFiche(db, jeton, null, 'f:zed', corps('v3'))), antor, 'import', null);
  const fid = (db.prepare("SELECT id FROM fiches WHERE cle = 'zed' OR titre = 'Zed'").get() as { id: number }).id;
  assert.ok(fid > 0);
  const sup = apres(() => (supprimerFicheImport as any)(db, jeton, lot.lotId, 'f:zed'));
  propres(sup, antor, 'import', lot.lotId);
  assert.ok(sup.some((x) => x.objet === 'fiche' && x.action === 'supprimee'));
});

test('systeme : résoudre un lien en attente ne laisse aucune ligne ni ne date la fiche', () => {
  const { db, antor, u, apres } = monde();
  const { jeton } = creerJeton(db, antor, u, { nom: 't', dureeJours: 7 });
  assurerFiche(db, jeton, null, 'f:a', { type: 'personnage', titre: 'A', sections: [{ cle: 's:h', titre: 'H', contenu: 'voir [[cle:f:b|Bée]]' }] });
  const a = (db.prepare("SELECT id, modifie_le FROM fiches WHERE titre = 'A'").get() as { id: number; modifie_le: string });
  const l = apres(() => assurerFiche(db, jeton, null, 'f:b', { type: 'personnage', titre: 'B' }));
  // La création de B s'écrit en import ; la résolution du texte de A, elle, ne laisse rien sur A.
  assert.ok(l.length > 0);
  const contenu = (db.prepare('SELECT contenu FROM sections WHERE fiche_id = ?').get(a.id) as { contenu: string }).contenu;
  assert.doesNotMatch(contenu, /cle:f:b/, 'le lien est bien résolu');
  const surA = db.prepare("SELECT count(*) n FROM historique WHERE fiche_id = ? AND action <> 'creee'").get(a.id) as { n: number };
  assert.equal(surA.n, 0);
  assert.equal((db.prepare('SELECT modifie_le FROM fiches WHERE id = ?').get(a.id) as any).modifie_le, a.modifie_le);
});
