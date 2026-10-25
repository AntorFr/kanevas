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

## Screen details for `kanevas-monde`

> The E-12 update proposal block, and nothing else: no new screen, no
> new screen address. Same six states and common text as `kanevas-premiere-fiche`
> (loading, connection lost, session expired); only specific text is repeated.
> Mockup `docs/maquettes/e12-propositions.html` (before the style guide: content and states only) (dark theme; block in its states,
> on desktop and phones). Component: `docs/charte.md` « Proposition de mise à jour ».

**How a proposal is created.** The GM writes in the E-12 field, naming the section and
session report: « Mets à jour la section Vérité d'Aldric d'après le compte-rendu de la séance 3 ».
The assistant does not know which screen the person is on (AD-75 sends only the message and
thread): the report is named in the request. The assistant's answer accompanying the block is free-form model text (the mockup illustrates one). The assistant reads the report and section, then calls
`proposer_mise_a_jour` (AD-80): **nothing is written in the section**. The response carries a
`proposition_creee` event (AD-76) that the thread renders as a « Mise à jour proposée » block, below
the assistant's answer, in place of an « Écrit par l'assistant » block.

### « Mise à jour proposée » block

From top to bottom:

- **header**: « Mise à jour proposée »; below, the target section, « Section « Vérité » de
  « Maître Aldric » », and the source, « d'après « Séance 3 » »;
- **two plain text areas side by side** (AD-58; *since `kanevas-import`, rendered in Markdown through AD-95's renderer, GM view, with a « Rendu / Source » toggle above both*), labelled « Actuel » and « Proposé »; below
  760 px they stack, « Actuel » first. « Actuel » shows the **current** section
  content at display time (not the proposal's content); an empty section reads « (section vide) »;
- **actions**: « Appliquer » (primary), « Abandonner », and an « Ouvrir » link to the sheet
  (E-9, at the section).

The block is read **from the server** on every display and after every action (AD-82): an old block
in the thread tells the current truth, not the truth at creation. « Appliquer » writes the proposed content
in the section (AD-81); « Abandonner » deletes the proposal. Neither goes through
the assistant.

**What each role sees.** The GM who requested the proposal: the whole block. The Player does not have
the tool (AD-80), therefore never the block; if they request an update, the assistant answers that it
cannot, without an event (free-form model text, as for creating a scenario). Another GM
of the same universe does not see their colleague's proposal: **hidden**, its address responds like an unknown address (it belongs only to its
requester, AD-79); the instance admin without a role has no E-12. A GM in a sheet's player mode keeps their actual catalogue (AD-74): they can propose and apply.
Any read of the proposal by another account responds like an unknown address (AD-81).

| State | What is shown | Available actions |
|---|---|---|
| empty | not applicable: the block only exists with a proposal (the tool refuses empty content, AD-80), so « Proposé » is never empty; an empty section reads « (section vide) » in « Actuel » | — |
| loading (reading the proposal) | no header; « Chargement de la proposition… » (`role="status"`); no areas or actions | keep writing in the thread; close |
| pending | header, « Actuel » and « Proposé », actions | « Appliquer »; « Abandonner »; « Ouvrir » |
| rereading (after an action, or when displaying a previously read block) | old content stays readable, without « Chargement… »; actions disabled (`aria-disabled`) during reread | read; « Ouvrir » |
| applying or abandoning | « Appliquer » (or « Abandonner ») shows « … »; both actions disabled (`aria-disabled`); areas unchanged | wait |
| applied | header remains (target section, source); « Appliquée : la section « Vérité » est à jour. » (`role="status"`); « Actuel » shows applied content, « Proposé » disappears; no action except « Ouvrir » | « Ouvrir » |
| abandoned (by this action) | header remains (target section, source); « Proposition abandonnée. » (`role="status"`); no more areas or actions | keep writing in the thread |
| stale (section changed since the proposal, by anyone), seen on display **or discovered on clicking** « Appliquer » (`section_modifiee` refusal: block reread and moves to this state, nothing written) | « La section a changé depuis la proposition. Demandez-en une nouvelle. » banner (`role="alert"`) above the areas; « Actuel » shows current content; « Appliquer » disabled (`aria-disabled`) | « Abandonner »; « Ouvrir »; request a new proposal in the thread. An **applied** proposal never becomes stale: it stays applied even if the section later changes |
| error | on read: « Je n'ai pas pu afficher la proposition — réessayer » (`role="alert"`) with « Réessayer » which rereads it; on an action: « L'action n'a pas abouti. Réessayez. » (`role="alert"`) above the actions, proposal stays pending, actions re-enabled | « Réessayer »; repeat the action |
| connection lost | common banner (« Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas. », text from `kanevas-premiere-fiche`); readable areas; « Appliquer » and « Abandonner » disabled; lost during an action, the response is lost: « … » disappears, actions stay disabled, and when connection returns the proposal is reread — block says what the database says (applied or pending), never an assumed state | read; « Ouvrir » |
| refusal (unknown address: abandoned elsewhere, deleted with its section, other account, GM removed from universe) | « Cette proposition n'existe plus. »; no more areas or actions; session expired: person taken to sign-in, thread lost | keep writing in the thread |
| already applied, seen from another tab | same rendering as applied (read gives state, AD-82); a racing « Appliquer » or « Abandonner » returns 409 `proposition_appliquee` and block is reread | « Ouvrir » |
| long content | 100 000-character content: each area has a maximum height of 15 lines and scrolls (`tabindex="0"`, labelled « Actuel » / « Proposé »); paragraphs (blank lines) preserved; a 120-character sheet or report title wraps | scroll each area |

The proposal lives in the database (AD-79) but the thread does not (AD-28): on page reload, universe change or
after « Nouvelle conversation », the block disappears from the thread and the proposal becomes unreachable; it
stays in the database until replaced by a new one for the same section (AD-79). Accepted, bounded V1 limitation: one
pending proposal per section and per GM.

*Criterion.* Given Léa who wrote the « Séance 3 » report and the « Maître Aldric » sheet
whose « Vérité » says « Il sert la Couronne », when Antor asks his assistant to update
« Vérité » from this report, then the thread shows « Mise à jour proposée » with « Actuel »
and « Proposé » and **the section has not changed** (the sheet, opened alongside, proves it); when he clicks « Appliquer », the section
shows the proposed content and the block says « Appliquée »; when another proposal is made and then
someone edits the section, « Appliquer » is disabled and the banner explains why; Léa,
asking her assistant the same thing, receives no proposal.

### Closure of `kanevas-monde`

B-21 → « Mise à jour proposée » block (all its rows); B-27 → propose (generation remains with
`kanevas-images`). Journey: P-5 steps 2 and 3. Roles: GM has the block and its actions, Player
does not, instance admin without a role has no E-12. One migration (the `propositions` table, numbered
at merge, AD-51). Still outside this slice: applying by a player, batch proposals,
resuming a proposal after reload.

## Mockups

`docs/maquettes/<écran>.html`, one per structural screen. They illustrate; this document decides,
and when the two diverge, the mockup is wrong.

**Finished** (direction, tokens and components from `docs/charte.md`, both themes, desktop and
phones, real content): E-1, E-3, E-4, E-6, E-8, E-9, E-14 (reference list; other sections refer to it). Since `kanevas-illustrations`, `e08` is the card grid
(types « Personnages », « Lieux », « Factions », `#etat-lieux`, `#etat-factions`) and `e09` carries the header
illustration; their images are demo illustrations painted in SVG. E-15 and E-16
(`e15-systeme-de-jeu.html`, `e16-systemes-de-jeu.html`) are finished outside the universe shell;
the universe selector menus in mockups `e03`, `e08`, `e09`, `e14` and the `e01` sidebar carry
« Systèmes de jeu ». `e09-fiche.html` **is the reference for the
shell** of every universe screen (sidebar, universe selector, account menu,
top bar, mode toggle, « Demander à Kanevas » button, drawer on phones) and shared
components. Their states open through the address (`#etat-joueur`, `#etat-menu`,
`#etat-perdue`…; the list is at the top of their styles). The « Cartes visibles » block in `e03` and mockups `e10` and `e11` belong to
`kanevas-cartes-graphes` (details below).

**Finished by the `kanevas-import` framing**: `e09-fiche-importee.html` (E-9: Markdown, links,
GM block, ancestor trail, « Contient », « Mentionnée dans », sheet menu), `e18-acces-api.html`
(E-18), `e14-types-de-fiche.html` (E-14 and E-15 « Types de fiche » panels, universe
deletion) and `e19-mediatheque.html` (E-19: images and documents, the picker), within the shell and with the components
of `e09-fiche.html`.

**Before the style guide**: the others (e02, e05, e07, e10, e11, e12-assistant, e12-propositions, e13). They specify content and vocabulary rather than
appearance; a screen with only these mockups is built within the shell and with the components of the
E-9 mockup.

**Outside the product, in stub mode only**: the component demo page
(`/demo-composants`), served when `KANEVAS_STUB=1` and otherwise absent (404), like the test account
selection screen.

## Screen details for `kanevas-cartes-graphes`

> E-10 Maps, E-11 Map (illustrated map and graph), the E-3 « Cartes visibles » block, the « Cartes »
> sidebar item (appears with this slice). Same states (B-29) and common text as
> the first sheet (loading, error, connection lost, write in progress, failed write,
> refusal « Page introuvable. », session expired). Mockups: `e10` (list: GM, Player, empty,
> creation error) and `e11` (illustrated map and graph: GM, GM in player mode, Player, states).
> The document takes precedence over the mockup.

### E-10 Maps

Title « Cartes », subtitle « Les cartes de l'univers. Les joueurs ne voient que celles que vous rendez visibles. » (GM only), then the list of **universe maps the account can read**: GM sees
them all; a Player sees only those that are **visible**. A
row: a thumbnail (illustrated map background, neutral pattern without a background or for a graph), the
title, form (« Carte illustrée » or « Graphe »), and for the GM the « Visible des joueurs » or
« MJ seul » state (only the latter is an amber badge) with the reverse action: « Rendre visible » / « Cacher aux joueurs », which
takes effect on click. Clicking the title opens the map (E-11). Order: alphabetical title, then creation;
one hundred maps per page and « Charger la suite ».

*Create (GM).* At the top, « Nouvelle carte » opens an inline form: **« Titre »** (1 to 80
characters), **« Forme »** (« Carte illustrée » by default, or « Graphe »; cannot be changed
later), and for an illustrated map **« Image de fond »** (« Choisir une image », optional: choosing
sends nothing, the image is sent with « Créer »). « Créer » leads to the map (E-11), **not visible**; a
graph starts empty, its sheets are selected on the map. « Annuler » closes the form.

| Role | See | Create | Make visible / hide |
|---|---|---|---|
| GM | all universe maps | yes | yes |
| Player | visible maps; neither visibility state nor action | **absent** | **absent** |
| GM in player mode | E-10 offers no toggle: GM always sees the full list here; player mode is on E-11 | — | — |
| Instance admin, or account without a universe role (Teo) | none (« Page introuvable. ») | — | — |

*Text.* No map: GM « Aucune carte pour l'instant. Créez-en une pour commencer. » (form
still available); Player « Aucune carte n'est visible pour l'instant. »; empty or
long title: « Erreur : le titre est obligatoire. » / « Erreur : 80 caractères au plus. »; background that
is not a PNG, JPEG, GIF or WebP image, or is empty: « Erreur : ce fichier n'est pas une image (PNG,
JPEG, GIF ou WebP). »; background above 25 MB (413 response): « Erreur : l'image dépasse 25 Mo. »; failed
creation: « La carte n'a pas pu être créée. Réessayez. », form keeps its input (including the chosen
background). A thumbnail that fails to load shows the neutral pattern.

| State | What is shown | Available actions |
|---|---|---|
| empty | text above; for GM, « Nouvelle carte » | create (GM) |
| loading | only « Chargement… », in place of the screen | — |
| error | « Impossible de charger cette page. »; failed visibility change: « L'action n'a pas abouti. Réessayez. » and previous state | « Réessayer » |
| connection lost | the banner; « Nouvelle carte », « Créer », « Rendre visible », « Cacher aux joueurs » disabled; loaded list remains | open an already listed map |
| refusal | Instance admin, or account without a role: « Page introuvable. » and « Mes univers » | « Mes univers » |
| long content | an 80-character title wraps; 100 maps, then « Charger la suite » (« Impossible de charger la suite. » and button remains on failure) | load more |

*Criteria.*
- Given Antor, GM, creating « La ville de Brume » (illustrated map, with a background) then returning to
  the list, then Léa does not see it; when Antor clicks « Rendre visible », she sees it without
  the visibility state or action.
- Given a « plan.pdf » file chosen as background, then creation is refused with the text
  above and nothing is created.
- Given Teo, without a universe role, when he forces the list address, then he sees
  « Page introuvable. ».

### E-11 Map

At the top: title (GM: « Renommer » — an inline field, 1 to 80 characters, « Enregistrer » /
« Annuler »), form, visibility state, and for the GM the **GM mode / player mode toggle** (from the top bar) and
« Rendre visible » / « Cacher aux joueurs ». Below, the map **frame**, then the
« Sur la carte » list, then (graph) the « Liens » list.

*Illustrated map.* The frame shows the background image at its aspect ratio (neutral 16/10 without a background, AD-70);
each **token** is a circle with the first letter of its sheet's title, with the title underneath
(24 characters, then « … »). Its clickable area is at least 44 px. A token is present only if its
sheet is readable by the reader (AD-38). **Player**: touching a token opens the sheet (E-9); nothing else.
**GM (GM mode)**: a click **selects** the token, highlights it (amber ring, the GM colour) and opens, below the frame, an amber-bordered GM panel « Maître
Aldric · Personnage » with « Ouvrir la fiche » and « Retirer de la carte » (this button requires the same confirmation as the « Sur la carte » list: nothing is removed on first click); a token is **moved** by
dragging, or with the keyboard (selected token: arrows, 1%, with Shift 5%; the « Flèches : déplacer de 1 % (Maj : 5 %) » help is displayed below the frame); position is saved on
release (or keypress); outside the frame it is clamped to the edge. « Ajouter une fiche » opens a
window: a **type** choice (the seven; *since `kanevas-import`, the product list, enabled types first, AD-102*), a search field (started with « Chercher » or Enter; more than 100 characters: « 100 caractères au plus. »), the list of sheets of this type
(those the GM reads: all), each with « Ajouter »; a sheet already on the map has « Déjà
sur la carte » without a button. « Fermer » closes the window. The token appears at the **centre** (50%, 50%), ready to move.
« Changer le fond » (« Ajouter un fond » if there is none) opens the picker: **choosing the image
is enough**, it is sent immediately and replaces the previous one.

*Graph.* The frame is a diagram: one **node** per sheet (circle, first letter, title underneath, 24
characters), one arrow per **link** from the sheet carrying the relation to the target sheet, with the
relation type written on the arrow (link from A to B: « membre de »). Layout is handled by
the browser (AD-71); it cannot be edited. A node's clickable area is at least 44 px; the
frame takes the width the page gives it (never less than a node plus its margins), and its height
grows with the number of node rows; each node occupies its own cell (150 × 70 px) in a
grid, so two nodes never overlap; what does not fit the width (phones)
scrolls, and the « Sur la carte » list remains the reliable touch path. Player: touching a node opens its sheet. GM: a
click selects the node, with « Ouvrir la fiche » and « Retirer de la carte » (same wording and confirmation as the « Sur la carte » list); « Ajouter une fiche »
is the same window. A relation added or removed on a sheet appears on map
reload.

*« Ajouter une fiche » window* — its own states, because it is where the choice is made. **Empty**: a type with no
sheet, « Aucune fiche de ce type. »; a search without results, « Aucune fiche ne correspond. ».
**Loading**: « Chargement… » in place of the list, type choice and search already present.
**Error**: « Impossible de charger les fiches. » and « Réessayer », window stays open.
**Connection lost**: the banner; « Ajouter » disabled, loaded list remains. **Long content**:
one hundred sheets per page and « Charger la suite » (« Impossible de charger la suite. » on failure);
an 80-character title wraps. **Refusal**: not applicable, window exists only for the
GM outside player mode.

Every E-10 and E-11 action has a Lucide icon (`docs/charte.md`, “Icons” rule): rename a pencil, make visible / hide an eye / crossed-out eye, add a sheet a plus, background an image, remove a bin, open the sheet an external link.

*« Sur la carte »* (list below the frame, always present when there are elements): one row per
token or node, title linking to the sheet, type; for the GM, « Retirer de la carte »
(inline confirmation: « Retirer « Maître Aldric » de cette carte ? La fiche reste. » with
« Retirer de la carte » and « Annuler »); also the keyboard and screen-reader path.
*« Liens »* (graph): one « Maître Aldric — membre de → Les Lames Grises » row per link; no links:
« Aucun lien entre ces fiches. ».

*Visibility and player mode.* « Rendre visible » makes the map readable by Players; « Cacher aux
joueurs » removes it from them (on their next load: it answers « Page
introuvable. »). **Player mode** (AD-39) shows the GM the map as a Player who authors no section would
see it: same tokens, same nodes, same links, no editing
actions. On a **non-visible** map, the GM in player mode sees « Les joueurs ne voient pas
cette carte : elle n'est pas visible. » with « Quitter le mode Joueur » (a Player would receive
« Page introuvable. »).

| Role | See | Actions |
|---|---|---|
| GM | map, all its elements (any sheet in the universe), all links | rename; make visible or hide; background; add a sheet; move (illustrated map); remove; player mode; open a sheet |
| GM in player mode | like a Player | open a sheet; leave mode |
| Player | a visible map; elements whose sheet they can read, links whose relation (AD-64) and both ends they can read; **no count of what is missing** | open a sheet |
| Instance admin, or account without a universe role (Teo) | none | « Page introuvable. » |

An action a role lacks is **absent** from the screen (never greyed out, except offline). Through the API,
a write action by a non-GM is refused with **403** on a map they can read; on a map they cannot
read, **404**. A token whose sheet becomes unreadable disappears on next load, without a trace.

*Text.* Illustrated map without tokens: GM « Aucun token. Ajoutez une fiche pour la placer sur la
carte. »; Player « Rien à voir sur cette carte pour l'instant. ». Graph without nodes: GM « Aucune fiche.
Ajoutez des fiches pour voir leurs liens. »; Player « Rien à voir sur ce graphe pour l'instant. ».
Background: non-image or empty file « Erreur : ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP). »,
above 25 MB « Erreur : l'image dépasse 25 Mo. ». 100 elements: « Cette carte porte déjà 100
éléments. ». Sheet becoming unknown during addition: « Cette fiche n'existe plus. » (window list
reloads). Failed move, removal, addition, rename, visibility change or
background change: « L'action n'a pas abouti. Réessayez. », and previous state returns (token returns to its
position); ongoing input is preserved. Empty or long title: E-10 text. Background failing to
load: inside the frame « Le fond de la carte n'a pas pu être chargé. » with « Réessayer »;
tokens are not placed (their positions make sense only on the background), the « Sur la carte » list
remains. Offline, the already loaded background stays displayed.

| State | What is shown | Available actions |
|---|---|---|
| empty | « Aucun token », « Aucune fiche », « Rien à voir… » text; « Aucun lien entre ces fiches. » for a graph without links | GM: add a sheet |
| loading | « Chargement… »; neutral 16/10 frame until background loads (« Chargement… » inside), tokens placed when background is present | — |
| error | « Impossible de charger cette page. »; background: frame message; failed write: « L'action n'a pas abouti. Réessayez. » | « Réessayer » |
| connection lost | the banner; rename, visibility, background, « Ajouter une fiche », move, remove disabled (illustrated map: tokens become sheet links, without selection or dragging; graph: selection remains); loaded map remains | read, open a sheet |
| refusal | map unknown or unreadable, account without a role or Admin: « Page introuvable. » and « Mes univers »; GM in player mode on a non-visible map: its specific sentence | « Mes univers », « Quitter le mode Joueur » |
| long content | an 80-character title wraps; 100 elements: 24-character titles then « … » (full title in the « Sur la carte » list, which scrolls); a very wide or tall image keeps its aspect ratio and fits the width; phones: frame takes full width, single column | — |

*Criteria.*
- Given the illustrated « La ville de Brume » map with a background, where Antor places « Maître Aldric »
  and « Les Ombres de Fer » (faction of which Léa reads no section) then makes it visible, when Léa
  opens it, then she sees the background and Aldric's token, neither the faction's token nor title, nor
  « Les Ombres de Fer » in the « Sur la carte » list; when she touches Aldric's token, then
  she reaches his sheet.
- Given the same map, when Antor switches to player mode, then he sees exactly what
  Léa sees; when he hides it from players, then Léa, on reload, sees « Page introuvable. » and the
  map is no longer in her list.
- Given Antor moving Aldric's token then reloading, then it is at its new position;
  a failure during the move returns it to the old one and displays « L'action n'a pas abouti.
  Réessayez. ».
- Given the « Les factions » graph with « Les Lames Grises », « Les Corbeaux » and « La
  Guilde »; the « allié de » relation from the first to the second, carried by a section
  Léa does not read, and « rival de » from the first to the third, carried by a section she reads:
  Antor sees both links; Léa, who reads all three sheets in this graph, sees only « rival de »;
  if she could not read « La Guilde », she would see two nodes and no link.
- Given a graph where Antor also placed « Les Ombres de Fer » (Léa reads none of its sections),
  then Léa sees neither its node nor its links, and no trace of their absence.
- Given « plan.pdf » chosen as a map background, then the refusal appears and the previous background
  remains; the background address of a non-visible map returns 404 to Léa.
- Given Léa on a map, when she forces the address of a GM action, then she receives 403.

### E-3 — the « Cartes visibles » block

On the overview, a **« Cartes visibles »** block (the `e03` mockup title), registered in the E-3 block registry (one file in
`frontend/src/ecrans/vue-ensemble/blocs/` found automatically by the registry (ranked after campaign and
report blocks); no existing block is changed). For all roles, it lists **maps
visible to players** (five at most, alphabetical title): title linking to E-11 and form;
below, « Toutes » to E-10. Each map is a thumbnail (map background, or neutral pattern
for a graph or map without background) with a map icon, title and form. The GM therefore sees what the table sees; « MJ seul » maps
are on E-10.

| State | What is shown | Available actions |
|---|---|---|
| empty | GM: « Aucune carte visible des joueurs. » and « Toutes »; Player: **no block** (neither title nor count) | GM: « Toutes » |
| loading | block title and « Chargement… » | — |
| error | « Impossible de charger les cartes. » | « Réessayer » |
| connection lost | the banner; already loaded maps remain | open |
| refusal | not applicable: E-3 refusal covers the block (« Page introuvable. ») | — |
| long content | title fits on one line, then « … »; beyond five maps, five and « Toutes » | — |

| Role | See |
|---|---|
| GM | block, with only maps visible to players |
| Player | block if at least one map is visible, otherwise no block |
| Instance admin, or account without a role | none: E-3 answers « Page introuvable. » |

*Criterion.* Given two visible maps and one « MJ seul », then Léa's block lists two;
Antor's does too.

### Closure of `kanevas-cartes-graphes`

B-22 → E-10 (create an illustrated map with its background, or a graph) and E-11 (place tokens,
choose a graph's sheets); B-23 → « Rendre visible » and a player's filtered read;
B-12 (map) → E-11 player mode. Reached by P-3 step 6 (place the NPC, player mode, make
visible), P-6 step 3 (a player's map) and all of P-9 (graph). Screens E-10 and E-11
and the E-3 block provide their six states (B-29), above.

## Screen details for `kanevas-import` (scope)

> Scope proposed on 2026-10-11 (`epic/kanevas-import`). Needs B-32 to B-56, journeys P-10 to P-16,
> decisions AD-95 to AD-111. Slices detail their screens within this framework; they do not
> invent it. Key screens, with finished mockups: **E-9** (the imported sheet, the key moment
> of P-12), **E-18** (API access, P-10 and P-11), **E-14 / E-15 « Types de fiche »** (P-13), **E-19** (media library, P-16). E-17 and
> the E-8 tree are described here without mockups: they use E-8's components
> (grid, search, chips). Common texts (loading, error, connection lost, refusal)
> are those of `kanevas-premiere-fiche`.

### Markdown, wherever long text is written

Sections (E-9), scenarios (E-7), system entries (E-15), session reports (E-9): the text is
Markdown (B-32, AD-95). **What is formatted**: paragraphs (a single newline remains a
newline, as with the previous plain text), headings `#` to `####` (`#` and `##` at the same level, rendered below the
section title, never above it), bold, italic, strikethrough, bulleted and numbered lists, quotations, code,
rules, tables, web links (`http`, `https`, `mailto` only; they open in a new
tab), media library files (an image `![légende](fichier:…)`, a document `[nom](fichier:…)`, B-44), sheet links (`[[…]]`, B-33),
GM blocks (`:::mj` … `:::`, B-34). **What remains text**: any HTML written in the content, an
image from another address (its alternative text is displayed instead), a link with another scheme.

**Depending on the text** (AD-97): in a **section** (and a session report), all of the above. In a
**scenario** (E-7), `[[…]]` links target sheets in its campaign's universe, resolved under the
same permissions (a scenario's reader is a GM of that universe); they do not count in
« Mentionnée dans » (a scenario is not a sheet); no file or GM block (a scenario does not
reference the media library and is already GM-only). In a **system entry** (E-15), shared between
attached universes: **no `[[…]]` link** — `[[…]]` remains text as written, and the editor has
neither « Lien vers une fiche » nor the list opened by `[[`; no file or GM block either. In
both scenarios and system entries, `![…](fichier:…)`, `[…](fichier:…)` and `:::mj` **are not interpreted**:
they remain text, displayed as written (the same rule as `[[…]]` in a system entry); the import
API does not refuse them.

**The editor** (inline editing, charter's inline editing section): the text field keeps the reading
font; above it, a discreet toolbar — « Gras », « Italique », « Lien vers une fiche »,
« Fichier », and for a GM « Bloc MJ » (wraps the selection) — and the « Écrire /
Aperçu » toggle. Shortcuts: Ctrl/⌘+B, Ctrl/⌘+I, Ctrl/⌘+K (sheet link), Escape cancels, Ctrl/⌘+Enter
saves. Typing `[[` opens E-8's search list (`ListeRecherche`, all types) at the insertion
point; choosing a sheet inserts `[[<id>|<titre>]]`, Escape closes the list and leaves `[[`. The
counter reads « 12 480 / 100 000 ».

**Rendering**: a link to a readable sheet uses `--accent-texte`, a thin underline, and the type icon
on hover; to an unreadable sheet: text, without any mark; **broken link** (GM only): text
with a dashed `--danger` underline, tooltip « Lien cassé : cette fiche n'existe plus. »; **pending import
link** (GM only): dashed `--texte-3` underline, tooltip « Lien en attente : aucune
fiche n'a encore la clé « personnage:aldric ». ». A **GM block**, for the GM outside Player mode, takes
the GM-only section's styling (hatched texture, amber rule, « MJ seul » `lock` chip) **inside** the
section, at its place in the text; in Player mode and for any other reader, it does not exist — no
gap, no rule, the next paragraph follows the previous one. A wide table scrolls inside its frame
on a phone, never the page.

### Markdown — what `kanevas-import-markdown` builds (E-9, E-7, E-15, E-12)

This slice delivers rendering and the editor **without** `[[…]]` links, files or GM blocks (their
slices add them to the same toolbar and rendering). Mockup: `e09-fiche-importee.html`,
`#etat-edition` for the editor; `e07-scenario.html`, `e15-systeme-de-jeu.html` and `e12-propositions.html`
for the rendering location (content becomes formatted there, the layout stays the same).

- **Journeys**: reading, P-12 step 2 (E-9, E-7, E-15, E-12); writing and previewing, P-14 step 1 (E-9, E-7, E-15).
  A session report's text is rendered on E-9; E-6's « Nouveau compte-rendu » dialog keeps its
  simple field in this slice, with the 100,000 limit (« Erreur : 100 000 caractères au plus. ») and
  no toolbar or preview; its counter and « Erreur : 100 000 caractères au plus. » error already exist (mockup `e06`): only the
  threshold changes from 20,000 to 100,000; its other states are those of E-6 and do not change.
- **Mockups**: `e09-fiche-importee.html` (`#etat-edition`, `#etat-apercu`) shows the epic's **complete** toolbar
  (with « Lien vers une fiche », « Fichier », the list opened by `[[`); this slice
  builds only « Gras », « Italique » and the toggle, the other buttons come with their slices. The
  toggle is a group of two options (`role="radio"`, `aria-checked`) as in the mockup. The
  E-7, E-15 and E-12 mockups keep their layout: the editor is the same there; E-12's « Rendu / Source »
  toggle is added above the two areas, like the « Écrire / Aperçu » toggle.
- **Rendering**: a single component shows the server-rendered HTML everywhere (sections and
  session reports on E-9, E-7 scenario, E-15 entries, E-12 areas). Headings `#` and `##`
  appear at the highest subheading level, `###` and `####` lower: never at the
  section title's level. A web link opens in a new tab. Wide table: it scrolls inside its
  frame. Empty content: « Rien d'écrit pour l'instant. » (already today's text). Previous
  content (plain text) reads as before: paragraphs and newlines.
- **Editor** (E-9, E-7, E-15): the field, above it the
  « Gras » (`bold`), « Italique » (`italic`) toolbar and the « Écrire / Aperçu » toggle (two buttons, one
  active, `role="radio"`); below the field, the « 12 480 / 100 000 » counter. Ctrl/⌘+B and Ctrl/⌘+I wrap
  the selection (or insert two marks and place the cursor between them), Ctrl/⌘+Enter saves,
  Escape cancels. « Aperçu » replaces the field with the output of the same rendering function used for reading; the entered
  text stays in the field and returns with « Écrire ». The « Lien vers une fiche » and « Fichier » buttons do not exist yet;
  « Bloc MJ » is described below (E-9, GM block).
- **Preview states**: in progress, « Aperçu en cours… » (the field stays, toggle disabled); empty
  text, « Rien à prévisualiser. »; failure or offline, « L'aperçu n'a pas abouti. Réessayez. » with
  « Réessayer », and the field intact (also the message for an expired session or a server refusal: entered text is not lost); more than 100,000 characters, no call, « Erreur : 100 000
  caractères au plus. » below the field. Beyond 100,000, today's E-9 behavior
  (§ E-9, long content) holds with the new threshold.
- **Who sees what**: reading shows only the rendering. The editing field receives the **source**:
  it is sent only to those who may write the section (for a scenario, to the GM reading it). A player, or a GM
  in Player mode, does not receive it; Léa's read response does not contain the Markdown.
- **E-12**: above the « Actuel » and « Proposé » areas, two « Rendu / Source » buttons (« Rendu »
  by default); « Source » shows both areas' raw Markdown, side by side as today. The conversation
  thread stays text. After « Appliquer » or « Abandonner », the « Rendu / Source » choice is
  kept; a stale proposal keeps both areas readable in the chosen mode.
- **Extreme cases**: an E-12 area keeps its 15-line height and scrolls; a word or address without
  spaces wraps without widening the page at 375 px; an image from another address
  (`![plan](https://…)`) reads « plan » (its alternative text), without an image.
- **Roles**:

  | | GM | Reading player | Player writing the section | GM in Player mode |
  |---|---|---|---|---|
  | Reads the rendering | yes | yes | yes | yes |
  | Receives the source | yes | no (the field is absent from the response) | yes | like the role being imitated |
  | Toolbar, preview, counter | while editing | hidden | while editing | like the role being imitated |
  | E-7, E-12 | editor for the GM, rendering for readers | screen absent (404, GM only) | screen absent | screen absent |
  | E-15 (attached system) | editor for the GM, rendering | rendering only, neither source nor toolbar (field absent) | not applicable | rendering only |
- **Limit**: 100,000 characters for a section, session report, scenario, system entry and
  proposed content; beyond that the server answers 400 « Contenu trop long : 100 000 caractères au plus. ».

### `[[…]]` links — what `kanevas-import-liens` builds

*Recognized* (AD-116): `[[<id>|<texte>]]` (the identifier is an integer ≥ 1) and `[[cle:<clé>|<texte>]]`
(an import origin key), and on write only `[[<id>]]`. Text is 1 to 200 characters, without
`]`, `|` or newlines; a form that fails these rules, or occurs in a code block
or inline code, remains text. `[[cle:…]]` is accepted from both import and editor (same
resolution). An `[[<id>]]` written without text is **rewritten** by the service as `[[<id>|<titre courant>]]`
before saving, if the author can read the sheet; otherwise the write is refused (400, code `lien_illisible`,
« Cette fiche n'existe pas ou vous ne pouvez pas la lire. »), and the text stays in the field. An
`[[<id>|<texte>]]` whose target is absent or unreadable by the author is saved (the text is the
author's, nothing leaks); it will read as a broken link or text, depending on the reader.

*Reading*: a link's rendering depends on the reader and is decided **at rendering time, by the target**, not by the
`liens` table: target readable by the reader → `<a class="lien-fiche" href="/univers/<u>/fiche/<id>"
data-type="<type>">`; unreadable target → text only, without any element or mark; deleted target → for the
GM outside Player mode `<span class="lien-casse" tabindex="0">` and its tooltip, text only for any
other reader; pending key → for the GM outside Player mode `<span class="lien-attente" tabindex="0">`
(tooltip « Lien en attente : aucune fiche n'a encore la clé « <clé> ». »), text only for any other
reader. In Player mode the GM reads as a player. A link in a GM block, like the block itself, exists only
for the GM outside Player mode (the block is removed before rendering, AD-98). Rendering resolves all links in
one text in **one** query (never one per link). The assistant receives `[texte](fiche:<id>)` for a readable
target and `texte` otherwise, never an unreadable identifier (AD-96).

*Writing*: the service that writes a section's content (the single write point of
`kanevas-import-secrets`) replaces the section's `liens` rows in the same transaction: one
per link found, with `dans_bloc_mj` from the link's position, never through a regular expression outside the
Markdown engine's tokens. Texts saved before the slice are not replayed: an
old `[[…]]` was not syntax, and the table is populated at the section's first write.

*Import*: `[[cle:<clé>|<texte>]]` whose key is known in the universe is saved as `[[<id>|<texte>]]`;
otherwise it stays as written, a pending `liens` row (`cible_cle`). Creating the sheet carrying
the key rewrites, **in the same transaction**, the waiting content (`contenu`, `contenu_public`,
`liens` rows) without touching the section's `version`, `version_importee` or `modifie_le`. A
replay compares the submitted text **after** resolving known keys: an already resolved link yields
« inchangée » (AD-104). The batch counts « liens et références en attente » at closure (`en_attente`).

*Scenario* (E-7): same forms, resolved on read in the scenario's campaign universe, under the
reader's permissions (a GM of the universe); a pending key is resolved on read through the origin-key
index; no `liens` row. A scenario's editor has « Lien vers une fiche » and the list opened
by `[[`. *System entry* (E-15): `[[…]]` remains text, without a button or list.

*The list opened by `[[`* (and « Lien vers une fiche », Ctrl/⌘+K): the `ListeRecherche` component, called
without `type`; it searches by title across all sheets the account reads
(`GET /api/univers/:id/fiches?q=`), at most 50, each row with its type icon and label.
Typing after `[[` filters; ↑ ↓ select, Enter inserts `[[<id>|<titre>]]` and closes the list, Escape
closes it and leaves `[[`. No results: « Aucune fiche. ». Error: « Impossible de chercher. » and
« Réessayer »; input is not lost. Connection lost: the list does not open, the common banner
speaks.

*« Mentionnée dans »* (B-36, AD-100): the sheet route returns `mentions` (first 50) and `mentionsSuite`
(boolean); `GET /api/univers/:id/fiches/:fid/mentions?apres=<n>` returns the next 50. One row per source
sheet: title (link to it), type icon, and the reason — « lien dans « Histoire » » (the section
carrying the link), the relation label (« Amiral de »), or both separated by « · » if the
same sheet cites it in several ways. A source counts if its sheet is readable **and** the section
carrying the link (or relation) is readable, **and** the link is outside a GM block for a non-GM; a
sheet citing itself is not displayed; order is title then identifier. Never a
count of hidden items; `mentionsSuite` is calculated only from what the reader sees.

*States* (B-29). **List opened by `[[`**: loading — the « Recherche… » row below the input (the previous list
is cleared); empty — « Aucune fiche. »; error — « Impossible de chercher. » and « Réessayer »; connection lost
— the list does not open, `[[` remains text, « Enregistrer » is disabled and the current text kept; refusal — the editor is offered only to those writing the section, so there is neither
button nor list for others (**hidden**); extreme content — a 120-character title fits on one row
truncated with « … » (full title in a tooltip), more than 50 results: the first 50 then the
« Affinez la recherche pour voir les autres. » row. **« Mentionnée dans » block**: loading more — the « Afficher
les N suivants » button becomes disabled « Chargement… »; failure — « Impossible de charger la suite. » and « Réessayer »;
connection lost — the button is disabled; the first 50 arrive with the sheet (no separate state).
**Write refusal** `lien_illisible`: the message, in `--danger`, below the editor field (E-9 and E-7), the
text kept, no save. **E-7**: same list states (error and connection-lost rows of E-7's table); E-7 is a GM-only
screen with no Player mode: a broken or pending link is always marked there; `lien_illisible` is not applicable
(a GM reads all sheets in the universe). *Mockup*: `e09-fiche-importee.html#etat-liens`.

*Who does what* (links):

| Role | Editor: `[[` and « Lien vers une fiche » | Reading a link | « Mentionnée dans » |
|---|---|---|---|
| GM, outside Player mode | yes (E-9, E-7) | link, broken, pending marked | everything they read, including GM blocks |
| GM in Player mode, on E-9 | **hidden** (no writing action in Player mode) | like a Player | like a Player |
| Player, on E-7 | **hidden**: « Page introuvable. », neither screen nor link to it | — | — |
| Player, section they write without a GM block | yes | link if target is readable; otherwise, including broken and pending, text only (**hidden**, no mark) | readable sources, outside GM blocks; the rest is **hidden**, no count |
| Player, section they do not write, or containing a GM block (B-34) | **hidden**: no « Modifier », hence neither button nor list | same | same |
| Player manually typing a link to a sheet they cannot read | **refused**: `lien_illisible` | — | — |
| Instance admin without membership | **hidden**: « Page introuvable. » on E-9 and E-7 | — | — |

*Criteria* (list and block).
- Given Antor editing « Histoire » of « Port-Sel », when he types `[[` then « ald », the list shows
  « Maître Aldric » with its type icon and label; Enter inserts `[[<id>|Maître Aldric]]`, Escape closes
  the list leaving `[[`.
- Given a failing search, when Antor types `[[`, « Impossible de chercher. » and « Réessayer »
  appear and his text stays.
- Given a search without results, « Aucune fiche. ».
- Given 60 sheets citing « Maître Aldric » readable by Léa, when she opens his sheet, « Mentionnée dans »
  shows 50 and « Afficher les 10 suivants »; pressing it adds them; without network, the button is disabled.
- Given « Anse-aux-Sels » in « Essai Kanka », when Antor reads it, « les contrebandiers du Repaire » has a
  dashed `--texte-3` underline (« Lien en attente : aucune fiche n'a encore la clé « faction:repaire ». ») and « Capitaine
  Hesk » a dashed `--danger` underline; Léa reads both as plain text.
- Given Antor granted players write access to « Description » of « Port-Sel », and Léa manually types
  `[[<id>]]` (the identifier from a sheet address) of « La Guilde des Brumes », when she saves,
  « Cette fiche n'existe pas ou vous ne pouvez pas la lire. » appears below the field, her text intact, the section unchanged.
- Given a slow search, when Antor types `[[` then « ald », « Recherche… » appears below the input until the
  response; offline, `[[` remains text and the common banner speaks.
- Given 60 sheets matching « a », the list shows 50 rows then « Affinez la recherche pour voir les
  autres. »; a 120-character title fits on a row ending with « … ».
- Given Léa on a section of « Port-Sel » she does not write, neither « Lien vers une fiche » nor the list exists
  for her; on a section containing a GM block, no « Modifier ».
- Given a slow request from « Afficher les 10 suivants », the button reads disabled « Chargement… »; if it
  fails, « Impossible de charger la suite. » and « Réessayer »; without network, the button is disabled.
- Given Antor in the « La Couronne brisée » scenario and a failing search, when he types `[[`,
  « Impossible de chercher. » and « Réessayer »; offline, `[[` stays text, « Enregistrer » is disabled and his
  text kept; a broken link in the scenario is marked.

### E-9 Sheet — what `kanevas-import` changes

*Finished mockup*: `docs/maquettes/e09-fiche-importee.html` (« Port-Sel », states `#etat-fichier`, `#etat-joindre`, `#etat-sous-type`, `#etat-changer-type`, `#etat-joueur`,
`#etat-edition`, `#etat-supprimer`, `#etat-deplacer`).

**Header.** Breadcrumb: universe › type › **readable** ancestors from highest to nearest ›
sheet; an unreadable ancestor is skipped without a mark (B-35); more than three ancestors: the first, « … »
(menu of the others), the last two. **Width (AD-99, decision of 2026-10-15)**: the current sheet's title yields last (ancestors shrink first, down to their minimum); an ancestor segment keeps at least 8 characters (width `8ch`) and truncates with « … » beyond that, never below; no segment overlaps a chevron. On a phone (≤ 480 px), once there are two or more readable ancestors, all go into the « … » menu (type icon › « … » › title); a single one truncates as described, except for a GM on a sheet (the GM / Player toggle takes the breadcrumb's width): it then also goes into « … ». Between 481 and 760 px, ancestors stay visible. « Poser » or « Remplacer » the illustration (GM) opens the two
add paths (Files, below), restricted to images; « Retirer » removes the reference, the image stays in the
media library. The type badge carries the **subtype**: « Lieu · Port » (B-52);
GM, outside Player mode: clicking the subtype edits it inline, with a list of subtypes already
used for this type in the universe, alphabetically (list title « Sous-types de lieu
déjà employés »; case-insensitive completion; help « Entrée enregistre · Échap annule »
and « Champ vide : plus de sous-type »; 1 to 60 characters, beyond that « Erreur : 60 caractères au plus. »);
a sheet without a subtype shows the GM the « Sous-type » label there, nothing to a player. Below the title: « Aussi appelée Salport, Port-aux-Sels » (aliases,
`--texte-2`) and **labels** as neutral chips (`tag`), each a link to filtered E-17.
GM, outside Player mode: the title edits inline (click, Enter saves); the header's « ⋯ » menu
carries « Changer le type… », « Déplacer sous… », « Alias et étiquettes… », an information row
« Importée · clé lieu:port-sel · créée le 3 mars 2021 » (if the sheet has an origin key, B-50) and,
separately, « Supprimer la fiche… » in `--danger`.
*In the `kanevas-import-fil` slice*, the « Importée · clé … » row is the menu's only entry: for a
sheet without an origin key, the « ⋯ » menu is not displayed; « créée le … » is the sheet's creation
date (the import's `creeLe` if supplied, B-50, otherwise the import date). The origin key is hidden from
all roles other than the GM (outside Player mode): neither menu nor read response.

- *Change type*: a list of types from the product list, enabled first, then « Autres
  types »; for « Personnage », the PC / NPC choice; and the « Sous-type » field (cleared on type
  change, since it is specific to the type, with subtypes already used for the new type). The
  session report is not listed; a session report does not have this entry.
- *Move under…*: « Déplacer « Port-Sel » sous… » dialog, « Chercher une fiche » field and the
  search list (all types, sheets the GM reads), plus « Aucun parent »; footer: « Annuler » then « Déplacer » (on the right on desktop, side by side across the full width, 40 px high, on a phone);
  a descendant of the sheet is refused: « Une fiche ne peut pas être rangée sous l'un de ses
  descendants. ».
- *Aliases and labels*: two chip fields (Enter adds, × removes); a label completes
  from the universe's labels; alias 1 to 120 characters, at most 20; label 1 to 40
  characters, at most 20 per sheet.
- *Delete sheet*: « Supprimer « Port-Sel » ? » dialog counting what goes —
  « 3 sections ; 3 relations qui la visent ; 1 place sur une carte. Ses 2 fichiers restent dans la médiathèque. Ses 5 enfants
  remonteront sous « Les Sphères ». Les liens qui la visent deviendront des liens cassés. » — and
  « Supprimer la fiche » (`--danger`) / « Annuler ». Afterwards: back to the type's list, toast « Fiche
  supprimée. ». These numbers are shown only to the GM, who reads everything.

**Sections.** Markdown rendering above. « Modifier » does not appear for a Player on a section
containing a GM block, even with write permission (B-34); if they open it another way, the server
refuses: « Vous ne pouvez pas modifier cette section. ».

**Files** (B-24, B-44, B-55, AD-111; Monsieur's decisions of 2026-10-11). Every file on the sheet
lives in the media library and is referenced there. **Reading**: a file (inserted image, attachment,
file link in text) or illustration is shown if the reader can see it; otherwise, in a
section they read, a neutral frame (`lock`, `--texte-3`) says « Image réservée au MJ. » (with the
caption if any) or « Fichier réservé au MJ. » for a document; inside a GM block, nothing.
A GM-only illustration on a sheet a player sees: the same notice in the header, the
fallback thumbnail in E-8's grid (without notice). Deleted file: « Fichier supprimé de la
médiathèque. » for a GM, nothing for a player. In player mode, the GM sees what a player sees, plus files they added themselves (third rule, AD-117).

**Two add paths**: the toolbar's « Fichier » (`paperclip`) button, while editing, and
« Joindre un fichier » at the foot of the attachments block — present outside editing for those who write the section,
as in the previous upload flow (`kanevas-fichiers`) — open the same menu —
1. **« Ajouter depuis l'appareil »** (or drag and drop onto the section): in **one action**, the
   file enters the media library (added by the account; **visibility from the add location**: inside
   a GM block, or in a section not all players read, « Réservé au MJ » — the file
   row says so with its « MJ seul » chip —; elsewhere, « Visible des joueurs »; an illustration:
   « Visible des joueurs » if the sheet has a section read by players) **and** is integrated into the
   sheet — from the toolbar, an image is inserted in the text at the insertion point
   (`![nom](fichier:<id>)`) and a document puts a link there (`[nom](fichier:<id>)`), each reference on **its own line** (a newline is added before and after when the insertion point touches text or a `:::` fence; after a table row, a blank line separates the reference from the table so it cannot become another row; it never sticks to a closing fence and therefore never falls into the GM block); from the block, the
   file is attached to the section; from the header (« Poser » or « Remplacer » the illustration, GM),
   an image becomes the illustration. A failure adds nothing to either the media library or the sheet.
2. **« Choisir dans la médiathèque »**: E-19's picker (« Choisir un fichier »), filtered to
   what the account sees (and to images for the illustration); choosing integrates the reference in the same
   way, adding nothing to the media library, **without changing its visibility**.
Whoever added a file **always sees it**, here and in E-19, even if GM-only (AD-111's third read
rule).
The B-55 warning appears below the field, or in the illustration dialog, while the
condition holds (a GM-only file placed outside a GM block in a section read by players, or as
illustration of a sheet players see); it does not prevent anything.

**The attachments block** shows files attached to the section: images as thumbnails, documents with
their type icon, name and size; for a GM, a reserved file's « MJ seul » chip.
Row menu: « Retirer » removes the reference, never the media library file; for a GM,
« Réserver au MJ » / « Rendre visible des joueurs » changes **the file's** visibility (same dialog as
E-19 if players read it elsewhere); « Ouvrir dans la médiathèque ». The « secrète » checkbox from
`kanevas-fichiers` disappears: this is the file's visibility. At most **100 attachments** per
section (« Cette section porte déjà 100 fichiers joints. » to the GM, « Cette section ne peut pas recevoir
d'autre fichier. » to the player); references in text do not count.

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

**Sheet blocks** (after the sections, outside any section):
- **« Contient »** (`folder-tree`) — readable children, by type then title, each with its icon; 50
  then « Afficher les N suivants » (N counted from what the reader sees). Absent if there are none.
- **« Mentionnée dans »** (`link-2`) — sheets citing it that the reader sees: title, icon,
  and reason: « lien dans « Histoire » » or the relation label (« Amiral de »). 50 then
  more. Absent if there are none (B-36). Never a count of hidden items.

| State | What is seen | Available actions |
|---|---|---|
| empty | imported sheet without sections: as before; no « Mentionnée dans »; « Contient » only if it has readable children | GM: add a section |
| loading | skeletons of the header and two sections; the sheet and its sections arrive in one response, « Contient » in a second (« Chargement… » below its title) | — |
| error | « Impossible de charger cette fiche. »; inserted image failing to load: « Image indisponible. » in its place, caption below; failed move, type change, deletion: « L'action n'a pas abouti. Réessayez. », nothing changed | « Réessayer » |
| connection lost | banner; « Modifier », « ⋯ » menu, title editing disabled; links can still be followed | read |
| refusal | unreadable sheet: « Page introuvable. »; a link to it is text only; deleted while reading: « Page introuvable. » at the next action; Player: neither « ⋯ » menu nor title editing (**hidden**) | « Mes univers » |
| long content | 100,000-character section: rendered in full, editor scrolls; « Erreur : 100 000 caractères au plus. » beyond that; 12-column table: scrolls within its frame; 300 children: 50 then more; 120-character title and 6-ancestor breadcrumb: breadcrumb collapses (« … ») | same |

*Criteria.*
- Given « Port-Sel » whose « Histoire » section (read by players) contains a GM block « Le port
  est tenu par la Guilde des Brumes », when Léa opens the sheet, she reads « Histoire » without
  any word from the block, without a gap or mark in its place.
- Given the same sheet, when Antor switches to Player mode, he sees exactly what Léa
  sees; back in GM mode, the block is amber-hatched, with an « MJ seul » chip.
- Given an `[[…]]` link from « Port-Sel » to « La Guilde des Brumes » (a sheet Léa reads
  nothing of), when Léa reads « Port-Sel », « La Guilde des Brumes » is plain text, without a link.
- Given Léa is an author with write permission on a section containing a GM block, when she opens the
  sheet, this section has no « Modifier ».
- Given « Rapport secret de l'amirauté » (GM only) linking to « Port-Sel », when Léa opens
  « Port-Sel », « Mentionnée dans » does not name this report; Antor sees it there.
- Given « Port-Sel » under « Les Sphères » (a location unreadable by Léa), with no other ancestor, when
  Léa opens « Port-Sel », the breadcrumb is « Lame d'Ébène › Lieux › Port-Sel ».
- Given « Port-Sel » under « Les Sphères » (a location unreadable by Léa) under « Le Grand Vide »
  (readable), when Léa opens « Port-Sel », the breadcrumb is « Lame d'Ébène › Lieux › Le Grand Vide ›
  Port-Sel ».
- Given Antor moving « Les Sphères » under « Port-Sel », its child, he sees « Une
  fiche ne peut pas être rangée sous l'un de ses descendants. » and nothing changes.
- Given Antor deleting « Port-Sel » (5 children, one unreadable by Léa, parent « Les Sphères »), all 5
  children have « Les Sphères » as parent, « Port-Sel »'s address answers « Page introuvable. », and
  a link to it in « Maître Aldric » is marked « lien cassé » for Antor and text for Léa.
- Given content containing `<script>alert(1)</script>` and `<b>gras</b>`, when the section
  is displayed, these tags appear as text, and no script runs.

### What `kanevas-import-tenir` builds (E-9 title and deletion, E-14 « Supprimer l'univers »)

*Slice details within the framework above (B-39, B-40, B-41, AD-105, AD-119); mockups are
`e09-fiche-importee.html` (`#etat-supprimer`) and `e14-types-de-fiche.html` (`#etat-supprimer-univers`).*

*The `#etat-supprimer` mockup draws only the dialog's nominal state, and the header mockup only the idle title: the states below (empty or too-long title, toast, summary loading or error) are described here, and this text is authoritative.*

**Inline title (E-9, GM outside Player mode).** Clicking the title turns it into an input field, text
selected; Enter saves, Escape cancels, losing focus saves. 1 to 120 characters after
trimming; empty: « Erreur : le titre est obligatoire. »; beyond that: « Erreur : 120 caractères au plus. »; the
field stays open. Unchanged title: nothing is sent. Saved: toast « Fiche renommée. », descendants'
breadcrumbs and the list badge follow on the next read; `[[…]]` links do not change
(they target the identifier, B-33). Failure: « L'action n'a pas abouti. Réessayez. » below the title, the field stays open with the input (Escape restores the old title). A
Player or Player mode: title as text, without an editing cursor.

**Deleting a sheet (E-9).** « Supprimer la fiche… » opens the dialog **after** reading its summary
(`GET …/fiches/:fid/suppression`): « Chargement… » in the dialog, « Supprimer la fiche » button inactive until
the summary arrives. Text contains only nonzero items, singular or plural
(« 1 section », « 1 relation qui la vise », « 1 place sur une carte », « Son fichier reste dans la
médiathèque », « Son enfant remontera sous… »); without a parent, « … remonteront à la racine de la liste du
type »; without children, the sentence is absent; sheet alone: « Cette fiche ne porte rien d'autre. ».
Numbers are the GM's, who reads everything. Summary error: « Impossible de charger le détail. » and
« Réessayer »; deletion failure: the message in the dialog, which stays open, the sheet has not
changed. Success: back to the type's list, toast « Fiche supprimée. ». A sheet already deleted elsewhere:
« Page introuvable. » when opening the dialog. A session report is deleted the same way (back to E-13).

**Import (E-18).** An import `DELETE` adds the « Fiches : 1 supprimée » counter to the batch summary
(« supprimées » in the plural), with no possible refusal; unknown key: nothing is counted.

**Delete universe (E-14, any GM).** The dialog follows the text above; the field compares the entered name to the
universe name exactly, including case and spaces (an accidentally entered trailing space leaves the button
inactive); the server compares again (`nom`) and refuses a different name (400 `nom_different`, « Le nom ne correspond
pas à celui de l'univers. »; the screen displays « Le nom ne correspond pas. »). During deletion: inactive « Suppression… » button. Afterwards: E-1, toast « Univers supprimé. »;
other members see « Page introuvable. » at their next action. Deletion failure: « L'action n'a pas
abouti. Réessayez. » in the dialog, which stays open, the universe intact; a long deletion keeps
« Suppression… » until the server responds (no timeout that closes the dialog).

**Slice-specific states** (in addition to the E-9 and E-14 tables).

| Screen | State | What is seen | Available actions |
|---|---|---|---|
| E-9, dialog | summary loading | « Chargement… », « Supprimer la fiche » inactive | « Annuler » |
| E-9, dialog | summary error | « Impossible de charger le détail. » | « Réessayer », « Annuler » |
| E-9, dialog | deletion failure | « L'action n'a pas abouti. Réessayez. » in the dialog, the sheet has not changed | « Supprimer la fiche », « Annuler » |
| E-9, dialog | connection lost | banner; « Supprimer la fiche » inactive, loaded summary stays | « Annuler » |
| E-9, title | save failure | « L'action n'a pas abouti. Réessayez. » below the title, field stays open with the input | Enter to retry, Escape |
| E-9, title | connection lost while editing | banner; Enter sends nothing, input is kept | Escape |
| E-14, dialog | connection lost | banner; « Supprimer l'univers » inactive | « Annuler » |

A session report is called « fiche » in these texts (« Supprimer la fiche… »): it is a sheet (B-40), and its dialog
counts its sections, including assistant proposals; back to E-13 instead of the type's list.
The failure paths of P-14 and P-10 refer to this table.
### The GM block — what `kanevas-import-secrets` builds (E-9, E-12, import)

This slice delivers the `:::mj` block (B-34, AD-98, AD-114) on the rendering and editor provided by
`kanevas-import-markdown`. It delivers neither `[[…]]` links inside a block (`kanevas-import-liens`),
nor files inside a block (`kanevas-import-mediatheque`), nor all-types search
(`kanevas-import-recherche`); **single-type** search (E-8) and the assistant's search (`chercher`) are
closed to it from now on. Mockup: `e09-fiche-importee.html` (« Port-Sel », « Histoire »: the
`.bloc-mj` block, toolbar's `.outil-mj` button, `#etat-joueur` state); no new screen.

- **Journeys**: reading, P-12 steps 3 and 6; searching within a type, P-6 steps 1-2 (all-types search, P-12 step 4, belongs to `kanevas-import-recherche`); writing, P-14 step 1 (« Bloc MJ »); checking in Player mode,
  P-10 step 6; importing content carrying `:::mj`, P-10 step 4.
- **Syntax**: a `:::mj` line, text lines, a `:::` line. The GM types it or inserts it with
  the button. Everything covered by the block is secret, **whatever its form**: paragraphs, list,
  table, quotation. A block does not open inside a code block (` ``` `): there, `:::mj` remains text, and
  is therefore not secret. A block **never closed** covers text up to the end of the section, even if opened inside a list or quotation
  (doubt favors secrecy, never display). A block inside a block: the outermost
  governs: each `:::mj` encountered inside a block opens a nested block, and the outer block ends only at the `:::` line
  balancing the openings (a `:::` line in a code block inside a GM block closes it, as on screen); everything covered is removed. `:::MJ` (different case), `::: mj` (space), `::::mj` (four colons)
  and `:::mj` followed by words are not blocks: text, visible to everyone — one less rule for the GM to learn.
- **« Bloc MJ » button** (GM only, `lock`, after the existing editor toolbar buttons; « Fichier » is added by `kanevas-import-mediatheque`,
  before the « Écrire / Aperçu » toggle; « Bloc MJ » label visible on desktop, only the 36 px icon below the
  mockup's phone threshold (`@media` in `e09-fiche-importee.html`), no tooltip on touch: the accessible label replaces it; tooltip « Bloc MJ · entoure la sélection », accessible label « Bloc MJ »): with a selection, it wraps it with a `:::mj` line before and a
  `:::` line after (adding missing newlines so both lines stand alone);
  without a selection, it inserts the two lines in sequence, an empty line between, cursor on
  the empty line. It has no keyboard shortcut. It does not remove a block: delete its two lines.
  A player writing the section, or the GM in Player mode, does not see it.
- **Preview** (« Écrire / Aperçu »): its states are those of `kanevas-import-markdown` — « Aperçu en cours… »,
  « Rien à prévisualiser. », « L'aperçu n'a pas abouti. Réessayez. » with « Réessayer », « Erreur : 100 000 caractères au plus. » —;
  a scenario (E-7) or system entry (E-15) preview leaves `:::mj` as text, like their reading view (only editing an
  E-9 section requests the section nature with its universe and mode, AD-114); `nature: 'section'` without an integer `univers_id` is refused (400), an unknown universe or one the account does not belong to answers 404 like any read; a non-GM member receives a preview without blocks. For the GM, the block appears hatched as on read; for a non-GM,
  or outside a universe, it does not exist (preview applies the same view as reading, AD-114).
- **Extreme cases**: a 100,000-character block scrolls with the section; a wide table inside a block
  scrolls inside the block's frame, never the page at 375 px; several blocks in a section form separate frames, separated by
  public text; a never-closed block is hatched **to the end** of the section (the GM sees what the public loses); an
  empty block (`:::mj` then `:::`) reads as a frame without text.
- **Reading**: for a GM outside Player mode, the block takes the « MJ seul » section's styling (amber
  hatched texture, rule, « MJ seul » `lock` chip, accessible label « Bloc MJ seul »), at its place in the
  text. For every other reader and for the GM in Player mode, the block does not exist: no gap, rule or
  chip, the next paragraph follows the previous one; the read response contains no word from the block.
  A section whose entire text is inside a block reads, for a non-GM, « Rien d'écrit pour l'instant. ».
- **Writing a section containing a block**: GM only (AD-98). For a player with audience-based write
  permission, or the GM in Player mode imitating such a player, « Modifier » does not appear; if they
  reach it another way (session API, `modifier_section`, `ajouter_a_section`), the server answers 403,
  « Vous ne pouvez pas modifier cette section. », and nothing is written. The absence of « Modifier » tells a player
  who can write the section that she cannot edit it, never why: no message names the block, and this is
  the only trace this choice leaves of a block (accepted: it reveals no secret words). A player writing content
  **containing** a block (typing `:::mj` in a section that had none) receives 400, « Un bloc MJ ne peut être
  écrit que par un MJ. », below the field, text kept; the same applies to the text of a session report they create (E-6),
  whose dialog shows this message below the field like its other refusals. In Player mode, the GM has no « Modifier »
  (the mode is a reading view, imitating a player unable to write this section); what the API
  accepts from them does not change, the mode restricts reads only (AD-39).
- **The assistant** (E-12): `lire_fiche` and `lire_section` return, for a player account, **public** Markdown
  (without blocks); for a GM account, the entire source — its catalogue stays the GM's even
  while in Player mode on screen (AD-74). A player's `modifier_section` and `ajouter_a_section` are refused
  on a section containing a block (« Vous ne pouvez pas modifier cette section. », no event) and on content
  containing a block (« Un bloc MJ ne peut être écrit que par un MJ. »). `modifiable` is false for such a
  section. A GM writing a section through the assistant can place a block there.
- **Scenario (E-7) or system entry (E-15) text**: `:::mj` is not interpreted there, it
  stays text as written (docs/ecrans.md, § Markdown, wherever long text is written); block
  rendering is reserved for sections and session reports, and a scenario or entry has no `contenu_public`.
- **Search** (E-8's type search field, B-11, and `chercher`; all-types search in
  P-12 step 4 comes with `kanevas-import-recherche` under the same rule): a non-GM, or a GM in Player mode, searches only titles
  and sections' **public** text; a word occurring only inside a block does not find the sheet. A
  GM outside Player mode searches all text.
- **Import**: `PUT /fiches/:cle` accepts `:::mj` in a section's `contenu`; public content
  is computed as for a screen write, in the same transaction. The token belongs to a GM: the
  GM-only block-writing rule does not hinder it. Identically replayed content stays `inchangee`.
- **States**: those of E-9 (loading, empty, error, connection lost, refusal, long content). A write
  refusal is the above message below the field, text kept; a player's section containing a block
  is readable without « Modifier » (**hidden**, not dimmed).
- **Roles**:

  | | GM | Reading player | Player writing the section | GM in Player mode |
  |---|---|---|---|---|
  | Sees the block | yes, hatched | nothing | nothing | nothing |
  | « Bloc MJ » in toolbar | yes | not applicable (no editing) | **hidden** | **hidden** |
  | Writes a section with a block | yes | no | no (« Modifier » **hidden**, 403) | through the API yes; on screen « Modifier » **hidden** |
  | Writes content containing a block (section, text of a session report created in E-6) | yes | no | no (**refused**: 400, message below the field) | through the API yes |
  | Finds a sheet through a word in the block | yes | **nothing** (the sheet is not a result) | **nothing** | **nothing** |
  | Assistant returns the block | yes | **nothing** (public text) | **nothing** (public text) | yes (GM catalogue) |

*Criteria.*
- Given « Port-Sel » whose « Histoire » (read by players) contains a three-paragraph GM block, when
  Léa reads it, the text's first and last paragraphs follow without an extra gap, and the
  server response contains no word from the block.
- Given a block inside a bulleted list, a block inside a quotation and a never-closed block at the end of
  text, when Léa reads, nothing they cover appears.
- Given `:::mj` written inside a code block, when Léa reads, it reads as text.
- Given a section whose entire text is a block, when Léa reads it, she reads « Rien d'écrit pour
  l'instant. »; Antor sees the block.
- Given a scenario or system entry whose text carries `:::mj … :::`, when read,
  the three lines read as text, without a frame.
- Given a session report whose text carries a block, written by Antor, when Léa reads it on E-9, she
  reads nothing from the block and has no « Modifier » on this text.
- Given Léa creating a session report whose text carries `:::mj … :::`, when she submits it, the
  dialog says « Un bloc MJ ne peut être écrit que par un MJ. » and nothing is created.
- Given Léa writing a section she may write and typing `:::mj … :::` into its text, when
  she saves, she reads « Un bloc MJ ne peut être écrit que par un MJ. » and her text is kept.
- Given the same Léa and a section where Antor placed a block, when she sends a write to
  the API, the response is 403 and the section is unchanged; Léa's assistant attempting
  `modifier_section` receives « Vous ne pouvez pas modifier cette section. » and no event is emitted.
- Given a word occurring only inside a block of « Port-Sel », when Léa searches for it in « Lieux »,
  « Port-Sel » is not returned; Antor finds it; Antor in Player mode does not find it.
- Given Antor editing « Histoire », when he selects a paragraph and presses « Bloc MJ »,
  the paragraph is between `:::mj` and `:::`; « Aperçu » shows it hatched; Léa sees nothing after « Enregistrer ».
- Given an import of `contenu` with a GM block, replayed identically, the response says `inchangee`
  the second time and Léa reads nothing from the block.

### E-19 Media library

*Finished mockup*: `docs/maquettes/e19-mediatheque.html` (states `#etat-joueur`, `#etat-image`,
`#etat-document`, `#etat-documents`, `#etat-supprimer`, `#etat-reserver`, `#etat-choisir`,
`#etat-averti`, `#etat-vide`, `#etat-perdue`). The drop overlay, errors, upload progress, « Afficher les N autres »
and the empty picker are not drawn: **this document takes precedence over the mockup**. Decisions
of 2026-10-11 (B-53 to B-56, AD-111): all universe files, images and documents.

Reached (address `/univers/<id>/mediatheque`) through « Médiathèque » (`images`) in the universe sidebar, below « Cartes », for any member.
At the top: title, « 1140 fichiers » (those the reader sees) and, for a GM, « Ajouter des
fichiers » (several at once, or drag and drop onto the page: overlay « Déposez les fichiers pour
les ajouter. »). A segmented **« Tout · Images · Documents »** toggle; a filter row:
name search (« Chercher par nom »); for a GM, « Visibilité » (« Toutes », « Visibles des joueurs »,
« Réservées au MJ »); « Usage » (« Tous », « Utilisés », « Non utilisés » — computed from usages the reader can read: for a player, « Non utilisés » means used nowhere they read, never used in a closed sheet; D1); order (« Plus récents », « Nom »). A
**grid**: an image as a thumbnail (`cover` crop, loaded on approach); a **document** in a
same-size tile — its type icon (`file-text` PDF, `file-spreadsheet` spreadsheet, `file-archive`
archive, `file` otherwise), extension chip, size (« 2,4 Mo »); name below; for a GM,
the « MJ seul » (`lock`) chip on a reserved file. 100 then « Charger la suite ».

Clicking opens the **file panel** (right on desktop, full screen on a phone): the large image,
or for a document its large icon, type (« Document PDF », « Tableur XLSX », « Archive
ZIP », « Document ODT »: nature and extension) and, for documents only, « Télécharger » (images have no such button); name (GM: editable
inline, 1 to 200 characters); **visibility** as a segmented « Visible des joueurs » /
« Réservé au MJ » toggle (GM; a player does not see this setting); type, size, « ajouté par lea le 12 oct.
2026 », origin key (GM, if imported); **« Utilisé dans »** — usages **the reader can read**: for each sheet they see, the illustration (if the sheet is visible to them) and only sections they read, with their title (« Histoire » (in text), « Pièces jointes de Description ») and a link; for a non-GM (E-19 has no Player mode), never a usage in a section they cannot read or inside a GM block — a file with no readable usage has no « Utilisé dans » block (D1) —; for a GM « Supprimer le fichier » (`--danger`). No embedded PDF preview (AD-66).

- *Reserve for the GM* a file read by players elsewhere: dialog « Réserver « plan-du-repaire.png » au
  MJ ? Les joueurs ne le verront plus dans : Les Docks — « Histoire » ; Port-Sel — « Description »
  (jointe). »; « Réserver au MJ » / « Annuler », then toast « Fichier réservé au MJ. ». Without such
  usage: no dialog, same toast. Making visible, renaming: no toast. Empty name: « Erreur : le
  nom est obligatoire. »; beyond 200: « Erreur : 200 caractères au plus. ». « Utilisé dans »
  does not appear for a file used by no sheet visible to the reader.
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

| State | What is seen | Available actions |
|---|---|---|
| empty | GM: « Aucun fichier pour l'instant. Ajoutez-en, ou posez-en un dans une fiche. » and « Ajouter des fichiers »; player: « Aucun fichier à voir pour l'instant. »; filter without results: « Aucun fichier ne correspond. » | GM: add |
| loading | skeleton tiles; a loading thumbnail keeps its frame | — |
| Error | « Impossible de charger la médiathèque. »; failed thumbnail or preview: « Image indisponible. » (icon and text only, no button); failed download: « L'action n'a pas abouti. Réessayez. »; an empty file in a multiple upload: « « notes.txt » est vide. » below the grid, other files are added; interrupted upload: « L'envoi n'a pas abouti. » with « Réessayer » and « Abandonner » (E-9 calls the latter « Ignorer »); failed deletion or change: « L'action n'a pas abouti. Réessayez. », nothing changed | « Réessayer » |
| connection lost | banner; « Ajouter des fichiers », visibility toggle, « Supprimer » disabled | view what is loaded |
| Refused | A GM-only file the player did not add does not exist for them (absent, direct address: « Page introuvable. »); players have no visibility settings, deletion or add action on E-19 (**hidden**; they add through a writable section on E-9); role removed while viewing: « Vous ne pouvez plus modifier ce fichier. »; instance admin without a universe role forcing the address: « Page introuvable. » | « Mes univers » |
| long content | 1,140 files: 100 then more; 200-character name truncated with « … » and tooltip; file used in 40 sheets: 10 then « Afficher les 30 autres »; 30 MB image: preview loads, nothing is resized (AD-93); 300 MB document: tile and « Télécharger », nothing is loaded ahead | same |

*Criteria.*
- Given « plan-du-repaire.png » reserved for the GM and inserted into « Histoire » of « Les Docks », read
  by players, when Léa reads « Les Docks », she sees « Image réservée au MJ. » in its place; and
  her media library does not show this file.
- Given the same file inserted inside a GM block, when Léa reads the section, nothing appears.
- Given Antor editing a section read by players and choosing a GM-only file from the media
  library, the editor displays the B-55 warning; in a GM-only section,
  it does not.
- Given Teo added as a Player of « Lame d'Ébène » by Antor, and Léa, author with write access to
  « Notes de la table » (which other players do not read),
  when she adds « carnet.pdf » from her device, the document is attached to the section **and**
  appears in the media library, « Réservé au MJ », « ajouté par lea »; Léa sees it in the section and
  her media library, Teo sees it nowhere.
- Given Antor adding « plan.png » from a GM block of « Port-Sel », the file enters as
  « Réservé au MJ »; added from « Description », read by players, it enters as « Visible des joueurs »;
  later chosen from the media library for a GM block, its visibility does not change.
- Given « Carte des Sphères » used by three sheets, when Antor deletes it, the dialog lists all
  three sheets. Afterwards, Antor sees « Fichier supprimé de la médiathèque. » in its place in
  « Val-Fortin »; Léa sees nothing.
- Given a player-visible file used by « Port-Sel » (readable by Léa) and by « Rapport
  secret de l'amirauté » (GM only), when Léa opens the file, « Utilisé dans » names only
  « Port-Sel ».
- Given a player-visible file attached to « Vérité — MJ seul » of « Maître Aldric » (a sheet
  Léa sees through « Apparence ») and inserted inside a GM block of « Port-Sel », when Léa opens the file,
  it has no « Utilisé dans » block, and appears under the « Non utilisés » filter.
- Given the toggle on « Documents », only documents appear, each with its type
  icon, name and size.

### E-8 Sheet list — the tree

A « Grille / Arbre » toggle (`layout-grid`, `list-tree` icons) beside search; the choice is
remembered per type in the browser. **The tree**: readable sheets of the type whose
parent is absent, unreadable or of another type, by title; a sheet whose readable parent has a
different type carries « dans La Guilde des Brumes » (`--texte-3`, link). Each node with readable **same-type**
children has a chevron; expanding loads its children (100, then « Charger la suite »). No
child count (it would count only readable ones, but helps in no way). Type search
returns the grid, never the tree. Sidebar types are those enabled; a disabled type's
address still opens its list (reached through a sheet), with the « Ce type est désactivé
dans cet univers. » row and no creation button. Type choice at creation: enabled types.

**Subtype** (B-52, Monsieur's decision of 2026-10-11): a sheet's card (grid) and tree row show
its subtype below the title (`--texte-3`); a « Sous-type » filter beside search (« Tous »;
then subtypes of sheets of this type the reader sees, alphabetically, with their readable
sheet count); a filtered subtype returns the grid. The creation dialog has an optional « Sous-type »
field, with the same completion as E-9.

| State | What is seen | Available actions |
|---|---|---|
| empty | grid texts; new types: « Aucune créature », « Aucune race », « Aucun vaisseau », « Aucun savoir », « Aucun récit », « Aucune règle », « Aucune note » + « pour l'instant. » / « à voir pour l'instant. »; buttons « Nouvelle créature », « Nouvelle race », « Nouveau vaisseau », « Nouveau savoir », « Nouveau récit », « Nouvelle règle », « Nouvelle note » | GM: create |
| loading | « Chargement des fiches… »; expanding node: « Chargement… » below it | — |
| error | « Impossible de charger les fiches. »; a node: « Impossible de charger la suite. » | « Réessayer » |
| connection lost | banner; « Nouveau … » disabled | expand what is loaded |
| refusal | type unknown to the product list: « Page introuvable. » | — |
| long content | 201 locations: 100 roots then more; 12 levels deep: indentation capped at 6 levels, depth read from the chevron | same |

*Criterion.* Given « La Taverne du Kraken » under « Port-Sel », readable by Léa, when Léa switches
« Lieux » to tree and expands « Port-Sel », she sees « La Taverne du Kraken » below it.
- Given « Port-Sel » and « Havre-Gris » with subtype « Port », and « Port-Noir » with subtype
  « Port » that Léa cannot read, when Léa filters « Lieux » by « Port », she sees « Port-Sel » and
  « Havre-Gris », and the filter says « Port (2) ».

### What `kanevas-import-arbre` builds (E-8 tree, E-9 breadcrumb, « Contient », « Déplacer sous… »)

*Slice details within the framework above (AD-99, AD-115); E-9's mockup is `e09-fiche-importee.html`
(`#etat-deplacer`), the tree has none.*

**Tree (E-8).** The address stays the same; the « Grille / Arbre » choice is kept per type under the browser's
`kanevas:vue-liste:<univers>:<type>` key (`localStorage`, values `grille`, `arbre`); absent: grid.
The list is a `role="tree"`, each node a `role="treeitem"` with `aria-expanded` when it has a chevron and
`aria-level`; the chevron is a button (`aria-label` « Déplier » / « Replier ») separate from the sheet link;
on the keyboard, right arrow expands, left arrow collapses, Enter opens. Expanding calls
`GET …/fiches?type=T&parent=<id>`; collapsing keeps what is loaded, expanding again makes no new call.
Roots are `…&parent=racine`; « Charger la suite » loads the next page of a node or roots.
A node without readable same-type children has no chevron (the `aDesEnfants` field). A node's row:
type icon, title, subtype (`--texte-3`), and « dans « La Guilde des Brumes » » when `dans` is returned.
On a phone, indentation is 12 px per level, capped at 6 levels; a row is never less than 44 px high.
In a GM's Player mode, the toggle keeps its choice and the tree reloads under that mode. A subtype filter or search returns the grid; clearing the filter or search returns the tree if that was the remembered choice. An expanded node whose sheet becomes unreadable between reads disappears on the next read (404: « Impossible de charger la suite. »). A pending import parent (AD-104) is counted with pending links in E-18's « liens et références en attente » row; a replay that sets it is visible in the tree.

**Breadcrumb (E-9).** `ancetres` comes from the sheet view; each ancestor links to its sheet; a
sheet without readable ancestors has the usual breadcrumb. More than three ancestors: the first, « … » (a menu listing
the others with their type), the last two. Returning via the breadcrumb (P-12 step 5) uses this link: no special
state. An ancestor becoming unreadable between reads is absent from the breadcrumb on the next read.

**« Contient » (E-9).** The block follows the « Contient » texts above. It calls
`GET …/fiches/:fid/enfants` once the sheet is loaded, independently of sections (the sheet and its sections arrive in one response, « Contient » in a second): its error does not remove the
text. Its states: *loading* « Chargement… » below the block title; *error* « Impossible de charger les
enfants. » with « Réessayer »; *empty* block absent; *long content* 50 then « Afficher les N suivants »
(N = the next page's count, never a total); failure to load more says « Impossible de charger la suite. » without removing what is displayed; connection lost: banner, loaded block stays; sheet deleted meanwhile (404): block disappears. A sheet without readable sections but with readable children still shows « Contient ». Each child shows the icon, title and subtype (« Taverne »). In Player mode the block is reread under that mode.

**« Déplacer sous… » (E-9).** The dialog is that of `#etat-deplacer`. The field searches the existing search
list (`GET …/fiches?q=`, without `type`, 300 ms after typing, at least 1 character, at most 100);
the sheet itself is excluded from the list; a row shows the type icon, title and subtype (« Lieu · Sphère »), and search covers the title only (the mockup's « Titre ou alias » placeholder belongs to E-17: here the field says « Chercher une fiche »); the 1-to-100-character constraint applies to input, the list returns at most 100 rows then « Charger la suite », and scrolls inside the dialog; before any input the list says « Tapez le début d'un titre. »; input without results says « Aucune fiche ne correspond. », searching « Recherche… », failure « Impossible de chercher. » with « Réessayer »; « Aucun parent » is the first row and puts the sheet at the root.
« Déplacer » stays inactive until a row is chosen (the mockup shows it active because a choice has already been made); refusal appears below the field; it sends `PATCH …/fiches/:fid` `{parent}`. Responses:
success (200, sheet in response) → dialog closes, breadcrumb reloads and toast says « Fiche déplacée. »; 400 `cycle` → text
« Une fiche ne peut pas être rangée sous l'un de ses descendants. » below the field, dialog stays open;
400 `trop_profond` → « La hiérarchie est trop profonde. » and 404 → « Introuvable. », both below the field like the cycle; connection lost →
banner, « Déplacer » disabled. The dialog exists only for a GM outside Player mode, and the « ⋯ » menu is absent for a Player. A sheet of any type may be parent or child, including a session report (AD-99): « Déplacer sous… » also exists for it (GM only: a Player, even the author of their session report, has no « ⋯ » menu); E-13 does not show the hierarchy and stays unchanged.

*Slice criteria* (data is the seed data, `docs/ecrans.md` above):
- Given « Les Sphères » (GM-only location) whose child is « Port-Sel », when Léa opens « Lieux » as a tree,
  « Port-Sel » is a root without « dans … » (its parent is unreadable); Antor sees « Les Sphères »
  as a root, and « Port-Sel » below it.
- Given « Le Repaire des contrebandiers » (GM only) under « Port-Sel », when Léa expands « Port-Sel »,
  she sees « La Taverne du Kraken », « Les Docks », « Le Phare aux Sels » and « Quartier des Cordiers », not the hideout,
  and no number tells her it exists.
- Given a child of another type under « Port-Sel » (an event read by players; the stub seed does not create one, it is created or imported for this criterion), when Léa expands
  « Port-Sel » in « Lieux », that child is absent there; it is in « Contient » of « Port-Sel », and in
  « Événements » it carries « dans Port-Sel ».
- Given a `GET …/fiches?type=lieu&parent=racine` response for Léa, no field carries the title,
  identifier or count of a sheet she cannot read (`dans` is `null` if the parent is unreadable).

### E-17 Search

*Finished mockup*: `docs/maquettes/e17-recherche.html` (GM, Player, Player mode, label, lore, states).

Address `/univers/:id/recherche?q=…&type=…&etiquette=…`. A field at the top (focused on opening,
1 to 100 characters, no button: search starts on typing or Enter), below it two filter rows: **types** (icon chips, « Tous » by
default; **only enabled types** have a chip, B-42 — a sheet of a disabled type remains a
result under « Tous ») and **labels** (a list with
completion, from sheets the account sees). Results: E-8's row (thumbnail, type icon,
title, badge, subtype) plus, if the sheet was found through an alias, « alias : Salport »; its labels.
The field searches titles, aliases, **subtype** (B-52) and readable sections. **Order**: title, case-insensitive alphabetical — no relevance or snippet (AD-63 holds: a snippet
is content to filter, ranking betrays hidden content). 100 then « Charger la suite ». A
label alone, without a word, lists sheets carrying it. **Player mode** (GM): E-17's top bar
carries the shell's toggle (« Mode MJ » / « Mode Joueur »); in Player mode, search answers like for a
player who authors no section (AD-39, AD-101) — without GM blocks, without sheets a player cannot
read; the mode goes through the address (`&mode=joueur`) and follows the GM arriving from a sheet open in
Player mode (« Rechercher », a label).

| State | What is seen | Available actions |
|---|---|---|
| empty | spaces-only input is not sent: the initial state stays; no input or filter: « Cherchez un nom, un alias ou un mot. »; no results: « Aucune fiche ne correspond. » | change input, remove a filter |
| loading | « Recherche… » below the field, previous results stay dimmed; on opening, the label row waits for its call (no chips, rest of screen usable); loading « Charger la suite »: button dimmed and reads « Chargement… » | — |
| error | « La recherche n'a pas abouti. Réessayez. » (field and filters kept); « Charger la suite » failure: « Impossible de charger la suite. », results stay; label-row failure: absent, no message; input exceeding 100 characters (paste, or `?q=` address: field does not block typing but refuses submission): « Erreur : 100 caractères au plus. » | « Réessayer » (only for « La recherche n'a pas abouti. »; other errors are corrected by changing input, or disappear at the next search) |
| connection lost | shell's connection-lost banner (text in the common-texts section); field stays, search is not sent; displayed results stay readable, « Charger la suite » disabled | — |
| refusal | account without a role: « Page introuvable. »; an unreadable sheet is never a result, a label carrying only unreadable sheets is not offered | — |
| long content | 501 results: 100 then more; long title truncated with « … » and tooltip; 120-character alias and 40-character label truncated with « … » and tooltip; more than 4 labels on one row: « +N »; chip rows wrap; on a phone (390 px) the type row scrolls horizontally within itself, never the page | same |

*Criteria.*
- Given the word « sous-main » present only in the GM block of « Port-Sel », when Léa
  searches « sous-main », « Port-Sel » is not a result; when Antor searches it, it is.
  When Antor searches it in Player mode, « Port-Sel » is not a result.
- Given « Savoir » disabled in « Lame d'Ébène » and « Chronique de l'Âge d'Ombre » (lore
  readable by Léa), when Léa searches « chronique », it is a result under « Tous », and no
  « Savoirs » chip is offered.
- Given « Le Pendu Joyeux » with subtype « Taverne », when Léa searches « taverne »,
  « Le Pendu Joyeux » is a result; under the « Lieux » chip, only locations are results.
- Given the link text « La Guilde des Brumes » written in « Histoire » (read by Léa) targeting a
  sheet Léa cannot read, when Léa searches « guilde », « Port-Sel » is a result and « La
  Guilde des Brumes » is not (this link is seeded by `kanevas-import-liens`, delivered before search in the plan order but not its dependency: the criterion is played at the epic's overall acceptance, P-12 step 4).
- Given « Port-Sel » with alias « Salport », when Léa searches « salport », « Port-Sel » is
  a result, with « alias : Salport ».
- Given the « Côte des Brumes » label on « Port-Sel » and « Cercle des Cendres »
  (unreadable by Léa), when Léa filters by it, only « Port-Sel » is returned.

### Search — what `kanevas-import-recherche` builds

- **File and address**: `frontend/src/ecrans/recherche.tsx` (an `Ecran` in the registry), address `/univers/:id/recherche`. The « Rechercher » (`search`) entry is **first** in `items.ts`, before « Vue d'ensemble », and appears only with the screen registered. The `/` shortcut (outside an input field, open dialog or editor) is installed once by the shell (`useRaccourciRecherche`, called in `Cadre.tsx`) and navigates to the above address; outside a universe it does nothing.
- **Input**: search starts 300 ms after the last keystroke or on Enter, and at every chip change; input shorter than 1 meaningful character is not sent; the address follows state (`?q=&type=&etiquette=&mode=`, history entry replacement, no stacking). Only one request is in flight: the latest wins.
- **Type chips**: « Tous » then **enabled** types (product list order); one at a time. Label chips: those returned by `GET /api/univers/:id/etiquettes` (name, case-insensitive alphabetical order), one at a time; pressing the active chip again removes it. An address naming unknown or unavailable types or labels ignores them (no error).
- **Player mode**: the shell toggle (`cadre-contexte`), which stays displayed with the GM's navigation; the mode is sent as `?mode=joueur` on every request of this slice (list, offered labels, label writes); the GM arriving from a sheet in Player mode keeps the mode (`&mode=joueur` set by the « Rechercher » link and E-9's label chips). A non-GM has no toggle and the `mode=joueur` address changes nothing for them.
- **Dialog aliases and labels**: on save, « Enregistrer » is dimmed and reads « Enregistrement… » until the response; no loading state on opening (dialog opens with already-read values); 20 aliases of 120 characters and 20 labels of 40: chips wrap and dialog scrolls vertically; permission: the dialog does not exist for a player or in Player mode (menu without the entry, nothing to refuse).
- **`/` key**: E-17 task criterion; it does nothing in a field, editor, open dialog or outside a universe.
- **Result**: link to E-9; an alias is shown only if the **title does not match** the words and an alias does (first alphabetically); the sheet's labels follow, each reapplies the filter. Offered label chips and a sheet's label chips never count an unreadable sheet.
- **E-9**: below the title « Aussi appelée … » and label chips (links to E-17 `?etiquette=`); the « Alias et étiquettes… » dialog saves both lists at once (« Enregistrer » / « Annuler »; refusals: « Erreur : 20 alias au plus. », « Erreur : 20 étiquettes au plus. », « Erreur : 120 caractères au plus. », « Erreur : 40 caractères au plus. »; case-insensitive duplicates are ignored during input); toast « Alias et étiquettes enregistrés. ». It is hidden from a player and the GM in Player mode.
- **Dialog states**: empty (sheet without aliases or labels): two empty fields, « Enregistrer » active (nothing to write = no call); server refuses save: « L'action n'a pas abouti. Réessayez. », input stays; connection lost with dialog open: banner, « Enregistrer » disabled, input stays; « Annuler » or Escape discards unsaved input without asking. The dialog is described only here (no separate mockup: a dialog in E-9's family, `e09-fiche-importee.html`).
- **Stub seed** (`KANEVAS_STUB=1`, universe « Lame d'Ébène »): aliases « Salport » and « Port-aux-Sels » on « Port-Sel »; label « Côte des Brumes » on « Port-Sel » and « Cercle des Cendres » (unreadable by Léa); readable lore « Chronique de l'Âge d'Ombre » (subtype « Récit »); word « sous-main » only in the GM block of « Port-Sel » (seeded by `kanevas-import-secrets`); subtypes « Taverne » (« Le Pendu Joyeux ») and « Récit » come from `kanevas-import-types` and this seed.

### E-18 API access (GM)

*Finished mockup*: `docs/maquettes/e18-acces-api.html` (states `#etat-nouveau`, `#etat-jeton-montre`,
`#etat-lot`, `#etat-vide`, `#etat-perdue`).

Reached through « Univers ▸ Accès par API » (`key-round`), GM only. The mockup's « Demander à Kanevas » button belongs to the assistant, present on all screens (B-26, E-12), with nothing specific to E-18. A one-line introduction:
« Un jeton permet à un script d'écrire dans cet univers avec vos droits, par l'API d'import. » and
the **base address** to copy (`https://kanevas.berard.me/api/import/v1/univers/<id>`, « Copier »,
toast « Adresse copiée. »). Two panels.

1. **Tokens** — « Nouveau jeton » (`plus`). One row per token, active first then revoked and expired
   (the last 20): name, « créé par antor le 11 oct. 2026 », « dernier usage il y a 3 min » or
   « jamais », « expire le 10 nov. 2026 » or the « Révoqué » (danger) / « Expiré » (neutral) chip, information separated by « · » on desktop; « Révoquer » on
   hover (visible on touch). *New token*: « Nouveau jeton » dialog — « Nom » (1 to 80 characters,
   required), « Durée » (segmented toggle « 7 jours », **« 30 jours »**, « 90 jours », « 1 an »), « Créer le
   jeton », « Annuler »; then the same dialog shows the token name as a label and the token alone, monospace, full width, then the notice (`circle-alert`) « Il ne sera plus jamais affiché. Rangez-le dans la configuration de votre
   script. », and at the foot « Copier » (toast « Jeton copié. ») and « J'ai copié le jeton » — while the token is shown, only this button closes the dialog
   (neither Escape nor overlay); the token row then arrives at the top of the list. A token whose GM no longer has that role (B-46) remains listed, with the « Inactif » chip
   and tooltip « Son créateur n'est plus MJ de cet univers. » (on touch, the same sentence appears below the row); it remains among active tokens, sorted with them by creation date; « Révoquer » stays possible. During « Créer le
   jeton » and « Révoquer le jeton » the button is disabled and reads « Création… » / « Révocation… » (no double submission); « Annuler » and dialog closing are also disabled until the response. The mockup draws neither « Inactif » nor these buttons: this text is authoritative (neutral chip in `--texte-2`; « Révoqué » has danger tint, « Expiré » neutral). *Revoke*: dialog « Révoquer « Script Kanka — Mac » ? Le script
   qui l'utilise ne pourra plus rien écrire. », « Révoquer le jeton » (`--danger`) / « Annuler »; toast « Jeton révoqué. ».
2. **Import batches** — the last 20 batches, newest first: opening date, token, state (« En
   cours », « Clos », « Abandonné » — open with no write for more than 24 h), and counters
   **per object nature**, in sequence separated by « · », natures without objects omitted: « Fiches : 498 créées ·
   3 refusées », « Fichiers : 1 140 créés », « Campagnes : 4 créées », « Scénarios : 12 créés »,
   « Relations : 324 créées », then « 6 liens et références en attente » and « 1 avertissement ». Within a
   nature, each form (« créée(s) », « mise(s) à jour », « inchangée(s) », « refusée(s) ») is written only
   if nonzero: a replay with nothing new reads « Fiches : 1 inchangée » (the API report
   returns all counters, `creees: 0`), and a zero pending or warning count is omitted
   (the mockup shortens it to « 6 en attente »; this text is authoritative). A refused `PUT` (400) with its batch
   counts one refusal and records its origin key and reason (for example, « campagne inconnue : c:absente »
   or « type « monstre » inconnu de Kanevas »); without a batch it leaves no trace here. A
   row expands:
   refusals and warnings, each with the origin key, what is affected and the reason
   (« section « Vérité » : 112 000 caractères, 100 000 au plus »; « parent lieu:les-docks inconnu :
   fiche écrite sans parent »; « section « Notes » modifiée dans Kanevas depuis le dernier import : non
   écrasée »; « titre modifié dans Kanevas : non écrasé »), in two groups titled with their count (« 3 refusées », « 2 avertissements »), at most 200
   then « … et 37 autres ». A batch without refusals or warnings does not expand. The token,
   address and origin keys use monospace (system `ui-monospace` stack, charter).
   File warnings also include « fichier vide : 0 octet, refusé », « visibilité modifiée
   dans Kanevas : non écrasée » and « nom modifié dans Kanevas : non écrasé ». A pending
   reference warns « fichier « img:quais » inconnu : référence en attente ».


| State | What is seen | Available actions |
|---|---|---|
| empty | « Aucun jeton. Créez-en un pour qu'un script écrive dans cet univers. » (no tokens at all; with only revoked or expired tokens, the list shows them without this text); « Aucun lot d'import pour l'instant. » | « Nouveau jeton » |
| loading | skeletons of both panels | — |
| error | « Impossible de charger cette page. »; empty name: « Erreur : le nom est obligatoire. »; failed creation or revocation: « L'action n'a pas abouti. Réessayez. », nothing changed (no half-created token) | « Réessayer » |
| connection lost | banner; « Nouveau jeton » and « Révoquer » disabled; if the dialog shows a token, it stays displayed until « J'ai copié le jeton » | copy |
| refusal | Player, account without a role, admin without a role: item absent, « Page introuvable. »; role removed while viewing: « Vous ne pouvez plus gérer l'accès par API de cet univers. » at the next action | « Mes univers » |
| long content | 80-character name truncated with « … » and tooltip; batch of 501 refusals: 200 then « … et 301 autres »; more than 20 tokens: last 20, always all active ones | same |

*Criteria.*
- Given Antor, GM, when he creates « Script Kanka — Mac » for 30 days, the token is shown
  once; after « J'ai copié le jeton », the row shows the name, « jamais » and expiry, and the
  value is no longer anywhere on screen or in an API response.
- Given this token revoked, when the script calls the import API with it, it receives 401
  and no batch appears.
- Given a closed batch with 3 refusals, when Antor expands the row, he reads the 3 origin keys
  and their reasons.
- Given Léa, Player, when she opens E-18's address, she sees « Page introuvable. »
  and the item is absent from her sidebar.

### E-14 and E-15 — « Types de fiche »

*Finished mockup*: `docs/maquettes/e14-types-de-fiche.html` (E-14 panel, E-15 panel,
states `#etat-sans-systeme`, `#etat-confirmer`, `#etat-joueur`, `#etat-supprimer-univers`).

**E-15 (system)**: a fourth « Types de fiche » tab after « Règles », « Créatures », « Objets ». One row
per type in the product list (except session report): icon, name, and an **« Activé » switch**
(column titled « Système »).
Below the list: « Utilisé par N univers. Un univers peut forcer un type à activé ou désactivé dans ses
paramètres. » Toggling saves immediately (toast « Vaisseau désactivé pour CoF Mini. » or « Vaisseau activé pour CoF Mini. »); any universe
following the system sees it on the next load. Player: list, read-only switches
(« Lecture seule »).

**E-14 (universe)**: a fourth « Types de fiche » panel, after « Créer un système ». One row per
type: icon, name, number of sheets of this type in the universe (« Aucune fiche », « 1 fiche », « 201 fiches »), and a **three-option
segmented toggle**: « Système · activé » (or « Système · désactivé »; « Par défaut · activé »
for a universe without a system), « Activé », « Désactivé ». An override carries an accent dot to the
left of the name; if the override contradicts the system, the row says « Le système le désactive. » (or « Le système
l'active. »). Saved on change, toast « Vaisseau : activé dans Lame d'Ébène. » (« désactivé »,
« suit le système »). Disabling (by override or inheritance) a type with sheets asks for
confirmation: « Désactiver « Lieu » dans Lame d'Ébène ? Les 201 lieux restent ; on les atteint par un
lien, la recherche ou l'arbre. » (singular: « Le seul événement reste ; … »), buttons
« Désactiver » / « Annuler ». The « Supprimer l'univers » panel ends the page, separated by a
`--danger` rule: « Supprimer l'univers » opens a dialog « Supprimer « Lame d'Ébène » ? Tout son contenu —
fiches, sections, fichiers de la médiathèque, campagnes, cartes, jetons — sera effacé, pour tous ses membres. Le
système de jeu reste. »; a « Tapez le nom de l'univers pour confirmer » field; « Supprimer
l'univers » (`--danger`) activates only if the typed name matches exactly (including case). Afterwards: E-1, toast
« Univers supprimé. ».

| State | What is seen | Available actions |
|---|---|---|
| empty | not applicable: product list is never empty; universe without a system: « Par défaut · activé » column | override |
| loading | panel skeleton; other panels load independently | — |
| error | failed change: « L'action n'a pas abouti. Réessayez. » above the panel, toggle reverts; failed deletion: message in dialog, universe stays | « Réessayer » |
| connection lost | banner; toggles, switches, « Supprimer l'univers » disabled | read |
| refusal | E-14: Player — page not found (unchanged); E-15: Player — read only; GM who no longer has a role: « Vous ne pouvez plus modifier ces paramètres. » | — |
| long content | E-15: same states as this row and previous rows of this table (tab skeleton, « L'action n'a pas abouti. Réessayez. », connection-lost banner disabling switches, one column on a phone); 13 configurable types: list fits without scrolling on desktop, one column on a phone (toggle moves below name); 80-character universe name in dialog: wraps | same |

*Criteria.*
- Given « CoF Mini » disabling « Vaisseau » and « Lame d'Ébène » overriding it to « Activé »,
  when Antor opens « Lame d'Ébène », « Vaisseaux » is in his sidebar; when Mira opens « Les
  Landes grises » (following the system), it is absent.
- Given « Lame d'Ébène » following the system for « Note », when the system enables « Note » again,
  « Notes » appears in « Lame d'Ébène »'s sidebar on the next load.
- Given a universe whose GM disables « Lieu », « Lieux » leaves the sidebar and creation,
  and a link to a location still opens its sheet.
- Given Antor typing « lame d'ébène » in « Lame d'Ébène »'s deletion dialog,
  « Supprimer l'univers » stays inactive; with the exact name, the universe is deleted, and Léa opening
  one of its addresses sees « Page introuvable. ».

#### Types — what `kanevas-import-types` builds

E-14's « Supprimer l'univers » panel belongs to `kanevas-import-tenir`;
this slice builds the « Types de fiche » panel and tab above, and the following.
The type list (identifier, address, labels, icon) is the server's (AD-120): screens
read it through `GET /api/univers/:id/types`, keeping no copy. Icons (Lucide):
character `users-round`, location `map-pin`, faction `shield`, item `gem`, event `hourglass`, quest
`scroll-text`, creature `paw-print`, race `dna`, ship `ship`, lore `lightbulb`, story `book-open`,
rule `scale`, note `sticky-note`; E-8 addresses: `/univers/:id/fiches/<pluriel>` (`creatures`,
`races`, `vaisseaux`, `savoirs`, `recits`, `regles`, `notes`).

**Sidebar.** The « Lore » section is built from the response: enabled types, in list
order. During loading, three skeleton rows below the « Lore » title; on error, the
« Impossible de charger les types. » row and « Réessayer » instead — the rest of the sidebar stays unchanged.
If no type is enabled (all disabled), the section shows « Aucun type de fiche activé. » (and, to the GM,
the « Régler les types » link to E-14). Connection lost: sidebar keeps the last read list; without a
previously read list, this is the error state.
After a setting change (E-14, E-15) in another tab, the sidebar updates on return to the tab or on the
next load, never in the middle of input.

**E-8 — creation and subtype.** The creation dialog's « Type » list offers only enabled
types; the « Sous-type » field (optional, at most 60 characters, « Erreur : 60 caractères au plus. »)
suggests, while typing, subtypes already used for the chosen type (title « Sous-types de lieu déjà
employés »); changing type in the dialog clears the field. If another GM just disabled the
type, « Créer » answers « Ce type est désactivé dans cet univers. » in the dialog, nothing is created. The
« Sous-type » filter appears only if at least one readable sheet of this type has one; while
loading it is disabled (« Sous-type : … »); on failure, « Sous-types indisponibles. » replaces it
and the grid stays usable. If « Créer » fails: « L'action n'a pas abouti. Réessayez. » in the dialog, input kept. Long content: 40
distinct subtypes: filter list scrolls; a 60-character subtype is truncated with an ellipsis, full text
in its tooltip. A filtered subtype with no remaining sheet (renamed meanwhile) returns
« Aucune fiche de ce sous-type. » with « Voir tous les lieux ».

**E-9 — inline subtype.** The GM (outside Player mode) clicks the badge's subtype: field, completion
list, Enter saves, Escape cancels (mockup `#etat-sous-type`). Saving: field
disabled, « Enregistrement… ». Failure: « L'action n'a pas abouti. Réessayez. » below the field, typed value
kept. An emptied field removes the subtype (« Sous-type retiré. »). Connection lost: editing disabled (subtype stays readable). Long content: 60 characters, truncated with
an ellipsis in the badge, full text in the tooltip. A player reads the subtype as
plain text; a sheet without a subtype shows nothing to a player.

**E-9 — « Changer le type… »** (GM, outside Player mode; absent for a session report): mockup
`e09-fiche-importee.html#etat-changer-type`. « Changer le type de « Port-Sel » » dialog: a
single-choice type list, enabled types first, then the « Autres types » title with
disabled ones (« désactivé » in `--texte-3`), current type checked and marked « (actuel) »; choosing
« Personnage » opens the « PJ / PNJ » choice (NPC by default); the « Sous-type » field (empty by default for a
different type, with subtypes already used for the chosen type). If the sheet has a subtype, the dialog says:
« Le sous-type « Port » sera retiré. » until the field is filled. Buttons « Changer le
type » (disabled while the type stays current) and « Annuler ». Afterwards: sheet reloads under its
new type, toast « Type changé : Note → Savoir. », breadcrumb and sidebar follow; its sections,
relations, map placements and proposals stay intact.
The PC / NPC choice appears only when **becoming** a character; an existing character's PC / NPC status
cannot be changed here. Loading: until the type list is read, the dialog's list says « Chargement des
types… » and « Changer le type » stays disabled. Long content: a 120-character title wraps in
the dialog title; a 60-character subtype is truncated with an ellipsis in the badge, full text in its
tooltip and field. Failures: « Le type n'a pas changé. Réessayez. » in the dialog (it stays open); a GM who no longer has a
role: « Vous ne pouvez plus modifier cette fiche. »; connection lost: banner, button disabled.
Saving: button becomes « Enregistrement… » and dialog is frozen. Type-list read failure:
« Impossible de charger les types. » and « Réessayer » replace the list, button disabled.
The 13-type list scrolls within the dialog (bounded height) on desktop and on a phone, where the dialog fills
the screen. A subtype exceeding 60 characters entered in the field: « Erreur : 60 caractères au plus. ». The
empty case is not applicable: the type list is never empty (thirteen configurable types).
**E-9 — inline subtype.** The completion list scrolls beyond eight entries; with no subtype already
used for this type, it does not appear and the field stays free-form.
**E-8 — filter count.** The « Port (N) » count stays visible, up to 9,999; beyond that the
chip says « Port (9 999+) ».
**E-14 — type toggle.** Toast, like E-15's (same component, mockup `e14`: `.toast`):
« Vaisseau : activé dans Lame d'Ébène. » / « … : désactivé dans … » / « … : suit le système. ».
**E-15 — « Types de fiche ».** « Utilisé par 0 univers » and « Utilisé par 1 univers » (singular) below the list;
an 80-character system name wraps in the header.
**Roles (kanevas-import-types).** Player: E-9 shows the subtype read only; « Changer le type… » is
**hidden**; creation's « Sous-type » field is **absent** (creation is not offered); the sidebar's
« Régler les types » link is **hidden**. Instance admin without a role in the universe: no
« Lore » section (the sidebar belongs to no universe for them).

The `e08-liste-fiches.html` mockup is not redrawn for subtype: the text above says where it goes
(below the card title, `--texte-3`; filter beside search).

*Slice criteria* (the screen criteria above still apply).
- Given « Les Cristaux d'Ombre » (« Savoir · Ressource »), when Antor changes it to « Note », it is
  in « Notes » without a subtype, and the dialog had announced this.
- Given « Lame d'Ébène » where « Note » is disabled, when Antor opens « Changer le type… » on a
  sheet, « Note » is under « Autres types » and choosing it works.
- Given a disabled type, when Antor opens its list address, it opens with « Ce type
  est désactivé dans cet univers. » and no creation button.

### E-7, E-13, E-5

- **E-7** and **E-15** entries: the Markdown editor and rendering above, with what each
  text allows (Depending on the text): E-7 keeps « Lien vers une fiche »; neither E-7 nor E-15 has
  « Fichier » or « Bloc MJ »; E-15 has no sheet link.
- **E-13**: order is the sheet's creation date, which is its **original date** if the import
  provided one (B-50); the row shows that date.
- **E-5** (B-51, last slice): a « Jeton de l'assistant » panel below the universe
  list — « Aucun jeton posé. » or « Jeton posé le 11 octobre 2026. » (never the value);
  « Connecter l'abonnement » shows the authorization address (« Ouvrir », « Copier ») and a
  « Code » field with « Valider »; the window expires after 10 minutes (« La connexion a expiré.
  Recommencez. »); a refused code: « La connexion n'a pas abouti. Recommencez. », old token stays.
  States and mockup: the slice.

### Closure of `kanevas-import` (scope)

- **Every need has a screen**: B-32 E-9, E-7, E-15 · B-33 E-9 · B-34 E-9 (and E-17, E-12 for what
  they do not show) · B-35 E-9, E-8 · B-36 E-9 · B-37 E-17 · B-38 E-9, E-17 · B-39 E-9 · B-40 E-9 ·
  B-41 E-14 · B-42 E-14, E-15, sidebar · B-43 E-9 · B-44 E-9 · B-45, B-46, B-49 E-18 · B-47, B-48: **no
  screen, by decision** — the action is the script, its result is read on E-18 (B-49); AD-53 holds:
  an import's screen is E-18 · B-50 E-9, E-13 · B-51 E-5 · B-52 E-8, E-9, E-17 · B-53, B-54 E-19 ·
  B-55 E-9 (both add paths), E-19 (the picker) · B-56: no screen (the script), result on E-19 and E-18 — holds.
- **Every screen is reached by a journey**: E-17 (P-12), E-18 (P-10, P-11), E-14 and E-15 (P-13,
  P-10), E-9 (P-12, P-14, P-16), E-8 (P-12), E-5 (P-15), E-19 (P-16, P-10) — holds.
- **Every role has its column**: GM, Player, Instance admin for E-17, E-18 and E-19 (matrix); the import
  script is not a role: it acts as the token's GM, on the API alone — holds.

## Screen details for `kanevas-import-jeton-assistant`

> **E-5** gets a panel, nothing else (B-51, P-15). Finished mockup:
> `docs/maquettes/e05-administration.html` (main states: empty, set, connecting, failure, expired, read error; others are described by the table below). Common texts
> (loading, error, connection lost, refusal) are those of E-5 above.

**Location.** A full-width « Jeton de l'assistant » panel, **below** both areas (universe
list, members), visible regardless of universe selection (unchanged addresses:
`/administration`, `/administration/univers/:id`); the token belongs to the instance, not a universe.
Selecting a universe does not reset the panel, a connection in progress survives a universe
change. The panel **never** shows the token value: neither in a response, the DOM,
nor an error message.

**What is seen.** Title; a status line, in this priority order: « Jeton posé le 11 octobre
2026. » (token from the volume file, date set), « Jeton fourni par le déploiement. » (no
file, nonempty `CLAUDE_CODE_OAUTH_TOKEN` variable: the panel does not know since when),
« Aucun jeton posé. »; the « Connecter l'abonnement » button (« Reconnecter l'abonnement » once a token is set, from file
or deployment, in all states below). An admin also belonging to a universe sees the panel like the others. Clicking starts the connection: the authorization address, read only, with « Ouvrir »
(new tab, `rel="noopener noreferrer"`) and « Copier » (« Copiée. » 2 s); a « Code » field and
« Valider »; « Annuler »; the notice « Cette connexion expire dans 10 minutes. » followed by « Reste 9 min. »
(whole minutes rounded up, « Reste moins d'une minute. » below one minute; refreshed every second, without spoken
announcement; at 0 the expiry sentence replaces the field). Reloading the page does not reopen the connection: the panel restarts from the read state, without an address or « Code » field; the server's
connection lives until expiry. When an admin clicks « Connecter » (the same admin after reload, or a second admin), the
server starts a new one replacing the previous one, and the old one's « Valider » then receives « La connexion a expiré.
Recommencez. ». « Valider » is disabled while the field is empty. The pasted code is not kept: the
field is cleared after every validation. The set token takes precedence over the variable: a volume token is
replaced through a new connection, never through an input field (there is none).

| State | What is seen | Available actions |
|---|---|---|
| empty (no token) | « Aucun jeton posé. »; below the title: « L'assistant est indisponible tant qu'aucun jeton n'est posé. » (shown only if the assistant truly has no way to answer; under the stub, where the assistant already answers, nothing) | « Connecter l'abonnement » |
| set | « Jeton posé le 11 octobre 2026. » (or « Jeton fourni par le déploiement. »); « L'assistant est disponible sur tous les univers. » (the token belongs to the instance: intentional also for the deployment token) | « Reconnecter l'abonnement » |
| loading | « Chargement de l'état du jeton… » (reading state); « Connexion en cours… » during startup (button disabled, `aria-busy`) | — |
| connecting | address, « Ouvrir », « Copier », « Code » field, « Valider », « Annuler », remaining time | paste code, validate, cancel |
| validating | « Validation… », field and buttons disabled | — |
| just set | « Jeton posé le 11 octobre 2026. » (`role="status"` region), field disappears; assistant available without redeployment or restart | « Reconnecter l'abonnement » |
| failure | refused code: « La connexion n'a pas abouti. Recommencez. »; old state (set or not) stays displayed, field cleared, ongoing connection ended server-side | « Connecter l'abonnement » (« Reconnecter » if a token is set) |
| other validation failure (server unreachable, 5xx) | « L'action n'a pas abouti. Réessayez. »; field cleared, connection stays open until expiry | paste again, cancel |
| expired | after 10 minutes, or server restarted: « La connexion a expiré. Recommencez. »; old state stays | « Connecter l'abonnement » (« Reconnecter » if a token is set) |
| read error | « Impossible de charger l'état du jeton. » with « Réessayer »; rest of page stays usable | « Réessayer » |
| startup error | « La connexion n'a pas pu démarrer. Réessayez. » (`claude` or `script` program absent, or no address returned in 30 s); no technical detail | « Connecter l'abonnement » (« Reconnecter » if a token is set) |
| connection lost | banner; « Connecter l'abonnement » (« Reconnecter » if a token is set), « Valider » and « Annuler » disabled; loaded state stays | read |
| refusal | any account outside the group: entire page is « Page introuvable. » (E-5 above); a panel route without the group answers 404 like an unknown address | « Mes univers » |
| long content | authorization address (more than 200 characters) wraps across lines in a scrolling area without widening the page; « Code » field accepts at most 500 characters | same |

**Keyboard and screen reader.** The panel is a titled `section`; opening the connection places
focus on the « Code » field; on expiry or failure focus returns to the « Connecter
l'abonnement » button; status messages are in an `aria-live="polite"` region, except remaining time.

*Criteria.*
- Given Admin (`parents` group) and a stub without a token, when they open `/administration`, the
  panel says « Aucun jeton posé. »; when they click « Connecter l'abonnement », they see an authorization
  address, a « Code » field and disabled « Valider ».
- Given the connection open, when Admin pastes `bouchon` and validates, they see « Jeton posé le
  <date du jour>. »; assistant availability, read **without** `KANEVAS_STUB` (injected config),
  is `claude-agent`, without restart; no panel-route response contains the token
  value (the test searches for the dummy value in every body and the log).
- Given the connection open, when Admin pastes another code, they see « La connexion n'a pas
  abouti. Recommencez. » and the previous state (set or not) is unchanged; a second valid attempt opens.
- Given the connection open and the clock advanced beyond 10 minutes, when Admin validates, they
  see « La connexion a expiré. Recommencez. »; the process is stopped.
- Given a token set through the panel and a different `CLAUDE_CODE_OAUTH_TOKEN` variable, the
  assistant uses the file's token; after deleting the file, the variable takes over.
- Given an open connection, when Admin reloads the page, the panel shows the read state (« Aucun jeton posé. » or « Jeton posé… ») without an address or « Code » field; when they click « Connecter l'abonnement », a new address appears; and « Valider » in a second tab left on the old connection says « La connexion a expiré. Recommencez. ».
- Given the panel displayed, when the network is cut, « Connecter l'abonnement » (or « Reconnecter »), « Valider » and « Annuler » are disabled and the banner appears; when the network returns they reactivate.
- Given Léa (outside the group), when she calls a panel route, she receives 404.

## Screen details for `kanevas-outils` (scope)

> Scope proposed on 2026-10-16 (`epic/kanevas-outils`). Needs B-57 to B-79, journeys P-17 to P-21,
> decisions AD-121 to AD-137. Key screens, with finished mockups: **E-20** (`docs/maquettes/e20-outils.html`,
> key moment of P-17), **E-21** (`e21-carte-galaxie.html`, P-18), **E-22** (`e22-concepteur-vaisseaux.html`, P-19,
> with E-9's managed section). Common texts (loading, error, connection lost, refusal) are those of
> `kanevas-premiere-fiche`. **Format**: both tools work on phones and tablets as on
> desktop (B-70): below 760 px, one column, panels below the map, hover gestures become taps.

### What a tool brings to the interface

Three entry points, according to the tool type's contract (AD-122): a **dynamic map** lives in the
maps section (E-10) and opens on its screen; a **generator** has its own screen (E-22) and **managed sections** on
sheets; a **play aid** would have its own sidebar entry (none here). A tool's code loads
only when its screen opens or when a sheet shows one of its sections (AD-133). No screen is
added or modified manually in the router: a module declares its entry point.

### E-20 — Tools (E-14 and E-15 tab)

**Content**: a card per applicable tool (name, one line, « Système · activé/désactivé », « Univers · suit /
forcé »), its **dependencies**, **visibility** (two checkboxes, GM and Players), **settings** (each: effective
value, its source, « Remplacer pour l'univers »), **catalogue** (version, element count per
nature, « Importer un catalogue… », « Voir les éléments »), and at the foot « Supprimer les données de l'outil… ». At the top, on E-15, the
system's **manager** and « Transférer la responsabilité ».

| State | What the user sees | Text |
|---|---|---|
| empty | system has no applicable tool | « Aucun outil ne s'applique à ce système de jeu. » |
| loading | card skeletons | « Chargement des outils… » |
| error | list does not arrive | « Impossible de charger les outils. » + « Réessayer » |
| offline | banner; all writing actions disabled | « Connexion perdue. » |
| refusal | a player: « Page introuvable. »; a GM who is not the system manager: read only, actions **hidden** | — |
| long content | 6 tools: scrolling list; 300-line import report: truncated to 50 refusals with « Voir tout » | « 237 autres refus… » |

Criteria:
- Given a test tool depending on another disabled tool, when Antor, GM and manager, attempts to enable it,
  it stays disabled and the screen says « <Outil> demande <autre outil> : activez-le d'abord. » (no SWN tool has a dependency).
- Given Mira, GM of an attached universe but not the system manager, when she opens E-20 on the system, she sees
  tools and their values and neither « Activer », « Importer » nor « Supprimer les données ».
- Given a catalogue file where a weapon lacks mass, when Antor imports it, the preview lists
  « 1 refusée » with the key and `masse` field, the rest is offered for application, and nothing is written before « Appliquer ».
- Given Léa, Player, when she forces E-20's address, she reads « Page introuvable. ».

**Catalogue elements** (« Voir les éléments », on E-14; Monsieur's decision of 2026-10-17): list by
nature, each element with its origin (« Système », « Univers », « Remplacé pour l'univers », « Retiré de
l'univers ») and, for a universe element, « Visible des joueurs » / « MJ seul ». Universe GM actions:
« Masquer aux joueurs » and « Rendre visible » on a universe element; « Retirer de cet univers » and
« Rétablir » on a system element. On E-15 (system), the list is read without any of these actions.
- Given the universe weapon « Lance d'Orak'Ziel » hidden by Antor, when Léa opens the designer,
  it appears in no list, and nothing says an element is missing; Antor sees it, marked « MJ seul ».
- Given Léa's design already carrying the « Lance d'Orak'Ziel », when Antor hides it, Léa still sees it
  on her ship and saves again without warning; she can no longer add it elsewhere.
- Given the system's « Laser à impulsion » overridden for « Éneria d'essai » then hidden, when Léa opens the
  designer, no « Laser à impulsion » appears in her list (neither universe nor system element);
  a design carrying it is calculated with the universe's values.
- Given the system hull « Corvette » removed from « Éneria d'essai », no account in that universe
  sees it in the designer; the system's other universe sees it; « Rétablir » brings it back.

### E-21 — Galaxy map

**Content**: a hexagonal canvas (pan, zoom, pinch), legend, selected-system panel
(name, size, readable notes, routes, shareable link), measurement on hover (touch: tap), the
« Trajet » tool (departure, arrival, routes: all / public, drive → distance and duration), system search
(among readable systems). GM: « Placer un système », « Promouvoir », « Tracer une route », « Dessiner une zone »,
« Renommer », « Supprimer la galaxie… » (confirmation: « Les 214 systèmes, 49 routes et 6 zones de cette galaxie seront effacés. »), « Graine… », « Document MJ… » (choose the sheet, or create one of type lore; the tool writes the GM-only « Document MJ » managed section there), Player mode. The view requests only the blocks it shows.

| State | Text |
|---|---|
| empty | GM: « Aucun système défini. Placez-en un ou promouvez un système généré. »; Player: « Rien à voir sur cette carte pour l'instant. » |
| loading | « Chargement de la carte… » (blocks arrive progressively) |
| error | block not arriving: block stays empty, « Impossible de charger une partie de la carte. » + « Réessayer » |
| offline | displayed view stays, « Connexion perdue. » banner, writes disabled |
| refusal | map not visible to role, or tool invisible: « Page introuvable. » (GM in Player mode on hidden map: E-11 notice) |
| long content | 500 defined systems, 49 routes: name labels collapse on zooming out; 80-character names truncated |
| conflict | « Ce système a changé depuis que vous l'avez ouvert. » + « Recharger » |

Criteria:
- Given Léa, Player, when she searches « Station fantôme » (a GM ghost system), search finds
  nothing, with no trace of hiding, and no route or zone leads there on her map.
- Given Léa at 390 px width, when she taps « Vael », the panel opens below the map with
  name, distance and « Trajet depuis ici ».
- Given the « Port-Sel » → « Vael » journey of 7 hexes with drive 2, when Léa calculates it, she reads « 4,5 jours ».
- Given Antor, GM, switching to Player mode, the private route and secret territory disappear from the
  map, journey and search.
- Given two visits to the same anonymous hex, the same system is generated; changing the seed asks for
  confirmation stating that all undefined systems change position.

### E-22 — Ship designer

**Content**: the **list** of readable designs (name, hull, class, price, alerts) and a design's **workshop**: on the
left, choices by nature (hull, drive, fittings, defenses, weapons, modifications) taken from the system
catalogue supplemented by the universe's (a local element is marked « Univers »); on the right, results
(price, HP, AC, free power and mass, shipyard, maintenance) and **alerts** (« Bloquante » / « À surveiller »),
« Enregistrer », « Recalculer » when the design is « calculée avec d'anciens réglages »; GM: « Générer les fiches de règles… » (creates missing rule sheets, one per nature, and the examples sheet; updates the others, managed sections). On E-9, the managed
section shows its banner and an « Ouvrir dans le concepteur » link.

| State | Text |
|---|---|
| empty | list: « Aucune conception. » (GM: « Créez une fiche de vaisseau, puis ouvrez-la ici. »); catalogue without elements: « Le catalogue du système est vide. Importez-en un (Outils). » |
| loading | « Chargement du concepteur… » |
| error | « Impossible de calculer ce vaisseau. » + « Réessayer » (never a partial result) |
| offline | choices locked, « Connexion perdue. » |
| refusal | unreadable design: « Page introuvable. »; non-author: read only, « Modifier » absent |
| long content | 40 fittings: list filterable by nature; design with 30 alerts: blocking first |
| conflict | « Cette conception a changé depuis que vous l'avez ouverte. » + « Recharger » |
| stale | « Calculée avec d'anciens réglages. » + « Recalculer » (nothing recalculated without the action) |
| removed element | « Bloquante » alert « Élément retiré de cet univers » on the choice row; « Enregistrer » refused until replaced; section text does not change (B-62, Monsieur's decision of 2026-10-17) |

Criteria:
- Given Léa, author of « Caractéristiques » on « Vent d'Orak », when she adds a weapon exceeding power,
  a blocking « Puissance insuffisante » alert appears and « Enregistrer » is refused with the reason.
- Given Léa on sheet E-9, « Caractéristiques » shows « Générée par le concepteur de vaisseaux » and no editor.
- Given Antor changing jump range in a universe setting, Léa's design shows « Calculée avec d'anciens
  réglages » and its text has not changed until someone recalculates.
- Given the designer disabled, the sheet shows « Caractéristiques » as text with « Outil désactivé ».
- Given Teo, without a role in the universe, when he forces a design's address, « Page introuvable. ».
