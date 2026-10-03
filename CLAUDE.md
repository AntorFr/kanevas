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
- `services/llm/*` (transport.ts, anthropic-transport.ts,
  claude-agent-transport.ts) are reprised from `Antre-du-maitre` (AD-10) and
  unused by any route yet — kept compiling, not wired in. The admin
  setup-token window (`services/claude-token.ts` upstream) was deliberately
  not reprised: it is a content route, out of scope for a socle that calls no
  LLM. Reintroduce it only alongside the feature that actually activates this
  transport.
- `routes/auth.ts` stops at identity authentication (OIDC login/callback):
  no session, no role resolution (AD-9), no persistence. Don't extend it
  without reopening `kanevas-identite`'s design first.
- Update `.agent/status.md` in the same commit as the work it reflects.
