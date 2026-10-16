# Status — kanevas

> MàJ : 2026-10-16 (3e assemblage de kanevas-import-mediatheque, après la revérification : total de E-19 indépendant des filtres, bascule du sélecteur alignée sur E-19 ; avant : assemblage de kanevas-import-mediatheque ; avant : assemblage de kanevas-import-arbre, sur `feature/kanevas-import-mediatheque` ; avant : assemblage de kanevas-import-recherche, sur `feature/kanevas-import-recherche` ; avant : reprise de l'assemblage de kanevas-import-types, qui porte les liens ; avant : assemblage de kanevas-import-liens, sur `feature/kanevas-import-liens`, qui porte aussi les tranches amont ; avant : assemblage de kanevas-import-secrets, sur `feature/kanevas-import-secrets` ; la branche porte aussi le travail de `kanevas-import-markdown` et `kanevas-import-fil` (PR vers `epic/kanevas-import`, non fusionnées à cette date) ; le reste décrit `epic/kanevas`)

**État :** `epic/kanevas` porte le socle, la première fiche, les systèmes de jeu, le suivi de la séance
(campagnes, scénarios, préparation, comptes-rendus ; E-6, E-7, E-13) et les pièces jointes (migration
`0004-pieces-jointes.sql`, AD-65 à AD-67). `kanevas-relier-chercher` (fusionnée, PR #8) y ajoute :
la migration `0005-relier-chercher.sql` (`relations`, index FTS5 `recherche_fiches` et `recherche_sections`,
déclencheurs, remplissage de l'existant), `services/relations.ts` (relier, retirer, lire sous deux gardes),
`peutVoirFiche` et les conditions SQL de lecture dans `droits.ts`, l'option `recherche` de `listerFiches`,
les routes `?q=` et `/relations`, le composant `ListeRecherche` (E-8, réemployé par « Relier ») et le bloc
Relations de E-9 (AD-63, AD-64). Carte et invariants : `ARCHITECTURE.md`.

`feature/kanevas-cartes-graphes` (PR vers `epic/kanevas`, non fusionnée) ajoute : la migration `0007-cartes.sql` (`cartes`,
`elements_carte`), `services/cartes.ts` (`lireCarte` seule lecture, filtrée pour le lecteur ; fond par `stockage.ts`, 25 Mo, AD-69),
les routes `/api/univers/:id/cartes…`, E-10 « Cartes », E-11 (carte illustrée à tokens en pourcentage, AD-70 ; graphe dont les liens
sont les relations lues sous les deux gardes et la disposition calculée dans le navigateur, AD-71) et le bloc « Cartes visibles » de E-3
(AD-68 à AD-72). Hors tranche : outils de l'agent sur les cartes, calques, échelle, zoom.

`kanevas-refonte-visuelle` (fusionnée) a refait la charte et tous les écrans construits : tokens clair/sombre,
polices et icônes embarquées (AD-92), composants partagés (`frontend/src/ui/`), cadre (navigation à icônes, barre haute,
tiroir au téléphone, thème et déconnexion dans le menu de l'avatar, seul endroit du thème), E-1 à E-4, E-6 à E-9, E-13 à E-15
avec leurs états, pastille/filet d'audience, menu « ⋯ » et toasts sur la fiche. Aucun geste, droit ni donnée nouveau.
Page `/demo-composants` en bouchon seulement. Maquettes de `docs/maquettes/` refaites.

`feature/kanevas-illustrations` (fusionnée dans `epic/kanevas`, PR #10) ajoute : l'illustration d'une fiche (migration `0006-illustrations.sql`, `services/illustrations.ts`, routes
`PUT|DELETE|GET …/fiches/:fid/illustration`, AD-93), la grille de cartes illustrées (E-8) et l'illustration en tête de E-9 ;
le système de jeu hors des univers (AD-94) : `GET /api/systemes` (systèmes du compte), `/api/systemes/catalogue`,
`/api/systemes/:sid…`, écrans E-16 « Systèmes de jeu » et E-15 à `/systemes/:sid` (l'ancienne adresse redirige), E-1 en
cartes ; le semis du bouchon (`src/bouchon/depart.ts`, fichiers dans `src/bouchon/demo/`).

`feature/kanevas-assistant-membre` (PR non fusionnée, part de `epic/kanevas`) ajoute l'assistant de chaque membre (E-12, AD-73 à AD-78),
sans migration : `src/services/assistant/` (catalogues d'outils MJ et Joueur fermés sur compte, univers et rôle ; port `AgentTransport`
et adaptateurs `bouchon` et `claude-agent` ; disponibilité ; orchestration `repondre`), `src/routes/assistant.ts`
(`GET /api/univers/:id/assistant`, `POST …/assistant/messages` ; formats dans `ARCHITECTURE.md`), et l'écran `frontend/src/ecrans/assistant*` (bouton flottant inversé, panneau, fil en
mémoire, registre de blocs d'écriture). Outils : chercher, lire_fiche, lire_section, modifier_section, ajouter_a_section,
lister_campagnes ; le MJ en plus creer_campagne et creer_scenario. Aucun outil de carte, de graphe ni d'image (la proposition vient de `kanevas-monde`, ci-dessous).

`feature/kanevas-import-markdown` (PR vers `epic/kanevas-import`, non fusionnée) : les textes se lisent et s'écrivent en Markdown (AD-95, AD-96, AD-113). `services/markdown.ts` (`rendreMarkdown`, `markdown-it` 15.0.2, `html: false`, liens http/https/mailto seulement, intertitres décalés, images = texte alternatif) ; chaque lecture renvoie `html`, `contenu` (source) seulement à qui peut écrire (l'assistant suit la même règle : vue rendue pour un lecteur, source pour qui peut écrire) ; `POST /api/apercu` ; migration `0009-plafond-contenu.sql` ; lecture rendue sur E-9, E-7, E-15, E-12 (bascule Rendu / Source) ; éditeur partagé `frontend/src/ui/editeur.tsx` (Gras, Italique, Écrire / Aperçu, compteur). Hors tranche : liens `[[…]]`, bloc MJ, fichiers dans le texte. Les textes existants sont relus tels quels. Piège : les tests e2e lisent `dist/` (relancer `npm run build`).

`feature/kanevas-import-mediatheque` (PR vers `epic/kanevas-import`, non fusionnée) : la médiathèque de l'univers (AD-111, AD-117). Migration `0015-mediatheque.sql` (`fichiers`, `fichiers_sections`, `fiches.illustration_fichier_id` ; pièces jointes et illustrations migrées (réservées au MJ si secrètes, ou si la section / la fiche n'est lue d'aucun joueur : la migration ne rouvre rien), `pieces_jointes` vidée mais conservée, colonnes d'illustration d'AD-93 inutilisées ; empreinte nulle et `ajoute_par` = MJ de plus petit compte pour l'existant). `services/fichiers.ts` remplace `pieces-jointes.ts` et `illustrations.ts` : `ajouterFichier` (visibilité déduite de l'endroit, jamais du client) et `fichierLisible` (double garde, troisième règle « qui a ajouté voit ») ; routes `/api/univers/:id/fichiers…` (`routes/fichiers.ts`, seule route des octets), jointure `…/sections/:sid/fichiers`, illustration `PUT|DELETE …/illustration`. Écrans : E-19 `ecrans/mediatheque.tsx`, bloc Pièces jointes, « Fichier » de l'éditeur, sélecteur, illustration de E-9 et E-8. Limite : 100 fichiers joints par section (`limite_pieces`). Semis du bouchon : « Plan secret de la Guilde », « Carte des Sphères » (trois usages) et « port-sel-quais.webp » dans la médiathèque (avec les illustrations déjà semées : une douzaine de lignes pour Antor), et la section « Notes de la table » de Léa. Hors tranche : l'API d'import des fichiers (`kanevas-import-fichiers`), la suppression d'une fiche (`kanevas-import-tenir`) ; `fichiers_attente` est créée par la 0015 mais n'a aucun écrivain avant `kanevas-import-fichiers` ; l'image générée par l'assistant se réduit à `ajouterFichier({compteId})` appelable, sans outil image (`kanevas-images`). Pièges : `rm -rf dist` avant `npm run build` après une renumérotation de migration ; les champs multipart (`section`, `maniere`, `blocMj`, `fiche`) précèdent `fichier` ; les tests e2e lisent `dist/`. Recette : README « Recette de la médiathèque ». Pièges encore vrais : `usagesLisibles` lit les références par la grammaire unique `extraireReferencesFichier` (jamais par `instr` sur `(fichier:id)`) ; `GET /fichiers` rend un `total` des fichiers lisibles hors filtres (l’en-tête de E-19), jamais un compte de fermés, et qui ne suit pas les filtres ; le test e2e premiere-fiche « B-9 Léa, auteur d'une section fermée » (menu « Qui voit » qui ne se ferme pas) est instable, aussi sur `epic/kanevas-import` ; le sélecteur de l’éditeur valide le fichier côté serveur avant de l’insérer.

**Reste :** la fusion et le tag `v*` (recette acceptée par Monsieur). Pour l'assistant : le **premier vrai appel** au modèle n'a jamais eu lieu —
l'adaptateur `claude-agent` n'est exercé que par une `query` factice. Il se joue sur l'URL déployée, après la fusion de `kanevas-am-deploy`
(`k8s-home-lab`) et la pose du jeton `CLAUDE_CODE_OAUTH_TOKEN` par Monsieur (OpenBao `claude/kanevas`, property `token`) ; si le SDK refuse
des outils en processus avec ce jeton, reprendre `claude-agent.ts` (AD-73). Sans jeton, l'assistant se dit indisponible. En bouchon, le monde de recette est semé au
démarrage ; hors bouchon rien n'est amorcé. Aucune image n'existe avant le tag.

`feature/kanevas-recours-admin` (PR non fusionnée, rattrapée sur `epic/kanevas` après la refonte visuelle) ajoute le recours admin : un compte du groupe
`parents` voit les univers de l'instance et leurs membres, en ajoute, change le rôle, en retire
(E-5, B-6), sans jamais lire le contenu. L'écran suit la maquette e05 et la charte (panneaux, en-têtes Identifiant/Rôle, « Retirer » discret, fil dans la barre haute ; le formulaire d'ajout passe à la ligne sous 760 px, l'identifiant gardant 12 rem au moins). Typecheck, build et tests verts (dont `src/e2e/administration*.test.ts`, navigateur piloté en bouchon ; ces tests dépendent de Playwright, absent de `package.json`, et sautent sans lui ; sous charge, un `page.goto` peut dépasser son délai de 8 s : relancer avant d'y voir un défaut).

- `src/services/instance.ts` : seul module à accepter le drapeau `admin` (AD-86), écrit dans `membres` et lit
  `univers` (id, nom, nombre de membres, AD-87) ; les règles de membres sont le noyau de `services/membres.ts`, partagé avec les
  fonctions MJ.
- `src/routes/instance.ts` : `/api/instance/univers` et `/api/instance/univers/:id/membres`
  (GET, POST, PATCH, DELETE). Hors du groupe, 404 comme une adresse inconnue (AD-87). L'acteur
  vient des groupes de la session, jamais de la requête.
- `frontend/src/ecrans/administration.tsx` : E-5, un seul motif `/administration/*` (le registre
  prend un chemin par fichier). Liste de membres partagée avec E-4 : `frontend/src/ListeMembres.tsx` (composants de `ui/`, toasts « ajouté / enregistré / retiré », boîte de dialogue de retrait).
  Entrée « Administration » déclarée dans `items.ts` (champs `groupe` et `horsUnivers`) ; `Barre.tsx` reste générique : elle montre l'entrée si `/api/moi` porte le groupe `parents`.

`feature/kanevas-monde` (PR non fusionnée, rattrapée sur `epic/kanevas`) ajoute la mise à jour du monde depuis un compte-rendu (P-5, B-21, AD-79 à AD-82) :
migration `0008-propositions.sql` (table `propositions`, index unique partiel « une en attente par demandeur et section »), `services/propositions.ts`
(créer, lire, appliquer, abandonner ; l'état `en_attente | perimee | appliquee` est calculé à chaque lecture), l'outil `proposer_mise_a_jour` du seul
catalogue MJ (événement `proposition_creee`) et sa règle du bouchon (« Mets à jour la section « S » de « F » d'après le compte-rendu « C » »),
`routes/propositions.ts` (`GET …/propositions/:pid`, `POST …/appliquer`, `POST …/abandonner` ; aucune route de création), et le bloc « Mise à jour proposée »
(`ecrans/assistant/blocs/proposition.tsx`). Appliquer passe par `ecrireContenu` avec la `version` lue. Typecheck et build verts ; `npm test` joué sous Node 22 à l'assemblage, 0 échec attribuable à la tranche ; la CI Node 20 fait foi. Les e2e du bloc (`src/e2e/proposition-ecran.test.ts`) dépendent de Playwright, absent du dépôt, et sautent sans lui.
**Reste (monde) :** la recette de Monsieur au navigateur en bouchon (scénario dans le README), puis la fusion et le tag `v*`.

**Reste (recours admin) :** la recette de Monsieur de l'administration au navigateur en bouchon (Admin ajoute Mira à « Lame d'Ébène » ; le monde de recette est semé), puis la fusion et le tag `v*`. Aucune image n'existe avant le tag.

**Pièges :**
- Administration : le groupe est lu à la connexion et vaut 7 jours (AD-86) ; la liste rend tous les univers, pagination par 100 côté client ; un admin sans rôle reste un compte sans rôle (AD-9). Les e2e `administration*` dépendent de Playwright (absent du dépôt) .
- Assistant : `repondre` est l'unique entrée ; ne jamais passer le compte, l'univers ou le rôle en paramètre d'un outil, ni lire
  `process.env` hors `config/env.ts` (seules exceptions : `FRONTEND_DIR`, `routes/frontend.ts`, et `PATH` transmis au processus de `connexion-claude.ts`). Une erreur du transport est rendue par un message fixe (jamais la cause, qui pourrait citer le jeton).
  Le verrou « une demande à la fois par compte » est en mémoire du processus (une seule instance). Le panneau se monte dans sa propre racine
  React (`assistant.tsx`) : il lit l'adresse par `assistant/adresse.ts`, pas par le routeur.
- Node 20 est la cible (CI, Dockerfile). `better-sqlite3` est donc épinglé en `^12` : la 13 exige
  Node ≥ 22 et plante (SIGSEGV) sous Node 20. Ne pas remonter sans changer aussi la CI et le Dockerfile.
- La suite a été jouée sous Node 22 dans les pods de la chaîne (pas de Docker) ; la CI Node 20 fait foi.
  La règle « conteneurs uniquement » de `CLAUDE.md` est la voie de référence ; un Node local ≥ 20 (README) est le repli quand
  Docker manque.
- Migrations : la plus haute de cette branche est 0015 (médiathèque) ; la prochaine tranche prend le numéro suivant libre à sa fusion (AD-51). Historique : 0001 à 0007 sont sur `epic/kanevas` ; 0008 (propositions) sur la branche de `kanevas-monde` ; 0009 (plafond 100 000) sur `epic/kanevas-import` ; 0010 (fil : jetons, lots, clés d'origine) sur `kanevas-import-fil` ; 0011 (`contenu_public`, index des sections) sur `kanevas-import-secrets`, numéro à reprendre à la fusion (AD-51) ; 0012 (liens) sur `kanevas-import-liens` ; 0013 (types : `fiches` recréée, `types_systeme`, `types_univers`) sur `kanevas-import-types`, renumérotée à la reprise de l'epic.
- Les « PR non fusionnée » ci-dessus s'empilent sur `epic/kanevas` ; `recours-admin` est rattrapée dessus et n'ajoute aucune migration.
- Vocabulaire : « Monsieur » = le commanditaire qui fait la recette ; « tranche » = une feature livrée ; « phase merge » = la
  fusion après recette ; E-n / B-n / P-n = écrans / besoins / parcours, les écrans (E-n) sont dans `docs/ecrans.md`, les besoins (B-n) et les parcours (P-n) dans `docs/parcours.md`.
- La CI ne construit d'image que sur un tag `v*` dont le commit porte l'attestation « tests-complets » (`npm run tests:attestes -- --publier` ou le workflow manuel `tests.yml`) ; ni `main` ni PR ne la déclenchent. L'image testable n'existe qu'après le tag, posé à la fusion.
- **Numéro de migration** : `0005-relier-chercher.sql` est sur `epic/kanevas` (fusionnée) et figée ; la migration de la prochaine tranche prend le numéro suivant à sa fusion (AD-51).
- Recherche : `listerFiches({recherche})` seule (AD-63) ; les index FTS5 ne livrent que des identifiants
  candidats, tenus par déclencheurs : ne jamais écrire dans `recherche_*` depuis le code. La saisie est
  neutralisée (mots cités en préfixe) ; vide ou > 100 caractères = 400.
- Relations : lues sous deux gardes (section porteuse et fiche cible lisibles, AD-64), sans compteur ni
  placeholder ; seul le MJ relie ou retire, un joueur reçoit 404. Pas de relations entrantes (hors tranche).
  Codes : `auto_relation` (400), `relation_existante` et `limite_relations` (409, 100 par section).
- Systèmes : l'accès est `/api/systemes/:sid…` (AD-94), gardé par « rattaché à un univers dont le compte est membre » ; seuls
  rattacher/détacher/créer-et-rattacher restent sous `/api/univers/:id/systeme…`. Un refus répond comme un identifiant inconnu (404) ; aucune réponse ne nomme un autre
  univers (AD-84) ; écriture de gabarit périmée = 409 `gabarit_modifie` (AD-85). Ni suppression, ni import
  de référentiel, ni visibilité différenciée des gabarits (hors tranche).
- Suivi : scénarios et tâches se gardent sur l'univers de la **campagne** (AD-47), jamais sur un identifiant
  d'univers fourni ; un refus répond 404. Le MJ qui crée un compte-rendu n'en est pas l'auteur affiché ;
  l'auteur Joueur lit et écrit sa section même fermée aux autres joueurs (AD-61). Plusieurs campagnes
  peuvent être actives (AD-60) ; aucune suppression nulle part.
- Refonte visuelle : le regard sur les maquettes (bureau, téléphone, clair, sombre) est celui de la vérification et de la recette ; aucun écran n'écrit de couleur en dur (tokens seuls) ; un écran neuf prend le cadre et les composants de `ui/`, il ne recrée ni bouton, ni menu, ni champ. E-10 et E-11 sont construits avec le cadre ; E-12 le prend déjà (tokens, `Bouton`, `Chargement`, `PastilleRole`).
- P-7 : le portrait (pièce jointe) et la demande à l'assistant (E-12) sont livrés.
- Pièces jointes : le type est déterminé par la signature des octets, jamais par le navigateur ; seules PNG,
  JPEG, GIF, WebP sont servies en ligne, le reste (SVG compris) en `attachment` sous `nosniff` et CSP sandbox.
  Un refus de lecture répond 404 comme un identifiant inconnu (AD-22) ; 100 fichiers joints au plus par section, pas de
  limite de taille ; joindre ou ôter une référence ne change pas la `version` de la section. La liste est `GET …/fichiers`.
  `stockage.ts` sert aussi aux fonds de carte (`services/cartes.ts`, AD-69), qui ne passent pas par `ajouterFichier`.
- Rendu du bloc Pièces jointes vérifié par les tests e2e (Playwright) là où il est installé ; la CI l'installe et les joue.
- « Connexion perdue » (frontend/src/api.ts) : sondé toutes les 3 s sur `/healthz` tant que le bandeau
  est levé ; il disparaît seul au retour du serveur.
- Tout texte Markdown (section, compte-rendu, scénario, entrée de système, contenu proposé) est plafonné à 100 000 caractères
  (`MAX_CONTENU_SECTION`, AD-91, AD-106 ; migration 0009 relève les CHECK SQL), rendu par `GET /api/moi` (`limites.contenuSection`).
- Doublons connus, non traités : `corps(request)` (routes/fiches.ts, univers.ts), message d'échec
  des écrans, texte du bandeau bouchon (pages.ts / Cadre.tsx).

- Sans `/data` en production, la base est en mémoire (avertissement au démarrage) ; la clé de session
  vient de `SESSION_SECRET`, sinon de `<data>/session.key`.
- Le callback OIDC ne rend la page « Connexion refusée/indisponible » que si `Accept` contient
  `text/html`, sinon 401 JSON.
- Code mort ou sans appelant, non traité : `export { ErreurService }` (droits.ts), `renommerSection`
  et la branche titre du PATCH d'une section (renommer est hors tranche), option `limite` de
  `listerFiches`, `blocsVisibles`/`blocsSectionVisibles` jumeaux ; le parseur form-urlencoded du
  bouchon vaut aussi pour `/api`.

- Illustration (AD-93) : le MJ seul pose/remplace/retire ; le type est lu à la signature ; aucun traitement d'image ni plafond
  de taille ; le jeton `?v=` rend l'image cachable un an, le serveur revérifie le droit à chaque requête ; l'illustration est
  un fichier de la médiathèque (`{fichierId}`, AD-117) : la retirer ou la remplacer ne le supprime pas. Hors tranche : illustration dans
  relations/cartes/recherche, outil d'assistant.
- Bouchon : au démarrage, sur une base sans univers, `semerBouchon` pose le monde de recette (Lame d'Ébène, Landes grises,
  CoF Mini…) puis `semerIllustrations` ; `KANEVAS_SANS_SEMIS=1` le coupe (utilisé par les e2e). Jamais hors bouchon.
- Cartes : un graphe n'a ni position stockée ni déplacement de nœud (AD-71) ; la forme d'une carte ne change jamais ; un fond ne se retire pas, il se remplace ; aucune suppression de carte ni d'élément autre que « Retirer de la carte ». La fiche retirée reste.
- Propositions (AD-79 à AD-82) : lues, appliquées, abandonnées par leur seul demandeur, encore MJ ; tout autre compte reçoit 404. Le fil ne se garde pas (AD-28) : après un rechargement, une proposition en attente n'est plus atteignable (limite écrite, bornée à une par MJ et section ; pas de liste « mes propositions »). Hors tranche : application par un joueur, propositions en lot. L'assistant ne sait pas quel écran est ouvert : le compte-rendu se nomme dans la demande. Le semis du bouchon n'a ni campagne ni compte-rendu : la recette les crée (README).

`feature/kanevas-import-fil` (PR vers `epic/kanevas-import`, non fusionnée ; ce paragraphe vaut jusqu'à sa fusion) ajoute l'API d'import et E-18 (AD-103, AD-104 ; B-45 à B-50, P-10 étapes 3-5-7-10, P-11) :
migration `0010-fil-contrat.sql` (0009 est le plafond de l'epic) (`jetons_api`, `lots_import`, `fiches.cle_origine` / `dernier_import`, `sections.cle_origine` / `version_importee` / `dernier_import`),
`services/jetons.ts`, `services/lots.ts`, `services/import-fiches.ts` (`assurerFiche`, composition des services existants), scope `routes/import.ts` (`/api/import/v1`, Bearer seul,
401 `jeton_invalide` unique, 404 autre univers, corps 8 Mio), routes de session `routes/acces-api.ts`, écran `frontend/src/ecrans/acces-api.tsx` (E-18),
ligne « Importée · clé … » du menu « ⋯ » de E-9 (MJ seul ; `cleOrigine` jamais dans une lecture de joueur). Semis du bouchon : « Essai Kanka » (Antor MJ, Léa joueuse) et `JETON_BOUCHON`.
- Seule la fiche est importée ici, six types à l'époque de `import-fil`, treize depuis `kanevas-import-types` (pas `compte_rendu`, refusé 400 `champ: type`) ; contenu reçu en texte, plafond 100 000 (AD-106, `contenuSection` de `GET /`), `:::mj` accepté dans un contenu (`kanevas-import-secrets`, même chemin d'écriture), pas de lien, parent, alias, fichier, relation.
- Un titre de fiche ou de section modifié hors de l'import n'est pas écrasé au rejeu (avertissement au lot) ; une section sans clé n'est jamais touchée ; rien ne se supprime par omission.
- Un rejeu sans lot (`?lot=` absent) écrit mais ne laisse aucune trace de compteur ; un lot clos répond 409 `lot_clos`.
- Reste : la recette de Monsieur au navigateur en bouchon (README, « Recette de l'accès par API »), la fusion dans `epic/kanevas-import`. Tranches suivantes : markdown, secrets, liens, types, arbre, recherche, fichiers, reprise. Pas de tag avant la fusion de l'epic.

`feature/kanevas-import-secrets` (PR vers `epic/kanevas-import`, non fusionnée) ajoute le bloc MJ `:::mj` au milieu d'un texte (B-34, AD-98, AD-114) :
migration `0011-contenu-public.sql` (`sections.contenu_public`, index `recherche_sections (titre, contenu_public, contenu)` recréé), `contenuPublic` et le conteneur `mj`
(`services/markdown.ts`, `markdown-it-container` 4.0.0), `insererSection` / `poserContenu` (`services/sections.ts`) seuls points d'écriture du contenu d'une section (un test le garde),
vue du lecteur (`droits.ts` : non-MJ ou mode Joueur lisent `contenu_public`, le MJ la source avec `<div class="bloc-mj">`), recherche filtrée par colonnes FTS5, `POST /api/apercu` avec contexte `{nature, univers_id, mode}`,
refus d'une section à bloc par un non-MJ (403 « Vous ne pouvez pas modifier cette section. », 400 « Un bloc MJ ne peut être écrit que par un MJ. »), l'assistant par la même vue, le bouton « Bloc MJ » de l'éditeur,
« Modifier » caché au joueur. Semis du bouchon : « Port-Sel » (Lame d'Ébène, « Histoire » avec un bloc, Léa auteur). Hors tranche : liens et fichiers dans un bloc, recherche tous types.
- Pièges : `:::mj` reste du texte dans un scénario et une entrée de système (`nature: 'texte'`, sans `contenu_public`) ; un bloc non fermé court jusqu'à la fin ; `contenuPublic` retire des lignes entières (plus, jamais moins) ; un site d'écriture oublié donne une section vide pour un non-MJ, pas une fuite ; ne jamais écrire `contenu` hors de `sections.ts`.
- Reste : la recette de Monsieur en bouchon (README, « Recette du bloc MJ »), la fusion dans `epic/kanevas-import`. Pas de tag avant la fusion de l'epic.

`feature/kanevas-import-liens` (PR vers `epic/kanevas-import`, non fusionnée) ajoute les liens `[[id|texte]]` entre fiches (B-33, B-36, AD-97, AD-100, AD-116) :
migration `0012-liens.sql` (table `liens`, index `liens (cible_fiche_id)`, `liens (cible_cle)`, `relations (cible_fiche_id)`), `services/liens.ts` seul écrivain de `liens`,
`extraireLiens` (jetons du moteur, hors code), `preparerContenu` (`[[<id>]]` nu réécrit ou 400 `lien_illisible`, `[[cle:…]]` connu résolu) avant chaque écriture, `resoudreClesEnAttente`
à la création d'une fiche à clé (sans bouger `version` ni `modifie_le`), rejeu d'import comparé après résolution (AD-104), `en_attente` au lot. Lecture : `resolveurLiens` (`droits.ts`, une requête par texte),
rendu décidé par la cible (lien, texte, cassé, en attente), scénarios résolus dans l'univers de la campagne, assistant en `[texte](fiche:<id>)`, « Mentionnée dans » (`services/mentions.ts`,
`GET …/fiches/:fid/mentions`, 50 par page). Écran : liste ouverte par `[[` et « Lien vers une fiche » (`ui/liste-liens.tsx`), bloc `fiche/mentions.tsx`. Semis du bouchon : la Guilde, le rapport secret, les liens de Port-Sel, « Anse-aux-Sels ».
- Pièges : le rendu ne lit jamais `liens` (qui ne sert qu'à « Mentionnée dans ») ; pas de rattrapage des textes d'avant (la table se remplit à la première écriture de la section) ; `[[…]]` reste du texte dans une entrée de système ; `liens` n'a qu'un écrivain (un test le garde) ; les e2e navigateur peuvent dépasser 30 s sous charge (`premiere-fiche`, « B-9 Léa, auteur… » ; `pieces-jointes-complements-2` a aussi échoué une fois en suite complète et passe seul) ; lancer `npm run build` avant `npm test` : `liens-ecran-mise-en-page` lit `dist/`, un build périmé le met en échec.
- Reste : la recette de Monsieur en bouchon (README, « Recette des liens »), la fusion dans `epic/kanevas-import`. Liens vers une fiche supprimée : deviendront cassés avec `kanevas-import-tenir` ; recherche par alias : `kanevas-import-recherche` (ci-dessous).

`feature/kanevas-import-types` (PR vers `epic/kanevas-import`, non fusionnée ; ce paragraphe vaut jusqu'à sa fusion) : le MJ choisit les types de son système et de son univers, et donne un sous-type à une fiche (P-13, B-7, B-42, B-52 ; AD-102, AD-110, AD-120) :
migration `0013-types.sql` (`fiches` recréée sans `CHECK` sur le type, avec `parent_id` et `sous_type`, `cle_origine` / `dernier_import` recopiées ; tables `types_systeme`, `types_univers`), jouée par `migrate()` clés étrangères coupées puis `foreign_key_check` avant validation (`-- migrate: sans-cles-etrangeres`, `src/db/db.ts`) ;
`services/types-fiche.ts` (la liste unique des 13 types réglables + `compte_rendu`, `typeActif`, `typesDeLUnivers`, réglages), routes de réglage (système et univers) et `GET /api/univers/:id/types`, `GET …/sous-types?type=` ; `changerTypeFiche` ; `PUT` de l'import et `PUT /fiches` portent `sousType`. Écrans : onglet « Types de fiche » de E-15, panneau de E-14 (bascule à trois choix), barre, liste et création qui suivent l'activation, sous-type sur carte / filtre / création / en-tête de E-9, « Changer le type… ». Le bouchon sème les sous-types des lieux. 1476 tests, 0 échec, typecheck et build verts.
- Le frontend ne tient que la table icône → composant ; la liste vient du serveur (AD-120, numéroté AD-113 dans le plan : AD-113 est pris par le Markdown). Ne pas recréer de liste de types côté navigateur.
- `parent_id` est posé, utilisé depuis `kanevas-import-arbre` ; les colonnes d'illustration sont recopiées telles quelles (kanevas-import-mediatheque). `compte_rendu` n'est accepté par l'API qu'avec kanevas-import-reprise. Le sous-type est vidé quand le type change ; le PJ / PNJ ne se règle pas dans « Changer le type ».
- Migration : le numéro 0013 est celui de cette branche, provisoire comme 0008 à 0012 jusqu'à la fusion de l'epic ; une tranche fusionnée avant renumérote (AD-51, `rm -rf dist` ensuite) ; un fichier qui recrée une table doit porter l'en-tête `-- migrate: sans-cles-etrangeres`, sans quoi `DROP TABLE` emporte les lignes liées.
- Reste : la recette de Monsieur en bouchon (recette dans le README, « Recette des types de fiche » ; désactiver « Vaisseau » et « Note » sur « CoF Mini », forcer « Vaisseau » sur « Lame d'Ébène », Savoir « Les Cristaux d'Ombre » / « Ressource » puis Note, filtre « Taverne » de « Lieux », `PUT /fiches/vaisseau:aube` dans « Essai Kanka »), puis la fusion.

`feature/kanevas-import-recherche` (PR vers `epic/kanevas-import`, non fusionnée ; ce paragraphe vaut jusqu'à sa fusion) : la recherche couvre tous les types, par alias et par étiquette (B-37, B-38, B-52 ; AD-63, AD-74, AD-101, AD-118) :
migration `0014-alias-etiquettes.sql` (`fiche_alias`, `etiquettes`, `fiche_etiquettes` ; `recherche_fiches` recréée en `(titre, alias, sous_type)` avec déclencheurs, index reconstruit), `services/etiquettes.ts` (`poserEtiquetage`, `lireEtiquetage`, `etiquettesProposees`, seul écrivain de ces tables),
routes `PUT …/fiches/:fid/etiquetage` et `GET …/etiquettes` (MJ hors mode Joueur ; `?mode=joueur`), `listerFiches` étendue (`?etiquette=`, `aliasTrouve`, `alias`, `etiquettes` sur chaque `Fiche`, colonnes de `recherche_sections` selon le rôle et le mode),
outil `chercher` de l'assistant sans `type` = même fonction, « Introuvable. » sans résultat, `PUT /api/import/v1/…/fiches/:cle` qui accepte `alias` et `etiquettes` (comparés par ensemble, sans casse ni ordre ; un champ modifié dans Kanevas n'est pas écrasé, le lot avertit ; hors bornes : fiche écrite sans eux, avertissement).
Écrans : E-17 (`ecrans/recherche.tsx`, entrée « Rechercher » en tête de `items.ts`, touche `/` dans `Cadre.tsx`), en-tête de E-9 et boîte « Alias et étiquettes… » (`fiche/etiquetage.tsx`). Semis du bouchon : alias et « Côte des Brumes » sur « Port-Sel » et « Cercle des Cendres », « Chronique de l'Âge d'Ombre ».
- Pièges : la migration 0014 est provisoire jusqu'à la fusion (AD-51, `rm -rf dist` après renumérotation) ; elle recrée une table FTS5 (suppression puis création, jamais `ALTER`) ; une étiquette n'existe que portée par une fiche (supprimée avec la dernière) et n'est proposée qu'à qui lit une fiche qui la porte ; en mode Joueur, un MJ ne voit ni ne pose rien de caché.
- Hors tranche : classement par pertinence et extraits (écartés, AD-63).
- Reste : la recette de Monsieur en bouchon (README, « Recette de la recherche »), la fusion dans `epic/kanevas-import`. Pas de tag avant la fusion de l'epic.

`feature/kanevas-import-arbre` (PR vers `epic/kanevas-import`, non fusionnée ; ce paragraphe vaut jusqu'à sa fusion) : une fiche se range sous une autre, et l'arbre se lit (B-35, P-12, P-14, P-10 ; AD-99, AD-104, AD-115). Sans migration (`parent_id` vient de `kanevas-import-types`).
`services/fiches.ts` : `deplacerFiche` seule écriture du parent (aussi appelée par l'import ; MJ hors mode Joueur, `cycle`, `trop_profond` au-delà de 50 niveaux, remontée par boucle de lectures), `PATCH …/fiches/:fid` accepte `{parent}`, `ancetres` dans la vue d'une fiche (lisibles seulement), `GET …/fiches/:fid/enfants` (« Contient », 50 par page), `GET …/fiches?type=&parent=racine|<fid>` (`aDesEnfants`, `dans`). Import : `parent` par clé d'origine, « parent en attente » (cible absente ou cycle ; `dernier_import.parent = {demande, ecrit}`, compté au lot clos, retenté au rejeu tant que le parent courant est nul), protection B-48. Écrans : `fiche/arbre.tsx` (fil), `fiche/contient.tsx`, `fiche/deplacer.tsx`, bascule Grille / Arbre de E-8 (`fiches.tsx`, clé `kanevas:vue-liste:<univers>:<type>`). Semis du bouchon : « Les Sphères » et cinq lieux sous « Port-Sel ».
- Pièges : aucune réponse ne nomme ni ne compte une fiche illisible (ancêtres, enfants, `dans`, `aDesEnfants` booléen) ; ne jamais écrire `parent_id` hors de `deplacerFiche` ; un compte-rendu peut être parent ou déplacé (MJ) ; un type désactivé reste atteint par son adresse.
- Hors tranche : remonter les enfants à la suppression d'une fiche (`kanevas-import-tenir`) ; l'arbre n'est chargé que nœud par nœud (à revoir si un lot de 500 fiches le ralentit à la recette).
- Reste : la recette de Monsieur en bouchon (README, « Recette de l'arbre »), la fusion dans `epic/kanevas-import`. Pas de tag avant la fusion de l'epic.

**Suivant :** les tranches non encore livrées.
