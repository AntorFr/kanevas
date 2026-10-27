// Need-based tests of kanevas-fiche-mj-seul-api (B-57, rule 11 of docs/donnees.md), written from the task's
// exit criterion only. HTTP in stub mode, real SQLite. Expected values are literals.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { ajouterSection, changerAudience } = await import('../services/sections.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  const idU = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as { id: number }).id;
  const idC = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const cookies = new Map<string, string>();
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST', url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, payload });
    let json: Any;
    try { json = JSON.parse(r.body); } catch { json = r.body; }
    return { status: r.statusCode, json };
  };
  const u = idU("Lame d'Ébène");
  const base = `/api/univers/${u}/fiches`;
  const antor = idC('antor');
  const lea = idC('lea');
  // A sheet of the given sections, each [joueursLisent]; `auteurLea` also gives Léa author-read on the first.
  const fiche = async (titre: string, sections: boolean[], opts: { auteurLea?: boolean; type?: string; sousType?: string } = {}) => {
    const f = (await req('antor', 'POST', base, { type: opts.type ?? 'lieu', titre, ...(opts.sousType ? { sousType: opts.sousType } : {}) })).json;
    let i = 0;
    for (const lisent of sections) {
      const s = ajouterSection(app.db, antor, u, f.id, { titre: `S${i++}`, contenu: 'x' });
      changerAudience(app.db, antor, u, f.id, s.id, {
        joueursLisent: lisent,
        ...(opts.auteurLea && i === 1 ? { auteurId: lea, auteurLit: true } : {}),
      });
    }
    return f.id as number;
  };
  return { app, req, base, u, fiche };
}
const titres = (j: Any): string[] => (j.fiches as Any[]).map((x) => x.titre);
const vis = (j: Any): Record<string, unknown> => Object.fromEntries((j.fiches as Any[]).map((x) => [x.titre, x.visibleJoueurs]));

test('B-57 : le MJ lit visibleJoueurs vrai/faux (mixte, fermée, vide, auteur seul) sur la grille', async () => {
  // Panne : EXISTS inversé, fiche vide vraie, ou droit auteur compté comme visible.
  const w = await monde();
  await w.fiche('Zmixte', [false, true]);
  await w.fiche('Zferme', [false, false]);
  await w.fiche('Zvide', []);
  await w.fiche('Zauteur', [false], { auteurLea: true });
  await w.fiche('Zouvert', [true]);
  const r = await w.req('antor', 'GET', `${w.base}?q=Z`);
  assert.equal(r.status, 200);
  assert.deepEqual(vis(r.json), { Zmixte: true, Zferme: false, Zvide: false, Zauteur: false, Zouvert: true });
});

test('B-57 : détail et enfants portent visibleJoueurs pour le MJ ; le changement d’audience se reflète', async () => {
  const w = await monde();
  const p = await w.fiche('Zparent', [true]);
  const e1 = await w.fiche('Zenfant1', [true]);
  const e2 = await w.fiche('Zenfant2', []);
  for (const e of [e1, e2]) assert.equal((await w.req('antor', 'PATCH', `${w.base}/${e}`, { parent: p })).status, 200);
  const d = await w.req('antor', 'GET', `${w.base}/${p}`);
  assert.equal(d.json.visibleJoueurs, true);
  const en = await w.req('antor', 'GET', `${w.base}/${p}/enfants`);
  assert.deepEqual(Object.fromEntries(en.json.enfants.map((x: Any) => [x.titre, x.visibleJoueurs])), { Zenfant1: true, Zenfant2: false });
  const sec = w.app.db.prepare('SELECT id FROM sections WHERE fiche_id = ?').get(e1) as { id: number };
  const antorId = (w.app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  changerAudience(w.app.db, antorId, w.u, e1, sec.id, { joueursLisent: false });
  assert.equal((await w.req('antor', 'GET', `${w.base}/${e1}`)).json.visibleJoueurs, false);
});

test('B-57 racines de l’arbre : parent=racine porte visibleJoueurs', async () => {
  const w = await monde();
  await w.fiche('Zracine', []);
  const r = await w.req('antor', 'GET', `${w.base}?parent=racine&type=lieu&q=Zracine`);
  assert.equal(r.status, 200);
  assert.deepEqual(vis(r.json), { Zracine: false });
});

test('B-57 exclusion : le champ est absent pour un joueur et pour le MJ en mode Joueur (liste, enfants, détail)', async () => {
  const w = await monde();
  const p = await w.fiche('Zparent', [true]);
  const e = await w.fiche('Zenfant', [true]);
  await w.req('antor', 'PATCH', `${w.base}/${e}`, { parent: p });
  for (const [compte, q] of [['lea', ''], ['antor', '?mode=joueur']] as const) {
    const l = await w.req(compte, 'GET', `${w.base}${q ? q + '&' : '?'}q=Zparent`);
    assert.equal(l.status, 200);
    assert.equal(l.json.fiches.length, 1);
    assert.equal('visibleJoueurs' in l.json.fiches[0], false);
    assert.equal(JSON.stringify(l.json).includes('visibleJoueurs'), false);
    const en = await w.req(compte, 'GET', `${w.base}/${p}/enfants${q}`);
    assert.equal(en.json.enfants.length, 1);
    assert.equal(JSON.stringify(en.json).includes('visibleJoueurs'), false);
    const d = await w.req(compte, 'GET', `${w.base}/${p}${q}`);
    assert.equal(d.status, 200);
    assert.equal(JSON.stringify(d.json).includes('visibleJoueurs'), false);
  }
});

test('B-57 : visibilite=mj / joueurs filtre, se combine avec type, sousType, q', async () => {
  const w = await monde();
  await w.fiche('Zlieu-ouvert', [true], { sousType: 'Ville' });
  await w.fiche('Zlieu-ferme', [false], { sousType: 'Ville' });
  await w.fiche('Zlieu-vide', [], { sousType: 'Fort' });
  await w.fiche('Zsavoir-ferme', [false], { type: 'savoir' });
  const get = async (q: string) => titres((await w.req('antor', 'GET', `${w.base}?q=Z&${q}`)).json).sort();
  assert.deepEqual(await get('visibilite=mj'), ['Zlieu-ferme', 'Zlieu-vide', 'Zsavoir-ferme']);
  assert.deepEqual(await get('visibilite=joueurs'), ['Zlieu-ouvert']);
  assert.deepEqual(await get('visibilite=mj&type=lieu'), ['Zlieu-ferme', 'Zlieu-vide']);
  assert.deepEqual(await get('visibilite=mj&type=lieu&sousType=Ville'), ['Zlieu-ferme']);
  assert.deepEqual(await get('visibilite=joueurs&type=savoir'), []);
  const r = await w.req('antor', 'GET', `${w.base}?visibilite=mj&q=Zlieu-vide`);
  assert.deepEqual(titres(r.json), ['Zlieu-vide']);
});

test('B-57 : visibilite se combine avec etiquette', async () => {
  const w = await monde();
  const a = await w.fiche('Zetiq-ouvert', [true]);
  const b = await w.fiche('Zetiq-ferme', [false]);
  const c = await w.fiche('Zsans-etiq', [false]);
  void c;
  for (const id of [a, b]) {
    const r = await w.req('antor', 'PUT', `${w.base}/${id}/etiquetage`, { alias: [], etiquettes: ['Zeta'] });
    if (r.status >= 300) assert.fail(`pose d'étiquette: ${r.status} ${JSON.stringify(r.json)}`);
  }
  const r = await w.req('antor', 'GET', `${w.base}?etiquette=Zeta&visibilite=mj`);
  assert.equal(r.status, 200);
  assert.deepEqual(titres(r.json), ['Zetiq-ferme']);
});

test('B-57 : le filtre tient à travers les pages (curseur, 100+1 fiches fermées + 1 ouverte)', async () => {
  const w = await monde();
  for (let i = 0; i < 101; i++) {
    w.app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', ?, '{}', '2026-01-01', '2026-01-01')").run(w.u, `Zp${String(i).padStart(3, "0")}`);
  }
  await w.fiche('Zp-ouvert', [true]);
  const p1 = (await w.req('antor', 'GET', `${w.base}?visibilite=mj&q=Zp`)).json;
  assert.equal(p1.fiches.length, 100);
  assert.ok(p1.suivant, 'une page suivante');
  assert.ok(p1.fiches.every((f: Any) => f.visibleJoueurs === false));
  const p2 = (await w.req('antor', 'GET', `${w.base}?visibilite=mj&q=Zp&curseur=${encodeURIComponent(p1.suivant)}`)).json;
  assert.equal(p2.fiches.length, 1);
  assert.equal(p2.suivant ?? null, null);
  const o = (await w.req('antor', 'GET', `${w.base}?visibilite=joueurs&q=Zp`)).json;
  assert.deepEqual(titres(o), ['Zp-ouvert']);
});

test('B-57 échec : valeur inconnue, vide, dupliquée → 400 « Requête invalide. »', async () => {
  const w = await monde();
  for (const q of ['visibilite=tous', 'visibilite=', 'visibilite=MJ', 'visibilite=mj&visibilite=joueurs']) {
    const r = await w.req('antor', 'GET', `${w.base}?${q}`);
    assert.equal(r.status, 400, q);
    assert.equal(r.json.message ?? r.json.erreur ?? r.json.error, 'Requête invalide.', q);
  }
});

test('B-57 exclusion : un joueur ou le MJ en mode Joueur qui pose visibilite reçoit 400, même valeur valide', async () => {
  const w = await monde();
  await w.fiche('Zsecret', [false]);
  for (const [compte, pre] of [['lea', ''], ['antor', 'mode=joueur&']] as const) {
    for (const v of ['mj', 'joueurs', 'bidon']) {
      for (const extra of ['', '&q=Zsecret', '&q=%20']) {
        const r = await w.req(compte, 'GET', `${w.base}?${pre}visibilite=${v}${extra}`);
        assert.equal(r.status, 400, `${compte} ${v}${extra}`);
        assert.equal(r.json.message ?? r.json.erreur ?? r.json.error, 'Requête invalide.');
        assert.equal(JSON.stringify(r.json).includes('Zsecret'), false);
      }
    }
  }
});
