// kanevas-web-publie (AD-web-publie-5, AD-web-publie-6): the `web` job of the release workflow
// is gated like the image, builds no Rust, and uploads the archive and its checksum.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(join(RACINE, '.github/workflows/docker-publish.yml'), 'utf8');

function bloc(nom: string): string {
  const lignes = workflow.split('\n');
  const debut = lignes.findIndex((l) => l === `  ${nom}:`);
  assert.ok(debut >= 0, `job ${nom} not found`);
  const fin = lignes.findIndex((l, i) => i > debut && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
  return lignes.slice(debut, fin < 0 ? undefined : fin).join('\n');
}

describe('docker-publish: the web job', () => {
  const web = bloc('web');

  test('it needs the attestation', () => {
    assert.match(web, /^ {4}needs: attestation\s*$/m);
  });

  test('it has no cargo, rustup or wasm-bindgen step', () => {
    assert.doesNotMatch(web, /cargo|rustup|wasm-bindgen/);
  });

  test('it exports the web stage for linux/amd64', () => {
    assert.match(web, /target: web\b/);
    assert.match(web, /platforms: linux\/amd64\s*$/m);
    assert.match(web, /type=local/);
  });

  test('contents: write is on this job only', () => {
    assert.match(web, /^ {4}permissions:\n {6}contents: write\s*$/m);
    assert.equal((workflow.match(/contents: write/g) ?? []).length, 1);
  });

  test('it uploads kanevas-web-<version>.tar.gz and its .sha256, creating the Release only when missing', () => {
    assert.match(web, /kanevas-web-\$\{VERSION\}\.tar\.gz"/);
    assert.match(web, /kanevas-web-\$\{VERSION\}\.tar\.gz\.sha256"/);
    assert.match(web, /gh release upload .*--clobber/);
    assert.match(web, /if ! gh release view/);
    assert.match(web, /gh release create .*--verify-tag/s);
    assert.match(web, /--prerelease/);
  });

  test('the image build job carries no web step', () => {
    const build = bloc('build');
    assert.doesNotMatch(build, /target: web|gh release|contents: write/);
  });
});
