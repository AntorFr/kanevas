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
S'y ajoutent le système de jeu et, avec `kanevas-suivi`, le suivi de la séance : campagnes, scénarios,
préparation, comptes-rendus ; `kanevas-relier-chercher`, les relations entre fiches et la recherche dans un
type (index FTS5, AD-63, AD-64) ; les pièces jointes (stockage sur le volume, bloc de E-9) ;
`kanevas-assistant-membre`, l'assistant de chaque membre : un panneau de conversation dont les outils
appellent les mêmes fonctions de service que les routes, avec les droits de la personne (AD-73 à AD-78).
Pas de cartes : tranche suivante ; l'assistant ne propose encore aucune mise à jour du monde ni aucune image.

## Carte

- `src/server.ts`, `src/app.ts` : démarrage et assemblage de l'app Fastify
  (`buildApp`), seule application du dépôt ; toutes les routes futures s'y
  enregistrent.
- `src/config/env.ts` : lecture de l'environnement (zod) ; seule exception, `FRONTEND_DIR`, lu par `src/routes/frontend.ts` (réglage des tests).
- `src/routes/health.ts` : `registerHealthRoutes`, `GET /healthz`.
- `src/routes/auth.ts`, `src/services/oidc.ts` : login et callback OIDC ; le callback ouvre la
  session (`src/services/session.ts`, AD-56) et crée le compte à la première connexion.
- `src/routes/frontend.ts` : sert le build du frontend (`FRONTEND_DIR`, `dist/public`) derrière la garde de session ; `src/routes/erreurs.ts` : traduit les erreurs de service en réponses HTTP ; `src/routes/pages.ts` : pages HTML du bouchon.
- `src/routes/bouchon.ts` : mode bouchon (AD-55), absent de la table des routes sans `KANEVAS_STUB`.
- `src/services/assistant/` : le catalogue d'outils d'un rôle (AD-74), le port `AgentTransport` et ses
  adaptateurs `bouchon` et `claude-agent` (AD-73, AD-78), la disponibilité (AD-77) et
  l'orchestration d'une demande (AD-75) ; `src/routes/assistant.ts` : les deux routes. Aucune requête SQL
  dans ce module (AD-2, AD-27).
- `src/db/` : ouverture du fichier SQLite, `migrations/0001-*.sql`, `0002-systemes.sql`, `0003-suivi.sql`, `0004-pieces-jointes.sql`, `0005-relier-chercher.sql`, `0006-illustrations.sql`, runner (AD-14).
- `src/services/` : `comptes`, `univers`, `membres`, `fiches`, `sections`, `droits`, `systemes`, `relations`, `campagnes`, `scenarios`, `preparation`, `comptes_rendus`, `pieces-jointes`, `illustrations`, `stockage` — les seules
  fonctions qui lisent ou écrivent les données (AD-2) ; `src/routes/` : routes `/api` minces.
- `frontend/` : application React/Vite (AD-57) ; `frontend/src/ui/tokens.css` et
  `frontend/src/ui/` : tokens et composants de `docs/charte.md` ; son build est servi par Fastify. Le cadre
  (`Cadre.tsx`, `Barre.tsx`) est commun à tous les écrans ; `/demo-composants` (bouchon seul, 404 sinon) montre les composants (AD-92 pour polices et icônes).
- `src/services/systemes.ts` : catalogue, rattacher, créer et rattacher, gabarits ; la modification
  d'un univers est dans `src/services/univers.ts` ; leurs routes sont `src/routes/systemes.ts`
  (AD-83 à AD-85, AD-94). Écrans : E-14 (Paramètres), E-16 (Systèmes de jeu, `ecrans/systemes.tsx`), E-15 (Système de jeu, `/systemes/:sid`, `ecrans/systeme.tsx` ; l'ancienne adresse `/univers/:id/systeme` redirige par `ecrans/systeme-ancien.tsx`) et le bloc « Système de jeu » de E-3.
- `src/services/{campagnes,scenarios,preparation,comptes_rendus}.ts` et `src/routes/suivi.ts` : le suivi
  (AD-29, AD-30, AD-33, AD-34, AD-46, AD-47, AD-60 à AD-62). Un compte-rendu est une fiche de type
  `compte_rendu` ; scénarios et tâches se garde sur l'univers de la campagne, jamais sur un identifiant
  d'univers fourni. Écrans : E-6 Campagne (+ liste), E-7 Scénario, E-13 Comptes-rendus, trois blocs de E-3
  (campagnes actives, derniers comptes-rendus, préparation pour le MJ) et la ligne « Campagne » de E-9
  (registre `fiche/lignes/`).

- Pièces jointes (`kanevas-fichiers`) : `src/services/stockage.ts` (écrire, lire, supprimer un fichier du volume),
  `src/services/pieces-jointes.ts` (déposer, marquer, retirer, lire, garde) et leurs routes `/api` (dans `src/routes/fiches.ts`)
  (AD-65 à AD-67), et le bloc Pièces jointes de E-9.
- Illustrations (`kanevas-illustrations`, AD-93) : `src/services/illustrations.ts` (poser, retirer, lire ; octets via `stockage.ts`), routes dans `src/routes/fiches.ts`, grille de cartes de E-8 et en-tête de E-9.
- `src/bouchon/depart.ts` et `src/bouchon/demo/` : monde de démonstration semé en bouchon sur une base sans univers (par les fonctions de service) ; `KANEVAS_SANS_SEMIS=1` le coupe.
- `src/services/llm/` : transports LLM (`transport.ts`, `anthropic-transport.ts`,
  `claude-agent-transport.ts`), repris d'Antre-du-maitre, branchés nulle part.
- `Dockerfile` (multi-stage, utilisateur `node`) et
  `.github/workflows/docker-publish.yml` (tests puis image GHCR).

Volume `/data` : `kanevas.db` (SQLite, WAL), `session.key` (secret de session, 0600) et
`attachments/` (les pièces jointes, un fichier par UUID, AD-65 ; `attachments/tmp/` pour les envois
en cours, vidé au démarrage sauf avec une base en mémoire, où le dossier est partagé).

## Routes `/api`

Toutes gardées par la session (401 sans session), sauf `/api/auth/*`. Les erreurs de service sont
`introuvable` 404, `refuse` 403, `invalide` 400, `conflit` 409 (`section_modifiee`, `nom_pris`, `gabarit_modifie`, `scenario_modifie`, `relation_existante`, `limite_relations`, `limite_pieces` : 50 pièces par section ; 400 `fichier_vide` pour un fichier vide ; `auto_relation` est un 400 `invalide`). Retirer le dernier
MJ répond `invalide` 400 avec la raison ; un contenu de section de plus de 20 000 caractères aussi (AD-91). Le corps d'une erreur de service est `{message}` (plus `code` quand le service en donne un) ; une adresse `/api/...` qu'aucune route ne porte (par exemple une route retirée par AD-94) répond 404 par la page HTML « Page introuvable. », pas par du JSON. Le serveur écoute sur `0.0.0.0` (`-p 3001:3001` suffit).
En mode bouchon, `POST /connexion-bouchon` attend un corps form-urlencoded `compte=<identifiant>`.
Les lignes qui citent AD-93 ou AD-94 sont celles de `kanevas-illustrations`, construites par elle ;
elles remplacent les anciennes routes `GET /api/univers/:id/systeme` et `…/systeme/gabarits*`.

| Route | Rôle |
|---|---|
| `GET /api/moi`, `POST /api/auth/logout` | identité, groupes et limites (`limites.contenuSection`, AD-91) du compte ; fin de session |
| `GET /api/auth/config`, `GET /api/auth/oidc/login`, `.../callback` | OIDC (publiques) |
| `GET\|POST /api/univers`, `GET /api/univers/:id` | univers du compte (avec son rôle, `systeme: {id, nom}` ou `null` (AD-94) et, dans la liste, `nbMembres` pour les cartes de E-1) ; création |
| `PATCH /api/univers/:id` | nom et description (MJ) |
| `GET /api/systemes` | les systèmes rattachés à un univers dont le compte est membre, par nom : `[{id, nom, nbUnivers, entrees: {regle, creature, objet}, mesUnivers: [{id, nom, role}], peutEcrire}]` — jamais un univers dont le compte n'est pas membre (AD-84, AD-94) |
| `GET /api/systemes/catalogue`, `POST /api/systemes` | catalogue (couples id, nom), lu par un MJ d'au moins un univers (E-14) ; création d'un système |
| `GET /api/systemes/:sid` (`:sid` entier ; `?type` = `regle` (défaut de l'API ; l'écran demande `creature`), `creature` ou `objet`, sinon 400 ; `?curseur`) | le système, `nbUnivers`, `mesUnivers`, `peutEcrire`, et `gabarits` (les entrées du type, 100 à la fois) avec `suivant` (curseur de la page suivante ou null) ; 404 identique à un identifiant inconnu s'il n'est rattaché à aucun univers du compte (AD-94) |
| `POST /api/systemes/:sid/gabarits`, `PUT /api/systemes/:sid/gabarits/:gabaritId` | ajouter, modifier avec la version lue (AD-85) : MJ d'au moins un univers rattaché ; 403 pour qui lit sans être MJ ; 404 pour qui ne le voit pas |
| `PUT /api/univers/:id/systeme`, `POST /api/univers/:id/systeme-nouveau` | rattacher (`{systemeId}` ou `null` pour détacher ; 204 sans corps), créer et rattacher (201) (MJ) |
| `GET\|POST /api/univers/:id/membres`, `PATCH\|DELETE .../membres/:compteId` | membres (MJ) |
| `GET\|POST /api/univers/:id/fiches` (`?type`, `?q`, `?curseur`) | liste paginée (100), `q` (vide ou plus de 100 caractères : 400 ; sans lettre ni chiffre : liste vide) cherche dans le type (AD-63) ; création (MJ) |
| `GET .../fiches/:fid` | fiche et sections lisibles ; `?mode=joueur` lit en Joueur ; 404 si aucune section n'est lisible (l'écran le traduit en « Aucune section n'est visible des joueurs. ») |
| `POST .../fiches/:fid/sections`, `PUT .../fiches/:fid/ordre` | ajouter, ordonner (MJ) |
| `GET\|PATCH\|DELETE .../sections/:sid` | lire ; titre et audience (MJ) ; retirer (MJ) |
| `GET\|POST .../sections/:sid/relations`, `DELETE /api/univers/:id/fiches/relations/:rid` (sans `:fid`) | relations lisibles de la section `{relations: [{id, type, cible: {id, titre, type}}]}` (AD-64) ; relier `{cibleFicheId, type}` (201 ; `type` est le libellé libre de la relation, 1 à 80 caractères, `cible.type` est le type de fiche) et retirer (204), MJ seul, 404 pour un joueur |
| `POST .../sections/:sid/pieces-jointes` | ajouter une pièce (multipart, un fichier par requête ; champ `secrete` **avant** le champ `fichier`, sinon ignoré ; 201, rend la pièce) ; droit d'écriture sur la section |
| `PATCH\|DELETE .../pieces-jointes/:pid` | marquer ou lever « secrète » `{secrete}` (MJ) ; retirer (204) |
| `GET .../pieces-jointes/:pid/fichier` | les octets, sous les règles de lecture réelles (pas de mode) ; 404 identique à une adresse inconnue |
| `PUT\|DELETE\|GET .../fiches/:fid/illustration` (`GET` : `?v=<jeton>`) | poser ou remplacer (multipart, une partie `fichier` ; MJ ; 400 `pas_une_image`, `fichier_vide`), retirer (204, MJ), lire (qui voit la fiche ; 404 identique sinon) ; la liste et la fiche rendent `illustration: null` ou `{jeton}` (AD-93) |
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
- **Douze tables et deux index de recherche, aucun ORM** : `comptes`, `univers`, `membres`, `fiches`, `sections` (migration
  0001), `systemes_jeu`, `gabarits` (migration 0002), `campagnes`, `scenarios`, `taches_preparation` (migration 0003), `pieces_jointes` (migration 0004), `relations`, `recherche_fiches` et `recherche_sections` (FTS5, migration 0005) ; trois colonnes d'illustration sur `fiches` (migration 0006) ; les numéros 0001 à 0006 sont définitifs, les suivants se prennent à la fusion (AD-51 ; `docs/donnees.md`). Aucune requête SQL hors de `src/services/` et `src/db/`.
- **Toute route hors `/healthz`, `/api/auth/*` et, en bouchon, `/connexion-bouchon` est gardée par la session** ; sous `/api` un
  défaut de session répond 401, ailleurs il redirige vers la connexion (AD-15).
- **Une seule route appelle un modèle : l'assistant** (`src/routes/assistant.ts`, par `repondre`, AD-73), avec le jeton de
  l'abonnement `CLAUDE_CODE_OAUTH_TOKEN` ; le transport texte de `services/llm/*` n'est relié à rien. Aucun secret `ANTHROPIC_API_KEY` n'est déployé.
  Les deux routes (sous la garde de session, AD-15) : `GET /api/univers/:id/assistant` rend `{disponible, catalogue: 'mj'|'joueur'}` ;
  `POST /api/univers/:id/assistant/messages`, corps `{message, historique: [{role: 'user'|'assistant', content}]}`, rend
  `{reponse, evenements: [{type, libelle, cible}]}` ; une erreur rend `{message, code}` (codes d'AD-75 et d'AD-77).
- Client OIDC : `client_id` `kanevas`, callback
  `https://kanevas.berard.me/api/auth/oidc/callback`, émetteur
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

> Construit à ce jour : la session, le mode bouchon, les tables et leurs fonctions de service,
> les systèmes de jeu et leurs gabarits, les relations et la recherche dans un type, le suivi (campagnes, scénarios, préparation, comptes-rendus), les écrans E-1 à E-4, E-6 à E-9 (E-9 avec son bloc Pièces jointes), E-13, E-14, E-15 et E-16, l'illustration des fiches, le stockage des fichiers sur le volume, et l'assistant du membre (E-12 ; ses outils : chercher, lire, écrire dans une section, créer une campagne ou un scénario). Le reste (propositions de mise à jour, images,
> cartes, administration) est la cible des tranches suivantes.

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
| AD-83 | *La règle d'accès « toujours par un univers » est remplacée par AD-94 (routes `/api/systemes/:sid`, catalogue à `GET /api/systemes/catalogue`) ; le reste tient.* **Système de jeu et rattachement** : `systemes_jeu` (sans univers) et `gabarits` ; l'univers porte un `systeme_id` facultatif (AD-23, AD-24). Dans cette décision d'origine, l'accès à un système passait **toujours par un univers dont le compte est membre** (`/api/univers/:id/systeme`) ; le catalogue ne donnait que des noms. « Créer et rattacher » est une seule transaction. Écarté : une adresse `/api/systemes/:id` gardée par « rattaché à l'un des univers du compte » (une requête par lecture, aucun gain). |
| AD-84 | **Un système n'apprend rien sur les univers voisins** : il rend le nombre d'univers qui l'utilisent et jamais leurs noms ni leurs membres (AD-22). Précise AD-11 : « le lore reste propre à chaque univers ». Écarté : nommer les univers partenaires (maquette du cadrage), qui divulguerait l'existence d'univers dont le compte n'est pas membre. |
| AD-85 | **Gabarits** : contenu en texte brut (AD-58) ; écriture concurrente refusée par un entier `version`, comme AD-59 (HTTP 409, code `gabarit_modifie`) ; le type est fixé à la création ; pas de suppression (cadrage). Les fonctions de service prennent l'acteur et vérifient le rôle dans l'univers de **passage** ; elles sont les seules écritures, pour les routes comme pour l'agent (AD-2). Écarté : champs structurés (niveau, DEF, PV) — hors périmètre du cadrage (caractéristiques structurées). |
| AD-91 | **Plafond du contenu d'une section, côté serveur** : le service `sections` refuse un contenu de plus de 20 000 caractères (`String.length`), à l'ajout comme à l'écriture : HTTP 400 `invalide`, « Contenu trop long : 20 000 caractères au plus. », rien d'écrit, version inchangée. La valeur vit dans une seule constante serveur (`MAX_CONTENU_SECTION`), rendue au frontend par `GET /api/moi` (`limites.contenuSection`) : l'écran ne la recopie pas. Écarté : une route `/api/limites` (un aller-retour de plus, `/api/moi` est déjà chargé par le cadre de l'écran) ; une limite configurable (hors tranche, la valeur pourra évoluer). |
| AD-92 | **Polices et icônes embarquées** (refonte visuelle) : Fraunces, Newsreader et Inter viennent de paquets `@fontsource` et les icônes de `lucide-react`, versions épinglées, empaquetés par Vite et servis par l'application. Aucune requête vers un hôte tiers : l'instance reste autonome et rien ne fuit vers un CDN à chaque page. Une police manquante tombe sur sa pile de repli système. Écarté : Google Fonts et un CDN d'icônes (dépendance réseau, fuite des visites) ; un jeu d'icônes dessiné maison (incohérent, à maintenir). |
| AD-93 | **L'illustration d'une fiche** (`kanevas-illustrations`, décision de Monsieur du 2026-10-06 : « chaque fiche doit avoir une propriété possible qui est son image d'illustration »). *Lie* : la liste E-8, l'en-tête de E-9, le service des fiches, le module de stockage (AD-65). *Empêche* : une illustration qui fuirait plus ou moins que la fiche, une grille qui retélécharge chaque image à chaque visite, deux façons de reconnaître une image. *Règle* : une fiche porte **au plus une** illustration, propriété facultative de la fiche (trois colonnes sur `fiches`, `docs/donnees.md`), **visible de qui voit la fiche** (`peutVoirFiche`, droits réels, sans paramètre de mode) et **jamais secrète** ; **le MJ seul** la pose, la remplace, la retire. Le type est **déterminé par le serveur à la signature** (PNG, JPEG, GIF, WebP, comme AD-66) ; tout autre contenu est refusé, rien n'est écrit. Les octets passent par le module de stockage d'AD-65 (tmp puis renommage, même dossier) ; le droit se vérifie **avant** de lire le flux et **de nouveau** dans la transaction qui écrit ; le fichier remplacé est supprimé après la validation. **Aucun traitement d'image côté serveur** : l'original est servi, le navigateur le cadre (`object-fit: cover`) dans un cadre de taille fixe, et la grille charge ses images à l'approche (`loading="lazy"`). Routes (sous `/api/univers/:id/fiches/:fid`) : `PUT …/illustration` (multipart, une seule partie `fichier` ; poser ou remplacer ; 200 `{illustration: {jeton, type, taille}}`) ; `DELETE …/illustration` (204, aussi s'il n'y en avait pas) ; `GET …/illustration` (`?v=<jeton>` facultatif ; les octets, `Content-Type` de la colonne, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`). Erreurs : fiche inconnue ou invisible, ou sans illustration à la lecture → **404 de corps identique** à un identifiant inconnu (AD-22, AD-67) ; qui voit la fiche sans être MJ → **403** à `PUT` et `DELETE` ; fichier vide → 400 `fichier_vide` ; signature non reconnue → 400 `pas_une_image`. `GET /api/univers/:id/fiches` (liste et recherche) et `GET …/fiches/:fid` rendent `illustration: null` ou `{jeton}` ; le **jeton** est opaque (le nom sur disque, qui change à chaque remplacement) et ne sert qu'à construire l'adresse `…/illustration?v=<jeton>`. **Cache** : si `v` est le jeton courant, `Cache-Control: private, max-age=31536000, immutable` (l'adresse change avec l'image, rien à invalider) ; sans `v` ou avec un jeton périmé, `private, no-store`. Fait porteur : sans limite de taille (AD-7) et avec le `no-store` d'AD-66, une grille de 100 fiches retéléchargerait jusqu'à 100 originaux à chaque visite ; le jeton et le chargement à l'approche ramènent le coût à une fois par image et par navigateur. *Rejets* : une vignette **déduite des pièces jointes** (la première image d'une section) — écartée par Monsieur, et elle prendrait la visibilité d'une section, pas celle de la fiche ; une illustration **secrète** ou réglable par audience — écartée : l'illustration est au niveau du titre, qui n'est jamais secret, et un réglage de plus serait un second « qui voit quoi » sur la même fiche ; une **table liée** — une entité de plus pour une cardinalité que la colonne porte ; **redimensionner côté serveur** (`sharp`/libvips) — une dépendance native dans l'image, du calcul dans le pod et une seconde copie à tenir, pour un gain que le cache et `lazy` donnent déjà sur le réseau local (rouvert si la grille pèse trop au téléphone hors du réseau local) ; le `no-store` d'AD-66 tel quel — la grille retéléchargerait tout à chaque visite ; le jeton dans l'adresse sans contrôle de droit — la route revérifie toujours (AD-7)  ; un **plafond de taille** propre à l'illustration — écarté par Monsieur le 2026-10-06 : aucun plafond, comme AD-7 ; rouvrable si des photos de plusieurs dizaines de Mo arrivent. |
| AD-94 | **Le système de jeu, une dimension à part** (`kanevas-illustrations`, décision de Monsieur du 2026-10-06 : « le système de jeu devient une dimension à part, pas un sous-élément d'un univers »). Remplace, dans AD-83, « l'accès passe toujours par un univers » ; précise AD-85 (« l'univers de passage »). *Lie* : E-15, E-16, le bloc de E-3, E-14, le service et les routes des systèmes. *Empêche* : un écran de système dans le cadre d'un univers (fil « Lame d'Ébène › CoF Mini ») ; deux définitions de « qui voit un système » selon l'adresse ; une liste qui nommerait l'univers d'un autre compte. *Règle* : un système a **sa propre adresse**, gardée par **« rattaché à un univers dont le compte est membre »** (lire) et **« MJ d'au moins un de ces univers »** (écrire : ajouter, modifier une entrée) — le rôle s'évalue sur l'ensemble des univers du compte rattachés au système, jamais sur un univers fourni par l'appelant ; hors de cette garde, **404 de corps identique** à un identifiant inconnu (AD-22) ; qui lit sans écrire reçoit 403 à l'écriture. Ce qu'une réponse dit d'un système : son nom, le **nombre** d'univers qui l'utilisent, le nombre d'entrées par type, et **les seuls univers du compte** qui l'utilisent, avec son rôle (AD-84 inchangée). Routes : `GET /api/systemes` → les systèmes visibles du compte `[{id, nom, nbUnivers, entrees: {regle, creature, objet}, mesUnivers: [{id, nom, role}], peutEcrire}]`, par nom ; `GET /api/systemes/catalogue` → l'ancien catalogue (couples id, nom ; un MJ d'au moins un univers), lu par E-14 ; `POST /api/systemes` (création) inchangée ; `GET /api/systemes/:sid` (`?type`, `?curseur`) → le système, `nbUnivers`, `mesUnivers`, `peutEcrire` et ses entrées (100 à la fois) ; `POST /api/systemes/:sid/gabarits` et `PUT /api/systemes/:sid/gabarits/:gabaritId` (version lue, AD-85). `:sid` est validé par `idDeChemin` dans le handler (entier strict, sinon 404) ; la route statique `catalogue` est prioritaire sur `:sid`, donc `catalogue` n'est jamais pris pour un identifiant. `GET /api/univers/:id` rend `systeme: {id, nom}` ou `null` pour le bloc de E-3 et E-14. Restent sous l'univers, parce que ce sont des gestes sur l'univers : `PUT /api/univers/:id/systeme` (rattacher, détacher) et `POST …/systeme-nouveau` (créer et rattacher). Retirées dans la même tranche : `GET /api/univers/:id/systeme` et `…/systeme/gabarits*` (le frontend et le backend partent dans la même image, il n'y a pas de client à ménager) ; l'adresse d'écran `/univers/:id/systeme` redirige vers `/systemes/:sid`. Aucune donnée nouvelle : la garde se lit dans `membres` et `univers.systeme_id`. Un outil d'agent qui lirait un système appellerait ces mêmes fonctions gardées (AD-2) ; aucun ne le fait aujourd'hui. *Rejets* : garder l'accès par l'univers (AD-83) — le fil d'Ariane et la barre feraient du système une partie de l'univers, ce que Monsieur a écarté ; et une page de système atteinte par deux univers aurait deux adresses et deux cadres pour le même contenu. Le rejet d'AD-83 (« une requête par lecture, aucun gain ») tombe : **la sécurité est la même** (la garde « rattaché à un univers du compte » est exactement celle qu'appliquait le passage par l'univers, et une adresse devinée répond comme une adresse inconnue), la requête de plus est une jointure sur deux petites tables, et **le modèle de navigation l'exige désormais**. Écarté aussi : `GET /api/systemes` qui garderait le sens du catalogue avec un paramètre pour « mes systèmes » (une route, deux formes de réponse et deux droits) ; nommer les autres univers d'un système (AD-84). |
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
- **URL** `https://kanevas.berard.me` (wildcard, rien à créer).
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
| Données de départ (recette, critères) | au démarrage en bouchon, sur une base sans univers : univers, membres, systèmes, fiches et illustrations de démonstration, semés par les fonctions de service (`docs/ecrans.md`, « Données de départ du bouchon ») ; jamais hors bouchon, jamais dans les tests qui ne l'appellent pas | `kanevas-illustrations` : `kanevas-il-systemes-serveur` (mécanisme, monde sans illustration), puis `kanevas-il-illustration-ecrans` (illustrations, fichiers d'échec) |
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
| Une illustration reste dans le cache d'un navigateur après qu'il a perdu le droit de voir la fiche | **Risque accepté** (AD-93) : cache `private` du seul navigateur qui l'a déjà vue ; la fiche disparaît de ses listes, plus rien ne la redemande, et le serveur revérifie à chaque requête. L'illustration n'est jamais secrète. |
| Codex s'exécute sans bac à sable, dans un pod root ; son jeton est sur le volume sauvegardé | **Risque accepté** (décision de Monsieur sur le moteur) : le pod est le bac à sable, le jeton est en 0600, un processus par demande, un répertoire jetable. |
| Usurpation d'identité | Authelia seul authentifie ; aucune base d'utilisateurs maison. Seule dérogation : le mode bouchon, hors production (ligne suivante). |
| Le mode bouchon ouvert en production (n'importe qui choisit son compte) | Kanevas refuse de démarrer en bouchon dès qu'une variable `OIDC_*` est posée ; la variable n'est jamais posée dans `k8s-home-lab` ; un bandeau visible sur chaque page (AD-55). |

## Différé

- Import depuis Kanka — epic à part.
- Suppression de contenu, historique, export — à rouvrir à l'usage.
- Types de fiches dédiés avec caractéristiques structurées.
