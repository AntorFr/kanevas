# Kanevas — écrans

> Doc du produit (voir `docs/parcours.md`). Au cadrage, à grosses mailles : chaque écran, d'où on
> y arrive, à quoi il sert, ce que chaque rôle y fait. Les états de chaque écran et la maquette
> finie se détaillent dans la tranche qui le construit.

> **Construit à ce jour** : E-1, E-2, E-3 (nom, navigation et blocs : système de jeu, campagnes actives, derniers comptes-rendus, préparation pour le MJ), E-4, E-6, E-7, E-13, E-8 (avec la
> recherche dans un type, en grille de cartes illustrées), E-9 (avec les blocs Relations et Pièces jointes et l'illustration en tête), E-12 (Assistant), E-14 (Paramètres), E-15 (Système de jeu, à `/systemes/:sid`), E-16 (Systèmes de jeu), la ligne « Campagne » de E-9, la session
> et la barre latérale. E-5, E-10 et E-11 sont la cible.

## Format

Web. Ordinateur d'abord pour écrire (souris, clavier, glisser des tokens) ; téléphone pour lire
(tactile, une colonne). Thème sombre et clair.

## Navigation

Une barre latérale unique, sur tous les écrans d'un univers :

- en tête, le **sélecteur d'univers** (les univers du compte, son rôle en badge) ;
- **Vue d'ensemble** · **Campagnes** · **Comptes-rendus** · **Cartes** ;
- **Lore** : Personnages, Lieux, Factions, Objets, Événements, Quêtes ;
- pour un MJ : **Univers** ▸ Membres, Paramètres ;
- pour un admin d'instance : **Administration** ;
- en pied, le **compte** : l'avatar et l'identifiant, qui ouvrent un menu — l'identifiant, le
  **thème** (bascule à trois icônes : Clair, Sombre, Système) et « Se déconnecter ». Le thème et
  la déconnexion ne sont pas étalés dans la barre.

Chaque item porte son icône (`docs/charte.md`, « Icônes ») ; l'item courant est marqué. Sur
téléphone (moins de 760 px), la barre est un tiroir sous un bouton « Menu », en tête de la barre
haute.

Au-dessus de chaque écran d'un univers, une **barre haute** : le fil d'Ariane (univers › type ›
fiche ; au téléphone, l'icône du type et le titre seul) et, sur les écrans où elle existe, la
bascule mode MJ / mode Joueur.

Hors d'un univers (E-1, E-2, E-5, E-15, E-16), une barre réduite : **Mes univers**, **Systèmes de
jeu**, **Administration** pour un admin d'instance, et le compte en pied. Depuis un univers, le menu
du sélecteur d'univers mène à **Mes univers** et à **Systèmes de jeu** ; le lien du système de E-3 et
de E-14 mène à sa page (E-15), hors de l'univers (décision du 2026-10-06, AD-94). Un admin qui est aussi membre d'un univers garde le lien
**Administration** dans la barre de l'univers, sous une section « Instance ».

L'**assistant** est un bouton flottant « Demander à Kanevas », sur tous les écrans d'un univers,
hors de la barre ; il n'existe pas hors d'un univers. Un MJ voit la bascule **« Mode MJ » / « Mode Joueur »** dans la barre haute des écrans où la
bascule existe (fiche, carte).

## Inventaire

| Écran | Atteint depuis | Sert à | Parcours |
|---|---|---|---|
| **E-1 Accueil** | connexion ; logo | voir ses univers et son rôle dans chacun ; en créer un ; voir son identifiant | P-1, P-6 |
| **E-2 Créer un univers** | E-1 | nom, description ; le créateur devient MJ | P-1 |
| **E-3 Vue d'ensemble de l'univers** | E-1 ; sélecteur d'univers | les campagnes actives, les derniers CR, la préparation (MJ), les cartes visibles | P-3, P-4, P-6 |
| **E-4 Membres** | nav Univers (MJ) | lister, ajouter par identifiant, changer le rôle, retirer | P-2 |
| **E-5 Administration** | nav (admin d'instance) | lister les univers de l'instance, en gérer les membres — jamais le contenu | P-2 |
| **E-6 Campagne** | nav Campagnes (liste) ; E-3 | liste des campagnes ; pour une campagne : statut, scénarios et « Nouveau scénario » (MJ), préparation (MJ), comptes-rendus, « Nouveau compte-rendu » | P-3, P-4 |
| **E-7 Scénario** | E-6 (MJ) | écrire et relire un scénario | P-3 |
| **E-8 Liste de fiches** | nav Lore | les fiches d'un type que le compte peut lire, en grille de cartes illustrées ; chercher dans ce type ; créer (MJ) | P-3, P-6 |
| **E-9 Fiche** | E-8 ; un token ; un lien ; E-13 | lire et écrire les sections permises ; ajouter, réordonner, retirer une section, régler son audience, relier (MJ) ; déposer, marquer secrète, retirer une pièce jointe ; poser, remplacer, retirer l'illustration (MJ) ; bascule mode Joueur (MJ). Un compte-rendu s'ouvre ici. | P-3 à P-7 |
| **E-10 Cartes** | nav Cartes | les cartes lisibles ; créer une carte illustrée (avec son image de fond) ou un graphe (MJ) | P-3, P-9 |
| **E-11 Carte** | E-10 ; E-3 | carte illustrée : fond, tokens ; graphe : nœuds et liens. MJ : déposer ou changer le fond, placer, configurer, rendre visible, mode Joueur. Joueur : ouvrir la fiche d'un token. | P-3, P-6, P-9 |
| **E-12 Assistant** | bouton flottant, sur tout écran d'univers | converser ; voir ce que l'assistant a écrit, avec un lien ; MJ : propositions de mise à jour (actuel/proposé, **Appliquer**, **Abandonner**), images générées | P-3, P-5, P-6, P-7 |
| **E-13 Comptes-rendus** | nav Comptes-rendus ; E-3 | tous les CR lisibles de l'univers, du plus récent, avec leur campagne | P-4, P-5 |
| **E-14 Paramètres de l'univers** | nav Univers (MJ) | nom, description, système de jeu (choisir dans le catalogue, en créer un) | P-8 |
| **E-15 Système de jeu** | E-16 ; lien depuis E-3 et E-14 | le référentiel commun : règles, créatures, objets ; ajouter, modifier (MJ d'un univers rattaché) ; hors du cadre d'un univers | P-8 |
| **E-16 Systèmes de jeu** | barre réduite ; menu du sélecteur d'univers | les systèmes rattachés aux univers du compte, chacun avec ceux de ses univers qui l'utilisent | P-8 |

Les pages de connexion du serveur (« Connexion refusée », « Connexion indisponible », atteintes
depuis P-1) et le bandeau du mode bouchon sont décrits sous « Session et connexion ».

Hors produit : en mode bouchon seulement (AD-55), l'écran de choix d'un compte de test et le bandeau « mode
bouchon » — sans `E-n` ni six états, ils n'existent pas en production.

## Rôles × écrans × actions

« — » : l'écran n'est pas proposé (absent de la navigation, et 404 si on force l'adresse). E-15 et
E-16 vivent hors des univers : leurs cases disent le rôle dans un univers rattaché au système.

| Écran | MJ | Joueur | Admin d'instance (sans rôle dans l'univers) |
|---|---|---|---|
| E-1 | ses univers, créer | ses univers, créer | ses univers, créer |
| E-2 | créer | créer | créer |
| E-3 | tout | sans préparation ni scénarios | — |
| E-4 | tout | — | — (passe par E-5) |
| E-5 | — | — | tous les univers, leurs membres |
| E-6 | tout | liste, statut, CR, « Nouveau compte-rendu » ; ni scénarios ni préparation (cachés) | — |
| E-7 | tout | — | — |
| E-8 | lire, chercher, créer ; la vignette de chaque fiche (son illustration, ou le repli dessiné) | lire, chercher ; la vignette des fiches qu'il voit | — |
| E-9 | tout ; mode Joueur ; relier et retirer des relations ; poser, remplacer, retirer l'illustration (hors mode Joueur) | sections lisibles ; écrire celles permises ; relations lisibles (section et cible) ; pièces jointes de celles-ci ; voir l'illustration, jamais la poser | — |
| E-10 | tout | cartes visibles | — |
| E-11 | tout ; mode Joueur | lire une carte visible, ouvrir une fiche | — |
| E-12 | catalogue MJ | catalogue Joueur | — |
| E-13 | tous les CR | les CR lisibles | — |
| E-14 | tout | — | — |
| E-15 (hors univers ; les colonnes disent le rôle dans un univers **rattaché au système**) | lire ; « Ajouter … », « Modifier » | lire (« Lecture seule ») ; ni « Ajouter » ni « Modifier » | « Page introuvable. », sauf s'il est lui-même membre d'un univers rattaché : alors la colonne de son rôle là (l'admin MJ d'un univers rattaché lit et modifie) |
| E-16 (hors univers) | ses systèmes, avec ses univers et son rôle | ses systèmes, « Lecture seule » | la liste de ses propres systèmes (comme MJ ou Joueur s'il est membre d'un univers rattaché) ; vide sinon — l'écran est proposé à tout compte |

Précisions de la matrice : créer une campagne, en changer le statut, créer un scénario sont au
MJ seul. L'audience d'une section se règle en ligne sur la fiche (MJ). Créer une fiche ouvre une
fenêtre (type déjà choisi, titre) qui mène à la fiche ; créer une carte se fait en ligne sur
E-10. « Rendre visible » une carte se trouve sur la carte (E-11) et dans la liste (E-10). Le fond d'une carte illustrée se dépose à sa création (E-10) et se change sur la carte (E-11) ;
une carte sans fond montre ses tokens sur un fond neutre. Une
tâche de préparation s'ajoute avec sa catégorie, se coche, se décoche ; elle ne se supprime pas.
Sur E-15, règles, créatures et objets ont le même traitement. Sur E-3, le bloc « Système de jeu » n'existe que si l'univers est rattaché à un système (MJ et Joueur).

Un compte **sans rôle** dans l'univers et qui n'est pas admin d'instance (Teo avant son ajout) a, dans
cet univers, la colonne « Admin » de cette matrice pour les écrans **de cet univers** (E-3, E-4,
E-6 à E-14) : « — », « Page introuvable. » si l'adresse est forcée. Hors des univers, il garde E-1,
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
> long**. « Sans objet » dit sa raison. Les maquettes finies sont `docs/maquettes/e01-*.html`, `e02-*.html`,
> `e03`, `e04`, `e08`, `e09` (thème sombre, gris tertiaire de la charte).

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
  (20 000) est la borne d'une section, lue par l'écran de fiche (AD-91).

### Barre latérale

Sur tout écran d'un univers : en tête le **sélecteur d'univers** (nom, badge du rôle, la liste
des univers du compte, puis « Mes univers » et « Systèmes de jeu » en pied de liste) ; **Vue d'ensemble** ; **Lore** :
Personnages, Lieux, Factions, Objets, Événements, Quêtes ; **Campagnes** et **Comptes-rendus** ; pour un MJ, **Univers ▸ Membres** et **Paramètres** ; en
pied, le compte (avatar et identifiant) qui ouvre le menu du compte : l'identifiant, le thème
(Clair, Sombre, Système, en trois icônes) et « Se déconnecter ». Hors d'un univers (E-1,
E-2, E-5, E-15, E-16) : « Mes univers », « Systèmes de jeu » et le compte en pied. **Un item dont l'écran n'est
pas construit n'est pas affiché** : Cartes et Administration
arrivent avec leurs tranches (Campagnes et Comptes-rendus sont affichés). « Paramètres » (E-14) n'est affiché qu'au MJ. Sur téléphone (moins de 760 px), la barre est un tiroir sous un
bouton « Menu ».

| État | Ce qu'on voit |
|---|---|
| vide | sans objet : l'univers courant est toujours dans le sélecteur ; hors univers, « Mes univers » et « Systèmes de jeu » |
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
en MJ (B-2).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | le formulaire vierge | remplir |
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
| refus | un type inconnu : « Page introuvable. » ; une fiche illisible est absente de la liste | — |
| contenu long | plus de 100 fiches : « Charger la suite » ; titre trop long tronqué par « … » avec infobulle | idem |

*Critère.* Étant donné la fiche « Maître Aldric », dont Léa ne lit aucune section, quand Léa ouvre la
liste des personnages, alors elle n'y voit pas « Maître Aldric ».

### E-9 Fiche

Le titre, le badge du type, puis les **sections** dans leur ordre, chacune un panneau : titre,
contenu en texte brut (AD-58), et un emplacement de **blocs de section** (relations, pièces
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
Pour **modifier** : un champ de texte (20 000 caractères au plus, valeur lue dans `limites.contenuSection` de `/api/moi` ; le serveur la refuse aussi, AD-91), « Enregistrer », « Annuler ».
Enregistrer envoie la version lue (AD-59).

Textes : section sans contenu : « Rien d'écrit pour l'instant. » ; fiche sans section (MJ) : « Cette
fiche n'a pas encore de section. » ; écriture périmée : « La section a changé depuis que vous
l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous. » avec
« Recharger la section » ; droit retiré entre-temps : « Vous ne pouvez plus modifier cette section. » ;
confirmation de retrait : « Retirer la section « Vérité — MJ seul » ? Son contenu sera perdu. » (si elle porte
des pièces jointes : « … Son contenu et ses 3 pièces jointes seront perdus. ») avec
« Retirer la section » et « Annuler ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Cette fiche n'a pas encore de section. » et « Ajouter une section » ; section vide : « Rien d'écrit pour l'instant. » | MJ : ajouter ; qui écrit : « Modifier » |
| chargement | le titre absent, « Chargement de la fiche… » | — |
| erreur | « Impossible de charger cette fiche. » ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », texte conservé | « Réessayer » |
| connexion perdue | le bandeau ; « Enregistrer », audience, ordre, retrait, ajout désactivés ; le texte en cours reste | lire |
| refus | fiche inconnue ou dont rien n'est lisible : « Page introuvable. » ; section non lisible : absente. Un MJ en mode Joueur sur une fiche dont aucune section n'est lisible des joueurs voit « Aucune section n'est visible des joueurs. » (ce que verrait un joueur : « Page introuvable. ») | passer en mode MJ |
| contenu long | une section de 20 000 caractères passe à la ligne et s'affiche en entier ; plus au-delà, dès le 20 001e caractère saisi : « Erreur : 20 000 caractères au plus. » (sous le champ ; « Enregistrer » ne part pas ; le texte saisi est gardé, y compris quand c'est le serveur qui refuse, 400, avec le même texte — pas « L'action n'a pas abouti » ; tant que `/api/moi` n'a pas rendu la limite, ou s'il a échoué, l'écran ne contrôle rien et laisse le serveur répondre) ; titre de fiche (120 caractères) et titre de section (80) : passent à la ligne | idem |

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
- Étant donné Antor qui modifie une section, quand il saisit un 20 001e caractère, alors « Erreur :
  20 000 caractères au plus. » apparaît sous le champ, rien n'est envoyé et son texte reste ;
  quand le serveur refuse malgré tout (400), il voit le même texte et son texte reste.

### Clôture de la tranche

Chaque besoin livré par la tranche (fiche de la feature, `## Livre`, hors de ce dépôt) a son écran : B-2 → E-2 ; B-3 à B-5 → E-4 ; B-7 → E-8 ; B-8 et B-9 →
E-9 ; B-1 et B-28 → session ; B-29 → six états de chaque écran ci-dessus. Chaque écran est atteint
par P-1 (E-1, E-2, E-3), P-2 (E-4), P-3 étape 4 et P-6 (E-8, E-9), P-7 (E-9). Les trois rôles ont
leur colonne dans la matrice du cadrage ; l'admin d'instance n'a, dans cette tranche, que E-1 et
E-2.

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

Trois panneaux, dans cet ordre.

1. **Identité** : « Nom » (obligatoire, 80 caractères au plus), « Description » (500 au plus),
   « Enregistrer ». Après l'enregistrement : « Enregistré. » au-dessus du panneau.
2. **Système de jeu** : une liste « Système du catalogue » (les noms, par ordre alphabétique sans
   casse, et en tête « Aucun système »), « Rattacher » ; si l'univers a un système : son nom, « Utilisé
   par N univers » et « Ouvrir le système » (→ E-15). Choisir « Aucun système » puis « Rattacher »
   **détache** l'univers (rien n'est supprimé : le système et son contenu restent, les autres
   univers le gardent).
3. **Créer un système** : « Nom du système » (obligatoire, 80 caractères au plus), « Créer et
   rattacher » : le système naît au catalogue et l'univers y est rattaché en un seul geste (si l'un
   échoue, aucun n'a lieu). Un nom déjà pris (sans tenir compte de la casse) : « Un système porte déjà
   ce nom. » sous le champ.

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
univers » ; trois onglets, **Règles**, **Créatures**, **Objets** (Créatures par défaut) ; sous
l'onglet, la liste des entrées du type par nom (ordre alphabétique sans casse), cent à la fois, puis
« Charger la suite ». Chaque ligne (une **entrée** : une règle, une créature ou un objet ; `gabarit` dans les données) : le nom et la première ligne du contenu (tronquée). Un clic ouvre
l'entrée **sur place** (le nom, le contenu en texte brut, AD-58).

*Le MJ d'un univers rattaché* : « Ajouter une règle » / « Ajouter une créature » / « Ajouter un
objet » ouvre un formulaire sur place : « Nom » (1 à 120 caractères), « Contenu » (20 000 au plus,
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
| contenu long | 100 entrées : « Charger la suite » ; nom tronqué par « … » avec infobulle ; contenu de 20 000 caractères passe à la ligne et s'affiche en entier ; au-delà : « Erreur : 20 000 caractères au plus. » ; nom au-delà de 120 : « Erreur : 120 caractères au plus. » | idem |

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
type de la cible — et mène à la fiche de la cible (E-9). Une relation est dirigée : elle va de la
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

> E-6 Campagne, E-7 Scénario, E-13 Comptes-rendus, et leurs ajouts à E-3, à E-9 et à la barre
> latérale. Mêmes six états et mêmes textes communs que ci-dessus (chargement, erreur de
> chargement, connexion perdue, écriture en cours, échec d'écriture, refus, session expirée) ; ne
> sont redits que les textes propres. Vocabulaire : les écrans disent « compte-rendu » en toutes
> lettres ; « CR » n'est qu'un sigle des documents (B-19, B-20). Dates : « 22 sept. 2026 » (jour, mois
> abrégé, année), comme sur E-9. Maquettes finies : `docs/maquettes/e06`, `e07`, `e13`, `e03`.

**Ajouts aux écrans déjà construits.**

- *Barre latérale* : **Campagnes** et **Comptes-rendus** apparaissent, pour tous les rôles, entre
  « Vue d'ensemble » et « Lore ». Sur téléphone, comme les autres items (tiroir).
- *E-3* : trois blocs, inscrits au registre (une ligne chacun, aucun bloc existant modifié) :
  « Campagnes actives » (tous), « Derniers comptes-rendus » (tous), « Préparation » (MJ).
  La région « Rien à afficher pour l'instant… » ne s'affiche plus tant qu'un bloc est inscrit pour
  le rôle ; chaque bloc a son propre état vide.
- *E-9, fiche de type compte-rendu* : sous le titre, une ligne « Campagne : <nom> » qui mène à
  E-6 de la campagne. Pour une fiche d'un autre type, rien n'est ajouté. E-9 n'a pas aujourd'hui
  d'emplacement sous le titre : la tranche en ajoute **un seul**, un registre de lignes de titre
  (`frontend/src/ecrans/fiche/lignes/registre.ts`, une ligne : type de fiche concerné, composant),
  vide pour tout autre type ; aucun bloc de section existant n'est modifié. États de la ligne : le
  nom de la campagne passe à la ligne (80 caractères) ; pendant le chargement, la ligne est absente ;
  campagne illisible ou en erreur, la ligne est absente sans message (le compte-rendu reste lisible) ; connexion perdue : la ligne déjà affichée reste cliquable (navigation seule, sans écriture).
- *E-9, ce que chaque rôle voit d'un compte-rendu* : une seule section, « Compte-rendu », lisible de
  tous les membres. « Modifier » est offert à son auteur (le Joueur qui l'a créé) et au MJ, pas aux
  autres Joueurs ; le MJ règle l'audience comme pour toute section. Un compte-rendu créé par un MJ
  n'a pas d'auteur. Fermer la section aux joueurs la cache aux autres Joueurs, pas à son auteur
  (AD-61).

### E-6 Campagne

Deux vues, une adresse chacune : la **liste** (`/univers/:id/campagnes`) et la **page d'une
campagne** (`/univers/:id/campagnes/:campagne`).

*La liste* : les campagnes de l'univers — nom, statut — **actives d'abord, puis en préparation,
puis terminées, chaque groupe par nom** (sans casse). Plusieurs campagnes peuvent être actives
(AD-60). Le MJ voit pour chacune une liste de statut (« En préparation », « Active », « Terminée »)
qu'il change en place, et en tête « Nouvelle campagne » : un champ « Nom » (1 à 80 caractères) et
« Créer la campagne » ; la campagne naît « En préparation » et on reste sur la liste, où elle
apparaît. Le Joueur voit le statut en badge, sans réglage. Ni le nom d'une campagne ni le libellé d'une
tâche ne se corrigent, et rien ne se supprime : hors tranche.

*La page d'une campagne* : le nom (titre), le statut (liste pour le MJ, badge pour le Joueur),
puis trois panneaux (une campagne n'a ni description ni autre champ que son nom et son statut).

1. **Scénarios** (MJ seul — le panneau n'existe pas pour un Joueur, ni son titre) : les scénarios par
   ordre de création, le plus ancien d'abord, chacun un lien vers E-7 ; « Nouveau scénario » : un
   champ « Titre » (1 à 120 caractères) et « Créer le scénario », qui mène à E-7.
2. **Préparation** (MJ seul, idem) : les tâches **non cochées**, regroupées sous les cinq
   catégories dans cet ordre — Monstres, PNJ, Cartes, Déroulements, Autre — une catégorie vide
   n'est pas montrée ; chaque tâche : une case, son libellé. Cocher la fait passer dans le groupe
   « Cochées (n) », sous la liste, avec son badge de catégorie, un lien « Décocher » et le libellé
   barré ; les cochées sont triées de la plus récemment cochée à la plus ancienne. En pied, « Nouvelle
   tâche » : libellé (1 à 200 caractères), catégorie (obligatoire, « Autre » par défaut),
   « Ajouter ». **Aucune tâche ne se supprime** (matrice du cadrage).
3. **Comptes-rendus** (tous) : les comptes-rendus **lisibles** de cette campagne, du plus
   récemment créé au plus ancien, chacun : titre, auteur (l'identifiant de l'auteur de la section ; un compte-rendu
   créé par le MJ n'a pas d'auteur, AD-61 : rien n'est affiché, pas même le nom du MJ), date de création, lien vers E-9. « Nouveau
   compte-rendu » ouvre une fenêtre : « Titre » (1 à 120 caractères), « Texte » (facultatif, 20 000
   au plus), « Publier » et « Annuler » ; « Publier » crée le compte-rendu et mène à E-9 (AD-61). Si la
   création échoue, la fenêtre reste ouverte, la saisie gardée, avec « L'action n'a pas abouti.
   Réessayez. » ; session expirée pendant la saisie : le texte est gardé comme sur E-9. Cent à la fois,
   puis « Charger la suite ».

Erreurs de saisie, sous le champ : « Erreur : le nom est obligatoire. » / « Erreur : 80 caractères
au plus. » (campagne) ; « Erreur : le titre est obligatoire. » / « Erreur : 120 caractères au plus. »
(scénario, compte-rendu) ; « Erreur : le libellé est obligatoire. » / « Erreur : 200 caractères au
plus. » (tâche) ; « Erreur : 20 000 caractères au plus. » (texte du compte-rendu).

Textes : liste vide, MJ : « Aucune campagne pour l'instant. » et « Nouvelle campagne » ; Joueur :
« Aucune campagne pour l'instant. » ; scénarios vides : « Aucun scénario pour l'instant. » ;
préparation vide, aussi quand toutes les tâches sont cochées : « Rien à préparer pour l'instant. »,
le groupe « Cochées (n) » restant sous elle ; cochées vides : le groupe n'est pas montré ;
comptes-rendus vides : « Aucun compte-rendu pour l'instant. » (Joueur : « Aucun compte-rendu à lire
pour l'instant. »). Une campagne terminée garde ses panneaux et accepte de nouveaux comptes-rendus.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes ci-dessus, panneau par panneau | MJ : créer une campagne, un scénario, une tâche ; tous : un compte-rendu |
| chargement | « Chargement des campagnes… » (liste) ; « Chargement de la campagne… » (page), le titre absent | — |
| erreur | « Impossible de charger les campagnes. » / « Impossible de charger cette campagne. » (le nom ou le statut illisible vide la page ; l'échec d'un seul panneau — scénarios, préparation, comptes-rendus — ne vide que ce panneau : « Impossible de charger ce panneau. » avec « Réessayer ») ; « Charger la suite » en échec : « Impossible de charger la suite. » ; un échec d'écriture (statut, tâche, création) s'écrit au-dessus du panneau, la valeur revient à celle d'avant, la saisie reste | « Réessayer » |
| connexion perdue | le bandeau ; liste de statut, cases, « Ajouter », « Créer… », « Publier » désactivés ; saisie conservée | lire, ouvrir |
| refus | campagne inconnue ou d'un autre univers, univers sans rôle : « Page introuvable. » ; pour un Joueur, les panneaux Scénarios et Préparation sont absents, sans titre ni compteur, et l'adresse d'un scénario répond « Page introuvable. » | « Mes univers » |
| contenu long | 100 campagnes : la liste défile ; un nom de 80 caractères passe à la ligne ; un titre de compte-rendu de 120 caractères passe à la ligne ; 100 scénarios ou plus : la liste s'allonge ; 100 tâches ou plus par catégorie : la liste s'allonge, sans pagination ; plus de 100 comptes-rendus : « Charger la suite » | idem |

*Critères.*
- Étant donné Antor, MJ, qui a une tâche « Plan de la crypte » (Cartes) non cochée, quand il la
  coche, alors elle quitte « Préparation » et apparaît dans « Cochées (1) » ; quand il la décoche,
  elle revient sous « Cartes ».
- Étant donné Léa, Joueuse, quand elle ouvre « La Couronne brisée », alors elle voit le nom, le
  statut et les comptes-rendus, et dans la réponse de la route ni scénario ni tâche, ni leur nombre.
- Étant donné Antor qui change le statut en « Terminée », quand Léa recharge la liste, alors le
  badge de la campagne dit « Terminée » et la campagne passe en dernier groupe.

### E-7 Scénario (MJ)

Atteint depuis E-6 (liste des scénarios, « Créer le scénario »). Le titre, un lien « ← La
Couronne brisée » vers E-6, le contenu en texte brut (AD-58) ; « Modifier » ouvre « Titre » et
« Contenu » (20 000 caractères au plus), « Enregistrer », « Annuler ». Enregistrer envoie la version
lue (AD-62) ; un scénario ne se supprime pas.

Textes : contenu vide : « Rien d'écrit pour l'instant. » ; écriture périmée : « Ce scénario a changé
depuis que vous l'avez ouvert. Rechargez-le pour voir la nouvelle version ; votre texte reste
ci-dessous. » avec « Recharger le scénario » ; titre vide ou trop long : « Erreur : le titre est
obligatoire. » / « Erreur : 120 caractères au plus. » ; contenu : « Erreur : 20 000 caractères au
plus. ». Session expirée pendant une saisie : le texte est gardé comme sur E-9.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Rien d'écrit pour l'instant. » | « Modifier » |
| chargement | « Chargement du scénario… », le titre absent | — |
| erreur | « Impossible de charger ce scénario. » ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », texte conservé | « Réessayer » |
| connexion perdue | le bandeau ; « Enregistrer » désactivé, texte en cours conservé | lire |
| refus | Joueur, scénario inconnu, d'une autre campagne ou d'un autre univers : « Page introuvable. » ; un Joueur n'a ni l'écran ni de lien vers lui | « Mes univers » |
| contenu long | 20 000 caractères : passent à la ligne, affichés en entier ; titre de 120 caractères : passe à la ligne | idem |

*Critère.* Étant donné Léa, Joueuse, quand elle ouvre l'adresse du scénario « Acte II — Le sceau
brisé » que lui donne Antor, alors elle voit « Page introuvable. », sans le titre.

### E-13 Comptes-rendus

Tous les comptes-rendus de l'univers **que le compte peut lire**, du plus récemment créé au plus
ancien (un compte-rendu retouché ne remonte pas, B-20) ; chacun : titre, nom de sa campagne, auteur (comme sur E-6 : l'identifiant, rien s'il n'y en a pas),
date de création, lien vers E-9. Cent à la fois, puis « Charger la suite ». Pas de création ici :
« Nouveau compte-rendu » est sur E-6, qui porte la campagne.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | « Aucun compte-rendu pour l'instant. » (Joueur : « Aucun compte-rendu à lire pour l'instant. ») | MJ et Joueur : « Voir les campagnes » (→ E-6) |
| chargement | « Chargement des comptes-rendus… » | — |
| erreur | « Impossible de charger les comptes-rendus. » ; « Charger la suite » en échec : « Impossible de charger la suite. » | « Réessayer » |
| connexion perdue | le bandeau ; la liste chargée reste ; « Charger la suite » désactivé | ouvrir |
| refus | un compte-rendu dont rien n'est lisible est absent de la liste, jamais signalé ; univers sans rôle : « Page introuvable. » | « Mes univers » |
| contenu long | plus de 100 : « Charger la suite » ; titre de 120 caractères : passe à la ligne | idem |

*Critère.* Étant donné Antor qui a fermé aux joueurs la section du compte-rendu « Session 11 » qu'il a écrit, quand
Léa ouvre E-13, alors elle ne voit pas « Session 11 » et la liste ne laisse aucun trou ni compteur.

### Blocs de E-3 (`kanevas-suivi`)

Trois blocs indépendants, dans cet ordre. Chacun a un titre, un état vide, et ne montre jamais un
compteur ni un nom que le compte ne peut pas lire.

- **Campagnes actives** (tous) : nom de chaque campagne active, lien vers E-6 de la campagne.
  Toutes les campagnes actives, une par ligne. Vide : « Aucune campagne active. » (MJ : suivi du lien « Voir les campagnes »).
- **Derniers comptes-rendus** (tous) : les cinq plus récemment créés que le compte peut lire,
  titre, campagne, date, lien vers E-9 ; lien « Tous les comptes-rendus » (→ E-13). Vide : « Aucun
  compte-rendu pour l'instant. » (Joueur : « Aucun compte-rendu à lire pour l'instant. »).
- **Préparation** (MJ seul — le bloc n'existe pas pour un Joueur) : par campagne active, ses cinq
  premières tâches non cochées (plus anciennes d'abord) avec leur catégorie, lien vers E-6. Vide :
  « Rien à préparer pour l'instant. ».

| État | Ce qu'on voit |
|---|---|
| chargement | chaque bloc affiche « Chargement… » à sa place, indépendamment |
| erreur | le bloc seul dit « Impossible de charger ce bloc. » avec « Réessayer » ; les autres blocs restent |
| connexion perdue | le bandeau ; contenu déjà chargé |
| refus | sans objet pour les blocs ; le bloc Préparation est absent pour un Joueur |
| contenu long | nom de campagne de 80 caractères, titre de compte-rendu de 120, libellé de tâche de 200 : passent à la ligne ; au plus cinq comptes-rendus, et cinq tâches par campagne active ; le nombre de campagnes actives n'est pas borné (AD-60) : « Campagnes actives » et « Préparation » s'allongent avec lui, sans « Charger la suite » — voulu, une table compte quelques campagnes actives |

*Critère.* Étant donné Léa, quand elle ouvre E-3, alors elle voit « Campagnes actives » et
« Derniers comptes-rendus », jamais « Préparation » ; Antor voit les trois.

### Clôture de la tranche

B-15 → E-6 (liste et page) ; B-16 → E-6 et E-7 ; B-17 → E-6 ; B-18 → E-6 ; B-19 → E-6 et E-9 ;
B-20 → E-13. Parcours : P-3 étapes 1 à 3 (E-3, E-6, E-7), P-4 en entier, P-5 étape 1 (E-13 →
E-9) ; P-6 étape 1 ne lit que les blocs de E-3 (derniers comptes-rendus) ; B-18 et B-20 le citent, mais aucune étape de P-6 ne passe par E-6 ni E-13. Les trois rôles : le Joueur a E-3, E-6
(sans scénarios ni préparation), E-13 ; l'admin d'instance sans rôle n'a aucun de ces écrans.
Reste aux autres tranches : la proposition de mise à jour depuis un CR (`kanevas-monde`) ; créer une campagne ou un scénario par
l'assistant est construit (E-12, `kanevas-assistant-membre`).

## Détail des écrans de `kanevas-relier-chercher`

## Détail des écrans de `kanevas-fichiers`

> Un seul ajout, aucun écran neuf : le **bloc Pièces jointes** de E-9. Mêmes six états et mêmes
> textes communs que la première fiche (erreur, connexion perdue, refus « Page introuvable. »,
> écriture en cours, échec d'une écriture). Maquette : `e09` (bloc Pièces jointes : MJ, Joueuse,
> envoi, échecs). Le document prime sur la maquette.

### E-9 — le bloc Pièces jointes

Dans chaque section, sous son contenu (et sous le bloc Relations s'il existe) : un bloc **Pièces
jointes**, inscrit au registre des blocs de section (un fichier, sans modifier un bloc existant).
Il montre les fichiers rattachés **à cette section** : une **image** (PNG, JPEG, GIF, WebP,
reconnue à son contenu, pas à son nom) en vignette ; tout autre fichier (PDF, texte, archive…, et
une image SVG) comme une ligne : nom, taille, « Télécharger ». Un clic sur une vignette ouvre
l'image entière dans un nouvel onglet.

Une pièce jointe **prend la visibilité de sa section** : qui ne lit plus la section ne voit plus
ses fichiers, et l'adresse directe répond « Page introuvable. ». Le MJ peut en plus la marquer
**secrète** : seul le MJ la voit, sur la fiche comme à son adresse.

| Rôle | Voir | Ajouter | Marquer / lever « secrète » | Retirer | Refus |
|---|---|---|---|---|---|
| MJ | toutes celles de ses sections, secrètes comprises | oui, sur toute section | oui | oui | sans objet |
| Joueur | celles des sections qu'il lit, hors secrètes | sur une section qu'il **écrit** (la sienne, ou ouverte en écriture aux joueurs) | non : **absent** ; sur une section qu'il ne fait que lire, « Ajouter un fichier » est absent aussi | sur une section qu'il écrit, une pièce qu'il voit | une pièce secrète est **absente** et son adresse répond « Page introuvable. » |
| MJ en mode Joueur | comme un Joueur qui n'est l'auteur d'aucune section (AD-39) | seulement où les joueurs écrivent | absent | seulement où les joueurs écrivent | idem |
| Admin d'instance | aucune | non | non | non | « Page introuvable. » |

Un geste qu'un rôle n'a pas est **absent** de l'écran (jamais grisé, sauf hors connexion) : sur une
section qu'on lit sans l'écrire, ni « Ajouter un fichier » ni « Retirer » ; pour un Joueur (et le MJ en mode Joueur), ni la case
« Secrète » ni « Rendre secrète ». Par l'API, un geste d'écriture sur une section qu'on lit sans
l'écrire est refusé **403**, un marquage par un non-MJ aussi (403) ; ce qu'on ne lit pas répond 404.
L'Admin d'instance n'a pas de bloc (« Page introuvable. »). Le geste « marquer / lever « secrète » » du besoin B-24 s'affiche « Rendre secrète » / « Lever le secret ».
Le texte de limite d'un MJ en mode Joueur est celui d'un Joueur.

*Ajouter.* Un bouton « Ajouter un fichier » ouvre le sélecteur de fichiers du système ; **choisir
le fichier suffit** : l'envoi part aussitôt, un fichier après l'autre si l'on en choisit
plusieurs (il n'y a pas de limite de taille). Le MJ (mode MJ) voit à côté du bouton une case
« Secrète (MJ seul) », décochée, qui s'applique aux fichiers choisis ensuite : un fichier destiné à
rester secret ne passe donc jamais, même un instant, par la table. Pendant l'envoi, une ligne
« portrait.png — Envoi… 42 % » (`role="status"`) avec « Annuler » ; l'envoi annulé n'écrit rien. À la
fin, la pièce rejoint la liste. Une section porte **50 pièces jointes** au plus. Un fichier vide est refusé. Si l'on en choisit plusieurs, chacun est jugé seul : un refus n'arrête pas les suivants, et chaque refus devient une ligne d'erreur qui reste, avec « Ignorer » seul (« Réessayer » n'aurait pas de sens).

*Marquer, retirer.* Sur chaque pièce, le MJ a « Rendre secrète » (ou « Lever le secret » quand elle
l'est) et « Retirer « portrait.png » » ; qui écrit la section n'a que « Retirer ». Retirer demande
confirmation sur place : « Retirer « portrait.png » ? Le fichier sera perdu. » avec « Retirer le
fichier » et « Annuler ». Retirer une section retire ses pièces jointes ; la confirmation de la première fiche gagne alors « … Son contenu et sa pièce jointe seront perdus. » (une) ou « … Son contenu et ses 3 pièces jointes seront perdus. » (plusieurs) ; sans pièce, son texte ne change pas. Une pièce secrète porte la
pastille ambre « Secrète — MJ seul » et le liseré du panneau MJ. Un fichier n'est jamais modifié
sur place : pour le remplacer, on en ajoute un autre et l'on retire l'ancien.

*Textes.* Aucune pièce : « Aucune pièce jointe. » ; taille : « 842 o », « 4,2 Ko », « 3,1 Mo »,
« 1,2 Go » (base 1024) ; nom : celui du fichier d'origine, sans dossier, 200 caractères au plus ; une vignette dit son nom en texte alternatif et porte en légende, dessous, son nom et sa taille (« portrait-aldric.png · 3,1 Mo »), puis ses boutons ; échec d'envoi : « « portrait.png » : l'envoi n'a pas
abouti. » avec « Réessayer » et « Ignorer » ; fichier vide : « « notes.txt » est vide. » ; limite :
« Cette section porte déjà 50 pièces jointes. » pour le MJ, « Cette section ne peut pas recevoir d'autre fichier. » pour un Joueur (qui ne voit pas les pièces secrètes : le chiffre dirait ce qu'il ne doit pas savoir) ; droit retiré entre-temps (à l'ajout ou au retrait) : « Vous ne pouvez plus ajouter de fichier à cette section. », la fiche se recharge et « Ajouter un fichier » comme « Retirer » disparaissent ; pièce déjà retirée ou devenue illisible : « Cette pièce
jointe n'existe plus. » (la liste se recharge) ; vignette qui ne se charge pas : « Image
indisponible. » avec « Télécharger » ; échec d'un marquage ou d'un retrait : « L'action n'a pas
abouti. Réessayez. », l'état d'avant revient.

*Pas de bloc quand il n'a rien à dire.* Un Joueur qui ne peut rien voir ni ajouter dans une section
n'a pas de bloc : ni titre, ni compteur, ni « Aucune pièce jointe. ». Le MJ voit le bloc de chaque
section, même vide.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ, ou qui écrit la section : « Aucune pièce jointe. » et « Ajouter un fichier » ; un lecteur seul : pas de bloc | ajouter |
| chargement | les pièces viennent avec la fiche : « Chargement de la fiche… » (E-9) ; une vignette en cours de chargement occupe sa place (cadre à la taille fixe) ; un envoi : la ligne « Envoi… 42 % » | annuler l'envoi |
| erreur | envoi : « « portrait.png » : l'envoi n'a pas abouti. » et la ligne reste ; fichier vide ou limite atteinte : le refus des textes, en ligne qui reste, avec « Ignorer » ; marquage ou retrait : « L'action n'a pas abouti. Réessayez. » ; vignette : « Image indisponible. » | « Réessayer », « Ignorer », « Télécharger » |
| connexion perdue | le bandeau ; « Ajouter un fichier », « Rendre secrète », « Lever le secret », « Retirer » désactivés ; un envoi en cours qui échoue devient l'erreur ci-dessus ; les vignettes déjà chargées restent | voir, télécharger |
| refus | droit d'écriture retiré : « Vous ne pouvez plus ajouter de fichier à cette section. » ; pièce retirée entre-temps : « Cette pièce jointe n'existe plus. » ; section ou fiche illisible : « Page introuvable. » ; pièce secrète pour un Joueur : absente | recharger |
| contenu long | un nom de 200 caractères passe à la ligne ; 50 pièces : la liste entière, puis le refus de limite (texte selon le rôle) à l'ajout ; un fichier de plusieurs Go : la progression en pourcentage, la taille en « Go » ; une vignette tient dans un cadre de 160 × 120 px | idem |

*Critères.*
- Étant donné « Maître Aldric » dont Antor, MJ, dépose sur « Vérité — MJ seul » un portrait avec
  « Secrète (MJ seul) » cochée, alors Léa, Joueuse, ne voit ni le portrait, ni le bloc de cette
  section (qu'elle ne lit pas) ; et sur « Apparence » (lue des joueurs), où Antor a déposé un
  autre portrait puis l'a rendu secret, Léa ne voit aucune trace du fichier : ni vignette, ni
  « Aucune pièce jointe. », ni compteur ; l'adresse directe du portrait secret lui répond « Page
  introuvable. », comme une adresse qui n'a jamais existé.
- Étant donné Léa auteur de « Notes de la table » avec écriture, quand elle choisit un portrait, alors
  il s'envoie sans autre geste et apparaît en vignette ; Teo, Joueur de l'univers, ne le voit pas
  tant que « Les joueurs la lisent » est faux, puis le voit et ne peut ni l'ajouter ni le retirer.
- Étant donné Antor qui dépose le plan d'un lieu en PDF, alors la ligne propose « Télécharger » et
  le fichier se télécharge sous son nom d'origine ; un fichier « image.svg » n'est jamais affiché dans la
  page.
- Étant donné Antor en mode Joueur sur la fiche, alors il ne voit ni la case « Secrète », ni
  « Rendre secrète », ni les pièces secrètes, et ne peut ajouter que sur les sections que les
  joueurs écrivent.
- Étant donné un envoi de 2 Go en cours, quand Antor clique « Annuler », alors la ligne disparaît et
  aucune pièce n'est ajoutée.
- Étant donné Antor qui retire la section « Apparence » portant un portrait, alors la confirmation
  dit « … Son contenu et sa pièce jointe seront perdus. » et, après confirmation, l'adresse du
  portrait répond « Page introuvable. ».

### Clôture de `kanevas-fichiers`

Dans chaque section, sous son contenu : un bloc **Relations**, inscrit au registre des blocs de
section (un fichier, sans modifier un bloc existant). Il liste les relations **portées par cette
section** : chacune dit son type et nomme sa cible — « membre de → Lames Grises », avec le badge du
type de la cible — et mène à la fiche de la cible (E-9). Une relation est dirigée : elle va de la
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

> E-12 Assistant, et son ajout au shell d'un univers. Mêmes six états et mêmes textes communs que
> `kanevas-premiere-fiche` (chargement, connexion perdue, session expirée) ; ne sont redits que les
> textes propres. Maquette finie : `docs/maquettes/e12-assistant.html` (thème sombre ; MJ, Joueur,
> et les états). Composant : `docs/charte.md` « Panneau d'assistant ».

**Ajout au shell.** Un bouton flottant « Demander à Kanevas », en bas à droite, sur **tout écran
d'un univers** pour un membre (MJ ou Joueur) ; il n'existe ni hors d'un univers, ni pour un compte
sans rôle dans l'univers (l'admin d'instance sans rôle, Teo avant son ajout) : l'écran n'a alors pas
de bouton, et l'assistant n'a pas d'adresse (404, AD-75). Il se monte par un seul fichier, sans
modifier un composant existant du shell. Bascule « mode Joueur » d'une fiche : sans effet sur
l'assistant, qui garde le catalogue du rôle réel (AD-74) ; le panneau le dit par sa pastille.

### E-12 Assistant

Un panneau à droite (380 px, sur ordinateur) qui s'ouvre au bouton et se ferme par « Fermer » ou
Échap ; le contenu de l'écran dessous reste lisible et utilisable. Sur téléphone (moins de 760 px)
il prend tout l'écran, et Échap ou « Fermer » rend le focus au bouton flottant. Dedans, de haut en
bas :

- **l'en-tête** : « Kanevas — assistant », la pastille du catalogue (« MJ » ou « Joueur », mot et
  teinte), « Nouvelle conversation », « Fermer » ;
- **le fil** : les messages de la personne et les réponses de l'assistant, en texte brut (AD-58),
  du plus ancien au plus récent ; le fil défile et reste calé sur le dernier message ;
- **sous une réponse, les écritures** : un bloc « Écrit par l'assistant » par événement (AD-76), le
  libellé (« Section « Notes de la table » complétée », « Scénario « Acte III — La crypte » créé
  dans La Couronne brisée ») et un lien « Ouvrir » vers E-9 (la fiche), E-7 (le scénario) ou E-6
  (la campagne). Les quatre écritures possibles : « Section « Notes de la table » complétée »
  (`ajouter_a_section`, lien vers E-9), « Section « Vérité » modifiée » (`modifier_section`, lien
  vers E-9), « Campagne « La Couronne brisée » créée » (`creer_campagne`, lien vers E-6), « Scénario
  « Acte III — La crypte » créé dans La Couronne brisée » (`creer_scenario`, lien vers E-7) ;
- **la saisie** : le champ, étiqueté « Demander à Kanevas » par une étiquette visible au-dessus de lui (son texte d'aide est « Votre question »), dans tous les états où il est affiché, et « Envoyer » (Entrée
  envoie, Maj+Entrée va à la ligne).

Le **fil vit dans le navigateur**, dans un magasin du module `frontend/src/ecrans/assistant/fil.ts`, hors du routeur et du stockage du navigateur (AD-28) : il survit à un
changement d'écran et à la fermeture du panneau ; il disparaît au rechargement de la page, au
changement d'univers et à la déconnexion ; « Nouvelle conversation » le vide. Il n'est écrit
nulle part (ni stockage du navigateur, ni serveur). Le client envoie le message et les 20 derniers
messages du fil (AD-75).

**Ce que chaque rôle y voit.** Le Joueur : chercher, lire une fiche, lire une section, modifier une
section, ajouter un paragraphe à une section, lister les campagnes. Le MJ : les mêmes, plus créer
une campagne et créer un scénario. Un Joueur qui demande de créer un scénario n'a pas l'outil :
l'assistant répond qu'il ne peut pas, sans événement et sans rien créer (le texte est celui du
modèle, il n'est pas fixé ; ce qu'on vérifie est l'absence d'écriture). Dans les deux cas
l'assistant ne lit et n'écrit que ce que la personne lit et écrit : une section fermée est
« Introuvable. », une section lisible mais non écrite « Vous ne pouvez pas modifier cette
section. » (AD-74). Cette tranche **ne donne aucun outil sur les cartes ni les graphes** (écarté, AD-74). Elle **ne dessine ni proposition de mise à jour ni image** : elles
s'inscrivent au registre de blocs (`kanevas-monde`, `kanevas-images`).

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide (fil sans message) | « Demandez-moi de chercher, de résumer ou d'écrire dans ce que vous pouvez lire et écrire. Exemple : « Que sait-on d'Aldric ? » » | écrire ; fermer ; « Nouvelle conversation » (sans effet sur un fil vide) |
| chargement (disponibilité) | le bouton est présent ; dans le panneau, « Chargement… » à la place du champ et de « Envoyer » (absents, pas désactivés) ; aucun « Réessayer » tant que l'appel n'a pas répondu | fermer ; nouvelle conversation |
| disponibilité en échec (serveur muet, erreur) | « Je n'ai pas pu répondre — réessayer » avec un bouton « Réessayer » qui relit la disponibilité ; le champ et « Envoyer » sont présents mais désactivés (`aria-disabled`) | réessayer ; fermer ; nouvelle conversation |
| réponse en cours | le message envoyé apparaît ; « Kanevas réfléchit… » (`role="status"`) ; « Envoyer » affiche « … » et est désactivé ; le champ reste lisible | fermer (la réponse arrive dans le fil) ; « Nouvelle conversation » est désactivée tant que la réponse n'est pas arrivée |
| erreur | « Je n'ai pas pu répondre — réessayer » (`role="alert"`), sans événement, pour toutes les causes (délai de 120 s, erreur de transport) : la personne ne les distingue pas ; demande déjà en cours (429) : « Une demande est déjà en cours. Patientez. » ; la saisie n'est jamais perdue : à l'envoi le champ se vide, la question reste dans le fil, une seule fois ; « Réessayer » (offert pour toutes les erreurs, le 429 compris) la renvoie telle quelle : le message d'erreur disparaît, « Kanevas réfléchit… » prend sa place, et la question n'est pas affichée une seconde fois | « Réessayer » renvoie la même question ; saisir autre chose ; fermer ; nouvelle conversation |
| indisponible (sans jeton, hors bouchon, AD-77) | « L'assistant n'est pas disponible pour le moment. » ; champ et « Envoyer » désactivés (`aria-disabled`) | lire le fil ; fermer ; nouvelle conversation |
| connexion perdue | le bandeau commun ; le fil reste lisible ; champ et « Envoyer » désactivés. Perdue pendant « Kanevas réfléchit… » : la réponse est perdue, l'état passe à l'erreur ci-dessus avec « Réessayer » (désactivé tant que la connexion n'est pas revenue) ; au retour de la connexion, le bandeau disparaît et le champ est réactivé | lire, ouvrir les liens ; fermer ; nouvelle conversation |
| refus | le compte sans rôle n'a pas le bouton (rien à décrire ici) ; un refus d'outil est une réponse de l'assistant, pas un écran d'erreur — « Introuvable. », « Vous ne pouvez pas modifier cette section. », « La section a changé depuis que vous l'avez lue. Relisez-la. » —, sans événement ; la réponse commence par ce texte, la suite est du texte libre du modèle ; session expirée : la personne est menée à la connexion, le fil est perdu | refus d'outil : le fil reste, on écrit à nouveau ; fermer ; nouvelle conversation |
| contenu long | message de plus de 2 000 caractères : « Erreur : 2 000 caractères au plus. » sous le champ, « Envoyer » désactivé ; fil de plus de 20 messages : la note « Seuls les 20 derniers messages sont transmis à l'assistant. » ; réponse longue : passe à la ligne, le fil défile ; titre de 120 caractères dans un libellé : passe à la ligne | écrire (après avoir raccourci le message) ; fermer ; nouvelle conversation |

*Critère.* Étant donné Léa Joueuse de « Lame d'Ébène », quand elle demande « Que sait-on d'Aldric ? »,
alors le fil donne « Apparence » et rien de « Vérité » ; quand elle demande de lire « Vérité », le fil
dit « Introuvable. » ; Antor, lui, obtient les deux sections, et fait créer un scénario qui apparaît
dans le fil avec « Ouvrir » vers E-7 et sur E-6.

### Clôture de `kanevas-assistant-membre`

B-26 → E-12 (toutes ses lignes) ; B-27 → E-12 (créer une campagne ou un scénario ; proposer et
générer restent à `kanevas-monde` et `kanevas-images`). Parcours : P-3 étape 5 (« rappelle-moi tout
ce qu'on sait d'Aldric », première moitié), P-6 étape 4, P-7 étape 2. Rôles : MJ et Joueur ont
E-12, l'admin d'instance sans rôle ne l'a pas. Aucune migration, aucune entité : le fil n'est pas
stocké. Reste aux autres tranches : les propositions de mise à jour (`kanevas-monde`), les images
(`kanevas-images`).
B-24 → le bloc Pièces jointes de E-9 (ajouter en un geste, voir une image, télécharger un autre
fichier, marquer secrète, retirer). Atteint par P-3 étape 4 (le plan d'un lieu) et P-7 étape 2 (le
portrait de son personnage). Le bloc livre ses six états (B-29), ci-dessus.

## Détail de `kanevas-refonte-visuelle`

La refonte ne change ni les droits, ni les données, ni les textes d'un écran : elle change la
forme, et les gestes ci-dessous, que le testeur vérifie. La direction, les tokens et les
composants sont dans `docs/charte.md`. E-1, E-3, E-6, E-8 et E-9 ont leur maquette finie ; E-2,
E-4, E-7, E-13, E-14 et E-15 se refont dans le même cadre et avec les mêmes composants, sans
maquette propre : leurs maquettes actuelles, faites avant la charte, valent pour le contenu et
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
- en édition : sous le champ, le compteur « n / 20 000 » et l'aide « Échap annuler · Ctrl ↵
  enregistrer » ; Échap fait ce que fait « Annuler » (le texte saisi est abandonné, comme
  aujourd'hui) ; Ctrl+Entrée (⌘+Entrée sur Mac) fait exactement ce que fait « Enregistrer » :
  il envoie, et une écriture périmée reçoit « La section a changé depuis que vous l'avez
  ouverte… » ; au-delà de 20 000 caractères ou connexion perdue, il ne part pas, comme le bouton ;
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
fiche se voit** — comme son titre, elle n'est jamais secrète. **Le MJ seul** la pose, la remplace
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
pas) ; leur adresse porte le jeton de l'illustration (`…/illustration?v=<jeton>`, AD-93), si bien
qu'une image remplacée se recharge et qu'une image inchangée vient du cache.

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
| contenu long | 100 entrées : « Charger la suite » ; nom d'entrée de 120 caractères tronqué par « … », infobulle ; contenu de 20 000 caractères en entier ; nom de système de 80 caractères : le titre passe à la ligne | idem |

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

### Clôture de `kanevas-illustrations`

B-30 → la grille de E-8 (vignette, repli) et l'en-tête de E-9 (voir, poser, remplacer, retirer). Atteint par P-3 (le MJ prépare son lore : il pose l'illustration sur E-9 et la
retrouve sur E-8) et P-6 (une joueuse parcourt le lore sur son téléphone : la grille). Chaque rôle a
sa colonne ci-dessus ; les six états de chaque changement sont dans les tableaux (B-29).
B-31 → E-16 (nouveau) et E-15 hors univers ; atteints par P-8 (étape 2 :
« Systèmes de jeu », ou « Ouvrir le système » depuis E-14 / E-3) ; B-14 reste servi par E-15 ;
chaque relation au système (MJ, Joueur, sans univers rattaché) a sa colonne. Aucune donnée
nouvelle ; B-13 et B-14 sont inchangés. Les deux besoins viennent des décisions de Monsieur du
2026-10-06, écrites en B-30 et B-31 (`docs/parcours.md`).

## Maquettes

`docs/maquettes/<écran>.html`, une par écran structurant. Elles illustrent ; ce document décide,
et quand les deux divergent, la maquette a tort.

**Finies** (direction, tokens et composants de `docs/charte.md`, deux thèmes, bureau et
téléphone, vrai contenu) : E-1, E-3, E-6, E-8, E-9. Depuis `kanevas-illustrations`, `e08` est la grille de cartes
(types Personnages, Lieux, Factions, `#etat-lieux`, `#etat-factions`) et `e09` porte l'illustration
de l'en-tête ; leurs images sont des illustrations de démonstration peintes en SVG. E-15 et E-16
(`e15-systeme-de-jeu.html`, `e16-systemes-de-jeu.html`) sont finies hors du cadre d'un univers ;
les menus du sélecteur d'univers des maquettes `e03`, `e08`, `e09`, `e14` et la barre de `e01` portent
« Systèmes de jeu ». `e09-fiche.html` **fait référence pour le
cadre** de tous les écrans d'un univers (barre latérale, sélecteur d'univers, menu du compte,
barre haute, bascule de mode, bouton « Demander à Kanevas », tiroir au téléphone) et pour les
composants partagés. Leurs états s'ouvrent par l'adresse (`#etat-joueur`, `#etat-menu`,
`#etat-perdue`… ; la liste est en tête de leur style). Le bloc « Cartes » de `e03` arrive avec
`kanevas-cartes-graphes` ; jusque-là il n'est pas affiché.

**D'avant la charte** : les autres. Elles valent pour le contenu et le vocabulaire, pas pour la
forme ; un écran qui n'a qu'elles se construit dans le cadre et avec les composants de la
maquette E-9.

**Hors produit, en bouchon seulement** : la page de démonstration des composants
(`/demo-composants`), servie quand `KANEVAS_STUB=1` et absente sinon (404), comme l'écran de
choix d'un compte de test.
