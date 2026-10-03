# Status — kanevas

> MàJ : 2026-10-03

**État :** socle posé sur `feature/kanevas-socle` (PR ouverte, non fusionnée) :
`/healthz` (`kanevas <version>`, version = build-arg `APP_VERSION`), OIDC
d'identité, transports LLM réservés, Dockerfile (utilisateur `node`, mais le pod tourne en root au cluster), CI
`docker-publish.yml` (test puis image GHCR). Typecheck et 8 tests verts. Carte et
invariants : `ARCHITECTURE.md`.

**Pièges :**
- La CI ne publie `ghcr.io/antorfr/kanevas:0.1.0` que sur le tag `v0.1.0`, à
  pousser après la fusion de la PR. Sur la branche, aucune image n'existe (la
  PR ne fait qu'un build sans push). `k8s-home-lab` épingle ce tag.
- `docker build` n'a jamais tourné dans les pods de la chaîne (pas de démon) :
  vérifié avec Node (`APP_VERSION=0.1.0 node dist/server.js`). Le premier vrai
  build est celui de la CI.

**Suivant :** `kanevas-identite` (session, rôles AD-9, première écriture dans
`/data`).

**Tâche `kanevas-pf-donnees` (branche `task/kanevas-pf-donnees`) :** `src/db/`
(better-sqlite3, migration 0001, runner idempotent) et `src/services/`
(`comptes`, `univers`, `membres`, `fiches`, `sections`, `droits`) faits ; la
base s'ouvre dans `buildApp` (`app.db`). Erreurs : `ErreurService.code`
(`introuvable` 404, `refuse` 403, `invalide` 400, `conflit` 409
`section_modifiee`). Sans `/data` en production, base en mémoire avec avertissement
(le test e2e de `/healthz` tourne ainsi). Pas encore de tests de service ni de route.
