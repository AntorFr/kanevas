# Architecture — kanevas

Système de gestion de JDR (lore, campagnes, comptes-rendus, droits, cartes). Ce qu'il permet, à
qui et par quels écrans : `docs/parcours.md`, `docs/ecrans.md` ; ses données : `docs/donnees.md`.

Ce document a deux parties : **aujourd'hui**, la carte du code tel qu'il est ; **la cible**,
l'architecture du produit entier, posée par le cadrage de l'epic et réalisée tranche par
tranche (sur `main`, la cible ne décrit que ce qui est construit).

# Aujourd'hui

Le socle (une application Fastify, Node 20, TypeScript, `GET /healthz`, une mécanique OIDC,
une image publiée par la CI) porte, depuis `kanevas-premiere-fiche`, la **première
fonction métier** : comptes, univers, membres, fiches et sections, avec leurs droits ; la session
et le mode bouchon ; le frontend React qui les montre (accueil, univers, membres, lore, fiche).
S'y ajoutent le système de jeu et, avec `kanevas-suivi`, le suivi de la séance : campagnes, scénarios, préparation, comptes-rendus.
Ni relations, ni recherche, ni cartes, ni assistant : tranches suivantes. Les pièces jointes (stockage sur le volume, bloc de E-9) sont construites.

## Carte

- `src/server.ts`, `src/app.ts` : démarrage et assemblage de l'app Fastify
  (`buildApp`), seule application du dépôt ; toutes les routes futures s'y
  enregistrent.
- `src/config/env.ts` : unique lecture de l'environnement (zod).
- `src/routes/health.ts` : `registerHealthRoutes`, `GET /healthz`.
- `src/routes/auth.ts`, `src/services/oidc.ts` : login et callback OIDC ; le callback ouvre la
  session (`src/services/session.ts`, AD-56) et crée le compte à la première connexion.
- `src/routes/bouchon.ts` : mode bouchon (AD-55), absent de la table des routes sans `KANEVAS_STUB`.
- `src/db/` : ouverture du fichier SQLite, `migrations/0001-*.sql`, `0002-systemes.sql`, `0003-suivi.sql`, `0004-pieces-jointes.sql`, runner (AD-14).
- `src/services/` : `comptes`, `univers`, `membres`, `fiches`, `sections`, `droits`, `systemes`, `campagnes`, `scenarios`, `preparation`, `comptes_rendus`, `pieces-jointes`, `stockage` — les seules
  fonctions qui lisent ou écrivent les données (AD-2) ; `src/routes/` : routes `/api` minces.
- `frontend/` : application React/Vite (AD-57) ; `frontend/src/ui/tokens.css` et
  `frontend/src/ui/` : tokens et composants de `docs/charte.md` ; son build est servi par Fastify.
- `src/services/systemes.ts` : catalogue, rattacher, créer et rattacher, gabarits ; la modification
  d'un univers est dans `src/services/univers.ts` ; leurs routes sont `src/routes/systemes.ts`
  (AD-83 à AD-85). Écrans : E-14 (Paramètres), E-15 (Système de jeu) et le bloc « Système de jeu » de E-3.
- `src/services/{campagnes,scenarios,preparation,comptes_rendus}.ts` et `src/routes/suivi.ts` : le suivi
  (AD-29, AD-30, AD-33, AD-34, AD-46, AD-47, AD-60 à AD-62). Un compte-rendu est une fiche de type
  `compte_rendu` ; scénarios et tâches se garde sur l'univers de la campagne, jamais sur un identifiant
  d'univers fourni. Écrans : E-6 Campagne (+ liste), E-7 Scénario, E-13 Comptes-rendus, trois blocs de E-3
  (campagnes actives, derniers comptes-rendus, préparation pour le MJ) et la ligne « Campagne » de E-9
  (registre `fiche/lignes/`).

- Pièces jointes (`kanevas-fichiers`) : `src/services/stockage.ts` (écrire, lire, supprimer un fichier du volume),
  `src/services/pieces-jointes.ts` (déposer, marquer, retirer, lire, garde) et leurs routes `/api` (dans `src/routes/fiches.ts`)
  (AD-65 à AD-67), et le bloc Pièces jointes de E-9.
- `src/services/llm/` : transports LLM (`transport.ts`, `anthropic-transport.ts`,
  `claude-agent-transport.ts`), repris d'Antre-du-maitre, branchés nulle part.
- `Dockerfile` (multi-stage, utilisateur `node`) et
  `.github/workflows/docker-publish.yml` (tests puis image GHCR).

Volume `/data` : `kanevas.db` (SQLite, WAL), `session.key` (secret de session, 0600) et
`attachments/` (les pièces jointes, un fichier par UUID, AD-65 ; `attachments/tmp/` pour les envois
en cours, vidé au démarrage sauf avec une base en mémoire, où le dossier est partagé).

## Routes `/api`

Toutes gardées par la session (401 sans session), sauf `/api/auth/*`. Les erreurs de service sont
`introuvable` 404, `refuse` 403, `invalide` 400, `conflit` 409 (`section_modifiee`, `nom_pris`, `gabarit_modifie`, `scenario_modifie`, `limite_pieces` : 50 pièces par section ; 400 `fichier_vide` pour un fichier vide). Retirer le dernier
MJ répond `invalide` 400 avec la raison ; un contenu de section de plus de 20 000 caractères aussi (AD-91). Le corps d'une erreur est `{message}` (plus `code` pour le 409). Le serveur écoute sur `0.0.0.0` (`-p 3001:3001` suffit).
En mode bouchon, `POST /connexion-bouchon` attend un corps form-urlencoded `compte=<identifiant>`.

| Route | Rôle |
|---|---|
| `GET /api/moi`, `POST /api/auth/logout` | identité, groupes et limites (`limites.contenuSection`, AD-91) du compte ; fin de session |
| `GET /api/auth/config`, `GET /api/auth/oidc/login`, `.../callback` | OIDC (publiques) |
| `GET\|POST /api/univers`, `GET /api/univers/:id` | univers du compte (avec son rôle) ; création |
| `PATCH /api/univers/:id` | nom et description (MJ) |
| `GET\|POST /api/systemes` | catalogue (couples id, nom), lu par un MJ d'au moins un univers ; création d'un système |
| `PUT .../systeme`, `POST .../systeme-nouveau` | rattacher (`{systemeId}` ou `null` pour détacher ; 204 sans corps), créer et rattacher (201) (MJ) |
| `GET .../systeme` (`?type` = `regle` (défaut), `creature` ou `objet`, sinon 400 ; `?curseur`) | le système de l'univers, le nombre d'univers qui l'utilisent, ses gabarits (100 à la fois) ; 404 identique à une adresse inconnue sans rôle ou sans rattachement |
| `POST .../systeme/gabarits`, `PUT .../systeme/gabarits/:gabaritId` | ajouter, modifier avec la version lue (MJ) |
| `GET\|POST /api/univers/:id/membres`, `PATCH\|DELETE .../membres/:compteId` | membres (MJ) |
| `GET\|POST /api/univers/:id/fiches` (`?type`, `?curseur`) | liste paginée (100) ; création (MJ) |
| `GET .../fiches/:fid` | fiche et sections lisibles ; `?mode=joueur` lit en Joueur ; 404 si aucune section n'est lisible (l'écran le traduit en « Aucune section n'est visible des joueurs. ») |
| `POST .../fiches/:fid/sections`, `PUT .../fiches/:fid/ordre` | ajouter, ordonner (MJ) |
| `GET\|PATCH\|DELETE .../sections/:sid` | lire ; titre et audience (MJ) ; retirer (MJ) |
| `POST .../sections/:sid/pieces-jointes` | ajouter une pièce (multipart, un fichier par requête ; champ `secrete` **avant** le champ `fichier`, sinon ignoré ; 201, rend la pièce) ; droit d'écriture sur la section |
| `PATCH\|DELETE .../pieces-jointes/:pid` | marquer ou lever « secrète » `{secrete}` (MJ) ; retirer (204) |
| `GET .../pieces-jointes/:pid/fichier` | les octets, sous les règles de lecture réelles (pas de mode) ; 404 identique à une adresse inconnue |
| `PUT .../sections/:sid/contenu` | écrire `{contenu, version}` ; 400 si contenu > 20 000 caractères (contrôlé après les droits, avant la version) ; 409 si `version` périmée |
| `GET\|POST /api/univers/:id/campagnes`, `GET .../campagnes/:cid` | liste (actives, en préparation, terminées, chacune par nom) et lecture (tout membre) ; création `{nom}` (MJ) |
| `PATCH /api/campagnes/:cid` | `{statut}` (`en_preparation`, `active`, `terminee`) (MJ de l'univers de la campagne) |
| `GET\|POST /api/campagnes/:cid/scenarios`, `GET\|PUT /api/scenarios/:sid` | scénarios `{titre, contenu?}` ; écriture `{titre, contenu, version}`, 409 `scenario_modifie` si périmée (AD-62). MJ seul, 404 pour tout autre (AD-22, AD-47) |
| `GET\|POST /api/campagnes/:cid/taches`, `PUT /api/taches/:tid` | préparation `{categorie, libelle}` ; cocher `{faite}`. MJ seul, 404 pour tout autre |
| `POST /api/univers/:id/comptes-rendus` | `{campagneId, titre, texte?}` ; tout membre (AD-61) ; rend la fiche |
| `GET .../comptes-rendus` (`?campagne`, `?curseur`), `GET .../campagnes/:cid/comptes-rendus` | comptes-rendus lisibles, du plus récent, 100 au plus par page et `suivant` ; `?mode=joueur` |

Corps de requête (JSON) : `POST /api/univers` `{nom, description?}` ; `POST .../membres`
`{username, role}` (`role` : `mj` \| `joueur` ; `username` est l'identifiant exact) ; `PATCH
.../membres/:compteId` `{role}` ; `POST .../fiches` `{type, titre, charge?}` (`charge` : objet, optionnel sauf si le type l'exige — `personnage` veut `{"pj": bool}`, `compte_rendu` un `campagne_id` ; formes dans `docs/donnees.md`) ;
`POST .../sections` `{titre, contenu?}` (`contenu` : texte, même plafond ; l'écran n'envoie que `titre`) ; `PUT .../ordre` `{ids}` (tous les identifiants de section de la fiche) ;
`PATCH .../sections/:sid` `{titre?, joueursLisent?, joueursEcrivent?, auteurLit?, auteurEcrit?,
auteurId?}` — `auteurId` est l'**identifiant numérique du compte** (`compteId` des membres), `null` pour
aucun auteur ; `PUT .../contenu` `{contenu, version}`. Les noms de l'API sont en camelCase, ceux de la
base en snake_case (`docs/donnees.md`).

## Invariants

- **La version a une seule source** : le build-arg Docker `APP_VERSION`, dérivé
  par la CI du tag semver poussé (hors tag, la valeur n'est pas un semver : seule une image de
  tag en porte un). `/healthz` et le tag d'image publié ne
  peuvent donc pas diverger. `package.json` ne porte volontairement aucun
  `version`.
- **`/healthz` est public**, en texte brut `kanevas <version>`, sans donnée.
  `GET /api/auth/config` (`{oidcEnabled}`) l'est aussi ; aucune autre route
  publique n'expose de contenu.
- **Le callback OIDC authentifie une identité, rien de plus** : il ouvre une session portant
  l'identifiant et les groupes, et crée le compte ; **aucun rôle d'univers ne vient d'Authelia**
  (AD-9), il se lit dans la table des membres à chaque requête. Sans les quatre variables
  `OIDC_*` (ou avec une partie seulement), login et callback répondent 404 ; une valeur vide
  ou invalide fait échouer le démarrage.
- **Onze tables, aucun ORM** : `comptes`, `univers`, `membres`, `fiches`, `sections` (migration
  0001), `systemes_jeu`, `gabarits` (migration 0002), `campagnes`, `scenarios`, `taches_preparation` (migration 0003), `pieces_jointes` (migration 0004) ; numéros provisoires : voir `docs/donnees.md`. Aucune requête SQL hors de `src/services/` et `src/db/`.
- **Toute route hors `/healthz`, `/api/auth/*` et, en bouchon, `/connexion-bouchon` est gardée par la session** ; sous `/api` un
  défaut de session répond 401, ailleurs il redirige vers la connexion (AD-15).
- **Rien n'appelle un LLM** : les transports compilent mais ne sont reliés à
  aucune route. Aucun secret `ANTHROPIC_API_KEY` n'est déployé.
- Client OIDC : `client_id` `kanevas`, callback
  `https://kanevas.tantive.berard.me/api/auth/oidc/callback`, émetteur
  `https://auth.berard.me`. Ces valeurs sont partagées avec la déclaration du
  client dans `k8s-home-lab` : les changer ici impose de changer là-bas.

## Décisions et options écartées

- **Dépôt neuf, reprise sélective d'Antre-du-maitre (AD-10)** : bootstrap
  Fastify, OIDC, transports LLM, patron Dockerfile et CI, sans Prisma ni le
  domaine métier. Écarté : forker Antre-du-maitre.
- **OIDC câblé dès le socle**, pas différé : AD-10 le range parmi ce qui est
  repris au socle. `claude-token.ts` (fenêtre admin de setup-token, route de
  contenu) n'est **pas** repris : à rapporter avec la feature qui active un LLM.
- **Pas de page canari** : le frontend naît avec la première page métier (AD-57).
- **Dépôt public, licence MIT** : le package GHCR public évite pull-secret et
  auto-bump Renovate ; MIT faute de politique de licence commune dans le parc.
  Renversé seulement si le code devait devenir confidentiel.
- **Version lue depuis `package.json`** : écarté, deux sources non synchronisées.
- Au cluster (`tantive` ; Authelia est sur `homenode`) le pod tourne en `runAsUser: 0` (convention des apps `games` pour
  un hostPath inscriptible) : l'utilisateur `node` (uid 1000) de l'image est
  toléré, pas requis. Sous uid 1000 il faudrait un hostPath inscriptible par lui.


# La cible

> Construit à ce jour : la session, le mode bouchon, les onze tables et leurs fonctions de service,
> les systèmes de jeu et leurs gabarits, le suivi (campagnes, scénarios, préparation, comptes-rendus), les écrans E-1 à E-4, E-6 à E-9 (E-9 avec son bloc Pièces jointes), E-13, E-14 et E-15, et le stockage des fichiers sur le volume. Le reste (relations, recherche, agents, images,
> administration) est la cible des tranches suivantes.

## Organes, et qui parle à qui

```
navigateur (React, une SPA)  ──HTTP──▶  backend Fastify (une seule application)
                                         ├─ routes HTTP ─┐
                                         ├─ outils de l'agent (MJ | Joueur) ─┤─▶ fonctions de service ─▶ SQLite + /data/attachments
                                         ├─ fournisseur LLM (assistant)
                                         └─ codex exec (images), en sous-processus
Authelia (OIDC) : identité seulement.
```

- **Navigateur** : une application React (`react-router`, AD-16), servie par le backend ; elle
  ne parle qu'au backend, jamais à la base ni au disque. Le fil de l'assistant vit dans la page
  (AD-28).
- **Backend Fastify** : le seul point d'accès aux données, au disque, au fournisseur LLM et à
  Codex (AD-4). Toute route est gardée par la session (AD-15) : 401 sous `/api`, redirection ailleurs ; seuls `/healthz`,
  `/api/auth/*` et, en bouchon, `/connexion-bouchon` sont publics.
- **Fonctions de service** : la seule implémentation de chaque lecture et écriture, avec ses
  gardes (`peutLireSection`, `peutEcrireSection`, `peutVoirFiche`, `peutLirePieceJointe`).
  Routes et outils de l'agent les appellent de la même façon (AD-2) : c'est ce qui rend la
  symétrie humain / agent vérifiable.
- **Agents** : deux catalogues d'outils, MJ et Joueur, choisis côté serveur selon le rôle du
  compte dans l'univers courant (AD-26).
- **Images** : un port `GenerateurImage`, adaptateurs `bouchon`, `aucun`, `codex` (AD-45, AD-50, AD-55).

## Décisions

Les numéros sont stables. Une décision retirée garde son numéro, avec ce qui la remplace.

| AD | Décision |
|---|---|
| AD-1 | Rien du moteur d'Adestia pour stocker ou servir les données : il n'a pas d'ACL par ressource. |
| AD-2 | Un seul chemin vers les données : un outil de l'agent n'appelle que des fonctions de service qu'une route appelle aussi. |
| AD-3 | Tout en TypeScript sur Node. |
| AD-4 | Toute route HTTP dans l'unique application Fastify. |
| AD-5 | Toute donnée structurée dans l'unique fichier SQLite du volume. |
| AD-6 | Un type de fiche est un contrat de charge utile versionné, validé en code, jamais une table ou des colonnes neuves. |
| AD-7 | Pièces jointes : octets sur le disque du volume, jamais en base ni par un chemin statique ; une route qui revérifie les droits ; pas de limite de taille. |
| AD-8 | Recherche plein texte (FTS5) sur titres et sections, tenue à jour par la base (AD-21) ; aucun résultat sans le filtre de droits. |
| AD-9 | Authelia dit qui ; `membre` dit ce qu'on peut. L'admin d'instance (groupe Authelia `parents`) n'écrit que la table des membres. |
| AD-10 | Dépôt neuf ; reprise sélective d'Antre-du-maitre : bootstrap Fastify, OIDC, transports LLM, Dockerfile et CI. |
| AD-11 | Système de jeu : entité partagée entre univers ; le lore reste propre à chaque univers. |
| AD-12 | *Remplacée par AD-18 et AD-19.* |
| AD-13 | Compte créé à la première authentification (`preferred_username`). |
| AD-14 | Migrations : fichiers SQL numérotés, appliqués au démarrage, sans ORM. |
| AD-15 | Toute route gardée par la session (cookie signé), sinon 401 sous `/api` et redirection vers Authelia — en mode bouchon, vers le choix d'un compte de test (AD-55). |
| AD-16 | Un seul routeur frontend, `react-router` ; chaque tranche y enregistre ses écrans. |
| AD-17 | Charge utile v1 vide pour tous les types, sauf personnage (PJ \| PNJ) et compte-rendu (sa campagne) ; le contenu est dans les sections. |
| AD-18 | Le MJ lit et écrit toute section de son univers. |
| AD-19 | Audience d'une section : lecture et écriture des joueurs, lecture et écriture de l'auteur, quatre bascules indépendantes. |
| AD-20 | Une relation est portée par une section et en prend la visibilité ; sa cible doit aussi être lisible. |
| AD-21 | L'index de recherche est tenu par des déclencheurs SQLite, jamais par le code. |
| AD-22 | Une fiche sans section lisible répond 404, comme un identifiant inconnu. |
| AD-23 | `systeme_jeu` sans univers ; un univers le référence. |
| AD-24 | Gabarits : une table générique typée. |
| AD-25 | Référentiel : lu par les membres d'un univers rattaché, écrit par ses MJ. |
| AD-26 | Le catalogue d'outils de l'agent est choisi par le serveur selon le rôle, jamais par le client. |
| AD-27 | Les outils de l'agent composent les fonctions de service en processus, sans HTTP interne ni SQL à eux. |
| AD-28 | Aucune conversation stockée : le fil vit dans le navigateur. |
| AD-29 | Campagnes et scénarios : tables propres, hors fiches. |
| AD-30 | La liste des campagnes ne porte jamais les scénarios. |
| AD-31 | Créer une campagne ou un scénario par l'agent MJ : les mêmes fonctions que les routes. |
| AD-32 | *Retirée : remplacée par AD-52.* |
| AD-33 | Un compte-rendu se crée par une route propre, ouverte à tout membre, qui compose la création de fiche et de section. |
| AD-34 | La liste des CR d'une campagne revérifie chaque CR section par section. |
| AD-35 | Nom de fichier sur disque : UUID ; le nom d'origine n'est qu'une métadonnée. |
| AD-36 | Garde d'une pièce jointe : celle de sa section, et le MJ seul si secrète. |
| AD-37 | Pièces jointes en flux ; `nosniff` ; image en ligne, le reste en téléchargement. |
| AD-38 | Un élément de carte n'est rendu que si sa fiche est lisible (`peutVoirFiche`). |
| AD-39 | Le mode Joueur d'un MJ ne peut que restreindre : il montre ce que voit un joueur qui n'est l'auteur d'aucune section. |
| AD-40 | Le fond d'une carte est une image déposée sur la carte, rangée sur le disque comme une pièce jointe et servie par une route qui revérifie la lecture de la carte. |
| AD-41 | Les liens d'un graphe se déduisent des relations à la lecture. |
| AD-42 | La disposition d'un graphe se calcule dans le navigateur. |
| AD-43 | Token et nœud : une seule table d'éléments, de forme imposée par le type de carte. |
| AD-44 | L'outil image vérifie le droit d'écriture avant de générer, et attache par la fonction d'envoi des pièces jointes ; une image par demande. |
| AD-45 | Génération d'image derrière un port ; l'adaptateur se choisit par configuration (`codex`, ou `bouchon` en mode bouchon, AD-55) ; sans adaptateur, l'outil disparaît du catalogue. |
| AD-46 | Tâches de préparation : table propre rattachée à la campagne, catégories fermées. |
| AD-47 | Garde MJ des tâches évaluée sur l'univers de la campagne. |
| AD-48 | L'agent propose une mise à jour, jamais ne l'écrit ; appliquer est un geste humain, dans l'interface. |
| AD-49 | Une proposition appartient à son demandeur, s'applique une fois, et seulement si la section n'a pas changé. |
| AD-50 | Adaptateur `codex` : `codex exec` en sous-processus, `danger-full-access` (le pod est le bac à sable), identifiants dans `CODEX_HOME` sur le volume. |
| AD-51 | Une migration prend son numéro au moment où sa tranche se fusionne ; l'ordre des migrations est l'ordre de fusion. |
| AD-52 | La table des fiches connaît ses sept types dès sa création ; aucune tranche ne la recrée. |
| AD-53 | **Toute action qu'un humain déclenche a un écran.** L'agent est un second chemin, jamais le seul ; ce que l'agent propose, un humain l'applique depuis un écran. |
| AD-54 | L'assistant accède au modèle par l'abonnement Claude de Monsieur, via le transport `claude-agent` (décision de Monsieur, confirmée le 2026-10-03 en connaissance du fait suivant). Risque connu et accepté par Monsieur : la doc de l'Agent SDK n'autorise pas, sauf accord d'Anthropic, l'usage du login claude.ai ou de ses limites dans un produit tiers ; Kanevas sert d'autres comptes que le sien. Les identifiants sont posés par Monsieur. |
| AD-55 | **Mode bouchon** (décision de Monsieur, 2026-10-03) : `KANEVAS_STUB=1` lance Kanevas sans aucun secret. La connexion se fait en choisissant un compte de test au lieu de passer par Authelia, l'assistant répond par un transport `bouchon` scripté qui appelle les mêmes outils, l'image vient d'un adaptateur `bouchon` qui rend une image fixe. Tout le reste est réel : base, droits, routes, outils. Un bandeau le dit sur chaque page ; l'application refuse de démarrer en bouchon dès qu'une seule variable `OIDC_*` est posée. Les tests et les pods de la chaîne tournent en bouchon. |
| AD-56 | **Session** : un cookie signé (`HttpOnly`, `SameSite=Lax`, `Secure` hors bouchon et hors test) porte l'identifiant et les groupes du compte, valable 7 jours ; le secret de signature est lu dans `SESSION_SECRET` s'il est posé, sinon créé une fois dans `session.key` à côté de la base (`/data/session.key` en production, 0600) — la session survit à un redémarrage sans nouveau secret à déployer. Pas de session révocable en V1 : retirer un membre prend effet à la requête suivante parce que les rôles ne sont pas dans la session (AD-9). |
| AD-57 | **Frontend** : React et Vite dans `frontend/`, un seul build servi par l'application Fastify (`@fastify/static`, repli sur `index.html` pour toute adresse d'écran, derrière la garde de session) ; l'image Docker construit les deux. Pas de rendu serveur, sauf les pages que la session ne peut pas précéder : choix du compte de test (AD-55), « Connexion refusée », « Connexion indisponible ». |
| AD-58 | **Contenu de section en texte brut** : des paragraphes séparés par des lignes vides, affichés comme tels ; ni Markdown ni HTML. Écarté : Markdown (rendu à assainir, choix d'éditeur) — rouvrable sans migration, le contenu est déjà du texte. |
| AD-59 | **Écritures de section concurrentes** : chaque section porte un entier `version`, augmenté à chaque écriture de son contenu ; l'écriture envoie la version qu'elle a lue ; si elle n'est plus la courante, elle est refusée (HTTP 409, code `section_modifiee`) et rien n'est écrit. Même mécanisme que le « la section a changé » de B-21 pour les propositions (AD-49). |
| AD-83 | **Système de jeu et rattachement** : `systemes_jeu` (sans univers) et `gabarits` ; l'univers porte un `systeme_id` facultatif (AD-23, AD-24). L'accès à un système passe **toujours par un univers dont le compte est membre** (`/api/univers/:id/systeme`) : la route ne reçoit jamais d'identifiant de système en adresse, donc ne peut pas être devinée. Le catalogue (`GET /api/systemes`, noms seuls) est la seule lecture hors univers. « Créer et rattacher » est une seule transaction. Écarté : une adresse `/api/systemes/:id` gardée par « rattaché à l'un des univers du compte » (une requête par lecture, aucun gain). |
| AD-84 | **Un système n'apprend rien sur les univers voisins** : il rend le nombre d'univers qui l'utilisent et jamais leurs noms ni leurs membres (AD-22). Précise AD-11 : « le lore reste propre à chaque univers ». Écarté : nommer les univers partenaires (maquette du cadrage), qui divulguerait l'existence d'univers dont le compte n'est pas membre. |
| AD-85 | **Gabarits** : contenu en texte brut (AD-58) ; écriture concurrente refusée par un entier `version`, comme AD-59 (HTTP 409, code `gabarit_modifie`) ; le type est fixé à la création ; pas de suppression (cadrage). Les fonctions de service prennent l'acteur et vérifient le rôle dans l'univers de **passage** ; elles sont les seules écritures, pour les routes comme pour l'agent (AD-2). Écarté : champs structurés (niveau, DEF, PV) — hors périmètre du cadrage (caractéristiques structurées). |
| AD-91 | **Plafond du contenu d'une section, côté serveur** : le service `sections` refuse un contenu de plus de 20 000 caractères (`String.length`), à l'ajout comme à l'écriture : HTTP 400 `invalide`, « Contenu trop long : 20 000 caractères au plus. », rien d'écrit, version inchangée. La valeur vit dans une seule constante serveur (`MAX_CONTENU_SECTION`), rendue au frontend par `GET /api/moi` (`limites.contenuSection`) : l'écran ne la recopie pas. Écarté : une route `/api/limites` (un aller-retour de plus, `/api/moi` est déjà chargé par le cadre de l'écran) ; une limite configurable (hors tranche, la valeur pourra évoluer). |
| AD-60 | **Plusieurs campagnes peuvent être actives** d'un même univers : changer le statut d'une campagne ne touche à aucune autre. Écarté : une seule active (le passage d'une campagne en `active` terminerait ou suspendrait une autre à l'insu du MJ — un effet de bord caché). Rouvrable sans migration. |
| AD-61 | **Créer un compte-rendu** est une fonction de service unique, ouverte à tout membre : une transaction qui écrit la fiche et sa section « Compte-rendu » (lisible des joueurs, écrite par son auteur Joueur, sans auteur si c'est un MJ). Le droit de créer une fiche reste au MJ ; cette fonction est la seule exception, pour le type `compte_rendu`. |
| AD-62 | **Écritures de scénario concurrentes** : même mécanisme qu'AD-59 — un entier `version`, envoyé à l'écriture, refus 409 de code `scenario_modifie` si elle n'est plus la courante. Deux MJ peuvent écrire le même scénario. |
| AD-65 | **Stockage et dépôt des fichiers** : un module `src/services/stockage.ts`, sans notion de section, écrit un flux dans `/data/attachments/tmp/<uuid>`, puis le déplace sur `/data/attachments/<uuid>` (même volume : un renommage) ; il lit en flux et supprime. Il sert aussi aux fonds de carte (AD-40). **`deposerPieceJointe(compte, mode, sectionId, flux, nom, secrete)` est la seule fonction d'envoi** : la route et l'outil image (AD-44) l'appellent. Elle vérifie le droit d'écrire **avant** de lire le flux, puis une seconde fois dans la transaction qui écrit la ligne (le droit peut être retiré pendant un envoi long) ; un échec ou une annulation n'écrit ni ligne ni fichier. Pas de limite de taille (AD-7), un fichier vide refusé, 50 pièces par section. Écarté : base64 en JSON (mémoire, 33 % de plus), limite de taille (décision AD-7). |
| AD-66 | **Ce qu'on sert, et comment** : le type d'une pièce est **déterminé par le serveur à l'envoi, par la signature des premiers octets** (PNG, JPEG, GIF, WebP) ; le type annoncé par le navigateur est ignoré. Une image reconnue est servie en ligne sous son type ; **tout le reste** (SVG, HTML, PDF…) l'est en `application/octet-stream` avec `Content-Disposition: attachment` et le nom d'origine encodé (`filename*`). Toujours : `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`. Écarté : servir en ligne selon l'extension (un fichier « .png » qui est du HTML) ; aperçu PDF intégré (hors tranche). |
| AD-67 | **Pas de route de liste des pièces** : elles voyagent avec la fiche, par section, déjà filtrées par la garde et le mode du lecteur (`{id, nom, taille, image, secrete}` ; `secrete` n'est rendu qu'au MJ hors mode Joueur). Un lecteur n'apprend ni le nombre ni l'existence de ce qu'il ne lit pas. Routes : ajouter (`multipart`, un fichier par requête, champ `secrete` puis champ `fichier` : un `secrete` envoyé après le fichier est ignoré), marquer (`secrete`), retirer, et lire le fichier (sans paramètre de mode : le droit réel du compte ; le mode Joueur ne change que ce que la fiche montre). Un compte qui ne lit pas la section, ou une pièce secrète pour un non-MJ : **404**, de corps identique à celui d'un identifiant inconnu ; qui lit sans écrire reçoit **403** à l'ajout et au retrait, et un non-MJ qui marque ou lève « secrète » aussi (comme les gestes MJ de la première fiche). Le refus de limite (50 pièces) ne dit jamais le chiffre dans l'API ; l'écran le dit au seul MJ. |

## Déploiement et exploitation

| Dépôt | Ce qu'il porte | Rang de fusion |
|---|---|---|
| `AntorFr/kanevas` (référence) | backend, frontend, migrations, CI de l'image, toute la doc du produit | 1 |
| `AntorFr/smart-home-charts` | `charts/kanevas`, sur `common` | 2 |
| `AntorFr/k8s-home-lab` | HelmChart (`clusters/tantive/games/`), client OIDC dans Authelia | 3 — y fusionner, c'est déployer |

- **Image** `ghcr.io/antorfr/kanevas:<x.y.z>`, publique, construite par la CI sur un tag semver ;
  la version n'a qu'une source, le tag.
- **URL** `https://kanevas.tantive.berard.me` (wildcard, rien à créer).
- **Volume** `hostPath /mnt/data/kanevas/data` monté sur `/data` : la base, les pièces jointes,
  `CODEX_HOME`. Le jeu de données répliqué du nœud est la sauvegarde ; restaurer, c'est
  remettre ce dossier.
- **Secrets** (OpenBao, `openbao-tantive`) : le secret du client OIDC ; le jeton de l'abonnement
  Claude (AD-54) et le jeton Codex, que Monsieur pose lui-même.

## Bouchons

| Dépendance | Ce que le bouchon rend | Qui le construit |
|---|---|---|
| Authelia (OIDC) | un écran de connexion qui liste les comptes de test (Antor, Léa, Teo, Mira, Admin ; identifiants `antor`, `lea`, `teo`, `mira`, `admin`) ; la session est la même qu'après Authelia, groupes compris (Admin porte `parents`, que `kanevas-recours-admin` lit comme ceux d'Authelia) | `kanevas-premiere-fiche` |
| Modèle de l'assistant (AD-54) | transport `bouchon` : des réponses scriptées, choisies par mots-clés, qui appellent les vrais outils avec les droits de la personne | `kanevas-assistant-membre` |
| Moteur d'images (AD-50) | adaptateur `bouchon` : une image fixe, attachée par le vrai chemin (AD-44) ; une demande qui contient « échec » échoue, pour tester ce cas | `kanevas-images` |

Activation : `KANEVAS_STUB=1` (AD-55), jamais posée dans `k8s-home-lab`. La recette de
Monsieur sur l'URL de production reste réelle.

## Sécurité

| Menace | Réponse |
|---|---|
| Un joueur apprend qu'une chose existe (fiche, section, carte, titre) | Elle est absente partout ; son adresse répond comme une adresse inconnue (AD-22, AD-38). |
| Un fichier secret récupéré en devinant son adresse | Nom sur disque aléatoire ; aucune route statique ; garde revérifiée à chaque octet servi (AD-7, AD-35, AD-36). |
| L'agent comme porte dérobée | Mêmes fonctions et mêmes gardes que les routes (AD-2) ; catalogue choisi par le serveur (AD-26). |
| Un joueur écrit dans une section que l'agent du MJ lira (injection d'instructions) | L'agent du MJ peut modifier des sections : chaque écriture est listée dans le fil avec un lien (B-26), et une mise à jour du monde n'est jamais appliquée par l'agent (AD-48). **Risque accepté** en V1, pas de confirmation par écriture. |
| Codex s'exécute sans bac à sable, dans un pod root ; son jeton est sur le volume sauvegardé | **Risque accepté** (décision de Monsieur sur le moteur) : le pod est le bac à sable, le jeton est en 0600, un processus par demande, un répertoire jetable. |
| Usurpation d'identité | Authelia seul authentifie ; aucune base d'utilisateurs maison. Seule dérogation : le mode bouchon, hors production (ligne suivante). |
| Le mode bouchon ouvert en production (n'importe qui choisit son compte) | Kanevas refuse de démarrer en bouchon dès qu'une variable `OIDC_*` est posée ; la variable n'est jamais posée dans `k8s-home-lab` ; un bandeau visible sur chaque page (AD-55). |

## Différé

- Import depuis Kanka — epic à part.
- Suppression de contenu, historique, export — à rouvrir à l'usage.
- Types de fiches dédiés avec caractéristiques structurées.
