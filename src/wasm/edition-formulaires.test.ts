// Review of kanevas-carte-spatiale-edition-formulaires: the pure reading of the E-23 forms, against the real core
// (no fake converter). Needs `npm run build:wasm`. Expected values are written by hand from the exit criterion.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogueAspects, galactiqueVersOrbiteHeure, heureVersVoisin, planVersOrbiteHeure } from './coeur.js';
import {
  aspectPreregle, champsNuage, convertir, ligneConversion, lireGraine, lireTaille, nomsPreregles, orbiteParDefaut,
  parametresAnneau, parametresNuage, presetDe, PAR_DEFAUT, PERSONNALISE,
} from '../../frontend/src/outils/swn/galaxie/edition-logique.js';

const coeur = { planVersOrbiteHeure, galactiqueVersOrbiteHeure };
const sys = { q: 7, r: -3 };

test('orbit and hour: -1 and 12 are « Orbite invalide. », the bounds 0, 1000 and 11.99 are accepted', async () => {
  assert.deepEqual(await convertir('orbite', '-1', '3', sys, 4, coeur), { ok: false, erreur: 'Orbite invalide.' });
  assert.deepEqual(await convertir('orbite', '−1', '3', sys, 4, coeur), { ok: false, erreur: 'Orbite invalide.' });
  assert.deepEqual(await convertir('orbite', '4', '12', sys, 4, coeur), { ok: false, erreur: 'Orbite invalide.' });
  assert.deepEqual(await convertir('orbite', '4', '-0,1', sys, 4, coeur), { ok: false, erreur: 'Orbite invalide.' });
  assert.deepEqual(await convertir('orbite', '1000,5', '3', sys, 4, coeur), { ok: false, erreur: 'Orbite invalide.' });
  assert.deepEqual(await convertir('orbite', '0', '0', sys, 4, coeur), { ok: true, orbite: 0, heure: 0 });
  assert.deepEqual(await convertir('orbite', '1000', '11,99', sys, 4, coeur), { ok: true, orbite: 1000, heure: 11.99 });
  assert.deepEqual(await convertir('orbite', '4', '7', sys, 4, coeur), { ok: true, orbite: 4, heure: 7 });
});

test('not a number is « Nombre attendu. », never a conversion', async () => {
  for (const [a, b] of [['', '3'], ['4', ''], ['abc', '3'], ['4', '1e3'], ['4', '3 h'], ['--1', '3']] as const) {
    assert.deepEqual(await convertir('orbite', a, b, sys, 4, coeur), { ok: false, erreur: 'Nombre attendu.' }, `${a}|${b}`);
  }
});

test('hexagon: a neighbour lands on the transition circle at the hour of the core, six neighbours', async () => {
  const attendu: Record<string, number> = {};
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) {
    const c = await convertir('hexagone', String(sys.q + dq), String(sys.r + dr), sys, 3.37, coeur);
    assert.ok(c.ok, `${dq},${dr}`);
    if (!c.ok) return;
    assert.ok(Math.abs(c.orbite - 3.37) <= 0.0051, `orbit ${c.orbite}`);
    const h = await heureVersVoisin(sys.q, sys.r, sys.q + dq, sys.r + dr);
    assert.ok(Math.abs(c.heure - h) <= 0.0051 || (h === 0 && c.heure === 0), `${dq},${dr}: ${c.heure} vs ${h}`);
    attendu[`${dq},${dr}`] = c.heure;
  }
  assert.equal(new Set(Object.values(attendu)).size, 6, 'six distinct hours');
  // Hand-written value of the core's own test: the neighbour east of a system on radius 4 is at orbit 4, hour 3.
  assert.deepEqual(await convertir('hexagone', '8', '-3', sys, 4, coeur), { ok: true, orbite: 4, heure: 3 });
});

test('hexagon: the system\'s own centre is « Position invalide. »; plan origin too', async () => {
  assert.deepEqual(await convertir('hexagone', '7', '-3', sys, 4, coeur), { ok: false, erreur: 'Position invalide.' });
  const o = await convertir('plan', '0', '0', sys, 4, coeur);
  assert.equal(o.ok, true); // the star's place: orbit 0
  assert.deepEqual(await convertir('plan', '1e9', '0', sys, 4, coeur), { ok: false, erreur: 'Nombre attendu.' });
  const loin = await convertir('plan', '100000', '0', sys, 4, coeur);
  assert.deepEqual(loin, { ok: false, erreur: 'Position invalide.' });
});

test('plan: a point typed gives its orbit and hour, rounded to two decimals, hour below 12', async () => {
  const [o, h] = await planVersOrbiteHeure(0, -2);
  const c = await convertir('plan', '0', '-2', sys, 4, coeur);
  assert.ok(c.ok);
  if (c.ok) { assert.ok(Math.abs(c.orbite - o) <= 0.0051); assert.ok(c.heure < 12 && Math.abs(c.heure - h) <= 0.0051 || c.heure === 0); }
});

test('conversion line', () => {
  assert.equal(ligneConversion({ ok: true, orbite: 4, heure: 7 }), '= Orbite 4 · 7 h');
  assert.equal(ligneConversion({ ok: true, orbite: 4.5, heure: 7.25 }), '= Orbite 4,5 · 7,25 h');
  assert.equal(ligneConversion({ ok: false, erreur: 'x' }), '= —');
  assert.equal(ligneConversion(null), '= …');
});

test('seed, size, ring and cloud bounds', () => {
  assert.equal(lireGraine('0').valeur, 0);
  assert.equal(lireGraine('4294967295').valeur, 4294967295);
  assert.ok(lireGraine('4294967296').erreur);
  assert.ok(lireGraine('-1').erreur);
  assert.equal(lireGraine('1,5').erreur, 'Nombre attendu.');
  assert.equal(lireTaille('100').valeur, 100);
  assert.ok(lireTaille('0').erreur); assert.ok(lireTaille('100,01').erreur);
  const base = { rochers: 3 };
  const champs = { de: '3', a: '3', arcTout: true, debut: '0', fin: '6' };
  assert.equal(parametresAnneau(champs, base).parametres, undefined);
  assert.equal(parametresAnneau({ ...champs, a: '4' }, base).parametres?.rochers, 3);
  assert.deepEqual(parametresAnneau({ ...champs, a: '4' }, { arc: [1, 2] }).parametres, { de: 3, a: 4 });
  assert.ok(parametresAnneau({ ...champs, a: '4', arcTout: false, debut: '5', fin: '5' }, base).erreurs.fin);
  assert.ok(parametresAnneau({ ...champs, a: '4', arcTout: false, debut: '5', fin: '12' }, base).erreurs.fin);
  const nuage = parametresNuage({ orbite: '5', heure: '2', etendue: '3' }, { centres: [[1, 1, 1], [8, 9, 2]], poussiere: 1 });
  assert.deepEqual(nuage.parametres, { centres: [[5, 2, 3], [8, 9, 2]], poussiere: 1, orbite: 5, heure: 2 });
  assert.ok(parametresNuage({ orbite: '999', heure: '2', etendue: '3' }, {}).erreurs.etendue);
  assert.deepEqual(champsNuage({ centres: [[5, 2, 3]] }), { orbite: '5', heure: '2', etendue: '3' });
});

test('defaults of « Ajouter » : one beyond the outermost orbit, a moon never counts', () => {
  const i: any = { astres: [{ genre: 'planete', orbite: 4.2 }, { genre: 'lune', orbite: null }, { genre: 'comete', orbite: 6 }], formations: [{ parametres: { a: 7.5 } }] };
  assert.equal(orbiteParDefaut(i), 9);
  assert.equal(orbiteParDefaut({ astres: [], formations: [] } as any), 1);
  assert.equal(orbiteParDefaut({ astres: [{ genre: 'planete', orbite: 1000 }], formations: [] } as any), 1000);
});

test('aspect presets: the presets of the catalogue are recognised, a typed value is « Personnalisé »', async () => {
  const cat = (JSON.parse(await catalogueAspects()) as { types: Record<string, any> }).types;
  const types = Object.keys(cat).filter((t) => nomsPreregles(cat[t]).length > 0);
  const lu = (t: string) => cat[t] as Record<string, unknown>;
  assert.ok(types.length > 0, 'no type with presets');
  for (const t of types) {
    const d = lu(t);
    for (const n of nomsPreregles(d)) {
      assert.equal(presetDe(aspectPreregle(d, n), d), n, `${t}/${n}`);
      assert.equal('variantes' in aspectPreregle(d, n), false);
    }
    const { variantes, ...base } = d;
    assert.equal(presetDe({ ...base, graine: 12345 }, d), PAR_DEFAUT, 'the seed alone is not an aspect change');
    assert.equal(presetDe({ ...base, __inconnu: 1 }, d), PERSONNALISE);
  }
  assert.equal(presetDe({}, undefined), PERSONNALISE);
});
