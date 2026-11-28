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

  test('the Release is created inside the « missing » branch only, and the upload comes after it', () => {
    const view = web.indexOf('if ! gh release view');
    const create = web.indexOf('gh release create');
    const fi = web.indexOf('\n          fi', create);
    const upload = web.indexOf('gh release upload');
    assert.ok(view >= 0 && create > view && fi > create, 'create must sit between the test and its fi');
    assert.ok(upload > fi, 'upload must follow the closed branch');
    assert.equal((web.match(/gh release create/g) ?? []).length, 1);
  });

  test('the pre-release flag depends on a « - » in the tag', () => {
    assert.match(web, /case "\$tag" in \*-\*\) pre="--prerelease"/);
    assert.match(web, /--verify-tag/);
  });

  test('the archive is taken from the exported stage, version from the metadata, and checksummed', () => {
    assert.match(web, /steps\.meta\.outputs\.version/);
    assert.match(web, /tar -C "\$RUNNER_TEMP\/web" -czf/);
    assert.match(web, /sha256sum "\$archive" > "\$archive\.sha256"/);
  });

  test('the workflow default stays read-only and the web job is gated by the attestation alone', () => {
    const haut = workflow.split('\njobs:')[0];
    assert.match(haut, /^permissions:\n {2}contents: read\n {2}packages: write$/m);
    assert.doesNotMatch(bloc('attestation'), /contents: write/);
  });
});
