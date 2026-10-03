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
- No ORM, no SQL table in this repo yet: AD-5 (SQLite) only reserves the
  volume mount (`/data`), `kanevas-identite` is the first feature to write to
  it. Don't add a database dependency "to be ready" — `socle-projet` is a skill of the SDLC pipeline outside this repo: the rule is simply that no DB lands before the feature that needs it.
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
- Update `.agent/status.md` in the same commit as the work it reflects — except in a task of a chain feature, which leaves it alone: the feature's assembly writes it once (two tasks both adding to it conflict at integration).
