// Critère de sortie de kanevas-carte-rendu-galaxie-systemes-ecrivains : classe, taille continue et couleur libre d'un système,
// écrites par les routes (T-3), l'ancrage et l'import de galaxie, relues en base. Par la porte (`inject`), sans écran.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type Any, appel, lire, type Monde, monde } from './monde-lot-cartes.js';

const { importerGalaxie } = await import('../services/swn/import-galaxie.js');
const { ancrer } = await import('../services/swn/ecriture-systeme.js');

const galerie = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
const ligne = (m: Monde, cle: string): Any =>
  m.app.db.prepare('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(m.gid, cle);
const patch = (m: Monde, corps: object, cle = 'vael') => appel(m, 'antor', 'PATCH', galerie(m, `/systemes/${cle}`), { version: ligne(m, cle).version, ...corps });

test('PATCH : classe, taille et couleur écrites et relues ; classe null effacée', async () => {
  const m = await monde();
  const r = await patch(m, { classe: 'G', taille: 0.3, couleur: '#aabbcc' });
  assert.equal(r.status, 200, r.texte);
  assert.deepEqual([ligne(m, 'vael').classe, ligne(m, 'vael').taille, ligne(m, 'vael').couleur], ['G', 0.3, '#aabbcc']);
  for (const c of ['M', 'K', 'F', 'A', 'B', 'V']) assert.equal((await patch(m, { classe: c })).status, 200, c);
  assert.equal(ligne(m, 'vael').classe, 'V');
  assert.equal((await patch(m, { classe: null, couleur: null })).status, 200);
  assert.deepEqual([ligne(m, 'vael').classe, ligne(m, 'vael').couleur], [null, null]);
  // 1 reste l'ancienne taille 1 (0.15) : la table de conversion le veut, la borne haute s'écrit 0.999 ou « 5 ».
  for (const t of [0, 0.999]) { assert.equal((await patch(m, { taille: t })).status, 200); assert.equal(ligne(m, 'vael').taille, t); }
});

test('PATCH : refus invalide avec champ, rien écrit', async () => {
  const m = await monde();
  const avant = ligne(m, 'vael');
  const cas: [object, string][] = [
    [{ couleur: 'violet' }, 'couleur'], [{ couleur: '#ABCDEF' }, 'couleur'], [{ couleur: '#abc' }, 'couleur'], [{ couleur: 5 }, 'couleur'],
    [{ taille: 1.5 }, 'taille'], [{ taille: -0.1 }, 'taille'], [{ taille: 'énorme' }, 'taille'], [{ taille: null }, 'taille'],
    [{ classe: 'Z' }, 'classe'], [{ classe: 'g' }, 'classe'], [{ classe: 'GG' }, 'classe'], [{ classe: '' }, 'classe'], [{ classe: 3 }, 'classe'],
  ];
  for (const [corps, champ] of cas) {
    const r = await patch(m, corps);
    assert.equal(r.status, 400, `${JSON.stringify(corps)} ${r.texte}`);
    assert.equal(r.json.code, 'invalide');
    assert.equal(r.json.champ, champ, JSON.stringify(corps));
  }
  assert.deepEqual(ligne(m, 'vael'), avant);
});

test('PATCH : les anciens noms sont acceptés (grande = 0.75, ambre = #f2a33c, neutre = null)', async () => {
  const m = await monde();
  assert.equal((await patch(m, { taille: 'grande', couleur: 'ambre' })).status, 200);
  assert.deepEqual([ligne(m, 'vael').taille, ligne(m, 'vael').couleur], [0.75, '#f2a33c']);
  assert.equal((await patch(m, { taille: 'petite', couleur: 'neutre' })).status, 200);
  assert.deepEqual([ligne(m, 'vael').taille, ligne(m, 'vael').couleur], [0.15, null]);
});

test('POST : classe écrite ; absente, elle reste null en base ; refus de Z', async () => {
  const m = await monde();
  const a = await appel(m, 'antor', 'POST', galerie(m, '/systemes'), { nom: 'Alpha', q: 40, r: 40, classe: 'B', taille: 0.9, couleur: '#010203' });
  assert.equal(a.status, 201, a.texte);
  assert.deepEqual([ligne(m, a.json.cle).classe, ligne(m, a.json.cle).taille, ligne(m, a.json.cle).couleur], ['B', 0.9, '#010203']);
  const b = await appel(m, 'antor', 'POST', galerie(m, '/systemes'), { nom: 'Beta', q: 41, r: 40 });
  assert.equal(b.status, 201, b.texte);
  assert.equal(ligne(m, b.json.cle).classe, null);
  const z = await appel(m, 'antor', 'POST', galerie(m, '/systemes'), { nom: 'Zed', q: 42, r: 40, classe: 'Z' });
  assert.equal(z.status, 400);
  assert.equal(z.json.champ, 'classe');
  assert.equal(m.app.db.prepare("SELECT count(*) n FROM swn_systemes WHERE nom = 'Zed'").get().n, 0);
});

test('PATCH : une joueuse ne peut pas écrire la classe', async () => {
  const m = await monde();
  const r = await appel(m, 'lea', 'PATCH', galerie(m, '/systemes/vael'), { classe: 'M', version: ligne(m, 'vael').version });
  assert.notEqual(r.status, 200);
  assert.equal(ligne(m, 'vael').classe, null);
});

test('ancrer : la classe est la lettre de l’étoile tirée, la taille suit (t − 0.65) / 1.45, aucune couleur', async () => {
  const m = await monde();
  const F = JSON.parse(readFileSync(fileURLToPath(new URL('../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
  const g = m.app.db.prepare('SELECT * FROM swn_galaxies WHERE id = ?').get(m.gid) as Any;
  m.app.db.prepare('UPDATE swn_galaxies SET graine = ? WHERE id = ?').run(F.graine, m.gid);
  const { q, r, taille, lettre } = F.systemes[0].entree;
  const acteur = { compteId: m.app.db.prepare("SELECT id FROM comptes WHERE username='antor'").get().id };
  ancrer(m.app.db, acteur, m.uid, m.gid, q, r, { versionSysteme: m.app.db.prepare('SELECT version FROM swn_galaxies WHERE id=?').get(m.gid).version });
  const s = m.app.db.prepare('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND q = ? AND r = ?').get(m.gid, q, r) as Any;
  assert.ok(s, 'ligne ancrée');
  assert.ok(g);
  assert.equal(s.classe, lettre);
  assert.equal(s.couleur, null);
  assert.ok(s.taille >= 0 && s.taille <= 1);
  assert.ok(Math.abs(s.taille - (taille - 0.65) / 1.45) < 1e-9 , `taille ${s.taille}`);
});


const importer = (m: Monde, corps: unknown) => {
  const acteur = { compteId: m.app.db.prepare("SELECT id FROM comptes WHERE username='antor'").get().id as number };
  return importerGalaxie(m.app.db, acteur, m.uid, m.gid, corps);
};
const sysImp = (extra: object = {}) => ({ systemes: [{ cle: 'imp-a', nom: 'Imp A', q: 50, r: 50, ...extra }] });

test('import : classe facultative écrite et rejouée inchangée ; classe changée = mise à jour ; Z refusée', async () => {
  const m = await monde();
  const r1 = importer(m, sysImp({ classe: 'F', taille: 0.4, couleur: '#112233' }));
  assert.equal(r1.natures.systemes.creees, 1);
  assert.deepEqual([ligne(m, 'imp-a').classe, ligne(m, 'imp-a').taille, ligne(m, 'imp-a').couleur], ['F', 0.4, '#112233']);
  assert.equal(importer(m, sysImp({ classe: 'F', taille: 0.4, couleur: '#112233' })).natures.systemes.inchangees, 1);
  assert.equal(importer(m, sysImp({ classe: 'K', taille: 0.4, couleur: '#112233' })).natures.systemes.mises_a_jour, 1);
  assert.equal(ligne(m, 'imp-a').classe, 'K');
  const z = importer(m, sysImp({ classe: 'Z' }));
  assert.equal(z.natures.systemes.refusees, 1);
  assert.equal(ligne(m, 'imp-a').classe, 'K');
});

test('import ancien format : même rapport au rejeu, lignes inchangées, ligne égale à la migrée (taille 3 = 0.75, ambre = #f2a33c)', async () => {
  const m = await monde();
  const ancien = { systemes: [{ cle: 'imp-b', nom: 'Imp B', q: 51, r: 50, taille: 3, couleur: 'ambre' }, { cle: 'imp-c', nom: 'Imp C', q: 52, r: 50 }] };
  const r1 = importer(m, ancien);
  assert.equal(r1.natures.systemes.creees, 2);
  assert.deepEqual([ligne(m, 'imp-b').taille, ligne(m, 'imp-b').couleur, ligne(m, 'imp-b').classe], [0.75, '#f2a33c', null]);
  assert.equal(ligne(m, 'imp-c').classe, null);
  const v = ligne(m, 'imp-b').version;
  const r2 = importer(m, ancien);
  assert.deepEqual(r2.natures.systemes, { creees: 0, mises_a_jour: 0, inchangees: 2, refusees: 0 });
  assert.equal(ligne(m, 'imp-b').version, v);
});

test('import : un rejeu sans classe sur un système dont la classe a été posée à la main (PATCH)', async () => {
  const m = await monde();
  importer(m, sysImp());
  const p = await patch(m, { classe: 'A' }, 'imp-a');
  assert.equal(p.status, 200, p.texte);
  const r = importer(m, sysImp());
  // le MJ a modifié la ligne hors fichier : le fichier ne dit pas la classe, la ligne diffère -> refus « modifié » ou inchangé, jamais écrasé en silence
  assert.ok(ligne(m, 'imp-a').classe === 'A' || r.natures.systemes.mises_a_jour === 1, JSON.stringify(r.natures));
  if (ligne(m, 'imp-a').classe === 'A') assert.equal(r.natures.systemes.refusees + r.natures.systemes.inchangees, 1);
});
