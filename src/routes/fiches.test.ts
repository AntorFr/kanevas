import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

const appel = (app: App, h: Hote, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

type Section = { id: number; titre: string; contenu: string; version: number };

/** Lame d'Ébène: Antor MJ, Léa and Teo players. Everything goes through HTTP. */
async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}`;
  const leaId = (await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' })).json().compteId;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'teo' });
  return { app, antor, lea, teo, base, leaId };
}

async function fiche(
  app: App,
  h: Hote,
  base: string,
  type: string,
  titre: string,
  charge?: object,
) {
  const res = await appel(app, h, 'POST', `${base}/fiches`, { type, titre, charge });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as { id: number; type: string; titre: string };
}

async function section(app: App, h: Hote, base: string, ficheId: number, titre: string, contenu: string) {
  const res = await appel(app, h, 'POST', `${base}/fiches/${ficheId}/sections`, { titre, contenu });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as Section;
}

const lireAuxJoueurs = (app: App, h: Hote, base: string, f: number, s: number) =>
  appel(app, h, 'PATCH', `${base}/fiches/${f}/sections/${s}`, { joueursLisent: true });

test('critère : Antor crée les sept types de fiche, dont « Maître Aldric » PNJ', async () => {
  const { app, antor, base } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  assert.equal(aldric.type, 'personnage');
  assert.equal(aldric.titre, 'Maître Aldric');
  for (const [type, titre] of [
    ['personnage', 'Sélène'],
    ['lieu', 'Port-Brume'],
    ['faction', 'La Garde grise'],
    ['objet', 'Lame d’Ébène'],
    ['evenement', 'La Nuit des cendres'],
    ['quete', 'Retrouver le roi'],
  ] as const) {
    const f = await fiche(app, antor, base, type, titre, type === 'personnage' ? { pj: true } : undefined);
    assert.equal(f.type, type);
  }
  // Wrong inputs are refused, not stored.
  assert.equal((await appel(app, antor, 'POST', `${base}/fiches`, { type: 'dragon', titre: 'X' })).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', `${base}/fiches`, { type: 'lieu', titre: '' })).statusCode, 400);
});

test('critère : Léa lit la fiche sans la section MJ seul, sans son titre ni son existence', async () => {
  const { app, antor, lea, base } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const apparence = await section(app, antor, base, aldric.id, 'Apparence', 'Un vieil homme voûté.');
  const verite = await section(app, antor, base, aldric.id, 'Vérité — MJ seul', 'Il est le roi déchu.');
  assert.equal((await lireAuxJoueurs(app, antor, base, aldric.id, apparence.id)).statusCode, 200);

  const vue = await appel(app, lea, 'GET', `${base}/fiches/${aldric.id}`);
  assert.equal(vue.statusCode, 200);
  assert.deepEqual(vue.json().sections.map((s: Section) => s.titre), ['Apparence']);

  const liste = await appel(app, lea, 'GET', `${base}/fiches`);
  const direct = await appel(app, lea, 'GET', `${base}/fiches/${aldric.id}/sections/${apparence.id}`);
  const cachee = await appel(app, lea, 'GET', `${base}/fiches/${aldric.id}/sections/${verite.id}`);
  assert.equal(cachee.statusCode, 404);
  for (const r of [vue, liste, direct, cachee]) {
    assert.ok(!r.body.includes('Vérité'), `le titre fuit : ${r.body}`);
    assert.ok(!r.body.includes('roi déchu'), `le contenu fuit : ${r.body}`);
  }
  // Antor sees both.
  const mj = await appel(app, antor, 'GET', `${base}/fiches/${aldric.id}`);
  assert.deepEqual(mj.json().sections.map((s: Section) => s.titre), ['Apparence', 'Vérité — MJ seul']);
});

test('critère : une fiche sans section lisible répond 404 à Léa comme un identifiant inconnu', async () => {
  const { app, antor, lea, base } = await monter();
  const secrete = await fiche(app, antor, base, 'lieu', 'Crypte oubliée');
  await section(app, antor, base, secrete.id, 'Plan', 'Réservé au MJ.');
  const ouverte = await fiche(app, antor, base, 'lieu', 'Port-Brume');
  const s = await section(app, antor, base, ouverte.id, 'Description', 'Un port.');
  await lireAuxJoueurs(app, antor, base, ouverte.id, s.id);

  const sans = await appel(app, lea, 'GET', `${base}/fiches/${secrete.id}`);
  const inconnue = await appel(app, lea, 'GET', `${base}/fiches/999999`);
  assert.equal(sans.statusCode, 404);
  assert.equal(sans.statusCode, inconnue.statusCode);
  assert.equal(sans.body, inconnue.body);

  const liste = (await appel(app, lea, 'GET', `${base}/fiches`)).json();
  assert.deepEqual(liste.fiches.map((f: { titre: string }) => f.titre), ['Port-Brume']);
  assert.ok(!JSON.stringify(liste).includes('Crypte'));
});

test('critère : le mode Joueur d’Antor rend ce que rend Léa', async () => {
  const { app, antor, lea, base } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const apparence = await section(app, antor, base, aldric.id, 'Apparence', 'Un vieil homme voûté.');
  await section(app, antor, base, aldric.id, 'Vérité — MJ seul', 'Il est le roi déchu.');
  await lireAuxJoueurs(app, antor, base, aldric.id, apparence.id);
  const secrete = await fiche(app, antor, base, 'lieu', 'Crypte oubliée');
  await section(app, antor, base, secrete.id, 'Plan', 'Réservé au MJ.');

  const titres = (r: { json(): { sections: Section[] } }) => r.json().sections.map((s) => s.titre);
  const enJoueur = await appel(app, antor, 'GET', `${base}/fiches/${aldric.id}?mode=joueur`);
  const chezLea = await appel(app, lea, 'GET', `${base}/fiches/${aldric.id}`);
  assert.deepEqual(titres(enJoueur), titres(chezLea));
  assert.deepEqual(titres(enJoueur), ['Apparence']);
  // A sheet without a readable section too: 404 in Player mode, readable in GM mode.
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches/${secrete.id}?mode=joueur`)).statusCode, 404);
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches/${secrete.id}`)).statusCode, 200);
  // Player mode can only restrict: an unknown mode is refused.
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches/${aldric.id}?mode=dieu`)).statusCode, 400);
});

test('critère : « Notes de la table », Léa auteure avec écriture, Teo ne la voit pas', async () => {
  const { app, antor, lea, teo, base, leaId } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const apparence = await section(app, antor, base, aldric.id, 'Apparence', 'Un vieil homme voûté.');
  await lireAuxJoueurs(app, antor, base, aldric.id, apparence.id);
  const notes = await section(app, antor, base, aldric.id, 'Notes de la table', 'Début.');
  const url = `${base}/fiches/${aldric.id}/sections/${notes.id}`;

  const confiee = await appel(app, antor, 'PATCH', url, { auteurId: leaId, auteurLit: true, auteurEcrit: true });
  assert.equal(confiee.statusCode, 200, confiee.body);

  const lue = (await appel(app, lea, 'GET', url)).json() as Section;
  assert.equal(lue.contenu, 'Début.');
  const ecrite = await appel(app, lea, 'PUT', `${url}/contenu`, { contenu: 'Léa a noté un indice.', version: lue.version });
  assert.equal(ecrite.statusCode, 200, ecrite.body);
  assert.equal(((await appel(app, lea, 'GET', url)).json() as Section).contenu, 'Léa a noté un indice.');

  // Teo, a player: neither the section in the sheet, nor by its address, as long as players cannot read it.
  const chezTeo = await appel(app, teo, 'GET', `${base}/fiches/${aldric.id}`);
  assert.deepEqual(chezTeo.json().sections.map((s: Section) => s.titre), ['Apparence']);
  assert.ok(!chezTeo.body.includes('Notes de la table') && !chezTeo.body.includes('indice'));
  assert.equal((await appel(app, teo, 'GET', url)).statusCode, 404);
  assert.equal((await appel(app, teo, 'PUT', `${url}/contenu`, { contenu: 'Intrus.', version: 1 })).statusCode, 404);

  // Players read it: Teo finally sees it, but cannot write it.
  await lireAuxJoueurs(app, antor, base, aldric.id, notes.id);
  assert.equal((await appel(app, teo, 'GET', url)).statusCode, 200);
  const lueParTeo = (await appel(app, teo, 'GET', url)).json() as Section;
  const refus = await appel(app, teo, 'PUT', `${url}/contenu`, { contenu: 'Intrus.', version: lueParTeo.version });
  assert.ok([403, 404].includes(refus.statusCode), `Teo ne doit pas écrire : ${refus.statusCode}`);
  assert.equal(((await appel(app, antor, 'GET', url)).json() as Section).contenu, 'Léa a noté un indice.');
});

test('critère : Léa ne peut ni réordonner, ni retirer, ni changer l’audience, ni ajouter (403)', async () => {
  const { app, antor, lea, base, leaId } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const a = await section(app, antor, base, aldric.id, 'Apparence', 'Un vieil homme voûté.');
  const b = await section(app, antor, base, aldric.id, 'Histoire', 'Ancien capitaine.');
  await lireAuxJoueurs(app, antor, base, aldric.id, a.id);
  await lireAuxJoueurs(app, antor, base, aldric.id, b.id);
  await appel(app, antor, 'PATCH', `${base}/fiches/${aldric.id}/sections/${a.id}`, {
    auteurId: leaId, auteurLit: true, auteurEcrit: true,
  });
  const f = `${base}/fiches/${aldric.id}`;

  assert.equal((await appel(app, lea, 'PUT', `${f}/ordre`, { ids: [b.id, a.id] })).statusCode, 403);
  assert.equal((await appel(app, lea, 'DELETE', `${f}/sections/${a.id}`)).statusCode, 403);
  assert.equal((await appel(app, lea, 'PATCH', `${f}/sections/${a.id}`, { joueursLisent: false })).statusCode, 403);
  assert.equal((await appel(app, lea, 'POST', `${f}/sections`, { titre: 'Secret de Léa' })).statusCode, 403);
  assert.equal((await appel(app, lea, 'POST', `${base}/fiches`, { type: 'lieu', titre: 'Taverne' })).statusCode, 403);

  // Nothing moved: the order, the two sections and the audience are Antor's.
  const apres = (await appel(app, antor, 'GET', f)).json();
  assert.deepEqual(apres.sections.map((s: Section) => s.titre), ['Apparence', 'Histoire']);
  assert.equal(apres.sections[0].audience.joueursLisent, true);
  // And the GM can reorder.
  assert.equal((await appel(app, antor, 'PUT', `${f}/ordre`, { ids: [b.id, a.id] })).statusCode, 204);
  const inverse = (await appel(app, antor, 'GET', f)).json();
  assert.deepEqual(inverse.sections.map((s: Section) => s.titre), ['Histoire', 'Apparence']);
});

test('critère : deux écritures de la même version, la seconde reçoit 409 section_modifiee', async () => {
  const { app, antor, lea, base, leaId } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const notes = await section(app, antor, base, aldric.id, 'Notes de la table', 'Début.');
  const url = `${base}/fiches/${aldric.id}/sections/${notes.id}`;
  await appel(app, antor, 'PATCH', url, { auteurId: leaId, auteurLit: true, auteurEcrit: true });
  const lue = (await appel(app, lea, 'GET', url)).json() as Section;

  const premiere = await appel(app, lea, 'PUT', `${url}/contenu`, { contenu: 'Première.', version: lue.version });
  assert.equal(premiere.statusCode, 200);
  const seconde = await appel(app, antor, 'PUT', `${url}/contenu`, { contenu: 'Seconde.', version: lue.version });
  assert.equal(seconde.statusCode, 409);
  assert.equal(seconde.json().code, 'section_modifiee');
  assert.equal(((await appel(app, antor, 'GET', url)).json() as Section).contenu, 'Première.');

  // No version, or a version that is not one: refused, nothing written.
  assert.equal((await appel(app, antor, 'PUT', `${url}/contenu`, { contenu: 'X' })).statusCode, 400);
  assert.equal((await appel(app, antor, 'PUT', `${url}/contenu`, { contenu: 'X', version: 'un' })).statusCode, 400);
  assert.equal(((await appel(app, antor, 'GET', url)).json() as Section).contenu, 'Première.');
});

test('critère : les listes rendent cent fiches au plus par page et un curseur pour la suite', async () => {
  const { app, antor, base } = await monter();
  for (let i = 1; i <= 105; i++) {
    const f = await fiche(app, antor, base, 'lieu', `Lieu ${String(i).padStart(3, '0')}`);
    await section(app, antor, base, f.id, 'Description', `Lieu numéro ${i}.`);
  }
  const p1 = (await appel(app, antor, 'GET', `${base}/fiches`)).json();
  assert.equal(p1.fiches.length, 100);
  assert.ok(typeof p1.suivant === 'string' && p1.suivant.length > 0);
  const p2 = (await appel(app, antor, 'GET', `${base}/fiches?curseur=${encodeURIComponent(p1.suivant)}`)).json();
  assert.equal(p2.fiches.length, 5);
  assert.equal(p2.suivant, null);
  const ids = new Set([...p1.fiches, ...p2.fiches].map((f: { id: number }) => f.id));
  assert.equal(ids.size, 105, 'aucune fiche perdue ni répétée entre les pages');
  // A type filter stays within the limit.
  const lieux = (await appel(app, antor, 'GET', `${base}/fiches?type=lieu`)).json();
  assert.equal(lieux.fiches.length, 100);
  assert.equal((await appel(app, antor, 'GET', `${base}/fiches?type=faction`)).json().fiches.length, 0);
});

test('exclusion : un compte sans rôle dans l’univers ne sait pas que la fiche existe', async () => {
  const { app, antor, base } = await monter();
  const aldric = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const s = await section(app, antor, base, aldric.id, 'Apparence', 'Un vieil homme.');
  await lireAuxJoueurs(app, antor, base, aldric.id, s.id);
  const mira = await connecter(app, 'mira');
  // Mira has no role in the universe: everything answers 404, nothing says the sheet exists.
  for (const [verbe, url] of [
    ['GET', `${base}/fiches`],
    ['GET', `${base}/fiches/${aldric.id}`],
    ['GET', `${base}/fiches/${aldric.id}/sections/${s.id}`],
  ] as const) {
    assert.equal((await appel(app, mira, verbe, url)).statusCode, 404, `${verbe} ${url}`);
  }
  assert.equal((await appel(app, mira, 'POST', `${base}/fiches`, { type: 'lieu', titre: 'X' })).statusCode, 404);
});

test('plafond : PUT contenu de 20 000 caractères → 200, de 20 001 → 400, section et version inchangées', async () => {
  const { app, antor, base } = await monter();
  const f = await fiche(app, antor, base, 'personnage', 'Maître Aldric', { pj: false });
  const s = await section(app, antor, base, f.id, 'Notes', 'Début.');
  const url = `${base}/fiches/${f.id}/sections/${s.id}`;
  const ok = await appel(app, antor, 'PUT', `${url}/contenu`, { contenu: 'a'.repeat(20000), version: s.version });
  assert.equal(ok.statusCode, 200, ok.body);
  const v = (ok.json() as Section).version;
  const trop = await appel(app, antor, 'PUT', `${url}/contenu`, { contenu: 'b'.repeat(20001), version: v });
  assert.equal(trop.statusCode, 400, trop.body);
  assert.ok(trop.body.includes('Contenu trop long : 20 000 caractères au plus.'), trop.body);
  const lue = (await appel(app, antor, 'GET', url)).json() as Section;
  assert.equal(lue.contenu, 'a'.repeat(20000));
  assert.equal(lue.version, v);
  // the creation route enforces the same ceiling
  const creation = await appel(app, antor, 'POST', `${base}/fiches/${f.id}/sections`, { titre: 'Trop', contenu: 'c'.repeat(20001) });
  assert.equal(creation.statusCode, 400, creation.body);
});
