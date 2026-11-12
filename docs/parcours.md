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
> P-10 to P-16, E-17 to E-19, AD-95 to AD-111. Monsieur resolved the scoping's `[TO DECIDE]` items on 2026-10-11; anything still open is marked `[TO DECIDE]` in place.

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
- **B-10** — *(`kanevas-fiches-liees`: the relation carries a nature from the product's list and a free qualifier, B-63; « typée en texte libre » reads « qualifiée en texte libre »)* A GM connects one sheet to another with a relation whose type is free text, carried by
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
- **B-32** — *(`kanevas-scenarios`: « un scénario » reads « a section of an adventure's sheet », E-7 being retired)* The content of a section, scenario and system entry is **Markdown**:
  when an account saves it (E-9, E-7, E-15), Kanevas displays it formatted — headings, bold,
  italics, lists, quotes, tables, links, section images — and never interprets HTML written in
  the text, which is displayed as is; the editor has a **preview**. *(P-12, P-14)*
- **B-33** — *(`kanevas-scenarios`: the same in an adventure's sections)* When an account writing a section types `[[`, E-9 suggests sheets it may
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

- **B-taille-1** — *(`kanevas-taille-images`)* When a GM, or a player who may write a section, has an image in its text
  (`![…](fichier:N)`, E-9), they can set its **size** (small, medium, large) and its **placement**
  (left or right with the text wrapping it, or centred without wrapping) from the editor's « Image » button;
  in reading, the image shows at that size and placement, on desktop and on a phone where it stays a
  readable centred block; an image with no setting shows as before. The setting is the image's Markdown
  title (`"moyen-droite"`), so the import and the export carry it as text. *(P-12)*

### Import and API access (`kanevas-import`)
- **B-45** — A GM creates an **API token** for their universe from « Accès par API » (E-18): a name,
  a lifetime (30 days by default, one year at most); Kanevas shows it **once only**; the token acts
  with that GM's permissions in that universe only, and only on the import API. *(P-11, P-10)*
- **B-46** — A GM sees their universe's tokens (name, created by, last use, expiry) and
  **revokes** one from E-18; if the token is revoked, expired, or its GM has lost that role, then
  every request presenting it is refused (401) and nothing is written. *(P-11)*
- **B-47** — *(`kanevas-scenarios`: adventures go through this same route, B-61)* When a script pushes a sheet through the import API with an **origin key**, Kanevas
  creates it if the key is unknown in the universe, updates it if known, and changes nothing if
  nothing has changed — sheet, sections, relations, aliases, labels, parent, attachments, illustration,
  campaigns and scenarios; replaying the same import creates no duplicates. *(P-10)*
- **B-48** — *(`kanevas-scenarios`: the `statut` of an adventure is protected like its sub-type and its parent)* If anything an import wrote has since been **modified in Kanevas** (by a human or their
  assistant) — a sheet's title, type, subtype, parent, aliases, labels; a section's title,
  content, audience, attachments; a sheet's illustration; a campaign's name and
  status; a scenario's title and content; a media library file's name and **visibility** —,
  then a new import does not overwrite what was modified,
  writes the rest, and the batch report names each field left untouched. *(P-10, P-14)*
- **B-49** — *(`kanevas-scenarios`: the lot counts adventures among the sheets — no « campagnes » nor « scénarios » counters any more, AD-125)* A GM sees their universe's **import batches** on E-18: when, through which token, how many
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
- **B-57** — *(kanevas-fiche-mj-seul)* A GM sees at a glance, in GM mode, which sheets the players
  cannot see: a sheet none of whose sections is readable by players (or with no section at all)
  carries the amber « MJ seul » badge on its card (E-8), on its tree line and in its header (E-9),
  like a GM-only file in the media library; and the GM filters the list by visibility (« Toutes »,
  « Visibles des joueurs », « Réservées au MJ »). Nothing is stored: the state is read from the
  sections, and opening one section to the players removes the badge. A player, and the GM in
  player mode, see neither badge nor filter. *(P-3 step 4 ; decision of Monsieur, 2026-10-25)*

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

> *Amended by `kanevas-scenarios` (decision of Monsieur, 2026-10-25): campaigns and scenarios
> become sheets of the « Aventure » type. B-58 to B-62 replace B-15, B-16 and B-17 and amend
> B-18 and B-19; E-6 Campagne and E-7 Scénario are retired. The reason: a scenario kept apart
> received no incoming link, no image, no relation and no tree — the import of a real campaign
> (ten documents cited by thirty sheets, fourteen table handouts) showed what that cost.*

- **B-15** — *(replaced by B-58 and B-59)* A GM creates a universe's campaigns and changes their status — in preparation,
  active, completed — from the campaign list and page (E-6). *(P-3)*
- **B-16** — *(replaced by B-58; a scenario's sections are born closed to the players, and the GM may open one — a handout — which B-16 forbade)* A GM creates a campaign's scenarios from its page (E-6) and writes them (E-7); players
  never see them.
  *(P-3)*
- **B-17** — *(replaced by B-60, same five categories)* A GM maintains a campaign's preparation list on its page (E-6): tasks in
  five categories (monsters, NPCs, maps, sequences, other) to check off; a checked task
  leaves the active list without disappearing. Players see none of it. *(P-3)*
- **B-18** — A player sees the universe's campaign list, names and statuses. *(P-4, P-6)*
  *Amended (`kanevas-scenarios`, decision of Monsieur, 2026-10-25)*: **the GM decides which
  adventures the players see**, campaign or scenario alike: a player sees, in the « Aventures »
  list (E-8) and in the « Campagnes en cours » block of E-3, the adventures one section of which
  the GM opened to the players — typically « Présentation » when the campaign starts; nothing is
  open at creation, a campaign in preparation stays the GM's — with their status (B-59).
- **B-58** — *(kanevas-scenarios)* An **adventure** — a campaign, a scenario, a one-shot — is a
  sheet of the « Aventure » type: sections with their audience, links from and to any sheet,
  relations, files and illustration, search, and the tree. The sub-type is free (B-52); the
  product proposes « Campagne » and « Scénario »; a scenario belongs to its campaign by the tree
  (its parent), a one-shot stands at the root. The GM creates an adventure from the type's list
  (E-8, where the tree is the default view) and reads and writes it in E-9, like any sheet;
  deleting, renaming, changing the type follow the sheets' rules (B-… of `kanevas-import-tenir`).
  *(P-3)*
- **B-59** — *(kanevas-scenarios)* Every adventure carries a **play status**: « En préparation »
  (at birth), « Prête », « En cours », « Terminée ». The GM changes it in place from the header
  of E-9 and from the menu of its card or of its tree line in E-8; a change touches no other adventure. The status shows as
  a badge on the card, on the tree line, in the header and in the results of E-17; every reader filters
  the list by status; a player sees the status of the adventures he sees. *(P-3, P-4, P-6)*
- **B-60** — *(kanevas-scenarios)* The **preparation** list (five categories, cocher/décocher,
  GM only, as B-17 said) and the **comptes-rendus** of an adventure live on its sheet (E-9) as
  blocks of the sheet, above its sections; « Nouveau compte-rendu » stands in that block, for any
  member, and the CR names that adventure (B-19). The blocks of E-3 read the adventures
  « En cours »: « Campagnes en cours » (sub-type Campagne), « Derniers comptes-rendus »
  (unchanged), « Préparation » (the open tasks of the adventures en cours, GM). *(P-3, P-4)*
- **B-61** — *(kanevas-scenarios)* The **import API** pushes an adventure through the sheets
  route (`type: aventure`, `sousType`, `parent` by origin key, sections; `statut` too, built by `kanevas-scenarios-import-assistant`); a reimport
  never overwrites a status, a sub-type or a parent changed in Kanevas (B-48 extended); a
  compte-rendu names its adventure by its origin key as before. The former campaign and scenario
  routes of the import disappear. *(P-10)*
- **B-62** — *(kanevas-scenarios)* The GM's **assistant** creates a sheet of any activated type
  — title, sub-type, parent — and so an adventure; « créer une campagne » and « créer un
  scénario » become that one gesture. *(P-3)*

### Session reports and world updates
- **B-19** — When a member writes a session report from a campaign page (E-6), the report is
  readable by the whole table and editable by its author; the GM reads and writes every report. Several
  reports can coexist for the same session. *(P-4)* *Amended (`kanevas-scenarios`)*: « depuis la page
  d'une campagne (E-6) » reads « from the sheet of an adventure (E-9, block « Comptes-rendus »),
  campaign or scenario »; the CR names that adventure, and E-13 shows it.
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
  with a way to reload (on the screen of a design, placed system, route or zone, and in the « Voir les éléments » panel; the catalogue import dialog has no reload: it says the data « changed meanwhile » and shows what was applied, and the file is chosen again to preview a new import). No live collaborative editing. *(P-18, P-19)*
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
  configured jump range (a leg is usable up to `portée × (moteur + 1)` cases, and lasts length ÷ engine + 1 day of transit); a route is exact on the grid. *(P-18)*
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
- **B-78** — Accuracy is proven through **reference cases**: the example ships of the current
  tools (price, HP, AC, free power and mass, construction, maintenance, alerts) and named corrections against the book
  (the book's construction: 949,000 cr and 38 days, not 954,000 and 39; buildable battleship: a single
  laser, a single cargo hold); every route of the current map, exact (the counts of routes and ships are read in the
  source files by the tests, never copied: Monsieur's figures of 2026-10-16, 49 routes and 11 ships, were wrong,
  decision of 2026-11-05); stability of generated systems, manually
  calculated durations (7 hexes with engine 2 = 4.5 days). The public repository runs the same tests on its
  **invented** fixture in CI; real expected values come from Monsieur's current tools, calculated
  once and frozen on the private side, run in pods. *(P-20, P-18, P-19)*
- **B-79** — Éneria's current data (map, catalogues, ships) is converted to the
  module format by a script in the private `AntorFr/eneria` repository (replayable), and imported through the API
  (B-65); current tools remain usable until switchover. None of that data — SWN
  catalogues, rule sheets, expected values calculated from them — enters the public repository.
  **Nothing is left out of the conversion for want of a format** (decision of 2026-11-05): when the
  data says something the format cannot, the format grows (B-80 to B-84) before the conversion. Decision of 2026-11-08: the SWN tool replaces the
  prototype, so it carries **all** of its rules; the elements the conversion first listed as not converted
  all enter the format. *(P-20)*
- **B-80** — A **mass** — a hull's or an element's, in the catalogue — is a number, not only an
  integer: a multiple of 0.5 (the workshop weighs 0.5 × the hull class: 0.5, 1, 1.5…). Free mass,
  the sum of the lines and the alerts stay exact; the screens show the decimal with a comma. *(P-19, P-20)*
- **B-81** — A **route** of the galaxy map may carry a **type of link**: a short free label (« Pirate »,
  « Privée »…, 40 characters at most), set by the GM and imported with the route. It is shown beside the
  route on the map and in the route's panel, to whoever can read the route (a private route is
  absent for a player, label included). A route without label is as before. *(P-18, P-20)*
- **B-82** — A **hull** and an **element** of the ship catalogue say everything the book's tables say about them,
  not only what the first workshop computed. A hull has a **speed**, an **armour** and a **minimum and a maximum crew**;
  an element (accommodation, defence, engine) may have a **smallest hull class** and a **largest hull class** it fits,
  and a text **condition** on its cost or technology; a defence may add a speed bonus; a weapon has its **damage**,
  **armour piercing**, **qualities** and **technology level**; an example design carries its **crew**. The
  workshop shows them, alerts when a design leaves them (a hull too small for an element, a crew under the hull's
  minimum or over the hull's maximum) and keeps them in the rule sheets. A catalogue without these fields keeps
  working as before. *(P-19, P-20)*
- **B-83** — A **modification** may cost a **percentage of the hull** (not only a fixed amount) and carries an **effect
  in play** the workshop applies to the result: a change of speed or armour, an exchange between power and mass, a
  doubling of cargo or magazines, a minimum repair skill. The **system engine** is the same kind of rule: an
  accommodation that replaces the hull's engine and gives back power and mass according to the hull class. These effects are
  **data of the catalogue, chosen among a closed list of effects the module knows** — never a formula or code
  carried by the data. A catalogue without them keeps working as before. *(P-19, P-20)*
- **B-84** — A **zone** of the galaxy map may cover any set of hexagons, however large (hundreds to thousands), not only
  what a simple outline of 64 vertices says exactly. It is drawn, imported, listed and read like any zone; a
  player sees it only if it is public (B-73). Zones already stored are unchanged. *(P-18, P-20)*
- **B-85** — Three more things the book's tables say, found when the real data were converted (decision of
  Monsieur, 2026-11-10; no gap is accepted, B-79 holds). A **defence's speed bonus** may be negative (−9 to 9): it takes
  that much speed off the result. A **modification's minimum repair skill** is a field of its own, apart from its
  effect: a modification that changes speed, armour, exchanges points or doubles cargo may also ask for a repair
  skill. An **accommodation's cargo** may be stated **per hull class** (it then replaces the single cargo of that
  accommodation), and the **system engine** states the **percentage by which it reduces its cost** (10 % in the book).
  A catalogue that says none of it keeps working as before. *(P-19, P-20)*

### Cross-cutting
- **B-28** — Every page requires sign-in; no content is served without an account, and
  `/healthz` only states the name and version. *(P-1)*
- **B-29** — Each screen has its states: empty, loading, error, lost connection, refusal (hidden
  or explained), long content. *(all)*

## Journeys

Each step: who acts, through which action, on which screen. “Agent” means the person
asks their assistant (E-12).

### P-1 — Get started (any new account, first visit)
1. The person opens Kanevas; Authelia authenticates them; they arrive on the **home page** (E-1):
   « aucun univers ».
2. If they want to run a game: **« Créer un univers »** (E-2) — name, description; they arrive
   on its **overview** (E-3) as GM.
3. If they are a player: the home page shows their identifier and tells them to give it to their GM;
   after being added, the universe appears on the home page.
*Failure*: Authelia refuses — Kanevas only shows « La connexion a été refusée. » (and a « Réessayer » link), no content; Authelia unreachable — « Authelia ne répond pas pour l'instant. Réessayez dans un moment. »; each page has a « Réessayer » link that restarts sign-in.

### P-2 — Gather the table (GM; admin as last resort)
1. The GM opens **« Membres »** (E-4) from universe navigation.
2. They add an account by identifier, choose GM or Player; change a role; remove a
   member.
3. As a last resort, the admin opens **administration** (E-5), chooses the universe, performs the same action.
   *Example*: a universe's only GM has left the table; the admin adds a GM who has already opened
   Kanevas. The admin still reads none of the content; to read it, they add themselves, and
   that addition appears in the member list seen by the universe's GM.
4. Once a member, they open the universe from E-5: its **overview** (E-3).
*Failure*: identifier that has never signed in — « ce compte ne s'est jamais connecté »; removing the
last GM — refused with the reason; a non-admin account opens the address — « Page
introuvable. ».

### P-3 — Prepare Saturday's session (GM, Sunday evening, at a desk)
1. **Overview** (E-3): ongoing campaigns, latest reports, ongoing preparation.
2. *(kanevas-scenarios)* **Aventures** (E-8, tree view): he creates the campaign « La Couronne
   brisée » (sub-type Campagne, born « En préparation », nothing open to the players yet) or
   opens the existing one, sets it « En cours » from its header (E-9) and opens « Présentation »
   to the players, now that the campaign starts; under it he creates the
   scenario « Acte II — Le sceau brisé » (sub-type Scénario, parent the campaign, sections closed
   to the players), writes it in E-9 like any sheet — links to Aldric and Port-Sel, the plan of the
   crypt from the media library, a relation to the Guilde —, and sets it « Prête » when it is — from the status line of its sheet, or in place from its tree line or its card in E-8, where he can also filter by « Statut »; when a status change or a creation fails, « L'action n'a pas abouti. Réessayez. » and nothing changes —; or
   he asks his **assistant** (E-12) to create it: the writing block leads to its sheet.
3. On the campaign's sheet (E-9), block « Préparation »: he ticks or adds tasks.
   *Échec*: the campaign's page is open in two tabs; a status set in one is shown stale in the
   other until it reloads — the status menu writes the whole value, no conflict to resolve.
4. **Lore**: from a **type's list** (E-8, among enabled types), they create an NPC or place, with a **subtype** if needed; on the **sheet** (E-9), they
   write « Apparence » (player-readable) and « Vérité — MJ seul », link the NPC to their faction
   (*kanevas-fiches-liees*: nature « membre de », qualifier « trésorier ») and to Port-Sel
   (« se situe à », « habite »),
   upload a place's plan, and set Aldric's portrait as the sheet's **illustration** (visible
   to anyone seeing the sheet); back on the list, Aldric's card carries that portrait. *(kanevas-fiche-mj-seul)*
   A PNJ he has described only in « Vérité — MJ seul » carries the « MJ seul » badge in the list of
   personnages until he writes « Apparence » for the players; « Visibilité » ▸ « Réservées au MJ »
   lists what the table will not see (B-57).
5. They ask their **assistant** (E-12) « rappelle-moi tout ce qu'on sait d'Aldric » then
   « fais un portrait pour Apparence »: the image is attached to the section, and they follow « Ouvrir la section »
   in the thread to see it on the sheet (E-9).
6. **Maps** (E-10, E-11): they place the NPC on the city map, switch to **Player mode**
   to check, then make the map visible.
*Assistant failure*: a creation request fails or the assistant is unavailable: the panel says so (« Je n'ai pas pu répondre — réessayer » or « L'assistant n'est pas disponible pour le moment. »); creation may have occurred before the response was lost (timeout, broken connection): before retrying, Antor checks E-6 or E-7 to avoid creating twice, then creates manually if needed (step 2).
*Image failure* (step 5): generation fails or times out, the section already has 50
attachments, write permission has been removed, the description exceeds 500 characters or no engine
is available — the assistant says so, nothing is attached; Antor
can ask again, or upload an image himself on E-9 (P-3 step 4).
*Highlight*: the sheet in Player mode betrays no secret.
*Failure* (illustration, step 4): they choose a PDF or an empty file — « « plan.pdf » n'est pas
une image… » or « « portrait.png » est vide. », the previous illustration remains; upload is interrupted —
« l'envoi n'a pas abouti », with « Réessayer »; another GM has meanwhile demoted them to Player —
« Vous ne pouvez plus modifier l'illustration de cette fiche. » and the actions disappear; removal
fails — « L'action n'a pas abouti. Réessayez. », the illustration remains; the image does not load —
the frame says « Image indisponible. » and keeps « Remplacer » and « Retirer ».

### P-4 — Write the session report (player or GM, the day after the game)
1. From the **overview** (E-3) or the **Aventures** list (E-8), they open the campaign — or
   the scenario played that night — (E-9). *(amended by `kanevas-scenarios`)*
2. **« Nouveau compte-rendu »**, in the block « Comptes-rendus » of that sheet: title, text; they
   publish it — it opens as a **sheet** (E-9) of type session report, which names the adventure.
3. They edit it later; others read it from the adventure or the **report list**
   (E-13).

### P-5 — Update the world after the game (GM)
1. They read reports (E-13 → E-9).
2. From a report, they ask their **assistant** (E-12), naming that report (the assistant does not know which
   screen is open): « mets à jour la section Vérité d'Aldric d'après le compte-rendu de la séance 3 ».
3. The panel shows current and proposed content; they **apply** or **abandon** with one click.
4. Otherwise, they edit the sheet themselves (E-9).
*Failure*: the section has changed since the proposal — applying is refused, with the reason.

### P-6 — Catch up before the session (player, Wednesday evening, phone)
1. **Home** (E-1) → universe **overview** (E-3): latest reports, visible
   maps.
2. They browse the **character list** (E-8), a grid of illustrated cards, and recognize
   Aldric by his portrait — or search for his name —; on the place list, they can filter by
   **subtype** (« Taverne ») among those of sheets they see; then open the **sheet** (E-9): only what
   the table knows.
3. They open the **map** (E-11), tap a token, reread the sheet.
4. Or ask their **assistant** (E-12) « que sait-on d'Aldric ? ».
6. *(kanevas-fiches-liees)* On « Port-Sel » (E-9), Léa reads « S'y trouvent : Personnages (1) » —
   Maître Aldric, whose relation is in « Apparence », which she reads; the Prieur, linked from
   « Secret — MJ seul », is neither counted nor named — and, in the grid of characters (E-8),
   the « mort » mark on Bran Corvalis's portrait — once Antor has marked him dead (P-17,
   step 4); before that, Bran is alive in the seed.
5. *(kanevas-scenarios)* **Aventures** (E-8): he sees « La Couronne brisée », « En cours », and
   reads what its sheet shows to the players (E-9) — its « Présentation », never the scenarios
   beneath it, whose sections are closed.
*Failure*: they ask to read « Vérité »: the assistant answers « Introuvable. », like the interface;
the assistant is unavailable or fails: the panel says so, and the sheet remains readable (E-9).
*Failure* (illustration, step 2): an image does not load (phone network) — the card
shows the fallback thumbnail, never a broken image, and the sheet « Image indisponible. »; a
sheet the GM has since closed to players disappears from the grid, and its illustration's
address responds like an unknown address.

### P-7 — Maintain a character's story (player)
1. The GM has created the PC's sheet and entrusted a section to the player as author (E-9).
2. The player writes it on the **sheet** (E-9), uploads a portrait, or asks their **assistant**
   (E-12) to add a paragraph.
*Failure*: they ask to write in a section they can read but cannot write: « Vous ne pouvez pas modifier
cette section. », nothing is written.
*Upload failure*: empty file, section already at its attachment limit (50 before
`kanevas-import`, 100 since, AD-111), interrupted upload or lost write permission — the file
is not attached; the section (E-9) explains why; no partial operation remains.

### P-8 — Build a universe on a shared system (GM)
*Antor, GM of « Lame d'Ébène », on Sunday evening; Mira, GM of « Landes grises », playing the same
system.*
1. **Universe settings** (E-14): he chooses a system from the catalogue or creates one
   (« Créer et rattacher »); he can also detach the universe (« Aucun système ») and, on the same screen, correct its name and description.
2. **Game system** (E-15), opened from « Systèmes de jeu » (E-16, outside his universes) or
   through « Ouvrir le système » (E-14): he finds the shared bestiary and adds a creature, which the
   system's other universes see immediately; Mira, attached to the same system, reads it.
   *Highlight*: the creature added by Antor appears for Mira without her seeing a word of
   Antor's lore — not even his universe's name: her « Systèmes de jeu » list only shows
   « Les Landes grises ».
   *Player variant*: Léa, Player in « Lame d'Ébène », opens the overview's « Système de jeu » block
   (E-3) and reads the same creature, without being able to edit it.
*Failure*: system name already taken — « Un système porte déjà ce nom. »; creature modified
in the meantime by the other GM — « Cette entrée a changé depuis que vous l'avez ouverte. », the current
text is kept; universe detached while a player reads the system — the player's page answers
« Page introuvable. » on the next load.

### P-9 — See who is connected to whom (GM, then the table)
1. **Maps** (E-10) → new **graph** (E-11): they choose factions; links come
   from their relations.
2. They make it visible; a player only sees what they may read.

### P-10 — Prepare then replay the Kanka collection import (Monsieur, GM, Saturday, Mac and browser)
*Antor (Monsieur) has brought his Kanka collection onto his Mac; his script reads it and pushes it into Kanevas.
He first wants a disposable trial, then the real collection, without duplicates or leaks.*
1. **Home** (E-1) → **« Créer un univers »** (E-2) « Essai Kanka »; he is its GM.
2. **Settings** (E-14): he attaches the universe to his system, then in « Types de fiche » overrides
   « Vaisseau » to enabled (the system disables it) — P-13.
3. **« Accès par API »** (E-18): « Nouveau jeton », name « Script Kanka — Mac », lifetime 30 days;
   Kanevas shows the token once; he copies it into the script's configuration.
4. *(`kanevas-fiches-liees`: a relation entry carries `nature` and `qualificatif` — `type` still read as the qualifier for one version —, a `disparu` mark on a sheet of a type that carries it, a `famille` sheet; an unknown or incompatible nature is a refusal counted, `nature_incompatible`)* *(`kanevas-scenarios`: campaigns and scenarios are pushed as sheets of type `aventure`, and counted with them)* *Outside Kanevas*: he runs the script; the script opens a **batch**, pushes
   **campaigns** first, then sheets, parents first (origin key, type, title, parent, aliases,
   labels, Markdown sections with their `[[…]]` links, GM blocks, images,
   audience) — session reports with their campaign key —, then relations, and closes the batch
   (the order from AD-104).
   Files, images and documents, first go into the **media library** (E-19), each with its
   permissions — « Réservée au MJ » for those Kanka only displays in GM content, « Visible des
   joueurs » otherwise —, including the 385 MB unused by any sheet; sheets reference them.
5. *(`kanevas-scenarios`: campaigns and scenarios are pushed as sheets of type `aventure`, and counted with them)* **Accès par API** (E-18), bloc « Lots d'import » : « Fiches : 498 créées, 3 refusées · Fichiers :
   1 140 créés · Relations : 324 créées, 2 refusées (nature incompatible, *`kanevas-fiches-liees`*) · 6 en attente » ; il
   expands refusals: « personnage:aldric-le-gris — section « Vérité » : 112 000 caractères, 100 000
   au plus ».
6. He opens a few sheets (**E-8** as a tree, **E-9**, **E-17**) and switches to **Player mode** to
   check that no GM block appears, on sheets or in search — P-12; in **« Comptes-rendus »** (E-13), the 36 Kanka
   journals follow their original dates; on a sheet, the « ⋯ » menu shows its origin
   key (« lieu:port-sel »).
   A sheet sent before its files shows the GM « Fichier en attente d'import :
   « img:quais ». » instead of the image until the file arrives (Léa sees nothing).
7. He corrects the script (splits the overlong section in two), runs it again: the new batch says
   « Fiches : 3 créées · 498 inchangées · Fichiers : 1 140 inchangés · … · 0 en attente » — no duplicates.
   Pending file references are counted with links as « liens et références en attente »;
   when nothing is pending, that count is omitted from the batch report.
8. **Settings** (E-14), « Supprimer l'univers », he types « Essai Kanka »: the universe disappears from
   the home page.
9. He repeats 2 to 7 on the real universe; in the following days, Léa writes in an imported section and
   Antor renames « Port-Sel » to « Port-Sel-sur-Brume » (P-14); a replayed import overwrites neither
   and the batch says so: « section « Notes » de personnage:lea-pj modifiée dans Kanevas : non
   écrasée »; « lieu:port-sel : titre modifié dans Kanevas : non écrasé »; likewise a file
   Antor changed to « Visible des joueurs » (E-19) is not restored to « Réservé au MJ »: « visibilité
   modifiée dans Kanevas : non écrasée ».
10. **« Accès par API »** (E-18): he revokes the token (P-11).
*Highlight*: the second batch « Fiches : 501 inchangées » and nothing created in any other
kind — replay is safe.
*Failure*: token copied incorrectly or revoked — the script receives 401 « Jeton invalide. », nothing is written,
and no batch appears; unknown parent or relation target — the sheet is written without that
parent or relation, with a warning in the batch; a `[[…]]` link to a still-unknown
key — it remains pending and resolves when the sheet arrives (in the same batch or the next);
the network breaks midway — the batch remains « En cours » on E-18, without damage: replay resumes where
it left off, since everything already written comes back « inchangé »; a zero-byte image — refused, the
reason in the batch; deleting the universe while typing a different name — the button remains inactive; failed deletion — « L'action n'a pas abouti. Réessayez. » in the dialog, the universe is intact (states: E-14).

### P-11 — Create and revoke an API token (GM)
1. **« Accès par API »** (E-18), from « Univers » ▸ « Accès par API » in the bar (GM-only).
2. « Nouveau jeton »: a name, a lifetime (7, 30, 90 days or one year); « Créer le jeton ».
3. The window shows the token, « Copier », and « Il ne sera plus jamais affiché. »; he closes it.
4. The list shows the token: name, created by, created on, last use (« jamais »), expires on.
5. Later: « Révoquer » on the row, confirmation « Révoquer « Script Kanka — Mac » ? Le script
   qui l'utilise ne pourra plus rien écrire. »; the row changes to « Révoqué ».
*Failure*: another GM has removed Antor's role — his tokens stop working (401) and he no longer sees
E-18 (« Page introuvable. ») and, for another GM, his token rows carry the « Inactif » badge; a Player forces E-18's address — « Page introuvable. »; the token
has expired — the row says « Expiré », the script receives 401.

### P-12 — Read the imported collection (Antor, GM, then Léa, Player, on a phone)
1. Antor opens **« Lieux »** (E-8), switches the list **to a tree**: « Les Sphères » (« Lieu · Sphère »)
   expanded shows « Port-Sel » (« Lieu · Port »), which expanded shows « La Taverne du Kraken » and « Les
   Docks »; he filters by subtype « Port »: « Port-Sel » and « Havre-Gris » (after an import carrying those subtypes: the stub seed sets « Les Sphères » and « Port-Sel » without subtypes, and no « Havre-Gris »).
2. He opens « Port-Sel » (**E-9**): the breadcrumb « Lame d'Ébène › Lieux › Les Sphères ›
   Port-Sel »; Markdown text (subheadings, a district table, an inserted image); links
   to « Maître Aldric » and « La Guilde des Brumes »; amid « Histoire », a **GM block**
   hatched in amber (« Le port est tenu par la Guilde… »); at the bottom, « Contient » (its children) and
   « Mentionnée dans » (sheets citing it); beside the type, its subtype « Lieu · Port »;
   below the title, its aliases and labels.
3. He switches to **Player mode**: the GM block has disappeared without leaving a gap; the link to « La
   Guilde des Brumes », a GM-only sheet, has become text; « Mentionnée dans » has lost « Rapport
   secret de l'amirauté » and « La Guilde des Brumes », which a player cannot read.
4. Léa, on her phone, opens **search** (E-17), types « sous-main », a word found only
   in the GM block: no result. She types « guilde »: she finds « Port-Sel » (the link text
   is written in « Histoire », which she reads) but never the « La Guilde des Brumes » sheet; she finds
   « Port-Sel » by its alias « Salport »; she taps the « Côte des Brumes » badge (on E-17, or on the « Port-Sel » sheet which opens it filtered) and sees sheets she reads.
5. She opens « Maître Aldric » through a link, then returns through the breadcrumb.
6. She asks her **assistant** (E-12) « que sait-on de Port-Sel ? »: it cites nothing from the GM
   block.
7. *(kanevas-taille-images, B-taille-1)* Back on « Port-Sel », Antor puts the caret inside the harbour
   image, opens « Image » (E-9, « Écrire ») and picks « Moyen » then « À droite »; he saves. In reading,
   the text of « Histoire » wraps the image on the right; on Léa's phone the image is a centred block,
   readable.
*Highlight*: the same sheet, read by Antor then Léa — the secret is neither shown, findable,
nor hinted at. (Step 7 is an editing gesture, outside this key moment.)
*Failure*: an inserted image does not load — « Image indisponible. » in its place; a link to a
removed sheet — plain text for Léa, « lien cassé » for Antor; a sheet with nothing readable by Léa
since the last import — absent from the tree, search and « Mentionnée dans ». Image setting (step 7): « Image » is greyed out while the caret is not in an image; if saving fails, the written title stays in the field with the section's save message.

### P-13 — Choose a system's and universe's types (GM)
*Antor plays « CoF Mini » in « Lame d'Ébène », except his universe has ships.*
1. **Game system** (E-15), « Types de fiche » tab: he disables « Vaisseau » and « Note » for
   the system; Mira, GM of another universe using the system, sees those types leave her bar.
2. **Settings** of « Lame d'Ébène » (E-14), « Types de fiche » panel: each type says « Système · activé »
   or « Système · désactivé »; he overrides « Vaisseau » to **« Activé »**.
3. The sidebar of « Lame d'Ébène » shows « Vaisseaux », not « Notes ».
4. Later, the system re-enables « Note »: « Lame d'Ébène », which follows it, shows it on the next load;
   « Vaisseau », overridden, does not change.
*Failure*: he disables « Lieu » while the universe has 201 places — confirmation says « Les 201 lieux
restent ; on les atteint par un lien, la recherche ou l'arbre. »; a Player does not see the E-14
panel (« Page introuvable. ») and reads E-15's tab as « Lecture seule », switches inert.

### P-14 — Maintain the collection after import (Antor, GM, at a desk)
1. On « Port-Sel » (**E-9**), « Modifier » the « Histoire » section: he types `[[`, chooses « Maître
   Aldric » from the list that opens; he selects a sentence and makes it a **GM block**; « Aperçu »,
   then « Enregistrer ».
2. In the header, he renames the sheet « Port-Sel-sur-Brume »; changes its subtype « Port » to
   « Port franc » (the list suggests place subtypes already used: « Sphère », « Port », « Taverne »…);
   « ⋯ » menu: « Déplacer sous… » « Les Sphères »; « Alias et étiquettes ». On « Les Cristaux
   d'Ombre », imported as Note, « Changer le type »: « Note » → « Savoir », subtype « Ressource ».
   *(kanevas-sous-type-dialogue, B-52)* « Maître Aldric » is an NPC with sub-type « Capitaine » (badge
   « PNJ · Capitaine »; in the stub, the seeded sheet has none: Antor first sets it in the badge). Antor opens his sheet from « Personnages », then its « ⋯ » menu, « Changer le type… », and leaves « Personnage (actuel) »:
   the field holds « Capitaine »; he types « Amiral » and clicks « Changer le type »; the badge says
   « PNJ · Amiral ».
   *(kanevas-sous-type-dialogue, B-52)* The sub-type « Port » of « Port-Sel », above, he changed in
   place, in the badge: on hover, the pencil that appeared next to « Port » showed him that it is editable.
   *(kanevas-deplacer-arborescence)* Another day, Antor moves « La Taverne du Kraken »: « Déplacer sous… » opens
   on the level where it is — « Lame d'Ébène › Les Sphères › Port-Sel », its siblings listed, the Taverne marked
   « (cette fiche) » — and he chooses « Les Docks » without typing anything (moment fort: he sees where the sheet
   is before choosing where it goes); « Recherche » stays one click away when he knows the title. Failure: a
   level that does not load says « Impossible de charger ce niveau. » with « Réessayer », the path still usable;
   connection lost — the banner, navigation and « Déplacer » inactive, the shown level stays.
3. A duplicate's « ⋯ » menu: « Supprimer la fiche… »; the dialog counts what goes with it
   (sections, relations targeting it, placements on a map; its files remain in the media library),
   says under which sheet
   its children move up and that links targeting it will become broken links (exact wording:
   E-9); the duplicate came from Kanka: Antor also removes it from the export, otherwise the next import
   recreates it (B-40).
4. In a **scenario** (E-7 — `kanevas-scenarios`: a section of the scenario's sheet, E-9), the same action: `[[` opens the same list (sheets in the campaign's universe) and the link
   opens the sheet; in a system entry (E-15), `[[` does nothing.
*Link failure*: Léa, an author with write permission, manually types `[[<id>]]` of a sheet she cannot read (the identifier from an address Antor gave her) — « Cette fiche n'existe
pas ou vous ne pouvez pas la lire. » below the field, her text intact; the list does not respond — « Impossible de
chercher. » and « Réessayer »; a link to a sheet not imported yet — « en attente » for Antor,
text for Léa until the sheet arrives; in a scenario, a failed list — « Impossible de chercher. ».
*Failure*: a move that would form a cycle (the box no longer offers the child; the case of a hierarchy changed while the box is open remains) — « Une fiche
ne peut pas être rangée sous l'un de ses descendants. »; an emptied title — « Erreur : le titre est obligatoire. », the field remains; a deletion summary that fails to load — « Impossible de charger le détail. », « Réessayer » (states: E-9); a Player authoring a section containing
a GM block — « Modifier » does not appear; text exceeding 100,000 characters — « Erreur : 100 000
caractères au plus. », the text remains.
*(kanevas-sous-type-dialogue)* The sub-type « Amiral » is not saved from « Changer le type… » —
« Le sous-type n'a pas changé. Réessayez. », the box stays open with « Amiral »; the connection drops —
the banner, « Changer le type » disabled, and the badge's sub-type no longer offers a background or pencil.

### P-15 — Set the assistant's token (Admin, instance admin) (B-51)
*Admin has just deployed Kanevas: the assistant has no token yet, and they do not want to redeploy.*
1. **Administration** (E-5), « Jeton de l'assistant » block: « Aucun jeton posé »; « Connecter
   l'abonnement ».
2. Kanevas shows an address; they open it, authenticate with Anthropic, copy the code.
3. They paste the code, « Valider »: « Jeton posé le 11 octobre 2026. »; the assistant is available
   in every universe, without redeployment. *(Highlight: « Jeton posé le … » appears, without the token value being shown anywhere.)*
*Failure*: incorrect code — « La connexion n'a pas abouti. Recommencez. »; the window has expired (10 minutes)
or the server has restarted — « La connexion a expiré. Recommencez. »; the connection program does not start —
« La connexion n'a pas pu démarrer. Réessayez. »; in every case the previous state remains. If the token comes from
the deployment, the panel says « Jeton fourni par le déploiement. » and reconnects in the same way.

### P-16 — Organize and share files (Antor, GM, then Léa, Player)
*After import, the media library of « Lame d'Ébène » holds 1,100 images and 40 documents, including those
unused by any sheet in Kanka.*
1. From the sidebar, Antor opens **« Médiathèque »** (E-19), filters « Images », then searches by name
   for « carte-des-sphères.png » (used in three sheets) and renames it « Carte des Sphères ».
   He switches to « Documents »: « Règles de la Guilde.pdf » (PDF, 2,4 Mo).
2. He opens « plan-du-repaire.png » (« Visible des joueurs », inserted in « Histoire » of « Docks »
   and attached to « Description » of « Port-Sel », two player-readable sections) and changes it to
   « Réservée au MJ »: Kanevas lists both places, where players will no longer see it; he
   confirms.
3. On « Port-Sel » (**E-9**), he edits « Description » (player-readable): « Fichier » ▸ « Choisir
   dans la médiathèque », he chooses « Plan secret de la Guilde » (GM-only): the editor warns
   « Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas. »; he moves it
   into a GM block, the warning disappears. Then « Fichier » ▸ « Ajouter depuis l'appareil »
   « tarifs-du-port.pdf »: the document enters the media library, player-visible, and attaches to the
   section; he saves.
4. Léa opens « Les Docks »: instead of the lair map image in « Histoire », she reads
   « Image réservée au MJ. ». She opens « Port-Sel » and downloads « tarifs-du-port.pdf » from
   the attachments of « Description ». Her **« Médiathèque »** (E-19) only shows player-visible
   files; for « Carte des Sphères », it only lists sheets she can read.
5. Antor deletes a duplicate image: the confirmation lists « Val-Fortin — « Description » »,
   « Maître Aldric — « Apparence » (jointe) » and « Port-Sel (illustration) ». He first replaces
   the illustration, then deletes the file.
*Highlight*: the same file, used in three sheets, changes permissions in one action, and Kanevas
states exactly where players lose it.
*Failure*: an empty file — « « notes.txt » est vide. », nothing is added; interrupted upload —
« L'envoi n'a pas abouti. », nothing is added or attached; an illustration that is not an image —
« « regles.pdf » n'est pas une image. »; a player forces the address of a GM-only file — « Page
introuvable. ».

### P-17 — Enable and configure a system's tools (Antor, GM owning the « SWN » system, then the « Éneria » universe)
*Antor has created the « Stars Without Number révisé » system; he wants the map and designer for
Éneria, with his house rules.*
1. System page (**E-15**), « Outils » tab (**E-20**): the galaxy map and ship designer
   are listed as « Désactivé ». He enables both. Visibility: designer « MJ et
   joueurs », map « MJ et joueurs ».
2. He sets the system's base settings (jump range: 1 hex), then imports a **catalogue**: « Importer un catalogue », JSON file; the preview says « 11 ajoutés,
   0 modifié, 1 refusé : arme « laser-lourd », champ `masse` : nombre attendu »; he confirms.
3. Settings of « Éneria » (**E-14**), « Outils » tab: both tools follow the system; he overrides the
   designer to « Activé », sets « Charges de carburant » to « Non » (house rule) and adds Orak'Ziel
   crystals (a new element) to the universe catalogue by importing a file.
   *(Detail from `kanevas-outils-catalogue`.)* The two imports are the same dialog on two tabs: step 2 on
   the system's tab of E-15 (the preview counts elements — « 11 ajoutés, 0 modifié, 1 refusé » for
   a file of 12; the numbers above are an illustration), step 3 on the universe's tab of E-14,
   whose preview adds « dont N remplacent un élément du système ». Still on E-14, « Voir les éléments »
   lets him **hide** the Orak'Ziel weapon from the players until the session, **withdraw** a system hull
   the campaign does not use, and bring it back (B-62). For his conversion script he creates, on E-18, a
   token whose scope is the designer alone (B-65, P-20); the script's import comes back as a batch named
   after the tool.
4. On the galaxy (E-21), he changes the seed: confirmation says « Tous les systèmes non définis changent de
   place ; les systèmes définis et promus ne bougent pas. ».
*Highlight*: the « Outils » tab shows « Système · 1 » then « Univers · 2 » for each setting: the value's
origin is readable.
*Failure*: he enables a tool depending on a disabled one — « <Outil> demande <autre outil> : activez-le
d'abord. » (no SWN tool has dependencies: the text is exercised with the trial module); Mira, GM of another universe using the system,
sees tools and values but neither « Activer » nor « Importer » at system level (hidden, read-only);
unreadable catalogue file — « Ce fichier n'est pas un catalogue valide. »; a tool token refused (revoked, expired, out of scope) — 401 `jeton_invalide`, no batch opened; a refused element in a tool batch — counted « 1 refusé » in the batch of E-18; connection lost
during application — nothing is partially applied.

### P-18 — Explore the galaxy, then maintain it (Léa, Player, on a phone; Antor, GM, at a desk)
*Wednesday evening, Léa prepares her ship's next jump; on Sunday, Antor adds a system before the
session.*
1. Léa: **Maps** (**E-10**), « Galaxie d'Éneria » (« Galaxie d'essai » in the stub seed) ▸ **E-21**; a shared link to a system opens the same map centred on it, or « Page introuvable. » if she cannot read it. The map opens on systems she
   may read (all non-secret ones); she drags, pinches, hovers over (on touch: presses) a system: name and distance from the departure system she
   set, else from the galaxy's default reference (the first system the GM defined).
2. She chooses departure and arrival: « Port-Sel » → « Vael », and engine (2). The path along public
   routes appears with its duration (« 7 cases · 4,5 jours »).
3. She copies the « Vael » link (stable address); the assistant, on request, calculates the same path.
4. Antor (E-21, GM mode; the galaxy was created from E-10 « Nouvelle carte » ▸ « Carte de la galaxie », not visible until he makes it so): he **places** a system in an anonymous hex (promotes it: name, notes, size,
   colour), **draws** a route to « Vael » (exact length) and types it « Pirate » (the type is optional), **draws** a territory marked secret, then
   switches to **Player mode**: the ghost system, private route and territory no longer exist.
   From the « Galaxie ▾ » menu he also renames the galaxy, makes it visible (« Rendre visible »; he can hide it again),
   changes its **seed** (« Graine… »: the undefined systems move, those he placed or promoted stay) and, apart,
   « Supprimer la galaxie… » (the dialog counts what will be erased).
   Léa, reloading the map at the next step, reads « Pirate » on the route while it is public; once Antor makes it private, she reads nothing of it.
5. « Document MJ… »: he chooses the « Galaxie — notes MJ » sheet (or creates one); the tool writes the managed « Document MJ » section there, GM-only. When he later places a system, the tool files an update **proposal** (« Proposition en attente »); the section changes only when he applies it, never on its own.
*Highlight*: the same journey, seen by Léa then Antor, does not follow the same route: the smuggling
route does not exist for her.
*Failure*: a type of 41 characters — « Le type de lien fait 1 à 40 caractères. » under the field, nothing sent; Léa searches for « Station fantôme » — no result, never « masqué »; a write refused while Antor's form is open (role lost, tool disabled) — the form keeps his input and says « Action refusée. »; he abandons the document proposal — « Proposer la mise à jour » comes back; Antor saves a system from a
stale version (modified meanwhile by the other GM) — « Ce système a changé depuis que vous l'avez ouvert. »
and « Recharger »; connection lost — the map keeps the displayed view, writing actions are disabled;
the density of generated systems never changes based on a territory she cannot see.

### P-19 — Design a ship (Antor, GM; Léa, Player, section author)
*Léa wants the « Vent d'Orak »; Antor creates its sheet and entrusts her with the design.*
1. Antor creates the **« Vaisseau »** sheet « Vent d'Orak » (E-8/E-9): free sections « Histoire » and « Notes MJ »;
   in **E-22**, « Nouvelle conception » on that sheet, hull chosen; the « Caractéristiques » section
   is created, managed by the designer, and he makes **Léa** its author.
2. Léa opens the **designer** from the sheet (the banner link) or the « Outils » bar, where she first sees the
   **list** of the designs she may read (E-22), then opens « Vent d'Orak »: she chooses an engine, a hold, a laser
   and a test lance; free power and mass, price, HP and AC recalculate with each choice; she adds a second test
   lance, a blocking alert appears (« Puissance insuffisante : −2 »), then disappears when she removes it. When the catalogue states the rules of the hull (`kanevas-outils-format-vaisseaux-fiches`, B-82), she also sets the **crew** (prefilled with the hull's minimum), reads the speed and the armour in the results, and sees that a fitting of too low a class for her hull raises the blocking alert « classe de coque 3 au moins » while a crew of 5 on a hull needing 6 only raises a watch alert and does not stop the save. A test
   element of mass 0,5 taken three times lowers the free mass by 1,5 (a hull of mass 7 reads « 5,5 »); a half unit too many reads « Masse insuffisante : −0,5 ». When the catalogue carries modifications at a percentage of the hull (`kanevas-outils-format-vaisseaux-effets`, B-83), she chooses a test modification at 10 %, reads « Ligne : 30 000 cr » and the armour change, sets the **points exchanged** between power and mass within the modification's maximum, picks the **target element** of a doubling, enters her **repair skill**, and reads the watch alert « réparation 2 au moins (1 choisie) » that does not stop the save, while a doubling with no target raises a blocking alert. When the catalogue states the gaps of B-85 (`kanevas-outils-format-vaisseaux-ecarts`), a defence with a negative speed bonus lowers the speed she reads by exactly that number, a modification that changes armour and also asks for a repair skill applies its armour and raises the watch alert at the bound, a cargo stated per class reads the cargo of the chosen hull's class, and the system engine reads its 10 % reduction in the line's cost.
3. She saves: the sheet (**E-9**) shows « Caractéristiques » under the « Générée par le concepteur de
   vaisseaux » banner linking to the tool; Léa cannot manually edit the text.
4. Later, Antor changes the jump range of the universe setting (or imports a catalogue of the universe): the design is
   « Calculée avec d'anciens réglages » on E-22 and on E-9, and its text has not moved. Léa opens it: the workshop shows the
   result **stored** in the section, the banner and « Recalculer ». She confirms: the text and the figures take the new
   calculation together. Until she does, nothing is rewritten; Roxane, who only reads, sees the banner and no button. An
   « Enregistrer » after an edit also brings the design up to date, and the banner says so.
5. Antor chooses « Générer les fiches de règles… » in E-22: seven sheets of type Règle appear (one per kind of element,
   « Règles — Armes », « Règles — Moteurs »…, and « Exemples de vaisseaux », the examples of the catalogue replayed
   through the same calculation), each with one managed section, readable and uneditable. Run again, it updates without a
   duplicate. Antor then masks an element, or reimports the universe catalogue with a changed weapon: the sheets he
   concerns **propose** their update (E-9, E-12), which he accepts or ignores; their text changes only on his agreement.
   Players read these sheets with what *they* may see: a masked element is absent, and so is any example that uses it.
   In the first slice, Léa shares the ship link with Roxane, a player
   who has no design of her own on it: Roxane reads « Étoile du soir » (Léa's second design, on a hull of the system, which she may read) read-only, with « Enregistrer » and « Annuler »
   absent, and « Vent d'Orak » is « Page introuvable. » for her (not hers to read).
*Highlight*: budgets recalculate before their eyes, and the sheet's section stays consistent with what
is calculated.
*Failure*: a recalculation that fails — « Le recalcul n'a pas abouti. Réessayez. », the text unchanged; the usage removed meanwhile — « Vous ne pouvez plus recalculer cette section. »; connection lost — « Connexion perdue. », the buttons disabled. Antor disables the designer — the sheet shows « Caractéristiques » as text with « Outil
désactivé », without editing; Roxane opens Léa's « Vent d'Orak », which she cannot read — « Page introuvable. »;
two concurrent writes — the second refused with « Recharger »; calculating an invalid design —
blocking alerts (a doubling with no target, a second system engine), « Enregistrer » refuses and explains why; Antor withdraws the hull of « Étoile du soir » from the universe or masks « Lance d'essai » — the design keeps its text, the line says « Élément retiré de cet univers » and « Enregistrer » stays disabled (withdrawn), or Léa still sees the masked element on her design but does not find it in her choices; on a phone, the catalogue is browsed in one column.

### P-20 — Migrate Éneria's current tools (Monsieur, Saturday, Mac and private repository)
*Current files (map, ships) remain usable; Monsieur wants to switch over.*
1. In `AntorFr/eneria` (private), a script converts files to the module format (`_outils/kanevas/`
   folder); converted output and reference values are versioned alongside.
2. With an API token scoped to « galaxie » then « vaisseaux » (**E-18**), he pushes batches; **E-18**
   shows created, updated, refused, each refusal with its field.
3. He replays: no duplicates. Tests on real data (every route and every example ship of the sources) run **in
   pods**, which read `eneria`; `kanevas` CI remains synthetic (Monsieur's decision, 2026-10-16).
*Failure*: malformed element — refused with its field, the rest goes through; a token lacking the tool's scope —
refused (401/403 depending on the import API) and nothing written.

### P-21 — Remove a tool (Antor, GM, at a desk)
1. **E-20** of « Éneria »: he disables the designer. Ship sheets show « Caractéristiques » as
   text with « Outil désactivé »; the bar entry and tool addresses disappear for everyone.
2. Later he re-enables it: everything is there. Or « Supprimer les données de l'outil… »: the dialog says « 14
   conceptions, 3 éléments locaux de catalogue seront effacés »; at system level, it adds universes
   still using them.
*Failure*: a GM who is not the system owner does not see system data deletion.

### From properties to sheets and links (`kanevas-fiches-liees`)

> *Decisions of Monsieur, 2026-10-25: a relation carries a **nature** from a finite list of the
> product, whose meaning Kanevas knows, and a free **qualifier**; the search and the sheets use
> the nature; a « Famille » type; an alive-or-dead mark on characters and creatures. Kanka was
> read for reference (connections in free text with a mirrored `two_way`, organisation members
> apart with a free `role`, a list of locations on a character): one mechanism here instead of
> three. No migration of the existing free relations: Monsieur redoes the import.*

- **B-63** — A relation carries two things: a **nature**, chosen in the product's list, specific
  to the pair (type of the source sheet, type of the target sheet) and whose meaning Kanevas knows
  in both directions — « se situe à » read from the place as « s'y trouvent », « membre de » read
  from the organisation as « membres » —, or no nature (a free relation, as today); and an optional
  free **qualifier** (« habite », « capitaine », « en exil ») that says more and decides nothing.
  The GM picks the nature when he links (E-9); the list offered is the one of the two types. A
  relation keeps its section, its audience and the two guards of AD-64. *(P-3, P-17)*
- **B-64** — From the sheet of a place, an organisation, a family — any sheet that natures can
  target —, the GM and the players see the **linked sheets**, grouped by nature read backwards
  and by type (« S'y trouvent : Personnages (12), Créatures (3) », « Membres : Personnages (8) »),
  each as a card line with its qualifier; on a place, « sous-lieux compris » adds what is linked to
  its descendants in the tree, saying from which sub-place; a reader sees only the relations he
  reads (the section and the source sheet, AD-64). *(P-17, P-6)*
- **B-65** — The **advanced search** (E-17) finds the sheets linked to a given sheet by a given
  nature (or by any relation), « sous-lieux compris » when that sheet is a place, combined with the
  type, the label, the words and — for the seven types that can be gone — the state filter (« vivants / morts », « intacts / détruits »…); the result
  is the list of E-17, under the same rights. *(P-17)*
- **B-66** — « **Famille** » is a type of the product's list (reglable, activated by default,
  icon `users`): a family is a sheet like a faction, members are characters linked to it by the
  nature « membre de ». *(P-17)*
- **B-67** — A sheet can be **gone**: a character or a creature is **mort**, a faction
  **détruite**, a family **éteinte**, a place, an object or a vessel **détruit** (decision of
  Monsieur, 2026-10-25 : one mark, a word per type). The GM sets it in place from the header of E-9
  (« Marquer mort » / « Marquer détruite » … and the reverse), it shows by a sober mark on the image
  of the card (E-8, E-17, the linked-sheet lines, the relation lines) and a badge with the type's
  word in the header, visible to whoever sees the sheet, with a filter per list (« Vivants / Morts /
  Tous » on characters and creatures, « Intacts / Détruits / Tous » on places, objects and
  vessels, « Actives / Détruites / Tous » on factions, « Vivantes / Éteintes / Tous » on families).
  No date, no cause: the text says the rest. *(P-17, P-6)*
- **B-68** — The **import API** pushes the nature and the qualifier of a relation, the « gone » mark
  (`disparu`) of a sheet of a type that carries it, and families, with the protection of B-48; the former free `type` of
  a relation is the qualifier. *(P-10)*
- **B-69** — The graph (E-11) and « Mentionnée dans » (E-9) read the nature where there is one:
  the link of a graph shows the nature's label, the qualifier after it; « Mentionnée dans » keeps
  the free relations and the links, the natured ones move to « Fiches liées » (B-64). *(P-6)*

### P-17 — Prepare a scene in a district (Antor, GM, Friday evening, office)

1. **Place** (E-9): he opens « Port-Sel ». The **« Fiches liées »** block says « S'y trouvent :
   Personnages (12) » ; il coche **« sous-lieux compris »** : « Les Docks », « Le Pendu Joyeux »
   add theirs, each with its district in grey and its qualifier (« habite »,
   « tient la taverne »). He spots those he has not played in a long time.
2. **Advanced search** (E-17): « lié à Port-Sel », « s'y trouvent » (the nature « se situe à » read backwards), sub-places included, type
   Personnage, « Vivants »: the list of the port's living; he narrows it with the label
   « contrebande ».
3. **Fiche** (E-9) d'un contrebandier : il relie « membre de » → « La Guilde des Brumes »,
   qualifier « passeur »; on the Guilde's sheet, « Membres : Personnages (9) » counts him;
   the Guilde's leader is « membre de » there with the qualifier « dirige » (« dirige » is not a
   nature : décision de Monsieur).
   He creates the **family** « Les Corvalis » (E-8, type Famille, B-66) and links Bran and Dame
   Ombeline to it by « membre de » (« aîné », « veuve »); on the Corvalis sheet, « Membres :
   Personnages (2) ».
4. An NPC died at session 12: on its sheet, **« Marquer mort »**; its card carries the mark
   in the grid and in « S'y trouvent », and « Vivants » no longer lists it. In the grid of
   characters (E-8), the filter « Vivants / Morts / Tous » (kept in the address) lists the dead
   only; if he picked the wrong NPC, **« Marquer vivant »** undoes the gesture.
*Highlight*: step 1, the place that shows at a glance who is there, sub-places included.
*Failure*: if « Marquer mort » fails, the sheet stays as it was and a message says so (E-9); he links « se situe à » an **object**: the nature is not offered for this pair of
types, the form shows only the natures of the pair (or « sans nature »); a relation whose
section is closed to the players does not appear in « Fiches liées » for Léa, nor in her
search, nor in the count.

### The battle map (`kanevas-battlemap`)

> *Decisions of Monsieur, 2026-11-11 (triage): a dedicated tool of the tool registry (`kanevas-outils`);
> a Rust core compiled to WebAssembly, no separate service; the table first, then remote play; an image
> engine that makes **assets only** — a map is a composition, never one generated picture. Inspired by
> Dungeonfog, which Monsieur is not satisfied with: its principles (asset libraries, layered composition,
> a table display), done better. Ids B-96…B-110, P-26…P-29, E-25…E-30, AD-150…AD-165 are this epic's; the
> sibling epic `kanevas-carte-spatiale` holds B-86…B-95, P-22…P-25, E-23…E-24, AD-138…AD-149.*

- **B-96** — Each universe has an **asset library**: pictures of a **category** (object, vessel, scenery,
  floor texture, wall texture) that a map knows how to place. An asset carries a name, its category, its
  **footprint in cells** (width × height, whole cells; a floor or wall texture has none), whether it is
  **seen from above** (an asset that is not top-down is flagged and still usable), free tags, and is a file of the media
  library (B-54), so it keeps its visibility rule. The GM and the players read the library (a player sees
  the assets the GM left visible); only the GM writes it. *(P-26)*
- **B-97** — The GM **adds assets by hand**: dropping images in the library (several at once, each
  named from its file and given the category chosen for the drop), picking images already in the media
  library, then correcting any property one by one or by selection. Removing an asset used by maps first
  says on how many maps it is placed. *(P-26)*
- **B-98** — Each universe has an **art direction**: a text (Markdown, the style, palette, mood, what to avoid) and
  **reference images** (media-library files). The GM edits it by hand; the assistant can propose and write it on
  request, the previous text being kept one step for « Annuler ». Players do not see it: its reference images and the draft files are GM-only files of the library. *(P-26)*
- **B-99** — **Optional — batch generation**: the GM lists the assets he wants (a name, a category, a
  footprint, an optional hint each; or asks the assistant to draft the list from a theme), starts a **batch**
  and the image engine makes them one after the other, each prompt built from the art direction. Each result
  lands in the library as a **draft** to accept, regenerate with a remark, or discard; nothing enters a map
  before it is accepted. The batch shows its progress, the GM can **stop** it (the lines still waiting or interrupted are discarded), and it survives a restart: the line that was running and the lines still waiting are marked *interrupted* and the GM resumes them with one click, never silently. Without an image engine the
  entry is absent and everything else works with a library filled by hand. *(P-26)*
- **B-100** — The assistant has **dedicated skills** for the tool (writing an art direction, briefing an
  asset batch, composing a map from the library): instruction documents shipped with the tool, which it loads
  on demand, so that an agent that knows nothing of battle maps does the work in the universe's style. *(P-26, P-27)*
- **B-101** — The GM **composes a map**: a grid (size in cells, cell size in pixels of the reference raster, 70 by default; both editable later, a reduction refused while elements lie outside the new limits), **floors**
  painted by texture, **walls** drawn along the cell edges (with doors as a wall variant: a door is a drawn passage that stays a limit for a room and has no open / closed state), **assets placed**
  anywhere on the grid (snapped to the grid or free, a switch of the editor, rotated by quarter turns, mirrored, scaled), organised in **layers**
  (floor, walls, objects, plus layers the GM creates, renames, orders and deletes, each of a type floor, wall or object). The map is saved as the GM works. *(P-27)*
- **B-102** — The editor has the comforts of a real tool: select several elements and move, duplicate (copy / paste), delete them;
  **undo and redo** (this session); a layer can be hidden, locked, or made **GM-only** (its content never
  reaches a player); zoom and pan; a search in the library from the editor. *(P-27)*
- **B-103** — The **assistant composes a map** from the library on request (« une taverne de 20×14 cases,
  deux salles, une cave »): it uses only assets of the library, creates the map, and the GM opens it in the
  editor and retouches it by hand. A request that needs an asset the library lacks says which one. *(P-27)*
- **B-104** — A composed map is **one of the universe's maps** (E-10, with its visibility); an **element** of the document (E-28) or a **token** of the table (E-29) can
  be linked to a **sheet** of the universe; from the map, a reader opens it under the usual reading rules (AD-64), in the GM's
  and the players' play screen (E-29) — not on the table display (E-30), which has no control. *(P-27, P-3)*
- **B-105** — **At the table**: the GM opens the map in play mode and a **display for the players**
  (a second screen — a TV, a tablet — opened on the same account type, chrome-less) shows it, **driven by the GM**: he
  chooses what part of the map is shown (zoom and position) and which layers (a layer menu of the play screen). The table account is any member account of the universe (a player member left logged in on the TV, or the GM in a second window): the display always shows the player view. *(P-28)*
- **B-106** — **Tokens**: the GM puts tokens on the map (from a character or creature sheet, an asset of the library or
  a plain disc with a name; « Ajouter un pion » in the play screen), moves them, shows or hides them, removes them, links a sheet to one. Each token may belong to a player. *(P-28)*
- **B-107** — **Fog of war**: the map starts hidden to the players; the GM **reveals** areas by hand (painting
  cells, revealing a rectangle or a whole **room**: the area enclosed by the walls and doors around a clicked cell), and can hide them again. What is hidden is never sent to a
  player's device. *(P-28)*
- **B-108** — **Remote play**: each player opens the map on his own device and **moves his own token**;
  every screen — GM, table display, other players — updates within a second or two, with no reload. A player moves
  only tokens that belong to him. Where the GM has switched remote play off (E-20), the players still follow live but only the GM moves tokens. *(P-29)*
- **B-109** — The state of a table (tokens, fog, view) is **kept between sessions**: the GM resumes the map where
  he left it, and can reset it. A lost connection never loses the state and the screen says so. *(P-28, P-29)*
- **B-110** — The tool follows the registry: the GM enables it per universe (E-20), sets who sees it (hiding the library from a role hides its entry and panel, not the maps, which stay readable by whoever sees them), the assistant tools
  disappear when it is disabled, and « Supprimer les données de l'outil… » counts what it will erase. *(P-26, P-21)*

### P-26 — Fill a library in the universe's style (Antor, GM, Sunday evening, office)
*« Éneria » is dark science-fiction, painted, worn metal; he wants a library for his ship interiors.*
1. **E-26**: he writes the art direction (or asks the assistant, which proposes a text from the universe's sheets, he
   corrects it) and adds three reference images from the media library.
2. **E-25**: he drops fifteen images he already owns (Dungeonfog assets he bought, if any): each lands with the category
   of the drop, he fixes footprints in a selection (« 2×1 » for the bunks).
3. For what is missing he opens **E-27**: twelve lines (« Couchette », « Console de commande »…), « Lancer » — twelve drafts
   arrive one by one, each shown on a neutral grid; he accepts nine, regenerates two with a remark (« plus usé »), discards one.
4. The next day the assistant, asked for « dix décors de station abandonnée », drafts the list through the dedicated skill; he
   starts the batch from E-27.
5. Léa (player) opens **E-25** and finds the assets Antor left visible; nothing to write, no art direction. If the library loads badly she reads « Impossible de charger la bibliothèque. » and « Réessayer »; if it is empty, « La bibliothèque est vide. ».
*Highlight*: step 3, the drafts that appear one by one in his style.
*Failure*: no image engine — the generation entry is absent, steps 1 and 2 stand; one asset fails — its line says « Échec »
with « Réessayer », the others go on; the batch is interrupted by a restart — the running line is marked
« Interrompu » and « Reprendre » restarts it; a file that is not an image — refused with its name; removing an asset says on how many maps it is placed; the art direction was changed elsewhere — « Ce texte a changé… » and « Recharger »; a ninth reference — refused; the library holds 5 000 assets — « Bibliothèque pleine ».

### P-27 — Compose a map (Antor, GM; the assistant)
1. In **E-10** he chooses « Nouvelle carte » ▸ « Carte composée » (the tool enabled): the dialog asks a name and a size (30 × 20 cells); **E-28** opens.
2. He paints a floor, draws the walls of two rooms with a door, drops consoles and bunks from the library panel, puts the
   consoles on an « Objets » layer, a hidden trap room on a GM-only layer; he undoes a wrong wall.
3. Another map: in the assistant (E-12) « Compose une cantine de 20×14 avec une cuisine et une réserve » — the assistant
   answers with a link; **E-28** shows the map, he moves two tables and replaces a floor.
4. On the console **element** (E-28, Properties) he links the sheet « Terminal de la passerelle »; at the table a player will open it from the map (E-29). A token is linked in E-29.
*Highlight*: step 3, the assistant's map that he keeps by hand.
*Failure*: the library lacks a kitchen asset — the answer names it and builds the rest; two writes at once — the second says
« Cette carte a changé » and « Recharger »; the map is full (limits of AD-163) — « Carte pleine »; an asset removed meanwhile — a
placeholder « Asset retiré » for the GM, absent for players. Removed assets are counted on confirmation (« Utilisé sur 3 cartes »).

### P-28 — Play at the table (Antor, GM; the table display; Léa and Roxane at the table)
1. **E-29**: he opens the map in play mode; on the TV, **E-30** (opened once on a member account of the universe, the table account) shows « En attente du MJ ».
2. He shows the map: the display follows his zoom and the layers he chose; the fog hides everything but the entrance; with « Ajouter un pion » he places three tokens (Léa's
   Mira from her sheet, Roxane's Vox, a guard as a plain disc), gives two of them their owner.
3. The party opens the door: he reveals the room by painting it; the guard token is shown; he moves it.
4. At the break he leaves; the next Saturday he reopens the map: tokens and fog are as he left them.
*Highlight*: step 3, the room that appears on the TV.
*Failure*: the display is closed — the GM sees « Aucun écran joueur connecté » (not an error); connection lost — the GM's
screen keeps the map, actions disabled, « Connexion perdue. », and the state resumes on reconnection.

### P-29 — Play remotely (Antor, GM; Léa and Roxane, each at home)
1. Each player opens the map (E-29, player mode) on her phone or computer; she sees what has been revealed and her token.
2. Léa drags Mira: Roxane and Antor see it move; Léa cannot move the guard.
3. Antor reveals the corridor: both screens uncover it; he scrolls the shared view and chooses « Suivre le MJ » or not (per
   player, kept in her browser).
4. Roxane loses her connection: her screen says so and rejoins by itself, with the current state.
*Failure*: a player moves a token that is not hers — refused, the token goes back, « Ce pion n'est pas à vous. »; a stale
version — silently refetched; the GM hides the map (E-10) — « Page introuvable. » for the players.

## Out of scope

- **Tools in `kanevas-outils`** *(Monsieur's decisions, 2026-10-15 and 16)*: the **faction turn manager** (epic `kanevas-factions`, with
  per-turn faction overlays on the map), the **shared journal and dice** (next epic), **printing** (a core feature, later),
  user **JSON export or import of a design**, **podcasts**, **offline maps**, **hot-loading** third-party code, a
  **generic tool engine**, and the **campaign link** (timeline, public part) deferred to faction turns. A player does not create a sheet
  (existing rule): the GM creates the ship sheet, the player designs as the section author.
- *(kanevas-taille-images)* **A free size in pixels, cropping, a caption and a gallery** for the images of a
  text: three standard sizes and three placements cover the need; reopened if a GM asks for more.
- **Live play**: no initiative or animated combat; the table remains physical. *(Amended by
  `kanevas-battlemap`: a hand-driven fog of war and a table display are now in, B-105…B-108.)*
- *(kanevas-scenarios)* **A calendar of sessions** (dates, who was there) and a **play log per
  scenario** (« joué le 12 octobre avec Léa et Mira ») — the status says where an adventure
  stands, not when; reopened if the GM asks for the history of a campaign.
- *(kanevas-fiches-liees)* **The attitude of a relation** (Kanka: −100..+100 and a colour), the
  **hierarchical superior** of a member and the **pin** of a relation; the **status** of a
  membership (current, former) goes through the qualifier or the removal of the link — decisions of
  Monsieur of 25/10; **a date or cause of death**: the text; an assistant tool that
  links or searches by link; two-way relations created in mirror (the reverse direction is read, it
  is not stored).
- *(kanevas-scenarios)* **Status automation** — no status moves by itself (a CR written, a date
  passed): the GM sets it.
- **Structured characteristics** (combat sheet, statistics): an attachment in V1; dedicated
  sheet types later.
- **Deleting** a campaign, scenario, report, map, task, system: none of these can be deleted, except an
  attachment, section, relation, member, and a map token or node
  (removed from the map; its sheet remains). *(scoping choice, to revisit with use)*
  Since `kanevas-scenarios`, a campaign and a scenario are sheets: they are deleted like them (B-40, E-9), the confirmation
  counting their tasks, their scenarios and their reports (AD-119); disabling the « Aventure » type (E-14, P-13) hides no
  adventure, only the sidebar entry and creation disappear.
  Since `kanevas-import`, a **sheet**, **universe** and **media library file** can be deleted (B-40, B-41, B-54); a report, being
  a sheet, is deleted with the universe and, by a GM, as a sheet.
- **Creating a sheet as a player**: the GM creates every sheet, including a PC's, and opens a
  section to its player.
- **Inviting an account that has never signed in**, invitation link.
- ~~Search across all types at once~~: enters the product with `kanevas-import` (B-37, E-17).
- **Reading a Kanka export**: Kanevas does not know the Kanka format. The script reading it lives on
  Monsieur's Mac, outside the product and its repositories; Kanevas offers a generic import API (B-47,
  AD-104) that any script can consume. *(Monsieur's decision, 2026-10-11)*
- **User-created sheet types**: the list belongs to the product, extended by a
  release (B-42). *(Monsieur's decision, 2026-10-11)*
- **Choosing types per campaign**: the choice lives at system and universe level. *(Monsieur's decision,
  2026-10-11)*
- **Structured creatures and ships** (characteristics in fields per system): another epic;
  here, their imported sheets are Markdown sections, including tables. *(Monsieur's decision of 2026-10-11)*
- **Maps in the import API**: another, “more advanced” epic; here, a Kanka map is imported
  as an ordinary sheet with its image. *(Monsieur's decision of 2026-10-11)*
- **Timeline as a separate type** (a visual timeline): a more advanced epic, like maps; here, a
  timeline is a « Savoir » sheet. *(Monsieur's decision of 2026-10-11)*
- **Per-player secret blocks** in text: the GM block has a single audience, the GM; a secret
  for one player remains an authored section (AD-19).
- **Import history, undoing a batch**: a batch can be replayed, not undone; delete
  the trial universe.
- **Export to Kanka or another tool**: untriaged.
- **Calendar or timeline, dice roller, offline use (PWA)**: untriaged.
  Since `kanevas-icones` (AD-135), Kanevas is installable (manifest, icons) but ships **no service worker and no offline cache**: the installed app needs the network, and offline use stays untriaged.
- **Edit history, export, public sharing.**

- *(kanevas-battlemap)* **A whole map generated as one image**: the image engine makes assets only (Monsieur, 2026-11-11);
  **door states (open / closed) and doors that block sight**; **importing Dungeonfog maps** (Monsieur has none; their assets enter the library like any dropped image); **automatic
  fog** (line of sight, light sources, dynamic lighting): the GM reveals by hand; **initiative, dice, combat rules,
  measuring and automatic movement ranges**; **maps larger than 200 × 200 cells**; **animated assets and sound**; **exporting
  or printing** a composed map (the print feature, later); **cross-universe or cross-account libraries**; **voice or video**.

## Cross-check of the `kanevas-import` scoping

Done on 2026-10-11 on the proposal (`cadrage` skill, step 6), repeated after review 1, then
after Monsieur's decisions of 2026-10-11 (Knowledge, subtype, media library, no tombstone,
maps outside the API, assistant token included), and after AD-111 (all files in the media library).

| Cross-check | Result |
|---|---|
| Each need has a journey | B-32 P-12, P-14 · B-33 P-12, P-14 · B-34 P-12, P-14 · B-35 P-12, P-14 · B-36 P-12 · B-37 P-12 · B-38 P-12, P-14 · B-39 P-14 · B-40 P-14 · B-41 P-10 · B-42 P-13, P-10 · B-43 P-10, P-14 · B-44 P-12, P-16 · B-45 P-11, P-10 · B-46 P-11 · B-47 P-10 · B-48 P-10, P-14 · B-49 P-10 · B-50 P-10 · B-51 P-15 · B-52 P-12, P-14 · B-53 P-16, P-10 · B-54 P-16 · B-55 P-16 · B-56 P-10 — **holds**. |
| Each human action in a journey has a screen | P-10: E-1, E-2, E-14, E-18, E-8, E-9, E-17, E-13, E-19; step 4 is not an action in Kanevas (the script, outside the product, Monsieur's decision), its result is read on E-18 and E-19 · P-11: E-18 · P-12: E-8, E-9, E-17, E-12 · P-13: E-15, E-14, bar · P-14: E-9 · P-15: E-5 · P-16: E-19, E-9 — **holds**. |
| Each screen has its data | E-17: sheets, aliases, labels, subtype, index (title, aliases, subtype, `contenu_public`) · E-18: API tokens, import batches · E-14 / E-15: type settings · E-9: links, parent, subtype, aliases, labels, origin key, file references (text, attachments), illustration (an image file) · E-8: subtype, illustration · E-19: files (images and documents), file references, illustrations · E-13: `cree_le` (original date) · E-5: a volume file, not an entity (B-51) — **holds**. |
| Each entity serves a journey | link P-12, P-14 · alias and label P-12, P-14 · type setting P-13 · API token P-11 · import batch P-10 · file and file reference P-16, P-12, P-10, P-7 (the player uploading a portrait takes the first addition path) — **holds**. |
| Gaps filled by a written choice | import has no trigger screen (the script): Monsieur's decision; “empty a trial universe” replaced by “delete the universe” (AD-105); a deleted sheet returns on replay if the export sends it (Monsieur's decision); maps outside the API, a Kanka map is a sheet (Monsieur's decision); E-17 gets the mode switch; scenario and system entry links resolved (AD-97); the assistant-generated image enters the media library (AD-44 amended); setting an illustration goes through the two addition paths (E-9); attachments and media library: all files in the media library (AD-111, Monsieur's decision), both addition paths explicit on E-9 and E-19. No `[TO DECIDE]` remains. |

## Cross-check of the `kanevas-outils` scoping

Done on 2026-10-16 on the proposal (`cadrage` skill, step 6).

| Cross-check | Result |
|---|---|
| Each need has a journey | B-57 P-17 · B-58 P-17, P-21 · B-59 P-17, P-18 · B-60 P-17 · B-61 P-17 · B-62 P-17, P-19 · B-63 P-21 · B-64 P-18, P-19 · B-65 P-20 · B-66 P-19 · B-67 P-19 · B-68 P-18, P-19 · B-69 P-18, P-19 · B-70 P-18, P-19 · B-71 P-18 · B-72 P-18 · B-73 P-18 · B-74 P-18 · B-75 P-19 · B-76 P-19 · B-77 P-19 · B-78 P-18, P-19, P-20 · B-79 P-20 · B-80 P-19, P-20 · B-81 P-18, P-20 · B-82 P-19, P-20 · B-83 P-19, P-20 · B-84 P-18, P-20 · B-85 P-19, P-20 — **holds**. |
| Each human action in a journey has a screen | P-17: E-15, E-20, E-14 · P-18: E-10, E-21, E-9 (GM document) · P-19: E-8/E-9, E-22 · P-20: the script (outside the product, like Kanka import); its result is read on E-18; real tests are in the private repository · P-21: E-20 — **holds**, with one action without a screen: conversion and replay (Monsieur's decision). |
| Each screen has its data | E-20: `outils_systeme`, `outils_univers`, owner, catalogues (version, counts) · E-21: `swn_systemes`, `swn_routes`, `swn_zones`, generated blocks (not stored), seed · E-22: `swn_conceptions`, catalogues, `sections.gere_par` · E-9: `gere_par`, `source_version` — **holds**. |
| Each entity serves a journey | tool setting P-17, P-21 · owner P-17 · managed section P-19 · token scope P-20 · catalogues P-17, P-19 · placed systems, routes, zones P-18 · design P-19 — **holds**. |
| Gaps filled by a written choice | one `swn` module with two tools (AD-121); the galaxy map is a module table (`swn_galaxies`) that E-10 adds to its list, `cartes` does not change (AD-122); owner of a system created before the epic: any attached GM, since the creator is not stored; no real dependency between the two tools (the mechanism is exercised with a trial module); the GM document: a sheet chosen or created from E-21; a player sees all non-secret systems (no per-player “known systems”); the engine for a journey is chosen in the tool; who creates a ship (the GM creates the sheet, the player designs if they are its author: “a player does not create a sheet” rule retained); E-22 in two states (list, workshop); caching a block according to reading level ([TO VERIFY], AD-132). Tests on real data run in pods, never in CI (Monsieur's decision, 2026-10-16). |

## Cross-check of the `kanevas-battlemap` framing

- Each need has a journey: B-96, B-97, B-98, B-99, B-100 → P-26; B-101…B-104 → P-27; B-105…B-107, B-109 → P-28; B-108, B-109 → P-29; B-110 → P-21 (tool removal), P-26.
- Each human gesture has a screen: library E-25; art direction E-26; batch E-27; editor E-28; GM play E-29 (and player play); table display E-30; the creation entry is E-10; tool enabling is E-20; the assistant (B-98, B-100, B-103) is E-12.
- Each role has its column: GM everything; player reads the library, plays the tokens that are his (E-29 player mode) and reads E-30; the instance admin and a non-member see nothing.
