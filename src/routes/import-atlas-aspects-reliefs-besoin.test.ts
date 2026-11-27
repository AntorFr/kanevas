import assert from 'node:assert/strict';
import { test } from 'node:test';

// Verification written from the need (B-114: « a setting the core cannot render is reported by the import, never silently dropped »;
// the table of `docs/donnees.md` for the keys of kanevas-carte-rendu-aspects-reliefs, their bounds and the kinds that draw them;
// the criterion « par la route d'import, aucune de ces clés n'est plus rangée sous `non_rendu` »). Door: the atlas import route, then
// the illustration route of the stored body. Table-driven: one row per key of the table. Neutral fixture (AD-131).
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { creerGalaxie } = await import('../services/swn/galaxies.js');

const G = 'swn/galaxie';
const PLANETES = ['tellurique', 'verrouillee', 'glace', 'rocheux', 'lave', 'gazeuse'];
const ETOILES = ['jaune', 'orange', 'geante_bleue', 'naine_rouge'];

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = trouverCompte(app.db, 'antor')!.id;
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as any).id as number;
  const gal = creerGalaxie(app.db, antor, E, { titre: 'Galaxie de vérification' }).id;
  const t = creerJeton(app.db, antor, E, { nom: 'T', dureeJours: 30, outils: [G] }, app.horloge()).valeur;
  const req = (url: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: `/api/import/v1/univers/${E}${url}`, headers: { authorization: `Bearer ${t}` }, payload: payload as any });
  assert.equal((await req(`/outils/swn/galaxie/galaxies/${gal}`, { systemes: [{ cle: 'vael', nom: 'Vael', q: 0, r: 0 }] })).statusCode, 200);
  const put = (doc: unknown) => req(`/outils/swn/galaxie/galaxies/${gal}/systemes/vael/atlas`, doc);
  const connexion = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const cookie = `kanevas_session=${connexion.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
  const image = (cle: string) => app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${gal}/interieur/0/0/astres/${cle}/illustration?cote=128`, headers: { cookie } });
  const dump = () => JSON.stringify(app.db.prepare('SELECT * FROM swn_astres ORDER BY id').all());
  const aspect = (cle: string) => JSON.parse((app.db.prepare('SELECT aspect FROM swn_astres WHERE cle = ?').get(cle) as any).aspect);
  return { put, dump, aspect, image };
}
const etoile = (aspect: object = {}) => ({ cle: 's', type: 'orange', nom: 'S', taille: 1, aspect });
const corps = (type: string, aspect: object, cle: string, orbite = 3) => ({ cle, type, nom: cle, orbite, heure: 2, taille: 1, etoile: 's', aspect });
const comete = (aspect: object, cle = 'cm') => ({ cle, type: 'comete', nom: cle, orbite: 6, heure: 1, taille: 0.2, aspect });

/** A body of `type` carrying `aspect`, wherever the atlas puts a body of that kind. */
function atlas(type: string, aspect: object, cle: string) {
  if (ETOILES.includes(type)) return { etoiles: [{ ...etoile(aspect), type }] };
  if (type === 'comete') return { etoiles: [etoile()], points: [comete(aspect, cle)] };
  return { etoiles: [etoile()], corps: [corps(type, aspect, cle)] };
}

// key, the kinds that draw it, a value at the lower bound, at the upper bound, one beyond each bound (the bound is the table's)
const TABLE: Array<{ cle: string; types: string[]; bas: unknown; haut: unknown; dessous?: unknown; dessus?: unknown }> = [
  { cle: 'couleur_nuages', types: ['tellurique', 'verrouillee'], bas: '#000000', haut: '#ffffff', dessous: 'rouge', dessus: '#ff00' },
  { cle: 'opacite_nuages', types: ['tellurique', 'verrouillee'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'terre_seche', types: ['tellurique', 'verrouillee'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'etirement', types: ['tellurique', 'verrouillee', 'gazeuse'], bas: 0.25, haut: 4, dessous: 0.24, dessus: 4.01 },
  { cle: 'eclairs', types: ['tellurique', 'gazeuse'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'inclinaison', types: PLANETES, bas: -90, haut: 90, dessous: -90.5, dessus: 90.5 },
  { cle: 'mers', types: ['tellurique'], bas: 1, haut: 8, dessous: 0, dessus: 9 },
  { cle: 'canyons', types: ['rocheux', 'tellurique'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'lave', types: ['rocheux'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'cristaux', types: ['glace', 'rocheux'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'geysers', types: ['glace', 'rocheux'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'couleur_fissures', types: ['glace', 'rocheux', 'lave'], bas: '#000000', haut: '#ffffff', dessous: 'rouge', dessus: '#ff00' },
  { cle: 'cratere_glace', types: ['glace'], bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'atmosphere_epaisseur', types: PLANETES, bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'activite', types: ETOILES, bas: 0, haut: 1, dessous: -0.01, dessus: 1.01 },
  { cle: 'intensite', types: ETOILES, bas: 0, haut: 2, dessous: -0.01, dessus: 2.01 },
  { cle: 'vue', types: ['comete'], bas: 'profil', haut: 'face', dessous: 'dessus', dessus: 'dessous' },
  { cle: 'courbure', types: ['comete'], bas: -1, haut: 1, dessous: -1.01, dessus: 1.01 },
];

/** Whole-atlas refusal (AD-atlas-3): answered, nothing applied, the path of the refused line named, nothing under `non_rendu`. */
function refus(r: any, chemin: RegExp, contexte: string) {
  assert.equal(r.statusCode, 200, `${contexte} : ${r.body}`);
  const j = r.json();
  assert.equal(j.appliquee, false, `${contexte} : ${r.body}`);
  assert.match(j.refus[0].chemin, chemin, `${contexte} : ${r.body}`);
  assert.equal('non_rendu' in j, false, `${contexte} : ${r.body}`);
}
const CHEMIN = /aspect/;

// Panne : une clé de la tranche rangée sous non_rendu (jamais connue de l'import), ou refusée à son bord exact.
test('B-114 : chaque clé de la tranche, à sa borne basse et à sa borne haute, sur chacun des types qui la dessinent, est appliquée sans ligne non_rendu', async () => {
  for (const { cle, types, bas, haut } of TABLE) {
    for (const type of types) {
      for (const [nom, v] of [['bas', bas], ['haut', haut]] as const) {
        const w = await monde();
        const r = await w.put(atlas(type, { [cle]: v }, 'x'));
        assert.equal(r.statusCode, 200, `${cle}=${nom} sur ${type} : ${r.body}`);
        const j = r.json();
        assert.equal(j.appliquee, true, `${cle}=${nom} sur ${type} : ${r.body}`);
        assert.equal('non_rendu' in j, false, `${cle}=${nom} sur ${type} : ${r.body}`);
        assert.deepEqual(w.aspect(ETOILES.includes(type) ? 's' : 'x')[cle], v, `${cle}=${nom} sur ${type} gardée telle quelle`);
      }
    }
  }
}, { timeout: 300_000 });

// Panne : une borne non appliquée (la valeur hors borne est gardée ou perdue en silence).
test('B-114 : chaque clé juste au-delà de sa borne (au-dessous, au-dessus) refuse l\'atlas entier avec le chemin, rien n\'est écrit', async () => {
  const w = await monde();
  const avant = w.dump();
  for (const { cle, types, dessous, dessus } of TABLE) {
    for (const v of [dessous, dessus]) {
      refus(await w.put(atlas(types[0]!, { [cle]: v }, 'x')), CHEMIN, `${cle}=${JSON.stringify(v)} sur ${types[0]}`);
      assert.equal(w.dump(), avant, `${cle}=${JSON.stringify(v)} : rien n'est écrit`);
    }
  }
});

// Panne : une clé acceptée sur un type qui ne la dessine pas (elle serait « sans effet », donc perdue en silence).
test('B-114 : chaque clé sur un type qui ne la dessine pas refuse l\'atlas entier avec le chemin, rien n\'est écrit', async () => {
  const w = await monde();
  const avant = w.dump();
  const tous = [...PLANETES, ...ETOILES, 'comete'];
  for (const { cle, types, bas } of TABLE.filter((l) => l.cle !== 'courbure')) {
    for (const type of tous.filter((t) => !types.includes(t))) {
      refus(await w.put(atlas(type, { [cle]: bas }, 'x')), CHEMIN, `${cle} sur ${type}`);
      assert.equal(w.dump(), avant, `${cle} sur ${type} : rien n'est écrit`);
    }
  }
}, { timeout: 300_000 });

// Panne : la courbure signée acceptée sur un corps qui n'est pas une comète (la table nomme `comete` pour cette ligne, comme pour les autres).
test('B-114 : la courbure négative (nouvelle borne) sur un corps qui n\'est pas une comète refuse l\'atlas entier avec le chemin, rien n\'est écrit', async () => {
  const w = await monde();
  const avant = w.dump();
  for (const type of [...PLANETES, ...ETOILES]) {
    refus(await w.put(atlas(type, { courbure: -0.5 }, 'x')), CHEMIN, `courbure -0.5 sur ${type}`);
    assert.equal(w.dump(), avant, `courbure sur ${type} : rien n'est écrit`);
  }
});

// Panne : un atlas refusé pour un seul corps écrit les autres (le refus n'est plus tout ou rien).
test('B-114 : un seul corps fautif d\'un atlas refuse tout l\'atlas, le chemin nomme le rang du corps fautif', async () => {
  const w = await monde();
  const avant = w.dump();
  const r = await w.put({ etoiles: [etoile()], corps: [corps('tellurique', { terre_seche: 0.2 }, 'ok'), corps('gazeuse', { lave: 0.5 }, 'faute', 4)] });
  refus(r, /^corps\[1\]\.aspect/, 'lave sur une gazeuse');
  assert.equal(w.dump(), avant);
});

// Panne : l'import perd les anneaux colorés (clés de l'objet anneau) ou les range sous non_rendu.
test('B-114 : l\'anneau coloré d\'un géant (couleur, couleur2, opacité) est appliqué, gardé et sans ligne non_rendu', async () => {
  const w = await monde();
  const anneau = { couleur: '#aa2200', couleur2: '#220044', opacite: 0.4 };
  const r = await w.put({ etoiles: [etoile()], corps: [corps('gazeuse', { anneau }, 'g')] });
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  assert.equal('non_rendu' in j, false, r.body);
  assert.deepEqual(w.aspect('g').anneau, anneau);
});

// Panne : une clé vraiment inconnue n'est plus rapportée une fois les clés de la tranche connues (la liste des clés connues absorbe tout).
test('B-114 : une clé que le cœur ne connaît pas reste rapportée sous non_rendu avec son chemin, à côté d\'une clé de la tranche', async () => {
  const w = await monde();
  const r = await w.put({ etoiles: [etoile()], corps: [corps('tellurique', { terre_seche: 0.3, orage_x: 1 }, 'p')] });
  const j = r.json();
  assert.equal(j.appliquee, true, r.body);
  assert.deepEqual(j.non_rendu, [{ chemin: 'corps[0].aspect.orage_x', cle: 'orage_x' }]);
  assert.equal(w.aspect('p').terre_seche, 0.3);
});

// Panne : une clé de la tranche stockée mais perdue entre la base et l'image (fusion du catalogue, route d'illustration).
test('B-114 : une clé importée change l\'image servie par la route d\'illustration (même graine, mêmes autres réglages)', async () => {
  const w = await monde();
  // type, key, what the two bodies share (same seed, same other settings), what only the first carries
  const CAS: Array<[string, string, object, object]> = [
    ['tellurique', 'couleur_nuages', { nuages: 1 }, { couleur_nuages: '#d04020' }],
    ['tellurique', 'terre_seche', {}, { terre_seche: 1 }],
    ['tellurique', 'etirement', { nuages: 0.5 }, { etirement: 4 }],
    ['tellurique', 'eclairs', { nuages: 0.6 }, { eclairs: 1 }],
    ['gazeuse', 'inclinaison', {}, { inclinaison: 60 }],
    ['tellurique', 'mers', {}, { mers: 6 }],
    ['rocheux', 'canyons', {}, { canyons: 1 }],
    ['rocheux', 'lave', {}, { lave: 1 }],
    ['rocheux', 'cristaux', {}, { cristaux: 1 }],
    ['glace', 'geysers', {}, { geysers: 1 }],
    ['rocheux', 'couleur_fissures', { fissures: 1 }, { couleur_fissures: '#00ff00' }],
    ['glace', 'cratere_glace', {}, { cratere_glace: 1 }],
    ['tellurique', 'atmosphere_epaisseur', { halo: 0.6 }, { atmosphere_epaisseur: 1 }],
    ['gazeuse', 'anneau', {}, { anneau: { couleur: '#ff0000', couleur2: '#ff0000', opacite: 0.9 } }],
  ];
  const corpsAtlas: object[] = [];
  CAS.forEach(([type, , commun, avec], i) => {
    corpsAtlas.push(corps(type, { graine: 5, ...commun, ...avec }, `a${i}`, 2 + i), corps(type, { graine: 5, ...commun }, `b${i}`, 2 + i));
  });
  const etoiles = [{ ...etoile({ graine: 5, activite: 1 }), cle: 's' }];
  const r = await w.put({ etoiles, corps: corpsAtlas, points: [comete({ graine: 5, vue: 'face' }, 'cf'), comete({ graine: 5 }, 'cp')] });
  assert.equal(r.json().appliquee, true, r.body);
  for (const [i, [type, cle]] of CAS.entries()) {
    const [a, b] = [await w.image(`a${i}`), await w.image(`b${i}`)];
    assert.equal(a.statusCode, 200, `${type} ${cle}`);
    assert.equal(b.statusCode, 200, `${type} ${cle}`);
    assert.notDeepEqual(a.rawPayload, b.rawPayload, `${type} ${cle} : l'image avec la clé est celle du corps sans elle`);
  }
  const [cf, cp] = [await w.image('cf'), await w.image('cp')];
  assert.equal(cf.statusCode, 200);
  assert.notDeepEqual(cf.rawPayload, cp.rawPayload, 'comète de face et de profil');
}, { timeout: 300_000 });
