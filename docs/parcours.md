# Kanevas — audience, needs, journeys

> Product documentation. On `epic/kanevas`, the scoping target; on `main`, exactly what has
> been built. Stable identifiers: `B-n` (needs), `P-n` (journeys), `E-n` (screens,
> `docs/ecrans.md`), `AD-n` (decisions, `ARCHITECTURE.md`).
>
> **Built so far** (`kanevas-premiere-fiche`, systems, `kanevas-suivi`, `kanevas-fichiers`, `kanevas-relier-chercher`, `kanevas-recours-admin`): all of P-1, all of P-2 (step 3: the admin repairs membership, E-5),
> P-3 steps 1 to 4, all of P-4, P-5 step 1 (sheets and sections), P-6 steps 1-2 (search within a type), P-7 step 1 and the writing part of
> step 2, all of P-8 (B-13, B-14: E-14 then E-15), P-14 steps 2-3 and P-10 step 8 (`kanevas-import-tenir`: rename, delete a sheet, delete a universe). All of P-10 with `kanevas-import-reprise` (campaigns, scenarios, dated session reports and relations through the import API; sample replayed without duplicates by the test client, B-47 to B-50). All of P-16 with `kanevas-import-mediatheque` (the universe media library, E-19; add a file from a sheet, « Fichier » in the editor and « Joindre un fichier »: B-24, B-25, B-44, B-53 to B-56), hence P-3 step 4 and P-7 step 2 through this path. Also built: maps and graphs (E-10, E-11), sheet illustrations, systems outside universes (E-16), the assistant (E-12) and world updates from a session report (`kanevas-monde`): built screens are listed in `docs/ecrans.md`, which is authoritative for deciding which step of which journey exists. The rest of this document is the target.
>
> **Epic `kanevas-import`** (scoping proposed on 2026-10-11, on `epic/kanevas-import`): open
> Kanevas to an existing collection — first Monsieur's Kanka collection (501 sheets), pushed by a script
> running on his Mac — and provide what it needs to live there: Markdown, `[[…]]` links, GM blocks
> within text, sheet tree, incoming links, search across all types, aliases and labels, more sheet
> types chosen per system and universe, deletion, API token, subtype, media library. B-32 to B-56,
> P-10 to P-16, E-17 to E-19, AD-95 to AD-111. Monsieur resolved the scoping's `[À TRANCHER]` items on 2026-10-11; anything still open is marked `[À TRANCHER]` in place.

Kanevas is for **preparing** tabletop roleplaying sessions and **keeping their memory** between
sessions: universe lore shared between the GM and players with fine-grained section permissions,
campaigns, session reports, maps, and an assistant working with the same permissions as the
person talking to it. The table remains physical: Kanevas is not a live play tool.

## Audience

| Role | Who, when, where | Device |
|---|---|---|
| **GM** | prepares sessions in the evening or on Sundays at a desk; updates the world after a game. Several GMs can manage the same universe, all equal. | computer, mouse and keyboard |
| **Player** | rereads what they know between sessions, often on the bus or couch; writes a session report the next day; maintains their character's story. | phone for reading, computer for writing |
| **Instance admin** | last resort when a universe has no reachable GM; corrects membership without reading content. | computer |
| **Agent** | a GM's or player's assistant: never a role of its own, always the permissions of the person talking to it. | — |
| **Import script** | a program running **outside Kanevas** (the first: on Monsieur's Mac, reading his Kanka export) and pushing through the import API; never a role of its own: it uses a GM's API token, hence that GM's permissions in a single universe. Kanevas does not know Kanka: the script translates. | Monsieur's Mac, over the network |

Roles apply **per universe**: the same account can be a GM in one universe and a Player in another.
Without a membership row, an account sees nothing of the universe, not even its existence.

## Needs

Format from the `exigences` skill; each need cites the journeys that fulfill it.

### Accounts, universes, members
- **B-1** — When a person signs in for the first time (Authelia), Kanevas creates an account
  with access to no universe. *(P-1)*
- **B-2** — When an account creates a universe from the home page (E-2), it becomes its GM. *(P-1)*
- **B-3** — When a GM adds an account to their universe from the members page (E-4), as GM or
  Player, by typing its exact identifier, that account sees the universe; the GM changes or removes
  the role there too. An account can only be added if it has signed in at least once; no list
  of instance accounts is shown. *(P-2)*
- **B-4** — If an account loses its last role in a universe, Kanevas responds as though
  the universe did not exist. *(P-2)*
- **B-5** — As long as a universe has a GM, it keeps at least one: removing the last is refused.
  *(P-2)*
- **B-6** — The instance admin sees every universe's name and members and manages them
  from administration (E-5), without ever reading content; to read it, the admin adds themselves, visibly. *(P-2)*

### Lore and visibility
- **B-7** — A GM creates typed sheets — character (PC or NPC), place, faction, item,
  event, quest, and since `kanevas-import`, creature, ship, race, knowledge, story, rule, note
  (the product's list, B-42), among the types enabled for their universe — from a type's list (E-8). *(P-3, P-4, P-13)*
- **B-8** — A sheet consists of sections that the GM adds, reorders and removes on the sheet
  (E-9); for each, the GM chooses whether
  players may read or write it, and which player is its author with their own permissions. The GM
  reads and writes everything. *(P-3, P-7)*
- **B-9** — When an account opens a sheet, it only sees sections it may read, without
  titles or traces of others; a sheet with nothing readable does not exist for it. *(P-6)*
- **B-10** — A GM connects one sheet to another with a relation whose type is free text, carried by
  a section: it has that section's visibility, and an unreadable target is not named.
  *(P-3, P-9)*
- **B-11** — When an account searches a type's list (E-8), Kanevas only returns sheets
  it may read, including titles. *(P-6)*
- **B-12** — A GM switches their reading to Player mode on a sheet or map to see what
  a player at their table who authors no section would see. *(P-3)*
- **B-30** — A GM sets, replaces or removes a sheet's **illustration** (a PNG, JPEG,
  GIF or WebP image only, from its header, E-9); anyone who sees the sheet sees it at the top
  and as a thumbnail in the type's list (E-8), where a sheet without an illustration has a
  drawn fallback thumbnail; a Player cannot set it, and anyone who cannot see the sheet gets
  nothing from it (its address responds like an unknown address). *(P-3, P-6)*

### Write, link, organize (`kanevas-import`)
- **B-32** — The content of a section, scenario and system entry is **Markdown**:
  when an account saves it (E-9, E-7, E-15), Kanevas displays it formatted — headings, bold,
  italics, lists, quotes, tables, links, section images — and never interprets HTML written in
  the text, which is displayed as is; the editor has a **preview**. *(P-12, P-14)*
- **B-33** — When an account writing a section types `[[`, E-9 suggests sheets it may
  read and inserts a **link** to the chosen one; when reading, a link to a sheet the reader
  sees opens that sheet; a link to a sheet they cannot see appears like surrounding
  text, without underlining or any trace; a link whose target does not exist (deleted, never
  imported) appears as text for a player and marked « lien cassé » for a GM. In a scenario,
  a link targets a sheet in its campaign's universe under the same permissions; in a game
  system entry, shared across universes, `[[…]]` remains text. *(P-12, P-14)*
- **B-34** — A GM places a **GM block** in a section (E-9, « Bloc MJ » in the editor, or
  the import); unless the reader is a GM outside Player mode, Kanevas delivers none of it:
  on the sheet, through the assistant, through search (a word found only in a GM block does not
  find the sheet), through incoming links (a link written in a GM block does not count), or
  through the images it contains. A section containing a GM block may only be written by a GM. A
  file **added from a GM block** enters the media library as « Réservé au MJ » (B-55). *(P-12, P-14;
  Monsieur's decision of 2026-10-11)*
- **B-35** — A GM places a sheet **under another** in the same universe (E-9, « Déplacer sous… », or
  the import); the sheet then shows its ancestors in the breadcrumb and its **children** in a block;
  a type's list (E-8) can also be read **as a tree**. A reader only sees sheets they may
  read: unreadable ancestors are skipped, unreadable children absent, without a count. *(P-12, P-14)*
- **B-36** — When an account opens a sheet (E-9), it sees sheets that **mention** it — through
  a link in a section it reads (outside GM blocks unless it is a GM) or a relation it reads —,
  and nothing from sheets it cannot read. *(P-12)*
- **B-37** — When an account uses **search** (E-17), Kanevas searches all
  types at once, in titles, **aliases** and readable sections, filters by type and
  **label**, and only returns sheets the account may read (B-11, B-34). *(P-12)*
- **B-38** — A GM gives a sheet **aliases** (other names) and **labels** (E-9); anyone
  who sees the sheet sees them, like its title; tapping a label opens search filtered by it
  (E-17). An alias or label is never secret. *(P-12, P-14)*
- **B-39** — A GM changes a sheet's **title**, **type** and **parent** after creation,
  from its header (E-9). A session report's type cannot change, and a sheet cannot become a
  session report. *(P-14)*
- **B-40** — A GM **deletes a sheet** from its header (E-9), after a confirmation naming what
  goes with it (sections and their file references, relations targeting it, placements on
  maps; files themselves remain in the media library); its
  children move up under its parent; links targeting it become broken links (B-33).
  *(P-14)* A deleted imported sheet **returns** on the next replay if the script still sends it:
  to prevent its return, delete it from the export. No trace of deletion is
  kept (Monsieur's decision of 2026-10-11).
- **B-41** — A GM **deletes a universe** from its settings (E-14), typing its name to
  confirm; all its content and tokens go, its members lose access, and its address
  responds like an unknown address. An attached game system remains. *(P-10)*
- **B-42** — **Sheet types** are a fixed product list, extended by a Kanevas release,
  never created by a user. A GM of an attached universe **enables or disables** each
  type for the system (E-15); a GM **overrides** a type to enabled or disabled for their universe, or
  lets it **follow the system** (E-14); a universe without a system follows the product default (all
  enabled). A disabled type leaves the sidebar, creation (E-8) and
  search filters (E-17); its sheets remain reachable through links, search or the tree. The
  session report type is not configurable. *(P-13)*
- **B-52** — A GM gives a sheet a free-text **subtype**, specific to its type (« Savoir · Ressource »,
  « Lieu · Planète », « Vaisseau · Frégate »), at creation (E-8) or from its header (E-9), by typing it;
  E-9 suggests subtypes already used for that type in the universe. Anyone who sees the sheet sees
  its subtype on its card (E-8), in its header (E-9) and in search (E-17), which finds it;
  a type's list (E-8) **filters by subtype** among those of sheets the reader sees. Labels
  remain cross-cutting (B-38). *(P-12, P-14; Monsieur's decision of 2026-10-11)*
- **B-43** — Any Markdown text — section content (and a session report's text), a
  scenario, a system entry — holds up to **100,000 characters** (instead of 20,000);
  beyond that, writing is refused as today (AD-91, AD-106). *(P-10, P-14)*
- **B-44** — Every file on a sheet — its illustration (an image), a section attachment
  (image or document), an image or file link in text — is a file in the universe's
  **media library** (B-53), **referenced**, never copied. When an account reads a section
  showing one, it sees it if both the section (and, within a GM block, the block) **and** the file
  are accessible; if the section is accessible but the file is not, « Image réservée au MJ. » (or « Fichier
  réservé au MJ. » for a document) takes its place; a file within a GM block disappears with the block.
  The illustration follows the same double guard (sheet and image). *(P-12, P-16; Monsieur's decisions
  of 2026-10-11)*

### Import and API access (`kanevas-import`)
- **B-45** — A GM creates an **API token** for their universe from « Accès par API » (E-18): a name,
  a lifetime (30 days by default, one year at most); Kanevas shows it **once only**; the token acts
  with that GM's permissions in that universe only, and only on the import API. *(P-11, P-10)*
- **B-46** — A GM sees their universe's tokens (name, created by, last use, expiry) and
  **revokes** one from E-18; if the token is revoked, expired, or its GM has lost that role, then
  every request presenting it is refused (401) and nothing is written. *(P-11)*
- **B-47** — When a script pushes a sheet through the import API with an **origin key**, Kanevas
  creates it if the key is unknown in the universe, updates it if known, and changes nothing if
  nothing has changed — sheet, sections, relations, aliases, labels, parent, attachments, illustration,
  campaigns and scenarios; replaying the same import creates no duplicates. *(P-10)*
- **B-48** — If anything an import wrote has since been **modified in Kanevas** (by a human or their
  assistant) — a sheet's title, type, subtype, parent, aliases, labels; a section's title,
  content, audience, attachments; a sheet's illustration; a campaign's name and
  status; a scenario's title and content; a media library file's name and **visibility** —,
  then a new import does not overwrite what was modified,
  writes the rest, and the batch report names each field left untouched. *(P-10, P-14)*
- **B-49** — A GM sees their universe's **import batches** on E-18: when, through which token, how many
  objects were created, updated, unchanged, refused, **by kind** (sheets, files, campaigns,
  scenarios, relations), how many links and references remain pending, and each refusal's
  origin key and reason. *(P-10)*
- **B-50** — An imported sheet keeps its **origin key** (visible only to the GM, E-9) and may carry its
  **original creation date**, which orders session reports (E-13) like a Kanevas date.
  *(P-10, P-12)*

### Media library (`kanevas-import`, Monsieur's decisions of 2026-10-11)
- **B-53** — Each universe has a **media library** (E-19) holding **all** its files, images
  (PNG, JPEG, GIF, WebP) and documents (PDF and any other file), each with its **visibility** —
  « Visible des joueurs » (the default) or « Réservée au MJ ». A GM adds files, changes their
  names and visibility, deletes them; any member sees accessible files there (a
  player: player-visible ones), filtered into **« Images »** or **« Documents »** (a document shows as
  its type icon, name and size), and for each the sheets **they read** that use it.
  *(P-16, P-10)*
- **B-54** — When a GM deletes a file in use (E-19), Kanevas asks for confirmation listing the
  sheets using it; afterward those sheets no longer show it (« Fichier supprimé de la
  médiathèque. » for a GM, nothing for a player). When a GM makes a file GM-only while it is used in a
  player-readable section (E-19, or the attachment menu on E-9), Kanevas likewise warns them,
  listing those sections. *(P-16)*
- **B-55** — An account writing a section puts a file there through **two paths**, on E-9 (when editing,
  from the toolbar, or through « Joindre un fichier » in the « Pièces jointes » block):
  (1) **add a file** from their device — in one action, the file enters the
  media library **and** integrates into the sheet: image in text, section attachment, or
  illustration (GM); its visibility **follows where it is added**: in a GM block, or in a section
  not readable by all players, « Réservé au MJ »; elsewhere, « Visible des joueurs »; (2)
  **choose from the media library** a file they see, through the picker — its visibility does not
  change. Whoever added a file **always sees it**, in the library and on the sheet. If the
  inserted file is GM-only while the section (or the sheet, for an
  illustration) is player-readable, the editor warns: « Ce fichier est réservé au MJ : les joueurs
  qui lisent cette section ne le verront pas. » *(P-16, P-3, P-7; Monsieur's decision of 2026-10-11: the « Visible
  des joueurs » default now only applies to direct additions to the media library and to imports)*
- **B-56** — The import API pushes files into the media library, images and documents, with an origin
  key and explicit permissions (« Visible des joueurs » by default), then sheets
  reference them; exported files unused by any sheet enter it too. The script **must**
  send « Réservée au MJ » for a file that the source only uses in GM content. *(P-10;
  Monsieur's decision of 2026-10-11)*

### Assistant: its token set from administration (`kanevas-import`)
- **B-51** — When the instance admin
  opens « Jeton de l'assistant » in administration (E-5), they start the Claude subscription
  connection (`claude setup-token`), open the address Kanevas shows, paste the returned code, and
  the assistant becomes available without redeployment; the screen says whether a token is set and since
  when, never its value. *(P-15)* — **Included, as the last independent slice** (Monsieur's decision of 2026-10-11).
  The code exists in Antre-du-maitre (a window and three routes; the
  `claude` binary is bundled by the Agent SDK, already a Kanevas dependency; `script` for the
  pseudo-terminal), E-5 exists, and currently setting or renewing the token goes through OpenBao and a
  restart. This slice has no link to import: it runs independently, last.

### Game system
- **B-13** — A GM attaches their universe to a shared game system, or creates one, from
  universe settings (E-14). *(P-8)*
- **B-14** — GMs of universes sharing a system enrich its common reference material (rules,
  creatures, items) from the system page (E-15); members of those universes read it,
  others do not see it. *(P-8)*
- **B-31** — An account finds, **outside any universe**, the game systems attached to its
  universes (E-16), each with those of its universes using it and never others, and opens a
  system page (E-15) at its own address, without going through a universe; it reads it if it is
  a member of an attached universe, edits it if it is a GM of one, and the address of a system
  it cannot see responds like an unknown address. *(P-8)*

### Campaigns, scenarios, preparation
- **B-15** — A GM creates a universe's campaigns and changes their status — in preparation,
  active, completed — from the campaign list and page (E-6). *(P-3)*
- **B-16** — A GM creates a campaign's scenarios from its page (E-6) and writes them (E-7); players
  never see them.
  *(P-3)*
- **B-17** — A GM maintains a campaign's preparation list on its page (E-6): tasks in
  five categories (monsters, NPCs, maps, sequences, other) to check off; a checked task
  leaves the active list without disappearing. Players see none of it. *(P-3)*
- **B-18** — A player sees the universe's campaign list, names and statuses. *(P-4, P-6)*

### Session reports and world updates
- **B-19** — When a member writes a session report from a campaign page (E-6), the report is
  readable by the whole table and editable by its author; the GM reads and writes every report. Several
  reports can coexist for the same session. *(P-4)*
- **B-20** — A universe's session reports are read together, from newest creation to oldest
  (editing a report does not move it up), in the report list (E-13). *(P-4, P-6)*
- **B-21** — When a GM asks their assistant (E-12) to update the world from a report,
  the assistant proposes new section content without writing anything; the GM sees the current and
  proposed content, then applies or abandons it in one action. Nothing applies itself. *(P-5)*

### Maps
- **B-22** — A GM creates an illustrated map (a background image dropped onto the map, freely
  placed tokens linked to sheets) or a graph (chosen sheets connected by their relations) from
  the map list (E-10). *(P-3, P-9)*
- **B-23** — A GM makes a map player-visible; a player only sees tokens and links
  whose sheets they may read, and opens a token's sheet. *(P-3, P-6)*

### Attachments and images
- **B-24** — When an account writing a section drops a file onto it (E-9), in one action it
  becomes a section attachment with its visibility; the GM may mark it secret. *Since
  `kanevas-import` (B-44, B-55): the file enters the media library and the section references it;
  « secrète » becomes « Réservée au MJ », the file's own visibility.* An
  attachment is served only through a route that rechecks permissions. *(P-3, P-7)*
- **B-25** — When a GM asks their assistant (E-12) for a section image, the image is
  generated and attached in one action; a failure attaches nothing. *(P-3)*

### Assistant
- **B-26** — Each member has an assistant opened from a button present on every screen
  of a universe (E-12): it searches, summarizes and edits what the person may read and write, no
  more and no less; a refusal is the same as through the interface. *(P-3, P-6, P-7)*
- **B-27** — A GM's assistant may also create a campaign or scenario, propose a world
  update and generate an image; a player's cannot. *(P-3, P-5)*

### Specialized tools (`kanevas-outils`)

> Epic `kanevas-outils` (scoping proposed on 2026-10-16). A **tool** is code, rules,
> data and an interface entry point, specific to a game system (AD-121). The first two
> are for Stars Without Number Revised (« SWN »): the **galaxy map** and the
> **ship designer**. Monsieur's decisions (epic discussion, 2026-10-15 and 16)
> are reproduced as is; the scoping gives them structure.

**The common framework** (independent of SWN):
- **B-57** — A game system has an **owner**: its creator by default, a role transferable to another
  GM of an attached universe (a system created before this epic has none: any GM of an attached
  universe acts as owner, today's rule, until one is appointed). Only the owner, at system level, enables or disables a tool, imports
  or edits the system catalogue, sets base settings and deletes system data;
  any other GM of an attached universe reads all this without editing it. Within their universe, every GM
  retains full freedom (B-58, B-60, B-62). The instance admin does not intervene (no content
  access). *(P-17)*
- **B-58** — An **« Outils »** tab (E-20) sits beside « Types de fiche » on the system page
  (E-15) and in universe settings (E-14). It lists tools applicable to the system
  (a specific game system, or all); the system enables each or not, the universe follows the system or
  overrides to « Activé » or « Désactivé ». A tool declares its dependencies: the screen refuses to enable one
  without the other and explains why (no tool in this epic declares any; the mechanism is exercised with the
  tests' trial module). *(P-17, P-21)*
- **B-59** — Each tool has **visibility by role** (GM, player), declaring its default, which
  E-20 configures at system then universe level. Players only see entry points for tools
  that are enabled **and** visible to them, and what their permissions allow; a tool an account cannot
  use is **not found** for it (unknown address, absent from the bar, search and
  assistant). Each tool also declares its **uses** (view, design, propose…: who may
  create, who may only read), which it enforces itself, down to the data row. *(P-17, P-18)*
- **B-60** — Each tool declares its **settings** and their shape; E-20 displays them without a screen specific
  to the tool. The system sets the base value, the universe overrides it (this is where house rules belong:
  Éneria's jump range, no fuel charges). A setting too rich for a form remains
  in the tool. A **protected** setting (a galaxy's seed, set on E-21) requires confirmation stating what it
  moves. *(P-17)*
- **B-61** — The owner imports a **catalogue** (a JSON file, one section per kind
  of element) from E-20: Kanevas checks the file, shows a **preview** (added, modified, refused,
  each refusal with its field), then applies on confirmation. Each element has a **key**: reimporting
  updates without duplicates; an element removed from the file is **not** silently deleted; the catalogue
  carries a version. A GM does the same for their universe's catalogue. *(P-17)*
- **B-62** — Tool data has **two levels**: system (shared by its universes:
  SWN hulls, weapons, modifications) and universe (a campaign: custom hull, Orak'Ziel
  crystals, all of Éneria's map). A universe sees its system's data plus its own; a
  universe entry adds an element, **replaces** one using the same key, or **removes** it (the system
  element does not exist in that universe; restoring it brings it back). **Catalogue visibility**: every
  system element is readable by anyone who sees the tool, without exception; a universe element is too by
  default, and the GM may **hide it from players** (GM-readable only, absent for a player without a trace
  of hiding, like a secret map system) then make it visible. A design containing a
  **removed** element keeps its text; reopened in the designer, it carries the blocking alert « Élément
  retiré de cet univers » and cannot be saved again until it is replaced; nothing recalculates without
  action. A **hidden** element disappears only from a player's choice list: a design already
  containing it keeps it, shows it to its readers and saves again without an alert. A universe element
  **replacing** a system element replaces it entirely: the system element never applies again in that
  universe, in display or calculation; when hidden, the replacement follows the hiding rule, and the system
  element does not reappear for the player. *(P-17, P-19; Monsieur's decisions,
  2026-10-17)*
- **B-63** — **Disabling** a tool keeps and hides its data; **deleting** data is a
  separate, explicit, restricted action whose confirmation states what will be erased; deleting system
  data states which universes, local elements and ships still use it. Disabled tools leave
  their sections readable as text with an « outil désactivé » banner; deleting a universe erases
  its tools' data. *(P-21)*
- **B-64** — A write to editable tool data (design, placed system, route, zone…)
  based on a stale version is **refused** with the same response as a section, and the screen explains it
  with a way to reload. No live collaborative editing. *(P-18, P-19)*
- **B-65** — An API token has a **scope per tool**; the import API accepts a tool's data
  (catalogue, placed systems, routes, zones, designs): one key per element, replay without duplicates,
  batch report, shape checked by the module (which also checks conversion). *(P-20)*
- **B-66** — A **tool-managed section** is written only by that tool (the editor and API refuse
  anyone else); all the rest of Kanevas reads it normally. It carries the version of the source that
  produced it, a « Générée par <outil> » banner linking to the tool, and a **text version**
  (Markdown) for search, the assistant and display when the tool is disabled. A sheet mixes
  managed and free sections. The tool writes **on behalf of the account**, after checking its usage permissions and its
  authorship of the section. *(P-19)*
- **B-67** — Changing a setting or catalogue **silently rewrites nothing**: a ship signals
  « calculé avec d'anciens réglages » and offers recalculation; a managed section regenerates itself
  or on proposal, according to what the tool declares. *(P-19)*
- **B-68** — A **shareable link** leads to stored content (a map system, a ship's
  sheet) and is read according to the opener's permissions; no content is encoded in the address. *(P-18, P-19)*
- **B-69** — Each tool may expose its **capabilities to the assistant** (calculate a route, calculate a
  ship): the assistant receives them when the tool is enabled and visible to the account's role, with the same
  permissions as that account. *(P-18, P-19)*
- **B-70** — Each tool works on **phones and tablets** from its first version
  (acceptance criterion for each tool); its code loads only when used, never for an account
  without access. *(P-18, P-19)*

**The galaxy map (SWN)**:
- **B-71** — The galaxy map is a map in the Maps section (E-10 lists it with illustrated maps and graphs, then E-21; it has its own « Visible des joueurs » visibility; a GM creates, renames and deletes it, deletion being a separate action with confirmation): an infinite
  hexagonal grid, with defined systems, routes, zones and territories. Undefined systems
  are not stored: they are generated in 5×5 hexagon blocks from coordinates and
  the galaxy seed, **on the server**, always identical at the same location. The view receives only what
  it requests and permissions allow. *(P-18)*
- **B-72** — An account measures distance on hover and calculates a **route** (shortest path using
  all routes or public routes only) with its duration according to the **engine it chooses** in the tool and the
  configured jump range; a route is exact on the grid. *(P-18)*
- **B-73** — The GM **places** a system, **promotes** an anonymous system (name, notes, size, colour: it
  keeps its location and becomes universe data with its permissions), **draws** a route, **draws**
  a zone; a ghost system, private route or secret territory is absent for a player and for
  the GM in Player mode, including from search, routing and generated system density. *(P-18)*
- **B-74** — The **GM document** derived from the map (the system and route list to read during preparation)
  is a tool-managed section on a sheet the GM chooses (or the tool creates, of type Knowledge) from E-21, GM-only. *(P-18)*

**The ship designer (SWN)**:
- **B-75** — The designer calculates a ship from construction choices (hull, engine,
  fittings, defences, weapons, modifications) taken from the system catalogue supplemented by the
  universe catalogue: power and mass budgets, class multipliers, ammunition, price, hit
  points, armour class, construction time and cost, maintenance, and **two levels of alerts**
  (blocking, watch). What the tool calculates cannot be manually edited anywhere else. *(P-19)*
- **B-76** — A design is attached to a ship **sheet**: its « Caractéristiques » section
  is managed by the designer (B-66), history and GM notes remain free; construction
  choices are tool data, with the version of the catalogue and settings that
  calculated them. The GM creates the sheet; the section's designer is its **author** (a player
  entrusted with it by the GM) or a GM. *(P-19)*
- **B-77** — The designer's **rule sheets** (one per kind of element) and **examples** sheet are
  managed sections generated from catalogue data by a GM action (« Générer les fiches de règles… », E-22) that creates missing sheets and updates
  the others, then regenerated on proposal when the catalogue changes, read-only elsewhere; anything
  absent from the catalogue is absent there too. Examples are a seventh kind in the catalogue (`exemples`, imported with it). *(P-19)*

**Migration and accuracy**:
- **B-78** — Accuracy is proven through **reference cases**: the 11 example ships (price, HP,
  AC, free power and mass, construction, maintenance, alerts) and named corrections against the book
  (the book's construction: 949,000 cr and 38 days, not 954,000 and 39; buildable battleship: a single
  laser, a single cargo hold); the 49 exact routes, stability of generated systems, manually
  calculated durations (7 hexes with engine 2 = 4.5 days). The public repository runs the same tests on its
  **invented** fixture in CI; real expected values come from Monsieur's current tools, calculated
  once and frozen on the private side, run in pods. *(P-20, P-18, P-19)*
- **B-79** — Éneria's current data (map, catalogues, ships) is converted to the
  module format by a script in the private `AntorFr/eneria` repository (replayable), and imported through the API
  (B-65); current tools remain usable until switchover. None of that data — SWN
  catalogues, rule sheets, expected values calculated from them — enters the public repository. *(P-20)*

### Cross-cutting
- **B-28** — Every page requires sign-in; no content is served without an account, and
  `/healthz` only states the name and version. *(P-1)*
- **B-29** — Each screen has its states: empty, loading, error, lost connection, refusal (hidden
  or explained), long content. *(all)*

## Parcours

Chaque étape : qui agit, par quel geste, sur quel écran. « Agent » veut dire : la personne le
demande à son assistant (E-12).

### P-1 — Démarrer (tout nouveau compte, première visite)
1. La personne ouvre Kanevas ; Authelia l'authentifie ; elle arrive sur l'**accueil** (E-1) :
   « aucun univers ».
2. Si elle veut mener une partie : **Créer un univers** (E-2) — nom, description ; elle arrive
   sur sa **vue d'ensemble** (E-3), en MJ.
3. Si elle est joueuse : l'accueil lui montre son identifiant et lui dit de le donner à son MJ ;
   après son ajout, l'univers apparaît dans l'accueil.
*Échec* : Authelia refuse — Kanevas ne montre que « La connexion a été refusée. » (et un lien « Réessayer »), aucun contenu ; Authelia injoignable — « Authelia ne répond pas pour l'instant. Réessayez dans un moment. » ; chaque page a un lien « Réessayer » qui relance la connexion.

### P-2 — Réunir sa table (MJ ; admin en recours)
1. Le MJ ouvre **Membres** (E-4) depuis la navigation de l'univers.
2. Il ajoute un compte par son identifiant, choisit MJ ou Joueur ; change un rôle ; retire un
   membre.
3. En recours, l'admin ouvre l'**administration** (E-5), choisit l'univers, fait le même geste.
   *Exemple* : le seul MJ d'un univers a quitté la table ; l'admin ajoute un MJ qui a déjà ouvert
   Kanevas. L'admin ne lit toujours rien du contenu ; s'il veut le lire, il s'ajoute lui-même, et
   l'ajout figure dans la liste des membres que voit le MJ de l'univers.
4. Une fois membre, il ouvre l'univers depuis E-5 : sa **vue d'ensemble** (E-3).
*Échec* : identifiant jamais connecté — « ce compte ne s'est jamais connecté » ; retirer le
dernier MJ — refusé avec la raison ; un compte qui n'est pas admin ouvre l'adresse — « Page
introuvable. ».

### P-3 — Préparer la séance du samedi (MJ, dimanche soir, bureau)
1. **Vue d'ensemble** (E-3) : les campagnes actives, les derniers CR, la préparation en cours.
2. **Campagne** (E-6) : il crée la campagne (« En préparation ») ou ouvre l'existante et la passe
   « Active » ; il relit les CR les plus récents, crée ou ouvre un **scénario** (E-7) et l'écrit
   (ou demande à son **assistant** (E-12) de créer la campagne ou le scénario : le bloc d'écriture mène à E-6 ou E-7).
3. Il coche ou ajoute des tâches de **préparation** (E-6).
4. **Lore** : depuis la **liste d'un type** (E-8, parmi les types activés), il crée un PNJ ou un lieu, avec au besoin son **sous-type** ; sur la **fiche** (E-9), il
   écrit « Apparence » (lue des joueurs) et « Vérité — MJ seul », relie le PNJ à sa faction,
   dépose le plan d'un lieu, et pose le portrait d'Aldric en **illustration** de la fiche (visible
   de qui voit la fiche) ; de retour sur la liste, la carte d'Aldric porte ce portrait.
5. Il demande à son **assistant** (E-12) « rappelle-moi tout ce qu'on sait d'Aldric » puis
   « fais un portrait pour Apparence » : l'image est attachée à la section, et il suit « Ouvrir la section »
   dans le fil pour la voir sur la fiche (E-9).
6. **Cartes** (E-10, E-11) : il place le PNJ sur la carte de la ville, passe en **mode Joueur**
   pour vérifier, puis rend la carte visible.
*Échec de l'assistant* : une demande de création échoue ou l'assistant est indisponible : le panneau le dit (« Je n'ai pas pu répondre — réessayer » ou « L'assistant n'est pas disponible pour le moment. »), la création a pu avoir lieu avant que la réponse soit perdue (délai, connexion coupée) : avant de réessayer, Antor regarde E-6 ou E-7 pour ne pas créer deux fois, puis crée à la main si besoin (étape 2).
*Échec de l'image* (étape 5) : la génération échoue ou dépasse le temps, la section porte déjà 50
pièces jointes, son droit d'écrire a été retiré, la description dépasse 500 caractères ou aucun moteur
n'est disponible — l'assistant le dit, rien n'est attaché ; Antor
peut redemander, ou déposer lui-même une image sur E-9 (P-3 étape 4).
*Moment fort* : la fiche en mode Joueur ne trahit aucun secret.
*Échec* (illustration, étape 4) : il choisit un PDF ou un fichier vide — « « plan.pdf » n'est pas
une image… » ou « « portrait.png » est vide. », l'illustration d'avant reste ; l'envoi est coupé —
« l'envoi n'a pas abouti », avec « Réessayer » ; un autre MJ l'a rétrogradé Joueur entre-temps —
« Vous ne pouvez plus modifier l'illustration de cette fiche. » et les gestes disparaissent ; le
retrait échoue — « L'action n'a pas abouti. Réessayez. », l'illustration reste ; l'image ne se charge
pas — le cadre dit « Image indisponible. » et il garde « Remplacer » et « Retirer ».

### P-4 — Écrire le compte-rendu (joueur ou MJ, le lendemain de la partie)
1. Depuis la **vue d'ensemble** (E-3) ou la **liste des campagnes** (E-6), il ouvre la campagne.
2. **Nouveau compte-rendu** : titre, texte ; il le publie — il s'ouvre comme une **fiche** (E-9)
   de type compte-rendu.
3. Il le retouche plus tard ; les autres le lisent depuis la campagne ou la **liste des CR**
   (E-13).

### P-5 — Mettre le monde à jour après la partie (MJ)
1. Il lit les CR (E-13 → E-9).
2. Depuis un CR, il demande à son **assistant** (E-12), en nommant ce CR (l'assistant ne sait pas quel
   écran est ouvert) : « mets à jour la section Vérité d'Aldric d'après le compte-rendu de la séance 3 ».
3. Le panneau montre l'actuel et le proposé ; il **applique** ou **abandonne** d'un clic.
4. Sinon, il édite la fiche lui-même (E-9).
*Échec* : la section a changé depuis la proposition — appliquer est refusé, avec la raison.

### P-6 — Se resituer avant la séance (joueur, mercredi soir, téléphone)
1. **Accueil** (E-1) → **vue d'ensemble** de l'univers (E-3) : les derniers CR, les cartes
   visibles.
2. Il parcourt la **liste des personnages** (E-8), une grille de cartes illustrées, et reconnaît
   Aldric à son portrait — ou le cherche par son nom — ; sur la liste des lieux, il peut filtrer par
   **sous-type** (« Taverne ») parmi ceux des fiches qu'il voit ; puis ouvre la **fiche** (E-9) : seulement ce
   que la table sait.
3. Il ouvre la **carte** (E-11), touche un token, relit la fiche.
4. Ou il demande à son **assistant** (E-12) « que sait-on d'Aldric ? ».
*Échec* : il demande de lire « Vérité » : l'assistant répond « Introuvable. », comme l'interface ;
l'assistant est indisponible ou en erreur : le panneau le dit, et la fiche reste lisible (E-9).
*Échec* (illustration, étape 2) : une image ne se charge pas (réseau du téléphone) — la carte
montre la vignette de repli, jamais une image cassée, et la fiche « Image indisponible. » ; une
fiche que le MJ a fermée aux joueurs entre-temps disparaît de la grille, et l'adresse de son
illustration répond comme une adresse inconnue.

### P-7 — Tenir l'histoire de son personnage (joueur)
1. Le MJ a créé la fiche de son PJ et lui en a confié une section en auteur (E-9).
2. Le joueur l'écrit sur la **fiche** (E-9), y dépose un portrait, ou demande à son **assistant**
   (E-12) d'y ajouter un paragraphe.
*Échec* : il demande d'écrire dans une section qu'il lit sans l'écrire : « Vous ne pouvez pas modifier
cette section. », rien n'est écrit.
*Upload failure*: empty file, section already at its attachment limit (50 before
`kanevas-import`, 100 since, AD-111), interrupted upload or lost write permission — the file
is not attached; the section (E-9) explains why; no partial operation remains.

### P-8 — Monter un univers sur un système partagé (MJ)
*Antor, MJ de « Lame d'Ébène », le dimanche soir ; Mira, MJ des « Landes grises », qui joue le même
système.*
1. **Paramètres de l'univers** (E-14) : il choisit un système du catalogue, ou en crée un
   (« Créer et rattacher ») ; il peut aussi détacher l'univers (« Aucun système ») et, dans le même écran, corriger le nom et la description de son univers.
2. **Système de jeu** (E-15), qu'il ouvre depuis « Systèmes de jeu » (E-16, hors de ses univers) ou
   par « Ouvrir le système » (E-14) : il retrouve le bestiaire commun et y ajoute une créature, que les
   autres univers du système voient aussitôt ; Mira, rattachée au même système, la lit.
   *Moment fort* : la créature ajoutée par Antor apparaît chez Mira, sans que Mira voie un mot du
   lore d'Antor — ni même le nom de son univers : sa liste « Systèmes de jeu » ne lui montre que
   « Les Landes grises ».
   *Variante joueur* : Léa, Joueuse de « Lame d'Ébène », ouvre le bloc « Système de jeu » de la vue d'ensemble
   (E-3) et lit la même créature, sans pouvoir la modifier.
*Échec* : un nom de système déjà pris — « Un système porte déjà ce nom. » ; une créature modifiée
entre-temps par l'autre MJ — « Cette entrée a changé depuis que vous l'avez ouverte. », le texte en
cours est gardé ; un univers détaché pendant qu'un joueur lit le système — la page du joueur répond
« Page introuvable. » au prochain chargement.

### P-9 — Voir qui est lié à qui (MJ, puis la table)
1. **Cartes** (E-10) → nouveau **graphe** (E-11) : il choisit les factions ; les liens viennent
   de leurs relations.
2. Il le rend visible ; un joueur n'y voit que ce qu'il peut lire.

### P-10 — Préparer puis rejouer l'import de sa base Kanka (Monsieur, MJ, un samedi, Mac et navigateur)
*Antor (Monsieur) a rapatrié sa base Kanka sur son Mac ; son script la lit et la pousse dans Kanevas.
Il veut d'abord un essai jetable, puis la vraie base, sans doublon ni fuite.*
1. **Accueil** (E-1) → **Créer un univers** (E-2) « Essai Kanka » ; il en est MJ.
2. **Paramètres** (E-14) : il rattache l'univers à son système, puis dans « Types de fiche » force
   « Vaisseau » à activé (le système le désactive) — P-13.
3. **Accès par API** (E-18) : « Nouveau jeton », nom « Script Kanka — Mac », durée 30 jours ;
   Kanevas montre le jeton une fois ; il le copie dans la configuration du script.
4. *Hors de Kanevas* : il lance le script ; le script ouvre un **lot**, pousse d'abord les
   **campagnes**, puis les fiches, parents d'abord (clé d'origine, type, titre, parent, alias,
   étiquettes, sections en Markdown avec leurs liens `[[…]]`, leurs blocs MJ, leurs images, leur
   audience) — les comptes-rendus avec la clé de leur campagne —, puis les relations, et clôt le lot
   (l'ordre d'AD-104).
   Les fichiers, images et documents, vont d'abord dans la **médiathèque** (E-19), chacun avec ses
   droits — « Réservée au MJ » pour ceux que Kanka n'affiche que dans du contenu MJ, « Visible des
   joueurs » sinon —, y compris les 385 Mo qu'aucune fiche n'utilise ; les fiches les référencent.
5. **Accès par API** (E-18), bloc « Lots d'import » : « Fiches : 498 créées, 3 refusées · Fichiers :
   1 140 créés · Campagnes : 4 créées · Scénarios : 12 créés · Relations : 324 créées · 6 en attente » ; il
   déplie les refus : « personnage:aldric-le-gris — section « Vérité » : 112 000 caractères, 100 000
   au plus ».
6. Il ouvre quelques fiches (**E-8** en arbre, **E-9**, **E-17**) et passe en **mode Joueur** pour
   vérifier qu'aucun bloc MJ ne paraît, ni sur la fiche ni dans la recherche — P-12 ; dans **Comptes-rendus** (E-13), les 36 journaux de
   Kanka sont dans l'ordre de leurs dates d'origine ; sur une fiche, le menu « ⋯ » montre sa clé
   d'origine (« lieu:port-sel »).
   A sheet sent before its files shows the GM « Fichier en attente d'import :
   « img:quais ». » instead of the image until the file arrives (Léa sees nothing).
7. Il corrige le script (il coupe la section trop longue en deux), le relance : le nouveau lot dit
   « Fiches : 3 créées · 498 inchangées · Fichiers : 1 140 inchangés · … · 0 en attente » — aucun doublon.
   Pending file references are counted with links as « liens et références en attente »;
   when nothing is pending, that count is omitted from the batch report.
8. **Paramètres** (E-14), « Supprimer l'univers », il tape « Essai Kanka » : l'univers disparaît de
   l'accueil.
9. Il refait 2 à 7 sur l'univers réel ; les jours suivants, Léa écrit dans une section importée et
   Antor renomme « Port-Sel » en « Port-Sel-sur-Brume » (P-14) ; un import rejoué n'écrase ni l'un ni
   l'autre et le lot le dit : « section « Notes » de personnage:lea-pj modifiée dans Kanevas : non
   écrasée » ; « lieu:port-sel : titre modifié dans Kanevas : non écrasé » ; de même un fichier que
   Antor a passé « Visible des joueurs » (E-19) n'est pas rétabli « Réservé au MJ » : « visibilité
   modifiée dans Kanevas : non écrasée ».
10. **Accès par API** (E-18) : il révoque le jeton (P-11).
*Moment fort* : le second lot « Fiches : 501 inchangées » et rien de créé dans aucune autre
nature — rejouer est sans risque.
*Échec* : jeton mal copié ou révoqué — le script reçoit 401 « Jeton invalide. », rien n'est écrit,
et aucun lot n'apparaît ; un parent ou une cible de relation inconnue — la fiche est écrite sans ce
parent ou sans cette relation, avec un avertissement dans le lot ; un lien `[[…]]` vers une clé
encore inconnue — il reste en attente et se résout quand la fiche arrive (au même lot ou au suivant) ;
le réseau coupe au milieu — le lot reste « En cours » sur E-18, sans dommage : rejouer reprend là où
c'était, puisque tout ce qui est déjà écrit sort « inchangé » ; une image de 0 octet — refusée, la
raison dans le lot ; supprimer l'univers en tapant un autre nom — le bouton reste inactif ; une suppression qui échoue — « L'action n'a pas abouti. Réessayez. » dans la boîte, l'univers est intact (états : E-14).

### P-11 — Créer et révoquer un jeton d'API (MJ)
1. **Accès par API** (E-18), depuis « Univers » ▸ « Accès par API » dans la barre (MJ seul).
2. « Nouveau jeton » : un nom, une durée (7, 30, 90 jours ou un an) ; « Créer le jeton ».
3. La fenêtre montre le jeton, « Copier », et « Il ne sera plus jamais affiché. » ; il la ferme.
4. La liste montre le jeton : nom, créé par, créé le, dernier usage (« jamais »), expire le.
5. Plus tard : « Révoquer » sur la ligne, confirmation « Révoquer « Script Kanka — Mac » ? Le script
   qui l'utilise ne pourra plus rien écrire. » ; la ligne passe en « Révoqué ».
*Échec* : un autre MJ a retiré son rôle à Antor — ses jetons cessent d'agir (401) et il ne voit plus
E-18 (« Page introuvable. ») et, pour un autre MJ, la ligne de ses jetons porte la pastille « Inactif » ; un Joueur force l'adresse de E-18 — « Page introuvable. » ; le jeton
a expiré — la ligne dit « Expiré », le script reçoit 401.

### P-12 — Lire la base importée (Antor, MJ, puis Léa, Joueuse, au téléphone)
1. Antor ouvre **Lieux** (E-8), passe la liste **en arbre** : « Les Sphères » (Lieu · Sphère)
   déplié montre « Port-Sel » (Lieu · Port), qui déplié montre « La Taverne du Kraken » et « Les
   Docks » ; il filtre sur le sous-type « Port » : « Port-Sel » et « Havre-Gris » (après un import qui porte ces sous-types : le semis du bouchon pose « Les Sphères » et « Port-Sel » sans sous-type, et pas « Havre-Gris »).
2. Il ouvre « Port-Sel » (**E-9**) : le fil d'Ariane « Lame d'Ébène › Lieux › Les Sphères ›
   Port-Sel » ; le texte en Markdown (intertitres, un tableau des quartiers, une image insérée) ; des
   liens vers « Maître Aldric » et « La Guilde des Brumes » ; au milieu de « Histoire », un **bloc MJ**
   hachuré d'ambre (« Le port est tenu par la Guilde… ») ; en bas, « Contient » (ses enfants) et
   « Mentionnée dans » (les fiches qui la citent) ; à côté du type, son sous-type « Lieu · Port » ;
   sous le titre, ses alias et ses étiquettes.
3. Il passe en **mode Joueur** : le bloc MJ a disparu sans laisser de trou ; le lien vers « La
   Guilde des Brumes », fiche MJ seul, est devenu du texte ; « Mentionnée dans » a perdu « Rapport
   secret de l'amirauté » et « La Guilde des Brumes », qu'un joueur ne lit pas.
4. Léa, sur son téléphone, ouvre la **recherche** (E-17), tape « sous-main », un mot qui n'est que
   dans le bloc MJ : aucun résultat. Elle tape « guilde » : elle trouve « Port-Sel » (le texte du lien
   est écrit dans « Histoire », qu'elle lit) mais jamais la fiche « La Guilde des Brumes » ; elle trouve
   « Port-Sel » par son alias « Salport » ; elle touche la pastille « Côte des Brumes » (sur E-17, ou sur la fiche « Port-Sel » qui l'ouvre filtrée) et voit les fiches qu'elle lit.
5. Elle ouvre « Maître Aldric » par un lien, puis revient par le fil d'Ariane.
6. Elle demande à son **assistant** (E-12) « que sait-on de Port-Sel ? » : il ne cite rien du bloc
   MJ.
*Moment fort* : la même fiche, lue par Antor puis par Léa — le secret n'est ni montré, ni trouvable,
ni deviné.
*Échec* : une image insérée ne se charge pas — « Image indisponible. » à sa place ; un lien vers une
fiche supprimée — texte simple pour Léa, « lien cassé » pour Antor ; une fiche dont Léa ne lit plus
rien depuis le dernier import — absente de l'arbre, de la recherche et des « Mentionnée dans ».

### P-13 — Choisir les types d'un système et d'un univers (MJ)
*Antor joue « CoF Mini » dans « Lame d'Ébène », sauf que son univers a des vaisseaux.*
1. **Système de jeu** (E-15), onglet « Types de fiche » : il désactive « Vaisseau » et « Note » pour
   le système ; Mira, MJ d'un autre univers du système, voit ces types quitter sa barre.
2. **Paramètres** de « Lame d'Ébène » (E-14), panneau « Types de fiche » : chaque type dit « Système · activé »
   ou « Système · désactivé » ; il force « Vaisseau » à **Activé**.
3. La barre latérale de « Lame d'Ébène » montre « Vaisseaux », pas « Notes ».
4. Plus tard, le système réactive « Note » : « Lame d'Ébène », qui le suit, le montre au chargement suivant ;
   « Vaisseau », forcé, ne bouge pas.
*Échec* : il désactive « Lieu » alors que l'univers a 201 lieux — la confirmation dit « Les 201 lieux
restent ; on les atteint par un lien, la recherche ou l'arbre. » ; un Joueur ne voit pas le panneau de
E-14 (« Page introuvable. ») et lit l'onglet de E-15 en « Lecture seule », interrupteurs inertes.

### P-14 — Tenir la base après l'import (Antor, MJ, au bureau)
1. Sur « Port-Sel » (**E-9**), « Modifier » la section « Histoire » : il tape `[[`, choisit « Maître
   Aldric » dans la liste qui s'ouvre ; il sélectionne une phrase et la met en **bloc MJ** ; « Aperçu »,
   puis « Enregistrer ».
2. Dans l'en-tête, il renomme la fiche « Port-Sel-sur-Brume » ; il change son sous-type « Port » en
   « Port franc » (la liste lui propose les sous-types de lieu déjà employés : Sphère, Port, Taverne…) ;
   menu « ⋯ » : « Déplacer sous… » « Les Sphères » ; « Alias et étiquettes ». Sur « Les Cristaux
   d'Ombre », importée en Note, « Changer le type » : Note → Savoir, sous-type « Ressource ».
3. Menu « ⋯ » d'un doublon : « Supprimer la fiche… » ; la boîte compte ce qui part avec elle
   (sections, relations qui la visent, places sur une carte ; ses fichiers restent dans la médiathèque),
   dit sous quelle fiche
   remontent ses enfants et que les liens qui la visent deviendront des liens cassés (texte exact :
   E-9) ; le doublon venait de Kanka : Antor le retire aussi de l'export, sinon le prochain import le
   recrée (B-40).
4. Dans un **scénario** (E-7), même geste : `[[` ouvre la même liste (les fiches de l'univers de la campagne) et le lien
   s'ouvre sur la fiche ; dans une entrée de système (E-15), `[[` ne fait rien.
*Échec liens* : Léa, auteur avec écriture, tape à la main `[[<id>]]` d'une fiche qu'elle ne lit pas (l'identifiant d'une adresse qu'Antor lui a donnée) — « Cette fiche n'existe
pas ou vous ne pouvez pas la lire. » sous le champ, son texte intact ; la liste ne répond pas — « Impossible de
chercher. » et « Réessayer » ; un lien vers une fiche qui n'est pas encore importée — « en attente » pour Antor,
texte pour Léa, jusqu'à l'arrivée de la fiche ; dans un scénario, la liste qui échoue — « Impossible de chercher. ».
*Échec* : un déplacement qui ferait un cycle (« Les Sphères » sous l'un de ses enfants) — « Une fiche
ne peut pas être rangée sous l'un de ses descendants. » ; un titre vidé — « Erreur : le titre est obligatoire. », le champ reste ; un bilan de suppression qui ne se charge pas — « Impossible de charger le détail. », « Réessayer » (états : E-9) ; un Joueur auteur d'une section qui contient
un bloc MJ — « Modifier » n'y paraît pas ; un texte qui passe 100 000 caractères — « Erreur : 100 000
caractères au plus. », le texte reste.

### P-15 — Poser le jeton de l'assistant (Admin, admin d'instance) (B-51)
*Admin vient de déployer Kanevas : l'assistant n'a pas encore de jeton, et il ne veut pas passer par un redéploiement.*
1. **Administration** (E-5), bloc « Jeton de l'assistant » : « Aucun jeton posé » ; « Connecter
   l'abonnement ».
2. Kanevas montre une adresse ; il l'ouvre, s'authentifie chez Anthropic, copie le code.
3. Il colle le code, « Valider » : « Jeton posé le 11 octobre 2026. » ; l'assistant est disponible
   sur tous les univers, sans redéploiement. *(Moment fort : « Jeton posé le … » apparaît, sans que la valeur du jeton soit montrée nulle part.)*
*Échec* : le code est faux — « La connexion n'a pas abouti. Recommencez. » ; la fenêtre a expiré (10 minutes)
ou le serveur a redémarré — « La connexion a expiré. Recommencez. » ; le programme de connexion ne démarre pas —
« La connexion n'a pas pu démarrer. Réessayez. » ; dans tous les cas l'ancien état reste. Si le jeton vient du
déploiement, le panneau dit « Jeton fourni par le déploiement. » et se reconnecte de même.

### P-16 — Ranger et partager les fichiers (Antor, MJ, puis Léa, Joueuse)
*Après l'import, la médiathèque de « Lame d'Ébène » porte 1 100 images et 40 documents, dont ceux
qu'aucune fiche n'utilisait dans Kanka.*
1. From the sidebar, Antor opens **« Médiathèque »** (E-19), filters « Images », then searches by name
   for « carte-des-sphères.png » (used in three sheets) and renames it « Carte des Sphères ».
   He switches to « Documents »: « Règles de la Guilde.pdf » (PDF, 2,4 Mo).
2. Il ouvre « plan-du-repaire.png » (« Visible des joueurs », insérée dans « Histoire » des « Docks »
   et jointe à « Description » de « Port-Sel », deux sections lues des joueurs) et la passe à
   « Réservée au MJ » : Kanevas liste ces deux endroits, où les joueurs ne la verront plus ; il
   confirme.
3. Sur « Port-Sel » (**E-9**), il modifie « Description » (lue des joueurs) : « Fichier » ▸ « Choisir
   dans la médiathèque », il choisit « Plan secret de la Guilde » (réservée au MJ) : l'éditeur avertit
   « Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas. » ; il la
   déplace dans un bloc MJ, l'avertissement disparaît. Puis « Fichier » ▸ « Ajouter depuis l'appareil »
   « tarifs-du-port.pdf » : le document entre dans la médiathèque, visible des joueurs, et se joint à la
   section ; il enregistre.
4. Léa opens « Les Docks »: instead of the lair map image in « Histoire », she reads
   « Image réservée au MJ. ». She opens « Port-Sel » and downloads « tarifs-du-port.pdf » from
   the attachments of « Description ». Her **« Médiathèque »** (E-19) only shows player-visible
   files; for « Carte des Sphères », it only lists sheets she can read.
5. Antor deletes a duplicate image: the confirmation lists « Val-Fortin — « Description » »,
   « Maître Aldric — « Apparence » (jointe) » and « Port-Sel (illustration) ». He first replaces
   the illustration, then deletes the file.
*Moment fort* : un même fichier, utilisé dans trois fiches, change de droits en un geste, et Kanevas
dit exactement où les joueurs le perdent.
*Échec* : un fichier vide — « « notes.txt » est vide. », rien n'est ajouté ; un envoi coupé —
« L'envoi n'a pas abouti. », rien n'est ajouté ni joint ; une illustration qui n'est pas une image —
« « regles.pdf » n'est pas une image. » ; un joueur force l'adresse d'un fichier réservé au MJ — « Page
introuvable. ».

### P-17 — Activer et régler les outils d'un système (Antor, MJ responsable du système « SWN », puis de l'univers « Éneria »)
*Antor a créé le système « Stars Without Number révisé » ; il veut la carte et le concepteur pour
Éneria, avec ses règles maison.*
1. Page du système (**E-15**), onglet « Outils » (**E-20**) : la carte de la galaxie et le concepteur
   de vaisseaux sont listés, « Désactivé ». Il active les deux. Visibilité : le concepteur « MJ et
   joueurs », la carte « MJ et joueurs ».
2. Il fixe les réglages de base du système (portée de saut : 1 hexagone), puis importe un **catalogue** : « Importer un catalogue », fichier JSON ; l'aperçu dit « 12 coques ajoutées,
   0 modifiée, 1 refusée : arme « Laser lourd », champ `masse` : nombre attendu » ; il confirme.
3. Paramètres de « Éneria » (**E-14**), onglet « Outils » : les deux outils suivent le système ; il force le
   concepteur à « Activé », règle « Charges de carburant » à « Non » (règle maison) et ajoute au catalogue
   de l'univers les cristaux d'Orak'Ziel (un élément nouveau) en important un fichier.
4. Sur la galaxie (E-21), il change la graine : la confirmation dit « Tous les systèmes non définis changent de
   place ; les systèmes définis et promus ne bougent pas. ».
*Moment fort* : l'onglet « Outils » montre pour chaque réglage « Système · 1 » puis « Univers · 2 » : d'où
vient la valeur est lisible.
*Échec* : il active un outil qui dépend d'un autre désactivé — « <Outil> demande <autre outil> : activez-le
d'abord. » (aucun outil SWN n'a de dépendance : le texte se joue avec le module d'essai) ; Mira, MJ d'un autre univers du système,
voit les outils et leurs valeurs mais ni « Activer » ni « Importer » au niveau du système (cachés, lecture
seule) ; un fichier de catalogue illisible — « Ce fichier n'est pas un catalogue valide. » ; connexion
perdue pendant l'application — rien n'est appliqué à moitié.

### P-18 — Explorer la galaxie, puis la tenir (Léa, Joueuse, au téléphone ; Antor, MJ, au bureau)
*Mercredi soir, Léa prépare le prochain saut de son vaisseau ; dimanche, Antor ajoute un système avant la
séance.*
1. Léa : **Cartes** (**E-10**), « Galaxie d'Éneria » ▸ **E-21**. La carte s'ouvre sur les systèmes qu'elle
   peut lire (tous ceux qui ne sont pas secrets) ; elle glisse, pince, survole (au toucher : appui) un système : nom, et sa distance au système qu'elle a
   choisi comme départ.
2. Elle choisit départ et arrivée : « Port-Sel » → « Vael », et le moteur (2). Le trajet par les routes publiques
   s'affiche avec sa durée (« 7 cases · 4,5 jours »).
3. Elle copie le lien de « Vael » (adresse stable) ; l'assistant, sur demande, calcule le même trajet.
4. Antor (E-21, mode MJ) : il **place** un système dans un hexagone anonyme (le promeut : nom, notes, taille,
   couleur), **trace** une route vers « Vael » (longueur exacte), **dessine** un territoire marqué secret, puis
   passe en **mode Joueur** : le système fantôme, la route privée et le territoire n'existent plus.
5. « Document MJ… » : il choisit la fiche « Galaxie — notes MJ » (ou en crée une) ; l'outil y écrit la section gérée « Document MJ », visible du MJ seul, et la met à jour à chaque demande.
*Moment fort* : le même trajet, vu par Léa puis par Antor, ne passe pas par la même route : celle de la
contrebande n'existe pas pour elle.
*Échec* : Léa cherche « Station fantôme » — aucun résultat, jamais « masqué » ; Antor enregistre un système depuis une
version périmée (modifié entre-temps par l'autre MJ) — « Ce système a changé depuis que vous l'avez ouvert. »
et « Recharger » ; connexion perdue — la carte garde la vue affichée, les gestes d'écriture sont désactivés ;
la densité des systèmes générés ne change jamais selon un territoire qu'elle ne voit pas.

### P-19 — Concevoir un vaisseau (Antor, MJ ; Léa, Joueuse, autrice de la section)
*Léa veut le « Vent d'Orak » ; Antor crée sa fiche et lui confie la conception.*
1. Antor crée la fiche **Vaisseau** « Vent d'Orak » (E-8/E-9) : sections libres « Histoire » et « Notes MJ » ;
   dans **E-22**, « Nouvelle conception » sur cette fiche, coque choisie ; la section « Caractéristiques »
   est créée, gérée par le concepteur, et il en fait **Léa** l'autrice.
2. Léa ouvre le **concepteur** (E-22) depuis la fiche ou la barre « Outils » : elle choisit un moteur, quatre
   aménagements, deux armes ; la puissance et la masse libres, le prix, les PV, la CA se recalculent à chaque choix ;
   une alerte bloquante apparaît (« Puissance insuffisante : −2 »), puis disparaît.
3. Elle enregistre : la fiche (**E-9**) montre « Caractéristiques » sous le bandeau « Générée par le concepteur de
   vaisseaux » avec le lien vers l'outil ; Léa ne peut pas retoucher le texte à la main.
4. Plus tard, Antor change la portée de saut ou le catalogue de l'univers : E-22 et E-9 signalent « Calculé avec
   d'anciens réglages » et proposent « Recalculer » ; Léa ne perd rien tant qu'elle ne confirme pas.
5. Les fiches de règles (« Moteurs », « Défenses ») et les 11 exemples sont des sections gérées, lisibles et non
   modifiables ; Léa partage le lien du vaisseau à un autre joueur, qui le lit selon ses droits.
*Moment fort* : les budgets se recalculent sous les yeux, et la section de la fiche reste cohérente avec ce qui
est calculé.
*Échec* : le concepteur est désactivé par Antor — la fiche montre « Caractéristiques » en texte avec « Outil
désactivé », sans modification ; Léa ouvre la conception de Roxane, qu'elle ne peut pas lire — « Page introuvable. » ;
deux écritures concurrentes — la seconde refusée avec « Recharger » ; le calcul d'une conception invalide —
alertes bloquantes, « Enregistrer » refuse et dit pourquoi ; sur un téléphone, le catalogue se parcourt en une colonne.

### P-20 — Reprendre les outils actuels d'Éneria (Monsieur, un samedi, Mac et dépôt privé)
*Les fichiers actuels (carte, vaisseaux) restent utilisables ; Monsieur veut basculer.*
1. Dans `AntorFr/eneria` (privé), un script convertit les fichiers dans le format des modules (dossier
   `_outils/kanevas/`) ; le résultat converti et les valeurs de référence sont versionnés à côté.
2. Avec un jeton d'API à la portée « galaxie » puis « vaisseaux » (**E-18**), il pousse les lots ; **E-18**
   montre créés, mis à jour, refusés, chaque refus avec son champ.
3. Il rejoue : aucun doublon. Les tests sur données réelles (49 routes, les 11 vaisseaux) se jouent **dans les
   pods**, qui lisent `eneria` ; la CI de `kanevas` reste synthétique (décision de Monsieur, 2026-10-16).
*Échec* : un élément mal formé — refusé avec son champ, le reste passe ; un jeton sans la portée de l'outil —
refus (401/403 selon l'API d'import) et rien d'écrit.

### P-21 — Retirer un outil (Antor, MJ, au bureau)
1. **E-20** de « Éneria » : il désactive le concepteur. Les fiches de vaisseaux montrent « Caractéristiques » en
   texte avec « Outil désactivé » ; l'entrée de la barre et les adresses de l'outil disparaissent pour tous.
2. Plus tard il le réactive : tout est là. Ou « Supprimer les données de l'outil… » : la boîte dit « 14
   conceptions, 3 éléments locaux de catalogue seront effacés » ; au niveau du système, elle ajoute les univers
   qui s'en servent encore.
*Échec* : un MJ qui n'est pas responsable du système ne voit pas la suppression des données du système.

## Hors périmètre

- **Outils de `kanevas-outils`** *(décisions de Monsieur, 2026-10-15 et 16)* : le **gestionnaire de tours de faction** (epic `kanevas-factions`, avec
  la superposition des factions par tour sur la carte), le **journal et les dés communs** (epic suivante), l'**impression** (fonction du cœur, plus tard),
  l'**export ou l'import JSON d'une conception** par l'utilisateur, le **podcast**, la **carte hors connexion**, un **chargement à chaud** de code tiers, un
  **moteur générique** d'outils, et le **lien avec la campagne** (chronologie, partie publique) reporté aux tours de faction. Un joueur ne crée pas de fiche
  (règle existante) : le MJ crée la fiche de vaisseau, le joueur conçoit en en étant l'auteur de la section.
- **Jeu en direct** : pas d'initiative, de combat animé, de brouillard de guerre ; la table reste
  physique.
- **Caractéristiques structurées** (fiche de combat, statistiques) : une pièce jointe en V1 ; des
  types de fiches dédiés plus tard.
- **Supprimer** une campagne, un scénario, un CR, une carte, une tâche, un système : rien de cela
  ne se supprime, sauf une pièce jointe, une section, une relation, un membre, et le token ou le nœud
  d'une carte (on le retire de la carte ; sa fiche reste). *(choix de cadrage, à revoir à l'usage)*
  Depuis `kanevas-import`, une **fiche**, un **univers** et un **fichier de la médiathèque** se suppriment (B-40, B-41, B-54) ; un CR, qui
  est une fiche, se supprime avec l'univers et, par un MJ, comme une fiche.
- **Créer une fiche en joueur** : le MJ crée toute fiche, y compris celle d'un PJ, et en ouvre une
  section à son joueur.
- **Inviter un compte qui ne s'est jamais connecté**, lien d'invitation.
- ~~Recherche dans tous les types à la fois~~ : entre dans le produit avec `kanevas-import` (B-37, E-17).
- **Lire un export Kanka** : Kanevas ne connaît pas le format Kanka. Le script qui le lit vit sur le
  Mac de Monsieur, hors du produit et de ses dépôts ; Kanevas offre une API d'import générique (B-47,
  AD-104) que tout script peut consommer. *(décision de Monsieur, 2026-10-11)*
- **Types de fiche créés par un utilisateur** : la liste est celle du produit, enrichie par une
  version (B-42). *(décision de Monsieur, 2026-10-11)*
- **Choix des types par campagne** : le choix vit au système et à l'univers. *(décision de Monsieur,
  2026-10-11)*
- **Créatures et vaisseaux structurés** (caractéristiques en champs par système) : une autre epic ;
  ici, leurs fiches importées sont des sections en Markdown, tableaux compris. *(décision de Monsieur du 2026-10-11)*
- **Cartes dans l'API d'import** : une autre epic, « plus évoluée » ; ici, une carte Kanka s'importe
  comme une fiche ordinaire avec son image. *(décision de Monsieur du 2026-10-11)*
- **Chronologie comme type à part** (une frise) : une epic plus évoluée, comme les cartes ; ici, une
  chronologie est une fiche « Savoir ». *(décision de Monsieur du 2026-10-11)*
- **Blocs secrets par joueur** dans un texte : le bloc MJ n'a qu'une audience, le MJ ; un secret
  pour un seul joueur reste une section à auteur (AD-19).
- **Historique d'un import, annulation d'un lot** : un lot se rejoue, il ne se défait pas ; on
  supprime l'univers d'essai.
- **Export vers Kanka ou un autre outil** : non trié.
- **Calendrier ou chronologie, lanceur de dés, usage sans connexion (PWA)** : non triés.
- **Historique des modifications, export, partage public.**

## Contrôle croisé du cadrage `kanevas-import`

Fait le 2026-10-11 sur la proposition (skill `cadrage`, étape 6), refait après la relecture 1, puis
après les décisions de Monsieur du 2026-10-11 (Savoir, sous-type, médiathèque, pas de pierre tombale,
cartes hors de l'API, jeton de l'assistant inclus), et après AD-111 (tous les fichiers dans la médiathèque).

| Croisement | Résultat |
|---|---|
| Chaque besoin a un parcours | B-32 P-12, P-14 · B-33 P-12, P-14 · B-34 P-12, P-14 · B-35 P-12, P-14 · B-36 P-12 · B-37 P-12 · B-38 P-12, P-14 · B-39 P-14 · B-40 P-14 · B-41 P-10 · B-42 P-13, P-10 · B-43 P-10, P-14 · B-44 P-12, P-16 · B-45 P-11, P-10 · B-46 P-11 · B-47 P-10 · B-48 P-10, P-14 · B-49 P-10 · B-50 P-10 · B-51 P-15 · B-52 P-12, P-14 · B-53 P-16, P-10 · B-54 P-16 · B-55 P-16 · B-56 P-10 — **tient**. |
| Chaque geste humain d'un parcours a un écran | P-10 : E-1, E-2, E-14, E-18, E-8, E-9, E-17, E-13, E-19 ; l'étape 4 n'est pas un geste dans Kanevas (le script, hors produit, décision de Monsieur), son résultat se lit sur E-18 et E-19 · P-11 : E-18 · P-12 : E-8, E-9, E-17, E-12 · P-13 : E-15, E-14, barre · P-14 : E-9 · P-15 : E-5 · P-16 : E-19, E-9 — **tient**. |
| Chaque écran a ses données | E-17 : fiches, alias, étiquettes, sous-type, index (titre, alias, sous-type, `contenu_public`) · E-18 : jetons d'API, lots d'import · E-14 / E-15 : réglages de type · E-9 : liens, parent, sous-type, alias, étiquettes, clé d'origine, références de fichier (texte, jointes), illustration (un fichier image) · E-8 : sous-type, illustration · E-19 : fichiers (images et documents), références de fichier, illustrations · E-13 : `cree_le` (date d'origine) · E-5 : un fichier du volume, pas une entité (B-51) — **tient**. |
| Chaque entité sert un parcours | lien P-12, P-14 · alias et étiquette P-12, P-14 · réglage de type P-13 · jeton d'API P-11 · lot d'import P-10 · fichier et référence de fichier P-16, P-12, P-10, P-7 (le joueur qui dépose un portrait passe par le premier chemin d'ajout) — **tient**. |
| Trous comblés par un choix écrit | l'import n'a pas d'écran de déclenchement (le script) : décision de Monsieur ; « vider un univers d'essai » remplacé par « supprimer l'univers » (AD-105) ; une fiche supprimée revient au rejeu si l'export l'envoie (décision de Monsieur) ; les cartes hors de l'API, une carte Kanka est une fiche (décision de Monsieur) ; E-17 prend la bascule de mode ; liens d'un scénario et d'une entrée de système réglés (AD-97) ; l'image générée par l'assistant entre dans la médiathèque (AD-44 amendée) ; poser une illustration passe par les deux chemins d'ajout (E-9) ; pièces jointes et médiathèque : tous les fichiers dans la médiathèque (AD-111, décision de Monsieur), les deux chemins d'ajout explicites sur E-9 et E-19. Aucun `[À TRANCHER]` ne reste. |

## Contrôle croisé du cadrage `kanevas-outils`

Fait le 2026-10-16 sur la proposition (skill `cadrage`, étape 6).

| Croisement | Résultat |
|---|---|
| Chaque besoin a un parcours | B-57 P-17 · B-58 P-17, P-21 · B-59 P-17, P-18 · B-60 P-17 · B-61 P-17 · B-62 P-17, P-19 · B-63 P-21 · B-64 P-18, P-19 · B-65 P-20 · B-66 P-19 · B-67 P-19 · B-68 P-18, P-19 · B-69 P-18, P-19 · B-70 P-18, P-19 · B-71 P-18 · B-72 P-18 · B-73 P-18 · B-74 P-18 · B-75 P-19 · B-76 P-19 · B-77 P-19 · B-78 P-18, P-19, P-20 · B-79 P-20 — **tient**. |
| Chaque geste humain d'un parcours a un écran | P-17 : E-15, E-20, E-14 · P-18 : E-10, E-21, E-9 (document MJ) · P-19 : E-8/E-9, E-22 · P-20 : le script (hors produit, comme l'import Kanka) ; son résultat se lit sur E-18 ; les tests réels sont dans le dépôt privé · P-21 : E-20 — **tient**, avec un geste sans écran : la conversion et le rejeu (décision de Monsieur). |
| Chaque écran a ses données | E-20 : `outils_systeme`, `outils_univers`, responsable, catalogues (version, comptes) · E-21 : `swn_systemes`, `swn_routes`, `swn_zones`, blocs générés (non stockés), graine · E-22 : `swn_conceptions`, catalogues, `sections.gere_par` · E-9 : `gere_par`, `source_version` — **tient**. |
| Chaque entité sert un parcours | réglage d'outil P-17, P-21 · responsable P-17 · section gérée P-19 · portée de jeton P-20 · catalogues P-17, P-19 · systèmes placés, routes, zones P-18 · conception P-19 — **tient**. |
| Trous comblés par un choix écrit | un module `swn` à deux outils (AD-121) ; la carte de la galaxie est une table du module (`swn_galaxies`) que E-10 ajoute à sa liste, `cartes` ne change pas (AD-122) ; le responsable d'un système créé avant l'epic : tout MJ rattaché, faute de créateur stocké ; pas de dépendance réelle entre les deux outils (le mécanisme se joue avec un module d'essai) ; le document MJ : une fiche choisie ou créée depuis E-21 ; un joueur voit tous les systèmes non secrets (pas de « systèmes connus » par joueur) ; le moteur d'un trajet se choisit dans l'outil ; qui crée un vaisseau (le MJ crée la fiche, le joueur conçoit s'il est l'auteur : règle « un joueur ne crée pas de fiche » conservée) ; E-22 en deux états (liste, atelier) ; le cache d'un bloc selon le niveau de lecture ([À VÉRIFIER], AD-132) . Les tests sur données réelles se jouent dans les pods, jamais en CI (décision de Monsieur, 2026-10-16). |
