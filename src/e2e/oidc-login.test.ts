import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer, type Server } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { test } from 'node:test';

// Black-box tests of B-28 (kanevas-socle): login leads to the identity
// provider (Authelia), and its return answers the identifier of the connected
// account. Authelia is an external service: a fake provider stands in for it;
// the Kanevas server is the real process, reached over real HTTP.

// Self-signed test certificate: Authelia is served over TLS and the OIDC client
// refuses plain http issuers, so the fake provider speaks TLS too.
const IDP_KEY = readFileSync(new URL('./fixtures/fake-idp-key.pem', import.meta.url));
const IDP_CERT = readFileSync(new URL('./fixtures/fake-idp-cert.pem', import.meta.url));
const IDP_CERT_PATH = new URL('./fixtures/fake-idp-cert.pem', import.meta.url).pathname;

const SUBJECT = 'acct-7f3a-lea';
const USERNAME = 'lea';
const CLIENT_ID = 'kanevas';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function startFakeAuthelia(opts: { rejectToken?: boolean } = {}) {
  const port = await freePort();
  const issuer = `https://127.0.0.1:${port}`;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const server: Server = createHttpsServer({ key: IDP_KEY, cert: IDP_CERT }, (req, res) => {
    const url = new URL(req.url ?? '/', issuer);
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/api/oidc/authorization`,
        token_endpoint: `${issuer}/api/oidc/token`,
        userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
        jwks_uri: `${issuer}/jwks.json`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.pathname === '/jwks.json') return json(200, { keys: [jwk] });
    if (url.pathname === '/api/oidc/token') {
      if (opts.rejectToken) return json(400, { error: 'invalid_grant' });
      const now = Math.floor(Date.now() / 1000);
      const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
      const body = b64({ iss: issuer, sub: SUBJECT, aud: CLIENT_ID, iat: now, exp: now + 300 });
      const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
      return json(200, {
        access_token: 'at-1',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: `${head}.${body}.${sig}`,
      });
    }
    if (url.pathname === '/api/oidc/userinfo') {
      return json(200, { sub: SUBJECT, preferred_username: USERNAME, groups: ['joueurs'] });
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return { issuer, stop: () => server.close() };
}

async function startKanevas(extraEnv: Record<string, string>, fixedPort?: number) {
  const port = fixedPort ?? (await freePort());
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: IDP_CERT_PATH };
  for (const k of ['APP_VERSION', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']) {
    delete env[k];
  }
  Object.assign(env, extraEnv);
  const child: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/healthz`);
      return { base, redirectUri: `${base}/api/auth/oidc/callback`, stop: () => child.kill('SIGKILL') };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill('SIGKILL');
  throw new Error('server did not start');
}

async function withLogin<T>(
  fakeOpts: { rejectToken?: boolean },
  fn: (ctx: { base: string; issuer: string; redirectUri: string }) => Promise<T>,
) {
  const idp = await startFakeAuthelia(fakeOpts);
  const port = await freePort();
  const redirectUri = `http://127.0.0.1:${port}/api/auth/oidc/callback`;
  const k = await startKanevas({
    OIDC_ISSUER: idp.issuer,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: 's3cret',
    OIDC_REDIRECT_URI: redirectUri,
  }, port);
  try {
    return await fn({ base: k.base, issuer: idp.issuer, redirectUri });
  } finally {
    k.stop();
    idp.stop();
  }
}

function txCookie(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('kanevas_oidc_tx='));
  assert.ok(raw, 'login must set the transaction cookie');
  return raw.split(';')[0];
}

test('B-28 login sends the visitor to Authelia with the kanevas client and the callback address', async () => {
  await withLogin({}, async ({ base, issuer, redirectUri }) => {
    const res = await fetch(`${base}/api/auth/oidc/login`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const loc = new URL(res.headers.get('location') ?? '');
    assert.equal(`${loc.origin}${loc.pathname}`, `${issuer}/api/oidc/authorization`);
    assert.equal(loc.searchParams.get('client_id'), 'kanevas');
    assert.equal(loc.searchParams.get('response_type'), 'code');
    assert.equal(loc.searchParams.get('redirect_uri'), redirectUri);
    assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(loc.searchParams.get('state'));
    assert.ok(loc.searchParams.get('scope')?.split(' ').includes('openid'));
  });
});

test('B-28 the return from Authelia opens the session of the connected account, whose identifier the session route answers', async () => {
  await withLogin({}, async ({ base }) => {
    const login = await fetch(`${base}/api/auth/oidc/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state');
    const res = await fetch(`${base}/api/auth/oidc/callback?code=abc&state=${state}`, {
      headers: { cookie: txCookie(login) },
      redirect: 'manual',
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
    const session = res.headers.getSetCookie().find((c) => c.startsWith('kanevas_session='));
    assert.ok(session, 'the return must open the session cookie');
    const moi = await fetch(`${base}/api/moi`, { headers: { cookie: session.split(';')[0] } });
    assert.equal(moi.status, 200);
    const body = (await moi.json()) as Record<string, unknown>;
    assert.equal(body.username, 'lea');
  });
});

test('B-28 a successful return opens the session and clears the transaction cookie, touching no other cookie', async () => {
  await withLogin({}, async ({ base }) => {
    const login = await fetch(`${base}/api/auth/oidc/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state');
    const res = await fetch(`${base}/api/auth/oidc/callback?code=abc&state=${state}`, {
      headers: { cookie: txCookie(login) },
      redirect: 'manual',
    });
    const cookies = res.headers.getSetCookie();
    for (const c of cookies) {
      assert.ok(
        c.startsWith('kanevas_oidc_tx=') || c.startsWith('kanevas_session='),
        `unexpected cookie set: ${c}`,
      );
    }
    assert.ok(cookies.some((c) => c.startsWith('kanevas_session=') && !/Max-Age=0/i.test(c)), 'session cookie set');
    const tx = cookies.find((c) => c.startsWith('kanevas_oidc_tx='));
    assert.ok(tx && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(tx), 'transaction cookie cleared');
  });
});

test('B-28 a return with a state that is not the one issued is refused and names no account', async () => {
  await withLogin({}, async ({ base }) => {
    const login = await fetch(`${base}/api/auth/oidc/login`, { redirect: 'manual' });
    const res = await fetch(`${base}/api/auth/oidc/callback?code=abc&state=forged`, {
      headers: { cookie: txCookie(login) },
    });
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.equal(JSON.parse(text).authenticated, false);
    assert.equal(text.includes('acct-7f3a-lea'), false);
  });
});

test('B-28 a return without ever having logged in is refused', async () => {
  await withLogin({}, async ({ base }) => {
    const res = await fetch(`${base}/api/auth/oidc/callback?code=abc&state=x`);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { authenticated: boolean }).authenticated, false);
  });
});

test('B-28 when Authelia refuses the code, the answer is a refusal, not an account', async () => {
  await withLogin({ rejectToken: true }, async ({ base }) => {
    const login = await fetch(`${base}/api/auth/oidc/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state');
    const res = await fetch(`${base}/api/auth/oidc/callback?code=bad&state=${state}`, {
      headers: { cookie: txCookie(login) },
    });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { authenticated: boolean }).authenticated, false);
  });
});

test('B-28 with only part of the OIDC settings, login and callback answer 404', async () => {
  const k = await startKanevas({ OIDC_ISSUER: 'http://127.0.0.1:9', OIDC_CLIENT_ID: 'kanevas' });
  try {
    assert.equal((await fetch(`${k.base}/api/auth/oidc/login`, { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(`${k.base}/api/auth/oidc/callback?code=a&state=b`)).status, 404);
  } finally {
    k.stop();
  }
});
