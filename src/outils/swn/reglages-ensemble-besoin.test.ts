import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Whole-feature tests of kanevas-carte-spatiale-reglages at the door of E-24: the routes under …/galaxies/:gid
// (`GET|PUT /reglages`, `POST /reglages/apercu`, `PUT /aspects/:type`) and the reads of the map and of the interior, real routes,
// real database, stub login. Written from the sheet (« Livre », exit criterion as amended on 2026-11-12), docs/parcours.md (B-90, P-23)
// and docs/ecrans.md (E-24), not from the code. The neutral seed's stars are those of Éneria's fixtures
// (rust/modules/coeur/tests/fixtures/generation-galaxie.json): every expected value below is a literal, or a state read before the change.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');

const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
// Twenty hexagons that hold a drawn star on the neutral seed (Éneria's fixtures).
const TIRES: Array<[number, number]> = [[-49, -48], [-44, -47], [-44, 38], [-43, -14], [-39, -49], [-27, 12], [-17, -48], [-13, -48], [-7, -48], [-2, -49],
  [7, 18], [11, -7], [12, -34], [12, -24], [18, -47], [26, 22], [33, -2], [37, -44], [38, 3], [48, 27]];
// Two of them are defined (anchored) by the GM before any setting moves.
const DEFINIS: Array<[number, number]> = [[-49, -48], [7, 18]];
const TIRES_RESTANTS = TIRES.filter(([q, r]) => !DEFINIS.some(([a, b]) => a === q && b === r));

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const all = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).all(...a) as any[];

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  for (const z of GALAXIE.densites.zones) {
    app.db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;
  const appeler = (who: string, method: 'GET' | 'POST' | 'PUT', chemin: string, payload?: unknown, galaxie = g) =>
    app.inject({ method, url: `${base.replace(`/galaxies/${g}`, `/galaxies/${galaxie}`)}/${chemin}`, headers: h[who],
      ...(payload === undefined ? {} : { payload: payload as object }) });
  const interieur = async (q: number, r: number) => (await appeler('antor', 'GET', `interieur/${q}/${r}`)).json();
  /** Every drawn star of the preview's extent (50 × 50 blocks of 5 hexagons, read by squares of 10 blocks), as sorted « q,r », defined systems excluded by the route. */
  const etoiles = async (): Promise<string[]> => {
    const sortie: string[] = [];
    for (let x = -25; x <= 24; x += 10) {
      for (let y = -25; y <= 24; y += 10) {
        const res = await appeler('antor', 'GET', `blocs?de=${x},${y}&a=${x + 9},${y + 9}`);
        assert.equal(res.statusCode, 200, res.body);
        for (const b of res.json().blocs as any[]) for (const [q, r] of b.generes) sortie.push(`${q},${r}`);
      }
    }
    return sortie.sort();
  };
  const reglages = async () => (await appeler('antor', 'GET', 'reglages')).json();
  /** What the GM applies: the version token is the galaxy's, read now. */
  const poser = async (corps: Record<string, unknown>, confirme = true) =>
    appeler('antor', 'PUT', 'reglages', { version: (await reglages()).version, confirme, ...corps });
  const posterAspect = async (type: string, parametres: unknown) => {
    const a = (await reglages()).aspects.find((x: any) => x.type === type);
    return appeler('antor', 'PUT', `aspects/${type}`, { version: a.version, parametres });
  };
  const versionGalaxie = () => one(app, 'SELECT version FROM swn_galaxies WHERE id=?', g).version as number;
  const lignesSettings = () => ({ reglages: one(app, 'SELECT count(*) n FROM swn_reglages').n as number, aspects: one(app, 'SELECT count(*) n FROM swn_aspects').n as number });
  /** Every row that makes up the defined systems of the galaxy. */
  const lignesDefinies = () => ({
    systemes: all(app, 'SELECT * FROM swn_systemes WHERE galaxie_id=? ORDER BY id', g),
    astres: all(app, 'SELECT a.* FROM swn_astres a JOIN swn_systemes s ON s.id=a.systeme_id WHERE s.galaxie_id=? ORDER BY a.id', g),
    formations: all(app, 'SELECT f.* FROM swn_formations f JOIN swn_systemes s ON s.id=f.systeme_id WHERE s.galaxie_id=? ORDER BY f.id', g),
  });
  for (const [q, r] of DEFINIS) {
    const v = (await appeler('antor', 'GET', `interieur/${q}/${r}`)).json();
    const res = await appeler('antor', 'POST', `interieur/${q}/${r}/ancrage`, { versionSysteme: v.versionSysteme });
    assert.equal(res.statusCode, 200, res.body);
  }
  return { app, h, E, g, appeler, interieur, etoiles, reglages, poser, posterAspect, versionGalaxie, lignesSettings, lignesDefinies };
}
const cometes = (v: any): number => v.astres.filter((a: any) => a.genre === 'comete').length;
const sansJetons = (v: any) => JSON.stringify(v);
const COMETE_A_1 = { valeurs: { frequences: { comete: 1 } } };

test('B-90 · P-23 nominal : le MJ monte la comète à 1, le décompte paraît avant la confirmation, puis chaque système tiré montre une comète', async () => {
  const w = await monde();
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });
  const avant = await Promise.all(TIRES_RESTANTS.map(([q, r]) => w.interieur(q, r)));
  assert.ok(avant.some((v) => cometes(v) === 0), 'sans réglage, tous les systèmes n’ont pas de comète');
  const v0 = w.versionGalaxie();

  const apercu = await w.appeler('antor', 'POST', 'reglages/apercu', COMETE_A_1);
  assert.equal(apercu.statusCode, 200, apercu.body);
  assert.ok(apercu.json().tires_changent > 0, 'le décompte des systèmes tirés qui changent est donné avant d’appliquer');
  assert.equal(apercu.json().definis_inchangent, 2);
  assert.equal(w.versionGalaxie(), v0, 'l’aperçu n’écrit rien');
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });

  const sans = await w.poser(COMETE_A_1, false);
  assert.equal(sans.statusCode, 400, 'appliquer sans avoir confirmé un décompte non nul est refusé');
  assert.equal(sans.json().code, 'confirmation_requise');
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });

  const res = await w.poser(COMETE_A_1);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().valeurs.frequences.comete, 1);
  for (const [q, r] of TIRES_RESTANTS) {
    const v = await w.interieur(q, r);
    assert.equal(v.etat, 'tire');
    assert.ok(cometes(v) >= 1, `(${q}, ${r}) montre une comète`);
  }
});

test('B-90 exclusion : un système défini est identique après tout réglage du générateur — mêmes lignes, mêmes positions, même intérieur lu', async () => {
  const w = await monde();
  const lignes0 = w.lignesDefinies();
  assert.equal(lignes0.systemes.length, 2);
  assert.ok(lignes0.astres.length > 10);
  const lus0 = await Promise.all(DEFINIS.map(([q, r]) => w.interieur(q, r)));
  for (const v of lus0) assert.equal(v.etat, 'defini');
  const reglagesDuGenerateur: Array<[string, Record<string, unknown>]> = [
    ['comète à 1', COMETE_A_1],
    ['zones et nébuleuses à 0', { valeurs: { frequences: { zone: 0, nebuleuse: 0 } } }],
    ['bornes de la naine rouge et de l’orange', { valeurs: { par_classe: { naine_rouge: { planetes: [8, 12], total: [8, 16] }, orange: { lunes: [0, 0] } } } }],
    ['densité par défaut à 0,1', { densite: 0.1 }],
    ['retour aux défauts', { valeurs: null }],
  ];
  for (const [nom, corps] of reglagesDuGenerateur) {
    const res = await w.poser(corps);
    assert.equal(res.statusCode, 200, `${nom}: ${res.body}`);
    assert.deepEqual(w.lignesDefinies(), lignes0, `${nom}: les lignes`);
    const lus = await Promise.all(DEFINIS.map(([q, r]) => w.interieur(q, r)));
    assert.deepEqual(lus.map(sansJetons), lus0.map(sansJetons), `${nom}: l’intérieur lu`);
  }
});

test('B-90 exclusion : un changement du catalogue d’aspects change l’illustration des astres de son type, jamais une ligne ni une position', async () => {
  const w = await monde();
  const glace = (await w.reglages()).aspects.find((a: any) => a.type === 'glace');
  const palette = ['#112233', '#445566', '#778899', '#aabbcc', '#ddeeff', '#010203'].slice(0, glace.defaut.palette.length);
  assert.notDeepEqual(palette, glace.defaut.palette);
  const lignes0 = w.lignesDefinies();
  const etoiles0 = await w.etoiles();
  const avant = await Promise.all(TIRES.map(([q, r]) => w.interieur(q, r)));
  const corpsGlace = avant.flatMap((v) => v.astres.filter((a: any) => a.type === 'glace'));
  assert.ok(corpsGlace.length >= 5, 'la graine neutre offre des astres de glace, définis et tirés');
  assert.ok(avant.filter((v) => DEFINIS.some(([q, r]) => q === v.q && r === v.r)).some((v) => v.astres.some((a: any) => a.type === 'glace')),
    'un système défini porte un astre de glace');
  const v0 = w.versionGalaxie();

  const res = await w.posterAspect('glace', { palette });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(w.lignesDefinies(), lignes0, 'aucune ligne d’un système défini ne change');
  assert.deepEqual(await w.etoiles(), etoiles0, 'aucune étoile ne bouge');
  assert.equal(w.versionGalaxie(), v0, 'le tirage de la galaxie ne change pas de version');
  const apres = await Promise.all(TIRES.map(([q, r]) => w.interieur(q, r)));
  apres.forEach((v, i) => {
    assert.equal(v.etat, avant[i].etat);
    assert.deepEqual(v.astres.map((a: any) => [a.cle, a.type, a.orbite, a.heure, a.taille]), avant[i].astres.map((a: any) => [a.cle, a.type, a.orbite, a.heure, a.taille]));
    v.astres.forEach((a: any, j: number) => {
      if (a.type === 'glace') assert.deepEqual(a.aspect.palette, palette, `${a.cle}: la palette du type`);
      else assert.deepEqual(a.aspect, avant[i].astres[j].aspect, `${a.cle}: un autre type ne change pas`);
    });
  });
  // « Revenir au défaut » : l’intérieur relu est celui d’avant
  const retour = await w.posterAspect('glace', null);
  assert.equal(retour.statusCode, 200, retour.body);
  const relus = await Promise.all(TIRES.map(([q, r]) => w.interieur(q, r)));
  assert.deepEqual(relus.map(sansJetons), avant.map(sansJetons));
  assert.deepEqual(w.lignesSettings().aspects, 0, 'la surcharge est supprimée, le défaut vit dans le cœur');
});

test('B-90 : un réglage des seuls aspects ne déplace aucun système tiré — le décompte est zéro et aucune confirmation n’est exigée', async () => {
  const w = await monde();
  const apercu = await w.appeler('antor', 'POST', 'reglages/apercu', { aspects: { glace: { palette: ['#112233', '#445566', '#778899'] } } });
  assert.equal(apercu.statusCode, 200, apercu.body);
  assert.equal(apercu.json().tires_changent, 0);
  const res = await w.posterAspect('glace', { palette: ['#112233', '#445566', '#778899', '#aabbcc', '#ddeeff', '#010203'].slice(0, (await w.reglages()).aspects.find((a: any) => a.type === 'glace').defaut.palette.length) });
  assert.equal(res.statusCode, 200, res.body);
  const sansConfirmation = await w.poser({ valeurs: null }, false);
  assert.equal(sansConfirmation.statusCode, 200, 'revenir aux valeurs par défaut sans rien changer ne demande aucune confirmation');
});

test('B-90 échec : une fréquence de 2 est refusée au champ avec « Entre 0 et 1. » et rien n’est enregistré', async () => {
  const w = await monde();
  const avant = await w.reglages();
  const v0 = w.versionGalaxie();
  for (const [nom, valeur] of [['2', 2], ['juste au-delà, 1,01', 1.01], ['négative, −0,01', -0.01]] as const) {
    for (const f of ['comete', 'zone', 'nebuleuse']) {
      const res = await w.poser({ valeurs: { frequences: { [f]: valeur } } });
      assert.equal(res.statusCode, 400, `${f} = ${nom}: ${res.body}`);
      assert.equal(res.json().code, 'reglage_invalide');
      assert.equal(res.json().champ, `frequences.${f}`);
      assert.equal(res.json().message, 'Entre 0 et 1.');
    }
  }
  const apercu = await w.appeler('antor', 'POST', 'reglages/apercu', { valeurs: { frequences: { comete: 2 } } });
  assert.equal(apercu.statusCode, 400);
  assert.equal(apercu.json().message, 'Entre 0 et 1.');
  const texte = await w.poser({ valeurs: { frequences: { comete: 'beaucoup' } } });
  assert.equal(texte.statusCode, 400, 'une valeur qui n’est pas un nombre est refusée aussi');
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });
  assert.equal(w.versionGalaxie(), v0);
  assert.deepEqual(await w.reglages(), avant);
});

test('B-90 bords : 0 et 1 sont acceptés ; à 0 aucun système tiré ne montre de comète', async () => {
  const w = await monde();
  const zero = await w.poser({ valeurs: { frequences: { comete: 0 } } });
  assert.equal(zero.statusCode, 200, zero.body);
  assert.equal(zero.json().valeurs.frequences.comete, 0);
  for (const [q, r] of TIRES_RESTANTS) assert.equal(cometes(await w.interieur(q, r)), 0, `(${q}, ${r})`);
  const un = await w.poser({ valeurs: { frequences: { comete: 1 } } });
  assert.equal(un.statusCode, 200, un.body);
  assert.equal(un.json().valeurs.frequences.comete, 1);
});

test('B-90 bords : une borne de classe hors limite et un minimum au-dessus du maximum sont refusés, rien n’est enregistré', async () => {
  const w = await monde();
  const v0 = w.versionGalaxie();
  const hors = await w.poser({ valeurs: { par_classe: { jaune: { planetes: [0, 13] } } } });
  assert.equal(hors.statusCode, 400, hors.body);
  assert.equal(hors.json().code, 'reglage_invalide');
  assert.equal(hors.json().message, 'Entre 0 et 12.');
  const inverse = await w.poser({ valeurs: { par_classe: { jaune: { planetes: [6, 3] } } } });
  assert.equal(inverse.statusCode, 400, inverse.body);
  assert.equal(inverse.json().message, 'Le minimum dépasse le maximum.');
  const limite = await w.poser({ valeurs: { par_classe: { jaune: { planetes: [0, 12] } } } });
  assert.equal(limite.statusCode, 200, 'la borne elle-même est permise');
  assert.equal(w.versionGalaxie(), v0 + 1);
});

test('B-90 : la version du générateur est « 1 », seule connue ; le cœur refuse une version inconnue', async () => {
  const w = await monde();
  const lecture = await w.reglages();
  assert.equal(lecture.version_generateur, 1);
  assert.deepEqual(lecture.versions_connues, [1], 'aucune version supérieure : l’écran n’offre pas « Passer à la version N… »');
  const v0 = w.versionGalaxie();
  for (const inconnue of [2, 0, -1]) {
    const res = await w.poser({ version_generateur: inconnue });
    assert.equal(res.statusCode, 400, `version ${inconnue}: ${res.body}`);
    assert.equal(res.json().champ, 'version_generateur');
    assert.equal(res.json().message, 'Version inconnue.');
    const apercu = await w.appeler('antor', 'POST', 'reglages/apercu', { version_generateur: inconnue });
    assert.equal(apercu.statusCode, 400, `aperçu version ${inconnue}`);
  }
  assert.equal((await w.reglages()).version_generateur, 1);
  assert.equal(w.versionGalaxie(), v0);
  const meme = await w.poser({ version_generateur: 1 });
  assert.equal(meme.statusCode, 200, 'la version courante, redite, est acceptée');
  assert.equal(meme.json().version_generateur, 1);
});

test('B-90 exclusion : aucun réglage d’intérieur ne déplace une étoile — la densité par défaut, si, et jamais un système défini', async () => {
  const w = await monde();
  const etoiles0 = await w.etoiles();
  for (const [q, r] of TIRES_RESTANTS) assert.ok(etoiles0.includes(`${q},${r}`), `l’étoile (${q}, ${r}) des fixtures est tirée`);
  assert.ok(etoiles0.length > 500, `${etoiles0.length} étoiles tirées dans l’étendue`);
  for (const [nom, corps] of [
    ['comète à 1', COMETE_A_1],
    ['fréquences de zone et de nébuleuse à 1', { valeurs: { frequences: { zone: 1, nebuleuse: 1 } } }],
    ['bornes de toutes les classes', { valeurs: { par_classe: { naine_rouge: { planetes: [12, 12], total: [16, 16] }, geante_bleue: { ceintures: [2, 2] } } } }],
  ] as Array<[string, Record<string, unknown>]>) {
    assert.equal((await w.poser(corps)).statusCode, 200, nom);
    assert.deepEqual(await w.etoiles(), etoiles0, nom);
  }
  assert.equal((await w.posterAspect('naine_rouge', { palette: ['#010203', '#040506', '#070809'] })).statusCode, 200);
  assert.deepEqual(await w.etoiles(), etoiles0, 'aspects');

  const lignes0 = w.lignesDefinies();
  const definis0 = await Promise.all(DEFINIS.map(([q, r]) => w.interieur(q, r)));
  const res = await w.poser({ densite: 0.1 });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().densite_defaut, 0.1);
  const etoiles1 = await w.etoiles();
  assert.ok(etoiles1.length < etoiles0.length / 2, `la densité par défaut déplace les étoiles tirées (${etoiles0.length} → ${etoiles1.length})`);
  assert.deepEqual(w.lignesDefinies(), lignes0, 'jamais un système défini');
  assert.deepEqual((await Promise.all(DEFINIS.map(([q, r]) => w.interieur(q, r)))).map(sansJetons), definis0.map(sansJetons));
});

test('B-90 : le décompte annoncé est celui que l’on constate — chaque système tiré dont l’intérieur change est compté, aucun autre', async () => {
  const w = await monde();
  const tires = (await w.etoiles()).map((s) => s.split(',').map(Number) as [number, number]);
  const lire = async () => Promise.all(tires.map(async ([q, r]) => JSON.stringify((await w.interieur(q, r)).astres)));
  const avant = await lire();
  const apercu = (await w.appeler('antor', 'POST', 'reglages/apercu', COMETE_A_1)).json();
  assert.equal((await w.poser(COMETE_A_1)).statusCode, 200);
  const apres = await lire();
  const changes = avant.filter((a, i) => a !== apres[i]).length;
  assert.equal(apercu.tires_changent, changes);
  assert.equal(apercu.definis_inchangent, 2);
  // a setting that cannot move any interior counts zero
  const rien = (await w.appeler('antor', 'POST', 'reglages/apercu', COMETE_A_1)).json();
  assert.equal(rien.tires_changent, 0, 'réappliquer le même réglage ne déplace rien');
});

test('B-90 échec : un réglage lu sur une version périmée est refusé (a_change), rien n’est écrit — pour la galaxie et pour un type', async () => {
  const w = await monde();
  const lu = await w.reglages();
  assert.equal((await w.appeler('antor', 'PUT', 'reglages', { version: lu.version, confirme: true, ...COMETE_A_1 })).statusCode, 200);
  const perime = await w.appeler('antor', 'PUT', 'reglages', { version: lu.version, confirme: true, valeurs: { frequences: { zone: 0 } } });
  assert.equal(perime.statusCode, 409, perime.body);
  assert.equal(perime.json().code, 'a_change');
  assert.equal((await w.reglages()).valeurs.frequences.zone, 0.5);
  const aspect = lu.aspects.find((a: any) => a.type === 'glace');
  assert.equal((await w.appeler('antor', 'PUT', 'aspects/glace', { version: aspect.version, parametres: { palette: ['#112233', '#445566', '#778899'] } })).statusCode, 200);
  const aspectPerime = await w.appeler('antor', 'PUT', 'aspects/glace', { version: aspect.version, parametres: null });
  assert.equal(aspectPerime.statusCode, 409, aspectPerime.body);
  assert.equal(aspectPerime.json().code, 'a_change');
  assert.equal(w.lignesSettings().aspects, 1);
});

test('B-90 échec : une couleur qui n’est pas #rrggbb est refusée, rien n’est enregistré', async () => {
  const w = await monde();
  const avant = await w.reglages();
  const res = await w.posterAspect('glace', { palette: ['#12', '#445566', '#778899'] });
  assert.equal(res.statusCode, 400, res.body);
  assert.equal(res.json().code, 'reglage_invalide');
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });
  assert.deepEqual(await w.reglages(), avant);
});

test('B-90 exclusion : une joueuse n’a aucune des quatre routes — la réponse est celle d’une galaxie inconnue, octet pour octet, rien n’est écrit', async () => {
  const w = await monde();
  const lu = await w.reglages();
  const v0 = w.versionGalaxie();
  const essais: Array<['GET' | 'POST' | 'PUT', string, unknown]> = [
    ['GET', 'reglages', undefined],
    ['POST', 'reglages/apercu', COMETE_A_1],
    ['PUT', 'reglages', { version: lu.version, confirme: true, ...COMETE_A_1 }],
    ['PUT', 'aspects/glace', { version: 0, parametres: { palette: ['#112233', '#445566', '#778899'] } }],
  ];
  for (const [m, chemin, corps] of essais) {
    const inconnue = await w.appeler('lea', m, chemin, corps, 987654);
    const reelle = await w.appeler('lea', m, chemin, corps);
    assert.equal(reelle.statusCode, 404, `${m} ${chemin}`);
    assert.equal(reelle.statusCode, inconnue.statusCode);
    assert.equal(reelle.body, inconnue.body);
  }
  assert.equal(w.versionGalaxie(), v0);
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });
});

test('B-90 exclusion : le MJ en mode joueur lit les réglages mais ne peut rien écrire ni compter', async () => {
  const w = await monde();
  const lu = await w.reglages();
  const lecture = await w.appeler('antor', 'GET', 'reglages?mode=joueur');
  assert.equal(lecture.statusCode, 200, lecture.body);
  assert.deepEqual(lecture.json(), lu);
  for (const [m, chemin, corps] of [
    ['POST', 'reglages/apercu', COMETE_A_1],
    ['PUT', 'reglages', { version: lu.version, confirme: true, ...COMETE_A_1 }],
    ['PUT', 'aspects/glace', { version: 0, parametres: null }],
  ] as const) {
    const res = await w.appeler('antor', m, `${chemin}?mode=joueur`, corps);
    assert.equal(res.statusCode, 403, `${m} ${chemin}: ${res.body}`);
    assert.equal(res.json().code, 'mode_joueur');
  }
  assert.deepEqual(w.lignesSettings(), { reglages: 0, aspects: 0 });
});

test('B-90 exclusion : une joueuse lit l’illustration des astres sans jamais recevoir un réglage', async () => {
  const w = await monde();
  assert.equal((await w.posterAspect('glace', { palette: ['#112233', '#445566', '#778899'] })).statusCode, 200);
  assert.equal((await w.poser({ valeurs: { frequences: { comete: 1 } } })).statusCode, 200);
  const res = await w.appeler('lea', 'GET', 'interieur/-44/-47');
  assert.equal(res.statusCode, 200, res.body);
  const corps = res.body;
  for (const interdit of ['"surcharge"', '"valeurs"', 'versions_connues', 'frequences', 'par_classe']) assert.equal(corps.includes(interdit), false, interdit);
});
