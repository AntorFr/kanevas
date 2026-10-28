# kanevas — agent instructions

- Language (public repository): code, comments, README, `docs/` (the product's design docs
  included), ADRs and release notes in **English**; `.agent/*` stays French. Existing French
  docs are translated by a feature of their own, not rewritten in passing: new text is English.
- Attested tests: `npm run tests:attestes` plays the whole suite (typecheck, build, every test,
  none skipped) on the committed tree and writes `rapport-tests.json`; `-- --publier` posts the
  `tests-complets` commit status when green. The image build and the `main` rule require it; the
  CI runs no test by itself.
- Commit messages in French: subject, then the *why*. Explicit paths
  (`git add <path>...`, never `git add -A`/`.`), no AI attribution trailers —
  same convention as `k8s-home-lab`.
- Build and test in containers (reference). In a pod without Docker, Node >= 20 on the host runs the same commands
  (`npm ci && npm run typecheck && npm test`), see the README:
  `docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run typecheck && npm test"`
- `npm run typecheck` : `tsc --noEmit` on the API and on `frontend/`. `npm test` : `node --import tsx --test`
  on the files found by `find` in `src` and `frontend/src` — Node 20 (CI, image) does not expand globs
  itself, so never pass it a quoted `src/**` pattern; no extra test runner
  dependency.
- `package.json` carries no `version` field: the app's version is never read
  from it. The only source of truth is the `APP_VERSION` Docker build-arg
  (`Dockerfile`), which the CI derives from the pushed semver tag
  (`.github/workflows/docker-publish.yml`, `docker/metadata-action`). Do not
  reintroduce a version in `package.json` to "keep it in sync" — that is
  exactly the two-sources bug this socle was built to avoid.
- Release: `git tag vX.Y.Z && git push origin vX.Y.Z` builds and publishes
  `ghcr.io/antorfr/kanevas:X.Y.Z` (package public, `:latest` follows the highest version) once
  its content is attested; a GitHub Release carries the notes (`gh release create`). Deploying
  is a separate change in `k8s-home-lab` (chart version + image tag pinned there).
- No ORM: SQLite through `better-sqlite3` (Node 20 has no `node:sqlite`),
  numbered SQL migrations in `src/db/migrations/` applied at startup by
  `src/db/db.ts` (AD-14; `npm run build` copies them to `dist/`). Tables are
  those of `docs/donnees.md`; only `src/services/` reads or writes them
  (AD-2) — routes and agent tools never carry SQL. A migration takes the next
  number when its slice merges (AD-51).
- Attachments (AD-7, AD-65): bytes under `<db dir>/attachments/` (`ATTACHMENTS_DIR`), written only through
  `services/stockage.ts` (tmp/ then rename; `tmp/` emptied at startup). `ajouterFichier` in
  `services/fichiers.ts` is the one upload function of the media library for the screens (AD-117: every file is a row of `fichiers`, its
  visibility deduced from where it is added, never sent by the client); the import API's `assurerFichier` (same service, `PUT /fichiers/:cle`, AD-104) is the only other writer: its visibility comes from the script (`joueurs` or `mj`, B-48 protects it), and it resolves `fichiers_attente`; `fichierLisible` is the one read rule; only
  `services/` writes `fichiers*`); map backgrounds
  (`services/cartes.ts`, AD-69) go through `stockage.ts` directly, never write the volume themselves. The type is sniffed from the bytes, never trusted.
- `frontend/` (React, Vite, `react-router`; AD-16, AD-57): `npm run build` also builds it into
  `dist/public`, located by `routes/frontend.ts` and served by `routes/session.ts` behind the session guard (`@fastify/static` for
  `/assets/`, `index.html` as the fallback of any other GET). A screen is one file
  `frontend/src/ecrans/<nom>.tsx` exporting an `Ecran` (`registre.ts`) — never edit the router or
  the sidebar for the screens of a universe; sidebar items live in `items.ts` and show only when a registered screen answers
  their address. The two outside-universe links (« Mes univers », « Systèmes de jeu ») are fixed in
  `Barre.tsx` and the universe selector menu. Colours only through `frontend/src/ui/tokens.css` (`docs/charte.md`). Tests of the
  built-app routes set `FRONTEND_DIR` (under `NODE_ENV=test` no build is looked up otherwise).
- `services/llm/*` (transport.ts, anthropic-transport.ts,
  claude-agent-transport.ts) are reprised from `Antre-du-maitre` (AD-10) and
  unused by any route yet — kept compiling, not wired in. The admin
  setup-token window (`claude-token.ts` upstream) is rewritten as
  `services/assistant/connexion-claude.ts` (AD-112); the token is read only
  through `services/assistant/jeton.ts` (volume file `<data dir>/claude/oauth-token`
  first, then `CLAUDE_CODE_OAUTH_TOKEN`) — never read either elsewhere, never
  return, log or relay the token or the pasted code.
- `routes/auth.ts` authenticates the identity (OIDC login/callback) and opens
  the signed session cookie (`services/session.ts` signs it, `routes/session.ts` guards, AD-56), creating the account
  on first sign-in (AD-13). Universe roles never come from Authelia nor the
  session (AD-9): they are read from the members table at each request. Routes
  needing a session are registered in the guarded scope of
  `registerSessionRoutes` (AD-15). `KANEVAS_STUB=1` (AD-55) swaps Authelia for
  `/connexion-bouchon` and refuses to start if any `OIDC_*` variable is set.
- Hierarchy (AD-99, AD-115): `parent_id` is written only by `deplacerFiche` in `services/fiches.ts` (the `PATCH {parent}` route and the import both call it), except the lifting of children when their parent goes (`supprimerFiche`, `supprimerUnivers`, AD-119); ancestors, « Contient » and the tree return readable fiches only and never a count of hidden ones.
- Update `.agent/status.md` in the same commit as the work it reflects — except in a task of a chain feature, which leaves it alone: the feature's assembly writes it once (two tasks both adding to it conflict at integration).
- `src/services/{preparation,comptes_rendus}.ts` (`kanevas-scenarios-suivi`): campaigns and scenarios are `aventure` sheets
  (migration 0017, AD-127; `campagnes` and `scenarios` no longer exist). Preparation tasks take an **adventure sheet id and no
  universe id** — the GM guard is evaluated on the adventure's own universe (`exigerMJDeAventure`, AD-47), and a player, a foreign GM,
  an unknown id or a sheet that is not an adventure all get `introuvable`; the routes (`/fiches/:fid/taches`) also check the path's
  universe. Never add a `universId` parameter to the service. `creerCompteRendu` is the only non-GM creation of a sheet (AD-61) and
  names an adventure the caller reads (`aventureLue`, `droits.ts`); a report's adventure leaves the API only for a reader of it
  (`campagneId`/`campagneNom`, `campagneDuCompteRendu`), `campagneSupprimee` only for a GM when the id matches no sheet — a closed
  and a deleted adventure are the same silence for anyone else, `charge.campagne_id` included. A sheet's title is written only by
  `renommerFiche` (it leaves `dernier_import` alone, AD-119); sheets and universes are deleted only by `supprimerFiche` and
  `supprimerUnivers` (AD-119; the bilan of an adventure adds `taches`, `scenarios`, `comptesRendus`); a compte-rendu is deleted as a sheet.
- Search and relations (`kanevas-relier-chercher`): search is `listerFiches({recherche})`, never a second
  function (AD-63). The FTS5 indexes (migration 0005) only deliver candidate ids and are kept by SQL
  triggers (AD-21) — never write to `recherche_*` from code. A relation is read under both guards
  (`lireRelations`: carrying section and target sheet readable, AD-64); do not add a count or a
  placeholder for hidden ones. The `cible` of a relation carries `charge: {pj}` for a personnage and no other charge key (the badge reads only that; more would leak data of the target sheet; `chargeDeCible`). Refusal codes: `auto_relation` and `nature_incompatible` (invalide), `relation_existante` and
  `limite_relations` (conflit) : the service puts the code in `ErreurService.detail`, the route sends it as `code` in the body.
- Maps (`kanevas-cartes-graphes`, migration 0007): `src/services/cartes.ts`. `lireCarte` is the only read
  of a map, elements and graph links included (AD-68); the browser filters nothing. Graph links are never
  stored (AD-41): they come from `lireRelations` per readable section, so the two guards of AD-64 apply.
  Reads: no role, unknown id and hidden map for a non-GM are the same `introuvable`; a GM in player mode on
  a hidden map gets `refuse` with `detail: 'mode_joueur'`. Writes (GM outside player mode only): `introuvable`
  if the caller cannot read the map, else `refuse`. Refusal codes in `ErreurService.detail`: `fond_invalide`,
  `fond_trop_lourd`, `position_invalide`, `fiche_inconnue` (invalide), `fiche_deja_placee`, `carte_pleine`
  (conflit). The route answers `fond_trop_lourd` with 413. A background goes through `stockage.ts` only and `ouvrirFond` takes no mode.

- Assistant tools (`kanevas-assistant-membre`, `src/services/assistant/`): `catalogueDe(db, compteId,
  universId)` is the only door — the server picks the catalogue from the role read in `membres` (no role →
  `introuvable`, AD-26); a tool is `{nom, description, schema (zod strictObject), executer}`, neutral of any
  transport. Account, universe and role are closed over, **never a tool parameter**; the actor is
  `{compteId}` with no player mode. Tools only compose service functions (AD-27, no SQL): refusals come
  back as `{ok:false, erreur}` with the interface's words ("Introuvable.", …) and **no event**; only a
  successful write returns an `evenement` (AD-76).
- Assistant transport (`kanevas-am-transport`, `src/services/assistant/`): `repondre(db, compteId, universId,
  message, historique, deps?)` is the single entry point. Availability (`disponibilite.ts`, AD-77) is checked
  **first**: `KANEVAS_STUB=1` → `bouchon`, a token (`jetonEffectif()`: the posed file, else non-empty `CLAUDE_CODE_OAUTH_TOKEN`) → `claude-agent`, else
  `assistant_indisponible` and no adapter is built (never a silent stub fallback). `AgentTransport` (`transport.ts`)
  is the port; adapters `bouchon.ts` (AD-78 script calling the real catalogue tools) and `claude-agent.ts`
  (in-process MCP server `kanevas`, `tools: []`, `settingSources: []`, token only in the call's `env`).
  Events are collected by the orchestration around the tools, not by the adapters. Errors are `ErreurAssistant`
  with a fixed message — never the cause, which could quote the token. The text transport of `services/llm/*` is untouched.
- Assistant screen (`kanevas-am-ecran`, E-12): `frontend/src/ecrans/assistant.tsx` is the only mount — it mounts the
  floating button and panel in their own React root beside the router (no shell component edited; its registered path
  answers « Page introuvable. »). It therefore reads the address and navigates through `ecrans/assistant/adresse.ts`
  (history entry + `popstate`). The thread lives in memory in `assistant/fil.ts` (AD-28, never in browser storage);
  blocks under an answer are one line per event `type` in `assistant/blocs/registre.ts`. Never target `.principal`
  alone in CSS: it is also the primary button variant — use `main.principal`.
- Update proposals (`kanevas-monde`, `src/services/propositions.ts`, migration 0008, AD-79/AD-81): a proposal is
  read, applied and abandoned **only by its requester**, still a GM of the universe — anyone else gets
  `introuvable`. `etat` is computed at each read (`appliquee` first, then `perimee` if the section `version`
  moved, else `en_attente`), never stored. `appliquerProposition` writes through `ecrireContenu` with
  `version_origine` in the same transaction as the mark (`section_modifiee`, `proposition_appliquee` as
  `ErreurService.detail`, both `conflit`). Never write a section from here by another path (AD-48).
- Import API (`kanevas-import-fil`, migration 0010, AD-103/104): `routes/import.ts` is the scope `/api/import/v1`, beside the
  session guard — only a `Bearer kvs_…` token opens it (`verifierJeton`: fingerprint, not revoked, not expired, creator still
  GM), the cookie is ignored there and no other route reads `Authorization`. Refusal is always the same 401 `jeton_invalide`
  and opens no batch; another universe is 404. The clock is `app.horloge()` (tests move it). `services/jetons.ts` and
  `services/lots.ts` are the only readers/writers of `jetons_api` / `lots_import`; write services of later slices count
  through `noterDansLot` (counters per nature, report capped at 1 000).
- Markdown (AD-95, AD-113): the only renderer is `rendreMarkdown` in `services/markdown.ts` (`html: false`, links limited to http/https/mailto); a view returns `html` to everyone and the source `contenu` only to who may write it — never render elsewhere, never ship the source to a reader. The ceiling is 100 000 characters (`MAX_CONTENU_SECTION`).
- Import of sheets (`kanevas-fil-fiches`): `PUT /fiches/:cle` calls `assurerFiche` (`services/import-fiches.ts`), which composes
  `creerFiche`, `renommerFiche`, `changerTypeFiche` and the section services, plus a few direct updates of its own
  (`modifie_le`, `dernier_import`, `cle_origine`, `version_importee` — import bookkeeping only; content still goes through the services). Refusals are validated **before** the transaction
  (`ErreurService.champ`, sent as `champ` with code `invalide`); with `?lot=` they count « 1 refusée » in the batch, without it they leave
  no trace; a closed batch answers 409 `lot_clos`. The stub token is `JETON_BOUCHON` (`bouchon/depart.ts`), seeded in « Essai Kanka ».
- Public content (feature `kanevas-import-secrets`, migration 0011, AD-114): `sections.contenu_public` is `contenu` without its `:::mj` blocks,
  computed by the pure `contenuPublic` (`services/markdown.ts`, from the `map` of the container tokens). Only `insererSection` and
  `poserContenu` in `services/sections.ts` write `contenu` of a section — creation, `ecrireContenu`, proposals, reports and the
  import all go through them; never add another `INSERT INTO sections` / `UPDATE sections SET contenu`. `rendreMarkdown(source,
  {nature})` knows the container only for `nature: 'section'`; scenarios and system entries keep `:::mj` as text.
- Aliases and labels (`kanevas-import-recherche`, migration 0014, AD-118): `src/services/etiquettes.ts` is the only reader/writer of `fiche_alias`, `etiquettes` and `fiche_etiquettes`; `recherche_fiches.alias` is kept by triggers, never written by hand. The all-types search is `listerFiches` (no second search function); the assistant's `chercher` calls it.
- Links (`kanevas-liens-ecriture`, migration 0012, AD-116): `src/services/liens.ts` is the only writer of `liens`;
  `extraireLiens` (`markdown.ts`, pure) reads `[[…]]` from the engine's tokens, never by pattern. `poserContenu`
  and `insererSection` replace a section's rows; `preparerContenu` (bare `[[<id>]]` → `[[<id>|<titre>]]` or
  `lien_illisible`, known `[[cle:…]]` → id) runs before each write, the import's replay comparison included
  (AD-104). `resoudreClesEnAttente` rewrites waiting texts at the creation of a keyed sheet without moving
  `version` / `modifie_le`.
- Links on read (`kanevas-liens-lecture`, AD-116, AD-100): `resolveurLiens` (`services/droits.ts`) is the one query that resolves all
  the `[[…]]` of a text for a reader; the rendering is decided by the target, never by the `liens` table, and `rendreMarkdown` takes the
  resolver in `options.liens` (without it a `[[…]]` stays as written). `nature: 'scenario'` has the links without the `:::mj` container;
  a system entry (`texte`) has neither. `vueSection` / `lireFiche` / `lireSection` take the form `'markdown'` for the assistant
  (`[texte](fiche:<id>)`). « Mentionnée dans » is `services/mentions.ts` (`mentionsDe`), read-only, 50 per page, the page rides with `lireFiche`.
- Sheet types (`kanevas-import-types`, `src/services/types-fiche.ts`, AD-120; the feature's plan numbered it AD-113, which `ARCHITECTURE.md` gives to the Markdown renderer): the single list of
  types; `TYPES_FICHE`, `TypeFiche` and the payload schemas (`CHARGES`) derive from it, never copy them. `fiches.type` has no
  `CHECK` (migration 0013): `creerFiche` is the guard ("Type de fiche inconnu."). A migration whose first line is
  `-- migrate: sans-cles-etrangeres` runs with foreign keys off and `foreign_key_check` before commit (`db.ts`).
- Image engine (`kanevas-images`, `src/services/images/`): `choisirAdaptateur()` (AD-88) picks `bouchon` with
  `KANEVAS_STUB=1`, else `codex` if an executable `codex` is on the `PATH` and `$CODEX_HOME/auth.json` exists
  (existence only, never read), else `aucun` — never a silent stub. `CODEX_HOME` and the scratch root are read in
  `config/env.ts` only. A result must have an inline-served image signature (`typeParSignature`, AD-66) or it is
  an `ErreurGeneration`, whose message is fixed: engine output and errors may quote `auth.json`, so the child runs
  with `stdio: 'ignore'` and nothing of it is logged. The `codex` adapter lists `generated_images/` before and
  after (one engine at a time: `verrou.ts`), deletes the new file(s) and its scratch directory, 150 s deadline
  (AD-90). The Dockerfile pins `@openai/codex` (`CODEX_VERSION`).
- Sheet visibility (`kanevas-fiche-mj-seul`, B-57, rule 11 of `docs/donnees.md`): a sheet has none of its own. `visibleJoueurs` is computed in the query (`SQL_VISIBLE_JOUEURS`, `services/fiches.ts`) from `sections.joueurs_lisent` and given to the GM outside player mode only; never store it in a column, never recompute it in the browser, never count the author's right of a player as « visible ».
