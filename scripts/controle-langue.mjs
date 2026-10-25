#!/usr/bin/env node
// Translation audit, without npm dependencies. JSON on stdout; 0 = clean, 1 = findings,
// 2 = invalid invocation or unavailable input. Section 0 precedes the first ## heading.
// node scripts/controle-langue.mjs [--base ref] [--sections file:i-j] [--links] [file…]
// node scripts/controle-langue.mjs --headings file
// node scripts/controle-langue.mjs --releases [--expected tag:headings=n,bullets=n,links=n]…
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const run = (command, args) => execFileSync(command, args, {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});
const count = (text, pattern) => [...text.matchAll(pattern)].length;

function parse(text) {
  const sections = [{ number: 0, title: '', lines: [], code: [] }];
  let section = sections[0];
  let fence = 0;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (marker && (!fence || (marker[1].length >= fence && !marker[2].trim()))) {
      section.code.push(line);
      if (!fence) section.blocks = (section.blocks || 0) + 1;
      fence = fence ? 0 : marker[1].length;
    } else if (fence) {
      section.code.push(line);
    } else {
      const heading = /^## (.+?)(?: +#+)?\s*$/.exec(line);
      if (heading) {
        section = { number: sections.length, title: heading[1], lines: [], code: [] };
        sections.push(section);
      }
      section.lines.push(line);
    }
  }
  return sections.map((s) => {
    const prose = s.lines.join('\n');
    // Quotes can span lines and can nest. Their text is still counted as facts.
    let depth = 0;
    let unquoted = '';
    for (const char of prose) {
      if (char === '«') { depth++; unquoted += ' '; }
      else if (char === '»') { depth = Math.max(0, depth - 1); unquoted += ' '; }
      else unquoted += depth ? ' ' : char;
    }
    const words = {};
    for (const word of unquoted.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []) {
      if (['le', 'la', 'les', 'des', 'est', 'pour', 'avec', 'une', 'dans'].includes(word)) {
        words[word] = (words[word] || 0) + 1;
      }
    }
    const identifiers = {};
    for (const id of (prose + '\n' + s.code.join('\n')).match(/\b(?:B|P|E|AD)-\d+\b/g) || []) {
      identifiers[id] = (identifiers[id] || 0) + 1;
    }
    return {
      number: s.number, title: s.title, prose, words,
      french: Object.values(words).reduce((a, b) => a + b, 0),
      facts: {
        identifiers,
        headings: s.lines.filter((l) => /^ {0,3}#{1,6}\s+/.test(l)).length,
        blocks: s.blocks || 0,
        tableRows: s.lines.filter((l) => l.startsWith('|') && !/^\|[\s:|\-]+$/.test(l)).length,
      },
    };
  });
}

// kanevas-images added section 14 after the frozen translation baseline. Keep
// that baseline intact: only this documented insertion has no facts counterpart.
function referenceSections(file, before, current) {
  if (file !== 'docs/ecrans.md' || before.some((s) => s.title.includes('`kanevas-images`'))
      || !current[14]?.title.includes('`kanevas-images`')
      || !current[15]?.title.includes('`kanevas-refonte-visuelle`')
      || !before[14]?.title.includes('`kanevas-refonte-visuelle`')) return before;
  return [...before.slice(0, 14), null, ...before.slice(14)];
}

// f6e82682bba70e90b4150f9a0252ec6ac43a6256 corrected the finished-mockups
// list after the frozen baseline: E-4 0 -> 1, E-14 1 -> 2. Amend only that
// section's exact old counts; compare every current count normally, totals too.
function referenceAmendment(file, sections) {
  if (file !== 'docs/ecrans.md') return sections;
  const index = sections[14]?.title.includes('`kanevas-images`') ? 18 : 17;
  const section = sections[index];
  if (!section || !['Maquettes', 'Mockups'].includes(section.title)
      || (section.facts.identifiers['E-4'] || 0) !== 0
      || section.facts.identifiers['E-14'] !== 1) return sections;
  return sections.map((s, i) => i !== index ? s : {
    ...s,
    facts: { ...s.facts, identifiers: { ...s.facts.identifiers, 'E-4': 1, 'E-14': 2 } },
  });
}

// Product commits after the frozen baseline (7d5b789..a13635d) changed facts of four
// screen sections before they were translated. Each entry amends one reference section
// (frozen numbering) and applies only if every listed count is exactly the old one:
// [fact, old count, new count]. Any other fact, or another count, is still compared.
const PRODUCT_EVOLUTION = [
  [0, [['E-17', 0, 1], ['E-18', 0, 1], ['E-19', 0, 1]]],
  [12, [['AD-111', 2, 4], ['AD-39', 2, 1], ['B-24', 1, 0], ['AD-117', 0, 1], ['E-19', 0, 1]]],
  [13, [['AD-90', 0, 1]]],
  [19, [['headings', 16, 17], ['tableRows', 50, 58], ['P-10', 7, 8], ['AD-111', 4, 5], ['E-9', 52, 64],
    ['E-18', 11, 13], ['E-14', 12, 16], ['E-19', 12, 13], ['B-33', 2, 3], ['P-14', 3, 4], ['E-13', 4, 6],
    ['E-1', 1, 2], ['B-39', 1, 2], ['B-40', 1, 3], ['B-41', 1, 2], ['AD-117', 0, 1], ['AD-105', 0, 1],
    ['AD-119', 0, 1], ['B-25', 0, 1], ['AD-44', 0, 1]]],
];
const FLAT = ['headings', 'blocks', 'tableRows'];
function productEvolution(file, sections) {
  // The frozen baseline has exactly 22 numbered sections after the preamble (0..21).
  if (file !== 'docs/ecrans.md' || sections.length !== 22) return sections;
  return sections.map((s, i) => {
    const entry = PRODUCT_EVOLUTION.find(([index]) => index === i);
    if (!entry) return s;
    const count = (f) => (FLAT.includes(f) ? s.facts[f] : s.facts.identifiers[f]) || 0;
    if (!entry[1].every(([f, old]) => count(f) === old)) return s;
    const facts = { ...s.facts, identifiers: { ...s.facts.identifiers } };
    for (const [f, , now] of entry[1]) {
      if (FLAT.includes(f)) facts[f] = now; else facts.identifiers[f] = now;
    }
    return { ...s, facts };
  });
}

function compareFacts(before, after) {
  const findings = [];
  for (const key of ['headings', 'blocks', 'tableRows']) {
    if ((before?.[key] || 0) !== (after?.[key] || 0)) {
      findings.push({ fact: key, before: before?.[key] || 0, after: after?.[key] || 0 });
    }
  }
  for (const id of new Set([...Object.keys(before?.identifiers || {}), ...Object.keys(after?.identifiers || {})])) {
    const a = before?.identifiers[id] || 0;
    const b = after?.identifiers[id] || 0;
    if (a !== b) findings.push({ fact: id, before: a, after: b });
  }
  return findings;
}

function total(sections) {
  const result = { identifiers: {}, headings: 0, blocks: 0, tableRows: 0 };
  for (const s of sections) {
    for (const key of ['headings', 'blocks', 'tableRows']) result[key] += s.facts[key];
    for (const [id, n] of Object.entries(s.facts.identifiers)) result.identifiers[id] = (result.identifiers[id] || 0) + n;
  }
  return result;
}

function links(prose, document = prose) {
  const definitions = new Map([...document.matchAll(/^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/gm)]
    .map((m) => [m[1].toLowerCase(), m[2]]));
  const found = [...prose.matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^\n]*?)?\)/g)]
    .map((m) => m[1] || m[2]);
  for (const m of prose.matchAll(/!?\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?![(:])/g)) {
    const target = definitions.get((m[2] || m[1]).toLowerCase());
    if (target) found.push(target);
  }
  return found;
}

function anchors(text) {
  const used = new Set();
  for (const s of parse(text)) {
    for (const m of s.prose.matchAll(/^ {0,3}#{1,6}\s+(.+?)(?: +#+)?\s*$/gm)) {
      const slug = m[1].replace(/<[^>]*>/g, '').replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
        .toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/ /g, '-');
      let candidate = slug;
      let n = 0;
      while (used.has(candidate)) candidate = `${slug}-${++n}`;
      used.add(candidate);
    }
  }
  return used;
}

function main() {
  const args = process.argv.slice(2);
  const files = [];
  const ranges = new Map();
  const expected = new Map();
  let base;
  let titles = false;
  let checkLinks = false;
  let releases = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--base', '--sections', '--expected'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--base') base = value;
      if (arg === '--sections') {
        const m = /^(.+):(\d+)-(\d+)$/.exec(value);
        if (!m || +m[2] > +m[3]) throw new Error(`Invalid section range: ${value}`);
        ranges.set(m[1], [+m[2], +m[3]]);
      }
      if (arg === '--expected') {
        const m = /^(.+):headings=(\d+),bullets=(\d+),links=(\d+)$/.exec(value);
        if (!m || expected.has(m[1])) throw new Error(`Invalid or duplicate release expectation: ${value}`);
        expected.set(m[1], { headings: +m[2], bullets: +m[3], links: +m[4] });
      }
    } else if (arg === '--headings') titles = true;
    else if (arg === '--links') checkLinks = true;
    else if (arg === '--releases') releases = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if (expected.size && !releases) throw new Error('--expected requires --releases');
  if (releases && (titles || checkLinks || ranges.size || files.length || base)) throw new Error('Release mode cannot audit local files');
  let failed = false;
  const output = { files: [], releases: [] };
  if (releases) {
    const published = JSON.parse(run('gh', ['release', 'list', '--limit', '100000', '--json', 'tagName,isDraft']))
      .filter((r) => !r.isDraft);
    for (const tag of expected.keys()) {
      if (!published.some((r) => r.tagName === tag)) throw new Error(`Release not found: ${tag}`);
    }
    for (const { tagName: tag } of published) {
      const { body } = JSON.parse(run('gh', ['release', 'view', tag, '--json', 'body']));
      const sections = parse(body);
      const prose = sections.map((s) => s.prose).join('\n');
      const counts = {
        headings: total(sections).headings,
        bullets: count(prose, /^\s*(?:[-+*]|\d+[.)])\s+/gm),
        links: links(prose).length,
      };
      const differences = Object.entries(expected.get(tag) || {}).filter(([key, n]) => counts[key] !== n)
        .map(([fact, before]) => ({ fact, before, after: counts[fact] }));
      const french = sections.reduce((n, s) => n + s.french, 0);
      failed ||= french > 0 || differences.length > 0;
      output.releases.push({ tag, french, counts, differences, sections: sections.map(({ prose: _, ...s }) => s) });
    }
  } else {
    for (const file of ranges.keys()) if (!files.includes(file)) files.push(file);
    if (!files.length) files.push('README.md', ...readdirSync('docs').filter((f) => f.endsWith('.md')).sort().map((f) => `docs/${f}`), 'ARCHITECTURE.md');
    const root = run('git', ['rev-parse', '--show-toplevel']).trim();
    const normalized = (file) => relative(root, resolve(file)).split(sep).join('/');
    if (!titles) base ||= readFileSync(new URL('./controle-langue.base', import.meta.url), 'utf8').trim();
    const oldCache = new Map();
    const oldText = (file) => {
      if (!oldCache.has(file)) oldCache.set(file, run('git', ['show', `${base}:${file}`]));
      return oldCache.get(file);
    };
    const resolves = (from, href, before) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return true;
      try {
        const [path, fragment] = href.split('#');
        const file = path ? resolve(dirname(resolve(root, from)), decodeURIComponent(path.split('?')[0])) : resolve(root, from);
        if (!fragment) {
          if (before) run('git', ['cat-file', '-e', `${base}:${normalized(file)}`]);
          else statSync(file);
          return true;
        }
        const text = before ? oldText(normalized(file)) : readFileSync(file, 'utf8');
        return anchors(text).has(decodeURIComponent(fragment));
      } catch { return false; }
    };
    for (const file of [...new Set(files)]) {
      const current = parse(readFileSync(file, 'utf8'));
      if (titles) {
        output.files.push({ file, sections: current.map(({ number, title }) => ({ number, title })) });
        continue;
      }
      const original = parse(oldText(normalized(file)));
      const amended = productEvolution(normalized(file), referenceAmendment(normalized(file), original));
      const before = referenceSections(normalized(file), amended, current);
      const oldProse = original.map((s) => s.prose).join('\n');
      const currentProse = current.map((s) => s.prose).join('\n');
      const range = ranges.get(file) || [0, Math.max(before.length, current.length) - 1];
      if (ranges.has(file) && range[1] >= before.length) throw new Error(`Section outside reference: ${file}:${range[1]}`);
      const sections = [];
      const broken = [];
      for (let i = range[0]; i <= range[1]; i++) {
        const a = before[i];
        const b = current[i];
        const wordsOnly = a === null;
        const differences = wordsOnly ? [] : compareFacts(a?.facts, b?.facts);
        if (!wordsOnly && Boolean(a) !== Boolean(b)) differences.push({ fact: 'section', before: Boolean(a), after: Boolean(b) });
        if (checkLinks && b) {
          const oldLinks = new Set(links(a?.prose || '', oldProse));
          for (const href of links(b.prose, currentProse)) {
            if (!resolves(normalized(file), href, false) && (!oldLinks.has(href) || resolves(normalized(file), href, true))) {
              broken.push({ section: i, link: href });
            }
          }
        }
        sections.push({ number: i, title: b?.title ?? a?.title, french: b?.french || 0, words: b?.words || {}, facts: b?.facts, differences });
      }
      const french = sections.reduce((n, s) => n + s.french, 0);
      const differences = ranges.has(file) ? sections.flatMap((s) => s.differences) : compareFacts(total(amended), total(current.filter((_, i) => before[i] !== null)));
      failed ||= french > 0 || broken.length > 0 || differences.length > 0 || sections.some((s) => s.differences.length);
      output.files.push({ file, french, facts: total(current), differences, links: broken, sections });
    }
  }
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = failed ? 1 : 0;
}

try { main(); }
catch (error) {
  console.error(`Language audit: ${error.message}`);
  process.exitCode = 2;
}
