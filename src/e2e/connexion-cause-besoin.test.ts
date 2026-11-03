// Black-box tests of `kanevas-tests-attestes-pod`, Claude connection: whatever the program behind « Connecter » does
// wrong, the route answers the same 502 `connexion_impossible` as before, nothing of the program's output reaches the
// client, and the service keeps the cause of its last failure. The app is the real one (stub login, real routes).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any } from './harnais.test.ts';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');

const URL_CONNEXION = '/api/instance/assistant/jeton/connexion';
const CORPS_502 = { message: 'La connexion à l’abonnement n’a pas pu démarrer.', code: 'connexion_impossible' };

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

async function monter() {
  const app = await buildApp();
  aFermer.push(() => app.close());
  app.assistantDeps.config = { CLAUDE_CODE_OAUTH_TOKEN: '', KANEVAS_STUB: '1' } as Any;
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'compte=admin',
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { app, cookie: `kanevas_session=${c.value}` };
}

const node = (js: string) => ({ commande: process.execPath, args: ['-e', js] });

async function essayer(app: Any, cookie: string, programme: Any, delaiAdresse: number) {
  app.connexionClaude.options.programme = programme;
  app.connexionClaude.options.delaiAdresse = delaiAdresse;
  return app.inject({ method: 'POST', url: URL_CONNEXION, headers: { cookie } });
}

describe('kanevas-tests-attestes-pod : « Connecter » en échec garde sa cause et ne change pas la réponse', () => {
  // Panne visée : la cause « sorti avec le code N » + la sortie n'est plus gardée, ou la réponse change.
  it('programme qui sort aussitôt (code 3, « boom ») : 502 au corps inchangé, cause « sorti avec le code 3 » et « boom »', async () => {
    const { app, cookie } = await monter();
    const r = await essayer(app, cookie, node(`process.stdout.write('boom'); process.exit(3)`), 3000);
    assert.equal(r.statusCode, 502);
    assert.deepEqual(r.json(), CORPS_502);
    assert.ok(!r.body.includes('boom'), 'rien de la sortie du programme dans la réponse');
    const cause = String(app.connexionClaude.derniereCause);
    assert.match(cause, /sorti avec le code 3/);
    assert.match(cause, /boom/);
  });

  // Panne visée : la cause « délai dépassé » n'est pas distinguée.
  it('programme muet jusqu’au délai : 502 au corps inchangé, cause « délai dépassé »', async () => {
    const { app, cookie } = await monter();
    const r = await essayer(app, cookie, node(`setTimeout(()=>{}, 60000)`), 400);
    assert.equal(r.statusCode, 502);
    assert.deepEqual(r.json(), CORPS_502);
    assert.match(String(app.connexionClaude.derniereCause), /délai dépassé/);
  });

  // Panne visée : un programme introuvable n'est pas dit « lancement impossible ».
  it('programme introuvable : 502 au corps inchangé, cause « lancement impossible »', async () => {
    const { app, cookie } = await monter();
    const r = await essayer(app, cookie, { commande: '/nulle/part/claude-introuvable', args: [] }, 3000);
    assert.equal(r.statusCode, 502);
    assert.deepEqual(r.json(), CORPS_502);
    assert.match(String(app.connexionClaude.derniereCause), /lancement impossible/);
  });

  // Bord : un code différent est dit tel quel.
  it('programme qui sort avec le code 7 : la cause dit « sorti avec le code 7 »', async () => {
    const { app, cookie } = await monter();
    await essayer(app, cookie, node(`process.exit(7)`), 3000);
    assert.match(String(app.connexionClaude.derniereCause), /sorti avec le code 7/);
  });

  // Bord : une longue sortie ne donne que sa fin, bornée.
  it('programme qui sort après 100 000 caractères : la cause porte la fin de la sortie, pas le début, et reste courte', async () => {
    const { app, cookie } = await monter();
    const js = `process.stdout.write('DEBUT-5582 ' + 'y'.repeat(100000) + ' FIN-5582'); process.exit(2)`;
    await essayer(app, cookie, node(js), 5000);
    const cause = String(app.connexionClaude.derniereCause);
    assert.match(cause, /FIN-5582/);
    assert.ok(!cause.includes('DEBUT-5582'));
    assert.ok(cause.length < 5000, `${cause.length} caractères`);
  });

  // Bord : la cause est celle du dernier échec.
  it('deux échecs de suite : la cause gardée est celle du dernier', async () => {
    const { app, cookie } = await monter();
    await essayer(app, cookie, node(`process.exit(3)`), 3000);
    assert.match(String(app.connexionClaude.derniereCause), /code 3/);
    await essayer(app, cookie, node(`setTimeout(()=>{}, 60000)`), 400);
    const cause = String(app.connexionClaude.derniereCause);
    assert.match(cause, /délai dépassé/);
    assert.ok(!/code 3/.test(cause), cause);
  });

  // Exclusion : un succès reste un 201 (la cause ne change pas le chemin nominal).
  it('programme qui imprime une adresse claude.com : 201 avec l’adresse', async () => {
    const { app, cookie } = await monter();
    const adresse = 'https://claude.com/cai/oauth/authorize?code=true&state=abc';
    const r = await essayer(app, cookie, node(`process.stdout.write(${JSON.stringify(adresse + '\n')}); setTimeout(()=>{}, 60000)`), 3000);
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().adresse, adresse);
    await app.inject({ method: 'DELETE', url: URL_CONNEXION, headers: { cookie } });
  });
});
