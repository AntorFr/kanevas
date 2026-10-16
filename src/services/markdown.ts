import MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import type Token from 'markdown-it/lib/token.mjs';

// Pure Markdown rendering (AD-113): no database, no side effect. Raw HTML is escaped
// (`html: false`); only `http`, `https` and `mailto` links are links, anything else stays text.
const PROTOCOLES_LIEN = /^(https?|mailto):/i;
/** The reference of a file of the media library in an image or a link (AD-117): `fichier:<id>`. */
const REFERENCE_FICHIER = /^fichier:([1-9]\d{0,14})$/;

/** The three forms of the grammar (`docs/ecrans.md`): text and key are 1 to 200 characters, no `]`, `|` nor line break. */
const LIEN = /\[\[(?:([1-9]\d{0,14})|cle:([^|\]\r\n]{1,200}))(?:\|([^|\]\r\n]{1,200}))?\]\]/y;

/** The inline rule of a `[[…]]` link: one token whose `meta` carries what the grammar found. */
type RegleInline = Parameters<InstanceType<typeof MarkdownIt>['inline']['ruler']['before']>[2];

const regleLien: RegleInline = (state, silencieux) => {
  if (state.src.charCodeAt(state.pos) !== 0x5b) return false;
  LIEN.lastIndex = state.pos;
  const m = LIEN.exec(state.src);
  if (!m) return false;
  // `[[cle:…]]` without a text is not a form; a bare id is.
  if (m[2] !== undefined && m[3] === undefined) return false;
  if (!silencieux) {
    const t = state.push('lien_fiche', '', 0);
    t.meta = {
      debut: state.pos,
      fin: state.pos + m[0].length,
      brut: m[0],
      id: m[1] !== undefined ? Number(m[1]) : null,
      cle: m[2] ?? null,
      texte: m[3] ?? null,
    };
  }
  state.pos += m[0].length;
  return true;
};

/**
 * Builds one renderer. With `avecBlocMJ` the `:::mj` container exists (AD-114): only the
 * exact opening line `:::mj` (three colons, lower case, nothing after) opens it.
 */
function creerMoteur(avecBlocMJ: boolean, avecLiens: boolean): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
  md.enable(['table', 'strikethrough']);

  const validerParDefaut = md.validateLink.bind(md);
  md.validateLink = (url: string): boolean =>
    REFERENCE_FICHIER.test(url.trim()) || (validerParDefaut(url) && PROTOCOLES_LIEN.test(url.trim()));

  // Headings never go above the section title: `#` and `##` become h3, then h4, h5, h6 at most.
  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const niveau = Number(token.tag.slice(1));
    token.tag = `h${Math.min(Math.max(niveau, 2) + 1, 6)}`;
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.heading_close = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const niveau = Number(token.tag.slice(1));
    token.tag = `h${Math.min(Math.max(niveau, 2) + 1, 6)}`;
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
    return self.renderToken(tokens, idx, options);
  };

  // An image is its alternative text; a `fichier:<id>` one is decided by the `fichiers` core rule below.
  md.renderer.rules.image = (tokens, idx, options, env) => {
    const token = tokens[idx]!;
    return md.utils.escapeHtml(md.renderer.renderInlineAsText(token.children ?? [], options, env));
  };
  md.core.ruler.after('inline', 'fichiers', (state) => {
    if ((state.env as EnvRendu).lectureSeule) return;
    for (const bloc of state.tokens) {
      if (bloc.type === 'inline' && bloc.children) bloc.children = decider(bloc.children as unknown as Token[], state.env as EnvRendu, md, state.Token as unknown as new (t: string, tag: string, n: number) => Token) as unknown as typeof bloc.children;
    }
  });

  if (avecBlocMJ) {
    md.use(container, 'mj', {
      validate: (params: string, markup: string) => markup === ':::' && params === 'mj',
      render: (tokens: Token[], idx: number) =>
        tokens[idx]!.nesting === 1
          ? '<div class="bloc-mj" role="note" aria-label="Bloc MJ seul">\n'
          : '</div>\n',
    });
  }
  if (avecLiens) {
    md.inline.ruler.before('link', 'lien_fiche', regleLien);
    md.renderer.rules.lien_fiche = (tokens, idx, _options, env) => rendreLien(tokens[idx]!, (env ?? {}) as EnvRendu);
  }
  return md;
}

const mdSection = creerMoteur(true, true);
const mdScenario = creerMoteur(false, true);
const mdTexte = creerMoteur(false, false);

/**
 * `section`: the text of a section or of a report, where `:::mj` is a GM block (AD-114);
 * `texte` (default): a scenario or a system entry, where `:::mj` stays plain text.
 */
export interface OptionsRendu {
  /** `scenario`: `[[…]]` links are active but `:::mj` stays text (AD-116). */
  nature?: 'section' | 'scenario' | 'texte';
  /** How the links of the text read for the reader (AD-116). Without it a `[[…]]` stays as written. */
  liens?: ResolveurLiens;
  /** `markdown`: a readable link comes out as `[texte](fiche:<id>)`, for the assistant (AD-96). */
  formeLiens?: 'html' | 'markdown';
  /** How the `fichier:<id>` references read for the reader (AD-117). Without it an image is its alternative text. */
  fichiers?: ResolveurFichiers;
}

/** What a link reads as for one reader (AD-116): decided by the target, never by the `liens` table. */
export type RenduLien =
  | { genre: 'fiche'; id: number; type: string; href: string }
  | { genre: 'casse' }
  | { genre: 'attente'; cle: string }
  | { genre: 'texte' };

/** Resolves a link found in the text; built by the service for the reader, one query for the whole text. */
export type ResolveurLiens = (cible: { id: number | null; cle: string | null }) => RenduLien;

/** What a `fichier:<id>` reference reads as for one reader (AD-117, AD-96). */
export type RenduFichier =
  | { genre: 'fichier'; id: number; nom: string; image: boolean; adresse: string }
  | { genre: 'ferme' }
  | { genre: 'supprime' }
  | { genre: 'rien' };

/** Resolves a file reference of the text; built by the service for the reader, one query for the whole text. */
export type ResolveurFichiers = (id: number) => RenduFichier;

export const IMAGE_RESERVEE = 'Image réservée au MJ.';
export const FICHIER_RESERVE = 'Fichier réservé au MJ.';
export const FICHIER_SUPPRIME = 'Fichier supprimé de la médiathèque.';

interface EnvRendu {
  fichiers?: ResolveurFichiers;
  liens?: ResolveurLiens;
  formeLiens?: 'html' | 'markdown';
  /** Reading only (`extraireReferencesFichier`): the `fichiers` rule leaves the tokens as the engine made them. */
  lectureSeule?: boolean;
}

export function rendreMarkdown(source: string, options: OptionsRendu = {}): string {
  const md = options.nature === 'section' ? mdSection : options.nature === 'scenario' ? mdScenario : mdTexte;
  const env: EnvRendu = { liens: options.liens, formeLiens: options.formeLiens, fichiers: options.fichiers };
  return md.render(source, env as Record<string, unknown>);
}

type Jeton = Token;

/** The `html_inline` token that stands for a whole reference: the engine prints its content as is. */
function brutDe(contenu: string, Fabrique: new (type: string, tag: string, nesting: number) => Token): Jeton {
  const t = new Fabrique('html_inline', '', 0);
  t.content = contenu;
  return t;
}

function remplacement(r: RenduFichier | null, image: boolean, md: InstanceType<typeof MarkdownIt>): string | null {
  if (r === null) return null;
  switch (r.genre) {
    case 'ferme':
      return `<span class="fichier-reserve">${image ? IMAGE_RESERVEE : FICHIER_RESERVE}</span>`;
    case 'supprime':
      return `<span class="fichier-supprime">${FICHIER_SUPPRIME}</span>`;
    case 'rien':
      return '';
    default:
      return '';
  }
}

/**
 * Decides every `fichier:<id>` image and link of one inline run (AD-117): a readable file is an image or a
 * link to the bytes route, a closed one the reserved sentence, a vanished one the removed sentence for the GM
 * and nothing for a player. Without a resolver an image stays its alternative text and a link its text.
 */
function decider(
  enfants: Jeton[],
  env: EnvRendu,
  md: InstanceType<typeof MarkdownIt>,
  Fabrique: new (type: string, tag: string, nesting: number) => Token,
): Jeton[] {
  const brut = (contenu: string) => brutDe(contenu, Fabrique);
  const sortie: Jeton[] = [];
  for (let i = 0; i < enfants.length; i++) {
    const t = enfants[i]!;
    if (t.type === 'image') {
      const m = REFERENCE_FICHIER.exec(String(t.attrGet('src') ?? ''));
      if (!m || !env.fichiers) {
        sortie.push(t);
        continue;
      }
      const r = env.fichiers(Number(m[1]));
      const alt = md.renderer.renderInlineAsText(t.children ?? [], md.options, {});
      if (r.genre === 'fichier') {
        if (env.formeLiens === 'markdown') sortie.push(brut(md.utils.escapeHtml(`![${alt}](fichier:${r.id})`)));
        else if (r.image) {
          sortie.push(
            brut(`<img src="${md.utils.escapeHtml(r.adresse)}" alt="${md.utils.escapeHtml(alt)}" loading="lazy">`),
          );
        } else {
          sortie.push(
            brut(
              `<a class="fichier-joint" href="${md.utils.escapeHtml(r.adresse)}" target="_blank" rel="noopener noreferrer">${md.utils.escapeHtml(alt || r.nom)}</a>`,
            ),
          );
        }
      } else sortie.push(brut(remplacement(r, true, md) ?? ''));
      continue;
    }
    if (t.type === 'link_open') {
      const m = REFERENCE_FICHIER.exec(String(t.attrGet('href') ?? ''));
      if (!m) {
        sortie.push(t);
        continue;
      }
      let fin = i + 1;
      while (fin < enfants.length && !(enfants[fin]!.type === 'link_close' && enfants[fin]!.level === t.level)) fin++;
      const dedans = enfants.slice(i + 1, fin);
      const fermeture = enfants[fin];
      i = fermeture ? fin : enfants.length;
      if (!env.fichiers) {
        // No reader to decide for: the label stays, never a link nobody checked.
        sortie.push(...dedans);
        continue;
      }
      const r = env.fichiers(Number(m[1]));
      if (r.genre === 'fichier' && env.formeLiens !== 'markdown') {
        t.attrSet('href', r.adresse);
        sortie.push(t, ...dedans);
        if (fermeture) sortie.push(fermeture);
      } else if (r.genre === 'fichier') {
        const texte = md.renderer.renderInlineAsText(dedans, md.options, {});
        sortie.push(brut(md.utils.escapeHtml(`[${texte}](fichier:${r.id})`)));
      } else sortie.push(brut(remplacement(r, false, md) ?? ''));
      continue;
    }
    sortie.push(t);
  }
  return sortie;
}

const echapper = (t: string) => mdTexte.utils.escapeHtml(t);

function rendreLien(t: { meta?: unknown }, env: EnvRendu): string {
  const m = t.meta as { brut: string; id: number | null; cle: string | null; texte: string | null };
  // No resolver, or the bare input form `[[<id>]]`: the text stays as written.
  if (!env.liens || m.texte === null) return echapper(m.brut);
  const r = env.liens({ id: m.id, cle: m.cle });
  const texte = echapper(m.texte);
  switch (r.genre) {
    case 'fiche':
      return env.formeLiens === 'markdown'
        ? echapper(`[${m.texte}](fiche:${r.id})`)
        : `<a class="lien-fiche" href="${r.href}" data-type="${echapper(r.type)}">${texte}</a>`;
    case 'casse':
      return `<span class="lien-casse" tabindex="0" title="Lien cassé : cette fiche n'existe plus.">${texte}</span>`;
    case 'attente':
      return `<span class="lien-attente" tabindex="0" title="${echapper(`Lien en attente : aucune fiche n'a encore la clé « ${r.cle} ».`)}">${texte}</span>`;
    default:
      return texte;
  }
}

/**
 * A closing fence line, possibly behind the quote or indent marks of its parent. Only space and tab
 * count as blanks, as in the engine: any other Unicode space keeps the block open on screen.
 */
const FERMETURE_BLOC = /^[ \t>]*:{3,}[ \t]*$/;

/**
 * Indentation of a line once its quote markers are removed, a tab counting for 4. The engine does not
 * close a container on a fence indented by 4 or more: neither do we, so nothing after it leaks.
 */
function indentation(ligne: string): number {
  const reste = ligne.replace(/^(?:\s{0,3}>\s?)+/, '');
  let colonnes = 0;
  for (const c of reste) {
    if (c === ' ') colonnes++;
    else if (c === '\t') colonnes += 4 - (colonnes % 4);
    else break;
  }
  return colonnes;
}

/** Number of quote markers (`>`) leading a line: a fence only pairs with fences of its own quote level. */
function profondeurCitation(ligne: string): number {
  return (ligne.match(/^(?:\s{0,3}>)+/)?.[0].split('>').length ?? 1) - 1;
}

/** An opening line `:::mj`, possibly behind quote or indent marks. */
const OUVERTURE_BLOC = /^[\s>]*:::mj\s*$/;

/**
 * The source without the lines covered by the outermost GM blocks (AD-114): read from the
 * start of the `container_mj_open` tokens, never by regular expression for the start of a block. An unclosed block runs
 * to the end of the source; a `:::mj` line in a code block is not a block. Whole lines are
 * removed. A `:::` line inside a code block of a GM block still closes it, as it does on screen:
 * what the GM sees hatched is always removed from the public text.
 */
export function contenuPublic(source: string): string {
  // The engine cuts lines on \r\n, \r and \n: do the same, or its line numbers drift from ours.
  const lignes = source.split(/\r\n|\r|\n/);
  const retirees = lignesBlocMJ(lignes, mdSection.parse(source, {}));
  if (retirees.size === 0) return source;
  return lignes.filter((_, i) => !retirees.has(i)).join('\n');
}

/** The (0-based) lines covered by the outermost GM blocks of a parsed source, see `contenuPublic`. */
function lignesBlocMJ(lignes: string[], tokens: ReturnType<typeof mdSection.parse>): Set<number> {
  const retirees = new Set<number>();
  for (const t of tokens) {
    if (t.type !== 'container_mj_open' || !t.map) continue;
    // Only the start comes from the token. The block runs to the fence that balances its openings
    // (a `:::mj` line inside opens a nested block, the container itself does not nest); never balanced,
    // it runs to the end of the source, even when the container ended with its list or quote.
    let fin = lignes.length;
    let profondeur = 1;
    const niveau = profondeurCitation(lignes[t.map[0]]!);
    for (let i = t.map[0] + 1; i < lignes.length; i++) {
      if (profondeurCitation(lignes[i]!) !== niveau) continue;
      if (OUVERTURE_BLOC.test(lignes[i]!)) profondeur++;
      else if (FERMETURE_BLOC.test(lignes[i]!) && indentation(lignes[i]!) < 4 && --profondeur === 0) {
        fin = i + 1;
        break;
      }
    }
    for (let i = t.map[0]; i < fin; i++) retirees.add(i);
  }
  return retirees;
}

/** A `[[…]]` link found in a source (AD-116). Offsets are in the source, `fin` excluded. */
export interface LienExtrait {
  debut: number;
  fin: number;
  /** `id`: `[[<id>…]]`; `cle`: `[[cle:<clé>|…]]`. Exactly one of them is set. */
  id: number | null;
  cle: string | null;
  /** Null for the bare `[[<id>]]`, which only exists as an input. */
  texte: string | null;
  dansBlocMJ: boolean;
}

const mdLiens = mdSection;

/**
 * The ids of the files a text references with `![…](fichier:<id>)` or `[…](fichier:<id>)`, in order, one entry
 * per occurrence (AD-117). Pure. Read from the tokens of the engine with the very grammar the rendering uses
 * (`REFERENCE_FICHIER`), never by pattern over the text: a form in a code block or a code span is not a reference.
 */
export function extraireReferencesFichier(source: string): number[] {
  const ids: number[] = [];
  const voir = (tokens: ReturnType<typeof mdSection.parse>) => {
    for (const t of tokens) {
      const adresse = t.type === 'image' ? t.attrGet('src') : t.type === 'link_open' ? t.attrGet('href') : null;
      const m = adresse === null ? null : REFERENCE_FICHIER.exec(String(adresse));
      if (m) ids.push(Number(m[1]));
      if (t.children) voir(t.children);
    }
  };
  voir(mdSection.parse(source, { lectureSeule: true } satisfies EnvRendu));
  return ids;
}

/**
 * The `[[…]]` links of a source, in order (AD-116). Pure. They are read from the tokens of the
 * engine, never by pattern over the text: a form inside a code block or a code span is not a link.
 * `dansBlocMJ` follows the lines `contenuPublic` removes. Offsets are those of `source`.
 */
export function extraireLiens(source: string): LienExtrait[] {
  const lignes = source.split(/\r\n|\r|\n/);
  const debuts: number[] = [];
  for (let pos = 0, i = 0; i < lignes.length; i++) {
    debuts.push(pos);
    pos += lignes[i]!.length;
    const saut = /^(\r\n|\r|\n)/.exec(source.slice(pos, pos + 2));
    pos += saut ? saut[0].length : 0;
  }
  const tokens = mdLiens.parse(source, {});
  const mj = lignesBlocMJ(lignes, tokens);
  const trouves: LienExtrait[] = [];
  let curseur = 0;
  let carte: [number, number] | null = null;
  for (const t of tokens) {
    if (t.map) carte = t.map;
    if (t.type !== 'inline' || !t.children?.some((c) => c.type === 'lien_fiche')) continue;
    const base = t.map ?? carte;
    if (!base) continue;
    // Where each line of the inline content sits in the source: found by search, in order, because
    // the engine strips quote marks, list markers and indentation from what it hands the inline rules.
    const segments: { ligne: number; contenu: number; source: number; longueur: number }[] = [];
    let ok = true;
    let decalage = 0;
    t.content.split('\n').forEach((texte, k) => {
      if (!ok) return;
      const ligne = Math.min(base[0] + k, lignes.length - 1);
      const depuis = Math.max(curseur, debuts[ligne]!);
      const idx = source.indexOf(texte, depuis);
      if (idx < 0 || idx + texte.length > debuts[ligne]! + lignes[ligne]!.length) ok = false;
      else {
        segments.push({ ligne, contenu: decalage, source: idx, longueur: texte.length });
        curseur = idx + texte.length;
      }
      decalage += texte.length + 1;
    });
    if (!ok) continue;
    for (const c of t.children) {
      if (c.type !== 'lien_fiche') continue;
      const m = c.meta as { debut: number; fin: number; id: number | null; cle: string | null; texte: string | null };
      const seg = [...segments].reverse().find((x) => x.contenu <= m.debut);
      if (!seg) continue;
      const debut = seg.source + (m.debut - seg.contenu);
      trouves.push({
        debut,
        fin: debut + (m.fin - m.debut),
        id: m.id,
        cle: m.cle,
        texte: m.texte,
        dansBlocMJ: mj.has(seg.ligne),
      });
    }
  }
  return trouves;
}

/** Rewrites links in place: `remplacement` gives the new text of a link, or null to keep it. */
export function reecrireLiens(
  source: string,
  liens: LienExtrait[],
  remplacement: (l: LienExtrait) => string | null,
): string {
  let sortie = source;
  for (const l of [...liens].sort((a, b) => b.debut - a.debut)) {
    const neuf = remplacement(l);
    if (neuf !== null) sortie = sortie.slice(0, l.debut) + neuf + sortie.slice(l.fin);
  }
  return sortie;
}

/**
 * Preview of the editor (AD-113, AD-114 6). Without `nature: 'section'` the text is a scenario or
 * a system entry and `:::mj` stays text; with it, the GM block is rendered only for a GM of the
 * universe outside player mode, and does not exist for anyone else.
 */
export function rendreApercu(
  source: string,
  mj: boolean | null,
  liens?: ResolveurLiens,
  nature: 'scenario' | 'texte' = 'texte',
): string {
  if (mj === null) return rendreMarkdown(source, { nature, liens });
  return mj
    ? rendreMarkdown(source, { nature: 'section', liens })
    : rendreMarkdown(contenuPublic(source), { nature: 'scenario', liens });
}
