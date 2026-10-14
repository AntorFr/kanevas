// Black-box test of the E-5 re-opened gap (AD-112): the code route carries a `connexionId` and answers
// 410 `connexion_expiree` when it is not the current session's. Real server in stub mode, HTTP through a
// signed-in Admin context. Expected values are literals from ARCHITECTURE.md (routes) and docs/ecrans.md.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.ts';

const ROUTE = '/api/instance/assistant/jeton';
const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

async function monde(): Promise<{ admin: Any; fichier: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-jeton-id-'));
  const s = await startServer({ CLAUDE_DIR: dir });
  const browser = await launch();
  aFermer.push(async () => {
    await browser.close();
    s.stop();
    rmSync(dir, { recursive: true, force: true });
  });
  return { admin: await connecte(browser, s.base, 'Admin'), fichier: join(dir, 'oauth-token') };
}

const ouvrir = async (admin: Any) => (await (await admin.ctx.request.post(ROUTE + '/connexion')).json()).connexionId as string;

describe('jeton de l’assistant : le code porte le connexionId de sa connexion (E-5, AD-112)', { skip: skipBrowser }, () => {
  // Panne visée : la route de code accepte le code d'une connexion remplacée (le connexionId n'est pas comparé).
  it('le code d’une connexion remplacée dit 410 connexion_expiree, ne pose rien et laisse la connexion courante valide', async () => {
    const { admin, fichier } = await monde();
    const ancien = await ouvrir(admin);
    const courant = await ouvrir(admin);
    assert.notEqual(ancien, courant);
    const vieux = await admin.ctx.request.post(ROUTE + '/code', { data: { connexionId: ancien, code: 'bouchon' } });
    assert.equal(vieux.status(), 410);
    assert.equal((await vieux.json()).code, 'connexion_expiree');
    assert.equal(existsSync(fichier), false);
    const ok = await admin.ctx.request.post(ROUTE + '/code', { data: { connexionId: courant, code: 'bouchon' } });
    assert.equal(ok.status(), 200);
    assert.equal((await ok.json()).pose, true);
    assert.equal(existsSync(fichier), true);
  });

  // Panne visée : un connexionId inconnu avec le bon code pose le jeton, ou termine la session courante.
  it('un connexionId inconnu dit 410 sans poser ni terminer la connexion courante', async () => {
    const { admin, fichier } = await monde();
    const courant = await ouvrir(admin);
    const r = await admin.ctx.request.post(ROUTE + '/code', { data: { connexionId: 'inconnu', code: 'bouchon' } });
    assert.equal(r.status(), 410);
    assert.equal((await r.json()).code, 'connexion_expiree');
    assert.equal(existsSync(fichier), false);
    assert.equal((await admin.ctx.request.post(ROUTE + '/code', { data: { connexionId: courant, code: 'bouchon' } })).status(), 200);
  });

  // Panne visée : un connexionId absent ou vide est accepté comme « la connexion courante ».
  it('un connexionId absent ou vide dit 400 et ne pose rien', async () => {
    const { admin, fichier } = await monde();
    const courant = await ouvrir(admin);
    for (const data of [{ code: 'bouchon' }, { connexionId: '', code: 'bouchon' }]) {
      assert.equal((await admin.ctx.request.post(ROUTE + '/code', { data })).status(), 400);
    }
    assert.equal(existsSync(fichier), false);
    assert.equal((await admin.ctx.request.post(ROUTE + '/code', { data: { connexionId: courant, code: 'bouchon' } })).status(), 200);
  });
});
