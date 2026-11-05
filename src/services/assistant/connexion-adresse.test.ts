import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
const { tirerAdresse } = await import('./connexion-claude.js');

const ADRESSE =
  'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=kiAAuITfbSxaI5DWADfre289iXeHptAMW6A6ZSmJfqw&code_challenge_method=S256&state=GOvzPd0bK-K416xWwdzvs_leRQnNrkSSWb1McOyN-Y4';

// Real output of Claude Code 2.1.287 (production pod, 2026-10-25).
const SORTIE_REELLE =
  'Welcome to Claude Code v2.1.287\r\n' +
  'This will guide you through long-lived (1-year) auth token setup for your Claude account. Claude subscription required.\r\n' +
  "Browser didn't open? Use the url below to sign in (c to copy)\r\n" +
  `\u001b]8;id=7ud7zt;${ADRESSE}\u001b\\${ADRESSE}\u001b]8;;\u001b\\\r\n` +
  'Paste code here if prompted >';

test("tirerAdresse rend l'adresse en clair de la sortie réelle du CLI 2.1.287 (OSC 8), sans concaténation", () => {
  assert.equal(tirerAdresse(SORTIE_REELLE), ADRESSE);
});

test('tirerAdresse : même sortie coupée en morceaux de flux, adresse complète seulement', () => {
  assert.equal(tirerAdresse(SORTIE_REELLE.slice(0, 200)), null);
  assert.equal(tirerAdresse(SORTIE_REELLE), ADRESSE);
});

test('tirerAdresse accepte claude.com et ses sous-domaines, comme claude.ai et anthropic.com', () => {
  assert.equal(tirerAdresse('https://claude.com/a'), 'https://claude.com/a');
  assert.equal(tirerAdresse('https://platform.claude.com/a?b=1'), 'https://platform.claude.com/a?b=1');
  assert.equal(tirerAdresse('https://claude.ai/a'), 'https://claude.ai/a');
  assert.equal(tirerAdresse('https://console.anthropic.com/a'), 'https://console.anthropic.com/a');
});

test('tirerAdresse refuse les autres hôtes, les faux suffixes et le http', () => {
  for (const s of [
    'https://notclaude.com/a',
    'https://claude.com.evil.example/a',
    'https://evil.example/claude.com',
    'https://claude.com@evil.example/a',
    'https://claude.org/a',
    'https://example.com/a',
    'http://claude.com/a',
    '',
  ]) {
    assert.equal(tirerAdresse(s), null, s);
  }
  assert.equal(tirerAdresse('https://evil.example/x https://claude.com/ok'), 'https://claude.com/ok');
});
