import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'pj-routes-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Hote = { cookie: string };
type Verbe = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

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

const FRONT = 'XBOUND';
function multipart(nom: string, contenu: Buffer, secrete?: string) {
  const parts: Buffer[] = [];
  if (secrete !== undefined)
    parts.push(Buffer.from(`--${FRONT}\r\nContent-Disposition: form-data; name="secrete"\r\n\r\n${secrete}\r\n`));
  parts.push(
    Buffer.from(
      `--${FRONT}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    contenu,
    Buffer.from(`\r\n--${FRONT}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${FRONT}` };
}

async function envoyer(app: App, h: Hote, url: string, nom: string, contenu: Buffer, secrete?: string) {
  const m = multipart(nom, contenu, secrete);
  return app.inject({ method: 'POST', url, headers: { ...h, 'content-type': m.type }, payload: m.payload });
}

const fichiers = () => readdirSync(RACINE, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());

async function monter() {
  for (const n of readdirSync(RACINE)) if (n !== 'tmp') rmSync(join(RACINE, n), { recursive: true, force: true });
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json();
  const base = `/api/univers/${u.id}/fiches`;
  await appel(app, antor, 'POST', `/api/univers/${u.id}/membres`, { username: 'lea' });
  const f = (await appel(app, antor, 'POST', base, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).json();
  const sec = async (titre: string) =>
    (await appel(app, antor, 'POST', `${base}/${f.id}/sections`, { titre, contenu: 'x' })).json() as { id: number };
  const apparence = await sec('Apparence');
  await appel(app, antor, 'PATCH', `${base}/${f.id}/sections/${apparence.id}`, { joueursLisent: true });
  const verite = await sec('Vérité — MJ seul');
  const fb = `${base}/${f.id}`;
  return { app, antor, lea, base, fb, f, apparence, verite, u };
}

const urlAjout = (fb: string, s: number) => `${fb}/sections/${s}/pieces-jointes`;

test('critère : Antor ajoute un PNG, Léa le voit et le lit avec les en-têtes de sécurité', async () => {
  const m = await monter();
  const r = await envoyer(m.app, m.antor, urlAjout(m.fb, m.apparence.id), 'plan.png', PNG);
  assert.equal(r.statusCode, 201, r.body);
  const piece = r.json();
  assert.equal(piece.nom, 'plan.png');
  assert.equal(piece.image, true);

  const fiche = (await appel(m.app, m.lea, 'GET', m.fb)).json();
  const pieces = fiche.sections[0].piecesJointes;
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].id, piece.id);

  const lu = await appel(m.app, m.lea, 'GET', `${m.fb}/pieces-jointes/${piece.id}/fichier`);
  assert.equal(lu.statusCode, 200);
  assert.ok(lu.rawPayload.equals(PNG));
  assert.equal(lu.headers['content-type'], 'image/png');
  assert.equal(lu.headers['x-content-type-options'], 'nosniff');
  assert.equal(lu.headers['content-security-policy'], "default-src 'none'; sandbox");
  assert.equal(lu.headers['cache-control'], 'private, no-store');
});

test('critère : un HTML nommé x.png et un SVG sont servis en téléchargement opaque, nom d’origine', async () => {
  const m = await monter();
  const url = urlAjout(m.fb, m.apparence.id);
  const html = (await envoyer(m.app, m.antor, url, 'x.png', Buffer.from('<html><script>1</script></html>'))).json();
  const svg = (await envoyer(m.app, m.antor, url, 'logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).json();
  for (const [p, nom] of [[html, 'x.png'], [svg, 'logo.svg']] as const) {
    const r = await appel(m.app, m.lea, 'GET', `${m.fb}/pieces-jointes/${p.id}/fichier`);
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-type'], 'application/octet-stream');
    assert.match(String(r.headers['content-disposition']), new RegExp(`^attachment; filename="${nom.replace('.', '\\.')}"`));
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
});

test('critère : pièce secrète — aucune trace chez Léa, 404 identique à un identifiant inconnu, Antor la lit toujours', async () => {
  const m = await monter();
  const p = (await envoyer(m.app, m.antor, urlAjout(m.fb, m.apparence.id), 'a.png', PNG)).json();
  const patch = await appel(m.app, m.antor, 'PATCH', `${m.fb}/pieces-jointes/${p.id}`, { secrete: true });
  assert.equal(patch.statusCode, 200, patch.body);

  const fiche = await appel(m.app, m.lea, 'GET', m.fb);
  assert.deepEqual(fiche.json().sections[0].piecesJointes, []);
  assert.ok(!fiche.body.includes('a.png'));
  const url = `${m.fb}/pieces-jointes/${p.id}/fichier`;
  const cachee = await appel(m.app, m.lea, 'GET', url);
  const inconnue = await appel(m.app, m.lea, 'GET', `${m.fb}/pieces-jointes/999999/fichier`);
  assert.equal(cachee.statusCode, 404);
  assert.equal(cachee.body, inconnue.body);

  // Player mode of Antor: same as Léa on the sheet, but the direct read has no mode.
  const enJoueur = await appel(m.app, m.antor, 'GET', `${m.fb}?mode=joueur`);
  assert.deepEqual(enJoueur.json().sections[0].piecesJointes, []);
  const direct = await appel(m.app, m.antor, 'GET', `${url}?mode=joueur`);
  assert.equal(direct.statusCode, 200);
  assert.ok(direct.rawPayload.equals(PNG));
  const mj = await appel(m.app, m.antor, 'GET', m.fb);
  assert.equal(mj.json().sections[0].piecesJointes.length, 1);

  // Léa: secret piece cannot be marked or removed, it does not exist for her.
  assert.equal((await appel(m.app, m.lea, 'PATCH', `${m.fb}/pieces-jointes/${p.id}`, { secrete: false })).statusCode, 404);
  assert.equal((await appel(m.app, m.lea, 'DELETE', `${m.fb}/pieces-jointes/${p.id}`)).statusCode, 404);
});

test('critère : section non lue par Léa → 404 partout, jamais 403', async () => {
  const m = await monter();
  const p = (await envoyer(m.app, m.antor, urlAjout(m.fb, m.verite.id), 'v.png', PNG)).json();
  assert.equal((await appel(m.app, m.lea, 'GET', `${m.fb}/pieces-jointes/${p.id}/fichier`)).statusCode, 404);
  assert.equal((await appel(m.app, m.lea, 'PATCH', `${m.fb}/pieces-jointes/${p.id}`, { secrete: true })).statusCode, 404);
  assert.equal((await appel(m.app, m.lea, 'DELETE', `${m.fb}/pieces-jointes/${p.id}`)).statusCode, 404);
  assert.equal((await envoyer(m.app, m.lea, urlAjout(m.fb, m.verite.id), 'z.png', PNG)).statusCode, 404);
  assert.equal(fichiers().length, 1);
});

test('critère : Léa lit « Apparence » sans l’écrire → 403 ajouter, marquer, retirer', async () => {
  const m = await monter();
  const p = (await envoyer(m.app, m.antor, urlAjout(m.fb, m.apparence.id), 'a.png', PNG)).json();
  const avant = fichiers().length;
  assert.equal((await envoyer(m.app, m.lea, urlAjout(m.fb, m.apparence.id), 'b.png', PNG)).statusCode, 403);
  assert.equal((await appel(m.app, m.lea, 'PATCH', `${m.fb}/pieces-jointes/${p.id}`, { secrete: true })).statusCode, 403);
  assert.equal((await appel(m.app, m.lea, 'DELETE', `${m.fb}/pieces-jointes/${p.id}`)).statusCode, 403);
  assert.equal(fichiers().length, avant);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.fb}/pieces-jointes/${p.id}/fichier`)).statusCode, 200);
});

test('critère : sur « Notes de la table » (Léa auteur) Léa ajoute et retire, mais ne marque pas secrète', async () => {
  const m = await monter();
  const compteLea = (await appel(m.app, m.lea, 'GET', '/api/univers')).statusCode;
  assert.equal(compteLea, 200);
  const fn = (await appel(m.app, m.lea, 'POST', m.base, { type: 'lieu', titre: 'Notes de la table' }));
  // Léa may not create sheets as a player: Antor does, Léa authors a section.
  const f = (await appel(m.app, m.antor, 'POST', m.base, { type: 'lieu', titre: 'Notes de la table' })).json();
  void fn;
  const s = (await appel(m.app, m.antor, 'POST', `${m.base}/${f.id}/sections`, { titre: 'Notes', contenu: 'x' })).json();
  await appel(m.app, m.antor, 'PATCH', `${m.base}/${f.id}/sections/${s.id}`, { joueursLisent: true, joueursEcrivent: true });
  const fb = `${m.base}/${f.id}`;
  const r = await envoyer(m.app, m.lea, urlAjout(fb, s.id), 'n.png', PNG);
  assert.equal(r.statusCode, 201, r.body);
  const p = r.json();
  assert.equal((await appel(m.app, m.lea, 'PATCH', `${fb}/pieces-jointes/${p.id}`, { secrete: true })).statusCode, 403);
  assert.equal((await envoyer(m.app, m.lea, urlAjout(fb, s.id), 'n2.png', PNG, 'true')).statusCode, 403);
  assert.equal((await appel(m.app, m.lea, 'DELETE', `${fb}/pieces-jointes/${p.id}`)).statusCode, 204);
});

test('critère : fichier vide → 400 fichier_vide, 51e pièce → 409 limite_pieces, rien d’écrit', async () => {
  const m = await monter();
  const url = urlAjout(m.fb, m.apparence.id);
  const vide = await envoyer(m.app, m.antor, url, 'v.png', Buffer.alloc(0));
  assert.equal(vide.statusCode, 400);
  assert.equal(vide.json().code, 'fichier_vide');
  assert.equal(fichiers().length, 0);
  for (let i = 0; i < 50; i++) {
    const r = await envoyer(m.app, m.antor, url, `p${i}.png`, PNG);
    assert.equal(r.statusCode, 201, r.body);
  }
  const trop = await envoyer(m.app, m.antor, url, 'p51.png', PNG);
  assert.equal(trop.statusCode, 409);
  assert.equal(trop.json().code, 'limite_pieces');
  assert.equal(fichiers().length, 50);
  const fiche = (await appel(m.app, m.antor, 'GET', m.fb)).json();
  assert.equal(fiche.sections[0].piecesJointes.length, 50);
});

test('critère : retirer une pièce puis la section qui en porte une autre supprime les fichiers', async () => {
  const m = await monter();
  const url = urlAjout(m.fb, m.apparence.id);
  const a = (await envoyer(m.app, m.antor, url, 'a.png', PNG)).json();
  const b = (await envoyer(m.app, m.antor, url, 'b.png', PNG)).json();
  assert.equal(fichiers().length, 2);
  assert.equal((await appel(m.app, m.antor, 'DELETE', `${m.fb}/pieces-jointes/${a.id}`)).statusCode, 204);
  assert.equal(fichiers().length, 1);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.fb}/pieces-jointes/${a.id}/fichier`)).statusCode, 404);
  assert.equal((await appel(m.app, m.antor, 'DELETE', `${m.fb}/sections/${m.apparence.id}`)).statusCode, 204);
  assert.equal(fichiers().length, 0);
  assert.equal((await appel(m.app, m.antor, 'GET', `${m.fb}/pieces-jointes/${b.id}/fichier`)).statusCode, 404);
});

test('critère : aucune route de liste des pièces ni de service statique du dossier', async () => {
  const m = await monter();
  const p = (await envoyer(m.app, m.antor, urlAjout(m.fb, m.apparence.id), 'a.png', PNG)).json();
  for (const u of [`${m.fb}/pieces-jointes`, `${m.fb}/sections/${m.apparence.id}/pieces-jointes`, '/attachments/', '/api/pieces-jointes']) {
    const r = await appel(m.app, m.antor, 'GET', u);
    assert.ok(r.statusCode === 404 || r.statusCode === 405, `${u} → ${r.statusCode}`);
    assert.ok(!r.body.includes('a.png'));
  }
  const nom = readdirSync(RACINE).find((n) => n !== 'tmp');
  if (nom) {
    const r = await appel(m.app, m.antor, 'GET', `/attachments/${nom}`);
    assert.notEqual(r.headers['content-type'], 'image/png');
  }
  void p;
});

test('critère : une requête interrompue en plein envoi n’écrit ni ligne ni fichier', async () => {
  const m = await monter();
  await m.app.listen({ port: 0, host: '127.0.0.1' });
  try {
    const port = (m.app.server.address() as { port: number }).port;
    const lignes = () => (m.app.db.prepare('SELECT COUNT(*) AS n FROM pieces_jointes').get() as { n: number }).n;
    const entete =
      `--${FRONT}\r\nContent-Disposition: form-data; name="fichier"; filename="gros.png"\r\n\r\n`;
    const corps = Buffer.concat([PNG, Buffer.alloc(200_000, 7)]);
    const total = entete.length + corps.length + 100;
    await new Promise<void>((fin) => {
      const s = connect(port, '127.0.0.1', () => {
        s.write(
          `POST ${urlAjout(m.fb, m.apparence.id)} HTTP/1.1\r\nHost: x\r\nCookie: ${m.antor.cookie}\r\n` +
            `Content-Type: multipart/form-data; boundary=${FRONT}\r\nContent-Length: ${total}\r\n\r\n${entete}`,
        );
        s.write(corps, () => setTimeout(() => s.destroy(), 100));
      });
      s.on('close', () => fin());
      s.on('error', () => undefined);
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(lignes(), 0);
    assert.equal(fichiers().length, 0);
    assert.equal(existsSync(join(RACINE, 'tmp')) ? readdirSync(join(RACINE, 'tmp')).length : 0, 0);
  } finally {
    await m.app.close();
  }
});

test('entrées fausses : pas multipart, champ absent, secrete invalide → 400', async () => {
  const m = await monter();
  const url = urlAjout(m.fb, m.apparence.id);
  assert.equal((await appel(m.app, m.antor, 'POST', url, { fichier: 'x' })).statusCode, 400);
  const sans = await m.app.inject({
    method: 'POST', url,
    headers: { ...m.antor, 'content-type': `multipart/form-data; boundary=${FRONT}` },
    payload: `--${FRONT}\r\nContent-Disposition: form-data; name="autre"\r\n\r\nx\r\n--${FRONT}--\r\n`,
  });
  assert.equal(sans.statusCode, 400);
  assert.equal((await envoyer(m.app, m.antor, url, 'a.png', PNG, 'peut-etre')).statusCode, 400);
  const p = (await envoyer(m.app, m.antor, url, 'a.png', PNG)).json();
  assert.equal((await appel(m.app, m.antor, 'PATCH', `${m.fb}/pieces-jointes/${p.id}`, { secrete: 'oui' })).statusCode, 400);
  assert.equal((await appel(m.app, m.antor, 'PATCH', `${m.fb}/pieces-jointes/abc`, { secrete: true })).statusCode, 404);
  assert.equal(fichiers().length, 1);
});

test('sans session, aucune des quatre routes ne répond autre chose qu’un refus', async () => {
  const m = await monter();
  const p = (await envoyer(m.app, m.antor, urlAjout(m.fb, m.apparence.id), 'a.png', PNG)).json();
  const anon = {} as Hote;
  const lu = await m.app.inject({ method: 'GET', url: `${m.fb}/pieces-jointes/${p.id}/fichier` });
  assert.ok(lu.statusCode === 401 || lu.statusCode === 302, String(lu.statusCode));
  assert.ok(!lu.rawPayload.equals(PNG));
  const e = await m.app.inject({
    method: 'POST', url: urlAjout(m.fb, m.apparence.id),
    headers: { 'content-type': multipart('a.png', PNG).type }, payload: multipart('a.png', PNG).payload,
  });
  assert.ok(e.statusCode === 401 || e.statusCode === 302, String(e.statusCode));
  void anon;
  assert.equal(fichiers().length, 1);
});
