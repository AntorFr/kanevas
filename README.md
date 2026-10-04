# kanevas

Système de gestion de JDR (lore, campagnes, comptes-rendus, droits, cartes).
Ce dépôt porte le socle (dépôt, image, CI, route de santé) et, sur la branche
`feature/kanevas-recours-admin`, l'administration d'instance : un compte du groupe Authelia
`parents` voit les univers et leurs membres (jamais le contenu) et les répare (E-5, B-6).

## Structure

```txt
Dockerfile                        Image unique : API Fastify
frontend/                         React/Vite ; écran E-5 : frontend/src/ecrans/administration.tsx
src/
  server.ts                       Point d'entrée, démarre l'app Fastify
  app.ts                          Assemble les plugins et les routes
  config/env.ts                   Variables d'environnement (zod)
  routes/health.ts                GET /healthz — nom + version de l'app
  routes/auth.ts                  Mécanique OIDC générique (voir plus bas)
  routes/instance.ts              /api/instance : univers et membres, admin seulement (AD-87)
  services/instance.ts            Fonctions de l'admin d'instance, sur `membres` seule (AD-86)
  services/oidc.ts                Découverte OIDC, config client
  services/llm/                   Transports LLM repris d'Antre-du-maitre,
                                   réservés aux futures features — aucune
                                   route de ce socle ne les appelle
.github/workflows/docker-publish.yml   CI : typecheck, tests, puis image GHCR (les tests bloquent l'image)
```

## Démarrage local

```bash
docker run --rm -p 3001:3001 -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
# puis, depuis l'hôte : curl http://localhost:3001/healthz
```

Ou, avec un Node 20+ installé localement :

```bash
npm install
cp .env.example .env
npm run dev            # ou : npm run build && npm start (sert dist/server.js)
curl http://localhost:3001/healthz   # -> "kanevas 0.0.0-dev"
```

## Lancer en bouchon (recette)

Le mode bouchon (`KANEVAS_STUB=1`, AD-55) remplace Authelia par le choix d'un compte de test
(antor, lea, teo, mira, admin — ce dernier porte le groupe `parents`). Ne jamais l'ouvrir en production ;
il refuse de démarrer si une variable `OIDC_*` est posée.

```bash
docker build -t kanevas:stub .
docker run --rm -p 3001:3001 -e KANEVAS_STUB=1 kanevas:stub
# sans docker (le frontend n'est servi qu'après le build) :
#   npm ci && npm run build && KANEVAS_STUB=1 node dist/server.js
# puis ouvrir http://localhost:3001/connexion-bouchon, choisir « Admin », aller sur /administration
```

Où vivent les données : dans l'image, `/data/kanevas.db` du conteneur (perdue avec `--rm`, donc vide à
chaque lancement) ; sans docker, `./data/kanevas.db` et `./data/session.key` (ignorés par git ; `DB_PATH`
déplace la base, `rm -r data` repart de zéro). Aucun univers n'existe au départ : en Antor, « Créer un
univers » (`/univers/nouveau`) ; on change de compte par « Se déconnecter » de la barre latérale.
`npm run dev` ne sert que l'API : l'interface demande `npm run build` (ou `npm run dev:front`, Vite seul).
Le conteneur de « Démarrage local » réécrit `node_modules` de l'hôte avec des binaires Linux : n'enchaînez pas avec un Node local sans `rm -r node_modules`.

## Réglages

La liste de départ est `.env.example`. En plus : `DB_PATH` (fichier SQLite), `SESSION_SECRET` (16 caractères au moins ; sinon créé dans `data/session.key`), `KANEVAS_STUB`, `APP_NAME` (défaut `kanevas`),
`APP_VERSION` (défaut `0.0.0-dev`, posée par le build-arg en image), `PORT` (3001), `LLM_PROVIDER` (`mock` | `anthropic` | `claude-agent`, défaut `mock`,
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
tag publié. Hors tag (`main`, PR), la valeur n'est pas un semver : seul un tag donne une version fiable.

## OIDC

`GET /api/auth/oidc/login` et `GET /api/auth/oidc/callback` reprennent la
mécanique générique d'Antre-du-maitre (découverte OIDC, PKCE, state), arrêtée
à l'authentification de l'identité : le callback ouvre la session (cookie signé,
7 jours, AD-56) et crée le compte à la première connexion ; les rôles d'univers ne
viennent jamais d'Authelia (AD-9). `KANEVAS_STUB=1` remplace Authelia par le choix d'un
compte de test (`/connexion-bouchon`, AD-55). `GET /api/auth/config` répond `{oidcEnabled}`. Sans les quatre variables
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
