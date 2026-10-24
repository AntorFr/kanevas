import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/controle-langue.mjs');

const ANGLAIS = [
  'Intro text.',
  '',
  '## First',
  'The title is quoted: « le titre est dans la liste ».',
  '',
  '```',
  'le code est dans la liste avec une règle pour les AD-99',
  '```',
  '',
  'See AD-12 and B-3.',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '| 3 | 4 |',
  '',
  '## Second',
  'Plain [link](#first) and [other](#second).',
  '',
].join('\n');

function depot(contenu: string) {
  const dir = mkdtempSync(join(tmpdir(), 'cl-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'a.md'), contenu);
  git('add', 'a.md');
  git('commit', '-q', '-m', 'base');
  return dir;
}
function lancer(dir: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env });
  let json: any = null;
  try { json = JSON.parse(r.stdout); } catch { /* none */ }
  return { code: r.status, json, err: r.stderr };
}
const avec = (contenu: string, args: string[], f: (r: ReturnType<typeof lancer>, d: string) => void) => {
  const dir = depot(ANGLAIS);
  try { writeFileSync(join(dir, 'a.md'), contenu); f(lancer(dir, ['--base', 'HEAD', ...args, 'a.md']), dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test('anglais avec citation française et bloc de code : zéro, code 0', () => {
  avec(ANGLAIS, ['--liens'], (r) => {
    assert.equal(r.code, 0);
    assert.equal(r.json.fichiers[0].francais, 0);
    assert.deepEqual(r.json.fichiers[0].ecarts, []);
    assert.deepEqual(r.json.fichiers[0].liens, []);
  });
});

test('une phrase française hors guillemets : un par mot fautif, par section', () => {
  // le, la, les, des, est, pour, avec, une, dans -> 9 mots ; « Le » compte (casse)
  const phrase = 'Le chat est dans la maison pour les amis avec une table des';
  avec(ANGLAIS.replace('Intro text.', phrase), [], (r) => {
    assert.equal(r.code, 1);
    assert.equal(r.json.fichiers[0].francais, 9);
    assert.equal(r.json.fichiers[0].sections[0].francais, 9);
    assert.equal(r.json.fichiers[0].sections[1].francais, 0);
  });
});

test('mots entiers seulement : "lemon", "island", "dansant" ne comptent pas', () => {
  avec(ANGLAIS.replace('Intro text.', 'lemon island dansant pourquoi laser'), [], (r) => {
    assert.equal(r.code, 0);
    assert.equal(r.json.fichiers[0].francais, 0);
  });
});

test('un mot français dans le code ou entre guillemets ne compte pas, mais hors guillemets après la citation oui', () => {
  avec(ANGLAIS.replace('« le titre est dans la liste ».', '« le titre » est ici'), [], (r) => {
    assert.equal(r.json.fichiers[0].francais, 1);
  });
});

test('citation sur plusieurs lignes : exemptée', () => {
  avec(ANGLAIS.replace('Intro text.', 'Say « le\nchat est dans\nla maison » now.'), [], (r) => {
    assert.equal(r.code, 0);
  });
});

test('guillemets imbriqués : le français reste exempté jusqu\'au « » extérieur', () => {
  avec(ANGLAIS.replace('Intro text.', 'Say « le « chat » est dans la » now.'), [], (r) => assert.equal(r.code, 0));
});

test('AD-12 supprimé : signalé dans sa section', () => {
  avec(ANGLAIS.replace('See AD-12 and B-3.', 'See B-3.'), [], (r) => {
    assert.equal(r.code, 1);
    const s = r.json.fichiers[0].sections[1];
    assert.deepEqual(s.ecarts, [{ fait: 'AD-12', avant: 1, apres: 0 }]);
    assert.deepEqual(r.json.fichiers[0].sections[2].ecarts, []);
  });
});

test('un identifiant ajouté est aussi un écart', () => {
  avec(ANGLAIS.replace('See AD-12', 'See P-7 AD-12'), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.fichiers[0].sections[1].ecarts, [{ fait: 'P-7', avant: 0, apres: 1 }]);
  });
});

test('titre ajouté : signalé', () => {
  avec(ANGLAIS.replace('See AD-12', '### Sub\nSee AD-12'), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.fichiers[0].sections[1].ecarts, [{ fait: 'titres', avant: 1, apres: 2 }]);
  });
});

test('ligne de tableau perdue (séparateur exclu) : signalée', () => {
  avec(ANGLAIS.replace('| 3 | 4 |\n', ''), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.fichiers[0].sections[1].ecarts, [{ fait: 'tableaux', avant: 3, apres: 2 }]);
  });
});

test('bloc de code perdu : signalé, et le titre factice dans un bloc ne compte pas', () => {
  avec(ANGLAIS.replace(/```[\s\S]*?```\n/, ''), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.fichiers[0].sections[1].ecarts, [
      { fait: 'blocs', avant: 1, apres: 0 }, { fait: 'AD-99', avant: 1, apres: 0 },
    ]);
  });
  const avecFaux = ANGLAIS.replace('le code est', '## Fake\nle code est');
  avec(avecFaux, [], (r) => { assert.equal(r.code, 0); assert.equal(r.json.fichiers[0].sections.length, 3); });
});

test('numérotation : 0 avant le premier ##, texte de la section 0 séparé', () => {
  avec(ANGLAIS, [], (r) => {
    assert.deepEqual(r.json.fichiers[0].sections.map((s: any) => [s.numero, s.titre]),
      [[0, ''], [1, 'First'], [2, 'Second']]);
  });
  const dir = depot(ANGLAIS);
  try {
    const t = lancer(dir, ['--titres', 'a.md']);
    assert.equal(t.code, 0);
    assert.deepEqual(t.json.fichiers[0].sections,
      [{ numero: 0, titre: '' }, { numero: 1, titre: 'First' }, { numero: 2, titre: 'Second' }]);
    const s = lancer(dir, ['--base', 'HEAD', '--sections', 'a.md:2-2']);
    assert.deepEqual(s.json.fichiers[0].sections.map((x: any) => x.numero), [2]);
    const hors = lancer(dir, ['--base', 'HEAD', '--sections', 'a.md:0-9']);
    assert.equal(hors.code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('le français d\'une section hors de --sections n\'est pas compté', () => {
  const dir = depot(ANGLAIS);
  try {
    writeFileSync(join(dir, 'a.md'), ANGLAIS.replace('Plain', 'Le chat est la'));
    assert.equal(lancer(dir, ['--base', 'HEAD', '--sections', 'a.md:1-1']).code, 0);
    const r = lancer(dir, ['--base', 'HEAD', '--sections', 'a.md:2-2']);
    assert.equal(r.code, 1);
    assert.equal(r.json.fichiers[0].francais, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--liens : ancre traduite qui ne se résout plus ; lien déjà cassé au départ toléré', () => {
  avec(ANGLAIS.replace('## First', '## Premier'), ['--liens'], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.fichiers[0].liens, [{ section: 2, lien: '#first' }]);
  });
  avec(ANGLAIS.replace('(#first)', '(#nowhere)'), ['--liens'], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.fichiers[0].liens, [{ section: 2, lien: '#nowhere' }]);
  });
  avec(ANGLAIS.replace('(#first)', '(autre.md)'), ['--liens'], (r) => {
    assert.deepEqual(r.json.fichiers[0].liens, [{ section: 2, lien: 'autre.md' }]);
  });
  avec(ANGLAIS.replace('(#first)', '(https://x.org/#a)'), ['--liens'], (r) => assert.equal(r.code, 0));
  const dir = depot(ANGLAIS.replace('(#first)', '(#nowhere)'));
  try { assert.equal(lancer(dir, ['--base', 'HEAD', '--liens', 'a.md']).code, 0); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  // sans --liens : les liens ne sont pas regardés
  avec(ANGLAIS.replace('(#first)', '(#nowhere)'), [], (r) => assert.equal(r.code, 0));
});

test('arrêt sur l\'arbre de départ : zéro écart de faits, français positif', () => {
  const dir = depot(ANGLAIS.replace('Intro text.', 'Le chat est dans la maison.'));
  try {
    const r = lancer(dir, ['--base', 'HEAD', '--liens', 'a.md']);
    assert.equal(r.json.fichiers[0].francais, 4);
    assert.deepEqual(r.json.fichiers[0].ecarts, []);
    assert.equal(r.json.fichiers[0].sections.every((s: any) => s.ecarts.length === 0), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invocation invalide ou entrée absente : code 2', () => {
  const dir = depot(ANGLAIS);
  try {
    assert.equal(lancer(dir, ['--nope']).code, 2);
    assert.equal(lancer(dir, ['--attendu', 'v1:titres=1,puces=1,liens=1', 'a.md']).code, 2);
    assert.equal(lancer(dir, ['--base', 'HEAD', 'absent.md']).code, 2);
    assert.equal(lancer(dir, ['--base', 'HEAD', '--sections', 'a.md:3-1']).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function avecGh(releases: Record<string, string>, f: (env: NodeJS.ProcessEnv, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'cl-gh-'));
  try {
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'releases.json'), JSON.stringify(releases));
    writeFileSync(join(dir, 'bin', 'gh'), `#!/usr/bin/env node
const r = JSON.parse(require('fs').readFileSync(${JSON.stringify(join(dir, 'releases.json'))}, 'utf8'));
const a = process.argv.slice(2);
if (a[1] === 'list') console.log(JSON.stringify(Object.keys(r).map((t) => ({ tagName: t, isDraft: false }))));
else console.log(JSON.stringify({ body: r[a[2]] }));
`);
    chmodSync(join(dir, 'bin', 'gh'), 0o755);
    f({ ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` }, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('--releases : corps anglais zéro ; français signalé ; --attendu compare titres, puces, liens', () => {
  const corps = '## Added\n- one [a](https://x.org)\n- two\n';
  avecGh({ 'v1.0.0': corps, 'v0.9.0': '## Added\n- Le chat est ici\n' }, (env, dir) => {
    const r = lancer(dir, ['--releases'], env);
    assert.equal(r.code, 1);
    const par = Object.fromEntries(r.json.releases.map((x: any) => [x.tag, x]));
    assert.equal(par['v1.0.0'].francais, 0);
    assert.equal(par['v0.9.0'].francais, 2);
    assert.deepEqual(par['v1.0.0'].comptes, { titres: 1, puces: 2, liens: 1 });
  });
  avecGh({ 'v1.0.0': corps }, (env, dir) => {
    const ok = lancer(dir, ['--releases', '--attendu', 'v1.0.0:titres=1,puces=2,liens=1'], env);
    assert.equal(ok.code, 0);
    const ko = lancer(dir, ['--releases', '--attendu', 'v1.0.0:titres=1,puces=3,liens=0'], env);
    assert.equal(ko.code, 1);
    assert.deepEqual(ko.json.releases[0].ecarts, [{ fait: 'puces', avant: 3, apres: 2 }, { fait: 'liens', avant: 0, apres: 1 }]);
    assert.equal(lancer(dir, ['--releases', '--attendu', 'v2:titres=1,puces=1,liens=1'], env).code, 2);
  });
});
