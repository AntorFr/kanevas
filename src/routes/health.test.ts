import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// env.ts parses process.env at import time: set it before importing the app.
process.env.APP_VERSION = '0.1.0';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../app.js');

test('/healthz answers "kanevas <APP_VERSION>" as plain text', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['content-type']), /^text\/plain/);
  assert.equal(res.body, 'kanevas 0.1.0');
  await app.close();
});

test('package.json carries no version: APP_VERSION is the only source', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal('version' in pkg, false);
});
