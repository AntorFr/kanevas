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
.github/workflows/docker-publish.yml   CI : build, typecheck, image GHCR
```

## Démarrage local

```bash
docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
```

Ou, avec un Node 20+ installé localement :

```bash
npm install
cp .env.example .env
npm run dev
curl http://localhost:3001/healthz   # -> "kanevas 0.0.0-dev"
```

## Version de l'application

`/healthz` répond `kanevas <version>`. Cette version vient **exclusivement**
du build-arg Docker `APP_VERSION`, jamais de `package.json` (qui n'en porte
volontairement pas) :

```bash
docker build --build-arg APP_VERSION=0.1.0 -t kanevas:0.1.0 .
docker run --rm -p 3001:3001 kanevas:0.1.0
curl http://localhost:3001/healthz   # -> "kanevas 0.1.0"
```

La CI dérive ce même build-arg du tag semver poussé (`docker/metadata-action`)
: pousser `v0.1.0` publie `ghcr.io/antorfr/kanevas:0.1.0` avec `APP_VERSION`
embarqué à `0.1.0` — une seule source de vérité pour la version affichée et le
tag publié.

## OIDC

`GET /api/auth/oidc/login` et `GET /api/auth/oidc/callback` reprennent la
mécanique générique d'Antre-du-maitre (découverte OIDC, PKCE, state), arrêtée
à l'authentification de l'identité : le callback confirme qui s'est connecté
(`subject`, `username`) mais ne pose aucune session ni résolution de rôle —
la base `univers_membres` (AD-9) n'existe pas encore. C'est
`kanevas-identite`, pas ce socle, qui construit la suite. Sans les quatre
variables `OIDC_*` posées (voir `.env.example`), ces deux routes répondent
`404` : pas de mode dégradé.

## Déploiement

Hors de ce dépôt : chart Helm dans `smart-home-charts` (`charts/kanevas`),
manifeste de cluster et entrée OIDC Authelia dans `k8s-home-lab` — voir
`epics/kanevas/technique.md` et `features/kanevas-socle/technique.md` dans le
magasin de pilotage.
