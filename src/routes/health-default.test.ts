import assert from 'node:assert/strict';
import { test } from 'node:test';

delete process.env.APP_VERSION;
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../app.js');

test('without APP_VERSION, /healthz shows the dev default, not a package.json value', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.body, 'kanevas 0.0.0-dev');
  await app.close();
});
