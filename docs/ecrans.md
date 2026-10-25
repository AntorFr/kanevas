# Kanevas — screens

> Product documentation (see `docs/parcours.md`). At scoping time, a broad outline: each screen, how
> it is reached, what it is for, what each role does there. Each screen's states and finished
> mockup are detailed in the slice that builds it.

> **Built so far**: E-1, E-2, E-3 (name, navigation and blocks: game system, active campaigns, latest session reports, preparation for the GM, visible maps), E-4, E-5 (Administration), E-6, E-7, E-13, E-8 (with
> search within a type, in a grid of illustrated cards), E-9 (with the « Relations » and « Pièces jointes » blocks, the header illustration, inline title and « Supprimer la fiche… »), E-10 and E-11 (maps and graphs), E-12 (Assistant), E-14 (Settings, with « Supprimer l'univers »), E-15 (Game system, at `/systemes/:sid`), E-16 (Game systems), E-17 (Search), E-18 (API access), E-19 (Media library), the « Campagne » line of E-9, the session
> and sidebar.

## Format

Web. Desktop first for writing (mouse, keyboard, dragging tokens); phone for reading
(touch, one column). Dark and light themes.

## Navigation

A single sidebar on every screen within a universe:

- at the top, the **universe selector** (the account's universes, with its role as a badge);
- **« Vue d'ensemble »** · **« Campagnes »** · **« Comptes-rendus »** · **« Cartes »** · since `kanevas-import`, **« Médiathèque »** (E-19);
- **« Lore »**: « Personnages », « Lieux », « Factions », « Objets », « Événements », « Quêtes » — since `kanevas-import`,
  the **types enabled for the universe** (B-42), in the order of the product's list: « Personnages »,
  « Lieux », « Factions », « Objets », « Événements », « Quêtes », « Créatures », « Races », « Vaisseaux », « Savoirs », « Récits », « Règles »,
  « Notes »;
- since `kanevas-import`, at the top of the sidebar below the universe selector: **« Rechercher »** (E-17;
  shortcut `/` outside a field);
- for a GM: **« Univers »** ▸ « Membres », « Paramètres », and since `kanevas-import` **« Accès par API »** (E-18);
- for an instance admin: **« Administration »**;
- at the bottom, the **account**: the avatar and username, opening a menu — the username, the
  **theme** (three-icon toggle: « Clair », « Sombre », « Système ») and « Se déconnecter ». Theme and
  sign-out controls are not spread across the sidebar.

Each item has its icon (`docs/charte.md`, “Icons”); the current item is marked. On
phones (below 760 px), the sidebar is a drawer under a « Menu » button at the start of the
top bar.

Above each screen within a universe, a **top bar**: the breadcrumb trail (universe › type ›
sheet; since `kanevas-import`, universe › type › readable ancestors › sheet, B-35; on phones (≤ 760 px), the universe seal and type label disappear, and at 480 px and below ancestors collapse (a « … » menu from two ancestors): see E-9) and, on screens that have it, the
GM mode / Player mode toggle.

Outside a universe (E-1, E-2, E-5, E-15, E-16), a reduced sidebar: **« Mes univers »**, **« Systèmes de
jeu »**, **« Administration »** for an instance admin, and the account at the bottom. From a universe, the
universe selector menu leads to **« Mes univers »** and **« Systèmes de jeu »**; the system link on E-3 and
E-14 leads to its page (E-15), outside the universe (decision of 2026-10-06, AD-94). An admin who is also a member of a universe keeps the
**« Administration »** link in the universe sidebar, under an « Instance » section.

The **assistant** is a floating « Demander à Kanevas » button on every screen within a universe,
outside the sidebar; it does not exist outside a universe. A GM sees the **« Mode MJ » / « Mode Joueur »** toggle in the top bar of screens that
have it (sheet, map and, since `kanevas-import`, search E-17).

## Inventory

| Screen | Reached from | Purpose | Journeys |
|---|---|---|---|
| **E-1 Home** | sign-in; logo | see the account's universes and role in each; create one; see its username | P-1, P-6 |
| **E-2 Create a universe** | E-1 | name, description; the creator becomes GM | P-1 |
| **E-3 Universe overview** | E-1; universe selector; E-5 (admin who has become a member) | active campaigns, latest session reports, preparation (GM), visible maps | P-2, P-3, P-4, P-6 |
| **E-4 Members** | « Univers » navigation (GM) | list, add by username, change role, remove | P-2 |
| **E-5 Administration** | navigation (instance admin) | list the instance's universes, manage their members — never their content; set the assistant token (B-51) | P-2, P-15 |
| **E-6 Campaign** | « Campagnes » navigation (list); E-3 | campaign list; for a campaign: status, scenarios and « Nouveau scénario » (GM), preparation (GM), session reports, « Nouveau compte-rendu » | P-3, P-4 |
| **E-7 Scenario** | E-6 (GM) | write and reread a scenario | P-3 |
| **E-8 Sheet list** | « Lore » navigation | sheets of one type that the account can read, in a grid of illustrated cards; search within that type; create (GM) | P-3, P-6 |
| **E-9 Sheet** | E-8; a token; a link; E-13 | read and write permitted sections; add, reorder, remove a section, set its audience, relate (GM); attach a file (both addition paths, AD-111), restrict a file to the GM (GM), remove a reference; set the subtype (GM); set, replace, remove the illustration (GM); Player mode toggle (GM). A session report opens here. | P-3 to P-7 |
| **E-10 Maps** | « Cartes » navigation | readable maps; create an illustrated map (with its background image) or a graph (GM) | P-3, P-9 |
| **E-11 Map** | E-10; E-3 | illustrated map: background, tokens; graph: nodes and links. GM: upload or change the background, place elements, make visible, Player mode. Player: open a token's sheet. | P-3, P-6, P-9 |
| **E-12 Assistant** | floating button, on every universe screen | converse; see what the assistant has written, with a link; GM: update proposals (current/proposed, **« Appliquer »**, **« Abandonner »**) | P-3, P-5, P-6, P-7 |
| **E-13 Session reports** | « Comptes-rendus » navigation; E-3 | all readable session reports in the universe, newest first, with their campaign | P-4, P-5 |
| **E-14 Universe settings** | « Univers » navigation (GM) | name, description, game system (choose from the catalogue, create one) | P-8 |
| **E-15 Game system** | E-16; link from E-3 and E-14 | shared reference: rules, creatures, items; add, edit (GM of an attached universe); outside a universe's frame | P-8 |
| **E-16 Game systems** | reduced sidebar; universe selector menu | systems attached to the account's universes, each with those of its universes using it | P-8 |
| **E-17 Search** *(kanevas-import)* | « Rechercher » in the sidebar; `/`; a label tapped on E-9 | search across all types, titles, aliases and readable sections; filter by type and label | P-12, P-10 |
| **E-19 Media library** *(kanevas-import)* | « Médiathèque » navigation; « Choisir dans la médiathèque » in the editor and illustration (E-9) | see files (images, documents) accessible to the account and where they are used; GM: add, rename, set visibility, delete | P-16, P-10 |
| **E-18 API access** *(kanevas-import)* | « Univers » ▸ « Accès par API » navigation (GM) | create, list, revoke the universe's API tokens; see import batches and their refusals | P-10, P-11 |
| **E-20 Tools** *(kanevas-outils)* | « Outils » tab of E-15 (system) and E-14 (universe) | enable a tool, set its visibility per role and its settings (system value, universe value), import a catalogue (preview then confirmation), see dependencies, disable, delete data; the system's maintainer | P-17, P-21 |
| **E-21 Galaxy map** *(kanevas-outils)* | E-10 (a tool map); E-3; a shareable link | explore the grid, measure, calculate a route; GM: place, promote, plot, draw, Player mode, GM document | P-18, P-20 |
| **E-22 Ship designer** *(kanevas-outils)* | « Outils » sidebar; a ship sheet's managed section (E-9); a shareable link | readable designs list and a design's workshop: choices, budgets, warnings, save, recalculate | P-19 |

Screens **modified** by `kanevas-outils`: **E-9** (managed section: « Générée par … » banner, rendering
by its component or its text version, « Outil désactivé »; no editor on a managed section),
**E-10** (maps from an enabled, visible tool join the list, with their visibility; « Nouvelle carte » ▸ « Carte de la galaxie » if the tool is enabled, GM), **E-14** and **E-15** (the « Outils » tab, and the system's maintainer on E-15), **E-18**
(a token's scope per tool; tool batches), **E-12** (assistant tools), the sidebar
(an « Outils » section, below).

Screens **modified** by `kanevas-import`: **E-8** (enabled types, tree view, subtype on the
card, « Sous-type » filter, « Sous-type » creation field, illustration under both guards),
**E-9** (Markdown, links, GM blocks, ancestor trail, « Contient » and « Mentionnée dans » blocks, aliases and
labels, editable subtype, media library files — both addition paths, the « Pièces
jointes » reference block, illustration, « réservé au MJ » notices —, sheet menu: rename,
change type, move, delete, source key), **E-7** and **E-15**
(Markdown content), **E-14** (« Types de fiche », « Supprimer l'univers »), **E-15** (system's « Types de
fiche »), **E-13** (ordered by original date), the sidebar; **E-5** (« Jeton de l'assistant », B-51).

The server's sign-in pages (« Connexion refusée », « Connexion indisponible », reached
from P-1) and the stub mode banner are described under “Session and sign-in”.

Outside the product: in stub mode only (AD-55), the test account selection screen and the « mode
bouchon » banner — without `E-n` or six states, they do not exist in production.

## Roles × screens × actions

« — »: the screen is not offered (absent from navigation; forcing the address displays « Page introuvable. » and the API returns 404). E-15 and
E-16 live outside universes: their cells describe the role in a universe attached to the system.

| Screen | GM | Player | Instance admin (no role in the universe) |
|---|---|---|---|
| E-1 | own universes, create | own universes, create | own universes, create |
| E-2 | create | create | create |
| E-3 | everything | no preparation or scenarios | — |
| E-4 | everything | — | — (through E-5) |
| E-5 | — | — | list universes and their members; add, change a role, remove a member; see assistant token status, connect or reconnect the subscription |
| E-6 | everything | list, status, session reports, « Nouveau compte-rendu »; no scenarios or preparation (hidden) | — |
| E-7 | everything | — | — |
| E-8 | read, search, create; each sheet's thumbnail (its illustration, or the drawn fallback) | read, search; thumbnails of visible sheets | — |
| E-9 | everything; Player mode; relate and remove relations; set, replace, remove the illustration (outside Player mode); *(kanevas-import)* subtype, restrict a file to the GM, see a file awaiting import (tile) | readable sections; write permitted ones; readable relations (section and target); their attachments; see the illustration, never set it; *(kanevas-import)* in a section they write, add a file or choose a visible one (both paths of B-55) and remove a reference; files under both guards; never set visibility (**hidden**); a file awaiting import: nothing (**hidden**) | — |
| E-10 | everything | visible maps | — |
| E-11 | everything; Player mode | read a visible map, open a sheet | — |
| E-12 | GM catalogue (including image generation, if an image engine is available); proposals: only the requesting GM sees, applies, abandons them | Player catalogue (no image: the tool is absent, the assistant answers that it cannot); proposals: **hidden** (neither tool nor block; what is checked is the absence of a proposal and block, not the assistant's free text) | — |
| E-13 | all session reports | readable session reports | — |
| E-14 | everything; « Supprimer l'univers » (*kanevas-import*) | — (« Page introuvable. ») | « Page introuvable. » |
| E-15 (outside a universe; columns describe the role in a universe **attached to the system**) | read; « Ajouter … », « Modifier » | read (« Lecture seule »); neither « Ajouter » nor « Modifier » | « Page introuvable. », unless also a member of an attached universe: then the column for that role applies (an admin who is GM of an attached universe reads and edits) |
| E-16 (outside a universe) | own systems, with own universes and role | own systems, « Lecture seule » | list of own systems (as GM or Player if a member of an attached universe); otherwise empty — the screen is offered to every account |
| E-17 *(kanevas-import)* | search all sheets in the universe, including GM blocks; in **Player mode**, as a player (no GM blocks or sheets unreadable by a player); filters: enabled types; sheets of disabled types remain results under « Tous » | search readable content, excluding GM blocks; type and label filters from visible sheets only; mode toggle: absent (hidden); GM blocks: excluded from search (never read); « Alias et étiquettes… » on E-9: hidden | — |
| E-19 *(kanevas-import)* | everything: add, rename, visibility, delete; complete « Utilisé dans » | files visible to players and files they added; « Utilisé dans » restricted to readable sheets; no adding from E-19 (**hidden**; they add a file through a section they write, E-9), no settings or deletion (**hidden**) | — |
| E-18 *(kanevas-import)* | create a token; see and revoke all the universe's tokens (including another GM's); see batches | — (**hidden**: absent from the sidebar, « Page introuvable. » by address) | — |
| E-20 *(kanevas-outils)* | **on the universe**: enable, override, disable; visibility per role; settings; import the universe catalogue; delete universe data. **on the system**: read only (**hidden**: « Activer », « Importer », « Supprimer les données ») except the **maintainer**, who also acts on the system | — (**hidden**: « Page introuvable. ») | — |
| E-21 *(kanevas-outils)* | everything (place, promote, plot, draw, protected settings); Player mode: as a player; GM document | explore, measure, route, link; only readable systems, routes and zones; no write actions (**hidden**) | — |
| E-22 *(kanevas-outils)* | all the universe's designs; create, edit, recalculate; set the section's author | designs whose sheet and section they read; edit and recalculate **those whose « Caractéristiques » section they author**; « Nouvelle conception » **absent** (the GM creates the sheet) | — |

What `kanevas-outils` adds: **sidebar** — an **« Outils »** section, after « Cartes » and before « Lore »,
listing entry points for tools **enabled and visible to the role** (« Concepteur de vaisseaux »); the
galaxy is reached through « Cartes »; a disabled or invisible tool has neither an entry nor an address (« Page
introuvable. »). **E-9** — everyone: a managed section is read like any other, without an editor; GM and author:
« Ouvrir dans le concepteur ». **E-10** — GM: « Nouvelle carte » ▸ « Carte de la galaxie »; Player: the
tool map, if it is visible and the tool is visible to their role.

What `kanevas-import` adds to existing rows: **sidebar** — everyone: the « Lore » section
shows only enabled types; **E-8** — GM: tree view, creation only in enabled types,
with its « Sous-type » field, the « Sous-type » filter; Player: tree of visible sheets, the
« Sous-type » filter on visible content; creation and its « Sous-type » field are **absent** (not offered). **E-9** — GM: write
Markdown, insert links and GM blocks, rename, change type, move, aliases and labels,
delete (header « ⋯ » menu, outside Player mode), see the source key; Player: plain text title, no « ⋯ » menu or deletion (**hidden**), source key hidden; an instance admin without a role: « Page introuvable. »; read
Markdown, follow links to visible content, « Contient » and « Mentionnée dans » restricted to readable
content; write a permitted section **unless it contains a GM block** (« Modifier » **hidden**); aliases
and labels visible, never editable (**hidden**). **E-14** — GM: « Types de fiche »,
« Supprimer l'univers ». **E-15** — GM of an attached universe: « Types de fiche » (toggles);
Player: read-only list.

An instance admin who is also a universe member, GM or Player, has that role's column within the universe and keeps E-5 through the sidebar's « Instance » section, with the Admin column there (including the « Jeton de l'assistant » panel: E-5 does not depend on the selected universe); outside that universe, the Admin column.

Matrix details: creating a campaign, changing its status and creating a scenario are
GM-only. A section's audience is set inline on the sheet (GM). Creating a sheet opens a
dialog (type already chosen, title) leading to the sheet; creating a map is done inline on
E-10. « Rendre visible » for a map is available on the map (E-11) and in the list (E-10). An illustrated map's background is uploaded at creation (E-10) and changed on the map (E-11);
a map without a background shows its tokens on a neutral background. A
preparation task is added with its category, checked, unchecked; it cannot be deleted.
On E-15, rules, creatures and items receive the same treatment. On E-3, the « Système de jeu » block exists only if the universe is attached to a system (GM and Player).

An account **without a role** in the universe that is not an instance admin (Teo before being added) has, within
that universe, the « Admin » column of this matrix for **that universe's** screens (E-3, E-4,
E-6 to E-14, E-17 to E-19): « — », « Page introuvable. » if the address is forced. Outside universes it keeps E-1,
E-2 and E-16 (empty if it is not a member of any attached universe), and E-15 for its
own universes' systems.

A refusal never reveals that something exists: an unreadable sheet, section or map
is absent, and its address responds like an unknown address.

## States

Each structural screen has the six states of the `ux` skill (empty, loading, error, offline —
the connection is lost and the screen says so, without an offline mode —, refusal, long content): they are described with its finished mockup in the slice that builds it.
Two are set at scoping time because they apply everywhere:

- **empty** for a new account (E-1): says what to do — create a universe, or give its displayed
  username to its GM;
- **refusal** for an unreadable resource: always like an unknown resource.

## Screen details for `kanevas-premiere-fiche`

> E-1, E-2, E-3, E-4, E-8, E-9, the sidebar and session. The six states use
> B-29's vocabulary: **vide**, **chargement**, **erreur**, **connexion perdue**, **refus**, **contenu
> long**. “Not applicable” includes its reason. The mockups authoritative for appearance are listed under “Mockups” (end of document); `e02` predates the style guide (dark theme, the guide's tertiary grey).

**Shared text.**

- *Loading*: « Chargement… » (`role="status"`).
- *Loading error*: « Impossible de charger cette page. » and the « Réessayer » button.
- *Connection lost*: banner « Connexion perdue. Ce que vous voyez peut être dépassé ; rien
  n'est enregistré tant qu'elle ne revient pas. »; write buttons are disabled; it
  disappears automatically when the connection returns.
- *Write in progress* (any submission: add, change a role, remove, create, save, set,
  move up, move down, load more): the triggering button displays « … » (everywhere, including E-2) and is disabled
  until the response (a double click sends only once); the rest of the screen remains readable.
- *Write failure*: « L'action n'a pas abouti. Réessayez. » above the affected list or panel;
  the displayed value reverts to its previous value (audience setting, role, order); input
  in progress is kept. Failure of « Charger la suite »: « Impossible de charger la suite. »
  and the button remains.
- *Empty or overlong title* (sheet, section): « Erreur : le titre est obligatoire. » or « Erreur : 120
  caractères au plus. » (80 for a section), below the field.
- *Session expired during input*: the person is taken to sign-in; a section's text in progress
  (E-9) is kept in the browser (`sessionStorage`) and restored on returning to that
  section, until saved or cancelled. E-2, E-4 and E-8 forms are not kept.
- *Refusal*: always « Page introuvable. » and a « Mes univers » link — for an unknown universe,
  a universe without a role, an unreadable sheet, an unknown address. Never « accès refusé ».
- *Expired or missing session*: the page is not shown; the person is taken to sign-in
  (Authelia, or test account selection in stub mode).
- *Stub mode banner* (only with `KANEVAS_STUB=1`, on every page, cannot be dismissed):
  « Mode bouchon — les comptes sont fictifs. Ne jamais l'ouvrir en production. »

### Session and sign-in

- **Test account selection screen** (stub only, `/connexion-bouchon`, rendered by the
  server): one row per account — Antor, Léa, Teo, Mira, Admin — with its groups (Admin:
  « groupes : parents ») and a « Se connecter en tant que … » button. Without `KANEVAS_STUB`, this
  address responds « Page introuvable. ».
- **« Connexion refusée »** (Authelia refused or the callback is invalid): « La connexion a été
  refusée. » and a « Réessayer » link restarting sign-in (same address). No other content.
- **« Connexion indisponible »** (Authelia unreachable): « Authelia ne répond pas pour
  l'instant. Réessayez dans un moment. » and a « Réessayer » link restarting sign-in (return to the sign-in address)
- The session expires after 7 days (AD-56). **« Se déconnecter »** (account menu, sidebar bottom)
  clears the session and leads to sign-in; in stub mode, this is how accounts are switched.
- `GET /api/moi` returns `{username, groups, limites}` for the signed-in account: this is what the sidebar
  displays (the username) and what tests read to check groups. `limites.contenuSection`
  (100,000) is a section's limit, read by the sheet screen (AD-91).

### Sidebar

On every screen within a universe: at the top, the **universe selector** (name, role badge, list
of the account's universes, then « Mes univers » and « Systèmes de jeu » at the bottom of the list); **« Vue d'ensemble »**; **« Campagnes »**, **« Comptes-rendus »** and **« Cartes »**; **« Lore »**:
the universe's enabled types (« Personnages », « Lieux », « Factions », « Objets », « Événements », « Quêtes » by default; full list at the top of this document); for a GM, **« Univers ▸ Membres »** and **« Paramètres »**; at the
bottom, the account (avatar and username), opening the account menu: username, theme
(« Clair », « Sombre », « Système », as three icons) and « Se déconnecter ». Outside a universe (E-1,
E-2, E-5, E-15, E-16): « Mes univers », « Systèmes de jeu », « Administration » for an account in the `parents` group (E-5, below) and the account at the bottom. **An item whose screen is not
built is not displayed** (« Campagnes », « Comptes-rendus » and « Cartes » are displayed). « Paramètres » (E-14) is displayed only for the GM. On phones (below 760 px), the sidebar is a drawer under a
« Menu » button.

| State | What is shown |
|---|---|
| vide | not applicable to the selector: the current universe is always there; the « Lore » section can be empty if all its types are disabled (text below, “Sidebar”); outside a universe, « Mes univers » and « Systèmes de jeu » |
| chargement | the selector displays « … »; fixed items are already present |
| erreur | the selector displays « Univers », without a list (the name is known only from the list that failed to load); « Impossible de charger vos univers. » in the expanded list, with « Réessayer » |
| connexion perdue | the banner; navigation unchanged |
| refus | on « Page introuvable. », the sidebar is that of a screen outside a universe: **no selector**, no universe name, only « Mes univers », « Systèmes de jeu » and the account at the bottom; within a universe, the selector lists only the account's universes |
| contenu long | 100 universes: the selector list scrolls; an 80-character name is truncated with « … » and a tooltip |

### E-1 Home

List of the account's universes: name, start of the description, role badge (« MJ », « Joueur »); a click
leads to E-3. *Since `kanevas-illustrations` (Monsieur's decision of 2026-10-06), a **card
grid**, like E-8 and E-16 (“E-1 as cards”, below).* « Créer un univers » button (→ E-2). The account's username is displayed at the top:
« Connecté en tant que lea ». Order: by name.

| State | What is shown | Available actions |
|---|---|---|
| vide | « Aucun univers pour l'instant. »; « Vous menez une partie ? Créez un univers. »; « Vous êtes joueur ? Donnez votre identifiant à votre MJ : **lea** » | « Créer un univers » |
| chargement | « Chargement de vos univers… » | — |
| erreur | « Impossible de charger vos univers. » | « Réessayer » |
| connexion perdue | the banner; the already loaded list stays visible | open an already listed universe; « Créer un univers » disabled |
| refus | not applicable: the page shows only the account's universes | — |
| contenu long | 100 universes: the list scrolls; an 80-character name is truncated with « … », with the full name in a tooltip; the description fits on two lines | same |

*Criterion.* Given a new account (Teo, never added), when it opens home, it sees
« Aucun univers pour l'instant. » and its username « teo » displayed, and no universe name.

### E-2 Create a universe

A form: « Nom » (required, at most 80 characters), « Description » (optional, at most 500),
« Créer l'univers » and « Annuler » (→ E-1). Creating leads to the universe's E-3, with the creator
as GM (B-2). As soon as a name is entered, the universe seal (its initial) appears as a preview above the title; while the name is empty, nothing appears.

| State | What is shown | Available actions |
|---|---|---|
| vide | blank form, no preview | fill in |
| chargement (écriture en cours) | the button displays « … », disabled | — |
| erreur | « Erreur : le nom est obligatoire. » below the field; or, if creation fails, « L'action n'a pas abouti. Réessayez. » above the form, input kept | correct, retry |
| connexion perdue | the banner; « Créer l'univers » disabled, input kept | wait |
| refus | not applicable: every account can create a universe (B-2) | — |
| contenu long | « Erreur : 80 caractères au plus. » from the 81st character (same text for the description with 500) | correct |

### E-3 Universe overview

The universe's name (title), its description, the role badge, then a **block region**. When
no block renders anything, the region shows « Rien à afficher pour l'instant. Les
campagnes, les comptes-rendus et les cartes s'afficheront ici. »; no counter or dead link.
**Blocks are independent**: each slice adds its own by placing a file in
`frontend/src/ecrans/vue-ensemble/blocs/` whose default export is a `Bloc` (identifier,
roles that see it, rank, component); the registry `frontend/src/ecrans/vue-ensemble/registre.ts`
finds it automatically (a single file, as for screens); it modifies no existing block.

| State | What is shown | Available actions |
|---|---|---|
| vide | the block region's message (above) | navigate through the sidebar |
| chargement | no name, « Chargement… » | — |
| erreur | « Impossible de charger cette page. » | « Réessayer » |
| connexion perdue | the banner, already loaded content | navigate |
| refus | unknown universe or no role for the account: « Page introuvable. » | « Mes univers » |
| contenu long | a 500-character description wraps; an 80-character name wraps in the title | — |

*Criterion.* Given Teo, without a role in Lame d'Ébène, when he opens the universe's address,
he sees « Page introuvable. », without the universe's name.

### E-4 Members (GM)

A list: username, role (« MJ » / « Joueur » list), « Retirer ». At the top, an « Identifiant du
compte » field, the role (Player by default) and « Ajouter ». **« Retirer »** asks for inline
confirmation: « Retirer lea de Lame d'Ébène ? Elle ne verra plus l'univers. » with « Retirer lea » and
« Annuler ». A GM who removes themselves while another GM remains returns to E-1.

Slice refusals, exact wording: « Ce compte ne s'est jamais connecté. »; « Ce compte est déjà
membre. »; « Impossible : l'univers doit garder au moins un MJ. » (removing or demoting the only
GM).

| State | What is shown | Available actions |
|---|---|---|
| vide | not applicable: there is always at least one GM | — |
| chargement | « Chargement des membres… » | — |
| erreur | « Impossible de charger les membres. »; a write error appears above the list, which remains | « Réessayer » |
| connexion perdue | the banner; « Ajouter », role change, « Retirer » disabled | — |
| refus | for a Player: the « Membres » item is absent and its address shows « Page introuvable. » | « Mes univers » |
| contenu long | 200 members: the list scrolls; the username is truncated with « … » and a tooltip | same |

*Criterion.* Given Antor, sole GM of Lame d'Ébène, when he tries to remove Antor, he
sees « Impossible : l'univers doit garder au moins un MJ. » and the list is unchanged.

### E-8 Sheet list

For a type in the sidebar (« Personnages », « Lieux »…): sheets **the account can read**, by
title (case-insensitive alphabetical order), each with its badge (for a character: « PJ » or « PNJ »).
One hundred sheets at a time, then « Charger la suite ». For a GM, « Nouveau personnage » (« Nouveau
lieu »…) opens a dialog: « Titre » (1 to 120 characters) and, for a character, « PJ » or
« PNJ » (« PNJ » by default); « Créer la fiche » leads to the sheet's E-9, with no section. Text per type: « Aucun personnage », « Aucun lieu », « Aucune faction », « Aucun objet », « Aucun
événement », « Aucune quête », followed by « pour l'instant. » (GM) or « à voir pour l'instant. »
(Player); button « Nouveau personnage », « Nouveau lieu », « Nouvelle faction », « Nouvel objet »,
« Nouvel événement », « Nouvelle quête ». Search within the type is added above the list (see “Screen details for `kanevas-relier-chercher`”). The session report type has no entry here (E-13).

| State | What is shown | Available actions |
|---|---|---|
| vide | GM: « Aucun personnage pour l'instant. » and « Nouveau personnage »; Player: « Aucun personnage à voir pour l'instant. » (other types: see above) | GM: create |
| chargement | « Chargement des fiches… » | — |
| erreur | « Impossible de charger les fiches. »; creation failed: « L'action n'a pas abouti. Réessayez. », title kept | « Réessayer » |
| connexion perdue | the banner; « Nouveau … » and « Créer la fiche » disabled | open a listed sheet |
| refus | unknown type: « Page introuvable. »; an unreadable sheet is absent from the list | — |
| contenu long | more than 100 sheets: « Charger la suite »; overlong title truncated with « … » and a tooltip | same |

*Criterion.* Given the « Maître Aldric » sheet, none of whose sections Léa can read, when Léa opens the
character list, she does not see « Maître Aldric ».

### E-9 Sheet

The title, type badge, then **sections** in their order, each a panel: title,
rendered Markdown content (AD-95), and a slot for **section blocks** (relations, attachments:
subsequent slices register their own, as for E-3, in
`frontend/src/ecrans/fiche/blocs/` and `registre.ts`).

*The GM* sees every section. On each: « Modifier »; the **audience**, five settings —
« Les joueurs la lisent », « Les joueurs l'écrivent », « Auteur » (list of the universe's Players,
or « aucun »), « L'auteur la lit », « L'auteur l'écrit » — saved on change; « Monter »,
« Descendre »; « Retirer la section ». At the bottom: « Ajouter une section » (title, 1 to 80
characters; the section starts empty and closed to players). A GM-only section bears the
words « MJ seul » (amber badge). **Player mode** (toggle at the top) shows the sheet as seen
by a Player who authors no section: no settings, no closed section, and
« Modifier » only on those players can write (AD-39).

*A Player* sees readable sections (players, or author if it is them), without the titles or any trace of
the others; « Modifier » on writable ones; no audience, order, addition or removal.
To **edit**: a text field (at most 100,000 characters, value read from `limites.contenuSection` in `/api/moi`; the server also enforces it, AD-91, AD-106; 20,000 before `kanevas-import`), « Enregistrer », « Annuler ».
Saving sends the version read (AD-59).

Text: section without content: « Rien d'écrit pour l'instant. »; sheet without a section (GM): « Cette
fiche n'a pas encore de section. »; stale write: « La section a changé depuis que vous
l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous. » with
« Recharger la section »; permission removed in the meantime: « Vous ne pouvez plus modifier cette section. »;
Removal confirmation: « Retirer la section « Vérité — MJ seul » ? Son contenu sera perdu. »
(with attached files: « … Son contenu et ses 3 fichiers joints seront retirés. »), with
« Retirer la section » and « Annuler ».

| State | What is shown | Available actions |
|---|---|---|
| vide | GM: « Cette fiche n'a pas encore de section. » and « Ajouter une section »; empty section: « Rien d'écrit pour l'instant. » | GM: add; anyone with write permission: « Modifier » |
| chargement | no title, « Chargement de la fiche… » | — |
| erreur | « Impossible de charger cette fiche. »; write failure: « L'action n'a pas abouti. Réessayez. », text kept | « Réessayer » |
| connexion perdue | the banner; « Enregistrer », audience, order, removal, addition disabled; text in progress remains | read |
| refus | unknown sheet or nothing readable: « Page introuvable. »; unreadable section: absent. A GM in Player mode on a sheet with no section readable by players sees « Aucune section n'est visible des joueurs. » (what a player would see: « Page introuvable. ») | switch to GM mode |
| contenu long | a 100,000-character section wraps and is displayed in full; beyond that, from the 100,001st character entered: « Erreur : 100 000 caractères au plus. » (below the field; « Enregistrer » does not submit; input is kept, including when the server refuses, 400, with the same text — not « L'action n'a pas abouti »; until `/api/moi` has returned the limit, or if it failed, the screen performs no check and lets the server respond); sheet title (120 characters) and section title (80): wrap | same |

*Criteria.*
- Given Léa, a Player, when she opens « Maître Aldric » (« Apparence » readable by players,
  « Vérité — MJ seul » closed), she sees « Apparence » and nothing else: neither the title
  « Vérité — MJ seul », a counter, nor a settings button.
- Given Antor, a GM, when he switches to Player mode on the same sheet, he sees the same
  thing as Léa and no settings.
- Given Antor, who assigned « Notes de la table » to Léa as author with write permission, when Léa
  edits the text and saves, the section shows her text; Teo, added as a Player, does not
  see it while « Les joueurs la lisent » is false.
- Given two tabs on the same section, when the second saves after the first,
  it sees « La section a changé depuis que vous l'avez ouverte… » and its text remains.
- Given Antor editing a section, when he enters a 100,001st character, « Erreur :
  100 000 caractères au plus. » appears below the field, nothing is sent and his text remains;
  when the server refuses anyway (400), he sees the same text and his text remains.

### Slice completion

Each requirement delivered by the slice (feature card, `## Livre`, outside this repository) has its screen: B-2 → E-2; B-3 to B-5 → E-4; B-7 → E-8; B-8 and B-9 →
E-9; B-1 and B-28 → session; B-29 → six states of each screen above. Each screen is reached
through P-1 (E-1, E-2, E-3), P-2 (E-4), P-3 step 4 and P-6 (E-8, E-9), P-7 (E-9). The three roles have
their column in the scoping matrix; before `kanevas-recours-admin`, the instance admin had only E-1 and
E-2; E-5 comes with that slice (below).

## Screen details for `kanevas-recours-admin`

> E-5 and the sidebar's « Administration » entry. Shared text (loading, loading error,
> connection lost, write in progress, write failure, refusal) and membership
> refusals (« Ce compte ne s'est jamais connecté. », « Ce compte est déjà membre. », « Impossible :
> l'univers doit garder au moins un MJ. ») are those of “Screen details for
> `kanevas-premiere-fiche`”. Mockup `docs/maquettes/e05-administration.html` (predates the style guide: content and vocabulary only).

**Who is an instance admin.** The account whose session carries the Authelia `parents` group (AD-56,
read at sign-in; in stub mode, Admin). Permission comes from the current session: an account removed
from the group keeps it until its session expires (7 days) — accepted risk (AD-86).
**What the admin sees**: each universe's name, member count and members
(username, role). **What they never see**: the description, a sheet, a section, a
session report, a map, an attachment, a game system — for all of this, they are an account without a
role (« Page introuvable. »), until they add themselves as a member.

### Sidebar: the « Administration » entry

For an instance admin only: outside a universe, **« Administration »** below « Mes univers »; within a
universe they belong to, **« Administration »** under an « Instance » section at the bottom of the sidebar.
For any other account, the entry does not exist.

### E-5 Administration

The top bar carries the « Instance / Administration » breadcrumb; below the title and subtitle « Les membres se gèrent ici ; le
contenu (fiches, comptes-rendus, cartes) n'est jamais affiché. », two areas, then the « Jeton de l'assistant » panel (below). On the left, **« Univers de
l'instance »**: all universes, by name (case-insensitive), each with « N membres » (« 1 membre » in the
singular), the selected universe bearing the « Sélectionné » badge; one hundred at a time, then « Charger la suite ». On the right (below the list on phones, after
clicking the universe), **« Membres — <nom de l'univers> »**: the list (username, « MJ » / « Joueur » role,
« Retirer <identifiant> » on each row, revealed on hover and focus on desktop, always visible without hover), then, below the list, an « Identifiant du compte » field, role (Player by default) and « Ajouter »: the same
action, refusals and removal confirmation as E-4. Adding their own username as
GM is how the admin reads content: the addition appears in the member list seen by the universe's
GM; a note below the field says so: « Pour lire le contenu, l'admin s'ajoute lui-même comme
membre : l'ajout apparaît dans la liste des membres que voit le MJ de l'univers. » An admin member
who removes themselves stays on E-5; the universe remains selected, its list updates without them, and it disappears from the admin's home (E-1); the « Ouvrir » link disappears with their role. Nothing else about the universe is shown: no link to its overview until
the admin is a member; once a member, an « Ouvrir » link beside the name leads to E-3 (clicking the
name only selects the universe). No action on the universe itself
(name, description): those belong to the GM.

Addresses: `/administration` (no selection: « Choisissez un univers pour voir ses membres. »)
and `/administration/univers/:id`.

| State | What is shown | Available actions |
|---|---|---|
| vide | member list: not applicable, a universe always has a GM (B-5); no universe in the instance: « Aucun univers sur l'instance pour l'instant. »; no selection: « Choisissez un univers pour voir ses membres. » | — |
| chargement | « Chargement des univers… »; for members: « Chargement des membres… » | — |
| erreur | « Impossible de charger les univers. » or « Impossible de charger les membres. », with « Réessayer »; failed write: « L'action n'a pas abouti. Réessayez. » above the member list | « Réessayer » |
| connexion perdue | the banner; « Ajouter », role change and « Retirer » disabled; loaded lists remain | read |
| refus | any account outside the group: « Page introuvable. » (the entry does not exist in its sidebar); a nonexistent universe: « Page introuvable. »; group removed when the session expires: « Page introuvable. » | « Mes univers » |
| contenu long | 300 universes: « Charger la suite »; 200 members: the list scrolls; an 80-character name and a long username are truncated with « … » and a tooltip | same |

*Criteria.*
- Given « Admin » (`parents` group), without a role in « Lame d'Ébène », when they open
  administration and select « Lame d'Ébène », they see « 2 membres », the antor (GM) and lea (Player) list, and neither the description nor any sheet.
- Given the same Admin, when they add « mira » as GM (she appears in the list) then open the overview address
  of « Lame d'Ébène », they see « Page introuvable. »; when they add themselves as GM,
  the overview opens and Antor, on E-4, sees « admin » in the member list.
- Given Léa, a Player, when she opens `/administration`, she sees « Page introuvable. » and
  has no « Administration » entry in her sidebar.
- Given Admin and the « Les Landes grises » universe, whose sole GM is « mira », when Admin tries to
  remove her, they see « Impossible : l'univers doit garder au moins un MJ. » and the list is unchanged.
- Given Admin, a GM member of « Brume » (a universe the test creates; the seeded stub world has no « Brume »: use « Les Cendres de Vaëlis » there, where Admin is GM), when they open administration, « Brume » has an « Ouvrir » link leading to its overview, and « Lame d'Ébène » has none; if they remove themselves from « Brume » (sole member: refused for the last-GM reason), the link remains.
- Given Admin and an account « nadia » that has never signed in, when they try to
  add it, they see « Ce compte ne s'est jamais connecté. ».

### Completion of `kanevas-recours-admin`

B-6 → E-5 (see universes and their members, manage them); P-2 step 3 → E-5; B-29 → the six states
of E-5; reading the `parents` group is established by the first sheet (session, AD-56) and consumed
here. E-5 is reached through P-2 (step 3) and the sidebar (admin). The three roles have their column:
GM and Player have no E-5; outside universes they belong to, the admin has only E-1, E-2 and E-5.
Deviation from scoping: none.

## Screen details for `kanevas-systemes`

> E-14, E-15, the link from E-3 to the system, the sidebar's « Paramètres » item. Shared
> text (loading, error, connection lost, write in progress, write failure,
> refusal) is that of “Screen details for `kanevas-premiere-fiche`”. Finished mockups:
> `docs/maquettes/e14-parametres.html`, `e15-systeme-de-jeu.html`.

**What each person sees of the catalogue.** The catalogue carries only system **names**, readable by any
account that is GM of at least one universe (this lets Mira find « CoF Mini »). A system's
content (E-15) is readable only by members of a universe attached to it. **No screen
names another universe**: a system says only « utilisé par N univers » (N counts the current
universe), never which ones. Since `kanevas-illustrations`, E-16 and E-15 name **only the account's
universes** that use the system (« Dans vos univers », with its role); a universe the account
does not belong to is never named, on any screen or in any response (AD-84, AD-94). A system “is not seen” from a universe not attached to it: no
block on E-3, and the E-15 address responds « Page introuvable. ».

### E-14 Universe settings (GM)

Three panels, in this order, each bearing the style guide's « MJ seul » badge (padlock); on phones (below 760 px) their bleed is 12 px, not 28.

1. **« Identité »**: « Nom » (required, at most 80 characters), « Description » (at most 500),
   « Enregistrer ». After saving: toast « Enregistré. ».
2. **« Système de jeu »**: a « Système du catalogue » list (names in case-insensitive alphabetical
   order, with « Aucun système » first), « Rattacher »; if the universe has a system: its name, « Utilisé
   par N univers » and « Ouvrir le système » (→ E-15). Choosing « Aucun système » then « Rattacher »
   **detaches** the universe (nothing is deleted: the system and its content remain, other
   universes keep it). Toasts: « « X » rattaché », « « X » détaché » (« Aucun système rattaché » if there was none).
3. **« Créer un système »**: « Nom du système » (required, at most 80 characters), « Créer et
   rattacher »: the system enters the catalogue and the universe is attached to it in one action (if either
   fails, neither happens). A name already taken (case-insensitive): « Un système porte déjà
   ce nom. » below the field. Success: toast « « X » créé et rattaché ».

| State | What is shown | Available actions |
|---|---|---|
| vide | catalogue without a system: the list offers only « Aucun système » and the panel says « Le catalogue est vide. Créez le premier système ci-dessous. »; universe without a system: « Cet univers n'est rattaché à aucun système de jeu. » | create a system |
| chargement | « Chargement des paramètres… » | — |
| erreur | « Impossible de charger cette page. »; empty name (universe or system): « Erreur : le nom est obligatoire. » below the field; failed write: « L'action n'a pas abouti. Réessayez. » above the affected panel, input kept | « Réessayer » |
| connexion perdue | the banner; « Enregistrer », « Rattacher », « Créer et rattacher » disabled, input kept | read |
| refus | Player: the « Paramètres » item is absent and the address shows « Page introuvable. »; account without a role, instance admin without a role in the universe: likewise; role removed while the page is open: « Vous ne pouvez plus modifier ces paramètres. » on the next write | « Mes univers » |
| contenu long | 200 systems in the catalogue: the list scrolls; an 80-character name is truncated with « … » and a tooltip; « Erreur : 80 caractères au plus. » from the 81st character (500 for the description) | correct |

*Criteria.*
- Given Antor, GM of Lame d'Ébène, and a catalogue containing « CoF Mini », when he chooses
  « CoF Mini » and « Rattacher », the panel shows « CoF Mini », « Utilisé par 1 univers » and
  « Ouvrir le système ».
- Given Léa, a Player in Lame d'Ébène, when she opens the settings address, she
  sees « Page introuvable. » and the « Paramètres » item is not in her sidebar.
- Given an existing « CoF Mini » system, when Antor creates another named « cof mini »,
  he sees « Un système porte déjà ce nom. » and nothing is created.
- Given Antor, with the universe attached to « CoF Mini », when he chooses « Aucun système » and
  « Rattacher », the panel says « Cet univers n'est rattaché à aucun système de jeu. », the
  « Système de jeu » block has disappeared from E-3, and « CoF Mini » is still in the catalogue list.

### E-15 Game system

> Since `kanevas-illustrations`, E-15 lives **outside a universe's frame**, at
> `/systemes/:sid` (see “Game systems, outside universes” below, AD-94); what follows still applies
> to its content, actions and text.

Reached from E-14 (« Ouvrir le système ») and E-3 (« Système de jeu » block, below) —
and from E-16; its address is now `/systemes/:sid` (*superseded by the
`kanevas-illustrations` section*). The system's name as title, « Référentiel commun · utilisé par N
univers »; four tabs, **« Règles »**, **« Créatures »**, **« Objets »** (« Créatures » by default) and **« Types de fiche »** (kanevas-import-types, described below); under
the tab, the list of entries of that type by name (case-insensitive alphabetical order), one hundred at a time, then
« Charger la suite ». Each row (an **entry**: a rule, creature or item; `gabarit` in the data): the name and first line of content (truncated). A click opens
the entry **inline** (name, Markdown content, AD-95).

*The GM of an attached universe*: « Ajouter une règle » / « Ajouter une créature » / « Ajouter un
objet » opens an inline form: « Nom » (1 to 120 characters), « Contenu » (at most 20,000; 100,000 since `kanevas-import`, AD-106;
optional), « Ajouter » and « Annuler »; on an open entry, « Modifier » (name and content),
« Enregistrer », « Annuler ». An entry's type never changes; nothing can be deleted. Saving
sends the version read (AD-85).
*A Player of an attached universe*: the same page, read-only, with no add or
edit button.

Text: empty tab, GM: « Aucune créature pour l'instant. » (« Aucune règle », « Aucun objet ») and
the add button; Player: « Aucune créature à voir pour l'instant. »; stale write: « Cette
entrée a changé depuis que vous l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte
reste ci-dessous. » with « Recharger » (an entry: a rule, creature or item); empty name: « Erreur : le nom est obligatoire. » below the field; name already taken within the same type: « Une créature porte déjà ce
nom. » (« Une règle… », « Un objet… »); permission removed in the meantime (role changed, universe detached):
« Vous ne pouvez plus modifier ce système. ».

| State | What is shown | Available actions |
|---|---|---|
| vide | tab without an entry: text above | GM: add |
| chargement | no title, « Chargement du système… » | — |
| erreur | « Impossible de charger ce système. »; write failure: « L'action n'a pas abouti. Réessayez. », input kept | « Réessayer » |
| connexion perdue | the banner; « Ajouter », « Enregistrer » disabled, text in progress remains | read |
| refus | *superseded*: see the state matrix in “E-15 outside the universe” (`kanevas-illustrations`) — refusal leads to « Systèmes de jeu » | — |
| contenu long | 100 entries: « Charger la suite »; name truncated with « … » and a tooltip; 100,000-character content wraps and is displayed in full; beyond that: « Erreur : 100 000 caractères au plus. »; name beyond 120: « Erreur : 120 caractères au plus. » | same |

*Criteria.*
- Given Antor, GM of Lame d'Ébène attached to « CoF Mini », when he adds the « Garde
  du sceau » creature with its content, it appears under « Créatures ».
- *Superseded by Mira's criterion in the `kanevas-illustrations` section (the sole « Les Landes
  grises · MJ » bullet):* given Mira, GM of « Landes grises » attached to the same system, when
  she opens « Créatures », she sees « Garde du sceau » and « Utilisé par 2 univers », and no
  universe name.
- Given Léa, a Player in Lame d'Ébène, when she opens the system, she sees « Garde du
  sceau » without « Ajouter » or « Modifier »; if the GM sends a write on her behalf through the
  API address, it is refused.
- *Superseded by the `kanevas-illustrations` section (Teo's criterion, and the old address):* given
  « Admin » (`parents` group, GM of the newly created, unattached « Brume » universe),
  when they open `/univers/<Brume>/systeme`, they see « Page introuvable. »; and the
  « Brume » overview has no « Système de jeu » block.
- Given two tabs on the same creature, when the second saves after the first,
  it sees « Cette entrée a changé depuis que vous l'avez ouverte. » and its text remains.

### E-3's « Système de jeu » block

An overview block (placed in `frontend/src/ecrans/vue-ensemble/blocs/`, low rank,
visible to GMs and Players): the system's name and an « Ouvrir le système » link (→ E-15). **Without a
system, the block does not exist**: no message or dead link. Its states: loading — the block is
absent; error — the block is absent (the overview does not fail because of it); refusal and empty —
not applicable: a universe without a system has no block; connection lost — the block stays as loaded; long content — the name (80 characters) is
truncated with a tooltip.

### Completion of `kanevas-systemes`

B-13 → E-14 (attach, create and attach); B-14 → E-15; P-8 step 1 → E-14, step 2 → E-15; the
E-3 link → block above; B-29 → the six states of E-14 and E-15. E-14 is reached through P-8 and the
sidebar (GM); E-15 through P-8 and E-3. The three roles have their column: an instance admin without a
role has neither E-14 nor E-15; an admin who is GM of their own universe has the GM's screens.
Deviation from scoping: none. Clarification: scoping says “name, description” for E-14; the slice
therefore also builds **editing** a universe's name and description, which no previous
slice delivers.

## Screen details for `kanevas-relier-chercher`

> Two additions, no new screen: **search** in E-8 and the **« Relations » block** of E-9.
> Same six states and shared text as the first sheet (loading, error, connection
> lost, refusal « Page introuvable. », write in progress, write failure). Mockups: `e08` (search
> states) and `e09` (« Relations » block) are completed. The document takes precedence over the mockup.

### E-8 — search within a type

Above a type's list: a « Chercher dans les personnages » field (« …dans les lieux »,
« …dans les factions », « …dans les objets », « …dans les événements », « …dans les quêtes »),
a « Chercher » button and, when a search is active, « Effacer la recherche ». The
search starts on « Chercher » or Enter, never while typing. It is kept in
the address (`…/personnages?q=Aldric`): returning from a sheet restores the results.

*What it finds.* Entered words are matched by word prefix, ignoring
case and accents (« verite » finds « Vérité »), and **all** must occur in the
sheet's **title**, or **all** in **one section the account can read** (section title or
content). Results are sheets from the type's list, in the same
alphabetical order, one hundred at a time with « Charger la suite ». A result appears as a list
row (title, badge): no snippet, counter or ranking. The text of a section
the account cannot read finds nothing, even if it contains the words: the sheet is absent from
the results, just as it is absent from the list.

*Input.* 1 to 100 characters; blank input is equivalent to « Effacer la recherche ». Beyond
100: « Erreur : 100 caractères au plus. » below the field, nothing is sent. Symbols without letters
or digits (« - », « " », « * ») do not count as words; input containing none
behaves like a search with no results.

*Roles.* The GM searches all sheets in the universe, including a sheet without a section; a
Player searches readable sheets. « Nouveau personnage » remains visible to the GM during a
search.

| State | What is shown | Available actions |
|---|---|---|
| vide | « Aucun résultat pour « Vérité » dans les personnages. » — **the same text** whether or not the sheet exists or is readable | « Effacer la recherche » |
| chargement | « Recherche… » (`role="status"`); the old list is not shown | — |
| erreur | « Impossible de lancer la recherche. »; the field keeps its input | « Réessayer » |
| connexion perdue | the banner; « Chercher » disabled; already displayed results remain | open a result |
| refus | not applicable to search: an unknown type responds « Page introuvable. », as for the list | — |
| contenu long | more than 100 results: « Charger la suite »; an overlong title is truncated with « … » and a tooltip; 100-character input wraps in the field | same |

*Criteria.*
- Given the « Maître Aldric » sheet whose « Vérité — MJ seul » section is closed to
  players, when Léa searches for « Vérité » among characters, she sees « Aucun résultat
  pour « Vérité » dans les personnages. »; when Antor performs the same search, he sees
  « Maître Aldric ».
- Given Léa, when she searches for « aldric » among characters, she sees
  « Maître Aldric » (the title matches); and when she searches for « apparence », she also sees it
  (the « Apparence » section is readable by players).
- Given a search with no results, when Léa searches for a word that exists nowhere,
  the displayed text is the same as for « Vérité » (no difference reveals the
  hidden sheet).
- Given Léa viewing the results for « Aldric », when she opens the sheet then returns,
  she finds the same search and results.

### E-9 — the « Relations » block

In each section, below its content: a **« Relations »** block, registered in the section block
registry (one file, without modifying an existing block). It lists relations **carried by that
section**: each states its type and names its target — « membre de → Lames Grises », with the target's
type badge — and leads to the target sheet (E-9). A relation is directed: it goes from the
section to the target; the target sheet does not show incoming relations.

| Role | Read a section's relations | Relate, remove | Refusal |
|---|---|---|---|
| GM | all those of their sections | yes | not applicable |
| Player | those whose section and target they read | no: buttons **absent** | a relation to an unreadable target is **absent**, not refused |
| GM in Player mode | as a Player who authors no section | no: buttons absent | same |
| Instance admin | none | no | « Page introuvable. » |

*What each person sees.* A relation is shown only if the account reads the section **and** the target
sheet. Otherwise it is **absent**: no row, space, counter or « cachée » word. The block
does not appear at all for a Player with no visible relation. The GM sees every section's
block, even empty. In Player mode, the GM sees the block as a Player who authors no
section (AD-39), without « Relier » or « Retirer ».

*The GM creates a relation.* « Relier à une fiche » opens a form below the list:
1. « Type de relation » (free text, 1 to 80 characters, for example « membre de »);
2. « Type de fiche » (« Personnage », « Lieu », « Faction », « Objet », « Événement », « Quête »; « Personnage » by default);
3. a « Chercher dans les factions » field and the list of sheets of that type, one hundred at a time with
   « Charger la suite »: this is E-8's list and search, not another one;
4. choose one sheet (only one), then « Relier »; « Annuler » closes without writing anything.

*The sheet selector* (step 3) is E-8's list and search unchanged: search starts on « Chercher » or Enter, with the same states and text (« Recherche… », « Impossible de lancer la recherche. » and « Réessayer », « Aucun résultat pour « lames » dans les factions. », connection lost banner with « Chercher » and « Relier » disabled, « Charger la suite » beyond 100); when the form opens, the type's list loads (« Chargement des fiches… », or « Impossible de charger les fiches. » and « Réessayer ») and « Chercher » stays active (unless the connection is lost); « Relier » stays disabled until a sheet is selected, during loading and on error; « Effacer la recherche » restores the type's list; the selection is visible (filled dot) and disappears if the sheet type or search changes.

The form is not kept if the session expires. A sheet can be related to any sheet in its
universe, **except itself**. A section carries at most 100 relations; two relations of the same
type to the same sheet cannot coexist. « Retirer » on a row deletes the relation without
confirmation (it can be recreated in three actions); removing a section removes its relations with it.

Text: block without a relation (GM): « Aucune relation pour l'instant. »; errors below fields:
« Erreur : le type de relation est obligatoire. », « Erreur : 80 caractères au plus. », « Erreur :
choisissez une fiche. »; service refusals, above the form: « Cette relation existe
déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. »;
empty selection list: « Aucune faction à relier. » (other types: « Aucun personnage… »);
each « Retirer » button has the accessible label « Retirer la relation membre de → Lames Grises ».

| State | What is shown | Available actions |
|---|---|---|
| vide | GM: « Aucune relation pour l'instant. » and « Relier à une fiche »; Player: the block is not there | GM: relate |
| chargement | « Chargement des relations… » in the block alone; the rest of the sheet stays displayed | — |
| erreur | « Impossible de charger les relations. » in the block alone, other sections intact; write failure: « L'action n'a pas abouti. Réessayez. », input kept | « Réessayer » |
| connexion perdue | the banner; « Relier », « Retirer » disabled; the displayed list remains | follow a link |
| refus | an unreadable section's block does not exist (the section is absent, B-9); a relation to an unreadable sheet is absent; « Relier » and « Retirer » do not exist for a Player or in Player mode | — |
| contenu long | 100 relations: the list scrolls with the section; an 80-character type and a 120-character sheet title wrap | same |

*Criteria.*
- Given Antor, a GM, who has related the « Apparence » section of « Maître Aldric » to the
  « Lames Grises » faction (« membre de ») and to the « Cercle des Cendres » faction, none of whose sections
  are readable by players, when Léa opens « Maître Aldric », she sees « membre de → Lames Grises »,
  and nothing else in the block: no « Cercle des Cendres », counter or empty row.
- Given the same sheet, when Antor switches to Player mode, he sees the same thing as Léa,
  with neither « Relier » nor « Retirer ».
- Given Léa, when « Lames Grises » no longer has a section readable by players, the relation
  disappears from Aldric's sheet without any other trace.
- Given Antor on « Maître Aldric », when he relates « Apparence » to « Maître Aldric », he
  sees « Une fiche ne se relie pas à elle-même. » and nothing is written.
- Given Antor, when he removes the « Apparence » section, its relations disappear
  with it and do not appear anywhere else.

### Completion of `kanevas-relier-chercher`

B-10 → E-9's « Relations » block; B-11 → E-8 search; B-29 → six states of search and the
block above. Reached through P-3 step 4 (relate the NPC to its faction: relate an NPC section, E-9 block) and P-6 step 2
(search for « Aldric », E-8). Both roles have their column: the GM searches and relates, the Player
searches and reads what they can; the instance admin reaches neither (« Page
introuvable. »). Failure path specific to this slice (`docs/parcours.md` has none for P-3 and P-6): a search without results says « Aucun résultat pour … »,
never « caché ». Failure path for relating a section: the service refusal appears above the form (« Cette relation existe déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. »), input and selection are kept; a generic write failure and an expired session follow the shared text (« L'action n'a pas abouti. Réessayez. »; sign-in, form not kept).

## Screen details for `kanevas-suivi`

> E-6 Campaign, E-7 Scenario, E-13 Session reports, and their additions to E-3, E-9 and the
> sidebar. The same six states and common texts as above (loading, loading error,
> offline, writing, write failure, refusal, expired session); only specific
> texts are repeated. Vocabulary: screens spell out « compte-rendu »;
> « CR » is only an abbreviation in the documents (B-19, B-20). Dates: « 22 sept. 2026 » (day, abbreviated
> month, year), as on E-9. Mockups: `e06` and `e03` are finished; `e07` and `e13` predate the charter (content and vocabulary only).

**Additions to existing screens.**

- *Sidebar*: **« Campagnes »** and **« Comptes-rendus »** appear, for all roles, between
  « Vue d'ensemble » and « Lore ». On phones, like the other items (drawer).
- *E-3*: three registered blocks (one line each, no existing block changed):
  « Campagnes actives » (everyone), « Derniers comptes-rendus » (everyone), « Préparation » (GM).
  The « Rien à afficher pour l'instant… » region stops appearing as soon as a block is registered for
  the role; each block has its own empty state.
- *E-9, session-report sheet*: below the title, a « Campagne : <nom> » line leads to
  the campaign's E-6. Nothing is added for other sheet types. E-9 currently has no
  slot below the title: the slice adds **just one**, a title-line registry
  (`frontend/src/ecrans/fiche/lignes/registre.ts`, one line: relevant sheet type, component),
  empty for every other type; no existing section block is changed. Line states: the
  campaign name wraps (80 characters); while loading, the line is absent;
  unreadable campaign or error: the line is absent without a message (the report remains readable); offline: the displayed line stays clickable (navigation only, no write).
- *E-9, what each role sees of a session report*: a single section, « Compte-rendu », readable by
  all members. « Modifier » is offered to its author (the player who created it) and the GM, but not
  other players; the GM sets the audience as for any section. A report created by a GM
  has no author. Closing the section to players hides it from other players, but not its author
  (AD-61).

### E-6 Campaign

Two views, each with its own address: the **list** (`/univers/:id/campagnes`) and a **campaign
page** (`/univers/:id/campagnes/:campagne`).

*The list*: the universe's campaigns — name, status — **active first, then in preparation,
then completed, each group sorted by name** (case-insensitive). Several campaigns may be active
(AD-60). For each one, the GM sees a status dropdown (« En préparation », « Active », « Terminée »)
to change it in place, and « Nouvelle campagne » at the top: a « Nom » field (1 to 80 characters) and
« Créer la campagne »; the campaign starts « En préparation » and the list stays open, showing
it. The player sees a status badge, with no control. Neither a campaign name nor a task
label can be corrected, and nothing can be deleted: outside this slice.

*The campaign page*: the name (title), status (dropdown for the GM, badge for the player),
then three panels (a campaign has no description or fields other than name and status).

1. **« Scénarios »** (GM only — players have neither the panel nor its title): scenarios in
   creation order, oldest first, each a link to E-7; « Nouveau scénario »: a
   « Titre » field (1 to 120 characters) and « Créer le scénario », leading to E-7.
2. **« Préparation »** (GM only, likewise): **unchecked** tasks, grouped under the five
   categories in this order — « Monstres », « PNJ », « Cartes », « Déroulements », « Autre » — empty categories
   are not shown; each task: a checkbox and its label. Checking moves it to the
   « Cochées (n) » group below the list, with its category badge, a « Décocher » link and a
   struck-through label; checked tasks sort from most recently checked to oldest. At the bottom, « Nouvelle
   tâche »: label (1 to 200 characters), category (required, « Autre » by default),
   « Ajouter ». **No task can be deleted** (scope matrix).
3. **« Comptes-rendus »** (everyone): this campaign's **readable** session reports, newest
   creation first, each with title, author (the section author's identifier; a report
   created by the GM has no author, AD-61: nothing is shown, not even the GM's name), creation date and link to E-9. « Nouveau
   compte-rendu » opens a dialog: « Titre » (1 to 120 characters), « Texte » (optional, at most 100 000
   since `kanevas-import`, AD-106; 20 000 before), « Publier » and « Annuler »; « Publier » creates the report and leads to E-9 (AD-61). If
   creation fails, the dialog stays open and keeps the input, with « L'action n'a pas abouti.
   Réessayez. »; session expires during input: text is kept as on E-9. One hundred at a time,
   then « Charger la suite ».

Input errors, below the field: « Erreur : le nom est obligatoire. » / « Erreur : 80 caractères
au plus. » (campaign); « Erreur : le titre est obligatoire. » / « Erreur : 120 caractères au plus. »
(scenario, report); « Erreur : le libellé est obligatoire. » / « Erreur : 200 caractères au
plus. » (task); « Erreur : 100 000 caractères au plus. » (report text).

Texts: empty list, GM: « Aucune campagne pour l'instant. » and « Nouvelle campagne »; player:
« Aucune campagne pour l'instant. »; no scenarios: « Aucun scénario pour l'instant. »;
empty preparation, including when all tasks are checked: « Rien à préparer pour l'instant. »,
with the « Cochées (n) » group remaining below it; no checked tasks: the group is not shown;
no reports: « Aucun compte-rendu pour l'instant. » (player: « Aucun compte-rendu à lire
pour l'instant. »). A completed campaign keeps its panels and accepts new reports.

| State | What is shown | Available actions |
|---|---|---|
| Empty | The texts above, panel by panel | GM: create a campaign, scenario, task; everyone: a report |
| Loading | « Chargement des campagnes… » (list); « Chargement de la campagne… » (page), title absent | — |
| Error | « Impossible de charger les campagnes. » / « Impossible de charger cette campagne. » (unreadable name or status empties the page; failure of a single panel — scenarios, preparation, reports — empties only that panel: « Impossible de charger ce panneau. » with « Réessayer »); failed « Charger la suite »: « Impossible de charger la suite. »; write failure (status, task, creation) appears above the panel, the value returns to its previous state, input remains | « Réessayer » |
| Offline | Banner; status dropdown, checkboxes, « Ajouter », « Créer… », « Publier » disabled; input kept | Read, open |
| Refused | Unknown campaign or campaign from another universe, universe without a role: « Page introuvable. »; players have neither the scenarios nor preparation panels, titles or counters, and a scenario address answers « Page introuvable. » | « Mes univers » |
| Long content | 100 campaigns: list scrolls; an 80-character name wraps; a 120-character report title wraps; 100 or more scenarios: list grows; 100 or more tasks per category: list grows, without pagination; over 100 reports: « Charger la suite » | Same |

*Acceptance criteria.*
- Given Antor, a GM, with an unchecked « Plan de la crypte » task (« Cartes »), when he
  checks it, it leaves « Préparation » and appears in « Cochées (1) »; when he unchecks it,
  it returns under « Cartes ».
- Given Léa, a player, when she opens « La Couronne brisée », she sees the name,
  status and reports, and the route response contains neither scenarios nor tasks nor their counts.
- Given Antor changing the status to « Terminée », when Léa reloads the list, the
  campaign's badge says « Terminée » and the campaign moves to the last group.

### E-7 Scenario (GM)

Reached from E-6 (scenario list, « Créer le scénario »). The title, a « ← La
Couronne brisée » link to E-6, rendered Markdown content (AD-95); « Modifier » opens « Titre » and
« Contenu » (at most 20 000 characters; 100 000 and Markdown since `kanevas-import`, AD-95, AD-106), « Enregistrer », « Annuler ». Saving sends the version
read (AD-62); a scenario cannot be deleted.

Texts: empty content: « Rien d'écrit pour l'instant. »; stale write: « Ce scénario a changé
depuis que vous l'avez ouvert. Rechargez-le pour voir la nouvelle version ; votre texte reste
ci-dessous. » with « Recharger le scénario »; empty or overlong title: « Erreur : le titre est
obligatoire. » / « Erreur : 120 caractères au plus. »; content: « Erreur : 100 000 caractères au
plus. ». Session expires during input: text is kept as on E-9.

| State | What is shown | Available actions |
|---|---|---|
| Empty | « Rien d'écrit pour l'instant. » | « Modifier » |
| Loading | « Chargement du scénario… », title absent | — |
| Error | « Impossible de charger ce scénario. »; write failure: « L'action n'a pas abouti. Réessayez. », text kept; *(kanevas-import-liens)* the `[[` list: « Impossible de chercher. » and « Réessayer » | « Réessayer » |
| Offline | Banner; « Enregistrer » disabled, current text kept; *(kanevas-import-liens)* the `[[` list does not open | Read |
| Refused | Player, unknown scenario, scenario from another campaign or universe: « Page introuvable. »; a player has neither the screen nor a link to it | « Mes univers » |
| Long content | 100 000 characters: wrap, displayed in full; 120-character title: wraps | Same |

*Acceptance criterion.* Given Léa, a player, when she opens the address of the « Acte II — Le sceau
brisé » scenario supplied by Antor, she sees « Page introuvable. », without the title.

### E-13 Session reports

All of the universe's session reports **the account can read**, newest creation first
(editing a report does not move it up, B-20); each with title, campaign name, author (as on E-6: the identifier, nothing if absent),
creation date and link to E-9. One hundred at a time, then « Charger la suite ». No creation here:
« Nouveau compte-rendu » is on E-6, which carries the campaign.

| State | What is shown | Available actions |
|---|---|---|
| Empty | « Aucun compte-rendu pour l'instant. » (player: « Aucun compte-rendu à lire pour l'instant. ») | GM and player: « Voir les campagnes » (→ E-6) |
| Loading | « Chargement des comptes-rendus… » | — |
| Error | « Impossible de charger les comptes-rendus. »; failed « Charger la suite »: « Impossible de charger la suite. » | « Réessayer » |
| Offline | Banner; loaded list remains; « Charger la suite » disabled | Open |
| Refused | A report with nothing readable is absent from the list, never indicated; universe without a role: « Page introuvable. » | « Mes univers » |
| Long content | Over 100: « Charger la suite »; 120-character title: wraps | Same |

*Acceptance criterion.* Given Antor closing the section of his « Session 11 » report to players, when
Léa opens E-13, she does not see « Session 11 » and the list leaves no gap or counter.

### E-3 blocks (`kanevas-suivi`)

Three independent blocks, in this order. Each has a title and an empty state, and never shows a
counter or name the account cannot read.

- **« Campagnes actives »** (everyone): each active campaign's name, link to its E-6.
  All active campaigns, one per line. Empty: « Aucune campagne active. » (GM: followed by the « Voir les campagnes » link).
- **« Derniers comptes-rendus »** (everyone): the five most recently created reports the account can read,
  title, campaign, date, link to E-9; « Tous les comptes-rendus » link (→ E-13). Empty: « Aucun
  compte-rendu pour l'instant. » (player: « Aucun compte-rendu à lire pour l'instant. »).
- **« Préparation »** (GM only — no block for players): per active campaign, its five
  first unchecked tasks (oldest first) with their category, link to E-6. Empty:
  « Rien à préparer pour l'instant. ».

| State | What is shown |
|---|---|
| Loading | Each block displays « Chargement… » in its place, independently |
| Error | Only that block says « Impossible de charger ce bloc. » with « Réessayer »; the other blocks remain |
| Offline | Banner; already loaded content |
| Refused | Not applicable to blocks; the preparation block is absent for players |
| Long content | 80-character campaign name, 120-character report title, 200-character task label: wrap; at most five reports, and five tasks per active campaign; the number of active campaigns is unlimited (AD-60): « Campagnes actives » and « Préparation » grow with it, without « Charger la suite » — intentional, a table has a few active campaigns |

*Acceptance criterion.* Given Léa, when she opens E-3, she sees « Campagnes actives » and
« Derniers comptes-rendus », never « Préparation »; Antor sees all three.

### Slice closure

B-15 → E-6 (list and page); B-16 → E-6 and E-7; B-17 → E-6; B-18 → E-6; B-19 → E-6 and E-9;
B-20 → E-13. Journeys: P-3 steps 1 to 3 (E-3, E-6, E-7), all of P-4, P-5 step 1 (E-13 →
E-9); P-6 step 1 only reads the E-3 blocks (latest reports); B-18 and B-20 cite it, but no step of P-6 goes through E-6 or E-13. The three roles: the player has E-3, E-6
(without scenarios or preparation), E-13; the instance admin without a role has none of these screens.
Left to other slices: the update proposal from a report (`kanevas-monde`); creating a campaign or scenario through
the assistant is built (E-12, `kanevas-assistant-membre`).

## Screen details for `kanevas-relier-chercher`

## Screen details for `kanevas-fichiers`

> A single addition, no new screen: the E-9 **« Pièces jointes » block**. The same six states and
> common texts as the first sheet (error, offline, refusal « Page introuvable. »,
> writing, write failure). Mockup: `e09` (« Pièces jointes » block: GM, player,
> upload, failures). The document takes precedence over the mockup.

### E-9 — the « Pièces jointes » block

> *Amended by `kanevas-import` (AD-111, decisions of 2026-10-11): an attachment is now a media
> library file referenced by the section; “secret” becomes « Réservé au MJ », the file's own
> visibility; up to 100 attached files per section. See « E-9 Fiche — ce que `kanevas-import`
> change », « Fichiers ».*

Each section has a **« Pièces jointes »** block below its content (and below Relations, if present),
registered in the section block registry. It shows **files attached to that section** (references
into the media library, see « Fichiers » below): an **image** (PNG, JPEG, GIF, WebP, identified by its
bytes, not its name) as a thumbnail; any other file (PDF, text, archive…, including SVG images) as
a row with name, size and « Télécharger ». Clicking a thumbnail opens the full image in a new tab.

An attached file **has its own visibility**, « Visible des joueurs » or « Réservé au MJ » (AD-111).
Readers without access to the section do not see its block. A section reader can only see a GM-only
file if they added it themselves (third read rule); otherwise a neutral placeholder (« Image
réservée au MJ. » or « Fichier réservé au MJ. ») replaces it, and the file address answers « Page
introuvable. ». The GM sets the **file's** visibility (« Réserver au MJ » / « Rendre visible des joueurs »).

| Role | See | Attach | Set visibility | Remove reference | Refusal |
|---|---|---|---|---|---|
| GM | All attachments of their sections, including GM-only files | Yes, on any section | Yes | Yes | Not applicable |
| Player | Attachments of readable sections, excluding GM-only files **unless they added them** | On a section they **can write** (their own, or open to player writes); « Joindre un fichier » is absent on read-only sections | No: **absent** | A readable file on a section they can write | A GM-only file they did not add is **absent**; its address answers « Page introuvable. » |
| GM in player mode | Like a player, plus files they added themselves (AD-117) | Only where players can write | Absent | Only where players can write | Same |
| Instance admin | None | No | No | No | « Page introuvable. » |

Actions unavailable to a role are **absent** (never disabled, except offline): a read-only section
has neither « Joindre un fichier » nor « Retirer »; players and GMs in player mode have neither
« Réserver au MJ » nor « Rendre visible des joueurs ». The API refuses writes on a read-only
section with **403**, and visibility changes by non-GMs with 403; unreadable resources answer 404.
Instance admins have no block (« Page introuvable. »). A GM in player mode gets the player limit message.

*Attach.* « Joindre un fichier » opens the two-path add menu (see « Fichiers » below).
« Ajouter depuis l'appareil » opens the system file picker: **choosing a file is enough**; upload
starts immediately, one file after another for multiple selections (no size limit). During upload,
a « portrait.png — Envoi… 42 % » row (`role="status"`) has « Annuler »; cancellation writes nothing
to either the library or the sheet. Completed files join the list. A section has **at most 100
attached files** (50 before `kanevas-import`, AD-111); this counts block references, not text references.
Empty files are refused. Each selected file is judged separately: one refusal does not stop later
files; each refusal leaves an error row with only « Ignorer » (retrying a refusal would not help).

*Set visibility, remove.* Each row offers the GM « Réserver au MJ » (or « Rendre visible des joueurs »
for a GM-only file) and « Retirer « portrait.png » »; section writers only have « Retirer ».
Removal **only removes the reference, never the library file**. Inline confirmation: « Retirer
« portrait.png » de cette section ? Le fichier reste dans la médiathèque. » with « Retirer » and
« Annuler ». Removing a section removes its references; the first-sheet confirmation adds
« … Son contenu et son fichier joint seront retirés. » (one file) or « … Son contenu et ses 3 fichiers
joints seront retirés. » (several). Without attachments, the text is unchanged. GM-only files have
an amber « MJ seul » badge and the GM panel border. Files are never changed in place: attach another
file and remove the old one to replace it.

*Texts.* No attachments: « Aucun fichier joint. »; size: « 842 o », « 4,2 Ko », « 3,1 Mo », « 1,2 Go »
(base 1024); name: original filename without directories, up to 200 characters. A thumbnail has the
filename as alternative text, a caption below with name and size (« portrait-aldric.png · 3,1 Mo »),
then its buttons. Failed upload: « « portrait.png » : l'envoi n'a pas abouti. » with « Réessayer »
and « Ignorer ». Empty file: « « notes.txt » est vide. ». Limit: « Cette section porte déjà 100
fichiers joints. » for the GM, « Cette section ne peut pas recevoir d'autre fichier. » for a player
(who cannot see GM-only files: a count would disclose hidden information). Lost write permission
when adding or removing: « Vous ne pouvez plus ajouter de fichier à cette section. »; reload the
sheet, hiding « Joindre un fichier » and « Retirer ». Attachment already removed, deleted or no
longer readable: « Ce fichier joint n'existe plus. » (reload the list). Failed thumbnail: « Image
indisponible. » with « Télécharger ». Failed visibility change or removal: « L'action n'a pas
abouti. Réessayez. »; restore the previous state.

*No block when there is nothing to show.* A player who can neither see nor attach anything in a
section has no block: no title, count or « Aucun fichier joint. ». The GM sees every section's
block, even when empty.

| State | What is shown | Available actions |
|---|---|---|
| Empty | GM or section writer: « Aucun fichier joint. » and « Joindre un fichier »; read-only reader: no block | Attach |
| Loading | Files come with the sheet: « Chargement de la fiche… » (E-9); loading thumbnails keep their fixed frame; upload: « Envoi… 42 % » row | Cancel upload |
| Error | Upload: « « portrait.png » : l'envoi n'a pas abouti. », row remains; empty file or limit reached: the refusal above, persistent row with « Ignorer »; visibility change or removal: « L'action n'a pas abouti. Réessayez. »; thumbnail: « Image indisponible. »; library choice deleted in the meantime: « Ce fichier n'existe plus. » | « Réessayer », « Ignorer », « Télécharger » |
| Offline | Banner; « Joindre un fichier », « Réserver au MJ », « Rendre visible des joueurs », « Retirer » disabled; an interrupted upload becomes the error above; loaded thumbnails stay | View, download |
| Refused | Lost write permission: « Vous ne pouvez plus ajouter de fichier à cette section. »; attachment removed in the meantime: « Ce fichier joint n'existe plus. »; unreadable section or sheet: « Page introuvable. »; GM-only file a player did not add: absent | Reload |
| Long content | A 200-character name wraps; 100 attachments: full list, then role-specific limit refusal on add; multi-GB file: percentage progress and size in « Go »; thumbnail fits a 160 × 120 px frame | Same |

*Acceptance criteria.*
- Given « Maître Aldric », when Antor, the GM, attaches a portrait to « Vérité — MJ seul », Léa,
  a player, sees neither the portrait nor that section's block (she cannot read the section).
  On « Apparence » (readable by players), when Antor attaches another portrait then reserves it
  for the GM on E-19, Léa reads « Image réservée au MJ. » instead of the thumbnail. The reserved
  portrait's direct address answers « Page introuvable. », just like an address that never existed.
- Given Léa as author with write access to « Notes de la table », choosing a portrait starts upload
  immediately and shows a thumbnail. Teo, added to the universe as a player by Antor, cannot see it:
  visibility is set on upload (AD-111); opening the section to players later does not change it.
  He can neither attach nor remove it.
- Given Antor attaching a location map as PDF, the row offers « Télécharger » and downloads under
  the original name; « image.svg » is never rendered in the page.
- Given Antor in player mode on the sheet, he sees neither « Réserver au MJ » nor « Rendre visible
  des joueurs », nor GM-only files he did not add himself; he can only attach where players can write.
- Given an ongoing 2 GB upload, when Antor clicks « Annuler », the row disappears and no file is added.
- Given Antor removing « Apparence » with an attached portrait, the confirmation says « … Son contenu
  et son fichier joint seront retirés. »; after confirmation, the portrait is gone from the sheet
  but remains in the media library.

### Closure of `kanevas-fichiers`

In each section, below its content: a **« Relations »** block, registered in the section block
registry (one file, without changing an existing block). It lists the relations **carried by that
section**: each gives its type and names its target — « membre de → Lames Grises », with the target
sheet's type badge — and leads to the target sheet (E-9). A relation is directed: it goes from the
section to the target; the target sheet does not show incoming relations.

| Role | Read a section's relations | Link, remove | Refusal |
|---|---|---|---|
| GM | All those of their sections | Yes | Not applicable |
| Player | Those whose section and target they can read | No: buttons **absent** | A relation to an unreadable target is **absent**, not refused |
| GM in player mode | Like a player who authors no section | No: buttons absent | Same |
| Instance admin | None | No | « Page introuvable. » |

*What each person sees.* A relation is only shown if the account can read the section **and** the target
sheet. Otherwise it is **absent**: no row, space, counter or word « cachée ». A player's
block does not appear at all if they have no relation to see. The GM sees every section's
block, even when empty. In player mode, the GM sees the block like a player who authors no
section (AD-39), without « Relier » or « Retirer ».

*The GM links.* « Relier à une fiche » opens a form below the list:
1. « Type de relation » (free text, 1 to 80 characters, for example « membre de »);
2. « Type de fiche » (« Personnage », « Lieu », « Faction », « Objet », « Événement », « Quête »; « Personnage » by default);
3. a « Chercher dans les factions » field and the list of sheets of that type, one hundred at a time with
   « Charger la suite »: the E-8 list and search, not another one;
4. choose one sheet, then « Relier »; « Annuler » closes without writing anything.

*The sheet picker* (step 3) is the E-8 list and search unchanged: search starts on « Chercher » or Enter, with the same states and texts (« Recherche… », « Impossible de lancer la recherche. » and « Réessayer », « Aucun résultat pour « lames » dans les factions. », offline banner with « Chercher » and « Relier » disabled, « Charger la suite » beyond 100); when the form opens, the type's list loads (« Chargement des fiches… », or « Impossible de charger les fiches. » and « Réessayer ») and « Chercher » stays enabled (unless offline); « Relier » stays disabled until a sheet is chosen, while loading and on error; « Effacer la recherche » restores the type's list; the choice is visible (filled dot) and disappears if the sheet type or search changes.

The form is not kept when the session expires. A sheet can link to any sheet of its
universe, **except itself**. A section carries at most 100 relations; two relations of the same
type to the same sheet cannot coexist. « Retirer » on a row deletes the relation without
confirmation (it can be recreated in three actions); removing a section removes its relations too.

Texts: block without relations (GM): « Aucune relation pour l'instant. »; errors below fields:
« Erreur : le type de relation est obligatoire. », « Erreur : 80 caractères au plus. », « Erreur :
choisissez une fiche. »; service refusals, above the form: « Cette relation existe
déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. »;
empty choice list: « Aucune faction à relier. » (other types: « Aucun personnage… »);
each « Retirer » button has the accessible label « Retirer la relation membre de → Lames Grises ».

| State | What is shown | Available actions |
|---|---|---|
| Empty | GM: « Aucune relation pour l'instant. » and « Relier à une fiche »; player: no block | GM: link |
| Loading | « Chargement des relations… » in this block only; the rest of the sheet stays displayed | — |
| Error | « Impossible de charger les relations. » in this block only, other sections intact; write failure: « L'action n'a pas abouti. Réessayez. », input kept | « Réessayer » |
| Offline | Banner; « Relier », « Retirer » disabled; displayed list remains | Follow a link |
| Refused | No block for an unreadable section (the section is absent, B-9); a relation to an unreadable sheet is absent; « Relier » and « Retirer » do not exist for players or in player mode | — |
| Long content | 100 relations: list scrolls with the section; an 80-character type and a 120-character sheet title wrap | Same |

*Acceptance criteria.*
- Given Antor, a GM, who has linked the « Apparence » section of « Maître Aldric » to the
  « Lames Grises » faction (« membre de ») and to the « Cercle des Cendres » faction, none of whose sections
  players can read, when Léa opens « Maître Aldric », she sees « membre de → Lames Grises »
  and nothing else in the block: no « Cercle des Cendres », counter or empty row.
- Given the same sheet, when Antor switches to player mode, he sees the same as Léa,
  without « Relier » or « Retirer ».
- Given Léa, when « Lames Grises » no longer has any section players can read, the relation
  disappears from Aldric's sheet without any other trace.
- Given Antor on « Maître Aldric », when he links « Apparence » to « Maître Aldric », he
  sees « Une fiche ne se relie pas à elle-même. » and nothing is written.
- Given Antor, when he removes the « Apparence » section, its relations disappear
  with it and do not appear anywhere else.

### Closure of `kanevas-relier-chercher`

B-10 → E-9 relations block; B-11 → E-8 search; B-29 → the six states of search and the
block above. Reached through P-3 step 4 (link the NPC to their faction: link a section of the NPC, E-9 block) and P-6 step 2
(search for « Aldric », E-8). Both roles have their column: the GM searches and links, the player
searches and reads what they can; the instance admin reaches neither (« Page
introuvable. »). Failure path specific to this slice (`docs/parcours.md` has none for P-3 and P-6): a search with no results says « Aucun résultat pour … »,
never « caché ». Failure path for linking a section: the service refusal appears above the form (« Cette relation existe déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. »), input and choice are kept; a generic write failure and an expired session follow the common texts (« L'action n'a pas abouti. Réessayez. »; sign-in, form not kept).

## Screen details for `kanevas-assistant-membre`

> E-12 Assistant, and its addition to a universe's shell. The same six states and common texts as
> `kanevas-premiere-fiche` (loading, offline, expired session); only specific
> texts are repeated. Mockup `docs/maquettes/e12-assistant.html` (predates the charter: content and states only) (dark theme; GM, player,
> and states). Component: `docs/charte.md`, assistant panel.

**Addition to the shell.** A floating « Demander à Kanevas » button, bottom right, on **every screen
of a universe** for a member (GM or player); it exists neither outside a universe nor for an account
without a role in that universe (the instance admin without a role, Teo before being added): the screen then has no
button, the assistant has no page of its own (the `/univers/:id/assistant` address answers « Page introuvable. »), and its API route answers 404 (AD-75). It mounts through a single file, without
changing an existing shell component. A sheet's « mode Joueur » toggle has no effect on
the assistant, which keeps the real role's catalogue (AD-74); the panel states this through its badge.

### E-12 Assistant

A panel on the right (380 px on desktop) opens through the button and closes through « Fermer » or
Escape; the screen content underneath stays readable and usable. On phones (under 760 px)
it takes the whole screen, and Escape or « Fermer » returns focus to the floating button. Inside, top to
bottom:

- **the header**: « Kanevas — assistant », the catalogue badge (« MJ » or « Joueur », word and
  tint), « Nouvelle conversation », « Fermer »;
- **the thread**: the person's messages and the assistant's answers, in plain text (the thread stays that way after `kanevas-import`),
  oldest first; the thread scrolls and stays aligned with the latest message;
- **below an answer, the writes**: one « Écrit par l'assistant » block per event (AD-76), the
  label (« Section « Notes de la table » complétée », « Scénario « Acte III — La crypte » créé
  dans La Couronne brisée ») and an « Ouvrir » link to E-9 (the sheet), E-7 (the scenario) or E-6
  (the campaign). The four possible writes: « Section « Notes de la table » complétée »
  (`ajouter_a_section`, link to E-9), « Section « Vérité » modifiée » (`modifier_section`, link
  to E-9), « Campagne « La Couronne brisée » créée » (`creer_campagne`, link to E-6), « Scénario
  « Acte III — La crypte » créé dans La Couronne brisée » (`creer_scenario`, link to E-7);
- **the input**: the field, labelled « Demander à Kanevas » by a visible label above it (its hint is « Votre question »), in every state where it is displayed, and « Envoyer » (Enter
  sends, Shift+Enter inserts a line break).

The **thread lives in the browser**, in a store in `frontend/src/ecrans/assistant/fil.ts`, outside the router and browser storage (AD-28): it survives
screen changes and closing the panel; it disappears on page reload,
universe change and sign-out; « Nouvelle conversation » clears it. It is written
nowhere (neither browser storage nor server). The client sends the message and the thread's last 20
messages (AD-75).

**What each role sees.** Player: search, read a sheet, read a section, edit a
section, append a paragraph to a section, list campaigns. GM: the same, plus create
a campaign, create a scenario and generate an image (`kanevas-images`). A player asking to create a scenario or generate an image lacks the tool:
the assistant replies that it cannot, with no event and without creating anything (the wording comes from the
model and is not fixed; the check is the absence of a write). In both cases,
the assistant only reads and writes what the person can read and write: a closed section is
« Introuvable. », a readable section without write access is « Vous ne pouvez pas modifier cette
section. » (AD-74). This slice **provides no tool for maps or graphs** (rejected, AD-74). It **does not draw** the update proposal (`kanevas-monde`); the image is the
`kanevas-images` block described below: both register in the block registry.

| State | What is shown | Available actions |
|---|---|---|
| Empty (thread without messages) | « Demandez-moi de chercher, de résumer ou d'écrire dans ce que vous pouvez lire et écrire. Exemple : « Que sait-on d'Aldric ? » » | Write; close; « Nouvelle conversation » (no effect on an empty thread) |
| Loading (availability) | Button present; in the panel, « Chargement… » replaces the field and « Envoyer » (absent, not disabled); no « Réessayer » until the call answers | Close; new conversation |
| Availability failure (unresponsive server, error) | « Je n'ai pas pu répondre — réessayer » with a « Réessayer » button that rechecks availability; field and « Envoyer » present but disabled (`aria-disabled`) | Retry; close; new conversation |
| Answer in progress | Sent message appears; « Kanevas réfléchit… » (`role="status"`); « Envoyer » displays « … » and is disabled; field stays readable; GM only, after 20 seconds of waiting **whatever the request** (the client does not know what the assistant is doing), « Kanevas travaille toujours… Une image peut prendre jusqu'à trois minutes. » (`kanevas-images`); players keep « Kanevas réfléchit… » | Close (answer arrives in the thread); « Nouvelle conversation » disabled until the answer arrives |
| Error | « Je n'ai pas pu répondre — réessayer » (`role="alert"`), no event, for all causes (120 s timeout, transport error): the person cannot distinguish them; request already in progress (429): « Une demande est déjà en cours. Patientez. »; input is never lost: on send the field clears, the question stays in the thread, once only; « Réessayer » (offered for every error, including 429) resends it unchanged: the error message disappears, « Kanevas réfléchit… » replaces it, and the question is not displayed twice; a request with an image lasts at most 270 seconds (AD-90): beyond that, the same text | « Réessayer » resends the same question; type something else; close; new conversation |
| Unavailable (no token, outside stub mode, AD-77) | « L'assistant n'est pas disponible pour le moment. »; field and « Envoyer » disabled (`aria-disabled`) | Read thread; close; new conversation |
| Offline | Common banner; thread stays readable; field and « Envoyer » disabled. Lost during « Kanevas réfléchit… »: the answer is lost, state switches to the error above with « Réessayer » (disabled until back online); on reconnection, banner disappears and field is enabled again | Read, open links; close; new conversation |
| Refused | Account without a role has no button (nothing to describe here); a tool refusal is an assistant answer, not an error screen — « Introuvable. », « Vous ne pouvez pas modifier cette section. », « La section a changé depuis que vous l'avez lue. Relisez-la. » — with no event; the answer starts with that text, followed by the model's free text; expired session: the person is taken to sign-in, thread is lost | Tool refusal: thread stays, type again; close; new conversation |
| Long content | Message over 2 000 characters: « Erreur : 2 000 caractères au plus. » below the field, « Envoyer » disabled; thread over 20 messages: note « Seuls les 20 derniers messages sont transmis à l'assistant. »; long answer: wraps, thread scrolls; 120-character title in a label: wraps | Write (after shortening the message); close; new conversation |

*Acceptance criterion.* Given Léa, a player in « Lame d'Ébène », when she asks « Que sait-on d'Aldric ? »,
the thread gives « Apparence » and nothing from « Vérité »; when she asks to read « Vérité », the thread
says « Introuvable. »; Antor gets both sections and has a scenario created, which appears
in the thread with « Ouvrir » to E-7 and on E-6.

### Closure of `kanevas-assistant-membre`

B-26 → E-12 (all its rows); B-27 → E-12 (create a campaign or scenario; proposals and
generation remain with `kanevas-monde` and `kanevas-images`). Journeys: P-3 step 5 (« rappelle-moi tout
ce qu'on sait d'Aldric », first half), P-6 step 4, P-7 step 2. Roles: GM and player have
E-12, the instance admin without a role does not. No migration, no entity: the thread is not
stored. Left to other slices: update proposals (`kanevas-monde`), images
(`kanevas-images`).
B-24 → the E-9 attachments block (add in one action, view an image, download another
file, remove; its visibility follows where it was added, see the amendment below). Reached through P-3 step 4 (a location's map) and P-7 step 2 (the
portrait of one's character). The block provides its six states (B-29), above.

## Screen details for `kanevas-images`

> A single addition, no new screen: the E-12 **« Image attachée » block** (the assistant
> panel). The same common texts and six states as the screen details for
> `kanevas-premiere-fiche` and the screen details for `kanevas-assistant-membre`. Mockup:
> `e12-assistant.html` (« Image attachée » block, generation failure).

**What the assistant additionally does.** The **GM** catalogue gets one tool, `generer_image` (AD-89);
the player's does not. The GM asks « Fais un portrait pour Apparence d'Aldric »: the assistant
describes the image, has it generated, attaches it to the section (as if the GM had added it through E-9's « Joindre un fichier », AD-117 §6)
and says so. A request attaches **only one** image; the image is a media library file (E-19),
attached to the section, with visibility determined by where it is added (« Visible des joueurs » if players can read the section,
« Réservé au MJ » otherwise, B-24, AD-111), which the GM may reserve, remove or replace from E-9 or E-19. A player asking for an image lacks the tool: the assistant replies
that it cannot, with no event and without attaching anything (wording comes from the model; the check is
the absence of a write). Without an available image engine (neither stub nor Codex), the tool is absent
from the GM catalogue too, and the assistant says so in the same way.

### « Image attachée » block (E-12)

Below the answer, like other writes (AD-76), an `image_attachee` event: an « Écrit par
l'assistant » block labelled « Image attachée à la section « Apparence » de « Maître Aldric » »,
**the image thumbnail** (at most 240 px wide, aspect ratio preserved, alternative text: the
requested description) and an « Ouvrir la section » link to E-9, at that section. The thumbnail is read through the
authenticated file route (AD-67, AD-111): no public address.

| State | What is shown | Available actions |
|---|---|---|
| Empty | Not applicable: the block exists only if an image was attached | — |
| Loading | Thumbnail is a grey frame « Chargement de l'image… » (`role="status"`); label and link already present | « Ouvrir la section » |
| Error | Image removed since, or unreadable: frame says « Image indisponible. » with « Recharger l'image »; label and link remain | « Recharger l'image » (returns the same response if the image was removed); « Ouvrir la section » |
| Offline | Common banner; already loaded thumbnail remains; otherwise « Image indisponible. » with « Recharger l'image » (disabled until back online) | Read, open |
| Refused | Role or permission subsequently removed: thumbnail read and link answer « Page introuvable. » like any unreadable section (frame says « Image indisponible. », without a useful « Recharger l'image »); otherwise not applicable, the event exists only for a GM who just wrote to this section | — |
| Long content | A 120-character sheet title and an 80-character section title wrap in the label; a very tall image fits within 240 px width and 320 px height | Same |

**During generation.** The assistant only answers at the end (AD-75): « Kanevas réfléchit… » stays
displayed; after 20 seconds, **for a GM only** (« MJ » badge; the player lacks the tool and keeps « Kanevas réfléchit… »), it becomes « Kanevas travaille toujours… Une image peut prendre
jusqu'à trois minutes. » (`role="status"`). The client does not abandon the request before 300 seconds.
Closing the panel does not stop it; reloading the page or leaving the universe abandons it: nothing is then
attached.

**Failures, stated by the assistant** (answer without an event, nothing attached): failed or
overlong generation — « Je n'ai pas pu générer l'image. »; full section (100 attachments) — « Cette section
porte déjà 100 fichiers joints. »; write permission removed in the meantime — « Vous ne pouvez pas modifier cette
section. »; second image in the same request — « Une seule image par demande. »; description over 500 characters — « La description est limitée à 500 caractères. » (the assistant suggests a shorter one); no image engine — the assistant replies that it cannot generate an image (the tool is absent). In stub mode, a
request whose description contains « échec » gives the first case.

*Acceptance criteria.*
- Given Antor, a GM, and « Apparence » of « Maître Aldric », when he asks « Fais un portrait pour
  « Apparence » d'« Maître Aldric » », the thread shows « Image attachée à la section « Apparence » de
  « Maître Aldric » » with the thumbnail and « Ouvrir la section », and Aldric's section, opened on E-9,
  has one more image attachment, also listed in E-19.
- Given Léa, a player, when she makes the same request, the assistant replies that it cannot,
  and the section gains no attachment.
- Given Antor in stub mode, when his request contains « échec », the thread says « Je n'ai pas pu
  générer l'image. », without an « Image attachée » block, and the section has no extra file.
- Given Antor and a section already carrying 100 attachments, when he asks for an image,
  the assistant says « Cette section porte déjà 100 fichiers joints. » and nothing is attached.
- Given an image attached then removed from E-9, when Antor closes then reopens the panel (the thread
  survives, AD-28, and the thumbnail is reread on reopening), the frame says « Image indisponible. » with « Recharger l'image », and « Ouvrir la
  section » still leads to E-9; « Recharger l'image » rereads the thumbnail and, since the image is still
  removed, returns the same text.
- Given an attached image, when its thumbnail loads, the grey « Chargement de l'image… » frame
  precedes the image; and when the connection is lost before the read, the common banner appears and
  the frame says « Image indisponible. » with « Recharger l'image » disabled until back online.
- Given Léa, a player, when the assistant takes more than 20 seconds, she still sees « Kanevas
  réfléchit… » and never the image text; Antor, a GM, sees it after 20 seconds, even for a request
  unrelated to an image.
- Given an image request lasting more than 20 seconds, the panel displays « Kanevas
  travaille toujours… Une image peut prendre jusqu'à trois minutes. »; and if the request exceeds 270 seconds,
  « Je n'ai pas pu répondre — réessayer ».
- Given a 120-character sheet title and an 80-character section title, the label wraps
  and the thumbnail, even for a very tall image, stays within its bounds (240 px wide, 320 px high).
- Given an already loaded thumbnail, when the connection is lost, it stays displayed; and when
  Antor's role in the universe is removed, the thumbnail read answers « Page introuvable. » and the
  frame says « Image indisponible. ».
- Given an instance without an image engine, when Antor asks for a portrait, the assistant
  replies that it cannot generate an image, without an event or attachment.

### Closure of `kanevas-images`

B-25 → the block above (generate, attach in one action, a failure attaches nothing); B-27 (generate) →
the GM catalogue's `generer_image` tool; P-3 step 5 → E-12 and E-9; B-29 → the block's six states. The
block is reached through P-3 (step 5). Roles: the GM has the tool, the player does not; the instance admin without
a role has no E-12. Deviation from scope: none.

## Details for `kanevas-refonte-visuelle`

The redesign changes neither permissions, data nor screen text: it changes the
appearance and the interactions below, which the tester checks. Direction, tokens and
components are in `docs/charte.md`. E-1, E-3, E-4, E-6, E-8, E-9 and E-14 have finished mockups (the E-15 mockup, `e15-systeme-de-jeu.html`, is finished outside the universe shell); E-2,
E-7 and E-13 are redesigned within the same shell and with the same components, without
finished mockups: their current mockups, made before the style guide, specify content and
vocabulary, rather than appearance (sidebar, account, colours).

**Everywhere.** The E-9 shell on every universe screen; each navigation entry and
action has its icon; the account is behind the avatar (§ Sidebar). A successful
action is confirmed by a **toast** that disappears after 4 s or on « Fermer », and never
takes focus; a failure stays as an inline message, as today.
Toast text: « « <section> » enregistrée », « Audience de « <section> » enregistrée »,
« Section « <titre> » ajoutée — fermée aux joueurs », « Section « <titre> » retirée »,
« « <section> » reliée à « <fiche> » », « « <fichier> » est secrète » / « Le secret de
« <fichier> » est levé »,
« « <section> » montée d'un cran » / « descendue d'un cran », « « <fichier> » ajouté » /
« retiré », « Envoi de « <fichier> » annulé », « Relation vers « <fiche> » retirée »; on other
screens, the same template (« « <objet> » <participe> »); a success message currently
shown inline becomes the toast text (E-14: « Enregistré. »).

**E-9 Sheet**, for the GM:

- sections are no longer panels: title, text, then blocks, in a reading column;
- the **audience badge**, immediately after the section title, says who sees it — « Lue des
  joueurs » if players read it (« Écrite par les joueurs » if they also write it); otherwise
  « Confiée à <auteur> » if an author reads or writes it; otherwise « MJ seul » — and opens
  the audience settings, titled « Qui voit « <section> » » (the five settings, as switches and
  a list, and « Chaque changement est enregistré aussitôt. »);
- a **rule** in the margin repeats the badge: solid green for a section read or written by
  players, dotted for an entrusted section; an « MJ seul » section has amber hatching;
- « Modifier » appears on section hover and focus, and always on a screen without hover
  (phone, tablet: `hover: none`);
  « Monter », « Descendre » and « Retirer la section » are in its « ⋯ » menu;
- when editing: below the field, the « n / 100 000 » counter and « Échap annuler · Ctrl ↵
  enregistrer » help; Escape does what « Annuler » does (entered text is discarded, as
  today); Ctrl+Enter (⌘+Enter on Mac) does exactly what « Enregistrer » does:
  it submits, and a stale write receives « La section a changé depuis que vous l'avez
  ouverte… »; beyond 100 000 characters or with connection lost, it does not submit, like the button;
- the top toggle is called « Mode MJ » and « Mode Joueur » (« MJ » and « Joueur » on
  phones); in player mode, a banner below the top bar: « Mode Joueur : vous voyez ce
  que voit un joueur. »

**A Player, and the GM in player mode**, see no audience badge, rule,
hatching or « ⋯ » menu: the section has only its title, text and blocks.

| Matrix row | GM | Player | GM in player mode |
|---|---|---|---|
| account menu (theme, sign out) — and for the instance admin, outside universes | yes | yes | yes |
| « Mode MJ » / « Mode Joueur » toggle and player mode banner | yes | hidden | yes |
| section « Modifier » | yes | on what they write | on what players write |
| « Demander à Kanevas » button | yes | yes | yes |
| audience badge and settings | read, configure | hidden | hidden |
| rule and hatching | see | hidden | hidden |
| « ⋯ » menu (order, removal) | yes | hidden | hidden |
| drawer on phones | yes | yes | yes |

**Shell component states.**

| Component | What can happen | What is shown |
|---|---|---|
| account menu | connection lost | it opens; the theme changes (it is local); « Se déconnecter » stays active |
| account menu | `/api/moi` fails | the identifier is missing; the theme and « Se déconnecter » remain |
| identifier, author name, breadcrumb | too long | truncated with « … », full text in a tooltip; the breadcrumb keeps its last item whole |
| audience settings | a change fails | the switch returns to its value, « L'action n'a pas abouti. Réessayez. » below the setting; no toast |
| audience settings | connection lost | switches and list disabled, settings remain readable |
| drawer | open on a phone | sidebar over the page, backdrop behind; Escape, the backdrop or an entry closes it |
| toast | several successive actions | they stack, newest at the bottom, three at most |
| connection lost banner | connection drops | below the top bar, on every screen, as today, above the player mode banner if present; it disappears when connection returns |

*Criteria.*
- Given Antor, GM, on « Maître Aldric », when he opens the « Lue des joueurs » badge
  of « Apparence » and turns off « Les joueurs la lisent », then the badge says « MJ seul », the section
  gets amber hatching, and a toast says « Audience de « Apparence » enregistrée ».
- Given Antor, when he switches to player mode, then he sees the player mode banner and
  no badge, rule or « ⋯ » menu.
- Given Antor on any universe screen, when he opens his avatar menu,
  then he finds the theme (« Clair », « Sombre », « Système », as icons) and « Se déconnecter », and the
  sidebar no longer carries them.

**Closure.** No new need or journey; B-29 (the six states) is met by the tables
above and those of each screen; the account menu, drawer and banner belong to
the shell, reached by any step of any journey on a universe screen; the toggle and its
banner are P-3 (the GM checks what the table sees); the audience badge
carries the action of P-3 step 4 (« Apparence » read by players, « Vérité — MJ seul »),
already on E-9; each role has its column
in the matrix above.

## Screen details for `kanevas-illustrations` (illustrations; game systems outside universes)

> *Amended by `kanevas-import` (AD-111, AD-93 amended, decisions by Monsieur on 2026-10-11): the illustration is an image file in the media library, referenced by the sheet; it is visible if both the sheet **and** the file are readable — the “never secret” rule is dropped; a player who sees the sheet reads « Image réservée au MJ. » in the header and sees the fallback thumbnail in E-8 when the illustration is GM-only; it is set through the two E-9 addition paths. The “Who sees what” matrix below applies with this double guard.*

> Decision by Monsieur (2026-10-06): the sheet list must have illustration thumbnails rather than just a list; each sheet must have an optional illustration image property. Two changes, no new screen: **E-8 becomes a card grid** and **the E-9 header carries the illustration**. Data: `docs/donnees.md` (migration
> `kanevas-illustrations`); decision: AD-93. Same six states and common text as the
> first sheet (loading, error, connection lost, refusal « Page introuvable. », write in
> progress, failed write), same toasts as the visual redesign. Mockups: `e08` (grid)
> and `e09` (header). The document takes precedence over the mockup.

**The illustration, one sentence per rule.** A sheet has **zero or one** illustration, a
PNG, JPEG, GIF or WebP image (recognised by its contents, not its name). It is visible **wherever the
sheet and file are visible** (amended: a GM-only image shows « Image réservée au MJ. » to players). **Only the GM** sets, replaces
or removes it, in GM mode, from the E-9 header. It is not an attachment: it belongs to
no section, and an image attached to a section never becomes the illustration automatically.

### E-8 — the card grid

Sheets of the type, **in the same order** (case-insensitive alphabetical) and with the same
read rule as before, appear in a **card grid**. A card is a link to E-9:

- the **thumbnail**, a 4:3 frame with `--rayon-champ` corners, the image cropped without distortion
  (`object-fit: cover`, centred towards the top: `object-position: 50% 30%`, to preserve a
  face); the image is decorative (`alt=""`) because the title follows;
- the **title**, at most two lines, truncated with « … » with the full title in a tooltip;
- for a character, the **PJ** or **PNJ** badge (from the previous list); other types
  have no badge: the whole page is for that type.

**Fallback thumbnail**, for a sheet without an illustration — never a grey hole or a broken image:
a `--surface-2` fill dotted with `--bord-fort` (one dot every 12 px), the title's **initial**,
article omitted (« Le Gué-aux-Saules » → « G »), in Fraunces 56 px (44 on phones) `--texte-3` at the centre, and the **type icon** (Lucide, the sidebar icon)
in a chip at the top left. The fallback also serves when a sheet's image fails to load:
the card never shows an error. Dots do not use hatching, reserved
for secrecy (the « MJ seul » section).

*Layout.* Column at most 1 120 px wide (instead of 784: a grid needs more space than text),
`repeat(auto-fill, minmax(176 px, 1fr))`, 24 px between cards (16 px between rows below
1 080 px). On phones (below 760 px), **two columns** (12 px between them, 16 px between rows),
13 px title, badge below the title. Images
load **as they approach** (`loading="lazy"`) in a frame already at its final size (the grid does not
jump). The illustration address includes its token (`/fichiers/<id>?v=<jeton>`, AD-93), so a replaced
image reloads while an unchanged image comes from the cache.

*Hover and focus.* The card rises one level (`--surface-2` behind the card, `--bord-fort`
outline around the thumbnail); with the keyboard, the focus ring surrounds the whole card.
No shadow (the style guide reserves the only shadow for floating elements).

*Search.* Kept as is above the grid (field, « Chercher », « Effacer la
recherche », `?q=` address); results are cards, in the same order.

| State | What is shown | Available actions |
|---|---|---|
| empty | GM: « Aucun personnage pour l'instant. » and « Nouveau personnage »; Player: « Aucun personnage à voir pour l'instant. » (text per type unchanged); search without results: « Aucun résultat pour « Vérité » dans les personnages. » | GM: create; « Effacer la recherche » |
| loading | ten skeleton cards (`--squelette`, 4:3 frame and a line; two rows on desktop) and « Chargement des fiches… » (`role="status"`); a search: « Recherche… »; thumbnail not yet loaded: its frame in `--squelette`, at its final size | — |
| error | « Impossible de charger les fiches. » or « Impossible de lancer la recherche. »; an image that fails to load: fallback thumbnail, no message | « Réessayer » |
| connection lost | the banner; « Nouveau … », « Chercher » disabled; displayed cards and their already loaded images remain; an image not yet loaded: fallback thumbnail | open a sheet |
| refusal | unknown type: « Page introuvable. »; an unreadable sheet is absent from the grid, and its illustration address returns 404 like an unknown address | — |
| long content | 120-character title: two lines then « … », tooltip; more than 100 sheets: « Charger la suite » below the grid; a very tall or wide image: cropped to 4:3; an animated GIF: it animates | same |

### E-9 — the illustration in the header

The sheet header becomes two columns on desktop: on the left the **illustration**, a
176 × 220 px frame (4:5, `--rayon-panneau`, `--bord` outline), the image cropped as in E-8; on the right,
bottom-aligned, the type badge and title. Clicking the illustration opens the whole image
in a new tab; its alternative text is « Illustration de « Maître Aldric » ». **Without
an illustration, the header stays as before** (type then title, full width): no fallback
thumbnail on the sheet, the fallback belongs to the grid. On phones, the illustration (96 ×
120 px) stays to the left of the badge and title so the sheet text starts within the
first screen; a long title wraps to its right.

*GM actions* (GM mode only):

- **Add** — on a sheet without an illustration, above the type badge, a ghost
  button « Ajouter une illustration » (`image-plus`) followed by the help text « Visible de tous ceux qui
  voient la fiche. » (12 px, `--texte-3`); they appear on header hover and focus, and
  always on screens without hover (like « Modifier »). Choosing the file is enough: upload starts
  immediately (one file only; the picker offers `image/png, image/jpeg, image/gif, image/webp`,
  but the server decides).
- **Replace** and **Remove** — on an illustrated sheet, two icon buttons at the bottom right
  of the illustration, on a `--surface` chip with `--ombre-flottant`: « Remplacer l'illustration »
  (`image-up`) and « Retirer l'illustration » (`trash-2`, danger); they appear on illustration hover and
  focus, always without hover. The help text « Visible de tous ceux qui voient la
  fiche. » is the « Remplacer » tooltip and appears below the illustration during upload.
  Replacing keeps the old image displayed until the new one is saved.
- **Confirm removal**, inline, below the illustration: « Retirer l'illustration de « Maître
  Aldric » ? L'image sera perdue. » with « Annuler » and « Retirer l'illustration » (danger). Removal
  does not affect any attachment.

*Text.* Upload: inside the frame (on phones, just below it), a 2 px `--accent` bar and « Envoi… 42 % » (`role="status"`)
with « Annuler »; upload cancelled: nothing changes, toast « Envoi de « portrait.png » annulé ».
Success toasts: « Illustration de « Maître Aldric » ajoutée », « … remplacée », « … retirée ».
Failures, inline below the header (never a toast), with « Ignorer »: interrupted upload « « portrait.png » :
l'envoi n'a pas abouti. » (and « Réessayer »); file that is not an image (400
`pas_une_image`) « « plan.pdf » n'est pas une image. Choisissez un PNG, un JPEG, un GIF ou un
WebP. »; empty file « « portrait.png » est vide. »; failed removal « L'action n'a pas abouti.
Réessayez. » (confirmation closes, image remains; « Réessayer » retries removal, « Ignorer »
clears the message); permissions lost meanwhile (403, account no longer a GM) « Vous ne
pouvez plus modifier l'illustration de cette fiche. », then the sheet reloads and actions
disappear; image that fails to load: the `--surface-2` frame with the `image-off` icon and
« Image indisponible. » (the GM keeps « Remplacer » and « Retirer »).

| State | What is shown | Available actions |
|---|---|---|
| empty | sheet without an illustration: previous header; GM (GM mode): « Ajouter une illustration » and help text | GM: add |
| loading | sheet skeletons, with a 4:5 frame to the left of the title; image not yet loaded: its frame in `--squelette`; an upload: « Envoi… 42 % » in the frame | cancel upload |
| error | interrupted upload, non-image file, empty file, failed removal: inline message above; unreadable image: « Image indisponible. » | « Réessayer », « Ignorer » |
| connection lost | the banner; « Ajouter une illustration », « Remplacer », « Retirer » disabled; already loaded image remains; an ongoing upload that fails becomes the « l'envoi n'a pas abouti » error | read, open image |
| refusal | GM demoted during the action: « Vous ne pouvez plus modifier l'illustration de cette fiche. »; unreadable sheet: « Page introuvable. » (and its illustration returns 404); Player: actions absent, never greyed out | reload |
| long content | a multi-GB file: percentage progress (no size limit, AD-7); a very tall or panoramic image: cropped to 4:5; a 120-character title: wraps to the right of the illustration, on desktop and phones | same |

### Who sees what

| Matrix row | GM | Player | GM in player mode | Instance admin (without a role) |
|---|---|---|---|---|
| sheet thumbnail (or fallback) in E-8 | all universe sheets | sheets they see | not applicable: E-8 has no mode | — (« Page introuvable. ») |
| illustration in the E-9 header | yes | yes, on a sheet they see | yes, if the sheet is visible to players | — |
| open the whole image | yes | yes | yes | — |
| « Ajouter une illustration » and help text | yes | **absent** | **absent** | — |
| « Remplacer », « Retirer » | yes | **absent** | **absent** | — |
| illustration address of a sheet they cannot see | not applicable (sees everything) | **404**, identical to an unknown address | actual permissions: can read it | 404 |
| illustration `PUT` / `DELETE` through the API | yes | **403** on a sheet they see, otherwise 404 | yes (mode only changes the screen) | 404 |

A Player who authors or writes a section does not set illustrations: these belong to the
sheet, not the section.

### Criteria

- Given Léa, a Player, who cannot see the « Le Prieur masqué » sheet (no section read by
  players) and on which Antor set an illustration, when she requests that sheet's illustration
  by its address, then she receives 404, with the same body as for a sheet identifier
  that never existed; and the sheet is absent from her grid.
- Given Antor, GM, on « Maître Aldric » without an illustration, in GM mode, when he hovers
  over the header, then he sees « Ajouter une illustration » and « Visible de tous ceux qui voient la
  fiche. »; when he chooses « portrait-aldric.png », then « Envoi… » appears in the frame, then
  the illustration appears to the left of the title and a toast says « Illustration de « Maître Aldric »
  ajoutée ».
- Given Léa on the character grid, when Antor has set this portrait, then the
  « Maître Aldric » card shows the portrait; the « Bran Corvalis » card, without an illustration, shows the
  fallback thumbnail (« B » and the character icon), never an empty frame.
- Given Antor replacing Aldric's portrait, when Léa returns to the grid, then she
  sees the new portrait without a forced page reload (the address token changed).
- Given Antor choosing « plan.pdf » (or an « image.png » file containing HTML),
  then he sees « « plan.pdf » n'est pas une image. Choisissez un PNG, un JPEG, un GIF ou un WebP. »
  and the previous illustration remains; nothing is written.
- Given Antor removing the illustration and confirming « Retirer l'illustration », then the header
  returns to its previous form, Aldric's card shows the fallback thumbnail, and the old image
  address returns 404.
- Given Léa on a sheet she sees that has an illustration, then she sees the image
  and neither « Remplacer », « Retirer » nor « Ajouter une illustration »; a `PUT` from her receives 403.
- Given Antor in player mode on « Maître Aldric », then he sees the illustration and none of
  its actions.
- Given Antor choosing an empty « portrait.png » file, then he sees « « portrait.png »
  est vide. » with « Ignorer », the previous illustration remains, and nothing is written.
- Given Antor confirming « Retirer l'illustration » when the server fails, then the
  confirmation closes and he sees, below the header, « L'action n'a pas abouti. Réessayez. » with
  « Réessayer » (which retries removal) and « Ignorer »; the illustration stays displayed, on the sheet
  and in the grid.
- Given an illustration whose image fails to load, when Antor (GM mode) opens the sheet,
  then the frame says « Image indisponible. » and he keeps « Remplacer » and « Retirer »; when Léa
  opens the same sheet, then she sees the same « Image indisponible. » frame, without any action, and,
  on the grid, the card shows the fallback thumbnail.
- Given an upload in progress when connection drops, then the banner appears, the illustration
  actions are disabled and the upload becomes « « portrait.png » : l'envoi n'a pas abouti. »
  with « Réessayer » and « Ignorer ».
- Given Antor demoted to Player by another GM while uploading, then he sees « Vous ne
  pouvez plus modifier l'illustration de cette fiche. » and the actions disappear.
- Given the grid on a phone (390 px), then it has two columns and no title overflows.

### Game systems, outside universes

> Decision by Monsieur (2026-10-06): the game system becomes **a separate dimension**, rather than a
> sub-element of a universe. Today the breadcrumb says « Lame d'Ébène › CoF Mini » because
> every system is accessed through a universe (AD-83); from now on a system has its own address and
> place in the reduced sidebar (AD-94). **Permissions unchanged, no new data.** Mockups:
> `e16-systemes-de-jeu.html` (new), `e15-systeme-de-jeu.html` (redesigned outside universes),
> `e01-accueil.html` (sidebar entry).

**One more screen: E-16 Game systems**, rather than E-15 “in list mode”. The list has its own
address (`/systemes`), navigation entry, six states and content E-15 does not
have (the account's universes, per system); E-15 remains the page for **one** system
(`/systemes/:sid`). One screen per address, like E-1 and E-3.

**Navigation.**
- Reduced sidebar (E-1, E-2, E-5, E-15, E-16): « Mes univers » (`library`), **« Systèmes de jeu »**
  (`dices`), then « Administration » for an instance admin. On E-15 and E-16, « Systèmes de
  jeu » is the current item. No « Demander à Kanevas » button: it exists only within a universe.
- From a universe: below the universe list, the **universe selector** menu has « Mes
  univers » then « Systèmes de jeu » (both outside the universe). The E-3 « Système de jeu » block
  (« Ouvrir le système ») and E-14 panel (« Ouvrir le système ») lead to that system's E-15.
  Nothing is added to the universe sidebar: the system is not part of it.
- Breadcrumb: E-16 « Systèmes de jeu »; E-15 « Systèmes de jeu › CoF Mini » (on phones,
  the `dices` icon and name only).
- The old `/univers/:id/systeme` address leads to `/systemes/:sid` if the universe is attached and
  the account is a member; otherwise « Page introuvable. ». A saved link therefore still works.

**What is visible about a system, and to whom.** An account sees a system **only if it is attached to
 a universe of which they are a member**; they **edit it if they are GM of one of these universes** (whatever
 their role in the others). Per system, they see **their own** universes using it, with their role in
 each, and the total universe count (« Utilisé par 2 univers ») — **never the name of a universe of which
 they are not a member** (AD-84). The address of a system they cannot see answers « Page introuvable. »,
 like an unknown address.

#### E-16 Game systems

Title « Systèmes de jeu », subtitle « Les référentiels de vos univers. ». A **card grid**
(decision by Monsieur on 2026-10-06: cards rather than a list suit the context better),
in the same family as E-8 sheet cards: column at most 1 120 px wide,
`repeat(auto-fill, minmax(288 px, 1fr))`, 24 px between cards; on phones, **one column**
(a card carries too much text and too many chips for two). By name (case-insensitive alphabetical order), without
pagination (only systems of one's own universes are visible). **The whole card leads to E-15.**
Each card (« Carte de système » component in `docs/charte.md`):

- a **drawn header** at 2:1 (5:2 on phones), computed by the frontend from the name, always the
  same for a given name and without any data: a triangular lattice, a large ink-tinted die (d20, d8 or
  d12) with a halo, a small neutral die, and the system monogram (« Cm » for CoF
  Mini) in Fraunces; never an image, never an empty rectangle;
- if the account is GM of none of their universes: the « Lecture seule » badge (`eye`) at the
  top right of the header;
- the **name** (Fraunces 18 px, at most two lines, « … », tooltip);
- in `--texte-3`: « Utilisé par 2 univers », then « 3 règles · 4 créatures · 2 objets » (« 1 règle »,
  « aucune créature »…);
- **their universes** using it, as chips (seal, name, role badge); within the card,
  chips are not separate links (the whole card is one); they lead to E-3 on E-15.

No write action on E-16: a system is created and attached from E-14 (P-8), which remains the
only path. Empty text: for an account that is GM of at least one universe, « Aucun système de jeu pour
l'instant. » and « Un système se rattache depuis les paramètres d'un univers que vous menez. » with the
« Mes univers » link; for others, « Aucun système de jeu pour l'instant. » and « Les systèmes
de vos univers apparaîtront ici quand leur MJ en rattachera un. ».

| State | What is shown | Available actions |
|---|---|---|
| empty | « Aucun système de jeu pour l'instant. » and account-specific text (above) | « Mes univers » |
| loading | three skeleton cards (2:1 header, name, one line, one chip) and « Chargement des systèmes… » (`role="status"`) | — |
| error | « Impossible de charger les systèmes de jeu. » | « Réessayer » |
| connection lost | the banner; already loaded grid remains (E-16 writes nothing) | open a system |
| refusal | not applicable: E-16 has no parameter and shows only what the account sees; a system detached from all their universes disappears from the grid on next load | — |
| long content | an 80-character name: two lines, « … », tooltip; a system used by 12 of their universes: chips wrap and the card grows (cards in a row keep their headers aligned); an 80-character universe name in a chip: truncated at 24 characters, tooltip | same |

#### E-15 outside the universe

E-15 content does not change (« Règles », « Créatures », « Objets » tabs; entries opened inline;
add, edit for the GM; text and states from `kanevas-systemes`). What changes:

- the **shell**: reduced sidebar, « Systèmes de jeu » current, breadcrumb « Systèmes de jeu › CoF Mini »;
- below the title (`dices`, name): « Référentiel commun · utilisé par 2 univers », then the
  « Dans vos univers » line and chips for their universes (as on E-16); if the account cannot edit it,
  the « Lecture seule » badge;
- the `/systemes/:sid` address; the tab is kept in the address (`?type=creature`), « Créatures » by
  default;
- **refusal**: system unknown or belonging to none of the account's universes: « Page introuvable. » and a
  « Systèmes de jeu » link; permission removed during a write (account no longer GM of any attached universe,
  or universe detached): « Vous ne pouvez plus modifier ce système. » and the page
  reloads (read-only, or « Page introuvable. »);
- common-template toasts: « « Garde du sceau » ajoutée », « « Loup des brumes »
  enregistré ».

| State | What is shown | Available actions |
|---|---|---|
| empty | a tab with no entry: « Aucune créature pour l'instant. » (GM, with « Ajouter une créature »); « Aucune créature à voir pour l'instant. » (read-only); « Aucune règle », « Aucun objet » similarly | GM: add |
| loading | skeletons for title, subtitle, chips, tabs and three lines; « Chargement du système… » (`role="status"`) | — |
| error | « Impossible de charger ce système. »; failed write: « L'action n'a pas abouti. Réessayez. », input kept; stale write: « Cette entrée a changé depuis que vous l'avez ouverte… »; empty or taken name: below the field | « Réessayer », « Recharger » |
| connection lost | the banner; « Ajouter … », « Modifier », « Enregistrer » disabled, text being edited remains; universe chips remain links | read |
| refusal | system unknown or attached to none of the account's universes (including through the old address): « Page introuvable. » and the **« Systèmes de jeu »** link (no longer « Mes univers »); permission lost during a write: « Vous ne pouvez plus modifier ce système. », then the page reloads read-only or with « Page introuvable. »; a Player: « Ajouter … » and « Modifier » absent | « Systèmes de jeu » |
| long content | 100 entries: « Charger la suite »; 120-character entry name truncated with « … », tooltip; 100 000-character content in full; 80-character system name: title wraps | same |

*The « Dans vos univers » block* (E-15 and each E-16 row) arrives with the system: it has no
loading or error of its own. Empty: not applicable — a visible system is always attached to at least
one universe of the account. Connection lost: it remains displayed, its links lead to E-3. Refusal: a universe
from which the account was removed disappears from the chips on next load (and the entire system if
it was the last). Long content: twelve universes or more — chips wrap below the
label; an 80-character universe name — truncated at 24 characters with « … », full name in a
tooltip and in the chip's accessible label.

#### E-3 and E-14: what the adjustment changes

| Screen | What changes | State affected |
|---|---|---|
| E-3, « Système de jeu » block | « Ouvrir le système » leads to `/systemes/:sid` (E-15 outside universes); the block reads the system in `GET /api/univers/:id` (`systeme: {id, nom}`) | refusal: if the system has become unreadable meanwhile (a GM detached the universe), clicking leads to E-15 which says « Page introuvable. » with « Systèmes de jeu »; back on E-3, the block has disappeared (it does not exist without a system) |
| E-14, « Système de jeu » panel | « Ouvrir le système » leads to `/systemes/:sid`; the catalogue list is read in `GET /api/systemes/catalogue` | refusal: likewise, if another GM detached the universe while the page was open, E-15 says « Page introuvable. »; back on E-14, the panel says « Cet univers n'est rattaché à aucun système de jeu. »; catalogue error: « Impossible de charger cette page. » as before |

#### Who sees what (systems)

| Matrix row | GM of an attached universe | Player of an attached universe (and GM of none) | Account without an attached universe (Teo; instance admin without a role) |
|---|---|---|---|
| « Systèmes de jeu » in the reduced sidebar and selector menu | yes | yes | yes (empty E-16) |
| system in E-16 | yes, with their universes and role | yes, « Lecture seule » | absent |
| E-15: read | yes | yes | « Page introuvable. » |
| E-15: « Ajouter … », « Modifier » | yes | **absent** | — |
| names of other accounts' universes | never | never | never |
| `GET /api/systemes/:sid` | 200 | 200 | **404**, same body as an unknown identifier |
| entry `POST`/`PUT` | 201 / 200 | **403** | **404** |

#### Criteria (systems)

- Given Mira, GM of « Landes grises » attached to « CoF Mini », shared with Antor's « Lame d'Ébène »,
  when she opens « Systèmes de jeu », then she sees « CoF Mini », « Utilisé par 2
  univers » and only the « Les Landes grises · MJ » chip; « Lame d'Ébène » appears nowhere,
  neither on E-16 nor on E-15.
- Given Antor, when he opens « CoF Mini » from E-16, then the breadcrumb says « Systèmes de
  jeu › CoF Mini », the sidebar is reduced and « Systèmes de jeu » is its current item.
- Given Antor on the « Lame d'Ébène » overview, when he clicks « Ouvrir le système »,
  then he reaches the same E-15 page, outside the universe; and the universe selector menu
  offers « Systèmes de jeu ».
- Given Léa, Player in « Lame d'Ébène », when she opens « Systèmes de jeu », then she sees
  « CoF Mini » with « Lame d'Ébène · Joueur » and « Lecture seule »; on E-15, neither « Ajouter une
  créature » nor « Modifier »; an entry `POST` from her receives 403.
- Given Antor, GM of « Lame d'Ébène » (« CoF Mini ») and Player in « Les Cendres de Vaëlis »
  (« Chroniques Oubliées Fantasy »), then E-16 shows both systems, « Lecture seule » only on the
  second.
- Given Teo, member of no attached universe, when he opens the « CoF Mini » address, then
  he sees « Page introuvable. »; through the API, `GET /api/systemes/<CoF Mini>` returns 404 with the
  same body as `GET /api/systemes/999999`; his E-16 list says « Aucun système de jeu pour
  l'instant. ».
- Given a saved link to `/univers/<Lame d'Ébène>/systeme`, when Antor opens it, then he
  reaches `/systemes/<CoF Mini>`.
- Given Antor detaching « Lame d'Ébène » from « CoF Mini » (E-14), when Léa reloads E-16, then
  « CoF Mini » is no longer there and its address answers « Page introuvable. ».
- Given Mira, when she opens « Créatures » in « CoF Mini » after Antor added
  « Garde du sceau », then she sees it, with « Utilisé par 2 univers » and only the « Les
  Landes grises · MJ » chip.
- Given « Admin », GM of the newly created, unattached « Brume » universe, then the
  « Brume » overview has no « Système de jeu » block, E-16 shows no system for
  « Brume », and `/univers/<Brume>/systeme` answers « Page introuvable. ».
- Given Antor on E-14 of « Lame d'Ébène », open while another GM of the universe
  detaches it from « CoF Mini », when he clicks « Ouvrir le système », then he sees « Page
  introuvable. » and the « Systèmes de jeu » link; back on E-14, the panel says « Cet univers n'est rattaché à aucun système de
  jeu. ».
- Given Léa on the « Lame d'Ébène » overview, opened before Antor detaches the
  universe, when she clicks « Ouvrir le système », then she sees « Page introuvable. » and the
  « Systèmes de jeu » link; back on the overview, the « Système de jeu » block has disappeared.

### E-1 as cards

Decision by Monsieur (2026-10-06): « Mes univers » becomes a **card grid**, like E-8 and
E-16, for consistency. Unchanged: the header (« Mes univers », « Connecté en tant que
antor », « Créer un univers »), the « 2 univers » count, ordering by name, E-2 and its states. Grid:
column at most 1 120 px wide, `repeat(auto-fill, minmax(288 px, 1fr))`, 24 px between cards; on
phones, one column. **The whole card leads to E-3.** Each card (« Carte d'univers » component
in `docs/charte.md`):

- a **drawn header** at 2:1 (3:1 on phones), computed from the name by the frontend: two hills in
  contour lines (a territory — where the system has dice), the peak ink-tinted, and the universe
  **seal** (its initial, article omitted: the universe selector's seal) at the bottom
  left; the role badge (« MJ » amber, « Joueur » green) at the top right;
- the **name** (Fraunces 18 px, one line, « … », tooltip);
- the **description**, at most two lines (Newsreader 15 px), absent if the universe has none;
- information helping selection, in `--texte-3`: the attached **game system** (`dices`, its name truncated with
  « … ») or « Sans système de jeu », and the **member count** (`users-round`, « 2 membres »).

Data: `GET /api/univers` additionally returns, per universe, `systeme: {id, nom}` or `null` and
`nbMembres` (universe members can already be read by its members: no new permission, no
new column).

| State | What is shown | Available actions |
|---|---|---|
| empty | unchanged: « Aucun univers pour l'instant. » and both paths (« Créer un univers », identifier to give the GM) | « Créer un univers » |
| loading | three skeleton cards (header, name, two lines) and « Chargement de vos univers… » | — |
| error | « Impossible de charger vos univers. » | « Réessayer » |
| connection lost | the banner; loaded grid remains; « Créer un univers » disabled | open a universe |
| refusal | not applicable: page only shows the account's universes | — |
| long content | 100 universes: grid scrolls; an 80-character name: one line, « … », tooltip; a long description: two lines and « … »; an 80-character system name: truncated with « … », full name in a tooltip | same |

*Criteria.*
- Given Antor, when he opens « Mes univers », then he sees two cards, by name: « Lame
  d'Ébène » (« MJ », « CoF Mini », « 2 membres ») and « Les Cendres de Vaëlis » (« Joueur », « Chroniques
  Oubliées Fantasy », « 2 membres »); clicking anywhere on a card opens the overview.
- Given Teo, a new account, then he sees the unchanged empty state with two paths.

### Stub seed data

The criteria for this slice assume a world. **In stub mode (AD-55), on server startup
and only if the database has no universe yet**, Kanevas seeds this starting set, through
service functions (AD-2) — not SQL — and with nothing that exists outside stub mode. Seeding runs at
server startup, not in the application factory: tests, which build their
application on an empty database, receive it only if they call it; servers started by the e2e harness set `KANEVAS_SANS_SEMIS=1` (stub only) to keep an empty database. Images are a few
demo PNG and WebP files versioned with the code, set through the real illustration-setting function
(AD-93), with a « plan.pdf » file and an empty file for failures.

It is set up **in two stages**, like the tasks: `kanevas-il-systemes-serveur` sets up the mechanism
(seeding at startup in stub mode, database without universes), universes, members, systems and their
entries, sheets **without illustrations**, and versions the demo files;
`kanevas-il-illustration-ecrans`, which depends on it, adds illustrations (through the setting function)
and failure files (« plan.pdf », empty file). The “with illustration” columns in the
table below therefore belong to the second stage.

**Triggering failures in stub mode** (stub rules, like a request containing « échec »
for the image engine, AD-55; they live in the stub layer, registered only with
`KANEVAS_STUB=1`, never in the service):
- **failed removal**: removing the illustration of a sheet whose title contains « échec » returns
  a server error and removes nothing; the seed includes such a sheet, « Le Portrait de l'échec »
  (NPC in « Lame d'Ébène », « Apparence » read by players, with an illustration);
- **unreadable image**: the seed includes « La Fresque effacée » (place in « Lame d'Ébène », read by players),
  whose illustration is recorded but whose file is missing from disk: reading it fails,
  E-9 says « Image indisponible. » and the grid shows the fallback thumbnail;
- **upload that does not complete**: cut the browser network during upload; **file refused**:
  « plan.pdf » and the seed's empty file.

| Object | Content |
|---|---|
| accounts | stub accounts: Antor, Léa, Teo, Mira, Admin (unchanged) |
| « Lame d'Ébène » | Antor GM, Léa Player; attached to « CoF Mini » |
| « Les Landes grises » | Mira GM; attached to « CoF Mini » |
| « Les Cendres de Vaëlis » | Admin GM, Antor Player; attached to « Chroniques Oubliées Fantasy » |
| Teo | member of no universe (therefore no attached universe) |
| « CoF Mini » | rules « Attaque au contact », « Points de chance », « Repos »; creatures « Gobelin des Landes », « Loup des brumes », « Sentinelle d'Ébène », « Vouivre des tourbières » (not « Garde du sceau », added by the criterion); items « Lame grise », « Sceau de Val-Fortin » |
| « Chroniques Oubliées Fantasy » | a few entries of each type |
| characters in « Lame d'Ébène » | « Maître Aldric » (NPC; « Apparence » read by players, « Vérité — MJ seul » closed; **without** illustration initially, for the addition criterion); « Bran Corvalis » (NPC, « Apparence » read, without illustration); « Le Prieur masqué » (NPC, a single « Secret — MJ seul » section: **invisible to Léa**; **with** illustration); « Léa Brisefer » (PC, with illustration); « Dame Ombeline de Val-Fortin » (NPC, with illustration); « Suie » (NPC, with illustration) |
| places and factions in « Lame d'Ébène » | « Val-Fortin » and « Le Pendu Joyeux » (with illustration), « Rue des Cordiers » (without); « Lames Grises » (with), « Cercle des Cendres » (GM-only section, with illustration: invisible to Léa) |

**`kanevas-import` seed** (added to the same seed through service functions, each part by
the first slice referencing it; epic plan):

| Object | Content | Seeded by |
|---|---|---|
| « Essai Kanka » (universe, no system) and an API token | Antor GM, Léa Player; Antor's « Jeton du bouchon » token, fixed value known to tests (`kvs_bouchon_essai…`), one year, seeded **in stub mode only** like the whole seed; criteria import here and with this token (no import into « Lame d'Ébène ») | `kanevas-import-fil` |
| « Port-Sel » (place in « Lame d'Ébène ») | « Description » read by players (Markdown: subheading, list, district table), « Histoire » read by players, **Léa as author with read and write**, with a GM block « Le port est tenu en sous-main par la Guilde des Brumes… », « Vérité » GM-only | `kanevas-import-secrets` |
| « La Guilde des Brumes » (faction, GM-only); « Rapport secret de l'amirauté » (event, GM-only) | Guild invisible to Léa; the report has, in a GM block, a link to « Maître Aldric »; Port-Sel's « Histoire » links to « Maître Aldric » and « La Guilde des Brumes »; « Apparence » of « Maître Aldric » links to « Port-Sel »; « Description » of « La Guilde des Brumes » links to « Maître Aldric »; in « Essai Kanka », the « Anse-aux-Sels » place (read by players) whose « Description » has « `[[cle:faction:repaire|les contrebandiers du Repaire]]` » (pending) and `[[999999|Capitaine Hesk]]` (broken: no sheet has this identifier) | `kanevas-import-liens` |
| « Les Sphères » (place, GM-only); « La Taverne du Kraken », « Les Docks », « Le Phare aux Sels », « Quartier des Cordiers » (places read by players); « Le Repaire des contrebandiers » (place, GM-only) | Port-Sel under « Les Sphères »; the five under Port-Sel, including the Repaire, invisible to Léa | `kanevas-import-arbre` |
| subtypes of existing places | « Val-Fortin » · « Ville », « Le Pendu Joyeux » · « Taverne », « Rue des Cordiers » · « Rue » | `kanevas-import-types` |
| aliases, labels, one lore sheet | Port-Sel: aliases « Salport », « Port-aux-Sels », label « Côte des Brumes » (also on « Cercle des Cendres », invisible to Léa); « Chronique de l'Âge d'Ombre » (lore, read by players) | `kanevas-import-recherche` |
| media library files | « Plan secret de la Guilde » (image, GM-only, unused); « Carte des Sphères » (image, visible to players): illustration of Port-Sel, inserted in « Description » of « Val-Fortin », attached to « Apparence » of « Maître Aldric »; « port-sel-quais.webp » attached to « Description » of Port-Sel; « Notes de la table », section of « Léa Brisefer » authored by Léa (read, write), closed to other players | `kanevas-import-mediatheque` |

Teo remains a member of no universe in the seed: a criterion needing him first adds him as
Player in « Lame d'Ébène » (E-4).

### Closure of `kanevas-illustrations`

B-30 → the E-8 grid (thumbnail, fallback) and E-9 header (see, set, replace, remove). Reached by P-3 (the GM prepares lore: sets the illustration on E-9 and
finds it on E-8) and P-6 (a player browses lore on her phone: the grid). Each role has
its column above; the six states of each change are in the tables (B-29).
B-31 → E-16 (new) and E-15 outside universes; reached by P-8 (step 2:
« Systèmes de jeu », or « Ouvrir le système » from E-14 / E-3); B-14 remains served by E-15;
each relationship to the system (GM, Player, without an attached universe) has its column. No new
data; B-13 and B-14 are unchanged. Both needs come from Monsieur's decisions on
2026-10-06, recorded as B-30 and B-31 (`docs/parcours.md`).

## Détail des écrans de `kanevas-monde`

> Le bloc « proposition de mise à jour » de E-12, et rien d'autre : pas de nouvel écran, pas de
> nouvelle adresse d'écran. Mêmes six états et mêmes textes communs que `kanevas-premiere-fiche`
> (chargement, connexion perdue, session expirée) ; ne sont redits que les textes propres.
> Maquette `docs/maquettes/e12-propositions.html` (d'avant la charte : contenu et états seulement) (thème sombre ; le bloc dans ses états,
> sur ordinateur et sur téléphone). Composant : `docs/charte.md` « Proposition de mise à jour ».

**Comment une proposition naît.** Le MJ écrit dans le champ de E-12, en nommant la section et le
compte-rendu : « Mets à jour la section Vérité d'Aldric d'après le compte-rendu de la séance 3 ».
L'assistant ne connaît pas l'écran où se trouve la personne (AD-75 n'envoie que le message et le
fil) : le compte-rendu se nomme dans la demande. La réponse de l'assistant qui accompagne le bloc est du texte libre du modèle (la maquette en illustre un). L'assistant lit le CR et la section, puis appelle
l'outil `proposer_mise_a_jour` (AD-80) : **rien n'est écrit dans la section**. La réponse porte un
événement `proposition_creee` (AD-76) que le fil rend comme un bloc « Mise à jour proposée », sous
la réponse de l'assistant, à la place d'un bloc « Écrit par l'assistant ».

### Bloc « Mise à jour proposée »

De haut en bas :

- **l'en-tête** : « Mise à jour proposée » ; dessous, la section visée, « Section « Vérité » de
  « Maître Aldric » », et la source, « d'après « Séance 3 » » ;
- **deux zones de texte brut côte à côte** (AD-58 ; *depuis `kanevas-import`, rendues en Markdown par la fonction de rendu d'AD-95, vue du MJ, avec une bascule « Rendu / Source » au-dessus des deux*), étiquetées « Actuel » et « Proposé » ; sous
  760 px elles s'empilent, « Actuel » d'abord. « Actuel » montre le contenu **courant** de la
  section au moment de l'affichage (pas celui de la proposition) ; une section vide s'écrit « (section vide) » ;
- **les gestes** : « Appliquer » (principal), « Abandonner », et un lien « Ouvrir » vers la fiche
  (E-9, à la section).

Le bloc se lit **au serveur** à chaque affichage et après chaque geste (AD-82) : un bloc ancien
du fil dit la vérité du moment, pas celle de sa création. « Appliquer » écrit le contenu proposé
dans la section (AD-81) ; « Abandonner » supprime la proposition. Ni l'un ni l'autre ne passe par
l'assistant.

**Ce que chaque rôle y voit.** Le MJ qui a demandé la proposition : le bloc entier. Le Joueur : il n'a pas
l'outil (AD-80), donc jamais le bloc ; s'il demande une mise à jour, l'assistant répond qu'il ne
peut pas, sans événement (texte libre du modèle, comme pour la création d'un scénario). Un autre MJ
du même univers ne voit pas la proposition de son collègue : **caché**, l'adresse répond comme une adresse inconnue (elle n'est à personne d'autre que son
demandeur, AD-79) ; l'admin d'instance sans rôle n'a pas E-12. Un MJ en mode Joueur d'une fiche garde son catalogue réel (AD-74) : il peut proposer et appliquer.
Toute lecture de la proposition par un autre compte répond comme une adresse inconnue (AD-81).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | sans objet : le bloc n'existe qu'avec une proposition (l'outil refuse un contenu vide, AD-80), donc « Proposé » n'est jamais vide ; une section vide s'écrit « (section vide) » dans « Actuel » | — |
| chargement (lecture de la proposition) | l'en-tête absent ; « Chargement de la proposition… » (`role="status"`) ; ni zones ni gestes | continuer à écrire dans le fil ; fermer |
| en attente | l'en-tête, « Actuel » et « Proposé », les gestes | Appliquer ; Abandonner ; Ouvrir |
| relecture (après un geste, ou à l'affichage d'un bloc déjà lu) | l'ancien contenu reste lisible, sans « Chargement… » ; les gestes sont désactivés (`aria-disabled`) le temps de la relecture | lire ; Ouvrir |
| application ou abandon en cours | « Appliquer » (ou « Abandonner ») affiche « … » ; les deux gestes désactivés (`aria-disabled`) ; zones inchangées | attendre |
| appliquée | l'en-tête reste (section visée, source) ; « Appliquée : la section « Vérité » est à jour. » (`role="status"`) ; « Actuel » montre le contenu appliqué, « Proposé » disparaît ; plus de geste, sauf « Ouvrir » | Ouvrir |
| abandonnée (par ce geste) | l'en-tête reste (section visée, source) ; « Proposition abandonnée. » (`role="status"`) ; plus de zones ni de geste | continuer à écrire dans le fil |
| périmée (la section a changé depuis la proposition, par n'importe qui), vue à l'affichage **ou découverte au clic** sur « Appliquer » (refus `section_modifiee` : le bloc se relit et passe à cet état, rien n'est écrit) | le bandeau « La section a changé depuis la proposition. Demandez-en une nouvelle. » (`role="alert"`) au-dessus des zones ; « Actuel » montre le contenu courant ; « Appliquer » désactivé (`aria-disabled`) | Abandonner ; Ouvrir ; demander une nouvelle proposition dans le fil. Une proposition **appliquée** ne devient jamais « périmée » : elle reste « appliquée » même si la section change ensuite |
| erreur | à la lecture : « Je n'ai pas pu afficher la proposition — réessayer » (`role="alert"`) avec « Réessayer » qui la relit ; à un geste : « L'action n'a pas abouti. Réessayez. » (`role="alert"`) au-dessus des gestes, la proposition reste en attente, les gestes se réactivent | Réessayer ; le geste à nouveau |
| connexion perdue | le bandeau commun (« Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas. », texte de `kanevas-premiere-fiche`) ; zones lisibles ; « Appliquer » et « Abandonner » désactivés ; perdue pendant un geste en cours, la réponse est perdue : le « … » disparaît, les gestes restent désactivés, et au retour de la connexion la proposition est relue — le bloc dit ce que la base dit (appliquée ou en attente), jamais un état supposé | lire ; Ouvrir |
| refus (adresse inconnue : abandonnée ailleurs, supprimée avec sa section, autre compte, MJ retiré de l'univers) | « Cette proposition n'existe plus. » ; plus de zones ni de geste ; session expirée : la personne est menée à la connexion, le fil est perdu | continuer à écrire dans le fil |
| déjà appliquée, vue d'un autre onglet | même rendu que « appliquée » (la lecture dit l'état, AD-82) ; un « Appliquer » ou un « Abandonner » en course rend 409 `proposition_appliquee` et le bloc se relit | Ouvrir |
| contenu long | contenu de 100 000 caractères : chaque zone a une hauteur maximale de 15 lignes et défile (`tabindex="0"`, étiquetée « Actuel » / « Proposé ») ; les paragraphes (lignes vides) sont conservés ; un titre de fiche ou de compte-rendu de 120 caractères passe à la ligne | faire défiler chaque zone |

La proposition vit en base (AD-79) mais le fil non (AD-28) : au rechargement de la page, au changement d'univers ou
après « Nouvelle conversation », le bloc disparaît du fil et la proposition devient inatteignable ; elle
reste en base jusqu'à être remplacée par une nouvelle pour la même section (AD-79). Limite acceptée de la V1, bornée : une
proposition en attente par section et par MJ.

*Critère.* Étant donné Léa qui a écrit le compte-rendu « Séance 3 » et la fiche « Maître Aldric »
dont « Vérité » dit « Il sert la Couronne », quand Antor demande à son assistant de mettre à jour
« Vérité » d'après ce compte-rendu, alors le fil montre « Mise à jour proposée » avec « Actuel »
et « Proposé » et **la section n'a pas changé** (la fiche, ouverte à côté, l'atteste) ; quand il clique « Appliquer », la section
montre le contenu proposé et le bloc dit « Appliquée » ; quand une autre proposition est faite puis que
quelqu'un modifie la section, « Appliquer » est désactivé et le bandeau dit pourquoi ; Léa,
qui demande la même chose à son assistant, n'obtient aucune proposition.

### Clôture de `kanevas-monde`

B-21 → bloc « Mise à jour proposée » (toutes ses lignes) ; B-27 → proposer (générer reste à
`kanevas-images`). Parcours : P-5 étapes 2 et 3. Rôles : le MJ a le bloc et ses gestes, le Joueur
ne l'a pas, l'admin d'instance sans rôle n'a pas E-12. Une migration (la table `propositions`, numérotée
à la fusion, AD-51). Reste hors de la tranche : l'application par un joueur, les propositions en
lot, la reprise d'une proposition après rechargement.

## Maquettes

`docs/maquettes/<écran>.html`, une par écran structurant. Elles illustrent ; ce document décide,
et quand les deux divergent, la maquette a tort.

**Finies** (direction, tokens et composants de `docs/charte.md`, deux thèmes, bureau et
téléphone, vrai contenu) : E-1, E-3, E-4, E-6, E-8, E-9, E-14 (liste de référence ; les autres sections y renvoient). Depuis `kanevas-illustrations`, `e08` est la grille de cartes
(types Personnages, Lieux, Factions, `#etat-lieux`, `#etat-factions`) et `e09` porte l'illustration
de l'en-tête ; leurs images sont des illustrations de démonstration peintes en SVG. E-15 et E-16
(`e15-systeme-de-jeu.html`, `e16-systemes-de-jeu.html`) sont finies hors du cadre d'un univers ;
les menus du sélecteur d'univers des maquettes `e03`, `e08`, `e09`, `e14` et la barre de `e01` portent
« Systèmes de jeu ». `e09-fiche.html` **fait référence pour le
cadre** de tous les écrans d'un univers (barre latérale, sélecteur d'univers, menu du compte,
barre haute, bascule de mode, bouton « Demander à Kanevas », tiroir au téléphone) et pour les
composants partagés. Leurs états s'ouvrent par l'adresse (`#etat-joueur`, `#etat-menu`,
`#etat-perdue`… ; la liste est en tête de leur style). Le bloc « Cartes visibles » de `e03` et les maquettes `e10` et `e11` appartiennent à
`kanevas-cartes-graphes` (détail plus bas).

**Finies par le cadrage de `kanevas-import`** : `e09-fiche-importee.html` (E-9 : Markdown, liens,
bloc MJ, fil d'ancêtres, « Contient », « Mentionnée dans », menu de la fiche), `e18-acces-api.html`
(E-18), `e14-types-de-fiche.html` (panneaux « Types de fiche » de E-14 et E-15, suppression d'un
univers) et `e19-mediatheque.html` (E-19 : images et documents, le sélecteur), dans le cadre et avec les composants
de `e09-fiche.html`.

**D'avant la charte** : les autres (e02, e05, e07, e10, e11, e12-assistant, e12-propositions, e13). Elles valent pour le contenu et le vocabulaire, pas pour la
forme ; un écran qui n'a qu'elles se construit dans le cadre et avec les composants de la
maquette E-9.

**Hors produit, en bouchon seulement** : la page de démonstration des composants
(`/demo-composants`), servie quand `KANEVAS_STUB=1` et absente sinon (404), comme l'écran de
choix d'un compte de test.

## Détail des écrans de `kanevas-cartes-graphes`

> E-10 Cartes, E-11 Carte (carte illustrée et graphe), le bloc « Cartes visibles » de E-3, l'item « Cartes »
> de la barre latérale (il apparaît avec cette tranche). Mêmes états (B-29) et mêmes textes communs que
> la première fiche (chargement, erreur, connexion perdue, écriture en cours, échec d'une écriture,
> refus « Page introuvable. », session expirée). Maquettes : `e10` (liste : MJ, Joueuse, vide,
> création en erreur) et `e11` (carte illustrée et graphe : MJ, MJ en mode Joueur, Joueuse, états).
> Le document prime sur la maquette.

### E-10 Cartes

Le titre « Cartes », le sous-titre « Les cartes de l'univers. Les joueurs ne voient que celles que vous rendez visibles. » (MJ seulement), puis la liste des cartes **de l'univers que le compte lit** : le MJ les voit
toutes ; un Joueur seulement celles qui sont **visibles**. Une
ligne : une vignette (le fond d'une carte illustrée, un motif neutre sans fond ou pour un graphe), le
titre, la forme (« Carte illustrée » ou « Graphe »), et pour le MJ l'état « Visible des joueurs » ou
« MJ seul » (seul ce dernier est une pastille ambre) avec le geste inverse : « Rendre visible » / « Cacher aux joueurs », qui
agit au clic. Un clic sur le titre ouvre la carte (E-11). Ordre : titre alphabétique, puis création ;
cent cartes par page et « Charger la suite ».

*Créer (MJ).* En tête, « Nouvelle carte » ouvre un formulaire en ligne : **Titre** (1 à 80
caractères), **Forme** (« Carte illustrée » par défaut, ou « Graphe » ; elle ne se change plus
ensuite), et pour une carte illustrée **Image de fond** (« Choisir une image », facultative : choisir
n'envoie rien, l'image part avec « Créer »). « Créer » mène à la carte (E-11), **non visible** ; un
graphe naît vide, ses fiches se choisissent sur la carte. « Annuler » ferme le formulaire.

| Rôle | Voir | Créer | Rendre visible / cacher |
|---|---|---|---|
| MJ | toutes les cartes de l'univers | oui | oui |
| Joueur | les cartes visibles ; ni l'état ni le geste de visibilité | **absent** | **absent** |
| MJ en mode Joueur | sur E-10 la bascule n'est pas proposée : le MJ y voit toujours la liste complète ; le mode Joueur se joue sur E-11 | — | — |
| Admin d'instance, ou compte sans rôle dans l'univers (Teo) | aucune (« Page introuvable. ») | — | — |

*Textes.* Aucune carte : MJ « Aucune carte pour l'instant. Créez-en une pour commencer. » (le
formulaire reste proposé) ; Joueur « Aucune carte n'est visible pour l'instant. » ; titre vide ou
trop long : « Erreur : le titre est obligatoire. » / « Erreur : 80 caractères au plus. » ; fond qui
n'est pas une image PNG, JPEG, GIF ou WebP, ou vide : « Erreur : ce fichier n'est pas une image (PNG,
JPEG, GIF ou WebP). » ; fond de plus de 25 Mo (réponse 413) : « Erreur : l'image dépasse 25 Mo. » ; échec de
création : « La carte n'a pas pu être créée. Réessayez. », le formulaire garde sa saisie (le fond
choisi aussi). Une vignette qui ne se charge pas montre le motif neutre.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes ci-dessus ; pour le MJ, « Nouvelle carte » | créer (MJ) |
| chargement | « Chargement… » seul, à la place de l'écran | — |
| erreur | « Impossible de charger cette page. » ; échec d'une visibilité : « L'action n'a pas abouti. Réessayez. » et l'état d'avant | « Réessayer » |
| connexion perdue | le bandeau ; « Nouvelle carte », « Créer », « Rendre visible », « Cacher aux joueurs » désactivés ; la liste chargée reste | ouvrir une carte déjà listée |
| refus | Admin d'instance, ou compte sans rôle : « Page introuvable. » et « Mes univers » | « Mes univers » |
| contenu long | un titre de 80 caractères passe à la ligne ; 100 cartes, puis « Charger la suite » (« Impossible de charger la suite. » et le bouton reste en cas d'échec) | charger la suite |

*Critères.*
- Étant donné Antor, MJ, qui crée « La ville de Brume » (carte illustrée, avec un fond) puis revient à
  la liste, alors Léa ne la voit pas ; quand Antor clique « Rendre visible », elle la voit, sans
  l'état de visibilité ni le geste.
- Étant donné un fichier « plan.pdf » choisi comme fond, alors la création est refusée par le texte
  ci-dessus et rien n'est créé.
- Étant donné Teo, sans rôle dans l'univers, quand il force l'adresse de la liste, alors il voit
  « Page introuvable. ».

### E-11 Carte

En tête : le titre (MJ : « Renommer » — un champ en ligne, 1 à 80 caractères, « Enregistrer » /
« Annuler »), la forme, l'état de visibilité, et pour le MJ la **bascule mode MJ / mode Joueur** (celle de la barre haute) et
« Rendre visible » / « Cacher aux joueurs ». Dessous, **le cadre** de la carte, puis la liste
« Sur la carte », puis (graphe) la liste « Liens ».

*Carte illustrée.* Le cadre montre l'image de fond à ses proportions (16/10 neutre sans fond, AD-70) ;
chaque **token** est un rond portant la première lettre du titre de sa fiche, avec le titre dessous
(24 caractères, puis « … »). Sa zone cliquable fait au moins 44 px. Un token n'est présent que si sa
fiche est lisible du lecteur (AD-38). **Joueur** : toucher un token ouvre la fiche (E-9) ; rien d'autre.
**MJ (mode MJ)** : un clic **sélectionne** le token et met le token en évidence (anneau ambre, la couleur du MJ) et ouvre, sous le cadre, un panneau MJ au liseré ambre « Maître
Aldric · Personnage » avec « Ouvrir la fiche » et « Retirer de la carte » (ce bouton demande la même confirmation que la liste « Sur la carte » : rien n'est retiré au premier clic) ; on **déplace** un token au
glisser, ou au clavier (token sélectionné : flèches, 1 %, avec Maj 5 % ; l'aide « Flèches : déplacer de 1 % (Maj : 5 %) » est affichée sous le cadre) ; la position s'enregistre au
relâchement (ou à la touche) ; hors du cadre elle est ramenée au bord. « Ajouter une fiche » ouvre une
fenêtre : un choix de **type** (les sept ; *depuis `kanevas-import`, la liste du produit, types activés d'abord, AD-102*), un champ de recherche (lancée par « Chercher » ou Entrée ; plus de 100 caractères : « 100 caractères au plus. »), la liste des fiches de ce type
(celles que le MJ lit : toutes), chacune avec « Ajouter » ; une fiche déjà sur la carte porte « Déjà
sur la carte » sans bouton. « Fermer » ferme la fenêtre. Le token apparaît au **centre** (50 %, 50 %), prêt à être déplacé.
« Changer le fond » (« Ajouter un fond » s'il n'y en a pas) ouvre le sélecteur : **choisir l'image
suffit**, elle part aussitôt et remplace l'ancienne.

*Graphe.* Le cadre est un schéma : un **nœud** par fiche (rond, première lettre, titre dessous, 24
caractères), une flèche par **lien** de la fiche d'où vient la relation vers la fiche visée, avec le
type de la relation écrit sur la flèche (lien de A vers B : « membre de »). La disposition est celle
du navigateur (AD-71) ; elle n'est pas modifiable. La zone cliquable d'un nœud fait au moins 44 px ; le
cadre prend la largeur que la page lui donne (jamais moins d'un nœud plus ses marges) et sa hauteur
grandit avec le nombre de lignes de nœuds ; chaque nœud occupe sa propre case (150 × 70 px) d'une
grille, donc deux nœuds ne se recouvrent jamais ; ce qui ne tient pas dans la largeur (téléphone)
défile, et la liste « Sur la carte » reste le chemin sûr au toucher. Joueur : toucher un nœud ouvre sa fiche. MJ : un
clic sélectionne le nœud, avec « Ouvrir la fiche » et « Retirer de la carte » (même mot, même confirmation que la liste « Sur la carte ») ; « Ajouter une fiche »
est la même fenêtre. Une relation ajoutée ou retirée sur une fiche se voit au rechargement de la
carte.

*Fenêtre « Ajouter une fiche »* — états propres, car c'est elle qui décide. **Vide** : un type sans
fiche, « Aucune fiche de ce type. » ; une recherche sans résultat, « Aucune fiche ne correspond. ».
**Chargement** : « Chargement… » à la place de la liste, le choix du type et la recherche déjà là.
**Erreur** : « Impossible de charger les fiches. » et « Réessayer », la fenêtre reste ouverte.
**Connexion perdue** : le bandeau ; « Ajouter » désactivé, la liste chargée reste. **Contenu long** :
cent fiches par page et « Charger la suite » (« Impossible de charger la suite. » en cas d'échec) ;
un titre de 80 caractères passe à la ligne. **Refus** : sans objet, la fenêtre n'existe que pour le
MJ hors mode Joueur.

Chaque action de E-10 et de E-11 porte une icône Lucide (règle de `docs/charte.md`, « Icônes ») : Renommer un crayon, Rendre visible / Cacher un œil / œil barré, Ajouter une fiche un plus, Fond une image, Retirer une corbeille, Ouvrir la fiche un lien externe.

*Sur la carte* (liste sous le cadre, toujours présente quand il y a des éléments) : une ligne par
token ou nœud, son titre en lien vers la fiche, son type ; pour le MJ, « Retirer de la carte »
(confirmation sur place : « Retirer « Maître Aldric » de cette carte ? La fiche reste. » avec
« Retirer de la carte » et « Annuler ») ; c'est aussi le chemin au clavier et au lecteur d'écran.
*Liens* (graphe) : une ligne « Maître Aldric — membre de → Les Lames Grises » par lien ; aucun lien :
« Aucun lien entre ces fiches. ».

*Visibilité et mode Joueur.* « Rendre visible » rend la carte lisible des Joueurs ; « Cacher aux
joueurs » la leur retire (au prochain chargement de leur côté : elle leur répond « Page
introuvable. »). Le **mode Joueur** (AD-39) montre au MJ la carte telle que la verrait un Joueur qui
n'est l'auteur d'aucune section : mêmes tokens, mêmes nœuds, mêmes liens, plus aucun geste de
modification. Sur une carte **non visible**, le MJ en mode Joueur voit « Les joueurs ne voient pas
cette carte : elle n'est pas visible. » avec « Quitter le mode Joueur » (un Joueur, lui, recevrait
« Page introuvable. »).

| Rôle | Voir | Gestes |
|---|---|---|
| MJ | la carte, tous ses éléments (toute fiche de l'univers), tous les liens | renommer ; rendre visible ou cacher ; fond ; ajouter une fiche ; déplacer (carte illustrée) ; retirer ; mode Joueur ; ouvrir une fiche |
| MJ en mode Joueur | comme un Joueur | ouvrir une fiche ; quitter le mode |
| Joueur | une carte visible ; les éléments dont il lit la fiche, les liens dont il lit la relation (AD-64) et les deux bouts ; **aucun compteur de ce qui manque** | ouvrir une fiche |
| Admin d'instance, ou compte sans rôle dans l'univers (Teo) | aucune | « Page introuvable. » |

Un geste qu'un rôle n'a pas est **absent** de l'écran (jamais grisé, sauf hors connexion). Par l'API,
un geste d'écriture d'un non-MJ est refusé **403** sur une carte qu'il lit ; sur une carte qu'il ne
lit pas, **404**. Un token dont la fiche devient illisible disparaît au chargement suivant, sans trace.

*Textes.* Carte illustrée sans token : MJ « Aucun token. Ajoutez une fiche pour la placer sur la
carte. » ; Joueur « Rien à voir sur cette carte pour l'instant. ». Graphe sans nœud : MJ « Aucune fiche.
Ajoutez des fiches pour voir leurs liens. » ; Joueur « Rien à voir sur ce graphe pour l'instant. ».
Fond : fichier non image ou vide « Erreur : ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP). »,
plus de 25 Mo « Erreur : l'image dépasse 25 Mo. ». 100 éléments : « Cette carte porte déjà 100
éléments. ». Fiche devenue inconnue à l'ajout : « Cette fiche n'existe plus. » (la liste de la fenêtre
se recharge). Échec d'un déplacement, d'un retrait, d'un ajout, d'un renommage, d'une visibilité, d'un
fond : « L'action n'a pas abouti. Réessayez. », et l'état d'avant revient (le token retourne à sa
place) ; une saisie en cours est conservée. Titre vide ou trop long : les textes d'E-10. Le fond qui
ne charge pas : dans le cadre « Le fond de la carte n'a pas pu être chargé. » avec « Réessayer » ;
les tokens ne sont pas posés (leurs positions n'ont de sens que sur le fond), la liste « Sur la carte »
reste. Hors connexion, le fond déjà chargé reste affiché.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes « Aucun token », « Aucune fiche », « Rien à voir… » ; « Aucun lien entre ces fiches. » pour un graphe sans lien | MJ : ajouter une fiche |
| chargement | « Chargement… » ; le cadre à 16/10 neutre jusqu'au chargement du fond (« Chargement… » dedans), les tokens posés quand le fond est là | — |
| erreur | « Impossible de charger cette page. » ; fond : le message du cadre ; échec d'une écriture : « L'action n'a pas abouti. Réessayez. » | « Réessayer » |
| connexion perdue | le bandeau ; renommer, visibilité, fond, « Ajouter une fiche », déplacer, retirer désactivés (carte illustrée : les tokens deviennent des liens vers la fiche, sans sélection ni glisser ; graphe : la sélection reste) ; la carte chargée reste | lire, ouvrir une fiche |
| refus | carte inconnue ou illisible, compte sans rôle ou Admin : « Page introuvable. » et « Mes univers » ; MJ en mode Joueur sur une carte non visible : sa propre phrase | « Mes univers », « Quitter le mode Joueur » |
| contenu long | un titre de 80 caractères passe à la ligne ; 100 éléments : titres de 24 caractères puis « … » (le titre entier dans la liste « Sur la carte », qui défile) ; une image très large ou très haute garde ses proportions et tient en largeur ; téléphone : le cadre prend toute la largeur, une seule colonne | — |

*Critères.*
- Étant donné la carte illustrée « La ville de Brume » avec un fond, où Antor place « Maître Aldric »
  et « Les Ombres de Fer » (faction dont Léa ne lit aucune section) puis la rend visible, quand Léa
  l'ouvre, alors elle voit le fond et le token d'Aldric, ni le token ni le titre de la faction, ni
  « Les Ombres de Fer » dans la liste « Sur la carte » ; quand elle touche le token d'Aldric, alors
  elle arrive sur sa fiche.
- Étant donné la même carte, quand Antor passe en mode Joueur, alors il voit exactement ce que voit
  Léa ; quand il la cache aux joueurs, alors Léa, au rechargement, voit « Page introuvable. » et la
  carte n'est plus dans sa liste.
- Étant donné Antor qui déplace le token d'Aldric puis recharge, alors il est à sa nouvelle place ;
  une panne pendant le déplacement le ramène à l'ancienne et affiche « L'action n'a pas abouti.
  Réessayez. ».
- Étant donné le graphe « Les factions » avec « Les Lames Grises », « Les Corbeaux » et « La
  Guilde » ; la relation « allié de » de la première vers la deuxième, portée par une section que
  Léa ne lit pas, et « rival de » de la première vers la troisième, portée par une section qu'elle lit :
  Antor voit les deux liens ; Léa, qui lit les trois fiches de ce graphe, voit seulement « rival de » ;
  si elle ne lisait pas « La Guilde », elle verrait deux nœuds et aucun lien.
- Étant donné un graphe où Antor a mis aussi « Les Ombres de Fer » (Léa n'en lit aucune section),
  alors Léa n'y voit ni son nœud ni ses liens, et aucune trace de leur absence.
- Étant donné le fond « plan.pdf » choisi sur une carte, alors le refus s'affiche et le fond d'avant
  reste ; l'adresse du fond d'une carte non visible répond 404 à Léa.
- Étant donné Léa sur une carte, quand elle force l'adresse d'une action de MJ, alors elle reçoit 403.

### E-3 — le bloc « Cartes visibles »

Sur la vue d'ensemble, un bloc **Cartes visibles** (le titre de la maquette `e03`), inscrit au registre des blocs de E-3 (un fichier dans
`frontend/src/ecrans/vue-ensemble/blocs/` que le registre trouve seul (rang après les blocs des campagnes et
des comptes-rendus) ; aucun bloc existant n'est modifié). Il liste, pour tous les rôles, les **cartes
visibles des joueurs** (cinq au plus, titre alphabétique) : le titre en lien vers E-11 et la forme ;
dessous « Toutes » vers E-10. Chaque carte est une vignette (le fond de la carte, ou le motif neutre
d'un graphe ou d'une carte sans fond) avec une icône carte, le titre et la forme. Le MJ voit donc ce que la table voit ; ses cartes « MJ seul »
se trouvent sur E-10.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucune carte visible des joueurs. » et « Toutes » ; Joueur : **pas de bloc** (ni titre ni compteur) | MJ : « Toutes » |
| chargement | le titre du bloc et « Chargement… » | — |
| erreur | « Impossible de charger les cartes. » | « Réessayer » |
| connexion perdue | le bandeau ; les cartes déjà chargées restent | ouvrir |
| refus | sans objet : le refus d'E-3 couvre le bloc (« Page introuvable. ») | — |
| contenu long | un titre tient sur une ligne, puis « … » ; au-delà de cinq cartes, cinq et « Toutes » | — |

| Rôle | Voir |
|---|---|
| MJ | le bloc, avec les seules cartes visibles des joueurs |
| Joueur | le bloc s'il y a au moins une carte visible, sinon aucun bloc |
| Admin d'instance, ou compte sans rôle | aucun : E-3 lui répond « Page introuvable. » |

*Critère.* Étant donné deux cartes visibles et une « MJ seul », alors le bloc de Léa en liste deux ;
celui d'Antor aussi.

### Clôture de `kanevas-cartes-graphes`

B-22 → E-10 (créer une carte illustrée avec son fond, ou un graphe) et E-11 (placer des tokens,
choisir les fiches d'un graphe) ; B-23 → « Rendre visible » et la lecture filtrée d'un joueur ;
B-12 (carte) → le mode Joueur de E-11. Atteint par P-3 étape 6 (placer le PNJ, mode Joueur, rendre
visible), P-6 étape 3 (la carte d'un joueur) et P-9 en entier (le graphe). Les écrans E-10 et E-11
et le bloc de E-3 livrent leurs six états (B-29), ci-dessus.

## Détail des écrans de `kanevas-import` (cadrage)

> Cadrage proposé le 2026-10-11 (`epic/kanevas-import`). Besoins B-32 à B-56, parcours P-10 à P-16,
> décisions AD-95 à AD-111. Les tranches détaillent leurs écrans dans ce cadre ; elles ne
> l'inventent pas. Écrans structurants, avec maquette finie : **E-9** (la fiche importée, moment fort
> de P-12), **E-18** (Accès par API, P-10 et P-11), **E-14 / E-15 « Types de fiche »** (P-13), **E-19** (Médiathèque, P-16). E-17 et
> l'arbre de E-8 sont décrits ici sans maquette : ils se construisent avec les composants de E-8
> (grille, recherche, pastilles). Les textes communs (chargement, erreur, connexion perdue, refus)
> sont ceux de `kanevas-premiere-fiche`.

### Le Markdown, partout où l'on écrit un texte long

Sections (E-9), scénarios (E-7), entrées d'un système (E-15), comptes-rendus (E-9) : le texte est du
Markdown (B-32, AD-95). **Ce qui se met en forme** : paragraphes (un saut de ligne simple reste un
saut de ligne, comme le texte brut d'avant), intertitres `#` à `####` (`#` et `##` au même niveau, rendus sous le titre de la
section, jamais au-dessus), gras, italique, barré, listes à puces et numérotées, citations, code,
filets, tableaux, liens web (`http`, `https`, `mailto` seulement ; ils s'ouvrent dans un nouvel
onglet), fichiers de la médiathèque (une image `![légende](fichier:…)`, un document `[nom](fichier:…)`, B-44), liens vers une fiche (`[[…]]`, B-33),
blocs MJ (`:::mj` … `:::`, B-34). **Ce qui reste du texte** : tout HTML écrit dans le contenu, une
image d'une autre adresse (le texte de l'image s'affiche à sa place), un lien d'un autre schéma.

**Selon le texte** (AD-97) : dans une **section** (et un compte-rendu), tout ce qui précède. Dans un
**scénario** (E-7), les liens `[[…]]` visent les fiches de l'univers de sa campagne, résolus sous les
mêmes droits (le lecteur d'un scénario est un MJ de cet univers) ; ils ne comptent pas dans
« Mentionnée dans » (un scénario n'est pas une fiche) ; pas de fichier ni de bloc MJ (un scénario ne
référence pas la médiathèque et est déjà au MJ seul). Dans une **entrée de système** (E-15), partagée entre les
univers rattachés : **pas de lien `[[…]]`** — `[[…]]` y reste du texte, tel qu'écrit, et l'éditeur n'a
ni « Lien vers une fiche » ni la liste ouverte par `[[` ; pas de fichier ni de bloc MJ non plus. Dans
un scénario comme dans une entrée de système, `![…](fichier:…)`, `[…](fichier:…)` et `:::mj` **ne sont pas interprétés** :
ils restent du texte, affiché tel qu'écrit (même règle que `[[…]]` dans une entrée de système) ; l'API
d'import ne les refuse pas.

**L'éditeur** (édition en place, charte « L'édition en place ») : le champ de texte garde la police
de lecture ; au-dessus, une barre d'outils discrète — « Gras », « Italique », « Lien vers une fiche »,
« Fichier », et pour un MJ « Bloc MJ » (entoure la sélection) — et la bascule « Écrire /
Aperçu ». Raccourcis : Ctrl/⌘+B, Ctrl/⌘+I, Ctrl/⌘+K (lien vers une fiche), Échap annule, Ctrl/⌘+Entrée
enregistre. Taper `[[` ouvre la liste de recherche de E-8 (`ListeRecherche`, tous types) au point
d'insertion ; choisir une fiche insère `[[<id>|<titre>]]`, Échap ferme la liste et laisse `[[`. Le
compteur dit « 12 480 / 100 000 ».

**Rendu** : un lien vers une fiche lisible est en `--accent-texte`, souligné fin, avec l'icône du type
au survol ; vers une fiche illisible : le texte, sans aucune marque ; **lien cassé** (MJ seul) : le
texte souligné en tirets `--danger`, infobulle « Lien cassé : cette fiche n'existe plus. » ; **lien en
attente** d'import (MJ seul) : souligné en tirets `--texte-3`, infobulle « Lien en attente : aucune
fiche n'a encore la clé « personnage:aldric ». ». Un **bloc MJ**, pour le MJ hors mode Joueur, prend
la matière de la section MJ seul (trame hachurée, filet ambre, pastille « MJ seul » `lock`) **dans** la
section, à sa place dans le texte ; en mode Joueur et pour tout autre lecteur, il n'existe pas — pas de
blanc, pas de filet, le paragraphe suivant suit le précédent. Un tableau large défile dans son cadre
au téléphone, jamais la page.

### Le Markdown — ce que `kanevas-import-markdown` construit (E-9, E-7, E-15, E-12)

Cette tranche livre le rendu et l'éditeur **sans** lien `[[…]]`, sans fichier et sans bloc MJ (leurs
tranches les ajoutent à la même barre et au même rendu). Maquette : `e09-fiche-importee.html`,
`#etat-edition` pour l'éditeur ; `e07-scenario.html`, `e15-systeme-de-jeu.html` et `e12-propositions.html`
pour l'emplacement du rendu (le contenu y devient mis en forme, la mise en page ne change pas).

- **Parcours** : lire, P-12 étape 2 (E-9, E-7, E-15, E-12) ; écrire et prévisualiser, P-14 étape 1 (E-9, E-7, E-15).
  Le texte d'un compte-rendu se lit rendu sur E-9 ; la fenêtre « Nouveau compte-rendu » de E-6 garde son
  champ simple dans cette tranche, avec le plafond de 100 000 (« Erreur : 100 000 caractères au plus. ») et
  sans barre ni aperçu ; son compteur et son erreur « Erreur : 100 000 caractères au plus. » existent déjà (maquette `e06`) : seul le
  seuil passe de 20 000 à 100 000 ; ses autres états sont ceux de E-6 et ne changent pas.
- **Maquettes** : `e09-fiche-importee.html` (`#etat-edition`, `#etat-apercu`) montre la barre **complète**
  de l'epic (avec « Lien vers une fiche », « Fichier », la liste ouverte par `[[`) ; cette tranche n'en
  construit que « Gras », « Italique » et la bascule, les autres boutons viennent avec leurs tranches. La
  bascule est un groupe de deux options (`role="radio"`, `aria-checked`) comme la maquette. Les maquettes de
  E-7, E-15 et E-12 gardent leur mise en page : l'éditeur y est le même, la bascule « Rendu / Source » de
  E-12 s'ajoute au-dessus des deux zones, à la façon de la bascule « Écrire / Aperçu ».
- **Rendu** : un seul composant montre le HTML que le serveur a rendu, partout (sections et
  comptes-rendus de E-9, scénario de E-7, entrées de E-15, zones de E-12). Les intertitres `#` et `##`
  s'affichent au niveau « intertitre » le plus haut, `###` et `####` plus bas : jamais au niveau du
  titre de la section. Un lien web s'ouvre dans un nouvel onglet. Tableau large : il défile dans son
  cadre. Contenu vide : « Rien d'écrit pour l'instant. » (déjà le texte d'aujourd'hui). Un contenu
  d'avant (texte brut) se lit comme avant : paragraphes et sauts de ligne.
- **Éditeur** (E-9, E-7, E-15) : le champ, au-dessus la
  barre « Gras » (`bold`), « Italique » (`italic`) et la bascule « Écrire / Aperçu » (deux boutons, l'un
  actif, `role="radio"`) ; sous le champ, le compteur « 12 480 / 100 000 ». Ctrl/⌘+B et Ctrl/⌘+I entourent
  la sélection (ou posent deux marques et placent le curseur entre elles), Ctrl/⌘+Entrée enregistre,
  Échap annule. « Aperçu » remplace le champ par le rendu de la même fonction que la lecture ; le texte
  saisi reste dans le champ et revient avec « Écrire ». Les boutons « Lien vers une fiche » et « Fichier » n'existent pas encore ;
  « Bloc MJ » est décrit plus bas (E-9, bloc MJ).
- **États de l'aperçu** : en cours, « Aperçu en cours… » (le champ reste, bascule désactivée) ; texte
  vide, « Rien à prévisualiser. » ; échec ou hors ligne, « L'aperçu n'a pas abouti. Réessayez. » avec
  « Réessayer », et le champ intact (message aussi d'une session expirée ou d'un refus du serveur : le texte saisi n'est pas perdu) ; plus de 100 000 caractères, pas d'appel, « Erreur : 100 000
  caractères au plus. » sous le champ. Au-delà de 100 000, le comportement de E-9 d'aujourd'hui
  (§ E-9, « contenu long ») tient avec le nouveau seuil.
- **Qui voit quoi** : la lecture ne montre que le rendu. Le champ d'édition reçoit la **source** :
  elle n'est envoyée qu'à qui peut écrire la section (le scénario, au MJ qui le lit). Un joueur, ou le MJ
  en mode Joueur, ne la reçoit pas ; la réponse de lecture de Léa ne contient pas le Markdown.
- **E-12** : au-dessus des zones « Actuel » et « Proposé », deux boutons « Rendu / Source » (« Rendu »
  par défaut) ; « Source » montre le Markdown brut des deux zones, côte à côte comme aujourd'hui. Le fil
  de conversation reste en texte. Après « Appliquer » ou « Abandonner », le choix « Rendu / Source » est
  conservé ; une proposition périmée garde ses deux zones lisibles dans le mode choisi.
- **Cas extrêmes** : une zone de E-12 garde sa hauteur de 15 lignes et défile ; un mot ou une adresse sans
  espace passe à la ligne sans élargir la page à 375 px ; une image d'une autre adresse
  (`![plan](https://…)`) se lit « plan » (son texte alternatif), sans image.
- **Rôles** :

  | | MJ | Joueur lecteur | Joueur qui écrit la section | MJ en mode Joueur |
  |---|---|---|---|---|
  | Lit le rendu | oui | oui | oui | oui |
  | Reçoit la source | oui | non (le champ n'est pas dans la réponse) | oui | comme le rôle qu'il imite |
  | Barre, aperçu, compteur | en édition | caché | en édition | comme le rôle qu'il imite |
  | E-7, E-12 | éditeur au MJ, rendu pour qui lit | écran absent (404, MJ seul) | écran absent | écran absent |
  | E-15 (système rattaché) | éditeur au MJ, rendu | rendu seul, ni source ni barre (champ absent) | sans objet | rendu seul |
- **Plafond** : 100 000 caractères pour une section, un compte-rendu, un scénario, une entrée de système et
  un contenu proposé ; au-delà le serveur répond 400 « Contenu trop long : 100 000 caractères au plus. ».

### Les liens `[[…]]` — ce que `kanevas-import-liens` construit

*Reconnu* (AD-116) : `[[<id>|<texte>]]` (l'identifiant est un entier ≥ 1) et `[[cle:<clé>|<texte>]]`
(une clé d'origine d'import), et à l'écriture seulement `[[<id>]]`. Le texte fait 1 à 200 caractères, sans
`]`, `|` ni saut de ligne ; une forme qui ne tient pas ces règles, ou qui se trouve dans un bloc de code
ou dans un code en ligne, reste du texte. `[[cle:…]]` s'accepte de l'import comme de l'éditeur (même
résolution). Un `[[<id>]]` écrit sans texte est **réécrit** par le service en `[[<id>|<titre courant>]]`
avant d'enregistrer, si l'auteur lit la fiche ; sinon l'écriture est refusée (400, code `lien_illisible`,
« Cette fiche n'existe pas ou vous ne pouvez pas la lire. »), le texte reste dans le champ. Un
`[[<id>|<texte>]]` dont la cible est absente ou illisible de l'auteur s'enregistre (le texte est celui de
l'auteur, rien ne fuit) ; il se lira comme un lien cassé ou comme du texte, selon le lecteur.

*Lecture* : le rendu d'un lien dépend du lecteur et se décide **au rendu, par la cible**, pas par la
table `liens` : cible lisible du lecteur → `<a class="lien-fiche" href="/univers/<u>/fiche/<id>"
data-type="<type>">` ; cible illisible → le texte seul, sans élément ni marque ; cible supprimée → pour le
MJ hors mode Joueur `<span class="lien-casse" tabindex="0">` et son infobulle, le texte seul pour tout
autre lecteur ; clé en attente → pour le MJ hors mode Joueur `<span class="lien-attente" tabindex="0">`
(infobulle « Lien en attente : aucune fiche n'a encore la clé « <clé> ». »), le texte seul pour tout autre
lecteur. En mode Joueur le MJ lit comme un joueur. Un lien dans un bloc MJ n'existe, comme le bloc, que
pour le MJ hors mode Joueur (le bloc est ôté avant le rendu, AD-98). Le rendu résout tous les liens d'un
texte en **une** requête (jamais une par lien). L'assistant reçoit `[texte](fiche:<id>)` pour une cible
lisible et `texte` sinon, jamais un identifiant illisible (AD-96).

*Écriture* : le service qui écrit le contenu d'une section (le point d'écriture unique de
`kanevas-import-secrets`) remplace, dans la même transaction, les lignes de `liens` de la section : une
par lien trouvé, avec `dans_bloc_mj` d'après la position du lien, jamais par expression régulière hors des
jetons du moteur Markdown. Les textes déjà enregistrés avant la tranche ne sont pas rejoués : un
`[[…]]` d'avant n'était pas une syntaxe, et la table se remplit à la première écriture de la section.

*Import* : `[[cle:<clé>|<texte>]]` dont la clé est connue de l'univers s'enregistre en `[[<id>|<texte>]]` ;
sinon il reste tel quel, ligne de `liens` « en attente » (`cible_cle`). La création de la fiche qui porte
la clé réécrit, **dans la même transaction**, les contenus qui l'attendent (`contenu`, `contenu_public`,
lignes de `liens`) sans toucher à `version`, à `version_importee` ni à `modifie_le` de la section. Un
rejeu compare le texte envoyé **après** y avoir résolu les clés connues : un lien déjà résolu rend
« inchangée » (AD-104). Le lot compte « liens et références en attente » à sa clôture (`en_attente`).

*Scénario* (E-7) : mêmes formes, résolues à la lecture dans l'univers de la campagne du scénario, sous les
droits du lecteur (un MJ de l'univers) ; une clé en attente se résout à la lecture par l'index des clés
d'origine ; aucune ligne de `liens`. L'éditeur d'un scénario a « Lien vers une fiche » et la liste ouverte
par `[[`. *Entrée de système* (E-15) : `[[…]]` reste du texte, sans bouton ni liste.

*La liste ouverte par `[[`* (et « Lien vers une fiche », Ctrl/⌘+K) : le composant `ListeRecherche`, appelé
sans `type` ; elle cherche par titre dans toutes les fiches que le compte lit
(`GET /api/univers/:id/fiches?q=`), 50 au plus, chaque ligne avec l'icône et le libellé du type.
Taper après `[[` filtre ; ↑ ↓ choisissent, Entrée insère `[[<id>|<titre>]]` et ferme la liste, Échap la
ferme et laisse `[[`. Vide de résultat : « Aucune fiche. ». Erreur : « Impossible de chercher. » et
« Réessayer » ; la saisie n'est pas perdue. Connexion perdue : la liste ne s'ouvre pas, le bandeau commun
parle.

*« Mentionnée dans »* (B-36, AD-100) : la route de la fiche rend `mentions` (50 premières) et `mentionsSuite`
(booléen) ; `GET /api/univers/:id/fiches/:fid/mentions?apres=<n>` rend les 50 suivantes. Une ligne par fiche
source : titre (lien vers elle), icône du type, et le pourquoi — « lien dans « Histoire » » (la section
qui porte le lien), le libellé de la relation (« Amiral de »), ou les deux séparés par « · » si la
même fiche cite de plusieurs façons. Une source compte si sa fiche est lisible **et** que la section qui
porte le lien (ou la relation) l'est, **et** que le lien n'est pas dans un bloc MJ pour un non-MJ ; une
fiche qui se cite elle-même ne s'affiche pas ; l'ordre est le titre puis l'identifiant. Jamais de
compteur de ce qui est caché ; `mentionsSuite` se calcule sur ce que le lecteur voit seulement.

*États* (B-29). **Liste ouverte par `[[`** : chargement — la ligne « Recherche… » sous la saisie (la liste précédente
s'efface) ; vide — « Aucune fiche. » ; erreur — « Impossible de chercher. » et « Réessayer » ; connexion perdue
— la liste ne s'ouvre pas, `[[` reste du texte, « Enregistrer » est désactivé et le texte en cours conservé ; refus — l'éditeur n'est offert qu'à qui écrit la section, il n'y a donc ni
bouton ni liste pour les autres (**caché**) ; contenu extrême — un titre de 120 caractères tient sur une ligne
tronquée par « … » (le titre entier en infobulle), plus de 50 résultats : les 50 premiers puis la ligne
« Affinez la recherche pour voir les autres. ». **Bloc « Mentionnée dans »** : la suite en cours — le bouton « Afficher
les N suivants » devient « Chargement… » désactivé ; échec — « Impossible de charger la suite. » et « Réessayer » ;
connexion perdue — le bouton est désactivé ; les 50 premières arrivent avec la fiche (pas d'état propre).
**Refus d'écriture** `lien_illisible` : le message, en `--danger`, sous le champ de l'éditeur (E-9 comme E-7), le
texte conservé, l'enregistrement non fait. **E-7** : mêmes états pour la liste (lignes « erreur » et « connexion perdue » du tableau de E-7) ; E-7 est un écran MJ
seul qui ne connaît pas le mode Joueur : un lien cassé ou en attente y est toujours marqué ; `lien_illisible` y est sans objet
(un MJ lit toutes les fiches de l'univers). *Maquette* : `e09-fiche-importee.html#etat-liens`.

*Qui fait quoi* (liens) :

| Rôle | Éditeur : `[[` et « Lien vers une fiche » | Lecture d'un lien | « Mentionnée dans » |
|---|---|---|---|
| MJ, hors mode Joueur | oui (E-9, E-7) | lien, cassé, en attente marqués | tout ce qu'il lit, blocs MJ compris |
| MJ en mode Joueur, sur E-9 | **caché** (aucun geste d'écriture en mode Joueur) | comme un Joueur | comme un Joueur |
| Joueur, sur E-7 | **caché** : « Page introuvable. », ni écran ni lien vers lui | — | — |
| Joueur, section qu'il écrit sans bloc MJ | oui | lien si la cible est lue ; sinon, cassé et en attente compris, le texte seul (**caché**, sans marque) | sources lisibles, hors blocs MJ ; le reste est **caché**, sans compteur |
| Joueur, section qu'il n'écrit pas, ou qui contient un bloc MJ (B-34) | **caché** : pas de « Modifier », donc ni bouton ni liste | idem | idem |
| Joueur qui tape à la main le lien d'une fiche qu'il ne lit pas | **refusé** : `lien_illisible` | — | — |
| Admin d'instance non membre | **caché** : « Page introuvable. » sur E-9 et E-7 | — | — |

*Critères* (liste et bloc).
- Étant donné Antor qui édite « Histoire » de « Port-Sel », quand il tape `[[` puis « ald », alors la liste montre
  « Maître Aldric » avec l'icône et le libellé de son type ; Entrée insère `[[<id>|Maître Aldric]]`, Échap ferme
  la liste en laissant `[[`.
- Étant donné la recherche qui échoue, quand Antor tape `[[`, alors « Impossible de chercher. » et « Réessayer »
  paraissent et son texte reste.
- Étant donné une recherche sans résultat, alors « Aucune fiche. ».
- Étant donné 60 fiches qui citent « Maître Aldric » lisibles de Léa, quand elle ouvre sa fiche, alors « Mentionnée dans »
  en montre 50 et « Afficher les 10 suivants » ; la touche les ajoute ; sans réseau, le bouton est désactivé.
- Étant donné « Anse-aux-Sels » dans « Essai Kanka », quand Antor la lit, alors « les contrebandiers du Repaire » est
  souligné en tirets `--texte-3` (« Lien en attente : aucune fiche n'a encore la clé « faction:repaire ». ») et « Capitaine
  Hesk » en tirets `--danger` ; Léa lit les deux en texte simple.
- Étant donné Antor qui a accordé l'écriture aux joueurs sur « Description » de « Port-Sel », et Léa qui y tape à la
  main `[[<id>]]` (l'identifiant d'une adresse de fiche) de « La Guilde des Brumes », quand elle enregistre, alors
  « Cette fiche n'existe pas ou vous ne pouvez pas la lire. » paraît sous le champ, son texte intact, la section inchangée.
- Étant donné une recherche lente, quand Antor tape `[[` puis « ald », alors « Recherche… » paraît sous la saisie jusqu'à la
  réponse ; hors connexion, `[[` reste du texte et le bandeau commun parle.
- Étant donné 60 fiches qui répondent à « a », alors la liste montre 50 lignes puis « Affinez la recherche pour voir les
  autres. » ; un titre de 120 caractères tient sur une ligne finissant par « … ».
- Étant donné Léa sur une section de « Port-Sel » qu'elle n'écrit pas, alors ni « Lien vers une fiche » ni liste n'existent
  pour elle ; sur une section qui contient un bloc MJ, pas de « Modifier ».
- Étant donné « Afficher les 10 suivants » dont la requête est lente, alors le bouton dit « Chargement… » désactivé ; si elle
  échoue, « Impossible de charger la suite. » et « Réessayer » ; sans réseau, le bouton est désactivé.
- Étant donné Antor dans le scénario « La Couronne brisée » et la recherche qui échoue, quand il tape `[[`, alors
  « Impossible de chercher. » et « Réessayer » ; hors connexion, `[[` y reste du texte, « Enregistrer » est désactivé et son
  texte conservé ; un lien cassé du scénario y est marqué.

### E-9 Fiche — ce que `kanevas-import` change

*Maquette finie* : `docs/maquettes/e09-fiche-importee.html` (« Port-Sel », états `#etat-fichier`, `#etat-joindre`, `#etat-sous-type`, `#etat-changer-type`, `#etat-joueur`,
`#etat-edition`, `#etat-supprimer`, `#etat-deplacer`).

**En-tête.** Fil d'Ariane : univers › type › ancêtres **lisibles** du plus haut au plus proche ›
fiche ; un ancêtre illisible est sauté sans marque (B-35) ; plus de trois ancêtres : le premier, « … »
(menu des autres), les deux derniers. **Largeur (AD-99, arbitrage du 2026-10-15)** : le titre de la fiche courante cède en dernier (les ancêtres rétrécissent d'abord, jusqu'à leur minimum) ; un maillon d'ancêtre garde au moins 8 caractères (largeur `8ch`) et s'ellipse par « … » au-delà, jamais en dessous ; aucun maillon ne recouvre un chevron. Au téléphone (≤ 480 px), dès qu'il y a deux ancêtres lisibles ou plus, tous passent dans le menu « … » (icône du type › « … » › titre) ; avec un seul, il s'ellipse comme dit, sauf pour un MJ sur une fiche (la bascule MJ / Joueur prend la largeur du fil) : il passe alors lui aussi dans « … ». Entre 481 et 760 px, les ancêtres restent visibles. « Poser » ou « Remplacer » l'illustration (MJ) ouvre les deux
chemins d'ajout (« Fichiers », ci-dessous), limités aux images ; « Retirer » ôte la référence, l'image reste dans la
médiathèque. Le badge du type porte le **sous-type** : « Lieu · Port » (B-52) ;
MJ, hors mode Joueur : un clic sur le sous-type l'édite en place, avec la liste des sous-types déjà
employés pour ce type dans l'univers, par ordre alphabétique (titre de la liste « Sous-types de lieu
déjà employés » ; complétion sans tenir compte de la casse ; aide « Entrée enregistre · Échap annule »
et « Champ vide : plus de sous-type » ; 1 à 60 caractères, au-delà « Erreur : 60 caractères au plus. ») ;
une fiche sans sous-type montre au MJ le libellé « Sous-type » à cet endroit, rien à un joueur. Sous le titre : « Aussi appelée Salport, Port-aux-Sels » (alias,
`--texte-2`) et les **étiquettes** en pastilles neutres (`tag`), chacune un lien vers E-17 filtrée.
MJ, hors mode Joueur : le titre s'édite en place (clic, Entrée enregistre) ; le menu « ⋯ » de l'en-tête
porte « Changer le type… », « Déplacer sous… », « Alias et étiquettes… », une ligne d'information
« Importée · clé lieu:port-sel · créée le 3 mars 2021 » (si la fiche a une clé d'origine, B-50) et,
séparé, « Supprimer la fiche… » en `--danger`.
*Dans la tranche `kanevas-import-fil`*, la ligne « Importée · clé … » est la seule entrée du menu : pour une
fiche sans clé d'origine, le menu « ⋯ » n'est pas affiché ; « créée le … » est la date de création de la
fiche (`creeLe` de l'import s'il l'a donnée, B-50, sinon la date de l'import). La clé d'origine est cachée à
tout autre rôle que le MJ (hors mode Joueur) : ni le menu, ni la réponse de lecture.

- *Changer le type* : une liste des types de la liste du produit, activés d'abord, puis « Autres
  types » ; pour « Personnage », le choix PJ / PNJ ; et le champ « Sous-type » (vidé au changement de
  type, puisqu'il est propre au type, avec les sous-types déjà employés pour le nouveau type). Le
  compte-rendu n'y figure pas ; un compte-rendu n'a pas cette entrée.
- *Déplacer sous…* : boîte « Déplacer « Port-Sel » sous… », champ « Chercher une fiche » et la liste de
  recherche (tous types, fiches que le MJ lit), plus « Aucun parent » ; pied : « Annuler » puis « Déplacer » (à droite au bureau, côte à côte sur toute la largeur, 40 px de haut, au téléphone) ;
  un descendant de la fiche est refusé : « Une fiche ne peut pas être rangée sous l'un de ses
  descendants. ».
- *Alias et étiquettes* : deux champs à pastilles (Entrée ajoute, × retire) ; une étiquette se
  complète sur celles de l'univers ; alias 1 à 120 caractères, 20 au plus ; étiquette 1 à 40
  caractères, 20 au plus par fiche.
- *Supprimer la fiche* : boîte de dialogue « Supprimer « Port-Sel » ? » qui compte ce qui part —
  « 3 sections ; 3 relations qui la visent ; 1 place sur une carte. Ses 2 fichiers restent dans la médiathèque. Ses 5 enfants
  remonteront sous « Les Sphères ». Les liens qui la visent deviendront des liens cassés. » — et
  « Supprimer la fiche » (`--danger`) / « Annuler ». Après : retour à la liste du type, toast « Fiche
  supprimée. ». Ces nombres ne sont montrés qu'au MJ, qui lit tout.

**Sections.** Rendu Markdown ci-dessus. « Modifier » n'apparaît pas pour un Joueur sur une section qui
contient un bloc MJ, même s'il en a l'écriture (B-34) ; s'il l'ouvre par une autre voie, le serveur
refuse : « Vous ne pouvez pas modifier cette section. ».

**Fichiers** (B-24, B-44, B-55, AD-111 ; décisions de Monsieur du 2026-10-11). Tout fichier de la fiche
vit dans la médiathèque et y est référencé. **Lecture** : un fichier (image insérée, fichier joint,
lien de fichier dans le texte) ou l'illustration se montre si le lecteur le voit ; sinon, dans une
section qu'il lit, un cadre neutre (`lock`, `--texte-3`) dit « Image réservée au MJ. » (avec la
légende s'il y en a une) ou « Fichier réservé au MJ. » pour un document ; dans un bloc MJ, rien.
L'illustration réservée au MJ d'une fiche qu'un joueur voit : la même mention dans l'en-tête, la
vignette de repli dans la grille de E-8 (sans mention). Fichier supprimé : « Fichier supprimé de la
médiathèque. » pour un MJ, rien pour un joueur. In player mode, the GM sees what a player sees, plus files they added themselves (third rule, AD-117).

**Deux chemins d'ajout** : le bouton « Fichier » (`paperclip`) de la barre d'outils, en édition, et
« Joindre un fichier » en pied du bloc Pièces jointes — présent hors édition pour qui écrit la section,
comme le dépôt d'avant (`kanevas-fichiers`) — ouvrent le même menu —
1. **« Ajouter depuis l'appareil »** (ou un glisser-déposer sur la section) : en **un seul geste**, le
   fichier entre dans la médiathèque (ajouté par le compte ; **visibilité selon l'endroit d'ajout** : dans
   un bloc MJ, ou dans une section que les joueurs ne lisent pas tous, « Réservé au MJ » — la ligne du
   fichier le dit par sa pastille « MJ seul » — ; ailleurs, « Visible des joueurs » ; une illustration :
   « Visible des joueurs » si la fiche a une section lue des joueurs) **et** s'intègre à la
   fiche — depuis la barre d'outils, une image s'insère dans le texte au point d'insertion
   (`![nom](fichier:<id>)`) et un document y met un lien (`[nom](fichier:<id>)`), each reference on **its own line** (a newline is added before and after when the insertion point touches text or a `:::` fence; after a table row, a blank line separates the reference from the table so it cannot become another row; it never sticks to a closing fence and therefore never falls into the GM block) ; depuis le bloc, le
   fichier est joint à la section ; depuis l'en-tête (« Poser » ou « Remplacer » l'illustration, MJ),
   une image devient l'illustration. Un échec n'ajoute rien à la médiathèque ni à la fiche.
2. **« Choisir dans la médiathèque »** : le sélecteur de E-19 (« Choisir un fichier »), filtré sur ce
   que le compte voit (et sur les images pour l'illustration) ; choisir intègre la référence de la même
   façon, sans rien ajouter à la médiathèque, **sans changer sa visibilité**.
Celui qui a ajouté un fichier le **voit toujours**, ici et dans E-19, même réservé au MJ (troisième règle
de lecture d'AD-111).
L'avertissement de B-55 s'affiche sous le champ, ou dans la boîte de l'illustration, tant que la
condition tient (un fichier réservé au MJ posé hors bloc MJ dans une section lue des joueurs, ou en
illustration d'une fiche que des joueurs voient) ; il n'empêche rien.

**Le bloc Pièces jointes** montre les fichiers joints à la section : images en vignettes, documents par
l'icône de leur type, leur nom et leur taille ; pour un MJ, la pastille « MJ seul » d'un fichier réservé.
Menu d'une ligne : « Retirer » ôte la référence, jamais le fichier de la médiathèque ; pour un MJ,
« Réserver au MJ » / « Rendre visible des joueurs » change la visibilité **du fichier** (même boîte que
E-19 s'il est lu ailleurs par des joueurs) ; « Ouvrir dans la médiathèque ». La case « secrète » de
`kanevas-fichiers` disparaît : c'est la visibilité du fichier. **100 fichiers joints** au plus par
section (« Cette section porte déjà 100 fichiers joints. » au MJ, « Cette section ne peut pas recevoir
d'autre fichier. » au joueur) ; les références dans le texte ne comptent pas.

**Pending file reference** (import, `fichiers_attente`, AD-111): a file key not yet known in
this universe. For a GM outside player mode, an inline image, an attachment row and the
illustration slot show the same dashed `--texte-3` tile with the text
« Fichier en attente d'import : « img:quais ». » (the key as sent). The inline image tile uses
14 px Inter with 12/16 px padding, like the attachment tile. A document link such as
`[tarifs](fichier:cle:doc:tarifs)` has a dashed `--texte-3` underline and that sentence as its
tooltip. Other readers, including a GM in player mode, see only the document link's text,
without a link, underline or tooltip; pending images, attachments and illustrations leave
no tile, gap or row. The server never sends them the key.
A pending attachment does not count towards the 100-file limit until resolved, cannot be
removed (no menu: it disappears when the file arrives) and appears in no media library list.
*States*: **loading** — nothing before the sheet arrives, so no flashing tile; **empty** — a
section whose only attachments are pending shows their tiles rather than « Aucun fichier
joint. »; **error** and **connection lost** — the tile is sheet text and follows the sheet's
states; **refusal** — hidden for non-GM readers; **extreme content** — a 200-character key is
shortened with « … », with the full key in a tooltip; 100 tiles scroll within their frame.
The pending illustration occupies a full header row. Its key stays on one line, shortened
when needed, with its closing quotation mark and period kept together. **When the file arrives**: an already open GM page does not update
itself; reloading replaces the tile with the file. **Beyond 100**: a `PUT /fiches` whose
section names more than 100 `fichiers` keys is refused (400 `invalide`, `champ: fichiers`,
counted as refused in the batch). If resolution would exceed 100 attachments, the extra
join stays pending and the batch warns « section « Notes » : 100 fichiers joints au plus,
« K » reste en attente ». In editing and « Aperçu », the source keeps the key as written
(`fichier:cle:K`): the preview shows the tile, the editor the source. The user-facing term is
« fichier en attente » (never « référence » on E-9; E-18 counts « liens et références en
attente » for the batch).

**Blocs de fiche** (après les sections, hors de toute section) :
- **Contient** (`folder-tree`) — les enfants lisibles, par type puis titre, chacun avec son icône ; 50
  puis « Afficher les N suivants » (N compté sur ce que le lecteur voit). Absent s'il n'y en a aucun.
- **Mentionnée dans** (`link-2`) — les fiches qui la citent et que le lecteur voit : titre, icône,
  et le pourquoi : « lien dans « Histoire » » ou le libellé de la relation (« Amiral de »). 50 puis la
  suite. Absent s'il n'y en a aucune (B-36). Jamais de compteur de ce qui est caché.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | fiche importée sans section : comme avant ; ni « Mentionnée dans » ; « Contient » seulement si elle a des enfants lisibles | MJ : ajouter une section |
| chargement | squelettes de l'en-tête et de deux sections ; la fiche et ses sections arrivent en une réponse, « Contient » dans une seconde (« Chargement… » sous son titre) | — |
| erreur | « Impossible de charger cette fiche. » ; image insérée qui ne se charge pas : « Image indisponible. » à sa place, sa légende dessous ; déplacement, changement de type, suppression qui échoue : « L'action n'a pas abouti. Réessayez. », rien n'a changé | « Réessayer » |
| connexion perdue | le bandeau ; « Modifier », le menu « ⋯ », l'édition du titre désactivés ; les liens restent suivables | lire |
| refus | fiche illisible : « Page introuvable. » ; un lien vers elle n'est que du texte ; supprimée pendant la lecture : « Page introuvable. » à l'action suivante ; Joueur : ni menu « ⋯ », ni édition du titre (**caché**) | « Mes univers » |
| contenu long | section de 100 000 caractères : rendue en entier, l'éditeur défile ; « Erreur : 100 000 caractères au plus. » au-delà ; tableau de 12 colonnes : défile dans son cadre ; 300 enfants : 50 puis la suite ; titre de 120 caractères et fil de 6 ancêtres : le fil se replie (« … ») | idem |

*Critères.*
- Étant donné « Port-Sel » dont la section « Histoire » (lue des joueurs) contient un bloc MJ « Le port
  est tenu par la Guilde des Brumes », quand Léa ouvre la fiche, alors elle lit « Histoire » sans
  aucun mot du bloc, sans espace ni marque à sa place.
- Étant donné la même fiche, quand Antor passe en mode Joueur, alors il voit exactement ce que voit
  Léa ; revenu en mode MJ, le bloc est hachuré d'ambre, pastille « MJ seul ».
- Étant donné un lien `[[…]]` de « Port-Sel » vers « La Guilde des Brumes » (fiche dont Léa ne lit
  rien), quand Léa lit « Port-Sel », alors « La Guilde des Brumes » est du texte simple, sans lien.
- Étant donné Léa auteur avec écriture d'une section qui contient un bloc MJ, quand elle ouvre la
  fiche, alors cette section n'a pas « Modifier ».
- Étant donné « Rapport secret de l'amirauté » (MJ seul) qui lie « Port-Sel », quand Léa ouvre
  « Port-Sel », alors « Mentionnée dans » ne nomme pas ce rapport ; Antor l'y voit.
- Étant donné « Port-Sel » sous « Les Sphères » (lieu illisible de Léa), sans autre ancêtre, quand
  Léa ouvre « Port-Sel », alors le fil est « Lame d'Ébène › Lieux › Port-Sel ».
- Étant donné « Port-Sel » sous « Les Sphères » (lieu illisible de Léa) sous « Le Grand Vide »
  (lisible), quand Léa ouvre « Port-Sel », alors le fil est « Lame d'Ébène › Lieux › Le Grand Vide ›
  Port-Sel ».
- Étant donné Antor qui déplace « Les Sphères » sous « Port-Sel », son enfant, alors il voit « Une
  fiche ne peut pas être rangée sous l'un de ses descendants. » et rien ne change.
- Étant donné Antor qui supprime « Port-Sel » (5 enfants, dont un illisible de Léa, parent « Les Sphères »), alors les 5
  enfants ont « Les Sphères » pour parent, l'adresse de « Port-Sel » répond « Page introuvable. », et
  un lien vers elle dans « Maître Aldric » est marqué « lien cassé » pour Antor et du texte pour Léa.
- Étant donné un contenu qui contient `<script>alert(1)</script>` et `<b>gras</b>`, quand la section
  s'affiche, alors ces balises s'affichent comme du texte, et aucun script ne s'exécute.

### Ce que `kanevas-import-tenir` construit (E-9 titre et suppression, E-14 « Supprimer l'univers »)

*Précisions de la tranche, sur le cadre ci-dessus (B-39, B-40, B-41, AD-105, AD-119) ; les maquettes sont
`e09-fiche-importee.html` (`#etat-supprimer`) et `e14-types-de-fiche.html` (`#etat-supprimer-univers`).*

*La maquette `#etat-supprimer` ne dessine que l'état nominal de la boîte et celle de l'en-tête que le titre au repos : les états ci-dessous (titre vidé ou trop long, toast, bilan en chargement ou en erreur) sont décrits ici, et ce texte fait foi.*

**Titre en place (E-9, MJ hors mode Joueur).** Un clic sur le titre le rend champ de saisie, texte
sélectionné ; Entrée enregistre, Échap annule, la perte de focus enregistre. 1 à 120 caractères après
rognage ; vide : « Erreur : le titre est obligatoire. » ; au-delà : « Erreur : 120 caractères au plus. » ; le
champ reste ouvert. Titre inchangé : rien n'est envoyé. Enregistré : toast « Fiche renommée. », le fil
d'Ariane des descendants et le badge de la liste suivent à la lecture suivante ; les liens `[[…]]` ne bougent pas
(ils visent l'identifiant, B-33). Échec : « L'action n'a pas abouti. Réessayez. » sous le titre, le champ reste ouvert avec la saisie (Échap rend l'ancien titre). Un
Joueur ou le mode Joueur : titre en texte, sans curseur d'édition.

**Suppression d'une fiche (E-9).** « Supprimer la fiche… » ouvre la boîte **après** avoir lu son bilan
(`GET …/fiches/:fid/suppression`) : « Chargement… » dans la boîte, bouton « Supprimer la fiche » inactif tant que
le bilan n'est pas là. Le texte est composé des seuls postes non nuls, au singulier ou au pluriel
(« 1 section », « 1 relation qui la vise », « 1 place sur une carte », « Son fichier reste dans la
médiathèque », « Son enfant remontera sous… ») ; sans parent, « … remonteront à la racine de la liste du
type » ; sans enfant, la phrase manque ; la fiche seule : « Cette fiche ne porte rien d'autre. ».
Les nombres sont ceux du MJ, qui lit tout. Erreur du bilan : « Impossible de charger le détail. » et
« Réessayer » ; échec de la suppression : le message dans la boîte, qui reste ouverte, la fiche n'a pas
bougé. Succès : retour à la liste du type, toast « Fiche supprimée. ». Une fiche déjà supprimée par ailleurs :
« Page introuvable. » à l'ouverture de la boîte. Un compte-rendu se supprime de même (retour à E-13).

**Import (E-18).** Un `DELETE` d'import ajoute au bilan du lot le compteur « Fiches : 1 supprimée »
(« supprimées » au pluriel), sans refus possible ; clé inconnue : rien n'est compté.

**Supprimer l'univers (E-14, tout MJ).** La boîte suit le texte ci-dessus ; le champ compare le nom saisi au
nom de l'univers à la lettre près, casse et espaces compris (l'espace final saisi par erreur laisse le bouton
inactif) ; le serveur recompare (`nom`) et refuse un nom différent (400 `nom_different`, « Le nom ne correspond
pas à celui de l'univers. » ; l'écran affiche « Le nom ne correspond pas. »). Pendant la suppression : bouton « Suppression… » inactif. Après : E-1, toast « Univers supprimé. » ;
les autres membres, à leur prochaine action, voient « Page introuvable. ». Échec de la suppression : « L'action n'a pas
abouti. Réessayez. » dans la boîte, qui reste ouverte, l'univers est intact ; une suppression longue garde
« Suppression… » tant que le serveur n'a pas répondu (pas de délai au-delà duquel la boîte se ferme).

**États propres à la tranche** (en plus du tableau de E-9 et de E-14).

| Écran | État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|---|
| E-9, boîte | chargement du bilan | « Chargement… », « Supprimer la fiche » inactif | « Annuler » |
| E-9, boîte | erreur du bilan | « Impossible de charger le détail. » | « Réessayer », « Annuler » |
| E-9, boîte | échec de la suppression | « L'action n'a pas abouti. Réessayez. » dans la boîte, la fiche n'a pas bougé | « Supprimer la fiche », « Annuler » |
| E-9, boîte | connexion perdue | le bandeau ; « Supprimer la fiche » inactif, le bilan chargé reste | « Annuler » |
| E-9, titre | échec de l'enregistrement | « L'action n'a pas abouti. Réessayez. » sous le titre, le champ reste ouvert avec la saisie | Entrée pour réessayer, Échap |
| E-9, titre | connexion perdue pendant l'édition | le bandeau ; Entrée n'envoie rien, la saisie est gardée | Échap |
| E-14, boîte | connexion perdue | le bandeau ; « Supprimer l'univers » inactif | « Annuler » |

Un compte-rendu s'appelle « fiche » dans ces textes (« Supprimer la fiche… ») : c'est une fiche (B-40), et sa boîte
compte ses sections, ses propositions de l'assistant incluses ; retour à E-13 au lieu de la liste du type.
Les chemins d'échec de P-14 et de P-10 renvoient à ce tableau.
### Le bloc MJ — ce que `kanevas-import-secrets` construit (E-9, E-12, import)

Cette tranche livre le bloc `:::mj` (B-34, AD-98, AD-114) sur le rendu et l'éditeur que
`kanevas-import-markdown` pose. Elle ne livre ni lien `[[…]]` dans un bloc (`kanevas-import-liens`),
ni fichier dans un bloc (`kanevas-import-mediatheque`), ni la recherche tous types
(`kanevas-import-recherche`) ; la recherche **d'un type** (E-8) et celle de l'assistant (`chercher`) lui
sont fermées dès maintenant. Maquette : `e09-fiche-importee.html` (« Port-Sel », « Histoire » : le bloc
`.bloc-mj`, le bouton `.outil-mj` de la barre, l'état `#etat-joueur`) ; aucun écran nouveau.

- **Parcours** : lire, P-12 étapes 3 et 6 ; chercher dans un type, P-6 étapes 1-2 (la recherche tous types, P-12 étape 4, est à `kanevas-import-recherche`) ; écrire, P-14 étape 1 (« Bloc MJ ») ; vérifier en mode Joueur,
  P-10 étape 6 ; importer un contenu qui porte `:::mj`, P-10 étape 4.
- **La syntaxe** : une ligne `:::mj`, des lignes de texte, une ligne `:::`. Le MJ la tape ou la pose par
  le bouton. Tout ce que le bloc couvre est secret, **quelle que soit la forme** : paragraphes, liste,
  tableau, citation. Un bloc ne s'ouvre pas dans un bloc de code (` ``` `) : là, `:::mj` reste du texte, et
  n'est donc pas un secret. Un bloc **jamais fermé** couvre le texte jusqu'à la fin de la section, même s'il est ouvert dans une liste ou une citation
  (le doute joue contre l'affichage, jamais contre le secret). Un bloc dans un bloc : le plus extérieur
  gouverne : chaque `:::mj` rencontré dans un bloc ouvre un bloc imbriqué, et le bloc extérieur ne finit qu'à la ligne `:::`
  qui équilibre les ouvertures (une ligne `:::` dans un bloc de code d'un bloc MJ le ferme, comme à l'écran) ; tout ce qu'il couvre est retiré. `:::MJ` (autre casse), `::: mj` (espace), `::::mj` (quatre deux-points)
  et `:::mj` suivi de mots ne sont pas des blocs : du texte, visible de tous — une règle de plus que le MJ n'a pas à apprendre.
- **« Bloc MJ » button** (GM only, `lock`, after the existing editor toolbar buttons; « Fichier » is added by `kanevas-import-mediatheque`,
  avant la bascule « Écrire / Aperçu » ; libellé « Bloc MJ » visible sur ordinateur, l'icône seule de 36 px sous le
  seuil « téléphone » de la maquette (`@media` de `e09-fiche-importee.html`), sans infobulle au toucher : le libellé accessible la remplace ; infobulle « Bloc MJ · entoure la sélection », libellé accessible « Bloc MJ ») : avec une sélection, il l'entoure d'une ligne `:::mj` avant et d'une
  ligne `:::` après (en ajoutant les sauts de ligne qui manquent, pour que les deux lignes soient seules) ;
  sans sélection, il pose les deux lignes à la suite l'une de l'autre, une ligne vide entre, le curseur sur
  la ligne vide. Il n'a pas de raccourci clavier. Il ne retire pas un bloc : on efface ses deux lignes.
  Un joueur qui écrit la section, ou le MJ en mode Joueur, ne le voit pas.
- **Aperçu** (« Écrire / Aperçu ») : ses états sont ceux de `kanevas-import-markdown` — « Aperçu en cours… »,
  « Rien à prévisualiser. », « L'aperçu n'a pas abouti. Réessayez. » avec « Réessayer », « Erreur : 100 000 caractères au plus. » — ;
  l'aperçu d'un scénario (E-7) ou d'une entrée de système (E-15) laisse `:::mj` en texte comme leur lecture (seule l'édition d'une
  section de E-9 demande la nature « section » avec son univers et son mode, AD-114) ; un `nature: 'section'` sans `univers_id` entier est refusé (400), un univers inconnu ou dont le compte n'est pas membre répond 404 comme toute lecture ; un membre non MJ reçoit un aperçu sans bloc. Pour le MJ, le bloc paraît comme à la lecture, hachuré ; pour qui n'est
  pas MJ, ou hors d'un univers, il n'existe pas (l'aperçu applique la même vue que la lecture, AD-114).
- **Cas extrêmes** : un bloc de 100 000 caractères défile avec la section ; un tableau large dans un bloc
  défile dans le cadre du bloc, jamais la page à 375 px ; plusieurs blocs dans une section sont autant de cadres, séparés par
  le texte public ; un bloc jamais fermé est hachuré **jusqu'à la fin** de la section (le MJ voit ce que le public perd) ; le
  bloc vide (`:::mj` puis `:::`) se lit comme un cadre sans texte.
- **Lecture** : pour un MJ hors mode Joueur, le bloc prend la matière de la section « MJ seul » (trame
  hachurée d'ambre, filet, pastille « MJ seul » `lock`, libellé accessible « Bloc MJ seul »), à sa place dans le
  texte. Pour tout autre lecteur et pour le MJ en mode Joueur, le bloc n'existe pas : ni blanc, ni filet, ni
  pastille, le paragraphe suivant suit le précédent ; la réponse de lecture ne contient pas un mot du bloc.
  Une section dont tout le texte est dans un bloc se lit, pour un non-MJ, « Rien d'écrit pour l'instant. ».
- **Écrire une section qui contient un bloc** : le MJ seul (AD-98). Pour un joueur qui l'écrit par
  son audience, ou pour le MJ en mode Joueur qui imite un tel joueur, « Modifier » n'apparaît pas ; s'il y
  parvient par une autre voie (l'API de session, `modifier_section`, `ajouter_a_section`), le serveur répond 403,
  « Vous ne pouvez pas modifier cette section. », et rien n'est écrit. L'absence de « Modifier » dit à une joueuse
  qui écrit la section qu'elle ne peut pas la modifier, jamais pourquoi : aucun message ne nomme le bloc, et c'est
  la seule trace d'un bloc que ce choix laisse (acceptée : elle ne livre aucun mot du secret). Un joueur qui écrit un contenu qui
  **contient** un bloc (il a tapé `:::mj` dans une section qui n'en avait pas) reçoit 400, « Un bloc MJ ne peut être
  écrit que par un MJ. », sous le champ, texte conservé ; il en va de même du texte d'un compte-rendu qu'il crée (E-6),
  dont la fenêtre montre ce message sous le champ comme ses autres refus. En mode Joueur, le MJ n'a pas « Modifier »
  (le mode est une vue de lecture, il imite un joueur qui ne peut pas écrire cette section) ; ce que l'API
  lui accepte ne change pas, le mode ne restreint que des lectures (AD-39).
- **L'assistant** (E-12) : `lire_fiche` et `lire_section` rendent, pour un compte joueur, le Markdown
  **public** (sans bloc) ; pour un compte MJ, la source entière — son catalogue reste celui du MJ même
  quand il est en mode Joueur à l'écran (AD-74). `modifier_section` et `ajouter_a_section` d'un joueur sont refusés
  sur une section à bloc (« Vous ne pouvez pas modifier cette section. », sans événement) et sur un contenu qui
  contient un bloc (« Un bloc MJ ne peut être écrit que par un MJ. »). `modifiable` vaut faux pour une telle
  section. Un MJ qui écrit une section par l'assistant peut y poser un bloc.
- **Le texte d'un scénario (E-7) ou d'une entrée de système (E-15)** : `:::mj` n'y est pas interprété, il
  reste du texte tel qu'écrit (docs/ecrans.md, § « Le Markdown, partout où l'on écrit un texte long ») ; le
  rendu du bloc est réservé aux sections et aux comptes-rendus, et un scénario ou une entrée n'a pas de `contenu_public`.
- **La recherche** (le champ de recherche d'un type de E-8, B-11, et `chercher` ; la recherche tous types de
  P-12 étape 4 vient avec `kanevas-import-recherche` sur la même règle) : un non-MJ, ou un MJ en mode Joueur, ne cherche que dans les titres
  et le texte **public** des sections ; un mot qui n'est que dans un bloc ne fait pas trouver la fiche. Un
  MJ hors mode Joueur cherche dans tout le texte.
- **L'import** : `PUT /fiches/:cle` accepte `:::mj` dans le `contenu` d'une section ; le contenu public
  est calculé comme pour une écriture d'écran, dans la même transaction. Le jeton est celui d'un MJ : la règle
  « seul un MJ écrit un bloc » ne le gêne pas. Un contenu rejoué à l'identique reste `inchangee`.
- **États** : ceux de E-9 (chargement, vide, erreur, connexion perdue, refus, contenu long). Le refus d'une
  écriture est le message ci-dessus, sous le champ, texte conservé ; la section d'un joueur qui contient un bloc
  est lisible sans « Modifier » (**caché**, pas grisé).
- **Rôles** :

  | | MJ | Joueur qui lit | Joueur qui écrit la section | MJ en mode Joueur |
  |---|---|---|---|---|
  | Voit le bloc | oui, hachuré | rien | rien | rien |
  | « Bloc MJ » dans la barre | oui | sans objet (pas d'édition) | **caché** | **caché** |
  | Écrit une section à bloc | oui | non | non (« Modifier » **caché**, 403) | par l'API oui ; à l'écran « Modifier » **caché** |
  | Écrit un contenu qui contient un bloc (section, texte d'un compte-rendu créé en E-6) | oui | non | non (**refusé** : 400, message sous le champ) | par l'API oui |
  | Trouve une fiche par un mot du bloc | oui | **rien** (la fiche n'est pas un résultat) | **rien** | **rien** |
  | L'assistant lui rend le bloc | oui | **rien** (le public) | **rien** (le public) | oui (catalogue du MJ) |

*Critères.*
- Étant donné « Port-Sel » dont « Histoire » (lue des joueurs) contient un bloc MJ de trois paragraphes, quand
  Léa la lit, alors le premier et le dernier paragraphe du texte se suivent sans blanc supplémentaire, et la
  réponse du serveur ne contient aucun mot du bloc.
- Étant donné un bloc dans une liste à puces, un bloc dans une citation et un bloc jamais fermé en fin de
  texte, quand Léa lit, alors rien de ce qu'ils couvrent ne paraît.
- Étant donné `:::mj` écrit dans un bloc de code, quand Léa lit, alors il se lit comme du texte.
- Étant donné une section dont tout le texte est un bloc, quand Léa la lit, alors elle lit « Rien d'écrit pour
  l'instant. » ; Antor y voit le bloc.
- Étant donné un scénario ou une entrée de système dont le texte porte `:::mj … :::`, quand il se lit, alors
  les trois lignes se lisent comme du texte, sans cadre.
- Étant donné un compte-rendu dont le texte porte un bloc, écrit par Antor, quand Léa le lit sur E-9, alors elle
  n'en lit rien du bloc et n'a pas « Modifier » sur ce texte.
- Étant donné Léa qui crée un compte-rendu dont le texte porte `:::mj … :::`, quand elle l'envoie, alors la
  fenêtre dit « Un bloc MJ ne peut être écrit que par un MJ. » et rien n'est créé.
- Étant donné Léa qui écrit une section qu'elle peut écrire et qui tape `:::mj … :::` dans son texte, quand
  elle enregistre, alors elle lit « Un bloc MJ ne peut être écrit que par un MJ. » et son texte est conservé.
- Étant donné la même Léa et une section où Antor a posé un bloc, quand elle envoie une écriture à
  l'API, alors la réponse est 403 et la section est inchangée ; l'assistant de Léa, qui tente
  `modifier_section`, reçoit « Vous ne pouvez pas modifier cette section. » et aucun événement n'est émis.
- Étant donné un mot qui n'est que dans un bloc de « Port-Sel », quand Léa le cherche dans « Lieux », alors
  « Port-Sel » n'est pas rendue ; Antor la trouve ; Antor en mode Joueur ne la trouve pas.
- Étant donné Antor sur « Histoire » en édition, quand il sélectionne un paragraphe et touche « Bloc MJ »,
  alors le paragraphe est entre `:::mj` et `:::` ; « Aperçu » le montre hachuré ; Léa ne voit rien après « Enregistrer ».
- Étant donné un import de `contenu` à bloc MJ, rejoué à l'identique, alors la réponse dit `inchangee`
  la seconde fois et Léa ne lit rien du bloc.

### E-19 Médiathèque

*Maquette finie* : `docs/maquettes/e19-mediatheque.html` (états `#etat-joueur`, `#etat-image`,
`#etat-document`, `#etat-documents`, `#etat-supprimer`, `#etat-reserver`, `#etat-choisir`,
`#etat-averti`, `#etat-vide`, `#etat-perdue`). The drop overlay, errors, upload progress, « Afficher les N autres »
and the empty picker are not drawn: **this document takes precedence over the mockup**. Decisions
of 2026-10-11 (B-53 to B-56, AD-111): all universe files, images and documents.

Atteint (adresse `/univers/<id>/mediatheque`) par « Médiathèque » (`images`) dans la barre de l'univers, sous « Cartes », pour tout membre.
En tête : le titre, « 1140 fichiers » (ceux que le lecteur voit) et, pour un MJ, « Ajouter des
fichiers » (plusieurs à la fois, ou un glisser-déposer sur la page : voile « Déposez les fichiers pour
les ajouter. »). Une bascule segmentée **Tout · Images · Documents** ; une rangée de filtres : la
recherche par nom (« Chercher par nom ») ; pour un MJ, « Visibilité » (Toutes, Visibles des joueurs,
Réservées au MJ) ; « Usage » (Tous, Utilisés, Non utilisés — calculé sur les usages que le lecteur peut lire : pour un joueur, « Non utilisés » veut dire « utilisé nulle part où il lit », jamais « utilisé dans une fiche fermée » ; D1) ; l'ordre (Plus récents, Nom). Une
**grille** : une image en vignette (cadrage `cover`, chargement à l'approche) ; un **document** en
tuile de même taille — l'icône de son type (`file-text` PDF, `file-spreadsheet` tableur, `file-archive`
archive, `file` sinon), l'extension en pastille, la taille (« 2,4 Mo ») ; le nom dessous ; pour un MJ,
la pastille « MJ seul » (`lock`) sur un fichier réservé. 100 puis « Charger la suite ».

Un clic ouvre le **panneau du fichier** (à droite au bureau, plein écran au téléphone) : l'image en
grand, ou pour un document sa grande icône, son type (« Document PDF », « Tableur XLSX », « Archive
ZIP », « Document ODT » : la nature et l'extension) and, for documents only, « Télécharger » (images have no such button) ; le nom (MJ : éditable en
place, 1 à 200 caractères) ; la **visibilité** en bascule segmentée « Visible des joueurs » /
« Réservé au MJ » (MJ ; un joueur ne voit pas ce réglage) ; type, taille, « ajouté par lea le 12 oct.
2026 », la clé d'origine (MJ, si importé) ; **Utilisé dans** — les usages **que le lecteur peut lire** : pour chaque fiche qu'il voit, l'illustration (si la fiche lui est visible) et les seules sections qu'il lit, avec leur titre (« Histoire » (dans le texte), « Pièces jointes de Description ») et un lien ; pour un non-MJ (E-19 n'a pas de mode Joueur), jamais un usage dans une section qu'il ne lit pas ni dans un bloc MJ — un fichier dont aucun usage ne lui est lisible n'a pas de bloc « Utilisé dans » (D1) — ; pour un MJ « Supprimer le fichier » (`--danger`). Aucun aperçu intégré d'un PDF (AD-66).

- *Réserver au MJ* un fichier lu des joueurs ailleurs : boîte « Réserver « plan-du-repaire.png » au
  MJ ? Les joueurs ne le verront plus dans : Les Docks — « Histoire » ; Port-Sel — « Description »
  (jointe). » ; « Réserver au MJ » / « Annuler », puis le toast « Fichier réservé au MJ. ». Sans tel
  usage : pas de boîte, le même toast. Rendre visible, renommer : sans toast. Nom vide : « Erreur : le
  nom est obligatoire. » ; au-delà de 200 : « Erreur : 200 caractères au plus. ». « Utilisé dans »
  n'apparaît pas pour un fichier qu'aucune fiche visible du lecteur n'utilise.
- *Delete*: dialog « Supprimer « Carte des Sphères » ? Elle est utilisée dans 3 fiches : Port-Sel
  (illustration), Val-Fortin (« Description »), Maître Aldric (pièces jointes de « Apparence »). Elle
  disparaîtra de ces fiches. » (« Il est utilisé… Il disparaîtra… » for a document); without usages:
  « Supprimer « Carte des Sphères » ? »; « Supprimer le fichier » (`--danger`) / « Annuler »; toast
  « Fichier supprimé. ».

**The picker** (« Choisir dans la médiathèque », from E-9): the same grid in a « Choisir un fichier »
dialog, with « Ajouter depuis l'appareil » at the top (first path, B-55), filtered to readable files
and to « Images » when setting an illustration. Choosing inserts the reference (E-9, « Fichiers »);
the B-55 warning follows below the field. Picker states: *empty* — « Aucune image à choisir. »
(illustration) or « Aucun fichier à choisir. » (player with no readable files), with « Ajouter depuis
l'appareil » for users allowed to add; *error* — « Impossible de charger la médiathèque. » with
« Réessayer »; a failed device upload shows « « notes.txt » : l'envoi n'a pas abouti. » inside the
dialog, which stays open; *offline* — banner, « Ajouter depuis l'appareil » disabled, loaded grid
still selectable; file deleted or no longer readable between opening and choosing: « Ce fichier
n'existe plus. » and reload the grid.

**Long upload** (E-19, « Ajouter des fichiers » or drag and drop): one row per uploading file,
« plan.png — Envoi… 42 % » (`role="status"`) with « Annuler »; cancellation writes nothing. The
grid keeps its place; the file joins it when its upload completes.

**Assistant-added file** (B-25, amended AD-44): a generated image enters the media library like
any upload, attributed to the requesting GM's account, with visibility determined by where it is
added (illustration: « Visible des joueurs » if the sheet has a section readable by players).
The generating assistant tool (`generer_image`, `kanevas-images`) calls that same add path, joining the image to the section.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucun fichier pour l'instant. Ajoutez-en, ou posez-en un dans une fiche. » et « Ajouter des fichiers » ; joueur : « Aucun fichier à voir pour l'instant. » ; un filtre sans résultat : « Aucun fichier ne correspond. » | MJ : ajouter |
| chargement | tuiles en squelette ; une vignette qui charge garde son cadre | — |
| Error | « Impossible de charger la médiathèque. »; failed thumbnail or preview: « Image indisponible. » (icon and text only, no button); failed download: « L'action n'a pas abouti. Réessayez. »; an empty file in a multiple upload: « « notes.txt » est vide. » below the grid, other files are added; interrupted upload: « L'envoi n'a pas abouti. » with « Réessayer » and « Abandonner » (E-9 calls the latter « Ignorer »); failed deletion or change: « L'action n'a pas abouti. Réessayez. », nothing changed | « Réessayer » |
| connexion perdue | le bandeau ; « Ajouter des fichiers », la bascule de visibilité, « Supprimer » désactivés | regarder ce qui est chargé |
| Refused | A GM-only file the player did not add does not exist for them (absent, direct address: « Page introuvable. »); players have no visibility settings, deletion or add action on E-19 (**hidden**; they add through a writable section on E-9); role removed while viewing: « Vous ne pouvez plus modifier ce fichier. »; instance admin without a universe role forcing the address: « Page introuvable. » | « Mes univers » |
| contenu long | 1 140 fichiers : 100 puis la suite ; nom de 200 caractères tronqué par « … » avec infobulle ; un fichier utilisé dans 40 fiches : 10 puis « Afficher les 30 autres » ; image de 30 Mo : l'aperçu se charge, rien n'est redimensionné (AD-93) ; document de 300 Mo : la tuile et « Télécharger », rien n'est chargé d'avance | idem |

*Critères.*
- Étant donné « plan-du-repaire.png » réservée au MJ et insérée dans « Histoire » des « Docks », lue
  des joueurs, quand Léa lit « Les Docks », alors elle voit « Image réservée au MJ. » à sa place ; et
  sa médiathèque ne montre pas ce fichier.
- Étant donné le même fichier inséré dans un bloc MJ, quand Léa lit la section, alors rien ne paraît.
- Étant donné Antor qui, en modifiant une section lue des joueurs, choisit dans la médiathèque un
  fichier réservé au MJ, alors l'éditeur affiche l'avertissement de B-55 ; dans une section MJ seul,
  non.
- Étant donné Teo ajouté en Joueur de « Lame d'Ébène » par Antor, et Léa, auteur avec écriture de
  « Notes de la table » (que les autres joueurs ne lisent pas),
  quand elle ajoute « carnet.pdf » depuis son appareil, alors le document est joint à la section **et**
  figure dans la médiathèque, « Réservé au MJ », « ajouté par lea » ; Léa le voit dans la section et
  dans sa médiathèque, Teo ne le voit nulle part.
- Étant donné Antor qui ajoute « plan.png » depuis un bloc MJ de « Port-Sel », alors le fichier entre
  « Réservé au MJ » ; ajouté depuis « Description », lue des joueurs, il entre « Visible des joueurs » ;
  choisi ensuite dans la médiathèque pour un bloc MJ, sa visibilité ne change pas.
- Given « Carte des Sphères » used by three sheets, when Antor deletes it, the dialog lists all
  three sheets. Afterwards, Antor sees « Fichier supprimé de la médiathèque. » in its place in
  « Val-Fortin »; Léa sees nothing.
- Étant donné un fichier visible des joueurs utilisé par « Port-Sel » (lisible de Léa) et par « Rapport
  secret de l'amirauté » (MJ seul), quand Léa ouvre le fichier, alors « Utilisé dans » ne nomme que
  « Port-Sel ».
- Étant donné un fichier visible des joueurs joint à « Vérité — MJ seul » de « Maître Aldric » (fiche
  que Léa voit par « Apparence ») et inséré dans un bloc MJ de « Port-Sel », quand Léa ouvre le fichier,
  alors il n'a pas de bloc « Utilisé dans », et il paraît sous le filtre « Non utilisés ».
- Étant donné la bascule sur « Documents », alors seuls les documents paraissent, chacun avec l'icône
  de son type, son nom et sa taille.

### E-8 Liste de fiches — l'arbre

Une bascule « Grille / Arbre » (icônes `layout-grid`, `list-tree`) à côté de la recherche ; le choix est
mémorisé par type dans le navigateur. **L'arbre** : les fiches du type que le compte lit, dont le
parent est absent, illisible ou d'un autre type, par titre ; une fiche dont le parent lisible est d'un
autre type porte « dans La Guilde des Brumes » (`--texte-3`, lien). Chaque nœud qui a des enfants **du même
type** lisibles a un chevron ; déplier charge ses enfants (100, puis « Charger la suite »). Pas de
compteur d'enfants (il ne compterait que le lisible, mais n'aide en rien). La recherche dans le type
rend la grille, jamais l'arbre. Les types de la barre sont ceux qui sont activés ; l'adresse d'un type
désactivé ouvre quand même sa liste (on y arrive par une fiche), avec la ligne « Ce type est désactivé
dans cet univers. » et sans bouton de création. Le choix du type à la création : les types activés.

**Sous-type** (B-52, décision de Monsieur du 2026-10-11) : la carte d'une fiche (grille) et la ligne de l'arbre montrent
son sous-type sous le titre (`--texte-3`) ; un filtre « Sous-type » à côté de la recherche (« Tous » ;
puis les sous-types des fiches du type que le lecteur voit, par ordre alphabétique, avec leur nombre de
fiches lisibles) ; un sous-type filtré rend la grille. La fenêtre de création a un champ « Sous-type »
facultatif, avec la même complétion que E-9.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes de la grille ; nouveaux types : « Aucune créature », « Aucune race », « Aucun vaisseau », « Aucun savoir », « Aucun récit », « Aucune règle », « Aucune note » + « pour l'instant. » / « à voir pour l'instant. » ; boutons « Nouvelle créature », « Nouvelle race », « Nouveau vaisseau », « Nouveau savoir », « Nouveau récit », « Nouvelle règle », « Nouvelle note » | MJ : créer |
| chargement | « Chargement des fiches… » ; un nœud qui se déplie : « Chargement… » sous lui | — |
| erreur | « Impossible de charger les fiches. » ; un nœud : « Impossible de charger la suite. » | « Réessayer » |
| connexion perdue | le bandeau ; « Nouveau … » désactivé | déplier ce qui est chargé |
| refus | un type inconnu de la liste du produit : « Page introuvable. » | — |
| contenu long | 201 lieux : 100 racines puis la suite ; 12 niveaux de profondeur : l'indentation plafonne à 6 niveaux, la profondeur se lit au chevron | idem |

*Critère.* Étant donné « La Taverne du Kraken » sous « Port-Sel », lisibles de Léa, quand Léa passe
« Lieux » en arbre et déplie « Port-Sel », alors elle voit « La Taverne du Kraken » dessous.
- Étant donné « Port-Sel » et « Havre-Gris » de sous-type « Port », et « Port-Noir » de sous-type
  « Port » que Léa ne lit pas, quand Léa filtre « Lieux » sur « Port », alors elle voit « Port-Sel » et
  « Havre-Gris », et le filtre dit « Port (2) ».

### Ce que `kanevas-import-arbre` construit (E-8 arbre, E-9 fil, « Contient », « Déplacer sous… »)

*Précisions de la tranche, sur le cadre ci-dessus (AD-99, AD-115) ; la maquette de E-9 est `e09-fiche-importee.html`
(`#etat-deplacer`), l'arbre n'en a pas.*

**Arbre (E-8).** L'adresse ne change pas ; le choix « Grille / Arbre » est gardé par type sous la clé
`kanevas:vue-liste:<univers>:<type>` du navigateur (`localStorage`, valeurs `grille`, `arbre`) ; absent : la grille.
La liste est un `role="tree"`, chaque nœud un `role="treeitem"` avec `aria-expanded` quand il a un chevron et
`aria-level` ; le chevron est un bouton (`aria-label` « Déplier » / « Replier ») distinct du lien vers la fiche ;
au clavier, flèche droite déplie, flèche gauche replie, Entrée ouvre. Déplier appelle
`GET …/fiches?type=T&parent=<id>` ; replier garde ce qui est chargé, le déplier de nouveau ne rappelle pas.
Les racines sont `…&parent=racine` ; « Charger la suite » charge la page suivante d'un nœud ou des racines.
Un nœud sans enfant lisible du même type n'a pas de chevron (le champ `aDesEnfants`). La ligne d'un nœud :
icône du type, titre, sous-type (`--texte-3`), et « dans « La Guilde des Brumes » » quand `dans` est rendu.
Au téléphone, l'indentation vaut 12 px par niveau, plafonnée à 6 niveaux ; la ligne ne passe pas sous 44 px de haut.
En mode Joueur d'un MJ, la bascule garde son choix et l'arbre se recharge sous le mode. Un filtre de sous-type ou une recherche rend la grille ; vider le filtre ou la recherche rend l'arbre si c'était le choix mémorisé. Un nœud déplié dont la fiche devient illisible entre deux lectures disparaît à la lecture suivante (404 : « Impossible de charger la suite. »). Un parent « en attente » de l'import (AD-104) est compté, avec les liens en attente, dans la ligne « liens et références en attente » de E-18 ; le rejeu qui le pose se voit dans l'arbre.

**Fil d'Ariane (E-9).** `ancetres` vient de la vue de la fiche ; chaque ancêtre est un lien vers sa fiche ; une
fiche sans ancêtre lisible a le fil de toujours. Plus de trois ancêtres : le premier, « … » (un menu qui liste
les autres, avec leur type), les deux derniers. Le retour par le fil (P-12 étape 5) est ce lien : aucun état
particulier. Un ancêtre qui devient illisible entre deux lectures n'est plus dans le fil à la lecture suivante.

**« Contient » (E-9).** Le bloc suit les textes de `Contient` plus haut. Il appelle
`GET …/fiches/:fid/enfants` une fois la fiche chargée, indépendamment des sections (la fiche et ses sections arrivent en une réponse, « Contient » dans une seconde) : son erreur ne retire pas le
texte. Ses états : *chargement* « Chargement… » sous le titre du bloc ; *erreur* « Impossible de charger les
enfants. » avec « Réessayer » ; *vide* le bloc est absent ; *contenu long* 50 puis « Afficher les N suivants »
(N = ce que la page suivante compte, jamais un total) ; l'échec de cette suite dit « Impossible de charger la suite. » sans retirer ce qui est affiché ; connexion perdue : le bandeau, le bloc chargé reste ; fiche supprimée entre-temps (404) : le bloc disparaît. Une fiche sans section lisible mais avec des enfants lisibles montre quand même « Contient ». Chaque enfant montre l'icône, le titre et le sous-type (« Taverne »). En mode Joueur le bloc se relit sous le mode.

**« Déplacer sous… » (E-9).** La boîte est celle de `#etat-deplacer`. Le champ cherche dans la liste de
recherche existante (`GET …/fiches?q=`, sans `type`, 300 ms après la frappe, 1 caractère au moins, 100 au plus) ;
la fiche elle-même est écartée de la liste ; une ligne montre l'icône du type, le titre et le sous-type (« Lieu · Sphère »), et la recherche porte sur le titre seul (le placeholder « Titre ou alias » de la maquette est celui de E-17 : ici le champ dit « Chercher une fiche ») ; « 1 caractère au moins, 100 au plus » vise la saisie, la liste rend 100 lignes au plus puis « Charger la suite », et défile dans la boîte ; avant toute saisie la liste dit « Tapez le début d'un titre. » ; une saisie sans résultat dit « Aucune fiche ne correspond. », la recherche en cours « Recherche… », son échec « Impossible de chercher. » avec « Réessayer » ; « Aucun parent » est la première ligne et met la fiche à la racine.
« Déplacer » reste inactif tant qu'aucune ligne n'est choisie (la maquette le montre actif parce qu'un choix y est déjà fait) ; le refus s'écrit sous le champ ; il envoie `PATCH …/fiches/:fid` `{parent}`. Réponses :
succès (200, la fiche en réponse) → la boîte se ferme, le fil se recharge et le toast dit « Fiche déplacée. » ; 400 `cycle` → le texte
« Une fiche ne peut pas être rangée sous l'un de ses descendants. » sous le champ, la boîte reste ouverte ;
400 `trop_profond` → « La hiérarchie est trop profonde. » et 404 → « Introuvable. », tous deux sous le champ comme le cycle ; connexion perdue →
bandeau, « Déplacer » désactivé. La boîte n'existe que pour un MJ hors mode Joueur, et le menu « ⋯ » est absent pour un Joueur. Une fiche de tout type peut être parent ou enfant, un compte-rendu compris (AD-99) : « Déplacer sous… » existe aussi pour lui (MJ seulement : un Joueur, même auteur de son compte-rendu, n'a pas le menu « ⋯ ») ; E-13 ne montre pas la hiérarchie et ne change pas.

*Critères de la tranche* (les données sont celles du semis, `docs/ecrans.md` plus haut) :
- Étant donné « Les Sphères » (lieu MJ seul) dont « Port-Sel » est l'enfant, quand Léa ouvre « Lieux » en arbre,
  alors « Port-Sel » est une racine sans « dans … » (son parent est illisible) ; Antor, lui, voit « Les Sphères »
  racine, et « Port-Sel » dessous.
- Étant donné « Le Repaire des contrebandiers » (MJ seul) sous « Port-Sel », quand Léa déplie « Port-Sel », alors
  elle voit « La Taverne du Kraken », « Les Docks », « Le Phare aux Sels » et « Quartier des Cordiers », pas le Repaire,
  et aucun nombre ne lui dit qu'il existe.
- Étant donné un enfant d'un autre type sous « Port-Sel » (un événement lu des joueurs ; le semis du bouchon n'en pose pas, il se crée ou s'importe pour ce critère), quand Léa déplie
  « Port-Sel » dans « Lieux », alors cet enfant n'y est pas ; il est dans « Contient » de « Port-Sel », et dans
  « Événements » il porte « dans Port-Sel ».
- Étant donné une réponse de `GET …/fiches?type=lieu&parent=racine` pour Léa, alors aucun champ ne porte le titre,
  l'identifiant ou le nombre d'une fiche qu'elle ne lit pas (`dans` est `null` si le parent est illisible).

### E-17 Recherche

*Maquette finie* : `docs/maquettes/e17-recherche.html` (MJ, Joueur, mode Joueur, étiquette, savoir, états).

Adresse `/univers/:id/recherche?q=…&type=…&etiquette=…`. Un champ en tête (focus à l'ouverture,
1 à 100 caractères, sans bouton : la recherche part à la frappe ou à Entrée), dessous deux rangées de filtres : les **types** (pastilles à icône, « Tous » par
défaut ; **seuls les types activés** ont leur pastille, B-42 — une fiche d'un type désactivé reste un
résultat sous « Tous ») et les **étiquettes** (une liste à
compléter, celles des fiches que le compte voit). Les résultats : la ligne de E-8 (vignette, icône du
type, titre, badge, sous-type) plus, si la fiche a été trouvée par un alias, « alias : Salport » ; ses étiquettes.
Le champ cherche dans le titre, les alias, le **sous-type** (B-52) et les sections lisibles. **Ordre** : titre, alphabétique sans casse — pas de pertinence ni d'extrait (AD-63 tient : un extrait
est du contenu à filtrer, un classement trahit ce qui est caché). 100 puis « Charger la suite ». Une
étiquette seule, sans mot, liste les fiches qui la portent. **Mode Joueur** (MJ) : la barre haute de
E-17 porte la bascule du cadre (« Mode MJ » / « Mode Joueur ») ; en mode Joueur, la recherche répond comme pour un
joueur qui n'est l'auteur d'aucune section (AD-39, AD-101) — sans blocs MJ, sans fiche qu'un joueur ne
lit pas ; le mode passe par l'adresse (`&mode=joueur`) et suit le MJ qui arrive d'une fiche ouverte en
mode Joueur (« Rechercher », une étiquette).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | une saisie d'espaces seuls ne part pas : l'état de départ reste ; sans saisie ni filtre : « Cherchez un nom, un alias ou un mot. » ; sans résultat : « Aucune fiche ne correspond. » | changer la saisie, retirer un filtre |
| chargement | « Recherche… » sous le champ, les résultats d'avant restent grisés ; à l'ouverture, la rangée des étiquettes attend son appel (aucune pastille, le reste de l'écran est utilisable) ; « Charger la suite » en cours : le bouton est grisé et porte « Chargement… » | — |
| erreur | « La recherche n'a pas abouti. Réessayez. » (le champ et les filtres sont conservés) ; échec de « Charger la suite » : « Impossible de charger la suite. », les résultats restent ; échec de la rangée des étiquettes : elle est absente, sans message ; saisie de plus de 100 caractères (collage, ou adresse `?q=` : le champ ne la bloque pas à la frappe mais refuse l'envoi) : « Erreur : 100 caractères au plus. » | « Réessayer » (pour « La recherche n'a pas abouti. » seulement ; les autres erreurs se corrigent en changeant la saisie, ou disparaissent à la prochaine recherche) |
| connexion perdue | le bandeau de connexion perdue du cadre (texte de la section « Textes communs ») ; le champ reste, la recherche ne part pas ; les résultats déjà affichés restent lisibles, « Charger la suite » est désactivé | — |
| refus | compte sans rôle : « Page introuvable. » ; une fiche illisible n'est jamais un résultat, une étiquette qui ne porte que des fiches illisibles n'est pas proposée | — |
| contenu long | 501 résultats : 100 puis la suite ; titre long tronqué par « … » avec infobulle ; alias de 120 caractères et étiquette de 40 tronqués par « … » avec infobulle ; plus de 4 étiquettes sur une ligne : « +N » ; les rangées de pastilles passent à la ligne ; sur un téléphone (390 px) la rangée des types défile à l'horizontale à l'intérieur de sa rangée, la page jamais | idem |

*Critères.*
- Étant donné le mot « sous-main » présent seulement dans le bloc MJ de « Port-Sel », quand Léa
  cherche « sous-main », alors « Port-Sel » n'est pas un résultat ; quand Antor le cherche, il l'est.
  Quand Antor le cherche en mode Joueur, « Port-Sel » n'est pas un résultat.
- Étant donné « Savoir » désactivé dans Lame d'Ébène et « Chronique de l'Âge d'Ombre » (un savoir
  lisible de Léa), quand Léa cherche « chronique », alors elle est un résultat sous « Tous », et aucune
  pastille « Savoirs » n'est proposée.
- Étant donné « Le Pendu Joyeux » de sous-type « Taverne », quand Léa cherche « taverne », alors
  « Le Pendu Joyeux » est un résultat ; sous la pastille « Lieux », seuls des lieux le sont.
- Étant donné le texte de lien « La Guilde des Brumes » écrit dans « Histoire » (lue de Léa) vers une
  fiche que Léa ne lit pas, quand Léa cherche « guilde », alors « Port-Sel » est un résultat et « La
  Guilde des Brumes » n'en est pas un (ce lien est semé par `kanevas-import-liens`, livrée avant la recherche dans l'ordre du plan mais pas sa dépendance : le critère se joue à la recette d'ensemble de l'epic, P-12 étape 4).
- Étant donné « Port-Sel » d'alias « Salport », quand Léa cherche « salport », alors « Port-Sel » est
  un résultat, avec « alias : Salport ».
- Étant donné l'étiquette « Côte des Brumes » posée sur « Port-Sel » et sur « Cercle des Cendres »
  (illisible de Léa), quand Léa filtre sur elle, alors seul « Port-Sel » est rendu.

### La recherche — ce que `kanevas-import-recherche` construit

- **Fichier et adresse** : `frontend/src/ecrans/recherche.tsx` (un `Ecran` du registre), adresse `/univers/:id/recherche`. L'entrée « Rechercher » (`search`) est la **première** de `items.ts`, avant « Vue d'ensemble », et ne montre qu'avec l'écran enregistré. Le raccourci `/` (hors d'un champ de saisie, d'une boîte ouverte ou de l'éditeur) est posé une fois par le cadre (`useRaccourciRecherche`, appelé dans `Cadre.tsx`) et navigue vers l'adresse ci-dessus ; hors d'un univers il ne fait rien.
- **Saisie** : la recherche part 300 ms après la dernière frappe ou à Entrée, et à chaque changement de pastille ; une saisie plus courte que 1 caractère utile ne part pas ; l'adresse suit l'état (`?q=&type=&etiquette=&mode=`, remplacement d'entrée d'historique, pas d'empilement). Une seule requête est en vol : la plus récente gagne.
- **Pastilles de types** : « Tous » puis les types **activés** (ordre de la liste du produit) ; une seule à la fois. Pastilles d'étiquettes : celles que renvoie `GET /api/univers/:id/etiquettes` (nom, ordre alphabétique sans casse), une seule à la fois ; retirer la pastille active la ré-appuie. Une adresse qui nomme un type ou une étiquette inconnus ou non proposés les ignore (pas d'erreur).
- **Mode Joueur** : la bascule du cadre (`cadre-contexte`), qui reste affichée avec la navigation du MJ ; le mode part en `?mode=joueur` de toute requête de cette tranche (liste, étiquettes proposées, écriture d'étiquetage) ; le MJ qui arrive d'une fiche en mode Joueur garde le mode (`&mode=joueur` posé par le lien « Rechercher » et par les pastilles d'étiquette de E-9). Un non-MJ n'a pas la bascule et l'adresse `mode=joueur` n'y change rien.
- **Alias et étiquettes de la boîte** : à l'enregistrement, « Enregistrer » est grisé et porte « Enregistrement… » jusqu'à la réponse ; pas d'état de chargement à l'ouverture (la boîte s'ouvre sur les valeurs déjà lues) ; 20 alias de 120 caractères et 20 étiquettes de 40 : les pastilles passent à la ligne et la boîte défile verticalement ; permission : la boîte n'existe pas pour un joueur ni en mode Joueur (menu sans l'entrée, rien à refuser).
- **Touche `/`** : critère de la tâche E-17 ; elle ne fait rien dans un champ, un éditeur, une boîte ouverte ou hors d'un univers.
- **Résultat** : lien vers E-9 ; l'alias n'est montré que si le **titre ne correspond pas** aux mots et qu'un alias y correspond (le premier par ordre alphabétique) ; les étiquettes de la fiche suivent, chacune ré-applique le filtre. Les pastilles d'étiquettes proposées et celles d'une fiche ne comptent jamais une fiche illisible.
- **E-9** : sous le titre « Aussi appelée … » et les pastilles d'étiquettes (liens vers E-17 `?etiquette=`) ; la boîte « Alias et étiquettes… » enregistre les deux listes d'un coup (« Enregistrer » / « Annuler » ; refus : « Erreur : 20 alias au plus. », « Erreur : 20 étiquettes au plus. », « Erreur : 120 caractères au plus. », « Erreur : 40 caractères au plus. » ; un doublon sans tenir compte de la casse est ignoré à la saisie) ; toast « Alias et étiquettes enregistrés. ». Elle est cachée à un joueur et au MJ en mode Joueur.
- **États de la boîte** : vide (fiche sans alias ni étiquette) : deux champs vides, « Enregistrer » actif (rien à écrire = aucun appel) ; enregistrement refusé par le serveur : « L'action n'a pas abouti. Réessayez. », la saisie reste ; connexion perdue boîte ouverte : le bandeau, « Enregistrer » désactivé, la saisie reste ; « Annuler » ou Échap abandonne la saisie non enregistrée sans demande. La boîte est décrite ici seule (pas de maquette propre : fenêtre de la famille des boîtes de E-9, `e09-fiche-importee.html`).
- **Semis du bouchon** (`KANEVAS_STUB=1`, univers « Lame d'Ébène ») : alias « Salport » et « Port-aux-Sels » sur « Port-Sel » ; étiquette « Côte des Brumes » sur « Port-Sel » et « Cercle des Cendres » (illisible de Léa) ; savoir lisible « Chronique de l'Âge d'Ombre » (sous-type « Récit ») ; le mot « sous-main » seulement dans le bloc MJ de « Port-Sel » (semé par `kanevas-import-secrets`) ; les sous-types « Taverne » (« Le Pendu Joyeux ») et « Récit » viennent de `kanevas-import-types` et de ce semis.

### E-18 Accès par API (MJ)

*Maquette finie* : `docs/maquettes/e18-acces-api.html` (états `#etat-nouveau`, `#etat-jeton-montre`,
`#etat-lot`, `#etat-vide`, `#etat-perdue`).

Atteint par « Univers ▸ Accès par API » (`key-round`), MJ seul. Le bouton « Demander à Kanevas » de la maquette est celui de l'assistant, présent sur tous les écrans (B-26, E-12), sans rien de propre à E-18. Une introduction d'une ligne :
« Un jeton permet à un script d'écrire dans cet univers avec vos droits, par l'API d'import. » et
l'**adresse de base** à copier (`https://kanevas.berard.me/api/import/v1/univers/<id>`, « Copier »,
toast « Adresse copiée. »). Deux panneaux.

1. **Jetons** — « Nouveau jeton » (`plus`). Une ligne par jeton, actifs d'abord puis révoqués et expirés
   (les 20 derniers) : nom, « créé par antor le 11 oct. 2026 », « dernier usage il y a 3 min » ou
   « jamais », « expire le 10 nov. 2026 » ou la pastille « Révoqué » (danger) / « Expiré » (neutre), les infos séparées par « · » au bureau ; « Révoquer » au
   survol (visible au toucher). *Nouveau jeton* : boîte « Nouveau jeton » — « Nom » (1 à 80 caractères,
   obligatoire), « Durée » (bascule segmentée 7 jours, **30 jours**, 90 jours, 1 an), « Créer le
   jeton », « Annuler » ; puis la même boîte montre le nom du jeton en étiquette et le jeton seul, en chasse fixe, pleine largeur, puis l'encadré (`circle-alert`) « Il ne sera plus jamais affiché. Rangez-le dans la configuration de votre
   script. », et au pied « Copier » (toast « Jeton copié. ») et « J'ai copié le jeton » — tant que le jeton est montré, seul ce bouton ferme la boîte
   (ni Échap ni le voile) ; la ligne du jeton arrive alors en tête de la liste. Le jeton d'un MJ qui n'a plus ce rôle (B-46) reste listé, avec la pastille « Inactif »
   et l'infobulle « Son créateur n'est plus MJ de cet univers. » (au toucher, la même phrase s'écrit sous la ligne) ; il reste parmi les jetons actifs, rangé avec eux par date de création ; « Révoquer » reste possible. Pendant « Créer le
   jeton » et « Révoquer le jeton » le bouton est désactivé et dit « Création… » / « Révocation… » (pas de double envoi) ; « Annuler » et la fermeture de la boîte sont désactivés aussi jusqu'à la réponse. La maquette ne dessine ni « Inactif » ni ces boutons : le texte d'ici fait foi (pastille neutre, en `--texte-2` ; « Révoqué » est en teinte danger, « Expiré » neutre). *Révoquer* : boîte « Révoquer « Script Kanka — Mac » ? Le script
   qui l'utilise ne pourra plus rien écrire. », « Révoquer le jeton » (`--danger`) / « Annuler » ; toast « Jeton révoqué. ».
2. **Lots d'import** — les 20 derniers lots, du plus récent : date d'ouverture, jeton, état (« En
   cours », « Clos », « Abandonné » — ouvert depuis plus de 24 h sans écriture), et les compteurs
   **par nature d'objet**, à la suite et séparés par « · », les natures sans objet omises : « Fiches : 498 créées ·
   3 refusées », « Fichiers : 1 140 créés », « Campagnes : 4 créées », « Scénarios : 12 créés »,
   « Relations : 324 créées », puis « 6 liens et références en attente » et « 1 avertissement ». Dans une
   nature, chaque forme (« créée(s) », « mise(s) à jour », « inchangée(s) », « refusée(s) ») n'est écrite que
   si elle n'est pas nulle : un rejeu sans rien de neuf lit « Fiches : 1 inchangée » (le rapport de l'API,
   lui, rend tous les compteurs, `creees: 0`), et un compte nul d'attente ou d'avertissements est omis
   (la maquette abrège « 6 en attente » ; le texte est celui d'ici). Un `PUT` refusé (400) avec son lot
   counts one refusal and records its origin key and reason (for example, « campagne inconnue : c:absente »
   or « type « monstre » inconnu de Kanevas »); without a batch it leaves no trace here. A
   ligne se déplie :
   les refus et avertissements, chacun avec la clé d'origine, ce qui est en cause et la raison
   (« section « Vérité » : 112 000 caractères, 100 000 au plus » ; « parent lieu:les-docks inconnu :
   fiche écrite sans parent » ; « section « Notes » modifiée dans Kanevas depuis le dernier import : non
   écrasée » ; « titre modifié dans Kanevas : non écrasé »), en deux groupes titrés par leur compte (« 3 refusées », « 2 avertissements »), 200 au
   plus puis « … et 37 autres ». Un lot sans refus ni avertissement ne se déplie pas. Le jeton,
   l'adresse et les clés d'origine sont en chasse fixe (pile système `ui-monospace`, charte).
   File warnings also include « fichier vide : 0 octet, refusé », « visibilité modifiée
   dans Kanevas : non écrasée » and « nom modifié dans Kanevas : non écrasé ». A pending
   reference warns « fichier « img:quais » inconnu : référence en attente ».


| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun jeton. Créez-en un pour qu'un script écrive dans cet univers. » (aucun jeton du tout ; avec seulement des jetons révoqués ou expirés, la liste les montre, sans ce texte) ; « Aucun lot d'import pour l'instant. » | « Nouveau jeton » |
| chargement | squelettes des deux panneaux | — |
| erreur | « Impossible de charger cette page. » ; nom vide : « Erreur : le nom est obligatoire. » ; création ou révocation qui échoue : « L'action n'a pas abouti. Réessayez. », rien n'a changé (aucun jeton à moitié créé) | « Réessayer » |
| connexion perdue | le bandeau ; « Nouveau jeton » et « Révoquer » désactivés ; si la boîte montre un jeton, il reste affiché jusqu'à « J'ai copié le jeton » | copier |
| refus | Joueur, compte sans rôle, admin sans rôle : item absent, « Page introuvable. » ; rôle retiré pendant la page : « Vous ne pouvez plus gérer l'accès par API de cet univers. » à l'action suivante | « Mes univers » |
| contenu long | nom de 80 caractères tronqué par « … » avec infobulle ; un lot de 501 refus : 200 puis « … et 301 autres » ; plus de 20 jetons : les 20 derniers, les actifs toujours tous | idem |

*Critères.*
- Étant donné Antor, MJ, quand il crée « Script Kanka — Mac » pour 30 jours, alors le jeton s'affiche
  une fois ; après « J'ai copié le jeton », la ligne montre le nom, « jamais » et l'expiration, et la
  valeur n'est plus nulle part à l'écran ni dans une réponse de l'API.
- Étant donné ce jeton révoqué, quand le script appelle l'API d'import avec lui, alors il reçoit 401
  et aucun lot n'apparaît.
- Étant donné un lot clos avec 3 refus, quand Antor déplie la ligne, alors il lit les 3 clés d'origine
  et leur raison.
- Étant donné Léa, Joueuse, quand elle ouvre l'adresse de E-18, alors elle voit « Page introuvable. »
  et l'item n'est pas dans sa barre.

### E-14 et E-15 — « Types de fiche »

*Maquette finie* : `docs/maquettes/e14-types-de-fiche.html` (le panneau de E-14, le panneau de E-15,
états `#etat-sans-systeme`, `#etat-confirmer`, `#etat-joueur`, `#etat-supprimer-univers`).

**E-15 (système)** : un quatrième onglet « Types de fiche » après Règles, Créatures, Objets. Une ligne
par type de la liste du produit (sauf compte-rendu) : icône, nom, et un **interrupteur** « Activé »
(colonne titrée « Système »).
Sous la liste : « Utilisé par N univers. Un univers peut forcer un type à activé ou désactivé dans ses
paramètres. » Basculer enregistre aussitôt (toast « Vaisseau désactivé pour CoF Mini. » ou « Vaisseau activé pour CoF Mini. ») ; tout univers
qui suit le système le voit au chargement suivant. Joueur : la liste, interrupteurs en lecture seule
(« Lecture seule »).

**E-14 (univers)** : un quatrième panneau « Types de fiche », après « Créer un système ». Une ligne par
type : icône, nom, le nombre de fiches de l'univers de ce type (« Aucune fiche », « 1 fiche », « 201 fiches »), et une **bascule
segmentée à trois choix** : « Système · activé » (ou « Système · désactivé » ; « Par défaut · activé »
pour un univers sans système), « Activé », « Désactivé ». Un choix forcé porte un point d'accent à
gauche du nom ; la ligne dit, si le forçage contredit le système, « Le système le désactive. » (ou « Le système
l'active. »). Enregistré au changement, toast « Vaisseau : activé dans Lame d'Ébène. » (« désactivé »,
« suit le système »). Désactiver (par forçage ou en suivant) un type qui a des fiches demande
confirmation : « Désactiver « Lieu » dans Lame d'Ébène ? Les 201 lieux restent ; on les atteint par un
lien, la recherche ou l'arbre. » (au singulier : « Le seul événement reste ; … »), boutons
« Désactiver » / « Annuler ». Le panneau « Supprimer l'univers » ferme la page, séparé par un filet
`--danger` : « Supprimer l'univers » ouvre une boîte « Supprimer « Lame d'Ébène » ? Tout son contenu —
fiches, sections, fichiers de la médiathèque, campagnes, cartes, jetons — sera effacé, pour tous ses membres. Le
système de jeu reste. » ; un champ « Tapez le nom de l'univers pour confirmer » ; « Supprimer
l'univers » (`--danger`) ne s'active que si le nom tapé est exact (casse comprise). Après : E-1, toast
« Univers supprimé. ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | sans objet : la liste du produit n'est jamais vide ; univers sans système : la colonne « Par défaut · activé » | forcer |
| chargement | squelette du panneau ; les autres panneaux se chargent seuls | — |
| erreur | un changement qui échoue : « L'action n'a pas abouti. Réessayez. » au-dessus du panneau, la bascule revient ; suppression qui échoue : le message dans la boîte, l'univers reste | « Réessayer » |
| connexion perdue | le bandeau ; bascules, interrupteurs, « Supprimer l'univers » désactivés | lire |
| refus | E-14 : Joueur — page introuvable (inchangé) ; E-15 : Joueur — lecture seule ; un MJ qui n'a plus de rôle : « Vous ne pouvez plus modifier ces paramètres. » | — |
| contenu long | E-15 : les mêmes états que ceux de cette ligne et des lignes précédentes de ce tableau (squelette de l'onglet, « L'action n'a pas abouti. Réessayez. », bandeau de connexion perdue qui désactive les interrupteurs, une colonne au téléphone) ; 13 types réglables : la liste tient sans défiler au bureau, une colonne au téléphone (la bascule passe sous le nom) ; nom d'univers de 80 caractères dans la boîte : passe à la ligne | idem |

*Critères.*
- Étant donné « CoF Mini » qui désactive « Vaisseau » et « Lame d'Ébène » qui le force à « Activé »,
  quand Antor ouvre « Lame d'Ébène », alors « Vaisseaux » est dans sa barre ; quand Mira ouvre « Les
  Landes grises » (qui suit le système), il n'y est pas.
- Étant donné « Lame d'Ébène » qui suit le système pour « Note », quand le système réactive « Note »,
  alors « Notes » apparaît dans la barre de « Lame d'Ébène » au chargement suivant.
- Étant donné un univers dont le MJ désactive « Lieu », alors « Lieux » quitte la barre et la création,
  et un lien vers un lieu ouvre toujours sa fiche.
- Étant donné Antor qui tape « lame d'ébène » dans la boîte de suppression de « Lame d'Ébène », alors
  « Supprimer l'univers » reste inactif ; avec le nom exact, l'univers est supprimé, et Léa qui en
  ouvre une adresse voit « Page introuvable. ».

#### Les types — ce que `kanevas-import-types` construit

Le panneau « Supprimer l'univers » de E-14 est à `kanevas-import-tenir` ;
celle-ci construit le panneau et l'onglet « Types de fiche » ci-dessus, et ce qui suit.
La liste des types (identifiant, adresse, libellés, icône) est celle du serveur (AD-120) : les écrans
la lisent par `GET /api/univers/:id/types`, ils n'en tiennent aucune copie. Icônes (Lucide) :
Personnage `users-round`, Lieu `map-pin`, Faction `shield`, Objet `gem`, Événement `hourglass`, Quête
`scroll-text`, Créature `paw-print`, Race `dna`, Vaisseau `ship`, Savoir `lightbulb`, Récit `book-open`,
Règle `scale`, Note `sticky-note` ; adresses de E-8 : `/univers/:id/fiches/<pluriel>` (`creatures`,
`races`, `vaisseaux`, `savoirs`, `recits`, `regles`, `notes`).

**Barre latérale.** La section « Lore » se construit de la réponse : les types activés, dans l'ordre de la
liste. Pendant le chargement, trois lignes de squelette sous le titre « Lore » ; en erreur, la ligne
« Impossible de charger les types. » et « Réessayer » à sa place — le reste de la barre ne bouge pas.
Si aucun type n'est activé (tous désactivés), la section montre « Aucun type de fiche activé. » (et, au MJ,
le lien « Régler les types » vers E-14). Connexion perdue : la barre garde la dernière liste lue ; sans liste
déjà lue, c'est l'état d'erreur.
Après un réglage (E-14, E-15) sur un autre onglet, la barre se met à jour au retour sur l'onglet ou au
prochain chargement, jamais au milieu d'une saisie.

**E-8 — création et sous-type.** La liste « Type » de la fenêtre de création ne propose que les types
activés ; le champ « Sous-type » (facultatif, 60 caractères au plus, « Erreur : 60 caractères au plus. »)
propose, en tapant, les sous-types déjà employés pour le type choisi (titre « Sous-types de lieu déjà
employés ») ; changer le type dans la fenêtre vide le champ. Si le type vient d'être désactivé par un
autre MJ, « Créer » répond « Ce type est désactivé dans cet univers. » dans la fenêtre, rien n'est créé. Le
filtre « Sous-type » n'apparaît que si au moins une fiche lisible du type en porte un ; pendant son
chargement il est désactivé (« Sous-type : … ») ; s'il échoue, « Sous-types indisponibles. » à sa place
et la grille reste utilisable. Si « Créer » échoue : « L'action n'a pas abouti. Réessayez. » dans la fenêtre, la saisie gardée. Contenu long : 40
sous-types distincts : la liste du filtre défile ; un sous-type de 60 caractères est tronqué par une ellipse, entier
dans son infobulle. Un sous-type filtré qui n'a plus de fiche (renommée entre-temps) rend
« Aucune fiche de ce sous-type. » avec « Voir tous les lieux ».

**E-9 — sous-type en place.** Le MJ (hors mode Joueur) clique le sous-type du badge : champ, liste de
complétion, Entrée enregistre, Échap annule (maquette `#etat-sous-type`). Enregistrement en cours : champ
désactivé, « Enregistrement… ». Échec : « L'action n'a pas abouti. Réessayez. » sous le champ, la valeur
tapée est gardée. Un champ vidé retire le sous-type (« Sous-type retiré. »). Connexion perdue : l'édition est désactivée (le sous-type reste lisible). Contenu long : 60 caractères, tronqués par
une ellipse dans le badge, entiers dans l'infobulle. Un joueur lit le sous-type en
simple texte ; une fiche sans sous-type ne montre rien à un joueur.

**E-9 — « Changer le type… »** (MJ, hors mode Joueur ; absent pour un compte-rendu) : maquette
`e09-fiche-importee.html#etat-changer-type`. Boîte « Changer le type de « Port-Sel » » : une
liste à choix unique des types, les types activés d'abord, puis le titre « Autres types » avec les
désactivés (« désactivé » en `--texte-3`), le type courant coché et indiqué « (actuel) » ; choisir
« Personnage » ouvre le choix « PJ / PNJ » (PNJ par défaut) ; le champ « Sous-type » (vide d'office pour un
autre type, avec les sous-types déjà employés pour le type choisi). Si la fiche a un sous-type, la boîte dit :
« Le sous-type « Port » sera retiré. » tant que le champ n'est pas rempli. Boutons « Changer le
type » (désactivé tant que le type reste l'actuel) et « Annuler ». Après : la fiche se recharge sous son
nouveau type, toast « Type changé : Note → Savoir. », le fil d'Ariane et la barre suivent ; ses sections,
relations, places sur une carte et propositions sont intactes.
Le choix PJ / PNJ n'apparaît que pour **devenir** un personnage ; le PJ / PNJ d'un personnage existant ne se
change pas ici. Chargement : tant que la liste des types n'est pas lue, la liste de la boîte dit « Chargement des
types… » et « Changer le type » reste désactivé. Contenu long : un titre de 120 caractères passe à la ligne dans
le titre de la boîte ; un sous-type de 60 caractères est tronqué par une ellipse dans le badge, entier dans son
infobulle et dans le champ. Échecs : « Le type n'a pas changé. Réessayez. » dans la boîte (elle reste ouverte) ; un MJ qui n'a plus de
rôle : « Vous ne pouvez plus modifier cette fiche. » ; connexion perdue : bandeau, bouton désactivé.
Enregistrement en cours : le bouton passe à « Enregistrement… » et la boîte est figée. Échec de lecture de la
liste des types : « Impossible de charger les types. » et « Réessayer » à la place de la liste, bouton désactivé.
La liste des 13 types défile dans la boîte (hauteur bornée) au bureau comme au téléphone, où la boîte occupe
l'écran. Un sous-type de plus de 60 caractères saisi dans le champ : « Erreur : 60 caractères au plus. ». Le
cas « vide » est sans objet : la liste des types n'est jamais vide (treize types réglables).
**E-9 — sous-type en place.** La liste de complétion défile au-delà de huit entrées ; sans sous-type déjà
employé pour ce type, elle n'apparaît pas et le champ reste libre.
**E-8 — compte du filtre.** Le compte de « Port (N) » reste toujours visible, jusqu'à 9 999 ; au-delà la
pastille dit « Port (9 999+) ».
**E-14 — bascule d'un type.** Toast, comme celui de E-15 (même composant, maquette `e14` : `.toast`) :
« Vaisseau : activé dans Lame d'Ébène. » / « … : désactivé dans … » / « … : suit le système. ».
**E-15 — « Types de fiche ».** « Utilisé par 0 univers » et « Utilisé par 1 univers » (singulier) sous la liste ;
un nom de système de 80 caractères passe à la ligne dans l'en-tête.
**Rôles (kanevas-import-types).** Joueur : E-9 montre le sous-type en lecture seule ; « Changer le type… » est
**caché** ; le champ « Sous-type » de la création est **absent** (la création n'est pas offerte) ; le lien
« Régler les types » de la barre est **caché**. Admin d'instance sans rôle dans l'univers : il n'a pas la section
« Lore » (la barre n'est celle d'aucun univers pour lui).

La maquette `e08-liste-fiches.html` n'est pas redessinée pour le sous-type : le texte ci-dessus dit où il se pose
(sous le titre de la carte, `--texte-3` ; filtre à côté de la recherche).

*Critères de la tranche* (les critères d'écran ci-dessus restent les siens).
- Étant donné « Les Cristaux d'Ombre » (Savoir · Ressource), quand Antor la passe en Note, alors elle est
  dans « Notes » sans sous-type, et la boîte l'avait annoncé.
- Étant donné « Lame d'Ébène » où « Note » est désactivé, quand Antor ouvre « Changer le type… » d'une
  fiche, alors « Note » est sous « Autres types » et le choisir fonctionne.
- Étant donné un type désactivé, quand Antor ouvre l'adresse de sa liste, alors elle s'ouvre avec « Ce type
  est désactivé dans cet univers. » et sans bouton de création.

### E-7, E-13, E-5

- **E-7** et les entrées de **E-15** : l'éditeur et le rendu Markdown ci-dessus, avec ce que permet
  chaque texte (« Selon le texte ») : E-7 garde « Lien vers une fiche » ; ni E-7 ni E-15 n'ont
  « Fichier » ni « Bloc MJ » ; E-15 n'a pas de lien vers une fiche.
- **E-13** : l'ordre est la date de création de la fiche, qui est sa **date d'origine** si l'import en
  a donné une (B-50) ; la ligne montre cette date.
- **E-5** (B-51, dernière tranche) : un panneau « Jeton de l'assistant » sous la liste des
  univers — « Aucun jeton posé. » ou « Jeton posé le 11 octobre 2026. » (jamais la valeur) ;
  « Connecter l'abonnement » montre l'adresse d'autorisation (« Ouvrir », « Copier ») et un champ
  « Code » avec « Valider » ; la fenêtre expire au bout de 10 minutes (« La connexion a expiré.
  Recommencez. ») ; un code refusé : « La connexion n'a pas abouti. Recommencez. », l'ancien jeton reste.
  États et maquette : la tranche.

### Clôture de `kanevas-import` (cadrage)

- **Chaque besoin a un écran** : B-32 E-9, E-7, E-15 · B-33 E-9 · B-34 E-9 (et E-17, E-12 pour ce
  qu'ils ne montrent pas) · B-35 E-9, E-8 · B-36 E-9 · B-37 E-17 · B-38 E-9, E-17 · B-39 E-9 · B-40 E-9 ·
  B-41 E-14 · B-42 E-14, E-15, barre · B-43 E-9 · B-44 E-9 · B-45, B-46, B-49 E-18 · B-47, B-48 : **pas
  d'écran, par décision** — le geste est le script, son résultat se lit sur E-18 (B-49) ; AD-53 tient :
  l'écran d'un import est E-18 · B-50 E-9, E-13 · B-51 E-5 · B-52 E-8, E-9, E-17 · B-53, B-54 E-19 ·
  B-55 E-9 (les deux chemins d'ajout), E-19 (le sélecteur) · B-56 : pas d'écran (le script), résultat sur E-19 et E-18 — tient.
- **Chaque écran est atteint par un parcours** : E-17 (P-12), E-18 (P-10, P-11), E-14 et E-15 (P-13,
  P-10), E-9 (P-12, P-14, P-16), E-8 (P-12), E-5 (P-15), E-19 (P-16, P-10) — tient.
- **Chaque rôle a sa colonne** : MJ, Joueur, Admin d'instance pour E-17, E-18 et E-19 (matrice) ; le script
  d'import n'est pas un rôle : il agit comme le MJ du jeton, sur l'API seule — tient.

## Détail de l'écran de `kanevas-import-jeton-assistant`

> **E-5** reçoit un panneau, rien d'autre (B-51, P-15). Maquette finie :
> `docs/maquettes/e05-administration.html` (les états principaux : vide, posé, connexion en cours, échec, expirée, erreur de lecture ; les autres sont décrits par le tableau ci-dessous). Les textes communs
> (chargement, erreur, connexion perdue, refus) sont ceux de E-5 ci-dessus.

**Place.** Un panneau pleine largeur « Jeton de l'assistant », **sous** les deux zones (liste des
univers, membres), visible quelle que soit la sélection d'univers (adresses inchangées :
`/administration`, `/administration/univers/:id`) ; le jeton est de l'instance, pas d'un univers.
Une sélection d'univers ne remet pas le panneau à zéro, une connexion en cours survit au changement
d'univers. Le panneau ne montre **jamais** la valeur du jeton : ni dans une réponse, ni dans le DOM,
ni dans un message d'erreur.

**Ce qu'on voit.** Le titre ; une ligne d'état, dans cet ordre de priorité : « Jeton posé le 11 octobre
2026. » (le jeton du fichier du volume, date de sa pose), « Jeton fourni par le déploiement. » (pas de
fichier, la variable `CLAUDE_CODE_OAUTH_TOKEN` non vide : le panneau ne sait pas depuis quand),
« Aucun jeton posé. » ; le bouton « Connecter l'abonnement » (« Reconnecter l'abonnement » dès qu'un jeton est posé, du fichier
ou du déploiement, dans tous les états ci-dessous). Un admin qui est aussi membre d'un univers voit le panneau comme les autres. Un clic démarre la connexion : l'adresse d'autorisation, en lecture seule, avec « Ouvrir »
(nouvel onglet, `rel="noopener noreferrer"`) et « Copier » (« Copiée. » 2 s) ; un champ « Code » et
« Valider » ; « Annuler » ; la mention « Cette connexion expire dans 10 minutes. » suivie de « Reste 9 min. »
(minutes pleines arrondies au-dessus, « Reste moins d'une minute. » sous la minute ; rafraîchi chaque seconde, sans annonce
vocale ; à 0 la phrase d'expiration remplace le champ). Recharger la page ne rouvre pas la connexion : le panneau repart de l'état lu, sans adresse ni champ « Code » ; la connexion du
serveur vit jusqu'à son expiration. Quand un admin clique « Connecter » (le même après un rechargement, ou un second admin), le
serveur en démarre une nouvelle qui remplace la précédente, et le « Valider » de l'ancienne reçoit alors « La connexion a expiré.
Recommencez. ». « Valider » est désactivé tant que le champ est vide. Le code collé n'est pas conservé : le
champ est vidé après chaque validation. Le jeton posé prime sur la variable : un jeton du volume se
remplace par une nouvelle connexion, jamais par un champ de saisie (il n'y en a pas).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide (aucun jeton) | « Aucun jeton posé. » ; sous le titre : « L'assistant est indisponible tant qu'aucun jeton n'est posé. » (affichée seulement si l'assistant n'a vraiment aucun moyen de répondre ; sous le bouchon, où l'assistant répond déjà, rien) | « Connecter l'abonnement » |
| posé | « Jeton posé le 11 octobre 2026. » (ou « Jeton fourni par le déploiement. ») ; « L'assistant est disponible sur tous les univers. » (le jeton est de l'instance : voulu aussi pour le jeton du déploiement) | « Reconnecter l'abonnement » |
| chargement | « Chargement de l'état du jeton… » (lecture de l'état) ; « Connexion en cours… » pendant le démarrage (le bouton désactivé, `aria-busy`) | — |
| connexion en cours | l'adresse, « Ouvrir », « Copier », le champ « Code », « Valider », « Annuler », le temps restant | coller le code, valider, annuler |
| validation en cours | « Validation… », champ et boutons désactivés | — |
| posé à l'instant | « Jeton posé le 11 octobre 2026. » (région `role="status"`), le champ disparaît ; l'assistant est disponible sans redéploiement ni redémarrage | « Reconnecter l'abonnement » |
| échec | code refusé : « La connexion n'a pas abouti. Recommencez. » ; l'ancien état (posé ou non) reste affiché, le champ est vidé, la connexion en cours est terminée côté serveur | « Connecter l'abonnement » (« Reconnecter » si un jeton est posé) |
| échec de validation autre (serveur injoignable, 5xx) | « L'action n'a pas abouti. Réessayez. » ; le champ est vidé, la connexion reste ouverte tant qu'elle n'a pas expiré | coller de nouveau, annuler |
| expirée | au bout de 10 minutes, ou serveur redémarré : « La connexion a expiré. Recommencez. » ; l'ancien état reste | « Connecter l'abonnement » (« Reconnecter » si un jeton est posé) |
| erreur de lecture | « Impossible de charger l'état du jeton. » avec « Réessayer » ; le reste de la page reste utilisable | « Réessayer » |
| erreur de démarrage | « La connexion n'a pas pu démarrer. Réessayez. » (le programme `claude` ou `script` absent, ou aucune adresse rendue en 30 s) ; aucun détail technique | « Connecter l'abonnement » (« Reconnecter » si un jeton est posé) |
| connexion perdue | le bandeau ; « Connecter l'abonnement » (« Reconnecter » si un jeton est posé), « Valider » et « Annuler » désactivés ; l'état chargé reste | lire |
| refus | tout compte hors du groupe : la page entière est « Page introuvable. » (E-5 ci-dessus) ; une route du panneau sans le groupe répond 404 comme une adresse inconnue | « Mes univers » |
| contenu long | l'adresse d'autorisation (plus de 200 caractères) se replie sur plusieurs lignes dans une zone qui défile, sans élargir la page ; le champ « Code » accepte 500 caractères au plus | idem |

**Clavier et lecteur d'écran.** Le panneau est un `section` titré ; l'ouverture de la connexion place
le focus sur le champ « Code » ; à l'expiration ou à l'échec le focus revient sur le bouton « Connecter
l'abonnement » ; les messages d'état sont dans une région `aria-live="polite"`, sauf le temps restant.

*Critères.*
- Étant donné Admin (groupe `parents`) et un bouchon sans jeton, quand il ouvre `/administration`, alors le
  panneau dit « Aucun jeton posé. » ; quand il clique « Connecter l'abonnement », alors il voit une adresse
  d'autorisation, un champ « Code » et « Valider » désactivé.
- Étant donné la connexion ouverte, quand Admin colle `bouchon` et valide, alors il voit « Jeton posé le
  <date du jour>. » ; la disponibilité de l'assistant, lue **sans** `KANEVAS_STUB` (config injectée),
  est `claude-agent`, sans redémarrage ; aucune réponse des routes du panneau ne contient la valeur du
  jeton (le test cherche la valeur factice dans chaque corps et dans le journal).
- Étant donné la connexion ouverte, quand Admin colle un autre code, alors il voit « La connexion n'a pas
  abouti. Recommencez. » et l'état d'avant (posé ou non) est inchangé ; un second essai valide s'ouvre.
- Étant donné la connexion ouverte et l'horloge passée au-delà de 10 minutes, quand Admin valide, alors il
  voit « La connexion a expiré. Recommencez. » ; le processus est arrêté.
- Étant donné un jeton posé par le panneau et une variable `CLAUDE_CODE_OAUTH_TOKEN` différente, alors
  l'assistant utilise celui du fichier ; après suppression du fichier, la variable reprend.
- Étant donné une connexion ouverte, quand Admin recharge la page, alors le panneau montre l'état lu (« Aucun jeton posé. » ou « Jeton posé… ») sans adresse ni champ « Code » ; quand il clique « Connecter l'abonnement », alors une nouvelle adresse paraît ; et le « Valider » d'un second onglet resté sur l'ancienne connexion dit « La connexion a expiré. Recommencez. ».
- Étant donné le panneau affiché, quand le réseau est coupé, alors « Connecter l'abonnement » (ou « Reconnecter »), « Valider » et « Annuler » sont désactivés et le bandeau s'affiche ; au retour du réseau ils se réactivent.
- Étant donné Léa (hors du groupe), quand elle appelle une route du panneau, alors elle reçoit 404.

## Détail des écrans de `kanevas-outils` (cadrage)

> Cadrage proposé le 2026-10-16 (`epic/kanevas-outils`). Besoins B-57 à B-79, parcours P-17 à P-21,
> décisions AD-121 à AD-137. Écrans structurants, avec maquette finie : **E-20** (`docs/maquettes/e20-outils.html`,
> moment fort de P-17), **E-21** (`e21-carte-galaxie.html`, P-18), **E-22** (`e22-concepteur-vaisseaux.html`, P-19,
> avec la section gérée de E-9). Les textes communs (chargement, erreur, connexion perdue, refus) sont ceux de
> `kanevas-premiere-fiche`. **Format** : les deux outils se jouent au téléphone et à la tablette comme au
> bureau (B-70) : sous 760 px, une colonne, les panneaux sous la carte, les gestes de survol deviennent un appui.

### Ce qu'un outil apporte à l'interface

Trois points d'entrée, selon le contrat du type d'outil (AD-122) : une **carte dynamique** vit dans la section
Cartes (E-10) et s'ouvre sur son écran ; un **générateur** a un écran à lui (E-22) et des **sections gérées** sur
les fiches ; une **aide de jeu** aurait sa propre entrée de barre (aucune ici). Le code d'un outil ne se charge
qu'à l'ouverture de son écran ou quand une fiche montre l'une de ses sections (AD-133). Aucun écran n'est
ajouté ou modifié à la main dans le routeur : un module déclare son point d'entrée.

### E-20 — Outils (onglet de E-14 et de E-15)

**Contenu** : une carte par outil applicable (nom, une ligne, « Système · activé/désactivé », « Univers · suit /
forcé »), ses **dépendances**, sa **visibilité** (deux cases, MJ et Joueurs), ses **réglages** (chacun : valeur
en vigueur, d'où elle vient, « Remplacer pour l'univers »), son **catalogue** (version, nombre d'éléments par
nature, « Importer un catalogue… », « Voir les éléments »), et en pied « Supprimer les données de l'outil… ». En tête, sur E-15, le
**responsable** du système et « Transférer la responsabilité ».

| État | Ce que voit l'utilisateur | Texte |
|---|---|---|
| vide | le système n'a aucun outil applicable | « Aucun outil ne s'applique à ce système de jeu. » |
| chargement | squelettes de cartes | « Chargement des outils… » |
| erreur | la liste ne vient pas | « Impossible de charger les outils. » + « Réessayer » |
| hors-ligne | bandeau ; tous les gestes d'écriture désactivés | « Connexion perdue. » |
| refus | un joueur : « Page introuvable. » ; un MJ non responsable sur le système : lecture seule, gestes **cachés** | — |
| contenu long | 6 outils : liste défilante ; un rapport d'import de 300 lignes : tronqué à 50 refus avec « Voir tout » | « 237 autres refus… » |

Critères :
- Étant donné un outil d'essai qui dépend d'un autre outil désactivé, quand Antor, MJ responsable, tente de l'activer,
  alors il reste désactivé et l'écran dit « <Outil> demande <autre outil> : activez-le d'abord. » (aucun outil SWN n'a de dépendance).
- Étant donné Mira, MJ non responsable d'un univers rattaché, quand elle ouvre E-20 sur le système, alors elle voit
  les outils et leurs valeurs et ni « Activer », ni « Importer », ni « Supprimer les données ».
- Étant donné un fichier de catalogue où une arme n'a pas de masse, quand Antor l'importe, alors l'aperçu liste
  « 1 refusée » avec la clé et le champ `masse`, le reste est proposé à l'application, et rien n'est écrit avant « Appliquer ».
- Étant donné Léa, Joueuse, quand elle force l'adresse de E-20, alors elle lit « Page introuvable. ».

**Les éléments du catalogue** (« Voir les éléments », sur E-14 ; décision de Monsieur du 2026-10-17) : la liste par
nature, chaque élément avec son origine (« Système », « Univers », « Remplacé pour l'univers », « Retiré de
l'univers ») et, pour un élément d'univers, « Visible des joueurs » / « MJ seul ». Gestes d'un MJ de l'univers :
« Masquer aux joueurs » et « Rendre visible » sur un élément d'univers ; « Retirer de cet univers » et
« Rétablir » sur un élément du système. Sur E-15 (système), la liste se lit sans aucun de ces gestes.
- Étant donné l'arme d'univers « Lance d'Orak'Ziel » masquée par Antor, quand Léa ouvre le concepteur, alors
  elle n'est dans aucune liste, et rien ne dit qu'un élément manque ; Antor la voit, marquée « MJ seul ».
- Étant donné la conception de Léa qui porte déjà la « Lance d'Orak'Ziel », quand Antor la masque, alors Léa la voit
  toujours sur son vaisseau et le réenregistre sans alerte ; elle ne peut plus l'ajouter ailleurs.
- Étant donné le « Laser à impulsion » du système remplacé pour « Éneria d'essai » puis masqué, quand Léa ouvre le
  concepteur, alors aucun « Laser à impulsion » n'est dans sa liste (ni l'élément d'univers, ni celui du système) ;
  une conception qui le porte est calculée avec les valeurs de l'univers.
- Étant donné la coque du système « Corvette » retirée d'« Éneria d'essai », alors aucun compte de cet univers
  ne la voit dans le concepteur ; l'autre univers du système la voit ; « Rétablir » la fait revenir.

### E-21 — Carte de la galaxie

**Contenu** : un canevas hexagonal (déplacement, zoom, pincement), la légende, un panneau du système sélectionné
(nom, taille, notes lisibles, routes, lien partageable), la mesure au survol (au toucher : appui), l'outil
« Trajet » (départ, arrivée, routes : toutes / publiques, moteur → distance et durée), la recherche d'un système
(parmi ceux qu'on lit). MJ : « Placer un système », « Promouvoir », « Tracer une route », « Dessiner une zone »,
« Renommer », « Supprimer la galaxie… » (confirmation : « Les 214 systèmes, 49 routes et 6 zones de cette galaxie seront effacés. »), « Graine… », « Document MJ… » (choisir la fiche, ou en créer une de type Savoir ; l'outil y écrit la section gérée « Document MJ », MJ seul), le mode Joueur. La vue ne demande que les blocs qu'elle montre.

| État | Texte |
|---|---|
| vide | MJ : « Aucun système défini. Placez-en un ou promouvez un système généré. » ; Joueur : « Rien à voir sur cette carte pour l'instant. » |
| chargement | « Chargement de la carte… » (blocs qui arrivent au fil) |
| erreur | bloc qui ne vient pas : le bloc reste vide, « Impossible de charger une partie de la carte. » + « Réessayer » |
| hors-ligne | la vue affichée reste, bandeau « Connexion perdue. », écritures désactivées |
| refus | carte non visible pour le rôle, ou outil invisible : « Page introuvable. » (MJ en mode Joueur sur carte cachée : l'avis de E-11) |
| contenu long | 500 systèmes définis, 49 routes : l'étiquette des noms se replie au dézoom ; noms de 80 caractères tronqués |
| conflit | « Ce système a changé depuis que vous l'avez ouvert. » + « Recharger » |

Critères :
- Étant donné Léa, Joueuse, quand elle cherche « Station fantôme » (un système fantôme du MJ), alors la recherche ne
  trouve rien, sans trace d'un masquage, et aucune route ni zone n'y mène sur sa carte.
- Étant donné Léa à 390 px de large, quand elle appuie sur « Vael », alors le panneau s'ouvre sous la carte avec
  nom, distance et « Trajet depuis ici ».
- Étant donné le trajet « Port-Sel » → « Vael » de 7 cases au moteur 2, quand Léa le calcule, alors elle lit « 4,5 jours ».
- Étant donné Antor, MJ, qui passe en mode Joueur, alors la route privée et le territoire secret disparaissent de la
  carte, du trajet et de la recherche.
- Étant donné deux visites de la même case anonyme, alors le même système est généré ; changer la graine demande la
  confirmation qui dit que tous les systèmes non définis changent de place.

### E-22 — Concepteur de vaisseaux

**Contenu** : la **liste** des conceptions lisibles (nom, coque, classe, prix, alertes) et l'**atelier** d'une conception : à
gauche les choix par nature (coque, moteur, aménagements, défenses, armes, modifications) pris dans le catalogue
du système complété par celui de l'univers (un élément local est marqué « Univers »), à droite les résultats
(prix, PV, CA, puissance et masse libres, chantier, entretien) et les **alertes** (« Bloquante » / « À surveiller »),
« Enregistrer », « Recalculer » quand la conception est « calculée avec d'anciens réglages » ; MJ : « Générer les fiches de règles… » (crée les fiches de règles absentes, une par nature, et celle des exemples ; met à jour les autres, sections gérées). Sur E-9, la section
gérée montre son bandeau et un lien « Ouvrir dans le concepteur ».

| État | Texte |
|---|---|
| vide | liste : « Aucune conception. » (MJ : « Créez une fiche de vaisseau, puis ouvrez-la ici. ») ; catalogue sans éléments : « Le catalogue du système est vide. Importez-en un (Outils). » |
| chargement | « Chargement du concepteur… » |
| erreur | « Impossible de calculer ce vaisseau. » + « Réessayer » (jamais un résultat partiel) |
| hors-ligne | choix verrouillés, « Connexion perdue. » |
| refus | conception illisible : « Page introuvable. » ; non-auteur : lecture seule, « Modifier » absent |
| contenu long | 40 aménagements : liste filtrable par nature ; une conception à 30 alertes : bloquantes d'abord |
| conflit | « Cette conception a changé depuis que vous l'avez ouverte. » + « Recharger » |
| périmé | « Calculée avec d'anciens réglages. » + « Recalculer » (rien n'est recalculé sans le geste) |
| élément retiré | alerte « Bloquante » « Élément retiré de cet univers » sur la ligne de choix ; « Enregistrer » refusé tant qu'il n'est pas remplacé ; le texte de la section ne change pas (B-62, décision de Monsieur du 2026-10-17) |

Critères :
- Étant donné Léa, autrice de « Caractéristiques » du « Vent d'Orak », quand elle ajoute une arme qui dépasse la puissance,
  alors une alerte bloquante « Puissance insuffisante » s'affiche et « Enregistrer » est refusé avec le motif.
- Étant donné Léa sur la fiche E-9, alors « Caractéristiques » montre « Générée par le concepteur de vaisseaux » et aucun éditeur.
- Étant donné Antor qui change la portée de saut d'un réglage d'univers, alors la conception de Léa montre « Calculée avec d'anciens
  réglages » et son texte n'a pas changé tant que personne n'a recalculé.
- Étant donné le concepteur désactivé, alors la fiche montre « Caractéristiques » en version texte avec « Outil désactivé ».
- Étant donné Teo, sans rôle dans l'univers, quand il force l'adresse d'une conception, alors « Page introuvable. ».
