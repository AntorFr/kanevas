# Kanevas — visual design guidelines

> Product documentation. Tokens read by the code live in `frontend/src/ui/tokens.css`; this
> document explains their meaning, each component's behaviour and the measured thresholds. The
> reference mockup is `docs/maquettes/e09-fiche.html`: it includes the shell of all
> universe screens and the shared components below (the assistant panel, update proposal and system card have only their description here and their own mockups, listed under “Mockups” in `docs/ecrans.md`), in both themes, on desktop and
> phone. Changing an existing token's value changes every screen: it is a decision
> for Monsieur, recorded here with its reason (see “Deliberate deviations”).

## 1. Direction

- **Subject.** The memory of a role-playing table. A GM writes here at their desk in the evening, for long stretches;
  a player rereads on her phone between sessions. People **read** long texts here, and
  secrecy and sharing are central: a leak means a spoiler.
- **References.** Notion's document page (one reading column, blocks without frames, the
  title opening the page); Linear's navigation and menus (density, icons everywhere, account
  menu, subtle hover and focus states); world wikis (World Anvil, Kanka)
  for vocabulary — sheets, lore, relations — without their clutter of panels.
- **Distinctive trait: “who sees what”, made tangible.** Each section has an
  **audience rule** in its margin: solid green, the table reads it; neutral dashes, entrusted to a
  player; and a **GM-only** section becomes more than text — a hatched texture and
  amber rule, extending beyond the column. Scrolling down a sheet, you read its map of secrets
  in the margin before reading a word. Player mode erases the margin: there is nothing to hide
  from someone who sees only what they may see.
- **Book typography, tool interface.** Fraunces for headings (a serif with an optical axis,
  warm without looking “medieval”), Newsreader for reading text (designed for long
  reading on screen), Inter for everything interactive. The accent is **ink**: an indigo
  meaning “act, write”, far from the amber of secrecy and the green of the table.

## 2. Tokens

Source: `frontend/src/ui/tokens.css`, properties on `:root` (dark) and
`:root[data-theme="light"]`; `color-scheme: light dark`. The « Clair » / « Sombre » / « Système » choice is
remembered (`localStorage`, key `kanevas-theme`); « Système » follows `prefers-color-scheme` and is
the default until a choice is stored; `theme.ts` resolves it to dark or light, so these two blocks are the only places
where colours live. Three tokens derived from GM tokens (`--mj-section-fond`, `--mj-section-bord`, `--mj-section-filet`, blended through `color-mix`) give a « MJ seul » section its background, border and amber rule. Components read only these tokens: a hex value in a component
is a defect. The mockup carries the same names and values.

Neutrals are tinted towards ink (a very slight cool blue), never pure grey.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--fond` | `#121317` | `#fcfcfd` | document page background |
| `--fond-lateral` | `#0e0f12` | `#f4f5f7` | sidebar |
| `--surface` | `#191a1f` | `#ffffff` | floating elements (menu, settings, dialog, toast), field, inline form |
| `--surface-2` | `#202128` | `#f1f2f5` | item hover, segment background, relation target |
| `--surface-3` | `#2a2b33` | `#e8e9ee` | neutral button, off switch |
| `--bord` | `rgba(255,255,255,.08)` | `rgba(22,26,44,.09)` | decorative divider (header rule, between blocks) |
| `--bord-fort` *(new)* | `rgba(255,255,255,.14)` | `rgba(22,26,44,.16)` | border of a neutral button, thumbnail, inline form |
| `--bord-champ` | `#74757f` | `#808290` | border that **identifies** a field, checkbox, off switch (3:1) |
| `--texte` | `#ebecf0` | `#1a1b22` | body text, reading text |
| `--texte-2` | `#a6a7b0` | `#4a4c58` | secondary text, idle navigation item |
| `--texte-3` | `#8b8c97` | `#646674` | help, caption, group heading, empty state |
| `--accent` | `#8b9bf0` | `#3a4cc0` | ink: primary action, on switch, current choice |
| `--sur-accent` | `#11142b` | `#ffffff` | text on `--accent` |
| `--accent-texte` | `#9aa6f5` | `#3a4cc0` | accent icon or text (current item, avatar) |
| `--accent-fond` | `rgba(154,166,245,.16)` | `rgba(58,76,192,.10)` | current navigation item, halo around a field being edited |
| `--mj` | `#f2a33c` | `#8a5300` | **GM-only**: text, icon, GM-only section rule, secret attachment frame (since `kanevas-import`: a GM-only file) |
| `--mj-fond` | `rgba(242,163,60,.14)` | `rgba(214,140,30,.14)` | « MJ seul » badge background, « Mode MJ » segment |
| `--mj-bord` *(new)* | `rgba(242,163,60,.42)` | `rgba(176,108,10,.45)` | border of a GM-only section, secret attachment (a GM-only file) |
| `--mj-trame` *(new)* | `rgba(242,163,60,.075)` | `rgba(176,108,10,.09)` | GM-only section hatching (1 px every 8 px, at 135°) |
| `--table` | `#3fc79a` | `#08694a` | **read by the table**: text, icon |
| `--table-fond` | `rgba(63,199,154,.14)` | `rgba(8,105,74,.12)` | « Lue des joueurs » badge, « Mode Joueur » segment, Player mode banner |
| `--table-bord` *(new)* | `rgba(63,199,154,.55)` | `rgba(8,105,74,.70)` | audience rule of a section read by players |
| `--danger` | `#ec7b6f` | `#b4352b` | error, refusal, destructive action |
| `--sur-danger` *(new)* | `#1a0c0a` | `#ffffff` | text on a `--danger` button |
| `--danger-fond` | `rgba(236,123,111,.14)` | `rgba(180,53,43,.10)` | error message, lost connection banner |
| `--focus` | `#9aa6f5` | `#3a4cc0` | focus ring |
| `--voile` *(new)* | `rgba(5,6,9,.62)` | `rgba(20,22,34,.38)` | beneath a dialog, beneath the drawer |
| `--ombre-flottant` *(new)* | white ring 6 % + shadow 32 px | ink ring 8 % + shadow 32 px | all floating elements (the product's only shadow) |
| `--squelette` *(new)* | `rgba(255,255,255,.06)` | `rgba(22,26,44,.07)` | loading blocks |

**Typography.** `--police-titre`: Fraunces (optical axis: 144 for a sheet title, 48 for
a section), fallback `"Iowan Old Style", Georgia, serif`. `--police-lecture` *(new)*:
Newsreader, same fallback. `--police-texte`: Inter, fallback `system-ui, -apple-system, "Segoe UI",
Roboto, sans-serif`. In production, all three are served by the product (`@fontsource`,
weights 400/500/600, Newsreader with italics), never by an external host; the mockup gets them
from Google Fonts. Scale: `--t-12` caption, badge · `--t-13` dense interface (navigation,
buttons, blocks) · `--t-14` interface body · `--t-16` dialog heading · `--t-18`
*(new)* reading text (17 px on phones), line height 1,68, at most 66 characters per line ·
`--t-22` section heading · `--t-32` *(new)* sheet title on phones · `--t-40`
*(new)* sheet title on desktop, line height 1,08, letter spacing −1,5 %. Weights: 400 reading,
500 interface and headings, 600 universe name and dialog headings. *(kanevas-import)* `--police-code`: system stack
`ui-monospace, "SF Mono", Menlo, Consolas, monospace`, for content copied verbatim (an API
token, an address, an origin key, code within text); no additional font is served.

**Spacing.** 4 px grid: `--e-1` 4 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 24 ·
`--e-6` 32 *(new)* · `--e-7` 48 *(new)* · `--e-8` 64 *(new)*. Reading column:
784 px wide including margins (688 px of text), centred; 64 px above the title; 32 px
between sections; audience margin 28 px to the left of the column (18 px below 1 080 px,
10 px on phones, where the gutter is 16 px).

**Depth.** One strategy: **planes of colour and thin rules**; one
shadow, `--ombre-flottant`, reserved for elements floating above the page. Sections are not
cards: only a GM-only section has a texture. Radii: `--rayon-item` *(new)*
6 px (item, icon button, segment) · `--rayon-champ` 8 px (button, field, thumbnail, file
row) · `--rayon-panneau` 12 px (menu, dialog, inline form, GM-only section) ·
`--rayon-pastille` 999 px.

**Icons.** Lucide, stroke 1,75, 16 px (14 px in a button or block row, 12 px in a
badge), `currentColor`. Served by the product (`lucide-react`), never by a CDN. An icon
beside each navigation item and each action; an icon-only button has an
accessible label and a tooltip. Never emoji. Fixed mappings: « Vue d'ensemble »
`layout-grid`, « Campagnes » `flag`, « Comptes-rendus » `notebook-pen`, « Personnages » `users-round`, « Lieux »
`map-pin`, « Factions » `shield`, « Objets » `gem`, « Événements » `hourglass`, « Quêtes » `scroll-text`, « Membres »
`contact-round`, « Paramètres » `settings-2`, « Systèmes de jeu » `dices`, « Mes univers » `library`, « Cartes » `map`, « Administration » `shield-check`, « Relations » `waypoints`, « Pièces jointes » `paperclip`, GM-only
and secret `lock`, read by players `eye`, written by players `pen-line`, GM mode
`lock-keyhole`, assistant `sparkles`, theme `sun` / `moon` / `monitor`, sign-out `log-out`,
phone menu `panel-left`.
Since `kanevas-import` (new types and screens, same set, same rules): « Créatures » `paw-print`,
« Races » `dna`, « Vaisseaux » `ship`, « Savoirs » `lightbulb` (general knowledge: history, phenomena, resources, chronology), « Récits » `book-open`, « Règles » `scale`, « Notes »
`sticky-note`, « Rechercher » `search`, « Accès par API » `key-round`, « Médiathèque » `images`, document `file-text` (PDF), `file-spreadsheet` (spreadsheet), `file-archive` (archive), `file` (other), editor's « Fichier » `paperclip`, « Cartes » `map` (the bar had it without a fixed icon), GM-only image `lock` (neutral frame, `--texte-3`), label `tag`, « Contient »
`folder-tree`, « Mentionnée dans » `link-2`, tree view `list-tree`, broken link `link-2-off`.

**Motion.** `--duree` 160 ms, `--courbe` *(new)* `cubic-bezier(.2,.7,.2,1)`. Only
these move: a menu, settings panel or dialog appearing (opacity and 4 px), the drawer,
toast and switch. No page entrance animation. Under `prefers-reduced-motion`,
`--duree` is 0.

## 3. Conventions

Those Kanevas follows:

- **Account**: an avatar and identifier at the bottom of the sidebar, opening a menu —
  the identifier (« Votre identifiant »), **theme** as a three-icon toggle (sun, moon,
  monitor), « Se déconnecter ». None of this is spread through navigation.
- **Navigation**: universe selector at the top (seal, name, role badge, menu of the
  account's universes and « Mes univers »); grouped icon items, group headings in sentence
  case (« Lore », « Univers »), current item on `--accent-fond` with its icon in
  `--accent-texte`; a drawer under a « Menu » button on phones.
- **Top bar**: breadcrumb (universe › type › readable ancestors › sheet; on phones (≤ 760 px), the universe seal and type label disappear, and at 480 px and below ancestors collapse (a « … » menu from two ancestors onwards); E-9 gives the details) and, on screens that have it, the GM / Player mode toggle.
- **Inline editing**: « Modifier » turns the section into a field with the same typography, in
  the same place; Escape cancels, Ctrl/⌘ + Enter saves; the character counter is visible.
- **Infrequent settings are collapsed**: a section's audience is read from its badge and
  configured behind it. **Secondary actions appear on hover and focus** (« Modifier »
  and a section's « ⋯ » menu, « Retirer » on a relation or member; a member's role is
  configured behind a badge menu, like the status); they stay visible where
  hover is unavailable (touchscreen).
- **Feedback**: a toast per successful action; an inline message above the relevant
  panel for a failure (text from `docs/ecrans.md`); skeletons when loading
  a sheet.
- **Components** are custom drawn: menus, switches, checkboxes, segmented toggles, dialogs.
  A native select is kept only for a choice from a short list
  (author, sheet type), styled (background, border, Lucide chevron).

Deliberate departures from convention:

- **No ⌘K palette** yet: `docs/ecrans.md` describes none; search lives
  in E-8. It is proposed, not designed.
- **The assistant button is dark on light (inverted), not accented**: it floats on
  every page and must not be confused with the screen's primary action.

**Secrets within text** (`kanevas-import`, no new token). A **GM block** in the middle
of a section takes the texture of a GM-only section at paragraph scale: hatching
`--mj-trame`, 2 px `--mj` left rule, `--mj-bord` border, `--rayon-champ`, « MJ seul » badge
(`lock`) at the top; it does not overflow the column (only the whole section overflows). A **sheet
link** uses `--accent-texte`, underlined at 1 px with 30 % opacity, solid on hover; a **broken
link** (GM-only) keeps the text colour with a dashed `--danger` underline; a **waiting link**
(GM-only), dashed `--texte-3`. A link to an unreadable sheet has **no** marking: it is
text. State is conveyed by the underline **and** the tooltip, never colour alone.

## 4. Components

For each: **V** visual, **C** behavioural. All have the focus ring (2 px `--focus`,
2 px offset) on `:focus-visible`.

**Button** (neutral, primary, danger, ghost; normal 30 px, small 26 px; icon button 28 px).
- V: neutral `--surface-3`, border `--bord-fort` (hover: `--bord-champ`), text `--texte`;
  primary `--accent` / `--sur-accent` (hover: 12 % `--texte` blended in); danger `--danger` /
  `--sur-danger`; ghost without background, `--texte-2`, hover `--surface-2` and `--texte`;
  icon button `--texte-3`, hover `--surface-2` (danger: `--danger-fond` and `--danger`). Radius
  `--rayon-champ` (icon: `--rayon-item`). Lucide icon 14 px left of the label. Disabled:
  45 % opacity and not-allowed cursor. Loading: label « … ».
- C: Tab reaches it, Enter and Space activate it; disabled, it carries `aria-disabled="true"`
  and does not fire; while sending, it displays « … » and fires only once. A destructive
  button names the verb and object (« Retirer la section », « Retirer le fichier »), never
  « OK ». An icon button has an accessible label naming the object (« Retirer la relation
  membre de → Lames Grises ») and a short tooltip (« Retirer »). 36 to 40 px on phones.

**Menu** (account, universe, section actions).
- V: `--surface`, `--ombre-flottant`, radius `--rayon-panneau`, 4 px padding;
  32 px entries (40 on phones), `--texte-3` icon on the left, hover `--surface-2`; a
  danger entry in `--danger` (including the icon); divider `--bord`; group heading 12 px
  `--texte-3`. Appearance: opacity and 4 px, `--duree`.
- C: the opening button carries `aria-haspopup="menu"` and `aria-expanded`; the menu
  `role="menu"`, its entries `role="menuitem"`. Opened with the keyboard, focus moves to the first
  entry; ↑ ↓ move it; Escape closes and returns focus to the button; clicking outside closes.
  An unavailable entry (« Monter » on the first section) is `aria-disabled`, visible,
  inert. A section's menu: « Monter », « Descendre », then « Retirer la section ».

**Switch** (the four boolean audience settings).
- V: 32 × 18 px; off `--surface-3` bordered by `--bord-champ`, thumb `--texte-2`; on
  `--accent`, thumb `--sur-accent` on the right. The whole row (40 px) is the target; its
  label is on the left with its icon.
- C: `role="switch"` and `aria-checked`; Space and clicking the row toggle it; the
  change is saved immediately (no « Enregistrer » button) and confirmed by a toast;
  on failure it returns to its previous value and the message « L'action n'a pas abouti.
  Réessayez. » appears. Motion follows `--duree`.

**Audience badge** (and role, secret badges).
- V: 22 px high, pill radius, 12 px weight 500, Lucide icon 12 px. A section's four
  states: **« Lue des joueurs »** (`eye`, `--table` on `--table-fond`); **« Écrite par les
  joueurs »** (`pen-line`, same colours); **« Confiée à Léa »** (author avatar, neutral
  `--texte-2` on `--surface-2`); **« MJ seul »** (`lock`, `--mj` on `--mj-fond`). Role in the
  selector: « MJ » amber, « Joueur » green. Secret attachment: « Secrète — MJ seul » (`lock`, *since `kanevas-import`, a GM-only file carries the « MJ seul » badge, same rendering; AD-111*,
  `--mj` on `--surface` bordered by `--mj-bord`), placed on the thumbnail. On a GM's sheet, the
  badge is a button (12 px chevron): on hover, a ring in its own colour. It sits
  **just after the section title**, never pushed away by actions.
- C: state is conveyed by **icon + word + colour**, never colour alone. Wording follows the
  five settings: players read it → « Lue des joueurs » (« Écrite par les joueurs » if they
  also write it); otherwise an author reads or writes it → « Confiée à <auteur> »; otherwise
  « MJ seul ». It opens audience settings (a `role="dialog"` panel, titled « Qui voit
  « <section> » », 320 px): the two player switches, the « Auteur » list (none,
  then the universe's Players), the two author switches, and « Chaque changement est
  enregistré aussitôt. ». Escape closes it and returns focus to the badge. Its accessible label
  names the state and action (« Lue des joueurs — régler l'audience de « Apparence » »). It
  exists neither for a Player nor in Player mode.

**Audience rule and GM-only section** (the distinctive trait).
- V: 28 px to the left of the column, a 2 px rule over the section's height:
  solid `--table-bord` (read, or written, by players), dashed `--bord-champ` 4/4 (entrusted).
  The GM-only section overflows 28 px on each side of the column (its text stays aligned):
  `--mj-fond` background at 22 % under `--mj-trame` hatching (1 px every 8 px, 135°),
  `--mj-bord` border at 45 %, 3 px `--mj` left rule, right corners rounded to `--rayon-panneau`.
  E-14 (« Paramètres ») reuses this closed block for its three GM blocks (« Identité », « Système de jeu », « Créer un système »), in a
  688 px column (page `max-width`); as in E-6, blocks overflow by 28 px on each side.
- C: purely redundant — the badge says the same thing in words; the rule is never the sole
  carrier. It changes with the setting (a section closed to players becomes hatched before
  the GM's eyes). In Player mode, no rule or hatching: the GM-only section does not exist.

**Toast.**
- V: `--surface`, `--ombre-flottant`, radius `--rayon-champ`, 40 px high; icon
  `circle-check` in `--table`, 13 px text, « Fermer » icon button. Centred at the bottom on desktop;
  on phones, full width minus the space for the assistant button; while audience
  settings (bottom sheet on phones) are open, toasts move to the top of the screen
  to avoid covering any row.
- C: a toast per successful action (« « Rumeurs entendues » enregistrée », « Audience de
  « Apparence » enregistrée », « Section « … » retirée »), in a `role="status"` region with
  `aria-live="polite"`; it leaves on its own after 4 s, or on « Fermer »; it never takes focus.
  A failure is not a toast: it is an inline message that stays.

**Dialog** (section removal confirmation).
- V: `--surface` on `--voile`, `--ombre-flottant`, radius `--rayon-panneau`, at most 440 px,
  24 px margin; 36 px icon badge (`trash-2` in `--danger` on `--danger-fond`); heading
  16 px weight 600; text `--texte-2`; buttons on the right, neutral « Annuler » then the danger
  action.
- C: `role="alertdialog"`, `aria-modal`, titled and described; focus enters on « Annuler » and
  stays within (Tab loops); Escape or clicking the overlay closes; focus returns to the button that
  opened it (to the sheet title if the section disappeared). Text comes from
  `docs/ecrans.md`. File removal confirmation, however, happens **inline**: the
  row « Retirer « plan-des-egouts.pdf » ? Le fichier sera perdu. » with « Annuler » and
  « Retirer le fichier ».

**Field** (text, section textarea, list, checkbox).
- V: 34 px, `--surface`, border `--bord-champ`, radius `--rayon-champ`, 12 px label
  weight 500 `--texte-2` above; on focus, `--accent` border and 3 px
  `--accent-fond` halo. A section's textarea keeps the reading typography (Newsreader
  18 px) on `--surface`, bordered by `--accent` with a halo, footer « 313 / 100 000 », keyboard help,
  « Annuler », « Enregistrer ». Checkbox: 16 px, `--bord-champ` border; checked `--mj` (the product's
  only checkbox says « Secrète (MJ seul) »).
- C: a visible label linked to the field; the error appears beneath in `--danger` with
  « Erreur : » before it, linked by `aria-describedby`; input is never lost on failure.

**Navigation item.**
- V: 30 px (40 on phones), radius `--rayon-item`, 16 px `--texte-3` icon and 13 px
  weight 500 `--texte-2` label; hover `--surface-2`, `--texte`; current `--accent-fond`, label
  `--texte`, icon `--accent-texte`. Group heading 12 px `--texte-3`, sentence case.
- C: inside a labelled `nav`; the current item carries `aria-current="page"`; an item whose screen
  is not offered to the role, or not built, is absent. On phones the bar is a drawer
  (at most 300 px, on `--voile`) under the « Menu » button (`panel-left`, `aria-expanded`); Escape
  or tapping the overlay closes it and returns focus to « Menu ».

**Avatar.**
- V: 28 px circle (16 px in a badge), initials in 11 px weight 600; signed-in
  account on `--accent-fond` / `--accent-texte`; player author on `--table-fond` /
  `--table`.
- C: decorative (`aria-hidden`): the name is always written beside it. The account button
  (avatar, identifier, chevron) opens the account menu, `aria-haspopup="menu"`.

**GM / Player mode toggle.**
- V: two segments on a `--surface-2` background; « Mode MJ » (`lock-keyhole`) active in `--mj`
  on `--mj-fond`; « Mode Joueur » (`eye`) active in `--table` on `--table-fond`. On phones:
  « MJ » and « Joueur ». In Player mode, a `--table-fond` banner below the top bar: « Mode
  Joueur : vous voyez ce que voit un joueur. »
- C: `role="radiogroup"`, two `role="radio"`; ← → switch; the banner is `role="status"`.

**Section block** (« Relations », « Pièces jointes »).
- V: a row below the text, separated by `--bord`: label on the left (136 px, icon and 13 px
  `--texte-3`), content on the right; on phones, stacked. Relation: « membre de »
  `--texte-2`, arrow, then the target as a chip (`--surface-2`, type icon, title, type in
  `--texte-3`). Thumbnail 160 × 120, radius `--rayon-champ`, 12 px caption below then its
  icon buttons; a secret attachment (a GM-only file, since `kanevas-import`) has a 2 px `--mj` border and its badge. File:
  a 40 px row bordered by `--bord` (secret: `--mj-bord` and `--mj` rule), icon, name,
  size, icon buttons. Upload: the same row with « Envoi… 42 % » and a 2 px
  `--accent` bar. Empty: « Aucune relation pour l'instant. » in `--texte-3` followed by the action.
- C: each role sees what `docs/ecrans.md` describes (a block with nothing to say does not exist
  for a player; the GM sees every block, even empty).

**Banner** (lost connection, stub mode, Player mode).
- V: full width, attached below the top bar, opaque (`--fond` beneath the tint); lost
  connection `--danger` on `--danger-fond` with `wifi-off`; stub mode `--mj` on `--mj-fond`.
- C: `role="status"`, not dismissible; exact text in `docs/ecrans.md`. Lost connection: every
  write action is disabled (`aria-disabled`, 45 %).

**Assistant panel** (E-12, `kanevas-assistant-membre`).
- V: an **inverted** floating « Demander à Kanevas » button (`--texte` on `--fond`, see “Deliberate
  deviations”), pill radius, `sparkles` icon, `--ombre-flottant`, bottom right; panel on
  `--fond-lateral`, left border `--bord-champ`, 380 px, full screen below 760 px; person's
  message `--surface-3`, answer `--surface` with `--bord` border; « Écrit par l'assistant » block:
  `--surface-2`, `--accent` rule, wording in `--accent-texte`; error: `--danger-fond` and
  `--danger`. The « Envoyer » button and the others follow **Button** above.
- C: the button is reachable by Tab and carries `aria-expanded`; the panel is a
  titled (`h2`) `complementary`; on opening, focus moves to the field, Escape closes and returns focus to the
  button; a new answer is announced (`role="log"`, `aria-live="polite"`); « Kanevas
  réfléchit… » is a `role="status"`; an error is a `role="alert"`; the unavailable state disables
  the field **and** says why. The button never obscures a screen field or button: the
  content keeps a bottom margin equal to the button's height. No state through colour alone.
- **Update proposal** (E-12 block, `kanevas-monde`). V: a taller « Écrit par l'assistant » block:
  `--surface-2`, `--accent` rule; « Mise à jour proposée » in `--accent-texte`; two
  areas side by side, « Actuel » on `--surface` with `--bord` border, « Proposé » on `--accent-fond` with
  `--accent` border (never a diff's red and green: colour alone says nothing); « Appliquer »
  primary button, « Abandonner » secondary button; stale: `--danger-fond` and `--danger` banner.
  C: each area is a labelled region (`role="region"`, `aria-label` « Actuel » / « Proposé »),
  `tabindex="0"` for keyboard scrolling; maximum height 15 lines; « Appliquer » disabled
  through `aria-disabled` (it stays in tab order, the reason is read in the banner); the
  result (« Appliquée… », « Proposition abandonnée. ») is a `role="status"`, the reason for
  staleness a `role="alert"`; after « Appliquer » or « Abandonner », focus moves to the result. Below
  760 px the areas stack.
- **Modal** (create a sheet). V: `--surface` on overlay; C: `role="dialog"`, focus
  enters and stays within, Escape closes, focus returns to the opening button.
- **Screen state** (empty, loading, error, refusal). V: a centred block, `--texte-2` text, a
  heading, an action. C: loading `role="status"`; error `role="alert"` with the
  « Réessayer » button.

**Sheet card** (E-8 grid, `kanevas-illustrations`).
- V: no frame or shadow (cards are not a kit); a 4:3 thumbnail, radius
  `--rayon-champ`, inner rule `--bord` (`--bord-fort` on hover), image in `object-fit:
  cover`, `object-position: 50% 30%`; below, 14 px weight 500 title over at most two lines
  and the « PJ » / « PNJ » badge (`.type`). Hover: `--surface-2` behind the card, 6 px overflow.
  **Fallback thumbnail**: `--surface-2` with `--bord-fort` dots (1 px every 12 px) —
  never hatching, which means secrecy —, initial in Fraunces 56 px `--texte-3` (4,81 / 5,08:1
  on `--surface-2`), type icon in a 26 px `--surface` chip at top left.
- C: the whole card is a link (focus ring around it); the image is decorative
  (`alt=""`) since the title follows; it loads as it approaches the viewport; an image that fails gives way
  to the fallback without a message.

**System card** (E-16) and **universe card** (E-1): the sheet card, with a drawn header
instead of an image.
- V: same rules as the sheet card — no frame or shadow, hover `--surface-2` behind the
  card, inner rule `--bord` (`--bord-fort` on hover); 2:1 header, radius `--rayon-champ`,
  on `--surface-2`. System: `--bord-fort` lattice, large die in `--accent-fond` bordered
  by `--accent-texte` at 55 % with an ink halo, small die `--surface` bordered by `--bord-champ`,
  Fraunces monogram 46 px `--texte-2`. Universe: `--bord-fort` contour lines, the top three
  in `--accent-texte` at 50 %, summit tinted at 14 %; universe seal (44 px, `--surface`)
  at bottom left. Badge at top right (role, or « Lecture seule » on `--surface`).
  Grid `minmax(288 px, 1fr)`, 24 px; one column on phones. Name Fraunces 18 px; metadata 13 px
  `--texte-3`.
- C: the header is decorative (`aria-hidden`), computed from the name, identical on each visit; the whole
  card is one link (focus ring around it); universe chips on a system card
  are not separate links. Never amber or green in the header: they mean secrecy
  and the table.

**Sheet illustration** (E-9 header).
- V: 176 px 4:5 frame (96 px on phones), radius `--rayon-panneau`, inner rule
  `--bord`; GM actions in a `--surface` + `--ombre-flottant` chip, bottom right,
  `image-up` and `trash-2` (danger) icon buttons; « Ajouter une illustration » is a small ghost
  button (`image-plus`) followed by 12 px `--texte-3` help. Upload: 2 px `--accent` bar.
- C: actions appear on hover and focus (always when hover is unavailable), exist neither for a
  Player nor in Player mode; clicking the image opens the original in a new tab;
  removal is confirmed inline (« Annuler » takes focus).

**Loading state.** V: `--squelette` skeletons shaped like the sheet (type, title,
rule, two sections). C: `role="status"`, « Chargement de la fiche… » read and written below.

## 5. Thresholds

Floor: WCAG 2.2 AA. Measured with the `charte-graphique` skill's contrast script (outside this repository), replayed by `frontend/src/ui/contraste.test.ts`; a
translucent colour is composited over what lies beneath.

| Foreground | Background | Theme | Ratio | Threshold | |
|---|---|---|---|---|---|
| `--texte` | `--fond` | dark / light | 15,73 / 16,74 | 4,5 | ok |
| `--texte` | `--surface` | dark / light | 14,72 / 17,16 | 4,5 | ok |
| `--texte-2` | `--fond` | dark / light | 7,76 / 8,31 | 4,5 | ok |
| `--texte-2` | `--fond-lateral` | dark / light | 8,01 / 7,81 | 4,5 | ok |
| `--texte-3` | `--fond` | dark / light | 5,57 / 5,54 | 4,5 | ok |
| `--texte-3` | `--fond-lateral` | dark / light | 5,75 / 5,21 | 4,5 | ok |
| `--texte-3` | `--surface` | dark / light | 5,21 / 5,68 | 4,5 | ok |
| `--texte-3` | `--surface-2` | dark / light | 4,81 / 5,08 | 4,5 | ok |
| `--sur-accent` | `--accent` | dark / light | 6,94 / 7,06 | 4,5 | ok |
| `--accent-texte` | `--fond` | dark / light | 8,09 / 6,88 | 4,5 | ok |
| `--texte` (current item) | `--accent-fond` on `--fond-lateral` | dark / light | 12,48 / 13,52 | 4,5 | ok |
| `--accent-texte` (current icon) | `--accent-fond` on `--fond-lateral` | dark / light | 6,42 / 5,56 | 3 | ok |
| `--mj` | `--mj-fond` on `--fond` | dark / light | 6,97 / 5,43 | 4,5 | ok |
| `--mj` | `--mj-fond` on `--surface-2` (« Mode MJ » segment) | dark / light | 5,87 / 5,01 | 4,5 | ok |
| `--mj` | `--surface` (« Secrète — MJ seul » on thumbnail) | dark / light | 8,34 / 6,33 | 4,5 | ok |
| `--texte` | GM hatching on `--fond` (GM-only section text) | dark / light | 15,06 / 15,03 | 4,5 | ok |
| `--table` | `--table-fond` on `--fond` | dark / light | 6,84 / 5,45 | 4,5 | ok |
| `--table` | `--table-fond` on `--surface-2` (« Mode Joueur » segment) | dark / light | 5,77 / 5,02 | 4,5 | ok |
| `--table-bord` (audience rule) | `--fond` | dark / light | 3,40 / 4,24 | 3 | ok |
| `--danger` | `--danger-fond` on `--fond` | dark / light | 5,53 / 5,03 | 4,5 | ok |
| `--texte` (error message) | `--danger-fond` on `--fond` | dark / light | 12,90 / 14,33 | 4,5 | ok |
| `--sur-danger` | `--danger` | dark / light | 6,93 / 6,03 | 4,5 | ok |
| `--bord-champ` | `--surface-2` | dark / light | 3,51 / 3,40 | 3 | ok |
| `--bord-champ` | `--surface` | dark / light | 3,80 / 3,81 | 3 | ok |
| `--focus` | `--fond` | dark / light | 8,09 / 6,88 | 3 | ok |
| `--mj` (GM-only section rule) | `--fond` | dark / light | 8,91 / 6,17 | 3 | ok |
| `--fond` (assistant, inverted) | `--texte` | dark / light | 15,73 / 16,74 | 4,5 | ok |

Measured and rejected along the way: the former light green, `#0a7554` (then `#0b7352`), fell
to 4,42:1 in the « Mode Joueur » segment and its rule to 2,39:1; light `--table` changed to
`#08694a` and `--table-bord` to 70 %.

Guaranteed by construction: the focus ring is never removed without replacement (2.4.7); the
sticky top bar (52 px) and banners are compensated by `scroll-padding-top` and never
obscure the focused element (2.4.11); every target is at least 24 × 24 CSS px (the
smallest, the 22 px-high badge and 26 px icon buttons, are spaced so
that their 24 px circle touches no other target), 36 to 40 px on phones (2.5.8);
no state relies on colour alone — audience, role, secret, mode: icon + word +
colour (1.4.1). `--texte-3` is never placed on `--surface-3`.

## 6. Deliberate deviations

No ratio below a threshold.

**Existing token values changed by these guidelines — Monsieur's decision.** The mockup
and these guidelines carry them; `frontend/src/ui/tokens.css` has carried them since `kanevas-refonte-visuelle` (names do not
change: the code reads them as they are).

| Token | Before (dark / light) | After | Reason |
|---|---|---|---|
| `--accent`, `--accent-texte`, `--accent-fond`, `--focus`, `--sur-accent` | violet `#8b7cf6` / `#5240d0` | ink `#8b9bf0` / `#3a4cc0` | violet is the default colour of SaaS and “AI” products; ink means writing, and differs from amber and green without competing with them |
| `--fond`, `--fond-lateral`, `--surface`, `--surface-2`, `--surface-3`, `--bord`, `--bord-champ`, `--texte`, `--texte-2`, `--texte-3` | warm grey neutrals (`#101012`… / `#f4f3f0`…) | neutrals tinted towards ink; in light mode, an almost white page (`#fcfcfd`) | a document page is read on white; pure greys looked like a “form” |
| `--table`, `--table-fond` (light) | `#0a7554` | `#08694a` | the former green fell to 4,42:1 in the « Mode Joueur » segment |
| `--mj-fond` (light) | `rgba(242,163,60,.14)` | `rgba(214,140,30,.14)` | an amber tint specific to light mode, denser on white |
| `--danger`, `--danger-fond` (light) | `#b0332a` | `#b4352b` | measured alignment; almost unchanged |
| `--police-titre`, `--police-texte` | system serif and sans-serif | Fraunces, Inter (served by the product) | a real font chosen for the subject; the system font made the screen look “basic” |
| `--duree` | 120 ms | 160 ms | within the 150–250 ms range; 120 ms felt abrupt on menus |
| sheet title (`h1`) | `--t-22` | `--t-40` (`--t-32` on phones) | the title opens the page like a document; `--t-22` remains the section heading |

Tokens marked *(new)* are added without changing anything existing.
