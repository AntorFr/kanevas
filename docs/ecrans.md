# Kanevas — écrans

> **E-6 Campagne and E-7 Scénario no longer exist** (`kanevas-scenarios-suivi`): remaining references in the dated sections below describe an adventure's sheet (E-9) and its block; the screen table below is authoritative.
>
> Doc du produit (voir `docs/parcours.md`). Au cadrage, à grosses mailles : chaque écran, d'où on
> y arrive, à quoi il sert, ce que chaque rôle y fait. Les états de chaque écran et la maquette
> finie se détaillent dans la tranche qui le construit.

> **Construit à ce jour** : E-1, E-2, E-3 (nom, navigation et blocs : système de jeu, ongoing campaigns, derniers comptes-rendus, préparation pour le MJ, cartes visibles), E-4, E-5 (Administration), E-13, E-8 (avec la
> recherche dans un type, en grille de cartes illustrées), E-9 (avec les blocs Relations et Pièces jointes, l'illustration en tête, le titre en place et « Supprimer la fiche… »), E-10 et E-11 (cartes et graphes), E-12 (Assistant), E-14 (Paramètres, avec « Supprimer l'univers »), E-15 (Système de jeu, à `/systemes/:sid`), E-16 (Systèmes de jeu), E-17 (Recherche), E-18 (Accès par API), E-19 (Médiathèque), la ligne « Campagne » de E-9, la session
> et la barre latérale.

## Format

Web. Ordinateur d'abord pour écrire (souris, clavier, glisser des tokens) ; téléphone pour lire
(tactile, une colonne). Thème sombre et clair.

## Navigation

Une barre latérale unique, sur tous les écrans d'un univers :

- en tête, le **sélecteur d'univers** (les univers du compte, son rôle en badge) ;
- **Vue d'ensemble** · **Campagnes** · **Comptes-rendus** · **Cartes** · depuis `kanevas-import`, **Médiathèque** (E-19) ;
- **Lore** : Personnages, Lieux, Factions, Objets, Événements, Quêtes — depuis `kanevas-import`,
  les **types activés pour l'univers** (B-42), dans l'ordre de la liste du produit : Personnages,
  Lieux, Factions, Objets, Événements, Quêtes, Créatures, Races, Vaisseaux, Savoirs, Récits, Règles,
  Notes ;
- depuis `kanevas-import`, en tête de la barre sous le sélecteur d'univers : **Rechercher** (E-17 ;
  raccourci `/` hors d'un champ) ;
- pour un MJ : **Univers** ▸ Membres, Paramètres, et depuis `kanevas-import` **Accès par API** (E-18) ;
- pour un admin d'instance : **Administration** ;
- en pied, le **compte** : l'avatar et l'identifiant, qui ouvrent un menu — l'identifiant, le
  **thème** (bascule à trois icônes : Clair, Sombre, Système) et « Se déconnecter ». Le thème et
  la déconnexion ne sont pas étalés dans la barre.

Chaque item porte son icône (`docs/charte.md`, « Icônes ») ; l'item courant est marqué. Sur
téléphone (moins de 760 px), la barre est un tiroir sous un bouton « Menu », en tête de la barre
haute.

Au-dessus de chaque écran d'un univers, une **barre haute** : le fil d'Ariane (univers › type ›
fiche ; depuis `kanevas-import`, univers › type › ancêtres lisibles › fiche, B-35 ; au téléphone (≤ 760 px), le sceau de l'univers et le libellé du type disparaissent, et à 480 px et moins les ancêtres se replient (menu « … » dès deux ancêtres) : voir E-9) et, sur les écrans où elle existe, la
bascule mode MJ / mode Joueur.

Hors d'un univers (E-1, E-2, E-5, E-15, E-16), une barre réduite : **Mes univers**, **Systèmes de
jeu**, **Administration** pour un admin d'instance, et le compte en pied. Depuis un univers, le menu
du sélecteur d'univers mène à **Mes univers** et à **Systèmes de jeu** ; le lien du système de E-3 et
de E-14 mène à sa page (E-15), hors de l'univers (décision du 2026-10-06, AD-94). Un admin qui est aussi membre d'un univers garde le lien
**Administration** dans la barre de l'univers, sous une section « Instance ».

L'**assistant** est un bouton flottant « Demander à Kanevas », sur tous les écrans d'un univers,
hors de la barre ; il n'existe pas hors d'un univers. Un MJ voit la bascule **« Mode MJ » / « Mode Joueur »** dans la barre haute des écrans où la
bascule existe (fiche, carte et, depuis `kanevas-import`, recherche E-17).

## Inventaire

| Écran | Atteint depuis | Sert à | Parcours |
|---|---|---|---|
| **E-1 Accueil** | connexion ; logo | voir ses univers et son rôle dans chacun ; en créer un ; voir son identifiant | P-1, P-6 |
| **E-2 Créer un univers** | E-1 | nom, description ; le créateur devient MJ | P-1 |
| **E-3 Vue d'ensemble de l'univers** | E-1 ; sélecteur d'univers ; E-5 (admin devenu membre) | les campagnes actives (*`kanevas-scenarios`* : « Campagnes en cours », the adventures), les derniers CR, la préparation (MJ), les cartes visibles | P-2, P-3, P-4, P-6 |
| **E-4 Membres** | nav Univers (MJ) | lister, ajouter par identifiant, changer le rôle, retirer | P-2 |
| **E-5 Administration** | nav (admin d'instance) | lister les univers de l'instance, en gérer les membres — jamais le contenu ; poser le jeton de l'assistant (B-51) | P-2, P-15 |
| **E-6 Campagne**, **E-7 Scénario** | *retired (`kanevas-scenarios-suivi`)* — an adventure is a sheet: its list is E-8 of the « Aventure » type, its page E-9, with the blocks « Préparation » and « Comptes-rendus » | — | — |
| **E-8 Liste de fiches** | nav Lore | les fiches d'un type que le compte peut lire, en grille de cartes illustrées ; chercher dans ce type ; créer (MJ) ; *(kanevas-scenarios)* « Aventure » type: status badge and filter, status menu (MJ), « Nouvelle aventure » with sub-type | P-3, P-6 |
| **E-9 Fiche** | E-8 ; un token ; un lien ; E-13 | lire et écrire les sections permises ; ajouter, réordonner, retirer une section, régler son audience, relier (MJ) ; joindre un fichier (les deux chemins d'ajout, AD-111), réserver un fichier au MJ (MJ), retirer une référence ; régler le sous-type (MJ) ; poser, remplacer, retirer l'illustration (MJ) ; bascule mode Joueur (MJ). Un compte-rendu s'ouvre ici. ; *(kanevas-scenarios)* on an adventure: the status line and its menu (MJ) | P-3 à P-7 |
| **E-10 Cartes** | nav Cartes | les cartes lisibles ; créer une carte illustrée (avec son image de fond) ou un graphe (MJ) | P-3, P-9 |
| **E-11 Carte** | E-10 ; E-3 | carte illustrée : fond, tokens ; graphe : nœuds et liens. MJ : déposer ou changer le fond, placer, rendre visible, mode Joueur. Joueur : ouvrir la fiche d'un token. | P-3, P-6, P-9 |
| **E-12 Assistant** | bouton flottant, sur tout écran d'univers | converser ; voir ce que l'assistant a écrit, avec un lien ; MJ : propositions de mise à jour (actuel/proposé, **Appliquer**, **Abandonner**) | P-3, P-5, P-6, P-7 |
| **E-13 Comptes-rendus** | nav Comptes-rendus ; E-3 | tous les CR lisibles de l'univers, du plus récent, avec leur campagne (*`kanevas-scenarios`*: the adventure it names, campaign or scenario) | P-4, P-5 |
| **E-14 Paramètres de l'univers** | nav Univers (MJ) | nom, description, système de jeu (choisir dans le catalogue, en créer un) | P-8 |
| **E-15 Système de jeu** | E-16 ; lien depuis E-3 et E-14 | le référentiel commun : règles, créatures, objets ; ajouter, modifier (MJ d'un univers rattaché) ; hors du cadre d'un univers | P-8 |
| **E-16 Systèmes de jeu** | barre réduite ; menu du sélecteur d'univers | les systèmes rattachés aux univers du compte, chacun avec ceux de ses univers qui l'utilisent | P-8 |
| **E-17 Recherche** *(kanevas-import)* | « Rechercher » de la barre ; `/` ; une étiquette touchée sur E-9 | chercher dans tous les types, titres, alias et sections lisibles ; filtrer par type et par étiquette ; *(kanevas-scenarios)* the status badge of an adventure result | P-12, P-10 |
| **E-19 Médiathèque** *(kanevas-import)* | nav Médiathèque ; « Choisir dans la médiathèque » de l'éditeur et de l'illustration (E-9) | voir les fichiers (images, documents) ouverts au compte et où ils servent ; MJ : ajouter, renommer, régler la visibilité, supprimer | P-16, P-10 |
| **E-18 Accès par API** *(kanevas-import)* | nav Univers ▸ Accès par API (MJ) | créer, lister, révoquer les jetons d'API de l'univers ; voir les lots d'import et leurs refus | P-10, P-11 |

Écrans **modifiés** par `kanevas-import` : **E-8** (types activés, vue en arbre, sous-type sur la
carte, filtre « Sous-type », champ « Sous-type » de la création, illustration sous double garde),
**E-9** (Markdown, liens, blocs MJ, fil d'ancêtres, blocs « Contient » et « Mentionnée dans », alias et
étiquettes, sous-type éditable, fichiers de la médiathèque — les deux chemins d'ajout, le bloc Pièces
jointes de références, l'illustration, les mentions « réservé au MJ » —, menu de la fiche : renommer,
changer le type, déplacer, supprimer, clé d'origine), **E-7** et **E-15**
(contenu en Markdown), **E-14** (« Types de fiche », « Supprimer l'univers »), **E-15** (« Types de
fiche » du système), **E-13** (ordre par date d'origine), la barre latérale ; **E-5** (« Jeton de l'assistant », B-51).

Les pages de connexion du serveur (« Connexion refusée », « Connexion indisponible », atteintes
depuis P-1) et le bandeau du mode bouchon sont décrits sous « Session et connexion ».

Hors produit : en mode bouchon seulement (AD-55), l'écran de choix d'un compte de test et le bandeau « mode
bouchon » — sans `E-n` ni six états, ils n'existent pas en production.

## Rôles × écrans × actions

« — » : l'écran n'est pas proposé (absent de la navigation ; si on force l'adresse, l'écran affiche « Page introuvable. » et l'API répond 404). E-15 et
E-16 vivent hors des univers : leurs cases disent le rôle dans un univers rattaché au système.

| Écran | MJ | Joueur | Admin d'instance (sans rôle dans l'univers) |
|---|---|---|---|
| E-1 | ses univers, créer | ses univers, créer | ses univers, créer |
| E-2 | créer | créer | créer |
| E-3 | tout | sans préparation ni scénarios ; *(kanevas-scenarios)* « Campagnes en cours »: those he reads, with their status | — |
| E-4 | tout | — | — (passe par E-5) |
| E-5 | — | — | lister les univers et leurs membres ; ajouter, changer un rôle, retirer un membre ; voir l'état du jeton de l'assistant, connecter ou reconnecter l'abonnement |
| E-6 | *retired (`kanevas-scenarios`)* | — | — |
| E-7 | *retired (`kanevas-scenarios`)* | — | — |
| E-8 | lire, chercher, créer ; la vignette de chaque fiche (son illustration, ou le repli dessiné) ; *(kanevas-scenarios)* for the « Aventure » type: the status badge, the « Statut » filter, the status menu on a card or a tree line (outside player mode), the creation form with sub-type suggestions and « Visible des joueurs » ; *(kanevas-fiche-mj-seul)* the « MJ seul » badge on a sheet players cannot see, the « Visibilité » filter | lire, chercher ; la vignette des fiches qu'il voit ; *(kanevas-scenarios)* adventures: the status badge and the « Statut » filter; the status menu and « Nouvelle aventure » ; *(kanevas-fiche-mj-seul)* no « MJ seul » badge, no « Visibilité » filter (**caché**) | — |
| E-9 | tout ; mode Joueur ; *(kanevas-scenarios)* on an adventure: the status menu in the header (outside player mode), the blocks « Préparation » (GM, outside player mode) and « Comptes-rendus » (« Nouveau compte-rendu ») ; *(kanevas-fiche-mj-seul)* the « MJ seul » badge in the header (GM mode) ; relier et retirer des relations ; poser, remplacer, retirer l'illustration (hors mode Joueur) ; *(kanevas-import)* sous-type, réserver un fichier au MJ, voir un fichier en attente d'import (tuile) ; *(kanevas-sous-type-dialogue)* change the sub-type alone from « Changer le type… » (outside player mode) | sections lisibles ; écrire celles permises ; *(kanevas-scenarios)* on an adventure: the status badge and « Comptes-rendus » (the CR he reads; « Nouveau compte-rendu » allowed); the status menu and « Préparation » (**hidden**) ; relations lisibles (section et cible) ; pièces jointes de celles-ci ; voir l'illustration, jamais la poser ; *(kanevas-fiche-mj-seul)* no « MJ seul » badge in the header (**caché**) ; *(kanevas-import)* dans une section qu'il écrit, ajouter un fichier ou en choisir un qu'il voit (les deux chemins de B-55) et retirer une référence ; fichiers sous double garde ; jamais régler une visibilité (**caché**) ; un fichier en attente d'import : rien (**caché**) ; *(kanevas-sous-type-dialogue)* the sub-type as plain text; changing it: **hidden** (no « ⋯ » menu, no box, no pencil, no Tab stop) | — |
| E-10 | tout | cartes visibles | — |
| E-11 | tout ; mode Joueur | lire une carte visible, ouvrir une fiche | — |
| E-12 | catalogue MJ (dont générer une image, si un moteur d'images est disponible) ; propositions : le MJ demandeur seul les voit, les applique, les abandonne | catalogue Joueur (sans image : l'outil est absent, l'assistant répond qu'il ne peut pas) ; propositions : **caché** (ni outil ni bloc ; ce qu'on vérifie est l'absence de proposition et de bloc, pas le texte libre de l'assistant) | — |
| E-13 | tous les CR ; *(kanevas-scenarios)* the adventure of each, « Aventure supprimée » when it is gone | les CR lisibles ; the adventure column only for an adventure he reads (**hidden** otherwise, deleted or closed alike) | — |
| E-14 | tout ; « Supprimer l'univers » (*kanevas-import*) | — (« Page introuvable. ») | « Page introuvable. » |
| E-15 (hors univers ; les colonnes disent le rôle dans un univers **rattaché au système**) | lire ; « Ajouter … », « Modifier » | lire (« Lecture seule ») ; ni « Ajouter » ni « Modifier » | « Page introuvable. », sauf s'il est lui-même membre d'un univers rattaché : alors la colonne de son rôle là (l'admin MJ d'un univers rattaché lit et modifie) |
| E-16 (hors univers) | ses systèmes, avec ses univers et son rôle | ses systèmes, « Lecture seule » | la liste de ses propres systèmes (comme MJ ou Joueur s'il est membre d'un univers rattaché) ; vide sinon — l'écran est proposé à tout compte |
| E-17 *(kanevas-import)* | chercher dans toutes les fiches de l'univers, blocs MJ compris ; en **mode Joueur**, comme un joueur (ni blocs MJ, ni fiches qu'un joueur ne lit pas) ; filtres : les types activés ; les fiches des types désactivés restent des résultats sous « Tous » ; *(kanevas-scenarios)* an adventure result carries its status badge (the player's too) | chercher dans ce qu'il lit, hors blocs MJ ; filtres par type et par étiquette des seules fiches qu'il voit ; bascule de mode : absente (cachée) ; blocs MJ : hors recherche (jamais lus) ; « Alias et étiquettes… » sur E-9 : cachée | — |
| E-19 *(kanevas-import)* | tout : ajouter, renommer, visibilité, supprimer ; « Utilisé dans » complet | les fichiers visibles des joueurs et ceux qu'il a ajoutés ; « Utilisé dans » réduit aux fiches qu'il lit ; ni ajout depuis E-19 (**caché** ; il ajoute un fichier par une section qu'il écrit, E-9), ni réglage, ni suppression (**cachés**) | — |
| E-18 *(kanevas-import)* | créer un jeton ; voir et révoquer tous les jetons de l'univers (y compris ceux d'un autre MJ) ; voir les lots | — (**caché** : absent de la barre, « Page introuvable. » par l'adresse) | — |

What `kanevas-scenarios` adds to the lines above: **E-17** — the status badge on the result card of an adventure, for every role that reads the sheet; **E-12** — the GM creates sheets through `creer_fiche` (AD-126), with a « Fiche « X » créée » writing block and « Ouvrir » leading to E-9; the player has no creation tool; **E-18** — no « Campagnes » or « Scénarios » counter in a lot: adventures count among « Fiches ».

Ce que `kanevas-import` ajoute aux lignes existantes : **barre latérale** — tous : la section « Lore »
ne montre que les types activés ; **E-8** — MJ : la vue en arbre, la création dans les seuls types activés,
avec son champ « Sous-type », le filtre « Sous-type » ; Joueur : l'arbre des fiches qu'il voit, le filtre
« Sous-type » sur ce qu'il voit ; la création et son champ « Sous-type » sont **absents** (non offerts). **E-9** — MJ : écrire le
Markdown, insérer liens et blocs MJ, renommer, changer le type, déplacer, alias et étiquettes,
supprimer (menu « ⋯ » de l'en-tête, hors mode Joueur), voir la clé d'origine ; Joueur : titre en texte, ni menu « ⋯ » ni suppression (**caché**), clé d'origine cachée ; un admin d'instance sans rôle : « Page introuvable. » ; lire le
Markdown, suivre les liens vers ce qu'il voit, « Contient » et « Mentionnée dans » réduits à ce qu'il
lit ; écrire une section permise **sauf si elle contient un bloc MJ** (« Modifier » **caché**) ; alias
et étiquettes visibles, jamais modifiables (**caché**). **E-14** — MJ : « Types de fiche »,
« Supprimer l'univers ». **E-15** — MJ d'un univers rattaché : « Types de fiche » (bascules) ;
Joueur : la liste en lecture seule.

Un admin d'instance qui est aussi membre d'un univers, MJ ou Joueur, a dans cet univers la colonne de son rôle et garde E-5 par la section « Instance » de la barre, et y a la colonne Admin (panneau « Jeton de l'assistant » compris : E-5 ne dépend pas de l'univers sélectionné) ; hors de cet univers, la colonne Admin.

Précisions de la matrice : créer une campagne, en changer le statut, créer un scénario sont au
MJ seul. L'audience d'une section se règle en ligne sur la fiche (MJ). Créer une fiche ouvre une
fenêtre (type déjà choisi, titre) qui mène à la fiche ; créer une carte se fait en ligne sur
E-10. « Rendre visible » une carte se trouve sur la carte (E-11) et dans la liste (E-10). Le fond d'une carte illustrée se dépose à sa création (E-10) et se change sur la carte (E-11) ;
une carte sans fond montre ses tokens sur un fond neutre. Une
tâche de préparation s'ajoute avec sa catégorie, se coche, se décoche ; elle ne se supprime pas.
Sur E-15, règles, créatures et objets ont le même traitement. Sur E-3, le bloc « Système de jeu » n'existe que si l'univers est rattaché à un système (MJ et Joueur).

Un compte **sans rôle** dans l'univers et qui n'est pas admin d'instance (Teo avant son ajout) a, dans
cet univers, la colonne « Admin » de cette matrice pour les écrans **de cet univers** (E-3, E-4,
E-6 à E-14, E-17 à E-19) : « — », « Page introuvable. » si l'adresse est forcée. Hors des univers, il garde E-1,
E-2 et E-16 (vide s'il n'est membre d'aucun univers rattaché), et E-15 pour les systèmes de ses
propres univers.

Un refus ne dit jamais qu'une chose existe : une fiche, une section, une carte qu'on ne peut pas
lire sont absentes, et leur adresse répond comme une adresse inconnue.

## États

Chaque écran structurant a les six états de la skill `ux` (vide, chargement, erreur, hors-ligne —
la connexion est perdue et l'écran le dit, sans mode hors-ligne —, refus, contenu long) : ils se décrivent avec sa maquette finie, dans la tranche qui le construit.
Deux sont posés dès le cadrage parce qu'ils traversent tout :

- **vide** d'un compte neuf (E-1) : dit quoi faire — créer un univers, ou donner son identifiant,
  affiché, à son MJ ;
- **refus** d'une ressource illisible : toujours comme une ressource inconnue.

## Détail des écrans de `kanevas-premiere-fiche`

> E-1, E-2, E-3, E-4, E-8, E-9, la barre latérale et la session. Vocabulaire des six états, celui
> de B-29 : **vide**, **chargement**, **erreur**, **connexion perdue**, **refus**, **contenu
> long**. « Sans objet » dit sa raison. Les maquettes qui font foi pour la forme sont listées sous « Maquettes » (fin du document) ; `e02` est d'avant la charte (thème sombre, gris tertiaire de la charte).

**Textes communs.**

- *Chargement* : « Chargement… » (`role="status"`).
- *Erreur de chargement* : « Impossible de charger cette page. » et le bouton « Réessayer ».
- *Connexion perdue* : bandeau « Connexion perdue. Ce que vous voyez peut être dépassé ; rien
  n'est enregistré tant qu'elle ne revient pas. » ; les boutons qui écrivent sont désactivés ; il
  disparaît seul au retour de la connexion.
- *Écriture en cours* (tout envoi : ajouter, changer un rôle, retirer, créer, enregistrer, régler,
  monter, descendre, charger la suite) : le bouton qui a déclenché affiche « … » (partout, E-2 compris) et est désactivé
  jusqu'à la réponse (un double clic ne part qu'une fois) ; le reste de l'écran reste lisible.
- *Échec d'une écriture* : « L'action n'a pas abouti. Réessayez. » au-dessus de la liste ou du panneau
  concerné ; la valeur affichée revient à celle d'avant (réglage d'audience, rôle, ordre) ; une
  saisie en cours est conservée. Échec de « Charger la suite » : « Impossible de charger la suite. »
  et le bouton reste.
- *Titre vide ou trop long* (fiche, section) : « Erreur : le titre est obligatoire. » ou « Erreur : 120
  caractères au plus. » (80 pour une section), sous le champ.
- *Session expirée pendant une saisie* : la personne est menée à la connexion ; le texte en cours
  d'une section (E-9) est gardé dans le navigateur (`sessionStorage`) et rendu au retour sur cette
  section, tant qu'il n'est pas enregistré ou annulé. Les formulaires E-2, E-4 et E-8 ne sont pas gardés.
- *Refus* : toujours « Page introuvable. » et un lien « Mes univers » — pour un univers inconnu,
  un univers sans rôle, une fiche illisible, une adresse inconnue. Jamais « accès refusé ».
- *Session expirée ou absente* : la page n'est pas montrée ; la personne est menée à la connexion
  (Authelia, ou le choix du compte de test en bouchon).
- *Bandeau du mode bouchon* (seulement avec `KANEVAS_STUB=1`, sur chaque page, non fermable) :
  « Mode bouchon — les comptes sont fictifs. Ne jamais l'ouvrir en production. »

### Session et connexion

- **Écran de choix du compte de test** (bouchon seulement, `/connexion-bouchon`, rendu par le
  serveur) : une ligne par compte — Antor, Léa, Teo, Mira, Admin — avec ses groupes (Admin :
  « groupes : parents ») et un bouton « Se connecter en tant que … ». Sans `KANEVAS_STUB`, cette
  adresse répond « Page introuvable. ».
- **« Connexion refusée »** (Authelia a refusé ou le retour est invalide) : « La connexion a été
  refusée. » et un lien « Réessayer » qui relance la connexion (même adresse). Aucun autre contenu.
- **« Connexion indisponible »** (Authelia injoignable) : « Authelia ne répond pas pour
  l'instant. Réessayez dans un moment. » et un lien « Réessayer » qui relance la connexion (retour à l'adresse de connexion)
- La session expire au bout de 7 jours (AD-56). **Se déconnecter** (menu du compte, en pied de la barre latérale)
  efface la session et mène à la connexion ; en bouchon, c'est ainsi qu'on change de compte.
- `GET /api/moi` rend `{username, groups, limites}` du compte connecté : c'est ce que la barre latérale
  affiche (l'identifiant) et ce que les tests lisent pour constater les groupes. `limites.contenuSection`
  (100 000) est la borne d'une section, lue par l'écran de fiche (AD-91).

### Barre latérale

Sur tout écran d'un univers : en tête le **sélecteur d'univers** (nom, badge du rôle, la liste
des univers du compte, puis « Mes univers » et « Systèmes de jeu » en pied de liste) ; **Vue d'ensemble** ; **Comptes-rendus** et **Cartes** ; **Lore** :
les types activés de l'univers (« Aventures » — a type that can be deactivated like any other —, Personnages, Lieux, Factions, Objets, Événements, Quêtes par défaut ; liste complète en haut de ce document) ; pour un MJ, **Univers ▸ Membres** et **Paramètres** ; en
pied, le compte (avatar et identifiant) qui ouvre le menu du compte : l'identifiant, le thème
(Clair, Sombre, Système, en trois icônes) et « Se déconnecter ». Hors d'un univers (E-1,
E-2, E-5, E-15, E-16) : « Mes univers », « Systèmes de jeu », « Administration » pour un compte du groupe `parents` (E-5, plus bas) et le compte en pied. **Un item dont l'écran n'est
pas construit n'est pas affiché** (« Comptes-rendus » and « Cartes » are shown). « Paramètres » (E-14) n'est affiché qu'au MJ. Sur téléphone (moins de 760 px), la barre est un tiroir sous un
bouton « Menu ».

| État | Ce qu'on voit |
|---|---|
| vide | sans objet pour le sélecteur : l'univers courant y est toujours ; la section « Lore » peut être vide si tous ses types sont désactivés (texte plus bas, « Barre latérale ») ; hors univers, « Mes univers » et « Systèmes de jeu » |
| chargement | le sélecteur affiche « … » ; les items fixes sont déjà là |
| erreur | le sélecteur affiche « Univers », sans liste (le nom n'est connu que de la liste qui n'a pas chargé) ; « Impossible de charger vos univers. » dans la liste dépliée, avec « Réessayer » |
| connexion perdue | le bandeau ; navigation inchangée |
| refus | sur « Page introuvable. » la barre est celle d'un écran hors univers : **pas de sélecteur**, aucun nom d'univers, seulement « Mes univers », « Systèmes de jeu » et le compte en pied ; dans un univers, le sélecteur ne liste que les univers du compte |
| contenu long | 100 univers : la liste du sélecteur défile ; un nom de 80 caractères est tronqué par « … » avec infobulle |

### E-1 Accueil

Liste des univers du compte : nom, début de la description, badge du rôle (MJ, Joueur) ; un clic
mène à E-3. *Depuis `kanevas-illustrations` (décision de Monsieur du 2026-10-06), une **grille de
cartes**, comme E-8 et E-16 (« E-1 en cartes », plus bas).* Bouton « Créer un univers » (→ E-2). L'identifiant du compte est affiché en tête :
« Connecté en tant que lea ». Ordre : par nom.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun univers pour l'instant. » ; « Vous menez une partie ? Créez un univers. » ; « Vous êtes joueur ? Donnez votre identifiant à votre MJ : **lea** » | « Créer un univers » |
| chargement | « Chargement de vos univers… » | — |
| erreur | « Impossible de charger vos univers. » | « Réessayer » |
| connexion perdue | le bandeau ; la liste déjà chargée reste affichée | ouvrir un univers déjà listé ; « Créer un univers » désactivé |
| refus | sans objet : la page ne montre que les univers du compte | — |
| contenu long | 100 univers : la liste défile ; un nom de 80 caractères est tronqué par « … » avec le nom complet en infobulle ; la description tient sur deux lignes | idem |

*Critère.* Étant donné un compte neuf (Teo, jamais ajouté), quand il ouvre l'accueil, alors il voit
« Aucun univers pour l'instant. » et son identifiant « teo » affiché, et aucun nom d'univers.

### E-2 Créer un univers

Un formulaire : « Nom » (obligatoire, 80 caractères au plus), « Description » (facultative, 500
au plus), « Créer l'univers » et « Annuler » (→ E-1). Créer mène à E-3 de l'univers, le créateur
en MJ (B-2). Dès que le nom est saisi, le sceau de l'univers (son initiale) s'affiche en aperçu au-dessus du titre ; tant que le nom est vide, rien.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | le formulaire vierge, sans aperçu | remplir |
| chargement (écriture en cours) | le bouton affiche « … », désactivé | — |
| erreur | « Erreur : le nom est obligatoire. » sous le champ ; ou, si la création échoue, « L'action n'a pas abouti. Réessayez. » au-dessus du formulaire, saisie conservée | corriger, réessayer |
| connexion perdue | le bandeau ; « Créer l'univers » désactivé, saisie conservée | attendre |
| refus | sans objet : tout compte peut créer un univers (B-2) | — |
| contenu long | « Erreur : 80 caractères au plus. » dès le 81e (même texte pour la description avec 500) | corriger |

### E-3 Vue d'ensemble de l'univers

Le nom de l'univers (titre), sa description, le badge du rôle, puis une **région de blocs**. Quand
aucun bloc ne rend rien, la région montre « Rien à afficher pour l'instant. Les
campagnes, les comptes-rendus et les cartes s'afficheront ici. » ; ni compteur ni lien mort.
**Les blocs sont indépendants** : chaque tranche ajoute le sien en déposant un fichier dans
`frontend/src/ecrans/vue-ensemble/blocs/` dont l'export par défaut est un `Bloc` (identifiant,
rôles qui le voient, rang, composant) ; le registre `frontend/src/ecrans/vue-ensemble/registre.ts`
le trouve seul (un seul fichier, comme pour les écrans) ; elle ne modifie aucun bloc existant.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | le message de la région de blocs (ci-dessus) | naviguer par la barre |
| chargement | le nom absent, « Chargement… » | — |
| erreur | « Impossible de charger cette page. » | « Réessayer » |
| connexion perdue | le bandeau, le contenu déjà chargé | naviguer |
| refus | univers inconnu ou sans rôle du compte : « Page introuvable. » | « Mes univers » |
| contenu long | une description de 500 caractères passe à la ligne ; un nom de 80 caractères passe à la ligne en titre | — |

*Critère.* Étant donné Teo, sans rôle dans Lame d'Ébène, quand il ouvre l'adresse de l'univers,
alors il voit « Page introuvable. », sans le nom de l'univers.

### E-4 Membres (MJ)

Une liste : identifiant, rôle (liste MJ / Joueur), « Retirer ». En haut, un champ « Identifiant du
compte », le rôle (Joueur par défaut) et « Ajouter ». **Retirer** demande une confirmation sur
place : « Retirer lea de Lame d'Ébène ? Elle ne verra plus l'univers. » avec « Retirer lea » et
« Annuler ». Un MJ qui se retire lui-même alors qu'un autre MJ reste revient à E-1.

Refus de la tranche, textes exacts : « Ce compte ne s'est jamais connecté. » ; « Ce compte est déjà
membre. » ; « Impossible : l'univers doit garder au moins un MJ. » (retirer ou rétrograder le seul
MJ).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | sans objet : il y a toujours au moins un MJ | — |
| chargement | « Chargement des membres… » | — |
| erreur | « Impossible de charger les membres. » ; une erreur d'écriture s'écrit au-dessus de la liste, la liste reste | « Réessayer » |
| connexion perdue | le bandeau ; « Ajouter », changer, « Retirer » désactivés | — |
| refus | pour un Joueur : l'item « Membres » est absent et son adresse montre « Page introuvable. » | « Mes univers » |
| contenu long | 200 membres : la liste défile ; l'identifiant est tronqué par « … » avec l'infobulle | idem |

*Critère.* Étant donné Antor, seul MJ de Lame d'Ébène, quand il tente de retirer Antor, alors il
voit « Impossible : l'univers doit garder au moins un MJ. » et la liste est inchangée.

### E-8 Liste de fiches

Pour un type de la barre (Personnages, Lieux…) : les fiches **que le compte peut lire**, par
titre (ordre alphabétique sans casse), chacune avec son badge (pour un personnage : PJ ou PNJ).
Cent fiches à la fois, puis « Charger la suite ». Pour un MJ, « Nouveau personnage » (« Nouveau
lieu »…) ouvre une fenêtre : « Titre » (1 à 120 caractères) et, pour un personnage, « PJ » ou
« PNJ » (PNJ par défaut) ; « Créer la fiche » mène à E-9 de la fiche, sans section. Textes par type : « Aucun personnage », « Aucun lieu », « Aucune faction », « Aucun objet », « Aucun
événement », « Aucune quête », suivis de « pour l'instant. » (MJ) ou « à voir pour l'instant. »
(Joueur) ; bouton « Nouveau personnage », « Nouveau lieu », « Nouvelle faction », « Nouvel objet »,
« Nouvel événement », « Nouvelle quête ». La recherche dans le type s'ajoute au-dessus de la liste (voir « Détail des écrans de `kanevas-relier-chercher` »). Le type compte-rendu n'a pas d'entrée ici (E-13).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucun personnage pour l'instant. » et « Nouveau personnage » ; Joueur : « Aucun personnage à voir pour l'instant. » (autres types : voir ci-dessus) | MJ : créer |
| chargement | « Chargement des fiches… » | — |
| erreur | « Impossible de charger les fiches. » ; création échouée : « L'action n'a pas abouti. Réessayez. », titre conservé | « Réessayer » |
| connexion perdue | le bandeau ; « Nouveau … » et « Créer la fiche » désactivés | ouvrir une fiche listée |
| refus | un type inconnu : « Page introuvable. » ; une fiche illisible est absente de la liste ; *(kanevas-fiche-mj-seul)* `?visibilite=` posed by a player or in player mode: 400 « Requête invalide. » from the API, the screen never sends it and ignores it in the address | — |
| contenu long | plus de 100 fiches : « Charger la suite » ; titre trop long tronqué par « … » avec infobulle | idem |

*Critère.* Étant donné la fiche « Maître Aldric », dont Léa ne lit aucune section, quand Léa ouvre la
liste des personnages, alors elle n'y voit pas « Maître Aldric ».

### E-9 Fiche

Le titre, le badge du type — *(kanevas-fiche-mj-seul, B-57)* and, for a GM in GM mode, the amber
« MJ seul » badge (`lock`) when no section is readable by the players (a sheet without any
section carries it too), with the tooltip « Aucune
section n'est visible des joueurs. » (the badge is focusable; on focus or touch the sentence is
written under the header line, as E-18 does — the line keeps its (empty) place while unread, so the sections below never move on focus or blur; the E-9 mockup does not draw it, this text is
authoritative); it follows the saved state only — it appears or
disappears as soon as an audience setting is saved, without reloading, and does not move on
« L'action n'a pas abouti. Réessayez. » —; with a 120-character title it wraps to the next line
with the type badge, the title is never truncated for it; absent in player mode and for a player —, puis les **sections** dans leur ordre, chacune un panneau : titre,
contenu en Markdown rendu (AD-95), et un emplacement de **blocs de section** (relations, pièces
jointes : les tranches suivantes y inscrivent le leur, comme pour E-3, dans
`frontend/src/ecrans/fiche/blocs/` et `registre.ts`).

*Le MJ* voit toutes les sections. Sur chacune : « Modifier » ; l'**audience**, cinq réglages —
« Les joueurs la lisent », « Les joueurs l'écrivent », « Auteur » (liste des Joueurs de l'univers,
ou « aucun »), « L'auteur la lit », « L'auteur l'écrit » — enregistrés au changement ; « Monter »,
« Descendre » ; « Retirer la section ». En pied : « Ajouter une section » (titre, 1 à 80
caractères ; la section naît vide et fermée aux joueurs). Une section réservée au MJ porte le
mot « MJ seul » (pastille ambre). Le **mode Joueur** (bascule en tête) montre la fiche telle que la
voit un Joueur qui n'est l'auteur d'aucune section : plus de réglages, plus de section fermée, et
« Modifier » seulement sur celles que les joueurs écrivent (AD-39).

*Un Joueur* voit les sections qu'il lit (joueurs, ou auteur si c'est lui), sans titre ni trace des
autres ; « Modifier » sur celles qu'il peut écrire ; ni audience, ni ordre, ni ajout, ni retrait.
Pour **modifier** : un champ de texte (100 000 caractères au plus, valeur lue dans `limites.contenuSection` de `/api/moi` ; le serveur la refuse aussi, AD-91, AD-106 ; 20 000 avant `kanevas-import`), « Enregistrer », « Annuler ».
Enregistrer envoie la version lue (AD-59).

Textes : section sans contenu : « Rien d'écrit pour l'instant. » ; fiche sans section (MJ) : « Cette
fiche n'a pas encore de section. » ; écriture périmée : « La section a changé depuis que vous
l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous. » avec
« Recharger la section » ; droit retiré entre-temps : « Vous ne pouvez plus modifier cette section. » ;
Removal confirmation: « Retirer la section « Vérité — MJ seul » ? Son contenu sera perdu. »
(with attached files: « … Son contenu et ses 3 fichiers joints seront retirés. »), with
« Retirer la section » and « Annuler ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Cette fiche n'a pas encore de section. » et « Ajouter une section » ; section vide : « Rien d'écrit pour l'instant. » | MJ : ajouter ; qui écrit : « Modifier » |
| chargement | le titre absent, « Chargement de la fiche… » | — |
| erreur | « Impossible de charger cette fiche. » ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », texte conservé | « Réessayer » |
| connexion perdue | le bandeau ; « Enregistrer », audience, ordre, retrait, ajout désactivés ; le texte en cours reste | lire |
| refus | fiche inconnue ou dont rien n'est lisible : « Page introuvable. » ; section non lisible : absente. Un MJ en mode Joueur sur une fiche dont aucune section n'est lisible des joueurs voit « Aucune section n'est visible des joueurs. » (ce que verrait un joueur : « Page introuvable. ») | passer en mode MJ |
| contenu long | une section de 100 000 caractères passe à la ligne et s'affiche en entier ; plus au-delà, dès le 100 001e caractère saisi : « Erreur : 100 000 caractères au plus. » (sous le champ ; « Enregistrer » ne part pas ; le texte saisi est gardé, y compris quand c'est le serveur qui refuse, 400, avec le même texte — pas « L'action n'a pas abouti » ; tant que `/api/moi` n'a pas rendu la limite, ou s'il a échoué, l'écran ne contrôle rien et laisse le serveur répondre) ; titre de fiche (120 caractères) et titre de section (80) : passent à la ligne | idem |

*Critères.*
- Étant donné Léa, Joueuse, quand elle ouvre « Maître Aldric » (« Apparence » lue des joueurs,
  « Vérité — MJ seul » fermée), alors elle voit « Apparence » et rien d'autre : ni le titre
  « Vérité — MJ seul », ni un compteur, ni un bouton de réglage.
- Étant donné Antor, MJ, quand il passe en mode Joueur sur la même fiche, alors il voit la même
  chose que Léa et plus aucun réglage.
- Étant donné Antor qui a confié « Notes de la table » à Léa en auteur avec écriture, quand Léa
  modifie le texte et enregistre, alors la section montre son texte ; Teo, ajouté en Joueur, ne la
  voit pas tant que « Les joueurs la lisent » est faux.
- Étant donné deux onglets sur la même section, quand le second enregistre après le premier,
  alors il voit « La section a changé depuis que vous l'avez ouverte… » et son texte reste.
- Étant donné Antor qui modifie une section, quand il saisit un 100 001e caractère, alors « Erreur :
  100 000 caractères au plus. » apparaît sous le champ, rien n'est envoyé et son texte reste ;
  quand le serveur refuse malgré tout (400), il voit le même texte et son texte reste.

### Clôture de la tranche

Chaque besoin livré par la tranche (fiche de la feature, `## Livre`, hors de ce dépôt) a son écran : B-2 → E-2 ; B-3 à B-5 → E-4 ; B-7 → E-8 ; B-8 et B-9 →
E-9 ; B-1 et B-28 → session ; B-29 → six états de chaque écran ci-dessus. Chaque écran est atteint
par P-1 (E-1, E-2, E-3), P-2 (E-4), P-3 étape 4 et P-6 (E-8, E-9), P-7 (E-9). Les trois rôles ont
leur colonne dans la matrice du cadrage ; l'admin d'instance n'avait, avant `kanevas-recours-admin`, que E-1 et
E-2 ; E-5 lui vient avec cette tranche (plus bas).

## Détail des écrans de `kanevas-recours-admin`

> E-5 et l'entrée « Administration » de la barre latérale. Les textes communs (chargement, erreur de
> chargement, connexion perdue, écriture en cours, échec d'une écriture, refus) et les refus de
> membres (« Ce compte ne s'est jamais connecté. », « Ce compte est déjà membre. », « Impossible :
> l'univers doit garder au moins un MJ. ») sont ceux de « Détail des écrans de
> `kanevas-premiere-fiche` ». Maquette `docs/maquettes/e05-administration.html` (d'avant la charte : contenu et vocabulaire seulement).

**Qui est admin d'instance.** Le compte dont la session porte le groupe Authelia `parents` (AD-56,
lu à la connexion ; en bouchon, Admin). Le droit est celui de la session en cours : un compte retiré
du groupe le garde jusqu'à l'expiration de sa session (7 jours) — risque accepté (AD-86).
**Ce que l'admin voit** : le nom de chaque univers, le nombre de ses membres, et ses membres
(identifiant, rôle). **Ce qu'il ne voit jamais** : la description, une fiche, une section, un
compte-rendu, une carte, une pièce jointe, un système de jeu — pour tout cela, il est un compte sans
rôle (« Page introuvable. »), tant qu'il ne s'est pas ajouté lui-même comme membre.

### Barre latérale : l'entrée « Administration »

Pour un admin d'instance seulement : hors d'un univers, **Administration** sous « Mes univers » ; dans un
univers dont il est membre, **Administration** sous une section « Instance », en pied de la barre.
Pour tout autre compte, l'entrée n'existe pas.

### E-5 Administration

La barre haute porte le fil « Instance / Administration » ; sous le titre et le sous-titre « Les membres se gèrent ici ; le
contenu (fiches, comptes-rendus, cartes) n'est jamais affiché. », deux zones, puis le panneau « Jeton de l'assistant » (plus bas). À gauche, **Univers de
l'instance** : tous les univers, par nom (sans casse), chacun avec « N membres » (« 1 membre » au
singulier), l'univers choisi portant le badge « Sélectionné » ; cent à la fois, puis « Charger la suite ». À droite (sous la liste sur téléphone, après
un clic sur l'univers), **Membres — <nom de l'univers>** : la liste (identifiant, rôle MJ / Joueur,
« Retirer <identifiant> » sur chaque ligne, révélé au survol et au focus au bureau, toujours visible sans survol), puis, sous la liste, un champ « Identifiant du compte », le rôle (Joueur par défaut) et « Ajouter » : le même
geste, les mêmes refus et la même confirmation de retrait qu'E-4. Ajouter son propre identifiant, en
MJ, est le moyen de lire le contenu : l'ajout apparaît dans la liste des membres que voit le MJ de
l'univers ; une note sous le champ le dit : « Pour lire le contenu, l'admin s'ajoute lui-même comme
membre : l'ajout apparaît dans la liste des membres que voit le MJ de l'univers. » Un admin membre
qui se retire lui-même reste sur E-5 ; l'univers reste sélectionné, sa liste se met à jour sans lui, et il disparaît de l'accueil (E-1) de l'admin ; le lien « Ouvrir » disparaît avec son rôle. Rien d'autre n'est montré de l'univers : pas de lien vers sa vue d'ensemble tant que
l'admin n'en est pas membre ; une fois membre, un lien « Ouvrir » à côté du nom mène à E-3 (un clic sur le
nom sélectionne seulement l'univers). Aucune action sur l'univers lui-même
(nom, description) : elles sont au MJ.

Adresses : `/administration` (aucune sélection : « Choisissez un univers pour voir ses membres. »)
et `/administration/univers/:id`.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | liste des membres : sans objet, un univers a toujours un MJ (B-5) ; aucun univers dans l'instance : « Aucun univers sur l'instance pour l'instant. » ; aucune sélection : « Choisissez un univers pour voir ses membres. » | — |
| chargement | « Chargement des univers… » ; pour les membres : « Chargement des membres… » | — |
| erreur | « Impossible de charger les univers. » ou « Impossible de charger les membres. », avec « Réessayer » ; une écriture échouée : « L'action n'a pas abouti. Réessayez. » au-dessus de la liste des membres | « Réessayer » |
| connexion perdue | le bandeau ; « Ajouter », le changement de rôle et « Retirer » désactivés ; les listes chargées restent | lire |
| refus | tout compte hors du groupe : « Page introuvable. » (l'entrée n'existe pas dans sa barre) ; un univers qui n'existe pas : « Page introuvable. » ; groupe retiré à l'expiration de la session : « Page introuvable. » | « Mes univers » |
| contenu long | 300 univers : « Charger la suite » ; 200 membres : la liste défile ; un nom de 80 caractères et un identifiant long sont tronqués par « … » avec infobulle | idem |

*Critères.*
- Étant donné « Admin » (groupe `parents`), sans rôle dans « Lame d'Ébène », quand il ouvre
  l'administration et choisit « Lame d'Ébène », alors il voit « 2 membres », la liste antor (MJ) et lea (Joueur), et ni la description, ni aucune fiche.
- Étant donné le même Admin, quand il ajoute « mira » en MJ (elle apparaît dans la liste) puis ouvre l'adresse de la vue d'ensemble
  de « Lame d'Ébène », alors il voit « Page introuvable. » ; quand il s'ajoute lui-même en MJ, alors
  la vue d'ensemble s'ouvre et Antor, sur E-4, voit « admin » dans la liste des membres.
- Étant donné Léa, Joueuse, quand elle ouvre `/administration`, alors elle voit « Page introuvable. » et
  n'a pas d'entrée « Administration » dans sa barre.
- Étant donné Admin et l'univers « Les Landes grises », dont « mira » est la seule MJ, quand Admin tente de
  la retirer, alors il voit « Impossible : l'univers doit garder au moins un MJ. » et la liste est inchangée.
- Étant donné Admin, membre MJ de « Brume » (univers que le test crée ; le monde semé du bouchon n'a pas « Brume » : y jouer « Les Cendres de Vaëlis », où Admin est MJ), quand il ouvre l'administration, alors « Brume » porte un lien « Ouvrir » qui mène à sa vue d'ensemble, et « Lame d'Ébène » n'en porte pas ; s'il se retire de « Brume » (seul membre : refusé avec la raison du dernier MJ), le lien reste.
- Étant donné Admin et un compte « nadia » qui ne s'est jamais connecté, quand il tente de
  l'ajouter, alors il voit « Ce compte ne s'est jamais connecté. ».

### Clôture de `kanevas-recours-admin`

B-6 → E-5 (voir les univers et leurs membres, les gérer) ; P-2 étape 3 → E-5 ; B-29 → les six états
d'E-5 ; la lecture du groupe `parents` est posée par la première fiche (session, AD-56) et consommée
ici. E-5 est atteint par P-2 (étape 3) et par la barre (admin). Les trois rôles ont leur colonne : le
MJ et le Joueur n'ont pas E-5 ; l'admin n'a, hors des univers dont il est membre, que E-1, E-2 et E-5.
Écart au cadrage : aucun.

## Détail des écrans de `kanevas-systemes`

> E-14, E-15, le lien de E-3 vers le système, l'item « Paramètres » de la barre latérale. Les
> textes communs (chargement, erreur, connexion perdue, écriture en cours, échec d'une écriture,
> refus) sont ceux de « Détail des écrans de `kanevas-premiere-fiche` ». Maquettes finies :
> `docs/maquettes/e14-parametres.html`, `e15-systeme-de-jeu.html`.

**Ce que voit chacun du catalogue.** Le catalogue ne porte que des **noms** de systèmes, lus par tout
compte qui est MJ d'au moins un univers (c'est ce qui permet à Mira de trouver « CoF Mini »). Le contenu
d'un système (E-15) n'est lu que par les membres d'un univers qui lui est rattaché. **Aucun écran ne
nomme un autre univers** : un système dit seulement « utilisé par N univers » (N compte l'univers
courant), jamais lesquels. Depuis `kanevas-illustrations`, E-16 et E-15 nomment **les seuls univers
du compte** qui utilisent le système (« Dans vos univers », avec son rôle) ; un univers dont le compte
n'est pas membre n'est jamais nommé, sur aucun écran ni dans aucune réponse (AD-84, AD-94). Un système « n'est pas vu » d'un univers qui n'y est pas rattaché : pas
de bloc sur E-3, et l'adresse de E-15 répond « Page introuvable. ».

### E-14 Paramètres de l'univers (MJ)

Trois panneaux, dans cet ordre, chacun portant la pastille « MJ seul » (cadenas) de la charte ; au téléphone (sous 760 px) leur débord est de 12 px, non 28.

1. **Identité** : « Nom » (obligatoire, 80 caractères au plus), « Description » (500 au plus),
   « Enregistrer ». Après l'enregistrement : toast « Enregistré. ».
2. **Système de jeu** : une liste « Système du catalogue » (les noms, par ordre alphabétique sans
   casse, et en tête « Aucun système »), « Rattacher » ; si l'univers a un système : son nom, « Utilisé
   par N univers » et « Ouvrir le système » (→ E-15). Choisir « Aucun système » puis « Rattacher »
   **détache** l'univers (rien n'est supprimé : le système et son contenu restent, les autres
   univers le gardent). Toasts : « « X » rattaché », « « X » détaché » (« Aucun système rattaché » s'il n'y en avait pas).
3. **Créer un système** : « Nom du système » (obligatoire, 80 caractères au plus), « Créer et
   rattacher » : le système naît au catalogue et l'univers y est rattaché en un seul geste (si l'un
   échoue, aucun n'a lieu). Un nom déjà pris (sans tenir compte de la casse) : « Un système porte déjà
   ce nom. » sous le champ. Réussite : toast « « X » créé et rattaché ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | catalogue sans système : la liste ne propose que « Aucun système » et le panneau dit « Le catalogue est vide. Créez le premier système ci-dessous. » ; univers sans système : « Cet univers n'est rattaché à aucun système de jeu. » | créer un système |
| chargement | « Chargement des paramètres… » | — |
| erreur | « Impossible de charger cette page. » ; nom vide (univers ou système) : « Erreur : le nom est obligatoire. » sous le champ ; une écriture qui échoue : « L'action n'a pas abouti. Réessayez. » au-dessus du panneau concerné, saisie conservée | « Réessayer » |
| connexion perdue | le bandeau ; « Enregistrer », « Rattacher », « Créer et rattacher » désactivés, saisie conservée | lire |
| refus | Joueur : l'item « Paramètres » est absent et l'adresse montre « Page introuvable. » ; compte sans rôle, admin d'instance sans rôle dans l'univers : de même ; rôle retiré pendant que la page est ouverte : « Vous ne pouvez plus modifier ces paramètres. » à l'écriture suivante | « Mes univers » |
| contenu long | 200 systèmes au catalogue : la liste défile ; un nom de 80 caractères est tronqué par « … » avec infobulle ; « Erreur : 80 caractères au plus. » dès le 81e (500 pour la description) | corriger |

*Critères.*
- Étant donné Antor, MJ de Lame d'Ébène, et un catalogue qui contient « CoF Mini », quand il choisit
  « CoF Mini » et « Rattacher », alors le panneau montre « CoF Mini », « Utilisé par 1 univers » et
  « Ouvrir le système ».
- Étant donné Léa, Joueuse de Lame d'Ébène, quand elle ouvre l'adresse des paramètres, alors elle
  voit « Page introuvable. » et l'item « Paramètres » n'est pas dans sa barre.
- Étant donné un système « CoF Mini » existant, quand Antor en crée un autre nommé « cof mini »,
  alors il voit « Un système porte déjà ce nom. » et rien n'est créé.
- Étant donné Antor, univers rattaché à « CoF Mini », quand il choisit « Aucun système » et
  « Rattacher », alors le panneau dit « Cet univers n'est rattaché à aucun système de jeu. », le bloc
  « Système de jeu » a disparu de E-3, et « CoF Mini » est toujours dans la liste du catalogue.

### E-15 Système de jeu

> Depuis `kanevas-illustrations`, E-15 vit **hors du cadre d'un univers**, à l'adresse
> `/systemes/:sid` (voir « Systèmes de jeu, hors des univers » plus bas, AD-94) ; ce qui suit vaut
> toujours pour son contenu, ses gestes et ses textes.

Atteint depuis E-14 (« Ouvrir le système ») et depuis E-3 (bloc « Système de jeu », ci-dessous) —
et depuis E-16 ; son adresse est désormais `/systemes/:sid` (*remplacé par le § de
`kanevas-illustrations`*). Le nom du système en titre, « Référentiel commun · utilisé par N
univers » ; quatre onglets, **Règles**, **Créatures**, **Objets** (Créatures par défaut) et **Types de fiche** (kanevas-import-types, décrit plus bas) ; sous
l'onglet, la liste des entrées du type par nom (ordre alphabétique sans casse), cent à la fois, puis
« Charger la suite ». Chaque ligne (une **entrée** : une règle, une créature ou un objet ; `gabarit` dans les données) : le nom et la première ligne du contenu (tronquée). Un clic ouvre
l'entrée **sur place** (le nom, le contenu en Markdown, AD-95).

*Le MJ d'un univers rattaché* : « Ajouter une règle » / « Ajouter une créature » / « Ajouter un
objet » ouvre un formulaire sur place : « Nom » (1 à 120 caractères), « Contenu » (20 000 au plus ; 100 000 depuis `kanevas-import`, AD-106 ;
facultatif), « Ajouter » et « Annuler » ; sur une entrée ouverte, « Modifier » (nom et contenu),
« Enregistrer », « Annuler ». Le type d'une entrée ne change jamais ; rien ne se supprime. Enregistrer
envoie la version lue (AD-85).
*Un Joueur d'un univers rattaché* : la même page, lecture seule, sans bouton d'ajout ni de
modification.

Textes : onglet vide, MJ : « Aucune créature pour l'instant. » (« Aucune règle », « Aucun objet ») et
le bouton d'ajout ; Joueur : « Aucune créature à voir pour l'instant. » ; écriture périmée : « Cette
entrée a changé depuis que vous l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte
reste ci-dessous. » avec « Recharger » (une entrée : une règle, une créature ou un objet) ; nom vide : « Erreur : le nom est obligatoire. » sous le champ ; nom déjà pris dans le même type : « Une créature porte déjà ce
nom. » (« Une règle… », « Un objet… ») ; droit retiré entre-temps (rôle changé, univers détaché) :
« Vous ne pouvez plus modifier ce système. ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | l'onglet sans entrée : texte ci-dessus | MJ : ajouter |
| chargement | le titre absent, « Chargement du système… » | — |
| erreur | « Impossible de charger ce système. » ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », saisie conservée | « Réessayer » |
| connexion perdue | le bandeau ; « Ajouter », « Enregistrer » désactivés, le texte en cours reste | lire |
| refus | *remplacé* : voir la matrice d'états de « E-15 hors de l'univers » (`kanevas-illustrations`) — le refus mène à « Systèmes de jeu » | — |
| contenu long | 100 entrées : « Charger la suite » ; nom tronqué par « … » avec infobulle ; contenu de 100 000 caractères passe à la ligne et s'affiche en entier ; au-delà : « Erreur : 100 000 caractères au plus. » ; nom au-delà de 120 : « Erreur : 120 caractères au plus. » | idem |

*Critères.*
- Étant donné Antor, MJ de Lame d'Ébène rattaché à « CoF Mini », quand il ajoute la créature « Garde
  du sceau » avec son contenu, alors elle apparaît sous « Créatures ».
- *Remplacé par le critère de Mira du § de `kanevas-illustrations` (la seule puce « Les Landes
  grises · MJ ») :* étant donné Mira, MJ des « Landes grises » rattachée au même système, quand
  elle ouvre « Créatures », alors elle voit « Garde du sceau » et « Utilisé par 2 univers », et aucun
  nom d'univers.
- Étant donné Léa, Joueuse de Lame d'Ébène, quand elle ouvre le système, alors elle voit « Garde du
  sceau » sans « Ajouter » ni « Modifier » ; si le MJ envoie une écriture à sa place par l'adresse de
  l'API, elle est refusée.
- *Remplacé par le § de `kanevas-illustrations` (critère de Teo, et l'ancienne adresse) :* étant
  donné « Admin » (groupe `parents`, MJ de l'univers « Brume » qu'il vient de créer, non rattaché),
  quand il ouvre `/univers/<Brume>/systeme`, alors il voit « Page introuvable. » ; et sur la vue
  d'ensemble de « Brume » il n'y a pas de bloc « Système de jeu ».
- Étant donné deux onglets sur la même créature, quand le second enregistre après le premier, alors
  il voit « Cette entrée a changé depuis que vous l'avez ouverte. » et son texte reste.

### Bloc « Système de jeu » de E-3

Un bloc de la vue d'ensemble (déposé dans `frontend/src/ecrans/vue-ensemble/blocs/`, rang bas,
visible des MJ et des Joueurs) : le nom du système et un lien « Ouvrir le système » (→ E-15). **Sans
système, le bloc n'existe pas** : ni message, ni lien mort. Ses états : chargement — le bloc est
absent ; erreur — le bloc est absent (la vue d'ensemble n'échoue pas pour lui) ; refus et vide —
sans objet : un univers sans système n'a pas de bloc ; connexion perdue — le bloc reste tel qu'il a été chargé ; contenu long — le nom (80 caractères) est
tronqué avec infobulle.

### Clôture de `kanevas-systemes`

B-13 → E-14 (rattacher, créer et rattacher) ; B-14 → E-15 ; P-8 étape 1 → E-14, étape 2 → E-15 ; le
lien de E-3 → bloc ci-dessus ; B-29 → les six états de E-14 et E-15. E-14 est atteint par P-8 et par
la barre (MJ) ; E-15 par P-8 et par E-3. Les trois rôles ont leur colonne : l'admin d'instance sans
rôle n'a ni E-14 ni E-15 ; l'admin MJ de son propre univers a ceux d'un MJ.
Écart au cadrage : aucun. Précision : le cadrage dit « nom, description » pour E-14 ; la tranche
construit donc aussi la **modification** du nom et de la description d'un univers, qu'aucune
tranche précédente ne livre.

## Détail des écrans de `kanevas-relier-chercher`

> Deux ajouts, aucun écran neuf : la **recherche** dans E-8 et le **bloc Relations** de E-9.
> Mêmes six états et mêmes textes communs que la première fiche (chargement, erreur, connexion
> perdue, refus « Page introuvable. », écriture en cours, échec d'écriture). Maquettes : `e08` (états
> de la recherche) et `e09` (bloc Relations) sont complétées. Le document prime sur la maquette.

### E-8 — la recherche dans un type

Au-dessus de la liste d'un type : un champ « Chercher dans les personnages » (« …dans les lieux »,
« …dans les factions », « …dans les objets », « …dans les événements », « …dans les quêtes »),
un bouton « Chercher », et, quand une recherche est en cours, « Effacer la recherche ». La
recherche part à « Chercher » ou à la touche Entrée, jamais à la frappe. Elle est gardée dans
l'adresse (`…/personnages?q=Aldric`) : revenir d'une fiche ramène aux résultats.

*Ce qu'elle trouve.* Les mots saisis sont cherchés par début de mot, sans tenir compte des
majuscules ni des accents (« verite » trouve « Vérité »), et **tous** doivent se trouver dans le
**titre** de la fiche, ou **tous** dans **une même section que le compte peut lire** (titre ou
contenu de la section). Les résultats sont les fiches de la liste du type, dans le même ordre
alphabétique, cent à la fois avec « Charger la suite ». Un résultat s'affiche comme une ligne de la
liste (titre, badge) : pas d'extrait, pas de compteur, pas de classement. Le texte d'une section
que le compte ne lit pas ne trouve rien, même s'il contient les mots : la fiche est absente des
résultats, comme elle est absente de la liste.

*Saisie.* 1 à 100 caractères ; une saisie blanche équivaut à « Effacer la recherche ». Au-delà de
100 : « Erreur : 100 caractères au plus. » sous le champ, rien n'est envoyé. Les signes sans lettre
ni chiffre (« - », « " », « * ») ne comptent pas comme des mots ; une saisie qui n'en contient aucun
se comporte comme une recherche sans résultat.

*Rôles.* Le MJ cherche dans toutes les fiches de l'univers, y compris une fiche sans section ; un
Joueur cherche parmi celles qu'il peut lire. « Nouveau personnage » reste visible du MJ pendant une
recherche.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun résultat pour « Vérité » dans les personnages. » — **le même texte** que la fiche existe ou non, lisible ou non | « Effacer la recherche » |
| chargement | « Recherche… » (`role="status"`) ; l'ancienne liste n'est pas montrée | — |
| erreur | « Impossible de lancer la recherche. » ; le champ garde sa saisie | « Réessayer » |
| connexion perdue | le bandeau ; « Chercher » désactivé ; les résultats déjà affichés restent | ouvrir un résultat |
| refus | sans objet pour la recherche : un type inconnu répond « Page introuvable. » comme la liste | — |
| contenu long | plus de 100 résultats : « Charger la suite » ; un titre trop long est tronqué par « … » avec infobulle ; une saisie de 100 caractères passe à la ligne dans le champ | idem |

*Critères.*
- Étant donné la fiche « Maître Aldric » dont la section « Vérité — MJ seul » est fermée aux
  joueurs, quand Léa cherche « Vérité » dans les personnages, alors elle voit « Aucun résultat
  pour « Vérité » dans les personnages. » ; quand Antor fait la même recherche, il voit
  « Maître Aldric ».
- Étant donné Léa, quand elle cherche « aldric » dans les personnages, alors elle voit
  « Maître Aldric » (le titre se trouve) ; et quand elle cherche « apparence », elle le voit aussi
  (la section « Apparence » est lue des joueurs).
- Étant donné une recherche qui n'a pas de résultat, quand Léa cherche un mot qui n'existe nulle
  part, alors le texte affiché est le même que pour « Vérité » (aucune différence ne trahit la
  fiche cachée).
- Étant donné Léa devant les résultats de « Aldric », quand elle ouvre la fiche puis revient, alors
  elle retrouve la même recherche et les mêmes résultats.

### E-9 — le bloc Relations

Dans chaque section, sous son contenu : un bloc **Relations**, inscrit au registre des blocs de
section (un fichier, sans modifier un bloc existant). Il liste les relations **portées par cette
section** : chacune dit son type et nomme sa cible — « membre de → Lames Grises », avec le badge du
type de la cible (« PJ » or « PNJ » for a character, AD-64) — et mène à la fiche de la cible (E-9). Une relation est dirigée : elle va de la
section vers la cible ; la fiche cible ne montre pas les relations qui l'atteignent.

| Rôle | Lire les relations d'une section | Relier, retirer | Refus |
|---|---|---|---|
| MJ | toutes celles de ses sections | oui | sans objet |
| Joueur | celles dont il lit la section et la cible | non : boutons **absents** | une relation à cible illisible est **absente**, pas refusée |
| MJ en mode Joueur | comme un Joueur qui n'est l'auteur d'aucune section | non : boutons absents | idem |
| Admin d'instance | aucune | non | « Page introuvable. » |

*Ce que voit chacun.* Une relation n'est montrée que si le compte lit la section **et** la fiche
cible. Sinon elle est **absente** : ni ligne, ni espace, ni compteur, ni mot « cachée ». Le bloc
d'un Joueur qui n'a aucune relation à voir n'apparaît pas du tout. Le MJ voit le bloc de chaque
section, même vide. En mode Joueur, le MJ voit le bloc comme un Joueur qui n'est l'auteur d'aucune
section (AD-39), sans « Relier » ni « Retirer ».

*Le MJ relie.* « Relier à une fiche » ouvre un formulaire sous la liste :
1. « Type de relation » (texte libre, 1 à 80 caractères, par exemple « membre de ») ;
2. « Type de fiche » (Personnage, Lieu, Faction, Objet, Événement, Quête ; Personnage par défaut) ;
3. un champ « Chercher dans les factions » et la liste des fiches de ce type, cent à la fois avec
   « Charger la suite » : c'est la liste et la recherche de E-8, pas une autre ;
4. choisir une fiche (une seule), puis « Relier » ; « Annuler » ferme sans rien écrire.

*Le sélecteur de fiche* (étape 3) est la liste et la recherche de E-8 telles quelles : la recherche part à « Chercher » ou à Entrée, avec les mêmes états et les mêmes textes (« Recherche… », « Impossible de lancer la recherche. » et « Réessayer », « Aucun résultat pour « lames » dans les factions. », bandeau de connexion perdue avec « Chercher » et « Relier » désactivés, « Charger la suite » au-delà de 100) ; à l'ouverture du formulaire la liste du type se charge (« Chargement des fiches… », ou « Impossible de charger les fiches. » et « Réessayer ») et « Chercher » reste actif (hors connexion perdue) ; « Relier » reste désactivé tant qu'aucune fiche n'est choisie, pendant le chargement et sur erreur ; « Effacer la recherche » rend la liste du type ; le choix se voit (puce pleine) et disparaît si l'on change le type de fiche ou la recherche.

Le formulaire n'est pas gardé en cas de session expirée. Une fiche se relie à toute fiche de son
univers, **sauf à elle-même**. Une section porte au plus 100 relations ; deux relations de même
type vers la même fiche ne coexistent pas. « Retirer » sur une ligne supprime la relation sans
confirmation (elle se refait en trois gestes) ; retirer une section retire ses relations avec elle.

Textes : bloc sans relation (MJ) : « Aucune relation pour l'instant. » ; erreurs sous les champs :
« Erreur : le type de relation est obligatoire. », « Erreur : 80 caractères au plus. », « Erreur :
choisissez une fiche. » ; refus du service, au-dessus du formulaire : « Cette relation existe
déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. » ;
liste de choix vide : « Aucune faction à relier. » (autres types : « Aucun personnage… ») ;
chaque bouton « Retirer » porte l'étiquette accessible « Retirer la relation membre de → Lames Grises ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucune relation pour l'instant. » et « Relier à une fiche » ; Joueur : le bloc n'est pas là | MJ : relier |
| chargement | « Chargement des relations… » dans le bloc seul ; le reste de la fiche reste affiché | — |
| erreur | « Impossible de charger les relations. » dans le bloc seul, les autres sections intactes ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », saisie conservée | « Réessayer » |
| connexion perdue | le bandeau ; « Relier », « Retirer » désactivés ; la liste affichée reste | suivre un lien |
| refus | le bloc d'une section illisible n'existe pas (la section est absente, B-9) ; une relation vers une fiche illisible est absente ; « Relier » et « Retirer » n'existent pas pour un Joueur ni en mode Joueur | — |
| contenu long | 100 relations : la liste défile avec la section ; un type de 80 caractères et un titre de fiche de 120 passent à la ligne | idem |

*Critères.*
- Étant donné Antor, MJ, qui a relié la section « Apparence » de « Maître Aldric » à la faction
  « Lames Grises » (« membre de ») et à la faction « Cercle des Cendres » dont aucune section n'est
  lue des joueurs, quand Léa ouvre « Maître Aldric », alors elle voit « membre de → Lames Grises »,
  et rien d'autre dans le bloc : ni « Cercle des Cendres », ni compteur, ni ligne vide.
- Étant donné la même fiche, quand Antor passe en mode Joueur, alors il voit la même chose que Léa
  et ni « Relier » ni « Retirer ».
- Étant donné Léa, quand « Lames Grises » n'a plus de section lue des joueurs, alors la relation
  disparaît de la fiche d'Aldric sans autre trace.
- Étant donné Antor sur « Maître Aldric », quand il relie « Apparence » à « Maître Aldric », alors il
  voit « Une fiche ne se relie pas à elle-même. » et rien n'est écrit.
- Étant donné Antor, quand il retire la section « Apparence », alors ses relations disparaissent
  avec elle et ne remontent nulle part.

### Clôture de `kanevas-relier-chercher`

B-10 → bloc Relations de E-9 ; B-11 → recherche de E-8 ; B-29 → six états de la recherche et du
bloc ci-dessus. Atteints par P-3 étape 4 (relier le PNJ à sa faction : relier une section du PNJ, bloc de E-9) et P-6 étape 2
(chercher « Aldric », E-8). Les deux rôles ont leur colonne : le MJ cherche et relie, le Joueur
cherche et lit ce qu'il peut ; l'admin d'instance n'atteint ni l'un ni l'autre (« Page
introuvable. »). Chemin d'échec propre à cette tranche (`docs/parcours.md` n'en porte pas pour P-3 et P-6) : une recherche sans résultat dit « Aucun résultat pour … »,
jamais « caché ». Chemin d'échec de relier une section : le refus du service s'écrit au-dessus du formulaire (« Cette relation existe déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. »), la saisie et le choix sont conservés ; un échec d'écriture générique et une session expirée suivent les textes communs (« L'action n'a pas abouti. Réessayez. » ; connexion, formulaire non gardé).

## Détail des écrans de `kanevas-suivi`

> E-13 Comptes-rendus and the E-3 blocks, with the « Campagne » line of E-9. Campaigns and
> scenarios are sheets of type « Aventure » (E-8, E-9: “Screen details for
> `kanevas-scenarios`” below); E-6 Campagne, E-7 Scénario and the
> « Campagnes » sidebar entry no longer exist. Same six states and common texts as above. Vocabulary:
> screens spell out « compte-rendu »; “CR” is only an abbreviation in the documentation
> (B-19, B-20). Dates: « 22 sept. 2026 » (day, abbreviated month, year), as on E-9.

**Ajouts aux écrans déjà construits.**

- *Sidebar*: **Comptes-rendus** appears for every role between « Vue d'ensemble » and
  « Lore ». On phones, like the other entries (drawer).
- *E-9, fiche de type compte-rendu* : sous le titre, une ligne « Campagne : <nom> » qui mène à
  the adventure's sheet, for a reader who can read it (`fiche/lignes/` registry). An 80-character name wraps;
  while loading, the line is absent; if the adventure is unreadable or fails to load, the line
  is absent without a message (the report stays readable); offline, an already displayed line
  stays clickable.
- *E-9, ce que chaque rôle voit d'un compte-rendu* : une seule section, « Compte-rendu », lisible de
  tous les membres. « Modifier » est offert à son auteur (le Joueur qui l'a créé) et au MJ, pas aux
  autres Joueurs ; le MJ règle l'audience comme pour toute section. Un compte-rendu créé par un MJ
  n'a pas d'auteur. Fermer la section aux joueurs la cache aux autres Joueurs, pas à son auteur
  (AD-61). Creation starts from the adventure’s « Comptes-rendus » block (E-9).

### E-13 Comptes-rendus

Tous les comptes-rendus de l'univers **que le compte peut lire**, du plus récemment créé au plus
ancien (un compte-rendu retouché ne remonte pas, B-20) ; chacun : titre, the name of its adventure (only for a reader who can read it), auteur (l'identifiant, rien s'il n'y en a pas),
date de création, lien vers E-9. Cent à la fois, puis « Charger la suite ». Pas de création ici :
« Nouveau compte-rendu » is in the adventure’s « Comptes-rendus » block (E-9).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun compte-rendu pour l'instant. » (Joueur : « Aucun compte-rendu à lire pour l'instant. ») | GM and player: « Voir les aventures » (→ E-8, type « Aventure ») |
| chargement | « Chargement des comptes-rendus… » | — |
| erreur | « Impossible de charger les comptes-rendus. » ; « Charger la suite » en échec : « Impossible de charger la suite. » | « Réessayer » |
| connexion perdue | le bandeau ; la liste chargée reste ; « Charger la suite » désactivé | ouvrir |
| refus | un compte-rendu dont rien n'est lisible est absent de la liste, jamais signalé ; univers sans rôle : « Page introuvable. » | « Mes univers » |
| contenu long | plus de 100 : « Charger la suite » ; titre de 120 caractères : passe à la ligne | idem |

*Critère.* Étant donné Antor qui a fermé aux joueurs la section du compte-rendu « Session 11 » qu'il a écrit, quand
Léa ouvre E-13, alors elle ne voit pas « Session 11 » et la liste ne laisse aucun trou ni compteur.

### Blocs de E-3 (`kanevas-suivi`)

Three independent blocks, in this order, reading adventures (see “Screen details for
`kanevas-scenarios`”, “E-3, E-13, E-12 and E-17”). Each has a title and an empty state, and never
shows a count or a name the account cannot read.

- **Campagnes en cours** (everyone): adventures of sub-type « Campagne » with status « En cours »
  that the account reads, each linking to its sheet (E-9) with its status. Empty: « Aucune campagne
  en cours. » (GM: « Voir les aventures » link → E-8, type « Aventure »).
- **Derniers comptes-rendus** (tous) : les cinq plus récemment créés que le compte peut lire,
  title, adventure (if the account reads it), date, link to E-9; « Tous les comptes-rendus » link
  (→ E-13). Empty: « Aucun compte-rendu pour l'instant. » (player: « Aucun compte-rendu à lire
  pour l'instant. »).
- **Préparation** (GM only — the block is absent for a player): for each adventure « En cours », its
  first five unchecked tasks (oldest first) with their category and a link to the
  sheet. Empty: « Rien à préparer pour l'instant. ».

| État | Ce qu'on voit |
|---|---|
| chargement | chaque bloc affiche « Chargement… » à sa place, indépendamment |
| erreur | le bloc seul dit « Impossible de charger ce bloc. » avec « Réessayer » ; les autres blocs restent |
| connexion perdue | le bandeau ; contenu déjà chargé |
| refus | sans objet pour les blocs ; le bloc Préparation est absent pour un Joueur |
| contenu long | 120-character adventure title, 120-character report title, 200-character task label: wrap; at most five reports and five tasks per adventure; the number of ongoing adventures is unlimited (AD-60) |

*Critère.* Étant donné Léa, quand elle ouvre E-3, alors elle voit « Campagnes en cours » et
« Derniers comptes-rendus », jamais « Préparation » ; Antor voit les trois.

## Détail des écrans de `kanevas-relier-chercher`

## Détail des écrans de `kanevas-fichiers`

> Un seul ajout, aucun écran neuf : le **bloc Pièces jointes** de E-9. Mêmes six états et mêmes
> textes communs que la première fiche (erreur, connexion perdue, refus « Page introuvable. »,
> écriture en cours, échec d'une écriture). Maquette : `e09` (bloc Pièces jointes : MJ, Joueuse,
> envoi, échecs). Le document prime sur la maquette.

### E-9 — the « Pièces jointes » block

> *Amended by `kanevas-import` (AD-111, decisions of 2026-10-11): an attachment is now a media
> library file referenced by the section; “secret” becomes « Réservé au MJ », the file's own
> visibility; up to 100 attached files per section. See « E-9 Fiche — ce que `kanevas-import`
> change », « Fichiers ».*

Each section has a **« Pièces jointes »** block below its content (and below Relations, if present),
registered in the section block registry. It shows **files attached to that section** (references
into the media library, see « Fichiers » below): an **image** (PNG, JPEG, GIF, WebP, identified by its
bytes, not its name) as a thumbnail; any other file (PDF, text, archive…, including SVG images) as
a row with name, size and « Télécharger ». Clicking a thumbnail opens the full image in a new tab.

An attached file **has its own visibility**, « Visible des joueurs » or « Réservé au MJ » (AD-111).
Readers without access to the section do not see its block. A section reader can only see a GM-only
file if they added it themselves (third read rule); otherwise a neutral placeholder (« Image
réservée au MJ. » or « Fichier réservé au MJ. ») replaces it, and the file address answers « Page
introuvable. ». The GM sets the **file's** visibility (« Réserver au MJ » / « Rendre visible des joueurs »).

| Role | See | Attach | Set visibility | Remove reference | Refusal |
|---|---|---|---|---|---|
| GM | All attachments of their sections, including GM-only files | Yes, on any section | Yes | Yes | Not applicable |
| Player | Attachments of readable sections, excluding GM-only files **unless they added them** | On a section they **can write** (their own, or open to player writes); « Joindre un fichier » is absent on read-only sections | No: **absent** | A readable file on a section they can write | A GM-only file they did not add is **absent**; its address answers « Page introuvable. » |
| GM in player mode | Like a player, plus files they added themselves (AD-117) | Only where players can write | Absent | Only where players can write | Same |
| Instance admin | None | No | No | No | « Page introuvable. » |

Actions unavailable to a role are **absent** (never disabled, except offline): a read-only section
has neither « Joindre un fichier » nor « Retirer »; players and GMs in player mode have neither
« Réserver au MJ » nor « Rendre visible des joueurs ». The API refuses writes on a read-only
section with **403**, and visibility changes by non-GMs with 403; unreadable resources answer 404.
Instance admins have no block (« Page introuvable. »). A GM in player mode gets the player limit message.

*Attach.* « Joindre un fichier » opens the two-path add menu (see « Fichiers » below).
« Ajouter depuis l'appareil » opens the system file picker: **choosing a file is enough**; upload
starts immediately, one file after another for multiple selections (no size limit). During upload,
a « portrait.png — Envoi… 42 % » row (`role="status"`) has « Annuler »; cancellation writes nothing
to either the library or the sheet. Completed files join the list. A section has **at most 100
attached files** (50 before `kanevas-import`, AD-111); this counts block references, not text references.
Empty files are refused. Each selected file is judged separately: one refusal does not stop later
files; each refusal leaves an error row with only « Ignorer » (retrying a refusal would not help).

*Set visibility, remove.* Each row offers the GM « Réserver au MJ » (or « Rendre visible des joueurs »
for a GM-only file) and « Retirer « portrait.png » »; section writers only have « Retirer ».
Removal **only removes the reference, never the library file**. Inline confirmation: « Retirer
« portrait.png » de cette section ? Le fichier reste dans la médiathèque. » with « Retirer » and
« Annuler ». Removing a section removes its references; the first-sheet confirmation adds
« … Son contenu et son fichier joint seront retirés. » (one file) or « … Son contenu et ses 3 fichiers
joints seront retirés. » (several). Without attachments, the text is unchanged. GM-only files have
an amber « MJ seul » badge and the GM panel border. Files are never changed in place: attach another
file and remove the old one to replace it.

*Texts.* No attachments: « Aucun fichier joint. »; size: « 842 o », « 4,2 Ko », « 3,1 Mo », « 1,2 Go »
(base 1024); name: original filename without directories, up to 200 characters. A thumbnail has the
filename as alternative text, a caption below with name and size (« portrait-aldric.png · 3,1 Mo »),
then its buttons. Failed upload: « « portrait.png » : l'envoi n'a pas abouti. » with « Réessayer »
and « Ignorer ». Empty file: « « notes.txt » est vide. ». Limit: « Cette section porte déjà 100
fichiers joints. » for the GM, « Cette section ne peut pas recevoir d'autre fichier. » for a player
(who cannot see GM-only files: a count would disclose hidden information). Lost write permission
when adding or removing: « Vous ne pouvez plus ajouter de fichier à cette section. »; reload the
sheet, hiding « Joindre un fichier » and « Retirer ». Attachment already removed, deleted or no
longer readable: « Ce fichier joint n'existe plus. » (reload the list). Failed thumbnail: « Image
indisponible. » with « Télécharger ». Failed visibility change or removal: « L'action n'a pas
abouti. Réessayez. »; restore the previous state.

*No block when there is nothing to show.* A player who can neither see nor attach anything in a
section has no block: no title, count or « Aucun fichier joint. ». The GM sees every section's
block, even when empty.

| State | What is shown | Available actions |
|---|---|---|
| Empty | GM or section writer: « Aucun fichier joint. » and « Joindre un fichier »; read-only reader: no block | Attach |
| Loading | Files come with the sheet: « Chargement de la fiche… » (E-9); loading thumbnails keep their fixed frame; upload: « Envoi… 42 % » row | Cancel upload |
| Error | Upload: « « portrait.png » : l'envoi n'a pas abouti. », row remains; empty file or limit reached: the refusal above, persistent row with « Ignorer »; visibility change or removal: « L'action n'a pas abouti. Réessayez. »; thumbnail: « Image indisponible. »; library choice deleted in the meantime: « Ce fichier n'existe plus. » | « Réessayer », « Ignorer », « Télécharger » |
| Offline | Banner; « Joindre un fichier », « Réserver au MJ », « Rendre visible des joueurs », « Retirer » disabled; an interrupted upload becomes the error above; loaded thumbnails stay | View, download |
| Refused | Lost write permission: « Vous ne pouvez plus ajouter de fichier à cette section. »; attachment removed in the meantime: « Ce fichier joint n'existe plus. »; unreadable section or sheet: « Page introuvable. »; GM-only file a player did not add: absent | Reload |
| Long content | A 200-character name wraps; 100 attachments: full list, then role-specific limit refusal on add; multi-GB file: percentage progress and size in « Go »; thumbnail fits a 160 × 120 px frame | Same |

*Acceptance criteria.*
- Given « Maître Aldric », when Antor, the GM, attaches a portrait to « Vérité — MJ seul », Léa,
  a player, sees neither the portrait nor that section's block (she cannot read the section).
  On « Apparence » (readable by players), when Antor attaches another portrait then reserves it
  for the GM on E-19, Léa reads « Image réservée au MJ. » instead of the thumbnail. The reserved
  portrait's direct address answers « Page introuvable. », just like an address that never existed.
- Given Léa as author with write access to « Notes de la table », choosing a portrait starts upload
  immediately and shows a thumbnail. Teo, added to the universe as a player by Antor, cannot see it:
  visibility is set on upload (AD-111); opening the section to players later does not change it.
  He can neither attach nor remove it.
- Given Antor attaching a location map as PDF, the row offers « Télécharger » and downloads under
  the original name; « image.svg » is never rendered in the page.
- Given Antor in player mode on the sheet, he sees neither « Réserver au MJ » nor « Rendre visible
  des joueurs », nor GM-only files he did not add himself; he can only attach where players can write.
- Given an ongoing 2 GB upload, when Antor clicks « Annuler », the row disappears and no file is added.
- Given Antor removing « Apparence » with an attached portrait, the confirmation says « … Son contenu
  et son fichier joint seront retirés. »; after confirmation, the portrait is gone from the sheet
  but remains in the media library.

### Clôture de `kanevas-fichiers`

Dans chaque section, sous son contenu : un bloc **Relations**, inscrit au registre des blocs de
section (un fichier, sans modifier un bloc existant). Il liste les relations **portées par cette
section** : chacune dit son type et nomme sa cible — « membre de → Lames Grises », avec le badge du
type de la cible (« PJ » or « PNJ » for a character, AD-64) — et mène à la fiche de la cible (E-9). Une relation est dirigée : elle va de la
section vers la cible ; la fiche cible ne montre pas les relations qui l'atteignent.

| Rôle | Lire les relations d'une section | Relier, retirer | Refus |
|---|---|---|---|
| MJ | toutes celles de ses sections | oui | sans objet |
| Joueur | celles dont il lit la section et la cible | non : boutons **absents** | une relation à cible illisible est **absente**, pas refusée |
| MJ en mode Joueur | comme un Joueur qui n'est l'auteur d'aucune section | non : boutons absents | idem |
| Admin d'instance | aucune | non | « Page introuvable. » |

*Ce que voit chacun.* Une relation n'est montrée que si le compte lit la section **et** la fiche
cible. Sinon elle est **absente** : ni ligne, ni espace, ni compteur, ni mot « cachée ». Le bloc
d'un Joueur qui n'a aucune relation à voir n'apparaît pas du tout. Le MJ voit le bloc de chaque
section, même vide. En mode Joueur, le MJ voit le bloc comme un Joueur qui n'est l'auteur d'aucune
section (AD-39), sans « Relier » ni « Retirer ».

*Le MJ relie.* « Relier à une fiche » ouvre un formulaire sous la liste :
1. « Type de relation » (texte libre, 1 à 80 caractères, par exemple « membre de ») ;
2. « Type de fiche » (Personnage, Lieu, Faction, Objet, Événement, Quête ; Personnage par défaut) ;
3. un champ « Chercher dans les factions » et la liste des fiches de ce type, cent à la fois avec
   « Charger la suite » : c'est la liste et la recherche de E-8, pas une autre ;
4. choisir une fiche (une seule), puis « Relier » ; « Annuler » ferme sans rien écrire.

*Le sélecteur de fiche* (étape 3) est la liste et la recherche de E-8 telles quelles : la recherche part à « Chercher » ou à Entrée, avec les mêmes états et les mêmes textes (« Recherche… », « Impossible de lancer la recherche. » et « Réessayer », « Aucun résultat pour « lames » dans les factions. », bandeau de connexion perdue avec « Chercher » et « Relier » désactivés, « Charger la suite » au-delà de 100) ; à l'ouverture du formulaire la liste du type se charge (« Chargement des fiches… », ou « Impossible de charger les fiches. » et « Réessayer ») et « Chercher » reste actif (hors connexion perdue) ; « Relier » reste désactivé tant qu'aucune fiche n'est choisie, pendant le chargement et sur erreur ; « Effacer la recherche » rend la liste du type ; le choix se voit (puce pleine) et disparaît si l'on change le type de fiche ou la recherche.

Le formulaire n'est pas gardé en cas de session expirée. Une fiche se relie à toute fiche de son
univers, **sauf à elle-même**. Une section porte au plus 100 relations ; deux relations de même
type vers la même fiche ne coexistent pas. « Retirer » sur une ligne supprime la relation sans
confirmation (elle se refait en trois gestes) ; retirer une section retire ses relations avec elle.

Textes : bloc sans relation (MJ) : « Aucune relation pour l'instant. » ; erreurs sous les champs :
« Erreur : le type de relation est obligatoire. », « Erreur : 80 caractères au plus. », « Erreur :
choisissez une fiche. » ; refus du service, au-dessus du formulaire : « Cette relation existe
déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. » ;
liste de choix vide : « Aucune faction à relier. » (autres types : « Aucun personnage… ») ;
chaque bouton « Retirer » porte l'étiquette accessible « Retirer la relation membre de → Lames Grises ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucune relation pour l'instant. » et « Relier à une fiche » ; Joueur : le bloc n'est pas là | MJ : relier |
| chargement | « Chargement des relations… » dans le bloc seul ; le reste de la fiche reste affiché | — |
| erreur | « Impossible de charger les relations. » dans le bloc seul, les autres sections intactes ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », saisie conservée | « Réessayer » |
| connexion perdue | le bandeau ; « Relier », « Retirer » désactivés ; la liste affichée reste | suivre un lien |
| refus | le bloc d'une section illisible n'existe pas (la section est absente, B-9) ; une relation vers une fiche illisible est absente ; « Relier » et « Retirer » n'existent pas pour un Joueur ni en mode Joueur | — |
| contenu long | 100 relations : la liste défile avec la section ; un type de 80 caractères et un titre de fiche de 120 passent à la ligne | idem |

*Critères.*
- Étant donné Antor, MJ, qui a relié la section « Apparence » de « Maître Aldric » à la faction
  « Lames Grises » (« membre de ») et à la faction « Cercle des Cendres » dont aucune section n'est
  lue des joueurs, quand Léa ouvre « Maître Aldric », alors elle voit « membre de → Lames Grises »,
  et rien d'autre dans le bloc : ni « Cercle des Cendres », ni compteur, ni ligne vide.
- Étant donné la même fiche, quand Antor passe en mode Joueur, alors il voit la même chose que Léa
  et ni « Relier » ni « Retirer ».
- Étant donné Léa, quand « Lames Grises » n'a plus de section lue des joueurs, alors la relation
  disparaît de la fiche d'Aldric sans autre trace.
- Étant donné Antor sur « Maître Aldric », quand il relie « Apparence » à « Maître Aldric », alors il
  voit « Une fiche ne se relie pas à elle-même. » et rien n'est écrit.
- Étant donné Antor, quand il retire la section « Apparence », alors ses relations disparaissent
  avec elle et ne remontent nulle part.

### Clôture de `kanevas-relier-chercher`

B-10 → bloc Relations de E-9 ; B-11 → recherche de E-8 ; B-29 → six états de la recherche et du
bloc ci-dessus. Atteints par P-3 étape 4 (relier le PNJ à sa faction : relier une section du PNJ, bloc de E-9) et P-6 étape 2
(chercher « Aldric », E-8). Les deux rôles ont leur colonne : le MJ cherche et relie, le Joueur
cherche et lit ce qu'il peut ; l'admin d'instance n'atteint ni l'un ni l'autre (« Page
introuvable. »). Chemin d'échec propre à cette tranche (`docs/parcours.md` n'en porte pas pour P-3 et P-6) : une recherche sans résultat dit « Aucun résultat pour … »,
jamais « caché ». Chemin d'échec de relier une section : le refus du service s'écrit au-dessus du formulaire (« Cette relation existe déjà. », « Une fiche ne se relie pas à elle-même. », « Cette section porte déjà 100 relations. »), la saisie et le choix sont conservés ; un échec d'écriture générique et une session expirée suivent les textes communs (« L'action n'a pas abouti. Réessayez. » ; connexion, formulaire non gardé).

## Détail des écrans de `kanevas-assistant-membre`

> *`kanevas-scenarios-suivi`: the tools `creer_campagne`, `creer_scenario` and `lister_campagnes` are gone; the GM now creates sheets, including adventures, through `creer_fiche` (AD-126); players have no creation tool. To find an adventure it searches, with the type « Aventure ».*

> E-12 Assistant, et son ajout au shell d'un univers. Mêmes six états et mêmes textes communs que
> `kanevas-premiere-fiche` (chargement, connexion perdue, session expirée) ; ne sont redits que les
> textes propres. Maquette `docs/maquettes/e12-assistant.html` (d'avant la charte : contenu et états seulement) (thème sombre ; MJ, Joueur,
> et les états). Composant : `docs/charte.md` « Panneau d'assistant ».

**Ajout au shell.** Un bouton flottant « Demander à Kanevas », en bas à droite, sur **tout écran
d'un univers** pour un membre (MJ ou Joueur) ; il n'existe ni hors d'un univers, ni pour un compte
sans rôle dans l'univers (l'admin d'instance sans rôle, Teo avant son ajout) : l'écran n'a alors pas
de bouton, et l'assistant n'a pas de page à lui (l'adresse `/univers/:id/assistant` répond « Page introuvable. ») et sa route d'API répond 404 (AD-75). Il se monte par un seul fichier, sans
modifier un composant existant du shell. Bascule « mode Joueur » d'une fiche : sans effet sur
l'assistant, qui garde le catalogue du rôle réel (AD-74) ; le panneau le dit par sa pastille.

### E-12 Assistant

Un panneau à droite (380 px, sur ordinateur) qui s'ouvre au bouton et se ferme par « Fermer » ou
Échap ; le contenu de l'écran dessous reste lisible et utilisable. Sur téléphone (moins de 760 px)
il prend tout l'écran, et Échap ou « Fermer » rend le focus au bouton flottant. Dedans, de haut en
bas :

- **l'en-tête** : « Kanevas — assistant », la pastille du catalogue (« MJ » ou « Joueur », mot et
  teinte), « Nouvelle conversation », « Fermer » ;
- **le fil** : les messages de la personne et les réponses de l'assistant, en texte brut (le fil le reste après `kanevas-import`),
  du plus ancien au plus récent ; le fil défile et reste calé sur le dernier message ;
- **sous une réponse, les écritures** : un bloc « Écrit par l'assistant » par événement (AD-76), le
  libellé (« Section « Notes de la table » complétée ») et un lien « Ouvrir » vers E-9 (la fiche).
  Available writes: « Section « Notes de la table » complétée » (`ajouter_a_section`),
  « Section « Vérité » modifiée » (`modifier_section`) ;
- **la saisie** : le champ, étiqueté « Demander à Kanevas » par une étiquette visible au-dessus de lui (son texte d'aide est « Votre question »), dans tous les états où il est affiché, et « Envoyer » (Entrée
  envoie, Maj+Entrée va à la ligne).

Le **fil vit dans le navigateur**, dans un magasin du module `frontend/src/ecrans/assistant/fil.ts`, hors du routeur et du stockage du navigateur (AD-28) : il survit à un
changement d'écran et à la fermeture du panneau ; il disparaît au rechargement de la page, au
changement d'univers et à la déconnexion ; « Nouvelle conversation » le vide. Il n'est écrit
nulle part (ni stockage du navigateur, ni serveur). Le client envoie le message et les 20 derniers
messages du fil (AD-75).

**Ce que chaque rôle y voit.** Le Joueur : chercher, lire une fiche, lire une section, modifier une
section, ajouter un paragraphe à une section. The GM: the same, plus creating sheets (`creer_fiche`, AD-126), proposing updates and generating an image (`kanevas-images`). A player asking to generate an image or create a sheet lacks the tool:
l'assistant répond qu'il ne peut pas, sans événement et sans rien créer (le texte est celui du
modèle, il n'est pas fixé ; ce qu'on vérifie est l'absence d'écriture). Dans les deux cas
l'assistant ne lit et n'écrit que ce que la personne lit et écrit : une section fermée est
« Introuvable. », une section lisible mais non écrite « Vous ne pouvez pas modifier cette
section. » (AD-74). Cette tranche **ne donne aucun outil sur les cartes ni les graphes** (écarté, AD-74). Elle **ne dessine pas** la proposition de mise à jour (`kanevas-monde`) ; l'image est le bloc de
`kanevas-images`, décrit plus bas : l'un et l'autre s'inscrivent au registre de blocs.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide (fil sans message) | « Demandez-moi de chercher, de résumer ou d'écrire dans ce que vous pouvez lire et écrire. Exemple : « Que sait-on d'Aldric ? » » | écrire ; fermer ; « Nouvelle conversation » (sans effet sur un fil vide) |
| chargement (disponibilité) | le bouton est présent ; dans le panneau, « Chargement… » à la place du champ et de « Envoyer » (absents, pas désactivés) ; aucun « Réessayer » tant que l'appel n'a pas répondu | fermer ; nouvelle conversation |
| disponibilité en échec (serveur muet, erreur) | « Je n'ai pas pu répondre — réessayer » avec un bouton « Réessayer » qui relit la disponibilité ; le champ et « Envoyer » sont présents mais désactivés (`aria-disabled`) | réessayer ; fermer ; nouvelle conversation |
| réponse en cours | le message envoyé apparaît ; « Kanevas réfléchit… » (`role="status"`) ; « Envoyer » affiche « … » et est désactivé ; le champ reste lisible ; pour un MJ seulement, au bout de 20 secondes d'attente **quelle que soit la demande** (le client ne sait pas ce que fait l'assistant), « Kanevas travaille toujours… Une image peut prendre jusqu'à trois minutes. » (`kanevas-images`) ; le Joueur garde « Kanevas réfléchit… » | fermer (la réponse arrive dans le fil) ; « Nouvelle conversation » est désactivée tant que la réponse n'est pas arrivée |
| erreur | « Je n'ai pas pu répondre — réessayer » (`role="alert"`), sans événement, pour toutes les causes (délai de 120 s, erreur de transport) : la personne ne les distingue pas ; demande déjà en cours (429) : « Une demande est déjà en cours. Patientez. » ; la saisie n'est jamais perdue : à l'envoi le champ se vide, la question reste dans le fil, une seule fois ; « Réessayer » (offert pour toutes les erreurs, le 429 compris) la renvoie telle quelle : le message d'erreur disparaît, « Kanevas réfléchit… » prend sa place, et la question n'est pas affichée une seconde fois ; une demande avec image dure 270 secondes au plus (AD-90) : au-delà, le même texte | « Réessayer » renvoie la même question ; saisir autre chose ; fermer ; nouvelle conversation |
| indisponible (sans jeton, hors bouchon, AD-77) | « L'assistant n'est pas disponible pour le moment. » ; champ et « Envoyer » désactivés (`aria-disabled`) | lire le fil ; fermer ; nouvelle conversation |
| connexion perdue | le bandeau commun ; le fil reste lisible ; champ et « Envoyer » désactivés. Perdue pendant « Kanevas réfléchit… » : la réponse est perdue, l'état passe à l'erreur ci-dessus avec « Réessayer » (désactivé tant que la connexion n'est pas revenue) ; au retour de la connexion, le bandeau disparaît et le champ est réactivé | lire, ouvrir les liens ; fermer ; nouvelle conversation |
| refus | le compte sans rôle n'a pas le bouton (rien à décrire ici) ; un refus d'outil est une réponse de l'assistant, pas un écran d'erreur — « Introuvable. », « Vous ne pouvez pas modifier cette section. », « La section a changé depuis que vous l'avez lue. Relisez-la. » —, sans événement ; la réponse commence par ce texte, la suite est du texte libre du modèle ; session expirée : la personne est menée à la connexion, le fil est perdu | refus d'outil : le fil reste, on écrit à nouveau ; fermer ; nouvelle conversation |
| contenu long | message de plus de 2 000 caractères : « Erreur : 2 000 caractères au plus. » sous le champ, « Envoyer » désactivé ; fil de plus de 20 messages : la note « Seuls les 20 derniers messages sont transmis à l'assistant. » ; réponse longue : passe à la ligne, le fil défile ; titre de 120 caractères dans un libellé : passe à la ligne | écrire (après avoir raccourci le message) ; fermer ; nouvelle conversation |

*Critère.* Étant donné Léa Joueuse de « Lame d'Ébène », quand elle demande « Que sait-on d'Aldric ? »,
alors le fil donne « Apparence » et rien de « Vérité » ; quand elle demande de lire « Vérité », le fil
dit « Introuvable. » ; Antor, lui, obtient les deux sections.

### Clôture de `kanevas-assistant-membre`

B-26 → E-12 (toutes ses lignes) ; B-27 → E-12 (campaign or scenario creation: `creer_fiche`, AD-126 ; proposer et
générer restent à `kanevas-monde` et `kanevas-images`). Parcours : P-3 étape 5 (« rappelle-moi tout
ce qu'on sait d'Aldric », première moitié), P-6 étape 4, P-7 étape 2. Rôles : MJ et Joueur ont
E-12, l'admin d'instance sans rôle ne l'a pas. Aucune migration, aucune entité : le fil n'est pas
stocké. Reste aux autres tranches : les propositions de mise à jour (`kanevas-monde`), les images
(`kanevas-images`).
B-24 → le bloc Pièces jointes de E-9 (ajouter en un geste, voir une image, télécharger un autre
fichier, retirer; its visibility follows where it was added, see the amendment below). Atteint par P-3 étape 4 (le plan d'un lieu) et P-7 étape 2 (le
portrait de son personnage). Le bloc livre ses six états (B-29), ci-dessus.

## Détail des écrans de `kanevas-images`

> Un seul ajout, aucun écran neuf : le **bloc « Image attachée »** de E-12 (le panneau de
> l'assistant). Mêmes textes communs et mêmes six états que « Détail des écrans de
> `kanevas-premiere-fiche` » et « Détail des écrans de `kanevas-assistant-membre` ». Maquette :
> `e12-assistant.html` (bloc Image attachée, échec de génération).

**Ce que l'assistant fait de plus.** Le catalogue du **MJ** reçoit un outil, `generer_image` (AD-89) ;
celui du Joueur n'en reçoit pas. Le MJ demande « Fais un portrait pour Apparence d'Aldric » : l'assistant
décrit l'image, la fait générer, l'attache à la section (comme si le MJ l'avait ajoutée par « Joindre un fichier » de E-9, AD-117 §6)
et le dit. Une demande n'attache **qu'une** image ; l'image est un fichier de la médiathèque (E-19),
joint à la section, avec la visibilité que donne l'endroit d'ajout (« Visible des joueurs » si les joueurs lisent la section,
« Réservé au MJ » sinon, B-24, AD-111), que le MJ peut réserver, retirer ou remplacer depuis E-9 ou E-19. Un Joueur qui demande une image n'a pas l'outil : l'assistant répond
qu'il ne peut pas, sans événement et sans rien attacher (le texte est celui du modèle ; on vérifie
l'absence d'écriture). Sans moteur d'images disponible (ni bouchon, ni Codex), l'outil n'est pas dans
le catalogue du MJ non plus, et l'assistant le dit de même.

### Bloc « Image attachée » (E-12)

Sous la réponse, comme les autres écritures (AD-76), un événement `image_attachee` : un bloc « Écrit par
l'assistant » dont le libellé est « Image attachée à la section « Apparence » de « Maître Aldric » »,
**la vignette de l'image** (au plus 240 px de large, rapport conservé, texte alternatif : la
description demandée) et un lien « Ouvrir la section » vers E-9, à la section. La vignette est lue par la
route authentifiée des fichiers (AD-67, AD-111) : aucune adresse publique.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | sans objet : le bloc n'existe que si une image a été attachée | — |
| chargement | la vignette est un cadre gris « Chargement de l'image… » (`role="status"`) ; le libellé et le lien sont déjà là | « Ouvrir la section » |
| erreur | image retirée depuis, ou illisible : le cadre dit « Image indisponible. » avec « Recharger l'image » ; le libellé et le lien restent | « Recharger l'image » (rend la même réponse si l'image est retirée) ; « Ouvrir la section » |
| connexion perdue | le bandeau commun ; une vignette déjà chargée reste ; sinon « Image indisponible. » avec « Recharger l'image » (désactivé tant que la connexion n'est pas revenue) | lire, ouvrir |
| refus | rôle ou droit retiré après coup : la lecture de la vignette et le lien répondent « Page introuvable. » comme toute section illisible (le cadre dit « Image indisponible. », sans « Recharger l'image » utile) ; sinon sans objet, l'événement n'existe que pour un MJ qui vient d'écrire dans cette section | — |
| contenu long | un titre de fiche de 120 caractères et un titre de section de 80 passent à la ligne dans le libellé ; une image très haute est contenue dans 240 px de large et 320 px de haut | idem |

**Pendant la génération.** L'assistant ne répond qu'à la fin (AD-75) : « Kanevas réfléchit… » reste
affiché ; au bout de 20 secondes, **pour un MJ seulement** (pastille « MJ » ; le Joueur n'a pas l'outil et garde « Kanevas réfléchit… »), il devient « Kanevas travaille toujours… Une image peut prendre
jusqu'à trois minutes. » (`role="status"`). Le client n'abandonne pas la requête avant 300 secondes.
Fermer le panneau ne l'arrête pas ; recharger la page ou quitter l'univers l'abandonne : rien n'est alors
attaché.

**Les échecs, dits par l'assistant** (réponse sans événement, rien n'est attaché) : génération en
échec ou trop longue — « Je n'ai pas pu générer l'image. » ; section pleine (100 fichiers joints) — « Cette section
porte déjà 100 fichiers joints. » ; droit d'écrire retiré entre-temps — « Vous ne pouvez pas modifier cette
section. » ; seconde image dans la même demande — « Une seule image par demande. » ; description de plus de 500 caractères — « La description est limitée à 500 caractères. » (l'assistant en propose une plus courte) ; aucun moteur d'images — l'assistant répond qu'il ne peut pas générer d'image (l'outil est absent). Dans le bouchon, une
demande dont la description contient « échec » donne le premier cas.

*Critères.*
- Étant donné Antor, MJ, et « Apparence » de « Maître Aldric », quand il demande « Fais un portrait pour
  « Apparence » d'« Maître Aldric » », alors le fil montre « Image attachée à la section « Apparence » de
  « Maître Aldric » » avec la vignette et « Ouvrir la section », et la section d'Aldric, ouverte sur E-9,
  porte un fichier joint image de plus, qui figure aussi dans E-19.
- Étant donné Léa, Joueuse, quand elle fait la même demande, alors l'assistant répond qu'il ne peut pas
  et la section ne gagne aucun fichier joint.
- Étant donné Antor, en bouchon, quand sa demande contient « échec », alors le fil dit « Je n'ai pas pu
  générer l'image. », sans bloc « Image attachée », et la section n'a pas de fichier de plus.
- Étant donné Antor et une section qui porte déjà 100 fichiers joints, quand il demande une image, alors
  l'assistant dit « Cette section porte déjà 100 fichiers joints. » et rien n'est attaché.
- Étant donné une image attachée puis retirée de E-9, quand Antor ferme puis rouvre le panneau (le fil
  survit, AD-28, et la vignette est relue à la réouverture), alors le cadre dit « Image indisponible. » avec « Recharger l'image », et « Ouvrir la
  section » mène toujours à E-9 ; « Recharger l'image » relit la vignette et, l'image étant toujours
  retirée, rend le même texte.
- Étant donné une image attachée, quand sa vignette charge, alors le cadre gris « Chargement de l'image… »
  précède l'image ; et quand la connexion est perdue avant la lecture, alors le bandeau commun s'affiche et
  le cadre dit « Image indisponible. » avec « Recharger l'image » désactivé jusqu'au retour de la connexion.
- Étant donné Léa, Joueuse, quand l'assistant tarde plus de 20 secondes, alors elle voit toujours « Kanevas
  réfléchit… » et jamais le texte sur l'image ; Antor, MJ, le voit dès 20 secondes, même pour une demande qui
  n'a rien à voir avec une image.
- Étant donné une demande d'image qui dure plus de 20 secondes, alors le panneau affiche « Kanevas
  travaille toujours… Une image peut prendre jusqu'à trois minutes. » ; et si la demande passe 270 secondes,
  « Je n'ai pas pu répondre — réessayer ».
- Étant donné un titre de fiche de 120 caractères et un titre de section de 80, alors le libellé passe à la
  ligne et la vignette, même d'une image très haute, reste dans ses bornes (240 px de large, 320 px de haut).
- Étant donné une vignette déjà chargée, quand la connexion est perdue, alors elle reste affichée ; et quand
  le rôle d'Antor dans l'univers est retiré, alors la lecture de la vignette répond « Page introuvable. » et le
  cadre dit « Image indisponible. ».
- Étant donné une instance sans moteur d'images, quand Antor demande un portrait, alors l'assistant
  répond qu'il ne peut pas générer d'image, sans événement et sans fichier joint.

### Clôture de `kanevas-images`

B-25 → le bloc ci-dessus (générer, attacher en un geste, un échec n'attache rien) ; B-27 (générer) →
l'outil `generer_image` du catalogue MJ ; P-3 étape 5 → E-12 et E-9 ; B-29 → les six états du bloc. Le
bloc est atteint par P-3 (étape 5). Les rôles : le MJ a l'outil, le Joueur non ; l'admin d'instance sans
rôle n'a pas E-12. Écart au cadrage : aucun.
## Détail de `kanevas-refonte-visuelle`

La refonte ne change ni les droits, ni les données, ni les textes d'un écran : elle change la
forme, et les gestes ci-dessous, que le testeur vérifie. La direction, les tokens et les
composants sont dans `docs/charte.md`. E-1, E-3, E-4, E-8, E-9 et E-14 ont leur maquette finie (E-6 and E-7 are retired, their mockups kept: see the opening note) (celle de E-15, `e15-systeme-de-jeu.html`, l'est hors du cadre d'un univers) ; E-2
et E-13 se refont dans le même cadre et avec les mêmes composants, sans
maquette finie : leurs maquettes actuelles, faites avant la charte, valent pour le contenu et
le vocabulaire, pas pour la forme (barre, compte, couleurs).

**Partout.** Le cadre de E-9 sur tous les écrans d'un univers ; chaque entrée de navigation et
chaque action a son icône ; le compte est derrière l'avatar (§ Barre latérale). Une action
réussie est confirmée par un **toast** qui part seul après 4 s ou à « Fermer », et ne prend
jamais le focus ; un échec n'est pas un toast : il reste un message en ligne, comme aujourd'hui.
Textes des toasts : « « <section> » enregistrée », « Audience de « <section> » enregistrée »,
« Section « <titre> » ajoutée — fermée aux joueurs », « Section « <titre> » retirée »,
« « <section> » reliée à « <fiche> » », « « <fichier> » est secrète » / « Le secret de
« <fichier> » est levé »,
« « <section> » montée d'un cran » / « descendue d'un cran », « « <fichier> » ajouté » /
« retiré », « Envoi de « <fichier> » annulé », « Relation vers « <fiche> » retirée » ; sur les
autres écrans, le même gabarit (« « <objet> » <participe> ») ; un message de réussite qu'un écran
affiche aujourd'hui en ligne devient le texte de son toast (E-14 : « Enregistré. »).

**E-9 Fiche**, pour le MJ :

- les sections ne sont plus des panneaux : titre, texte, puis ses blocs, en colonne de lecture ;
- la **pastille d'audience**, juste après le titre de la section, dit qui la voit — « Lue des
  joueurs » si les joueurs la lisent (« Écrite par les joueurs » s'ils l'écrivent aussi) ; sinon
  « Confiée à <auteur> » si un auteur la lit ou l'écrit ; sinon « MJ seul » — et ouvre le
  réglage d'audience, titré « Qui voit « <section> » » (les cinq réglages, en interrupteurs et
  une liste, et « Chaque changement est enregistré aussitôt. ») ;
- un **filet** dans la marge redit la pastille : vert plein pour une section lue ou écrite par
  les joueurs, pointillé pour une section confiée ; une section « MJ seul » est hachurée d'ambre ;
- « Modifier » paraît au survol et au focus de la section, et toujours sur un écran sans survol
  (téléphone, tablette : `hover: none`) ;
  « Monter », « Descendre » et « Retirer la section » sont dans son menu « ⋯ » ;
- en édition : sous le champ, le compteur « n / 100 000 » et l'aide « Échap annuler · Ctrl ↵
  enregistrer » ; Échap fait ce que fait « Annuler » (le texte saisi est abandonné, comme
  aujourd'hui) ; Ctrl+Entrée (⌘+Entrée sur Mac) fait exactement ce que fait « Enregistrer » :
  il envoie, et une écriture périmée reçoit « La section a changé depuis que vous l'avez
  ouverte… » ; au-delà de 100 000 caractères ou connexion perdue, il ne part pas, comme le bouton ;
- la bascule en tête s'appelle « Mode MJ » et « Mode Joueur » (« MJ » et « Joueur » au
  téléphone) ; en mode Joueur, un bandeau sous la barre haute : « Mode Joueur : vous voyez ce
  que voit un joueur. »

**Un Joueur, et le MJ en mode Joueur**, ne voient aucune pastille d'audience, ni filet, ni
hachure, ni menu « ⋯ » : la section n'a que son titre, son texte et ses blocs.

| Ligne de la matrice | MJ | Joueur | MJ en mode Joueur |
|---|---|---|---|
| menu du compte (thème, déconnexion) — et pour l'admin d'instance, hors univers | oui | oui | oui |
| bascule « Mode MJ » / « Mode Joueur » et bandeau du mode Joueur | oui | caché | oui |
| « Modifier » d'une section | oui | sur ce qu'il écrit | sur ce que les joueurs écrivent |
| bouton « Demander à Kanevas » | oui | oui | oui |
| pastille et réglage d'audience | lire, régler | caché | caché |
| filet et hachure | voir | caché | caché |
| menu « ⋯ » (ordre, retrait) | oui | caché | caché |
| tiroir au téléphone | oui | oui | oui |

**États des composants du cadre.**

| Composant | Ce qui peut arriver | Ce qu'on voit |
|---|---|---|
| menu du compte | connexion perdue | il s'ouvre ; le thème change (il est local) ; « Se déconnecter » reste actif |
| menu du compte | `/api/moi` en échec | l'identifiant manque ; le thème et « Se déconnecter » restent |
| identifiant, nom d'auteur, fil d'Ariane | trop longs | coupés par « … », le texte entier en infobulle ; le fil garde son dernier maillon entier |
| réglage d'audience | échec d'un changement | l'interrupteur revient à sa valeur, « L'action n'a pas abouti. Réessayez. » sous le réglage ; pas de toast |
| réglage d'audience | connexion perdue | interrupteurs et liste désactivés, le réglage se lit |
| tiroir | ouvert au téléphone | la barre par-dessus la page, voile derrière ; Échap, le voile ou une entrée le ferment |
| toast | plusieurs actions de suite | ils s'empilent, le plus récent en bas, trois au plus |
| bandeau de connexion perdue | la connexion tombe | sous la barre haute, sur tout écran, comme aujourd'hui, au-dessus du bandeau du mode Joueur s'il y est ; il part quand elle revient |

*Critères.*
- Étant donné Antor, MJ, sur « Maître Aldric », quand il ouvre la pastille « Lue des joueurs »
  d'« Apparence » et coupe « Les joueurs la lisent », alors la pastille dit « MJ seul », la section
  se hachure d'ambre, et un toast dit « Audience de « Apparence » enregistrée ».
- Étant donné Antor, quand il passe en mode Joueur, alors il voit le bandeau du mode Joueur et
  ne voit ni pastille, ni filet, ni menu « ⋯ ».
- Étant donné Antor sur n'importe quel écran d'un univers, quand il ouvre le menu de son avatar,
  alors il y trouve le thème (Clair, Sombre, Système, en icônes) et « Se déconnecter », et la
  barre latérale ne les porte plus.

**Clôture.** Aucun besoin ni parcours nouveau ; B-29 (les six états) est tenu par les tableaux
ci-dessus et ceux de chaque écran ; le menu du compte, le tiroir et le bandeau sont
du cadre, atteints par toute étape de tout parcours sur un écran d'univers ; la bascule et son
bandeau sont P-3 (le MJ vérifie ce que voit la table) ; la pastille
d'audience porte le geste de P-3 étape 4 (« Apparence » lue des joueurs, « Vérité — MJ seul »),
déjà sur E-9 ; chaque rôle a sa colonne
dans la matrice ci-dessus.

## Détail des écrans de `kanevas-illustrations` (illustrations ; systèmes de jeu hors des univers)

> *Amendé par `kanevas-import` (AD-111, AD-93 amendée, décisions de Monsieur du 2026-10-11) : l'illustration est un fichier image de la médiathèque, référencé par la fiche ; elle se voit si la fiche **et** le fichier sont lisibles — « jamais secrète » tombe ; un joueur qui voit la fiche lit « Image réservée au MJ. » en en-tête et la vignette de repli dans E-8 quand l'illustration est réservée au MJ ; elle se pose par les deux chemins d'ajout de E-9. La matrice « Qui voit quoi » ci-dessous vaut avec cette double garde.*

> Décision de Monsieur (2026-10-06) : « La liste des fiches doit être présentée avec une vignette
> d'illustration, pas juste une liste » ; « chaque fiche doit avoir une propriété possible qui est
> son image d'illustration ». Deux changements, aucun écran neuf : **E-8 devient une grille de
> cartes** et **l'en-tête de E-9 porte l'illustration**. Données : `docs/donnees.md` (migration
> `kanevas-illustrations`) ; décision : AD-93. Mêmes six états et mêmes textes communs que la
> première fiche (chargement, erreur, connexion perdue, refus « Page introuvable. », écriture en
> cours, échec d'une écriture), mêmes toasts que la refonte visuelle. Maquettes : `e08` (grille)
> et `e09` (en-tête). Le document prime sur la maquette.

**L'illustration, en une phrase par règle.** Une fiche a **zéro ou une** illustration, une image
PNG, JPEG, GIF ou WebP (reconnue à son contenu, pas à son nom). Elle se voit **partout où la
fiche et le fichier se voient** (amended: a GM-only image shows « Image réservée au MJ. » to players). **Le MJ seul** la pose, la remplace
ou la retire, en mode MJ, depuis l'en-tête de E-9. Ce n'est pas une pièce jointe : elle n'est
dans aucune section, et une image jointe à une section ne devient jamais l'illustration d'elle-même.

### E-8 — la grille de cartes

Les fiches du type, **dans le même ordre** (alphabétique sans casse) et avec la même règle de
lecture qu'avant, s'affichent en **grille de cartes**. Une carte est un lien vers E-9 :

- la **vignette**, cadre 4:3 aux coins `--rayon-champ`, l'image cadrée sans déformation
  (`object-fit: cover`, recentrée vers le haut : `object-position: 50% 30%`, pour garder un
  visage) ; l'image est décorative (`alt=""`) parce que le titre suit ;
- le **titre**, sur deux lignes au plus, coupé par « … » avec le titre entier en infobulle ;
- pour un personnage, la pastille **PJ** ou **PNJ** (celle de la liste d'avant) ; les autres types
  n'ont pas de pastille : la page entière est du type.

**Vignette de repli**, pour une fiche sans illustration — jamais un trou gris ni une image cassée :
un aplat `--surface-2` tramé de points (`--bord-fort`, un point tous les 12 px), l'**initiale** du
titre, article écarté (« Le Gué-aux-Saules » → « G »), en Fraunces 56 px (44 au téléphone) `--texte-3` au centre, et l'**icône du type** (Lucide, celle de la barre
latérale) dans une puce en haut à gauche. Le repli sert aussi quand l'image d'une fiche ne se charge
pas : la carte ne montre jamais d'erreur. Le tramage en points n'emprunte pas la hachure, réservée
au secret (la section « MJ seul »).

*Disposition.* Colonne de 1 120 px au plus (au lieu de 784 : une grille respire plus qu'un texte),
`repeat(auto-fill, minmax(176 px, 1fr))`, 24 px entre les cartes (16 px entre deux rangées sous
1 080 px). Au téléphone (moins de 760 px), **deux colonnes** (12 px entre elles, 16 px entre deux rangées),
titre 13 px, la pastille sous le titre. Les images
se chargent **à l'approche** (`loading="lazy"`) dans un cadre déjà à sa taille (la grille ne saute
pas). The illustration address includes its token (`/fichiers/<id>?v=<jeton>`, AD-93), so a replaced
image reloads while an unchanged image comes from the cache.

*Survol et focus.* La carte se soulève d'un plan (`--surface-2` derrière la carte, contour
`--bord-fort` autour de la vignette) ; au clavier, l'anneau de focus entoure la carte entière.
Pas d'ombre (la charte réserve la seule ombre à ce qui flotte).

*Recherche.* Conservée telle quelle au-dessus de la grille (champ, « Chercher », « Effacer la
recherche », adresse `?q=`) ; ses résultats sont des cartes, dans le même ordre.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucun personnage pour l'instant. » et « Nouveau personnage » ; Joueur : « Aucun personnage à voir pour l'instant. » (textes par type inchangés) ; recherche sans résultat : « Aucun résultat pour « Vérité » dans les personnages. » | MJ : créer ; « Effacer la recherche » |
| chargement | dix cartes squelettes (`--squelette`, cadre 4:3 et un trait ; deux rangées au bureau) et « Chargement des fiches… » (`role="status"`) ; une recherche : « Recherche… » ; une vignette pas encore chargée : son cadre en `--squelette`, à sa taille | — |
| erreur | « Impossible de charger les fiches. » ou « Impossible de lancer la recherche. » ; une image qui ne se charge pas : la vignette de repli, sans message | « Réessayer » |
| connexion perdue | le bandeau ; « Nouveau … », « Chercher » désactivés ; les cartes affichées et leurs images déjà chargées restent ; une image pas encore chargée : la vignette de repli | ouvrir une fiche |
| refus | type inconnu : « Page introuvable. » ; une fiche illisible est absente de la grille, et l'adresse de son illustration répond 404 comme une adresse inconnue | — |
| contenu long | titre de 120 caractères : deux lignes puis « … », infobulle ; plus de 100 fiches : « Charger la suite » sous la grille ; une image très haute ou très large : cadrée en 4:3 ; un GIF animé : il s'anime | idem |

### E-9 — l'illustration dans l'en-tête

L'en-tête de la fiche devient deux colonnes au bureau : à gauche l'**illustration**, cadre de
176 × 220 px (4:5, `--rayon-panneau`, contour `--bord`), l'image cadrée comme dans E-8 ; à droite,
alignés en bas, la pastille du type et le titre. Un clic sur l'illustration ouvre l'image entière
dans un nouvel onglet ; son texte alternatif est « Illustration de « Maître Aldric » ». **Sans
illustration, l'en-tête reste celui d'avant** (type puis titre, pleine largeur) : pas de vignette
de repli sur la fiche, le repli est un objet de la grille. Au téléphone, l'illustration (96 ×
120 px) reste à gauche de la pastille et du titre, pour que le texte de la fiche commence dans le
premier écran ; un titre long passe à la ligne à sa droite.

*Les gestes du MJ* (mode MJ seulement) :

- **Ajouter** — sur une fiche sans illustration, au-dessus de la pastille du type, un bouton
  fantôme « Ajouter une illustration » (`image-plus`) suivi de l'aide « Visible de tous ceux qui
  voient la fiche. » (12 px, `--texte-3`) ; ils paraissent au survol et au focus de l'en-tête, et
  toujours sur un écran sans survol (comme « Modifier »). Choisir le fichier suffit : l'envoi part
  aussitôt (un seul fichier ; le sélecteur propose `image/png, image/jpeg, image/gif, image/webp`,
  mais c'est le serveur qui juge).
- **Remplacer** et **Retirer** — sur une fiche illustrée, deux boutons-icônes posés en bas à droite
  de l'illustration, sur une puce `--surface` avec `--ombre-flottant` : « Remplacer l'illustration »
  (`image-up`) et « Retirer l'illustration » (`trash-2`, danger) ; ils paraissent au survol et au
  focus de l'illustration, toujours sans survol. L'aide « Visible de tous ceux qui voient la
  fiche. » est l'infobulle de « Remplacer » et se lit sous l'illustration pendant l'envoi.
  Remplacer garde l'ancienne image affichée jusqu'à ce que la nouvelle soit enregistrée.
- **Confirmer le retrait**, sur place, sous l'illustration : « Retirer l'illustration de « Maître
  Aldric » ? L'image sera perdue. » avec « Annuler » et « Retirer l'illustration » (danger). Retirer
  ne touche à aucune pièce jointe.

*Textes.* Envoi : dans le cadre (au téléphone, juste sous lui), une barre de 2 px `--accent` et « Envoi… 42 % » (`role="status"`)
avec « Annuler » ; envoi annulé : rien ne change, toast « Envoi de « portrait.png » annulé ».
Toasts de réussite : « Illustration de « Maître Aldric » ajoutée », « … remplacée », « … retirée ».
Échecs, en ligne sous l'en-tête (jamais en toast), avec « Ignorer » : envoi interrompu « « portrait.png » :
l'envoi n'a pas abouti. » (et « Réessayer ») ; fichier qui n'est pas une image (400
`pas_une_image`) « « plan.pdf » n'est pas une image. Choisissez un PNG, un JPEG, un GIF ou un
WebP. » ; fichier vide « « portrait.png » est vide. » ; retrait échoué « L'action n'a pas abouti.
Réessayez. » (la confirmation se ferme, l'image reste ; « Réessayer » relance le retrait, « Ignorer »
efface le message) ; droit perdu entre-temps (403, le compte n'est plus MJ) « Vous ne
pouvez plus modifier l'illustration de cette fiche. », puis la fiche se recharge et les gestes
disparaissent ; image qui ne se charge pas : le cadre `--surface-2` avec l'icône `image-off` et
« Image indisponible. » (le MJ garde « Remplacer » et « Retirer »).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | fiche sans illustration : l'en-tête d'avant ; MJ (mode MJ) : « Ajouter une illustration » et l'aide | MJ : ajouter |
| chargement | les squelettes de la fiche, avec un cadre 4:5 à gauche du titre ; une image pas encore chargée : son cadre en `--squelette` ; un envoi : « Envoi… 42 % » dans le cadre | annuler l'envoi |
| erreur | envoi interrompu, fichier qui n'est pas une image, fichier vide, retrait échoué : le message en ligne ci-dessus ; image illisible : « Image indisponible. » | « Réessayer », « Ignorer » |
| connexion perdue | le bandeau ; « Ajouter une illustration », « Remplacer », « Retirer » désactivés ; l'image déjà chargée reste ; un envoi en cours qui échoue devient l'erreur « l'envoi n'a pas abouti » | lire, ouvrir l'image |
| refus | MJ rétrogradé pendant le geste : « Vous ne pouvez plus modifier l'illustration de cette fiche. » ; fiche illisible : « Page introuvable. » (et son illustration répond 404) ; Joueur : les gestes sont absents, jamais grisés | recharger |
| contenu long | un fichier de plusieurs Go : la progression en pourcentage (pas de limite de taille, AD-7) ; une image très haute ou panoramique : cadrée en 4:5 ; un titre de 120 caractères : passe à la ligne à droite de l'illustration, au bureau comme au téléphone | idem |

### Qui voit quoi

| Ligne de la matrice | MJ | Joueur | MJ en mode Joueur | Admin d'instance (sans rôle) |
|---|---|---|---|---|
| vignette (ou repli) d'une fiche dans E-8 | toutes les fiches de l'univers | les fiches qu'il voit | sans objet : E-8 n'a pas de mode | — (« Page introuvable. ») |
| illustration dans l'en-tête de E-9 | oui | oui, sur une fiche qu'il voit | oui, si la fiche est visible des joueurs | — |
| ouvrir l'image entière | oui | oui | oui | — |
| « Ajouter une illustration » et l'aide | oui | **absent** | **absent** | — |
| « Remplacer », « Retirer » | oui | **absent** | **absent** | — |
| adresse de l'illustration d'une fiche qu'il ne voit pas | sans objet (il voit tout) | **404**, identique à une adresse inconnue | ses droits réels : il la lit | 404 |
| `PUT` / `DELETE` de l'illustration par l'API | oui | **403** sur une fiche qu'il voit, 404 sinon | oui (le mode ne change que l'écran) | 404 |

Un Joueur auteur ou rédacteur d'une section ne pose pas d'illustration : elle est au niveau de la
fiche, pas de la section.

### Critères

- Étant donné Léa, Joueuse, qui ne voit pas la fiche « Le Prieur masqué » (aucune section lue des
  joueurs) et à qui Antor a posé une illustration, quand elle demande l'illustration de cette
  fiche par son adresse, alors elle reçoit 404, de corps identique à celui d'un identifiant de fiche
  qui n'a jamais existé ; et la fiche n'est pas dans sa grille.
- Étant donné Antor, MJ, sur « Maître Aldric » sans illustration, en mode MJ, quand il survole
  l'en-tête, alors il voit « Ajouter une illustration » et « Visible de tous ceux qui voient la
  fiche. » ; quand il choisit « portrait-aldric.png », alors « Envoi… » paraît dans le cadre, puis
  l'illustration s'affiche à gauche du titre et un toast dit « Illustration de « Maître Aldric »
  ajoutée ».
- Étant donné Léa sur la grille des personnages, quand Antor a posé ce portrait, alors la carte
  « Maître Aldric » montre le portrait ; la carte « Bran Corvalis », sans illustration, montre la
  vignette de repli (« B » et l'icône des personnages), jamais un cadre vide.
- Étant donné Antor qui remplace le portrait d'Aldric, quand Léa revient sur la grille, alors elle
  voit le nouveau portrait, sans recharger la page de force (le jeton de l'adresse a changé).
- Étant donné Antor qui choisit « plan.pdf » (ou un fichier « image.png » qui contient du HTML),
  alors il voit « « plan.pdf » n'est pas une image. Choisissez un PNG, un JPEG, un GIF ou un WebP. »
  et l'illustration d'avant reste ; rien n'est écrit.
- Étant donné Antor qui retire l'illustration et confirme « Retirer l'illustration », alors l'en-tête
  redevient celui d'avant, la carte d'Aldric montre la vignette de repli, et l'ancienne adresse de
  l'image répond 404.
- Étant donné Léa sur une fiche qu'elle voit et qui porte une illustration, alors elle voit l'image
  et ni « Remplacer », ni « Retirer », ni « Ajouter une illustration » ; un `PUT` de sa part reçoit 403.
- Étant donné Antor en mode Joueur sur « Maître Aldric », alors il voit l'illustration et aucun de
  ses gestes.
- Étant donné Antor qui choisit un fichier vide « portrait.png », alors il voit « « portrait.png »
  est vide. » avec « Ignorer », l'illustration d'avant reste, et rien n'est écrit.
- Étant donné Antor qui confirme « Retirer l'illustration » quand le serveur échoue, alors la
  confirmation se ferme et il voit, sous l'en-tête, « L'action n'a pas abouti. Réessayez. » avec
  « Réessayer » (qui relance le retrait) et « Ignorer » ; l'illustration reste affichée, sur la fiche
  comme dans la grille.
- Étant donné une illustration dont l'image ne se charge pas, quand Antor (mode MJ) ouvre la fiche,
  alors le cadre dit « Image indisponible. » et il garde « Remplacer » et « Retirer » ; quand Léa
  ouvre la même fiche, alors elle voit le même cadre « Image indisponible. », sans aucun geste, et,
  sur la grille, la carte montre la vignette de repli.
- Étant donné un envoi en cours quand la connexion tombe, alors le bandeau paraît, les gestes de
  l'illustration sont désactivés et l'envoi devient « « portrait.png » : l'envoi n'a pas abouti. »
  avec « Réessayer » et « Ignorer ».
- Étant donné Antor rétrogradé Joueur par un autre MJ pendant qu'il envoie, alors il voit « Vous ne
  pouvez plus modifier l'illustration de cette fiche. » et les gestes disparaissent.
- Étant donné la grille au téléphone (390 px), alors elle a deux colonnes et aucun titre ne déborde.

### Systèmes de jeu, hors des univers

> Décision de Monsieur (2026-10-06) : le système de jeu devient **une dimension à part**, pas un
> sous-élément d'un univers. Aujourd'hui le fil d'Ariane dit « Lame d'Ébène › CoF Mini » parce que
> tout accès à un système passe par un univers (AD-83) ; désormais un système a sa propre adresse et
> sa place dans la barre réduite (AD-94). **Droits inchangés, aucune donnée nouvelle.** Maquettes :
> `e16-systemes-de-jeu.html` (nouvelle), `e15-systeme-de-jeu.html` (refaite hors univers),
> `e01-accueil.html` (l'entrée de la barre).

**Un écran de plus : E-16 Systèmes de jeu**, et non E-15 « en mode liste ». La liste a sa propre
adresse (`/systemes`), sa place dans la navigation, ses propres six états et un contenu que E-15
n'a pas (les univers du compte, par système) ; E-15 reste la page d'**un** système
(`/systemes/:sid`). Un écran par adresse, comme E-1 et E-3.

**Navigation.**
- Barre réduite (E-1, E-2, E-5, E-15, E-16) : « Mes univers » (`library`), **« Systèmes de jeu »**
  (`dices`), puis « Administration » pour un admin d'instance. Sur E-15 et E-16, « Systèmes de
  jeu » est l'item courant. Pas de bouton « Demander à Kanevas » : il n'existe que dans un univers.
- Depuis un univers : le menu du **sélecteur d'univers** porte, sous la liste des univers, « Mes
  univers » puis « Systèmes de jeu » (tous deux hors de l'univers). Le bloc « Système de jeu » de
  E-3 (« Ouvrir le système ») et le panneau de E-14 (« Ouvrir le système ») mènent à E-15 de ce
  système. Rien ne s'ajoute à la barre d'un univers : le système n'en est pas une partie.
- Fil d'Ariane : E-16 « Systèmes de jeu » ; E-15 « Systèmes de jeu › CoF Mini » (au téléphone,
  l'icône `dices` et le nom seul).
- L'ancienne adresse `/univers/:id/systeme` mène à `/systemes/:sid` si l'univers est rattaché et que
  le compte en est membre ; sinon « Page introuvable. ». Un lien gardé n'est donc pas cassé.

**Ce qu'on voit d'un système, et de qui.** Un compte voit un système **seulement s'il est rattaché à
un univers dont il est membre** ; il le **modifie s'il est MJ d'un de ces univers** (quel que soit
son rôle dans les autres). Il voit, par système, **ses** univers qui l'utilisent, avec son rôle dans
chacun, et le nombre total d'univers (« Utilisé par 2 univers ») — **jamais le nom d'un univers dont
il n'est pas membre** (AD-84). L'adresse d'un système qu'il ne voit pas répond « Page introuvable. »,
comme une adresse inconnue.

#### E-16 Systèmes de jeu

Titre « Systèmes de jeu », sous-titre « Les référentiels de vos univers. ». Une **grille de
cartes** (décision de Monsieur du 2026-10-06 : « des cartes plutôt qu'une liste se prête plus au
contexte »), de la famille des cartes de fiche de E-8 : colonne de 1 120 px au plus,
`repeat(auto-fill, minmax(288 px, 1fr))`, 24 px entre les cartes ; au téléphone, **une colonne**
(une carte porte trop de texte et de puces pour deux). Par nom (ordre alphabétique sans casse), sans
pagination (on ne voit que les systèmes de ses propres univers). **Toute la carte mène à E-15.**
Chaque carte (composant « Carte de système » de `docs/charte.md`) :

- un **en-tête dessiné** 2:1 (5:2 au téléphone), calculé par le frontend à partir du nom, toujours le
  même pour un nom donné et sans aucune donnée : un treillis triangulaire, un grand dé (d20, d8 ou
  d12) teinté d'encre avec un halo, un petit dé neutre, et le monogramme du système (« Cm » pour CoF
  Mini) en Fraunces ; jamais une image, jamais un rectangle vide ;
- si le compte n'est MJ d'aucun de ses univers : la pastille « Lecture seule » (`eye`) posée en haut à
  droite de l'en-tête ;
- le **nom** (Fraunces 18 px, deux lignes au plus, « … », infobulle) ;
- en `--texte-3` : « Utilisé par 2 univers », puis « 3 règles · 4 créatures · 2 objets » (« 1 règle »,
  « aucune créature »…) ;
- **ses univers** qui l'utilisent, en puces (sceau, nom, pastille du rôle) ; dans la carte, les
  puces ne sont pas des liens à part (la carte entière en est un) ; elles mènent à E-3 sur E-15.

Pas d'action d'écriture sur E-16 : un système se crée et se rattache depuis E-14 (P-8), qui reste le
seul chemin. Textes du vide : pour un compte MJ d'au moins un univers, « Aucun système de jeu pour
l'instant. » et « Un système se rattache depuis les paramètres d'un univers que vous menez. » avec le
lien « Mes univers » ; pour les autres, « Aucun système de jeu pour l'instant. » et « Les systèmes
de vos univers apparaîtront ici quand leur MJ en rattachera un. ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun système de jeu pour l'instant. » et le texte selon le compte (ci-dessus) | « Mes univers » |
| chargement | trois cartes squelettes (en-tête 2:1, nom, une ligne, une puce) et « Chargement des systèmes… » (`role="status"`) | — |
| erreur | « Impossible de charger les systèmes de jeu. » | « Réessayer » |
| connexion perdue | le bandeau ; la grille déjà chargée reste (E-16 n'écrit rien) | ouvrir un système |
| refus | sans objet : E-16 n'a pas de paramètre et ne montre que ce que le compte voit ; un système détaché de tous ses univers disparaît de la grille au prochain chargement | — |
| contenu long | un nom de 80 caractères : deux lignes, « … », infobulle ; un système utilisé par 12 de ses univers : les puces passent à la ligne et la carte s'allonge (les cartes d'une rangée gardent leur en-tête aligné) ; un nom d'univers de 80 caractères dans une puce : coupé à 24 caractères, infobulle | idem |

#### E-15 hors de l'univers

Le contenu de E-15 ne change pas (onglets Règles, Créatures, Objets ; entrées ouvertes sur place ;
ajouter, modifier pour le MJ ; textes et états de `kanevas-systemes`). Ce qui change :

- le **cadre** : barre réduite, « Systèmes de jeu » courant, fil « Systèmes de jeu › CoF Mini » ;
- sous le titre (`dices`, nom) : « Référentiel commun · utilisé par 2 univers », puis la ligne
  « Dans vos univers » et les puces de ses univers (comme sur E-16) ; si le compte ne le modifie pas,
  la pastille « Lecture seule » ;
- l'adresse `/systemes/:sid` ; l'onglet se garde dans l'adresse (`?type=creature`), Créatures par
  défaut ;
- le **refus** : système inconnu ou d'aucun univers du compte : « Page introuvable. » et un lien
  « Systèmes de jeu » ; droit retiré pendant une écriture (le compte n'est plus MJ d'aucun univers
  rattaché, ou l'univers est détaché) : « Vous ne pouvez plus modifier ce système. » et la page se
  recharge (en lecture seule, ou « Page introuvable. ») ;
- les toasts du gabarit commun : « « Garde du sceau » ajoutée », « « Loup des brumes »
  enregistré ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | un onglet sans entrée : « Aucune créature pour l'instant. » (MJ, avec « Ajouter une créature ») ; « Aucune créature à voir pour l'instant. » (lecture seule) ; « Aucune règle », « Aucun objet » de même | MJ : ajouter |
| chargement | squelettes du titre, du sous-titre, des puces, des onglets et de trois lignes ; « Chargement du système… » (`role="status"`) | — |
| erreur | « Impossible de charger ce système. » ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », saisie gardée ; écriture périmée : « Cette entrée a changé depuis que vous l'avez ouverte… » ; nom vide ou déjà pris : sous le champ | « Réessayer », « Recharger » |
| connexion perdue | le bandeau ; « Ajouter … », « Modifier », « Enregistrer » désactivés, le texte en cours reste ; les puces d'univers restent des liens | lire |
| refus | système inconnu, ou rattaché à aucun univers du compte (y compris par l'ancienne adresse) : « Page introuvable. » et le lien **« Systèmes de jeu »** (plus « Mes univers ») ; droit perdu pendant une écriture : « Vous ne pouvez plus modifier ce système. », puis la page se recharge en lecture seule ou en « Page introuvable. » ; un Joueur : « Ajouter … » et « Modifier » sont absents | « Systèmes de jeu » |
| contenu long | 100 entrées : « Charger la suite » ; nom d'entrée de 120 caractères tronqué par « … », infobulle ; contenu de 100 000 caractères en entier ; nom de système de 80 caractères : le titre passe à la ligne | idem |

*Le bloc « Dans vos univers »* (E-15 et chaque ligne de E-16) arrive avec le système : il n'a ni
chargement ni erreur à lui. Vide : sans objet — un système visible est toujours rattaché à au moins
un univers du compte. Connexion perdue : il reste affiché, ses liens mènent à E-3. Refus : un univers
dont le compte a été retiré disparaît des puces au chargement suivant (et le système entier, si
c'était le dernier). Contenu long : douze univers ou plus — les puces passent à la ligne sous le
libellé ; un nom d'univers de 80 caractères — coupé à 24 caractères par « … », nom entier en
infobulle et dans l'étiquette accessible de la puce.

#### E-3 et E-14 : ce que la retouche change

| Écran | Ce qui change | État touché |
|---|---|---|
| E-3, bloc « Système de jeu » | « Ouvrir le système » mène à `/systemes/:sid` (E-15 hors univers) ; le bloc lit le système dans `GET /api/univers/:id` (`systeme: {id, nom}`) | refus : si le système est devenu illisible entre-temps (un MJ a détaché l'univers), le clic mène à E-15 qui dit « Page introuvable. » avec « Systèmes de jeu » ; au retour sur E-3, le bloc a disparu (il n'existe pas sans système) |
| E-14, panneau « Système de jeu » | « Ouvrir le système » mène à `/systemes/:sid` ; la liste du catalogue se lit dans `GET /api/systemes/catalogue` | refus : de même, si un autre MJ a détaché l'univers pendant que la page était ouverte, E-15 dit « Page introuvable. » ; revenu sur E-14, le panneau dit « Cet univers n'est rattaché à aucun système de jeu. » ; erreur du catalogue : « Impossible de charger cette page. » comme avant |

#### Qui voit quoi (systèmes)

| Ligne de la matrice | MJ d'un univers rattaché | Joueur d'un univers rattaché (et MJ d'aucun) | Compte sans univers rattaché (Teo ; l'admin d'instance sans rôle) |
|---|---|---|---|
| « Systèmes de jeu » dans la barre réduite et le menu du sélecteur | oui | oui | oui (E-16 vide) |
| le système dans E-16 | oui, avec ses univers et son rôle | oui, « Lecture seule » | absent |
| E-15 : lire | oui | oui | « Page introuvable. » |
| E-15 : « Ajouter … », « Modifier » | oui | **absents** | — |
| noms des univers d'autres comptes | jamais | jamais | jamais |
| `GET /api/systemes/:sid` | 200 | 200 | **404**, corps identique à un identifiant inconnu |
| `POST`/`PUT` d'une entrée | 201 / 200 | **403** | **404** |

#### Critères (systèmes)

- Étant donné Mira, MJ des « Landes grises » rattachées à « CoF Mini », que partage « Lame d'Ébène »
  d'Antor, quand elle ouvre « Systèmes de jeu », alors elle voit « CoF Mini », « Utilisé par 2
  univers » et la seule puce « Les Landes grises · MJ » ; « Lame d'Ébène » n'apparaît nulle part,
  ni sur E-16 ni sur E-15.
- Étant donné Antor, quand il ouvre « CoF Mini » depuis E-16, alors le fil d'Ariane dit « Systèmes de
  jeu › CoF Mini », la barre est la barre réduite et « Systèmes de jeu » y est l'item courant.
- Étant donné Antor sur la vue d'ensemble de Lame d'Ébène, quand il clique « Ouvrir le système »,
  alors il arrive sur la même page E-15, hors de l'univers ; et le menu du sélecteur d'univers lui
  propose « Systèmes de jeu ».
- Étant donné Léa, Joueuse de Lame d'Ébène, quand elle ouvre « Systèmes de jeu », alors elle voit
  « CoF Mini » avec « Lame d'Ébène · Joueur » et « Lecture seule » ; sur E-15, ni « Ajouter une
  créature » ni « Modifier » ; un `POST` d'entrée de sa part reçoit 403.
- Étant donné Antor, MJ de Lame d'Ébène (« CoF Mini ») et Joueur des Cendres de Vaëlis
  (« Chroniques Oubliées Fantasy »), alors E-16 montre les deux systèmes, « Lecture seule » sur le
  second seulement.
- Étant donné Teo, membre d'aucun univers rattaché, quand il ouvre l'adresse de « CoF Mini », alors
  il voit « Page introuvable. » ; par l'API, `GET /api/systemes/<CoF Mini>` lui répond 404 avec le
  même corps que `GET /api/systemes/999999` ; sa liste E-16 dit « Aucun système de jeu pour
  l'instant. ».
- Étant donné un lien gardé vers `/univers/<Lame d'Ébène>/systeme`, quand Antor l'ouvre, alors il
  arrive sur `/systemes/<CoF Mini>`.
- Étant donné Antor qui détache Lame d'Ébène de « CoF Mini » (E-14), quand Léa recharge E-16, alors
  « CoF Mini » n'y est plus et son adresse lui répond « Page introuvable. ».
- Étant donné Mira, quand elle ouvre « Créatures » de « CoF Mini » après qu'Antor y a ajouté
  « Garde du sceau », alors elle la voit, avec « Utilisé par 2 univers » et la seule puce « Les
  Landes grises · MJ ».
- Étant donné « Admin », MJ de l'univers « Brume » qu'il vient de créer, non rattaché, alors la vue
  d'ensemble de « Brume » n'a pas de bloc « Système de jeu », E-16 ne lui montre aucun système de
  « Brume », et `/univers/<Brume>/systeme` répond « Page introuvable. ».
- Étant donné Antor sur E-14 de Lame d'Ébène, ouvert pendant qu'un autre MJ de l'univers la
  détache de « CoF Mini », quand il clique « Ouvrir le système », alors il voit « Page
  introuvable. » et le lien « Systèmes de jeu » ; revenu sur E-14, le panneau dit « Cet univers n'est rattaché à aucun système de
  jeu. ».
- Étant donné Léa sur la vue d'ensemble de Lame d'Ébène, ouverte avant qu'Antor ne détache
  l'univers, quand elle clique « Ouvrir le système », alors elle voit « Page introuvable. » et le
  lien « Systèmes de jeu » ; revenue sur la vue d'ensemble, le bloc « Système de jeu » a disparu.

### E-1 en cartes

Décision de Monsieur (2026-10-06) : « Mes univers » passe en **grille de cartes**, comme E-8 et
E-16, pour la cohérence. Ce qui ne change pas : l'en-tête (« Mes univers », « Connecté en tant que
antor », « Créer un univers »), le compte « 2 univers », l'ordre par nom, E-2 et ses états. Grille :
colonne de 1 120 px au plus, `repeat(auto-fill, minmax(288 px, 1fr))`, 24 px entre les cartes ; au
téléphone, une colonne. **Toute la carte mène à E-3.** Chaque carte (composant « Carte d'univers »
de `docs/charte.md`) :

- un **en-tête dessiné** 2:1 (3:1 au téléphone), calculé du nom par le frontend : deux reliefs en
  courbes de niveau (un territoire — là où le système a des dés), le sommet teinté d'encre, et le
  **sceau** de l'univers (son initiale, article écarté : celui du sélecteur d'univers) en bas à
  gauche ; la pastille du rôle (« MJ » ambre, « Joueur » vert) en haut à droite ;
- le **nom** (Fraunces 18 px, une ligne, « … », infobulle) ;
- la **description** sur deux lignes au plus (Newsreader 15 px), absente si l'univers n'en a pas ;
- ce qui aide à choisir, en `--texte-3` : le **système de jeu** rattaché (`dices`, son nom coupé par
  « … ») ou « Sans système de jeu », et le **nombre de membres** (`users-round`, « 2 membres »).

Données : `GET /api/univers` rend en plus, par univers, `systeme: {id, nom}` ou `null` et
`nbMembres` (les membres d'un univers se lisent déjà par ses membres : aucun droit nouveau, aucune
colonne nouvelle).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | inchangé : « Aucun univers pour l'instant. » et les deux chemins (« Créer un univers », l'identifiant à donner au MJ) | « Créer un univers » |
| chargement | trois cartes squelettes (en-tête, nom, deux lignes) et « Chargement de vos univers… » | — |
| erreur | « Impossible de charger vos univers. » | « Réessayer » |
| connexion perdue | le bandeau ; la grille déjà chargée reste ; « Créer un univers » désactivé | ouvrir un univers |
| refus | sans objet : la page ne montre que les univers du compte | — |
| contenu long | 100 univers : la grille défile ; un nom de 80 caractères : une ligne, « … », infobulle ; une description longue : deux lignes et « … » ; un nom de système de 80 caractères : coupé par « … », nom entier en infobulle | idem |

*Critères.*
- Étant donné Antor, quand il ouvre « Mes univers », alors il voit deux cartes, par nom : « Lame
  d'Ébène » (MJ, « CoF Mini », « 2 membres ») et « Les Cendres de Vaëlis » (Joueur, « Chroniques
  Oubliées Fantasy », « 2 membres ») ; un clic n'importe où sur une carte ouvre la vue d'ensemble.
- Étant donné Teo, compte neuf, alors il voit l'état vide à deux chemins, inchangé.

### Données de départ du bouchon

Les critères de cette tranche supposent un monde. **En mode bouchon (AD-55), au démarrage du
serveur et seulement si la base n'a encore aucun univers**, Kanevas sème ce jeu de départ, par les
fonctions de service (AD-2) — pas par du SQL — et sans rien qui existe hors bouchon. Le semis vit au
démarrage du serveur, pas dans la fabrique de l'application : les tests, qui bâtissent leur
application sur une base vide, ne le reçoivent que s'ils l'appellent ; les serveurs que lance le harnais e2e posent `KANEVAS_SANS_SEMIS=1` (bouchon seulement) pour garder une base vide. Les images sont quelques
fichiers PNG et WebP de démonstration versionnés avec le code, déposés par la vraie fonction de pose
(AD-93), avec un fichier « plan.pdf » et un fichier vide pour les échecs.

Il se pose **en deux temps**, comme les tâches : `kanevas-il-systemes-serveur` pose le mécanisme
(semis au démarrage en bouchon, base sans univers), les univers, les membres, les systèmes et leurs
entrées, les fiches **sans illustration**, et versionne les fichiers de démonstration ;
`kanevas-il-illustration-ecrans`, qui en dépend, y ajoute les illustrations (par la fonction de pose)
et les fichiers d'échec (« plan.pdf », le fichier vide). Les colonnes « avec illustration » du
tableau ci-dessous sont donc celles du second temps.

**Provoquer les échecs en bouchon** (règles du bouchon, comme « une demande qui contient « échec » »
du moteur d'images, AD-55 ; elles vivent dans la couche du bouchon, enregistrée seulement avec
`KANEVAS_STUB=1`, jamais dans le service) :
- **retrait qui échoue** : retirer l'illustration d'une fiche dont le titre contient « échec » répond
  une erreur serveur et ne retire rien ; le semis pose une telle fiche, « Le Portrait de l'échec »
  (personnage PNJ de Lame d'Ébène, « Apparence » lue des joueurs, avec illustration) ;
- **image illisible** : le semis pose « La Fresque effacée » (lieu de Lame d'Ébène, lu des joueurs),
  dont l'illustration est enregistrée mais dont le fichier est absent du disque : sa lecture échoue,
  E-9 dit « Image indisponible. » et la grille montre la vignette de repli ;
- **envoi qui n'aboutit pas** : couper le réseau du navigateur pendant l'envoi ; **fichier refusé** :
  « plan.pdf » et le fichier vide du semis.

| Objet | Contenu |
|---|---|
| comptes | ceux du bouchon : Antor, Léa, Teo, Mira, Admin (inchangés) |
| « Lame d'Ébène » | Antor MJ, Léa Joueuse ; rattachée à « CoF Mini » |
| « Les Landes grises » | Mira MJ ; rattachées à « CoF Mini » |
| « Les Cendres de Vaëlis » | Admin MJ, Antor Joueur ; rattachées à « Chroniques Oubliées Fantasy » |
| Teo | membre d'aucun univers (donc d'aucun univers rattaché) |
| « CoF Mini » | règles « Attaque au contact », « Points de chance », « Repos » ; créatures « Gobelin des Landes », « Loup des brumes », « Sentinelle d'Ébène », « Vouivre des tourbières » (pas « Garde du sceau », que le critère fait ajouter) ; objets « Lame grise », « Sceau de Val-Fortin » |
| « Chroniques Oubliées Fantasy » | quelques entrées de chaque type |
| personnages de Lame d'Ébène | « Maître Aldric » (PNJ ; « Apparence » lue des joueurs, « Vérité — MJ seul » fermée ; **sans** illustration au départ, pour le critère d'ajout) ; « Bran Corvalis » (PNJ, « Apparence » lue, sans illustration) ; « Le Prieur masqué » (PNJ, une seule section « Secret — MJ seul » : **invisible de Léa** ; **avec** illustration) ; « Léa Brisefer » (PJ, avec illustration) ; « Dame Ombeline de Val-Fortin » (PNJ, avec illustration) ; « Suie » (PNJ, avec illustration) |
| lieux et factions de Lame d'Ébène | « Val-Fortin » et « Le Pendu Joyeux » (avec illustration), « Rue des Cordiers » (sans) ; « Lames Grises » (avec), « Cercle des Cendres » (section MJ seul, avec illustration : invisible de Léa) |

**Semis de `kanevas-import`** (ajouté au même semis, par les fonctions de service, chaque morceau par
la tranche qui le cite la première ; plan de l'epic) :

| Objet | Contenu | Semé par |
|---|---|---|
| « Essai Kanka » (univers, sans système) et un jeton d'API | Antor MJ, Léa Joueuse ; le jeton « Jeton du bouchon » d'Antor, valeur fixe connue des tests (`kvs_bouchon_essai…`), un an, semé **en bouchon seulement** comme tout le semis ; c'est là et avec lui que les critères importent (aucun import dans « Lame d'Ébène ») | `kanevas-import-fil` |
| « Port-Sel » (lieu de Lame d'Ébène) | « Description » lue des joueurs (Markdown : intertitre, liste, tableau des quartiers), « Histoire » lue des joueurs, **Léa pour auteur avec lecture et écriture**, avec un bloc MJ « Le port est tenu en sous-main par la Guilde des Brumes… », « Vérité » MJ seul | `kanevas-import-secrets` |
| « La Guilde des Brumes » (faction, MJ seul) ; « Rapport secret de l'amirauté » (événement, MJ seul) | la Guilde invisible de Léa ; le rapport porte, dans un bloc MJ, un lien vers « Maître Aldric » ; « Histoire » de Port-Sel lie « Maître Aldric » et « La Guilde des Brumes » ; « Apparence » de « Maître Aldric » lie « Port-Sel » ; « Description » de « La Guilde des Brumes » lie « Maître Aldric » ; dans « Essai Kanka », le lieu « Anse-aux-Sels » (lu des joueurs) dont « Description » porte `[[cle:faction:repaire|les contrebandiers du Repaire]]` (en attente) et `[[999999|Capitaine Hesk]]` (cassé : aucune fiche ne porte cet identifiant) | `kanevas-import-liens` |
| « Les Sphères » (lieu, MJ seul) ; « La Taverne du Kraken », « Les Docks », « Le Phare aux Sels », « Quartier des Cordiers » (lieux lus des joueurs) ; « Le Repaire des contrebandiers » (lieu, MJ seul) | Port-Sel sous Les Sphères ; les cinq sous Port-Sel, dont le Repaire, invisible de Léa | `kanevas-import-arbre` |
| sous-types des lieux existants | « Val-Fortin » · Ville, « Le Pendu Joyeux » · Taverne, « Rue des Cordiers » · Rue | `kanevas-import-types` |
| alias, étiquettes, un savoir | Port-Sel : alias « Salport », « Port-aux-Sels », étiquette « Côte des Brumes » (aussi sur « Cercle des Cendres », invisible de Léa) ; « Chronique de l'Âge d'Ombre » (savoir, lu des joueurs) | `kanevas-import-recherche` |
| fichiers de la médiathèque | « Plan secret de la Guilde » (image, réservée au MJ, non utilisée) ; « Carte des Sphères » (image, visible des joueurs) : illustration de Port-Sel, insérée dans « Description » de « Val-Fortin », jointe à « Apparence » de « Maître Aldric » ; « port-sel-quais.webp » joint à « Description » de Port-Sel ; « Notes de la table », section de « Léa Brisefer » dont Léa est l'auteur (lit, écrit), fermée aux autres joueurs | `kanevas-import-mediatheque` |

Teo reste membre d'aucun univers dans le semis : un critère qui a besoin de lui l'ajoute d'abord en
Joueur de « Lame d'Ébène » (E-4).

### Clôture de `kanevas-illustrations`

B-30 → la grille de E-8 (vignette, repli) et l'en-tête de E-9 (voir, poser, remplacer, retirer). Atteint par P-3 (le MJ prépare son lore : il pose l'illustration sur E-9 et la
retrouve sur E-8) et P-6 (une joueuse parcourt le lore sur son téléphone : la grille). Chaque rôle a
sa colonne ci-dessus ; les six états de chaque changement sont dans les tableaux (B-29).
B-31 → E-16 (nouveau) et E-15 hors univers ; atteints par P-8 (étape 2 :
« Systèmes de jeu », ou « Ouvrir le système » depuis E-14 / E-3) ; B-14 reste servi par E-15 ;
chaque relation au système (MJ, Joueur, sans univers rattaché) a sa colonne. Aucune donnée
nouvelle ; B-13 et B-14 sont inchangés. Les deux besoins viennent des décisions de Monsieur du
2026-10-06, écrites en B-30 et B-31 (`docs/parcours.md`).

## Détail des écrans de `kanevas-monde`

> Le bloc « proposition de mise à jour » de E-12, et rien d'autre : pas de nouvel écran, pas de
> nouvelle adresse d'écran. Mêmes six états et mêmes textes communs que `kanevas-premiere-fiche`
> (chargement, connexion perdue, session expirée) ; ne sont redits que les textes propres.
> Maquette `docs/maquettes/e12-propositions.html` (d'avant la charte : contenu et états seulement) (thème sombre ; le bloc dans ses états,
> sur ordinateur et sur téléphone). Composant : `docs/charte.md` « Proposition de mise à jour ».

**Comment une proposition naît.** Le MJ écrit dans le champ de E-12, en nommant la section et le
compte-rendu : « Mets à jour la section Vérité d'Aldric d'après le compte-rendu de la séance 3 ».
L'assistant ne connaît pas l'écran où se trouve la personne (AD-75 n'envoie que le message et le
fil) : le compte-rendu se nomme dans la demande. La réponse de l'assistant qui accompagne le bloc est du texte libre du modèle (la maquette en illustre un). L'assistant lit le CR et la section, puis appelle
l'outil `proposer_mise_a_jour` (AD-80) : **rien n'est écrit dans la section**. La réponse porte un
événement `proposition_creee` (AD-76) que le fil rend comme un bloc « Mise à jour proposée », sous
la réponse de l'assistant, à la place d'un bloc « Écrit par l'assistant ».

### Bloc « Mise à jour proposée »

De haut en bas :

- **l'en-tête** : « Mise à jour proposée » ; dessous, la section visée, « Section « Vérité » de
  « Maître Aldric » », et la source, « d'après « Séance 3 » » ;
- **deux zones de texte brut côte à côte** (AD-58 ; *depuis `kanevas-import`, rendues en Markdown par la fonction de rendu d'AD-95, vue du MJ, avec une bascule « Rendu / Source » au-dessus des deux*), étiquetées « Actuel » et « Proposé » ; sous
  760 px elles s'empilent, « Actuel » d'abord. « Actuel » montre le contenu **courant** de la
  section au moment de l'affichage (pas celui de la proposition) ; une section vide s'écrit « (section vide) » ;
- **les gestes** : « Appliquer » (principal), « Abandonner », et un lien « Ouvrir » vers la fiche
  (E-9, à la section).

Le bloc se lit **au serveur** à chaque affichage et après chaque geste (AD-82) : un bloc ancien
du fil dit la vérité du moment, pas celle de sa création. « Appliquer » écrit le contenu proposé
dans la section (AD-81) ; « Abandonner » supprime la proposition. Ni l'un ni l'autre ne passe par
l'assistant.

**Ce que chaque rôle y voit.** Le MJ qui a demandé la proposition : le bloc entier. Le Joueur : il n'a pas
l'outil (AD-80), donc jamais le bloc ; s'il demande une mise à jour, l'assistant répond qu'il ne
peut pas, sans événement (texte libre du modèle, comme pour la création d'un scénario). Un autre MJ
du même univers ne voit pas la proposition de son collègue : **caché**, l'adresse répond comme une adresse inconnue (elle n'est à personne d'autre que son
demandeur, AD-79) ; l'admin d'instance sans rôle n'a pas E-12. Un MJ en mode Joueur d'une fiche garde son catalogue réel (AD-74) : il peut proposer et appliquer.
Toute lecture de la proposition par un autre compte répond comme une adresse inconnue (AD-81).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | sans objet : le bloc n'existe qu'avec une proposition (l'outil refuse un contenu vide, AD-80), donc « Proposé » n'est jamais vide ; une section vide s'écrit « (section vide) » dans « Actuel » | — |
| chargement (lecture de la proposition) | l'en-tête absent ; « Chargement de la proposition… » (`role="status"`) ; ni zones ni gestes | continuer à écrire dans le fil ; fermer |
| en attente | l'en-tête, « Actuel » et « Proposé », les gestes | Appliquer ; Abandonner ; Ouvrir |
| relecture (après un geste, ou à l'affichage d'un bloc déjà lu) | l'ancien contenu reste lisible, sans « Chargement… » ; les gestes sont désactivés (`aria-disabled`) le temps de la relecture | lire ; Ouvrir |
| application ou abandon en cours | « Appliquer » (ou « Abandonner ») affiche « … » ; les deux gestes désactivés (`aria-disabled`) ; zones inchangées | attendre |
| appliquée | l'en-tête reste (section visée, source) ; « Appliquée : la section « Vérité » est à jour. » (`role="status"`) ; « Actuel » montre le contenu appliqué, « Proposé » disparaît ; plus de geste, sauf « Ouvrir » | Ouvrir |
| abandonnée (par ce geste) | l'en-tête reste (section visée, source) ; « Proposition abandonnée. » (`role="status"`) ; plus de zones ni de geste | continuer à écrire dans le fil |
| périmée (la section a changé depuis la proposition, par n'importe qui), vue à l'affichage **ou découverte au clic** sur « Appliquer » (refus `section_modifiee` : le bloc se relit et passe à cet état, rien n'est écrit) | le bandeau « La section a changé depuis la proposition. Demandez-en une nouvelle. » (`role="alert"`) au-dessus des zones ; « Actuel » montre le contenu courant ; « Appliquer » désactivé (`aria-disabled`) | Abandonner ; Ouvrir ; demander une nouvelle proposition dans le fil. Une proposition **appliquée** ne devient jamais « périmée » : elle reste « appliquée » même si la section change ensuite |
| erreur | à la lecture : « Je n'ai pas pu afficher la proposition — réessayer » (`role="alert"`) avec « Réessayer » qui la relit ; à un geste : « L'action n'a pas abouti. Réessayez. » (`role="alert"`) au-dessus des gestes, la proposition reste en attente, les gestes se réactivent | Réessayer ; le geste à nouveau |
| connexion perdue | le bandeau commun (« Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas. », texte de `kanevas-premiere-fiche`) ; zones lisibles ; « Appliquer » et « Abandonner » désactivés ; perdue pendant un geste en cours, la réponse est perdue : le « … » disparaît, les gestes restent désactivés, et au retour de la connexion la proposition est relue — le bloc dit ce que la base dit (appliquée ou en attente), jamais un état supposé | lire ; Ouvrir |
| refus (adresse inconnue : abandonnée ailleurs, supprimée avec sa section, autre compte, MJ retiré de l'univers) | « Cette proposition n'existe plus. » ; plus de zones ni de geste ; session expirée : la personne est menée à la connexion, le fil est perdu | continuer à écrire dans le fil |
| déjà appliquée, vue d'un autre onglet | même rendu que « appliquée » (la lecture dit l'état, AD-82) ; un « Appliquer » ou un « Abandonner » en course rend 409 `proposition_appliquee` et le bloc se relit | Ouvrir |
| contenu long | contenu de 100 000 caractères : chaque zone a une hauteur maximale de 15 lignes et défile (`tabindex="0"`, étiquetée « Actuel » / « Proposé ») ; les paragraphes (lignes vides) sont conservés ; un titre de fiche ou de compte-rendu de 120 caractères passe à la ligne | faire défiler chaque zone |

La proposition vit en base (AD-79) mais le fil non (AD-28) : au rechargement de la page, au changement d'univers ou
après « Nouvelle conversation », le bloc disparaît du fil et la proposition devient inatteignable ; elle
reste en base jusqu'à être remplacée par une nouvelle pour la même section (AD-79). Limite acceptée de la V1, bornée : une
proposition en attente par section et par MJ.

*Critère.* Étant donné Léa qui a écrit le compte-rendu « Séance 3 » et la fiche « Maître Aldric »
dont « Vérité » dit « Il sert la Couronne », quand Antor demande à son assistant de mettre à jour
« Vérité » d'après ce compte-rendu, alors le fil montre « Mise à jour proposée » avec « Actuel »
et « Proposé » et **la section n'a pas changé** (la fiche, ouverte à côté, l'atteste) ; quand il clique « Appliquer », la section
montre le contenu proposé et le bloc dit « Appliquée » ; quand une autre proposition est faite puis que
quelqu'un modifie la section, « Appliquer » est désactivé et le bandeau dit pourquoi ; Léa,
qui demande la même chose à son assistant, n'obtient aucune proposition.

### Clôture de `kanevas-monde`

B-21 → bloc « Mise à jour proposée » (toutes ses lignes) ; B-27 → proposer (générer reste à
`kanevas-images`). Parcours : P-5 étapes 2 et 3. Rôles : le MJ a le bloc et ses gestes, le Joueur
ne l'a pas, l'admin d'instance sans rôle n'a pas E-12. Une migration (la table `propositions`, numérotée
à la fusion, AD-51). Reste hors de la tranche : l'application par un joueur, les propositions en
lot, la reprise d'une proposition après rechargement.

## Maquettes

`docs/maquettes/<écran>.html`, une par écran structurant. Elles illustrent ; ce document décide,
et quand les deux divergent, la maquette a tort.

**Finies** (direction, tokens et composants de `docs/charte.md`, deux thèmes, bureau et
téléphone, vrai contenu) : E-1, E-3, E-4, E-6, E-8, E-9, E-14 (liste de référence ; les autres sections y renvoient). Depuis `kanevas-illustrations`, `e08` est la grille de cartes
(types Personnages, Lieux, Factions, `#etat-lieux`, `#etat-factions`) et `e09` porte l'illustration
de l'en-tête ; leurs images sont des illustrations de démonstration peintes en SVG. E-15 et E-16
(`e15-systeme-de-jeu.html`, `e16-systemes-de-jeu.html`) sont finies hors du cadre d'un univers ;
les menus du sélecteur d'univers des maquettes `e03`, `e08`, `e09`, `e14` et la barre de `e01` portent
« Systèmes de jeu ». `e09-fiche.html` **fait référence pour le
cadre** de tous les écrans d'un univers (barre latérale, sélecteur d'univers, menu du compte,
barre haute, bascule de mode, bouton « Demander à Kanevas », tiroir au téléphone) et pour les
composants partagés. Leurs états s'ouvrent par l'adresse (`#etat-joueur`, `#etat-menu`,
`#etat-perdue`… ; la liste est en tête de leur style). Le bloc « Cartes visibles » de `e03` et les maquettes `e10` et `e11` appartiennent à
`kanevas-cartes-graphes` (détail plus bas).

**Finies par le cadrage de `kanevas-import`** : `e09-fiche-importee.html` (E-9 : Markdown, liens,
bloc MJ, fil d'ancêtres, « Contient », « Mentionnée dans », menu de la fiche), `e18-acces-api.html`
(E-18), `e14-types-de-fiche.html` (panneaux « Types de fiche » de E-14 et E-15, suppression d'un
univers) et `e19-mediatheque.html` (E-19 : images et documents, le sélecteur), dans le cadre et avec les composants
de `e09-fiche.html`.

**D'avant la charte** : les autres (e02, e05, e07, e10, e11, e12-assistant, e12-propositions, e13). Elles valent pour le contenu et le vocabulaire, pas pour la
forme ; un écran qui n'a qu'elles se construit dans le cadre et avec les composants de la
maquette E-9.

**Hors produit, en bouchon seulement** : la page de démonstration des composants
(`/demo-composants`), servie quand `KANEVAS_STUB=1` et absente sinon (404), comme l'écran de
choix d'un compte de test.

## Détail des écrans de `kanevas-cartes-graphes`

> E-10 Cartes, E-11 Carte (carte illustrée et graphe), le bloc « Cartes visibles » de E-3, l'item « Cartes »
> de la barre latérale (il apparaît avec cette tranche). Mêmes états (B-29) et mêmes textes communs que
> la première fiche (chargement, erreur, connexion perdue, écriture en cours, échec d'une écriture,
> refus « Page introuvable. », session expirée). Maquettes : `e10` (liste : MJ, Joueuse, vide,
> création en erreur) et `e11` (carte illustrée et graphe : MJ, MJ en mode Joueur, Joueuse, états).
> Le document prime sur la maquette.

### E-10 Cartes

Le titre « Cartes », le sous-titre « Les cartes de l'univers. Les joueurs ne voient que celles que vous rendez visibles. » (MJ seulement), puis la liste des cartes **de l'univers que le compte lit** : le MJ les voit
toutes ; un Joueur seulement celles qui sont **visibles**. Une
ligne : une vignette (le fond d'une carte illustrée, un motif neutre sans fond ou pour un graphe), le
titre, la forme (« Carte illustrée » ou « Graphe »), et pour le MJ l'état « Visible des joueurs » ou
« MJ seul » (seul ce dernier est une pastille ambre) avec le geste inverse : « Rendre visible » / « Cacher aux joueurs », qui
agit au clic. Un clic sur le titre ouvre la carte (E-11). Ordre : titre alphabétique, puis création ;
cent cartes par page et « Charger la suite ».

*Créer (MJ).* En tête, « Nouvelle carte » ouvre un formulaire en ligne : **Titre** (1 à 80
caractères), **Forme** (« Carte illustrée » par défaut, ou « Graphe » ; elle ne se change plus
ensuite), et pour une carte illustrée **Image de fond** (« Choisir une image », facultative : choisir
n'envoie rien, l'image part avec « Créer »). « Créer » mène à la carte (E-11), **non visible** ; un
graphe naît vide, ses fiches se choisissent sur la carte. « Annuler » ferme le formulaire.

| Rôle | Voir | Créer | Rendre visible / cacher |
|---|---|---|---|
| MJ | toutes les cartes de l'univers | oui | oui |
| Joueur | les cartes visibles ; ni l'état ni le geste de visibilité | **absent** | **absent** |
| MJ en mode Joueur | sur E-10 la bascule n'est pas proposée : le MJ y voit toujours la liste complète ; le mode Joueur se joue sur E-11 | — | — |
| Admin d'instance, ou compte sans rôle dans l'univers (Teo) | aucune (« Page introuvable. ») | — | — |

*Textes.* Aucune carte : MJ « Aucune carte pour l'instant. Créez-en une pour commencer. » (le
formulaire reste proposé) ; Joueur « Aucune carte n'est visible pour l'instant. » ; titre vide ou
trop long : « Erreur : le titre est obligatoire. » / « Erreur : 80 caractères au plus. » ; fond qui
n'est pas une image PNG, JPEG, GIF ou WebP, ou vide : « Erreur : ce fichier n'est pas une image (PNG,
JPEG, GIF ou WebP). » ; fond de plus de 25 Mo (réponse 413) : « Erreur : l'image dépasse 25 Mo. » ; échec de
création : « La carte n'a pas pu être créée. Réessayez. », le formulaire garde sa saisie (le fond
choisi aussi). Une vignette qui ne se charge pas montre le motif neutre.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes ci-dessus ; pour le MJ, « Nouvelle carte » | créer (MJ) |
| chargement | « Chargement… » seul, à la place de l'écran | — |
| erreur | « Impossible de charger cette page. » ; échec d'une visibilité : « L'action n'a pas abouti. Réessayez. » et l'état d'avant | « Réessayer » |
| connexion perdue | le bandeau ; « Nouvelle carte », « Créer », « Rendre visible », « Cacher aux joueurs » désactivés ; la liste chargée reste | ouvrir une carte déjà listée |
| refus | Admin d'instance, ou compte sans rôle : « Page introuvable. » et « Mes univers » | « Mes univers » |
| contenu long | un titre de 80 caractères passe à la ligne ; 100 cartes, puis « Charger la suite » (« Impossible de charger la suite. » et le bouton reste en cas d'échec) | charger la suite |

*Critères.*
- Étant donné Antor, MJ, qui crée « La ville de Brume » (carte illustrée, avec un fond) puis revient à
  la liste, alors Léa ne la voit pas ; quand Antor clique « Rendre visible », elle la voit, sans
  l'état de visibilité ni le geste.
- Étant donné un fichier « plan.pdf » choisi comme fond, alors la création est refusée par le texte
  ci-dessus et rien n'est créé.
- Étant donné Teo, sans rôle dans l'univers, quand il force l'adresse de la liste, alors il voit
  « Page introuvable. ».

### E-11 Carte

En tête : le titre (MJ : « Renommer » — un champ en ligne, 1 à 80 caractères, « Enregistrer » /
« Annuler »), la forme, l'état de visibilité, et pour le MJ la **bascule mode MJ / mode Joueur** (celle de la barre haute) et
« Rendre visible » / « Cacher aux joueurs ». Dessous, **le cadre** de la carte, puis la liste
« Sur la carte », puis (graphe) la liste « Liens ».

*Carte illustrée.* Le cadre montre l'image de fond à ses proportions (16/10 neutre sans fond, AD-70) ;
chaque **token** est un rond portant la première lettre du titre de sa fiche, avec le titre dessous
(24 caractères, puis « … »). Sa zone cliquable fait au moins 44 px. Un token n'est présent que si sa
fiche est lisible du lecteur (AD-38). **Joueur** : toucher un token ouvre la fiche (E-9) ; rien d'autre.
**MJ (mode MJ)** : un clic **sélectionne** le token et met le token en évidence (anneau ambre, la couleur du MJ) et ouvre, sous le cadre, un panneau MJ au liseré ambre « Maître
Aldric · Personnage » avec « Ouvrir la fiche » et « Retirer de la carte » (ce bouton demande la même confirmation que la liste « Sur la carte » : rien n'est retiré au premier clic) ; on **déplace** un token au
glisser, ou au clavier (token sélectionné : flèches, 1 %, avec Maj 5 % ; l'aide « Flèches : déplacer de 1 % (Maj : 5 %) » est affichée sous le cadre) ; la position s'enregistre au
relâchement (ou à la touche) ; hors du cadre elle est ramenée au bord. « Ajouter une fiche » ouvre une
fenêtre : un choix de **type** (les sept ; *depuis `kanevas-import`, la liste du produit, types activés d'abord, AD-102*), un champ de recherche (lancée par « Chercher » ou Entrée ; plus de 100 caractères : « 100 caractères au plus. »), la liste des fiches de ce type
(celles que le MJ lit : toutes), chacune avec « Ajouter » ; une fiche déjà sur la carte porte « Déjà
sur la carte » sans bouton. « Fermer » ferme la fenêtre. Le token apparaît au **centre** (50 %, 50 %), prêt à être déplacé.
« Changer le fond » (« Ajouter un fond » s'il n'y en a pas) ouvre le sélecteur : **choisir l'image
suffit**, elle part aussitôt et remplace l'ancienne.

*Graphe.* Le cadre est un schéma : un **nœud** par fiche (rond, première lettre, titre dessous, 24
caractères), une flèche par **lien** de la fiche d'où vient la relation vers la fiche visée, avec le
type de la relation écrit sur la flèche (lien de A vers B : « membre de »). La disposition est celle
du navigateur (AD-71) ; elle n'est pas modifiable. La zone cliquable d'un nœud fait au moins 44 px ; le
cadre prend la largeur que la page lui donne (jamais moins d'un nœud plus ses marges) et sa hauteur
grandit avec le nombre de lignes de nœuds ; chaque nœud occupe sa propre case (150 × 70 px) d'une
grille, donc deux nœuds ne se recouvrent jamais ; ce qui ne tient pas dans la largeur (téléphone)
défile, et la liste « Sur la carte » reste le chemin sûr au toucher. Joueur : toucher un nœud ouvre sa fiche. MJ : un
clic sélectionne le nœud, avec « Ouvrir la fiche » et « Retirer de la carte » (même mot, même confirmation que la liste « Sur la carte ») ; « Ajouter une fiche »
est la même fenêtre. Une relation ajoutée ou retirée sur une fiche se voit au rechargement de la
carte.

*Fenêtre « Ajouter une fiche »* — états propres, car c'est elle qui décide. **Vide** : un type sans
fiche, « Aucune fiche de ce type. » ; une recherche sans résultat, « Aucune fiche ne correspond. ».
**Chargement** : « Chargement… » à la place de la liste, le choix du type et la recherche déjà là.
**Erreur** : « Impossible de charger les fiches. » et « Réessayer », la fenêtre reste ouverte.
**Connexion perdue** : le bandeau ; « Ajouter » désactivé, la liste chargée reste. **Contenu long** :
cent fiches par page et « Charger la suite » (« Impossible de charger la suite. » en cas d'échec) ;
un titre de 80 caractères passe à la ligne. **Refus** : sans objet, la fenêtre n'existe que pour le
MJ hors mode Joueur.

Chaque action de E-10 et de E-11 porte une icône Lucide (règle de `docs/charte.md`, « Icônes ») : Renommer un crayon, Rendre visible / Cacher un œil / œil barré, Ajouter une fiche un plus, Fond une image, Retirer une corbeille, Ouvrir la fiche un lien externe.

*Sur la carte* (liste sous le cadre, toujours présente quand il y a des éléments) : une ligne par
token ou nœud, son titre en lien vers la fiche, son type ; pour le MJ, « Retirer de la carte »
(confirmation sur place : « Retirer « Maître Aldric » de cette carte ? La fiche reste. » avec
« Retirer de la carte » et « Annuler ») ; c'est aussi le chemin au clavier et au lecteur d'écran.
*Liens* (graphe) : une ligne « Maître Aldric — membre de → Les Lames Grises » par lien ; aucun lien :
« Aucun lien entre ces fiches. ».

*Visibilité et mode Joueur.* « Rendre visible » rend la carte lisible des Joueurs ; « Cacher aux
joueurs » la leur retire (au prochain chargement de leur côté : elle leur répond « Page
introuvable. »). Le **mode Joueur** (AD-39) montre au MJ la carte telle que la verrait un Joueur qui
n'est l'auteur d'aucune section : mêmes tokens, mêmes nœuds, mêmes liens, plus aucun geste de
modification. Sur une carte **non visible**, le MJ en mode Joueur voit « Les joueurs ne voient pas
cette carte : elle n'est pas visible. » avec « Quitter le mode Joueur » (un Joueur, lui, recevrait
« Page introuvable. »).

| Rôle | Voir | Gestes |
|---|---|---|
| MJ | la carte, tous ses éléments (toute fiche de l'univers), tous les liens | renommer ; rendre visible ou cacher ; fond ; ajouter une fiche ; déplacer (carte illustrée) ; retirer ; mode Joueur ; ouvrir une fiche |
| MJ en mode Joueur | comme un Joueur | ouvrir une fiche ; quitter le mode |
| Joueur | une carte visible ; les éléments dont il lit la fiche, les liens dont il lit la relation (AD-64) et les deux bouts ; **aucun compteur de ce qui manque** | ouvrir une fiche |
| Admin d'instance, ou compte sans rôle dans l'univers (Teo) | aucune | « Page introuvable. » |

Un geste qu'un rôle n'a pas est **absent** de l'écran (jamais grisé, sauf hors connexion). Par l'API,
un geste d'écriture d'un non-MJ est refusé **403** sur une carte qu'il lit ; sur une carte qu'il ne
lit pas, **404**. Un token dont la fiche devient illisible disparaît au chargement suivant, sans trace.

*Textes.* Carte illustrée sans token : MJ « Aucun token. Ajoutez une fiche pour la placer sur la
carte. » ; Joueur « Rien à voir sur cette carte pour l'instant. ». Graphe sans nœud : MJ « Aucune fiche.
Ajoutez des fiches pour voir leurs liens. » ; Joueur « Rien à voir sur ce graphe pour l'instant. ».
Fond : fichier non image ou vide « Erreur : ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP). »,
plus de 25 Mo « Erreur : l'image dépasse 25 Mo. ». 100 éléments : « Cette carte porte déjà 100
éléments. ». Fiche devenue inconnue à l'ajout : « Cette fiche n'existe plus. » (la liste de la fenêtre
se recharge). Échec d'un déplacement, d'un retrait, d'un ajout, d'un renommage, d'une visibilité, d'un
fond : « L'action n'a pas abouti. Réessayez. », et l'état d'avant revient (le token retourne à sa
place) ; une saisie en cours est conservée. Titre vide ou trop long : les textes d'E-10. Le fond qui
ne charge pas : dans le cadre « Le fond de la carte n'a pas pu être chargé. » avec « Réessayer » ;
les tokens ne sont pas posés (leurs positions n'ont de sens que sur le fond), la liste « Sur la carte »
reste. Hors connexion, le fond déjà chargé reste affiché.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes « Aucun token », « Aucune fiche », « Rien à voir… » ; « Aucun lien entre ces fiches. » pour un graphe sans lien | MJ : ajouter une fiche |
| chargement | « Chargement… » ; le cadre à 16/10 neutre jusqu'au chargement du fond (« Chargement… » dedans), les tokens posés quand le fond est là | — |
| erreur | « Impossible de charger cette page. » ; fond : le message du cadre ; échec d'une écriture : « L'action n'a pas abouti. Réessayez. » | « Réessayer » |
| connexion perdue | le bandeau ; renommer, visibilité, fond, « Ajouter une fiche », déplacer, retirer désactivés (carte illustrée : les tokens deviennent des liens vers la fiche, sans sélection ni glisser ; graphe : la sélection reste) ; la carte chargée reste | lire, ouvrir une fiche |
| refus | carte inconnue ou illisible, compte sans rôle ou Admin : « Page introuvable. » et « Mes univers » ; MJ en mode Joueur sur une carte non visible : sa propre phrase | « Mes univers », « Quitter le mode Joueur » |
| contenu long | un titre de 80 caractères passe à la ligne ; 100 éléments : titres de 24 caractères puis « … » (le titre entier dans la liste « Sur la carte », qui défile) ; une image très large ou très haute garde ses proportions et tient en largeur ; téléphone : le cadre prend toute la largeur, une seule colonne | — |

*Critères.*
- Étant donné la carte illustrée « La ville de Brume » avec un fond, où Antor place « Maître Aldric »
  et « Les Ombres de Fer » (faction dont Léa ne lit aucune section) puis la rend visible, quand Léa
  l'ouvre, alors elle voit le fond et le token d'Aldric, ni le token ni le titre de la faction, ni
  « Les Ombres de Fer » dans la liste « Sur la carte » ; quand elle touche le token d'Aldric, alors
  elle arrive sur sa fiche.
- Étant donné la même carte, quand Antor passe en mode Joueur, alors il voit exactement ce que voit
  Léa ; quand il la cache aux joueurs, alors Léa, au rechargement, voit « Page introuvable. » et la
  carte n'est plus dans sa liste.
- Étant donné Antor qui déplace le token d'Aldric puis recharge, alors il est à sa nouvelle place ;
  une panne pendant le déplacement le ramène à l'ancienne et affiche « L'action n'a pas abouti.
  Réessayez. ».
- Étant donné le graphe « Les factions » avec « Les Lames Grises », « Les Corbeaux » et « La
  Guilde » ; la relation « allié de » de la première vers la deuxième, portée par une section que
  Léa ne lit pas, et « rival de » de la première vers la troisième, portée par une section qu'elle lit :
  Antor voit les deux liens ; Léa, qui lit les trois fiches de ce graphe, voit seulement « rival de » ;
  si elle ne lisait pas « La Guilde », elle verrait deux nœuds et aucun lien.
- Étant donné un graphe où Antor a mis aussi « Les Ombres de Fer » (Léa n'en lit aucune section),
  alors Léa n'y voit ni son nœud ni ses liens, et aucune trace de leur absence.
- Étant donné le fond « plan.pdf » choisi sur une carte, alors le refus s'affiche et le fond d'avant
  reste ; l'adresse du fond d'une carte non visible répond 404 à Léa.
- Étant donné Léa sur une carte, quand elle force l'adresse d'une action de MJ, alors elle reçoit 403.

### E-3 — le bloc « Cartes visibles »

Sur la vue d'ensemble, un bloc **Cartes visibles** (le titre de la maquette `e03`), inscrit au registre des blocs de E-3 (un fichier dans
`frontend/src/ecrans/vue-ensemble/blocs/` que le registre trouve seul (rang après les blocs des campagnes et
des comptes-rendus) ; aucun bloc existant n'est modifié). Il liste, pour tous les rôles, les **cartes
visibles des joueurs** (cinq au plus, titre alphabétique) : le titre en lien vers E-11 et la forme ;
dessous « Toutes » vers E-10. Chaque carte est une vignette (le fond de la carte, ou le motif neutre
d'un graphe ou d'une carte sans fond) avec une icône carte, le titre et la forme. Le MJ voit donc ce que la table voit ; ses cartes « MJ seul »
se trouvent sur E-10.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucune carte visible des joueurs. » et « Toutes » ; Joueur : **pas de bloc** (ni titre ni compteur) | MJ : « Toutes » |
| chargement | le titre du bloc et « Chargement… » | — |
| erreur | « Impossible de charger les cartes. » | « Réessayer » |
| connexion perdue | le bandeau ; les cartes déjà chargées restent | ouvrir |
| refus | sans objet : le refus d'E-3 couvre le bloc (« Page introuvable. ») | — |
| contenu long | un titre tient sur une ligne, puis « … » ; au-delà de cinq cartes, cinq et « Toutes » | — |

| Rôle | Voir |
|---|---|
| MJ | le bloc, avec les seules cartes visibles des joueurs |
| Joueur | le bloc s'il y a au moins une carte visible, sinon aucun bloc |
| Admin d'instance, ou compte sans rôle | aucun : E-3 lui répond « Page introuvable. » |

*Critère.* Étant donné deux cartes visibles et une « MJ seul », alors le bloc de Léa en liste deux ;
celui d'Antor aussi.

### Clôture de `kanevas-cartes-graphes`

B-22 → E-10 (créer une carte illustrée avec son fond, ou un graphe) et E-11 (placer des tokens,
choisir les fiches d'un graphe) ; B-23 → « Rendre visible » et la lecture filtrée d'un joueur ;
B-12 (carte) → le mode Joueur de E-11. Atteint par P-3 étape 6 (placer le PNJ, mode Joueur, rendre
visible), P-6 étape 3 (la carte d'un joueur) et P-9 en entier (le graphe). Les écrans E-10 et E-11
et le bloc de E-3 livrent leurs six états (B-29), ci-dessus.

## Détail des écrans de `kanevas-import` (cadrage)

> Cadrage proposé le 2026-10-11 (`epic/kanevas-import`). Besoins B-32 à B-56, parcours P-10 à P-16,
> décisions AD-95 à AD-111. Les tranches détaillent leurs écrans dans ce cadre ; elles ne
> l'inventent pas. Écrans structurants, avec maquette finie : **E-9** (la fiche importée, moment fort
> de P-12), **E-18** (Accès par API, P-10 et P-11), **E-14 / E-15 « Types de fiche »** (P-13), **E-19** (Médiathèque, P-16). E-17 et
> l'arbre de E-8 sont décrits ici sans maquette : ils se construisent avec les composants de E-8
> (grille, recherche, pastilles). Les textes communs (chargement, erreur, connexion perdue, refus)
> sont ceux de `kanevas-premiere-fiche`.

### Le Markdown, partout où l'on écrit un texte long

*(`kanevas-scenarios`: a scenario's text is a section of its sheet — what this part says of E-7 holds for that section, resolved in its universe like any section.)* Sections (E-9), scénarios (E-7), entrées d'un système (E-15), comptes-rendus (E-9) : le texte est du
Markdown (B-32, AD-95). **Ce qui se met en forme** : paragraphes (un saut de ligne simple reste un
saut de ligne, comme le texte brut d'avant), intertitres `#` à `####` (`#` et `##` au même niveau, rendus sous le titre de la
section, jamais au-dessus), gras, italique, barré, listes à puces et numérotées, citations, code,
filets, tableaux, liens web (`http`, `https`, `mailto` seulement ; ils s'ouvrent dans un nouvel
onglet), fichiers de la médiathèque (une image `![légende](fichier:…)`, un document `[nom](fichier:…)`, B-44), liens vers une fiche (`[[…]]`, B-33),
blocs MJ (`:::mj` … `:::`, B-34). **Ce qui reste du texte** : tout HTML écrit dans le contenu, une
image d'une autre adresse (le texte de l'image s'affiche à sa place), un lien d'un autre schéma.

**Selon le texte** (AD-97) : dans une **section** (et un compte-rendu), tout ce qui précède. Dans un
**scénario** (E-7), les liens `[[…]]` visent les fiches de l'univers de sa campagne, résolus sous les
mêmes droits (le lecteur d'un scénario est un MJ de cet univers) ; ils ne comptent pas dans
« Mentionnée dans » (un scénario n'est pas une fiche) ; pas de fichier ni de bloc MJ (un scénario ne
référence pas la médiathèque et est déjà au MJ seul). Dans une **entrée de système** (E-15), partagée entre les
univers rattachés : **pas de lien `[[…]]`** — `[[…]]` y reste du texte, tel qu'écrit, et l'éditeur n'a
ni « Lien vers une fiche » ni la liste ouverte par `[[` ; pas de fichier ni de bloc MJ non plus. Dans
un scénario comme dans une entrée de système, `![…](fichier:…)`, `[…](fichier:…)` et `:::mj` **ne sont pas interprétés** :
ils restent du texte, affiché tel qu'écrit (même règle que `[[…]]` dans une entrée de système) ; l'API
d'import ne les refuse pas.

**L'éditeur** (édition en place, charte « L'édition en place ») : le champ de texte garde la police
de lecture ; au-dessus, une barre d'outils discrète — « Gras », « Italique », « Lien vers une fiche »,
« Fichier », et pour un MJ « Bloc MJ » (entoure la sélection) — et la bascule « Écrire /
Aperçu ». Raccourcis : Ctrl/⌘+B, Ctrl/⌘+I, Ctrl/⌘+K (lien vers une fiche), Échap annule, Ctrl/⌘+Entrée
enregistre. Taper `[[` ouvre la liste de recherche de E-8 (`ListeRecherche`, tous types) au point
d'insertion ; choisir une fiche insère `[[<id>|<titre>]]`, Échap ferme la liste et laisse `[[`. Le
compteur dit « 12 480 / 100 000 ».

**Rendu** : un lien vers une fiche lisible est en `--accent-texte`, souligné fin, avec l'icône du type
au survol ; vers une fiche illisible : le texte, sans aucune marque ; **lien cassé** (MJ seul) : le
texte souligné en tirets `--danger`, infobulle « Lien cassé : cette fiche n'existe plus. » ; **lien en
attente** d'import (MJ seul) : souligné en tirets `--texte-3`, infobulle « Lien en attente : aucune
fiche n'a encore la clé « personnage:aldric ». ». Un **bloc MJ**, pour le MJ hors mode Joueur, prend
la matière de la section MJ seul (trame hachurée, filet ambre, pastille « MJ seul » `lock`) **dans** la
section, à sa place dans le texte ; en mode Joueur et pour tout autre lecteur, il n'existe pas — pas de
blanc, pas de filet, le paragraphe suivant suit le précédent. Un tableau large défile dans son cadre
au téléphone, jamais la page.

### Le Markdown — ce que `kanevas-import-markdown` construit (E-9, E-7, E-15, E-12)

> *Since `kanevas-scenarios-suivi`, E-7 no longer exists: what this passage says about a scenario's text applies to its section on E-9 (a sheet of type « Aventure »), and what it says about E-6 applies to the « Comptes-rendus » block of E-9.*

Cette tranche livre le rendu et l'éditeur **sans** lien `[[…]]`, sans fichier et sans bloc MJ (leurs
tranches les ajoutent à la même barre et au même rendu). Maquette : `e09-fiche-importee.html`,
`#etat-edition` pour l'éditeur ; `e07-scenario.html`, `e15-systeme-de-jeu.html` et `e12-propositions.html`
pour l'emplacement du rendu (le contenu y devient mis en forme, la mise en page ne change pas).

- **Parcours** : lire, P-12 étape 2 (E-9, E-7, E-15, E-12) ; écrire et prévisualiser, P-14 étape 1 (E-9, E-7, E-15).
  Le texte d'un compte-rendu se lit rendu sur E-9 ; la fenêtre « Nouveau compte-rendu » (in the adventure's E-9 block) garde son
  champ simple dans cette tranche, avec le plafond de 100 000 (« Erreur : 100 000 caractères au plus. ») et
  sans barre ni aperçu ; son compteur et son erreur « Erreur : 100 000 caractères au plus. » existent déjà (maquette `e06`, from before E-6 was retired) : seul le
  seuil passe de 20 000 à 100 000 ; its other states are those of the « Comptes-rendus » block (E-9) and remain unchanged.
- **Maquettes** : `e09-fiche-importee.html` (`#etat-edition`, `#etat-apercu`) montre la barre **complète**
  de l'epic (avec « Lien vers une fiche », « Fichier », la liste ouverte par `[[`) ; cette tranche n'en
  construit que « Gras », « Italique » et la bascule, les autres boutons viennent avec leurs tranches. La
  bascule est un groupe de deux options (`role="radio"`, `aria-checked`) comme la maquette. Les maquettes de
  E-7, E-15 et E-12 gardent leur mise en page : l'éditeur y est le même, la bascule « Rendu / Source » de
  E-12 s'ajoute au-dessus des deux zones, à la façon de la bascule « Écrire / Aperçu ».
- **Rendu** : un seul composant montre le HTML que le serveur a rendu, partout (sections et
  comptes-rendus de E-9, scénario de E-7, entrées de E-15, zones de E-12). Les intertitres `#` et `##`
  s'affichent au niveau « intertitre » le plus haut, `###` et `####` plus bas : jamais au niveau du
  titre de la section. Un lien web s'ouvre dans un nouvel onglet. Tableau large : il défile dans son
  cadre. Contenu vide : « Rien d'écrit pour l'instant. » (déjà le texte d'aujourd'hui). Un contenu
  d'avant (texte brut) se lit comme avant : paragraphes et sauts de ligne.
- **Éditeur** (E-9, E-7, E-15) : le champ, au-dessus la
  barre « Gras » (`bold`), « Italique » (`italic`) et la bascule « Écrire / Aperçu » (deux boutons, l'un
  actif, `role="radio"`) ; sous le champ, le compteur « 12 480 / 100 000 ». Ctrl/⌘+B et Ctrl/⌘+I entourent
  la sélection (ou posent deux marques et placent le curseur entre elles), Ctrl/⌘+Entrée enregistre,
  Échap annule. « Aperçu » remplace le champ par le rendu de la même fonction que la lecture ; le texte
  saisi reste dans le champ et revient avec « Écrire ». Les boutons « Lien vers une fiche » et « Fichier » n'existent pas encore ;
  « Bloc MJ » est décrit plus bas (E-9, bloc MJ).
- **États de l'aperçu** : en cours, « Aperçu en cours… » (le champ reste, bascule désactivée) ; texte
  vide, « Rien à prévisualiser. » ; échec ou hors ligne, « L'aperçu n'a pas abouti. Réessayez. » avec
  « Réessayer », et le champ intact (message aussi d'une session expirée ou d'un refus du serveur : le texte saisi n'est pas perdu) ; plus de 100 000 caractères, pas d'appel, « Erreur : 100 000
  caractères au plus. » sous le champ. Au-delà de 100 000, le comportement de E-9 d'aujourd'hui
  (§ E-9, « contenu long ») tient avec le nouveau seuil.
- **Qui voit quoi** : la lecture ne montre que le rendu. Le champ d'édition reçoit la **source** :
  elle n'est envoyée qu'à qui peut écrire la section (le scénario, au MJ qui le lit). Un joueur, ou le MJ
  en mode Joueur, ne la reçoit pas ; la réponse de lecture de Léa ne contient pas le Markdown.
- **E-12** : au-dessus des zones « Actuel » et « Proposé », deux boutons « Rendu / Source » (« Rendu »
  par défaut) ; « Source » montre le Markdown brut des deux zones, côte à côte comme aujourd'hui. Le fil
  de conversation reste en texte. Après « Appliquer » ou « Abandonner », le choix « Rendu / Source » est
  conservé ; une proposition périmée garde ses deux zones lisibles dans le mode choisi.
- **Cas extrêmes** : une zone de E-12 garde sa hauteur de 15 lignes et défile ; un mot ou une adresse sans
  espace passe à la ligne sans élargir la page à 375 px ; une image d'une autre adresse
  (`![plan](https://…)`) se lit « plan » (son texte alternatif), sans image.
- **Rôles** :

  | | MJ | Joueur lecteur | Joueur qui écrit la section | MJ en mode Joueur |
  |---|---|---|---|---|
  | Lit le rendu | oui | oui | oui | oui |
  | Reçoit la source | oui | non (le champ n'est pas dans la réponse) | oui | comme le rôle qu'il imite |
  | Barre, aperçu, compteur | en édition | caché | en édition | comme le rôle qu'il imite |
  | E-12 | éditeur au MJ, rendu pour qui lit | écran absent (404, MJ seul) | écran absent | écran absent |
  | E-15 (système rattaché) | éditeur au MJ, rendu | rendu seul, ni source ni barre (champ absent) | sans objet | rendu seul |
- **Plafond** : 100 000 caractères pour une section, un compte-rendu, un scénario, une entrée de système et
  un contenu proposé ; au-delà le serveur répond 400 « Contenu trop long : 100 000 caractères au plus. ».

### Les liens `[[…]]` — ce que `kanevas-import-liens` construit

*Reconnu* (AD-116) : `[[<id>|<texte>]]` (l'identifiant est un entier ≥ 1) et `[[cle:<clé>|<texte>]]`
(une clé d'origine d'import), et à l'écriture seulement `[[<id>]]`. Le texte fait 1 à 200 caractères, sans
`]`, `|` ni saut de ligne ; une forme qui ne tient pas ces règles, ou qui se trouve dans un bloc de code
ou dans un code en ligne, reste du texte. `[[cle:…]]` s'accepte de l'import comme de l'éditeur (même
résolution). Un `[[<id>]]` écrit sans texte est **réécrit** par le service en `[[<id>|<titre courant>]]`
avant d'enregistrer, si l'auteur lit la fiche ; sinon l'écriture est refusée (400, code `lien_illisible`,
« Cette fiche n'existe pas ou vous ne pouvez pas la lire. »), le texte reste dans le champ. Un
`[[<id>|<texte>]]` dont la cible est absente ou illisible de l'auteur s'enregistre (le texte est celui de
l'auteur, rien ne fuit) ; il se lira comme un lien cassé ou comme du texte, selon le lecteur.

*Lecture* : le rendu d'un lien dépend du lecteur et se décide **au rendu, par la cible**, pas par la
table `liens` : cible lisible du lecteur → `<a class="lien-fiche" href="/univers/<u>/fiche/<id>"
data-type="<type>">` ; cible illisible → le texte seul, sans élément ni marque ; cible supprimée → pour le
MJ hors mode Joueur `<span class="lien-casse" tabindex="0">` et son infobulle, le texte seul pour tout
autre lecteur ; clé en attente → pour le MJ hors mode Joueur `<span class="lien-attente" tabindex="0">`
(infobulle « Lien en attente : aucune fiche n'a encore la clé « <clé> ». »), le texte seul pour tout autre
lecteur. En mode Joueur le MJ lit comme un joueur. Un lien dans un bloc MJ n'existe, comme le bloc, que
pour le MJ hors mode Joueur (le bloc est ôté avant le rendu, AD-98). Le rendu résout tous les liens d'un
texte en **une** requête (jamais une par lien). L'assistant reçoit `[texte](fiche:<id>)` pour une cible
lisible et `texte` sinon, jamais un identifiant illisible (AD-96).

*Écriture* : le service qui écrit le contenu d'une section (le point d'écriture unique de
`kanevas-import-secrets`) remplace, dans la même transaction, les lignes de `liens` de la section : une
par lien trouvé, avec `dans_bloc_mj` d'après la position du lien, jamais par expression régulière hors des
jetons du moteur Markdown. Les textes déjà enregistrés avant la tranche ne sont pas rejoués : un
`[[…]]` d'avant n'était pas une syntaxe, et la table se remplit à la première écriture de la section.

*Import* : `[[cle:<clé>|<texte>]]` dont la clé est connue de l'univers s'enregistre en `[[<id>|<texte>]]` ;
sinon il reste tel quel, ligne de `liens` « en attente » (`cible_cle`). La création de la fiche qui porte
la clé réécrit, **dans la même transaction**, les contenus qui l'attendent (`contenu`, `contenu_public`,
lignes de `liens`) sans toucher à `version`, à `version_importee` ni à `modifie_le` de la section. Un
rejeu compare le texte envoyé **après** y avoir résolu les clés connues : un lien déjà résolu rend
« inchangée » (AD-104). Le lot compte « liens et références en attente » à sa clôture (`en_attente`).

*Scénario* (E-7) : mêmes formes, résolues à la lecture dans l'univers de la campagne du scénario, sous les
droits du lecteur (un MJ de l'univers) ; une clé en attente se résout à la lecture par l'index des clés
d'origine ; aucune ligne de `liens`. L'éditeur d'un scénario a « Lien vers une fiche » et la liste ouverte
par `[[`. *Entrée de système* (E-15) : `[[…]]` reste du texte, sans bouton ni liste.

*La liste ouverte par `[[`* (et « Lien vers une fiche », Ctrl/⌘+K) : le composant `ListeRecherche`, appelé
sans `type` ; elle cherche par titre dans toutes les fiches que le compte lit
(`GET /api/univers/:id/fiches?q=`), 50 au plus, chaque ligne avec l'icône et le libellé du type.
Taper après `[[` filtre ; ↑ ↓ choisissent, Entrée insère `[[<id>|<titre>]]` et ferme la liste, Échap la
ferme et laisse `[[`. Vide de résultat : « Aucune fiche. ». Erreur : « Impossible de chercher. » et
« Réessayer » ; la saisie n'est pas perdue. Connexion perdue : la liste ne s'ouvre pas, le bandeau commun
parle.

*« Mentionnée dans »* (B-36, AD-100) : la route de la fiche rend `mentions` (50 premières) et `mentionsSuite`
(booléen) ; `GET /api/univers/:id/fiches/:fid/mentions?apres=<n>` rend les 50 suivantes. Une ligne par fiche
source : titre (lien vers elle), icône du type, et le pourquoi — « lien dans « Histoire » » (la section
qui porte le lien), le libellé de la relation (« Amiral de »), ou les deux séparés par « · » si la
même fiche cite de plusieurs façons. Une source compte si sa fiche est lisible **et** que la section qui
porte le lien (ou la relation) l'est, **et** que le lien n'est pas dans un bloc MJ pour un non-MJ ; une
fiche qui se cite elle-même ne s'affiche pas ; l'ordre est le titre puis l'identifiant. Jamais de
compteur de ce qui est caché ; `mentionsSuite` se calcule sur ce que le lecteur voit seulement.

*États* (B-29). **Liste ouverte par `[[`** : chargement — la ligne « Recherche… » sous la saisie (la liste précédente
s'efface) ; vide — « Aucune fiche. » ; erreur — « Impossible de chercher. » et « Réessayer » ; connexion perdue
— la liste ne s'ouvre pas, `[[` reste du texte, « Enregistrer » est désactivé et le texte en cours conservé ; refus — l'éditeur n'est offert qu'à qui écrit la section, il n'y a donc ni
bouton ni liste pour les autres (**caché**) ; contenu extrême — un titre de 120 caractères tient sur une ligne
tronquée par « … » (le titre entier en infobulle), plus de 50 résultats : les 50 premiers puis la ligne
« Affinez la recherche pour voir les autres. ». **Bloc « Mentionnée dans »** : la suite en cours — le bouton « Afficher
les N suivants » devient « Chargement… » désactivé ; échec — « Impossible de charger la suite. » et « Réessayer » ;
connexion perdue — le bouton est désactivé ; les 50 premières arrivent avec la fiche (pas d'état propre).
**Refus d'écriture** `lien_illisible` : le message, en `--danger`, sous le champ de l'éditeur (E-9 comme E-7), le
texte conservé, l'enregistrement non fait. **E-7** : mêmes états pour la liste (lignes « erreur » et « connexion perdue » du tableau de E-7) ; E-7 est un écran MJ
seul qui ne connaît pas le mode Joueur : un lien cassé ou en attente y est toujours marqué ; `lien_illisible` y est sans objet
(un MJ lit toutes les fiches de l'univers). *Maquette* : `e09-fiche-importee.html#etat-liens`.

*Qui fait quoi* (liens) :

| Rôle | Éditeur : `[[` et « Lien vers une fiche » | Lecture d'un lien | « Mentionnée dans » |
|---|---|---|---|
| MJ, hors mode Joueur | oui (E-9) | lien, cassé, en attente marqués | tout ce qu'il lit, blocs MJ compris |
| MJ en mode Joueur, sur E-9 | **caché** (aucun geste d'écriture en mode Joueur) | comme un Joueur | comme un Joueur |
| Joueur, section qu'il écrit sans bloc MJ | oui | lien si la cible est lue ; sinon, cassé et en attente compris, le texte seul (**caché**, sans marque) | sources lisibles, hors blocs MJ ; le reste est **caché**, sans compteur |
| Joueur, section qu'il n'écrit pas, ou qui contient un bloc MJ (B-34) | **caché** : pas de « Modifier », donc ni bouton ni liste | idem | idem |
| Joueur qui tape à la main le lien d'une fiche qu'il ne lit pas | **refusé** : `lien_illisible` | — | — |
| Admin d'instance non membre | **caché** : « Page introuvable. » sur E-9 | — | — |

*Critères* (liste et bloc).
- Étant donné Antor qui édite « Histoire » de « Port-Sel », quand il tape `[[` puis « ald », alors la liste montre
  « Maître Aldric » avec l'icône et le libellé de son type ; Entrée insère `[[<id>|Maître Aldric]]`, Échap ferme
  la liste en laissant `[[`.
- Étant donné la recherche qui échoue, quand Antor tape `[[`, alors « Impossible de chercher. » et « Réessayer »
  paraissent et son texte reste.
- Étant donné une recherche sans résultat, alors « Aucune fiche. ».
- Étant donné 60 fiches qui citent « Maître Aldric » lisibles de Léa, quand elle ouvre sa fiche, alors « Mentionnée dans »
  en montre 50 et « Afficher les 10 suivants » ; la touche les ajoute ; sans réseau, le bouton est désactivé.
- Étant donné « Anse-aux-Sels » dans « Essai Kanka », quand Antor la lit, alors « les contrebandiers du Repaire » est
  souligné en tirets `--texte-3` (« Lien en attente : aucune fiche n'a encore la clé « faction:repaire ». ») et « Capitaine
  Hesk » en tirets `--danger` ; Léa lit les deux en texte simple.
- Étant donné Antor qui a accordé l'écriture aux joueurs sur « Description » de « Port-Sel », et Léa qui y tape à la
  main `[[<id>]]` (l'identifiant d'une adresse de fiche) de « La Guilde des Brumes », quand elle enregistre, alors
  « Cette fiche n'existe pas ou vous ne pouvez pas la lire. » paraît sous le champ, son texte intact, la section inchangée.
- Étant donné une recherche lente, quand Antor tape `[[` puis « ald », alors « Recherche… » paraît sous la saisie jusqu'à la
  réponse ; hors connexion, `[[` reste du texte et le bandeau commun parle.
- Étant donné 60 fiches qui répondent à « a », alors la liste montre 50 lignes puis « Affinez la recherche pour voir les
  autres. » ; un titre de 120 caractères tient sur une ligne finissant par « … ».
- Étant donné Léa sur une section de « Port-Sel » qu'elle n'écrit pas, alors ni « Lien vers une fiche » ni liste n'existent
  pour elle ; sur une section qui contient un bloc MJ, pas de « Modifier ».
- Étant donné « Afficher les 10 suivants » dont la requête est lente, alors le bouton dit « Chargement… » désactivé ; si elle
  échoue, « Impossible de charger la suite. » et « Réessayer » ; sans réseau, le bouton est désactivé.
- Étant donné Antor dans le scénario « La Couronne brisée » et la recherche qui échoue, quand il tape `[[`, alors
  « Impossible de chercher. » et « Réessayer » ; hors connexion, `[[` y reste du texte, « Enregistrer » est désactivé et son
  texte conservé ; un lien cassé du scénario y est marqué.

### E-9 Fiche — ce que `kanevas-import` change

*Maquette finie* : `docs/maquettes/e09-fiche-importee.html` (« Port-Sel », états `#etat-fichier`, `#etat-joindre`, `#etat-sous-type`, `#etat-changer-type`, `#etat-joueur`,
`#etat-sous-type-survol`, `#etat-sous-type-focus`, `#etat-changer-sous-type`, `#etat-changer-sous-type-echec`,
`#etat-edition`, `#etat-supprimer`, `#etat-deplacer`).

**En-tête.** Fil d'Ariane : univers › type › ancêtres **lisibles** du plus haut au plus proche ›
fiche ; un ancêtre illisible est sauté sans marque (B-35) ; plus de trois ancêtres : le premier, « … »
(menu des autres), les deux derniers. **Largeur (AD-99, arbitrage du 2026-10-15)** : le titre de la fiche courante cède en dernier (les ancêtres rétrécissent d'abord, jusqu'à leur minimum) ; un maillon d'ancêtre garde au moins 8 caractères (largeur `8ch`) et s'ellipse par « … » au-delà, jamais en dessous ; aucun maillon ne recouvre un chevron. Au téléphone (≤ 480 px), dès qu'il y a deux ancêtres lisibles ou plus, tous passent dans le menu « … » (icône du type › « … » › titre) ; avec un seul, il s'ellipse comme dit, sauf pour un MJ sur une fiche (la bascule MJ / Joueur prend la largeur du fil) : il passe alors lui aussi dans « … ». Entre 481 et 760 px, les ancêtres restent visibles. « Poser » ou « Remplacer » l'illustration (MJ) ouvre les deux
chemins d'ajout (« Fichiers », ci-dessous), limités aux images ; « Retirer » ôte la référence, l'image reste dans la
médiathèque. Le badge du type porte le **sous-type** : « Lieu · Port » (B-52) ;
MJ, hors mode Joueur : un clic sur le sous-type l'édite en place, avec la liste des sous-types déjà
employés pour ce type dans l'univers, par ordre alphabétique (titre de la liste « Sous-types de lieu
déjà employés » ; complétion sans tenir compte de la casse ; aide « Entrée enregistre · Échap annule »
et « Champ vide : plus de sous-type » ; 1 à 60 caractères, au-delà « Erreur : 60 caractères au plus. ») ;
une fiche sans sous-type montre au MJ le libellé « Sous-type » à cet endroit, rien à un joueur. Sous le titre : « Aussi appelée Salport, Port-aux-Sels » (alias,
`--texte-2`) et les **étiquettes** en pastilles neutres (`tag`), chacune un lien vers E-17 filtrée.
MJ, hors mode Joueur : le titre s'édite en place (clic, Entrée enregistre) ; le menu « ⋯ » de l'en-tête
porte « Changer le type… », « Déplacer sous… », « Alias et étiquettes… », une ligne d'information
« Importée · clé lieu:port-sel · créée le 3 mars 2021 » (si la fiche a une clé d'origine, B-50) et,
séparé, « Supprimer la fiche… » en `--danger`.
*Dans la tranche `kanevas-import-fil`*, la ligne « Importée · clé … » est la seule entrée du menu : pour une
fiche sans clé d'origine, le menu « ⋯ » n'est pas affiché ; « créée le … » est la date de création de la
fiche (`creeLe` de l'import s'il l'a donnée, B-50, sinon la date de l'import). La clé d'origine est cachée à
tout autre rôle que le MJ (hors mode Joueur) : ni le menu, ni la réponse de lecture.

- *Changer le type* : une liste des types de la liste du produit, activés d'abord, puis « Autres
  types » ; pour « Personnage », le choix PJ / PNJ ; et le champ « Sous-type » (vidé au changement de
  type, puisqu'il est propre au type, avec les sous-types déjà employés pour le nouveau type ;
  *(kanevas-sous-type-dialogue)* filled with the current sub-type while the type stays the current one, and then
  the box changes the sub-type alone). Le
  compte-rendu n'y figure pas ; un compte-rendu n'a pas cette entrée.
- *Déplacer sous…* : boîte « Déplacer « Port-Sel » sous… », champ « Chercher une fiche » et la liste de
  recherche (tous types, fiches que le MJ lit), plus « Aucun parent » ; pied : « Annuler » puis « Déplacer » (à droite au bureau, côte à côte sur toute la largeur, 40 px de haut, au téléphone) ;
  un descendant de la fiche est refusé : « Une fiche ne peut pas être rangée sous l'un de ses
  descendants. ».
- *Alias et étiquettes* : deux champs à pastilles (Entrée ajoute, × retire) ; une étiquette se
  complète sur celles de l'univers ; alias 1 à 120 caractères, 20 au plus ; étiquette 1 à 40
  caractères, 20 au plus par fiche.
- *Supprimer la fiche* : boîte de dialogue « Supprimer « Port-Sel » ? » qui compte ce qui part —
  « 3 sections ; 3 relations qui la visent ; 1 place sur une carte. Ses 2 fichiers restent dans la médiathèque. Ses 5 enfants
  remonteront sous « Les Sphères ». Les liens qui la visent deviendront des liens cassés. » — et
  « Supprimer la fiche » (`--danger`) / « Annuler ». Après : retour à la liste du type, toast « Fiche
  supprimée. ». Ces nombres ne sont montrés qu'au MJ, qui lit tout.

**Sections.** Rendu Markdown ci-dessus. « Modifier » n'apparaît pas pour un Joueur sur une section qui
contient un bloc MJ, même s'il en a l'écriture (B-34) ; s'il l'ouvre par une autre voie, le serveur
refuse : « Vous ne pouvez pas modifier cette section. ».

**Fichiers** (B-24, B-44, B-55, AD-111 ; décisions de Monsieur du 2026-10-11). Tout fichier de la fiche
vit dans la médiathèque et y est référencé. **Lecture** : un fichier (image insérée, fichier joint,
lien de fichier dans le texte) ou l'illustration se montre si le lecteur le voit ; sinon, dans une
section qu'il lit, un cadre neutre (`lock`, `--texte-3`) dit « Image réservée au MJ. » (avec la
légende s'il y en a une) ou « Fichier réservé au MJ. » pour un document ; dans un bloc MJ, rien.
L'illustration réservée au MJ d'une fiche qu'un joueur voit : la même mention dans l'en-tête, la
vignette de repli dans la grille de E-8 (sans mention). Fichier supprimé : « Fichier supprimé de la
médiathèque. » pour un MJ, rien pour un joueur. In player mode, the GM sees what a player sees, plus files they added themselves (third rule, AD-117).

**Deux chemins d'ajout** : le bouton « Fichier » (`paperclip`) de la barre d'outils, en édition, et
« Joindre un fichier » en pied du bloc Pièces jointes — présent hors édition pour qui écrit la section,
comme le dépôt d'avant (`kanevas-fichiers`) — ouvrent le même menu —
1. **« Ajouter depuis l'appareil »** (ou un glisser-déposer sur la section) : en **un seul geste**, le
   fichier entre dans la médiathèque (ajouté par le compte ; **visibilité selon l'endroit d'ajout** : dans
   un bloc MJ, ou dans une section que les joueurs ne lisent pas tous, « Réservé au MJ » — la ligne du
   fichier le dit par sa pastille « MJ seul » — ; ailleurs, « Visible des joueurs » ; une illustration :
   « Visible des joueurs » si la fiche a une section lue des joueurs) **et** s'intègre à la
   fiche — depuis la barre d'outils, une image s'insère dans le texte au point d'insertion
   (`![nom](fichier:<id>)`) et un document y met un lien (`[nom](fichier:<id>)`), each reference on **its own line** (a newline is added before and after when the insertion point touches text or a `:::` fence; after a table row, a blank line separates the reference from the table so it cannot become another row; it never sticks to a closing fence and therefore never falls into the GM block) ; depuis le bloc, le
   fichier est joint à la section ; depuis l'en-tête (« Poser » ou « Remplacer » l'illustration, MJ),
   une image devient l'illustration. Un échec n'ajoute rien à la médiathèque ni à la fiche.
2. **« Choisir dans la médiathèque »** : le sélecteur de E-19 (« Choisir un fichier »), filtré sur ce
   que le compte voit (et sur les images pour l'illustration) ; choisir intègre la référence de la même
   façon, sans rien ajouter à la médiathèque, **sans changer sa visibilité**.
Celui qui a ajouté un fichier le **voit toujours**, ici et dans E-19, même réservé au MJ (troisième règle
de lecture d'AD-111).
L'avertissement de B-55 s'affiche sous le champ, ou dans la boîte de l'illustration, tant que la
condition tient (un fichier réservé au MJ posé hors bloc MJ dans une section lue des joueurs, ou en
illustration d'une fiche que des joueurs voient) ; il n'empêche rien.

**Le bloc Pièces jointes** montre les fichiers joints à la section : images en vignettes, documents par
l'icône de leur type, leur nom et leur taille ; pour un MJ, la pastille « MJ seul » d'un fichier réservé.
Menu d'une ligne : « Retirer » ôte la référence, jamais le fichier de la médiathèque ; pour un MJ,
« Réserver au MJ » / « Rendre visible des joueurs » change la visibilité **du fichier** (même boîte que
E-19 s'il est lu ailleurs par des joueurs) ; « Ouvrir dans la médiathèque ». La case « secrète » de
`kanevas-fichiers` disparaît : c'est la visibilité du fichier. **100 fichiers joints** au plus par
section (« Cette section porte déjà 100 fichiers joints. » au MJ, « Cette section ne peut pas recevoir
d'autre fichier. » au joueur) ; les références dans le texte ne comptent pas.

**Pending file reference** (import, `fichiers_attente`, AD-111): a file key not yet known in
this universe. For a GM outside player mode, an inline image, an attachment row and the
illustration slot show the same dashed `--texte-3` tile with the text
« Fichier en attente d'import : « img:quais ». » (the key as sent). The inline image tile uses
14 px Inter with 12/16 px padding, like the attachment tile. A document link such as
`[tarifs](fichier:cle:doc:tarifs)` has a dashed `--texte-3` underline and that sentence as its
tooltip. Other readers, including a GM in player mode, see only the document link's text,
without a link, underline or tooltip; pending images, attachments and illustrations leave
no tile, gap or row. The server never sends them the key.
A pending attachment does not count towards the 100-file limit until resolved, cannot be
removed (no menu: it disappears when the file arrives) and appears in no media library list.
*States*: **loading** — nothing before the sheet arrives, so no flashing tile; **empty** — a
section whose only attachments are pending shows their tiles rather than « Aucun fichier
joint. »; **error** and **connection lost** — the tile is sheet text and follows the sheet's
states; **refusal** — hidden for non-GM readers; **extreme content** — a 200-character key is
shortened with « … », with the full key in a tooltip; 100 tiles scroll within their frame.
The pending illustration occupies a full header row. Its key stays on one line, shortened
when needed, with its closing quotation mark and period kept together. **When the file arrives**: an already open GM page does not update
itself; reloading replaces the tile with the file. **Beyond 100**: a `PUT /fiches` whose
section names more than 100 `fichiers` keys is refused (400 `invalide`, `champ: fichiers`,
counted as refused in the batch). If resolution would exceed 100 attachments, the extra
join stays pending and the batch warns « section « Notes » : 100 fichiers joints au plus,
« K » reste en attente ». In editing and « Aperçu », the source keeps the key as written
(`fichier:cle:K`): the preview shows the tile, the editor the source. The user-facing term is
« fichier en attente » (never « référence » on E-9; E-18 counts « liens et références en
attente » for the batch).

**Blocs de fiche** (après les sections, hors de toute section) :
- **Contient** (`folder-tree`) — les enfants lisibles, par type puis titre, chacun avec son icône ; 50
  puis « Afficher les N suivants » (N compté sur ce que le lecteur voit). Absent s'il n'y en a aucun.
- **Mentionnée dans** (`link-2`) — les fiches qui la citent et que le lecteur voit : titre, icône,
  et le pourquoi : « lien dans « Histoire » » ou le libellé de la relation (« Amiral de »). 50 puis la
  suite. Absent s'il n'y en a aucune (B-36). Jamais de compteur de ce qui est caché.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | fiche importée sans section : comme avant ; ni « Mentionnée dans » ; « Contient » seulement si elle a des enfants lisibles | MJ : ajouter une section |
| chargement | squelettes de l'en-tête et de deux sections ; la fiche et ses sections arrivent en une réponse, « Contient » dans une seconde (« Chargement… » sous son titre) | — |
| erreur | « Impossible de charger cette fiche. » ; image insérée qui ne se charge pas : « Image indisponible. » à sa place, sa légende dessous ; déplacement, changement de type, suppression qui échoue : « L'action n'a pas abouti. Réessayez. », rien n'a changé | « Réessayer » |
| connexion perdue | le bandeau ; « Modifier », le menu « ⋯ », l'édition du titre désactivés ; les liens restent suivables | lire |
| refus | fiche illisible : « Page introuvable. » ; un lien vers elle n'est que du texte ; supprimée pendant la lecture : « Page introuvable. » à l'action suivante ; Joueur : ni menu « ⋯ », ni édition du titre (**caché**) | « Mes univers » |
| contenu long | section de 100 000 caractères : rendue en entier, l'éditeur défile ; « Erreur : 100 000 caractères au plus. » au-delà ; tableau de 12 colonnes : défile dans son cadre ; 300 enfants : 50 puis la suite ; titre de 120 caractères et fil de 6 ancêtres : le fil se replie (« … ») | idem |

*Critères.*
- Étant donné « Port-Sel » dont la section « Histoire » (lue des joueurs) contient un bloc MJ « Le port
  est tenu par la Guilde des Brumes », quand Léa ouvre la fiche, alors elle lit « Histoire » sans
  aucun mot du bloc, sans espace ni marque à sa place.
- Étant donné la même fiche, quand Antor passe en mode Joueur, alors il voit exactement ce que voit
  Léa ; revenu en mode MJ, le bloc est hachuré d'ambre, pastille « MJ seul ».
- Étant donné un lien `[[…]]` de « Port-Sel » vers « La Guilde des Brumes » (fiche dont Léa ne lit
  rien), quand Léa lit « Port-Sel », alors « La Guilde des Brumes » est du texte simple, sans lien.
- Étant donné Léa auteur avec écriture d'une section qui contient un bloc MJ, quand elle ouvre la
  fiche, alors cette section n'a pas « Modifier ».
- Étant donné « Rapport secret de l'amirauté » (MJ seul) qui lie « Port-Sel », quand Léa ouvre
  « Port-Sel », alors « Mentionnée dans » ne nomme pas ce rapport ; Antor l'y voit.
- Étant donné « Port-Sel » sous « Les Sphères » (lieu illisible de Léa), sans autre ancêtre, quand
  Léa ouvre « Port-Sel », alors le fil est « Lame d'Ébène › Lieux › Port-Sel ».
- Étant donné « Port-Sel » sous « Les Sphères » (lieu illisible de Léa) sous « Le Grand Vide »
  (lisible), quand Léa ouvre « Port-Sel », alors le fil est « Lame d'Ébène › Lieux › Le Grand Vide ›
  Port-Sel ».
- Étant donné Antor qui déplace « Les Sphères » sous « Port-Sel », son enfant, alors il voit « Une
  fiche ne peut pas être rangée sous l'un de ses descendants. » et rien ne change.
- Étant donné Antor qui supprime « Port-Sel » (5 enfants, dont un illisible de Léa, parent « Les Sphères »), alors les 5
  enfants ont « Les Sphères » pour parent, l'adresse de « Port-Sel » répond « Page introuvable. », et
  un lien vers elle dans « Maître Aldric » est marqué « lien cassé » pour Antor et du texte pour Léa.
- Étant donné un contenu qui contient `<script>alert(1)</script>` et `<b>gras</b>`, quand la section
  s'affiche, alors ces balises s'affichent comme du texte, et aucun script ne s'exécute.

### Ce que `kanevas-import-tenir` construit (E-9 titre et suppression, E-14 « Supprimer l'univers »)

*Précisions de la tranche, sur le cadre ci-dessus (B-39, B-40, B-41, AD-105, AD-119) ; les maquettes sont
`e09-fiche-importee.html` (`#etat-supprimer`) et `e14-types-de-fiche.html` (`#etat-supprimer-univers`).*

*La maquette `#etat-supprimer` ne dessine que l'état nominal de la boîte et celle de l'en-tête que le titre au repos : les états ci-dessous (titre vidé ou trop long, toast, bilan en chargement ou en erreur) sont décrits ici, et ce texte fait foi.*

**Titre en place (E-9, MJ hors mode Joueur).** Un clic sur le titre le rend champ de saisie, texte
sélectionné ; Entrée enregistre, Échap annule, la perte de focus enregistre. 1 à 120 caractères après
rognage ; vide : « Erreur : le titre est obligatoire. » ; au-delà : « Erreur : 120 caractères au plus. » ; le
champ reste ouvert. Titre inchangé : rien n'est envoyé. Enregistré : toast « Fiche renommée. », le fil
d'Ariane des descendants et le badge de la liste suivent à la lecture suivante ; les liens `[[…]]` ne bougent pas
(ils visent l'identifiant, B-33). Échec : « L'action n'a pas abouti. Réessayez. » sous le titre, le champ reste ouvert avec la saisie (Échap rend l'ancien titre). Un
Joueur ou le mode Joueur : titre en texte, sans curseur d'édition.

**Suppression d'une fiche (E-9).** « Supprimer la fiche… » ouvre la boîte **après** avoir lu son bilan
(`GET …/fiches/:fid/suppression`) : « Chargement… » dans la boîte, bouton « Supprimer la fiche » inactif tant que
le bilan n'est pas là. Le texte est composé des seuls postes non nuls, au singulier ou au pluriel
(« 1 section », « 1 relation qui la vise », « 1 place sur une carte », « Son fichier reste dans la
médiathèque », « Son enfant remontera sous… ») ; sans parent, « … remonteront à la racine de la liste du
type » ; sans enfant, la phrase manque ; la fiche seule : « Cette fiche ne porte rien d'autre. ».
Les nombres sont ceux du MJ, qui lit tout. Erreur du bilan : « Impossible de charger le détail. » et
« Réessayer » ; échec de la suppression : le message dans la boîte, qui reste ouverte, la fiche n'a pas
bougé. Succès : retour à la liste du type, toast « Fiche supprimée. ». Une fiche déjà supprimée par ailleurs :
« Page introuvable. » à l'ouverture de la boîte. Un compte-rendu se supprime de même (retour à E-13).

**Import (E-18).** Un `DELETE` d'import ajoute au bilan du lot le compteur « Fiches : 1 supprimée »
(« supprimées » au pluriel), sans refus possible ; clé inconnue : rien n'est compté.

**Supprimer l'univers (E-14, tout MJ).** La boîte suit le texte ci-dessus ; le champ compare le nom saisi au
nom de l'univers à la lettre près, casse et espaces compris (l'espace final saisi par erreur laisse le bouton
inactif) ; le serveur recompare (`nom`) et refuse un nom différent (400 `nom_different`, « Le nom ne correspond
pas à celui de l'univers. » ; l'écran affiche « Le nom ne correspond pas. »). Pendant la suppression : bouton « Suppression… » inactif. Après : E-1, toast « Univers supprimé. » ;
les autres membres, à leur prochaine action, voient « Page introuvable. ». Échec de la suppression : « L'action n'a pas
abouti. Réessayez. » dans la boîte, qui reste ouverte, l'univers est intact ; une suppression longue garde
« Suppression… » tant que le serveur n'a pas répondu (pas de délai au-delà duquel la boîte se ferme).

**États propres à la tranche** (en plus du tableau de E-9 et de E-14).

| Écran | État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|---|
| E-9, boîte | chargement du bilan | « Chargement… », « Supprimer la fiche » inactif | « Annuler » |
| E-9, boîte | erreur du bilan | « Impossible de charger le détail. » | « Réessayer », « Annuler » |
| E-9, boîte | échec de la suppression | « L'action n'a pas abouti. Réessayez. » dans la boîte, la fiche n'a pas bougé | « Supprimer la fiche », « Annuler » |
| E-9, boîte | connexion perdue | le bandeau ; « Supprimer la fiche » inactif, le bilan chargé reste | « Annuler » |
| E-9, titre | échec de l'enregistrement | « L'action n'a pas abouti. Réessayez. » sous le titre, le champ reste ouvert avec la saisie | Entrée pour réessayer, Échap |
| E-9, titre | connexion perdue pendant l'édition | le bandeau ; Entrée n'envoie rien, la saisie est gardée | Échap |
| E-14, boîte | connexion perdue | le bandeau ; « Supprimer l'univers » inactif | « Annuler » |

Un compte-rendu s'appelle « fiche » dans ces textes (« Supprimer la fiche… ») : c'est une fiche (B-40), et sa boîte
compte ses sections, ses propositions de l'assistant incluses ; retour à E-13 au lieu de la liste du type.
Les chemins d'échec de P-14 et de P-10 renvoient à ce tableau.
### Le bloc MJ — ce que `kanevas-import-secrets` construit (E-9, E-12, import)

Cette tranche livre le bloc `:::mj` (B-34, AD-98, AD-114) sur le rendu et l'éditeur que
`kanevas-import-markdown` pose. Elle ne livre ni lien `[[…]]` dans un bloc (`kanevas-import-liens`),
ni fichier dans un bloc (`kanevas-import-mediatheque`), ni la recherche tous types
(`kanevas-import-recherche`) ; la recherche **d'un type** (E-8) et celle de l'assistant (`chercher`) lui
sont fermées dès maintenant. Maquette : `e09-fiche-importee.html` (« Port-Sel », « Histoire » : le bloc
`.bloc-mj`, le bouton `.outil-mj` de la barre, l'état `#etat-joueur`) ; aucun écran nouveau.

- **Parcours** : lire, P-12 étapes 3 et 6 ; chercher dans un type, P-6 étapes 1-2 (la recherche tous types, P-12 étape 4, est à `kanevas-import-recherche`) ; écrire, P-14 étape 1 (« Bloc MJ ») ; vérifier en mode Joueur,
  P-10 étape 6 ; importer un contenu qui porte `:::mj`, P-10 étape 4.
- **La syntaxe** : une ligne `:::mj`, des lignes de texte, une ligne `:::`. Le MJ la tape ou la pose par
  le bouton. Tout ce que le bloc couvre est secret, **quelle que soit la forme** : paragraphes, liste,
  tableau, citation. Un bloc ne s'ouvre pas dans un bloc de code (` ``` `) : là, `:::mj` reste du texte, et
  n'est donc pas un secret. Un bloc **jamais fermé** couvre le texte jusqu'à la fin de la section, même s'il est ouvert dans une liste ou une citation
  (le doute joue contre l'affichage, jamais contre le secret). Un bloc dans un bloc : le plus extérieur
  gouverne : chaque `:::mj` rencontré dans un bloc ouvre un bloc imbriqué, et le bloc extérieur ne finit qu'à la ligne `:::`
  qui équilibre les ouvertures (une ligne `:::` dans un bloc de code d'un bloc MJ le ferme, comme à l'écran) ; tout ce qu'il couvre est retiré. `:::MJ` (autre casse), `::: mj` (espace), `::::mj` (quatre deux-points)
  et `:::mj` suivi de mots ne sont pas des blocs : du texte, visible de tous — une règle de plus que le MJ n'a pas à apprendre.
- **« Bloc MJ » button** (GM only, `lock`, after the existing editor toolbar buttons; « Fichier » is added by `kanevas-import-mediatheque`,
  avant la bascule « Écrire / Aperçu » ; libellé « Bloc MJ » visible sur ordinateur, l'icône seule de 36 px sous le
  seuil « téléphone » de la maquette (`@media` de `e09-fiche-importee.html`), sans infobulle au toucher : le libellé accessible la remplace ; infobulle « Bloc MJ · entoure la sélection », libellé accessible « Bloc MJ ») : avec une sélection, il l'entoure d'une ligne `:::mj` avant et d'une
  ligne `:::` après (en ajoutant les sauts de ligne qui manquent, pour que les deux lignes soient seules) ;
  sans sélection, il pose les deux lignes à la suite l'une de l'autre, une ligne vide entre, le curseur sur
  la ligne vide. Il n'a pas de raccourci clavier. Il ne retire pas un bloc : on efface ses deux lignes.
  Un joueur qui écrit la section, ou le MJ en mode Joueur, ne le voit pas.
- **Aperçu** (« Écrire / Aperçu ») : ses états sont ceux de `kanevas-import-markdown` — « Aperçu en cours… »,
  « Rien à prévisualiser. », « L'aperçu n'a pas abouti. Réessayez. » avec « Réessayer », « Erreur : 100 000 caractères au plus. » — ;
  l'aperçu d'un scénario (E-7) ou d'une entrée de système (E-15) laisse `:::mj` en texte comme leur lecture (seule l'édition d'une
  section de E-9 demande la nature « section » avec son univers et son mode, AD-114) ; un `nature: 'section'` sans `univers_id` entier est refusé (400), un univers inconnu ou dont le compte n'est pas membre répond 404 comme toute lecture ; un membre non MJ reçoit un aperçu sans bloc. Pour le MJ, le bloc paraît comme à la lecture, hachuré ; pour qui n'est
  pas MJ, ou hors d'un univers, il n'existe pas (l'aperçu applique la même vue que la lecture, AD-114).
- **Cas extrêmes** : un bloc de 100 000 caractères défile avec la section ; un tableau large dans un bloc
  défile dans le cadre du bloc, jamais la page à 375 px ; plusieurs blocs dans une section sont autant de cadres, séparés par
  le texte public ; un bloc jamais fermé est hachuré **jusqu'à la fin** de la section (le MJ voit ce que le public perd) ; le
  bloc vide (`:::mj` puis `:::`) se lit comme un cadre sans texte.
- **Lecture** : pour un MJ hors mode Joueur, le bloc prend la matière de la section « MJ seul » (trame
  hachurée d'ambre, filet, pastille « MJ seul » `lock`, libellé accessible « Bloc MJ seul »), à sa place dans le
  texte. Pour tout autre lecteur et pour le MJ en mode Joueur, le bloc n'existe pas : ni blanc, ni filet, ni
  pastille, le paragraphe suivant suit le précédent ; la réponse de lecture ne contient pas un mot du bloc.
  Une section dont tout le texte est dans un bloc se lit, pour un non-MJ, « Rien d'écrit pour l'instant. ».
- **Écrire une section qui contient un bloc** : le MJ seul (AD-98). Pour un joueur qui l'écrit par
  son audience, ou pour le MJ en mode Joueur qui imite un tel joueur, « Modifier » n'apparaît pas ; s'il y
  parvient par une autre voie (l'API de session, `modifier_section`, `ajouter_a_section`), le serveur répond 403,
  « Vous ne pouvez pas modifier cette section. », et rien n'est écrit. L'absence de « Modifier » dit à une joueuse
  qui écrit la section qu'elle ne peut pas la modifier, jamais pourquoi : aucun message ne nomme le bloc, et c'est
  la seule trace d'un bloc que ce choix laisse (acceptée : elle ne livre aucun mot du secret). Un joueur qui écrit un contenu qui
  **contient** un bloc (il a tapé `:::mj` dans une section qui n'en avait pas) reçoit 400, « Un bloc MJ ne peut être
  écrit que par un MJ. », sous le champ, texte conservé ; il en va de même du texte d'un compte-rendu qu'il crée (the « Comptes-rendus » block of E-9),
  dont la fenêtre montre ce message sous le champ comme ses autres refus. En mode Joueur, le MJ n'a pas « Modifier »
  (le mode est une vue de lecture, il imite un joueur qui ne peut pas écrire cette section) ; ce que l'API
  lui accepte ne change pas, le mode ne restreint que des lectures (AD-39).
- **L'assistant** (E-12) : `lire_fiche` et `lire_section` rendent, pour un compte joueur, le Markdown
  **public** (sans bloc) ; pour un compte MJ, la source entière — son catalogue reste celui du MJ même
  quand il est en mode Joueur à l'écran (AD-74). `modifier_section` et `ajouter_a_section` d'un joueur sont refusés
  sur une section à bloc (« Vous ne pouvez pas modifier cette section. », sans événement) et sur un contenu qui
  contient un bloc (« Un bloc MJ ne peut être écrit que par un MJ. »). `modifiable` vaut faux pour une telle
  section. Un MJ qui écrit une section par l'assistant peut y poser un bloc.
- **Le texte d'un scénario (E-7) ou d'une entrée de système (E-15)** : `:::mj` n'y est pas interprété, il
  reste du texte tel qu'écrit (docs/ecrans.md, § « Le Markdown, partout où l'on écrit un texte long ») ; le
  rendu du bloc est réservé aux sections et aux comptes-rendus, et un scénario ou une entrée n'a pas de `contenu_public`.
- **La recherche** (le champ de recherche d'un type de E-8, B-11, et `chercher` ; la recherche tous types de
  P-12 étape 4 vient avec `kanevas-import-recherche` sur la même règle) : un non-MJ, ou un MJ en mode Joueur, ne cherche que dans les titres
  et le texte **public** des sections ; un mot qui n'est que dans un bloc ne fait pas trouver la fiche. Un
  MJ hors mode Joueur cherche dans tout le texte.
- **L'import** : `PUT /fiches/:cle` accepte `:::mj` dans le `contenu` d'une section ; le contenu public
  est calculé comme pour une écriture d'écran, dans la même transaction. Le jeton est celui d'un MJ : la règle
  « seul un MJ écrit un bloc » ne le gêne pas. Un contenu rejoué à l'identique reste `inchangee`.
- **États** : ceux de E-9 (chargement, vide, erreur, connexion perdue, refus, contenu long). Le refus d'une
  écriture est le message ci-dessus, sous le champ, texte conservé ; la section d'un joueur qui contient un bloc
  est lisible sans « Modifier » (**caché**, pas grisé).
- **Rôles** :

  | | MJ | Joueur qui lit | Joueur qui écrit la section | MJ en mode Joueur |
  |---|---|---|---|---|
  | Voit le bloc | oui, hachuré | rien | rien | rien |
  | « Bloc MJ » dans la barre | oui | sans objet (pas d'édition) | **caché** | **caché** |
  | Écrit une section à bloc | oui | non | non (« Modifier » **caché**, 403) | par l'API oui ; à l'écran « Modifier » **caché** |
  | Écrit un contenu qui contient un bloc (section, text of a report created from the E-9 block) | oui | non | non (**refusé** : 400, message sous le champ) | par l'API oui |
  | Trouve une fiche par un mot du bloc | oui | **rien** (la fiche n'est pas un résultat) | **rien** | **rien** |
  | L'assistant lui rend le bloc | oui | **rien** (le public) | **rien** (le public) | oui (catalogue du MJ) |

*Critères.*
- Étant donné « Port-Sel » dont « Histoire » (lue des joueurs) contient un bloc MJ de trois paragraphes, quand
  Léa la lit, alors le premier et le dernier paragraphe du texte se suivent sans blanc supplémentaire, et la
  réponse du serveur ne contient aucun mot du bloc.
- Étant donné un bloc dans une liste à puces, un bloc dans une citation et un bloc jamais fermé en fin de
  texte, quand Léa lit, alors rien de ce qu'ils couvrent ne paraît.
- Étant donné `:::mj` écrit dans un bloc de code, quand Léa lit, alors il se lit comme du texte.
- Étant donné une section dont tout le texte est un bloc, quand Léa la lit, alors elle lit « Rien d'écrit pour
  l'instant. » ; Antor y voit le bloc.
- Étant donné un scénario ou une entrée de système dont le texte porte `:::mj … :::`, quand il se lit, alors
  les trois lignes se lisent comme du texte, sans cadre.
- Étant donné un compte-rendu dont le texte porte un bloc, écrit par Antor, quand Léa le lit sur E-9, alors elle
  n'en lit rien du bloc et n'a pas « Modifier » sur ce texte.
- Étant donné Léa qui crée un compte-rendu dont le texte porte `:::mj … :::`, quand elle l'envoie, alors la
  fenêtre dit « Un bloc MJ ne peut être écrit que par un MJ. » et rien n'est créé.
- Étant donné Léa qui écrit une section qu'elle peut écrire et qui tape `:::mj … :::` dans son texte, quand
  elle enregistre, alors elle lit « Un bloc MJ ne peut être écrit que par un MJ. » et son texte est conservé.
- Étant donné la même Léa et une section où Antor a posé un bloc, quand elle envoie une écriture à
  l'API, alors la réponse est 403 et la section est inchangée ; l'assistant de Léa, qui tente
  `modifier_section`, reçoit « Vous ne pouvez pas modifier cette section. » et aucun événement n'est émis.
- Étant donné un mot qui n'est que dans un bloc de « Port-Sel », quand Léa le cherche dans « Lieux », alors
  « Port-Sel » n'est pas rendue ; Antor la trouve ; Antor en mode Joueur ne la trouve pas.
- Étant donné Antor sur « Histoire » en édition, quand il sélectionne un paragraphe et touche « Bloc MJ »,
  alors le paragraphe est entre `:::mj` et `:::` ; « Aperçu » le montre hachuré ; Léa ne voit rien après « Enregistrer ».
- Étant donné un import de `contenu` à bloc MJ, rejoué à l'identique, alors la réponse dit `inchangee`
  la seconde fois et Léa ne lit rien du bloc.

### E-19 Médiathèque

*Maquette finie* : `docs/maquettes/e19-mediatheque.html` (états `#etat-joueur`, `#etat-image`,
`#etat-document`, `#etat-documents`, `#etat-supprimer`, `#etat-reserver`, `#etat-choisir`,
`#etat-averti`, `#etat-vide`, `#etat-perdue`). The drop overlay, errors, upload progress, « Afficher les N autres »
and the empty picker are not drawn: **this document takes precedence over the mockup**. Decisions
of 2026-10-11 (B-53 to B-56, AD-111): all universe files, images and documents.

Atteint (adresse `/univers/<id>/mediatheque`) par « Médiathèque » (`images`) dans la barre de l'univers, sous « Cartes », pour tout membre.
En tête : le titre, « 1140 fichiers » (ceux que le lecteur voit) et, pour un MJ, « Ajouter des
fichiers » (plusieurs à la fois, ou un glisser-déposer sur la page : voile « Déposez les fichiers pour
les ajouter. »). Une bascule segmentée **Tout · Images · Documents** ; une rangée de filtres : la
recherche par nom (« Chercher par nom ») ; pour un MJ, « Visibilité » (Toutes, Visibles des joueurs,
Réservées au MJ) ; « Usage » (Tous, Utilisés, Non utilisés — calculé sur les usages que le lecteur peut lire : pour un joueur, « Non utilisés » veut dire « utilisé nulle part où il lit », jamais « utilisé dans une fiche fermée » ; D1) ; l'ordre (Plus récents, Nom). Une
**grille** : une image en vignette (cadrage `cover`, chargement à l'approche) ; un **document** en
tuile de même taille — l'icône de son type (`file-text` PDF, `file-spreadsheet` tableur, `file-archive`
archive, `file` sinon), l'extension en pastille, la taille (« 2,4 Mo ») ; le nom dessous ; pour un MJ,
la pastille « MJ seul » (`lock`) sur un fichier réservé. 100 puis « Charger la suite ».

Un clic ouvre le **panneau du fichier** (à droite au bureau, plein écran au téléphone) : l'image en
grand, ou pour un document sa grande icône, son type (« Document PDF », « Tableur XLSX », « Archive
ZIP », « Document ODT » : la nature et l'extension) and, for documents only, « Télécharger » (images have no such button) ; le nom (MJ : éditable en
place, 1 à 200 caractères) ; la **visibilité** en bascule segmentée « Visible des joueurs » /
« Réservé au MJ » (MJ ; un joueur ne voit pas ce réglage) ; type, taille, « ajouté par lea le 12 oct.
2026 », la clé d'origine (MJ, si importé) ; **Utilisé dans** — les usages **que le lecteur peut lire** : pour chaque fiche qu'il voit, l'illustration (si la fiche lui est visible) et les seules sections qu'il lit, avec leur titre (« Histoire » (dans le texte), « Pièces jointes de Description ») et un lien ; pour un non-MJ (E-19 n'a pas de mode Joueur), jamais un usage dans une section qu'il ne lit pas ni dans un bloc MJ — un fichier dont aucun usage ne lui est lisible n'a pas de bloc « Utilisé dans » (D1) — ; pour un MJ « Supprimer le fichier » (`--danger`). Aucun aperçu intégré d'un PDF (AD-66).

- *Réserver au MJ* un fichier lu des joueurs ailleurs : boîte « Réserver « plan-du-repaire.png » au
  MJ ? Les joueurs ne le verront plus dans : Les Docks — « Histoire » ; Port-Sel — « Description »
  (jointe). » ; « Réserver au MJ » / « Annuler », puis le toast « Fichier réservé au MJ. ». Sans tel
  usage : pas de boîte, le même toast. Rendre visible, renommer : sans toast. Nom vide : « Erreur : le
  nom est obligatoire. » ; au-delà de 200 : « Erreur : 200 caractères au plus. ». « Utilisé dans »
  n'apparaît pas pour un fichier qu'aucune fiche visible du lecteur n'utilise.
- *Delete*: dialog « Supprimer « Carte des Sphères » ? Elle est utilisée dans 3 fiches : Port-Sel
  (illustration), Val-Fortin (« Description »), Maître Aldric (pièces jointes de « Apparence »). Elle
  disparaîtra de ces fiches. » (« Il est utilisé… Il disparaîtra… » for a document); without usages:
  « Supprimer « Carte des Sphères » ? »; « Supprimer le fichier » (`--danger`) / « Annuler »; toast
  « Fichier supprimé. ».

**The picker** (« Choisir dans la médiathèque », from E-9): the same grid in a « Choisir un fichier »
dialog, with « Ajouter depuis l'appareil » at the top (first path, B-55), filtered to readable files
and to « Images » when setting an illustration. Choosing inserts the reference (E-9, « Fichiers »);
the B-55 warning follows below the field. Picker states: *empty* — « Aucune image à choisir. »
(illustration) or « Aucun fichier à choisir. » (player with no readable files), with « Ajouter depuis
l'appareil » for users allowed to add; *error* — « Impossible de charger la médiathèque. » with
« Réessayer »; a failed device upload shows « « notes.txt » : l'envoi n'a pas abouti. » inside the
dialog, which stays open; *offline* — banner, « Ajouter depuis l'appareil » disabled, loaded grid
still selectable; file deleted or no longer readable between opening and choosing: « Ce fichier
n'existe plus. » and reload the grid.

**Long upload** (E-19, « Ajouter des fichiers » or drag and drop): one row per uploading file,
« plan.png — Envoi… 42 % » (`role="status"`) with « Annuler »; cancellation writes nothing. The
grid keeps its place; the file joins it when its upload completes.

**Assistant-added file** (B-25, amended AD-44): a generated image enters the media library like
any upload, attributed to the requesting GM's account, with visibility determined by where it is
added (illustration: « Visible des joueurs » if the sheet has a section readable by players).
The generating assistant tool (`generer_image`, `kanevas-images`) calls that same add path, joining the image to the section.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Aucun fichier pour l'instant. Ajoutez-en, ou posez-en un dans une fiche. » et « Ajouter des fichiers » ; joueur : « Aucun fichier à voir pour l'instant. » ; un filtre sans résultat : « Aucun fichier ne correspond. » | MJ : ajouter |
| chargement | tuiles en squelette ; une vignette qui charge garde son cadre | — |
| Error | « Impossible de charger la médiathèque. »; failed thumbnail or preview: « Image indisponible. » (icon and text only, no button); failed download: « L'action n'a pas abouti. Réessayez. »; an empty file in a multiple upload: « « notes.txt » est vide. » below the grid, other files are added; interrupted upload: « L'envoi n'a pas abouti. » with « Réessayer » and « Abandonner » (E-9 calls the latter « Ignorer »); failed deletion or change: « L'action n'a pas abouti. Réessayez. », nothing changed | « Réessayer » |
| connexion perdue | le bandeau ; « Ajouter des fichiers », la bascule de visibilité, « Supprimer » désactivés | regarder ce qui est chargé |
| Refused | A GM-only file the player did not add does not exist for them (absent, direct address: « Page introuvable. »); players have no visibility settings, deletion or add action on E-19 (**hidden**; they add through a writable section on E-9); role removed while viewing: « Vous ne pouvez plus modifier ce fichier. »; instance admin without a universe role forcing the address: « Page introuvable. » | « Mes univers » |
| contenu long | 1 140 fichiers : 100 puis la suite ; nom de 200 caractères tronqué par « … » avec infobulle ; un fichier utilisé dans 40 fiches : 10 puis « Afficher les 30 autres » ; image de 30 Mo : l'aperçu se charge, rien n'est redimensionné (AD-93) ; document de 300 Mo : la tuile et « Télécharger », rien n'est chargé d'avance | idem |

*Critères.*
- Étant donné « plan-du-repaire.png » réservée au MJ et insérée dans « Histoire » des « Docks », lue
  des joueurs, quand Léa lit « Les Docks », alors elle voit « Image réservée au MJ. » à sa place ; et
  sa médiathèque ne montre pas ce fichier.
- Étant donné le même fichier inséré dans un bloc MJ, quand Léa lit la section, alors rien ne paraît.
- Étant donné Antor qui, en modifiant une section lue des joueurs, choisit dans la médiathèque un
  fichier réservé au MJ, alors l'éditeur affiche l'avertissement de B-55 ; dans une section MJ seul,
  non.
- Étant donné Teo ajouté en Joueur de « Lame d'Ébène » par Antor, et Léa, auteur avec écriture de
  « Notes de la table » (que les autres joueurs ne lisent pas),
  quand elle ajoute « carnet.pdf » depuis son appareil, alors le document est joint à la section **et**
  figure dans la médiathèque, « Réservé au MJ », « ajouté par lea » ; Léa le voit dans la section et
  dans sa médiathèque, Teo ne le voit nulle part.
- Étant donné Antor qui ajoute « plan.png » depuis un bloc MJ de « Port-Sel », alors le fichier entre
  « Réservé au MJ » ; ajouté depuis « Description », lue des joueurs, il entre « Visible des joueurs » ;
  choisi ensuite dans la médiathèque pour un bloc MJ, sa visibilité ne change pas.
- Given « Carte des Sphères » used by three sheets, when Antor deletes it, the dialog lists all
  three sheets. Afterwards, Antor sees « Fichier supprimé de la médiathèque. » in its place in
  « Val-Fortin »; Léa sees nothing.
- Étant donné un fichier visible des joueurs utilisé par « Port-Sel » (lisible de Léa) et par « Rapport
  secret de l'amirauté » (MJ seul), quand Léa ouvre le fichier, alors « Utilisé dans » ne nomme que
  « Port-Sel ».
- Étant donné un fichier visible des joueurs joint à « Vérité — MJ seul » de « Maître Aldric » (fiche
  que Léa voit par « Apparence ») et inséré dans un bloc MJ de « Port-Sel », quand Léa ouvre le fichier,
  alors il n'a pas de bloc « Utilisé dans », et il paraît sous le filtre « Non utilisés ».
- Étant donné la bascule sur « Documents », alors seuls les documents paraissent, chacun avec l'icône
  de son type, son nom et sa taille.

### E-8 Liste de fiches — l'arbre

Une bascule « Grille / Arbre » (icônes `layout-grid`, `list-tree`) à côté de la recherche ; le choix est
mémorisé par type dans le navigateur. **L'arbre** : les fiches du type que le compte lit, dont le
parent est absent, illisible ou d'un autre type, par titre ; une fiche dont le parent lisible est d'un
autre type porte « dans La Guilde des Brumes » (`--texte-3`, lien). Chaque nœud qui a des enfants **du même
type** lisibles a un chevron ; déplier charge ses enfants (100, puis « Charger la suite »). Pas de
compteur d'enfants (il ne compterait que le lisible, mais n'aide en rien). La recherche dans le type
rend la grille, jamais l'arbre. Les types de la barre sont ceux qui sont activés ; l'adresse d'un type
désactivé ouvre quand même sa liste (on y arrive par une fiche), avec la ligne « Ce type est désactivé
dans cet univers. » et sans bouton de création. Le choix du type à la création : les types activés.

**Sous-type** (B-52, décision de Monsieur du 2026-10-11) : la carte d'une fiche (grille) et la ligne de l'arbre montrent
son sous-type sous le titre (`--texte-3`) ; un filtre « Sous-type » à côté de la recherche (« Tous » ;
puis les sous-types des fiches du type que le lecteur voit, par ordre alphabétique, avec leur nombre de
fiches lisibles) ; un sous-type filtré rend la grille. La fenêtre de création a un champ « Sous-type »
facultatif, avec la même complétion que E-9.

**Visibility** (B-57, `kanevas-fiche-mj-seul`, decision of Monsieur, 2026-10-25). For a GM in GM
mode, a sheet none of whose sections is readable by the players (the « Les joueurs la lisent »
setting; a section readable by its player author alone does not count; a sheet without any section
carries it too, nobody reads it) carries the amber « MJ seul » badge (`lock`, the charte's audience badge, same as a
GM-only file in E-19) on its card, under the title next to the sub-type, and on its tree line. A
filter « Visibilité » stands next to « Sous-type », for the GM only: « Toutes » (default; the option reads « Visibilité : toutes »), « Visibles
des joueurs », « Réservées au MJ »; a filtered visibility renders the grid, like a filtered sub-type,
and combines with the sub-type filter and the search; « Toutes » renders the tree back when it was
the remembered view. The counts are those of the sheets of the type. The state is derived at each
reading, never stored: opening one section to the players, from E-9, removes the badge at the next
reading of the list. A player, and the GM in player mode, see neither the badge nor the filter, and
the API does not tell them whether a sheet is GM-only (it only lists what they read, E-8 refus).
States of the filter: its three values are fixed (no loading, no counts); it keeps its value in the
address (`?visibilite=joueurs` or `?visibilite=mj`, like `sousType`) and across « Charger la
suite »; any other value in the address is ignored (« Toutes », unfiltered, nothing sent). A
visibility filtered alone without any sheet renders « Aucune fiche réservée au MJ. » or « Aucune
fiche visible des joueurs. » with « Voir toutes les fiches » (which resets the three filters);
combined with a sub-type or a search and empty, « Aucune fiche pour ces filtres. » with « Voir
toutes les fiches », which resets the three. Loading, error and offline are the grid's (the control is disabled under the
connection-lost banner, like « Nouveau … »). Switching to player mode removes the control and
drops the parameter, the grid reloads unfiltered; back in GM mode the filter is « Toutes » again.
The badge of a card and of a tree line has the accessible name and tooltip « Aucune section n'est
visible des joueurs. », like the header's; focusable, on focus or touch the sentence is written
under the card's title, or under the tree line. The badge shows wherever a sheet card or line is
drawn to the GM in GM mode: the grid, the tree, the « Relier » sheet selector of E-9 (which is the
E-8 list as it is) and the results of E-17; the « Visibilité » filter exists on the grid only
(decision of Monsieur, 2026-10-25). The E-8
and E-9 mockups draw neither the badge nor the filter: this text is authoritative, and the badge is
the charte's audience badge (`Pastille` sens « secrete », icon `lock`). On a section, « MJ seul »
names that section; on a card, a tree line or the header it names the whole sheet — the header
tooltip says so. Under 760 px the badge never squeezes the title: on a E-17 result it wraps under the row
(the title keeps the full width). On the E-9 header row (type badge, « MJ seul », « ⋯ ») the type badge
stays on one line; without illustration the row wraps to a second line when it must. Beside an
illustration the text column is narrow, so the row never wraps: « MJ seul » shrinks to its padlock (name
and tooltip kept for assistive technology), the type badge shrinks with an ellipsis on the sub-type, « ⋯ »
stays on the row, and the help sentence floats over what follows instead of pushing the illustration down. *Critères.* Étant donné Antor, MJ, et « Le Prieur masqué », personnage dont la seule section est
« Secret — MJ seul », quand il ouvre la liste des personnages, alors sa carte porte « MJ seul », et
« Visibilité » ▸ « Réservées au MJ » le liste et ne liste pas « Maître Aldric », dont « Apparence »
est lue des joueurs. Étant donné la même fiche, quand Antor ouvre sa seule section aux joueurs sur
E-9, alors la pastille de l'en-tête disparaît sans recharger, et sa carte n'en porte plus à la
prochaine lecture de la liste. Étant donné Léa, joueuse, quand elle
ouvre la liste des personnages ou `/univers/1/fiches/personnages?visibilite=mj`, alors elle ne voit
ni pastille ni filtre, et la liste est celle de ses droits.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes de la grille ; nouveaux types : « Aucune créature », « Aucune race », « Aucun vaisseau », « Aucun savoir », « Aucun récit », « Aucune règle », « Aucune note » + « pour l'instant. » / « à voir pour l'instant. » ; boutons « Nouvelle créature », « Nouvelle race », « Nouveau vaisseau », « Nouveau savoir », « Nouveau récit », « Nouvelle règle », « Nouvelle note » | MJ : créer |
| chargement | « Chargement des fiches… » ; un nœud qui se déplie : « Chargement… » sous lui | — |
| erreur | « Impossible de charger les fiches. » ; un nœud : « Impossible de charger la suite. » | « Réessayer » |
| connexion perdue | le bandeau ; « Nouveau … » désactivé | déplier ce qui est chargé |
| refus | un type inconnu de la liste du produit : « Page introuvable. » | — |
| contenu long | 201 lieux : 100 racines puis la suite ; 12 niveaux de profondeur : l'indentation plafonne à 6 niveaux, la profondeur se lit au chevron | idem |

*Critère.* Étant donné « La Taverne du Kraken » sous « Port-Sel », lisibles de Léa, quand Léa passe
« Lieux » en arbre et déplie « Port-Sel », alors elle voit « La Taverne du Kraken » dessous.
- Étant donné « Port-Sel » et « Havre-Gris » de sous-type « Port », et « Port-Noir » de sous-type
  « Port » que Léa ne lit pas, quand Léa filtre « Lieux » sur « Port », alors elle voit « Port-Sel » et
  « Havre-Gris », et le filtre dit « Port (2) ».

### Ce que `kanevas-import-arbre` construit (E-8 arbre, E-9 fil, « Contient », « Déplacer sous… »)

*Précisions de la tranche, sur le cadre ci-dessus (AD-99, AD-115) ; la maquette de E-9 est `e09-fiche-importee.html`
(`#etat-deplacer`), l'arbre n'en a pas.*

**Arbre (E-8).** L'adresse ne change pas ; le choix « Grille / Arbre » est gardé par type sous la clé
`kanevas:vue-liste:<univers>:<type>` du navigateur (`localStorage`, valeurs `grille`, `arbre`) ; absent : la grille.
La liste est un `role="tree"`, chaque nœud un `role="treeitem"` avec `aria-expanded` quand il a un chevron et
`aria-level` ; le chevron est un bouton (`aria-label` « Déplier » / « Replier ») distinct du lien vers la fiche ;
au clavier, flèche droite déplie, flèche gauche replie, Entrée ouvre. Déplier appelle
`GET …/fiches?type=T&parent=<id>` ; replier garde ce qui est chargé, le déplier de nouveau ne rappelle pas.
Les racines sont `…&parent=racine` ; « Charger la suite » charge la page suivante d'un nœud ou des racines.
Un nœud sans enfant lisible du même type n'a pas de chevron (le champ `aDesEnfants`). La ligne d'un nœud :
icône du type, titre, sous-type (`--texte-3`), et « dans « La Guilde des Brumes » » quand `dans` est rendu.
Au téléphone, l'indentation vaut 12 px par niveau, plafonnée à 6 niveaux ; la ligne ne passe pas sous 44 px de haut.
En mode Joueur d'un MJ, la bascule garde son choix et l'arbre se recharge sous le mode. Un filtre de sous-type ou une recherche rend la grille ; vider le filtre ou la recherche rend l'arbre si c'était le choix mémorisé. Un nœud déplié dont la fiche devient illisible entre deux lectures disparaît à la lecture suivante (404 : « Impossible de charger la suite. »). Un parent « en attente » de l'import (AD-104) est compté, avec les liens en attente, dans la ligne « liens et références en attente » de E-18 ; le rejeu qui le pose se voit dans l'arbre.

**Fil d'Ariane (E-9).** `ancetres` vient de la vue de la fiche ; chaque ancêtre est un lien vers sa fiche ; une
fiche sans ancêtre lisible a le fil de toujours. Plus de trois ancêtres : le premier, « … » (un menu qui liste
les autres, avec leur type), les deux derniers. Le retour par le fil (P-12 étape 5) est ce lien : aucun état
particulier. Un ancêtre qui devient illisible entre deux lectures n'est plus dans le fil à la lecture suivante.

**« Contient » (E-9).** Le bloc suit les textes de `Contient` plus haut. Il appelle
`GET …/fiches/:fid/enfants` une fois la fiche chargée, indépendamment des sections (la fiche et ses sections arrivent en une réponse, « Contient » dans une seconde) : son erreur ne retire pas le
texte. Ses états : *chargement* « Chargement… » sous le titre du bloc ; *erreur* « Impossible de charger les
enfants. » avec « Réessayer » ; *vide* le bloc est absent ; *contenu long* 50 puis « Afficher les N suivants »
(N = ce que la page suivante compte, jamais un total) ; l'échec de cette suite dit « Impossible de charger la suite. » sans retirer ce qui est affiché ; connexion perdue : le bandeau, le bloc chargé reste ; fiche supprimée entre-temps (404) : le bloc disparaît. Une fiche sans section lisible mais avec des enfants lisibles montre quand même « Contient ». Chaque enfant montre l'icône, le titre et le sous-type (« Taverne »). En mode Joueur le bloc se relit sous le mode.

**« Déplacer sous… » (E-9).** La boîte est celle de `#etat-deplacer`. Le champ cherche dans la liste de
recherche existante (`GET …/fiches?q=`, sans `type`, 300 ms après la frappe, 1 caractère au moins, 100 au plus) ;
la fiche elle-même est écartée de la liste ; une ligne montre l'icône du type, le titre et le sous-type (« Lieu · Sphère »), et la recherche porte sur le titre seul (le placeholder « Titre ou alias » de la maquette est celui de E-17 : ici le champ dit « Chercher une fiche ») ; « 1 caractère au moins, 100 au plus » vise la saisie, la liste rend 100 lignes au plus puis « Charger la suite », et défile dans la boîte ; avant toute saisie la liste dit « Tapez le début d'un titre. » ; une saisie sans résultat dit « Aucune fiche ne correspond. », la recherche en cours « Recherche… », son échec « Impossible de chercher. » avec « Réessayer » ; « Aucun parent » est la première ligne et met la fiche à la racine.
« Déplacer » reste inactif tant qu'aucune ligne n'est choisie (la maquette le montre actif parce qu'un choix y est déjà fait) ; le refus s'écrit sous le champ ; il envoie `PATCH …/fiches/:fid` `{parent}`. Réponses :
succès (200, la fiche en réponse) → la boîte se ferme, le fil se recharge et le toast dit « Fiche déplacée. » ; 400 `cycle` → le texte
« Une fiche ne peut pas être rangée sous l'un de ses descendants. » sous le champ, la boîte reste ouverte ;
400 `trop_profond` → « La hiérarchie est trop profonde. » et 404 → « Introuvable. », tous deux sous le champ comme le cycle ; connexion perdue →
bandeau, « Déplacer » désactivé. La boîte n'existe que pour un MJ hors mode Joueur, et le menu « ⋯ » est absent pour un Joueur. Une fiche de tout type peut être parent ou enfant, un compte-rendu compris (AD-99) : « Déplacer sous… » existe aussi pour lui (MJ seulement : un Joueur, même auteur de son compte-rendu, n'a pas le menu « ⋯ ») ; E-13 ne montre pas la hiérarchie et ne change pas.

*Critères de la tranche* (les données sont celles du semis, `docs/ecrans.md` plus haut) :
- Étant donné « Les Sphères » (lieu MJ seul) dont « Port-Sel » est l'enfant, quand Léa ouvre « Lieux » en arbre,
  alors « Port-Sel » est une racine sans « dans … » (son parent est illisible) ; Antor, lui, voit « Les Sphères »
  racine, et « Port-Sel » dessous.
- Étant donné « Le Repaire des contrebandiers » (MJ seul) sous « Port-Sel », quand Léa déplie « Port-Sel », alors
  elle voit « La Taverne du Kraken », « Les Docks », « Le Phare aux Sels » et « Quartier des Cordiers », pas le Repaire,
  et aucun nombre ne lui dit qu'il existe.
- Étant donné un enfant d'un autre type sous « Port-Sel » (un événement lu des joueurs ; le semis du bouchon n'en pose pas, il se crée ou s'importe pour ce critère), quand Léa déplie
  « Port-Sel » dans « Lieux », alors cet enfant n'y est pas ; il est dans « Contient » de « Port-Sel », et dans
  « Événements » il porte « dans Port-Sel ».
- Étant donné une réponse de `GET …/fiches?type=lieu&parent=racine` pour Léa, alors aucun champ ne porte le titre,
  l'identifiant ou le nombre d'une fiche qu'elle ne lit pas (`dans` est `null` si le parent est illisible).

### E-17 Recherche

*Maquette finie* : `docs/maquettes/e17-recherche.html` (MJ, Joueur, mode Joueur, étiquette, savoir, états).

Adresse `/univers/:id/recherche?q=…&type=…&etiquette=…`. Un champ en tête (focus à l'ouverture,
1 à 100 caractères, sans bouton : la recherche part à la frappe ou à Entrée), dessous deux rangées de filtres : les **types** (pastilles à icône, « Tous » par
défaut ; **seuls les types activés** ont leur pastille, B-42 — une fiche d'un type désactivé reste un
résultat sous « Tous ») et les **étiquettes** (une liste à
compléter, celles des fiches que le compte voit). Les résultats : la ligne de E-8 (vignette, icône du
type, titre, badge, sous-type) plus, si la fiche a été trouvée par un alias, « alias : Salport » ; ses étiquettes.
Le champ cherche dans le titre, les alias, le **sous-type** (B-52) et les sections lisibles. **Ordre** : titre, alphabétique sans casse — pas de pertinence ni d'extrait (AD-63 tient : un extrait
est du contenu à filtrer, un classement trahit ce qui est caché). 100 puis « Charger la suite ». Une
étiquette seule, sans mot, liste les fiches qui la portent. **Mode Joueur** (MJ) : la barre haute de
E-17 porte la bascule du cadre (« Mode MJ » / « Mode Joueur ») ; en mode Joueur, la recherche répond comme pour un
joueur qui n'est l'auteur d'aucune section (AD-39, AD-101) — sans blocs MJ, sans fiche qu'un joueur ne
lit pas ; le mode passe par l'adresse (`&mode=joueur`) et suit le MJ qui arrive d'une fiche ouverte en
mode Joueur (« Rechercher », une étiquette).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | une saisie d'espaces seuls ne part pas : l'état de départ reste ; sans saisie ni filtre : « Cherchez un nom, un alias ou un mot. » ; sans résultat : « Aucune fiche ne correspond. » | changer la saisie, retirer un filtre |
| chargement | « Recherche… » sous le champ, les résultats d'avant restent grisés ; à l'ouverture, la rangée des étiquettes attend son appel (aucune pastille, le reste de l'écran est utilisable) ; « Charger la suite » en cours : le bouton est grisé et porte « Chargement… » | — |
| erreur | « La recherche n'a pas abouti. Réessayez. » (le champ et les filtres sont conservés) ; échec de « Charger la suite » : « Impossible de charger la suite. », les résultats restent ; échec de la rangée des étiquettes : elle est absente, sans message ; saisie de plus de 100 caractères (collage, ou adresse `?q=` : le champ ne la bloque pas à la frappe mais refuse l'envoi) : « Erreur : 100 caractères au plus. » | « Réessayer » (pour « La recherche n'a pas abouti. » seulement ; les autres erreurs se corrigent en changeant la saisie, ou disparaissent à la prochaine recherche) |
| connexion perdue | le bandeau de connexion perdue du cadre (texte de la section « Textes communs ») ; le champ reste, la recherche ne part pas ; les résultats déjà affichés restent lisibles, « Charger la suite » est désactivé | — |
| refus | compte sans rôle : « Page introuvable. » ; une fiche illisible n'est jamais un résultat, une étiquette qui ne porte que des fiches illisibles n'est pas proposée | — |
| contenu long | 501 résultats : 100 puis la suite ; titre long tronqué par « … » avec infobulle ; alias de 120 caractères et étiquette de 40 tronqués par « … » avec infobulle ; plus de 4 étiquettes sur une ligne : « +N » ; les rangées de pastilles passent à la ligne ; sur un téléphone (390 px) la rangée des types défile à l'horizontale à l'intérieur de sa rangée, la page jamais | idem |

*Critères.*
- Étant donné le mot « sous-main » présent seulement dans le bloc MJ de « Port-Sel », quand Léa
  cherche « sous-main », alors « Port-Sel » n'est pas un résultat ; quand Antor le cherche, il l'est.
  Quand Antor le cherche en mode Joueur, « Port-Sel » n'est pas un résultat.
- Étant donné « Savoir » désactivé dans Lame d'Ébène et « Chronique de l'Âge d'Ombre » (un savoir
  lisible de Léa), quand Léa cherche « chronique », alors elle est un résultat sous « Tous », et aucune
  pastille « Savoirs » n'est proposée.
- Étant donné « Le Pendu Joyeux » de sous-type « Taverne », quand Léa cherche « taverne », alors
  « Le Pendu Joyeux » est un résultat ; sous la pastille « Lieux », seuls des lieux le sont.
- Étant donné le texte de lien « La Guilde des Brumes » écrit dans « Histoire » (lue de Léa) vers une
  fiche que Léa ne lit pas, quand Léa cherche « guilde », alors « Port-Sel » est un résultat et « La
  Guilde des Brumes » n'en est pas un (ce lien est semé par `kanevas-import-liens`, livrée avant la recherche dans l'ordre du plan mais pas sa dépendance : le critère se joue à la recette d'ensemble de l'epic, P-12 étape 4).
- Étant donné « Port-Sel » d'alias « Salport », quand Léa cherche « salport », alors « Port-Sel » est
  un résultat, avec « alias : Salport ».
- Étant donné l'étiquette « Côte des Brumes » posée sur « Port-Sel » et sur « Cercle des Cendres »
  (illisible de Léa), quand Léa filtre sur elle, alors seul « Port-Sel » est rendu.

### La recherche — ce que `kanevas-import-recherche` construit

- **Fichier et adresse** : `frontend/src/ecrans/recherche.tsx` (un `Ecran` du registre), adresse `/univers/:id/recherche`. L'entrée « Rechercher » (`search`) est la **première** de `items.ts`, avant « Vue d'ensemble », et ne montre qu'avec l'écran enregistré. Le raccourci `/` (hors d'un champ de saisie, d'une boîte ouverte ou de l'éditeur) est posé une fois par le cadre (`useRaccourciRecherche`, appelé dans `Cadre.tsx`) et navigue vers l'adresse ci-dessus ; hors d'un univers il ne fait rien.
- **Saisie** : la recherche part 300 ms après la dernière frappe ou à Entrée, et à chaque changement de pastille ; une saisie plus courte que 1 caractère utile ne part pas ; l'adresse suit l'état (`?q=&type=&etiquette=&mode=`, remplacement d'entrée d'historique, pas d'empilement). Une seule requête est en vol : la plus récente gagne.
- **Pastilles de types** : « Tous » puis les types **activés** (ordre de la liste du produit) ; une seule à la fois. Pastilles d'étiquettes : celles que renvoie `GET /api/univers/:id/etiquettes` (nom, ordre alphabétique sans casse), une seule à la fois ; retirer la pastille active la ré-appuie. Une adresse qui nomme un type ou une étiquette inconnus ou non proposés les ignore (pas d'erreur).
- **Mode Joueur** : la bascule du cadre (`cadre-contexte`), qui reste affichée avec la navigation du MJ ; le mode part en `?mode=joueur` de toute requête de cette tranche (liste, étiquettes proposées, écriture d'étiquetage) ; le MJ qui arrive d'une fiche en mode Joueur garde le mode (`&mode=joueur` posé par le lien « Rechercher » et par les pastilles d'étiquette de E-9). Un non-MJ n'a pas la bascule et l'adresse `mode=joueur` n'y change rien.
- **Alias et étiquettes de la boîte** : à l'enregistrement, « Enregistrer » est grisé et porte « Enregistrement… » jusqu'à la réponse ; pas d'état de chargement à l'ouverture (la boîte s'ouvre sur les valeurs déjà lues) ; 20 alias de 120 caractères et 20 étiquettes de 40 : les pastilles passent à la ligne et la boîte défile verticalement ; permission : la boîte n'existe pas pour un joueur ni en mode Joueur (menu sans l'entrée, rien à refuser).
- **Touche `/`** : critère de la tâche E-17 ; elle ne fait rien dans un champ, un éditeur, une boîte ouverte ou hors d'un univers.
- **Résultat** : lien vers E-9 ; l'alias n'est montré que si le **titre ne correspond pas** aux mots et qu'un alias y correspond (le premier par ordre alphabétique) ; les étiquettes de la fiche suivent, chacune ré-applique le filtre. Les pastilles d'étiquettes proposées et celles d'une fiche ne comptent jamais une fiche illisible.
- **E-9** : sous le titre « Aussi appelée … » et les pastilles d'étiquettes (liens vers E-17 `?etiquette=`) ; la boîte « Alias et étiquettes… » enregistre les deux listes d'un coup (« Enregistrer » / « Annuler » ; refus : « Erreur : 20 alias au plus. », « Erreur : 20 étiquettes au plus. », « Erreur : 120 caractères au plus. », « Erreur : 40 caractères au plus. » ; un doublon sans tenir compte de la casse est ignoré à la saisie) ; toast « Alias et étiquettes enregistrés. ». Elle est cachée à un joueur et au MJ en mode Joueur.
- **États de la boîte** : vide (fiche sans alias ni étiquette) : deux champs vides, « Enregistrer » actif (rien à écrire = aucun appel) ; enregistrement refusé par le serveur : « L'action n'a pas abouti. Réessayez. », la saisie reste ; connexion perdue boîte ouverte : le bandeau, « Enregistrer » désactivé, la saisie reste ; « Annuler » ou Échap abandonne la saisie non enregistrée sans demande. La boîte est décrite ici seule (pas de maquette propre : fenêtre de la famille des boîtes de E-9, `e09-fiche-importee.html`).
- **Semis du bouchon** (`KANEVAS_STUB=1`, univers « Lame d'Ébène ») : alias « Salport » et « Port-aux-Sels » sur « Port-Sel » ; étiquette « Côte des Brumes » sur « Port-Sel » et « Cercle des Cendres » (illisible de Léa) ; savoir lisible « Chronique de l'Âge d'Ombre » (sous-type « Récit ») ; le mot « sous-main » seulement dans le bloc MJ de « Port-Sel » (semé par `kanevas-import-secrets`) ; les sous-types « Taverne » (« Le Pendu Joyeux ») et « Récit » viennent de `kanevas-import-types` et de ce semis.

### E-18 Accès par API (MJ)

*Maquette finie* : `docs/maquettes/e18-acces-api.html` (états `#etat-nouveau`, `#etat-jeton-montre`,
`#etat-lot`, `#etat-vide`, `#etat-perdue`).

Atteint par « Univers ▸ Accès par API » (`key-round`), MJ seul. Le bouton « Demander à Kanevas » de la maquette est celui de l'assistant, présent sur tous les écrans (B-26, E-12), sans rien de propre à E-18. Une introduction d'une ligne :
« Un jeton permet à un script d'écrire dans cet univers avec vos droits, par l'API d'import. » et
l'**adresse de base** à copier (`https://kanevas.berard.me/api/import/v1/univers/<id>`, « Copier »,
toast « Adresse copiée. »). Deux panneaux.

1. **Jetons** — « Nouveau jeton » (`plus`). Une ligne par jeton, actifs d'abord puis révoqués et expirés
   (les 20 derniers) : nom, « créé par antor le 11 oct. 2026 », « dernier usage il y a 3 min » ou
   « jamais », « expire le 10 nov. 2026 » ou la pastille « Révoqué » (danger) / « Expiré » (neutre), les infos séparées par « · » au bureau ; « Révoquer » au
   survol (visible au toucher). *Nouveau jeton* : boîte « Nouveau jeton » — « Nom » (1 à 80 caractères,
   obligatoire), « Durée » (bascule segmentée 7 jours, **30 jours**, 90 jours, 1 an), « Créer le
   jeton », « Annuler » ; puis la même boîte montre le nom du jeton en étiquette et le jeton seul, en chasse fixe, pleine largeur, puis l'encadré (`circle-alert`) « Il ne sera plus jamais affiché. Rangez-le dans la configuration de votre
   script. », et au pied « Copier » (toast « Jeton copié. ») et « J'ai copié le jeton » — tant que le jeton est montré, seul ce bouton ferme la boîte
   (ni Échap ni le voile) ; la ligne du jeton arrive alors en tête de la liste. Le jeton d'un MJ qui n'a plus ce rôle (B-46) reste listé, avec la pastille « Inactif »
   et l'infobulle « Son créateur n'est plus MJ de cet univers. » (au toucher, la même phrase s'écrit sous la ligne) ; il reste parmi les jetons actifs, rangé avec eux par date de création ; « Révoquer » reste possible. Pendant « Créer le
   jeton » et « Révoquer le jeton » le bouton est désactivé et dit « Création… » / « Révocation… » (pas de double envoi) ; « Annuler » et la fermeture de la boîte sont désactivés aussi jusqu'à la réponse. La maquette ne dessine ni « Inactif » ni ces boutons : le texte d'ici fait foi (pastille neutre, en `--texte-2` ; « Révoqué » est en teinte danger, « Expiré » neutre). *Révoquer* : boîte « Révoquer « Script Kanka — Mac » ? Le script
   qui l'utilise ne pourra plus rien écrire. », « Révoquer le jeton » (`--danger`) / « Annuler » ; toast « Jeton révoqué. ».
2. **Lots d'import** — les 20 derniers lots, du plus récent : date d'ouverture, jeton, état (« En
   cours », « Clos », « Abandonné » — ouvert depuis plus de 24 h sans écriture), et les compteurs
   **par nature d'objet**, à la suite et séparés par « · », les natures sans objet omises : « Fiches : 498 créées ·
   3 refusées », « Fichiers : 1 140 créés »,
   « Relations : 324 créées », puis « 6 liens et références en attente » et « 1 avertissement ». Dans une
   nature, chaque forme (« créée(s) », « mise(s) à jour », « inchangée(s) », « refusée(s) ») n'est écrite que
   si elle n'est pas nulle : un rejeu sans rien de neuf lit « Fiches : 1 inchangée » (le rapport de l'API,
   lui, rend tous les compteurs, `creees: 0`), et un compte nul d'attente ou d'avertissements est omis
   (la maquette abrège « 6 en attente » ; le texte est celui d'ici). Un `PUT` refusé (400) avec son lot
   counts one refusal and records its origin key and reason (for example, « type « monstre » inconnu de Kanevas »); without a batch it leaves no trace here. A
   ligne se déplie :
   les refus et avertissements, chacun avec la clé d'origine, ce qui est en cause et la raison
   (« section « Vérité » : 112 000 caractères, 100 000 au plus » ; « parent lieu:les-docks inconnu :
   fiche écrite sans parent » ; « section « Notes » modifiée dans Kanevas depuis le dernier import : non
   écrasée » ; « titre modifié dans Kanevas : non écrasé »), en deux groupes titrés par leur compte (« 3 refusées », « 2 avertissements »), 200 au
   plus puis « … et 37 autres ». Un lot sans refus ni avertissement ne se déplie pas. Le jeton,
   l'adresse et les clés d'origine sont en chasse fixe (pile système `ui-monospace`, charte).
   File warnings also include « fichier vide : 0 octet, refusé », « visibilité modifiée
   dans Kanevas : non écrasée » and « nom modifié dans Kanevas : non écrasé ». A pending
   reference warns « fichier « img:quais » inconnu : référence en attente ».


| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun jeton. Créez-en un pour qu'un script écrive dans cet univers. » (aucun jeton du tout ; avec seulement des jetons révoqués ou expirés, la liste les montre, sans ce texte) ; « Aucun lot d'import pour l'instant. » | « Nouveau jeton » |
| chargement | squelettes des deux panneaux | — |
| erreur | « Impossible de charger cette page. » ; nom vide : « Erreur : le nom est obligatoire. » ; création ou révocation qui échoue : « L'action n'a pas abouti. Réessayez. », rien n'a changé (aucun jeton à moitié créé) | « Réessayer » |
| connexion perdue | le bandeau ; « Nouveau jeton » et « Révoquer » désactivés ; si la boîte montre un jeton, il reste affiché jusqu'à « J'ai copié le jeton » | copier |
| refus | Joueur, compte sans rôle, admin sans rôle : item absent, « Page introuvable. » ; rôle retiré pendant la page : « Vous ne pouvez plus gérer l'accès par API de cet univers. » à l'action suivante | « Mes univers » |
| contenu long | nom de 80 caractères tronqué par « … » avec infobulle ; un lot de 501 refus : 200 puis « … et 301 autres » ; plus de 20 jetons : les 20 derniers, les actifs toujours tous | idem |

*Critères.*
- Étant donné Antor, MJ, quand il crée « Script Kanka — Mac » pour 30 jours, alors le jeton s'affiche
  une fois ; après « J'ai copié le jeton », la ligne montre le nom, « jamais » et l'expiration, et la
  valeur n'est plus nulle part à l'écran ni dans une réponse de l'API.
- Étant donné ce jeton révoqué, quand le script appelle l'API d'import avec lui, alors il reçoit 401
  et aucun lot n'apparaît.
- Étant donné un lot clos avec 3 refus, quand Antor déplie la ligne, alors il lit les 3 clés d'origine
  et leur raison.
- Étant donné Léa, Joueuse, quand elle ouvre l'adresse de E-18, alors elle voit « Page introuvable. »
  et l'item n'est pas dans sa barre.

### E-14 et E-15 — « Types de fiche »

*Maquette finie* : `docs/maquettes/e14-types-de-fiche.html` (le panneau de E-14, le panneau de E-15,
états `#etat-sans-systeme`, `#etat-confirmer`, `#etat-joueur`, `#etat-supprimer-univers`).

**E-15 (système)** : un quatrième onglet « Types de fiche » après Règles, Créatures, Objets. Une ligne
par type de la liste du produit (sauf compte-rendu) : icône, nom, et un **interrupteur** « Activé »
(colonne titrée « Système »).
Sous la liste : « Utilisé par N univers. Un univers peut forcer un type à activé ou désactivé dans ses
paramètres. » Basculer enregistre aussitôt (toast « Vaisseau désactivé pour CoF Mini. » ou « Vaisseau activé pour CoF Mini. ») ; tout univers
qui suit le système le voit au chargement suivant. Joueur : la liste, interrupteurs en lecture seule
(« Lecture seule »).

**E-14 (univers)** : un quatrième panneau « Types de fiche », après « Créer un système ». Une ligne par
type : icône, nom, le nombre de fiches de l'univers de ce type (« Aucune fiche », « 1 fiche », « 201 fiches »), et une **bascule
segmentée à trois choix** : « Système · activé » (ou « Système · désactivé » ; « Par défaut · activé »
pour un univers sans système), « Activé », « Désactivé ». Un choix forcé porte un point d'accent à
gauche du nom ; la ligne dit, si le forçage contredit le système, « Le système le désactive. » (ou « Le système
l'active. »). Enregistré au changement, toast « Vaisseau : activé dans Lame d'Ébène. » (« désactivé »,
« suit le système »). Désactiver (par forçage ou en suivant) un type qui a des fiches demande
confirmation : « Désactiver « Lieu » dans Lame d'Ébène ? Les 201 lieux restent ; on les atteint par un
lien, la recherche ou l'arbre. » (au singulier : « Le seul événement reste ; … »), boutons
« Désactiver » / « Annuler ». Le panneau « Supprimer l'univers » ferme la page, séparé par un filet
`--danger` : « Supprimer l'univers » ouvre une boîte « Supprimer « Lame d'Ébène » ? Tout son contenu —
fiches, sections, fichiers de la médiathèque, campagnes, cartes, jetons — sera effacé, pour tous ses membres. Le
système de jeu reste. » ; un champ « Tapez le nom de l'univers pour confirmer » ; « Supprimer
l'univers » (`--danger`) ne s'active que si le nom tapé est exact (casse comprise). Après : E-1, toast
« Univers supprimé. ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | sans objet : la liste du produit n'est jamais vide ; univers sans système : la colonne « Par défaut · activé » | forcer |
| chargement | squelette du panneau ; les autres panneaux se chargent seuls | — |
| erreur | un changement qui échoue : « L'action n'a pas abouti. Réessayez. » au-dessus du panneau, la bascule revient ; suppression qui échoue : le message dans la boîte, l'univers reste | « Réessayer » |
| connexion perdue | le bandeau ; bascules, interrupteurs, « Supprimer l'univers » désactivés | lire |
| refus | E-14 : Joueur — page introuvable (inchangé) ; E-15 : Joueur — lecture seule ; un MJ qui n'a plus de rôle : « Vous ne pouvez plus modifier ces paramètres. » | — |
| contenu long | E-15 : les mêmes états que ceux de cette ligne et des lignes précédentes de ce tableau (squelette de l'onglet, « L'action n'a pas abouti. Réessayez. », bandeau de connexion perdue qui désactive les interrupteurs, une colonne au téléphone) ; 13 types réglables : la liste tient sans défiler au bureau, une colonne au téléphone (la bascule passe sous le nom) ; nom d'univers de 80 caractères dans la boîte : passe à la ligne | idem |

*Critères.*
- Étant donné « CoF Mini » qui désactive « Vaisseau » et « Lame d'Ébène » qui le force à « Activé »,
  quand Antor ouvre « Lame d'Ébène », alors « Vaisseaux » est dans sa barre ; quand Mira ouvre « Les
  Landes grises » (qui suit le système), il n'y est pas.
- Étant donné « Lame d'Ébène » qui suit le système pour « Note », quand le système réactive « Note »,
  alors « Notes » apparaît dans la barre de « Lame d'Ébène » au chargement suivant.
- Étant donné un univers dont le MJ désactive « Lieu », alors « Lieux » quitte la barre et la création,
  et un lien vers un lieu ouvre toujours sa fiche.
- Étant donné Antor qui tape « lame d'ébène » dans la boîte de suppression de « Lame d'Ébène », alors
  « Supprimer l'univers » reste inactif ; avec le nom exact, l'univers est supprimé, et Léa qui en
  ouvre une adresse voit « Page introuvable. ».

#### Les types — ce que `kanevas-import-types` construit

Le panneau « Supprimer l'univers » de E-14 est à `kanevas-import-tenir` ;
celle-ci construit le panneau et l'onglet « Types de fiche » ci-dessus, et ce qui suit.
La liste des types (identifiant, adresse, libellés, icône) est celle du serveur (AD-120) : les écrans
la lisent par `GET /api/univers/:id/types`, ils n'en tiennent aucune copie. Icônes (Lucide) :
Personnage `users-round`, Lieu `map-pin`, Faction `shield`, Objet `gem`, Événement `hourglass`, Quête
`scroll-text`, Créature `paw-print`, Race `dna`, Vaisseau `ship`, Savoir `lightbulb`, Récit `book-open`,
Règle `scale`, Note `sticky-note` ; adresses de E-8 : `/univers/:id/fiches/<pluriel>` (`creatures`,
`races`, `vaisseaux`, `savoirs`, `recits`, `regles`, `notes`).

**Barre latérale.** La section « Lore » se construit de la réponse : les types activés, dans l'ordre de la
liste. Pendant le chargement, trois lignes de squelette sous le titre « Lore » ; en erreur, la ligne
« Impossible de charger les types. » et « Réessayer » à sa place — le reste de la barre ne bouge pas.
Si aucun type n'est activé (tous désactivés), la section montre « Aucun type de fiche activé. » (et, au MJ,
le lien « Régler les types » vers E-14). Connexion perdue : la barre garde la dernière liste lue ; sans liste
déjà lue, c'est l'état d'erreur.
Après un réglage (E-14, E-15) sur un autre onglet, la barre se met à jour au retour sur l'onglet ou au
prochain chargement, jamais au milieu d'une saisie.

**E-8 — création et sous-type.** La liste « Type » de la fenêtre de création ne propose que les types
activés ; le champ « Sous-type » (facultatif, 60 caractères au plus, « Erreur : 60 caractères au plus. »)
propose, en tapant, les sous-types déjà employés pour le type choisi (titre « Sous-types de lieu déjà
employés ») ; changer le type dans la fenêtre vide le champ. Si le type vient d'être désactivé par un
autre MJ, « Créer » répond « Ce type est désactivé dans cet univers. » dans la fenêtre, rien n'est créé. Le
filtre « Sous-type » n'apparaît que si au moins une fiche lisible du type en porte un ; pendant son
chargement il est désactivé (« Sous-type : … ») ; s'il échoue, « Sous-types indisponibles. » à sa place
et la grille reste utilisable. Si « Créer » échoue : « L'action n'a pas abouti. Réessayez. » dans la fenêtre, la saisie gardée. Contenu long : 40
sous-types distincts : la liste du filtre défile ; un sous-type de 60 caractères est tronqué par une ellipse, entier
dans son infobulle. Un sous-type filtré qui n'a plus de fiche (renommée entre-temps) rend
« Aucune fiche de ce sous-type. » avec « Voir tous les lieux ».

**E-9 — sous-type en place.** Le MJ (hors mode Joueur) clique le sous-type du badge : champ, liste de
complétion, Entrée enregistre, Échap annule (maquette `#etat-sous-type`). Enregistrement en cours : champ
désactivé (aucun libellé). Échec : « Le sous-type n’a pas été enregistré. Réessayez. » sous le champ, la valeur
tapée est gardée. Saved: toast « Sous-type enregistré. »; an emptied field removes the sub-type (« Sous-type retiré. »). Connexion perdue : l'édition est désactivée (le sous-type reste lisible). Contenu long : 60 caractères, tronqués par
une ellipse dans le badge, entiers dans l'infobulle. Un joueur lit le sous-type en
simple texte ; une fiche sans sous-type ne montre rien à un joueur.
*(kanevas-sous-type-dialogue)* **The sub-type shows that it is editable** (GM, outside player mode; mockup
`#etat-sous-type-survol`). At rest, nothing changes. On hover of the sub-type, and when it receives
keyboard focus (it is a button, reached with Tab after the type badge), it takes the
`--surface-3` background (4 px radius) and a pencil icon (`pencil`, 12 px, decorative) appears
after its text — on that background, the pencil and the « Sous-type » label turn `--texte-2` (the charter never puts
`--texte-3` on `--surface-3`); the pointer is the text cursor; keyboard focus adds the charter's focus ring
(2 px `--focus`, offset 2 px). The tooltip says « Modifier le sous-type »; the accessible name is
« Sous-type : Port. Modifier le sous-type » (without a sub-type: « Ajouter un sous-type »).
Where there is no hover (touch screen, `(hover: none)`), the pencil is always visible (charter,
« Les actions secondaires se révèlent au survol et au focus »). A sheet without a sub-type: the label
« Sous-type » in `--texte-3` at rest, with the same hover and the same pencil. The pencil does not push the title:
its room (12 px plus a 4 px gap) is counted in the badge's width, which does not move on hover.
A player, or the GM in player mode: no background, no pencil, no focus — the sub-type is text.
Connection lost: the banner « Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas. »; the sub-type is disabled (`disabled`): no background or
pencil on hover, ordinary cursor, Tab no longer stops on it; everything returns with the connection.
Saving in progress: not applicable to hover — the edit field replaces the sub-type while saving
(field disabled, above), and the modal box « Changer le type… » covers it.
Hover and keyboard focus are two distinct states: hover shows the background and the pencil, without the
ring; keyboard focus shows them with the ring (mockup `#etat-sous-type-survol` and `#etat-sous-type-focus`).

**E-9 — « Changer le type… »** (MJ, hors mode Joueur ; absent pour un compte-rendu) : maquette
`e09-fiche-importee.html#etat-changer-type`. Boîte « Changer le type de « Port-Sel » » : une
liste à choix unique des types, les types activés d'abord, puis le titre « Autres types » avec les
désactivés (« désactivé » en `--texte-3`), le type courant coché et indiqué « (actuel) » ; choisir
« Personnage » ouvre le choix « PJ / PNJ » (PNJ par défaut) ; le champ « Sous-type » (vide d'office pour un
autre type, avec les sous-types déjà employés pour le type choisi). Si la fiche a un sous-type, la boîte dit :
« Le sous-type « Port » sera retiré. » tant que le champ n'est pas rempli. Boutons « Changer le
type » et « Annuler » (pour le seul sous-type, voir plus bas : « Changer le type » est désactivé tant que rien ne diffère). Après : la fiche se recharge sous son
nouveau type, toast « Type changé : Note → Savoir. », le fil d'Ariane et la barre suivent ; ses sections,
relations, places sur une carte et propositions sont intactes.
*(kanevas-sous-type-dialogue — changing the sub-type alone; mockup `#etat-changer-sous-type`.)* On
opening, the current type is ticked and the « Sous-type » field holds the sheet's current sub-type
(empty if it has none), with the completion of the current type. While the type stays the current one:
- the box does not say « … sera retiré. » (that warning exists only for another type, if the sheet has a
  sub-type and while the field stays empty);
- the button stays **« Changer le type »** — the sub-type is part of the type (Monsieur's decision of
  2026-10-29: a label « Enregistrer le sous-type » was proposed and refused); it is disabled while the field, trimmed,
  equals the current sub-type (case counts: « capitaine » replaces « Capitaine »); it enables as soon as
  it differs, an emptied field included when the sheet had a sub-type;
- it sends `PATCH …/fiches/:fid` `{sousType}` (the trimmed text, or `null` for an empty field) — the
  existing route (AD-120), nothing else; on success: the box closes, the header reloads, toast « Sous-type
  enregistré. » (« Sous-type retiré. » for an empty field), the same as the in-badge edit;
- PJ / PNJ is not shown, « Personnage (actuel) » included (it is not changed here, see below).
Choosing another type gives the behaviour of a type change: field emptied, « … sera retiré. » if the
sheet has a sub-type, button « Changer le type ». Going back to the current type restores the field with the
current sub-type and the button « Changer le type » (disabled while nothing differs). Saving in
progress: the button shows its waiting mark « … » (as every button) and the box is frozen. `PATCH` failure: « Le sous-type n'a
pas changé. Réessayez. » in the box, which stays open with the input; 403: the box closes and
« Vous ne pouvez plus modifier cette fiche. » shows; 404: « Introuvable. » in the box; connection lost:
the banner « Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas. », button disabled, input kept. A sub-type over 60 characters: « Erreur : 60 caractères au plus. »
under the field, nothing is sent. Loading: while the types list is not read, the « Sous-type » field is
already there, holding the current sub-type and editable, with « Chargement des types… » shown, and the button stays
disabled even if the field already differs; it enables only once the list is read (its failure: « Impossible de charger les types. »,
above, button disabled). No empty state of its own: the field is filled from the sheet already read, and the types list is
never empty. Failure drawn: mockup `#etat-changer-sous-type-echec`. A Player has neither the « ⋯ » menu nor
the box (hidden, as for « Changer le type… »).
Le choix PJ / PNJ n'apparaît que pour **devenir** un personnage ; le PJ / PNJ d'un personnage existant ne se
change pas ici. Chargement : tant que la liste des types n'est pas lue, la liste de la boîte dit « Chargement des
types… » et « Changer le type » reste désactivé. Contenu long : un titre de 120 caractères passe à la ligne dans
le titre de la boîte ; un sous-type de 60 caractères est tronqué par une ellipse dans le badge, entier dans son
infobulle et dans le champ. Échecs : « Le type n'a pas changé. Réessayez. » dans la boîte (elle reste ouverte) ; un MJ qui n'a plus de
rôle : « Vous ne pouvez plus modifier cette fiche. » ; connexion perdue : bandeau, bouton désactivé.
Enregistrement en cours : le bouton passe à « Enregistrement… » et la boîte est figée. Échec de lecture de la
liste des types : « Impossible de charger les types. » et « Réessayer » à la place de la liste, bouton désactivé.
La liste des 14 types défile dans la boîte (hauteur bornée) au bureau comme au téléphone, où la boîte occupe
l'écran. Un sous-type de plus de 60 caractères saisi dans le champ : « Erreur : 60 caractères au plus. ». Le
cas « vide » est sans objet : la liste des types n'est jamais vide (fourteen configurable types).
**E-9 — sous-type en place.** La liste de complétion défile au-delà de huit entrées ; sans sous-type déjà
employé pour ce type, elle n'apparaît pas et le champ reste libre.
**E-8 — compte du filtre.** Le compte de « Port (N) » reste toujours visible, jusqu'à 9 999 ; au-delà la
pastille dit « Port (9 999+) ».
**E-14 — bascule d'un type.** Toast, comme celui de E-15 (même composant, maquette `e14` : `.toast`) :
« Vaisseau : activé dans Lame d'Ébène. » / « … : désactivé dans … » / « … : suit le système. ».
**E-15 — « Types de fiche ».** « Utilisé par 0 univers » et « Utilisé par 1 univers » (singulier) sous la liste ;
un nom de système de 80 caractères passe à la ligne dans l'en-tête.
**Rôles (kanevas-import-types).** Joueur : E-9 montre le sous-type en lecture seule ; « Changer le type… » est
**caché** ; le champ « Sous-type » de la création est **absent** (la création n'est pas offerte) ; le lien
« Régler les types » de la barre est **caché**. Admin d'instance sans rôle dans l'univers : il n'a pas la section
« Lore » (la barre n'est celle d'aucun univers pour lui).

La maquette `e08-liste-fiches.html` n'est pas redessinée pour le sous-type : le texte ci-dessus dit où il se pose
(sous le titre de la carte, `--texte-3` ; filtre à côté de la recherche).

*Critères de la tranche* (les critères d'écran ci-dessus restent les siens).
- *(kanevas-sous-type-dialogue)* Given an NPC « Capitaine » in Lame d'Ébène, when Antor (GM, outside player
  mode) opens « Changer le type… », leaves « Personnage (actuel) », replaces the sub-type with « Amiral » and
  clicks « Changer le type », then the box closes, the toast says « Sous-type enregistré. » and the badge
  shows « PNJ · Amiral »; the sheet is still an NPC, under « Personnages ».
- *(kanevas-sous-type-dialogue)* Given that same NPC, when Antor opens « Changer le type… », then the field
  holds « Capitaine », the « Changer le type » button is disabled and the box does not say « … sera
  retiré. »; it stays so while neither the type nor the sub-type changes, and enables as soon as he empties the field.
- *(kanevas-sous-type-dialogue)* Given that same NPC, when Antor empties the field and saves, then the toast
  says « Sous-type retiré. » and the badge shows « PNJ » alone.
- *(kanevas-sous-type-dialogue)* Given that same NPC, when Antor picks « Lieu » then goes back to
  « Personnage », then the field holds « Capitaine » again, « Changer le type » is disabled and the warning is gone;
  picking « Lieu » had emptied the field and shown « Le sous-type « Capitaine » sera retiré. ».
- *(kanevas-sous-type-dialogue)* Given Antor on that NPC, when he hovers the sub-type « Capitaine » of the
  badge, then reaches it with the Tab key, then the `--surface-3` background and the pencil appear (and,
  with the keyboard, the focus ring); Enter opens the in-place edit. Given Léa (player), when she
  hovers « Capitaine », then nothing changes and Tab does not stop on it.
- *(kanevas-sous-type-dialogue)* Given the NPC « Capitaine » and a `PATCH` that fails (500), when Antor
  saves « Amiral » from « Changer le type… », then the box stays open with « Le sous-type n'a pas
  changé. Réessayez. », the field still holds « Amiral », and the badge still says « PNJ · Capitaine ».
- *(kanevas-sous-type-dialogue)* Given the connection lost, when Antor has the box open with « Amiral »
  typed, then the banner « Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant
  qu'elle ne revient pas. » shows, « Changer le type » is disabled and the input stays; with the box
  closed, the badge's sub-type is disabled: no background or pencil on hover, Tab does not stop on it.
- *(kanevas-sous-type-dialogue)* Given the types list not yet read, when Antor opens « Changer le
  type… », then the « Sous-type » field is already there holding « Capitaine » and can be typed in,
  « Chargement des types… » shows, and « Changer le type » stays disabled — even once « Amiral » replaces
  « Capitaine » — until the list is read.
- *(kanevas-sous-type-dialogue)* Given the box open on that NPC, when Antor types 61 characters and
  saves, then « Erreur : 60 caractères au plus. » shows under the field, nothing is sent and the badge
  still says « PNJ · Capitaine ».
- Étant donné « Les Cristaux d'Ombre » (Savoir · Ressource), quand Antor la passe en Note, alors elle est
  dans « Notes » sans sous-type, et la boîte l'avait annoncé.
- Étant donné « Lame d'Ébène » où « Note » est désactivé, quand Antor ouvre « Changer le type… » d'une
  fiche, alors « Note » est sous « Autres types » et le choisir fonctionne.
- Étant donné un type désactivé, quand Antor ouvre l'adresse de sa liste, alors elle s'ouvre avec « Ce type
  est désactivé dans cet univers. » et sans bouton de création.

### E-7, E-13, E-5

- **E-7** et les entrées de **E-15** : l'éditeur et le rendu Markdown ci-dessus, avec ce que permet
  chaque texte (« Selon le texte ») : E-7 garde « Lien vers une fiche » ; ni E-7 ni E-15 n'ont
  « Fichier » ni « Bloc MJ » ; E-15 n'a pas de lien vers une fiche.
- **E-13** : l'ordre est la date de création de la fiche, qui est sa **date d'origine** si l'import en
  a donné une (B-50) ; la ligne montre cette date.
- **E-5** (B-51, dernière tranche) : un panneau « Jeton de l'assistant » sous la liste des
  univers — « Aucun jeton posé. » ou « Jeton posé le 11 octobre 2026. » (jamais la valeur) ;
  « Connecter l'abonnement » montre l'adresse d'autorisation (« Ouvrir », « Copier ») et un champ
  « Code » avec « Valider » ; la fenêtre expire au bout de 10 minutes (« La connexion a expiré.
  Recommencez. ») ; un code refusé : « La connexion n'a pas abouti. Recommencez. », l'ancien jeton reste.
  États et maquette : la tranche.

### Clôture de `kanevas-import` (cadrage)

- **Chaque besoin a un écran** : B-32 E-9, E-7, E-15 · B-33 E-9 · B-34 E-9 (et E-17, E-12 pour ce
  qu'ils ne montrent pas) · B-35 E-9, E-8 · B-36 E-9 · B-37 E-17 · B-38 E-9, E-17 · B-39 E-9 · B-40 E-9 ·
  B-41 E-14 · B-42 E-14, E-15, barre · B-43 E-9 · B-44 E-9 · B-45, B-46, B-49 E-18 · B-47, B-48 : **pas
  d'écran, par décision** — le geste est le script, son résultat se lit sur E-18 (B-49) ; AD-53 tient :
  l'écran d'un import est E-18 · B-50 E-9, E-13 · B-51 E-5 · B-52 E-8, E-9, E-17 · B-53, B-54 E-19 ·
  B-55 E-9 (les deux chemins d'ajout), E-19 (le sélecteur) · B-56 : pas d'écran (le script), résultat sur E-19 et E-18 — tient.
- **Chaque écran est atteint par un parcours** : E-17 (P-12), E-18 (P-10, P-11), E-14 et E-15 (P-13,
  P-10), E-9 (P-12, P-14, P-16), E-8 (P-12), E-5 (P-15), E-19 (P-16, P-10) — tient.
- **Chaque rôle a sa colonne** : MJ, Joueur, Admin d'instance pour E-17, E-18 et E-19 (matrice) ; le script
  d'import n'est pas un rôle : il agit comme le MJ du jeton, sur l'API seule — tient.

## Détail de l'écran de `kanevas-import-jeton-assistant`

> **E-5** reçoit un panneau, rien d'autre (B-51, P-15). Maquette finie :
> `docs/maquettes/e05-administration.html` (les états principaux : vide, posé, connexion en cours, échec, expirée, erreur de lecture ; les autres sont décrits par le tableau ci-dessous). Les textes communs
> (chargement, erreur, connexion perdue, refus) sont ceux de E-5 ci-dessus.

**Place.** Un panneau pleine largeur « Jeton de l'assistant », **sous** les deux zones (liste des
univers, membres), visible quelle que soit la sélection d'univers (adresses inchangées :
`/administration`, `/administration/univers/:id`) ; le jeton est de l'instance, pas d'un univers.
Une sélection d'univers ne remet pas le panneau à zéro, une connexion en cours survit au changement
d'univers. Le panneau ne montre **jamais** la valeur du jeton : ni dans une réponse, ni dans le DOM,
ni dans un message d'erreur.

**Ce qu'on voit.** Le titre ; une ligne d'état, dans cet ordre de priorité : « Jeton posé le 11 octobre
2026. » (le jeton du fichier du volume, date de sa pose), « Jeton fourni par le déploiement. » (pas de
fichier, la variable `CLAUDE_CODE_OAUTH_TOKEN` non vide : le panneau ne sait pas depuis quand),
« Aucun jeton posé. » ; le bouton « Connecter l'abonnement » (« Reconnecter l'abonnement » dès qu'un jeton est posé, du fichier
ou du déploiement, dans tous les états ci-dessous). Un admin qui est aussi membre d'un univers voit le panneau comme les autres. Un clic démarre la connexion : l'adresse d'autorisation, en lecture seule, avec « Ouvrir »
(nouvel onglet, `rel="noopener noreferrer"`) et « Copier » (« Copiée. » 2 s) ; un champ « Code » et
« Valider » ; « Annuler » ; la mention « Cette connexion expire dans 10 minutes. » suivie de « Reste 9 min. »
(minutes pleines arrondies au-dessus, « Reste moins d'une minute. » sous la minute ; rafraîchi chaque seconde, sans annonce
vocale ; à 0 la phrase d'expiration remplace le champ). Recharger la page ne rouvre pas la connexion : le panneau repart de l'état lu, sans adresse ni champ « Code » ; la connexion du
serveur vit jusqu'à son expiration. Quand un admin clique « Connecter » (le même après un rechargement, ou un second admin), le
serveur en démarre une nouvelle qui remplace la précédente, et le « Valider » de l'ancienne reçoit alors « La connexion a expiré.
Recommencez. ». « Valider » est désactivé tant que le champ est vide. Le code collé n'est pas conservé : le
champ est vidé après chaque validation. Le jeton posé prime sur la variable : un jeton du volume se
remplace par une nouvelle connexion, jamais par un champ de saisie (il n'y en a pas).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide (aucun jeton) | « Aucun jeton posé. » ; sous le titre : « L'assistant est indisponible tant qu'aucun jeton n'est posé. » (affichée seulement si l'assistant n'a vraiment aucun moyen de répondre ; sous le bouchon, où l'assistant répond déjà, rien) | « Connecter l'abonnement » |
| posé | « Jeton posé le 11 octobre 2026. » (ou « Jeton fourni par le déploiement. ») ; « L'assistant est disponible sur tous les univers. » (le jeton est de l'instance : voulu aussi pour le jeton du déploiement) | « Reconnecter l'abonnement » |
| chargement | « Chargement de l'état du jeton… » (lecture de l'état) ; « Connexion en cours… » pendant le démarrage (le bouton désactivé, `aria-busy`) | — |
| connexion en cours | l'adresse, « Ouvrir », « Copier », le champ « Code », « Valider », « Annuler », le temps restant | coller le code, valider, annuler |
| validation en cours | « Validation… », champ et boutons désactivés | — |
| posé à l'instant | « Jeton posé le 11 octobre 2026. » (région `role="status"`), le champ disparaît ; l'assistant est disponible sans redéploiement ni redémarrage | « Reconnecter l'abonnement » |
| échec | code refusé : « La connexion n'a pas abouti. Recommencez. » ; l'ancien état (posé ou non) reste affiché, le champ est vidé, la connexion en cours est terminée côté serveur | « Connecter l'abonnement » (« Reconnecter » si un jeton est posé) |
| échec de validation autre (serveur injoignable, 5xx) | « L'action n'a pas abouti. Réessayez. » ; le champ est vidé, la connexion reste ouverte tant qu'elle n'a pas expiré | coller de nouveau, annuler |
| expirée | au bout de 10 minutes, ou serveur redémarré : « La connexion a expiré. Recommencez. » ; l'ancien état reste | « Connecter l'abonnement » (« Reconnecter » si un jeton est posé) |
| erreur de lecture | « Impossible de charger l'état du jeton. » avec « Réessayer » ; le reste de la page reste utilisable | « Réessayer » |
| erreur de démarrage | « La connexion n'a pas pu démarrer. Réessayez. » (le programme `claude` ou `script` absent, ou aucune adresse rendue en 30 s — y compris une adresse sur un hôte autre que claude.com, claude.ai, anthropic.com et leurs sous-domaines, que le filtre écarte, AD-112) ; aucun détail technique | « Connecter l'abonnement » (« Reconnecter » si un jeton est posé) |
| connexion perdue | le bandeau ; « Connecter l'abonnement » (« Reconnecter » si un jeton est posé), « Valider » et « Annuler » désactivés ; l'état chargé reste | lire |
| refus | tout compte hors du groupe : la page entière est « Page introuvable. » (E-5 ci-dessus) ; une route du panneau sans le groupe répond 404 comme une adresse inconnue | « Mes univers » |
| contenu long | l'adresse d'autorisation (plus de 200 caractères) se replie sur plusieurs lignes dans une zone qui défile, sans élargir la page ; le champ « Code » accepte 500 caractères au plus | idem |

**Clavier et lecteur d'écran.** Le panneau est un `section` titré ; l'ouverture de la connexion place
le focus sur le champ « Code » ; à l'expiration ou à l'échec le focus revient sur le bouton « Connecter
l'abonnement » ; les messages d'état sont dans une région `aria-live="polite"`, sauf le temps restant.

*Critères.*
- Étant donné Admin (groupe `parents`) et un bouchon sans jeton, quand il ouvre `/administration`, alors le
  panneau dit « Aucun jeton posé. » ; quand il clique « Connecter l'abonnement », alors il voit une adresse
  d'autorisation, un champ « Code » et « Valider » désactivé.
- Étant donné la connexion ouverte, quand Admin colle `bouchon` et valide, alors il voit « Jeton posé le
  <date du jour>. » ; la disponibilité de l'assistant, lue **sans** `KANEVAS_STUB` (config injectée),
  est `claude-agent`, sans redémarrage ; aucune réponse des routes du panneau ne contient la valeur du
  jeton (le test cherche la valeur factice dans chaque corps et dans le journal).
- Étant donné la connexion ouverte, quand Admin colle un autre code, alors il voit « La connexion n'a pas
  abouti. Recommencez. » et l'état d'avant (posé ou non) est inchangé ; un second essai valide s'ouvre.
- Étant donné la connexion ouverte et l'horloge passée au-delà de 10 minutes, quand Admin valide, alors il
  voit « La connexion a expiré. Recommencez. » ; le processus est arrêté.
- Étant donné un jeton posé par le panneau et une variable `CLAUDE_CODE_OAUTH_TOKEN` différente, alors
  l'assistant utilise celui du fichier ; après suppression du fichier, la variable reprend.
- Étant donné une connexion ouverte, quand Admin recharge la page, alors le panneau montre l'état lu (« Aucun jeton posé. » ou « Jeton posé… ») sans adresse ni champ « Code » ; quand il clique « Connecter l'abonnement », alors une nouvelle adresse paraît ; et le « Valider » d'un second onglet resté sur l'ancienne connexion dit « La connexion a expiré. Recommencez. ».
- Étant donné le panneau affiché, quand le réseau est coupé, alors « Connecter l'abonnement » (ou « Reconnecter »), « Valider » et « Annuler » sont désactivés et le bandeau s'affiche ; au retour du réseau ils se réactivent.
- Étant donné Léa (hors du groupe), quand elle appelle une route du panneau, alors elle reçoit 404.

## Screen details for `kanevas-scenarios`

> Decision of Monsieur, 2026-10-25: campaigns and scenarios are sheets of the « Aventure » type
> (B-58 to B-62). No new screen: E-8 and E-9 gain what the type needs, E-6 and E-7 are retired,
> E-3 and E-13 read adventures. Same six states and common texts as the other screens. New text
> in English, as the repository's canon asks; the labels shown to the user stay French.

**Format.** Web, desktop and phone, as the rest of Kanevas; nothing specific to the type.

**Information architecture.** One object for the user: an **aventure** (his words: « ma
campagne », « le scénario de samedi »). The type's name is « Aventure » (decision of Monsieur, 2026-10-25) — a campaign, a scenario
and a one-shot are all one, and « Aventures » reads well in the bar next to « Personnages » and
« Lieux »; « Intrigue » (narrower) and « Partie » (a session, not a story) were set aside. A campaign holds scenarios (the tree: a scenario's
parent is its campaign); a one-shot stands at the root. An adventure has a **status** (« En
préparation », « Prête », « En cours », « Terminée »), sections like any sheet, and two blocks of
its own: « Préparation » and « Comptes-rendus ». Vocabulary: « Aventures » in the bar, « Campagne »
and « Scénario » as sub-types, « Statut » for the play status (never « état », which the sheets'
sections use for their audience).

**Navigation.** The « Campagnes » entry of the bar disappears; « Aventures » (`flag`) appears in
the Lore bar like every activated type (it is `reglable`, activated by default); « Comptes-rendus »
stays. The addresses `/univers/:id/campagnes`, `/univers/:id/campagnes/:cid` and
`/univers/:id/scenarios/:sid` answer « Page introuvable. » (the data moved: the migration gives
the adventure's sheet address to nobody, there is no redirection table — decided, no production
campaign exists).

### E-8 — the « Aventures » list

The list of the type, as for any type, with these specifics:

- **Default view: the tree.** The first visit shows the tree (campaigns at the root, scenarios
  under them); the Grille/Arbre choice is remembered per type as today. A sub-type, status or
  search filter renders the grid.
- **Creation window** « Nouvelle aventure »: « Titre » (1 to 120), « Sous-type » with the
  suggestions « Campagne » and « Scénario » (free text, as B-52), « Dans » — the parent, an
  adventure of the universe, optional —, and « Visible des joueurs » (a checkbox, **unchecked by
  default whatever the sub-type**: an adventure in preparation is the GM's alone — decision of
  Monsieur, 2026-10-25 —; checked, it opens the first section « Présentation » to the players,
  « Les joueurs la lisent »; the section is created empty in both cases, and the GM opens or closes
  it later from the section's audience, as for any sheet). « Créer l'aventure » leads to E-9 (the window sends one call: the parent and the empty « Présentation » section ride with the creation, AD-128 — a failure leaves nothing created). The
  status is « En préparation » at birth, never asked here.
- **Card and tree line**: the status badge (`Pastille`, neutral for « En préparation », the
  charte's accent for « Prête », success for « En cours », muted for « Terminée »; label the
  status itself), next to the sub-type; on a card **and on a tree line**, for the GM in GM mode,
  the badge is a menu that sets the status in place (the four values; the card or the line
  redraws; « L'action n'a pas abouti. Réessayez. » on failure, status unchanged). A player sees
  the badge, never the menu.
- **« Statut » filter**, next to « Sous-type », for every reader: « Tous », then the four
  statuses; kept in the address (`?statut=en_cours`), combined with the sub-type, the search and
  the visibility filter (B-57); a filtered status renders the grid; empty: « Aucune aventure avec
  ce statut. » with « Voir toutes les aventures ».

| State | What is shown | Available actions |
|---|---|---|
| empty | GM: « Aucune aventure pour l'instant. » and « Nouvelle aventure »; player: « Aucune aventure à voir pour l'instant. » | GM: create |
| loading | « Chargement des fiches… » | — |
| error | « Impossible de charger les fiches. » ; status change failed : « L'action n'a pas abouti. Réessayez. », badge unchanged | « Réessayer » |
| offline | the banner; « Nouvelle aventure », the status menus and the filters disabled | open a listed sheet |
| refusal | a player: adventures he reads only (a scenario with no open section is absent) ; the status menu: absent (**hidden**) ; `?statut=` with an unknown value in the screen's address: ignored (« Tous »; the API answers 400) | — |
| long content | 100 then « Charger la suite » ; a campaign with 60 scenarios: the tree node pages like any node ; a 120-character title: the card and the tree line wrap it, the badge and the sub-type stay on their own line | same |
| writing | a status menu between the choice and the server's answer: disabled, the old badge kept; the new badge appears only on success | — |
| GM in player mode | the player's column: no status menu on a card or a tree line, no « Nouvelle aventure » | read |
| no results | a search or a sub-type, alone or combined with a status, that matches nothing: « Aucune aventure ne correspond. » with « Voir toutes les aventures »; « Aucune aventure avec ce statut. » only for a status alone (the search wins when both apply) | same |

*Creation window, states.* « Titre » empty or over 120 characters: « Donnez un titre de 1 à 120 caractères. », « Créer l'aventure » disabled. While the creation is sent: « Créer l'aventure » disabled, the input kept. « Dans » lists the adventures the GM reads (a title of 120 characters is cut with an ellipsis, the full title in its tooltip; with 200 adventures the field is a search-as-you-type list showing 20 at a time; an universe with none: the field reads « Aucune aventure » and stays empty, optional). Creation failed (server or lost connection): « L'action n'a pas abouti. Réessayez. », the window stays open with its input, nothing created (AD-128); while lost, « Créer l'aventure » is disabled. A scenario readable by a player whose campaign is not: the tree shows it at the root, as for any sheet whose parent is unreadable (the tree rule of E-8), never its parent's title.

*Coexistence.* Delivered: the type, E-8, the status line of E-9, the blocks « Préparation » and « Comptes-rendus », the retirement of E-6, E-7 and of the « Campagnes » entry, E-3 (« Campagnes en cours », « Préparation »), the « Campagne » line of E-13 and the deletion report (`kanevas-scenarios-suivi`). The mock-up `e09-aventure.html` shows a few details this text does not keep (status badge « Acte II · Prête » and a count in « Contient », « MJ seul » and « 4 à faire » on « Préparation », author and date per CR line, title « Statut de l'aventure »): the document prevails.

*Criteria.* Given Antor, GM, when he creates « La Couronne brisée » (sub-type « Campagne », « Visible des
joueurs » left unchecked), E-9 opens a sheet « En préparation » whose
« Présentation » section is closed to players, and Léa does not see it in « Aventures »; when he
opens « Présentation » to players, Léa sees it with its status. Given Antor, when he creates « Acte II — Le sceau brisé »
(sub-type « Scénario », in « La Couronne brisée »), the sheet is created under the campaign in the tree, its
section closed to players, and Léa sees it in neither the tree nor the grid. Given
Antor, when he chooses « En cours » in the menu on the « La Couronne brisée » card, the
card shows « En cours » without reloading and « Statut » ▸ « En cours » lists only that adventure. Given
Léa, player, when she opens « Aventures », she sees « La Couronne brisée · En cours » and
no status menu.

### E-9 — an adventure's sheet

The sheet of any type, with:

- **The status in the header**: a line « Statut : En cours » (registry of the header lines, by
  type) — for the GM in GM mode, a menu that sets it in place, the same four values, written
  whole (no version: the last write wins, two tabs show the last one at their next reload); for a
  player, the badge alone. The sub-type badge stays where it is.
- **Two blocks of the sheet**, above the sections, in this order — the mechanism is a registry
  of **sheet blocks by type** (AD-124), distinct from the section blocks:
  - « **Préparation** » — GM only, hidden in player mode: the five categories, « Ajouter »
    (label of 1 to 200 characters, category), tick and untick (open tasks by ascending id within a category), « Cochées (n) » folded; empty:
    « Rien à préparer pour l'instant. ». On a scenario as on a campaign.
  - « **Comptes-rendus** » — every member: the CR that name this adventure, most recent first,
    100 then « Charger la suite », each a link to its sheet; « Nouveau compte-rendu » (title,
    text) creates it as before (AD-61) and opens it; empty: « Aucun compte-rendu pour
    l'instant. » with the button. A player sees the CR he reads.
- **« Contient »** (the existing children block, after the sections and the two blocks above — not before « Présentation » as the mock-up has it) lists the scenarios of a campaign, each as the type icon, the title and « · sub-type »: nothing to
  add; « Déplacer sous… » moves a scenario to another campaign.
- Deleting an adventure follows the sheets' rule (E-9 ⋯ Supprimer, AD-119): the confirmation
  counts, besides what every sheet counts, « n tâches de préparation supprimées », « m scénarios
  qui passent à la racine » and « k comptes-rendus qui resteront sans aventure »; its scenarios
  go to the root (the tree's `ON DELETE SET NULL`), its tasks go with it, its comptes-rendus stay
  and show « Aventure supprimée » in their « Campagne » line — **to the GM only** (a GM in player mode reads it as a player does, so nothing): the server names a
  deleted adventure (an id that matches no sheet) to a GM, and sends nothing for it to anyone else, so
  a player cannot tell a deleted adventure from one closed to him (no existence leaks, AD-64).

| State | What is shown | Available actions |
|---|---|---|
| empty | a new adventure: its empty « Présentation » section, « Préparation » empty (GM), « Comptes-rendus » empty with the button | write, tick, create a CR |
| loading | the sheet's ; each block « Chargement… » in place | — |
| error | the sheet's ; a block that fails: « Impossible de charger ce bloc. » with « Réessayer », the rest of the sheet readable ; status change failed: « L'action n'a pas abouti. Réessayez. » ; « Ajouter », tick or untick that fails: the same text under the block, the field and the tick unchanged ; « Nouveau compte-rendu » that fails: « Le compte-rendu n'a pas pu être créé. Réessayez. », title and text kept in the window (an empty title: « Donnez un titre. » ; a text over 100 000 characters: the ceiling's message) | « Réessayer » |
| offline | the banner; status menu, « Ajouter », ticks and « Nouveau compte-rendu » disabled, an open « Nouveau compte-rendu » window keeps its text and its « Créer » disabled ; the blocks shown stay as last read, not marked stale | read |
| refusal | a player on a scenario with no open section: « Page introuvable. » (the sheet's rule) ; « Préparation » absent for a player and in player mode (**hidden**) ; the status menu absent for a player (**hidden**) | — |
| writing | the status menu between the choice and the answer: disabled, the old status kept | — |
| GM in player mode | the player's view: the status as a badge, no menu, no « Préparation » | read |
| deactivated type | an existing adventure keeps its status line, its menu and its blocks; the type's entry is out of the bar and « Nouvelle aventure » does not exist (as for any deactivated type, on E-8 too) | same |
| long content | a 120-character title with the status line: the line wraps under the title ; 300 tasks: « Cochées (n) » stays folded ; a CR list of 1 000: pages | same |

*Criteria.* Given Antor on « La Couronne brisée », when he adds « Plan de la crypte »
(category « Cartes ») and ticks it, it moves under « Cochées (1) » without reloading, and Léa, on the same
sheet, sees no « Préparation » block. Given Léa on « La Couronne brisée », when she
writes « Séance 12 » through « Nouveau compte-rendu », the report opens (E-9) with « Campagne : La
Couronne brisée », and appears first in the « Comptes-rendus » block and E-13. Given Antor
in player mode on « Acte II », when no section is readable by players, he sees « Aucune section
n'est visible des joueurs. » and no « Préparation » block.

### E-3, E-13, E-12 and E-17

- **E-3**: « Campagnes actives » becomes « **Campagnes en cours** »: the adventures of sub-type
  « Campagne » with status « En cours » that the reader reads, by title, each with its status
  badge; empty: « Aucune campagne en cours. ». « Derniers comptes-rendus » unchanged, except that
  the adventure of a CR is named only to a reader who reads it (the same guard as E-13). « Préparation »
  (GM): the open tasks of the adventures « En cours », grouped by adventure, five per adventure,
  as before; empty: « Rien à préparer pour l'instant. ».
- **States of E-3 and E-13** (the old states of `kanevas-suivi` are the reference, with these texts): E-3 blocks
  « Campagnes en cours » and « Préparation » each load in place (« Chargement… »), fail alone
  (« Impossible de charger ce bloc. », « Réessayer », the other blocks readable), are inert offline
  (the bandeau, links still open); E-13: « Chargement des comptes-rendus… », « Impossible de charger les comptes-rendus. »
  with « Réessayer », offline the list stays and « Charger la suite » is disabled; a CR whose adventure is deleted shows « Aventure
  supprimée » in the column to a GM and an empty column to anyone else; a player's E-13 column is empty (**hidden**) for every CR
  whose adventure he does not read.
- **E-13**: the column « campagne » shows the adventure the CR names (campaign or scenario), as
  a link to its sheet — **to a reader who reads that adventure**; otherwise the column is empty
  for that CR and the « Campagne » line of its sheet (E-9) is absent: the title of a scenario
  closed to the players never leaks through a CR (rule 3 of `docs/donnees.md`), the CR itself stays
  readable. The filter by adventure of the route stays (`?campagne=<fiche id>`), for an adventure
  the caller reads (404 otherwise, like the sheet).
- **Type deactivated** (E-14/E-15, AD-122): exactly what deactivating any type does, nothing
  more — the « Aventures » entry leaves the bar, creating an adventure is refused (E-8; the import warns `type_desactive`); existing adventures stay readable and writable by their
  address and in the search, with their blocks « Préparation » and « Comptes-rendus » and their
  status menu (no data is hidden); the E-3 blocks keep listing the adventures « En cours ».
- **E-12**: the GM creates an adventure through `creer_fiche` (AD-126), with optional sub-type and parent. Its « Fiche « X » créée » block opens E-9; it starts « En préparation », closed to players. The player has no creation tool. To find an adventure the assistant searches with the type « Aventure ».
- **E-17**: adventures are searched like any sheet, their status badge on the result card (a result the reader may not read is absent; a long title wraps with the badge on its own line; the states are E-17's, the badge adds none).

### Mockup

`docs/maquettes/e09-aventure.html` — the sheet of « La Couronne brisée » for the GM: the header
with the sub-type badge and the status menu, the blocks « Préparation » and « Comptes-rendus »
above « Présentation », « Contient » with a plain list of titles (icon, title, sub-type), after the sections. The E-8 tree and
the badges reuse the existing mockup `e08-liste-fiches.html` and the charte's audience badge;
this text is authoritative where they differ.

### Closure

- Each need has a screen: B-58 → E-8, E-9 ; B-59 → E-8, E-9, E-17, E-3 ; B-60 → E-9, E-3 ;
  B-61 → the import API (no screen, E-18 shows the lots) ; B-62 → E-12. Covered.
- Each screen is reached by a journey: E-8/E-9 of adventures by P-3 and P-6 ; the CR block by
  P-4 ; E-3 by P-3 ; E-12 by P-3. Covered.
- Each role has its column: GM and player above ; instance admin: nothing new. Covered.
