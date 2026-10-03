# Status — kanevas

> MàJ : 2026-10-03

**État :** socle posé sur `feature/kanevas-socle` (PR ouverte, non fusionnée) :
`/healthz` (`kanevas <version>`, version = build-arg `APP_VERSION`), OIDC
d'identité, transports LLM réservés, Dockerfile (utilisateur `node`, mais le pod tourne en root au cluster), CI
`docker-publish.yml` (test puis image GHCR). Typecheck et 21 tests verts. Carte et
invariants : `ARCHITECTURE.md`.

**Pièges :**
- La CI ne publie `ghcr.io/antorfr/kanevas:0.1.0` que sur le tag `v0.1.0`, à
  pousser après la fusion de la PR. Sur la branche, aucune image n'existe (la
  PR ne fait qu'un build sans push). `k8s-home-lab` épingle ce tag.
- `docker build` n'a jamais tourné dans les pods de la chaîne (pas de démon) :
  vérifié avec Node (`APP_VERSION=0.1.0 node dist/server.js`). Le premier vrai
  build est celui de la CI.

**Réouverture (verify) :** commentaires de code et Dockerfile/CI passés en
anglais (CLAUDE.md), références à `plan.md`/`technique.md` retirées des
commentaires (absents du dépôt). Le commit 283899b porte un trailer
`Co-Authored-By` contraire à CLAUDE.md : le retirer demande de réécrire
l'historique de la branche (force-push), à décider par le mainteneur ; une
fusion en squash à la PR l'efface.

**Suivant :** `kanevas-identite` (session, rôles AD-9, première écriture dans
`/data`).
