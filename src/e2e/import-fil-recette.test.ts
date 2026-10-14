// Independent acceptance tests of kanevas-import-fil, written from the need only (docs/parcours.md
// B-45..B-50, P-10, P-11; docs/ecrans.md E-18, E-9 « Importée »; the criterion of the feature sheet).
// Every expected value is a literal taken from those documents. The product runs for real in stub mode
// (AD-55): real app, real SQLite, real Chromium; the only thing moved is the clock the tests may move
// (`app.horloge`, CLAUDE.md « Import API »).
//
// PLAN DE TEST (besoin -> famille -> cas)
//  B-45 nominal   E-18: Antor creates « Script Kanka — Mac » (30 j); shown once; row says « jamais »; value gone from
//                 screen and from the list API; the token opens GET /api/import/v1/univers/<id>.
//  B-45 bords     name empty -> « Erreur : le nom est obligatoire. »; name of 81 chars refused; duration 366 j refused;
//                 duration 1 an accepted.
//  B-45 exclusions Léa (Joueuse): E-18 « Page introuvable. », no sidebar item, no token created through the API;
//                 the token does not open a session route; the session cookie alone does not open the import API.
//  B-46 échec     revoked / expired (7 j + 1 s; 6 j 23 h still valid) / unknown / malformed header / MJ turned Joueuse
//                 -> 401 « Jeton invalide. », same body, no batch opened; another universe -> 404.
//  B-46 E-18      « Révoquer » dialog and toast, row « Révoqué »; Mira row « Inactif » once Joueuse.
//  B-47 nominal   PUT lieu:port-sel -> creee; replay -> inchangee; one single fiche; six types accepted; changed title -> mise_a_jour.
//  B-47 échec     compte_rendu and unknown type -> 400 champ type, nothing written.
//  B-48           section title / section content / section audience / fiche title changed in Kanevas then replay ->
//                 not overwritten, batch warns; the rest of the payload is written.
//  B-49           E-18 batches: « Fiches : 1 créée », « Fiches : 1 inchangée », refusals and warnings unfold with key and reason;
//                 empty states; a refused PUT without batch leaves no trace.
//  B-50           creeLe kept; E-9 menu « ⋯ » « Importée · clé lieu:port-sel · créée le 3 mars 2021 » for the MJ only;
//                 no menu for a fiche without key; the key is not in Léa's read.
//  P-10 / critère Léa reads « Description » and nothing of « Vérité » (page, API, search).
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = join(process.cwd(), 'dist/public');
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { attendre, launch, rx, skipBrowser, texte } = await import('./harnais.test.js');
type App = Awaited<ReturnType<typeof buildApp>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
const UNIQUE = { message: 'Jeton invalide.', code: 'jeton_invalide' };

const PORT_SEL = {
  type: 'lieu',
  titre: 'Port-Sel',
  creeLe: '2021-03-03T10:00:00.000Z',
  sections: [
    { cle: 'description', titre: 'Description', contenu: 'Un port brumeux aux quais de sel.', joueursLisent: true, joueursEcrivent: false },
    { cle: 'verite', titre: 'Vérité', contenu: 'La Guilde des Brumes tient le port.', joueursLisent: false, joueursEcrivent: false },
  ],
};

interface Monde {
  app: App;
  base: string;
  essai: number;
  cookie: (compte: string) => Promise<{ cookie: string }>;
  api: (m: string, chemin: string, jeton: string | null, corps?: unknown) => Promise<{ status: number; json: Any }>;
  session: (compte: string, m: string, url: string, corps?: unknown) => Promise<{ status: number; json: Any }>;
  idCompte: (nom: string) => number;
  stop: () => Promise<void>;
}

async function monter(): Promise<Monde> {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const cookies = new Map<string, string>();
  const cookie = async (compte: string) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      const c = res.cookies.find((x) => x.name === 'kanevas_session');
      assert.ok(c, `no session for ${compte}`);
      cookies.set(compte, `kanevas_session=${c.value}`);
    }
    return { cookie: cookies.get(compte)! };
  };
  const rendre = (r: { statusCode: number; body: string }) => ({
    status: r.statusCode,
    json: r.body ? (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() : null,
  });
  const api = async (m: string, chemin: string, jeton: string | null, corps?: unknown) =>
    rendre(
      await app.inject({
        method: m as 'GET',
        url: `/api/import/v1/univers/${chemin}`,
        headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
        ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }),
      }),
    );
  const session = async (compte: string, m: string, url: string, corps?: unknown) =>
    rendre(
      await app.inject({
        method: m as 'GET',
        url,
        headers: await cookie(compte),
        ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }),
      }),
    );
  const idCompte = (nom: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(nom) as { id: number }).id;
  return { app, base, essai, cookie, api, session, idCompte, stop: () => app.close() };
}

/** Creates a token through the session route (as the screen does) and returns its value. */
async function jetonDe(m: Monde, compte: string, nom = 'Script Kanka — Mac', dureeJours = 30, univers = m.essai): Promise<string> {
  const r = await m.session(compte, 'POST', `/api/univers/${univers}/jetons`, { nom, dureeJours });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.valeur as string;
}

async function lot(m: Monde, jeton: string): Promise<number> {
  const r = await m.api('POST', `${m.essai}/lots`, jeton);
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.json));
  return r.json.lotId as number;
}

const cle = (k: string) => encodeURIComponent(k);
const put = (m: Monde, jeton: string, k: string, corps: unknown, lotId?: number) =>
  m.api('PUT', `${m.essai}/fiches/${cle(k)}${lotId === undefined ? '' : `?lot=${lotId}`}`, jeton, corps);

/** Pushes `corps` as a batch of its own, closes it, returns the PUT answer and the closed report. */
async function pousserEnLot(m: Monde, jeton: string, k: string, corps: unknown) {
  const id = await lot(m, jeton);
  const r = await put(m, jeton, k, corps, id);
  const c = await m.api('POST', `${m.essai}/lots/${id}/clore`, jeton);
  assert.equal(c.status, 200, JSON.stringify(c.json));
  return { r, rapport: c.json, id };
}

const lots = async (m: Monde, compte = 'antor', univers = m.essai) => {
  const r = await m.session(compte, 'GET', `/api/univers/${univers}/lots`);
  assert.equal(r.status, 200);
  return (Array.isArray(r.json) ? r.json : (r.json.lots ?? [])) as Any[];
};
const nbLots = async (m: Monde) => (await lots(m)).length;

const fichesDe = async (m: Monde, compte: string, q = '') => {
  const r = await m.session(compte, 'GET', `/api/univers/${m.essai}/fiches${q}`);
  assert.equal(r.status, 200);
  return r.json.fiches as Any[];
};

describe('B-45 jeton : création, usage, exclusions', () => {
  let m: Monde;
  before(async () => { m = await monter(); });
  after(async () => { await m.stop(); });

  test('jeton créé par un MJ : forme kvs_, ouvre GET /, 200 avec l’univers et le compte', async () => {
    const v = await jetonDe(m, 'antor');
    assert.match(v, /^kvs_/);
    const r = await m.api('GET', `${m.essai}`, v);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.univers, { id: m.essai, nom: 'Essai Kanka' });
    assert.equal(r.json.compte.username, 'antor');
  });

  test('la liste des jetons ne rend jamais la valeur, ni avant ni après', async () => {
    const v = await jetonDe(m, 'antor', 'Un autre', 30);
    const liste = await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`);
    assert.equal(liste.status, 200);
    assert.ok(!JSON.stringify(liste.json).includes(v), 'token value leaked in the list');
    const lignes = (Array.isArray(liste.json) ? liste.json : liste.json.jetons) as Any[];
    assert.ok(lignes.some((j) => j.nom === 'Un autre'));
  });

  test('bords : nom vide, nom de 81 caractères, durée de 366 jours sont refusés ; 1 an accepté', async () => {
    const url = `/api/univers/${m.essai}/jetons`;
    assert.equal((await m.session('antor', 'POST', url, { nom: '', dureeJours: 30 })).status, 400);
    assert.equal((await m.session('antor', 'POST', url, { nom: 'x'.repeat(81), dureeJours: 30 })).status, 400);
    assert.equal((await m.session('antor', 'POST', url, { nom: 'x'.repeat(80), dureeJours: 30 })).status, 201);
    assert.equal((await m.session('antor', 'POST', url, { nom: 'Trop long', dureeJours: 366 })).status, 400);
    assert.equal((await m.session('antor', 'POST', url, { nom: 'Un an', dureeJours: 365 })).status, 201);
  });

  test('exclusion : Léa, Joueuse, ne crée ni ne liste de jeton, ne voit pas les lots', async () => {
    const url = `/api/univers/${m.essai}/jetons`;
    const cree = await m.session('lea', 'POST', url, { nom: 'Pirate', dureeJours: 30 });
    assert.ok(cree.status >= 400 && cree.status < 500, `status ${cree.status}`);
    assert.equal((await m.session('lea', 'GET', url)).status, 404);
    assert.equal((await m.session('lea', 'GET', `/api/univers/${m.essai}/lots`)).status, 404);
    const apres = await m.session('antor', 'GET', url);
    assert.ok(!JSON.stringify(apres.json).includes('Pirate'));
  });

  test('exclusion : le jeton n’ouvre aucune route de session, le cookie seul n’ouvre pas l’API d’import', async () => {
    const v = await jetonDe(m, 'antor');
    const surSession = await m.app.inject({
      method: 'GET',
      url: `/api/univers/${m.essai}/fiches`,
      headers: { authorization: `Bearer ${v}` },
    });
    assert.ok(surSession.statusCode === 401 || surSession.statusCode === 302 || surSession.statusCode === 403, `status ${surSession.statusCode}`);
    const cookieSeul = await m.app.inject({
      method: 'GET',
      url: `/api/import/v1/univers/${m.essai}`,
      headers: await m.cookie('antor'),
    });
    assert.equal(cookieSeul.statusCode, 401);
    assert.deepEqual(cookieSeul.json(), UNIQUE);
  });
});

describe('B-46 refus du jeton : 401 au corps unique, aucun lot ouvert', () => {
  let m: Monde;
  before(async () => { m = await monter(); });
  after(async () => { await m.stop(); });

  test('inconnu, en-tête mal formé, absent : 401 {message, code} identiques et aucun lot', async () => {
    const avant = await nbLots(m);
    for (const j of ['kvs_inconnu', 'nimporte']) {
      const r = await m.api('POST', `${m.essai}/lots`, j);
      assert.equal(r.status, 401);
      assert.deepEqual(r.json, UNIQUE);
    }
    const sans = await m.api('POST', `${m.essai}/lots`, null);
    assert.equal(sans.status, 401);
    assert.deepEqual(sans.json, UNIQUE);
    const basic = await m.app.inject({ method: 'POST', url: `/api/import/v1/univers/${m.essai}/lots`, headers: { authorization: `Basic ${JETON_BOUCHON}` } });
    assert.equal(basic.statusCode, 401);
    assert.equal(await nbLots(m), avant);
  });

  test('expiré : 7 jours + 1 s -> 401 ; 6 jours 23 h -> toujours 200 ; aucun lot ouvert par le refus', async () => {
    const t0 = Date.now();
    const v = await jetonDe(m, 'antor', 'Sept jours', 7);
    m.app.horloge = () => new Date(t0 + 6 * 86400_000 + 23 * 3600_000);
    assert.equal((await m.api('GET', `${m.essai}`, v)).status, 200);
    m.app.horloge = () => new Date(t0 + 7 * 86400_000 + 5_000);
    const avant = await nbLots(m);
    const r = await m.api('POST', `${m.essai}/lots`, v);
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, UNIQUE);
    assert.equal(await nbLots(m), avant);
    m.app.horloge = () => new Date();
  });

  test('révoqué : l’appel suivant reçoit 401 et aucun lot n’est ouvert', async () => {
    const v = await jetonDe(m, 'antor', 'À révoquer');
    assert.equal((await m.api('GET', `${m.essai}`, v)).status, 200);
    const liste = await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`);
    const ligne = ((Array.isArray(liste.json) ? liste.json : liste.json.jetons) as Any[]).find((j) => j.nom === 'À révoquer');
    assert.ok(ligne);
    assert.equal((await m.session('antor', 'POST', `/api/univers/${m.essai}/jetons/${ligne.id}/revoquer`)).status, 204);
    const avant = await nbLots(m);
    const r = await m.api('POST', `${m.essai}/lots`, v);
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, UNIQUE);
    assert.equal(await nbLots(m), avant);
  });

  test('MJ qui perd son rôle : le jeton de Mira agit tant qu’elle est MJ, reçoit 401 une fois Joueuse', async () => {
    const add = await m.session('antor', 'POST', `/api/univers/${m.essai}/membres`, { username: 'mira', role: 'mj' });
    assert.equal(add.status, 201, JSON.stringify(add.json));
    const v = await jetonDe(m, 'mira', 'Jeton de Mira');
    assert.equal((await m.api('GET', `${m.essai}`, v)).status, 200);
    const ch = await m.session('antor', 'PATCH', `/api/univers/${m.essai}/membres/${m.idCompte('mira')}`, { role: 'joueur' });
    assert.equal(ch.status, 200, JSON.stringify(ch.json));
    const avant = await nbLots(m);
    const r = await m.api('POST', `${m.essai}/lots`, v);
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, UNIQUE);
    assert.equal(await nbLots(m), avant);
    // Her token stays in the list for the GMs, flagged as inactive.
    const liste = await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`);
    assert.ok(JSON.stringify(liste.json).includes('Jeton de Mira'));
  });

  test('exclusion : un jeton ne passe pas dans un autre univers (404)', async () => {
    const v = await jetonDe(m, 'antor');
    const autre = (m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Les Cendres de Vaëlis'").get() as { id: number }).id;
    const r = await m.app.inject({ method: 'GET', url: `/api/import/v1/univers/${autre}`, headers: { authorization: `Bearer ${v}` } });
    assert.equal(r.statusCode, 404);
    const put_ = await m.app.inject({ method: 'PUT', url: `/api/import/v1/univers/${autre}/fiches/lieu%3Apx`, headers: { authorization: `Bearer ${v}` }, payload: PORT_SEL });
    assert.equal(put_.statusCode, 404);
    assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM fiches WHERE univers_id = ? AND cle_origine IS NOT NULL').get(autre) as { n: number }).n, 0);
  });
});

describe('B-47 / P-10 une fiche par clé d’origine, sans doublon', () => {
  let m: Monde;
  let jeton: string;
  before(async () => { m = await monter(); jeton = JETON_BOUCHON; });
  after(async () => { await m.stop(); });

  test('critère : créée, rejouée inchangée, une seule fiche ; rapports 1 créée puis 0 créée / 1 inchangée', async () => {
    const un = await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    assert.equal(un.r.status, 200);
    assert.equal(un.r.json.etat, 'creee');
    assert.equal(un.rapport.compteurs.fiches.creees, 1);
    assert.equal(un.rapport.compteurs.fiches.inchangees, 0);
    const deux = await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    assert.equal(deux.r.json.etat, 'inchangee');
    assert.equal(deux.r.json.id, un.r.json.id);
    assert.equal(deux.rapport.compteurs.fiches.creees, 0);
    assert.equal(deux.rapport.compteurs.fiches.inchangees, 1);
    assert.notEqual(deux.id, un.id);
    const fiches = await fichesDe(m, 'antor');
    assert.equal(fiches.filter((f) => f.titre === 'Port-Sel').length, 1);
  });

  test('« inchangée » ne touche ni la version ni la date de modification de la section', async () => {
    const f = (await fichesDe(m, 'antor')).find((x) => x.titre === 'Port-Sel')!;
    const avant = (await m.session('antor', 'GET', `/api/univers/${m.essai}/fiches/${f.id}`)).json;
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    const apres = (await m.session('antor', 'GET', `/api/univers/${m.essai}/fiches/${f.id}`)).json;
    assert.deepEqual(apres.sections.map((s: Any) => [s.version, s.modifieLe]), avant.sections.map((s: Any) => [s.version, s.modifieLe]));
    assert.equal(apres.modifieLe, avant.modifieLe);
  });

  test('un titre changé dans le script (rien modifié dans Kanevas) : mise_a_jour, sans doublon', async () => {
    const r = await put(m, jeton, 'lieu:port-sel', { ...PORT_SEL, titre: 'Port-Sel-les-Docks' });
    assert.equal(r.json.etat, 'mise_a_jour');
    const fiches = await fichesDe(m, 'antor');
    assert.equal(fiches.filter((f) => /^Port-Sel/.test(f.titre)).length, 1);
    assert.equal(fiches.find((f) => /^Port-Sel/.test(f.titre))!.titre, 'Port-Sel-les-Docks');
  });

  test('les six types de la liste sont acceptés, une clé chacun', async () => {
    for (const type of ['personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete']) {
      const r = await put(m, jeton, `${type}:essai`, { type, titre: `Fiche ${type}`, sections: [] });
      assert.equal(r.status, 200, `${type}: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.etat, 'creee');
    }
  });

  test('échec : compte_rendu (champ type), type inconnu, type absent : 400 et rien d’écrit', async () => {
    const avant = (await fichesDe(m, 'antor')).length;
    const cr = await put(m, jeton, 'cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', sections: [] });
    assert.equal(cr.status, 400);
    assert.equal(cr.json.champ, 'type');
    assert.equal(cr.json.code, 'invalide');
    const monstre = await put(m, jeton, 'monstre:x', { type: 'monstre', titre: 'Gobelin', sections: [] });
    assert.equal(monstre.status, 400);
    assert.equal(monstre.json.champ, 'type');
    assert.equal((await fichesDe(m, 'antor')).length, avant);
    assert.equal(await fichesDe(m, 'antor').then((fs) => fs.some((f) => f.titre === 'Séance 1' || f.titre === 'Gobelin')), false);
  });

  test('échec : titre vide et clé de 201 caractères refusés (400), rien d’écrit', async () => {
    const avant = (await fichesDe(m, 'antor')).length;
    const vide = await put(m, jeton, 'lieu:vide', { type: 'lieu', titre: '', sections: [] });
    assert.equal(vide.status, 400);
    const longue = await put(m, jeton, 'l'.repeat(201), { type: 'lieu', titre: 'Longue', sections: [] });
    assert.equal(longue.status, 400);
    const bonne = await put(m, jeton, 'l'.repeat(200), { type: 'lieu', titre: 'Longue 200', sections: [] });
    assert.equal(bonne.status, 200);
    assert.equal((await fichesDe(m, 'antor')).length, avant + 1);
  });

  test('bord : fiche sans section, puis rejouée : une fiche, inchangée', async () => {
    const a = await put(m, jeton, 'objet:vide', { type: 'objet', titre: 'Objet vide', sections: [] });
    const b = await put(m, jeton, 'objet:vide', { type: 'objet', titre: 'Objet vide', sections: [] });
    assert.equal(a.json.etat, 'creee');
    assert.equal(b.json.etat, 'inchangee');
  });
});

describe('P-10 critère : Léa lit « Description » et rien de « Vérité »', () => {
  let m: Monde;
  before(async () => { m = await monter(); await pousserEnLot(m, JETON_BOUCHON, 'lieu:port-sel', PORT_SEL); });
  after(async () => { await m.stop(); });

  test('API : Léa reçoit la section Description, pas Vérité, et le texte secret n’apparaît nulle part', async () => {
    const f = (await fichesDe(m, 'lea')).find((x) => x.titre === 'Port-Sel')!;
    const r = await m.session('lea', 'GET', `/api/univers/${m.essai}/fiches/${f.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.sections.map((s: Any) => s.titre), ['Description']);
    // AD-113: a reader gets the rendered `html`, never the Markdown source (`contenu`).
    assert.equal(r.json.sections[0].contenu, undefined);
    assert.match(r.json.sections[0].html, /Un port brumeux aux quais de sel\./);
    assert.ok(!JSON.stringify(r.json).includes('Guilde'), 'secret leaked');
    assert.ok(!JSON.stringify(r.json).includes('cle_origine') && !JSON.stringify(r.json).includes('lieu:port-sel'), 'origin key leaked to a player');
  });

  test('exclusion : la recherche de Léa ne trouve pas un mot présent seulement dans Vérité', async () => {
    assert.equal((await fichesDe(m, 'lea', '?q=Guilde')).length, 0);
    assert.equal((await fichesDe(m, 'lea', '?q=quais')).length, 1);
  });

  test('Chromium : Léa ouvre la fiche, lit Description, ne voit rien de Vérité ; capture', { skip: skipBrowser }, async () => {
    const browser = await launch();
    try {
      const ctx = await browser.newContext({ baseURL: m.base });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
      await attendre(page);
      const f = (await fichesDe(m, 'lea')).find((x) => x.titre === 'Port-Sel')!;
      await page.goto(`/univers/${m.essai}/fiche/${f.id}`);
      await page.getByRole('heading', { name: 'Port-Sel' }).first().waitFor();
      await attendre(page);
      const t = await texte(page);
      assert.match(t, /Description/);
      assert.match(t, /Un port brumeux aux quais de sel\./);
      assert.doesNotMatch(t, /Vérité/);
      assert.doesNotMatch(t, /Guilde des Brumes/);
      assert.doesNotMatch(t, /Importée/);
      await page.screenshot({ path: join(SHOTS, 'lea-port-sel.png'), fullPage: true });
      await ctx.close();
    } finally {
      await browser.close();
    }
  });
});

describe('B-48 le rejeu n’écrase pas ce qui a été modifié dans Kanevas', () => {
  let m: Monde;
  let jeton: string;
  let fid: number;
  const sectionsDe = async (compte = 'antor') =>
    ((await m.session(compte, 'GET', `/api/univers/${m.essai}/fiches/${fid}`)).json.sections as Any[]);
  before(async () => {
    m = await monter();
    jeton = JETON_BOUCHON;
    const { r } = await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    fid = r.json.id;
  });
  after(async () => { await m.stop(); });

  test('titre de section changé par Antor : le rejeu le laisse, le lot le dit, la fiche est « inchangée »', async () => {
    const desc = (await sectionsDe()).find((s) => s.titre === 'Description')!;
    const p = await m.session('antor', 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc.id}`, { titre: 'Aperçu' });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    const { r, rapport } = await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    assert.equal(r.status, 200);
    assert.ok((await sectionsDe()).some((s) => s.titre === 'Aperçu'), 'human title overwritten');
    assert.ok(!(await sectionsDe()).some((s) => s.titre === 'Description'), 'import brought the old title back');
    assert.equal(rapport.avertissements, 1);
    assert.ok(JSON.stringify(rapport.rapport).includes('lieu:port-sel'));
    assert.ok(JSON.stringify(rapport.rapport).includes('section « Aperçu » : titre modifié dans Kanevas : non écrasé'));
    assert.equal(rapport.compteurs.fiches.creees, 0);
  });

  test('contenu de section modifié par Antor : non écrasé, avertissement', async () => {
    const vue = (await sectionsDe()).find((s) => s.titre === 'Aperçu')!;
    const w = await m.session('antor', 'PUT', `/api/univers/${m.essai}/fiches/${fid}/sections/${vue.id}/contenu`, { contenu: 'Texte réécrit par le MJ.', version: vue.version });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    const { rapport } = await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    assert.equal((await sectionsDe()).find((s) => s.id === vue.id)!.contenu, 'Texte réécrit par le MJ.');
    assert.ok(rapport.avertissements >= 1);
  });

  test('audience modifiée par Antor : non écrasée (Léa lit toujours ce que le MJ a décidé)', async () => {
    const verite = ((await sectionsDe()).find((s) => s.titre === 'Vérité'))!;
    const p = await m.session('antor', 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${verite.id}`, { joueursLisent: true });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    assert.ok((await sectionsDe('lea')).some((s) => s.titre === 'Vérité'), 'import re-closed an audience a human opened');
    // and back: closed again by the human, replay does not open it
    await m.session('antor', 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${verite.id}`, { joueursLisent: false });
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    assert.ok(!(await sectionsDe('lea')).some((s) => s.titre === 'Vérité'));
  });

  test('titre de la fiche changé en base : non écrasé au rejeu, le lot le dit', async () => {
    m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Port-Sel-sur-Brume', fid);
    const { rapport } = await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    const f = (await fichesDe(m, 'antor')).find((x) => x.id === fid)!;
    assert.equal(f.titre, 'Port-Sel-sur-Brume');
    assert.ok(rapport.avertissements >= 1);
    assert.ok(JSON.stringify(rapport.rapport).includes('titre'));
  });

  test('« écrit le reste » : une section modifiée est laissée, une autre section changée par le script est écrite', async () => {
    const verite = (await sectionsDe()).find((s) => s.titre === 'Vérité')!;
    const corps = {
      ...PORT_SEL,
      sections: [
        PORT_SEL.sections[0],
        { ...PORT_SEL.sections[1], contenu: 'Nouvelle vérité du script.' },
      ],
    };
    const { r } = await pousserEnLot(m, jeton, 'lieu:port-sel', corps);
    assert.equal(r.json.etat, 'mise_a_jour');
    assert.equal((await sectionsDe()).find((s) => s.id === verite.id)!.contenu, 'Nouvelle vérité du script.');
    assert.equal((await sectionsDe()).find((s) => s.titre === 'Aperçu')!.contenu, 'Texte réécrit par le MJ.');
    assert.equal((await fichesDe(m, 'antor')).find((x) => x.id === fid)!.titre, 'Port-Sel-sur-Brume');
  });
});

describe('B-50 clé et date d’origine', () => {
  let m: Monde;
  let fid: number;
  before(async () => {
    m = await monter();
    const { r } = await pousserEnLot(m, JETON_BOUCHON, 'lieu:port-sel', PORT_SEL);
    fid = r.json.id;
  });
  after(async () => { await m.stop(); });

  test('creeLe est la date de création de la fiche', async () => {
    const f = (await fichesDe(m, 'antor')).find((x) => x.id === fid)!;
    assert.equal(f.creeLe, '2021-03-03T10:00:00.000Z');
  });

  test('sans creeLe, la date de création est celle de l’import (pas 1970)', async () => {
    const r = await put(m, JETON_BOUCHON, 'objet:sans-date', { type: 'objet', titre: 'Sans date', sections: [] });
    const f = (await fichesDe(m, 'antor')).find((x) => x.id === r.json.id)!;
    assert.ok(new Date(f.creeLe).getFullYear() >= 2026);
  });

  test('creeLe invalide : 400 et rien d’écrit', async () => {
    const avant = (await fichesDe(m, 'antor')).length;
    const r = await put(m, JETON_BOUCHON, 'objet:date-folle', { type: 'objet', titre: 'Date folle', creeLe: 'hier soir', sections: [] });
    assert.equal(r.status, 400);
    assert.equal((await fichesDe(m, 'antor')).length, avant);
  });

  test('Chromium : le MJ lit « Importée · clé lieu:port-sel · créée le 3 mars 2021 » dans le menu ⋯ ; capture', { skip: skipBrowser }, async () => {
    const browser = await launch();
    try {
      const ctx = await browser.newContext({ baseURL: m.base });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
      await attendre(page);
      await page.goto(`/univers/${m.essai}/fiche/${fid}`);
      await page.getByRole('heading', { name: 'Port-Sel' }).first().waitFor();
      await attendre(page);
      await page.getByRole('button', { name: /Autres actions/ }).first().click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      const t = ((await menu.innerText()) as string).replace(/\s+/g, ' ').trim();
      // kanevas-types-ecran-fiche adds « Changer le type… », kanevas-recherche-e9 « Alias et étiquettes… »; the origin line stays.
      assert.equal(t, 'Changer le type… Alias et étiquettes… Importée · clé lieu:port-sel · créée le 3 mars 2021');
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS, 'antor-menu-importee.png') });
      // a fiche without origin key: no « ⋯ » menu at all (this slice)
      await ctx.close();
    } finally {
      await browser.close();
    }
  });

  test('Chromium : une fiche sans clé d’origine n’a pas de menu ⋯ ; Léa n’en a pas non plus', { skip: skipBrowser }, async () => {
    const lameId = (m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
    const sansCle = (await m.session('antor', 'GET', `/api/univers/${lameId}/fiches`)).json.fiches[0];
    const browser = await launch();
    try {
      for (const [compte, univers, id, titre] of [
        ['antor', lameId, sansCle.id, sansCle.titre],
        ['lea', m.essai, fid, 'Port-Sel'],
      ] as const) {
        const ctx = await browser.newContext({ baseURL: m.base });
        const page = await ctx.newPage();
        page.setDefaultTimeout(30000);
        await page.goto('/connexion-bouchon');
        await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte === 'lea' ? 'Léa' : 'Antor'}$`) }).click();
        await attendre(page);
        await page.goto(`/univers/${univers}/fiche/${id}`);
        await page.getByRole('heading', { name: rx(titre) }).first().waitFor();
        await attendre(page);
        const menus = page.getByRole('button', { name: /Autres actions sur la fiche|Autres actions de la fiche/ });
        assert.equal(await menus.count(), 0, `${compte}: unexpected ⋯ menu on the fiche header`);
        assert.doesNotMatch(await texte(page), /Importée|lieu:port-sel/);
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// E-18 « Accès par API » through the browser (B-45, B-46, B-49; P-11; P-10 steps 3, 5, 7, 10).
// ---------------------------------------------------------------------------------------------
const NOMS: Record<string, string> = { antor: 'Antor', lea: 'Léa', mira: 'Mira' };

async function ouvrirSession(browser: Any, m: Monde, compte: string) {
  const ctx = await browser.newContext({ baseURL: m.base, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${NOMS[compte]}$`) }).click();
  await attendre(page);
  return { ctx, page };
}

async function ouvrirE18(page: Any, m: Monde, univers = m.essai) {
  await page.goto(`/univers/${univers}/acces-api`);
  await page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
  await attendre(page);
}

const ligne = (page: Any, texte_: string | RegExp) => page.getByRole('listitem').filter({ hasText: texte_ });

describe('E-18 Accès par API au navigateur', { skip: skipBrowser }, () => {
  let m: Monde;
  let browser: Any;
  before(async () => {
    m = await monter();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await m.stop();
  });

  test('P-11 / critère : Antor crée « Script Kanka — Mac », le jeton ne s’affiche qu’une fois, la ligne dit « jamais » et l’expiration', async () => {
    m.app.horloge = () => new Date('2026-10-11T12:00:00.000Z');
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    const t0 = await texte(page);
    assert.match(t0, /Un jeton permet à un script d'écrire dans cet univers avec vos droits, par l'API d'import\./);
    assert.match(t0, new RegExp(`/api/import/v1/univers/${m.essai}`));
    await page.getByRole('button', { name: 'Nouveau jeton' }).click();
    const boite = page.getByRole('dialog', { name: 'Nouveau jeton' });
    await boite.waitFor();
    await boite.getByLabel('Nom', { exact: true }).fill('Script Kanka — Mac');
    await boite.getByRole('button', { name: 'Créer le jeton' }).click();
    await boite.getByText('Il ne sera plus jamais affiché.').waitFor();
    const dedans = ((await boite.innerText()) as string) + ' ' + (await boite.locator('input, textarea').evaluateAll((els: Any[]) => els.map((e) => e.value).join(' ')));
    const valeur = /kvs_[A-Za-z0-9_-]+/.exec(dedans)?.[0];
    assert.ok(valeur, 'the token must be shown in the box');
    assert.ok(valeur.length >= 40, `token too short: ${valeur.length}`);
    await page.screenshot({ path: join(SHOTS, 'e18-jeton-montre.png') });
    // while the token is shown, Escape does not close the box
    await page.keyboard.press('Escape');
    assert.equal(await boite.isVisible(), true, 'Escape closed the box that shows the token');
    await boite.getByRole('button', { name: rx("J'ai copié le jeton") }).click();
    await boite.waitFor({ state: 'detached' });
    await attendre(page);
    const l = ligne(page, 'Script Kanka — Mac');
    await l.first().waitFor();
    const txt = ((await l.first().innerText()) as string).replace(/\s+/g, ' ');
    assert.match(txt, /créé par antor le 11 oct\. 2026/);
    assert.match(txt, /jamais/);
    assert.match(txt, /expire le 10 nov\. 2026/);
    assert.ok(!(await texte(page)).includes(valeur), 'token still on screen after closing');
    await page.reload();
    await attendre(page);
    assert.ok(!(await texte(page)).includes(valeur), 'token on screen after reload');
    await page.screenshot({ path: join(SHOTS, 'e18-liste-jetons.png') });

    // The token works, once, with the script's call; the value is nowhere in the lists of the API.
    const r = await m.api('GET', `${m.essai}`, valeur);
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify((await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`)).json).includes(valeur));

    // P-10 step 4-5 and the criterion: Port-Sel pushed, replayed; E-18 shows two batches.
    const un = await pousserEnLot(m, valeur, 'lieu:port-sel', PORT_SEL);
    assert.equal(un.r.json.etat, 'creee');
    const deux = await pousserEnLot(m, valeur, 'lieu:port-sel', PORT_SEL);
    assert.equal(deux.r.json.etat, 'inchangee');
    await page.reload();
    await attendre(page);
    await page.getByText('Fiches : 1 inchangée').first().waitFor();
    const t1 = await texte(page);
    assert.match(t1, /Fiches : 1 créée/);
    assert.match(t1, /Fiches : 1 inchangée/);
    assert.ok(!/Fiches : 0 créée/.test(t1), 'a null count must be omitted');
    assert.match(t1, /Clos/);
    // « dernier usage » is no longer « jamais » once the token worked (the clock is fixed, so « il y a 0 min » or similar).
    const apres = ((await ligne(page, 'Script Kanka — Mac').first().innerText()) as string).replace(/\s+/g, ' ');
    assert.doesNotMatch(apres, /dernier usage jamais/);
    await page.screenshot({ path: join(SHOTS, 'e18-lots.png'), fullPage: true });
    await ctx.close();
  });

  test('B-49 : un refus et des avertissements se déplient avec la clé d’origine et la raison', async () => {
    const jeton = JETON_BOUCHON;
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    const id = await lot(m, jeton);
    const cr = await put(m, jeton, 'cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', sections: [] }, id);
    assert.equal(cr.status, 400);
    const monstre = await put(m, jeton, 'monstre:gob', { type: 'monstre', titre: 'Gobelin', sections: [] }, id);
    assert.equal(monstre.status, 400);
    assert.equal((await m.api('POST', `${m.essai}/lots/${id}/clore`, jeton)).status, 200);
    // warnings: human title of the section and of the fiche, then replay
    const f = (await fichesDe(m, 'antor')).find((x) => x.titre === 'Port-Sel')!;
    const sec = ((await m.session('antor', 'GET', `/api/univers/${m.essai}/fiches/${f.id}`)).json.sections as Any[]).find((s) => s.titre === 'Description')!;
    await m.session('antor', 'PATCH', `/api/univers/${m.essai}/fiches/${f.id}/sections/${sec.id}`, { titre: 'Aperçu' });
    m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Port-Sel-sur-Brume', f.id);
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);

    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    const refus = page.getByRole('listitem').filter({ hasText: 'Fiches : 2 refusées' });
    await refus.first().waitFor();
    await refus.first().getByRole('button').first().click();
    await attendre(page);
    const t = await texte(page);
    assert.match(t, /2 refusées/);
    assert.match(t, /cr:seance-1/);
    assert.match(t, /type « compte_rendu » : pas accepté par cette version/);
    assert.match(t, /monstre:gob/);
    assert.match(t, /type « monstre » inconnu de Kanevas/);
    await page.screenshot({ path: join(SHOTS, 'e18-refus.png'), fullPage: true });

    const avert = page.getByRole('listitem').filter({ hasText: '2 avertissements' });
    await avert.first().waitFor();
    await avert.first().getByRole('button').first().click();
    await attendre(page);
    const t2 = await texte(page);
    assert.match(t2, /lieu:port-sel/);
    assert.match(t2, /titre modifié dans Kanevas : non écrasé/);
    assert.match(t2, /section « Aperçu » : titre modifié dans Kanevas : non écrasé/);
    await page.screenshot({ path: join(SHOTS, 'e18-avertissements.png'), fullPage: true });
    await ctx.close();
  });

  test('B-49 : un PUT refusé sans lot ne laisse aucune trace sur E-18', async () => {
    const avant = await nbLots(m);
    const r = await put(m, JETON_BOUCHON, 'cr:sans-lot', { type: 'compte_rendu', titre: 'Sans lot', sections: [] });
    assert.equal(r.status, 400);
    assert.equal(await nbLots(m), avant);
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    assert.doesNotMatch(await texte(page), /cr:sans-lot/);
    await ctx.close();
  });

  test('B-45 bord : nom vide -> « Erreur : le nom est obligatoire. », aucun jeton créé', async () => {
    const avant = ((await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`)).json as Any).jetons?.length ?? ((await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`)).json as Any[]).length;
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    await page.getByRole('button', { name: 'Nouveau jeton' }).click();
    const boite = page.getByRole('dialog', { name: 'Nouveau jeton' });
    await boite.getByRole('button', { name: 'Créer le jeton' }).click();
    await boite.getByText('Erreur : le nom est obligatoire.').waitFor();
    await page.screenshot({ path: join(SHOTS, 'e18-nom-vide.png') });
    await boite.getByRole('button', { name: 'Annuler' }).click();
    const apres = ((await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`)).json as Any).jetons?.length ?? ((await m.session('antor', 'GET', `/api/univers/${m.essai}/jetons`)).json as Any[]).length;
    assert.equal(apres, avant);
    await ctx.close();
  });

  test('B-45 bord : durées proposées 7 jours, 30 jours (par défaut), 90 jours, 1 an', async () => {
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    await page.getByRole('button', { name: 'Nouveau jeton' }).click();
    const boite = page.getByRole('dialog', { name: 'Nouveau jeton' });
    for (const d of ['7 jours', '30 jours', '90 jours', '1 an']) {
      await boite.getByText(d, { exact: true }).waitFor();
    }
    const defaut = await boite.getByRole('radio', { name: '30 jours' }).isChecked().catch(() => null);
    if (defaut !== null) assert.equal(defaut, true);
    await ctx.close();
  });

  test('B-46 : « Révoquer » demande confirmation, la ligne passe en « Révoqué », le script reçoit 401 sans lot', async () => {
    const valeur = await jetonDe(m, 'antor', 'À couper');
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    const l = ligne(page, 'À couper').first();
    await l.hover();
    await l.getByRole('button', { name: /Révoquer/ }).click();
    const boite = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
    await boite.waitFor();
    assert.match(((await boite.innerText()) as string).replace(/\s+/g, ' ').replace(/’/g, "'"), /Révoquer « À couper » \? Le script qui l'utilise ne pourra plus rien écrire\./);
    await boite.getByRole('button', { name: 'Annuler' }).click();
    assert.equal((await m.api('GET', `${m.essai}`, valeur)).status, 200, 'cancel must not revoke');
    await l.hover();
    await l.getByRole('button', { name: /Révoquer/ }).click();
    await boite.waitFor();
    await boite.getByRole('button', { name: 'Révoquer le jeton' }).click();
    await page.getByText('Jeton révoqué.').first().waitFor();
    await attendre(page);
    assert.match(((await ligne(page, 'À couper').first().innerText()) as string), /Révoqué/);
    await page.screenshot({ path: join(SHOTS, 'e18-revoque.png') });
    const avant = await nbLots(m);
    const r = await m.api('POST', `${m.essai}/lots`, valeur);
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, UNIQUE);
    assert.equal(await nbLots(m), avant);
    await ctx.close();
  });

  test('B-46 : le jeton de Mira passée Joueuse reste listé avec la pastille « Inactif »', async () => {
    await m.session('antor', 'POST', `/api/univers/${m.essai}/membres`, { username: 'mira', role: 'mj' });
    await jetonDe(m, 'mira', 'Jeton de Mira');
    await m.session('antor', 'PATCH', `/api/univers/${m.essai}/membres/${m.idCompte('mira')}`, { role: 'joueur' });
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    const l = ligne(page, 'Jeton de Mira').first();
    await l.waitFor();
    assert.match((await l.innerText()) as string, /Inactif/);
    assert.doesNotMatch((await l.innerText()) as string, /Révoqué|Expiré/);
    await page.screenshot({ path: join(SHOTS, 'e18-inactif.png') });
    await ctx.close();
  });

  test('exclusion : Léa, Joueuse, lit « Page introuvable. » à l’adresse de E-18 et l’item n’est pas dans sa barre', async () => {
    const { ctx, page } = await ouvrirSession(browser, m, 'lea');
    await page.goto(`/univers/${m.essai}/acces-api`);
    await page.getByText('Page introuvable.').first().waitFor();
    await attendre(page);
    assert.equal(await page.getByRole('link', { name: 'Accès par API' }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Accès par API' }).count(), 0);
    await page.screenshot({ path: join(SHOTS, 'e18-lea.png') });
    await ctx.close();
  });

  test('états vides : un univers sans jeton ni lot dit « Aucun jeton… » et « Aucun lot d’import pour l’instant. »', async () => {
    const cree = await m.session('antor', 'POST', '/api/univers', { nom: 'Univers vierge' });
    assert.equal(cree.status, 201, JSON.stringify(cree.json));
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m, cree.json.id);
    const t = await texte(page);
    assert.match(t, /Aucun jeton\. Créez-en un pour qu'un script écrive dans cet univers\./);
    assert.match(t, /Aucun lot d'import pour l'instant\./);
    await page.screenshot({ path: join(SHOTS, 'e18-vide.png') });
    await ctx.close();
  });

  test('barre : l’item « Accès par API » est dans la section Univers pour le MJ, et mène à E-18', async () => {
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await page.goto(`/univers/${m.essai}`);
    await attendre(page);
    await page.getByRole('link', { name: 'Accès par API' }).click();
    await page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
    await ctx.close();
  });
});
