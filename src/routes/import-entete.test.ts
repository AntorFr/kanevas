// PATCH /fiches/:cle (kanevas-synchro-ecriture-entete, B-82, B-86, AD-141, AD-146, AD-ecriture-1, AD-99):
// the header is written field by field, under the header fingerprint, through /api/v1 and the import alias.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-entete-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerFiche, renommerFiche } = await import('../services/fiches.js');
const { relierSection } = await import('../services/relations.js');
const { poserEtiquetage } = await import('../services/etiquettes.js');
const { changerCleFiche } = await import('../services/cles.js');
const { ecrireContenu } = await import('../services/sections.js');

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id, cle FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number; cle: string };
  const antor = trouverCompte(app.db, 'antor')!.id;
  const jeton = (niveau: 'lecture' | 'ecriture') =>
    creerJeton(app.db, antor, { nom: 'E', dureeJours: 30, acces: { tous: true, niveauTous: niveau } } as never, app.horloge());
  const auth = { authorization: `Bearer ${jeton('ecriture').valeur}` };
  const lecture = { authorization: `Bearer ${jeton('lecture').valeur}` };
  const base = `/api/v1/univers/${u.id}`;
  const patch = (cle: string, corps: unknown, h: Record<string, string> = {}, q = '', prefixe = base) =>
    app.inject({ method: 'PATCH', url: `${prefixe}/fiches/${cle}${q}`, headers: { ...auth, ...h }, payload: corps as never });
  const lire = async (cle: string) => (await app.inject({ method: 'GET', url: `${base}/fiches/${cle}`, headers: auth })).json();
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const lotLu = async (l: number) => (await app.inject({ method: 'GET', url: `${base}/lots/${l}`, headers: auth })).json();
  const nouvelle = (titre: string, type = 'lieu') => {
    const f = creerFiche(app.db, antor, u.id, { type, titre, ...(type === 'personnage' ? { charge: { v: 1, pj: false } } : {}), sections: type === 'aventure' ? undefined : [{ titre: 'A' }, { titre: 'B' }] } as never);
    const cle = (app.db.prepare('SELECT cle FROM fiches WHERE id = ?').get(f.id) as { cle: string }).cle;
    const sec = (app.db.prepare('SELECT id FROM sections WHERE fiche_id = ? ORDER BY ordre').all(f.id) as { id: number }[]).map((s) => s.id);
    return { id: f.id, cle, sec };
  };
  const ligne = (id: number) => app.db.prepare('SELECT titre, modifie_le, parent_id, sous_type, type FROM fiches WHERE id = ?').get(id) as any;
  const nb = (t: string) => (app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  return { app, u, antor, auth, lecture, base, patch, lire, lot, lotLu, nouvelle, ligne, nb };
}

test('PATCH {titre} : le titre change, sections, relations, alias, étiquettes et parent restent', async () => {
  const m = await monter();
  const p = m.nouvelle('Parent');
  const cible = m.nouvelle('Cible');
  const f = m.nouvelle('Zorn');
  m.app.db.prepare('UPDATE fiches SET parent_id = ? WHERE id = ?').run(p.id, f.id);
  relierSectionDeux(m, f, cible);
  poserEtiquetage(m.app.db, { compteId: m.antor }, m.u.id, f.id, { alias: ['Zz'], etiquettes: ['rouge'] });
  const avant = await m.lire(f.cle);
  const sectionsAvant = m.app.db.prepare('SELECT id, titre, contenu, version FROM sections WHERE fiche_id = ? ORDER BY id').all(f.id);
  const relAvant = m.nb('relations');
  const r = await m.patch(f.cle, { titre: 'Zorn le Grand' });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.id, f.id);
  assert.equal(j.etat, 'mise_a_jour');
  assert.match(j.empreinteEnTete, /^[0-9a-f]{32}$/);
  assert.notEqual(j.empreinteEnTete, avant.empreinteEntete);
  assert.match(j.empreinte, /^[0-9a-f]{32}$/);
  assert.equal(m.ligne(f.id).titre, 'Zorn le Grand');
  assert.equal(m.ligne(f.id).parent_id, p.id);
  assert.deepEqual(m.app.db.prepare('SELECT id, titre, contenu, version FROM sections WHERE fiche_id = ? ORDER BY id').all(f.id), sectionsAvant);
  assert.equal(m.nb('relations'), relAvant);
  const apres = await m.lire(f.cle);
  assert.deepEqual(apres.entete.alias, ['Zz']);
  assert.deepEqual(apres.entete.etiquettes, ['rouge']);
});

function relierSectionDeux(m: Awaited<ReturnType<typeof monter>>, f: { id: number; sec: number[] }, cible: { id: number }) {
  relierSection(m.app.db, m.antor, m.u.id, f.id, f.sec[0]!, { cibleFicheId: cible.id, type: 'lieu' } as never);
  relierSection(m.app.db, m.antor, m.u.id, f.id, f.sec[1]!, { cibleFicheId: cible.id, type: 'lieu' } as never);
}

test('PATCH du même titre : inchangee, modifie_le intact ; le lot compte « 1 inchangée »', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const avant = m.ligne(f.id).modifie_le;
  const histo = m.nb('historique');
  const l = await m.lot();
  const r = await m.patch(f.cle, { titre: 'Zorn' }, {}, `?lot=${l}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'inchangee');
  assert.equal(m.ligne(f.id).modifie_le, avant);
  assert.equal(m.nb('historique'), histo);
  assert.equal((await m.lotLu(l)).compteurs.fiches.inchangees, 1);
});

test('lot : « 1 mise à jour » sur une écriture, « 1 refusée » sur un champ inconnu', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const l = await m.lot();
  assert.equal((await m.patch(f.cle, { titre: 'Neuf' }, {}, `?lot=${l}`)).statusCode, 200);
  assert.equal((await m.patch(f.cle, { bidule: 1 }, {}, `?lot=${l}`)).statusCode, 400);
  const c = (await m.lotLu(l)).compteurs.fiches;
  assert.equal(c.mises_a_jour, 1);
  assert.equal(c.refusees, 1);
});

test('If-Match : une section modifiée au navigateur ne fait pas échouer ; un titre changé, si (412, rien d\'écrit)', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const lue = (await m.lire(f.cle)).empreinteEntete as string;
  const v = (m.app.db.prepare('SELECT version FROM sections WHERE id = ?').get(f.sec[0]) as { version: number }).version;
  ecrireContenu(m.app.db, m.antor, m.u.id, f.id, f.sec[0]!, 'du texte neuf', v);
  const ok = await m.patch(f.cle, { sousType: 'ville' }, { 'if-match': `"${lue}"` });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(m.ligne(f.id).sous_type, 'ville');

  const lue2 = (await m.lire(f.cle)).empreinteEntete as string;
  renommerFiche(m.app.db, m.antor, m.u.id, f.id, 'Changé au navigateur');
  const avant = m.ligne(f.id);
  const histo = m.nb('historique');
  const l = await m.lot();
  const r = await m.patch(f.cle, { titre: 'Script' }, { 'if-match': `"${lue2}"` }, `?lot=${l}`);
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(r.json().code, 'empreinte_perimee');
  assert.deepEqual(m.ligne(f.id), avant);
  assert.equal(m.nb('historique'), histo);
  assert.equal((await m.lotLu(l)).compteurs.fiches.refusees, 1);
});

test('champ inconnu : 400 champ, rien d\'écrit, même avec un champ valide à côté', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const avant = m.ligne(f.id);
  const r = await m.patch(f.cle, { titre: 'Neuf', couleur: 'bleu' });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'couleur');
  assert.deepEqual(m.ligne(f.id), avant);
  // Un champ de section n'est pas un champ d'en-tête.
  assert.equal((await m.patch(f.cle, { sections: [] })).json().champ, 'sections');
  // Corps qui n'est pas un objet.
  assert.equal((await m.patch(f.cle, [])).statusCode, 400);
});

test('valeurs fausses : titre vide ou trop long, type inconnu, pj non booléen → 400 champ', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  for (const [corps, champ] of [
    [{ titre: '' }, 'titre'], [{ titre: 'x'.repeat(121) }, 'titre'], [{ type: 'dragon' }, 'type'],
    [{ pj: 'oui' }, 'pj'], [{ statut: 'x' }, 'statut'], [{ alias: 'a' }, 'alias'],
  ] as [unknown, string][]) {
    const r = await m.patch(f.cle, corps);
    assert.equal(r.statusCode, 400, JSON.stringify(corps) + r.body);
    assert.equal(r.json().champ, champ, JSON.stringify(corps));
  }
  assert.equal(m.ligne(f.id).titre, 'Zorn');
  // Bord : 120 caractères passent.
  assert.equal((await m.patch(f.cle, { titre: 'x'.repeat(120) })).statusCode, 200);
});

test('champs que le type ne déclare pas : pj sur un lieu, statut sur un lieu → 400 champ', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  assert.equal((await m.patch(f.cle, { pj: true })).json().champ, 'pj');
  assert.equal((await m.patch(f.cle, { statut: 'en_cours' })).statusCode, 400);
});

test('parent : cyclique et inconnu → 400 champ parent, rien d\'écrit ; null remonte à la racine ; valide déplace', async () => {
  const m = await monter();
  const a = m.nouvelle('A');
  const b = m.nouvelle('B');
  assert.equal((await m.patch(b.cle, { parent: a.cle })).statusCode, 200);
  assert.equal(m.ligne(b.id).parent_id, a.id);
  const avant = m.ligne(a.id);
  const cyc = await m.patch(a.cle, { parent: b.cle });
  assert.equal(cyc.statusCode, 400, cyc.body);
  assert.equal(cyc.json().champ, 'parent');
  assert.deepEqual(m.ligne(a.id), avant);
  const soi = await m.patch(a.cle, { parent: a.cle });
  assert.equal(soi.json().champ, 'parent');
  const inc = await m.patch(b.cle, { parent: 'nexistepas' });
  assert.equal(inc.statusCode, 400, inc.body);
  assert.equal(inc.json().champ, 'parent');
  assert.equal(m.ligne(b.id).parent_id, a.id);
  const haut = await m.patch(b.cle, { parent: null });
  assert.equal(haut.statusCode, 200, haut.body);
  assert.equal(m.ligne(b.id).parent_id, null);
  // Même parent : inchangée.
  assert.equal((await m.patch(b.cle, { parent: null })).json().etat, 'inchangee');
});

test('refus au milieu d\'un corps : un titre valide avec un parent cyclique n\'écrit rien (transaction)', async () => {
  const m = await monter();
  const a = m.nouvelle('A');
  const b = m.nouvelle('B');
  await m.patch(b.cle, { parent: a.cle });
  const r = await m.patch(a.cle, { titre: 'Renommée', parent: b.cle });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(m.ligne(a.id).titre, 'A');
});

test('alias et étiquettes remplacent la liste ; [] vide ; non envoyés, ils restent', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  poserEtiquetage(m.app.db, { compteId: m.antor }, m.u.id, f.id, { alias: ['a1', 'a2'], etiquettes: ['t1'] });
  const r = await m.patch(f.cle, { alias: ['b1'] });
  assert.equal(r.statusCode, 200, r.body);
  let l = await m.lire(f.cle);
  assert.deepEqual(l.entete.alias, ['b1']);
  assert.deepEqual(l.entete.etiquettes, ['t1']);
  assert.equal((await m.patch(f.cle, { etiquettes: [] })).statusCode, 200);
  l = await m.lire(f.cle);
  assert.deepEqual(l.entete.etiquettes, []);
  assert.deepEqual(l.entete.alias, ['b1']);
  assert.equal((await m.patch(f.cle, { alias: ['b1'] })).json().etat, 'inchangee');
});

test('type, sous-type, statut d\'aventure, disparu, creeLe', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn', 'personnage');
  assert.equal((await m.patch(f.cle, { pj: true })).statusCode, 200);
  assert.equal(m.app.db.prepare('SELECT charge FROM fiches WHERE id = ?').pluck().get(f.id) as string && JSON.parse(m.app.db.prepare('SELECT charge FROM fiches WHERE id = ?').pluck().get(f.id) as string).pj, true);
  assert.equal((await m.patch(f.cle, { disparu: true })).statusCode, 200);
  assert.equal(JSON.parse(m.app.db.prepare('SELECT charge FROM fiches WHERE id = ?').pluck().get(f.id) as string).disparu, true);
  assert.equal((await m.patch(f.cle, { sousType: 'pnj' })).statusCode, 200);
  assert.equal(m.ligne(f.id).sous_type, 'pnj');
  assert.equal((await m.patch(f.cle, { sousType: null })).statusCode, 200);
  assert.equal(m.ligne(f.id).sous_type, null);
  const r = await m.patch(f.cle, { creeLe: '2020-01-02T03:04:05.000Z' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.app.db.prepare('SELECT cree_le FROM fiches WHERE id = ?').pluck().get(f.id), '2020-01-02T03:04:05.000Z');
  assert.equal((await m.patch(f.cle, { creeLe: '2999-01-01T00:00:00Z' })).json().champ, 'creeLe');
  assert.equal((await m.patch(f.cle, { creeLe: 'hier' })).json().champ, 'creeLe');
  const av = m.nouvelle('Quête', 'aventure');
  const st = await m.patch(av.cle, { statut: 'terminee' });
  assert.equal(st.statusCode, 200, st.body);
  assert.equal(JSON.parse(m.app.db.prepare('SELECT charge FROM fiches WHERE id = ?').pluck().get(av.id) as string).statut, 'terminee');
  assert.equal((await m.patch(av.cle, { statut: 'terminee' })).json().etat, 'inchangee');
});

test('illustration : clé inconnue → 400 champ illustration ; null sans illustration → inchangee', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const r = await m.patch(f.cle, { illustration: 'fichier-fantome' });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'illustration');
  assert.equal((await m.patch(f.cle, { illustration: null })).json().etat, 'inchangee');
});

test('ancienne clé : la même fiche est atteinte, sans doublon ; id numérique refusé', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  changerCleFiche(m.app.db, { compteId: m.antor }, m.u.id, f.id, 'zorn-neuf');
  const n = m.nb('fiches');
  const r = await m.patch(f.cle, { titre: 'Par ancienne clé' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().id, f.id);
  assert.equal(m.ligne(f.id).titre, 'Par ancienne clé');
  assert.equal(m.nb('fiches'), n);
  assert.equal((await m.patch('zorn-neuf', { titre: 'Par la courante' })).json().id, f.id);
  assert.equal((await m.patch(String(f.id), { titre: 'Par id' })).statusCode, 404);
  assert.equal((await m.patch('inconnue-xyz', { titre: 'x' })).statusCode, 404);
});

test('jeton lecture : 403 lecture_seule avant tout service, rien d\'écrit, lot non compté', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const l = await m.lot();
  const r = await m.app.inject({ method: 'PATCH', url: `${m.base}/fiches/${f.cle}?lot=${l}`, headers: m.lecture, payload: { titre: 'X' } });
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().code, 'lecture_seule');
  assert.equal(m.ligne(f.id).titre, 'Zorn');
  const c = (await m.lotLu(l)).compteurs.fiches;
  assert.equal(c.refusees + c.mises_a_jour, 0);
});

test('sans jeton : 401 ; alias /api/import/v1 : même effet ; If-Match mal formé : 400 if_match', async () => {
  const m = await monter();
  const f = m.nouvelle('Zorn');
  const sans = await m.app.inject({ method: 'PATCH', url: `${m.base}/fiches/${f.cle}`, payload: { titre: 'X' } });
  assert.equal(sans.statusCode, 401);
  const r = await m.patch(f.cle, { titre: 'Via alias' }, {}, '', `/api/import/v1/univers/${m.u.id}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.ligne(f.id).titre, 'Via alias');
  const mal = await m.patch(f.cle, { titre: 'Autre' }, { 'if-match': 'pas-une-empreinte' });
  assert.equal(mal.statusCode, 400);
  assert.equal(mal.json().champ, 'if_match');
  assert.equal(m.ligne(f.id).titre, 'Via alias');
});

test('une fiche d\'un autre univers n\'est pas atteinte (404)', async () => {
  const m = await monter();
  const autre = m.app.db.prepare("SELECT id FROM univers WHERE id <> ? LIMIT 1").get(m.u.id) as { id: number } | undefined;
  if (!autre) return;
  const cle = m.app.db.prepare('SELECT cle FROM fiches WHERE univers_id = ? LIMIT 1').get(autre.id) as { cle: string } | undefined;
  if (!cle) return;
  const r = await m.patch(cle.cle, { titre: 'Intrus' });
  assert.equal(r.statusCode, 404);
});
