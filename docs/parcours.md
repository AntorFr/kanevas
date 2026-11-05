# Kanevas — pour qui, besoins, parcours

> Doc du produit. Sur `epic/kanevas`, la cible du cadrage ; sur `main`, exactement ce qui est
> construit. Identifiants stables : `B-n` (besoins), `P-n` (parcours), `E-n` (écrans,
> `docs/ecrans.md`), `AD-n` (décisions, `ARCHITECTURE.md`).
>
> **Construit à ce jour** (`kanevas-premiere-fiche`, systèmes, `kanevas-suivi`, `kanevas-fichiers`, `kanevas-relier-chercher`, `kanevas-recours-admin`) : P-1 en entier, P-2 en entier (étape 3 : l'admin répare les membres, E-5),
> P-3 étapes 1 à 4, P-4 en entier, P-5 étape 1 (fiches et sections), P-6 étapes 1-2 (recherche dans un type), P-7 étape 1 et l'écriture de
> l'étape 2, P-8 en entier (B-13, B-14 : E-14 puis E-15), P-14 étapes 2-3 et P-10 étape 8 (`kanevas-import-tenir` : renommer, supprimer une fiche, supprimer un univers). P-10 en entier avec `kanevas-import-reprise` (campagnes, scénarios, comptes-rendus datés et relations par l'API d'import ; échantillon rejoué sans doublon par le client de test, B-47 à B-50). P-16 en entier avec `kanevas-import-mediatheque` (la médiathèque de l'univers, E-19 ; ajouter un fichier depuis une fiche, « Fichier » de l'éditeur et « Joindre un fichier » : B-24, B-25, B-44, B-53 à B-56), donc P-3 étape 4 et P-7 étape 2 par ce chemin. Sont aussi construits les cartes et graphes (E-10, E-11), l'illustration d'une fiche, les systèmes hors des univers (E-16), l'assistant (E-12) et la mise à jour du monde depuis un compte-rendu (`kanevas-monde`) : les écrans construits sont listés dans `docs/ecrans.md`, c'est lui qui fait foi pour dire quelle étape de quel parcours existe. Le reste de ce document est la cible.
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
- **B-32** — *(`kanevas-scenarios`: « un scénario » reads « a section of an adventure's sheet », E-7 being retired)* Le contenu d'une section, d'un scénario et d'une entrée de système est du **Markdown** :
  quand un compte l'enregistre (E-9, E-7, E-15), Kanevas l'affiche mis en forme — titres, gras,
  italique, listes, citations, tableaux, liens, images de la section — et jamais du HTML écrit dans le
  texte, qui s'affiche tel quel ; l'éditeur a un **aperçu**. *(P-12, P-14)*
- **B-33** — *(`kanevas-scenarios`: the same in an adventure's sections)* Quand un compte qui écrit une section tape `[[`, E-9 lui propose les fiches qu'il peut
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
- **B-40** — *(`kanevas-synchro`: a deletion now leaves a history line, 90 days, and its content stays readable 30 days, B-102, B-103 — decision of Monsieur, 2026-11-01)* Un MJ **supprime une fiche** depuis son en-tête (E-9), après confirmation qui nomme ce
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
- **B-45** — *(`kanevas-synchro`: tokens belong to an account, every member creates them on E-23, they reach the universes chosen, B-94)* Un MJ crée un **jeton d'API** pour son univers depuis « Accès par API » (E-18) : un nom,
  une durée (30 jours par défaut, un an au plus) ; Kanevas le montre **une seule fois** ; le jeton agit
  avec les droits de ce MJ dans ce seul univers, et seulement sur l'API d'import. *(P-11, P-10)*
- **B-46** — *(`kanevas-synchro`: a token is seen and revoked by its owner on E-23, B-94, and by the instance admin on E-5, B-95; a GM no longer sees nor revokes the tokens that reach his universe, and E-18 keeps the batches only; a revoked or expired token is still a 401; a lost role no longer refuses the token, it lowers it to the account's current rights there, AD-144)* Un MJ voit les jetons de son univers (nom, créé par, dernier usage, expiration) et en
  **révoque** un depuis E-18 ; si le jeton est révoqué, expiré, ou si son MJ a perdu ce rôle, alors
  toute requête qui le présente est refusée (401) et rien n'est écrit. *(P-11)*
- **B-47** — *(`kanevas-synchro`: a replay writes every field it carries, B-86; « nothing changes if nothing changed » holds)* *(`kanevas-scenarios`: adventures go through this same route, B-61)* Quand un script pousse une fiche par l'API d'import avec une **clé d'origine**, Kanevas
  la crée si la clé est inconnue dans l'univers, la met à jour si elle est connue, et ne change rien si
  rien n'a changé — fiche, sections, relations, alias, étiquettes, parent, pièces jointes, illustration,
  campagnes et scénarios ; rejouer le même import ne crée aucun doublon. *(P-10)*
- **B-48** — *(`kanevas-synchro`: **retired** — Kanevas no longer keeps what an import wrote; an import write may carry the fingerprint it read and is refused if it is no longer current, B-85, AD-138)* *(`kanevas-scenarios`: the `statut` of an adventure is protected like its sub-type and its parent)* Si ce qu'un import a écrit a été **modifié dans Kanevas** depuis (par un humain ou son
  assistant) — le titre, le type, le sous-type, le parent, les alias, les étiquettes d'une fiche ; le titre, le
  contenu, l'audience, les fichiers joints d'une section ; l'illustration d'une fiche ; le nom et le
  statut d'une campagne ; le titre et le contenu d'un scénario ; le nom et la **visibilité** d'un
  fichier de la médiathèque —, alors un nouvel import n'écrase pas ce qui a été modifié,
  écrit le reste, et le rapport du lot nomme chaque champ laissé. *(P-10, P-14)*
- **B-49** — *(`kanevas-scenarios`: the lot counts adventures among the sheets — no « campagnes » nor « scénarios » counters any more, AD-125)* Un MJ voit sur E-18 les **lots d'import** de son univers : quand, par quel jeton, combien
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
- **B-57** — *(kanevas-fiche-mj-seul)* A GM sees at a glance, in GM mode, which sheets the players
  cannot see: a sheet none of whose sections is readable by players (or with no section at all)
  carries the amber « MJ seul » badge on its card (E-8), on its tree line and in its header (E-9),
  like a GM-only file in the media library; and the GM filters the list by visibility (« Toutes »,
  « Visibles des joueurs », « Réservées au MJ »). Nothing is stored: the state is read from the
  sections, and opening one section to the players removes the badge. A player, and the GM in
  player mode, see neither badge nor filter. *(P-3 step 4 ; decision of Monsieur, 2026-10-25)*

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

### Kanevas as the main source (`kanevas-synchro`, 2026-11-01)
*Kanevas is the source of truth. The tools around it — an import script, an agent working with
Monsieur — remember what they sent; Kanevas tells them that something moved, lets them write one
thing at a time, and keeps the trace of who changed what (decisions of Monsieur, 2026-11-01).*
- **B-80** — A script reads, with an import token, the **list of the universe's sheets**: for each,
  its id, its key (B-99), whether it was **born in Kanevas** or created by an import, its type, its title, its
  **fingerprint** and its **header fingerprint** (the header fields alone), and its **date of last
  change**; the script may ask only the sheets changed since a date (`depuis`), a date that moves on
  every write to what the read returns (B-93); a thousand at a time, in a stable order. *(P-22)*
- **B-81** — A script reads **one sheet** by its origin key or its id: its header fields (the typed ones and the fields its type carries in its
  charge — an adventure's status, the mark « disparu » —, PJ, origin creation date), its
  sections (key, title, Markdown content, audience, keys of the joined files, managed
  by a tool or not, fingerprint), the relations of its sections (id, section, target, nature,
  qualifier, fingerprint), the sheet's fingerprint and its header fingerprint. The content is given in import form: a link or
  a file whose target has an origin key is written with that key (`[[cle:…|…]]`,
  `fichier:cle:…`). A fingerprint changes when, and only when, something the read returns
  changes; a waiting link that resolves does not change it. *(P-22)*
- **B-90** — A script reads, with the same token, the **media library's files** (id, origin key or
  none, name, visibility, size, SHA-256, fingerprint) and the **universe's maps** (id, origin key or
  none, title, form, visible, attached sheet, text, background SHA-256, fingerprint), a thousand at a
  time. *(P-22)*
- **B-91** — A replay of a file writes only the fields it sends: a file's visibility is set to
  `joueurs` by default **at its creation only**; a replay without `visibilite` leaves the one Kanevas
  holds, so a file reserved to the GM in Kanevas never reopens by omission. *(P-22)*
- **B-92** — A script **exports a whole universe in one call**: one line per sheet in the form of
  B-81, one per file and per map in the form of B-90, as they are at one instant; a file's bytes
  are downloaded apart, one by one, with the same token. *(P-24)*
- **B-93** — The **date of last change** of a sheet moves on every write to anything its read
  returns (header, sections, relations, aliases, labels, parent, illustration), whoever writes;
  a false alarm is allowed (a waiting link that resolves), a missed change is not. *(P-22, P-24)*
- **B-82** — A script changes **only the header fields it sends** of a sheet (title, type,
  sub-type, PJ, parent, aliases, labels, illustration, origin creation date, and the charge fields
  of its type: an adventure's status, « disparu »); the others stay. *(P-22)*
- **B-83** — A script **creates, rewrites or deletes one section** of a sheet, named by its
  origin key, without sending the rest of the sheet. Deleting it removes its relations and its file
  joins; the files stay in the media library. A section born in Kanevas (no origin key) and a section
  managed by a tool are never written by the import: refused, with their code. *(P-22)* *(`kanevas-synchro`, extension: every section has a key, B-104 — only a tool-managed section stays refused.)*
- **B-84** — A script **adds, modifies (nature, qualifier) or removes one relation**, the existing
  one named by the id the read gave. *(P-22)*
- **B-85** — Every import write may carry the **fingerprint the script read**. If it is no longer
  the current one, the write is refused (412) and nothing is written; the batch counts it as refused
  with its key and the reason « modifiée depuis la lecture ». A write without a fingerprint applies.
  Adding a relation takes none (an identical one is « inchangée »); a creation may require that the
  key is new (`If-None-Match: *`), so a script never overwrites by mistake a sheet born in Kanevas
  that took the same key.
  *(P-22)*
- **B-86** — Nothing is removed by omission (AD-104 holds): a full `PUT` of a sheet writes what it
  carries and leaves what it does not name; removing is a targeted gesture (B-83, B-84, `DELETE`
  of a sheet). *(P-22)*
- **B-87** — A script imports an **illustrated map** by origin key: title, visible to the players or
  not, background image, the sheet it belongs to (a key), a short text in Markdown with GM blocks.
  An unknown sheet key is refused with its field (`fiche`), counted, and nothing is written;
  `fiche` absent leaves the attachment, `null` detaches. The background travels with the map, not
  taken from the media library; a new map may come without one (a neutral 16/10 frame, as on E-11, AD-70;
  its background SHA-256 is null); on an existing map, `fond` absent leaves the background, so a script
  that reads the background's SHA-256 (B-90) sends it only when it changed. Replaying it creates no duplicate; it counts in the batch; it accepts the fingerprint like any
  write. Its tokens are not imported. *(P-22)*
- **B-88** — A GM **attaches a map to a sheet** (a place, a ship, an adventure…), changes that sheet
  or detaches it, and writes, rewrites or empties its **text** on E-11; the sheet shows, on E-9, the maps attached to it that the reader may read; a
  player reads the text without its GM blocks. *(P-23)*
- **B-94** — Every member (GM or player) manages **their own API tokens** on « Mes jetons d'API »
  (E-23): a name, a lifetime (7, 30, 90 or 365 days), and the universes it reaches — either a list,
  each in « lecture » or « lecture + écriture », or « tous mes univers » at one level, which also
  covers every universe the account joins later. The token is shown once; its accesses can be
  changed afterwards; it can be revoked. A token never exceeds its account's rights: a player's token
  in « lecture + écriture » writes only where that player may write. A token restricted to tools
  (`kanevas-outils`, B-65) keeps that restriction, set on E-23: it writes those tools' data and no
  content, whatever its level. *(P-25)*
- **B-95** — The **instance admin** sees every token of the instance on E-5 (name, owner, accesses,
  last use), **revokes** any of them and **changes its accesses**; the owner sees on E-23 « Modifié par
  l'admin » or « Révoqué par l'admin ». « Tous mes univers » takes **exceptions** — a universe at another
  level, or at « — » —, so the admin cuts one universe without cutting the others nor the ones to come;
  the owner may change the accesses again, and an admin who wants a token gone revokes it. A GM has no gesture on the tokens that reach his universe: a token is its owner's (decision
  of Monsieur, 2026-11-01). *(P-25)*
- **B-96** — Everything a token writes is **attributed to its account**, naming the token. *(P-26)*
- **B-97** — An agent reaches Kanevas through an **MCP server** (`/mcp`) with an API token: it lists
  the universes of the token, searches, reads a sheet or a section, lists the sheets that mention one,
  reads the history (B-102) where its account is GM, and — with « lecture + écriture » — creates a sheet and writes
  through the targeted writes of B-82 to B-84, each with its precondition (B-85), directly. The tools are the assistant's (one catalogue); image generation
  is not offered. *(P-24)*
- **B-98** — A **text search returns passages**: for each match, the sheet, the section and an
  excerpt around the words (« …les troupes de **Sevrak** franchissent le col… »), paginated; a reader
  never matches a word that sits only in a GM block he cannot read. *(P-24)*
- **B-99** — Every sheet has a **readable key** `type:name`, unique in the universe: an imported
  sheet keeps its origin key; a sheet born in Kanevas receives one at creation from its type and
  title (« Ténébria », a place → `lieu:tenebria`; taken → `lieu:tenebria-2`). Renaming the sheet or
  changing its type does not change it. The GM sees it on E-9 and changes it, warned that what cites
  it will no longer find it; a former key keeps leading to the sheet — an import or a read by a former key reaches the
  same sheet, never a duplicate. A key is `<type>:<name>` for a sheet born in Kanevas (lowercase
  letters, digits, dashes); an imported key keeps the import's form (1–200 characters). A key holds **at least one letter** —
  one made of digits alone would be read as an id: the import refuses it (`invalide`, field `cle`).
  The key the GM types on E-9 is lowercase letters, digits, `-`, `_` and at most one `:`, 2–200
  characters, with a letter (`compte_rendu:seance-3` is one). An imported key made of digits alone
  before this epic is renamed `cle-<digits>` once, and its script must send the new one. *(P-24, P-26)*
- **B-104** — Every **section** has a key too, unique in its sheet: an imported one keeps its origin
  key; one born in Kanevas receives one at creation from its title (« Histoire » → `histoire`), stable
  across renames. The import and the MCP address any section by it — a section born in Kanevas is no
  longer out of their reach (B-83 amended); a section managed by a tool stays refused. *(P-24)*
- **B-100** — Every universe has a **readable identifier** (`eneria`), unique on the instance, set at
  creation from its name and changed by its GM on E-14 (lowercase letters, digits, dashes, 2–40, at
  least one letter, so it is never mistaken for an id; a name without a letter gives `univers-<id>`);
  a former one keeps leading to it. *(P-24, P-26)*
- **B-101** — Addresses use them: a sheet is `/univers/eneria/lieu/nyx` (its key's two parts; a key
  without that form, or whose first part is not a sheet type of the product, is
  `/univers/eneria/fiche/<key>`, so no key ever takes a page's address), the
  API and the MCP accept the key; a numeric address or id is still accepted and leads to the same
  sheet. *(P-24)*
- **B-102** — Kanevas keeps the **history of every write to a sheet** — header field, section created,
  rewritten or deleted, relation added, modified or removed, the sheet created or deleted: the date,
  what changed, the fingerprint after, the account, the token or « assistant » or « import » (with its
  batch). This line is kept **90 days**; the **previous value** (a text included) **30 days**. A GM
  reads it on the sheet (E-9, « Historique ») and for the whole universe (E-24), filtered by
  contributor (an account, or one of its tokens), by sheet or by action; a token reads it through the API and the MCP; a player does not.
  *(P-26)*
- **B-103** — Within 30 days, a GM **restores** a previous value of a section or a header field from
  the history; restoring is a write, and is itself in the history. It covers a section and the header (title, type,
  sub-type, parent, and the aliases and labels as a whole); a line « section créée » has no previous
  value and no button. It writes over the value the GM sees next to it:
  if the section or the field changed since he opened the line — rewritten, or deleted —, it is refused and he reloads — never
  over a write he has not seen. A deleted section comes back under its key, at the end of the sheet,
  unless a section took that key since (refused). A relation's previous value is shown, not
  restored. A deleted sheet stays **readable**
  in the history 30 days (its sections as they were), and is not restored by a gesture. *(P-26)*
- **B-89** — The **largest map background** is an instance setting the admin changes on E-5
  (75 MB by default); it holds for a background set on E-11 and for one sent by the import. *(P-23)*

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

> *Amended by `kanevas-scenarios` (decision of Monsieur, 2026-10-25): campaigns and scenarios
> become sheets of the « Aventure » type. B-58 to B-62 replace B-15, B-16 and B-17 and amend
> B-18 and B-19; E-6 Campagne and E-7 Scénario are retired. The reason: a scenario kept apart
> received no incoming link, no image, no relation and no tree — the import of a real campaign
> (ten documents cited by thirty sheets, fourteen table handouts) showed what that cost.*

- **B-15** — *(replaced by B-58 and B-59)* Un MJ crée les campagnes d'un univers et en change le statut — en préparation,
  active, terminée — depuis la liste et la page de campagne (E-6). *(P-3)*
- **B-16** — *(replaced by B-58; a scenario's sections are born closed to the players, and the
  GM may open one — a handout — which B-16 forbade)* Un MJ crée les scénarios d'une campagne depuis sa page (E-6) et les écrit (E-7) ; les
  joueurs ne les voient jamais.
  *(P-3)*
- **B-17** — *(replaced by B-60, same five categories)* Un MJ tient la liste de préparation d'une campagne sur sa page (E-6) : des tâches en
  cinq catégories (monstres, PNJ, cartes, déroulements, autre) qu'il coche ; une tâche cochée
  quitte la liste active sans disparaître. Les joueurs n'en voient rien. *(P-3)*
- **B-18** — Un joueur voit la liste des campagnes de l'univers, nom et statut. *(P-4, P-6)*
  *Amended (`kanevas-scenarios`, decision of Monsieur, 2026-10-25)*: **the GM decides which
  adventures the players see**, campaign or scenario alike: a player sees, in the « Aventures »
  list (E-8) and in the « Campagnes en cours » block of E-3, the adventures one section of which
  the GM opened to the players — typically « Présentation » when the campaign starts; nothing is
  open at creation, a campaign in preparation stays the GM's — with their status (B-59).
- **B-58** — *(kanevas-scenarios)* An **adventure** — a campaign, a scenario, a one-shot — is a
  sheet of the « Aventure » type: sections with their audience, links from and to any sheet,
  relations, files and illustration, search, and the tree. The sub-type is free (B-52); the
  product proposes « Campagne » and « Scénario »; a scenario belongs to its campaign by the tree
  (its parent), a one-shot stands at the root. The GM creates an adventure from the type's list
  (E-8, where the tree is the default view) and reads and writes it in E-9, like any sheet;
  deleting, renaming, changing the type follow the sheets' rules (B-… of `kanevas-import-tenir`).
  *(P-3)*
- **B-59** — *(kanevas-scenarios)* Every adventure carries a **play status**: « En préparation »
  (at birth), « Prête », « En cours », « Terminée ». The GM changes it in place from the header
  of E-9 and from the menu of its card or of its tree line in E-8; a change touches no other adventure. The status shows as
  a badge on the card, on the tree line, in the header and in the results of E-17; every reader filters
  the list by status; a player sees the status of the adventures he sees. *(P-3, P-4, P-6)*
- **B-60** — *(kanevas-scenarios)* The **preparation** list (five categories, cocher/décocher,
  GM only, as B-17 said) and the **comptes-rendus** of an adventure live on its sheet (E-9) as
  blocks of the sheet, above its sections; « Nouveau compte-rendu » stands in that block, for any
  member, and the CR names that adventure (B-19). The blocks of E-3 read the adventures
  « En cours »: « Campagnes en cours » (sub-type Campagne), « Derniers comptes-rendus »
  (unchanged), « Préparation » (the open tasks of the adventures en cours, GM). *(P-3, P-4)*
- **B-61** — *(kanevas-scenarios)* The **import API** pushes an adventure through the sheets
  route (`type: aventure`, `sousType`, `parent` by origin key, sections; `statut` too, built by `kanevas-scenarios-import-assistant`); a reimport
  never overwrites a status, a sub-type or a parent changed in Kanevas (B-48 extended; *`kanevas-synchro`: B-48 retired, B-85*); a
  compte-rendu names its adventure by its origin key as before. The former campaign and scenario
  routes of the import disappear. *(P-10)*
- **B-62** — *(kanevas-scenarios)* The GM's **assistant** creates a sheet of any activated type
  — title, sub-type, parent — and so an adventure; « créer une campagne » and « créer un
  scénario » become that one gesture. *(P-3)*

### Comptes-rendus et mise à jour du monde
- **B-19** — Quand un membre écrit un compte-rendu depuis la page d'une campagne (E-6), le CR est
  lisible par toute la table et modifiable par son auteur ; le MJ lit et écrit tout CR. Plusieurs
  CR coexistent pour une même séance. *(P-4)* *Amended (`kanevas-scenarios`)*: « depuis la page
  d'une campagne (E-6) » reads « from the sheet of an adventure (E-9, block « Comptes-rendus »),
  campaign or scenario »; the CR names that adventure, and E-13 shows it.
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
1. **Vue d'ensemble** (E-3) : les campagnes en cours, les derniers CR, la préparation en cours.
2. *(kanevas-scenarios)* **Aventures** (E-8, tree view): he creates the campaign « La Couronne
   brisée » (sub-type Campagne, born « En préparation », nothing open to the players yet) or
   opens the existing one, sets it « En cours » from its header (E-9) and opens « Présentation »
   to the players, now that the campaign starts; under it he creates the
   scenario « Acte II — Le sceau brisé » (sub-type Scénario, parent the campaign, sections closed
   to the players), writes it in E-9 like any sheet — links to Aldric and Port-Sel, the plan of the
   crypt from the media library, a relation to the Guilde —, and sets it « Prête » when it is — from the status line of its sheet, or in place from its tree line or its card in E-8, where he can also filter by « Statut »; when a status change or a creation fails, « L'action n'a pas abouti. Réessayez. » and nothing changes —; or
   he asks his **assistant** (E-12) to create it: the writing block leads to its sheet.
3. On the campaign's sheet (E-9), block « Préparation »: he ticks or adds tasks.
   *Échec*: the campaign's page is open in two tabs; a status set in one is shown stale in the
   other until it reloads — the status menu writes the whole value, no conflict to resolve.
4. **Lore** : depuis la **liste d'un type** (E-8, parmi les types activés), il crée un PNJ ou un lieu, avec au besoin son **sous-type** ; sur la **fiche** (E-9), il
   écrit « Apparence » (lue des joueurs) et « Vérité — MJ seul », relie le PNJ à sa faction,
   dépose le plan d'un lieu, et pose le portrait d'Aldric en **illustration** de la fiche (visible
   de qui voit la fiche) ; de retour sur la liste, la carte d'Aldric porte ce portrait. *(kanevas-fiche-mj-seul)*
   A PNJ he has described only in « Vérité — MJ seul » carries the « MJ seul » badge in the list of
   personnages until he writes « Apparence » for the players; « Visibilité » ▸ « Réservées au MJ »
   lists what the table will not see (B-57).
5. Il demande à son **assistant** (E-12) « rappelle-moi tout ce qu'on sait d'Aldric » puis
   « fais un portrait pour Apparence » : l'image est attachée à la section, et il suit « Ouvrir la section »
   dans le fil pour la voir sur la fiche (E-9).
6. **Cartes** (E-10, E-11) : il place le PNJ sur la carte de la ville, passe en **mode Joueur**
   pour vérifier, puis rend la carte visible.
*Échec de l'assistant* : une demande de création échoue ou l'assistant est indisponible : le panneau le dit (« Je n'ai pas pu répondre — réessayer » ou « L'assistant n'est pas disponible pour le moment. »), la création a pu avoir lieu avant que la réponse soit perdue (délai, connexion coupée) : avant de réessayer, Antor regarde E-6 ou E-7 pour ne pas créer deux fois, puis crée à la main si besoin (étape 2).
*Échec de l'image* (étape 5) : la génération échoue ou dépasse le temps, la section porte déjà 50
pièces jointes, son droit d'écrire a été retiré, la description dépasse 500 caractères ou aucun moteur
n'est disponible — l'assistant le dit, rien n'est attaché ; Antor
peut redemander, ou déposer lui-même une image sur E-9 (P-3 étape 4).
*Moment fort* : la fiche en mode Joueur ne trahit aucun secret.
*Échec* (illustration, étape 4) : il choisit un PDF ou un fichier vide — « « plan.pdf » n'est pas
une image… » ou « « portrait.png » est vide. », l'illustration d'avant reste ; l'envoi est coupé —
« l'envoi n'a pas abouti », avec « Réessayer » ; un autre MJ l'a rétrogradé Joueur entre-temps —
« Vous ne pouvez plus modifier l'illustration de cette fiche. » et les gestes disparaissent ; le
retrait échoue — « L'action n'a pas abouti. Réessayez. », l'illustration reste ; l'image ne se charge
pas — le cadre dit « Image indisponible. » et il garde « Remplacer » et « Retirer ».

### P-4 — Écrire le compte-rendu (joueur ou MJ, le lendemain de la partie)
1. Depuis la **vue d'ensemble** (E-3) ou la liste **Aventures** (E-8), il ouvre la campagne — or
   the scenario played that night — (E-9). *(amended by `kanevas-scenarios`)*
2. **Nouveau compte-rendu**, in the block « Comptes-rendus » of that sheet: titre, texte ; il le
   publie — il s'ouvre comme une **fiche** (E-9) de type compte-rendu, which names the adventure.
3. Il le retouche plus tard ; les autres le lisent depuis l'aventure ou la **liste des CR**
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
5. *(kanevas-scenarios)* **Aventures** (E-8): he sees « La Couronne brisée », « En cours », and
   reads what its sheet shows to the players (E-9) — its « Présentation », never the scenarios
   beneath it, whose sections are closed.
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
*Upload failure*: empty file, section already at its attachment limit (50 before
`kanevas-import`, 100 since, AD-111), interrupted upload or lost write permission — the file
is not attached; the section (E-9) explains why; no partial operation remains.

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
4. *(`kanevas-scenarios`: campaigns and scenarios are pushed as sheets of type `aventure`, and counted with them)* *Hors de Kanevas* : il lance le script ; le script ouvre un **lot**, pousse d'abord les
   **campagnes**, puis les fiches, parents d'abord (clé d'origine, type, titre, parent, alias,
   étiquettes, sections en Markdown avec leurs liens `[[…]]`, leurs blocs MJ, leurs images, leur
   audience) — les comptes-rendus avec la clé de leur campagne —, puis les relations, et clôt le lot
   (l'ordre d'AD-104).
   Les fichiers, images et documents, vont d'abord dans la **médiathèque** (E-19), chacun avec ses
   droits — « Réservée au MJ » pour ceux que Kanka n'affiche que dans du contenu MJ, « Visible des
   joueurs » sinon —, y compris les 385 Mo qu'aucune fiche n'utilise ; les fiches les référencent.
5. *(`kanevas-scenarios`: campaigns and scenarios are pushed as sheets of type `aventure`, and counted with them)* **Accès par API** (E-18), bloc « Lots d'import » : « Fiches : 498 créées, 3 refusées · Fichiers :
   1 140 créés · Relations : 324 créées · 6 en attente » ; il
   déplie les refus : « personnage:aldric-le-gris — section « Vérité » : 112 000 caractères, 100 000
   au plus ».
6. Il ouvre quelques fiches (**E-8** en arbre, **E-9**, **E-17**) et passe en **mode Joueur** pour
   vérifier qu'aucun bloc MJ ne paraît, ni sur la fiche ni dans la recherche — P-12 ; dans **Comptes-rendus** (E-13), les 36 journaux de
   Kanka sont dans l'ordre de leurs dates d'origine ; sur une fiche, le menu « ⋯ » montre sa clé
   d'origine (« lieu:port-sel »).
   A sheet sent before its files shows the GM « Fichier en attente d'import :
   « img:quais ». » instead of the image until the file arrives (Léa sees nothing).
7. Il corrige le script (il coupe la section trop longue en deux), le relance : le nouveau lot dit
   « Fiches : 3 créées · 498 inchangées · Fichiers : 1 140 inchangés · … · 0 en attente » — aucun doublon.
   Pending file references are counted with links as « liens et références en attente »;
   when nothing is pending, that count is omitted from the batch report.
8. **Paramètres** (E-14), « Supprimer l'univers », il tape « Essai Kanka » : l'univers disparaît de
   l'accueil.
9. Il refait 2 à 7 sur l'univers réel ; les jours suivants, Léa écrit dans une section importée et
   Antor renomme « Port-Sel » en « Port-Sel-sur-Brume » (P-14) ; un import rejoué n'écrase ni l'un ni
   l'autre et le lot le dit : « section « Notes » de personnage:lea-pj modifiée dans Kanevas : non
   écrasée » ; « lieu:port-sel : titre modifié dans Kanevas : non écrasé » ; de même un fichier que
   Antor a passé « Visible des joueurs » (E-19) n'est pas rétabli « Réservé au MJ » : « visibilité
   modifiée dans Kanevas : non écrasée ». *(`kanevas-synchro`: these warnings disappear with B-48; a
   script that wants this protection sends the fingerprint it read, B-85; a file's visibility is not
   reset by a replay that omits it, B-91.)*
10. **Accès par API** (E-18) : il révoque le jeton (P-11). *(`kanevas-synchro` : il le révoque sur « Mes jetons d'API », E-23, P-25.)*
*Moment fort* : le second lot « Fiches : 501 inchangées » et rien de créé dans aucune autre
nature — rejouer est sans risque.
*Échec* : jeton mal copié ou révoqué — le script reçoit 401 « Jeton invalide. », rien n'est écrit,
et aucun lot n'apparaît ; un parent ou une cible de relation inconnue — la fiche est écrite sans ce
parent ou sans cette relation, avec un avertissement dans le lot ; un lien `[[…]]` vers une clé
encore inconnue — il reste en attente et se résout quand la fiche arrive (au même lot ou au suivant) ;
le réseau coupe au milieu — le lot reste « En cours » sur E-18, sans dommage : rejouer reprend là où
c'était, puisque tout ce qui est déjà écrit sort « inchangé » ; une image de 0 octet — refusée, la
raison dans le lot ; supprimer l'univers en tapant un autre nom — le bouton reste inactif ; une suppression qui échoue — « L'action n'a pas abouti. Réessayez. » dans la boîte, l'univers est intact (états : E-14).

### P-11 — Créer et révoquer un jeton d'API (MJ)
*(`kanevas-synchro` : remplacé par P-25 — un jeton se crée et se révoque sur « Mes jetons d'API », E-23, par tout membre ; E-18 ne garde que les lots.)*
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
   Docks » ; il filtre sur le sous-type « Port » : « Port-Sel » et « Havre-Gris » (après un import qui porte ces sous-types : le semis du bouchon pose « Les Sphères » et « Port-Sel » sans sous-type, et pas « Havre-Gris »).
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
   « Port-Sel » par son alias « Salport » ; elle touche la pastille « Côte des Brumes » (sur E-17, ou sur la fiche « Port-Sel » qui l'ouvre filtrée) et voit les fiches qu'elle lit.
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
   *(kanevas-deplacer-arborescence)* Another day, Antor moves « La Taverne du Kraken »: « Déplacer sous… » opens
   on the level where it is — « Lame d'Ébène › Les Sphères › Port-Sel », its siblings listed, the Taverne marked
   « (cette fiche) » — and he chooses « Les Docks » without typing anything (moment fort: he sees where the sheet
   is before choosing where it goes); « Recherche » stays one click away when he knows the title. Failure: a
   level that does not load says « Impossible de charger ce niveau. » with « Réessayer », the path still usable;
   connection lost — the banner, navigation and « Déplacer » inactive, the shown level stays.
3. Menu « ⋯ » d'un doublon : « Supprimer la fiche… » ; la boîte compte ce qui part avec elle
   (sections, relations qui la visent, places sur une carte ; ses fichiers restent dans la médiathèque),
   dit sous quelle fiche
   remontent ses enfants et que les liens qui la visent deviendront des liens cassés (texte exact :
   E-9) ; le doublon venait de Kanka : Antor le retire aussi de l'export, sinon le prochain import le
   recrée (B-40).
4. Dans un **scénario** (E-7 — `kanevas-scenarios`: a section of the scenario's sheet, E-9), même geste : `[[` ouvre la même liste (les fiches de l'univers de la campagne) et le lien
   s'ouvre sur la fiche ; dans une entrée de système (E-15), `[[` ne fait rien.
*Échec liens* : Léa, auteur avec écriture, tape à la main `[[<id>]]` d'une fiche qu'elle ne lit pas (l'identifiant d'une adresse qu'Antor lui a donnée) — « Cette fiche n'existe
pas ou vous ne pouvez pas la lire. » sous le champ, son texte intact ; la liste ne répond pas — « Impossible de
chercher. » et « Réessayer » ; un lien vers une fiche qui n'est pas encore importée — « en attente » pour Antor,
texte pour Léa, jusqu'à l'arrivée de la fiche ; dans un scénario, la liste qui échoue — « Impossible de chercher. ».
*Échec* : un déplacement qui ferait un cycle (la boîte n'offre plus l'enfant ; reste le cas d'une hiérarchie changée boîte ouverte) — « Une fiche
ne peut pas être rangée sous l'un de ses descendants. » ; un titre vidé — « Erreur : le titre est obligatoire. », le champ reste ; un bilan de suppression qui ne se charge pas — « Impossible de charger le détail. », « Réessayer » (états : E-9) ; un Joueur auteur d'une section qui contient
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
1. From the sidebar, Antor opens **« Médiathèque »** (E-19), filters « Images », then searches by name
   for « carte-des-sphères.png » (used in three sheets) and renames it « Carte des Sphères ».
   He switches to « Documents »: « Règles de la Guilde.pdf » (PDF, 2,4 Mo).
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
4. Léa opens « Les Docks »: instead of the lair map image in « Histoire », she reads
   « Image réservée au MJ. ». She opens « Port-Sel » and downloads « tarifs-du-port.pdf » from
   the attachments of « Description ». Her **« Médiathèque »** (E-19) only shows player-visible
   files; for « Carte des Sphères », it only lists sheets she can read.
5. Antor deletes a duplicate image: the confirmation lists « Val-Fortin — « Description » »,
   « Maître Aldric — « Apparence » (jointe) » and « Port-Sel (illustration) ». He first replaces
   the illustration, then deletes the file.
*Moment fort* : un même fichier, utilisé dans trois fiches, change de droits en un geste, et Kanevas
dit exactement où les joueurs le perdent.
*Échec* : un fichier vide — « « notes.txt » est vide. », rien n'est ajouté ; un envoi coupé —
« L'envoi n'a pas abouti. », rien n'est ajouté ni joint ; une illustration qui n'est pas une image —
« « regles.pdf » n'est pas une image. » ; un joueur force l'adresse d'un fichier réservé au MJ — « Page
introuvable. ».

### P-22 — Bring Kanevas up to date from the Éneria base (Monsieur, GM, a Saturday, Mac)
1. The script opens a batch (`POST /lots`), then reads the lists of sheets, files and maps (B-80,
   B-90) and compares each fingerprint with the one it kept at its last run. A file sent again
   without its visibility keeps the one Kanevas holds (B-91).
2. A sheet whose fingerprint moved: the script reads it (B-81), sees what the GM changed in Kanevas
   (« Velarion LUMA-7 » renamed, its Description rewritten), and tells Monsieur, who carries it into
   the base. A sheet born in Kanevas is listed too, with its key and marked « née dans Kanevas »; a
   sheet missing from the list was deleted (its line is in the history, B-102).
3. For what changed in the base, the script writes only that: a renamed header field (B-82), the
   section « Relations » deleted on 130 sheets (B-83), a relation whose nature changes (B-84) — each
   with the fingerprint it read (B-85).
4. A write refused because the sheet moved meanwhile: the script reads it again and retries, or
   leaves it to Monsieur. Nothing was written.
5. The 17 « map » sheets of the base become maps (B-87), each attached to its place, ship class or
   adventure, with its caption as text; the batch is closed and E-18 shows its counts, maps included.
   Failure: a background over the instance's limit is refused with its key, the rest goes on.

### P-23 — Tidy a map (Antor, GM; the admin for the limit)
1. On « Cartes de combat de Tyros-7 » (**E-11**), Antor reads the text, edits it, puts a sentence in a
   GM block, and attaches the map to the sheet « Tyros-7 »; on Tyros-7 (**E-9**), the block « Cartes »
   lists it. Léa, a player, sees the map on Tyros-7 once it is visible, and its text without the GM block.
2. A background of 90 MB is refused: the admin raises the limit on **E-5** (B-89), Antor sets it again.

### P-24 — Work the lore with an agent (Monsieur, with his agent, a session on the Mac)
1. At the start, the agent exports Éneria (B-92) into its local copy, then downloads the images whose
   fingerprint changed; during the session it checks the list « changed since » the export (B-93).
2. Monsieur asks for a coherence review of Sevrak: the agent searches the passages (B-98) through the
   MCP (B-97), reads the sheets that mention `personnage:sevrak` (B-97), and shows the contradictions.
3. They decide together, in the agent's worktree; once Monsieur says go, the agent writes each change
   through the MCP, with the fingerprints it read (B-82 to B-85). A write refused because the sheet
   moved: the agent reads it again and asks Monsieur.
4. The agent creates « Les Veilleurs », a faction: Kanevas gives it `faction:les-veilleurs` (B-99),
   which the agent writes into its faction data; the agent's data cite sheets by key
   (`lieu:tenebria`), and Monsieur opens `/univers/eneria/lieu/tenebria` (B-101) to read what it wrote.

### P-25 — Manage one's tokens (Léa, player; Antor, GM)
1. Léa opens « Mes jetons d'API » (**E-23**), creates « Agent de Léa », « tous mes univers », in
   « lecture » (B-94); she copies the value shown once — the strong moment: it is never shown again. A save that fails says
   « Impossible d'enregistrer. » and keeps her entries; a change on a token revoked meanwhile says « Ce jeton est révoqué. ».
2. A token of Léa's misbehaves in Éneria: Antor asks the admin, who on **E-5** adds to the token's « tous mes
   univers » (« Tous les univers du compte » on E-5) the exception « Éneria : — » (B-95); Léa's page shows « Modifié par l'admin », her other
   universes unchanged, and so will every universe she joins later.
3. Léa changes the accesses of her token (« Modifier les accès », E-23): the pill goes, the value is
   unchanged. If she loses the value before copying it, there is no way to read it again: she revokes the
   token (« Révoquer », confirmation) and creates another.
4. Another token, forgotten by its owner, still works: the admin revokes it on **E-5** (confirmation naming
   the token and its owner); its owner then reads « Révoqué par l'admin » on E-23, and the script gets 401
   `jeton_invalide`. Antor, a GM, sees none of these tokens and has no gesture on them.

### P-26 — See who changed what, and undo a mistake (Antor, GM, the day after)
1. On « Historique » of Éneria (**E-24**), Antor filters on the token « Agent Éneria » (B-102): twelve
   lines yesterday evening, one of them « Section Histoire de Sevrak réécrite ».
2. He opens it, compares with the previous value, and restores it (B-103); the history now carries his
   restoration. A sheet deleted by mistake two weeks ago: he reads its sections in the history and
   copies back what he needs.
3. He changes the key `lieu:tenebria-2` to `lieu:tenebria-la-noire` on E-9 (B-99), and the universe's
   identifier `eneria-v2` back to `eneria` on E-14 (B-100); the former addresses still open the sheet.

## Hors périmètre

- *(`kanevas-synchro`)* **A list of the keys deleted since the import**, as such: refused — a script
  sees a deleted sheet by its absence from the list (B-80), and the history keeps the deletion 90 days
  (B-102; B-40 amended by Monsieur, 2026-11-01). **Removal by omission** (« this list of sections is
  complete »): refused, a removal is targeted (B-86). **A mark on the relations the import created**:
  refused (2026-11-01). ~~The import writing a section born in Kanevas~~: every section has a key since the extension (B-104).
  **Importing map tokens and graph maps**; **one map per image** is the script's choice.
  **Free fields per sheet**: refused — positions of systems belong to the galaxy tool (`kanevas-outils`),
  sources go in a GM-only section keyed `sources` (2026-11-01). **A batch of proposals reviewed in
  Kanevas, and an all-or-nothing grouped write**: refused — the tool reviews with Monsieur and writes
  one by one (2026-11-01). **A read-only token scope**: none; a token's level is chosen per universe
  (B-94). **OAuth through Authelia for the MCP** (claude.ai connectors): deferred. **Restoring a
  deleted sheet** by a gesture: out.
- **Jeu en direct** : pas d'initiative, de combat animé, de brouillard de guerre ; la table reste
  physique.
- *(kanevas-scenarios)* **A calendar of sessions** (dates, who was there) and a **play log per
  scenario** (« joué le 12 octobre avec Léa et Mira ») — the status says where an adventure
  stands, not when; reopened if the GM asks for the history of a campaign.
- *(kanevas-scenarios)* **Status automation** — no status moves by itself (a CR written, a date
  passed): the GM sets it.
- **Caractéristiques structurées** (fiche de combat, statistiques) : une pièce jointe en V1 ; des
  types de fiches dédiés plus tard.
- **Supprimer** une campagne, un scénario, un CR, une carte, une tâche, un système : rien de cela
  ne se supprime, sauf une pièce jointe, une section, une relation, un membre, et le token ou le nœud
  d'une carte (on le retire de la carte ; sa fiche reste). *(choix de cadrage, à revoir à l'usage)*
  Depuis `kanevas-scenarios`, une campagne et un scénario sont des fiches : ils se suppriment comme elles (B-40, E-9), la confirmation
  comptant leurs tâches, leurs scénarios et leurs comptes-rendus (AD-119) ; désactiver le type « Aventure » (E-14, P-13) ne cache aucune
  aventure, seule l'entrée de la barre et la création disparaissent.
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
- *(`kanevas-synchro`: illustrated maps enter the import API, B-87; their tokens and graph maps stay out)* **Cartes dans l'API d'import** : une autre epic, « plus évoluée » ; ici, une carte Kanka s'importe
  comme une fiche ordinaire avec son image. *(décision de Monsieur du 2026-10-11)*
- **Chronologie comme type à part** (une frise) : une epic plus évoluée, comme les cartes ; ici, une
  chronologie est une fiche « Savoir ». *(décision de Monsieur du 2026-10-11)*
- **Blocs secrets par joueur** dans un texte : le bloc MJ n'a qu'une audience, le MJ ; un secret
  pour un seul joueur reste une section à auteur (AD-19).
- **Historique d'un import, annulation d'un lot** : un lot se rejoue, il ne se défait pas ; on
  supprime l'univers d'essai.
- **Export vers Kanka ou un autre outil** : non trié. *(`kanevas-synchro`: the token read of the import API, B-80 and B-81, lets a script read back what it imports; no export screen, no export format.)*
- **Calendrier ou chronologie, lanceur de dés, usage sans connexion (PWA)** : non triés.
  Since `kanevas-icones` (AD-135), Kanevas is installable (manifest, icons) but ships **no service worker and no offline cache**: the installed app needs the network, and offline use stays untriaged.
- **Historique des modifications, export, partage public.** *(`kanevas-synchro`: a history of writes enters, 90 days of lines and 30 of previous values, B-102, B-103; a whole-universe export by token, B-92; public sharing stays out.)*

## Contrôle croisé du cadrage `kanevas-import`

Fait le 2026-10-11 sur la proposition (skill `cadrage`, étape 6), refait après la relecture 1, puis
après les décisions de Monsieur du 2026-10-11 (Savoir, sous-type, médiathèque, pas de pierre tombale,
cartes hors de l'API, jeton de l'assistant inclus), et après AD-111 (tous les fichiers dans la médiathèque).

| Croisement | Résultat |
|---|---|
| Chaque besoin a un parcours | B-32 P-12, P-14 · B-33 P-12, P-14 · B-34 P-12, P-14 · B-35 P-12, P-14 · B-36 P-12 · B-37 P-12 · B-38 P-12, P-14 · B-39 P-14 · B-40 P-14 · B-41 P-10 · B-42 P-13, P-10 · B-43 P-10, P-14 · B-44 P-12, P-16 · B-45 P-25, P-10 · B-46 P-25 · B-47 P-10 · B-48 P-10, P-14 · B-49 P-10 · B-50 P-10 · B-51 P-15 · B-52 P-12, P-14 · B-53 P-16, P-10 · B-54 P-16 · B-55 P-16 · B-56 P-10 — **tient**. |
| Chaque geste humain d'un parcours a un écran | P-10 : E-1, E-2, E-14, E-18, E-8, E-9, E-17, E-13, E-19 ; l'étape 4 n'est pas un geste dans Kanevas (le script, hors produit, décision de Monsieur), son résultat se lit sur E-18 et E-19 · P-11 : remplacé par P-25 (E-23, E-5) · P-12 : E-8, E-9, E-17, E-12 · P-13 : E-15, E-14, barre · P-14 : E-9 · P-15 : E-5 · P-16 : E-19, E-9 — **tient**. |
| Chaque écran a ses données | E-17 : fiches, alias, étiquettes, sous-type, index (titre, alias, sous-type, `contenu_public`) · E-18 : jetons d'API, lots d'import · E-14 / E-15 : réglages de type · E-9 : liens, parent, sous-type, alias, étiquettes, clé d'origine, références de fichier (texte, jointes), illustration (un fichier image) · E-8 : sous-type, illustration · E-19 : fichiers (images et documents), références de fichier, illustrations · E-13 : `cree_le` (date d'origine) · E-5 : un fichier du volume, pas une entité (B-51) — **tient**. |
| Chaque entité sert un parcours | lien P-12, P-14 · alias et étiquette P-12, P-14 · réglage de type P-13 · jeton d'API P-25 · lot d'import P-10 · fichier et référence de fichier P-16, P-12, P-10, P-7 (le joueur qui dépose un portrait passe par le premier chemin d'ajout) — **tient**. |
| Trous comblés par un choix écrit | l'import n'a pas d'écran de déclenchement (le script) : décision de Monsieur ; « vider un univers d'essai » remplacé par « supprimer l'univers » (AD-105) ; une fiche supprimée revient au rejeu si l'export l'envoie (décision de Monsieur) ; les cartes hors de l'API, une carte Kanka est une fiche (décision de Monsieur) ; E-17 prend la bascule de mode ; liens d'un scénario et d'une entrée de système réglés (AD-97) ; l'image générée par l'assistant entre dans la médiathèque (AD-44 amendée) ; poser une illustration passe par les deux chemins d'ajout (E-9) ; pièces jointes et médiathèque : tous les fichiers dans la médiathèque (AD-111, décision de Monsieur), les deux chemins d'ajout explicites sur E-9 et E-19. Aucun `[À TRANCHER]` ne reste. |
