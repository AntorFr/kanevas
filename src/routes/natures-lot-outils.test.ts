// Doors of the lot « outils » for the natures screen files (`src/e2e/natures-ensemble-*.test.ts`, docs/tests-ecran/lot-outils.md):
// the seeded relations, the natures route guards, the import of natures and a migrated database, in-process (`inject`, no browser).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';

/** The seeded world (« Lame d'Ébène », #1) with the ids of its sheets by title. */
async function monde() {
  const m = await monter({ semis: true });
  const U = `/api/univers/1`;
  const ids: Record<string, number> = {};
  for (const t of ['personnage', 'lieu', 'faction', 'famille', 'objet']) {
    const r = await m.dire(m.antor, 'GET', `${U}/fiches?type=${t}`);
    for (const f of r.corps.fiches) ids[f.titre] = f.id;
  }
  /** Every relation of a sheet as « Section | nature | cible | qualificatif », read as Antor. */
  const toutes = async (titre: string) => {
    const f = (await m.dire(m.antor, 'GET', `${U}/fiches/${ids[titre]}`)).corps;
    const lignes: string[] = [];
    for (const s of f.sections) {
      const r = await m.dire(m.antor, 'GET', `${U}/fiches/${ids[titre]}/sections/${s.id}/relations`);
      if (r.status !== 200) continue;
      for (const x of r.corps.relations) lignes.push(`${s.titre} | ${x.nature} | ${x.cible.titre} | ${x.qualificatif}`);
    }
    return lignes.sort();
  };
  return { ...m, U, ids, toutes };
}

describe('Natures: the seeded world and the guards of the natures route', () => {
  test('GET natures: five natures with both labels and the pairs, in order; a player reads them too', async () => {
    const m = await monde();
    const r = await m.dire(m.antor, 'GET', `${m.U}/natures`);
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.corps.natures.map((n: Any) => [n.cle, n.libelleSource, n.libelleCible, n.symetrique]),
      [
        ['se_situe', 'se situe à', "s'y trouvent", false],
        ['membre', 'membre de', 'membres', false],
        ['detient', 'détient', 'détenu par', false],
        ['allie', 'allié de', 'allié de', true],
        ['ennemi', 'ennemi de', 'ennemi de', true],
      ],
    );
    const se = r.corps.natures.find((n: Any) => n.cle === 'se_situe');
    assert.deepEqual(se.typesCible, ['lieu']);
    assert.ok(se.typesSource.includes('personnage') && !se.typesSource.includes('lieu'));
    assert.deepEqual([...r.corps.natures.find((n: Any) => n.cle === 'membre').typesCible].sort(), ['faction', 'famille']);
    const l = await m.dire(m.lea, 'GET', `${m.U}/natures`);
    assert.equal(l.status, 200);
    assert.equal(l.corps.natures.length, 5);
  });

  test('GET natures: a non-member of the universe gets 404 without the list; no session gets no list', async () => {
    const m = await monde();
    const cree = await m.dire(m.antor, 'POST', '/api/univers', { nom: 'Univers sans Léa' });
    assert.equal(cree.status, 201);
    assert.equal((await m.dire(m.antor, 'GET', `/api/univers/${cree.corps.id}/natures`)).status, 200);
    const r = await m.appel(m.lea, 'GET', `/api/univers/${cree.corps.id}/natures`);
    assert.equal(r.statusCode, 404);
    assert.ok(!r.body.includes('se_situe'));
    const sans = await m.appel(undefined, 'GET', `${m.U}/natures`);
    assert.notEqual(sans.statusCode, 200);
    assert.ok(!sans.body.includes('se_situe'));
  });

  test('the seed: Aldric, Ombeline, Bran, Suie, the Prieur and the family « Les Corvalis » carry the relations the starting data promise', async () => {
    const m = await monde();
    const a = await m.toutes('Maître Aldric');
    assert.ok(a.some((l) => l.endsWith('| se_situe | Port-Sel | habite')), a.join('\n'));
    assert.ok(a.some((l) => l.endsWith('| membre | La Guilde des Brumes | trésorier')), a.join('\n'));
    assert.ok(a.some((l) => l.includes(' |  | Port-Sel | maître de port')), a.join('\n'));
    assert.equal(a.filter((l) => /\| (se_situe|membre) \|/.test(l)).length, 2);
    const o = await m.toutes('Dame Ombeline de Val-Fortin');
    assert.ok(o.some((l) => l.endsWith('| membre | La Guilde des Brumes | dirige')), o.join('\n'));
    assert.ok(o.some((l) => l.endsWith('| membre | Les Corvalis | veuve')), o.join('\n'));
    assert.ok((await m.toutes('Bran Corvalis')).some((l) => l.endsWith('| membre | Les Corvalis | aîné')));
    assert.ok((await m.toutes('Suie')).some((l) => l.endsWith('| se_situe | Les Docks | ')));
    assert.deepEqual((await m.toutes('Le Prieur masqué')).filter((l) => l.includes('| se_situe |')), ['Secret — MJ seul | se_situe | Port-Sel | se cache']);
    const fam = await m.dire(m.antor, 'GET', `${m.U}/fiches?type=famille`);
    assert.deepEqual(fam.corps.fiches.map((f: Any) => f.titre), ['Les Corvalis']);
  });

  test('Léa: the Prieur is unknown to her, and « se cache » leaks neither through its section nor through « Mentionnée dans » of Port-Sel', async () => {
    const m = await monde();
    const prieur = await m.appel(m.lea, 'GET', `${m.U}/fiches/${m.ids['Le Prieur masqué']}`);
    assert.equal(prieur.statusCode, 404);
    assert.ok(!prieur.body.includes('se cache'));
    const f = (await m.dire(m.lea, 'GET', `${m.U}/fiches/${m.ids['Port-Sel']}`)).corps;
    const txt = JSON.stringify(f.mentions ?? []);
    assert.ok(!txt.includes('se cache') && !txt.includes('Prieur'), txt);
    const sec = (await m.dire(m.antor, 'GET', `${m.U}/fiches/${m.ids['Le Prieur masqué']}`)).corps.sections.find((s: Any) => s.titre === 'Secret — MJ seul');
    const r = await m.dire(m.lea, 'GET', `${m.U}/fiches/${m.ids['Le Prieur masqué']}/sections/${sec.id}/relations`);
    assert.notEqual(r.status, 200);
  });

  test('Léa, a player, cannot relate with a nature: refused, nothing written', async () => {
    const m = await monde();
    const f = (await m.dire(m.antor, 'GET', `${m.U}/fiches/${m.ids['Maître Aldric']}`)).corps;
    const avant = (await m.toutes('Maître Aldric')).length;
    const r = await m.dire(m.lea, 'POST', `${m.U}/fiches/${m.ids['Maître Aldric']}/sections/${f.sections[0].id}/relations`, {
      cibleFicheId: m.ids['Lames Grises'], nature: 'allie', qualificatif: 'pirate',
    });
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
    assert.equal((await m.toutes('Maître Aldric')).length, avant);
  });

  test('a symmetric nature is stored once: « allié de » from Ombeline, the same fact from Lames Grises is 409 relation_existante and nothing is stored there', async () => {
    const m = await monde();
    const o = m.ids['Dame Ombeline de Val-Fortin'];
    const g = m.ids['Lames Grises'];
    const so = (await m.dire(m.antor, 'GET', `${m.U}/fiches/${o}`)).corps.sections[0].id;
    const a = await m.dire(m.antor, 'POST', `${m.U}/fiches/${o}/sections/${so}/relations`, { cibleFicheId: g, nature: 'allie', qualificatif: 'pacte' });
    assert.equal(a.status, 201);
    const sg = (await m.dire(m.antor, 'GET', `${m.U}/fiches/${g}`)).corps.sections[0].id;
    const b = await m.dire(m.antor, 'POST', `${m.U}/fiches/${g}/sections/${sg}/relations`, { cibleFicheId: o, nature: 'allie', qualificatif: 'pacte' });
    assert.equal(b.status, 409);
    assert.equal(b.corps.code, 'relation_existante');
    assert.equal((await m.dire(m.antor, 'GET', `${m.U}/fiches/${g}/sections/${sg}/relations`)).corps.relations.length, 0);
  });
});

describe('Natures: the relation rules on the seeded world', () => {
  /** The first section of a sheet. */
  const premiere = async (m: Awaited<ReturnType<typeof monde>>, titre: string) =>
    (await m.dire(m.antor, 'GET', `${m.U}/fiches/${m.ids[titre]}`)).corps.sections[0].id as number;
  const poster = (m: Awaited<ReturnType<typeof monde>>, titre: string, section: number, corps: Any) =>
    m.dire(m.antor, 'POST', `${m.U}/fiches/${m.ids[titre]}/sections/${section}/relations`, corps);
  const lues = async (m: Awaited<ReturnType<typeof monde>>, titre: string, section: number) =>
    (await m.dire(m.antor, 'GET', `${m.U}/fiches/${m.ids[titre]}/sections/${section}/relations`)).corps.relations as Any[];

  test('qualifier bounds: 80 characters pass, 81 is 400, spaces alone without a nature is 400, a nature without qualifier is 201; the empty free relation is not written', async () => {
    const m = await monde();
    const s = await premiere(m, 'Suie');
    assert.equal((await poster(m, 'Suie', s, { cibleFicheId: m.ids['Les Sphères'], nature: 'se_situe', qualificatif: 'x'.repeat(80) })).status, 201);
    assert.equal((await poster(m, 'Suie', s, { cibleFicheId: m.ids['Val-Fortin'], nature: 'se_situe', qualificatif: 'x'.repeat(81) })).status, 400);
    assert.equal((await poster(m, 'Suie', s, { cibleFicheId: m.ids['Val-Fortin'], qualificatif: '    ' })).status, 400);
    assert.equal((await poster(m, 'Suie', s, { cibleFicheId: m.ids['Val-Fortin'], nature: 'se_situe' })).status, 201);
    const rels = await lues(m, 'Suie', s);
    assert.ok(rels.some((x) => x.cible.titre === 'Val-Fortin' && x.nature === 'se_situe' && x.qualificatif === ''));
    assert.ok(!rels.some((x) => x.cible.titre === 'Val-Fortin' && x.nature === ''));
  });

  test('a free relation without a nature needs a qualifier, and with one it is written (the screen refusal is a display of this 400)', async () => {
    const m = await monde();
    const s = await premiere(m, 'Bran Corvalis');
    const avant = (await lues(m, 'Bran Corvalis', s)).length;
    assert.equal((await poster(m, 'Bran Corvalis', s, { cibleFicheId: m.ids['Val-Fortin'] })).status, 400);
    assert.equal((await lues(m, 'Bran Corvalis', s)).length, avant);
    assert.equal((await poster(m, 'Bran Corvalis', s, { cibleFicheId: m.ids['Val-Fortin'], qualificatif: 'prisonnier de' })).status, 201);
    const rels = await lues(m, 'Bran Corvalis', s);
    assert.equal(rels.length, avant + 1);
    assert.ok(rels.some((x) => x.nature === '' && x.qualificatif === 'prisonnier de' && x.cible.titre === 'Val-Fortin'));
  });

  test('a nature outside its pair is 400 nature_incompatible and nothing is written; « dirige » is no nature', async () => {
    const m = await monde();
    const s = await premiere(m, 'Maître Aldric');
    const avant = (await lues(m, 'Maître Aldric', s)).length;
    const portrait = m.ids['Le Portrait de l’échec'] ?? m.ids["Le Portrait de l'échec"];
    const objet = await poster(m, 'Maître Aldric', s, { cibleFicheId: portrait, nature: 'se_situe', qualificatif: 'x' });
    assert.equal(objet.status, 400);
    assert.equal(objet.corps.code, 'nature_incompatible');
    const lieu = await poster(m, 'Port-Sel', await premiere(m, 'Port-Sel'), { cibleFicheId: m.ids['Val-Fortin'], nature: 'se_situe', qualificatif: 'dans' });
    assert.equal(lieu.status, 400);
    assert.equal(lieu.corps.code, 'nature_incompatible');
    const perso = await poster(m, 'Maître Aldric', s, { cibleFicheId: m.ids['Suie'], nature: 'membre', qualificatif: 'x' });
    assert.equal(perso.status, 400);
    assert.equal(perso.corps.code, 'nature_incompatible');
    assert.equal((await poster(m, 'Maître Aldric', s, { cibleFicheId: m.ids['La Guilde des Brumes'], nature: 'dirige', qualificatif: 'x' })).status, 400);
    assert.equal((await lues(m, 'Maître Aldric', s)).length, avant);
  });

  test('same nature, qualifier and target is 409 relation_existante; another qualifier coexists; oneself is 400 auto_relation', async () => {
    const m = await monde();
    const f = m.ids['Maître Aldric'];
    const s = await premiere(m, 'Maître Aldric');
    const dup = await poster(m, 'Maître Aldric', s, { cibleFicheId: m.ids['Port-Sel'], nature: 'se_situe', qualificatif: 'habite' });
    assert.equal(dup.status, 409);
    assert.equal(dup.corps.code, 'relation_existante');
    assert.equal((await poster(m, 'Maître Aldric', s, { cibleFicheId: m.ids['Port-Sel'], nature: 'se_situe', qualificatif: 'travaille' })).status, 201);
    const soi = await poster(m, 'Maître Aldric', s, { cibleFicheId: f, qualificatif: 'moi' });
    assert.equal(soi.status, 400);
    assert.equal(soi.corps.code, 'auto_relation');
  });

  test('« Mentionnée dans » of Port-Sel keeps the free relations and drops the ones with a nature', async () => {
    const m = await monde();
    const f = (await m.dire(m.antor, 'GET', `${m.U}/fiches/${m.ids['Port-Sel']}`)).corps;
    const libelles = (titre: string) => (f.mentions.find((x: Any) => x.titre === titre)?.pourquoi ?? []).filter((p: Any) => p.genre === 'relation').map((p: Any) => p.libelle);
    assert.deepEqual(libelles('La Guilde des Brumes'), ['y fait passer ses cargaisons']);
    assert.deepEqual(libelles('Rapport secret de l’amirauté').concat(libelles("Rapport secret de l'amirauté")), ['surveille']);
    assert.deepEqual(libelles('Maître Aldric'), ['maître de port']);
    const tous = f.mentions.flatMap((x: Any) => x.pourquoi.filter((p: Any) => p.genre === 'relation').map((p: Any) => p.libelle));
    for (const natured of ['habite', 'se cache', 'trésorier', 'travaille']) assert.ok(!tous.includes(natured), `« ${natured} » is a relation with a nature`);
  });
});

describe('Natures: what Léa reads of Aldric', () => {
  test('the relations of the closed section are refused, a write is refused, and her read of the open section hides the relation whose target is closed', async () => {
    const m = await monde();
    const f = (await m.dire(m.antor, 'GET', `${m.U}/fiches/${m.ids['Maître Aldric']}`)).corps;
    const [ouverte, fermee] = [f.sections[0].id, f.sections[1].id];
    await m.dire(m.antor, 'POST', `${m.U}/fiches/${m.ids['Maître Aldric']}/sections/${fermee}/relations`, { cibleFicheId: m.ids['Port-Sel'], nature: 'se_situe', qualificatif: 'planque-secrète' });
    assert.notEqual((await m.dire(m.lea, 'GET', `${m.U}/fiches/${m.ids['Maître Aldric']}/sections/${fermee}/relations`)).status, 200);
    const ecrire = await m.dire(m.lea, 'POST', `${m.U}/fiches/${m.ids['Maître Aldric']}/sections/${ouverte}/relations`, { cibleFicheId: m.ids['Port-Sel'], nature: 'se_situe', qualificatif: 'intrus' });
    assert.ok([403, 404].includes(ecrire.status), `status ${ecrire.status}`);
    const rels = (await m.dire(m.lea, 'GET', `${m.U}/fiches/${m.ids['Maître Aldric']}/sections/${ouverte}/relations`)).corps.relations as Any[];
    assert.ok(!rels.some((x) => x.cible.titre === 'La Guilde des Brumes'));
    assert.ok(rels.some((x) => x.nature === 'se_situe' && x.qualificatif === 'habite'));
    assert.ok(!rels.some((x) => x.qualificatif === 'intrus'));
  });
});

describe('Natures: the import API (B-68) on the seeded world', () => {
  async function importeur() {
    const m = await monter({ semis: true });
    const us = await m.dire(m.antor, 'GET', '/api/univers');
    const V = (us.corps.univers ?? us.corps).find((u: Any) => u.nom === 'Essai Kanka').id as number;
    const imp = async (chemin: string, method: 'GET' | 'POST' | 'PUT', body?: unknown) => {
      const r = await m.app.inject({
        method, url: `/api/import/v1/univers/${V}${chemin}`,
        headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
        payload: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.statusCode, body: r.json() as Any };
    };
    const lot = (await imp('/lots', 'POST')).body.lotId as number;
    const ids: Record<string, number> = {};
    const fiche = (cle: string, type: string, titre: string) =>
      imp(`/fiches/${encodeURIComponent(cle)}`, 'PUT', { type, titre, sections: [{ cle: 's', titre: 'Apparence', contenu: 'x', joueursLisent: true }] });
    const relier = (cle: string, entrees: Any[]) => imp(`/fiches/${encodeURIComponent(cle)}/relations?lot=${lot}`, 'POST', entrees);
    const lues = async (id: number): Promise<Any[]> => {
      const f = await m.dire(m.antor, 'GET', `/api/univers/${V}/fiches/${id}`);
      return (await m.dire(m.antor, 'GET', `/api/univers/${V}/fiches/${id}/sections/${f.corps.sections[0].id}/relations`)).corps.relations;
    };
    for (const [cle, type, titre] of [
      ['personnage:zed', 'personnage', 'Zed'], ['lieu:zone', 'lieu', 'Zone'], ['lieu:autrezone', 'lieu', 'Autre zone'],
      ['faction:zeds', 'faction', 'Les Zeds'], ['personnage:a', 'personnage', 'Alpha'], ['personnage:b', 'personnage', 'Beta'],
      ['lieu:l', 'lieu', 'Lieu L'], ['faction:f', 'faction', 'Faction F'],
    ] as const) {
      const r = await fiche(cle, type, titre);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      ids[cle] = r.body.id;
    }
    return { m, V, imp, lot, ids, fiche, relier, lues };
  }

  test('one story: create, replay, second qualifier, free `type`, refusals counted, family, mixed batch, symmetric, 80/81 characters, closed batch report', async () => {
    const { imp, lot, ids, fiche, relier, lues } = await importeur();
    const entree = { section: 's', cible: 'lieu:zone', nature: 'se_situe', qualificatif: 'habite' };
    const un = await relier('personnage:zed', [entree]);
    assert.equal(un.status, 200);
    assert.equal(un.body[0].etat, 'creee');
    assert.equal((await relier('personnage:zed', [entree])).body[0].etat, 'inchangee');
    assert.equal((await lues(ids['personnage:zed'])).filter((r) => r.nature === 'se_situe' && r.qualificatif === 'habite' && r.cible.titre === 'Zone').length, 1);

    const deux = await relier('personnage:zed', [
      { section: 's', cible: 'lieu:zone', nature: 'se_situe', qualificatif: 'travaille' },
      { section: 's', cible: 'lieu:autrezone', nature: 'se_situe' },
    ]);
    assert.deepEqual(deux.body.map((x: Any) => x.etat), ['creee', 'creee']);
    let rels = await lues(ids['personnage:zed']);
    assert.ok(rels.some((x) => x.cible.titre === 'Autre zone' && x.nature === 'se_situe' && x.qualificatif === ''));
    assert.equal(rels.filter((x) => x.cible.titre === 'Zone' && x.nature === 'se_situe').length, 2);

    const libre = await relier('personnage:zed', [{ section: 's', cible: 'faction:zeds', type: 'ancien texte' }]);
    assert.equal(libre.body[0].etat, 'creee');
    rels = await lues(ids['personnage:zed']);
    assert.ok(rels.some((x) => x.cible.titre === 'Les Zeds' && x.nature === '' && x.qualificatif === 'ancien texte'));

    const avant = rels.length;
    const refus = await relier('personnage:zed', [
      { section: 's', cible: 'faction:zeds', nature: 'inconnue', qualificatif: 'a' },
      { section: 's', cible: 'faction:zeds', nature: 'dirige', qualificatif: 'b' },
      { section: 's', cible: 'lieu:zone', nature: 'detient', qualificatif: 'c' },
    ]);
    for (const x of refus.body) {
      assert.equal(x.etat, 'refusee');
      assert.equal(x.code, 'nature_incompatible');
    }
    assert.equal((await lues(ids['personnage:zed'])).length, avant);

    const f = await fiche('famille:zedi', 'famille', 'Les Zedi');
    assert.equal(f.body.etat, 'creee');
    assert.equal((await fiche('famille:zedi', 'famille', 'Les Zedi')).body.etat, 'inchangee');
    assert.equal((await relier('personnage:zed', [{ section: 's', cible: 'famille:zedi', nature: 'membre', qualificatif: 'aîné' }])).body[0].etat, 'creee');
    assert.ok((await lues(ids['personnage:zed'])).some((x) => x.nature === 'membre' && x.qualificatif === 'aîné' && x.cible.titre === 'Les Zedi'));

    const mele = await relier('personnage:a', [
      { section: 's', cible: 'lieu:l', nature: 'se_situe', qualificatif: 'habite' },
      { section: 's', cible: 'lieu:l', nature: 'membre', qualificatif: 'non' },
      { section: 's', cible: 'faction:f', nature: 'membre', qualificatif: 'trésorier' },
    ]);
    assert.deepEqual(mele.body.map((x: Any) => x.etat), ['creee', 'refusee', 'creee']);
    assert.equal(mele.body[1].code, 'nature_incompatible');
    assert.deepEqual((await lues(ids['personnage:a'])).map((x) => `${x.nature}|${x.cible.titre}|${x.qualificatif}`).sort(), ['membre|Faction F|trésorier', 'se_situe|Lieu L|habite']);

    const sym = await relier('personnage:a', [
      { section: 's', cible: 'personnage:b', nature: 'allie', qualificatif: 'frère d’armes' },
      { section: 's', cible: 'lieu:l', nature: 'allie', qualificatif: 'x' },
    ]);
    assert.deepEqual(sym.body.map((x: Any) => x.etat), ['creee', 'refusee']);
    assert.equal(sym.body[1].code, 'nature_incompatible');

    const bord = await relier('personnage:b', [
      { section: 's', cible: 'lieu:l', nature: 'se_situe', qualificatif: 'x'.repeat(80) },
      { section: 's', cible: 'faction:f', nature: 'membre', qualificatif: 'y'.repeat(81) },
    ]);
    assert.equal(bord.body[0].etat, 'creee');
    assert.equal(bord.body[1].etat, 'refusee');
    assert.ok(!(await lues(ids['personnage:b'])).some((x) => x.cible.titre === 'Faction F'));

    const clos = await imp(`/lots/${lot}/clore`, 'POST');
    assert.equal(clos.body.compteurs.relations.refusees, 6);
    assert.equal(clos.body.rapport.filter((x: Any) => x.code === 'nature_incompatible').length, 5);
  });
});
