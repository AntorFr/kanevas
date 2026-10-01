# Status — kanevas

> MàJ : 2026-10-02

**Socle posé (ce dépôt) :** squelette Fastify minimal, route de santé
`/healthz` (texte brut `kanevas <version>`, version exclusivement tirée du
build-arg Docker `APP_VERSION`, jamais de `package.json`), mécanique OIDC
générique reprise d'Antre-du-maitre et arrêtée à l'authentification de
l'identité (aucune résolution de rôle, AD-9 reste pour `kanevas-identite`),
transports LLM repris et réservés (aucune route ne les appelle encore),
Dockerfile multi-stage non-root. CI `docker-publish.yml` **écrite, committée
localement, mais pas encore poussée** — voir blocage ci-dessous.

**Bloquant (arbitrage) :** `git push origin task/kanevas-socle-repo` est
rejeté par la forge dès que le push touche `.github/workflows/*` : « refusing
to allow a Personal Access Token to create or update workflow without
`workflow` scope ». Le jeton de ce pod (`SDLC_GIT_CREDENTIAL`/`GH_TOKEN`,
même valeur) n'a pas ce scope — ni `gh`, ni l'API Contents avec le même
jeton n'y échapperaient, la restriction est sur le jeton, pas sur la
commande. Pas de contournement par un autre jeton du pod (dans l'esprit du
refus, même principe que l'arbitrage précédent de cette fiche sur la création
du dépôt). Poussé quand même : tout le reste (app, Dockerfile, doc,
conventions) — un second commit local, non poussé, ajoute uniquement
`.github/workflows/docker-publish.yml` (contenu revu dans la discussion de
la fiche). Il suffit de pousser ce second commit une fois le scope accordé
(ou que Monsieur l'ajoute lui-même depuis la discussion).

**Pièges rencontrés :**
- Docker absent du pod où ce socle a été écrit : le critère `docker build
  --build-arg APP_VERSION=0.1.0 .` n'a pas pu être exécuté tel quel ici. Vérifié
  à la place avec Node directement (`APP_VERSION=0.1.0 node dist/server.js`,
  qui est exactement ce que `ENV APP_VERSION=${APP_VERSION}` produit au
  runtime) — `/healthz` répond `kanevas 0.1.0`. Le build Docker réel reste à
  confirmer par qui a accès à un démon Docker (revue, intégration).
- `claude-agent-transport.ts` (Antre-du-maitre) dépend de
  `services/claude-token.ts` (fenêtre admin de setup-token, route de contenu).
  Non repris : hors périmètre d'un socle qui n'appelle aucun LLM. Le transport
  a été adapté pour ne garder que l'usage direct de
  `CLAUDE_CODE_OAUTH_TOKEN`/`claude login` local, sans la persistance disque
  du token admin.
- CI : le patron d'Antre-du-maitre n'a pas de job de test (seulement
  `typecheck`) — un `npm test` a quand même été ajouté ici (`node --test`,
  0 dépendance), puisque le testeur de cette tâche va y écrire des tests ;
  il est vert sans aucun fichier de test (0 test, exit 0).

**Suivant :** le testeur de `kanevas-socle-repo` écrit les tests de ce code.
En parallèle (aucune dépendance) : `kanevas-socle-chart` (chart Helm dans
`smart-home-charts`). Puis `kanevas-socle-deploy` (`k8s-home-lab`), qui
épingle le tag publié par ce dépôt et clôt le socle à une URL réelle.
