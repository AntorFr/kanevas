import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'cartes-routes-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const FRONT = 'XBOUND';

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

function multipart(nom: string, contenu: Buffer, champs: Record<string, string> = {}) {
  const parts: Buffer[] = Object.entries(champs).map(([k, v]) =>
    Buffer.from(`--${FRONT}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
  );
  parts.push(
    Buffer.from(`--${FRONT}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${FRONT}--\r\n`),
  );
  return { payload: Buffer.concat(parts), 'content-type': `multipart/form-data; boundary=${FRONT}` };
}

const envoyer = (app: App, h: Hote, method: 'POST' | 'PUT', url: string, nom: string, c: Buffer, champs?: Record<string, string>) => {
  const m = multipart(nom, c, champs);
  return app.inject({ method, url, headers: { ...h, 'content-type': m['content-type'] }, payload: m.payload });
};

const fichiers = () => readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
const lignes = (app: App) => (app.db.prepare('SELECT COUNT(*) AS n FROM cartes').get() as { n: number }).n;

async function monter() {
  for (const n of readdirSync(RACINE)) if (n !== 'tmp') rmSync(join(RACINE, n), { recursive: true, force: true });
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const fiche = async (type: string, titre: string, ouverte: boolean) => {
    const f = (await appel(app, antor, 'POST', `${base}/fiches`, { type, titre, charge: type === 'personnage' ? { pj: false } : undefined })).json() as { id: number };
    const s = (await appel(app, antor, 'POST', `${base}/fiches/${f.id}/sections`, { titre: 'S', contenu: 'x' })).json();
    if (ouverte) await appel(app, antor, 'PATCH', `${base}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
    return { ...f, sec: s.id as number };
  };
  const aldric = await fiche('personnage', 'Maître Aldric', true);
  const secrete = await fiche('faction', 'Cercle des Cendres', false);
  const grises = await fiche('faction', 'Lames Grises', true);
  return { app, antor, lea, teo, base, aldric, secrete, grises, cartes: `${base}/cartes` };
}

async function carteIllustree(m: Awaited<ReturnType<typeof monter>>) {
  const r = await envoyer(m.app, m.antor, 'POST', m.cartes, 'ville.png', PNG, { titre: 'La ville de Brume', forme: 'illustree' });
  assert.equal(r.statusCode, 201, r.body);
  return r.json() as { id: number; visible: boolean; fond: boolean };
}

test('critère : carte illustrée, visibilité, lecture filtrée et fond avec ses en-têtes', async () => {
  const m = await monter();
  const c = await carteIllustree(m);
  assert.equal(c.visible, false);
  assert.equal(c.fond, true);
  const u = `${m.cartes}/${c.id}`;
  for (const f of [m.aldric, m.secrete]) {
    const r = await appel(m.app, m.antor, 'POST', `${u}/elements`, { ficheId: f.id, x: 10, y: 20 });
    assert.equal(r.statusCode, 201, r.body);
  }
  // Hidden: Léa's list is empty, her reads equal an unknown id's.
  assert.deepEqual((await appel(m.app, m.lea, 'GET', m.cartes)).json().cartes, []);
  const inconnue = await appel(m.app, m.lea, 'GET', `${m.cartes}/999999`);
  const lue = await appel(m.app, m.lea, 'GET', u);
  const fond = await appel(m.app, m.lea, 'GET', `${u}/fond`);
  const fondInconnu = await appel(m.app, m.lea, 'GET', `${m.cartes}/999999/fond`);
  assert.equal(inconnue.statusCode, 404);
  assert.equal(lue.statusCode, 404);
  assert.equal(lue.body, inconnue.body);
  assert.equal(fond.statusCode, 404);
  assert.equal(fond.body, fondInconnu.body);
  // Antor in player mode: his own refusal, not a 404.
  const mj = await appel(m.app, m.antor, 'GET', `${u}?mode=joueur`);
  assert.notEqual(mj.statusCode, 404);
  assert.ok(mj.statusCode >= 400 && mj.statusCode < 500, String(mj.statusCode));
  assert.notEqual(mj.body, inconnue.body);

  const v = await appel(m.app, m.antor, 'PATCH', u, { visible: true });
  assert.equal(v.statusCode, 200, v.body);
  const l = await appel(m.app, m.lea, 'GET', u);
  assert.equal(l.statusCode, 200);
  assert.deepEqual(l.json().elements.map((e: { ficheId: number }) => e.ficheId), [m.aldric.id]);
  assert.ok(!l.body.includes('Cendres'));
  assert.equal(l.json().carte.visible, undefined);
  assert.equal((await appel(m.app, m.lea, 'GET', m.cartes)).json().cartes.length, 1);
  const enJoueur = await appel(m.app, m.antor, 'GET', `${u}?mode=joueur`);
  assert.equal(enJoueur.body, l.body);
  const mjFull = await appel(m.app, m.antor, 'GET', u);
  assert.equal(mjFull.json().elements.length, 2);

  const f = await appel(m.app, m.lea, 'GET', `${u}/fond`);
  assert.equal(f.statusCode, 200);
  assert.ok(f.rawPayload.equals(PNG));
  assert.equal(f.headers['content-type'], 'image/png');
  assert.equal(f.headers['x-content-type-options'], 'nosniff');
  assert.equal(f.headers['content-security-policy'], "default-src 'none'; sandbox");
  assert.equal(f.headers['cache-control'], 'private, no-store');
  const direct = await appel(m.app, m.antor, 'GET', `${u}/fond?mode=joueur`);
  assert.equal(direct.statusCode, 200);
  assert.ok(direct.rawPayload.equals(PNG));
});

test('critère : cartes cachées — Léa 404 partout ; Teo 404 partout ; carte lue — 403 sur chaque écriture', async () => {
  const m = await monter();
  const c = await carteIllustree(m);
  const u = `${m.cartes}/${c.id}`;
  const el = (await appel(m.app, m.antor, 'POST', `${u}/elements`, { ficheId: m.aldric.id, x: 1, y: 2 })).json();
  const gestes = async (h: Hote) => [
    await appel(m.app, h, 'POST', m.cartes, { titre: 'X', forme: 'graphe' }),
    await appel(m.app, h, 'PATCH', u, { titre: 'Y' }),
    await appel(m.app, h, 'PATCH', u, { visible: false }),
    await envoyer(m.app, h, 'PUT', `${u}/fond`, 'a.png', PNG),
    await appel(m.app, h, 'POST', `${u}/elements`, { ficheId: m.grises.id, x: 1, y: 1 }),
    await appel(m.app, h, 'PATCH', `${u}/elements/${el.id}`, { x: 5, y: 5 }),
    await appel(m.app, h, 'DELETE', `${u}/elements/${el.id}`),
  ];
  // Hidden map: the five map-bound gestures are 404 for Léa and Teo; creation is 403 for Léa, 404 for Teo.
  for (const [i, r] of (await gestes(m.lea)).entries()) assert.equal(r.statusCode, i === 0 ? 403 : 404, `lea cachée ${i}`);
  for (const [i, r] of (await gestes(m.teo)).entries()) assert.equal(r.statusCode, 404, `teo ${i}`);
  assert.equal((await appel(m.app, m.teo, 'GET', m.cartes)).statusCode, 404);
  assert.equal((await appel(m.app, m.teo, 'GET', u)).statusCode, 404);
  assert.equal((await appel(m.app, m.teo, 'GET', `${u}/fond`)).statusCode, 404);

  await appel(m.app, m.antor, 'PATCH', u, { visible: true });
  for (const [i, r] of (await gestes(m.lea)).entries()) assert.equal(r.statusCode, 403, `lea visible ${i}`);
  for (const [i, r] of (await gestes(m.teo)).entries()) assert.equal(r.statusCode, 404, `teo visible ${i}`);
  // Nothing changed.
  const apres = (await appel(m.app, m.antor, 'GET', u)).json();
  assert.equal(apres.carte.titre, 'La ville de Brume');
  assert.equal(apres.carte.visible, true);
  assert.equal(apres.elements.length, 1);
  assert.equal(lignes(m.app), 1);
});

test('critère : Antor en mode Joueur ne peut pas écrire', async () => {
  const m = await monter();
  const r = await appel(m.app, m.antor, 'POST', `${m.cartes}?mode=joueur`, { titre: 'X', forme: 'graphe' });
  assert.equal(r.statusCode, 403);
  assert.equal(lignes(m.app), 0);
});

test('critère : fond .pdf → 400 fond_invalide, > 25 Mo → 413 fond_trop_lourd, rien d’écrit', async () => {
  const m = await monter();
  const pdf = await envoyer(m.app, m.antor, 'POST', m.cartes, 'plan.pdf', Buffer.from('%PDF-1.4 hello'), { titre: 'P', forme: 'illustree' });
  assert.equal(pdf.statusCode, 400);
  assert.equal(pdf.json().code, 'fond_invalide');
  const gros = Buffer.concat([PNG, Buffer.alloc(25 * 1024 * 1024, 7)]);
  const r = await envoyer(m.app, m.antor, 'POST', m.cartes, 'gros.png', gros, { titre: 'G', forme: 'illustree' });
  assert.equal(r.statusCode, 413, r.body);
  assert.equal(r.json().code, 'fond_trop_lourd');
  assert.equal(lignes(m.app), 0);
  assert.equal(fichiers().length, 0);
  // Same on replacement, existing background kept.
  const c = await carteIllustree(m);
  const avant = fichiers().length;
  const p = await envoyer(m.app, m.antor, 'PUT', `${m.cartes}/${c.id}/fond`, 'gros.png', gros);
  assert.equal(p.statusCode, 413);
  assert.equal(fichiers().length, avant);
  const p2 = await envoyer(m.app, m.antor, 'PUT', `${m.cartes}/${c.id}/fond`, 'plan.pdf', Buffer.from('%PDF-1.4'));
  assert.equal(p2.statusCode, 400);
  assert.equal(fichiers().length, avant);
  const ok = await appel(m.app, m.antor, 'GET', `${m.cartes}/${c.id}/fond`);
  assert.ok(ok.rawPayload.equals(PNG));
});

test('critère : remplacer le fond sert le nouveau et ne laisse qu’un fichier', async () => {
  const m = await monter();
  const c = await carteIllustree(m);
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);
  const r = await envoyer(m.app, m.antor, 'PUT', `${m.cartes}/${c.id}/fond`, 'b.jpg', JPG);
  assert.equal(r.statusCode, 200, r.body);
  const f = await appel(m.app, m.antor, 'GET', `${m.cartes}/${c.id}/fond`);
  assert.equal(f.headers['content-type'], 'image/jpeg');
  assert.ok(f.rawPayload.equals(JPG));
  assert.equal(fichiers().length, 1);
});

test('critère : 101e fiche → 409 carte_pleine ; doublon → 409 fiche_deja_placee ; fiche inconnue 400', async () => {
  const m = await monter();
  const g = (await appel(m.app, m.antor, 'POST', m.cartes, { titre: 'Les factions', forme: 'graphe' })).json();
  const u = `${m.cartes}/${g.id}/elements`;
  for (let i = 0; i < 100; i++) {
    const f = (await appel(m.app, m.antor, 'POST', `${m.base}/fiches`, { type: 'lieu', titre: `L${i}` })).json();
    const r = await appel(m.app, m.antor, 'POST', u, { ficheId: f.id });
    assert.equal(r.statusCode, 201, r.body);
  }
  const plus = await appel(m.app, m.antor, 'POST', u, { ficheId: m.aldric.id });
  assert.equal(plus.statusCode, 409);
  assert.equal(plus.json().code, 'carte_pleine');
  assert.equal((await appel(m.app, m.antor, 'POST', u, { ficheId: 999999 })).statusCode, 400);
  assert.equal(((await appel(m.app, m.antor, 'GET', `${m.cartes}/${g.id}`)).json().elements as unknown[]).length, 100);
});

test('critère : doublon et positions', async () => {
  const m = await monter();
  const c = await carteIllustree(m);
  const u = `${m.cartes}/${c.id}/elements`;
  const e = (await appel(m.app, m.antor, 'POST', u, { ficheId: m.aldric.id, x: 10, y: 20 })).json();
  const d = await appel(m.app, m.antor, 'POST', u, { ficheId: m.aldric.id, x: 1, y: 1 });
  assert.equal(d.statusCode, 409);
  assert.equal(d.json().code, 'fiche_deja_placee');
  assert.equal((await appel(m.app, m.antor, 'POST', u, { ficheId: m.grises.id })).json().code, 'position_invalide');
  const mv = await appel(m.app, m.antor, 'PATCH', `${u}/${e.id}`, { x: 150, y: -3 });
  assert.equal(mv.statusCode, 200);
  assert.equal(mv.json().x, 100);
  assert.equal(mv.json().y, 0);
  const bad = await appel(m.app, m.antor, 'PATCH', `${u}/${e.id}`, { x: 'a', y: 1 });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().code, 'position_invalide');
  assert.equal((await appel(m.app, m.antor, 'DELETE', `${u}/${e.id}`)).statusCode, 204);
  assert.equal((await appel(m.app, m.antor, 'DELETE', `${u}/${e.id}`)).statusCode, 404);
});

test('critère : liens du graphe = lecture filtrée pour chaque compte', async () => {
  const m = await monter();
  const g = (await appel(m.app, m.antor, 'POST', m.cartes, { titre: 'Les factions', forme: 'graphe' })).json();
  const rel = (de: { id: number; sec: number }, vers: number, type: string) =>
    appel(m.app, m.antor, 'POST', `${m.base}/fiches/${de.id}/sections/${de.sec}/relations`, { cibleFicheId: vers, type });
  assert.equal((await rel(m.grises, m.secrete.id, 'rival de')).statusCode, 201);
  assert.equal((await rel(m.grises, m.aldric.id, 'allié de')).statusCode, 201);
  for (const f of [m.grises, m.aldric, m.secrete]) await appel(m.app, m.antor, 'POST', `${m.cartes}/${g.id}/elements`, { ficheId: f.id });
  await appel(m.app, m.antor, 'PATCH', `${m.cartes}/${g.id}`, { visible: true });
  const mj = (await appel(m.app, m.antor, 'GET', `${m.cartes}/${g.id}`)).json();
  assert.deepEqual(
    mj.liens.map((l: { de: number; vers: number; type: string }) => [l.de, l.vers, l.type]).sort(),
    [[m.grises.id, m.aldric.id, 'allié de'], [m.grises.id, m.secrete.id, 'rival de']].sort(),
  );
  const l = await appel(m.app, m.lea, 'GET', `${m.cartes}/${g.id}`);
  assert.deepEqual(l.json().liens.map((x: { vers: number; type: string }) => [x.vers, x.type]), [[m.aldric.id, 'allié de']]);
  assert.ok(!l.body.includes('Cendres') && !l.body.includes('rival'));
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.cartes}/${g.id}?mode=joueur`)).body, l.body);
});

test('exclusions : pas de suppression de carte, pas de service statique du dossier', async () => {
  const m = await monter();
  const c = await carteIllustree(m);
  const d = await appel(m.app, m.antor, 'DELETE', `${m.cartes}/${c.id}`);
  assert.ok([404, 405].includes(d.statusCode), String(d.statusCode));
  assert.equal(lignes(m.app), 1);
  const nom = fichiers()[0]!.name;
  for (const url of [`/attachments/${nom}`, `/api/attachments/${nom}`, `/fonds/${nom}`, `${m.cartes}/fonds/${nom}`]) {
    const r = await appel(m.app, m.antor, 'GET', url);
    assert.notEqual(r.headers['content-type'], 'image/png', url);
  }
});

test('entrées fausses : titre vide/81, forme, JSON sur le fond, graphe avec fond, id non numérique', async () => {
  const m = await monter();
  assert.equal((await appel(m.app, m.antor, 'POST', m.cartes, { titre: '', forme: 'graphe' })).statusCode, 400);
  assert.equal((await appel(m.app, m.antor, 'POST', m.cartes, { titre: 'a'.repeat(81), forme: 'graphe' })).statusCode, 400);
  assert.equal((await appel(m.app, m.antor, 'POST', m.cartes, { titre: 'a'.repeat(80), forme: 'graphe' })).statusCode, 201);
  assert.equal((await appel(m.app, m.antor, 'POST', m.cartes, { titre: 'x', forme: 'carré' })).statusCode, 400);
  assert.equal((await appel(m.app, m.antor, 'POST', m.cartes, { forme: 'graphe' })).statusCode, 400);
  const gf = await envoyer(m.app, m.antor, 'POST', m.cartes, 'a.png', PNG, { titre: 'G', forme: 'graphe' });
  assert.equal(gf.statusCode, 400);
  assert.equal(gf.json().code, 'fond_invalide');
  const c = await carteIllustree(m);
  assert.equal((await appel(m.app, m.antor, 'PUT', `${m.cartes}/${c.id}/fond`, {})).statusCode, 400);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.cartes}/abc`)).statusCode, 404);
  assert.equal((await appel(m.app, m.antor, 'PATCH', `${m.cartes}/${c.id}`, { visible: 'oui' })).statusCode, 400);
  assert.equal((await appel(m.app, m.antor, 'PATCH', `${m.cartes}/${c.id}`, { titre: 5 as never })).statusCode, 400);
  // A map of another universe is not reachable through this one's address.
  const u2 = (await appel(m.app, m.antor, 'POST', '/api/univers', { nom: 'Autre' })).json();
  assert.equal((await appel(m.app, m.antor, 'GET', `/api/univers/${u2.id}/cartes`)).json().cartes.length, 0);
});

test('critère : requête interrompue en plein envoi (création et remplacement) n’écrit ni ligne ni fichier', async () => {
  const m = await monter();
  const c = await carteIllustree(m);
  await m.app.listen({ port: 0, host: '127.0.0.1' });
  try {
    const port = (m.app.server.address() as { port: number }).port;
    const avant = fichiers().length;
    const interrompre = async (methode: string, url: string, champs: string) => {
      const entete = `${champs}--${FRONT}\r\nContent-Disposition: form-data; name="fichier"; filename="gros.png"\r\n\r\n`;
      const corps = Buffer.concat([PNG, Buffer.alloc(200_000, 7)]);
      const total = entete.length + corps.length + 100;
      await new Promise<void>((fin) => {
        const s = connect(port, '127.0.0.1', () => {
          s.write(
            `${methode} ${url} HTTP/1.1\r\nHost: x\r\nCookie: ${m.antor.cookie}\r\n` +
              `Content-Type: multipart/form-data; boundary=${FRONT}\r\nContent-Length: ${total}\r\n\r\n${entete}`,
          );
          s.write(corps, () => setTimeout(() => s.destroy(), 100));
        });
        s.on('close', () => fin());
        s.on('error', () => undefined);
      });
      await new Promise((r) => setTimeout(r, 500));
    };
    const champ = (k: string, v: string) => `--${FRONT}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    await interrompre('POST', m.cartes, champ('titre', 'Coupée') + champ('forme', 'illustree'));
    assert.equal(lignes(m.app), 1);
    assert.equal(fichiers().length, avant);
    await interrompre('PUT', `${m.cartes}/${c.id}/fond`, '');
    assert.equal(fichiers().length, avant);
    const f = await appel(m.app, m.antor, 'GET', `${m.cartes}/${c.id}/fond`);
    assert.ok(f.rawPayload.equals(PNG));
    assert.equal(readdirSync(join(RACINE, 'tmp')).length, 0);
  } finally {
    await m.app.close();
  }
});
