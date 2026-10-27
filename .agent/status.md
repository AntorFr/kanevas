# Status — kanevas

> MàJ : 2026-10-27 (assemblage de `kanevas-scenarios-suivi` ; l'historique tranche par tranche est dans `git log`, ce fichier ne garde que l'état et les pièges encore vrais)

**Lecture :** le clone qui porte ce fichier contient déjà toutes les tranches de `epic/kanevas-scenarios` fusionnées avant lui ; « PR non fusionnée » dit que la tranche n'est pas encore sur `main`, pas que son code manque. Carte du code : `ARCHITECTURE.md`. Écrans, besoins, données : `docs/ecrans.md`, `docs/parcours.md`, `docs/donnees.md`.

## État

- Le produit couvre : comptes, univers, membres, administration d'instance (E-5), fiches et sections à droits, systèmes de jeu, relations et recherche (FTS5), pièces jointes et médiathèque (E-19), illustrations, cartes et graphes, refonte visuelle (`ui/`, `docs/charte.md`), assistant du membre (E-12) avec proposition de mise à jour et image, Markdown et liens `[[…]]`, types de fiche réglables, arbre, API d'import `/api/import/v1` (lots, E-18), suppression de fiche et d'univers.
- **`kanevas-scenarios-suivi` (cette feature, PR vers `epic/kanevas-scenarios`, non fusionnée)** : campagnes et scénarios sont des fiches de type `aventure` (migration `0017-scenarios-pivot.sql`, AD-127). Blocs de fiche « Préparation » (MJ) et « Comptes-rendus » (registre `frontend/src/ecrans/fiche/registre-blocs-fiche.ts`, AD-124) ; E-3 et E-13 lisent des aventures ; bilan de suppression d'une aventure (AD-119). Retirés : E-6, E-7, l'entrée « Campagnes » de la barre, `services/campagnes.ts`, `services/scenarios.ts`, `services/import-suivi.ts`, les routes d'import `…/campagnes/:cle` et `…/scenarios/:scle`, les compteurs « campagnes » et « scénarios » des lots, les outils `creer_campagne`, `creer_scenario`, `lister_campagnes`.
- Base d'exemple du test de migration : construite par le test (`src/db/migration-scenarios-pivot.test.ts`), aucun binaire committé. Le semis du bouchon ne contient aucune aventure : elles se créent par l'écran (recette du README, « Adventure recipe »). L'échantillon d'import (`src/bouchon/echantillon`) porte 2 campagnes et 2 scénarios en fiches `aventure` (15 fiches au premier passage).

## Reste

- Recette de Monsieur en bouchon (README : « Adventure recipe », « Import sample acceptance »), puis fusion dans `epic/kanevas-scenarios` (phase merge).
- Tranche suivante `kanevas-scenarios-import-assistant` : rouvrir l'import des aventures (`statut` à l'import) et l'outil `creer_fiche` de l'assistant (AD-125, AD-126). **Entre les deux tranches, l'import crée une fiche `aventure` comme une autre mais ne lit pas son `statut` (elle naît « En préparation »), et l'assistant n'en crée pas** (accepté : aucune campagne en production).
- Maquettes `e06-campagne.html` et `e07-scenario.html` : écrans retirés, fichiers gardés parce que les barres des autres maquettes y renvoient ; à nettoyer avec la refonte des maquettes restantes.
- Les textes de `docs/ecrans.md` d'avant le pivot (Markdown, assistant) gardent des mentions de E-7 ; la note en tête de « Le Markdown » dit comment les lire.
- Doc écrite en français avant la règle « anglais » du `CLAUDE.md` : non traduite, par décision (une feature de traduction à part).

## Pièges encore vrais

- **Node** : 20 est la cible (CI, Dockerfile). `better-sqlite3` est épinglé en `^12` (la 13 exige Node ≥ 22, SIGSEGV sous 20). Les pods de la chaîne jouent sous Node 22 sans Docker ; la CI Node 20 fait foi. Ne lancer qu'un seul `npm ci` à la fois dans un clone.
- **CI** : l'image ne se construit que sur un tag `v*` dont le commit porte l'attestation « tests-complets » (`npm run tests:attestes -- --publier`). Ni `main` ni une PR ne la déclenchent.
- **Migrations** : la plus haute est 0017 ; la suivante prend le numéro libre à sa fusion (AD-51). `-- migrate: sans-cles-etrangeres` en première ligne pour une migration qui reconstruit des tables. La 0017 écrit `contenu_public` d'un scénario converti à `contenu` sans `:::`, sinon vide : les liens `[[…]]` du texte naissent à la prochaine écriture (`poserContenu`).
- **Suivi** : les tâches de préparation prennent un id de **fiche aventure**, jamais un id d'univers ; la garde MJ se calcule sur l'univers de la fiche (AD-47) ; un refus répond 404. Un compte-rendu nomme son aventure (`campagneId`, `campagneNom`) seulement à qui la lit ; « Aventure supprimée » (`campagneSupprimee`) n'est dit qu'au MJ hors mode Joueur ; `charge.campagne_id` ne sort jamais pour qui ne lit pas l'aventure (liste, recherche, arbre compris). Plusieurs aventures peuvent être « En cours » (AD-60). L'auteur Joueur d'un CR lit et écrit sa section même fermée aux autres joueurs (AD-61).
- **Type « Aventure » désactivé** : se comporte comme tout type désactivé (entrée de barre et « Nouvelle aventure » partent), les fiches restent lisibles avec leurs blocs et leur menu de statut. Le fil d'Ariane garde le pluriel du type : un test de la barre doit cibler « Navigation principale ».
- **Assistant** : `repondre` est l'unique entrée ; ni compte, ni univers, ni rôle en paramètre d'un outil ; pas de `process.env` hors `config/env.ts` (exceptions écrites dans `ARCHITECTURE.md`). Le verrou « une demande à la fois par compte » est en mémoire (une seule instance). Le panneau a sa propre racine React (`assistant.tsx`). Le fil ne se garde pas (AD-28) : une proposition en attente n'est plus atteignable après rechargement.
- **Recherche et relations** : `listerFiches({recherche})` seule (AD-63) ; ne jamais écrire dans `recherche_*`. Une relation est lue sous deux gardes (AD-64), sans compteur ni placeholder de ce qui est caché.
- **Fichiers** : le type vient de la signature des octets ; seules PNG, JPEG, GIF, WebP sont servies en ligne, le reste en `attachment`. Un refus de lecture répond 404 comme un id inconnu (AD-22). Les fonds de carte passent par `stockage.ts`, pas par `ajouterFichier`.
- **Cartes** : un graphe n'a ni position stockée ni déplacement de nœud (AD-71) ; la forme d'une carte ne change jamais ; un fond se remplace, ne se retire pas.
- **Propositions** (AD-79 à AD-82) : lues, appliquées, abandonnées par leur seul demandeur, encore MJ ; tout autre compte reçoit 404.
- **Texte Markdown** plafonné à 100 000 caractères (`MAX_CONTENU_SECTION`, AD-91, AD-106).
- **Administration** : le groupe Authelia est lu à la connexion et vaut 7 jours (AD-86) ; un admin sans rôle reste un compte sans rôle (AD-9).
- **Bouchon** : sur une base sans univers, `semerBouchon` pose le monde de recette (Lame d'Ébène, Landes grises, CoF Mini, Essai Kanka = univers 4 sur base neuve) ; `KANEVAS_SANS_SEMIS=1` le coupe (e2e). Jamais hors bouchon. Le jeton du bouchon est `JETON_BOUCHON` (`src/bouchon/depart.ts`).
- **Connexion perdue** (`frontend/src/api.ts`) : sondage de `/healthz` toutes les 3 s tant que le bandeau est levé.
- **Production sans `/data`** : base en mémoire (avertissement) ; la clé de session vient de `SESSION_SECRET`, sinon de `<data>/session.key`.
- **Suite e2e (Playwright)** : sous forte charge, quelques tests passent seuls et échouent par intermittence ; non attribué à un défaut du produit. Les attentes se font sur des éléments, jamais `networkidle`.
- **Code mort connu, non traité** : `export { ErreurService }` (`droits.ts`), option `limite` de `listerFiches`, `blocsVisibles`/`blocsSectionVisibles` jumeaux.
