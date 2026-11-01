# kanevas

RPG management system (lore, campaigns, session reports, permissions, maps).
This repository provides the foundation (health, OIDC, image, CI) and the **first business feature**:
a GM creates a universe, gathers its players and writes sheets whose sections each have
their own audience; a player reads only what that audience allows. What the product enables and
through which screens: `docs/parcours.md`, `docs/ecrans.md`, `docs/donnees.md`. Abbreviations: S-n = a decision of the managed-sections slice (« Detail of `kanevas-outils-sections-gerees` » in `ARCHITECTURE.md`), E-n = a screen (`docs/ecrans.md`), B-n = a need, P-n = a journey, AD-n = an architecture decision (`ARCHITECTURE.md`; `AD-121` is used twice there, the tools one is cited « AD-121 (module declaration) »), C-n = a decision of a slice's detail section (e.g. « Detail of `kanevas-outils-cadre` » in `ARCHITECTURE.md`); “bouchon” = stub mode (`KANEVAS_STUB=1`; the code, folders and recipes keep the French name), “Monsieur” = the stakeholder who performs acceptance checks, “tranche” = a delivered feature, “phase merge” = the merge after acceptance.

Beyond the first business feature, the repository includes the **game system**: a reference collection (rules, creatures, items) shared by several
universes and linked from the universe settings. It also includes **session tracking**: campaigns, scenarios (GM), preparation in five categories (GM) and session reports (any member). The universe's **media library** (E-19) stores each image or document as a row in `fichiers` with its own visibility (player-visible or GM-only), determined by where it is added; a section attaches it (up to 100) or embeds it in its text, and a sheet can use it as its illustration. It includes **instance administration**: an account in the Authelia `parents` group sees universes and their members (never their content) and repairs them (E-5, B-6). Each sheet can have an **illustration** (an image from the media library, set by the GM, in the E-8 card grid and E-9 header), and **game systems** have their screen outside universes (E-16, E-15). It also includes **relations** between sheets (the sheet's « Relations » block) and **search** across all sheet types, by alias and label (E-17), **maps** (E-10, E-11: illustrated map with background and tokens, or relation graph; visible to players or hidden; E-3's « Cartes visibles » block) and each member's **assistant** (E-12: a conversation panel that searches, reads, writes and, for the GM, creates a campaign or scenario and **proposes a section update** from a session report, written only by their « Appliquer » action, with exactly that person's permissions; model access uses the operator's Claude subscription, `CLAUDE_CODE_OAUTH_TOKEN` or, without redeployment, the token the instance admin sets from administration; in stub mode, a script responds). The GM can also request a **portrait**: the assistant generates an image and attaches it to the section, where it enters the media library (Codex engine using the operator's subscription; in stub mode, a fixed image).

## Structure

```txt
Dockerfile                        Single image: Fastify API + built frontend
scripts/faux-setup-token.mjs        The stub's `claude setup-token` (copied into the image)
scripts/controle-langue.mjs        `npm run controle-langue`: French words left and facts kept (reference commit in controle-langue.base)
scripts/tests-attestes.mjs           `npm run tests:attestes`: plays the whole suite on the committed tree (refuses a dirty tree, exit code 2) and writes `rapport-tests.json` (ignored by git, local to the run: an old red expires when the command is replayed)
src/
  server.ts, app.ts               Startup; assembly of plugins and routes
  config/env.ts                   Environment variables (zod)
  db/                             SQLite (better-sqlite3), migrations/0001 to 0019 (the numbers of 0017, 0018 and 0019 are provisional until their slices merge, AD-51; `rm -rf dist` after a renumbering), runner
  services/                       comptes, univers, membres, instance, fiches, sections, droits, systemes, relations, campagnes, scenarios, preparation, comptes_rendus, propositions, markdown (single renderer), liens (`liens` table, sole writer), etiquettes (aliases and labels, sole writer), mentions (“Mentioned in”), types, types-fiche (the list of types and their activation),
                                   fichiers (media library, sole writer of `fichiers*`, except that deleting a universe in `univers.ts` erases its rows), fichiers-lecture (read of the files a text or sheet references by key, waiting render), cartes, jetons, lots, import (token context), outils (tools framework), sections-gerees, catalogues (the two catalogue levels: resolution, preview and application, hide and withdraw; the only reader of a module's `StockageCatalogue`), import-catalogue (catalogue import by tool-scoped token), import-fiches (import API), import-suivi (campaigns and scenarios by origin key), import-relations (relations by origin key),  stockage (bytes on the volume)
                                   the only code that reads or writes the data; session, oidc
  routes/                         health, auth (OIDC), session (cookie, guard, /api/moi),
                                   bouchon, univers (+ membres), instance (admin, AD-87), systemes, suivi, cartes, fiches (+ sections), fichiers (E-19 media library, bytes, attachments, illustration), propositions, assistant, acces-api (E-18, session), import (token-based import API, `/api/import/v1`), frontend
  outils/                         Tools framework (AD-121 (module declaration)): `declaration.ts` (the single declaration of a module), `registre.ts` (modules registered; `essai`, the trial module, only under `KANEVAS_STUB=1` or in test); `services/outils.ts` resolves system → universe and enforces rights; `services/sections-gerees.ts` writes and recalculates the sections a tool manages (the only caller of the `ecrireContenu` lock); `routes/outils.ts` is the common API under `/api/univers/:id/outils/<module>/…` (catalogue routes included: table K-7 of `ARCHITECTURE.md`); front side `frontend/src/outils/` (registry, lazy code loading), tab "Outils" in `frontend/src/ecrans/outils/`
  bouchon/                        Demonstration world seeded at startup in stub mode (depart.ts), client-import.ts and echantillon/ (resume recipe) and its files (demo/)
  services/assistant/             The assistant: tool catalogues, AgentTransport port (stub, claude-agent), orchestration, token and its sign-in session
  services/images/                The assistant's image engine: GenerateurImage port, adapters stub, codex, none (AD-88, AD-90)
  services/llm/                   LLM transports taken from Antre-du-maitre, wired nowhere
docs/                             Retained design, as built: journeys, screens, data, charter; maquettes/ = HTML pages to open in a browser (e09-fiche.html is the charter's reference)
frontend/                         React + Vite: charter (ui/), screens (src/ecrans/, including E-5 administration.tsx), sidebar
.github/workflows/docker-publish.yml   CI: GHCR image on an attested tag (no test played); tests.yml: manual full suite
```

The sheet type list comes from the server; the frontend holds only the icon → component table, in `frontend/src/types-contexte.tsx` (where a new type's icon is added).
A screen is a `frontend/src/ecrans/<nom>.tsx` file registered by the registry
(`frontend/src/registre.ts`); frontend colours come only from `frontend/src/ui/tokens.css` (the sole exception is the stub banner on server-rendered pages, `src/routes/pages.ts`)
(`docs/charte.md`). The shell (`Cadre.tsx`, `Barre.tsx`: icon navigation, top bar, phone drawer,
avatar menu with theme and sign-out) and shared components (`frontend/src/ui/`: button, menu, toast,
dialog, switch, badge…) are common to all screens. Fonts (Fraunces, Newsreader, Inter,
`@fontsource`) and icons (`lucide-react`) are bundled, with no request to a third-party host (AD-92).

Docs: `npm run controle-langue -- --links README.md docs/*.md ARCHITECTURE.md` counts the French words left outside « … » quotations and code blocks (only nine function words, « le, la, les, des, est, pour, avec, une, dans », so a zero is not proof that no French is left) and the facts (B-n/P-n/E-n/AD-n, headings, code blocks, table rows) that differ from the reference, per `##` section. The reference is the frozen state of the docs before translation, named by `scripts/controle-langue.base` (one bare commit hash, which must exist in the clone): the check shows that the translation kept every fact, so a section, heading or table row added after that commit, as new text written in English is, shows up as a difference and is not a defect. Code (backtick) spans are counted like prose; external links are ignored, and a link already broken in the reference is not reported. For `docs/ecrans.md` the script also hard-codes the product changes made between the reference and the translation (`referenceSections`, `referenceAmendment`, `PRODUCT_EVOLUTION`): the script's comments and constants number the sections of the frozen reference, shifted by one after section 14, whereas the output and `--headings` number the current text (the shift starts at the section titled `kanevas-images`): always pick a `--sections` range from `--headings`, not from the script's comments. `--base <ref>` replaces it and `--sections <file>:<i>-<j>` limits the check to sections i to j (section 0 is what precedes the first `##`). The output is JSON: `files`, each with `file`, `french` (total), `facts` (`identifiers`, `headings`, `blocks`, `tableRows`) and `sections` (`number`, `title`, `french`, `words`, `facts`, `differences`; each difference has `fact`, `before` (the reference, or the expected value with `--expected`) and `after` (the current text, or the measured value); `differences` also sits at file level, and in each Release; with `--links`, `links` lists the relative links and anchors that no longer resolve (`section`, `link`). Without file arguments the script checks `README.md`, `docs/*.md` and `ARCHITECTURE.md` (run from the repository root); `--sections` adds its file. Exit code 0 = clean; 1 = something to fix (a French word left, a difference, or a broken link: check `french`, `differences` and `links`); 2 = invalid invocation or unavailable input (unknown ref, `gh` missing). Two other modes do not compare to the reference: `--headings <file>` lists the number and title of each `##` section (to pick a `--sections` range), and `--releases` checks the body of every published GitHub Release instead of files (it needs the `gh` CLI, authenticated, and network access; it takes no file, `--links`, `--headings` or `--base`). In that mode the output has `releases`, each with a `tag`, the `french` count and `counts` (`headings`, `bullets`, `links`, as numbers), and `--expected tag:headings=n,bullets=n,links=n` (only with `--releases`, repeatable) compares them with the counts noted before the edit. New text is written in English directly. Code-block contents (command comments, the tree above) are exempt from the count.

Tests without Docker: `npm run typecheck` then `npm test` (they also run e2e tests wherever Playwright is installed, which takes time: see “End-to-end tests”; a single file, e2e or otherwise (`src/db/migration-types.test.ts`: less than a second): `node --import tsx --test <fichier>.test.ts`, and never two suites at once, since e2e tests start their servers and fail en masse under concurrency; after renumbering a migration, `rm -rf dist` before `npm run build`, otherwise the old copied file stays in `dist/db/migrations` and the server no longer starts); the reference Docker path is in `CLAUDE.md`.

## Local startup

To **view the screens**, use the command under “Without Authelia: stub mode” below (`npm ci && npm run build && KANEVAS_STUB=1 npm start`). The block below only serves the API (`/healthz`). `npm run build` writes to the repository's `dist/`: after renumbering a migration, run `rm -rf dist` first.

```bash
# writes node_modules/ and ./data/ (database and session.key) into the mounted repository, as root; both are ignored by git.
# Without a prior `npm run build` (done on the host, outside this command), this route serves only the API: see below.
# To see the screens (E-5, `/administration`, included): same container, but `sh -c "npm ci && npm run build && KANEVAS_STUB=1 npm start"`
# (or, with Node ≥ 20 on the host, `npm ci` then the command of the “stub mode” section).
docker run --rm -p 3001:3001 -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
# then, from the host: curl http://localhost:3001/healthz
# (without KANEVAS_STUB=1 or the four OIDC_*, `/` leads to an OIDC sign-in that answers 404: no screen; to see them, start the stub mode above)
```

This block does not create a `.env`: defaults suffice for `/healthz`; OIDC
stays disabled (`/api/auth/oidc/login` returns 404). To enable it, create `.env` (see
`.env.example`) at the root: the `-v "$PWD":/src` mount makes it readable. This block also creates
`node_modules/` in the host repository (ignored by git); it belongs to root: remove it with
`docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim rm -rf node_modules` or `sudo rm -rf node_modules`.

Or, with Node 20+ installed locally (`engines`: `>=20`; the suite also passes on Node 22, CI runs Node 20):

```bash
npm install
cp .env.example .env
npm run dev            # or, without reload: npm run build && npm start (`npm start` alone fails without `dist/`, ignored by git)
curl http://localhost:3001/healthz   # -> "kanevas 0.0.0-dev"
```

The attested run is `npm run tests:attestes` (no test skipped). It plays two test files at a time at most (`--concurrence <n>` overrides), and the e2e harness lets only one server start at a time (`withStartupLock` in `src/e2e/harnais.test.ts`; the script gives each run its own lock file through `KANEVAS_E2E_STARTUP_LOCK`, so an interrupted run blocks nothing). A starting server is awaited on `/healthz`, never a fixed delay. The script refuses a dirty tree (exit 2): commit first.

This block serves `/healthz` and the API only; to log in and see the screens, use the stub-mode command under “Without Authelia: stub mode” (`KANEVAS_STUB=1`).

`npm run dev` serves the API, and the frontend only if it has been built: first run
`npm run build` (it builds `dist/public`, served by Fastify behind the session; without it, `/`
shows no screen). `npm run dev:front` starts Vite alone (port 5173 by default) and proxies only
`/api` to `http://localhost:3001` (hardcoded in `frontend/vite.config.ts`: change it if `PORT` changes): it does not replace the server for stub sign-in. To use it, first start the
stub server (port 3001), sign in at `http://localhost:3001/`, then open
`http://localhost:5173/` (the session cookie does not depend on the port).

The reference path remains the Node 20 container in `CLAUDE.md` (the CI's); without Docker, a recent local Node
suffices for the same commands (`npm ci && npm run typecheck && npm test`).

### Import sample acceptance

Start the stub application on a fresh database (see below). « Essai Kanka » is universe 4 on a fresh
seed; the client needs no browser session, only that id and a token. In another terminal:

```bash
npm run import:echantillon -- http://localhost:3001 4 <token>
```

Use the public stub token `kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue` (`JETON_BOUCHON` in `src/bouchon/depart.ts`) or create a token in
« Accès par API » (E-18). The standalone client sends files, campaigns, parent-first sheets,
relations and scenarios in a batch, closes it, and prints the counters and warning reasons.
Tokens are passed as arguments and never written to disk. The sample comes from Éneria;
its source mapping and neutral JSON format are documented in `src/bouchon/echantillon/README.md`.

The database must be fresh (delete the file first) and the port free (`EADDRINUSE` shows only in the server log, and the client then talks to whatever else listens there): on a used base the first run reads like a replay. First run: 11 sheets, 3 files, 2 campaigns, 2 scenarios and 3 relations created, one unknown-target
warning (the relation probe from `personnage:tenny-balla` to `lieu:absent`), zero refusals. The summary line « liens et références en attente : 2 » counts the whole universe: Nyx, plus the link already waiting in the stub seed. Rerun the command: no creations, 11 unchanged sheets. In E-13, check
April 18, March 3, February 10, 2021, newest first. In Éneria Prime, Base Éneria-1 resolves
and Nyx stays « en attente »; player mode hides the GM paragraph and image, the base and
Obscura, including in search. In E-7, open the 60,000-character scenario and follow its
Éneria Prime link. Change the campaign status in E-6 and rerun: it stays changed, with a warning.

To exercise incremental replay, copy the sample JSON **within its directory** (file paths are
relative to it), append a sheet with a fresh `cle`, then pass that JSON path as a fourth argument:
one created sheet and eleven unchanged. Use the original file again for the baseline replay.
For the refusal case (one refusal, reason names the missing campaign, exit status 1):

```bash
npm run import:echantillon -- http://localhost:3001 4 <token> src/bouchon/echantillon/refus.json
```

Finally delete « Essai Kanka » in E-14, create a fresh universe and a token in E-18, and run
the original command with their id and token: the first-run counts must match. The stub
token belongs to the deleted universe and cannot be reused for the new one.

### Without Authelia: stub mode

```bash
npm ci && npm run build && KANEVAS_STUB=1 npm start   # then open http://localhost:3001/ : pick a test account
# seeding precedes listening on the port (under a second here); without writing to ./data/ or using port 3001: npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start
# The recipes below that name `http://localhost:3001` assume `npm start` without `PORT`; with the `PORT=3055` command, replace 3001 by 3055. Stop with Ctrl-C. In the background, `kill $!` stops only `npm`, not the server: kill the `node dist/server.js` process that listens on the port (simplest: start it with `PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 node dist/server.js &` instead of `npm start`, then `kill $!` stops it (keep the PID: `echo $!`); `ss`, `ps` and `pgrep` may be missing in a pod) (a server left running keeps the port, the database and `session.key`). Delete /tmp/k.db to reset the database. Every recipe below assumes a fresh seeded database (ids such as universe 4 are those of a fresh seed; the deletion recipe destroys « Port-Sel » and the universe it is run on): delete /tmp/k.db before each.
# `session.key` and `attachments/` are created beside the database: use a dedicated directory,
# e.g. `DB_PATH=/tmp/kanevas-essai/k.db`, and delete that entire directory to reset everything.
```

`/connexion-bouchon` replaces Authelia (AD-55) under a « mode bouchon » banner. Test accounts
have the identifiers `antor`, `lea`, `teo`, `mira` and `admin` (display names Antor, Léa…; the tools API and the « Responsable » line show the identifier, lower case: `antor`, `mira`): this is
the identifier to type when adding a member. On a database without universes, the stub seeds a demonstration world at startup
(« Lame d'Ébène »: Antor GM, Léa player; « Les Landes grises »: Mira GM; the « CoF Mini » system;
sheets, some illustrated; « Les Cendres de Vaëlis », Admin GM and Antor player, linked to « Chroniques Oubliées Fantasy »; Teo belongs to no universe); with the trial module (the stub always has it) it also seeds the tools' recipe: account `roxane`; « Éneria d'essai » (Antor GM, Mira GM, Léa and Roxane players) and « Univers voisin » (Antor GM) sharing the system « Système d'essai » (Antor responsible); « Univers ancien » (Mira GM) attached to « Système ancien », which has no responsible. On a fresh database the ids are universes 5 (Éneria d'essai), 6 (Univers voisin), 7 (Univers ancien), system 3 (Système d'essai) — check the "Univers" list if the seed ran on a non-empty database. To try the tools: sign in as `antor`, open Éneria d'essai › Paramètres › tab « Outils » (the universe level) or « Systèmes de jeu » › Système d'essai › « Outils » (the system level); enable « Essai A » (« Essai B » refuses until then) (from the tab, or `curl -X PUT -H 'content-type: application/json' -d '{"active":true}' …/api/univers/5/outils/essai/a/activation` with the session cookie; the bodies are in `ARCHITECTURE.md`, « Detail of `kanevas-outils-cadre` »), tick or untick « Joueurs », then sign in as `lea` and look at the sidebar's « Outils » section; « Transférer la responsabilité » is at the head of the system page. Journeys: `docs/ecrans.md`, E-20. `KANEVAS_SANS_SEMIS=1` disables it. In stub mode the assistant responds through a keyword script calling the real tools (AD-78), signed in as `antor` (GM of « Lame d'Ébène »): « Crée une campagne « Les Marches rouges » » then « Crée un scénario « Acte III — La crypte » dans « Les Marches rouges » » (the seed contains no campaign); for `lea` (player), creation is refused; « Lis-moi la section « Vérité » » returns « Introuvable. » to anyone who cannot read it. An account created outside the seed exists only after its
first sign-in (otherwise « Ce compte ne s'est jamais connecté. » when adding it). Kanevas refuses to
start in stub mode if an `OIDC_*` variable is set. With `NODE_ENV=production` (as in the image; `npm start` does not set it) and no `/data` volume, the database is in
memory (startup warning).

**Managed sections recipe** (`kanevas-outils-sections-gerees`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 node dist/server.js`, fresh seeded database, « Éneria d'essai » is universe 5; `B=localhost:3055`, `H='content-type: application/json'`): `curl -c /tmp/j -d compte=antor $B/connexion-bouchon` (and `-c /tmp/l -d compte=lea`); enable the tool `curl -b /tmp/j -X PUT -H "$H" -d '{"active":true}' $B/api/univers/5/outils/essai/g/activation`; create the sheet `curl -b /tmp/j -X POST -H "$H" -d '{"type":"lieu","titre":"Vaisseau d essai"}' $B/api/univers/5/fiches` (returns its `id`, say 25); the generator writes the section on behalf of Antor, authored by Léa (account 2): `curl -b /tmp/j -X POST -H "$H" -d '{"ficheId":25,"type":"caracteristiques","auteurId":2}' $B/api/univers/5/outils/essai/g/sections` (201, `geree.etat` `a_jour`; the response's `id` is the section id `<sid>` used below, 29 on a fresh database). As `lea`, `GET $B/api/univers/5/fiches/25` shows the section with `geree` and `peutEcrire: false`, and the sheet page (`/univers/5/fiches/25`) the banner « Générée par Essai G » without an editor; `PUT …/fiches/25/sections/<sid>/contenu` with `{"contenu":"x","version":1}` answers 403 for both accounts. `curl -b /tmp/j -X PUT -H "$H" -d '{"version":0,"valeurs":{"marge":25}}' $B/api/univers/5/outils/essai/g/reglages` (204): the section is now `perime` (text and `version` unchanged); `POST …/sections/<sid>/recalcul` `{"version":1}` as Antor updates it (200, `version` 2), as Léa answers 403. Disable the tool (`{"active":false}`): the text stays, `geree.etat` is `desactive` with no name, and the generator's route answers « Page introuvable ». The `notes` type is « on proposal »: create it with the same generator route (`{"ficheId":25,"type":"notes"}`, its response `id` is its `<sid>`), change the setting, then `POST …/sections/<sid>/recalcul/proposition` with the body `{}` files a proposal (201; E-12). Browser coverage: `src/e2e/sections-gerees-ecran.test.ts`.

**Catalogue recipe** (`kanevas-outils-catalogue`, in stub mode, same server, cookies and universe 5 « Éneria d'essai » as the managed sections recipe; the tool is `essai/g`, system 3 « Système d'essai », Antor is its responsible). On E-20 (Settings ▸ « Outils ») the « Essai G » card has « Importer un catalogue… » at the system level and at the universe level, and « Voir les éléments ». Pick `src/outils/essai/exemples/catalogue-essai.json` (12 invented elements): the preview says « 12 ajoutés… », nothing is written until « Appliquer », and applying it again says « 0 ajouté, 0 modifié, 12 inchangés ». Without a browser: `curl -b /tmp/j -X POST -H "$H" --data-binary @src/outils/essai/exemples/catalogue-essai.json $B/api/systemes/3/outils/essai/g/catalogue/apercu` (report, no write), then `…/catalogue/application` (writes); `curl -b /tmp/j $B/api/univers/5/outils/essai/g/catalogue` lists the elements (the tool must be enabled, see the previous recipe). With a token scoped to « Essai G » (the content token of the stub is refused with 401 on these routes; create one on E-18 by ticking the tool, or as Antor: `curl -b /tmp/j -X POST -H "$H" -d '{"nom":"catalogue","dureeJours":7,"outils":["essai/g"]}' $B/api/univers/5/jetons`, whose answer's `valeur` is the token; `JETON=<valeur>`): `curl -X PUT -H "Authorization: Bearer $JETON" -H "$H" --data-binary @src/outils/essai/exemples/catalogue-essai.json "$B/api/import/v1/univers/5/outils/essai/g/catalogue?niveau=univers"`. Browser coverage: `src/e2e/outils-catalogue-*-critere.test.ts`.

**GM block recipe** (`kanevas-import-secrets`, in stub mode): in « Lame d'Ébène », sheet « Port-Sel » (type `lieu`), section « Histoire ».
Signed in as `lea`, the section reads without the word « sous-main » and has no « Modifier »; searching for « sous-main » in « Lieux » does not return « Port-Sel ».
Signed in as `antor`, the block appears hatched with the « MJ seul » badge, the same search returns « Port-Sel », and Player mode restores Léa's view.
In the editor, « Bloc MJ » wraps the selection in `:::mj` and `:::`.

In stub mode only, `/demo-composants` (session required) shows the design system's components in every state;
outside stub mode, this address returns 404 once signed in (302 to sign-in otherwise).

E-14 recipe in stub mode: as `antor`, « Lame d'Ébène » then « Paramètres » (navigation); the three GM blocks (« Identité », « Système de jeu », « Créer un système ») are closed blocks with amber hatching and an amber left rule, like the sheet's GM-only sections (below 760 px the overflow is 12 px instead of 28). Interface text uses the typographic apostrophe (’).

**Media library recipe** (`kanevas-import-mediatheque`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database; « Lame d'Ébène »). As `antor`: « Médiathèque » in the sidebar (E-19) lists, among others (the seeded illustrations are there too), « Carte des Sphères », « Plan secret de la Guilde » (GM-only) and « port-sel-quais.webp »; opening « Carte des Sphères » gives its usages (« Val-Fortin », « Maître Aldric », the illustration of « Port-Sel »). On « Port-Sel », « Description »: « Joindre un fichier » adds a document, visible to players; « Fichier » in the editor, inside a GM block, adds a GM-only file. As `lea`: « Plan secret de la Guilde » is not in the library, and a GM-only image (inserted in a text with `![plan](fichier:<id>)`, here « Plan secret de la Guilde », unused in the seed; read its `<id>` from `GET /api/univers/1/fichiers` with Antor's cookie (log in first, see the block below): it is 11 on a fresh database (the id, not a count); « Lame d'Ébène » is universe 1) read in a text becomes « Image réservée au MJ. ». Reserving « Carte des Sphères » for the GM (E-19) first lists what players lose.

Without a browser (the stub server above must be running on port 3055 (substitute your port in every URL otherwise); run from an empty scratch directory (the commands write a PDF in the current one); same cookie jar `-b /tmp/j`; « Lame d'Ébène » is universe 1, « Port-Sel » is fiche 12 and its « Description » section 13 on a fresh base):
```bash
curl -c /tmp/j -d compte=antor http://localhost:3055/connexion-bouchon   # log in as Antor (stub mode, no password); every curl below sends this cookie jar
curl -b /tmp/j http://localhost:3055/api/univers/1/fichiers   # {"fichiers":[{"id","nom",…}],"suite","total"} : read the id by "nom"
printf '%%PDF-1.4\n' > tarifs-du-port.pdf   # any small file named so will do
curl -b /tmp/j -F section=13 -F maniere=joint -F fichier=@tarifs-du-port.pdf http://localhost:3055/api/univers/1/fichiers   # « Joindre un fichier »; add -F blocMj=true for the GM-block path (fields before the file)
curl -b /tmp/j -X PUT -H 'Content-Type: application/json' -d '{"contenu":"![plan](fichier:11)","version":1}' http://localhost:3055/api/univers/1/fiches/12/sections/13/contenu   # version: read it from the section first
```

World update recipe in stub mode (the seed contains neither campaigns nor session reports; « Maître Aldric » has a « Vérité — MJ seul » section, which « Vérité » suffices to identify). Still in « Lame d'Ébène »:
1. As `antor`, in the assistant panel (floating button): « Crée une campagne « Marches » ».
2. Sign out (avatar menu), then `/connexion-bouchon`: as `lea`, from the campaign sheet or session reports screen (E-13, `docs/ecrans.md`), create the report in that campaign, with the exact title « Séance 3 » (the stub looks for that exact title).
3. As `antor`, in the panel: « Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 3 » »; the thread shows « Mise à jour proposée » (current, proposed) and the sheet stays unchanged until « Appliquer ». « Proposé » = the current content followed by « Mise à jour d'après « Séance 3 ». »; after « Appliquer », the block says « Appliquée : la section « Vérité — MJ seul » est à jour. » and the sheet shows that content.
4. Editing the section from the sheet before applying makes the proposal stale (« Appliquer » disabled, reason displayed).
5. The same request as `lea` creates nothing: the assistant answers « Je ne peux pas le faire : l'outil « proposer_mise_a_jour » ne fait pas partie de ceux dont vous disposez. », without a block. A proposal cannot be found again after reloading the thread (AD-79).

Markdown recipe in stub mode: in « Lame d'Ébène », as `antor`, open the « Maître Aldric » sheet, « Modifier » on the « Apparence » section, and write a subheading (`## Quartiers`), a list, a table, `**gras**`, `[site](https://exemple.org)`, `[x](javascript:alert(1))` and `<script>alert(1)</script>`, then « Aperçu » (it shows what Léa will read) and « Enregistrer ». Subheadings shift down one level: `## Quartiers` renders as `<h3>`, below the section title. As `lea`, the sheet shows the formatted subheading, list, table and web link; the `javascript:` link and tag stay plain text, no script executes. Ceiling: 100 000 characters for any text (sections, session reports, scenarios, system entries, proposals); 100 001 is refused.

**Sheet types recipe** (`kanevas-import-types`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database, so « Essai Kanka » has id 4): as `antor`, on « CoF Mini » ▸ « Types de fiche » tab, disable « Vaisseau » and « Note »: the sidebar of « Lame d'Ébène » (which follows « CoF Mini ») loses « Vaisseaux » and « Notes »; as `mira` (sole GM of « Les Landes grises », which also follows « CoF Mini »), her sidebar loses « Vaisseaux » and « Notes ». On « Lame d'Ébène » ▸ « Types de fiche » panel (E-14), set « Vaisseau » to « Activé »: its sidebar shows « Vaisseaux », not « Notes ». Create a « Savoir » named « Les Cristaux d'Ombre » with subtype « Ressource », then « ⋯ » ▸ « Changer le type… » ▸ « Note »: a box announces that the subtype will be removed, and the sheet no longer has one. As `lea`, « Lieux » ▸ « Sous-type » filter ▸ « Taverne »: only « Le Pendu Joyeux » remains. Through the API, with the stub token (value of `JETON_BOUCHON`, `src/bouchon/depart.ts`, `kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue`) in « Essai Kanka » (id 4 on a seeded database): `curl -X PUT -H "Authorization: Bearer kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue" -H 'Content-Type: application/json' -d '{"type":"vaisseau","titre":"Aube","sousType":"Frégate"}' http://localhost:3055/api/import/v1/univers/4/fiches/vaisseau:aube` returns `{"id":…,"etat":"creee","avertissements":[]}` (without `?lot=`, nothing is counted); replaying the same call returns `"etat":"inchangee"`; `JETON_BOUCHON` is the constant in `src/bouchon/depart.ts`.

Links recipe in stub mode. In « Lame d'Ébène », as `antor`, sheet « Port-Sel », « Modifier » on « Histoire »: typing `[[` then « ald » opens the list, Enter inserts `[[<id>|Maître Aldric]]`; likewise for « La Guilde des Brumes » (GM-only). As `lea`, the first is a link opening « Maître Aldric », the second unmarked text; on « Maître Aldric », « Mentionnée dans » names « Port-Sel » (a link in a GM block of « Rapport secret de l'amirauté » appears there only as `antor`). In « Essai Kanka », « Anse-aux-Sels » shows an « en attente » link and a broken link as `antor`, plain text as `lea`. With the stub token, a `PUT` of `lieu:port-sel` with « `[[cle:faction:guilde|la Guilde]]` » in a section gives a waiting link; the `PUT` of `faction:guilde` resolves it without changing Port-Sel's version; replayed, both return « inchangee ». In a scenario, `[[` opens the same list; in a system entry, `[[…]]` stays plain text.

API access recipe in stub mode (« Essai Kanka » is seeded: Antor GM, Léa player, and a « Jeton du bouchon » with fixed value `JETON_BOUCHON`, `src/bouchon/depart.ts`). As `antor`, « Essai Kanka » ▸ « Accès par API » (E-18): create a token, displayed only once. With it (or the stub token), the import API (AD-103, AD-104), on a fresh database (« Essai Kanka » is the 4th seeded universe, id 4; with `KANEVAS_SANS_SEMIS=1` neither it nor the stub token exists: create a universe and a token, the id is in the base address copyable on E-18):
```bash
JETON=kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue   # the stub token, or the one created on E-18
B=http://localhost:3055/api/import/v1/univers/4          # no trailing slash; port 3055 as in the stub command above (3001 for `npm start` without PORT)
curl -H "Authorization: Bearer $JETON" $B                        # the contract: types, limits
curl -X POST -H "Authorization: Bearer $JETON" $B/lots            # opens (or resumes) a batch; copy the `lotId` field of the JSON response
curl -X PUT -H "Authorization: Bearer $JETON" -H 'content-type: application/json' "$B/fiches/lieu:port-sel?lot=<lotId>" \
  -d '{"type":"lieu","titre":"Port-Sel","sections":[{"cle":"desc","titre":"Description","contenu":"Un port.\n\n:::mj\nTenu en sous-main.\n:::","joueursLisent":true},{"cle":"verite","titre":"Vérité","contenu":"…"}]}'
```
A GM-only section omits `joueursLisent`. Response `creee`, then `inchangee` on replay; E-18 shows the batches. As `lea` (same server, same port as `B`; `curl -c /tmp/j -d compte=lea http://localhost:3055/connexion-bouchon`, then « `GET /api/univers/<id de l'univers>/fiches/<id rendu par le PUT>` » with `-b /tmp/j`), « Description » reads without « sous-main » (the GM block) and « Vérité » does not exist. Without `?lot=`, the write succeeds but no batch counts it. A field the endpoint does not handle is ignored without a warning, e.g. `fichiers` sent on the sheet instead of inside a section: nothing is attached, so put it in the section. Available routes: `GET /`, the three batch routes, `PUT /fiches/:cle`, `PUT /fichiers/:cle`, `DELETE /fiches/:cle` (see “Deletion recipe”), `PUT /campagnes/:cle`, `PUT /campagnes/:cle/scenarios/:scle` and `POST /fiches/:cle/relations` (see “Import sample acceptance”). Unhandled fields are ignored without a warning (`parent` (origin key) is handled, see “Tree recipe”; `alias` and `etiquettes` are written, see “Search recipe”). A `compte_rendu` is accepted with a known `campagne` (origin key); without it, or with an unknown key, it is refused (400, `champ: campagne`). Content is rendered as Markdown (AD-95); content containing `:::mj … :::` produces the same GM block as the screen (AD-114).

**File import recipe** (`kanevas-fichiers-put`; « the script » is the external import script that calls this API, kept outside this repository): with `$JETON` and `$B` from the import recipe above (redefine `B` with the port the server was started on, e.g. `B=http://localhost:3055/api/import/v1/univers/4` for the 3055 of the other recipes; close any open batch first, or `POST $B/lots` resumes it), open a batch (`LOT=$(curl -s -X POST -H "Authorization: Bearer $JETON" $B/lots | node -pe 'JSON.parse(require("fs").readFileSync(0)).lotId')`; or copy the `lotId` by hand), make a small PDF (`printf '%%PDF-1.4\n' > tarifs.pdf` is enough; any real PDF works), then send `curl -X PUT -H "Authorization: Bearer $JETON" -F "nom=Tarifs du port" -F "fichier=@tarifs.pdf" "$B/fichiers/doc:tarifs?lot=$LOT"` (`nom` is required, a missing one is a 400). A closed batch refuses any further `PUT` (409 `lot_clos`). The response is `creee`; close the batch with `POST $B/lots/<lotId>/clore`. Replaying in a new batch returns `inchangee`; replacing the bytes returns `mise_a_jour`. Add `-F "visibilite=mj"` before `fichier` for GM-only files. Change the name or visibility on E-19, then replay: the manual change stays and the batch warns. An empty file returns 400 with `champ: fichier`, counted as refused; a revoked token returns 401. `GET $B` exposes `limites.fichiersJointsParSection: 100`.

**File references recipe** (`kanevas-fichiers-references`): with the same `$JETON`, `$B` and a batch open, push a sheet first with `"illustration": "img:plan"`, `"fichiers": ["doc:tarifs"]` in a section, or `![](fichier:cle:img:quais)` in a text. Files not sent yet leave the sheet `creee` with one warning per key and the references counted « en attente » at the batch closing; the GM sees « Fichier en attente d'import : « img:quais ». » on the sheet, a player nothing. `PUT $B/fichiers/img:quais` (an image, `-F "nom=Quais" -F "fichier=@quais.png"`: `nom` is required) and `PUT $B/fichiers/doc:tarifs` (a PDF, `-F "nom=Tarifs"`), sent like the file recipe above, then resolve them without a new version; replaying everything returns `inchangee`/`inchangé`. An `illustration` naming a document is a 400 `pas_une_image`; more than 100 `fichiers` in a section is a 400 `invalide`.

**Search recipe** (`kanevas-import-recherche`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database; with Docker, the “stub mode” command above). As `lea`, « Rechercher » in the bar (or `/` outside a field) opens E-17: « salport » returns « Port-Sel » with « alias : Salport »; « sous-main » (a word only in the GM block): « Aucune fiche ne correspond. »; the « Côte des Brumes » badge leaves only sheets she can read. As `antor`, « sous-main » returns « Port-Sel », and nothing in « Mode Joueur » (the address contains `mode=joueur`). In « Lame d'Ébène », with « Savoir » disabled (as `antor`, E-14, universe's « Types de fiche »): « chronique » still returns « Chronique de l'Âge d'Ombre », without a « Savoirs » badge. On the « Port-Sel » sheet, as `antor`, « ⋯ ▸ Alias et étiquettes… » sets aliases and labels; their limits are 20 aliases of 120 characters. Through the import API, a `PUT` of `lieu:port-sel` with « `"alias":["Salport"],"etiquettes":["Côte des Brumes"]` » in « Essai Kanka » returns `creee`, then `inchangee` on replay (order and case do not matter); an alias added in Kanevas is not overwritten and the batch warns about it.

**Tree recipe** (`kanevas-import-arbre`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database, « Essai Kanka » has id 4). In « Lame d'Ébène », « Port-Sel » sits under « Les Sphères » (GM-only), with five places below it including « Le Repaire des contrebandiers » (GM-only). As `antor`, « Lieux » ▸ « Arbre » toggle (the choice survives reloading): expanding « Les Sphères », then « Port-Sel » shows « La Taverne du Kraken ». As `lea`, « Port-Sel » is a root; its sheet has the breadcrumb « Lame d'Ébène › Lieux › Port-Sel » and « Contient » names four places, not the hideout. As `antor`, « ⋯ ▸ Déplacer sous… »: « Les Sphères » under « Port-Sel » is refused (« Une fiche ne peut pas être rangée sous l'un de ses descendants. »), « Les Docks » under « Les Sphères » gives the toast « Fiche déplacée. ». Through the import API with the stub token (`JETON` and `B` from the recipe above, with this server's port 3055: `B=http://localhost:3055/api/import/v1/univers/4`; these sheets belong to « Essai Kanka », distinct from « Les Docks » in « Lame d'Ébène » above; open a batch with `curl -X POST -H "Authorization: Bearer $JETON" $B/lots`, copy its `lotId`, then put `?lot=<lotId>` on each `PUT` and close the batch to get the counts): « `PUT $B/fiches/lieu:les-docks` » with body « `{"type":"lieu","titre":"Les Docks","parent":"lieu:port-sel-absent"}` » (`type` and `titre` are required) writes the sheet without a parent and returns the warning « parent lieu:port-sel-absent inconnu : fiche écrite sans parent » (on closing, the batch counts waiting links and parents across the **whole universe**, not only that batch); the `PUT` of `lieu:port-sel-absent` then replaying « Les Docks » sets the parent (`mise_a_jour`); a manually changed parent is no longer overwritten (« parent modifié dans Kanevas : non écrasé »).

**Deletion recipe** (`kanevas-import-tenir`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database: remove the file or change `DB_PATH` before replaying the other recipes, since this one deletes « Port-Sel » and universe 4; « Essai Kanka » is universe 4). As `antor` in « Lame d'Ébène », sheet « Port-Sel »: click the title, type « Port-Sel-sur-Brume », Enter renames it. « ⋯ ▸ Supprimer la fiche… » opens a box that counts what goes (3 sections, 3 relations, 1 map place, 2 files that stay, 5 children moved under « Les Sphères ») and says the files stay in the media library; confirming returns to the list of the type (toast « Fiche supprimée. »), the old address answers « Page introuvable. », the children sit under « Les Sphères », and a link to it (section « Apparence » of « Maître Aldric ») reads « lien cassé » for `antor` and plain text for `lea`. In « Essai Kanka » ▸ settings, « Supprimer l'univers »: typing « essai kanka » leaves the button inactive, the exact name deletes it and `lea` no longer sees it. Without a browser (`JETON` as in “API access recipe” above; `B=http://localhost:3055/api/import/v1/univers/4`; open a lot with `curl -X POST -H "Authorization: Bearer $JETON" $B/lots` and set `LOT` to the `lotId` of the answer (`POST $B/lots/$LOT/clore` then `GET $B/lots/$LOT` shows `compteurs.fiches.supprimees`); the body of the `PUT` is `{"type":"lieu","titre":"Havre-Gris","sections":[]}`, « Havre-Gris » is not in the seed): `curl -X PUT -H "Authorization: Bearer $JETON" -H 'content-type: application/json' -d '{"type":"lieu","titre":"Havre-Gris","sections":[]}' "$B/fiches/lieu:havre-gris?lot=$LOT"`, then `curl -X DELETE "$B/fiches/lieu:havre-gris?lot=$LOT" -H "Authorization: Bearer $JETON"` (204), and the same `PUT` answers `creee` again (no tombstone).

### End-to-end tests

`npm test` also runs `src/e2e/`: `node dist/server.js` in stub mode, driven by real Chromium through
Playwright. The build runs only if `dist/public/index.html` is missing: after a change in
`src/` or `frontend/`, rerun `npm run build` before `npm test`, otherwise these tests exercise the old code.
Text in `docs/ecrans.md` uses the straight apostrophe; the interface uses the typographic apostrophe (’).
Playwright is not a repository dependency: it must be installed globally
(`/usr/lib/node_modules` or `/usr/local/lib/node_modules`) or in the current directory (`npm install --no-save playwright@1.63.0`) with Chromium, which
`node:20-bookworm-slim` does not do; the manual `tests.yml` workflow installs it locally, so it runs e2e tests. To check whether it is found: `ls /usr/lib/node_modules/playwright` (this only proves the package: Chromium must be installed too, possibly under `PLAYWRIGHT_BROWSERS_PATH`). Where it is missing, these tests are **skipped with a message**,
without failing; the other tests (services, HTTP routes) run everywhere. Durations vary with the machine (about 28 minutes for `src/e2e` in a pod, about 20 in the CI). Allow about ten minutes even without e2e tests, about thirty with Playwright (about 2400 tests, silent until the end; a “skipped” message at the start of the output means Playwright was not found).
An e2e test must wait for the state it reads (an element appearing or disappearing, navigation completing), never a fixed delay: under load, a test that reads the DOM too early fails at random. To reproduce the conditions of `tests.yml` (4 cores, two files at a time), run from the repository root (about 28 minutes for `src/e2e` in a pod), after `npm run build` (a stale `dist/` silently plays the old code: rebuild after any change to `src/` or `frontend/`) and without rerunning typecheck or build: `taskset -c 0-3 node --import tsx --test --test-concurrency=2 $(find src/e2e -name '*.test.ts')`. If an e2e test times out under heavy load (8 s in files that set it, Playwright's default of 30 s elsewhere), rerun it alone (`node --import tsx --test src/e2e/<fichier>.test.ts`) before treating it as a defect.
Administration recipe in stub mode (the demonstration world is seeded: « Lame d'Ébène », « Les Landes grises », « Les Cendres de Vaëlis », five already known accounts): sign in as « Admin », open `/administration`, choose « Lame d'Ébène » (where Admin has no role) and add « mira ». An account that never signed in (« nadia ») is refused. The `src/e2e/administration*.test.ts` e2e tests drive E-5.
Assistant token recipe in stub mode (P-15): as « Admin », on `/administration`, the « Jeton de l'assistant » panel says « Aucun jeton posé. »; « Connecter l'abonnement » shows an address (fixed in stub mode) and a « Code » field; `bouchon` gives « Jeton posé le … »; any other code, « La connexion n'a pas abouti. Recommencez. » and the previous state remains. The token value never appears; « lea » receives « Page introuvable. ». In stub mode the assistant already responds through its script: real availability is checked on the deployed URL (first real model call, an action for Monsieur). Without a browser, on the server started above with `PORT=3055` (`curl -c /tmp/j -d compte=admin http://localhost:3055/connexion-bouchon`), then with `-b /tmp/j`: `POST /api/instance/assistant/jeton/connexion` (returns `connexionId`, `adresse`, `expireLe`), `POST …/jeton/code` with `-H 'Content-Type: application/json' -d '{"connexionId":"…","code":"bouchon"}'` (without this header the body is not read as JSON and the response is 400) and `GET …/jeton` for the state. Outside stub mode, connecting launches `script` (`bsdutils` package, present in `node:20-bookworm-slim`, the image's base): without it, `connexion_impossible`. Setting the token writes `claude/oauth-token` beside the database (`./data/claude/` in development).
Image recipe in stub mode: as « antor », open the assistant panel in « Lame d'Ébène » and ask « Fais un portrait pour « Apparence » d'« Maître Aldric » » (copy exactly, including the « » quotation marks: the stub looks for them; without them it answers « Je ne sais répondre qu'à des demandes de test… »): the thread shows « Image attachée à la section… » with a thumbnail and « Ouvrir la section », and the image appears in the media library (E-19), « Visible des joueurs » or « Réservé au MJ » depending on the section; a request containing « échec » attaches nothing (the library gains no file) and answers « Je n'ai pas pu générer l'image. »; as « lea », the assistant has no such tool. The real engine (Codex) is exercised only on the deployed URL, with the operator's `auth.json`.

Maps recipe in stub mode (the seed contains no map): as « antor », open « Cartes » in « Lame d'Ébène », create « La ville de Brume » (illustrated map, with a background image), add a sheet, then « Rendre visible »; sign back in as « lea »: the map is in her list, with only tokens of sheets she can read. A graph is created the same way (form « Graphe »). Antor's Player mode shows what Léa sees.

## Settings

The starting list is `.env.example` (it also includes `NODE_ENV`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; only `ANTHROPIC_MODEL`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_DIR` and `CODEX_HOME` are used, by the assistant; `ANTHROPIC_API_KEY` is read by no route). In addition: `APP_NAME` (default `kanevas`; only `/healthz` text uses it),
`APP_VERSION` (default `0.0.0-dev`, set by the build-arg in the image), `PORT` (3001), `DB_PATH` (SQLite file; default `/data/kanevas.db` with `NODE_ENV=production`, `./data/kanevas.db` in development), `ATTACHMENTS_DIR` (media library files; defaults to `attachments/` beside the database, hence `/data/attachments` in production), `SESSION_SECRET` (≥ 16 characters; otherwise `session.key`, created beside the database: `/data/session.key` in production, `./data/session.key` in development), `KANEVAS_STUB` (`1`), `KANEVAS_SANS_SEMIS` (`1`: no demonstration world in stub mode), `FRONTEND_DIR` (built frontend directory; set by route tests, unnecessary for operation), `LLM_PROVIDER` (`mock` | `anthropic` | `claude-agent`, default `mock`; read only by the text transport, which the assistant does not use), `CLAUDE_CODE_OAUTH_TOKEN` (Claude subscription token, set by the operator; empty and without a token set from administration = the assistant is unavailable outside stub mode and says so, never falling back to the stub, AD-77), `CLAUDE_DIR` (directory of the `oauth-token` file set from administration; default `claude/` beside the database, hence `/data/claude` in production, under the temporary directory and lost on restart if the database is in memory, meaning without a volume; this file takes precedence over the variable, AD-109), `CODEX_HOME` (directory of Codex's `auth.json`, set by the operator; default `codex/` beside the database, hence `/data/codex` in production; without an executable `codex` or an `auth.json`, the assistant does not offer image generation, AD-88). `codex` (npm package `@openai/codex`, version pinned by `CODEX_VERSION` in the `Dockerfile`) is installed only in the image; outside the image, `npm i -g @openai/codex` puts it on the `PATH`. Nothing states the chosen adapter: the `generer_image` tool is present in the GM catalogue if and only if the adapter is not `aucun`.

## Application version

`/healthz` returns `kanevas <version>`. This version comes **exclusively**
from the Docker build-arg `APP_VERSION`, never from `package.json` (which deliberately has
no version):

```bash
# without --build-arg, the version is 0.0.0-dev
docker build --build-arg APP_VERSION=0.1.0 -t kanevas:0.1.0 .
docker run --rm -p 3001:3001 kanevas:0.1.0
curl http://localhost:3001/healthz   # -> "kanevas 0.1.0"
```

An image is built only on a `v*` tag whose commit carries the « tests-complets » attestation: `npm run tests:attestes -- --publier` (workstation, chain pod) or the manual `tests.yml` workflow sets it after a complete suite; `docker-publish.yml` runs no test, it checks this proof (without it, the tag produces no image; no build on `main` or PRs).

On a tag, CI derives that same build-arg from the pushed semver tag (`docker/metadata-action`):
pushing `v0.1.0` publishes `ghcr.io/antorfr/kanevas:0.1.0` with `APP_VERSION`
embedded as `0.1.0` — a single source of truth for the displayed version and the
published tag. Only a tag gives a reliable version: no automatic build exists outside tags.

## OIDC

`GET /api/auth/oidc/login` and `GET /api/auth/oidc/callback` reuse
Antre-du-maitre's generic mechanism (OIDC discovery, PKCE, state), stopping
at identity authentication: the callback opens the session (signed cookie,
7 days, AD-56) and creates the account on first sign-in; universe roles never
come from Authelia (AD-9). `KANEVAS_STUB=1` replaces Authelia with test account
selection (`/connexion-bouchon`, AD-55). `GET /api/auth/config` returns `{oidcEnabled}`. Without all four
`OIDC_*` variables set (see `.env.example`) — even if only some are set —
login and callback return `404`: no degraded mode. A set but
empty or invalid value (malformed URL), however, makes startup fail
(`ZodError`, `src/config/env.ts`).

## Deployment

Outside this repository: Helm chart `charts/kanevas` in `smart-home-charts`,
manifest `clusters/tantive/games/kanevas-helm-config.yml` and OIDC client
`kanevas` (`clusters/homenode/infra/authelia-helm-config.yml`) in
`k8s-home-lab`. Order: publish the image (tag `vX.Y.Z`), publish the chart, then
merge `k8s-home-lab`, whose merge deploys.

See `ARCHITECTURE.md` for the code map, invariants and rejected options. Its table lists the epic's
retained `AD-n` decisions, including those still awaiting implementation; “Today” identifies what
is built (“The target” is the intended product, not all of it built). Decision numbers are stable; gaps correspond to withdrawn decisions or other slices.
Design documents (`plan.md`, `technique.md`, `socle-projet`) live outside this repository, in the
SDLC tracking store. There, “Monsieur” is the stakeholder who performs acceptance checks, “tranche”
is a delivered feature and “phase merge” is the merge after acceptance. Material that must outlive
those design documents is kept in `ARCHITECTURE.md` and `docs/`.
