# Kanevas — écrans

> Doc du produit (voir `docs/parcours.md`). Au cadrage, à grosses mailles : chaque écran, d'où on
> y arrive, à quoi il sert, ce que chaque rôle y fait. Les états de chaque écran et la maquette
> finie se détaillent dans la tranche qui le construit.

> **Construit à ce jour** : E-1, E-2, E-3 (nom, navigation et blocs : système de jeu, campagnes actives, derniers comptes-rendus, préparation pour le MJ), E-4, E-6, E-7, E-13, E-8 (avec la
> recherche dans un type), E-9 (avec les blocs Relations et Pièces jointes), E-14 (Paramètres), E-15 (Système de jeu), la ligne « Campagne » de E-9, la session
> et la barre latérale. E-5 et E-10 à E-12 sont la cible.

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
| **E-3 Vue d'ensemble de l'univers** | E-1 ; sélecteur d'univers ; E-5 (admin devenu membre) | les campagnes actives, les derniers CR, la préparation (MJ), les cartes visibles | P-2, P-3, P-4, P-6 |
| **E-4 Membres** | nav Univers (MJ) | lister, ajouter par identifiant, changer le rôle, retirer | P-2 |
| **E-5 Administration** | nav (admin d'instance) | lister les univers de l'instance, en gérer les membres — jamais le contenu | P-2 |
| **E-6 Campagne** | nav Campagnes (liste) ; E-3 | liste des campagnes ; pour une campagne : statut, scénarios et « Nouveau scénario » (MJ), préparation (MJ), comptes-rendus, « Nouveau compte-rendu » | P-3, P-4 |
| **E-7 Scénario** | E-6 (MJ) | écrire et relire un scénario | P-3 |
| **E-8 Liste de fiches** | nav Lore | les fiches d'un type que le compte peut lire ; chercher dans ce type ; créer (MJ) | P-3, P-6 |
| **E-9 Fiche** | E-8 ; un token ; un lien ; E-13 | lire et écrire les sections permises ; ajouter, réordonner, retirer une section, régler son audience, relier (MJ) ; déposer, marquer secrète, retirer une pièce jointe ; bascule mode Joueur (MJ). Un compte-rendu s'ouvre ici. | P-3 à P-7 |
| **E-10 Cartes** | nav Cartes | les cartes lisibles ; créer une carte illustrée (avec son image de fond) ou un graphe (MJ) | P-3, P-9 |
| **E-11 Carte** | E-10 ; E-3 | carte illustrée : fond, tokens ; graphe : nœuds et liens. MJ : déposer ou changer le fond, placer, configurer, rendre visible, mode Joueur. Joueur : ouvrir la fiche d'un token. | P-3, P-6, P-9 |
| **E-12 Assistant** | bouton flottant, sur tout écran d'univers | converser ; voir ce que l'agent a écrit, avec un lien ; MJ : propositions de mise à jour (actuel/proposé, **Appliquer**, **Abandonner**), images générées | P-3, P-5, P-6, P-7 |
| **E-13 Comptes-rendus** | nav Comptes-rendus ; E-3 | tous les CR lisibles de l'univers, du plus récent, avec leur campagne | P-4, P-5 |
| **E-14 Paramètres de l'univers** | nav Univers (MJ) | nom, description, système de jeu (choisir dans le catalogue, en créer un) | P-8 |
| **E-15 Système de jeu** | E-14 ; lien depuis E-3 | le référentiel commun : règles, créatures, objets ; ajouter, modifier (MJ d'un univers rattaché) | P-8 |

Les pages de connexion du serveur (« Connexion refusée », « Connexion indisponible », atteintes
depuis P-1) et le bandeau du mode bouchon sont décrits sous « Session et connexion ».

Hors produit : en mode bouchon seulement (AD-55), l'écran de choix d'un compte de test et le bandeau « mode
bouchon » — sans `E-n` ni six états, ils n'existent pas en production.

## Rôles × écrans × actions

« — » : l'écran n'est pas proposé (absent de la navigation, et 404 si on force l'adresse).

| Écran | MJ | Joueur | Admin d'instance (sans rôle dans l'univers) |
|---|---|---|---|
| E-1 | ses univers, créer | ses univers, créer | ses univers, créer |
| E-2 | créer | créer | créer |
| E-3 | tout | sans préparation ni scénarios | — |
| E-4 | tout | — | — (passe par E-5) |
| E-5 | — | — | lister les univers et leurs membres ; ajouter, changer un rôle, retirer un membre |
| E-6 | tout | liste, statut, CR, « Nouveau compte-rendu » ; ni scénarios ni préparation (cachés) | — |
| E-7 | tout | — | — |
| E-8 | lire, chercher, créer | lire, chercher | — |
| E-9 | tout ; mode Joueur ; relier et retirer des relations | sections lisibles ; écrire celles permises ; relations lisibles (section et cible) ; pièces jointes de celles-ci | — |
| E-10 | tout | cartes visibles | — |
| E-11 | tout ; mode Joueur | lire une carte visible, ouvrir une fiche | — |
| E-12 | catalogue MJ | catalogue Joueur | — |
| E-13 | tous les CR | les CR lisibles | — |
| E-14 | tout | — | — |
| E-15 | lire, écrire (univers rattaché ; sinon —, « Page introuvable. ») | lire (idem) | — |

Un admin d'instance qui est aussi membre d'un univers, MJ ou Joueur, a dans cet univers la colonne de son rôle et garde E-5 par la section « Instance » de la barre ; hors de cet univers, la colonne Admin.

Précisions de la matrice : créer une campagne, en changer le statut, créer un scénario sont au
MJ seul. L'audience d'une section se règle en ligne sur la fiche (MJ). Créer une fiche ouvre une
fenêtre (type déjà choisi, titre) qui mène à la fiche ; créer une carte se fait en ligne sur
E-10. « Rendre visible » une carte se trouve sur la carte (E-11) et dans la liste (E-10). Le fond d'une carte illustrée se dépose à sa création (E-10) et se change sur la carte (E-11) ;
une carte sans fond montre ses tokens sur un fond neutre. Une
tâche de préparation s'ajoute avec sa catégorie, se coche, se décoche ; elle ne se supprime pas.
Sur E-15, règles, créatures et objets ont le même traitement. Sur E-3, le bloc « Système de jeu » n'existe que si l'univers est rattaché à un système (MJ et Joueur).

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
- La session expire au bout de 7 jours (AD-56). **Se déconnecter** (pied de la barre latérale)
  efface la session et mène à la connexion ; en bouchon, c'est ainsi qu'on change de compte.
- `GET /api/moi` rend `{username, groups, limites}` du compte connecté : c'est ce que la barre latérale
  affiche (l'identifiant) et ce que les tests lisent pour constater les groupes. `limites.contenuSection`
  (20 000) est la borne d'une section, lue par l'écran de fiche (AD-91).

### Barre latérale

Sur tout écran d'un univers : en tête le **sélecteur d'univers** (nom, badge du rôle, la liste
des univers du compte, « Mes univers » en pied de liste) ; **Vue d'ensemble** ; **Lore** :
Personnages, Lieux, Factions, Objets, Événements, Quêtes ; **Campagnes** et **Comptes-rendus** ; pour un MJ, **Univers ▸ Membres** et **Paramètres** ; en
pied, l'identifiant, le thème (Clair, Sombre, Système), « Se déconnecter ». Hors d'un univers (E-1,
E-2) : « Mes univers », l'identifiant, le thème, « Se déconnecter ». **Un item dont l'écran n'est
pas construit n'est pas affiché** : Cartes et Administration
arrivent avec leurs tranches (Campagnes et Comptes-rendus sont affichés). « Paramètres » (E-14) n'est affiché qu'au MJ. Sur téléphone (moins de 760 px), la barre est un tiroir sous un
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

## Détail des écrans de `kanevas-recours-admin`

> E-5 et l'entrée « Administration » de la barre latérale. Les textes communs (chargement, erreur de
> chargement, connexion perdue, écriture en cours, échec d'une écriture, refus) et les refus de
> membres (« Ce compte ne s'est jamais connecté. », « Ce compte est déjà membre. », « Impossible :
> l'univers doit garder au moins un MJ. ») sont ceux de « Détail des écrans de
> `kanevas-premiere-fiche` ». Maquette finie : `docs/maquettes/e05-administration.html`.

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

Sous le fil d'Ariane « Instance / Administration » et le sous-titre « Les membres se gèrent ici ; le
contenu (fiches, comptes-rendus, cartes) n'est jamais affiché. », deux zones. À gauche, **Univers de
l'instance** : tous les univers, par nom (sans casse), chacun avec « N membres » (« 1 membre » au
singulier), l'univers choisi portant le badge « Sélectionné » ; cent à la fois, puis « Charger la suite ». À droite (sous la liste sur téléphone, après
un clic sur l'univers), **Membres — <nom de l'univers>** : la liste (identifiant, rôle MJ / Joueur,
« Retirer <identifiant> », sur chaque ligne), un champ « Identifiant du compte », le rôle (Joueur par défaut) et « Ajouter » : le même
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
- Étant donné Admin, membre MJ de « Brume », quand il ouvre l'administration, alors « Brume » porte un lien « Ouvrir » qui mène à sa vue d'ensemble, et « Lame d'Ébène » n'en porte pas ; s'il se retire de « Brume » (seul membre : refusé avec la raison du dernier MJ), le lien reste.
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
courant), jamais lesquels. Un système « n'est pas vu » d'un univers qui n'y est pas rattaché : pas
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

Atteint depuis E-14 (« Ouvrir le système ») et depuis E-3 (bloc « Système de jeu », ci-dessous), à
l'adresse `/univers/:id/systeme`. Le nom du système en titre, « Référentiel commun · utilisé par N
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
| refus | univers inconnu, sans rôle du compte, ou **non rattaché à un système** : « Page introuvable. » (E-3 ne montre pas de bloc dans ce cas ; un MJ rattache d'abord un système par E-14) | « Mes univers » |
| contenu long | 100 entrées : « Charger la suite » ; nom tronqué par « … » avec infobulle ; contenu de 20 000 caractères passe à la ligne et s'affiche en entier ; au-delà : « Erreur : 20 000 caractères au plus. » ; nom au-delà de 120 : « Erreur : 120 caractères au plus. » | idem |

*Critères.*
- Étant donné Antor, MJ de Lame d'Ébène rattaché à « CoF Mini », quand il ajoute la créature « Garde
  du sceau » avec son contenu, alors elle apparaît sous « Créatures ».
- Étant donné Mira, MJ des « Landes grises » rattachée au même système, quand elle ouvre
  « Créatures », alors elle voit « Garde du sceau » et « Utilisé par 2 univers », et aucun nom
  d'univers.
- Étant donné Léa, Joueuse de Lame d'Ébène, quand elle ouvre le système, alors elle voit « Garde du
  sceau » sans « Ajouter » ni « Modifier » ; si le MJ envoie une écriture à sa place par l'adresse de
  l'API, elle est refusée.
- Étant donné « Admin » (groupe `parents`, MJ de l'univers « Brume » qu'il vient de créer, non
  rattaché), quand il ouvre `/univers/<Brume>/systeme`, alors il voit « Page introuvable. » ; et
  sur la vue d'ensemble de « Brume » il n'y a pas de bloc « Système de jeu ».
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
Reste aux autres tranches : créer une campagne ou un scénario par l'assistant
(`kanevas-assistant-membre`), la proposition de mise à jour depuis un CR (`kanevas-monde`).

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

B-24 → le bloc Pièces jointes de E-9 (ajouter en un geste, voir une image, télécharger un autre
fichier, marquer secrète, retirer). Atteint par P-3 étape 4 (le plan d'un lieu) et P-7 étape 2 (le
portrait de son personnage). Le bloc livre ses six états (B-29), ci-dessus.

## Maquettes

`docs/maquettes/<écran>.html`, une par écran structurant, premier niveau : la structure et le
vocabulaire, pas la finition. Elles illustrent ; ce document décide.
