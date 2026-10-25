// Feature kanevas-outils-doc-anglais, black-box checks written from the need alone:
// the public doc is English, no fact is lost or added, no code changes, the published
// Releases are English. Counting is done here, independently of scripts/controle-langue.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// Head of epic/kanevas-outils before the translation (the "before" of the exit criterion).
const BASE = '0d9c95fcc030caa8b61a360f124547032b7e8065';
const MOTS = new Set(['le', 'la', 'les', 'des', 'est', 'pour', 'avec', 'une', 'dans']);

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const avant = (f: string) => git('show', `${BASE}:${f}`);
const apres = (f: string) => readFileSync(resolve(root, f), 'utf8');

const fichiers = ['README.md', 'ARCHITECTURE.md', ...readdirSync(resolve(root, 'docs'))
  .filter((f) => f.endsWith('.md')).sort().map((f) => `docs/${f}`)];

/** Splits a markdown text into prose lines and code-block lines (fences ``` or ~~~). */
function decoupe(text: string) {
  const prose: string[] = [];
  const code: string[] = [];
  let blocs = 0;
  let cloture = '';
  for (const l of text.split(/\r?\n/)) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (!cloture && m) { cloture = m[1]; blocs++; code.push(l); continue; }
    if (cloture) {
      code.push(l);
      if (m && m[1][0] === cloture[0] && m[1].length >= cloture.length && !m[2].trim()) cloture = '';
      continue;
    }
    prose.push(l);
  }
  return { prose: prose.join('\n'), code: code.join('\n'), blocs, lignesProse: prose };
}

function sansCitations(s: string) {
  let prof = 0;
  let out = '';
  for (const c of s) {
    if (c === '«') { prof++; out += ' '; } else if (c === '»') { prof = Math.max(0, prof - 1); out += ' '; } else out += prof ? ' ' : c;
  }
  return out;
}

function motsFrancais(text: string) {
  const { prose } = decoupe(text);
  const trouves: Record<string, number> = {};
  for (const w of sansCitations(prose).toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    if (MOTS.has(w)) trouves[w] = (trouves[w] ?? 0) + 1;
  }
  return trouves;
}

function faits(text: string) {
  const d = decoupe(text);
  const ids: Record<string, number> = {};
  for (const id of (d.prose + '\n' + d.code).match(/\b(?:B|P|E|AD)-\d+\b/g) ?? []) ids[id] = (ids[id] ?? 0) + 1;
  return {
    ids,
    titres: d.lignesProse.filter((l) => /^ {0,3}#{1,6}\s/.test(l)).length,
    blocs: d.blocs,
    lignesTableau: d.lignesProse.filter((l) => /^\s*\|/.test(l)).length,
  };
}

for (const f of fichiers) {
  test(`${f} : aucun mot français hors citations « … » et blocs de code`, () => {
    assert.deepEqual(motsFrancais(apres(f)), {});
  });
  test(`${f} : aucun identifiant, titre, bloc de code ni ligne de tableau perdu ou ajouté`, () => {
    assert.deepEqual(faits(apres(f)), faits(avant(f)));
  });
}

test('le contrôle sait voir du français : le texte de départ en contient, les citations et blocs sont exemptés', () => {
  assert.ok(Object.keys(motsFrancais(avant('README.md'))).length > 0);
  assert.deepEqual(motsFrancais('The title is « le titre est dans la liste »\n\n```\nle code est dans la boîte\n```\n'), {});
  assert.deepEqual(motsFrancais('Voici une phrase pour tester'), { une: 1, pour: 1 });
});

test('les noms de routes, de tables et de codes d\'erreur cités en code en ligne sont conservés', () => {
  const re = /`([^`\n]+)`/g;
  const cible = /^(?:(?:GET|POST|PUT|PATCH|DELETE) )?\/[\w\-/:.{}*]*$|^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
  const manquants: string[] = [];
  for (const f of fichiers) {
    const nb = (t: string) => {
      const m: Record<string, number> = {};
      for (const x of decoupe(t).prose.matchAll(re)) if (cible.test(x[1])) m[x[1]] = (m[x[1]] ?? 0) + 1;
      return m;
    };
    const a = nb(avant(f));
    const b = nb(apres(f));
    for (const [k, n] of Object.entries(a)) if ((b[k] ?? 0) < n) manquants.push(`${f}: ${k} ${n}->${b[k] ?? 0}`);
  }
  assert.deepEqual(manquants, []);
});

test('aucun code ne change : src/ et frontend/ identiques à la base, hors tests ajoutés', () => {
  const changes = git('diff', '--name-status', BASE, 'HEAD', '--', 'src', 'frontend', 'Dockerfile', 'tsconfig.json')
    .split('\n').filter(Boolean)
    .filter((l) => !/^A\s+src\/[\w.-]*\.test\.ts$/.test(l));
  assert.deepEqual(changes, []);
});

test('les maquettes docs/maquettes/* sont inchangées', () => {
  assert.equal(git('diff', '--name-only', BASE, 'HEAD', '--', 'docs/maquettes').trim(), '');
});

test('.agent/* reste en français', () => {
  const dir = resolve(root, '.agent');
  const md = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(md.length > 0);
  for (const f of md) {
    const n = Object.keys(motsFrancais(readFileSync(resolve(dir, f), 'utf8'))).length;
    assert.ok(n > 0, `.agent/${f} ne contient plus de français`);
  }
});

test('les Releases GitHub publiées sont en anglais', { timeout: 120000 }, (t) => {
  let tags: string[];
  try {
    tags = JSON.parse(execFileSync('gh', ['release', 'list', '--limit', '100', '--json', 'tagName'],
      { cwd: root, encoding: 'utf8' })).map((r: { tagName: string }) => r.tagName);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') { t.diagnostic('gh absent : Releases non vérifiées'); return; }
    throw e;
  }
  assert.ok(tags.length >= 7, `seulement ${tags.length} Releases`);
  const fautives: string[] = [];
  for (const tag of tags) {
    const body = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'body'], { cwd: root, encoding: 'utf8' })).body as string;
    assert.ok(body.trim().length > 0, `${tag} : corps vide`);
    const m = motsFrancais(body);
    if (Object.keys(m).length) fautives.push(`${tag}: ${JSON.stringify(m)}`);
  }
  assert.deepEqual(fautives, []);
});
