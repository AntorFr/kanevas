import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// Task kanevas-rv-fondations: tokens of docs/charte.md, self-hosted fonts, lucide icons.
const racine = new URL('../../../', import.meta.url).pathname;
const lire = (p: string) => readFileSync(join(racine, p), 'utf8');
const tokens = lire('frontend/src/ui/tokens.css');

function bloc(selecteur: string): Record<string, string> {
  const debut = tokens.indexOf(selecteur + ' {');
  assert.ok(debut >= 0, `bloc ${selecteur} absent`);
  const corps = tokens.slice(tokens.indexOf('{', debut) + 1, tokens.indexOf('\n}', debut));
  const out: Record<string, string> = {};
  for (const m of corps.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
const sombre = bloc(':root');
const clair = bloc(':root[data-theme="light"]');
const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();

// Hand-written from the table of docs/charte.md §2 (dark, light).
const attendu: Record<string, [string, string]> = {
  fond: ['#121317', '#fcfcfd'],
  'fond-lateral': ['#0e0f12', '#f4f5f7'],
  surface: ['#191a1f', '#ffffff'],
  'surface-2': ['#202128', '#f1f2f5'],
  'surface-3': ['#2a2b33', '#e8e9ee'],
  bord: ['rgba(255,255,255,.08)', 'rgba(22,26,44,.09)'],
  'bord-fort': ['rgba(255,255,255,.14)', 'rgba(22,26,44,.16)'],
  'bord-champ': ['#74757f', '#808290'],
  texte: ['#ebecf0', '#1a1b22'],
  'texte-2': ['#a6a7b0', '#4a4c58'],
  'texte-3': ['#8b8c97', '#646674'],
  accent: ['#8b9bf0', '#3a4cc0'],
  'sur-accent': ['#11142b', '#ffffff'],
  'accent-texte': ['#9aa6f5', '#3a4cc0'],
  'accent-fond': ['rgba(154,166,245,.16)', 'rgba(58,76,192,.10)'],
  mj: ['#f2a33c', '#8a5300'],
  'mj-fond': ['rgba(242,163,60,.14)', 'rgba(214,140,30,.14)'],
  'mj-bord': ['rgba(242,163,60,.42)', 'rgba(176,108,10,.45)'],
  'mj-trame': ['rgba(242,163,60,.075)', 'rgba(176,108,10,.09)'],
  table: ['#3fc79a', '#08694a'],
  'table-fond': ['rgba(63,199,154,.14)', 'rgba(8,105,74,.12)'],
  'table-bord': ['rgba(63,199,154,.55)', 'rgba(8,105,74,.70)'],
  danger: ['#ec7b6f', '#b4352b'],
  'sur-danger': ['#1a0c0a', '#ffffff'],
  'danger-fond': ['rgba(236,123,111,.14)', 'rgba(180,53,43,.10)'],
  focus: ['#9aa6f5', '#3a4cc0'],
  voile: ['rgba(5,6,9,.62)', 'rgba(20,22,34,.38)'],
  squelette: ['rgba(255,255,255,.06)', 'rgba(22,26,44,.07)'],
};

for (const [nom, [s, c]] of Object.entries(attendu)) {
  test(`tokens : --${nom} porte la valeur de la charte, sombre et clair`, () => {
    assert.equal(norm(sombre[nom] ?? ''), norm(s));
    assert.equal(norm(clair[nom] ?? ''), norm(c));
  });
}

test('tokens : les noms que le code lisait déjà sont tous encore définis', () => {
  for (const n of ['fond', 'surface', 'bord', 'bord-champ', 'texte', 'accent', 'mj', 'table', 'danger', 'focus', 'police-titre', 'police-texte', 'duree', 'rayon-champ', 'rayon-panneau', 'e-1', 'e-5', 't-13', 't-22'])
    assert.ok(n in sombre, `--${n} manquant`);
});

test('tokens : espace, rayons, mouvement et échelle de la charte', () => {
  assert.equal(sombre['duree'], '160ms');
  assert.equal(norm(sombre['courbe']!), 'cubic-bezier(.2,.7,.2,1)');
  assert.deepEqual([sombre['e-6'], sombre['e-7'], sombre['e-8']], ['32px', '48px', '64px']);
  assert.deepEqual([sombre['rayon-item'], sombre['rayon-champ'], sombre['rayon-panneau']], ['6px', '8px', '12px']);
  assert.deepEqual([sombre['t-18'], sombre['t-32'], sombre['t-40']], ['18px', '32px', '40px']);
  assert.ok(sombre['ombre-flottant'] && clair['ombre-flottant']);
  assert.match(tokens, /prefers-reduced-motion: reduce\) \{ :root \{ --duree: 0ms/);
});

function fichiers(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) fichiers(p, ext, out);
    else if (ext.test(f)) out.push(p);
  }
  return out;
}

test('aucun fichier CSS hors tokens.css n’écrit une couleur en dur', () => {
  const css = fichiers(join(racine, 'frontend'), /\.css$/).filter((p) => !p.includes('node_modules') && !p.endsWith('ui/tokens.css'));
  assert.ok(css.length >= 1);
  for (const p of css) {
    const txt = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(txt, /#[0-9a-fA-F]{3,8}\b/, p);
    assert.doesNotMatch(txt, /\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\(/, p);
    assert.doesNotMatch(txt, /:\s*(white|black|red|blue|green|gray|grey|orange|yellow|purple)\b/i, p);
  }
});

test('polices : les trois familles et lucide-react sont des dépendances aux versions épinglées', () => {
  const dep = JSON.parse(lire('package.json')).dependencies as Record<string, string>;
  for (const n of ['@fontsource-variable/fraunces', '@fontsource-variable/newsreader', '@fontsource/inter', 'lucide-react'])
    assert.match(dep[n] ?? '', /^\d+\.\d+\.\d+$/, n);
});

test('polices : main.tsx importe Fraunces, Newsreader (avec italique) et Inter 400/500/600', () => {
  const main = lire('frontend/src/main.tsx');
  for (const m of ['@fontsource-variable/fraunces', '@fontsource-variable/newsreader/opsz-italic', '@fontsource/inter/400', '@fontsource/inter/500', '@fontsource/inter/600'])
    assert.ok(main.includes(m), m);
});

test('polices : les piles de tokens nomment les familles servies par @fontsource', () => {
  assert.match(sombre['police-titre']!, /"Fraunces Variable"/);
  assert.match(sombre['police-lecture']!, /"Newsreader Variable"/);
  assert.match(sombre['police-texte']!, /^"Inter"/);
  // the family names must be the ones the packages actually declare
  const fr = readFileSync(join(racine, 'node_modules/@fontsource-variable/fraunces/opsz.css'), 'utf8');
  const ne = readFileSync(join(racine, 'node_modules/@fontsource-variable/newsreader/opsz.css'), 'utf8');
  const it = readFileSync(join(racine, 'node_modules/@fontsource/inter/400.css'), 'utf8');
  assert.match(fr, /font-family:\s*'Fraunces Variable'/);
  assert.match(ne, /font-family:\s*'Newsreader Variable'/);
  assert.match(it, /font-family:\s*'Inter'/);
});

test('build : le navigateur n’a aucune requête vers un autre hôte (CSS, HTML) et les woff2 sont servis', (t) => {
  const pub = join(racine, 'dist/public');
  if (!existsSync(join(pub, 'index.html'))) return t.skip('npm run build non lancé');
  const css = fichiers(pub, /\.css$/);
  assert.ok(css.length >= 1);
  for (const p of [...css, join(pub, 'index.html')])
    assert.doesNotMatch(readFileSync(p, 'utf8'), /(https?:)?\/\/(fonts\.(googleapis|gstatic)|cdn|unpkg|[a-z0-9.-]+\.[a-z]{2,})\//i, p);
  const all = css.map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const f of ['Fraunces Variable', 'Newsreader Variable', 'Inter']) assert.ok(all.includes(f), f);
  assert.match(all, /font-style:\s*italic/);
  assert.ok(fichiers(pub, /\.woff2$/).length >= 3);
});

test('icônes : lucide-react est installé et exporte ses icônes', async () => {
  const m = (await import('lucide-react')) as Record<string, unknown>;
  for (const n of ['LayoutGrid', 'Flag', 'NotebookPen', 'UsersRound', 'Lock', 'Eye', 'PenLine', 'Sparkles', 'LogOut', 'PanelLeft'])
    assert.ok(n in m, n);
});
