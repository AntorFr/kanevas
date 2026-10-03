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
`kanevas-relier-chercher` y ajoute les relations entre fiches et la recherche dans un type
(index FTS5, AD-63, AD-64) ; `kanevas-assistant-membre`, l'assistant de chaque membre : un panneau de
conversation dont les outils appellent les mêmes fonctions de service que les routes, avec les droits
de la personne (AD-73 à AD-78). `kanevas-monde` lui ajoute la proposition de mise à jour d'une section
d'après un compte-rendu, que le MJ applique ou abandonne d'un geste (AD-79 à AD-82). Ni pièces jointes, ni
cartes : tranches suivantes ; l'assistant ne génère encore aucune image.

## Carte

- `src/server.ts`, `src/app.ts` : démarrage et assemblage de l'app Fastify
  (`buildApp`), seule application du dépôt ; toutes les routes futures s'y
  enregistrent.
- `src/config/env.ts` : unique lecture de l'environnement (zod).
- `src/routes/health.ts` : `registerHealthRoutes`, `GET /healthz`.
- `src/routes/auth.ts`, `src/services/oidc.ts` : login et callback OIDC ; le callback ouvre la
  session (`src/services/session.ts`, AD-56) et crée le compte à la première connexion.
- `src/routes/bouchon.ts` : mode bouchon (AD-55), absent de la table des routes sans `KANEVAS_STUB`.
- `src/services/assistant/` : le catalogue d'outils d'un rôle (AD-74), le port `AgentTransport` et ses
  adaptateurs `bouchon` et `claude-agent` (AD-73, AD-78), la disponibilité (AD-77) et
  l'orchestration d'une demande (AD-75) ; `src/routes/assistant.ts` : les deux routes. Aucune requête SQL
  dans ce module (AD-5).
- `src/db/` : ouverture du fichier SQLite, `migrations/0001-*.sql`, runner (AD-14).
- `src/services/` : `comptes`, `univers`, `membres`, `fiches`, `sections`, `droits`, `campagnes`, `scenarios`, `preparation`, `comptes_rendus`, `relations`, `propositions` — les seules
  fonctions qui lisent ou écrivent les données (AD-2) ; `src/routes/` : routes `/api` minces.
- `frontend/` : application React/Vite (AD-57) ; `frontend/src/ui/tokens.css` et
  `frontend/src/ui/` : tokens et composants de `docs/charte.md` ; son build est servi par Fastify.
- `src/services/llm/` : transports LLM (`transport.ts`, `anthropic-transport.ts`,
  `claude-agent-transport.ts`), repris d'Antre-du-maitre, branchés nulle part.
- `Dockerfile` (multi-stage, utilisateur `node`) et
  `.github/workflows/docker-publish.yml` (tests puis image GHCR).

Volume `/data` : `kanevas.db` (SQLite, WAL) et `session.key` (secret de session, 0600) ; le
dossier des pièces jointes n'existe pas encore.

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
- **Cinq tables, aucun ORM** : `comptes`, `univers`, `membres`, `fiches`, `sections` (migration
  0001). Aucune requête SQL hors de `src/services/` et `src/db/`.
- **Toute route hors `/healthz` et `/api/auth/*` est gardée par la session** ; sous `/api` un
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
  Codex (AD-4). Toute route hors `/api` est gardée par la session (AD-15) ; seul `/healthz` est
  public.
- **Fonctions de service** : la seule implémentation de chaque lecture et écriture, avec ses
  gardes (`peutLireSection`, `peutEcrireSection`, `peutVoirFiche`, `peutLirePieceJointe`).
  Routes et outils de l'agent les appellent de la même façon (AD-2) : c'est ce qui rend la
  symétrie humain / agent vérifiable.
- **Agents** : deux catalogues d'outils, MJ et Joueur, choisis côté serveur selon le rôle du
  compte dans l'univers courant (AD-26, AD-74), derrière le port `AgentTransport` (AD-73).
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
| AD-15 | Toute route hors `/api` gardée par la session (cookie signé), sinon redirection vers Authelia — en mode bouchon, vers le choix d'un compte de test (AD-55). |
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
| AD-56 | **Session** : un cookie signé (`HttpOnly`, `SameSite=Lax`, `Secure` hors bouchon et hors test) porte l'identifiant et les groupes du compte, valable 7 jours ; le secret de signature est lu dans `SESSION_SECRET` s'il est posé, sinon créé une fois dans `/data/session.key` (0600) — la session survit à un redémarrage sans nouveau secret à déployer. Pas de session révocable en V1 : retirer un membre prend effet à la requête suivante parce que les rôles ne sont pas dans la session (AD-9). |
| AD-57 | **Frontend** : React et Vite dans `frontend/`, un seul build servi par l'application Fastify (`@fastify/static`, repli sur `index.html` pour toute adresse d'écran, derrière la garde de session) ; l'image Docker construit les deux. Pas de rendu serveur, sauf les pages que la session ne peut pas précéder : choix du compte de test (AD-55), « Connexion refusée », « Connexion indisponible ». |
| AD-58 | **Contenu de section en texte brut** : des paragraphes séparés par des lignes vides, affichés comme tels ; ni Markdown ni HTML. Écarté : Markdown (rendu à assainir, choix d'éditeur) — rouvrable sans migration, le contenu est déjà du texte. |
| AD-59 | **Écritures de section concurrentes** : chaque section porte un entier `version`, augmenté à chaque écriture de son contenu ; l'écriture envoie la version qu'elle a lue ; si elle n'est plus la courante, elle est refusée (HTTP 409, code `section_modifiee`) et rien n'est écrit. Même mécanisme que le « la section a changé » de B-21 pour les propositions (AD-49). |
| AD-60 | **Plusieurs campagnes peuvent être actives** d'un même univers : changer le statut d'une campagne ne touche à aucune autre. Écarté : une seule active (le passage d'une campagne en `active` terminerait ou suspendrait une autre à l'insu du MJ — un effet de bord caché). Rouvrable sans migration. |
| AD-61 | **Créer un compte-rendu** est une fonction de service unique, ouverte à tout membre : une transaction qui écrit la fiche et sa section « Compte-rendu » (lisible des joueurs, écrite par son auteur Joueur, sans auteur si c'est un MJ). Le droit de créer une fiche reste au MJ ; cette fonction est la seule exception, pour le type `compte_rendu`. |
| AD-62 | **Écritures de scénario concurrentes** : même mécanisme qu'AD-59 — un entier `version`, envoyé à l'écriture, refus 409 de code `scenario_modifie` si elle n'est plus la courante. Deux MJ peuvent écrire le même scénario. |
| AD-63 | **La recherche est la liste, plus une condition.** Chercher dans un type, c'est lister ce type (même fonction, même filtre de droits, même ordre alphabétique, même pagination) avec une condition de correspondance sur les index FTS5 : l'index ne livre que des candidats, jamais un résultat (AD-8). Une fiche correspond si tous les mots sont dans son titre, ou tous dans une même section que le compte lit ; mots par début de mot, sans casse ni accents ; la saisie est neutralisée (chaque mot cité, guillemets doublés, signes sans lettre ni chiffre écartés). Écartés : un classement par pertinence et des extraits (un extrait est du contenu à filtrer, un classement trahit ce qui est caché) ; une recherche dans tous les types (hors périmètre, par l'assistant). Rouvrable sans migration. |
| AD-64 | **Une relation se lit sous deux gardes** : la section porteuse **et** la fiche cible doivent être lisibles par le compte (et le mode) qui lit ; sinon la relation est absente de la réponse, sans placeholder ni compteur (AD-20, AD-22). Elle se crée et se retire par le seul MJ ; sa cible est du même univers, jamais sa propre fiche ; retirer une section la retire (cascade). Écartés : un marqueur « relation vers une fiche cachée » (il révèle qu'une fiche existe) ; afficher les relations entrantes sur la fiche cible (non promis ; le graphe les déduit, AD-41). |
| AD-73 | **L'agent est un port `AgentTransport`, distinct du transport texte** repris d'Antre-du-maitre (conçu pour un tour sans outil). Adaptateurs : `claude-agent` (Agent SDK, abonnement de Monsieur, AD-54) et `bouchon` (AD-78). Pour `claude-agent` : les outils du catalogue sont exposés par un serveur MCP **en processus** nommé `kanevas` ; `tools` vide (aucun outil intégré du SDK : ni fichiers, ni shell, ni réseau) ; `settingSources` vide (le SDK ne charge aucun réglage du pod) ; `allowedTools` égal aux seuls `mcp__kanevas__<outil>` du catalogue ; `permissionMode` `dontAsk` ; `maxTurns` 12 ; un `AbortController` ; le jeton `CLAUDE_CODE_OAUTH_TOKEN` passé dans l'`env` de l'appel, lu par le seul module de configuration, jamais journalisé ni renvoyé. Le port est assez étroit pour qu'un outil (images, propositions) s'ajoute au catalogue sans le modifier. Écarté : réutiliser le transport texte (pas d'outils) ; les outils intégrés du SDK (porte dérobée sur le pod). Risque connu, tranché (non une question ouverte) : que le SDK accepte des outils en processus avec ce jeton ; ne se constate qu'au premier vrai appel, qui a lieu après la recette (voir l'ordre ci-dessous), et jusque-là l'adaptateur `claude-agent` n'est exercé que par une `query` factice. Ordre : la recette de la tranche se joue en bouchon ; le premier vrai appel se joue sur l'URL déployée, donc **après** la fusion de `kanevas-am-deploy` (qui déclare une variable facultative, inoffensive tant que Monsieur n'a pas posé la valeur) et la pose du jeton. Si c'est faux, c'est l'adaptateur `claude-agent` qui est repris (réouverture de la tâche `kanevas-am-transport`) ; la variable déjà déclarée reste, sans effet. |
| AD-74 | **Deux catalogues, choisis par le serveur.** Joueur : `chercher` (un mot ou plus, dans un type ou dans tous : sans type, l'outil appelle la recherche d'un type, AD-63, pour chacun des sept types et rend les fiches par type puis titre, 20 au plus, en disant quand la liste est tronquée), `lire_fiche`, `lire_section`, `modifier_section`, `ajouter_a_section` (ajoute un paragraphe après le contenu, sans recopier le texte existant), `lister_campagnes`. MJ : ceux-là, plus `creer_campagne` et `creer_scenario` (AD-31). Un outil est une description, un schéma et un exécuteur qui appelle une fonction de service que la route appelle aussi (AD-2) ; **le compte, l'univers et le rôle ne sont jamais des paramètres** : ils viennent de la session et de l'adresse de la route, et l'acteur est le compte seul, sans mode Joueur (un MJ en mode Joueur garde son catalogue MJ). Un compte sans rôle dans l'univers n'a pas de catalogue (même refus qu'un univers inconnu). Un outil refusé rend le même résultat que l'interface — « Introuvable. » pour ce qui n'est pas lisible, « Vous ne pouvez pas modifier cette section. » pour ce qui est lisible sans être écrit, « La section a changé depuis que vous l'avez lue. Relisez-la. » pour une version périmée (AD-59) — et n'ajoute aucun événement (AD-76). Les lectures rendent la `version` de la section. L'instruction système dit que l'assistant a exactement les droits de la personne, répond en français, et sur « Introuvable. » dit qu'il ne trouve pas, sans rien affirmer d'autre. Écarté : un outil de création de fiche ou de réglage d'audience (B-26 promet chercher, résumer, modifier) ; un outil sur les cartes et les graphes (hors de B-26 : ils se lisent à l'écran, pas par l'assistant). |
| AD-75 | **Une demande, une réponse**, sans flux ni état serveur (AD-28 interdit de stocker la conversation) : le client envoie le message et les 20 derniers messages du fil ; limites : 2 000 caractères par message, 20 messages d'historique, 12 tours d'agent, 120 secondes (l'`AbortController` arrête l'agent), **une demande à la fois par compte** (verrou dans le processus, une seule instance, AD-5, libéré sur erreur et sur délai). Erreurs : 400 (message vide, trop long, historique trop long), 404 (compte sans rôle ou univers inconnu), 429 `assistant_occupe`, 502 `assistant_erreur` (échec du transport ou délai, aucune écriture annoncée), 503 `assistant_indisponible` (AD-77). Écarté : le flux SSE (reprise, annulation, pour un gain d'affichage). À rouvrir si les réponses dépassent régulièrement 30 secondes. |
| AD-76 | **Ce que l'agent a écrit se dit.** Chaque outil d'écriture réussi ajoute à la réponse un **événement** `{type, libelle, cible}` : `section_modifiee`, `section_completee`, `campagne_creee`, `scenario_cree`. Le libellé est écrit par le serveur et ne nomme que ce que la personne peut lire (le scénario et la campagne pour un MJ). La `cible` (type, identifiants) permet au client de construire le lien. Côté écran, un **registre de blocs** (`frontend/src/ecrans/assistant/blocs/registre.ts`) : une ligne par `type` d'événement ; cette tranche inscrit le bloc `ecriture`, les tranches `kanevas-monde` et `kanevas-images` inscrivent le leur sans modifier un bloc existant. |
| AD-77 | **Sans jeton, l'assistant est indisponible et le dit.** Disponibilité : `bouchon` si `KANEVAS_STUB=1`, `claude-agent` si `CLAUDE_CODE_OAUTH_TOKEN` est non vide, sinon aucune : la route de disponibilité rend `disponible: false`, l'envoi rend 503 `assistant_indisponible`, ni le bouchon ni le SDK ne sont appelés — jamais de repli silencieux sur le bouchon. La variable est facultative dans le déploiement : un secret manquant ne casse ni OIDC ni le démarrage. Le jeton est posé par Monsieur (AD-54). |
| AD-78 | **Le bouchon de l'assistant est un script de mots-clés ordonné** : la première règle dont les mots-clés figurent dans le message gagne ; elle appelle les vrais outils du catalogue de la personne, et compose la réponse de leur résultat. Règles : « crée un scénario « T » dans « C » » → `creer_scenario` ; « crée une campagne « C » » → `creer_campagne` ; « lis-moi la section « S » » → `lire_section` ; « ajoute le paragraphe « P » dans « S » » → `ajouter_a_section` ; « que sait-on d'X » → `chercher` puis `lire_fiche` ; un message contenant « échec » lève l'erreur de transport ; sinon la réponse « Je ne sais répondre qu'à des demandes de test : chercher, lire, ajouter, créer une campagne ou un scénario. » Un outil absent du catalogue (le Joueur demande de créer un scénario) donne un refus, jamais une écriture. |
| AD-79 | **Une proposition est une ligne, à son seul demandeur** (`docs/donnees.md`) : le contenu proposé, la section, le compte-rendu source et la `version` de la section lue (AD-59) — c'est l'« empreinte » du cadrage, sans second mécanisme. Elle ne se lit, ne s'applique et ne s'abandonne que par son demandeur, encore MJ de l'univers ; pour tout autre compte elle répond comme une adresse inconnue (AD-22). **Une en attente par (demandeur, section)** : la nouvelle remplace l'ancienne dans une transaction, ce qui borne les propositions que le rechargement du fil rend inatteignables (AD-28). Abandonner la supprime ; appliquée, elle reste, marquée, et ne se réapplique pas. Écarté : une empreinte de contenu (une version suffit, elle existe déjà) ; garder les abandonnées (rien ne les relit) ; une liste « mes propositions » (hors périmètre : propositions en lot, reprise après rechargement). |
| AD-80 | **`proposer_mise_a_jour` est un outil du seul catalogue MJ** (AD-74) : paramètres `section_id`, `cr_id`, `version` (celle que `lire_section` a rendue) et `contenu` ; il appelle la fonction de service de création d'une proposition, qui vérifie que la section est de l'univers et que le CR est une fiche de type compte-rendu lisible, refuse un contenu vide ou de plus de 20 000 caractères, et refuse une `version` périmée comme `modifier_section` (« La section a changé depuis que vous l'avez lue. Relisez-la. »). **L'outil n'écrit jamais dans une section** et le catalogue n'a aucun outil qui applique (AD-48). Succès : un événement `proposition_creee` (AD-76) dont la cible est l'identifiant de la proposition et dont le libellé nomme la fiche et la section. Bouchon (AD-78) : la règle « mets à jour la section « S » d'après le compte-rendu « C » » appelle `chercher` (le CR), `lire_section` puis `proposer_mise_a_jour` avec le contenu actuel suivi d'un paragraphe « Mise à jour d'après « C ». » ; placée avant la règle « lis-moi la section ». |
| AD-81 | **Appliquer est une route, un geste du MJ** : `GET /api/univers/:id/propositions/:pid` (la proposition, la section courante, `etat` : `en_attente`, `appliquee` ou `perimee`), `POST …/appliquer`, `POST …/abandonner`. Appliquer appelle **la fonction d'écriture de section existante** (AD-2, AD-59) avec `version_origine`, et marque `appliquee_le` dans la même transaction : si la section a changé, 409 `section_modifiee`, rien n'est écrit ; si la proposition est déjà appliquée, 409 `proposition_appliquee` ; abandonner une appliquée aussi. Les gardes sont celles d'un MJ qui écrit la section ; compte autre que le demandeur, MJ retiré, univers autre : 404. Écarté : appliquer sans comparer les versions (écraserait une édition) ; fusionner les deux textes (aucun moyen sûr de le faire sans interprétation). |
| AD-82 | **Le bloc se relit au serveur.** Le fil garde `proposition_creee` et sa cible, pas l'état : le bloc `proposition` du registre d'E-12 (AD-76) lit la proposition à l'affichage et après chaque geste, si bien qu'un bloc ancien dit « appliquée », « périmée » ou « n'existe plus » selon la base. Contenu rendu en texte brut (AD-58). L'assistant ne connaît pas l'écran courant : le compte-rendu se nomme dans la demande. |

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
| Authelia (OIDC) | un écran de connexion qui liste les comptes de test (Antor, Léa, Teo, Mira, Admin) ; la session est la même qu'après Authelia, groupes compris (Admin porte `parents`, que `kanevas-recours-admin` lit comme ceux d'Authelia) | `kanevas-premiere-fiche` |
| Modèle de l'assistant (AD-54) | transport `bouchon` : des réponses scriptées, choisies par mots-clés, qui appellent les vrais outils avec les droits de la personne | `kanevas-assistant-membre` ; la règle de proposition (AD-80) : `kanevas-monde` |
| Moteur d'images (AD-50) | adaptateur `bouchon` : une image fixe, attachée par le vrai chemin (AD-44) ; une demande qui contient « échec » échoue, pour tester ce cas | `kanevas-images` |

Activation : `KANEVAS_STUB=1` (AD-55), jamais posée dans `k8s-home-lab`. La recette de
Monsieur sur l'URL de production reste réelle.

## Sécurité

| Menace | Réponse |
|---|---|
| Un joueur apprend qu'une chose existe (fiche, section, carte, titre) | Elle est absente partout ; son adresse répond comme une adresse inconnue (AD-22, AD-38). |
| Un fichier secret récupéré en devinant son adresse | Nom sur disque aléatoire ; aucune route statique ; garde revérifiée à chaque octet servi (AD-7, AD-35, AD-36). |
| L'agent comme porte dérobée | Mêmes fonctions et mêmes gardes que les routes (AD-2) ; catalogue choisi par le serveur (AD-26). |
| Un joueur écrit dans une section que l'agent du MJ lira (injection d'instructions) | L'agent du MJ peut modifier des sections : chaque écriture est listée dans le fil avec un lien (B-26), et une mise à jour du monde n'est jamais appliquée par l'agent (AD-48). **Risque accepté** en V1, pas de confirmation par écriture. Une proposition issue d'un compte-rendu qu'un joueur a écrit est lue par le MJ, côte à côte avec l'actuel, avant tout geste (AD-48, AD-81). |
| Codex s'exécute sans bac à sable, dans un pod root ; son jeton est sur le volume sauvegardé | **Risque accepté** (décision de Monsieur sur le moteur) : le pod est le bac à sable, le jeton est en 0600, un processus par demande, un répertoire jetable. |
| Usurpation d'identité | Authelia seul authentifie ; aucune base d'utilisateurs maison. Seule dérogation : le mode bouchon, hors production (ligne suivante). |
| Le mode bouchon ouvert en production (n'importe qui choisit son compte) | Kanevas refuse de démarrer en bouchon dès qu'une variable `OIDC_*` est posée ; la variable n'est jamais posée dans `k8s-home-lab` ; un bandeau visible sur chaque page (AD-55). |

## Différé

- Import depuis Kanka — epic à part.
- Suppression de contenu, historique, export — à rouvrir à l'usage.
- Types de fiches dédiés avec caractéristiques structurées.
