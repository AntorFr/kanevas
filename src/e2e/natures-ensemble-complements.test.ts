// Compléments d'ensemble de kanevas-fiches-liees-natures, écrits depuis le besoin (fiche de la feature, « Livre » et
// critère de sortie ; B-63, B-66, B-68, B-69) pour ce que les autres tests d'ensemble ne tiennent pas encore :
//  (1) le semis du bouchon relu en entier par l'API, relation par relation, tel que la fiche le liste ;
//  (2) la route des natures et l'écriture d'une relation hors de portée de qui ne les possède pas (exclusions) ;
//  (3) l'import : un lot mêlant une entrée bonne et une entrée refusée, une nature symétrique, le plafond de 80.
// Vrai serveur en mode bouchon avec son monde de départ. Attendus littéraux tirés du besoin.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const U = 1; // « Lame d'Ébène »
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
const ids: Record<string, number> = {};

/** Every relation of a sheet as « Section | nature | cible | qualificatif », read as Antor. */
async function toutes(page: Any, titre: string): Promise<string[]> {
  const f = await (await page.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids[titre]}`)).json();
  const lignes: string[] = [];
  for (const s of f.sections) {
    const r = await page.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids[titre]}/sections/${s.id}/relations`);
    if (r.status() !== 200) continue;
    for (const x of (await r.json()).relations) lignes.push(`${s.titre} | ${x.nature} | ${x.cible.titre} | ${x.qualificatif}`);
  }
  return lignes.sort();
}

describe('kanevas-fiches-liees-natures, compléments d’ensemble', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    for (const t of ['personnage', 'lieu', 'faction', 'famille', 'objet']) {
      const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=${t}`)).json();
      for (const f of r.fiches) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Panne visée : le semis perd, double ou déforme une des relations nommées par la fiche.
  test('semis : Aldric habite Port-Sel et est trésorier de la Guilde, sans autre relation à nature', opts, async () => {
    const lignes = await toutes(antor, 'Maître Aldric');
    assert.ok(lignes.some((l) => l.endsWith('| se_situe | Port-Sel | habite')), lignes.join('\n'));
    assert.ok(lignes.some((l) => l.endsWith('| membre | La Guilde des Brumes | trésorier')), lignes.join('\n'));
    assert.ok(lignes.some((l) => l.endsWith('| Port-Sel | maître de port')), lignes.join('\n'));
    assert.ok(lignes.some((l) => l.includes(' |  | Port-Sel | maître de port')), lignes.join('\n'));
    assert.equal(lignes.filter((l) => /\| (se_situe|membre) \|/.test(l)).length, 2);
  });

  test('semis : Ombeline membre de la Guilde (dirige) et de la famille Les Corvalis (veuve) ; Bran aîné des Corvalis ; Suie aux Docks', opts, async () => {
    const o = await toutes(antor, 'Dame Ombeline de Val-Fortin');
    assert.ok(o.some((l) => l.endsWith('| membre | La Guilde des Brumes | dirige')), o.join('\n'));
    assert.ok(o.some((l) => l.endsWith('| membre | Les Corvalis | veuve')), o.join('\n'));
    const b = await toutes(antor, 'Bran Corvalis');
    assert.ok(b.some((l) => l.endsWith('| membre | Les Corvalis | aîné')), b.join('\n'));
    const s = await toutes(antor, 'Suie');
    assert.ok(s.some((l) => l.endsWith('| se_situe | Les Docks | ')), s.join('\n'));
  });

  test('semis : le Prieur se situe à Port-Sel (se cache) dans « Secret — MJ seul » seulement', opts, async () => {
    const p = await toutes(antor, 'Le Prieur masqué');
    assert.deepEqual(p.filter((l) => l.includes('| se_situe |')), ['Secret — MJ seul | se_situe | Port-Sel | se cache']);
  });

  test('semis : la famille « Les Corvalis » est de type famille', opts, async () => {
    const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=famille`)).json();
    assert.deepEqual(r.fiches.map((f: Any) => f.titre), ['Les Corvalis']);
  });

  // Panne visée : une route des natures ouverte à qui n'est pas membre de l'univers.
  test('GET natures : un compte non membre de l’univers n’obtient pas la liste', opts, async () => {
    const cree = await antor.request.fetch(`${srv.base}/api/univers`, { method: 'POST', data: { nom: 'Univers sans Léa' } });
    assert.ok(cree.status() < 300, `création ${cree.status()}`);
    const { id } = await cree.json();
    assert.equal((await antor.request.fetch(`${srv.base}/api/univers/${id}/natures`)).status(), 200);
    const r = await lea.request.fetch(`${srv.base}/api/univers/${id}/natures`);
    assert.equal(r.status(), 404);
    assert.ok(!(await r.text()).includes('se_situe'));
  });

  test('GET natures : sans session, pas de liste', opts, async () => {
    const r = await fetch(`${srv.base}/api/univers/${U}/natures`, { redirect: 'manual' });
    assert.notEqual(r.status, 200);
    assert.ok(!(await r.text()).includes('se_situe'));
  });

  // Panne visée : le garde MJ de l'écriture n'est pas posé sur la route quand une nature est donnée.
  test('Léa, joueuse, ne peut relier avec une nature ni par l’API : rien n’est écrit', opts, async () => {
    const f = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Maître Aldric']}`)).json();
    const avant = (await toutes(antor, 'Maître Aldric')).length;
    const r = await lea.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Maître Aldric']}/sections/${f.sections[0].id}/relations`, {
      method: 'POST',
      data: { cibleFicheId: ids['Lames Grises'], nature: 'allie', qualificatif: 'pirate' },
    });
    assert.ok(r.status() >= 400 && r.status() < 500, `status ${r.status()}`);
    assert.equal((await toutes(antor, 'Maître Aldric')).length, avant);
  });

  // Exclusion : Léa ne lit pas les relations de section MJ seul du Prieur, même par la fiche de Port-Sel.
  test('Léa : aucune relation à nature de section fermée dans la fiche de Port-Sel (mentions)', opts, async () => {
    const f = await (await lea.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Port-Sel']}`)).json();
    const t = JSON.stringify(f.mentions ?? []);
    assert.ok(!t.includes('se cache') && !t.includes('Le Prieur masqué'), t);
  });
});

describe('kanevas-fiches-liees-natures, import : lots mêlés et bords', { skip: skipBrowser }, () => {
  let srv2: Server;
  let br2: Any;
  let a2: Any;
  let V = 0;
  let lot = 0;
  const api = (chemin: string, init: RequestInit = {}) =>
    fetch(`${srv2.base}/api/import/v1/univers/${V}${chemin}`, {
      ...init,
      headers: { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  const fiche = (cle: string, type: string, titre: string) =>
    api(`/fiches/${encodeURIComponent(cle)}`, {
      method: 'PUT',
      body: JSON.stringify({ type, titre, sections: [{ cle: 's', titre: 'Apparence', contenu: 'x', joueursLisent: true }] }),
    }).then((r) => r.json() as Promise<Any>);
  const relier = async (cle: string, entrees: Any[]) => {
    const r = await api(`/fiches/${encodeURIComponent(cle)}/relations?lot=${lot}`, { method: 'POST', body: JSON.stringify(entrees) });
    return (await r.json()) as Any[];
  };
  const lues = async (id: number) => {
    const f = await (await a2.request.fetch(`${srv2.base}/api/univers/${V}/fiches/${id}`)).json();
    return (await (await a2.request.fetch(`${srv2.base}/api/univers/${V}/fiches/${id}/sections/${f.sections[0].id}/relations`)).json()).relations as Any[];
  };
  const idsI: Record<string, number> = {};

  before(async () => {
    srv2 = await startServer({ KANEVAS_SANS_SEMIS: '' });
    br2 = await launch();
    a2 = (await connecte(br2, srv2.base, 'Antor')).page;
    const us = await (await a2.request.fetch(`${srv2.base}/api/univers`)).json();
    V = (us.univers ?? us).find((u: Any) => u.nom === 'Essai Kanka').id;
    lot = (await (await api('/lots', { method: 'POST' })).json()).lotId;
    for (const [cle, type, titre] of [
      ['personnage:a', 'personnage', 'Alpha'],
      ['personnage:b', 'personnage', 'Beta'],
      ['lieu:l', 'lieu', 'Lieu L'],
      ['faction:f', 'faction', 'Faction F'],
    ] as const) idsI[cle] = (await fiche(cle, type, titre)).id;
  }, { timeout: 120000 });
  after(async () => {
    await br2?.close();
    srv2?.stop();
  });

  // Panne visée : un refus dans le lot fait perdre ou taire les entrées bonnes qui l'entourent.
  test('lot mêlé : la bonne entrée est créée, la mauvaise refusée nature_incompatible, dans l’ordre', opts, async () => {
    const r = await relier('personnage:a', [
      { section: 's', cible: 'lieu:l', nature: 'se_situe', qualificatif: 'habite' },
      { section: 's', cible: 'lieu:l', nature: 'membre', qualificatif: 'non' },
      { section: 's', cible: 'faction:f', nature: 'membre', qualificatif: 'trésorier' },
    ]);
    assert.deepEqual(r.map((x) => x.etat), ['creee', 'refusee', 'creee']);
    assert.equal(r[1].code, 'nature_incompatible');
    const rels = (await lues(idsI['personnage:a'])).map((x) => `${x.nature}|${x.cible.titre}|${x.qualificatif}`).sort();
    assert.deepEqual(rels, ['membre|Faction F|trésorier', 'se_situe|Lieu L|habite']);
  });

  // Panne visée : une nature symétrique refusée entre personnages, ou acceptée vers un lieu.
  test('« allie » : acceptée personnage → personnage, refusée personnage → lieu', opts, async () => {
    const r = await relier('personnage:a', [
      { section: 's', cible: 'personnage:b', nature: 'allie', qualificatif: 'frère d’armes' },
      { section: 's', cible: 'lieu:l', nature: 'allie', qualificatif: 'x' },
    ]);
    assert.deepEqual(r.map((x) => x.etat), ['creee', 'refusee']);
    assert.equal(r[1].code, 'nature_incompatible');
  });

  // Bord : le plafond du qualificatif (80) vaut aussi pour l'import.
  test('qualificatif de 80 caractères accepté, de 81 refusé et non écrit', opts, async () => {
    const r = await relier('personnage:b', [
      { section: 's', cible: 'lieu:l', nature: 'se_situe', qualificatif: 'x'.repeat(80) },
      { section: 's', cible: 'faction:f', nature: 'membre', qualificatif: 'y'.repeat(81) },
    ]);
    assert.equal(r[0].etat, 'creee');
    assert.equal(r[1].etat, 'refusee');
    const rels = await lues(idsI['personnage:b']);
    assert.ok(!rels.some((x) => x.cible.titre === 'Faction F'));
  });
});
