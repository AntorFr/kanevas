# Kanevas — visual design guidelines

> Product documentation. Tokens read by the code live in `frontend/src/ui/tokens.css`; this
> document explains their meaning, each component's behaviour and the measured thresholds. The
> reference mockup is `docs/maquettes/e09-fiche.html`: it includes the shell of all
> universe screens and the shared components below (the assistant panel, update proposal and system card have only their description here and their own mockups, listed in the mockups section of `docs/ecrans.md`), in both themes, on desktop and
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
Since `kanevas-battlemap-assets` (E-25): « Bibliothèque » `images`, selection bar « Catégorie » `shapes`, « Empreinte » `scaling`, « Vue de dessus » `layers`, « Visibilité » `eye`, « Retirer… » `trash-2`, « Ajouter des images » `upload`, « Choisir dans la médiathèque » `library`.

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

**The brand (`kanevas-icones`, AD-135).** The "Marge" icon (`assets/brand/kanevas-marge/`: ink #121317,
periwinkle #8B9BF0, paper #FCFCFD — neutrals and the accent of the charter, no token added) is Kanevas's
identity. It shows in the tab (favicon), on the home screen (apple-touch-icon), at install (manifest), and
**in the sidebar, in place of the "K" square**, outside a universe: the `favicon.svg` image at 30 px (same size as
the universe seal), empty `alt` (the link carries "Kanevas — Mes univers"), no border, shadow or added background,
identical in both themes (its ink square carries its own background). The **universe seal** (initial of the name)
is not the brand and does not change. Inside a universe, the sidebar shows the selector, not the brand. The icon is
not redrawn and not recoloured.

The sign-in page is not ours (Authelia; in stub mode a plain server page) and declares no brand (a browser asks `/favicon.ico` by itself and may show the icon in that tab, since the file is public); the tab icon of the app is declared by `index.html`. The source is the pack's main icon (ink square variant, « Encre & papier »).

*States.* Loading, empty, permission denied and extreme content do not apply to the brand (a fixed image, the same
for every role, and served without a session). If the image fails to load (network, 404), the link shows
« Kanevas » alone: the 30 px slot stays empty, nothing else moves, and the link keeps its `aria-label`.
Offline use is out of scope (no service worker, see `docs/parcours.md`): the installed app needs the network, and the brand image is no exception. A browser "offers installation" when it shows its own install prompt or menu entry for a manifest with name, icons and `display: standalone`; where, depends on the browser and is not specified here.
*Criteria.* Given the app served, when a browser asks for `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`,
`/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png` or `/site.webmanifest` without a session, then each answers
200, not a redirect to the sign-in. Given a signed-in user outside a universe, when the page opens, then the tab shows
the Marge icon and the sidebar shows it before « Kanevas », in both themes; inside a universe, the sidebar shows the
selector. Given a browser that offers installation, when the user installs, then the app is named « Kanevas » and its
icon is the Marge icon (on iOS, « Add to Home Screen » uses the 180 px apple-touch-icon). The mock-ups under
`docs/maquettes/` still draw the "K" square (for example `e01-accueil.html`): on this point the charter prevails, and the mock-ups are not redrawn.

## 4. Components

For each: **V** visual, **C** behavioural. All have the focus ring (2 px `--focus`,
2 px offset) on `:focus-visible`.

**Button** (neutral, primary, danger, ghost, `mj`; normal 30 px, small 26 px; icon button 28 px).
- V: neutral `--surface-3`, border `--bord-fort` (hover: `--bord-champ`), text `--texte`;
  primary `--accent` / `--sur-accent` (hover: 12 % `--texte` blended in); danger `--danger` /
  `--sur-danger`; ghost without background, `--texte-2`, hover `--surface-2` and `--texte`;
  **`mj` variant** (`variante="mj"`, a GM writing gesture: « Système » trigger, « Ancrer », « Enregistrer » of the map forms): `--mj-fond` background, `--mj-bord` border (hover: `--mj`), `--mj` text, weight 600 — no new token; its contrasts are in the thresholds table;
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
- `kanevas-taille-images` (E-taille-1, verdict of the guardian: existing component, no new one): `Menu`
  gains (1) the trigger variant `varianteDeclencheur: 'outil'`, rendered as the editor's `.outil-md` (Lucide
  `image`, label « Image »), `desactive` outside « Écrire » or with the caret outside an `![…](fichier:N…)`
  reference; (2) the textarea selection is read at opening and the write uses that frozen position, the focus
  goes back to the field on close; (3) the current choice of a `groupe` comes from the title read in the text
  (`aria-checked`), none when the title is no setting. Icons of the `groupe` options: placement `align-left`,
  `align-right`, `align-center`; size three Lucide `square` at 12, 16 and 20 px; labels in `aria-label` and
  `title`. Keyboard: ↑ ↓ cross the choices (no ← →). No token added.

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
  A failure is not a toast: it is an inline message that stays. The variant with an action is specified below.

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
- *Variant without action* (kanevas-outils-cadre, « Transférer la responsabilité » when no other GM
  can take over): same look and icon badge, the footer holds a single « Fermer » button on the right and no
  action button; the text explains why no action is available. Focus enters on
  « Fermer »; Escape and the overlay close; focus returns to the opening button; `role="alertdialog"`,
  titled and described.
- *Neutral variant* (`variante="neutre"`, kanevas-carte-spatiale-edition: « Ancrer ce système ? », « Ajouter un astre », « Rayon de transition »): same frame (at most 440 px) with a neutral badge (`anchor`, `--texte-2` on `--surface-2`), the action in the `mj` Button variant, and form fields as children (`formulaire`: a `.boite-champs` column). Under 760 px the body scrolls inside the dialog (24 px margin kept) so the actions stay reachable. `role="dialog"` when it carries fields, `role="alertdialog"` for a pure confirmation (« Retirer l'astre »); the focus enters on « Annuler » (anchoring, confirmation) or, with `focusChamp`, on the first field (« Ajouter », « Rayon »); Escape, the overlay and the return of the focus are those of the base dialog.

**Field** (text, section textarea, list, checkbox).
- V: 34 px, `--surface`, border `--bord-champ`, radius `--rayon-champ`, 12 px label
  weight 500 `--texte-2` above; on focus, `--accent` border and 3 px
  `--accent-fond` halo. A section's textarea keeps the reading typography (Newsreader
  18 px) on `--surface`, bordered by `--accent` with a halo, footer « 313 / 100 000 », keyboard help,
  « Annuler », « Enregistrer ». Checkbox: 16 px, outline `--bord-champ`; checked in `--mj`
  for « Secrète (MJ seul) », in `--accent` for the search filter « sous-lieux compris » and for the token permissions of E-23. `Case` takes an optional `detail` (kanevas-jeton-unique): a 12 px `--texte-3` line under the 13 px label, inside the `<label>` (clickable, part of the accessible name); without it the output is unchanged.
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

**Segments** (an exclusive choice among a few; `frontend/src/ui/segments.tsx`; the galaxy system « Taille » of E-21 is now a `Curseur`, no longer a `Segments`).
- V: the segments sit on a `--surface-2` background, radius `--rayon-champ`, each at least 44 px high; the checked one
  on `--accent` / `--sur-accent`; the legend above, `--texte-2` 13 px. Disabled: 45 % opacity.
- C: `role="radiogroup"` labelled by the legend, one `role="radio"` per segment with `aria-checked`; a single tab stop
  (the checked segment); ← → ↑ ↓ move and select, wrapping around.
- *`mj` variant* (`variante="mj"`, the GM's « Déplacer » three-frame choice): the checked segment on `--mj-fond` / `--mj` inset-bordered by `--mj-bord`, instead of the accent.


**ApercuEtoile** (the star of a system as the galaxy map draws it: E-21's system dialogue at 40 px and its panel at 56 px; `frontend/src/ui/apercu-etoile.tsx`, `kanevas-carte-rendu-galaxie-systemes`).
- V: an SVG disc on `--surface-2`, radius from `rayonEtoile(taille)` (the map's own function), filled with the free colour if set, else the colour of the class (a datum of the core, `classes_etoile()`, like a free colour: no token), outlined 1 px `--texte-3` so a pale star stays visible on the light ground. No hexadecimal in the component. No animation; redrawn live while the slider moves.
- C: `aria-hidden="true"` in the dialogue (the « Classe » field says it); in the panel `role="img"` with `aria-label` « Étoile de classe <label> », colour never saying it alone. A Player gets it in the panel only.
- Contrast: the outline against `--surface-2` is measured with `contraste.py` in both themes before the screen is built (task `-ecran`).
**ChampCouleur — optional variant** (`frontend/src/ui/champ-couleur.tsx`): an empty value is valid when the field is optional; a ghost `Bouton` « Effacer la couleur » shows when it holds a value; the server's `champ: couleur` refusal goes through `erreur`. **Curseur** also serves E-21 (size, `pas` 0.01, `affichage`).
**Conversion line** (`LigneConversion`, `frontend/src/ui/composants.tsx`; the « = Orbite 4 · 7 h » line under the « Déplacer » fields).
- V: 13 px `--texte-2`, tabular figures, one line; « = — » while the entry is not valid.
- C: `aria-live="polite"`; each field of the form points to it with `aria-describedby`. Its text comes from `texteConversion` (`ui/glisser.ts`).

**Tabs** (`frontend/src/ui/onglets.tsx`, E-24; the three screens that styled their own — settings, system, tool catalogue — take it when they are next touched).
- V: a horizontal list under the header, `--texte-3`; the active tab `--texte` with a 2 px `--accent` rule; no literal value. Its class is `.onglets-liste` (the legacy `.onglets` of the three screens is left alone).
- C: `role="tablist"`, `role="tab"` with `aria-selected`, one tab stop, ← → move; the tab rides in the address query (`?onglet=`).

**Slider** (`frontend/src/ui/curseur.tsx`, E-24; twin of the neighbouring `Champ`).
- V: a native `<input type="range">` styled: 4 px track `--bord-champ` (3:1, WCAG 1.4.11; `--surface-2` would vanish on the page), fill `--accent`, the value beside the label, 16 px thumb `--texte` bordered 2 px `--accent`, hit area at least 24 px, the standard focus ring.
- C: step 0,05, arrows and Page keys; the same bounds as the field, which carries the error; labelled like the field.

**Colour field** (`frontend/src/ui/champ-couleur.tsx`, E-24).
- V: a 30 px square, radius `--rayon-champ`, bordered `--bord-champ`, filled with the typed colour, then a monospace `Champ`.
- C: input `#rrggbb` else « Couleur invalide : #rrggbb. » and the field marked; the square is not a target; the hex is always shown (colour never alone).

**Choice list with thumbnails** (`frontend/src/ui/liste-choix.tsx`, E-24 « Aspects »; a variant of `LigneFicheLiee` if it can carry a selected state and titled groups, else its own file).
- V: 56 px rows (48 px thumbnail, label, `Pastille` on the right), selected `--surface-2` with a 2 px `--accent` left rule, group heading `--texte-3` 12 px.
- C: `role="listbox"` / `role="option"` with `aria-selected`, one tab stop, ↑ ↓ move; scrolls inside, Enter or click opens the editor.

**Apply bar** (`frontend/src/ui/barre-application.tsx`, E-24).
- V: sticky at the foot, `--surface` with a `--bord` top rule; the sentence on the left (detail small below), the primary `Bouton` on the right, an optional neutral `Bouton` before it (« Annuler les changements »); no count → « Rien à appliquer. » and the action off; the content keeps a bottom margin so the bar never hides the focused field (WCAG 2.4.11). A translucent background no token covers would be a decision of Monsieur, not made here.
- C: the sentence is an `aria-live="polite"` region; the button is disabled when nothing is to apply or the count failed; after the confirmation the focus returns to it.

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

**Ligne de fiche liée** (`LigneFicheLiee` and `VignetteFiche`, `frontend/src/ui/ligne-fiche-liee.tsx`; the block « Fiches liées » of E-9; E-17 reuses the thumbnail).
- V: a row of at least 40 px, gap `--e-1` / `--e-3`; thumbnail 36 px (40 px in E-17) that keeps its image inside the frame (the image is clipped by its own radius, the « disparu » mark stays free to overflow), radius `--rayon-champ`, background `--surface-2`, the illustration or else the type icon in `--texte-3`; the title as a link (`.jeton`), then the type badge (`pj` for a player character), the sub-type in `--texte-3` 13 px, the « MJ seul » pill, the qualifier in grey, and « — via » (the sub-place) in grey 12 px. The « disparu » mark is the shared one: a round 16 px pill at left/bottom −4 px, 10 px icon, image at `saturate(.4)`. At 360 px the row wraps.
- C: the thumbnail is `aria-hidden` unless it carries the mark (`role="img"`, the word of the mark); the title is truncated with `title`, the whole qualifier is in a tooltip; the link is reached by keyboard with the `--focus` ring.

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

**Adventure status** (`fiche/statut.tsx`, E-8 and E-17; reusable by E-9).
- Visual: a 24 px pill, icon and label; preparation uses `--texte-2` on `--surface-2`,
  ready uses `--accent-texte` on `--accent-fond`, in progress uses `--table` on
  `--table-fond`, finished uses `--texte-3` on `--surface-2`. No new colour tokens.
  Sub-type and status wrap below the title; on phone cards they each take a line.
- Behaviour: `StatutAventure` is read-only by default. Only a GM outside player mode gets
  the standard keyboard menu, disabled offline and during PATCH. The old label stays until
  the response succeeds; failure stays inline. A card's menu is a sibling of its link,
  and opens toward the available space. The search result carries a passive badge only.

**Adventure creation** (the shared E-8 window).
- The optional parent is a searchable radio list, twenty adventures at a time, with a
  bounded scroll area and full-title tooltips. The visibility checkbox starts unchecked.
  The fields stay in the window on failure; they are disabled during creation.

**Report rows** (`suivi/commun.tsx`, E-13).
- Visual: the title leads; below it, the author (when present), a middle dot only when
  both author and adventure are shown, and the adventure in a neutral `badge-type` pill.
  The date stays at the right; hairlines separate rows. Long titles and pills wrap within
  the text column, including on phones. Existing `--texte`, `--texte-3`, `--texte-2`,
  `--surface-2` and `--bord` tokens provide both themes.
- Behaviour: the title opens the report; the adventure pill is a separate keyboard link
  to its sheet, at least 24 px high. Only adventure fields returned by the server appear.
  A deleted adventure is plain text for the GM; a hidden one leaves no placeholder or
  separator. Dates use a semantic `time` element. Without the adventure option (E-9 block),
  the same row keeps only its title, author and date; the block of an adventure's sheet turns the option on for the
  rows of a scenario only (`cr.campagneId` differs from the sheet's id), the adventure's own rows staying without a pill.

**Adventure sheet blocks** (`fiche/blocs-fiche/`, E-9, AD-124).
- Visual: the compact panels of `e09-aventure.html`, `--surface` and `--bord`,
  `--rayon-panneau`, 16 px padding and gap; the preparation border uses `--mj-bord`.
  Titles use Fraunces 18 px, secondary text `--texte-3`, standard fields and buttons.
  The task form stacks on phones. No new colour token.
- Behaviour: each block loads and retries independently. Categories with open tasks are
  shown in order; checked tasks stay in a folded disclosure, last checked first.
  Checkboxes keep their old state until success. Creation failures keep the fields and
  show an inline alert; report drafts use session storage, scoped to their account and adventure,
  until creation or cancellation.
  The report window uses the shared focus trap. Offline, writing and pagination are disabled.
  Preparation is absent for players and in player mode; report pagination uses the server's
  filtered pages. Existing sheets keep these blocks when their type is deactivated.

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

**Reversible notice** (`BandeauAnnulable`, E-26 banner « Texte modifié par l'assistant »). A notice attached to a content, with one reversible gesture; not an application state, so not the `Bandeau`.
- V: block in normal flow under the page title (neither sticky nor full width); `--accent-fond` background, `--texte` text 13 px (`--t-13`), 1 px `--accent` border, radius `--rayon-champ`, padding `--e-2` `--e-3`; text on the left, small neutral `Bouton` « Annuler » beside it. No new token.
- C: `role="status"`, not dismissible; shown while the server says `source = 'assistant'`, removed by a hand save or by « Annuler » (after the status line « Texte précédent rétabli. », `role="status"`, not a toast). « Annuler » is `aria-disabled` offline, « Annulation… » while sending, one shot; accessible name « Annuler la modification de l'assistant ». A stale version replaces the notice with the `Alerte` « Ce texte a changé depuis que vous l'avez ouvert. » + « Recharger ». GM only.

**Components of `kanevas-battlemap-assets`** (verdict of the design-system guardian; mockups `e25-bibliotheque.html`, `e26-direction.html`; the mockups keep their own variables and hard-coded radii, the code takes the tokens).
- **Tabs** (`ui/onglets.tsx`, the E-24 component described under « Tabs » above; the asset library E-25/E-27 and the map editor E-28 / table E-29 use it as is, with `etiquette`, `onglets` of `{ id, libelle }`, and the active tab in the address `?onglet=`). The legacy `.onglets` class is no longer used by them. Not `Segments` (a value choice).
- **Filter chip** (`ui/puce-filtre.tsx`, drawn from `Pastille`). V: 24 px, `--rayon-pastille`, 12 px, `--texte-2` on `--surface-2` with `--bord`; active `--accent-texte` on `--accent-fond` with a 12 px `check`. C: `<button aria-pressed>`, several at once, never colour alone; the row wraps, never scrolls sideways.
- **Asset card** (`ui/carte-asset.tsx`, from the sheet card). V: 4:3 thumbnail on a transparency checkerboard of `--surface-2` and `--bord-fort` (never hatching), name then footprint « 2×1 » in `--texte-3` 12 px; no frame, no shadow; selected: 2 px `--accent` ring; GM-only asset: `--mj-bord`; 16 px selection box top right. C: the card is a `<button>` opening the side panel; the box is a separate checkbox « Sélectionner <nom> », shift-click selects a range; 44 px target on a phone; marks are `Pastille` (« Vue de dessus » neutral, « MJ » variant `mj`).
- **Drop zone** (`ui/zone-depot.tsx`, extracted from `ecrans/mediatheque.tsx`, reused by E-19, E-25, E-26). V: 1 px dashed `--bord-champ`; a file over it: `--accent` and `--accent-fond`. C: the button opens the file picker, several files; `aria-live="polite"` « 3 images déposées »; a refused file is an `Alerte` naming it, the others go through.
- **Selection bar** (`ui/barre-selection.tsx`, content are existing `Menu`, `Champ`, `Interrupteur`, `Bouton`). V: 44 px, `--accent-fond`, `--accent-texte` border at 40 %, `--rayon-panneau`, « N sélectionné » on the left; on a phone sticky at the bottom. C: `role="toolbar"` named; exists only with a selection and never for a player; arrows between controls, Esc clears; changes are saved at once with a toast.
- **Side panel** (`ui/panneau-lateral.tsx`, promoted from `.med-panneau` of `ecrans/mediatheque.tsx`, reused by E-19 and E-25). V: 300 px, `--surface`, `--bord` left rule, icon label and « Fermer » header; full-screen sheet on a phone. C: named `aside`, Esc closes and returns the focus to the card.
- **Variants added**: `Segments` « count » (a `--texte-3` number after the label); `Alerte` `avertissement` in a **neutral** tint (amber means « GM only »); the attachment thumbnail with an editable caption (E-26 reference images).
**System map** (E-23, `kanevas-carte-spatiale-carte`; verdict of the gardien).
- V: a `<canvas>` on `--ciel` (new token: `#0b0b10`→`#17182a` gradient, the same in both themes, a space stays dark), orbit rings in `--ciel-trait` (1 px, low alpha), hours 12 and 3 in `--texte-3`, selected body ringed in `--accent`, transition zone a halo of `--accent` (gradient to a low alpha, dotted edge, legend « Zone de transition »), each exit an arrow filled by the colour of its route (`--route-*`, below) with a `--ciel` outline; labels in `--texte` over a `--ciel-halo` shadow (new token), 12 px; frame radius `--rayon-panneau`, border `--bord`. Panel at the right (320 px), below the map at 390 px (`Panneau`, `Bouton`, `Pastille`, `Case`, `BoutonIcone` as they are).
- C: every body is a keyboard target (Tab, Enter opens the panel, `aria-label` name, type, place); the canvas is `role="application"` and points to the list, its text alternative and fallback; drag to pan, wheel / pinch / « + » « − » to zoom, « Recentrer »; no zoom animation under `prefers-reduced-motion`; labels never overlap (move, shorten, collapse).
- *Drag gesture* (GM outside player mode; constants and rules in `frontend/src/ui/glisser.ts`): mouse — drag a body, it follows the pointer without snapping, release writes. Touch — a press of 300 ms (`APPUI_LONG_MS`) then drag moves the body; a plain drag always pans the view. Keyboard, the second path: on a selected body ← → move the hour and ↑ ↓ the orbit by 0.25, Shift ×4; presses are sent once, 600 ms after the last, and the live region announces « <nom> déplacé ». While the request is in flight the body is dimmed by opacity (never a colour) and reads « Enregistrement… »; on an error or a refusal it returns to its place. A moon moves around its planet, a planet takes its moons along.
- **Jump points** (`kanevas-carte-rendu-habillage-sorties`; verdict of the gardien, 2026-11-23). Existing: `.cs-sortie` becomes a 14 × 12 px filled arrow (hit area 24 px, 44 px with a coarse pointer, `--focus` ring kept), its label `.cs-etiquette.sortie` in `--texte` over `--ciel-halo`, the legend in the zone label style (`--texte-2` italic); nothing new in `frontend/src/ui`. New tokens, declared in `:root`, `[data-theme="light"]` and `.cs-ciel` (the sky imposes the dark values in both themes): `--route-public` `#5ad1c4`, `--route-private` `#efe27a`, `--route-pirate` `#ff6b6b`, `--route-autre` `#a6a7b0` (no type or any other text; neutral); outside the sky, light theme, for `-zones-routes`: `#0b7a70`, `#7d6a00`, `#c0332b`, `#4a4c58` (to be measured again on the galaxy's real ground). Contrast of each on `--ciel` / `--ciel-lueur` (non-text 3:1): public 10.61 / 9.46, private 14.80 / 13.19, pirate 7.08 / 6.30, autre 8.20 / 7.31 (on a white surface: 5.21, 5.34, 5.60, 8.52). The hues are close to each other (pirate/public 1.50:1), so the type is **never carried by hue alone**: it is in the `aria-label` and the `title` of the arrow.
- New tokens `--ciel`, `--ciel-trait`, `--ciel-halo`: contrasts of `--texte-3` and the label over `--ciel` measured with `contraste.py` in both themes before the screen is built.

**Comets** (`kanevas-carte-rendu-cometes`, B-116, E-23; verdict of the gardien: one new token, no component).
- V: the chosen comet's trajectory is a **2 px continuous** line in `--ciel-or` (new token, `#f2c36b` in both themes, a space stays dark: 11,96:1 on `#0b0b10` and 10,66:1 on `#17182a`, threshold 3:1 for non-text, measured with `contraste.py`); the other comets' trajectories are 1 px dashed `--ciel-trait` (existing). `--ciel-or` is not `--element-ambre` (`#f2a33c`, an element ring) nor `--mj*` (« GM only »): the line is told apart by its stroke, never by colour alone. The tail is the picture's own, turned and faded; the coma (12 px radius, 24 px across, the aspect's `couleur`) shows when the picture is under 24 px, the head is never under 4 px; every size is a constant in pixels or orbit units (the coma's 12 px radius is a literal of the canvas pass), never multiplied by the zoom. Token read by `lireTokens` with `--accent` and `--ciel-trait`.
- C: the trajectory is decorative (not a target, not in the tab order); the text alternative of the map says « Trajectoire de <nom> affichée » when a comet is chosen. No animation.

**Body illustration** (panel, dialog, map sprite).
- V: a 4/3 frame in the panel (`--bord`, radius `--rayon-champ`), the image `role="img"` with `aria-label` « Illustration de <nom>, <type> »; blurred low-resolution version first (never a flat disc), the sharp one in a 160 ms (`--duree`) fade; unavailable: the blurred version stays with « Illustration indisponible. » and « Réessayer » below (`Alerte` with action).
- *Reduced size* (`.cs-illustration.reduite`, 96 px wide, same 4/3 frame, blur then sharp): the live thumbnail of the « Modifier » form; its `role="img"` label is unchanged.
- C: loading blocks nothing; click or Enter on it opens `Fenetre` in its **image** variant (`image`) (the window sized to the image, zoom buttons, Esc closes, focus returns to « Voir l'illustration »).

**Loading state.** V: `--squelette` skeletons shaped like the sheet (type, title,
rule, two sections). C: `role="status"`, « Chargement de la fiche… » read and written below.

### Components of `kanevas-battlemap-distance` (verdict of the guardian, 2026-11-11)
Existing, taken as they are: `Interrupteur` for « Suivre le MJ » (floating pill at the canvas's bottom right; no toast, the value stays in the browser) and for « Jeu à distance » in the registry card of E-20 (`ecrans/outils/reglage.tsx`); the states of `ui/etats.tsx` for « Page introuvable. », « La partie n'a pas commencé. » and the loading. `Alerte` (`ui/etats.tsx`, in line, `role="alert"`) carries the refusals; variant to register: it fades after 4 s when it reports a refused gesture on the play canvas; placed above the screen's bar, never over the focus (2.4.11). A refusal is an `Alerte`, not a toast.
- **`PionTable`** (new; closest: `Avatar`, not interactive). A disc `--surface-2` with initials and a `--bord-fort` outline. The player's own tokens carry a 3 px ring in `--accent`, separated from the disc by a `--fond` hairline (readable on both themes and any map ground; measure 3:1 in the light theme at build). A held token is lifted by a colour plane (no shadow) and follows the pointer; the target is a 2 px dashed `--accent` outline with `--rayon-item` corners on the cell(s) it will take, in the token's footprint. 44 px minimum target at 390 px. No hexadecimal. Grab: mouse, finger or stylus (250 ms long press on a phone); **keyboard**: Tab focuses a token, Enter grabs it, arrows move it by one cell, Enter drops, Esc cancels; `aria-label` « <nom>, votre pion » for hers, « <nom> » otherwise; the drop is announced in a `role="status"`. With remote play off, ring and grab are absent, not disabled. `prefers-reduced-motion`: a refused token returns at once.
- **`PastilleConnexion`** (the E-30 badge, reused; closest: `Banner`, which is opaque and full width — a different form). A floating pill at the top right of the canvas, `--rayon-pastille`, `--surface` at 92 %, `--bord` border, `--texte-2` text with a 12 px Lucide `wifi-off` icon (word and icon, never colour alone), `role="status"` « Reconnexion… », neither focusable nor clickable; it fades out in `--duree` when the stream is back (no fade under `prefers-reduced-motion`). Shared by the player's E-29 and by E-30 (there on `#000` with the forced dark colours of § 6): specified once, here; the table slice builds the badge of E-30 and this slice, which depends on it, takes that component for the player's E-29 (extracting it unchanged if it was built inline). Measure `--texte-2` on the pill ground at 4.5:1 and the icon at 3:1, both themes.
- **The line « Seul le MJ déplace les pions. »**: not a component; a paragraph under the bar, `--texte-2`, body size, `role="status"`.

**Components of `kanevas-battlemap-editeur`** (verdict of the design-system guardian; mockup `e28-editeur-carte.html`; the mockup keeps its own variables, the code takes the tokens: `--accent` not the mockup's violet, `--mj` / `--mj-bord` / `--mj-trame` for GM-only, Lucide icons only).
- **Existing, reused as is**: `Bouton` (« Jouer » primary and disabled), `BoutonIcone` (undo / redo), `Champ`, `Interrupteur` (« Aimanter à la grille »), `Chargement`, `Alerte`, `Bandeau` (a kind `lecture` is added to the existing `joueur` kind), `Toast`, `Pastille` (« Asset retiré », « Masquée aux joueurs »), `Menu`, `BoiteDialogue`, `Fenetre`, `Segments`; `Onglets`, `Asset card`, `Side panel` and `Filter chip` from `kanevas-battlemap-assets`.
- **Tool column** (`ui/colonne-outils.tsx`, new, from `Segments` and `BoutonIcone`). V: 56 px on `--surface`, `--bord` right rule; 40 px cells, Lucide 16 px icons without text, `--rayon-item`; rest `--texte-3`, hover `--surface-2`, active `--accent-fond` with icon and outline `--accent`, disabled 45 %; « Aimanter » at the bottom. C: `role="toolbar"` `aria-orientation="vertical"`, one tab stop (the active tool), ↑ ↓ move and select, wrapping; each tool has an `aria-label` and a tooltip naming its key; the active state is carried by shape and `aria-checked`, not tint alone; 44 px on a phone.
- **Layers panel** (`ui/panneau-calques.tsx`, new, from `LigneRelation`). V: 36 px rows, no frame, `--bord` separators; grip, name, three 28 px `BoutonIcone` (eye, lock, menu); a GM-only layer has `--mj-trame` and a `--mj-bord` rule (not an amber frame on each row); the selected layer a `--accent` ring. C: a `listbox`; each icon button is a named `aria-pressed` (« Masquer le calque Objets »); order by Alt+↑ / Alt+↓ or the menu entries; deletion by `BoiteDialogue` naming the verb, the layer and what goes with it; the eye says « vue éditeur seulement ».
- **Canvas** (`ui/canevas-carte.tsx`, new; the drawing is Canvas 2D from the document, the rules are the core's). V: ground `--surface-2`, grid `--bord`; floors and walls are drawn from the assets (never from tokens); a GM-only element has `--mj-trame` and a dashed `--mj-bord`; the selection a 2 px `--accent` outline with 8 px handles of contrast ≥ 3:1 against the cell. C: focusable (`tabindex=0`, focus ring), arrows move the selection one cell, Suppr deletes, Ctrl+Z / Ctrl+Maj+Z, Ctrl+C / Ctrl+V; a polite `aria-live` summary of the selection (« Console, case 12, 4, calque Objets »); wheel / pinch zoom, no animation under reduced motion; it filters nothing (the server sends the filtered document).
- **Inventory to write with the code**: `Onglets` (moved from `ecrans/ecrans.css` by the assets slice), the three components above with their support files under `frontend/src/ui/`. **Deliberate gap**: none. **Note**: the `.sdlc.yaml` of the repository declares no `design_system` block, so the guardian worked from the paths of this charte and `CLAUDE.md`.
**Ligne d'historique** (`ui/ligne-historique.tsx`, E-24, `kanevas-synchro-historique`; spec of the design-system keeper). V: a row without frame or card, separated by a `--bord` rule; on the left the date in `<time>` (12 px, `--texte-3`, 96 px wide); in the middle, line 1 the contributor (`--texte`, weight 500) then « via <token> », « assistant » or « import · lot n » in `--texte-2` and the origin as a neutral Pastille with a 12 px Lucide icon; line 2 the sheet link, « — », the change label; a deleted sheet is plain `--texte-2` text with a « supprimée » Pastille; hover `--surface-2`; minimum height 40 px (48 px on a phone, where the date moves above). A line older than 30 days is not dimmed by opacity (contrast). C: the change label is the link that opens the detail, the sheet link is a second, separate link (≥ 24 px target), never nested; a `<ul>` with an accessible name, `aria-current` on the open line; the origin is carried by the word and the icon, never by the hue alone.

**Comparaison** (`ui/comparaison.tsx`, E-24 and the assistant's update proposal share it, `kanevas-synchro-historique`). V: two zones side by side (stacked under 760 px), « Valeur précédente » on `--accent-fond` with an `--accent` border, « Valeur actuelle » on `--surface` with a `--bord` border; 12 px `--texte-3` label in each, text `--texte`, 15 lines at most then scroll; never the red and green of a diff. One-zone variant (a deleted sheet's sections, a field with no current value): one `--surface` zone with its `--bord` border labelled with the section's name. C: each zone is a `role="region"` with an `aria-label` and `tabindex="0"`; plain text, read-only, no Markdown rendering and no active link; no action inside (the restore button sits under it).

**Confirmation de restauration** (variant of the Boîte de dialogue, E-24). A neutral `rotate-ccw` icon badge on `--accent-fond`, the action in the primary button (not danger), focus on « Annuler ».

**`kanevas-synchro-jetons` — components added (verdict of the design-system guardian, 2026-11-05).** No token is added.
- **Choix segmenté** (`frontend/src/ui/choix-segmente.tsx`; CSS of the four components of this block: `frontend/src/ui/jetons.css`; generic segmented choice; `BasculeMjJoueur` stays the MJ/Joueur one). V: `--surface-2` ground with an inner
  `--bord` line, `--rayon-champ`, 2 px margin; segment 28 px (26 px *small*, 36 px on a phone), `--rayon-item`, `--texte-2`, hover
  `--texte`; the active one `--surface`, `--texte`, `--bord-fort` line, icon `--accent-texte` — **never** `--mj` or `--table` (they
  say « secret » and « table »). C: `role="radiogroup"` with a visible label, each segment `role="radio"` with `aria-checked`, one tab
  stop, ← → move and select, Home/End go to the ends; the state is carried by text and ground, not hue alone;
  `prefers-reduced-motion` cuts the transition.
- **Liste d'accès** (`frontend/src/ui/liste-acces.tsx`; one line per universe: name, role pill, a *small* segmented choice). V: frame `--rayon-champ`, inner `--bord`
  line, lines separated by `--bord`; name 14 px `--texte`; the choice wraps under the name on a phone. C: one line = one
  radiogroup labelled by the universe name; a universe the account left keeps its line, followed by « (plus membre) » in `--texte-3`; a
  refusal (« Choisissez au moins un univers. ») in `--danger`, tied to the list by `aria-describedby`.
- **Ligne de jeton** (`frontend/src/ui/ligne-jeton.tsx`, with `ListeJetons`; named object + meta + actions revealed on hover; class `ligne-jeton`, **not** `.jeton`, which is the relation-target pill
  of `ui.css`). V: frame `--rayon-panneau`, inner `--bord` line; line 60 px min, `--rayon-champ`, hover and focus-within `--surface-2`; icon disc
  28 px `--surface-2` (inactive: transparent, `--texte-3`); name 14 px 500 on one line, cut with a tooltip (inactive `--texte-2`); accesses 13 px
  `--texte-2`, « Tous mes univers » `--texte` 500; meta 13 px `--texte-3` joined by « · »; actions *small ghost* `Bouton`s at the line's right
  edge, shown on hover and focus, always shown when `(hover: none)`; offline 45 %. C: a `ul`; each action's label names the token; offline
  `aria-disabled`; an inactive token has no action.
- **Valeur copiable** (`frontend/src/ui/valeur-copiable.tsx`; a value shown to be copied: the token, the base address; E-23, E-18). V: 34 px min, `--surface-2`, `--bord-fort` line for a
  secret, `--rayon-champ`, `user-select: all`, `--police-code` 13 px on one line scrolling sideways (wrapping on a phone); « Copier » (`copy`) at its right, 34 px
  (40 on a phone); the note « Il ne sera plus affiché. » a `--surface-2` block with a 16 px icon. C: a `code` named by its label; « Copier » has
  `aria-label` and a toast; never copied by itself.
- **Pastille** gains the *sens* `accent` (`--accent-texte` on `--accent-fond`, icon and word): « Modifié par l'admin ». « Révoqué » and « Révoqué par l'admin » are
  `danger`, « Expiré » `neutre`. Contrast of `--danger` on `--danger-fond` and of `--accent-texte` on `--accent-fond` in a 22 px pill measured in both themes (`contraste.py`, § 5).
- **Fenêtre** (`Fenetre` in `frontend/src/ui/composants.tsx`) gains a *large* variant (560 px, scrolling inside itself) and a *locked* property (neither Esc nor the veil closes it while a value is
  shown — E-23).

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
| `--texte-2` (adventure preparation) | `--surface-2` | dark / light | 6.70 / 7.61 | 4.5 | ok |
| `--accent-texte` (adventure ready) | `--accent-fond` on `--surface-2` | dark / light | 5.15 / 5.43 | 4.5 | ok |
| `--table` (adventure in progress) | `--table-fond` on `--surface-2` | dark / light | 5.77 / 5.02 | 4.5 | ok |
| `--sur-accent` | `--accent` | dark / light | 6,94 / 7,06 | 4,5 | ok |
| `--accent-texte` | `--fond` | dark / light | 8,09 / 6,88 | 4,5 | ok |
| `--texte` (current item) | `--accent-fond` on `--fond-lateral` | dark / light | 12,48 / 13,52 | 4,5 | ok |
| `--accent-texte` (current icon) | `--accent-fond` on `--fond-lateral` | dark / light | 6,42 / 5,56 | 3 | ok |
| `--mj` | `--mj-fond` on `--fond` | dark / light | 6,97 / 5,43 | 4,5 | ok |
| `--mj` | `--mj-fond` on `--surface-2` (« Mode MJ » segment) | dark / light | 5,87 / 5,01 | 4,5 | ok |
| `--mj` | `--mj-fond` on `--surface` (`mj` Button in a dialog) | dark / light | 6,43 / 5,56 | 4,5 | ok |
| `--mj` | `--mj-fond` on `--surface-2` (checked amber `Segments`) | dark / light | 5,89 / 5,02 | 4,5 | ok |
| `--mj` | `--surface-2` (`mj` text on a neutral panel) | dark / light | 7,70 / 5,65 | 4,5 | ok |
| `--mj` | `--surface` (« Secrète — MJ seul » on thumbnail) | dark / light | 8,34 / 6,33 | 4,5 | ok |
| `--texte` | GM hatching on `--fond` (GM-only section text) | dark / light | 15,06 / 15,03 | 4,5 | ok |
| `--table` | `--table-fond` on `--fond` | dark / light | 6,84 / 5,45 | 4,5 | ok |
| `--table` | `--table-fond` on `--surface-2` (« Mode Joueur » segment) | dark / light | 5,77 / 5,02 | 4,5 | ok |
| `--table-bord` (audience rule) | `--fond` | dark / light | 3,40 / 4,24 | 3 | ok |
| `--danger` | `--danger-fond` on `--fond` | dark / light | 5,53 / 5,03 | 4,5 | ok |
| `--texte` (error message) | `--danger-fond` on `--fond` | dark / light | 12,90 / 14,33 | 4,5 | ok |
| `--danger` (pills « Révoqué », « Révoqué par l'admin »; 22 px) | `--danger-fond` on `--surface-2` (hovered token line) | dark / light | 4,68 / 4,63 | 4,5 | ok |
| `--accent-texte` (pill « Modifié par l'admin »; 22 px) | `--accent-fond` on `--surface-2` (hovered token line) | dark / light | 5,15 / 5,43 | 4,5 | ok |
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

**Table display (E-30, delivered by `kanevas-battlemap-table`) — Monsieur's mandate decision, 2026-11-11.** The players' screen is chrome-less and full frame: a pure black background (`#000`) and the dark theme forced, whatever the account's theme, because it is projected in a dark room. The text pair `--texte-2` (dark) on `#000` must be measured at 4.5:1 at build time; below it, the screen uses `--texte`. No other screen takes this deviation.

Tokens marked *(new)* are added without changing anything existing.

**Toast with an action** (E-23 « Illustrer la fiche », `kanevas-carte-spatiale-liens`; verdict of the gardien; variant of `Toast`, no new file).
- V: the tokens of `Toast` (`--surface`, `--ombre-flottant`, radius `--rayon-champ`, 40 px, icon `circle-check` in `--table`, 13 px text); between the text and « Fermer », an action in `--accent-texte`, 13 px, weight 500, underlined on hover and focus, target at least 24 px, ring `--focus`; at 390 px full width minus the assistant button, the text wraps on two lines before the action is cut.
- C: `ToastInfo.action?: {libelle; href | onClick}` and `useToasts().toast(texte, action?)`; the action is a real link or button reachable by keyboard; a toast with an action does not fade after 4 s but stays while the pointer or focus is on it, or until « Fermer » (WCAG 2.2.1); announced in the `role="status"` region, never takes the focus; no motion under `prefers-reduced-motion`. A failure is never a toast (`Alerte` with action).
- Inventory by path: `CadreBlocFiche` lives in `frontend/src/ecrans/fiche/bloc-fiche.tsx` (not in `ui/`) and frames « Sur la carte spatiale ».

**Star class colours are data, not tokens** (`kanevas-carte-rendu-galaxie-systemes`, verdict of the gardien): the seven colours of `classes_etoile()` (`docs/donnees.md`) belong to the core, as a system's free `couleur` belongs to its row; a star keeps its colour in both themes and is outlined 1 px `--texte-3`. No hexadecimal of a class in `frontend/`.
