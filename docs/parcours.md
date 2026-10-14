# Kanevas — pour qui, besoins, parcours

> Doc du produit. Sur `epic/kanevas`, la cible du cadrage ; sur `main`, exactement ce qui est
> construit. Identifiants stables : `B-n` (besoins), `P-n` (parcours), `E-n` (écrans,
> `docs/ecrans.md`), `AD-n` (décisions, `ARCHITECTURE.md`).
>
> **Construit à ce jour** (`kanevas-premiere-fiche`, systèmes, `kanevas-suivi`, `kanevas-fichiers`, `kanevas-relier-chercher`, `kanevas-recours-admin`) : P-1 en entier, P-2 en entier (étape 3 : l'admin répare les membres, E-5),
> P-3 étapes 1 à 4, P-4 en entier, P-5 étape 1 (fiches et sections), P-6 étapes 1-2 (recherche dans un type), P-7 étape 1 et l'écriture de
> l'étape 2, P-8 en entier (B-13, B-14 : E-14 puis E-15). Le reste de ce document est la cible.
>
> **Epic `kanevas-import`** (cadrage proposé le 2026-10-11, sur `epic/kanevas-import`) : ouvrir
> Kanevas à une base existante — d'abord la base Kanka de Monsieur (501 fiches), poussée par un script
> qui tourne sur son Mac — et lui donner ce qu'il faut pour y vivre : Markdown, liens `[[…]]`, blocs MJ
> dans un texte, arbre des fiches, liens entrants, recherche tous types, alias et étiquettes, types de
> fiche plus nombreux et choisis par système et par univers, suppression, jeton d'API, sous-type, médiathèque. B-32 à B-56,
> P-10 à P-16, E-17 à E-19, AD-95 à AD-111. Les `[À TRANCHER]` du cadrage ont été tranchés par Monsieur le 2026-10-11 ; ce qui reste ouvert est marqué `[À TRANCHER]` à sa place.

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
| **Script d'import** | un programme qui tourne **hors de Kanevas** (le premier : sur le Mac de Monsieur, il lit son export Kanka) et pousse par l'API d'import ; jamais un rôle à lui : il agit avec le jeton d'API d'un MJ, donc avec les droits de ce MJ dans un seul univers. Kanevas ne connaît pas Kanka : le script traduit. | le Mac de Monsieur, par le réseau |

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
  événement, quête, et depuis `kanevas-import` créature, vaisseau, race, savoir, récit, règle, note
  (la liste du produit, B-42), parmi les types activés pour son univers — depuis la liste d'un type (E-8). *(P-3, P-4, P-13)*
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

### Écrire, lier, ranger (`kanevas-import`)
- **B-32** — Le contenu d'une section, d'un scénario et d'une entrée de système est du **Markdown** :
  quand un compte l'enregistre (E-9, E-7, E-15), Kanevas l'affiche mis en forme — titres, gras,
  italique, listes, citations, tableaux, liens, images de la section — et jamais du HTML écrit dans le
  texte, qui s'affiche tel quel ; l'éditeur a un **aperçu**. *(P-12, P-14)*
- **B-33** — Quand un compte qui écrit une section tape `[[`, E-9 lui propose les fiches qu'il peut
  lire et insère un **lien** vers celle qu'il choisit ; à la lecture, un lien vers une fiche que le
  lecteur voit s'ouvre sur cette fiche ; un lien vers une fiche qu'il ne voit pas s'affiche comme le
  texte autour, sans soulignement ni trace ; un lien dont la cible n'existe pas (supprimée, jamais
  importée) s'affiche en texte pour un joueur et marqué « lien cassé » pour un MJ. Dans un scénario,
  un lien vise une fiche de l'univers de sa campagne, sous les mêmes droits ; dans une entrée de
  système de jeu, partagée entre univers, `[[…]]` reste du texte. *(P-12, P-14)*
- **B-34** — Un MJ pose dans une section un **bloc MJ** (E-9, « Bloc MJ » de l'éditeur, ou
  l'import) ; tant que le lecteur n'est pas MJ hors mode Joueur, Kanevas ne lui en livre rien : ni
  sur la fiche, ni par l'assistant, ni par la recherche (un mot qui n'est que dans un bloc MJ ne fait
  pas trouver la fiche), ni par les liens entrants (un lien écrit dans un bloc MJ ne compte pas), ni
  par les images qu'il contient. Une section qui contient un bloc MJ ne s'écrit que par un MJ. Un
  fichier **ajouté depuis un bloc MJ** entre dans la médiathèque « Réservé au MJ » (B-55). *(P-12, P-14 ;
  décision de Monsieur du 2026-10-11)*
- **B-35** — Un MJ range une fiche **sous une autre** du même univers (E-9, « Déplacer sous… », ou
  l'import) ; la fiche montre alors ses ancêtres dans le fil d'Ariane et ses **enfants** dans un bloc ;
  la liste d'un type (E-8) se lit aussi **en arbre**. Un lecteur n'y voit que les fiches qu'il peut
  lire : un ancêtre illisible est sauté, un enfant illisible absent, sans compteur. *(P-12, P-14)*
- **B-36** — Quand un compte ouvre une fiche (E-9), il voit les fiches qui la **mentionnent** — par
  un lien dans une section qu'il lit (hors bloc MJ s'il n'est pas MJ) ou par une relation qu'il lit —,
  et rien de celles qu'il ne lit pas. *(P-12)*
- **B-37** — Quand un compte cherche depuis la **recherche** (E-17), Kanevas cherche dans tous les
  types à la fois, dans les titres, les **alias** et les sections qu'il lit, filtre par type et par
  **étiquette**, et ne rend que les fiches qu'il peut lire (B-11, B-34). *(P-12)*
- **B-38** — Un MJ donne à une fiche des **alias** (autres noms) et des **étiquettes** (E-9) ; quiconque
  voit la fiche les voit, comme son titre ; une étiquette touchée ouvre la recherche filtrée sur elle
  (E-17). Un alias ou une étiquette n'est jamais secret. *(P-12, P-14)*
- **B-39** — Un MJ change le **titre**, le **type** et le **parent** d'une fiche après sa création,
  depuis son en-tête (E-9). Le type d'un compte-rendu ne change pas, et une fiche ne devient pas un
  compte-rendu. *(P-14)*
- **B-40** — Un MJ **supprime une fiche** depuis son en-tête (E-9), après confirmation qui nomme ce
  qui part avec elle (sections et leurs références de fichier, relations qui la visent, places sur les
  cartes ; les fichiers eux-mêmes restent dans la médiathèque) ; ses
  enfants remontent sous son parent ; les liens qui la visaient deviennent des liens cassés (B-33).
  *(P-14)* Une fiche importée supprimée **revient** au rejeu suivant si le script l'envoie encore :
  pour qu'elle ne revienne pas, on la supprime dans l'export. Aucune trace de la suppression n'est
  gardée (décision de Monsieur du 2026-10-11).
- **B-41** — Un MJ **supprime un univers** depuis ses paramètres (E-14), en tapant son nom pour
  confirmer ; tout son contenu et ses jetons partent, ses membres n'y ont plus accès, et son adresse
  répond comme une adresse inconnue. Un système de jeu rattaché reste. *(P-10)*
- **B-42** — Les **types de fiche** sont une liste fixe du produit, enrichie par une version de
  Kanevas, jamais créée par un utilisateur. Un MJ d'un univers rattaché **active ou désactive** chaque
  type pour le système (E-15) ; un MJ **force** un type à activé ou désactivé pour son univers, ou le
  laisse **suivre le système** (E-14) ; un univers sans système suit le défaut du produit (tout
  activé). Un type désactivé quitte la barre latérale, la création (E-8) et les filtres de la
  recherche (E-17) ; ses fiches restent, atteintes par un lien, la recherche ou l'arbre. Le
  compte-rendu n'est pas réglable. *(P-13)*
- **B-52** — Un MJ donne à une fiche un **sous-type** libre, propre à son type (Savoir · Ressource,
  Lieu · Planète, Vaisseau · Frégate), à la création (E-8) ou depuis son en-tête (E-9), en le tapant ;
  E-9 lui propose les sous-types déjà employés pour ce type dans l'univers. Quiconque voit la fiche voit
  son sous-type, sur sa carte (E-8), dans son en-tête (E-9) et dans la recherche (E-17), qui le trouve ;
  la liste d'un type (E-8) se **filtre par sous-type** parmi ceux des fiches que le lecteur voit. Les
  étiquettes restent, transversales (B-38). *(P-12, P-14 ; décision de Monsieur du 2026-10-11)*
- **B-43** — Tout texte Markdown — le contenu d'une section (et le texte d'un compte-rendu), d'un
  scénario, d'une entrée de système — tient jusqu'à **100 000 caractères** (au lieu de 20 000) ;
  au-delà, l'écriture est refusée comme aujourd'hui (AD-91, AD-106). *(P-10, P-14)*
- **B-44** — Tout fichier d'une fiche — son illustration (une image), un fichier joint à une section
  (image ou document), une image ou un lien de fichier dans un texte — est un fichier de la
  **médiathèque** de l'univers (B-53), **référencé**, jamais copié. Quand un compte lit une section qui
  en montre un, il le voit si la section (et, dans un bloc MJ, le bloc) **et** le fichier lui sont
  ouverts ; si la section l'est et le fichier non, la mention « Image réservée au MJ. » (ou « Fichier
  réservé au MJ. » pour un document) tient sa place ; un fichier dans un bloc MJ disparaît avec le bloc.
  L'illustration suit la même double garde (la fiche et l'image). *(P-12, P-16 ; décisions de Monsieur
  du 2026-10-11)*

### Import et accès par API (`kanevas-import`)
- **B-45** — Un MJ crée un **jeton d'API** pour son univers depuis « Accès par API » (E-18) : un nom,
  une durée (30 jours par défaut, un an au plus) ; Kanevas le montre **une seule fois** ; le jeton agit
  avec les droits de ce MJ dans ce seul univers, et seulement sur l'API d'import. *(P-11, P-10)*
- **B-46** — Un MJ voit les jetons de son univers (nom, créé par, dernier usage, expiration) et en
  **révoque** un depuis E-18 ; si le jeton est révoqué, expiré, ou si son MJ a perdu ce rôle, alors
  toute requête qui le présente est refusée (401) et rien n'est écrit. *(P-11)*
- **B-47** — Quand un script pousse une fiche par l'API d'import avec une **clé d'origine**, Kanevas
  la crée si la clé est inconnue dans l'univers, la met à jour si elle est connue, et ne change rien si
  rien n'a changé — fiche, sections, relations, alias, étiquettes, parent, pièces jointes, illustration,
  campagnes et scénarios ; rejouer le même import ne crée aucun doublon. *(P-10)*
- **B-48** — Si ce qu'un import a écrit a été **modifié dans Kanevas** depuis (par un humain ou son
  assistant) — le titre, le type, le sous-type, le parent, les alias, les étiquettes d'une fiche ; le titre, le
  contenu, l'audience, les fichiers joints d'une section ; l'illustration d'une fiche ; le nom et le
  statut d'une campagne ; le titre et le contenu d'un scénario ; le nom et la **visibilité** d'un
  fichier de la médiathèque —, alors un nouvel import n'écrase pas ce qui a été modifié,
  écrit le reste, et le rapport du lot nomme chaque champ laissé. *(P-10, P-14)*
- **B-49** — Un MJ voit sur E-18 les **lots d'import** de son univers : quand, par quel jeton, combien
  d'objets créés, mis à jour, inchangés, refusés, **par nature** (fiches, fichiers, campagnes,
  scénarios, relations), combien de liens et références restent en attente, et pour chaque refus la
  clé d'origine et la raison. *(P-10)*
- **B-50** — Une fiche importée garde sa **clé d'origine** (visible du MJ seul, E-9) et peut porter sa
  **date d'origine** de création, qui ordonne les comptes-rendus (E-13) comme une date de Kanevas.
  *(P-10, P-12)*

### Médiathèque (`kanevas-import`, décisions de Monsieur du 2026-10-11)
- **B-53** — Chaque univers a une **médiathèque** (E-19) qui porte **tous** ses fichiers, images
  (PNG, JPEG, GIF, WebP) et documents (PDF et tout autre fichier), chacun avec sa **visibilité** —
  « Visible des joueurs » (le défaut) ou « Réservée au MJ ». Un MJ y ajoute des fichiers, en change le
  nom et la visibilité, en supprime un ; quiconque est membre y voit ceux qui lui sont ouverts (un
  joueur : ceux visibles des joueurs), filtrés en **Images** ou **Documents** (un document se montre par
  l'icône de son type, son nom et sa taille), et pour chacun les fiches **qu'il lit** qui l'utilisent.
  *(P-16, P-10)*
- **B-54** — Quand un MJ supprime un fichier utilisé (E-19), Kanevas demande confirmation en listant les
  fiches qui l'utilisent ; après, ces fiches ne le montrent plus (« Fichier supprimé de la
  médiathèque. » pour un MJ, rien pour un joueur). Quand un MJ réserve au MJ un fichier utilisé dans une
  section lue des joueurs (E-19, ou le menu du fichier joint sur E-9), Kanevas le prévient de même, en
  listant ces sections. *(P-16)*
- **B-55** — Un compte qui écrit une section y met un fichier par **deux chemins**, sur E-9 (en édition
  depuis la barre d'outils, ou par « Joindre un fichier » du bloc Pièces jointes) :
  (1) **ajouter un fichier** depuis son appareil — en un seul geste, le fichier entre dans la
  médiathèque **et** s'intègre à la fiche : image dans le texte, fichier joint à la section, ou
  illustration (MJ) ; sa visibilité **suit l'endroit d'ajout** : dans un bloc MJ, ou dans une section
  que les joueurs ne lisent pas tous, « Réservé au MJ » ; ailleurs, « Visible des joueurs » ; (2)
  **choisir dans la médiathèque** un fichier qu'il voit, par le sélecteur — sa visibilité ne change
  pas. Celui qui a ajouté un fichier le **voit toujours**, dans la médiathèque et dans la fiche. Si le
  fichier posé est réservé au MJ alors que la section (ou la fiche, pour une
  illustration) est lue des joueurs, l'éditeur l'avertit : « Ce fichier est réservé au MJ : les joueurs
  qui lisent cette section ne le verront pas. » *(P-16, P-3, P-7 ; décision de Monsieur du 2026-10-11 : le défaut « Visible
  des joueurs » ne vaut plus que pour un ajout direct dans la médiathèque et pour l'import)*
- **B-56** — L'API d'import pousse des fichiers dans la médiathèque, images et documents, avec une clé
  d'origine et des droits explicites (« Visible des joueurs » par défaut), puis les fiches les
  référencent ; les fichiers de l'export qu'aucune fiche n'utilise y entrent aussi. Le script **doit**
  envoyer « Réservée au MJ » pour un fichier que la source n'utilise que dans du contenu MJ. *(P-10 ;
  décision de Monsieur du 2026-10-11)*

### Assistant : son jeton posé depuis l'administration (`kanevas-import`)
- **B-51** — Quand l'admin d'instance
  ouvre « Jeton de l'assistant » dans l'administration (E-5), il lance la connexion à l'abonnement
  Claude (`claude setup-token`), ouvre l'adresse que Kanevas lui montre, colle le code rendu, et
  l'assistant devient disponible sans redéploiement ; l'écran dit si un jeton est posé et depuis
  quand, jamais sa valeur. *(P-15)* — **Inclus, en dernière tranche indépendante** (décision de Monsieur du 2026-10-11).
  Le code existe dans Antre-du-maitre (une fenêtre et trois routes, le binaire
  `claude` est celui que l'Agent SDK, déjà dépendance de Kanevas, embarque ; `script` pour le
  pseudo-terminal), E-5 existe, et aujourd'hui poser ou renouveler le jeton passe par OpenBao et un
  redémarrage. La tranche n'a aucun lien avec l'import : elle part seule, la dernière.

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
  devient une pièce jointe de la section, avec sa visibilité ; le MJ peut la marquer secrète. *Depuis
  `kanevas-import` (B-44, B-55) : le fichier entre dans la médiathèque et la section le référence ;
  « secrète » devient « Réservée au MJ », la visibilité du fichier lui-même.* Une
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
4. **Lore** : depuis la **liste d'un type** (E-8, parmi les types activés), il crée un PNJ ou un lieu, avec au besoin son **sous-type** ; sur la **fiche** (E-9), il
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
   Aldric à son portrait — ou le cherche par son nom — ; sur la liste des lieux, il peut filtrer par
   **sous-type** (« Taverne ») parmi ceux des fiches qu'il voit ; puis ouvre la **fiche** (E-9) : seulement ce
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
*Échec* (dépôt) : fichier vide, section déjà à 50 pièces jointes (100 fichiers joints depuis
`kanevas-import`, AD-111), envoi interrompu ou droit
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

### P-10 — Préparer puis rejouer l'import de sa base Kanka (Monsieur, MJ, un samedi, Mac et navigateur)
*Antor (Monsieur) a rapatrié sa base Kanka sur son Mac ; son script la lit et la pousse dans Kanevas.
Il veut d'abord un essai jetable, puis la vraie base, sans doublon ni fuite.*
1. **Accueil** (E-1) → **Créer un univers** (E-2) « Essai Kanka » ; il en est MJ.
2. **Paramètres** (E-14) : il rattache l'univers à son système, puis dans « Types de fiche » force
   « Vaisseau » à activé (le système le désactive) — P-13.
3. **Accès par API** (E-18) : « Nouveau jeton », nom « Script Kanka — Mac », durée 30 jours ;
   Kanevas montre le jeton une fois ; il le copie dans la configuration du script.
4. *Hors de Kanevas* : il lance le script ; le script ouvre un **lot**, pousse d'abord les
   **campagnes**, puis les fiches, parents d'abord (clé d'origine, type, titre, parent, alias,
   étiquettes, sections en Markdown avec leurs liens `[[…]]`, leurs blocs MJ, leurs images, leur
   audience) — les comptes-rendus avec la clé de leur campagne —, puis les relations, et clôt le lot
   (l'ordre d'AD-104).
   Les fichiers, images et documents, vont d'abord dans la **médiathèque** (E-19), chacun avec ses
   droits — « Réservée au MJ » pour ceux que Kanka n'affiche que dans du contenu MJ, « Visible des
   joueurs » sinon —, y compris les 385 Mo qu'aucune fiche n'utilise ; les fiches les référencent.
5. **Accès par API** (E-18), bloc « Lots d'import » : « Fiches : 498 créées, 3 refusées · Fichiers :
   1 140 créés · Campagnes : 4 créées · Scénarios : 12 créés · Relations : 324 créées · 6 en attente » ; il
   déplie les refus : « personnage:aldric-le-gris — section « Vérité » : 112 000 caractères, 100 000
   au plus ».
6. Il ouvre quelques fiches (**E-8** en arbre, **E-9**, **E-17**) et passe en **mode Joueur** pour
   vérifier qu'aucun bloc MJ ne paraît, ni sur la fiche ni dans la recherche — P-12 ; dans **Comptes-rendus** (E-13), les 36 journaux de
   Kanka sont dans l'ordre de leurs dates d'origine ; sur une fiche, le menu « ⋯ » montre sa clé
   d'origine (« lieu:port-sel »).
7. Il corrige le script (il coupe la section trop longue en deux), le relance : le nouveau lot dit
   « Fiches : 3 créées · 498 inchangées · Fichiers : 1 140 inchangés · … · 0 en attente » — aucun doublon.
8. **Paramètres** (E-14), « Supprimer l'univers », il tape « Essai Kanka » : l'univers disparaît de
   l'accueil.
9. Il refait 2 à 7 sur l'univers réel ; les jours suivants, Léa écrit dans une section importée et
   Antor renomme « Port-Sel » en « Port-Sel-sur-Brume » (P-14) ; un import rejoué n'écrase ni l'un ni
   l'autre et le lot le dit : « section « Notes » de personnage:lea-pj modifiée dans Kanevas : non
   écrasée » ; « lieu:port-sel : titre modifié dans Kanevas : non écrasé ».
10. **Accès par API** (E-18) : il révoque le jeton (P-11).
*Moment fort* : le second lot « Fiches : 0 créée, 501 inchangées » et rien de créé dans aucune autre
nature — rejouer est sans risque.
*Échec* : jeton mal copié ou révoqué — le script reçoit 401 « Jeton invalide. », rien n'est écrit,
et aucun lot n'apparaît ; un parent ou une cible de relation inconnue — la fiche est écrite sans ce
parent ou sans cette relation, avec un avertissement dans le lot ; un lien `[[…]]` vers une clé
encore inconnue — il reste en attente et se résout quand la fiche arrive (au même lot ou au suivant) ;
le réseau coupe au milieu — le lot reste « En cours » sur E-18, sans dommage : rejouer reprend là où
c'était, puisque tout ce qui est déjà écrit sort « inchangé » ; une image de 0 octet — refusée, la
raison dans le lot ; supprimer l'univers en tapant un autre nom — le bouton reste inactif.

### P-11 — Créer et révoquer un jeton d'API (MJ)
1. **Accès par API** (E-18), depuis « Univers » ▸ « Accès par API » dans la barre (MJ seul).
2. « Nouveau jeton » : un nom, une durée (7, 30, 90 jours ou un an) ; « Créer le jeton ».
3. La fenêtre montre le jeton, « Copier », et « Il ne sera plus jamais affiché. » ; il la ferme.
4. La liste montre le jeton : nom, créé par, créé le, dernier usage (« jamais »), expire le.
5. Plus tard : « Révoquer » sur la ligne, confirmation « Révoquer « Script Kanka — Mac » ? Le script
   qui l'utilise ne pourra plus rien écrire. » ; la ligne passe en « Révoqué ».
*Échec* : un autre MJ a retiré son rôle à Antor — ses jetons cessent d'agir (401) et il ne voit plus
E-18 (« Page introuvable. ») et, pour un autre MJ, la ligne de ses jetons porte la pastille « Inactif » ; un Joueur force l'adresse de E-18 — « Page introuvable. » ; le jeton
a expiré — la ligne dit « Expiré », le script reçoit 401.

### P-12 — Lire la base importée (Antor, MJ, puis Léa, Joueuse, au téléphone)
1. Antor ouvre **Lieux** (E-8), passe la liste **en arbre** : « Les Sphères » (Lieu · Sphère)
   déplié montre « Port-Sel » (Lieu · Port), qui déplié montre « La Taverne du Kraken » et « Les
   Docks » ; il filtre sur le sous-type « Port » : « Port-Sel » et « Havre-Gris ».
2. Il ouvre « Port-Sel » (**E-9**) : le fil d'Ariane « Lame d'Ébène › Lieux › Les Sphères ›
   Port-Sel » ; le texte en Markdown (intertitres, un tableau des quartiers, une image insérée) ; des
   liens vers « Maître Aldric » et « La Guilde des Brumes » ; au milieu de « Histoire », un **bloc MJ**
   hachuré d'ambre (« Le port est tenu par la Guilde… ») ; en bas, « Contient » (ses enfants) et
   « Mentionnée dans » (les fiches qui la citent) ; à côté du type, son sous-type « Lieu · Port » ;
   sous le titre, ses alias et ses étiquettes.
3. Il passe en **mode Joueur** : le bloc MJ a disparu sans laisser de trou ; le lien vers « La
   Guilde des Brumes », fiche MJ seul, est devenu du texte ; « Mentionnée dans » a perdu « Rapport
   secret de l'amirauté » et « La Guilde des Brumes », qu'un joueur ne lit pas.
4. Léa, sur son téléphone, ouvre la **recherche** (E-17), tape « sous-main », un mot qui n'est que
   dans le bloc MJ : aucun résultat. Elle tape « guilde » : elle trouve « Port-Sel » (le texte du lien
   est écrit dans « Histoire », qu'elle lit) mais jamais la fiche « La Guilde des Brumes » ; elle trouve
   « Port-Sel » par son alias « Salport » ; elle touche l'étiquette « Côte des Brumes » et voit les fiches qu'elle lit.
5. Elle ouvre « Maître Aldric » par un lien, puis revient par le fil d'Ariane.
6. Elle demande à son **assistant** (E-12) « que sait-on de Port-Sel ? » : il ne cite rien du bloc
   MJ.
*Moment fort* : la même fiche, lue par Antor puis par Léa — le secret n'est ni montré, ni trouvable,
ni deviné.
*Échec* : une image insérée ne se charge pas — « Image indisponible. » à sa place ; un lien vers une
fiche supprimée — texte simple pour Léa, « lien cassé » pour Antor ; une fiche dont Léa ne lit plus
rien depuis le dernier import — absente de l'arbre, de la recherche et des « Mentionnée dans ».

### P-13 — Choisir les types d'un système et d'un univers (MJ)
*Antor joue « CoF Mini » dans « Lame d'Ébène », sauf que son univers a des vaisseaux.*
1. **Système de jeu** (E-15), onglet « Types de fiche » : il désactive « Vaisseau » et « Note » pour
   le système ; Mira, MJ d'un autre univers du système, voit ces types quitter sa barre.
2. **Paramètres** de « Lame d'Ébène » (E-14), panneau « Types de fiche » : chaque type dit « Système · activé »
   ou « Système · désactivé » ; il force « Vaisseau » à **Activé**.
3. La barre latérale de « Lame d'Ébène » montre « Vaisseaux », pas « Notes ».
4. Plus tard, le système réactive « Note » : « Lame d'Ébène », qui le suit, le montre au chargement suivant ;
   « Vaisseau », forcé, ne bouge pas.
*Échec* : il désactive « Lieu » alors que l'univers a 201 lieux — la confirmation dit « Les 201 lieux
restent ; on les atteint par un lien, la recherche ou l'arbre. » ; un Joueur ne voit pas le panneau de
E-14 (« Page introuvable. ») et lit l'onglet de E-15 en « Lecture seule », interrupteurs inertes.

### P-14 — Tenir la base après l'import (Antor, MJ, au bureau)
1. Sur « Port-Sel » (**E-9**), « Modifier » la section « Histoire » : il tape `[[`, choisit « Maître
   Aldric » dans la liste qui s'ouvre ; il sélectionne une phrase et la met en **bloc MJ** ; « Aperçu »,
   puis « Enregistrer ».
2. Dans l'en-tête, il renomme la fiche « Port-Sel-sur-Brume » ; il change son sous-type « Port » en
   « Port franc » (la liste lui propose les sous-types de lieu déjà employés : Sphère, Port, Taverne…) ;
   menu « ⋯ » : « Déplacer sous… » « Les Sphères » ; « Alias et étiquettes ». Sur « Les Cristaux
   d'Ombre », importée en Note, « Changer le type » : Note → Savoir, sous-type « Ressource ».
3. Menu « ⋯ » d'un doublon : « Supprimer la fiche… » ; la boîte compte ce qui part avec elle
   (sections, relations qui la visent, places sur une carte ; ses fichiers restent dans la médiathèque),
   dit sous quelle fiche
   remontent ses enfants et que les liens qui la visent deviendront des liens cassés (texte exact :
   E-9) ; le doublon venait de Kanka : Antor le retire aussi de l'export, sinon le prochain import le
   recrée (B-40).
4. Dans un **scénario** (E-7), même geste : `[[` ouvre la même liste (les fiches de l'univers de la campagne) et le lien
   s'ouvre sur la fiche ; dans une entrée de système (E-15), `[[` ne fait rien.
*Échec liens* : Léa, auteur avec écriture, tape à la main `[[<id>]]` d'une fiche qu'elle ne lit pas (l'identifiant d'une adresse qu'Antor lui a donnée) — « Cette fiche n'existe
pas ou vous ne pouvez pas la lire. » sous le champ, son texte intact ; la liste ne répond pas — « Impossible de
chercher. » et « Réessayer » ; un lien vers une fiche qui n'est pas encore importée — « en attente » pour Antor,
texte pour Léa, jusqu'à l'arrivée de la fiche ; dans un scénario, la liste qui échoue — « Impossible de chercher. ».
*Échec* : un déplacement qui ferait un cycle (« Les Sphères » sous l'un de ses enfants) — « Une fiche
ne peut pas être rangée sous l'un de ses descendants. » ; un Joueur auteur d'une section qui contient
un bloc MJ — « Modifier » n'y paraît pas ; un texte qui passe 100 000 caractères — « Erreur : 100 000
caractères au plus. », le texte reste.

### P-15 — Poser le jeton de l'assistant (Admin, admin d'instance) (B-51)
*Admin vient de déployer Kanevas : l'assistant n'a pas encore de jeton, et il ne veut pas passer par un redéploiement.*
1. **Administration** (E-5), bloc « Jeton de l'assistant » : « Aucun jeton posé » ; « Connecter
   l'abonnement ».
2. Kanevas montre une adresse ; il l'ouvre, s'authentifie chez Anthropic, copie le code.
3. Il colle le code, « Valider » : « Jeton posé le 11 octobre 2026. » ; l'assistant est disponible
   sur tous les univers, sans redéploiement. *(Moment fort : « Jeton posé le … » apparaît, sans que la valeur du jeton soit montrée nulle part.)*
*Échec* : le code est faux — « La connexion n'a pas abouti. Recommencez. » ; la fenêtre a expiré (10 minutes)
ou le serveur a redémarré — « La connexion a expiré. Recommencez. » ; le programme de connexion ne démarre pas —
« La connexion n'a pas pu démarrer. Réessayez. » ; dans tous les cas l'ancien état reste. Si le jeton vient du
déploiement, le panneau dit « Jeton fourni par le déploiement. » et se reconnecte de même.

### P-16 — Ranger et partager les fichiers (Antor, MJ, puis Léa, Joueuse)
*Après l'import, la médiathèque de « Lame d'Ébène » porte 1 100 images et 40 documents, dont ceux
qu'aucune fiche n'utilisait dans Kanka.*
1. **Médiathèque** (E-19), depuis la barre : Antor filtre « Images » et « Non utilisés », retrouve
   « carte-des-sphères.png », la renomme « Carte des Sphères » ; il passe à « Documents » : « Règles
   de la Guilde.pdf » (PDF, 2,4 Mo).
2. Il ouvre « plan-du-repaire.png » (« Visible des joueurs », insérée dans « Histoire » des « Docks »
   et jointe à « Description » de « Port-Sel », deux sections lues des joueurs) et la passe à
   « Réservée au MJ » : Kanevas liste ces deux endroits, où les joueurs ne la verront plus ; il
   confirme.
3. Sur « Port-Sel » (**E-9**), il modifie « Description » (lue des joueurs) : « Fichier » ▸ « Choisir
   dans la médiathèque », il choisit « Plan secret de la Guilde » (réservée au MJ) : l'éditeur avertit
   « Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas. » ; il la
   déplace dans un bloc MJ, l'avertissement disparaît. Puis « Fichier » ▸ « Ajouter depuis l'appareil »
   « tarifs-du-port.pdf » : le document entre dans la médiathèque, visible des joueurs, et se joint à la
   section ; il enregistre.
4. Léa ouvre « Port-Sel » : à la place de l'image du plan du repaire, dans « Les Docks », elle lit
   « Image réservée au MJ. » ; elle télécharge « tarifs-du-port.pdf » depuis les pièces jointes ; sa
   **Médiathèque** (E-19) ne lui montre que les fichiers visibles des joueurs, et pour « Carte des
   Sphères » les seules fiches qu'elle lit.
5. Antor supprime un doublon d'image : la confirmation liste « Port-Sel (illustration) » et « Maître
   Aldric — « Apparence » (jointe) » ; il remplace d'abord l'illustration, puis supprime.
*Moment fort* : un même fichier, utilisé dans trois fiches, change de droits en un geste, et Kanevas
dit exactement où les joueurs le perdent.
*Échec* : un fichier vide — « « notes.txt » est vide. », rien n'est ajouté ; un envoi coupé —
« L'envoi n'a pas abouti. », rien n'est ajouté ni joint ; une illustration qui n'est pas une image —
« « regles.pdf » n'est pas une image. » ; un joueur force l'adresse d'un fichier réservé au MJ — « Page
introuvable. ».

## Hors périmètre

- **Jeu en direct** : pas d'initiative, de combat animé, de brouillard de guerre ; la table reste
  physique.
- **Caractéristiques structurées** (fiche de combat, statistiques) : une pièce jointe en V1 ; des
  types de fiches dédiés plus tard.
- **Supprimer** une campagne, un scénario, un CR, une carte, une tâche, un système : rien de cela
  ne se supprime, sauf une pièce jointe, une section, une relation, un membre, et le token ou le nœud
  d'une carte (on le retire de la carte ; sa fiche reste). *(choix de cadrage, à revoir à l'usage)*
  Depuis `kanevas-import`, une **fiche**, un **univers** et un **fichier de la médiathèque** se suppriment (B-40, B-41, B-54) ; un CR, qui
  est une fiche, se supprime avec l'univers et, par un MJ, comme une fiche.
- **Créer une fiche en joueur** : le MJ crée toute fiche, y compris celle d'un PJ, et en ouvre une
  section à son joueur.
- **Inviter un compte qui ne s'est jamais connecté**, lien d'invitation.
- ~~Recherche dans tous les types à la fois~~ : entre dans le produit avec `kanevas-import` (B-37, E-17).
- **Lire un export Kanka** : Kanevas ne connaît pas le format Kanka. Le script qui le lit vit sur le
  Mac de Monsieur, hors du produit et de ses dépôts ; Kanevas offre une API d'import générique (B-47,
  AD-104) que tout script peut consommer. *(décision de Monsieur, 2026-10-11)*
- **Types de fiche créés par un utilisateur** : la liste est celle du produit, enrichie par une
  version (B-42). *(décision de Monsieur, 2026-10-11)*
- **Choix des types par campagne** : le choix vit au système et à l'univers. *(décision de Monsieur,
  2026-10-11)*
- **Créatures et vaisseaux structurés** (caractéristiques en champs par système) : une autre epic ;
  ici, leurs fiches importées sont des sections en Markdown, tableaux compris. *(décision de Monsieur du 2026-10-11)*
- **Cartes dans l'API d'import** : une autre epic, « plus évoluée » ; ici, une carte Kanka s'importe
  comme une fiche ordinaire avec son image. *(décision de Monsieur du 2026-10-11)*
- **Chronologie comme type à part** (une frise) : une epic plus évoluée, comme les cartes ; ici, une
  chronologie est une fiche « Savoir ». *(décision de Monsieur du 2026-10-11)*
- **Blocs secrets par joueur** dans un texte : le bloc MJ n'a qu'une audience, le MJ ; un secret
  pour un seul joueur reste une section à auteur (AD-19).
- **Historique d'un import, annulation d'un lot** : un lot se rejoue, il ne se défait pas ; on
  supprime l'univers d'essai.
- **Export vers Kanka ou un autre outil** : non trié.
- **Calendrier ou chronologie, lanceur de dés, usage sans connexion (PWA)** : non triés.
- **Historique des modifications, export, partage public.**

## Contrôle croisé du cadrage `kanevas-import`

Fait le 2026-10-11 sur la proposition (skill `cadrage`, étape 6), refait après la relecture 1, puis
après les décisions de Monsieur du 2026-10-11 (Savoir, sous-type, médiathèque, pas de pierre tombale,
cartes hors de l'API, jeton de l'assistant inclus), et après AD-111 (tous les fichiers dans la médiathèque).

| Croisement | Résultat |
|---|---|
| Chaque besoin a un parcours | B-32 P-12, P-14 · B-33 P-12, P-14 · B-34 P-12, P-14 · B-35 P-12, P-14 · B-36 P-12 · B-37 P-12 · B-38 P-12, P-14 · B-39 P-14 · B-40 P-14 · B-41 P-10 · B-42 P-13, P-10 · B-43 P-10, P-14 · B-44 P-12, P-16 · B-45 P-11, P-10 · B-46 P-11 · B-47 P-10 · B-48 P-10, P-14 · B-49 P-10 · B-50 P-10 · B-51 P-15 · B-52 P-12, P-14 · B-53 P-16, P-10 · B-54 P-16 · B-55 P-16 · B-56 P-10 — **tient**. |
| Chaque geste humain d'un parcours a un écran | P-10 : E-1, E-2, E-14, E-18, E-8, E-9, E-17, E-13, E-19 ; l'étape 4 n'est pas un geste dans Kanevas (le script, hors produit, décision de Monsieur), son résultat se lit sur E-18 et E-19 · P-11 : E-18 · P-12 : E-8, E-9, E-17, E-12 · P-13 : E-15, E-14, barre · P-14 : E-9 · P-15 : E-5 · P-16 : E-19, E-9 — **tient**. |
| Chaque écran a ses données | E-17 : fiches, alias, étiquettes, sous-type, index (titre, alias, sous-type, `contenu_public`) · E-18 : jetons d'API, lots d'import · E-14 / E-15 : réglages de type · E-9 : liens, parent, sous-type, alias, étiquettes, clé d'origine, références de fichier (texte, jointes), illustration (un fichier image) · E-8 : sous-type, illustration · E-19 : fichiers (images et documents), références de fichier, illustrations · E-13 : `cree_le` (date d'origine) · E-5 : un fichier du volume, pas une entité (B-51) — **tient**. |
| Chaque entité sert un parcours | lien P-12, P-14 · alias et étiquette P-12, P-14 · réglage de type P-13 · jeton d'API P-11 · lot d'import P-10 · fichier et référence de fichier P-16, P-12, P-10, P-7 (le joueur qui dépose un portrait passe par le premier chemin d'ajout) — **tient**. |
| Trous comblés par un choix écrit | l'import n'a pas d'écran de déclenchement (le script) : décision de Monsieur ; « vider un univers d'essai » remplacé par « supprimer l'univers » (AD-105) ; une fiche supprimée revient au rejeu si l'export l'envoie (décision de Monsieur) ; les cartes hors de l'API, une carte Kanka est une fiche (décision de Monsieur) ; E-17 prend la bascule de mode ; liens d'un scénario et d'une entrée de système réglés (AD-97) ; l'image générée par l'assistant entre dans la médiathèque (AD-44 amendée) ; poser une illustration passe par les deux chemins d'ajout (E-9) ; pièces jointes et médiathèque : tous les fichiers dans la médiathèque (AD-111, décision de Monsieur), les deux chemins d'ajout explicites sur E-9 et E-19. Aucun `[À TRANCHER]` ne reste. |
