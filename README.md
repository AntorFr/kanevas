# kanevas

Système de gestion de JDR (lore, campagnes, comptes-rendus, droits, cartes).
Ce dépôt porte le socle (santé, OIDC, image, CI) et la **première fonction métier** :
un MJ crée un univers, y réunit ses joueurs et y écrit des fiches dont chaque section a
son audience ; un joueur ne lit que ce que l'audience lui ouvre. Ce que le produit permet et
par quels écrans : `docs/parcours.md`, `docs/ecrans.md`, `docs/donnees.md`. Il y ajoute le **système de jeu** : un référentiel (règles, créatures, objets) que plusieurs
univers se partagent, rattaché depuis les paramètres de l'univers. Elle porte aussi les **relations** entre fiches (bloc Relations de la fiche) et la **recherche** dans un type de fiche. Ni
pièces jointes, ni campagnes, ni assistant, ni administration d'instance ne sont
construits (tranches suivantes) : les passages de ces docs qui les décrivent sont la cible.

## Structure

```txt
Dockerfile                        Image unique : API Fastify + frontend construit
src/
  server.ts, app.ts               Démarrage ; assemblage des plugins et des routes
  config/env.ts                   Variables d'environnement (zod)
  db/                             SQLite (better-sqlite3), migrations/0001 à 0003, runner
  services/                       comptes, univers, membres, fiches, sections, droits, systemes, relations :
                                   seul code qui lit ou écrit les données ; session, oidc
  routes/                         health, auth (OIDC), session (cookie, garde, /api/moi),
                                   bouchon, univers (+ membres), systemes, fiches (+ sections), frontend
  services/llm/                   Transports LLM repris d'Antre-du-maitre, branchés nulle part
frontend/                         React + Vite : charte (ui/), écrans (src/ecrans/), barre latérale
.github/workflows/docker-publish.yml   CI : tests, build, image GHCR
```

Un écran est un fichier `frontend/src/ecrans/<nom>.tsx` enregistré par le registre
(`frontend/src/registre.ts`) ; les couleurs ne viennent que de `frontend/src/ui/tokens.css`
(`docs/charte.md`).

## Démarrage local

```bash
# écrit node_modules/ et ./data/ (base et session.key) dans le dépôt monté, en root ; les deux sont ignorés par git.
# Sans `npm run build` préalable, cette voie ne sert que l'API : voir plus bas.
docker run --rm -p 3001:3001 -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
# puis, depuis l'hôte : curl http://localhost:3001/healthz
```

Ce bloc ne pose pas de `.env` : les valeurs par défaut suffisent pour `/healthz`, OIDC
reste désactivé (`/api/auth/oidc/login` répond 404). Pour l'activer, créer `.env` (voir
`.env.example`) à la racine : le montage `-v "$PWD":/src` le rend lisible. Ce bloc crée
aussi `node_modules/` dans le dépôt de l'hôte (ignoré par git) ; il appartient à root : à supprimer par
`docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim rm -rf node_modules` ou `sudo rm -rf node_modules`.

Ou, avec un Node 20+ installé localement :

```bash
npm install
cp .env.example .env
npm run dev            # ou, sans rechargement : npm run build && npm start (`npm start` seul échoue sans `dist/`, ignoré par git)
curl http://localhost:3001/healthz   # -> "kanevas 0.0.0-dev"
```

`npm run dev` sert l'API, et le frontend seulement s'il a été construit : lancer d'abord
`npm run build` (il construit `dist/public`, servi par Fastify derrière la session ; sans lui, `/`
ne montre aucun écran). `npm run dev:front` lance Vite seul (port 5173 par défaut) et ne relaie que
`/api` vers `http://localhost:3001` (écrit en dur dans `frontend/vite.config.ts` : à changer si `PORT` change) : il ne remplace pas le serveur pour la connexion en bouchon. Pour l'utiliser : lancer d'abord le
serveur en bouchon (port 3001), s'y connecter sur `http://localhost:3001/`, puis ouvrir
`http://localhost:5173/` (le cookie de session ne dépend pas du port).

La voie de référence reste le conteneur Node 20 de `CLAUDE.md` (celle de la CI) ; un Node local
récent suffit pour les mêmes commandes.

### Sans Authelia : le mode bouchon

```bash
npm run build && KANEVAS_STUB=1 npm start   # puis ouvrir http://localhost:3001/ : choix d'un compte de test
# sans écrire dans ./data/ ni sur le port 3001 : npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start
# (Ctrl-C l'arrête ; lancé en arrière-plan, kill du processus ; supprimer /tmp/k.db pour repartir d'une base vide)
```

`/connexion-bouchon` remplace Authelia (AD-55) sous un bandeau « mode bouchon ». Les comptes de test
ont pour identifiants `antor`, `lea`, `teo`, `mira` et `admin` (noms affichés Antor, Léa…) : c'est
l'identifiant qu'on tape pour ajouter un membre. Un compte n'existe qu'après sa première connexion :
pour ajouter Léa, se connecter d'abord une fois en Léa (sinon « Ce compte ne s'est jamais connecté. »). Kanevas refuse de
démarrer en bouchon si une variable `OIDC_*` est posée. Avec `NODE_ENV=production` (celui de l'image ; `npm start` ne le pose pas) et sans volume `/data`, la base est en
mémoire (avertissement au démarrage).

### Tests de bout en bout

`npm test` joue aussi `src/e2e/` : `node dist/server.js` en bouchon, piloté par un vrai Chromium via
Playwright. Le build n'est lancé que si `dist/public/index.html` manque : après un changement dans
`src/` ou `frontend/`, relancer `npm run build` avant `npm test`, sinon ces tests jouent l'ancien code.
Les textes de `docs/ecrans.md` sont écrits avec l'apostrophe droite ; l'interface porte l'apostrophe typographique (’).
Playwright n'est pas une dépendance du dépôt : il doit être installé globalement
(`/usr/lib/node_modules` ou `/usr/local/lib/node_modules`) avec un Chromium, ce que ne fait ni
`node:20-bookworm-slim` ni la CI GitHub. Là où il manque, ces tests sont **ignorés avec un message**,
sans échec ; les autres tests (services, routes HTTP) tournent partout. Compter 5 à 6 minutes pour la suite complète avec les e2e. La CI ne joue donc pas les e2e.

## Réglages

La liste de départ est `.env.example`. En plus : `APP_NAME` (défaut `kanevas`),
`APP_VERSION` (défaut `0.0.0-dev`, posée par le build-arg en image), `PORT` (3001), `DB_PATH` (fichier SQLite ; défaut `/data/kanevas.db` avec `NODE_ENV=production`, `./data/kanevas.db` en développement), `SESSION_SECRET` (≥ 16 caractères ; à défaut `session.key`, créée à côté de la base : `/data/session.key` en production, `./data/session.key` en développement), `KANEVAS_STUB` (`1`), `LLM_PROVIDER` (`mock` | `anthropic` | `claude-agent`, défaut `mock`,
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

Pour la carte du code, les invariants et les options écartées, voir `ARCHITECTURE.md`, dont le
tableau liste toutes les décisions `AD-n` de l'epic Kanevas, avec leur numéro stable. Des
commentaires du code citent encore `plan.md`, `technique.md` ou `socle-projet` : ce sont des
documents de conception tenus hors de ce dépôt (magasin de pilotage de la chaîne SDLC), dont ce
qui doit survivre est dans `ARCHITECTURE.md` et `docs/`.
