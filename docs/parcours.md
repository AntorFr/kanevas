# Kanevas — pour qui, besoins, parcours

> Doc du produit. Sur `epic/kanevas`, la cible du cadrage ; sur `main`, exactement ce qui est
> construit. Identifiants stables : `B-n` (besoins), `P-n` (parcours), `E-n` (écrans,
> `docs/ecrans.md`), `AD-n` (décisions, `ARCHITECTURE.md`).
>
> **Construit à ce jour** (`kanevas-premiere-fiche`, systèmes, `kanevas-suivi`, `kanevas-fichiers`, `kanevas-relier-chercher`, `kanevas-recours-admin`) : P-1 en entier, P-2 en entier (étape 3 : l'admin répare les membres, E-5),
> P-3 étapes 1 à 4, P-4 en entier, P-5 étape 1 (fiches et sections), P-6 étapes 1-2 (recherche dans un type), P-7 étape 1 et l'écriture de
> l'étape 2, P-8 en entier (B-13, B-14 : E-14 puis E-15). Le reste de ce document est la cible.

Kanevas sert à **préparer** des parties de jeu de rôle et à en **garder la mémoire** entre les
séances : le lore d'un univers, partagé entre le MJ et ses joueurs avec des droits fins par
section, les campagnes, les comptes-rendus, les cartes, et un assistant qui travaille avec les
mêmes droits que la personne qui lui parle. La table, elle, reste physique : Kanevas n'est pas un
outil de jeu en direct.

## Pour qui

| Rôle | Qui, quand, où | Support |
|---|---|---|
| **MJ** | prépare ses séances le soir ou le dimanche, à son bureau ; met le monde à jour après une partie. Plusieurs MJ peuvent tenir un même univers, tous égaux. | ordinateur, souris et clavier |
| **Joueur** | relit ce qu'il sait entre deux séances, souvent dans le bus ou le canapé ; écrit un compte-rendu le lendemain ; tient l'histoire de son personnage. | téléphone pour lire, ordinateur pour écrire |
| **Admin d'instance** | dernier recours quand un univers n'a plus de MJ joignable ; corrige les membres, ne lit pas le contenu. | ordinateur |
| **Agent** | l'assistant d'un MJ ou d'un joueur : jamais un rôle à lui, toujours les droits de la personne qui lui parle. | — |

Le rôle se porte **par univers** : un même compte est MJ d'un univers et Joueur d'un autre. Sans
ligne de membre, un compte ne voit rien de l'univers, pas même son existence.

## Besoins

Forme de la skill `exigences` ; chaque besoin cite les parcours qui le réalisent.

### Comptes, univers, membres
- **B-1** — Quand une personne se connecte pour la première fois (Authelia), Kanevas lui crée un
  compte sans accès à aucun univers. *(P-1)*
- **B-2** — Quand un compte crée un univers depuis l'accueil (E-2), il en devient MJ. *(P-1)*
- **B-3** — Quand un MJ ajoute un compte à son univers depuis la page des membres (E-4), en MJ ou
  Joueur, en tapant son identifiant exact, ce compte voit l'univers ; le MJ change ou retire ce
  rôle au même endroit. Un compte ne s'ajoute que s'il s'est déjà connecté une fois ; aucune liste
  des comptes de l'instance n'est montrée. *(P-2)*
- **B-4** — Si un compte perd son dernier rôle sur un univers, Kanevas lui répond comme si
  l'univers n'existait pas. *(P-2)*
- **B-5** — Tant qu'un univers a un MJ, il en garde au moins un : retirer le dernier est refusé.
  *(P-2)*
- **B-6** — L'admin d'instance voit le nom de tous les univers et leurs membres, et les gère
  depuis l'administration (E-5), sans jamais en lire le contenu ; pour le lire, il s'ajoute lui-même, et cela se voit. *(P-2)*

### Lore et visibilité
- **B-7** — Un MJ crée des fiches typées — personnage (PJ ou PNJ), lieu, faction, objet,
  événement, quête — depuis la liste d'un type (E-8). *(P-3, P-4)*
- **B-8** — Une fiche est faite de sections, que le MJ ajoute, réordonne et retire sur la fiche
  (E-9) ; pour chacune, il choisit si
  les joueurs la lisent, l'écrivent, et quel joueur en est l'auteur avec ses propres droits. Le MJ
  lit et écrit tout. *(P-3, P-7)*
- **B-9** — Quand un compte ouvre une fiche, il n'en voit que les sections qu'il peut lire, sans
  titre ni trace des autres ; une fiche dont il ne lit rien n'existe pas pour lui. *(P-6)*
- **B-10** — Un MJ relie une fiche à une autre par une relation typée en texte libre, portée par
  une section : elle a la visibilité de sa section, et une cible illisible n'est pas nommée.
  *(P-3, P-9)*
- **B-11** — Quand un compte cherche dans la liste d'un type (E-8), Kanevas ne rend que les fiches
  qu'il peut lire, titres compris. *(P-6)*
- **B-12** — Un MJ bascule sa lecture en mode Joueur, sur une fiche ou une carte, pour voir ce que
  verra un joueur de sa table qui n'est l'auteur d'aucune section. *(P-3)*
- **B-30** — Un MJ pose, remplace ou retire l'**illustration** d'une fiche (une image PNG, JPEG,
  GIF ou WebP au plus, depuis son en-tête, E-9) ; quiconque voit la fiche la voit, en tête de la
  fiche et en vignette dans la liste du type (E-8), où une fiche sans illustration porte une
  vignette de repli dessinée ; un Joueur ne la pose pas, et qui ne voit pas la fiche n'en obtient
  rien (son adresse répond comme une adresse inconnue). *(P-3, P-6)*

### Système de jeu
- **B-13** — Un MJ rattache son univers à un système de jeu partagé, ou en crée un, depuis les
  paramètres de l'univers (E-14). *(P-8)*
- **B-14** — Les MJ des univers d'un même système en enrichissent le référentiel commun (règles,
  créatures, objets) depuis la page du système (E-15) ; les membres de ces univers le lisent, les
  autres ne le voient pas. *(P-8)*
- **B-31** — Un compte retrouve, **hors de tout univers**, les systèmes de jeu rattachés à ses
  univers (E-16), chacun avec ceux de ses univers qui l'utilisent et jamais les autres, et ouvre la
  page d'un système (E-15) à sa propre adresse, sans passer par un univers ; il le lit s'il est
  membre d'un univers rattaché, le modifie s'il est MJ de l'un d'eux, et l'adresse d'un système
  qu'il ne voit pas répond comme une adresse inconnue. *(P-8)*

### Campagnes, scénarios, préparation
- **B-15** — Un MJ crée les campagnes d'un univers et en change le statut — en préparation,
  active, terminée — depuis la liste et la page de campagne (E-6). *(P-3)*
- **B-16** — Un MJ crée les scénarios d'une campagne depuis sa page (E-6) et les écrit (E-7) ; les
  joueurs ne les voient jamais.
  *(P-3)*
- **B-17** — Un MJ tient la liste de préparation d'une campagne sur sa page (E-6) : des tâches en
  cinq catégories (monstres, PNJ, cartes, déroulements, autre) qu'il coche ; une tâche cochée
  quitte la liste active sans disparaître. Les joueurs n'en voient rien. *(P-3)*
- **B-18** — Un joueur voit la liste des campagnes de l'univers, nom et statut. *(P-4, P-6)*

### Comptes-rendus et mise à jour du monde
- **B-19** — Quand un membre écrit un compte-rendu depuis la page d'une campagne (E-6), le CR est
  lisible par toute la table et modifiable par son auteur ; le MJ lit et écrit tout CR. Plusieurs
  CR coexistent pour une même séance. *(P-4)*
- **B-20** — Les comptes-rendus d'un univers se lisent ensemble, du plus récemment créé au plus
  ancien (un CR retouché ne remonte pas), dans la liste des CR (E-13). *(P-4, P-6)*
- **B-21** — Quand un MJ demande à son assistant (E-12) une mise à jour du monde à partir d'un CR,
  l'assistant propose un nouveau contenu de section sans rien écrire ; le MJ voit l'actuel et le
  proposé, puis l'applique ou l'abandonne d'un geste. Rien ne s'applique tout seul. *(P-5)*

### Cartes
- **B-22** — Un MJ pose une carte illustrée (une image de fond qu'il dépose sur la carte, des
  tokens liés à des fiches, placés librement) ou un graphe (des fiches choisies, reliées par leurs relations) depuis
  la liste des cartes (E-10). *(P-3, P-9)*
- **B-23** — Un MJ rend une carte visible des joueurs ; un joueur n'y voit que les tokens et liens
  dont il peut lire la fiche, et ouvre la fiche d'un token. *(P-3, P-6)*

### Pièces jointes et images
- **B-24** — Quand un compte qui écrit une section y dépose un fichier (E-9), en un geste, il
  devient une pièce jointe de la section, avec sa visibilité ; le MJ peut la marquer secrète. Une
  pièce jointe n'est servie que par une route qui revérifie les droits. *(P-3, P-7)*
- **B-25** — Quand un MJ demande une image à son assistant (E-12) pour une section, l'image est
  générée et attachée en un seul geste ; un échec n'attache rien. *(P-3)*

### Assistant
- **B-26** — Chaque membre a un assistant, ouvert depuis un bouton présent sur tous les écrans
  d'un univers (E-12) : il cherche, résume et modifie ce que la personne peut lire et écrire, ni
  plus ni moins ; un refus est le même que par l'interface. *(P-3, P-6, P-7)*
- **B-27** — L'assistant d'un MJ peut aussi créer une campagne ou un scénario, proposer une mise à
  jour du monde et générer une image ; celui d'un joueur ne le peut pas. *(P-3, P-5)*

### Transverse
- **B-28** — Toute page demande une connexion ; rien du contenu n'est servi sans compte, et
  `/healthz` ne dit que le nom et la version. *(P-1)*
- **B-29** — Chaque écran a ses états : vide, chargement, erreur, connexion perdue, refus (caché
  ou expliqué), contenu long. *(tous)*

## Parcours

Chaque étape : qui agit, par quel geste, sur quel écran. « Agent » veut dire : la personne le
demande à son assistant (E-12).

### P-1 — Démarrer (tout nouveau compte, première visite)
1. La personne ouvre Kanevas ; Authelia l'authentifie ; elle arrive sur l'**accueil** (E-1) :
   « aucun univers ».
2. Si elle veut mener une partie : **Créer un univers** (E-2) — nom, description ; elle arrive
   sur sa **vue d'ensemble** (E-3), en MJ.
3. Si elle est joueuse : l'accueil lui montre son identifiant et lui dit de le donner à son MJ ;
   après son ajout, l'univers apparaît dans l'accueil.
*Échec* : Authelia refuse — Kanevas ne montre que « La connexion a été refusée. » (et un lien « Réessayer »), aucun contenu ; Authelia injoignable — « Authelia ne répond pas pour l'instant. Réessayez dans un moment. » ; chaque page a un lien « Réessayer » qui relance la connexion.

### P-2 — Réunir sa table (MJ ; admin en recours)
1. Le MJ ouvre **Membres** (E-4) depuis la navigation de l'univers.
2. Il ajoute un compte par son identifiant, choisit MJ ou Joueur ; change un rôle ; retire un
   membre.
3. En recours, l'admin ouvre l'**administration** (E-5), choisit l'univers, fait le même geste.
   *Exemple* : le seul MJ d'un univers a quitté la table ; l'admin ajoute un MJ qui a déjà ouvert
   Kanevas. L'admin ne lit toujours rien du contenu ; s'il veut le lire, il s'ajoute lui-même, et
   l'ajout figure dans la liste des membres que voit le MJ de l'univers.
4. Une fois membre, il ouvre l'univers depuis E-5 : sa **vue d'ensemble** (E-3).
*Échec* : identifiant jamais connecté — « ce compte ne s'est jamais connecté » ; retirer le
dernier MJ — refusé avec la raison ; un compte qui n'est pas admin ouvre l'adresse — « Page
introuvable. ».

### P-3 — Préparer la séance du samedi (MJ, dimanche soir, bureau)
1. **Vue d'ensemble** (E-3) : les campagnes actives, les derniers CR, la préparation en cours.
2. **Campagne** (E-6) : il crée la campagne (« En préparation ») ou ouvre l'existante et la passe
   « Active » ; il relit les CR les plus récents, crée ou ouvre un **scénario** (E-7) et l'écrit
   (ou demande à son **assistant** (E-12) de créer la campagne ou le scénario : le bloc d'écriture mène à E-6 ou E-7).
3. Il coche ou ajoute des tâches de **préparation** (E-6).
4. **Lore** : depuis la **liste d'un type** (E-8), il crée un PNJ ; sur la **fiche** (E-9), il
   écrit « Apparence » (lue des joueurs) et « Vérité — MJ seul », relie le PNJ à sa faction,
   dépose le plan d'un lieu, et pose le portrait d'Aldric en **illustration** de la fiche (visible
   de qui voit la fiche) ; de retour sur la liste, la carte d'Aldric porte ce portrait.
5. Il demande à son **assistant** (E-12) « rappelle-moi tout ce qu'on sait d'Aldric » puis
   « fais un portrait pour Apparence » : l'image est attachée à la section.
6. **Cartes** (E-10, E-11) : il place le PNJ sur la carte de la ville, passe en **mode Joueur**
   pour vérifier, puis rend la carte visible.
*Échec de l'assistant* : une demande de création échoue ou l'assistant est indisponible : le panneau le dit (« Je n'ai pas pu répondre — réessayer » ou « L'assistant n'est pas disponible pour le moment. »), la création a pu avoir lieu avant que la réponse soit perdue (délai, connexion coupée) : avant de réessayer, Antor regarde E-6 ou E-7 pour ne pas créer deux fois, puis crée à la main si besoin (étape 2).
*Moment fort* : la fiche en mode Joueur ne trahit aucun secret.
*Échec* (illustration, étape 4) : il choisit un PDF ou un fichier vide — « « plan.pdf » n'est pas
une image… » ou « « portrait.png » est vide. », l'illustration d'avant reste ; l'envoi est coupé —
« l'envoi n'a pas abouti », avec « Réessayer » ; un autre MJ l'a rétrogradé Joueur entre-temps —
« Vous ne pouvez plus modifier l'illustration de cette fiche. » et les gestes disparaissent ; le
retrait échoue — « L'action n'a pas abouti. Réessayez. », l'illustration reste ; l'image ne se charge
pas — le cadre dit « Image indisponible. » et il garde « Remplacer » et « Retirer ».

### P-4 — Écrire le compte-rendu (joueur ou MJ, le lendemain de la partie)
1. Depuis la **vue d'ensemble** (E-3) ou la **liste des campagnes** (E-6), il ouvre la campagne.
2. **Nouveau compte-rendu** : titre, texte ; il le publie — il s'ouvre comme une **fiche** (E-9)
   de type compte-rendu.
3. Il le retouche plus tard ; les autres le lisent depuis la campagne ou la **liste des CR**
   (E-13).

### P-5 — Mettre le monde à jour après la partie (MJ)
1. Il lit les CR (E-13 → E-9).
2. Depuis un CR, il demande à son **assistant** (E-12), en nommant ce CR (l'assistant ne sait pas quel
   écran est ouvert) : « mets à jour la section Vérité d'Aldric d'après le compte-rendu de la séance 3 ».
3. Le panneau montre l'actuel et le proposé ; il **applique** ou **abandonne** d'un clic.
4. Sinon, il édite la fiche lui-même (E-9).
*Échec* : la section a changé depuis la proposition — appliquer est refusé, avec la raison.

### P-6 — Se resituer avant la séance (joueur, mercredi soir, téléphone)
1. **Accueil** (E-1) → **vue d'ensemble** de l'univers (E-3) : les derniers CR, les cartes
   visibles.
2. Il parcourt la **liste des personnages** (E-8), une grille de cartes illustrées, et reconnaît
   Aldric à son portrait — ou le cherche par son nom — puis ouvre la **fiche** (E-9) : seulement ce
   que la table sait.
3. Il ouvre la **carte** (E-11), touche un token, relit la fiche.
4. Ou il demande à son **assistant** (E-12) « que sait-on d'Aldric ? ».
*Échec* : il demande de lire « Vérité » : l'assistant répond « Introuvable. », comme l'interface ;
l'assistant est indisponible ou en erreur : le panneau le dit, et la fiche reste lisible (E-9).
*Échec* (illustration, étape 2) : une image ne se charge pas (réseau du téléphone) — la carte
montre la vignette de repli, jamais une image cassée, et la fiche « Image indisponible. » ; une
fiche que le MJ a fermée aux joueurs entre-temps disparaît de la grille, et l'adresse de son
illustration répond comme une adresse inconnue.

### P-7 — Tenir l'histoire de son personnage (joueur)
1. Le MJ a créé la fiche de son PJ et lui en a confié une section en auteur (E-9).
2. Le joueur l'écrit sur la **fiche** (E-9), y dépose un portrait, ou demande à son **assistant**
   (E-12) d'y ajouter un paragraphe.
*Échec* : il demande d'écrire dans une section qu'il lit sans l'écrire : « Vous ne pouvez pas modifier
cette section. », rien n'est écrit.
*Échec* (dépôt) : fichier vide, section déjà à 50 pièces jointes, envoi interrompu ou droit
d'écriture retiré — le fichier n'est pas attaché, la raison est dite sur la section (E-9), rien n'est
laissé à moitié.

### P-8 — Monter un univers sur un système partagé (MJ)
*Antor, MJ de « Lame d'Ébène », le dimanche soir ; Mira, MJ des « Landes grises », qui joue le même
système.*
1. **Paramètres de l'univers** (E-14) : il choisit un système du catalogue, ou en crée un
   (« Créer et rattacher ») ; il peut aussi détacher l'univers (« Aucun système ») et, dans le même écran, corriger le nom et la description de son univers.
2. **Système de jeu** (E-15), qu'il ouvre depuis « Systèmes de jeu » (E-16, hors de ses univers) ou
   par « Ouvrir le système » (E-14) : il retrouve le bestiaire commun et y ajoute une créature, que les
   autres univers du système voient aussitôt ; Mira, rattachée au même système, la lit.
   *Moment fort* : la créature ajoutée par Antor apparaît chez Mira, sans que Mira voie un mot du
   lore d'Antor — ni même le nom de son univers : sa liste « Systèmes de jeu » ne lui montre que
   « Les Landes grises ».
   *Variante joueur* : Léa, Joueuse de « Lame d'Ébène », ouvre le bloc « Système de jeu » de la vue d'ensemble
   (E-3) et lit la même créature, sans pouvoir la modifier.
*Échec* : un nom de système déjà pris — « Un système porte déjà ce nom. » ; une créature modifiée
entre-temps par l'autre MJ — « Cette entrée a changé depuis que vous l'avez ouverte. », le texte en
cours est gardé ; un univers détaché pendant qu'un joueur lit le système — la page du joueur répond
« Page introuvable. » au prochain chargement.

### P-9 — Voir qui est lié à qui (MJ, puis la table)
1. **Cartes** (E-10) → nouveau **graphe** (E-11) : il choisit les factions ; les liens viennent
   de leurs relations.
2. Il le rend visible ; un joueur n'y voit que ce qu'il peut lire.

## Hors périmètre

- **Jeu en direct** : pas d'initiative, de combat animé, de brouillard de guerre ; la table reste
  physique.
- **Caractéristiques structurées** (fiche de combat, statistiques) : une pièce jointe en V1 ; des
  types de fiches dédiés plus tard.
- **Supprimer** une fiche, un univers, une campagne, un scénario, un CR, une carte, une tâche,
  un système : rien ne se supprime en V1, sauf une pièce jointe, une section, une relation, un
  membre, et le token ou le nœud d'une carte (on le retire de la carte ; sa fiche reste). *(choix de cadrage, à revoir à l'usage)*
- **Créer une fiche en joueur** : le MJ crée toute fiche, y compris celle d'un PJ, et en ouvre une
  section à son joueur.
- **Inviter un compte qui ne s'est jamais connecté**, lien d'invitation.
- **Recherche dans tous les types à la fois** : par l'assistant seulement.
- **Import depuis Kanka** : une epic à part.
- **Calendrier ou chronologie, lanceur de dés, usage sans connexion (PWA)** : non triés.
- **Historique des modifications, export, partage public.**
