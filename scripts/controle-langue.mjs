#!/usr/bin/env node
// Translation audit, without npm dependencies. JSON on stdout; 0 = clean, 1 = findings,
// 2 = invalid invocation or unavailable input. Section 0 precedes the first ## heading.
// node scripts/controle-langue.mjs [--base ref] [--sections file:i-j] [--liens] [file…]
// node scripts/controle-langue.mjs --titres file
// node scripts/controle-langue.mjs --releases [--attendu tag:titres=n,puces=n,liens=n]…
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const run = (command, args) => execFileSync(command, args, {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});
const count = (text, pattern) => [...text.matchAll(pattern)].length;

function parse(text) {
  const sections = [{ numero: 0, titre: '', lines: [], code: [] }];
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
        section = { numero: sections.length, titre: heading[1], lines: [], code: [] };
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
    const mots = {};
    for (const word of unquoted.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []) {
      if (['le', 'la', 'les', 'des', 'est', 'pour', 'avec', 'une', 'dans'].includes(word)) {
        mots[word] = (mots[word] || 0) + 1;
      }
    }
    const identifiants = {};
    for (const id of (prose + '\n' + s.code.join('\n')).match(/\b(?:B|P|E|AD)-\d+\b/g) || []) {
      identifiants[id] = (identifiants[id] || 0) + 1;
    }
    return {
      numero: s.numero, titre: s.titre, prose, mots,
      francais: Object.values(mots).reduce((a, b) => a + b, 0),
      faits: {
        identifiants,
        titres: s.lines.filter((l) => /^ {0,3}#{1,6}\s+/.test(l)).length,
        blocs: s.blocks || 0,
        tableaux: s.lines.filter((l) => l.startsWith('|') && !/^\|[\s:|\-]+$/.test(l)).length,
      },
    };
  });
}

// kanevas-images added section 14 after the frozen translation baseline. Keep
// that baseline intact: only this documented insertion has no facts counterpart.
function referenceSections(file, before, current) {
  if (file !== 'docs/ecrans.md' || before.some((s) => s.titre.includes('`kanevas-images`'))
      || !current[14]?.titre.includes('`kanevas-images`')
      || !current[15]?.titre.includes('`kanevas-refonte-visuelle`')
      || !before[14]?.titre.includes('`kanevas-refonte-visuelle`')) return before;
  return [...before.slice(0, 14), null, ...before.slice(14)];
}

function differences(before, after) {
  const findings = [];
  for (const key of ['titres', 'blocs', 'tableaux']) {
    if ((before?.[key] || 0) !== (after?.[key] || 0)) {
      findings.push({ fait: key, avant: before?.[key] || 0, apres: after?.[key] || 0 });
    }
  }
  for (const id of new Set([...Object.keys(before?.identifiants || {}), ...Object.keys(after?.identifiants || {})])) {
    const a = before?.identifiants[id] || 0;
    const b = after?.identifiants[id] || 0;
    if (a !== b) findings.push({ fait: id, avant: a, apres: b });
  }
  return findings;
}

function total(sections) {
  const result = { identifiants: {}, titres: 0, blocs: 0, tableaux: 0 };
  for (const s of sections) {
    for (const key of ['titres', 'blocs', 'tableaux']) result[key] += s.faits[key];
    for (const [id, n] of Object.entries(s.faits.identifiants)) result.identifiants[id] = (result.identifiants[id] || 0) + n;
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
    if (['--base', '--sections', '--attendu'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--base') base = value;
      if (arg === '--sections') {
        const m = /^(.+):(\d+)-(\d+)$/.exec(value);
        if (!m || +m[2] > +m[3]) throw new Error(`Invalid section range: ${value}`);
        ranges.set(m[1], [+m[2], +m[3]]);
      }
      if (arg === '--attendu') {
        const m = /^(.+):titres=(\d+),puces=(\d+),liens=(\d+)$/.exec(value);
        if (!m || expected.has(m[1])) throw new Error(`Invalid or duplicate release expectation: ${value}`);
        expected.set(m[1], { titres: +m[2], puces: +m[3], liens: +m[4] });
      }
    } else if (arg === '--titres') titles = true;
    else if (arg === '--liens') checkLinks = true;
    else if (arg === '--releases') releases = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if (expected.size && !releases) throw new Error('--attendu requires --releases');
  if (releases && (titles || checkLinks || ranges.size || files.length || base)) throw new Error('Release mode cannot audit local files');
  let failed = false;
  const output = { fichiers: [], releases: [] };
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
      const comptes = {
        titres: total(sections).titres,
        puces: count(prose, /^\s*(?:[-+*]|\d+[.)])\s+/gm),
        liens: links(prose).length,
      };
      const ecarts = Object.entries(expected.get(tag) || {}).filter(([key, n]) => comptes[key] !== n)
        .map(([fait, avant]) => ({ fait, avant, apres: comptes[fait] }));
      const francais = sections.reduce((n, s) => n + s.francais, 0);
      failed ||= francais > 0 || ecarts.length > 0;
      output.releases.push({ tag, francais, comptes, ecarts, sections: sections.map(({ prose: _, ...s }) => s) });
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
        output.fichiers.push({ fichier: file, sections: current.map(({ numero, titre }) => ({ numero, titre })) });
        continue;
      }
      const original = parse(oldText(normalized(file)));
      const before = referenceSections(normalized(file), original, current);
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
        const ecarts = wordsOnly ? [] : differences(a?.faits, b?.faits);
        if (!wordsOnly && Boolean(a) !== Boolean(b)) ecarts.push({ fait: 'section', avant: Boolean(a), apres: Boolean(b) });
        if (checkLinks && b) {
          const oldLinks = new Set(links(a?.prose || '', oldProse));
          for (const href of links(b.prose, currentProse)) {
            if (!resolves(normalized(file), href, false) && (!oldLinks.has(href) || resolves(normalized(file), href, true))) {
              broken.push({ section: i, lien: href });
            }
          }
        }
        sections.push({ numero: i, titre: b?.titre ?? a?.titre, francais: b?.francais || 0, mots: b?.mots || {}, faits: b?.faits, ecarts });
      }
      const francais = sections.reduce((n, s) => n + s.francais, 0);
      const ecarts = ranges.has(file) ? sections.flatMap((s) => s.ecarts) : differences(total(original), total(current.filter((_, i) => before[i] !== null)));
      failed ||= francais > 0 || broken.length > 0 || ecarts.length > 0 || sections.some((s) => s.ecarts.length);
      output.fichiers.push({ fichier: file, francais, faits: total(current), ecarts, liens: broken, sections });
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
