// AD-niveau-7: the tag's build accepts only a `success` tests-complets status whose description starts with « niveau ».
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');
const yaml = readFileSync(join(RACINE, '.github/workflows/docker-publish.yml'), 'utf8');

// The `run: |` block of the step of the `attestation` job that reads the status.
function scriptDuJob(): string {
  const debut = yaml.indexOf('\n  attestation:');
  const fin = yaml.indexOf('\n  build:');
  const job = yaml.slice(debut, fin);
  const m = job.match(/\n( +)run: \|\n([\s\S]*)$/);
  assert.ok(m, 'run: | introuvable dans le job attestation');
  const indent = m[1].length + 2;
  return m[2]
    .split('\n')
    .map((l) => l.slice(indent))
    .join('\n')
    .replace(/\$\{\{ github\.repository \}\}/g, 'o/r')
    .replace(/\$\{\{ github\.sha \}\}/g, 'SHA');
}

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'statut-niveau-'));
  const sh = (c: string) => spawnSync('sh', ['-c', c], { cwd: dir, encoding: 'utf8' });
  sh('git init -q . && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m un');
  // Fake gh: prints what the real one would after its --jq filter (or nothing when no status).
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\n[ -n "$FAUX_STATUT" ] && echo "$FAUX_STATUT"\nexit 0\n');
  chmodSync(join(dir, 'gh'), 0o755);
  writeFileSync(join(dir, 'job.sh'), scriptDuJob());
});
after(() => rmSync(dir, { recursive: true, force: true }));

function jouer(statut: string) {
  return spawnSync('bash', ['-e', 'job.sh'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAUX_STATUT: statut },
  });
}

describe('docker-publish : le statut doit dire son niveau', () => {
  test('« success niveau fiche · … » passe', () => {
    const r = jouer('success niveau fiche · 997 tests, 3 écrans');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /niveau fiche/);
  });
  test('« success 997 tests » (sans niveau) est refusé avec la commande à lancer', () => {
    const r = jouer('success 997 tests');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /attester --publier/);
    assert.match(r.stdout + r.stderr, /niveau/);
  });
  test('« failure niveau … » est refusé', () => {
    const r = jouer('failure niveau fiche · 2 rouges');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /attester --publier/);
  });
  test('un état success dont le mot « niveau » n’ouvre pas la description est refusé', () => {
    assert.notEqual(jouer('success tous niveaux confondus').status, 0);
  });
  test('l’absence de statut est refusée avec la commande à lancer', () => {
    const r = jouer('');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /attester --publier/);
  });
});
