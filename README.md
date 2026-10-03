# kanevas

Système de gestion de JDR (lore, campagnes, comptes-rendus, droits, cartes).
Ce dépôt n'héberge, à ce stade, que le **socle** : le squelette qui relie
dépôt, image, CI et route de santé, sans aucune fonction métier.

## Structure

```txt
Dockerfile                        Image unique : API Fastify
src/
  server.ts                       Point d'entrée, démarre l'app Fastify
  app.ts                          Assemble les plugins et les routes
  config/env.ts                   Variables d'environnement (zod)
  routes/health.ts                GET /healthz — nom + version de l'app
  routes/auth.ts                  Mécanique OIDC générique (voir plus bas)
  services/oidc.ts                Découverte OIDC, config client
  services/llm/                   Transports LLM repris d'Antre-du-maitre,
                                   réservés aux futures features — aucune
                                   route de ce socle ne les appelle
  **/*.test.ts, e2e/healthz.test.ts  Tests (node:test), /healthz sur le serveur réel
.github/workflows/docker-publish.yml   CI : tests (typecheck + npm test), puis image GHCR
```

## Démarrage local

```bash
docker run --rm -p 3001:3001 -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
# puis, depuis l'hôte : curl http://localhost:3001/healthz
```

Ce bloc ne pose pas de `.env` : les valeurs par défaut suffisent pour `/healthz`, OIDC
reste désactivé (`/api/auth/oidc/login` répond 404). Pour l'activer, créer `.env` (voir
`.env.example`) à la racine : le montage `-v "$PWD":/src` le rend lisible. Ce bloc crée
aussi `node_modules/` dans le dépôt de l'hôte (ignoré par git) ; il appartient à root : à supprimer par `docker run … rm -rf node_modules`
ou `sudo`.

Ou, avec un Node 20+ installé localement :

```bash
npm install
cp .env.example .env
npm run dev            # ou : npm run build && npm start (sert dist/server.js)
curl http://localhost:3001/healthz   # -> "kanevas 0.0.0-dev"
```

## Réglages

La liste de départ est `.env.example` (`PORT`, OIDC, `LLM_PROVIDER` en commentaire). Réglages
absents du fichier : `APP_NAME` (défaut `kanevas`), `APP_VERSION` (défaut `0.0.0-dev`, posée par
le build-arg en image). Rappel : `PORT` (3001), `LLM_PROVIDER` (`mock` | `anthropic` | `claude-agent`, défaut `mock`,
inutilisé tant qu'aucune route n'appelle un LLM).

## Version de l'application

`/healthz` répond `kanevas <version>`. Cette version vient **exclusivement**
du build-arg Docker `APP_VERSION`, jamais de `package.json` (qui n'en porte
volontairement pas) :

```bash
# sans --build-arg, la version vaut 0.0.0-dev
docker build --build-arg APP_VERSION=0.1.0 -t kanevas:0.1.0 .
docker run --rm -p 3001:3001 kanevas:0.1.0
curl http://localhost:3001/healthz   # -> "kanevas 0.1.0"
```

Sur un tag, la CI dérive ce même build-arg du tag semver poussé (`docker/metadata-action`)
: pousser `v0.1.0` publie `ghcr.io/antorfr/kanevas:0.1.0` avec `APP_VERSION`
embarqué à `0.1.0` — une seule source de vérité pour la version affichée et le
tag publié. Hors tag (`main`, PR), la valeur n'est pas un semver : `metadata-action` y sort le nom
de la ref (`main`, `pr-<n>`), d'après sa documentation et non constaté en CI. Seul un tag
donne une version fiable.

## OIDC

`GET /api/auth/oidc/login` et `GET /api/auth/oidc/callback` reprennent la
mécanique générique d'Antre-du-maitre (découverte OIDC, PKCE, state), arrêtée
à l'authentification de l'identité : le callback confirme qui s'est connecté
(`subject`, `username`) mais ne pose aucune session ni résolution de rôle —
la base `univers_membres` (AD-9) n'existe pas encore. C'est
`kanevas-identite`, pas ce socle, qui construit la suite. `GET /api/auth/config` répond `{oidcEnabled}`. Sans les quatre variables
`OIDC_*` posées (voir `.env.example`) — même si une partie seulement l'est —
login et callback répondent `404` : pas de mode dégradé. Une valeur posée mais
vide ou invalide (URL mal formée) fait en revanche échouer le démarrage
(`ZodError`, `src/config/env.ts`).

## Déploiement

Hors de ce dépôt : chart Helm `charts/kanevas` dans `smart-home-charts`,
manifeste `clusters/tantive/games/kanevas-helm-config.yml` et client OIDC
`kanevas` (`clusters/homenode/infra/authelia-helm-config.yml`) dans
`k8s-home-lab`. Ordre : publier l'image (tag `vX.Y.Z`), publier le chart, puis
fusionner `k8s-home-lab`, dont la fusion déploie.

Pour la carte du code, les invariants et les options écartées, voir
`ARCHITECTURE.md`. Les sigles `AD-n` renvoient aux décisions de l'epic Kanevas (magasin de
pilotage de la chaîne SDLC, hors de ce dépôt ; les commentaires qui citent
`plan.md`, `technique.md` ou `socle-projet` en viennent), dont `ARCHITECTURE.md` résume celles qui touchent ce dépôt (AD-3 Node/TypeScript,
AD-4 Fastify, AD-5 SQLite, AD-9 rôles par univers, AD-10 reprise d'Antre-du-maitre).
