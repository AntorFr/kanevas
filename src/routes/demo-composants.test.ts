// kanevas-rv-composants: `/demo-composants` exists only in stub mode (AD-55); without it the address
// is unknown ("Page introuvable.", 404) even for a signed-in account. Expected values are literals.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const racine = mkdtempSync(join(tmpdir(), 'kanevas-demo-'));
mkdirSync(join(racine, 'assets'));
writeFileSync(join(racine, 'index.html'), '<html><head></head><body>SHELL</body></html>');

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
delete process.env.DB_PATH;
process.env.FRONTEND_DIR = racine;
process.env.OIDC_ISSUER = 'http://127.0.0.1:1/';
process.env.OIDC_CLIENT_ID = 'kanevas';
process.env.OIDC_CLIENT_SECRET = 'secret';
process.env.OIDC_REDIRECT_URI = 'https://kanevas.example/api/auth/oidc/callback';

const { buildApp } = await import('../app.js');
const { assurerCompte } = await import('../services/comptes.js');
const { encoderSession, SESSION_COOKIE } = await import('../services/session.js');

test('hors bouchon, avec une session : /demo-composants (et variantes) répond 404, une autre adresse sert le shell', async () => {
  const app = await buildApp();
  const compte = assurerCompte(app.db, 'antor');
  const cookie = `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: compte.id, groups: [] }))}`;
  const ok = await app.inject({ url: '/univers', headers: { cookie } });
  assert.equal(ok.statusCode, 200, 'la session forgée est bien acceptée');
  assert.ok(ok.body.includes('SHELL'));
  for (const url of ['/demo-composants', '/demo-composants/', '/demo-composants?x=1']) {
    const r = await app.inject({ url, headers: { cookie } });
    assert.equal(r.statusCode, 404, url);
    assert.ok(!r.body.includes('SHELL'), url);
  }
  await app.close();
});
