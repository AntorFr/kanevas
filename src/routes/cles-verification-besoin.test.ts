import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// kanevas-synchro-cles, vérification indépendante : B-99, B-100, B-101, B-104 écrits depuis le besoin (parcours, fiche, écrans),
// à la porte HTTP (routes de session, bouchon). Attendus en dur.
const racine = mkdtempSync(join(tmpdir(), 'kanevas-cles-verif-'));
writeFileSync(join(racine, 'index.html'), '<html><head><!--KANEVAS_BOUCHON--></head><body>SHELL</body></html>');
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;
mkdirSync(join(racine, 'assets'), { recursive: true });

const { buildApp } = await import('../app.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const req = (h: H, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, payload });
  const univers = async (nom: string) => (await req(antor, 'POST', '/api/univers', { nom })).json() as { id: number; cle: string };
  const fiche = async (u: number, type: string, titre: string) =>
    (await req(antor, 'POST', `/api/univers/${u}/fiches`, { type, titre })).json() as { id: number; cle: string };
  return { app, antor, req, univers, fiche };
}

// Panne visée : l'unicité de la clé de fiche serait calculée sur l'instance au lieu de l'univers.
test('B-99 : deux univers peuvent porter chacun lieu:nyx ; la clé est unique par univers seulement', async () => {
  const w = await monter();
  const a = await w.univers('Eneria');
  const b = await w.univers('Tenebria');
  assert.equal((await w.fiche(a.id, 'lieu', 'Nyx')).cle, 'lieu:nyx');
  assert.equal((await w.fiche(b.id, 'lieu', 'Nyx')).cle, 'lieu:nyx');
  assert.equal((await w.fiche(a.id, 'lieu', 'Nyx')).cle, 'lieu:nyx-2');
  await w.app.close();
});

// Panne visée : le MJ pourrait poser une clé hors forme (majuscule, espace, accent, trait « : » double) ou refuser une clé valide à tiret bas.
test('B-99 : forme de la clé tapée par le MJ — majuscule, espace, accent, a:b:c et un seul caractère refusés ; compte_rendu:seance-3 accepté', async () => {
  const w = await monter();
  const u = await w.univers('Eneria');
  const f = await w.fiche(u.id, 'lieu', 'Nyx');
  const url = `/api/univers/${u.id}/fiches/${f.id}`;
  for (const mauvaise of ['Lieu:Nyx', 'lieu:ny x', 'lieu:nyé', 'a:b:c', 'x', '12345', '--', '']) {
    const r = await w.req(w.antor, 'PATCH', url, { cle: mauvaise });
    assert.equal(r.statusCode, 400, `${JSON.stringify(mauvaise)} : ${r.body}`);
    assert.equal(r.json().code, 'invalide', mauvaise);
    assert.equal(r.json().champ, 'cle', mauvaise);
  }
  assert.equal((await w.req(w.antor, 'GET', url)).json().cle, 'lieu:nyx', 'rien n’est écrit par un refus');
  const ok = await w.req(w.antor, 'PATCH', url, { cle: 'compte_rendu:seance-3' });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().cle, 'compte_rendu:seance-3');
  await w.app.close();
});

// Panne visée : l'ancienne clé ne serait pas gardée, ou la 302 de l'id numérique mènerait encore à l'ancienne adresse.
test('B-99/B-101 : après changement de clé, l’id numérique mène à l’adresse de la NOUVELLE clé, l’ancienne clé lit la même fiche', async () => {
  const w = await monter();
  const u = await w.univers('Eneria');
  const f = await w.fiche(u.id, 'lieu', 'Ténébria');
  assert.equal(f.cle, 'lieu:tenebria');
  const p = await w.req(w.antor, 'PATCH', `/api/univers/${u.id}/fiches/${f.id}`, { cle: 'lieu:tenebria-la-noire' });
  assert.equal(p.statusCode, 200, p.body);
  const r = await w.app.inject({ method: 'GET', url: `/univers/${u.id}/fiche/${f.id}`, headers: w.antor });
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/univers/eneria/lieu/tenebria-la-noire');
  const parAncienne = await w.req(w.antor, 'GET', `/api/univers/eneria/fiches/${encodeURIComponent('lieu:tenebria')}`);
  assert.equal(parAncienne.statusCode, 200, parAncienne.body);
  assert.equal(parAncienne.json().id, f.id);
  assert.equal(parAncienne.json().cle, 'lieu:tenebria-la-noire');
  // une nouvelle fiche au même titre ne prend pas l'ancienne clé de la première
  const autre = await w.fiche(u.id, 'lieu', 'Ténébria');
  assert.notEqual(autre.cle, 'lieu:tenebria');
  const refus = await w.req(w.antor, 'PATCH', `/api/univers/${u.id}/fiches/${autre.id}`, { cle: 'lieu:tenebria' });
  assert.equal(refus.statusCode, 409);
  assert.equal(refus.json().code, 'cle_prise');
  await w.app.close();
});

// Panne visée : la clé `compte_rendu:…` (un type enregistré à tiret bas) serait traitée comme une clé hors type.
test('B-101 : une clé compte_rendu:seance-3 s’adresse /univers/<u>/compte_rendu/seance-3 ; une clé sans « : » ou hors type, /fiche/<clé>', async () => {
  const w = await monter();
  const u = await w.univers('Eneria');
  const f = await w.fiche(u.id, 'lieu', 'Nyx');
  const aller = async (cle: string) => {
    const p = await w.req(w.antor, 'PATCH', `/api/univers/${u.id}/fiches/${f.id}`, { cle });
    assert.equal(p.statusCode, 200, p.body);
    return w.app.inject({ method: 'GET', url: `/univers/${u.id}/fiche/${f.id}`, headers: w.antor });
  };
  assert.equal((await aller('compte_rendu:seance-3')).headers.location, '/univers/eneria/compte_rendu/seance-3');
  assert.equal((await aller('nyx')).headers.location, '/univers/eneria/fiche/nyx');
  assert.equal((await aller('machin:nyx')).headers.location, '/univers/eneria/fiche/machin:nyx');
  assert.equal((await aller('lieu:nyx')).headers.location, '/univers/eneria/lieu/nyx');
  await w.app.close();
});

// Panne visée : l'adresse numérique de l'univers ne renverrait pas vers l'identifiant lisible, ou une fiche d'un autre univers s'ouvrirait sous le mauvais univers.
test('B-100/B-101 : /univers/<id>/parametres renvoie 302 vers /univers/eneria/parametres ; l’id d’une fiche d’un autre univers ne se lit pas sous celui-ci', async () => {
  const w = await monter();
  const a = await w.univers('Eneria');
  const b = await w.univers('Tenebria');
  const fb = await w.fiche(b.id, 'lieu', 'Nyx');
  const r = await w.app.inject({ method: 'GET', url: `/univers/${a.id}/parametres`, headers: w.antor });
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/univers/eneria/parametres');
  const mauvais = await w.app.inject({ method: 'GET', url: `/univers/${a.id}/fiche/${fb.id}`, headers: w.antor });
  assert.notEqual(mauvais.statusCode, 302, 'ne mène pas à la fiche de l’autre univers');
  assert.doesNotMatch(String(mauvais.headers.location ?? ''), /tenebria/);
  const api = await w.req(w.antor, 'GET', `/api/univers/${a.id}/fiches/${fb.id}`);
  assert.equal(api.statusCode, 404);
  await w.app.close();
});

// Panne visée : l'identifiant d'univers pris par un autre (clé ou ancienne clé) serait accepté, ou l'ancien ne mènerait plus à l'univers.
test('B-100 : identifiant d’univers — pris, ancien d’un autre, majuscule, tiret bas refusés ; l’ancien mène encore à l’univers', async () => {
  const w = await monter();
  const a = await w.univers('Eneria');
  const b = await w.univers('Tenebria');
  const patch = (id: number, cle: string) => w.req(w.antor, 'PATCH', `/api/univers/${id}`, { cle });
  assert.equal((await patch(b.id, 'eneria')).statusCode, 409);
  assert.equal((await patch(a.id, 'eneria-v2')).statusCode, 200);
  const ancien = await patch(b.id, 'eneria');
  assert.equal(ancien.statusCode, 409, 'eneria est l’ancien identifiant de l’univers A');
  assert.equal(ancien.json().code, 'cle_prise');
  for (const mauvais of ['Eneria', 'ene_ria', '12345', 'é']) {
    const r = await patch(b.id, mauvais);
    assert.equal(r.statusCode, 400, mauvais);
    assert.equal(r.json().champ, 'cle', mauvais);
  }
  const lu = await w.req(w.antor, 'GET', '/api/univers/eneria');
  assert.equal(lu.statusCode, 200);
  assert.equal(lu.json().id, a.id);
  assert.equal(lu.json().cle, 'eneria-v2');
  const liste = (await w.req(w.antor, 'GET', '/api/univers')).json() as { id: number; cle: string }[];
  assert.deepEqual(liste.map((x) => x.cle).sort(), ['eneria-v2', 'tenebria']);
  await w.app.close();
});

// Panne visée : la clé de section serait unique sur l'instance (ou la fiche) au lieu de l'être par fiche, ou prise sans retirer les accents.
test('B-104 : clé de section tirée du titre, accents retirés, unique par fiche seulement, visible au MJ dans la fiche', async () => {
  const w = await monter();
  const u = await w.univers('Eneria');
  const f1 = await w.fiche(u.id, 'lieu', 'Nyx');
  const f2 = await w.fiche(u.id, 'lieu', 'Port');
  const ajouter = async (fid: number, titre: string) =>
    (await w.req(w.antor, 'POST', `/api/univers/${u.id}/fiches/${fid}/sections`, { titre, contenu: 'x' })).json() as { cle: string };
  assert.equal((await ajouter(f1.id, 'Histoire')).cle, 'histoire');
  assert.equal((await ajouter(f1.id, 'Histoire')).cle, 'histoire-2');
  assert.equal((await ajouter(f2.id, 'Histoire')).cle, 'histoire');
  assert.equal((await ajouter(f1.id, 'Géographie')).cle, 'geographie');
  const lue = (await w.req(w.antor, 'GET', `/api/univers/${u.id}/fiches/${f1.id}`)).json() as { sections: { cle: string }[] };
  assert.deepEqual(lue.sections.map((s) => s.cle).sort(), ['geographie', 'histoire', 'histoire-2']);
  await w.app.close();
});

// Panne visée : un joueur pourrait changer une clé (droit élargi), ou la clé fuirait dans le corps lu par un joueur.
test('B-99 : un joueur (membre non MJ) ne change ni la clé de la fiche ni l’identifiant de l’univers, et le corps ne porte pas cle', async () => {
  const w = await monter();
  const u = await w.univers('Eneria');
  const f = await w.fiche(u.id, 'lieu', 'Nyx');
  await w.req(w.antor, 'POST', `/api/univers/${u.id}/fiches/${f.id}/sections`, { titre: 'Apparence', contenu: 'sombre' });
  w.app.db.prepare('UPDATE sections SET joueurs_lisent = 1 WHERE fiche_id = ?').run(f.id);
  const lea = await connecter(w.app, 'lea');
  const compte = w.app.db.prepare("SELECT id FROM comptes WHERE username = 'lea'").get() as { id: number } | undefined;
  assert.ok(compte, 'compte du bouchon introuvable');
  w.app.db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'joueur')").run(u.id, compte.id);
  const r1 = await w.req(lea, 'PATCH', `/api/univers/${u.id}/fiches/${f.id}`, { cle: 'lieu:pirate' });
  assert.ok([403, 404].includes(r1.statusCode), String(r1.statusCode));
  const r2 = await w.req(lea, 'PATCH', `/api/univers/${u.id}`, { cle: 'pirate' });
  assert.ok([403, 404].includes(r2.statusCode), String(r2.statusCode));
  const vueLea = await w.req(lea, 'GET', `/api/univers/${u.id}/fiches/${f.id}`);
  assert.equal(vueLea.statusCode, 200, vueLea.body);
  assert.equal('cle' in vueLea.json(), false, 'le corps lu par un joueur ne porte pas la clé');
  assert.equal((await w.req(w.antor, 'GET', `/api/univers/${u.id}/fiches/${f.id}`)).json().cle, 'lieu:nyx');
  assert.equal((await w.req(w.antor, 'GET', `/api/univers/${u.id}`)).json().cle, 'eneria');
  await w.app.close();
});
