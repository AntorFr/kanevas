# kanevas

Système de gestion de JDR (lore, campagnes, comptes-rendus, droits, cartes).
Ce dépôt porte le socle (santé, OIDC, image, CI), la **première fonction métier** :
un MJ crée un univers, y réunit ses joueurs et y écrit des fiches dont chaque section a
son audience ; un joueur ne lit que ce que l'audience lui ouvre. Ce que le produit permet et
par quels écrans : `docs/parcours.md`, `docs/ecrans.md`, `docs/donnees.md`. Les sigles : E-n = un écran (`docs/ecrans.md`), B-n = un besoin, P-n = un parcours, AD-n = une décision d'architecture (`ARCHITECTURE.md`).

Au-delà de la première fonction métier, le dépôt porte le **système de jeu** : un référentiel (règles, créatures, objets) que plusieurs
univers se partagent, rattaché depuis les paramètres de l'univers. Il porte aussi le **suivi de la séance** : campagnes, scénarios (MJ), préparation en cinq catégories (MJ) et comptes-rendus (tout membre). Il porte enfin les **pièces jointes** : sur chaque section, déposer un fichier, voir une image, télécharger
les autres, marquer secrète (MJ), retirer. Il porte l'**administration d'instance** : un compte du groupe Authelia `parents` voit les univers et leurs membres (jamais le contenu) et les répare (E-5, B-6). Chaque fiche peut porter une **illustration** (posée par le MJ, grille de cartes E-8, en-tête de E-9), et les **systèmes de jeu** ont leur écran hors des univers (E-16, E-15). Il porte aussi les **relations** entre fiches (bloc Relations de la fiche) et la **recherche** dans un type de fiche, les **cartes** (E-10, E-11 : carte illustrée avec fond et tokens, ou graphe des relations ; visibles ou non des joueurs ; bloc « Cartes visibles » de E-3) et l'**assistant** de chaque membre (E-12 : un panneau de conversation qui cherche, lit, écrit et, pour le MJ, crée une campagne ou un scénario et **propose une mise à jour d'une section** d'après un compte-rendu, que seul son geste « Appliquer » écrit, avec exactement les droits de la personne ; l'accès au modèle passe par l'abonnement Claude de l'exploitant, `CLAUDE_CODE_OAUTH_TOKEN` ou, sans redéploiement, le jeton que l'admin d'instance pose depuis l'administration, et en bouchon un script répond). La
génération d'images n'est pas
construite (tranches suivantes) : les passages de ces docs qui les décrivent sont la cible.

## Structure

```txt
Dockerfile                        Image unique : API Fastify + frontend construit
scripts/faux-setup-token.mjs        Le `claude setup-token` du bouchon (copié dans l'image)
src/
  server.ts, app.ts               Démarrage ; assemblage des plugins et des routes
  config/env.ts                   Variables d'environnement (zod)
  db/                             SQLite (better-sqlite3), migrations/0001 à 0012, runner
  services/                       comptes, univers, membres, instance, fiches, sections, droits, systemes, relations, campagnes, scenarios, preparation, comptes_rendus, propositions, markdown (rendu unique), types, types-fiche (la liste des types et leur activation),
                                   pieces-jointes, illustrations, cartes, jetons, lots, import (contexte du jeton), import-fiches (API d'import), stockage (octets sur le volume) :
                                   seul code qui lit ou écrit les données ; session, oidc
  routes/                         health, auth (OIDC), session (cookie, garde, /api/moi),
                                   bouchon, univers (+ membres), instance (admin, AD-87), systemes, suivi, cartes, fiches (+ sections), propositions, assistant, acces-api (E-18, session), import (API d'import à jeton, `/api/import/v1`), frontend
  bouchon/                        Monde de démonstration semé au démarrage en bouchon (depart.ts) et ses fichiers (demo/)
  services/assistant/             L'assistant : catalogues d'outils, port AgentTransport (bouchon, claude-agent), orchestration, jeton et sa session de connexion
  services/llm/                   Transports LLM repris d'Antre-du-maitre, branchés nulle part
frontend/                         React + Vite : charte (ui/), écrans (src/ecrans/, dont E-5 administration.tsx), barre latérale
.github/workflows/docker-publish.yml   CI : tests, build, image GHCR
```

Un écran est un fichier `frontend/src/ecrans/<nom>.tsx` enregistré par le registre
(`frontend/src/registre.ts`) ; les couleurs ne viennent que de `frontend/src/ui/tokens.css`
(`docs/charte.md`). Le cadre (`Cadre.tsx`, `Barre.tsx` : navigation à icônes, barre haute, tiroir au téléphone,
menu de l'avatar qui porte le thème et la déconnexion) et les composants partagés (`frontend/src/ui/` : bouton, menu, toast,
boîte de dialogue, interrupteur, pastille…) sont communs à tous les écrans. Les polices (Fraunces, Newsreader, Inter,
`@fontsource`) et les icônes (`lucide-react`) sont empaquetées, sans requête vers un hôte tiers (AD-92).

Tests sans Docker : `npm run typecheck` puis `npm test` (ils jouent aussi les e2e là où Playwright est installé, ce qui est long : voir « Tests de bout en bout » ; un seul fichier : `node --import tsx --test src/e2e/<fichier>.test.ts`, et jamais deux suites à la fois, les e2e démarrent leurs serveurs et échouent en masse sous concurrence ; après un renumérotage de migration, `rm -rf dist` avant `npm run build`, sinon l'ancien fichier copié reste dans `dist/db/migrations` et le serveur ne démarre plus) ; la voie Docker de référence est dans `CLAUDE.md`.

## Démarrage local

Pour **voir les écrans** : la commande de la section « mode bouchon » plus bas (`npm ci && npm run build && KANEVAS_STUB=1 npm start`). Le bloc ci-dessous ne sert que l'API (`/healthz`).

```bash
# écrit node_modules/ et ./data/ (base et session.key) dans le dépôt monté, en root ; les deux sont ignorés par git.
# Sans `npm run build` préalable (fait dans l'hôte, hors de cette commande), cette voie ne sert que l'API : voir plus bas.
# Pour voir les écrans (dont E-5, `/administration`) : même conteneur, mais `sh -c "npm ci && npm run build && KANEVAS_STUB=1 npm start"`
# (ou, avec Node ≥ 20 sur l'hôte, `npm ci` puis la commande de la section « mode bouchon »).
docker run --rm -p 3001:3001 -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
# puis, depuis l'hôte : curl http://localhost:3001/healthz
```

Ce bloc ne pose pas de `.env` : les valeurs par défaut suffisent pour `/healthz`, OIDC
reste désactivé (`/api/auth/oidc/login` répond 404). Pour l'activer, créer `.env` (voir
`.env.example`) à la racine : le montage `-v "$PWD":/src` le rend lisible. Ce bloc crée
aussi `node_modules/` dans le dépôt de l'hôte (ignoré par git) ; il appartient à root : à supprimer par
`docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim rm -rf node_modules` ou `sudo rm -rf node_modules`.

Ou, avec un Node 20+ installé localement (`engines` : `>=20` ; la suite passe aussi sous Node 22, la CI joue Node 20) :

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

La voie de référence reste le conteneur Node 20 de `CLAUDE.md` (celle de la CI) ; sans Docker, un Node local
récent suffit pour les mêmes commandes (`npm ci && npm run typecheck && npm test`).

### Sans Authelia : le mode bouchon

```bash
npm ci && npm run build && KANEVAS_STUB=1 npm start   # puis ouvrir http://localhost:3001/ : choix d'un compte de test
# le semis précède l'écoute du port (moins d'une seconde ici) ; sans écrire dans ./data/ ni sur le port 3001 : npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start
# (Ctrl-C l'arrête ; lancé en arrière-plan, kill du processus ; supprimer /tmp/k.db pour repartir d'une base vide ; `session.key` et `attachments/` se créent à côté de la base, donc dans /tmp : prendre un dossier dédié, `DB_PATH=/tmp/kanevas-essai/k.db`, et le supprimer en entier)
```

`/connexion-bouchon` remplace Authelia (AD-55) sous un bandeau « mode bouchon ». Les comptes de test
ont pour identifiants `antor`, `lea`, `teo`, `mira` et `admin` (noms affichés Antor, Léa…) : c'est
l'identifiant qu'on tape pour ajouter un membre. Sur une base sans univers, le bouchon sème au démarrage un monde de
démonstration (« Lame d'Ébène » : Antor MJ, Léa joueuse ; « Les Landes grises » : Mira MJ ; le système « CoF Mini » ;
des fiches, dont certaines illustrées ; « Les Cendres de Vaëlis », Admin MJ et Antor joueur, rattachée à « Chroniques Oubliées Fantasy » ; Teo n'est membre d'aucun univers) ; `KANEVAS_SANS_SEMIS=1` le coupe. En bouchon l'assistant répond par un script de mots-clés qui appelle les vrais outils (AD-78), connecté en `antor` (MJ de « Lame d'Ébène ») : « Crée une campagne « Les Marches rouges » » puis « Crée un scénario « Acte III — La crypte » dans « Les Marches rouges » » (le semis ne contient aucune campagne) ; chez `lea` (joueuse) la création est refusée ; « Lis-moi la section « Vérité » » donne « Introuvable. » à qui ne la lit pas. Un compte créé hors semis n'existe qu'après sa
première connexion (sinon « Ce compte ne s'est jamais connecté. » à l'ajout). Kanevas refuse de
démarrer en bouchon si une variable `OIDC_*` est posée. Avec `NODE_ENV=production` (celui de l'image ; `npm start` ne le pose pas) et sans volume `/data`, la base est en
mémoire (avertissement au démarrage).

**Recette du bloc MJ** (`kanevas-import-secrets`, en bouchon) : dans « Lame d'Ébène », fiche « Port-Sel » (type lieu), section « Histoire ».
Connecté en `lea`, la section se lit sans le mot « sous-main » et n'a pas « Modifier » ; la recherche « sous-main » dans « Lieux » ne rend pas « Port-Sel ».
Connecté en `antor`, le bloc apparaît hachuré avec la pastille « MJ seul », la même recherche rend « Port-Sel », et le mode Joueur redonne la vue de Léa.
En édition, « Bloc MJ » entoure la sélection de `:::mj` et `:::`.

En bouchon seulement, `/demo-composants` (session requise) montre les composants de la charte dans tous leurs états ;
hors bouchon, cette adresse répond 404.

Recette de la mise à jour du monde en bouchon (le semis ne contient ni campagne ni compte-rendu ; « Maître Aldric » a une section « Vérité — MJ seul », que « Vérité » suffit à désigner). Toujours dans « Lame d'Ébène » :
1. En `antor`, dans le panneau de l'assistant (bouton flottant) : « Crée une campagne « Marches » ».
2. Se déconnecter (menu de l'avatar) puis `/connexion-bouchon` : en `lea`, depuis la fiche de la campagne ou l'écran des comptes-rendus (E-13, `docs/ecrans.md`), créer le compte-rendu, titre exactement « Séance 3 » (le bouchon cherche ce titre tel quel), dans cette campagne.
3. En `antor`, dans le panneau : « Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 3 » » ; le fil montre « Mise à jour proposée » (actuel, proposé) et la fiche est inchangée jusqu'à « Appliquer ». « Proposé » = le contenu actuel suivi de « Mise à jour d'après « Séance 3 ». » ; après « Appliquer », le bloc dit « Appliquée : la section « Vérité — MJ seul » est à jour. » et la fiche montre ce contenu.
4. Modifier la section depuis la fiche avant d'appliquer rend la proposition périmée (« Appliquer » désactivé, raison affichée).
5. La même demande en `lea` ne crée rien : l'assistant répond « Je ne peux pas le faire : l'outil « proposer_mise_a_jour » ne fait pas partie de ceux dont vous disposez. », sans bloc. Une proposition ne se retrouve pas après un rechargement du fil (AD-79).

Recette du Markdown en bouchon : dans « Lame d'Ébène », en `antor`, ouvrir la fiche « Maître Aldric », « Modifier » sur la section « Apparence », et écrire un intertitre (`## Quartiers`), une liste, un tableau, `**gras**`, `[site](https://exemple.org)`, `[x](javascript:alert(1))` et `<script>alert(1)</script>`, puis « Aperçu » (il montre ce que lira Léa) et « Enregistrer ». Les intertitres sont décalés d'un cran : `## Quartiers` s'affiche en `<h3>`, sous le titre de la section. En `lea`, la fiche montre l'intertitre, la liste, le tableau et le lien web mis en forme ; le lien `javascript:` et la balise restent du texte, aucun script ne s'exécute. Plafond : 100 000 caractères pour tout texte (sections, comptes-rendus, scénarios, entrées de système, propositions), 100 001 est refusé.

**Recette des types de fiche** (`kanevas-import-types`, en bouchon, serveur lancé sur le port 3055 comme plus haut) : en `antor`, sur « CoF Mini » ▸ onglet « Types de fiche », désactiver « Vaisseau » et « Note » : la barre de « Les Landes grises » (qui suit « CoF Mini ») perd « Vaisseaux » et « Notes ». Sur « Lame d'Ébène » ▸ panneau « Types de fiche » (E-14), mettre « Vaisseau » à Activé : sa barre montre « Vaisseaux », pas « Notes ». Créer un Savoir « Les Cristaux d'Ombre » de sous-type « Ressource », puis « ⋯ » ▸ « Changer le type… » ▸ Note : une boîte annonce que le sous-type sera retiré, et la fiche n'en a plus. En `lea`, « Lieux » ▸ filtre « Sous-type » ▸ « Taverne » : seul « Le Pendu Joyeux » reste. Par l'API, avec le jeton du bouchon (valeur de `JETON_BOUCHON`, `src/bouchon/depart.ts`, `kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue`) dans « Essai Kanka » (id 4 sur une base semée) : `curl -X PUT -H "Authorization: Bearer kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue" -H 'Content-Type: application/json' -d '{"type":"vaisseau","titre":"Aube","sousType":"Frégate"}' http://localhost:3055/api/import/v1/univers/4/fiches/vaisseau:aube` répond `{"id":…,"etat":"creee","avertissements":[]}` (sans `?lot=`, rien n'est compté) ; le même appel rejoué rend `"etat":"inchangee"` ; `JETON_BOUCHON` est la constante de `src/bouchon/depart.ts`.

Recette de l'accès par API en bouchon (« Essai Kanka » est semé : Antor MJ, Léa joueuse, et un « Jeton du bouchon » de valeur fixe `JETON_BOUCHON`, `src/bouchon/depart.ts`). En `antor`, « Essai Kanka » ▸ « Accès par API » (E-18) : créer un jeton, qui ne s'affiche qu'une fois. Avec lui (ou le jeton du bouchon), l'API d'import (AD-103, AD-104), sur une base neuve (« Essai Kanka » est le 4ᵉ univers semé, id 4 ; avec `KANEVAS_SANS_SEMIS=1` il n'existe pas, ni le jeton du bouchon : créer un univers et un jeton, l'id est celui de l'adresse de base copiable sur E-18) :
```bash
JETON=kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue   # le jeton du bouchon, ou celui créé sur E-18
B=http://localhost:3001/api/import/v1/univers/4          # sans barre finale
curl -H "Authorization: Bearer $JETON" $B                        # le contrat : types, limites
curl -X POST -H "Authorization: Bearer $JETON" $B/lots            # ouvre (ou reprend) un lot ; copier le champ `lotId` de la réponse JSON
curl -X PUT -H "Authorization: Bearer $JETON" -H 'content-type: application/json' "$B/fiches/lieu:port-sel?lot=<lotId>" \
  -d '{"type":"lieu","titre":"Port-Sel","sections":[{"cle":"desc","titre":"Description","contenu":"Un port.\n\n:::mj\nTenu en sous-main.\n:::","joueursLisent":true},{"cle":"verite","titre":"Vérité","contenu":"…"}]}'
```
Une section lue des seuls MJ omet `joueursLisent`. Réponse `creee`, puis `inchangee` au rejeu ; E-18 montre les lots. En `lea` (`curl -c /tmp/j -d compte=lea http://localhost:3055/connexion-bouchon`, puis `GET /api/univers/<id de l'univers>/fiches/<id rendu par le PUT>` avec `-b /tmp/j`), « Description » se lit sans « sous-main » (le bloc MJ) et « Vérité » n'existe pas. Sans `?lot=`, l'écriture réussit mais aucun lot ne la compte. Seules `GET /`, les trois routes de lots (ouvrir, lire, clore) et `PUT /fiches/:cle` existent ici (pas de `/fichiers`, de relations ni de `DELETE` : ces adresses répondent un 404 HTML, non du JSON ; les champs que la tranche ne traite pas, comme `alias` ou `parent`, sont ignorés sans avertissement). Un `compte_rendu` (listé inactif par `GET`) est refusé (400, `champ: type`) jusqu'à `kanevas-import-reprise`. Le contenu est rendu en Markdown (AD-95) ; un contenu qui porte `:::mj … :::` produit le même bloc MJ que l'écran (AD-114).

### Tests de bout en bout

`npm test` joue aussi `src/e2e/` : `node dist/server.js` en bouchon, piloté par un vrai Chromium via
Playwright. Le build n'est lancé que si `dist/public/index.html` manque : après un changement dans
`src/` ou `frontend/`, relancer `npm run build` avant `npm test`, sinon ces tests jouent l'ancien code.
Les textes de `docs/ecrans.md` sont écrits avec l'apostrophe droite ; l'interface porte l'apostrophe typographique (’).
Playwright n'est pas une dépendance du dépôt : il doit être installé globalement
(`/usr/lib/node_modules` ou `/usr/local/lib/node_modules`) avec un Chromium, ce que ne fait pas
`node:20-bookworm-slim` ; la CI GitHub l'installe en local (`npm install --no-save playwright`, `docker-publish.yml`), donc elle joue les e2e. Pour savoir s'il est vu : `ls /usr/lib/node_modules/playwright`. Là où il manque, ces tests sont **ignorés avec un message**,
sans échec ; les autres tests (services, routes HTTP) tournent partout. Compter une dizaine de minutes même sans les e2e, une vingtaine avec Playwright (silencieuse jusqu'à la fin ; un message « ignoré » en tête de sortie dit que Playwright n'est pas vu). 
Recette de l'administration en bouchon (le monde de démonstration est semé : « Lame d'Ébène », « Les Landes grises », « Les Cendres de Vaëlis », cinq comptes déjà connus) : se connecter en « Admin », ouvrir `/administration`, choisir « Lame d'Ébène » (où Admin n'a aucun rôle) et ajouter « mira ». Un compte jamais connecté (« nadia ») est refusé. Les e2e `src/e2e/administration*.test.ts` pilotent E-5.
Recette du jeton de l'assistant en bouchon (P-15) : en « Admin », sur `/administration`, le panneau « Jeton de l'assistant » dit « Aucun jeton posé. » ; « Connecter l'abonnement » montre une adresse (fixe en bouchon) et un champ « Code » ; `bouchon` donne « Jeton posé le … » ; tout autre code, « La connexion n'a pas abouti. Recommencez. » et l'état d'avant reste. La valeur du jeton n'apparaît jamais ; « lea » reçoit « Page introuvable. ». En bouchon l'assistant répond déjà par son script : la disponibilité réelle se joue sur l'URL déployée (premier vrai appel au modèle, geste de Monsieur). Sans navigateur, sur le serveur lancé plus haut avec `PORT=3055` (`curl -c /tmp/j -d compte=admin http://localhost:3055/connexion-bouchon`), puis, avec `-b /tmp/j` : `POST /api/instance/assistant/jeton/connexion` (rend `connexionId`, `adresse`, `expireLe`), `POST …/jeton/code` avec `-H 'Content-Type: application/json' -d '{"connexionId":"…","code":"bouchon"}'` (sans cet en-tête le corps n'est pas lu en JSON et la réponse est 400) et `GET …/jeton` pour l'état. Hors bouchon, la connexion lance `script` (paquet `bsdutils`, présent dans `node:20-bookworm-slim`, base de l'image) : sans lui, `connexion_impossible`. Le jeton posé écrit `claude/oauth-token` à côté de la base (`./data/claude/` en développement).
Recette des cartes en bouchon (le semis ne contient aucune carte) : en « antor », ouvrir « Cartes » de « Lame d'Ébène », créer « La ville de Brume » (carte illustrée, avec une image en fond), y ajouter une fiche, puis « Rendre visible » ; se reconnecter en « lea » : la carte est dans sa liste, avec les seuls tokens des fiches qu'elle lit. Un graphe se crée de même (forme « Graphe »). Le mode Joueur d'Antor montre ce que voit Léa.

## Réglages

La liste de départ est `.env.example` (elle porte aussi `NODE_ENV`, `ANTHROPIC_API_KEY` et `ANTHROPIC_MODEL` ; seuls `ANTHROPIC_MODEL`, `CLAUDE_CODE_OAUTH_TOKEN` et `CLAUDE_DIR` servent, à l'assistant ; `ANTHROPIC_API_KEY` n'est lue par aucune route). En plus : `APP_NAME` (défaut `kanevas` ; seul le texte de `/healthz` le reprend),
`APP_VERSION` (défaut `0.0.0-dev`, posée par le build-arg en image), `PORT` (3001), `DB_PATH` (fichier SQLite ; défaut `/data/kanevas.db` avec `NODE_ENV=production`, `./data/kanevas.db` en développement), `ATTACHMENTS_DIR` (pièces jointes ; défaut `attachments/` à côté de la base, donc `/data/attachments` en production), `SESSION_SECRET` (≥ 16 caractères ; à défaut `session.key`, créée à côté de la base : `/data/session.key` en production, `./data/session.key` en développement), `KANEVAS_STUB` (`1`), `KANEVAS_SANS_SEMIS` (`1` : pas de monde de démonstration en bouchon), `FRONTEND_DIR` (dossier du frontend construit ; posé par les tests de routes, inutile à l'exploitation), `LLM_PROVIDER` (`mock` | `anthropic` | `claude-agent`, défaut `mock` ; lu par le seul transport texte, que l'assistant n'emploie pas), `CLAUDE_CODE_OAUTH_TOKEN` (jeton de l'abonnement Claude, posé par l'exploitant ; vide et sans jeton posé depuis l'administration = l'assistant est indisponible hors bouchon et le dit, il ne retombe jamais sur le bouchon, AD-77), `CLAUDE_DIR` (dossier du fichier `oauth-token` posé depuis l'administration ; défaut `claude/` à côté de la base, donc `/data/claude` en production, sous le dossier temporaire et perdu au redémarrage si la base est en mémoire, c'est-à-dire sans volume ; ce fichier prime sur la variable, AD-109).

## Version de l'application

Un tag n'est construit en image que sur un commit dont la suite complète a été jouée et attestée : `npm run tests:attestes -- --publier` (ou le workflow `tests.yml`) pose le statut « tests-complets » que `docker-publish.yml` exige ; sans lui le build échoue.

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
tableau liste les décisions `AD-n` retenues pour l'epic, construites ou non (« La cible » dit ce qui est construit), avec leur numéro stable ; les numéros absents sont des décisions retirées ou d'autres tranches, aucune n'est cachée ici. Des
commentaires du code citent encore `plan.md`, `technique.md` ou `socle-projet` : ce sont des
documents de conception (« Monsieur » est le commanditaire qui fait la recette, « tranche » une feature livrée, « phase merge » la fusion qui suit la recette) tenus hors de ce dépôt (magasin de pilotage de la chaîne SDLC), dont ce
qui doit survivre est dans `ARCHITECTURE.md` et `docs/`.
