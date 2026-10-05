# kanevas — agent instructions

- Code and doc comments in English; `.agent/*` stays French.
- Commit messages in French: subject, then the *why*. Explicit paths
  (`git add <path>...`, never `git add -A`/`.`), no AI attribution trailers —
  same convention as `k8s-home-lab`.
- Build and test in containers only:
  `docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run typecheck && npm test"`
- `npm run typecheck` : `tsc --noEmit`. `npm test` : `node --import tsx --test`
  on the files found by `find` — Node 20 (CI, image) does not expand globs
  itself, so never pass it a quoted `src/**` pattern; no extra test runner
  dependency.
- `package.json` carries no `version` field: the app's version is never read
  from it. The only source of truth is the `APP_VERSION` Docker build-arg
  (`Dockerfile`), which the CI derives from the pushed semver tag
  (`.github/workflows/docker-publish.yml`, `docker/metadata-action`). Do not
  reintroduce a version in `package.json` to "keep it in sync" — that is
  exactly the two-sources bug this socle was built to avoid.
- Release: `git tag vX.Y.Z && git push origin vX.Y.Z` builds and publishes
  `ghcr.io/antorfr/kanevas:X.Y.Z` (package public). Deploying is a separate
  change in `k8s-home-lab` (chart version + image tag pinned there).
- No ORM: SQLite through `better-sqlite3` (Node 20 has no `node:sqlite`),
  numbered SQL migrations in `src/db/migrations/` applied at startup by
  `src/db/db.ts` (AD-14; `npm run build` copies them to `dist/`). Tables are
  those of `docs/donnees.md`; only `src/services/` reads or writes them
  (AD-2) — routes and agent tools never carry SQL. A migration takes the next
  number when its slice merges (AD-51).
- Attachments (AD-7, AD-65): bytes under `<db dir>/attachments/` (`ATTACHMENTS_DIR`), written only through
  `services/stockage.ts` (tmp/ then rename; `tmp/` emptied at startup). `deposerPieceJointe` in
  `services/pieces-jointes.ts` is the single upload function — later features (images, map backgrounds)
  reuse it or `stockage.ts`, never write the volume themselves. The type is sniffed from the bytes, never trusted.
- `frontend/` (React, Vite, `react-router`; AD-16, AD-57): `npm run build` also builds it into
  `dist/public`, served by `routes/session.ts` behind the session guard (`@fastify/static` for
  `/assets/`, `index.html` as the fallback of any other GET). A screen is one file
  `frontend/src/ecrans/<nom>.tsx` exporting an `Ecran` (`registre.ts`) — never edit the router or
  the sidebar; sidebar items live in `items.ts` and show only when a registered screen answers
  their address. Colours only through `frontend/src/ui/tokens.css` (`docs/charte.md`). Tests of the
  built-app routes set `FRONTEND_DIR` (under `NODE_ENV=test` no build is looked up otherwise).
- `services/llm/*` (transport.ts, anthropic-transport.ts,
  claude-agent-transport.ts) are reprised from `Antre-du-maitre` (AD-10) and
  unused by any route yet — kept compiling, not wired in. The admin
  setup-token window (`services/claude-token.ts` upstream) was deliberately
  not reprised: it is a content route, out of scope for a socle that calls no
  LLM. Reintroduce it only alongside the feature that actually activates this
  transport.
- `routes/auth.ts` authenticates the identity (OIDC login/callback) and opens
  the signed session cookie (`routes/session.ts`, AD-56), creating the account
  on first sign-in (AD-13). Universe roles never come from Authelia nor the
  session (AD-9): they are read from the members table at each request. Routes
  needing a session are registered in the guarded scope of
  `registerSessionRoutes` (AD-15). `KANEVAS_STUB=1` (AD-55) swaps Authelia for
  `/connexion-bouchon` and refuses to start if any `OIDC_*` variable is set.
- Update `.agent/status.md` in the same commit as the work it reflects — except in a task of a chain feature, which leaves it alone: the feature's assembly writes it once (two tasks both adding to it conflict at integration).
- `src/services/{campagnes,scenarios,preparation,comptes_rendus}.ts` (`kanevas-suivi`): scenarios and
  preparation tasks take a **campaign id and no universe id** — the GM guard is evaluated on the
  campaign's own universe (`exigerMJDeCampagne`, AD-47), and a player, a foreign GM or an unknown id
  all get `introuvable`. Never add a `universId` parameter there. `creerCompteRendu` is the only
  non-GM creation of a sheet (AD-61); no function deletes anything.
- Search and relations (`kanevas-relier-chercher`): search is `listerFiches({recherche})`, never a second
  function (AD-63). The FTS5 indexes (migration 0005) only deliver candidate ids and are kept by SQL
  triggers (AD-21) — never write to `recherche_*` from code. A relation is read under both guards
  (`lireRelations`: carrying section and target sheet readable, AD-64); do not add a count or a
  placeholder for hidden ones. Refusal codes: `auto_relation` (invalide), `relation_existante` and
  `limite_relations` (conflit) : the service puts the code in `ErreurService.detail`, the route sends it as `code` in the body.
