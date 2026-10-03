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
| **E-3 Vue d'ensemble de l'univers** | E-1 ; sélecteur d'univers | la campagne active, les derniers CR, la préparation (MJ), les cartes visibles | P-3, P-4, P-6 |
| **E-4 Membres** | nav Univers (MJ) | lister, ajouter par identifiant, changer le rôle, retirer | P-2 |
| **E-5 Administration** | nav (admin d'instance) | lister les univers de l'instance, en gérer les membres — jamais le contenu | P-2 |
| **E-6 Campagne** | nav Campagnes (liste) ; E-3 | liste des campagnes ; pour une campagne : statut, scénarios et « Nouveau scénario » (MJ), préparation (MJ), comptes-rendus, « Nouveau compte-rendu » | P-3, P-4 |
| **E-7 Scénario** | E-6 (MJ) | écrire et relire un scénario | P-3 |
| **E-8 Liste de fiches** | nav Lore | les fiches d'un type que le compte peut lire ; chercher dans ce type ; créer (MJ) | P-3, P-6 |
| **E-9 Fiche** | E-8 ; un token ; un lien ; E-13 | lire et écrire les sections permises ; ajouter, réordonner, retirer une section, régler son audience, relier (MJ) ; déposer, marquer secrète, retirer une pièce jointe ; bascule mode Joueur (MJ). Un compte-rendu s'ouvre ici. | P-3 à P-7 |
| **E-10 Cartes** | nav Cartes | les cartes lisibles ; créer une carte illustrée (avec son image de fond) ou un graphe (MJ) | P-3, P-9 |
| **E-11 Carte** | E-10 ; E-3 | carte illustrée : fond, tokens ; graphe : nœuds et liens. MJ : déposer ou changer le fond, placer, configurer, rendre visible, mode Joueur. Joueur : ouvrir la fiche d'un token. | P-3, P-6, P-9 |
| **E-12 Assistant** | bouton flottant, sur tout écran d'univers | converser ; voir ce que l'agent a écrit, avec un lien ; MJ : propositions de mise à jour (actuel/proposé, **Appliquer**, **Abandonner**), images générées | P-3, P-5, P-6, P-7 |
| **E-13 Comptes-rendus** | nav Comptes-rendus ; E-3 | tous les CR lisibles de l'univers, du plus récent, avec leur campagne | P-4, P-5, P-6 |
| **E-14 Paramètres de l'univers** | nav Univers (MJ) | nom, description, système de jeu (choisir dans le catalogue, en créer un) | P-8 |
| **E-15 Système de jeu** | E-14 ; lien depuis E-3 | le référentiel commun : règles, créatures, objets ; ajouter, modifier (MJ d'un univers rattaché) | P-8 |

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
| E-9 | tout ; mode Joueur | sections lisibles ; écrire celles permises ; pièces jointes de celles-ci | — |
| E-10 | tout | cartes visibles | — |
| E-11 | tout ; mode Joueur | lire une carte visible, ouvrir une fiche | — |
| E-12 | catalogue MJ | catalogue Joueur | — |
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

Un refus ne dit jamais qu'une chose existe : une fiche, une section, une carte qu'on ne peut pas
lire sont absentes, et leur adresse répond comme une adresse inconnue.

## États

Chaque écran structurant a les six états de la skill `ux` (vide, chargement, erreur, hors-ligne —
la connexion est perdue et l'écran le dit, sans mode hors-ligne —, refus, contenu long) : ils se décrivent avec sa maquette finie, dans la tranche qui le construit.
Deux sont posés dès le cadrage parce qu'ils traversent tout :

- **vide** d'un compte neuf (E-1) : dit quoi faire — créer un univers, ou donner son identifiant,
  affiché, à son MJ ;
- **refus** d'une ressource illisible : toujours comme une ressource inconnue.

## Maquettes

`docs/maquettes/<écran>.html`, une par écran structurant, premier niveau : la structure et le
vocabulaire, pas la finition. Elles illustrent ; ce document décide.

## Détail des écrans de `kanevas-cartes-graphes`

> E-10 Cartes, E-11 Carte (carte illustrée et graphe), le bloc « Cartes » de E-3, l'item « Cartes »
> de la barre latérale (il apparaît avec cette tranche). Mêmes six états et mêmes textes communs que
> la première fiche (chargement, erreur, connexion perdue, écriture en cours, échec d'une écriture,
> refus « Page introuvable. », session expirée). Maquettes : `e10` (liste : MJ, Joueuse, vide,
> création en erreur) et `e11` (carte illustrée et graphe : MJ, MJ en mode Joueur, Joueuse, états).
> Le document prime sur la maquette.

### E-10 Cartes

Le titre « Cartes », le sous-titre « Les cartes de l'univers. Les joueurs ne voient que celles que vous rendez visibles. » (MJ seulement), puis la liste des cartes **de l'univers que le compte lit** : le MJ les voit
toutes ; un Joueur (et le MJ en mode Joueur, voir E-11) seulement celles qui sont **visibles**. Une
ligne : une vignette (le fond d'une carte illustrée, un motif neutre sans fond ou pour un graphe), le
titre, la forme (« Carte illustrée » ou « Graphe »), et pour le MJ l'état « Visible des joueurs » ou
« MJ seul » (pastille ambre) avec le geste inverse : « Rendre visible » / « Cacher aux joueurs », qui
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
| MJ en mode Joueur | comme un Joueur | absent | absent |
| Admin d'instance, ou compte sans rôle dans l'univers (Teo) | aucune (« Page introuvable. ») | — | — |

*Textes.* Aucune carte : MJ « Aucune carte pour l'instant. Créez-en une pour commencer. » (le
formulaire reste proposé) ; Joueur « Aucune carte n'est visible pour l'instant. » ; titre vide ou
trop long : « Erreur : le titre est obligatoire. » / « Erreur : 80 caractères au plus. » ; fond qui
n'est pas une image PNG, JPEG, GIF ou WebP, ou vide : « Erreur : ce fichier n'est pas une image (PNG,
JPEG, GIF ou WebP). » ; fond de plus de 25 Mo : « Erreur : l'image dépasse 25 Mo. » ; échec de
création : « La carte n'a pas pu être créée. Réessayez. », le formulaire garde sa saisie (le fond
choisi aussi). Une vignette qui ne se charge pas montre le motif neutre.

| État | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| vide | les textes ci-dessus ; pour le MJ, « Nouvelle carte » | créer (MJ) |
| chargement | « Chargement… » ; le formulaire du MJ est déjà là | — |
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
« Annuler »), la forme, l'état de visibilité, et pour le MJ la **bascule mode MJ / mode Joueur** et
« Rendre visible » / « Cacher aux joueurs ». Dessous, **le cadre** de la carte, puis la liste
« Sur la carte », puis (graphe) la liste « Liens ».

*Carte illustrée.* Le cadre montre l'image de fond à ses proportions (16/10 neutre sans fond, AD-70) ;
chaque **token** est un rond portant la première lettre du titre de sa fiche, avec le titre dessous
(24 caractères, puis « … »). Sa zone cliquable fait au moins 44 px. Un token n'est présent que si sa
fiche est lisible du lecteur (AD-38). **Joueur** : toucher un token ouvre la fiche (E-9) ; rien d'autre.
**MJ (mode MJ)** : un clic **sélectionne** le token et ouvre, sous le cadre, un panneau « Maître
Aldric · Personnage » avec « Ouvrir la fiche » et « Retirer de la carte » (ce bouton demande la même confirmation que la liste « Sur la carte » : rien n'est retiré au premier clic) ; on **déplace** un token au
glisser, ou au clavier (token sélectionné : flèches, 1 %, avec Maj 5 % ; l'aide « Flèches : déplacer de 1 % (Maj : 5 %) » est affichée sous le cadre) ; la position s'enregistre au
relâchement (ou à la touche) ; hors du cadre elle est ramenée au bord. « Ajouter une fiche » ouvre une
fenêtre : un choix de **type** (les sept), un champ de recherche, la liste des fiches de ce type
(celles que le MJ lit : toutes), chacune avec « Ajouter » ; une fiche déjà sur la carte porte « Déjà
sur la carte » sans bouton. « Fermer » ferme la fenêtre. Le token apparaît au **centre** (50 %, 50 %), prêt à être déplacé.
« Changer le fond » (« Ajouter un fond » s'il n'y en a pas) ouvre le sélecteur : **choisir l'image
suffit**, elle part aussitôt et remplace l'ancienne.

*Graphe.* Le cadre est un schéma : un **nœud** par fiche (rond, première lettre, titre dessous, 24
caractères), une flèche par **lien** de la fiche d'où vient la relation vers la fiche visée, avec le
type de la relation écrit sur la flèche (lien de A vers B : « membre de »). La disposition est celle
du navigateur (AD-71) ; elle n'est pas modifiable. La zone cliquable d'un nœud fait au moins 44 px ; le
cadre grandit avec le nombre de nœuds (au moins 60 px par nœud sur chaque côté) et, sur téléphone,
défile dans les deux sens plutôt que de se réduire ; la liste « Sur la carte » reste le chemin sûr au toucher. Joueur : toucher un nœud ouvre sa fiche. MJ : un
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
| connexion perdue | le bandeau ; renommer, visibilité, fond, « Ajouter une fiche », déplacer, retirer désactivés ; la carte chargée reste | lire, ouvrir une fiche |
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
- Étant donné le graphe « Les factions » avec « Les Lames Grises », « Les Ombres de Fer » et « La
  Guilde » ; la relation « allié de » de la première vers la deuxième, portée par une section que
  Léa ne lit pas, et « rival de » de la première vers la troisième, portée par une section qu'elle lit :
  Antor voit les deux liens ; Léa, qui lit les trois fiches, voit seulement « rival de » ; si elle ne
  lisait pas « La Guilde », elle verrait deux nœuds et aucun lien.
- Étant donné le fond « plan.pdf » choisi sur une carte, alors le refus s'affiche et le fond d'avant
  reste ; l'adresse du fond d'une carte non visible répond 404 à Léa.
- Étant donné Léa sur une carte, quand elle force l'adresse d'une action de MJ, alors elle reçoit 403.

### E-3 — le bloc « Cartes »

Sur la vue d'ensemble, un bloc **Cartes visibles** (le titre de la maquette `e03`), inscrit au registre des blocs de E-3 (un fichier dans
`frontend/src/ecrans/vue-ensemble/blocs/`, une ligne au registre, après les blocs des campagnes et
des comptes-rendus ; aucun bloc existant n'est modifié). Il liste, pour tous les rôles, les **cartes
visibles des joueurs** (cinq au plus, titre alphabétique) : le titre en lien vers E-11 et la forme ;
dessous « Toutes » vers E-10. Le MJ voit donc ce que la table voit ; ses cartes « MJ seul »
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
