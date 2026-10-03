# Kanevas — écrans

> Doc du produit (voir `docs/parcours.md`). Au cadrage, à grosses mailles : chaque écran, d'où on
> y arrive, à quoi il sert, ce que chaque rôle y fait. Les états de chaque écran et la maquette
> finie se détaillent dans la tranche qui le construit.

## Format

Web. Ordinateur d'abord pour écrire (souris, clavier, glisser des tokens) ; téléphone pour lire
(tactile, une colonne). Thème sombre et clair.

## Navigation

Une barre latérale unique, sur tous les écrans d'un univers :

- en tête, le **sélecteur d'univers** (les univers du compte, son rôle en badge) ;
- **Vue d'ensemble** · **Campagnes** · **Comptes-rendus** · **Cartes** ;
- **Lore** : Personnages, Lieux, Factions, Objets, Événements, Quêtes ;
- pour un MJ : **Univers** ▸ Membres, Paramètres ;
- pour un admin d'instance : **Administration**.

Hors d'un univers (E-1, E-2, E-5), une barre réduite : **Mes univers**, et **Administration**
pour un admin d'instance. Un admin qui est aussi membre d'un univers garde le lien
**Administration** dans la barre de l'univers, sous une section « Instance ».

L'**assistant** est un bouton flottant « Demander à Kanevas », sur tous les écrans d'un univers,
hors de la barre ; il n'existe pas hors d'un univers. Un MJ voit partout un badge **mode MJ / mode Joueur** sur les écrans où la
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
| **E-8 Liste de fiches** | nav Lore | les fiches d'un type que le compte peut lire ; chercher dans ce type ; créer (MJ) | P-3, P-6 |
| **E-9 Fiche** | E-8 ; un token ; un lien ; E-13 | lire et écrire les sections permises ; ajouter, réordonner, retirer une section, régler son audience, relier (MJ) ; déposer, marquer secrète, retirer une pièce jointe ; bascule mode Joueur (MJ). Un compte-rendu s'ouvre ici. | P-3 à P-7 |
| **E-10 Cartes** | nav Cartes | les cartes lisibles ; créer une carte illustrée (avec son image de fond) ou un graphe (MJ) | P-3, P-9 |
| **E-11 Carte** | E-10 ; E-3 | carte illustrée : fond, tokens ; graphe : nœuds et liens. MJ : déposer ou changer le fond, placer, configurer, rendre visible, mode Joueur. Joueur : ouvrir la fiche d'un token. | P-3, P-6, P-9 |
| **E-12 Assistant** | bouton flottant, sur tout écran d'univers | converser ; voir ce que l'assistant a écrit, avec un lien ; MJ : propositions de mise à jour (actuel/proposé, **Appliquer**, **Abandonner**), images générées | P-3, P-5, P-6, P-7 |
| **E-13 Comptes-rendus** | nav Comptes-rendus ; E-3 | tous les CR lisibles de l'univers, du plus récent, avec leur campagne | P-4, P-5 |
| **E-14 Paramètres de l'univers** | nav Univers (MJ) | nom, description, système de jeu (choisir dans le catalogue, en créer un) | P-8 |
| **E-15 Système de jeu** | E-14 ; lien depuis E-3 | le référentiel commun : règles, créatures, objets ; ajouter, modifier (MJ d'un univers rattaché) | P-8 |

Les pages de connexion du serveur (« Connexion refusée », « Connexion indisponible », atteintes
depuis P-1) et le bandeau du mode bouchon sont décrits sous « Session et connexion ».

Hors produit : `/composants`, la bibliothèque de composants, réservée au développement ; et,
en mode bouchon seulement (AD-55), l'écran de choix d'un compte de test et le bandeau « mode
bouchon » — sans `E-n` ni six états, ils n'existent pas en production.

## Rôles × écrans × actions

« — » : l'écran n'est pas proposé (absent de la navigation, et 404 si on force l'adresse).

| Écran | MJ | Joueur | Admin d'instance (sans rôle dans l'univers) |
|---|---|---|---|
| E-1 | ses univers, créer | ses univers, créer | ses univers, créer |
| E-2 | créer | créer | créer |
| E-3 | tout | sans préparation ni scénarios | — |
| E-4 | tout | — | — (passe par E-5) |
| E-5 | — | — | tous les univers, leurs membres |
| E-6 | tout | liste, statut, CR, « Nouveau compte-rendu » ; ni scénarios ni préparation (cachés) | — |
| E-7 | tout | — | — |
| E-8 | lire, chercher, créer | lire, chercher | — |
| E-9 | tout ; mode Joueur ; relier et retirer des relations | sections lisibles ; écrire celles permises ; relations lisibles (section et cible) ; pièces jointes de celles-ci | — |
| E-10 | tout | cartes visibles | — |
| E-11 | tout ; mode Joueur | lire une carte visible, ouvrir une fiche | — |
| E-12 | catalogue MJ ; propositions : le MJ demandeur seul les voit, les applique, les abandonne | catalogue Joueur ; ni outil de proposition ni bloc | — |
| E-13 | tous les CR | les CR lisibles | — |
| E-14 | tout | — | — |
| E-15 | lire, écrire | lire | — |

Précisions de la matrice : créer une campagne, en changer le statut, créer un scénario sont au
MJ seul. L'audience d'une section se règle en ligne sur la fiche (MJ). Créer une fiche ouvre une
fenêtre (type déjà choisi, titre) qui mène à la fiche ; créer une carte se fait en ligne sur
E-10. « Rendre visible » une carte se trouve sur la carte (E-11) et dans la liste (E-10). Le fond d'une carte illustrée se dépose à sa création (E-10) et se change sur la carte (E-11) ;
une carte sans fond montre ses tokens sur un fond neutre. Une
tâche de préparation s'ajoute avec sa catégorie, se coche, se décoche ; elle ne se supprime pas.
Sur E-15, règles, créatures et objets ont le même traitement.

Un compte **sans rôle** dans l'univers et qui n'est pas admin d'instance (Teo avant son ajout) a, dans
cet univers, la colonne « Admin » de cette matrice moins E-5 : « — » partout, « Page introuvable. »
si l'adresse est forcée ; il garde E-1 et E-2.

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
> long**. « Sans objet » dit sa raison. Les maquettes finies sont `docs/maquettes/e01`, `e02`,
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
- La session expire au bout de 7 jours (AD-56). **Se déconnecter** (pied de la barre latérale)
  efface la session et mène à la connexion ; en bouchon, c'est ainsi qu'on change de compte.
- `GET /api/moi` rend `{username, groups}` du compte connecté : c'est ce que la barre latérale
  affiche (l'identifiant) et ce que les tests lisent pour constater les groupes.

### Barre latérale

Sur tout écran d'un univers : en tête le **sélecteur d'univers** (nom, badge du rôle, la liste
des univers du compte, « Mes univers » en pied de liste) ; **Vue d'ensemble** ; **Lore** :
Personnages, Lieux, Factions, Objets, Événements, Quêtes ; pour un MJ, **Univers ▸ Membres** ; en
pied, l'identifiant, le thème (Clair, Sombre, Système), « Se déconnecter ». Hors d'un univers (E-1,
E-2) : « Mes univers », l'identifiant, le thème, « Se déconnecter ». **Un item dont l'écran n'est
pas construit n'est pas affiché** : Campagnes, Comptes-rendus, Cartes, Paramètres, Administration
arrivent avec leurs tranches. Sur téléphone (moins de 760 px), la barre est un tiroir sous un
bouton « Menu ».

| État | Ce qu'on voit |
|---|---|
| vide | sans objet : l'univers courant est toujours dans le sélecteur ; hors univers, seul « Mes univers » |
| chargement | le sélecteur affiche « … » ; les items fixes sont déjà là |
| erreur | le sélecteur affiche « Univers », sans liste (le nom n'est connu que de la liste qui n'a pas chargé) ; « Impossible de charger vos univers. » dans la liste dépliée, avec « Réessayer » |
| connexion perdue | le bandeau ; navigation inchangée |
| refus | sur « Page introuvable. » la barre est celle d'un écran hors univers : **pas de sélecteur**, aucun nom d'univers, seulement « Mes univers », l'identifiant, le thème, « Se déconnecter » ; dans un univers, le sélecteur ne liste que les univers du compte |
| contenu long | 100 univers : la liste du sélecteur défile ; un nom de 80 caractères est tronqué par « … » avec infobulle |

### E-1 Accueil

Liste des univers du compte : nom, début de la description, badge du rôle (MJ, Joueur) ; un clic
mène à E-3. Bouton « Créer un univers » (→ E-2). L'identifiant du compte est affiché en tête :
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

### E-3 Vue d'ensemble de l'univers (coquille)

Le nom de l'univers (titre), sa description, le badge du rôle, puis une **région de blocs**. Dans
cette tranche, aucun bloc n'existe : la région montre « Rien à afficher pour l'instant. Les
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
Pour **modifier** : un champ de texte (20 000 caractères au plus), « Enregistrer », « Annuler ».
Enregistrer envoie la version lue (AD-59).

Textes : section sans contenu : « Rien d'écrit pour l'instant. » ; fiche sans section (MJ) : « Cette
fiche n'a pas encore de section. » ; écriture périmée : « La section a changé depuis que vous
l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous. » avec
« Recharger la section » ; droit retiré entre-temps : « Vous ne pouvez plus modifier cette section. » ;
confirmation de retrait : « Retirer la section « Vérité — MJ seul » ? Son contenu sera perdu. » avec
« Retirer la section » et « Annuler ».

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | MJ : « Cette fiche n'a pas encore de section. » et « Ajouter une section » ; section vide : « Rien d'écrit pour l'instant. » | MJ : ajouter ; qui écrit : « Modifier » |
| chargement | le titre absent, « Chargement de la fiche… » | — |
| erreur | « Impossible de charger cette fiche. » ; échec d'écriture : « L'action n'a pas abouti. Réessayez. », texte conservé | « Réessayer » |
| connexion perdue | le bandeau ; « Enregistrer », audience, ordre, retrait, ajout désactivés ; le texte en cours reste | lire |
| refus | fiche inconnue ou dont rien n'est lisible : « Page introuvable. » ; section non lisible : absente. Un MJ en mode Joueur sur une fiche dont aucune section n'est lisible des joueurs voit « Aucune section n'est visible des joueurs. » (ce que verrait un joueur : « Page introuvable. ») | passer en mode MJ |
| contenu long | une section de 20 000 caractères passe à la ligne et s'affiche en entier ; plus au-delà : « Erreur : 20 000 caractères au plus. » ; titre de fiche (120 caractères) et titre de section (80) : passent à la ligne | idem |

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

### Clôture de la tranche

Chaque besoin de `## Livre` a son écran : B-2 → E-2 ; B-3 à B-5 → E-4 ; B-7 → E-8 ; B-8 et B-9 →
E-9 ; B-1 et B-28 → session ; B-29 → six états de chaque écran ci-dessus. Chaque écran est atteint
par P-1 (E-1, E-2, E-3), P-2 (E-4), P-3 étape 4 et P-6 (E-8, E-9), P-7 (E-9). Les trois rôles ont
leur colonne dans la matrice du cadrage ; l'admin d'instance n'a, dans cette tranche, que E-1 et
E-2.

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
Reste aux autres tranches : créer une campagne ou un scénario par l'assistant
(`kanevas-assistant-membre`), la proposition de mise à jour depuis un CR (`kanevas-monde`).

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

Le **fil vit dans le navigateur**, dans un contexte du shell d'univers (AD-28) : il survit à un
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

## Détail des écrans de `kanevas-monde`

> Le bloc « proposition de mise à jour » de E-12, et rien d'autre : pas de nouvel écran, pas de
> nouvelle adresse d'écran. Mêmes six états et mêmes textes communs que `kanevas-premiere-fiche`
> (chargement, connexion perdue, session expirée) ; ne sont redits que les textes propres.
> Maquette finie : `docs/maquettes/e12-propositions.html` (thème sombre ; le bloc dans ses états,
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
- **deux zones de texte brut côte à côte** (AD-58), étiquetées « Actuel » et « Proposé » ; sous
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
| périmée (la section a changé depuis la proposition, par n'importe qui), vue à l'affichage **ou découverte au clic** sur « Appliquer » (refus `section_modifiee` : le bloc se relit et passe à cet état, rien n'est écrit) | le bandeau « La section a changé depuis la proposition. Demandez-en une nouvelle. » (`role="alert"`) au-dessus des zones ; « Actuel » montre le contenu courant ; « Appliquer » désactivé (`aria-disabled`) | Abandonner ; Ouvrir ; demander une nouvelle proposition dans le fil |
| erreur | à la lecture : « Je n'ai pas pu afficher la proposition — réessayer » (`role="alert"`) avec « Réessayer » qui la relit ; à un geste : « L'action n'a pas abouti. Réessayez. » (`role="alert"`) au-dessus des gestes, la proposition reste en attente, les gestes se réactivent | Réessayer ; le geste à nouveau |
| connexion perdue | le bandeau commun (« Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas. », texte de `kanevas-premiere-fiche`) ; zones lisibles ; « Appliquer » et « Abandonner » désactivés ; perdue pendant un geste en cours, la réponse est perdue : le « … » disparaît, les gestes restent désactivés, et au retour de la connexion la proposition est relue — le bloc dit ce que la base dit (appliquée ou en attente), jamais un état supposé | lire ; Ouvrir |
| refus (adresse inconnue : abandonnée ailleurs, supprimée avec sa section, autre compte, MJ retiré de l'univers) | « Cette proposition n'existe plus. » ; plus de zones ni de geste ; session expirée : la personne est menée à la connexion, le fil est perdu | continuer à écrire dans le fil |
| déjà appliquée, vue d'un autre onglet | même rendu que « appliquée » (la lecture dit l'état, AD-82) ; un « Appliquer » ou un « Abandonner » en course rend 409 `proposition_appliquee` et le bloc se relit | Ouvrir |
| contenu long | contenu de 20 000 caractères : chaque zone a une hauteur maximale de 15 lignes et défile (`tabindex="0"`, étiquetée « Actuel » / « Proposé ») ; les paragraphes (lignes vides) sont conservés ; un titre de fiche ou de compte-rendu de 120 caractères passe à la ligne | faire défiler chaque zone |

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

`docs/maquettes/<écran>.html`, une par écran structurant, premier niveau : la structure et le
vocabulaire, pas la finition. Elles illustrent ; ce document décide.
