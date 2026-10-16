import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';

import { openDb, migrate } from '../../db/db.js';
import { assurerCompte } from '../comptes.js';
import { creerUnivers } from '../univers.js';
import { ClaudeAgentTransport } from './claude-agent.js';
import { disponibilite } from './disponibilite.js';
import { ecrireJeton, etatJeton, jetonEffectif, supprimerJeton } from './jeton.js';
import { repondre } from './repondre.js';

const racine = () => mkdtempSync(join(tmpdir(), 'jeton-'));
const dirs = () => {
  const base = racine();
  return { base, claude: join(base, 'claude') };
};

test('fichier posé : état pose/instance/poseLe, 0600 dans 0700, aucun temporaire laissé', () => {
  const { claude } = dirs();
  const c = { CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: '' };
  assert.deepEqual(etatJeton(c), { pose: false, poseLe: null, source: null });
  ecrireJeton('sk-ant-oat01-fichier\n', c);
  const e = etatJeton(c);
  assert.equal(e.pose, true);
  assert.equal(e.source, 'instance');
  assert.match(e.poseLe!, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.equal(statSync(join(claude, 'oauth-token')).mode & 0o777, 0o600);
  assert.equal(statSync(claude).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(claude), ['oauth-token']);
  assert.equal(readFileSync(join(claude, 'oauth-token'), 'utf8'), 'sk-ant-oat01-fichier');
  assert.ok(!JSON.stringify(e).includes('sk-ant'));
});

test('disponibilité : claude-agent par le fichier seul, aucune après suppression, sans recréer de configuration', () => {
  const { claude } = dirs();
  const c = { CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: '' };
  assert.equal(disponibilite(c), 'aucune');
  ecrireJeton('tok-f', c);
  assert.equal(disponibilite(c), 'claude-agent');
  supprimerJeton(c);
  assert.equal(disponibilite(c), 'aucune');
  assert.deepEqual(readdirSync(claude), []);
  assert.equal(disponibilite({ ...c, KANEVAS_STUB: '1' }), 'bouchon');
});

test('fichier absent/vide/blanc : on retombe sur la variable (deploiement, sans date)', () => {
  const { claude } = dirs();
  const c = { CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: ' tok-env ' };
  assert.deepEqual(etatJeton(c), { pose: true, poseLe: null, source: 'deploiement' });
  assert.equal(jetonEffectif(c), 'tok-env');
  mkdirSync(claude, { recursive: true });
  writeFileSync(join(claude, 'oauth-token'), '  \n');
  assert.equal(etatJeton(c).source, 'deploiement');
  assert.equal(jetonEffectif(c), 'tok-env');
  assert.equal(disponibilite({ CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: '   ' }), 'aucune');
});

test('le fichier prime sur une variable différente ; réécriture remplace', () => {
  const { claude } = dirs();
  const c = { CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: 'tok-env' };
  ecrireJeton('tok-un', c);
  assert.equal(jetonEffectif(c), 'tok-un');
  assert.equal(etatJeton(c).source, 'instance');
  ecrireJeton('tok-deux', c);
  assert.equal(jetonEffectif(c), 'tok-deux');
  assert.deepEqual(readdirSync(claude), ['oauth-token']);
  supprimerJeton(c);
  supprimerJeton(c);
  assert.equal(jetonEffectif(c), 'tok-env');
});

test('dossier préexistant en 0755 est resserré en 0700', () => {
  const { claude } = dirs();
  mkdirSync(claude, { mode: 0o755 });
  ecrireJeton('t', { CLAUDE_DIR: claude });
  assert.equal(statSync(claude).mode & 0o777, 0o700);
});

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const u = creerUnivers(db, antor.id, { nom: 'U' });
  return { db, antor, u };
}

async function jetonUtilise(config: object): Promise<string | undefined> {
  const { db, antor, u } = monde();
  let vu: string | undefined;
  const m = mock.method(ClaudeAgentTransport.prototype, 'repondre', async function (this: any) {
    vu = this.options.jeton;
    return 'ok';
  });
  try {
    await repondre(db, antor.id, u.id, 'salut', [], { config });
  } finally {
    m.mock.restore();
  }
  return vu;
}

test('repondre : le jeton du fichier prime sur la variable ; sans fichier, la variable ; ni l’un ni l’autre : indisponible', async () => {
  const { claude } = dirs();
  const c = { CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: 'tok-env' };
  assert.equal(await jetonUtilise(c), 'tok-env');
  ecrireJeton('tok-fichier', c);
  assert.equal(await jetonUtilise(c), 'tok-fichier');
  assert.equal(await jetonUtilise({ CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: '' }), 'tok-fichier');
  supprimerJeton(c);
  await assert.rejects(jetonUtilise({ CLAUDE_DIR: claude, CLAUDE_CODE_OAUTH_TOKEN: '' }), (e: any) => e.code === 'assistant_indisponible');
});
