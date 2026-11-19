// kanevas-build-limite: every job of the image-build workflow is bounded to 120 minutes, and the
// README says, next to that limit, how long a stable build usually takes (40 to 55 minutes).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(join(RACINE, '.github/workflows/docker-publish.yml'), 'utf8');
const readme = readFileSync(join(RACINE, 'README.md'), 'utf8');

// Top-level jobs: the keys indented by two spaces under `jobs:`, each with its own block.
function jobs(yaml: string): Map<string, string> {
  const lignes = yaml.split('\n');
  const debut = lignes.findIndex((l) => /^jobs:\s*$/.test(l));
  assert.ok(debut >= 0, 'no `jobs:` key');
  const res = new Map<string, string[]>();
  let courant: string[] | null = null;
  for (const l of lignes.slice(debut + 1)) {
    if (/^\S/.test(l)) break; // another top-level key ends `jobs:`
    const m = l.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) { courant = []; res.set(m[1], courant); continue; }
    courant?.push(l);
  }
  return new Map([...res].map(([k, v]) => [k, v.join('\n')]));
}

// The value of the job's own `timeout-minutes` (four-space indent: not a step's key).
function limite(bloc: string): number | null {
  const m = bloc.match(/^ {4}timeout-minutes:\s*(\d+)\s*(?:#.*)?$/m);
  return m ? Number(m[1]) : null;
}

// The README section that talks about the image build, up to the next heading.
function sectionBuild(md: string): string {
  const i = md.indexOf('An image is built only on a `v*` tag');
  assert.ok(i >= 0, 'image-build paragraph not found in README');
  const reste = md.slice(i);
  const fin = reste.search(/\n#{1,6} /);
  return fin < 0 ? reste : reste.slice(0, fin);
}

describe('docker-publish: build bounded to 120 minutes', () => {
  test('the workflow has the two jobs attestation and build', () => {
    assert.deepEqual([...jobs(workflow).keys()], ['attestation', 'build']);
  });

  test('every job declares timeout-minutes: 120', () => {
    for (const [nom, bloc] of jobs(workflow)) {
      assert.equal(limite(bloc), 120, `job ${nom}`);
    }
  });

  test('a step-level timeout does not count as the job limit', () => {
    const faux = 'jobs:\n  a:\n    runs-on: x\n    steps:\n      - run: y\n        timeout-minutes: 120\n';
    assert.equal(limite(jobs(faux).get('a')!), null);
  });

  test('a job without the key, or with another value, is seen', () => {
    const faux = 'jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 120\n  b:\n    runs-on: x\n  c:\n    timeout-minutes: 360\n';
    const j = jobs(faux);
    assert.deepEqual([limite(j.get('a')!), limite(j.get('b')!), limite(j.get('c')!)], [120, null, 360]);
  });

  test('the triggers and permissions stay: tag v*, manual re-run, read contents, write packages', () => {
    assert.match(workflow, /^on:\n {2}push:\n {4}tags: \['v\*'\]/m);
    assert.match(workflow, /^ {2}workflow_dispatch:/m);
    assert.match(workflow, /^permissions:\n {2}contents: read\n {2}packages: write\n/m);
  });

  test('the README gives 40 to 55 minutes for a stable build next to the 120-minute limit', () => {
    const s = sectionBuild(readme);
    assert.match(s, /120 minutes/);
    assert.match(s, /40 to 55 minutes/);
  });

  test('the README section is the one of the image build, not elsewhere', () => {
    assert.match(sectionBuild(readme), /docker-publish\.yml/);
    assert.match(sectionBuild(readme), /amd64 \+ arm64/);
  });
});
