# Status — kanevas

> MàJ : 2026-10-08

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

`kanevas-illustrations` (fusionnée, PR #10) a ajouté : l'illustration d'une fiche (migration `0006-illustrations.sql`, `services/illustrations.ts`, routes
`PUT|DELETE|GET …/fiches/:fid/illustration`, AD-93), la grille de cartes illustrées (E-8) et l'illustration en tête de E-9 ;
le système de jeu hors des univers (AD-94) : `GET /api/systemes` (systèmes du compte), `/api/systemes/catalogue`,
`/api/systemes/:sid…`, écrans E-16 « Systèmes de jeu » et E-15 à `/systemes/:sid` (l'ancienne adresse redirige), E-1 en
cartes ; le semis du bouchon (`src/bouchon/depart.ts`, fichiers dans `src/bouchon/demo/`).

**Reste :** la fusion de la PR des cartes, puis le tag `v*` (recette acceptée par Monsieur). En bouchon, le monde de recette est semé au
démarrage ; hors bouchon rien n'est amorcé. Aucune image n'existe avant le tag.

**Pièges :**
- Node 20 est la cible (CI, Dockerfile). `better-sqlite3` est donc épinglé en `^12` : la 13 exige
  Node ≥ 22 et plante (SIGSEGV) sous Node 20. Ne pas remonter sans changer aussi la CI et le Dockerfile.
- La suite a été jouée sous Node 22 dans les pods de la chaîne (pas de Docker) ; la CI Node 20 fait foi.
  La règle « conteneurs uniquement » de `CLAUDE.md` est la voie de référence ; un Node local ≥ 20 (README) est le repli quand
  Docker manque.
- Les migrations 0005 et 0006 sont sur `epic/kanevas` ; 0007 (cartes) est celle de cette branche, à recaler seulement si une autre tranche fusionne avant (AD-51).
- Vocabulaire : « Monsieur » = le commanditaire qui fait la recette ; « tranche » = une feature livrée ; « phase merge » = la
  fusion après recette ; E-n / B-n / P-n = écrans / besoins / parcours, définis dans `docs/ecrans.md` et `docs/parcours.md`.
- La CI ne pousse d'image que sur `main` et sur un tag `v*` ; sur une PR elle ne fait qu'un build de
  validation. L'image testable n'existe qu'après le tag, posé à la fusion.
- **Numéro de migration** : `0005-relier-chercher.sql` (après `0004-pieces-jointes.sql`, numéro de la branche) ; si une autre tranche fusionne une migration
  avant, la phase merge la recale (AD-51).
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
- Refonte visuelle : le regard sur les maquettes (bureau, téléphone, clair, sombre) est celui de la vérification et de la recette ; aucun écran n'écrit de couleur en dur (tokens seuls) ; un écran neuf prend le cadre et les composants de `ui/`, il ne recrée ni bouton, ni menu, ni champ. E-10 et E-11 sont construits avec le cadre ; E-5 et E-12 le rattrapent dans leur tranche.
- P-7 : le portrait (pièce jointe) est livré ; la demande à l'assistant (`kanevas-assistant-membre`) reste à venir.
- Pièces jointes : le type est déterminé par la signature des octets, jamais par le navigateur ; seules PNG,
  JPEG, GIF, WebP sont servies en ligne, le reste (SVG compris) en `attachment` sous `nosniff` et CSP sandbox.
  Un refus de lecture répond 404 comme un identifiant inconnu (AD-22) ; 50 pièces au plus par section, pas de
  limite de taille ; ajouter, marquer ou retirer ne change pas la `version` de la section. Pas de route de liste,
  pas de glisser-déposer. `deposerPieceJointe` et `stockage.ts` serviront aux images générées et aux fonds de carte.
- Rendu du bloc Pièces jointes vérifié par les tests e2e (Playwright) là où il est installé ; la CI ne les joue pas.
- « Connexion perdue » (frontend/src/api.ts) : sondé toutes les 3 s sur `/healthz` tant que le bandeau
  est levé ; il disparaît seul au retour du serveur.
- Le contenu d'une section est plafonné à 20 000 caractères par le serveur (`MAX_CONTENU_SECTION`,
  AD-91), rendu par `GET /api/moi` (`limites.contenuSection`) ; l'écran de fiche lit cette valeur.
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
  de taille ; le jeton `?v=` rend l'image cachable un an, le serveur revérifie le droit à chaque requête ; le fichier remplacé
  ou retiré est supprimé du disque. Hors tranche : « utiliser comme illustration » une pièce jointe, illustration dans
  relations/cartes/recherche, outil d'assistant.
- Bouchon : au démarrage, sur une base sans univers, `semerBouchon` pose le monde de recette (Lame d'Ébène, Landes grises,
  CoF Mini…) puis `semerIllustrations` ; `KANEVAS_SANS_SEMIS=1` le coupe (utilisé par les e2e). Jamais hors bouchon.
- Cartes : un graphe n'a ni position stockée ni déplacement de nœud (AD-71) ; la forme d'une carte ne change jamais ; un fond ne se retire pas, il se remplace ; aucune suppression de carte ni d'élément autre que « Retirer de la carte ». La fiche retirée reste.
- Numéro de migration `0007` (cartes) à recaler à la fusion si une autre tranche en a pris un (AD-51).

**Suivant :** administration.
