import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/controle-langue.mjs');

const ENGLISH = [
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

function makeRepo(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'cl-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'a.md'), content);
  git('add', 'a.md');
  git('commit', '-q', '-m', 'base');
  return dir;
}
function run(dir: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env });
  let json: any = null;
  try { json = JSON.parse(r.stdout); } catch { /* none */ }
  return { code: r.status, json, err: r.stderr };
}
const withFile = (content: string, args: string[], f: (r: ReturnType<typeof run>, d: string) => void) => {
  const dir = makeRepo(ENGLISH);
  try { writeFileSync(join(dir, 'a.md'), content); f(run(dir, ['--base', 'HEAD', ...args, 'a.md']), dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test('English with a French quotation and code block: zero, exit 0', () => {
  withFile(ENGLISH, ['--links'], (r) => {
    assert.equal(r.code, 0);
    assert.equal(r.json.files[0].french, 0);
    assert.deepEqual(r.json.files[0].differences, []);
    assert.deepEqual(r.json.files[0].links, []);
  });
});

test('a French sentence outside quotes: one per offending word, per section', () => {
  // le, la, les, des, est, pour, avec, une, dans -> 9 words; « Le » counts (case)
  const phrase = 'Le chat est dans la maison pour les amis avec une table des';
  withFile(ENGLISH.replace('Intro text.', phrase), [], (r) => {
    assert.equal(r.code, 1);
    assert.equal(r.json.files[0].french, 9);
    assert.equal(r.json.files[0].sections[0].french, 9);
    assert.equal(r.json.files[0].sections[1].french, 0);
  });
});

test('whole words only: "lemon", "island", "dansant" do not count', () => {
  withFile(ENGLISH.replace('Intro text.', 'lemon island dansant pourquoi laser'), [], (r) => {
    assert.equal(r.code, 0);
    assert.equal(r.json.files[0].french, 0);
  });
});

test('a French word in code or inside quotes does not count, but one after the quotation does', () => {
  withFile(ENGLISH.replace('« le titre est dans la liste ».', '« le titre » est ici'), [], (r) => {
    assert.equal(r.json.files[0].french, 1);
  });
});

test('multi-line quotation: exempt', () => {
  withFile(ENGLISH.replace('Intro text.', 'Say « le\nchat est dans\nla maison » now.'), [], (r) => {
    assert.equal(r.code, 0);
  });
});

test('nested quotes: French stays exempt until the outer « » closes', () => {
  withFile(ENGLISH.replace('Intro text.', 'Say « le « chat » est dans la » now.'), [], (r) => assert.equal(r.code, 0));
});

test('AD-12 removed: reported in its section', () => {
  withFile(ENGLISH.replace('See AD-12 and B-3.', 'See B-3.'), [], (r) => {
    assert.equal(r.code, 1);
    const s = r.json.files[0].sections[1];
    assert.deepEqual(s.differences, [{ fact: 'AD-12', before: 1, after: 0 }]);
    assert.deepEqual(r.json.files[0].sections[2].differences, []);
  });
});

test('an added identifier is also a difference', () => {
  withFile(ENGLISH.replace('See AD-12', 'See P-7 AD-12'), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.files[0].sections[1].differences, [{ fact: 'P-7', before: 0, after: 1 }]);
  });
});

test('added heading: reported', () => {
  withFile(ENGLISH.replace('See AD-12', '### Sub\nSee AD-12'), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.files[0].sections[1].differences, [{ fact: 'headings', before: 1, after: 2 }]);
  });
});

test('lost table row (separator excluded): reported', () => {
  withFile(ENGLISH.replace('| 3 | 4 |\n', ''), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.files[0].sections[1].differences, [{ fact: 'tableRows', before: 3, after: 2 }]);
  });
});

test('lost code block: reported, and a fake heading inside a block does not count', () => {
  withFile(ENGLISH.replace(/```[\s\S]*?```\n/, ''), [], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.files[0].sections[1].differences, [
      { fact: 'blocks', before: 1, after: 0 }, { fact: 'AD-99', before: 1, after: 0 },
    ]);
  });
  const withFake = ENGLISH.replace('le code est', '## Fake\nle code est');
  withFile(withFake, [], (r) => { assert.equal(r.code, 0); assert.equal(r.json.files[0].sections.length, 3); });
});

test('numbering: 0 before the first ##, section 0 text kept apart', () => {
  withFile(ENGLISH, [], (r) => {
    assert.deepEqual(r.json.files[0].sections.map((s: any) => [s.number, s.title]),
      [[0, ''], [1, 'First'], [2, 'Second']]);
  });
  const dir = makeRepo(ENGLISH);
  try {
    const t = run(dir, ['--headings', 'a.md']);
    assert.equal(t.code, 0);
    assert.deepEqual(t.json.files[0].sections,
      [{ number: 0, title: '' }, { number: 1, title: 'First' }, { number: 2, title: 'Second' }]);
    const s = run(dir, ['--base', 'HEAD', '--sections', 'a.md:2-2']);
    assert.deepEqual(s.json.files[0].sections.map((x: any) => x.number), [2]);
    const outside = run(dir, ['--base', 'HEAD', '--sections', 'a.md:0-9']);
    assert.equal(outside.code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('French in a section outside --sections is not counted', () => {
  const dir = makeRepo(ENGLISH);
  try {
    writeFileSync(join(dir, 'a.md'), ENGLISH.replace('Plain', 'Le chat est la'));
    assert.equal(run(dir, ['--base', 'HEAD', '--sections', 'a.md:1-1']).code, 0);
    const r = run(dir, ['--base', 'HEAD', '--sections', 'a.md:2-2']);
    assert.equal(r.code, 1);
    assert.equal(r.json.files[0].french, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--links: a translated anchor that no longer resolves; a link already broken at the base is tolerated', () => {
  withFile(ENGLISH.replace('## First', '## Premier'), ['--links'], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.files[0].links, [{ section: 2, link: '#first' }]);
  });
  withFile(ENGLISH.replace('(#first)', '(#nowhere)'), ['--links'], (r) => {
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.files[0].links, [{ section: 2, link: '#nowhere' }]);
  });
  withFile(ENGLISH.replace('(#first)', '(other.md)'), ['--links'], (r) => {
    assert.deepEqual(r.json.files[0].links, [{ section: 2, link: 'other.md' }]);
  });
  withFile(ENGLISH.replace('(#first)', '(https://x.org/#a)'), ['--links'], (r) => assert.equal(r.code, 0));
  const dir = makeRepo(ENGLISH.replace('(#first)', '(#nowhere)'));
  try { assert.equal(run(dir, ['--base', 'HEAD', '--links', 'a.md']).code, 0); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  // without --links: links are not looked at
  withFile(ENGLISH.replace('(#first)', '(#nowhere)'), [], (r) => assert.equal(r.code, 0));
});

test('starting tree: zero fact differences, positive French count', () => {
  const dir = makeRepo(ENGLISH.replace('Intro text.', 'Le chat est dans la maison.'));
  try {
    const r = run(dir, ['--base', 'HEAD', '--links', 'a.md']);
    assert.equal(r.json.files[0].french, 4);
    assert.deepEqual(r.json.files[0].differences, []);
    assert.equal(r.json.files[0].sections.every((s: any) => s.differences.length === 0), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid invocation or missing input: exit 2', () => {
  const dir = makeRepo(ENGLISH);
  try {
    assert.equal(run(dir, ['--nope']).code, 2);
    for (const old of ['--liens', '--titres']) assert.equal(run(dir, [old, 'a.md']).code, 2, old);
    assert.equal(run(dir, ['--releases', '--attendu', 'v1:headings=1,bullets=1,links=1']).code, 2);
    assert.equal(run(dir, ['--releases', '--expected', 'v1:titres=1,puces=1,liens=1']).code, 2);
    assert.equal(run(dir, ['--expected', 'v1:headings=1,bullets=1,links=1', 'a.md']).code, 2);
    assert.equal(run(dir, ['--base', 'HEAD', 'absent.md']).code, 2);
    assert.equal(run(dir, ['--base', 'HEAD', '--sections', 'a.md:3-1']).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function withGh(releases: Record<string, string>, f: (env: NodeJS.ProcessEnv, dir: string) => void) {
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

test('--releases: English body zero; French reported; --expected compares headings, bullets, links', () => {
  const body = '## Added\n- one [a](https://x.org)\n- two\n';
  withGh({ 'v1.0.0': body, 'v0.9.0': '## Added\n- Le chat est ici\n' }, (env, dir) => {
    const r = run(dir, ['--releases'], env);
    assert.equal(r.code, 1);
    const byTag = Object.fromEntries(r.json.releases.map((x: any) => [x.tag, x]));
    assert.equal(byTag['v1.0.0'].french, 0);
    assert.equal(byTag['v0.9.0'].french, 2);
    assert.deepEqual(byTag['v1.0.0'].counts, { headings: 1, bullets: 2, links: 1 });
  });
  withGh({ 'v1.0.0': body }, (env, dir) => {
    const ok = run(dir, ['--releases', '--expected', 'v1.0.0:headings=1,bullets=2,links=1'], env);
    assert.equal(ok.code, 0);
    const ko = run(dir, ['--releases', '--expected', 'v1.0.0:headings=1,bullets=3,links=0'], env);
    assert.equal(ko.code, 1);
    assert.deepEqual(ko.json.releases[0].differences, [{ fact: 'bullets', before: 3, after: 2 }, { fact: 'links', before: 0, after: 1 }]);
    assert.equal(run(dir, ['--releases', '--expected', 'v2:headings=1,bullets=1,links=1'], env).code, 2);
  });
});


test('screen baseline: inserted images checked for words, following facts still checked', () => {
  const headings = Array.from({ length: 13 }, (_, i) => `## Section ${i + 1}\nText.`).join('\n');
  const base = `${headings}\n## Details for \`kanevas-refonte-visuelle\`\nSee AD-12.\n## Following\nSee E-9.\n`;
  const dir = makeRepo(base);
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/ecrans.md'), base);
    execFileSync('git', ['add', 'docs/ecrans.md'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'screen baseline'], { cwd: dir });
    const current = base.replace('## Details for', '## Details for `kanevas-images`\nSee AD-88.\n## Details for');
    const audit = (...args: string[]) => run(dir, ['--base', 'HEAD', ...args]);
    writeFileSync(join(dir, 'docs/ecrans.md'), current);
    assert.equal(audit('docs/ecrans.md').code, 0);
    assert.equal(audit('--sections', 'docs/ecrans.md:15-16').code, 0);
    assert.equal(audit('--sections', 'docs/ecrans.md:17-17').code, 2);
    writeFileSync(join(dir, 'docs/ecrans.md'), current.replace('See AD-88.', 'Le texte est ici.'));
    const words = audit('--sections', 'docs/ecrans.md:14-14');
    assert.equal(words.code, 1);
    assert.equal(words.json.files[0].french, 2);
    assert.deepEqual(words.json.files[0].differences, []);
    writeFileSync(join(dir, 'docs/ecrans.md'), current.replace('See AD-12.', 'Text.'));
    const facts = audit('--sections', 'docs/ecrans.md:15-15');
    assert.equal(facts.code, 1);
    assert.deepEqual(facts.json.files[0].differences, [{ fact: 'AD-12', before: 1, after: 0 }]);
    // An unrelated inserted heading must still fail the facts audit.
    writeFileSync(join(dir, 'docs/ecrans.md'), current.replace('## Following', '## Extra\nText.\n## Following'));
    assert.equal(audit('docs/ecrans.md').code, 1);
    // The exception is scoped to docs/ecrans.md, never another document.
    writeFileSync(join(dir, 'a.md'), current);
    assert.equal(audit('a.md').code, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mockups amendment: only the two exact baseline counts, in their own section', () => {
  const headings = Array.from({ length: 13 }, (_, i) => `## Section ${i + 1}\nText.`).join('\n');
  const base = `${headings}\n## Details for \`kanevas-refonte-visuelle\`\nText.\n`
    + '## Illustrations\nText.\n## World\nText.\n## Maquettes\nSee E-14 and E-9.\n'
    + '| Mockup |\n|---|\n| Finished |\n## Maps\nSee E-4 and E-14.\n';
  const corrected = base.replace('## Maquettes\nSee E-14 and E-9.', '## Mockups\nSee E-14 and E-9, E-4 and E-14.');
  const dir = makeRepo(base);
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/ecrans.md'), base);
    execFileSync('git', ['add', 'docs/ecrans.md'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'mockups baseline'], { cwd: dir });
    const audit = (...args: string[]) => run(dir, ['--base', 'HEAD', ...args]);
    for (const images of [false, true]) {
      const current = images
        ? corrected.replace('## Details for', '## Details for `kanevas-images`\nSee AD-88.\n## Details for')
        : corrected;
      const section = images ? 18 : 17;
      const range = `docs/ecrans.md:${section}-${section}`;
      writeFileSync(join(dir, 'docs/ecrans.md'), current);
      assert.equal(audit('docs/ecrans.md').code, 0);
      assert.equal(audit('--sections', range).code, 0);
      // Missing or extra occurrences of either amended identifier still fail.
      for (const [from, to] of [
        ['E-9, E-4 and E-14.', 'E-9 and E-14.'],
        ['E-9, E-4 and E-14.', 'E-9, E-4, E-4 and E-14.'],
        ['E-9, E-4 and E-14.', 'E-9 and E-4.'],
        ['E-9, E-4 and E-14.', 'E-9, E-4, E-14 and E-14.'],
        ['E-9, E-4 and E-14.', 'E-4 and E-14.'],
        ['| Finished |\n', ''],
      ] as const) {
        writeFileSync(join(dir, 'docs/ecrans.md'), current.replace(from, to));
        assert.equal(audit('--sections', range).code, 1);
        assert.equal(audit('docs/ecrans.md').code, 1);
      }
      // Other sections cannot borrow the amendment, even if totals cancel out.
      writeFileSync(join(dir, 'docs/ecrans.md'), current
        .replace('E-9, E-4 and E-14.', 'E-9, E-4, E-4 and E-14.')
        .replace('## Maps\nSee E-4 and E-14.', '## Maps\nSee E-14.'));
      const misplaced = audit('docs/ecrans.md');
      assert.equal(misplaced.code, 1);
      assert.deepEqual(misplaced.json.files[0].differences, []);
      writeFileSync(join(dir, 'a.md'), current);
      assert.equal(audit('a.md').code, 1);
    }
    // A different baseline count must not activate this historical amendment.
    writeFileSync(join(dir, 'docs/ecrans.md'), base.replace('E-14 and E-9.', 'E-14, E-14 and E-9.'));
    execFileSync('git', ['add', 'docs/ecrans.md'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'different baseline counts'], { cwd: dir });
    writeFileSync(join(dir, 'docs/ecrans.md'), corrected);
    const otherBase = audit('--sections', 'docs/ecrans.md:17-17');
    assert.equal(otherBase.code, 1);
    assert.deepEqual(otherBase.json.files[0].differences, [{ fact: 'E-4', before: 0, after: 1 }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('product evolution amendment: only the exact old count, in its own section of docs/ecrans.md', () => {
  // Same shape as the frozen baseline: a preamble and 21 numbered sections.
  const headings = Array.from({ length: 20 }, (_, i) => `## Section ${i + 1}\nText.`).join('\n');
  const base = `${headings}\n## Section 21\nSee E-9.\n`;
  const dir = makeRepo(base);
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/ecrans.md'), base);
    execFileSync('git', ['add', 'docs/ecrans.md'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'evolution baseline'], { cwd: dir });
    const audit = (...args: string[]) => run(dir, ['--base', 'HEAD', ...args]);
    const preamble = 'Preamble: E-17, E-18, E-19.\n';
    const evolved = preamble + base.replace('## Section 13\nText.', '## Section 13\nSee AD-90.');
    writeFileSync(join(dir, 'docs/ecrans.md'), evolved);
    // Section 13 of the reference had no AD-90 (0 -> 1 is the recorded evolution).
    assert.equal(audit('docs/ecrans.md').code, 0);
    assert.equal(audit('--sections', 'docs/ecrans.md:13-13').code, 0);
    // A second occurrence, or a lost fact of the same section, is a real gap.
    writeFileSync(join(dir, 'docs/ecrans.md'), evolved.replace('See AD-90.', 'See AD-90 and AD-90.'));
    const twice = audit('--sections', 'docs/ecrans.md:13-13');
    assert.equal(twice.code, 1);
    assert.deepEqual(twice.json.files[0].differences, [{ fact: 'AD-90', before: 1, after: 2 }]);
    writeFileSync(join(dir, 'docs/ecrans.md'), evolved.replace('See E-9.', 'Text.'));
    assert.equal(audit('docs/ecrans.md').code, 1);
    // The amendment does not lend its allowance to the neighbouring section.
    writeFileSync(join(dir, 'docs/ecrans.md'), evolved.replace('See E-9.', 'See E-9 and AD-90.').replace('See AD-90.', 'Text.'));
    assert.equal(audit('docs/ecrans.md').code, 1);
    assert.equal(audit('--sections', 'docs/ecrans.md:21-21').code, 1);
    // Never for another document.
    writeFileSync(join(dir, 'a.md'), evolved);
    assert.equal(audit('a.md').code, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
