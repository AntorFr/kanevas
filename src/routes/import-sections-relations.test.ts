// PUT/DELETE /fiches/:cle/sections/:scle and PATCH/DELETE /relations/:rid
// (kanevas-synchro-ecriture-sections-relations, B-83, B-84, B-86, AD-ecriture-1, AD-64, AD-114, AD-116, AD-127),
// written from the exit criterion: one section or one relation is written, nothing else moves.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'import-sec-rel-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const lea = {
    authorization: `Bearer ${creerJeton(app.db, trouverCompte(app.db, 'lea')!.id, { nom: 'L', dureeJours: 30, acces: { tous: true, niveauTous: 'ecriture' } } as never, app.horloge()).valeur}`,
  };
  const base = `/api/v1/univers/${u.id}`;
  const inj = (method: string, url: string, payload?: unknown, h: Record<string, string> = auth) =>
    app.inject({ method: method as 'GET', url: `${base}${url}`, headers: h, payload: payload as object });
  const enc = encodeURIComponent;
  const putF = (cle: string, p: unknown) => inj('PUT', `/fiches/${enc(cle)}`, p);
  const putS = (f: string, s: string, p: unknown, h: Record<string, string> = {}, q = '', as = auth) =>
    inj('PUT', `/fiches/${enc(f)}/sections/${enc(s)}${q}`, p, { ...as, ...h });
  const delS = (f: string, s: string, h: Record<string, string> = {}, q = '', as = auth) =>
    inj('DELETE', `/fiches/${enc(f)}/sections/${enc(s)}${q}`, undefined, { ...as, ...h });
  const rel = (f: string, p: unknown) => inj('POST', `/fiches/${enc(f)}/relations`, p);
  const patchR = (id: number | string, p: unknown, h: Record<string, string> = {}, q = '') =>
    inj('PATCH', `/relations/${id}${q}`, p, { ...auth, ...h });
  const delR = (id: number | string, h: Record<string, string> = {}) => inj('DELETE', `/relations/${id}`, undefined, { ...auth, ...h });
  const lire = async (f: string, as = auth) => (await inj('GET', `/fiches/${enc(f)}`, undefined, as)).json();
  const lot = async () => (await inj('POST', '/lots')).json().lotId as number;
  const lotLu = async (l: number) => (await inj('GET', `/lots/${l}`)).json();
  const un = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
  const nb = (t: string) => un(`SELECT COUNT(*) n FROM ${t}`).n;
  await putF('lieu:port', {
    type: 'lieu', titre: 'Port',
    sections: [
      { cle: 'a', titre: 'A', contenu: 'texte a', joueursLisent: true },
      { cle: 'b', titre: 'B', contenu: 'texte b', joueursLisent: true },
      { cle: 'c', titre: 'C', contenu: 'texte c', joueursLisent: true },
    ],
  });
  await putF('lieu:autre', { type: 'lieu', titre: 'Autre', sections: [{ cle: 'a', titre: 'A autre', contenu: 'autre a', joueursLisent: true }] });
  await putF('perso:aldric', { type: 'personnage', titre: 'Aldric', sections: [{ cle: 'bio', titre: 'Bio', contenu: 'x', joueursLisent: true, joueursEcrivent: true }] });
  return { app, u, auth, lea, inj, putS, delS, rel, patchR, delR, lire, lot, lotLu, un, nb, putF };
}

const sec = (j: any, cle: string) => j.sections.find((s: any) => s.cle === cle);
const ligne = (m: any, fiche: string, cle: string) =>
  m.un('SELECT s.id, s.titre, s.contenu, s.version, f.modifie_le FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.cle = ? AND s.cle = ?', fiche, cle);

test('PUT d\'une section sur trois : une seule change, les deux autres et leurs relations restent', async () => {
  const m = await monter();
  await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:port', nature: 'se_situe' }]);
  assert.equal((await m.rel('lieu:port', [{ section: 'a', cible: 'lieu:autre', qualificatif: 'voisin' }])).statusCode, 200);
  await m.rel('lieu:port', [{ section: 'c', cible: 'lieu:autre', qualificatif: 'face' }]);
  const b = ligne(m, 'lieu:port', 'b');
  const c = ligne(m, 'lieu:port', 'c');
  const relAvant = m.nb('relations');
  const r = await m.putS('lieu:port', 'a', { contenu: 'neuf a' });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.etat, 'mise_a_jour');
  assert.equal(j.cle, 'a');
  assert.match(j.empreinte, /^[0-9a-f]{32}$/);
  assert.match(j.empreinteFiche, /^[0-9a-f]{32}$/);
  assert.equal(ligne(m, 'lieu:port', 'a').contenu, 'neuf a');
  assert.equal(ligne(m, 'lieu:port', 'a').titre, 'A');
  // `modifie_le` is the sheet's: it moves with the one section written.
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'b'), modifie_le: 0 }, { ...b, modifie_le: 0 });
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'c'), modifie_le: 0 }, { ...c, modifie_le: 0 });
  assert.equal(m.nb('relations'), relAvant);
  const lue = await m.lire('lieu:port');
  assert.equal(sec(lue, 'a').empreinte, j.empreinte);
  assert.equal(lue.empreinte, j.empreinteFiche);
  assert.equal(lue.relations.length, 2);
});

test('PUT rejoué à l\'identique : inchangee, ni version ni modifie_le ; compté « 1 inchangée »', async () => {
  const m = await monter();
  await m.putS('lieu:port', 'a', { titre: 'Alpha', contenu: 'neuf', joueursLisent: false });
  const avant = ligne(m, 'lieu:port', 'a');
  const histo = m.nb('historique');
  const l = await m.lot();
  const r = await m.putS('lieu:port', 'a', { titre: 'Alpha', contenu: 'neuf', joueursLisent: false }, {}, `?lot=${l}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'a') }, { ...avant });
  assert.equal(m.nb('historique'), histo);
  assert.equal((await m.lotLu(l)).compteurs.fiches.inchangees, 1);
});

test('If-Match : l\'ancienne empreinte de la section donne 412, rien n\'est écrit, le lot compte « 1 refusée »', async () => {
  const m = await monter();
  const vieille = sec(await m.lire('lieu:port'), 'a').empreinte as string;
  assert.equal((await m.putS('lieu:port', 'a', { contenu: 'v2' }, { 'if-match': `"${vieille}"` })).statusCode, 200);
  const avant = ligne(m, 'lieu:port', 'a');
  const histo = m.nb('historique');
  const l = await m.lot();
  const r = await m.putS('lieu:port', 'a', { contenu: 'v3' }, { 'if-match': `"${vieille}"` }, `?lot=${l}`);
  assert.equal(r.statusCode, 412, r.body);
  assert.equal(r.json().code, 'empreinte_perimee');
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'a') }, { ...avant });
  assert.equal(m.nb('historique'), histo);
  assert.equal((await m.lotLu(l)).compteurs.fiches.refusees, 1);
  // La bonne empreinte passe.
  const bonne = sec(await m.lire('lieu:port'), 'a').empreinte as string;
  assert.equal((await m.putS('lieu:port', 'a', { contenu: 'v3' }, { 'if-match': `"${bonne}"` })).statusCode, 200);
  // DELETE avec l'ancienne : 412 aussi, section présente.
  const d = await m.delS('lieu:port', 'a', { 'if-match': `"${vieille}"` });
  assert.equal(d.statusCode, 412, d.body);
  assert.ok(ligne(m, 'lieu:port', 'a'));
});

test('DELETE d\'une section : relations et jointures retirées, fichier gardé dans la médiathèque, autres sections intactes', async () => {
  const m = await monter();
  const B = 'XB';
  const corps = Buffer.concat([
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="nom"\r\n\r\nquais.png\r\n--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="x"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    PNG, Buffer.from(`\r\n--${B}--\r\n`),
  ]);
  const f = await m.inj('PUT', '/fichiers/img%3Aquais', corps, { ...m.auth, 'content-type': `multipart/form-data; boundary=${B}` });
  assert.equal(f.statusCode, 200, f.body);
  assert.equal((await m.putS('lieu:port', 'b', { fichiers: ['img:quais'] })).statusCode, 200);
  await m.rel('lieu:port', [{ section: 'b', cible: 'lieu:autre', qualificatif: 'voisin' }]);
  await m.rel('lieu:port', [{ section: 'a', cible: 'lieu:autre', qualificatif: 'garde' }]);
  const idB = ligne(m, 'lieu:port', 'b').id;
  assert.equal(m.un('SELECT COUNT(*) n FROM fichiers_sections WHERE section_id = ?', idB).n, 1);
  assert.equal(m.un('SELECT COUNT(*) n FROM relations WHERE section_id = ?', idB).n, 1);
  const r = await m.delS('lieu:port', 'b');
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(ligne(m, 'lieu:port', 'b'), undefined);
  assert.equal(m.un('SELECT COUNT(*) n FROM fichiers_sections WHERE section_id = ?', idB).n, 0);
  assert.equal(m.un('SELECT COUNT(*) n FROM relations WHERE section_id = ?', idB).n, 0);
  assert.equal(m.un("SELECT COUNT(*) n FROM fichiers WHERE cle_origine = 'img:quais'").n, 1);
  assert.ok(ligne(m, 'lieu:port', 'a') && ligne(m, 'lieu:port', 'c'));
  assert.equal(m.un('SELECT COUNT(*) n FROM relations r JOIN sections s ON s.id = r.section_id WHERE s.cle = ?', 'a').n, 1);
  // Rejoué : 204, rien de plus.
  assert.equal((await m.delS('lieu:port', 'b')).statusCode, 204);
});

test('la clé d\'une section d\'une autre fiche n\'atteint pas cette fiche', async () => {
  const m = await monter();
  const autreAvant = ligne(m, 'lieu:autre', 'a');
  // « c » n'existe que sur lieu:port : DELETE sur lieu:autre = 204, lieu:port intacte.
  const d = await m.delS('lieu:autre', 'c');
  assert.equal(d.statusCode, 204, d.body);
  assert.ok(ligne(m, 'lieu:port', 'c'));
  // « a » existe sur les deux : PUT sur lieu:autre n'écrit que lieu:autre.
  const portA = ligne(m, 'lieu:port', 'a');
  assert.equal((await m.putS('lieu:autre', 'a', { contenu: 'modifié autre' })).statusCode, 200);
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'a') }, { ...portA });
  // PUT d'une clé inconnue de lieu:autre mais connue de lieu:port : crée sur lieu:autre.
  const r = await m.putS('lieu:autre', 'c', { titre: 'C autre', contenu: 'nouvelle' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  assert.equal(ligne(m, 'lieu:port', 'c').contenu, 'texte c');
  assert.equal(ligne(m, 'lieu:autre', 'c').contenu, 'nouvelle');
  // DELETE d'une clé présente sur les deux ne retire que sur la fiche adressée.
  assert.equal((await m.delS('lieu:autre', 'a')).statusCode, 204);
  assert.equal(ligne(m, 'lieu:autre', 'a'), undefined);
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'a') }, { ...portA });
  assert.ok(autreAvant);
});

test('PUT : fiche inconnue 404 (aucune fiche créée) ; création sans titre 400 ; champ inconnu 400', async () => {
  const m = await monter();
  const fiches = m.nb('fiches');
  assert.equal((await m.putS('lieu:fantome', 'a', { titre: 'X' })).statusCode, 404);
  assert.equal((await m.delS('lieu:fantome', 'a')).statusCode, 404);
  assert.equal(m.nb('fiches'), fiches);
  const s = await m.putS('lieu:port', 'neuve', { contenu: 'sans titre' });
  assert.equal(s.statusCode, 400, s.body);
  assert.equal(s.json().champ, 'titre');
  const i = await m.putS('lieu:port', 'a', { couleur: 'bleu' });
  assert.equal(i.statusCode, 400);
  assert.equal(i.json().champ, 'couleur');
});

test('PUT : une section créée porte titre, audience et position', async () => {
  const m = await monter();
  const r = await m.putS('lieu:port', 'neuve', { titre: 'Neuve', contenu: 'x', joueursLisent: true, joueursEcrivent: true, position: 1 });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'creee');
  const lue = await m.lire('lieu:port');
  assert.deepEqual(lue.sections.map((s: any) => s.cle), ['neuve', 'a', 'b', 'c']);
  assert.equal(m.un('SELECT joueurs_lisent l, joueurs_ecrivent e FROM sections WHERE cle = ? AND fiche_id = (SELECT id FROM fiches WHERE cle = ?)', 'neuve', 'lieu:port').e, 1);
  // Position hors bornes : 400 ; au-delà du dernier : en fin.
  assert.equal((await m.putS('lieu:port', 'a', { position: 0 })).statusCode, 400);
  assert.equal((await m.putS('lieu:port', 'neuve', { position: 99 })).statusCode, 200);
  assert.deepEqual((await m.lire('lieu:port')).sections.map((s: any) => s.cle), ['a', 'b', 'c', 'neuve']);
});

test('section gérée par un outil : PUT et DELETE refusés 403 section_geree, rien d\'écrit', async () => {
  const m = await monter();
  m.app.db.prepare("UPDATE sections SET gere_par = 'essai/a/carte' WHERE cle = 'b' AND fiche_id = (SELECT id FROM fiches WHERE cle = 'lieu:port')").run();
  const avant = ligne(m, 'lieu:port', 'b');
  const histo = m.nb('historique');
  const l = await m.lot();
  const p = await m.putS('lieu:port', 'b', { contenu: 'écrasé' }, {}, `?lot=${l}`);
  assert.equal(p.statusCode, 403, p.body);
  assert.equal(p.json().code, 'section_geree');
  const d = await m.delS('lieu:port', 'b', {}, `?lot=${l}`);
  assert.equal(d.statusCode, 403, d.body);
  assert.equal(d.json().code, 'section_geree');
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'b') }, { ...avant });
  assert.equal(m.nb('historique'), histo);
  assert.equal((await m.lotLu(l)).compteurs.fiches.refusees, 2);
});

test('contenu de 100 001 caractères : 400 champ contenu, avant toute écriture ; 100 000 passe', async () => {
  const m = await monter();
  const avant = ligne(m, 'lieu:port', 'a');
  const r = await m.putS('lieu:port', 'a', { contenu: 'x'.repeat(100_001) });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().champ, 'contenu');
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'a') }, { ...avant });
  const ok = await m.putS('lieu:port', 'a', { contenu: 'x'.repeat(100_000) });
  assert.equal(ok.statusCode, 200, ok.body);
});

test('joueur (jeton écriture) : un bloc :::mj est refusé, le texte d\'une section qu\'il écrit passe, le reste non', async () => {
  const m = await monter();
  const avant = ligne(m, 'perso:aldric', 'bio');
  const mj = await m.putS('perso:aldric', 'bio', { contenu: 'public\n\n:::mj\nsecret\n:::\n' }, {}, '', m.lea);
  assert.equal(mj.statusCode, 400, mj.body);
  assert.equal(mj.json().champ, 'contenu');
  assert.deepEqual({ ...ligne(m, 'perso:aldric', 'bio') }, { ...avant });
  const ok = await m.putS('perso:aldric', 'bio', { contenu: 'écrit par Léa' }, {}, '', m.lea);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ligne(m, 'perso:aldric', 'bio').contenu, 'écrit par Léa');
  // Ni changer le titre, ni l'audience, ni créer ou retirer une section.
  assert.equal((await m.putS('perso:aldric', 'bio', { titre: 'Autre' }, {}, '', m.lea)).statusCode, 403);
  assert.equal((await m.putS('perso:aldric', 'bio', { joueursLisent: false }, {}, '', m.lea)).statusCode, 403);
  assert.equal((await m.putS('perso:aldric', 'neuve', { titre: 'N' }, {}, '', m.lea)).statusCode, 403);
  assert.equal((await m.delS('perso:aldric', 'bio', {}, '', m.lea)).statusCode, 403);
  assert.ok(ligne(m, 'perso:aldric', 'bio'));
  assert.equal(ligne(m, 'perso:aldric', 'neuve'), undefined);
  // Une section qu'elle ne lit pas : introuvable ou refus, rien d'écrit.
  m.app.db.prepare("UPDATE sections SET joueurs_lisent = 0, joueurs_ecrivent = 0 WHERE cle = 'bio'").run();
  const b = ligne(m, 'perso:aldric', 'bio');
  const x = await m.putS('perso:aldric', 'bio', { contenu: 'intrusion' }, {}, '', m.lea);
  assert.ok([403, 404].includes(x.statusCode), x.body);
  assert.deepEqual({ ...ligne(m, 'perso:aldric', 'bio') }, { ...b });
});

test('jeton lecture : PUT et DELETE de section, PATCH et DELETE de relation sont 403 lecture_seule', async () => {
  const m = await monter();
  const compte = trouverCompte(m.app.db, 'antor')!.id;
  const h = { authorization: `Bearer ${creerJeton(m.app.db, compte, { nom: 'R', dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' } } as never, m.app.horloge()).valeur}` };
  const avant = ligne(m, 'lieu:port', 'a');
  for (const [mth, url, p] of [
    ['PUT', '/fiches/lieu%3Aport/sections/a', { contenu: 'z' }],
    ['DELETE', '/fiches/lieu%3Aport/sections/a', undefined],
    ['PATCH', '/relations/1', { nature: 'se_situe' }],
    ['DELETE', '/relations/1', undefined],
  ] as const) {
    const r = await m.inj(mth, url, p, h);
    assert.equal(r.statusCode, 403, `${mth} ${url} ${r.body}`);
    assert.equal(r.json().code, 'lecture_seule');
  }
  assert.deepEqual({ ...ligne(m, 'lieu:port', 'a') }, { ...avant });
});

// ---- relations ----

test('POST relations deux fois : creee puis inchangee, avec id et empreinte identiques', async () => {
  const m = await monter();
  const e = [{ section: 'bio', cible: 'lieu:port', nature: 'se_situe', qualificatif: 'habite' }];
  const avantRel = m.nb('relations');
  const a = (await m.rel('perso:aldric', e)).json()[0];
  const b = (await m.rel('perso:aldric', e)).json()[0];
  assert.equal(a.etat, 'creee');
  assert.equal(b.etat, 'inchangee');
  assert.ok(Number.isInteger(a.id));
  assert.equal(b.id, a.id);
  assert.match(a.empreinte, /^[0-9a-f]{32}$/);
  assert.equal(b.empreinte, a.empreinte);
  assert.equal(m.nb('relations'), avantRel + 1);
  const lue = (await m.lire('perso:aldric')).relations;
  assert.equal(lue[0].id, a.id);
  assert.equal(lue[0].empreinte, a.empreinte);
});

test('PATCH relation : la nature change, puis le qualificatif ; rejoué inchangee ; les autres champs restent', async () => {
  const m = await monter();
  const r0 = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:port', nature: 'se_situe', qualificatif: 'habite' }])).json()[0];
  const histo0 = m.nb('historique');
  const l = await m.lot();
  const q = await m.patchR(r0.id, { qualificatif: 'visite' }, { 'if-match': `"${r0.empreinte}"` }, `?lot=${l}`);
  assert.equal(q.statusCode, 200, q.body);
  const j = q.json();
  assert.equal(j.etat, 'mise_a_jour');
  assert.equal(j.id, r0.id);
  assert.equal(j.nature, 'se_situe');
  assert.equal(j.qualificatif, 'visite');
  assert.notEqual(j.empreinte, r0.empreinte);
  assert.equal((await m.lire('perso:aldric')).relations[0].empreinte, j.empreinte);
  assert.equal((await m.lire('perso:aldric')).empreinte, j.empreinteFiche);
  assert.ok(m.nb('historique') > histo0);
  assert.equal((await m.lotLu(l)).compteurs.relations.mises_a_jour, 1);
  // même valeur : inchangee, rien de plus dans l'historique
  const histo1 = m.nb('historique');
  const i = await m.patchR(r0.id, { qualificatif: 'visite' });
  assert.equal(i.json().etat, 'inchangee');
  assert.equal(m.nb('historique'), histo1);
  // nature : une nature libre (vide) avec qualificatif
  const n = await m.patchR(r0.id, { nature: null });
  assert.equal(n.statusCode, 200, n.body);
  assert.equal(n.json().nature, '');
  assert.equal(n.json().qualificatif, 'visite');
  assert.equal(m.un('SELECT nature FROM relations WHERE id = ?', r0.id).nature, '');
  const n2 = await m.patchR(r0.id, { nature: 'se_situe' });
  assert.equal(n2.statusCode, 200, n2.body);
  assert.equal(m.un('SELECT nature FROM relations WHERE id = ?', r0.id).nature, 'se_situe');
});

test('PATCH relation : 412 sur l\'ancienne empreinte (rien d\'écrit), nature incompatible 400, id inconnu 404, corps vide 400', async () => {
  const m = await monter();
  const r0 = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:port', nature: 'se_situe', qualificatif: 'habite' }])).json()[0];
  await m.patchR(r0.id, { qualificatif: 'visite' });
  const avant = m.un('SELECT nature, qualificatif FROM relations WHERE id = ?', r0.id);
  const p = await m.patchR(r0.id, { qualificatif: 'autre' }, { 'if-match': `"${r0.empreinte}"` });
  assert.equal(p.statusCode, 412, p.body);
  assert.equal(p.json().code, 'empreinte_perimee');
  assert.deepEqual({ ...m.un('SELECT nature, qualificatif FROM relations WHERE id = ?', r0.id) }, { ...avant });
  const inc = await m.patchR(r0.id, { nature: 'est_parent_de' });
  assert.equal(inc.statusCode, 400, inc.body);
  assert.equal(inc.json().code, 'nature_incompatible');
  assert.deepEqual({ ...m.un('SELECT nature, qualificatif FROM relations WHERE id = ?', r0.id) }, { ...avant });
  assert.equal((await m.patchR(999999, { nature: 'se_situe' })).statusCode, 404);
  assert.equal((await m.patchR('abc', { nature: 'se_situe' })).statusCode, 404);
  assert.equal((await m.patchR(r0.id, {})).statusCode, 400);
  assert.equal((await m.patchR(r0.id, { couleur: 1 })).statusCode, 400);
});

test('PATCH vers une relation qui existe déjà : 409 relation_existante, rien d\'écrit', async () => {
  const m = await monter();
  const a = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:port', qualificatif: 'habite' }])).json()[0];
  const b = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:port', qualificatif: 'visite' }])).json()[0];
  const r = await m.patchR(b.id, { qualificatif: 'habite' });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().code, 'relation_existante');
  assert.equal(m.un('SELECT qualificatif q FROM relations WHERE id = ?', b.id).q, 'visite');
  assert.ok(a.id);
});

test('DELETE relation : retirée, un second DELETE répond 204, les autres restent ; 412 avec l\'ancienne empreinte', async () => {
  const m = await monter();
  const base0 = m.nb('relations');
  const a = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:port', qualificatif: 'habite' }])).json()[0];
  const b = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:autre', qualificatif: 'visite' }])).json()[0];
  const p = await m.delR(a.id, { 'if-match': '"' + '0'.repeat(32) + '"' });
  assert.equal(p.statusCode, 412, p.body);
  assert.equal(m.nb('relations'), base0 + 2);
  assert.equal((await m.delR(a.id, { 'if-match': `"${a.empreinte}"` })).statusCode, 204);
  assert.equal(m.nb('relations'), base0 + 1);
  assert.ok(m.un('SELECT id FROM relations WHERE id = ?', b.id));
  assert.equal(m.un('SELECT COUNT(*) n FROM relations WHERE id = ?', a.id).n, 0);
  assert.equal((await m.delR(a.id)).statusCode, 204);
  assert.equal(m.nb('relations'), base0 + 1);
});

test('cible illisible du compte : relation introuvable ; une section illisible aussi ; la relation n\'est pas touchée', async () => {
  const m = await monter();
  // Cible que seul le MJ lit : toutes ses sections ne sont pas lues par les joueurs.
  await m.putF('lieu:secret', { type: 'lieu', titre: 'Secret', sections: [{ cle: 's', titre: 'S', contenu: 'mj' }] });
  const r = (await m.rel('perso:aldric', [{ section: 'bio', cible: 'lieu:secret', qualificatif: 'cache' }])).json()[0];
  assert.equal(r.etat, 'creee');
  // POST d'une cible illisible par Léa : introuvable (refusée), rien d'écrit.
  const avant = m.nb('relations');
  const lea = await m.inj('POST', '/fiches/perso%3Aaldric/relations', [{ section: 'bio', cible: 'lieu:secret', qualificatif: 'trace' }], m.lea);
  const e = lea.json();
  assert.ok(lea.statusCode === 200 ? ['refusee', 'ignoree'].includes(e[0].etat) : [403, 404].includes(lea.statusCode), lea.body);
  assert.equal(m.nb('relations'), avant);
  // Rendre la cible illisible : un PATCH/DELETE par un compte qui ne la lit pas ne la modifie pas.
  const cible = m.un("SELECT id FROM fiches WHERE cle = 'lieu:secret'").id;
  const nature = m.un('SELECT nature, qualificatif FROM relations WHERE id = ?', r.id);
  for (const [mth, p] of [['PATCH', { qualificatif: 'x' }], ['DELETE', undefined]] as const) {
    const x = await m.inj(mth, `/relations/${r.id}`, p, m.lea);
    assert.ok([403, 404, 204].includes(x.statusCode), `${mth} ${x.statusCode} ${x.body}`);
  }
  assert.deepEqual({ ...m.un('SELECT nature, qualificatif FROM relations WHERE id = ?', r.id) }, { ...nature });
  assert.ok(cible);
});
