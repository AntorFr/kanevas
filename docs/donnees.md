# Kanevas — données

> Doc du produit (voir `docs/parcours.md`, `docs/ecrans.md`). Toutes les entités du produit,
> leurs relations et qui lit ou écrit quoi. **Une tranche ajoute des attributs, jamais une
> entité** : une entité de plus est une question pour le cadrage.

Un seul fichier SQLite sur le volume (`/data/kanevas.db`, AD-5) ; clés étrangères actives, WAL,
une seule connexion d'écriture. Les octets des pièces jointes vont sur le disque du même volume
(`/data/attachments/`), jamais en base (AD-7). Toute lecture et toute écriture passent par les
fonctions de service du backend, que les routes et les outils de l'agent appellent de la même
façon (AD-2).

## Entités

| Entité | Porte | Relations | Qui lit | Qui écrit |
|---|---|---|---|---|
| **compte** | identifiant Authelia (`username`, unique), date de création ; aucun rôle | — | lui-même ; les membres d'un univers commun (son identifiant) ; un MJ qui tape un identifiant exact pour l'ajouter apprend seulement s'il existe ; l'admin d'instance | créé à la première connexion (B-1) |
| **univers** | nom, description, date de création | → système de jeu (facultatif) | ses membres ; son nom : l'admin d'instance | création : tout compte (B-2) ; modification : MJ |
| **membre** | (univers, compte, rôle MJ \| Joueur) | univers, compte | les membres de l'univers ; l'admin d'instance | MJ de l'univers ; admin d'instance (cette table seulement, AD-9) ; au moins un MJ par univers (B-5) |
| **système de jeu** | nom | ← univers ; → gabarits | tout MJ d'un univers (nom seul) ; le contenu : membres d'un univers rattaché | création : tout MJ ; référentiel : MJ d'un univers rattaché |
| **gabarit** | type (règle, créature, objet), nom, contenu | système de jeu | membres d'un univers rattaché | MJ d'un univers rattaché (B-14) |
| **fiche** | type (personnage, lieu, faction, objet, événement, quête, compte-rendu), titre, créée le, modifiée le, charge utile versionnée par type (AD-6) — personnage : PJ \| PNJ ; compte-rendu : sa campagne | univers ; → sections | qui lit au moins une de ses sections ; sinon elle n'existe pas (B-9) | création : MJ ; un compte-rendu : tout membre (B-19) |
| **section** | titre, ordre, contenu, modifiée le ; lecture et écriture des joueurs ; auteur (un compte) avec sa lecture et son écriture | fiche ; → relations, pièces jointes | le MJ ; un joueur selon les bascules (AD-19) | contenu : qui a l'écriture ; structure et audience : MJ |
| **relation** | type (texte libre), dirigée | section porteuse → fiche cible | qui lit la section **et** la fiche cible (sinon la cible n'est pas nommée) | MJ |
| **pièce jointe** | nom d'origine, type MIME, taille, nom sur disque (UUID), secrète | section | qui lit la section, et le MJ seul si secrète | qui écrit la section ; « secrète » : MJ |
| **campagne** | nom, statut (en préparation, active, terminée) | univers ; → scénarios, tâches, CR | tout membre (nom, statut) | MJ |
| **scénario** | titre, contenu | campagne | MJ | MJ |
| **tâche de préparation** | catégorie (monstres, PNJ, cartes, déroulements, autre), libellé, faite | campagne | MJ | MJ |
| **carte** | titre, forme (illustrée \| graphe, fixée à la création), visible des joueurs, fond : une image déposée sur la carte elle-même, rangée sur le disque comme une pièce jointe (AD-40) | univers ; → éléments | MJ ; les joueurs si visible | MJ |
| **élément de carte** | position en % (carte illustrée) ou rien (graphe) | carte, fiche | comme la fiche de l'élément | MJ |
| **proposition** | contenu proposé, empreinte du contenu d'origine, appliquée le | univers, compte demandeur, section, CR source | son seul demandeur | créée par l'agent du MJ ; appliquée une fois par son demandeur, si la section n'a pas changé (B-21) |

**Index de recherche** : deux index plein texte (FTS5), l'un sur les titres de fiches, l'autre sur les titres et contenus de sections, tenus
à jour par la base (déclencheurs) ; aucune réponse n'en sort sans repasser par le filtre de
droits (AD-8, AD-21).

**Pas de table** pour : les sessions (cookie signé), les conversations avec l'assistant (le fil
vit dans le navigateur, AD-28), la disposition d'un graphe (calculée dans le navigateur, AD-42),
ses liens (déduits des relations, AD-41).

## Migration 0001 (`kanevas-premiere-fiche`)

Cinq tables : `comptes`, `univers`, `membres`, `fiches`, `sections`. Pas de recherche (FTS5 vient
avec `kanevas-relier-chercher`, qui prend le numéro suivant, AD-51).

| Table | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `comptes` | `id`, `username` (identifiant Authelia, `preferred_username`), `cree_le` | `username` unique ; jamais de rôle ni de groupe (les groupes vivent dans la session) |
| `univers` | `id`, `nom`, `description`, `cree_le` | `nom` non vide, 1 à 80 caractères |
| `membres` | `univers_id`, `compte_id`, `role` (`mj` \| `joueur`) | clé primaire (`univers_id`, `compte_id`) ; clés étrangères ; au moins un `mj` par univers garanti par le service (B-5), pas par la base |
| `fiches` | `id`, `univers_id`, `type` (les sept : `personnage`, `lieu`, `faction`, `objet`, `evenement`, `quete`, `compte_rendu`), `titre`, `charge` (JSON versionné, AD-6 et AD-17 : `{"v":1}` ; personnage `{"v":1,"pj":true\|false}` ; compte-rendu `{"v":1,"campagne_id":…}`), `cree_le`, `modifie_le` | `type` contraint à ces sept valeurs ; `titre` non vide, 1 à 120 caractères ; **aucune suppression** |
| `sections` | `id`, `fiche_id`, `titre`, `ordre`, `contenu` (texte brut, AD-58 ; 20 000 caractères au plus, AD-91), `version` (entier, AD-59, 1 à la création), `modifie_le`, `joueurs_lisent`, `joueurs_ecrivent`, `auteur_id` (compte, facultatif), `auteur_lit`, `auteur_ecrit` | quatre bascules booléennes, **toutes à faux à la création** (une section naît fermée aux joueurs) ; `ordre` entier unique par fiche ; `titre` non vide, 1 à 80 caractères ; `contenu` borné par le service seul (`MAX_CONTENU_SECTION`), pas par un `CHECK` ; `auteur_id` doit être un membre Joueur de l'univers de la fiche, vérifié par le service ; retirer un membre efface son `auteur_id` |

`modifie_le` de la fiche suit la dernière écriture d'une de ses sections. `ordre` est renuméroté
de 1 à n à chaque réordonnancement ou retrait. Le mode Joueur est calculé par le service, jamais
par le client : il lit comme un Joueur **qui n'est l'auteur d'aucune section** (AD-39).

## Migration `kanevas-systemes`

> Fichier : `src/db/migrations/0002-systemes.sql` — **numéro provisoire** (0002).
>
> Pendant le build, le fichier prend le numéro qui suit le dernier présent sur la branche : **numéro
> provisoire**. Il n'est définitif qu'à la fusion : la phase merge (l'étape de la chaîne qui fusionne les PR après la recette) le recale sur le dernier fusionné si
> une autre tranche est entrée avant (AD-51), et corrige alors cette note. Deux tables, une colonne : aucune entité de plus que le cadrage.

| Table | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `systemes_jeu` | `id`, `nom`, `cree_le` | `nom` 1 à 80 caractères après rognage ; **unique sans tenir compte de la casse** (`COLLATE NOCASE`) |
| `gabarits` | `id`, `systeme_id`, `type` (`regle` \| `creature` \| `objet`), `nom`, `contenu` (texte brut, AD-58), `version` (entier, 1 à la création, AD-85), `cree_le`, `modifie_le` | `type` contraint à ces trois valeurs, fixé à la création ; `nom` 1 à 120 caractères ; `contenu` 20 000 au plus ; `nom` unique par (système, type) sans tenir compte de la casse ; **aucune suppression** |
| `univers` (ajout) | `systeme_id`, facultatif, → `systemes_jeu` | `NULL` par défaut (aucun univers existant n'est rattaché) |

Un univers a **au plus un** système ; un système peut servir plusieurs univers. Détacher remet
`systeme_id` à `NULL` et ne touche à aucun gabarit. Rien n'est amorcé : le catalogue naît vide, les
systèmes sont créés par les MJ.

**Droits** (AD-25) : le catalogue (`id`, `nom`) se lit par tout compte qui est MJ d'au moins un univers ;
un système, ses gabarits et le nombre d'univers qui l'utilisent se lisent par les membres d'un
univers rattaché ; les gabarits s'écrivent par ses MJ. **Le nombre N est le seul renseignement sur les
autres univers** : ni leur nom, ni leurs membres (règle 3). Créer un système : tout MJ d'un univers,
au catalogue, avec ou sans rattachement dans le même geste. Modifier le nom et la description d'un
univers : MJ.

## Migration `kanevas-suivi` (numéro pris à la fusion, AD-51 : le suivant de 0002)

> Fichier : `src/db/migrations/0003-suivi.sql` — **numéro provisoire** (0003), recalé à la fusion si une autre tranche entre avant (AD-51).

Trois tables, aucune entité nouvelle (campagne, scénario, tâche de préparation sont celles du
cadrage). Les comptes-rendus n'ont pas de table : un compte-rendu est une fiche de type
`compte_rendu` (charge `{"v":1,"campagne_id":…}`, déjà posée par 0001, AD-52).

| Table | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `campagnes` | `id`, `univers_id`, `nom`, `statut` (`en_preparation` \| `active` \| `terminee`), `cree_le` | `nom` non vide, 1 à 80 caractères ; `statut` contraint à ces trois valeurs, `en_preparation` à la création ; plusieurs `active` permises (AD-60) ; **aucune suppression** |
| `scenarios` | `id`, `campagne_id`, `titre`, `contenu` (texte brut, AD-58), `version` (entier, 1 à la création, AD-62), `cree_le`, `modifie_le` | `titre` non vide, 1 à 120 caractères ; `contenu` 20 000 caractères au plus ; **aucune suppression** |
| `taches_preparation` | `id`, `campagne_id`, `categorie` (`monstres` \| `pnj` \| `cartes` \| `deroulements` \| `autre`), `libelle`, `faite`, `faite_le` (date de la dernière coche, vide si décochée), `cree_le` | `libelle` non vide, 1 à 200 caractères ; catégorie contrainte à ces cinq valeurs (AD-46) ; **aucune suppression** |

Un compte-rendu se crée en une seule transaction : la fiche (type `compte_rendu`, `campagne_id` de
la campagne de l'univers) et **une** section « Compte-rendu » portant le texte, lisible des
joueurs, non écrivable par eux ; si le créateur est un Joueur, il en est l'auteur, qui la lit et
l'écrit ; si c'est un MJ, la section n'a pas d'auteur (AD-61). La campagne cible doit appartenir à
l'univers du créateur, sinon la création échoue comme pour une campagne inconnue. Rien n'est écrit
si l'une des deux écritures échoue. L'ordre des comptes-rendus est `cree_le` décroissant, `id`
décroissant en cas d'égalité. Le nom de la campagne et l'auteur d'un compte-rendu se lisent à
travers les droits de la fiche : l'auteur n'est montré que si la section est lisible du compte.

Droits (en plus de ceux de 0001) : `campagnes` — nom et statut, tout membre de l'univers ; création
et statut, MJ. `scenarios` et `taches_preparation` — MJ de l'univers **de la campagne** seul (AD-47),
évalué sur l'univers de la campagne, jamais sur un identifiant fourni par l'appelant : un MJ d'un
autre univers n'atteint aucun scénario ni aucune tâche, un Joueur non plus (réponse comme pour un
identifiant inconnu, AD-22), et leur nombre ni leur existence ne sortent jamais d'une réponse à
un Joueur.

## Règles de droits, en une phrase chacune

1. Les droits sur le contenu viennent de **membre**, jamais d'Authelia (AD-9). Authelia ne
   donne qu'une chose : le rôle d'admin d'instance (groupe `parents`), qui lit les noms des
   univers et les membres, et n'écrit que la table des membres.
2. Le **MJ** lit et écrit tout dans son univers (AD-18) ; un **joueur** suit les bascules de
   chaque section (AD-19).
3. Ce qu'un compte ne peut pas lire **n'existe pas** pour lui : absent des listes, des
   recherches, des cartes, des liens ; son adresse répond 404 (AD-22).
4. Une **pièce jointe** n'est servie que par la route qui revérifie ces droits (AD-7, AD-36).
5. L'**agent** a exactement les droits de la personne qui lui parle (AD-2, AD-26).

## Migration `kanevas-relier-chercher` (`0005-relier-chercher.sql`, recalée à la fusion après 0004, AD-51)

Une table et deux index de recherche ; aucune entité nouvelle (la relation est celle du cadrage).

| Objet | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `relations` | `id`, `section_id` (la porteuse), `cible_fiche_id`, `type` (texte libre), `cree_le` | `section_id` → `sections` **ON DELETE CASCADE** (retirer une section retire ses relations) ; `cible_fiche_id` → `fiches` **ON DELETE RESTRICT** (une fiche ne se supprime pas) ; `type` 1 à 80 caractères après rognage ; `UNIQUE (section_id, cible_fiche_id, type)` |
| `recherche_fiches` (FTS5) | `titre` ; `rowid` = `fiches.id` | tokenizer `unicode61 remove_diacritics 2` |
| `recherche_sections` (FTS5) | `titre`, `contenu` ; `rowid` = `sections.id` | idem |

Les index sont tenus par des **déclencheurs** (AD-21) : à l'insertion, à la modification du titre
(fiche) ou du titre et du contenu (section), à la suppression, y compris celle qu'une cascade
provoque. La migration **remplit** les index depuis les lignes déjà présentes (une base de la
première fiche garde ses fiches cherchables). Index SQL : `relations (section_id)` sert la lecture
des relations d'une section ; aucun index sur `cible_fiche_id` (aucune requête de cette tranche n'en
a besoin ; le graphe des cartes ajoutera le sien si sa requête l'exige).

Ce que la base ne dit pas, et que le service porte, avec sa raison (la règle croise plusieurs
tables) : la fiche cible est **du même univers** que la fiche de la section ; elle n'est **pas**
cette fiche elle-même ; une section porte **100 relations** au plus ; seul un MJ crée ou retire.

Lecture, évaluée pour **le compte et le mode** de l'appelant : une relation est rendue si la section
porteuse est lisible **et** si la fiche cible l'est (au moins une section lisible ; le MJ, hors
mode Joueur, lit toute fiche de son univers). Sinon elle est absente de la réponse, sans compteur.
Recherche : la liste d'un type avec une condition de plus (AD-63), saisie de 1 à 100 caractères (le service refuse au-delà) ; l'API accepte `q` sans `type` (toutes les fiches lisibles), mais aucun écran ne l'emploie : la recherche tous types reste hors tranche ; l'index ne livre que des
identifiants de candidats, jamais un résultat.

## Évolution

Migrations SQL numérotées, appliquées au démarrage, sans ORM (AD-14). **La table des fiches
connaît ses sept types dès sa création** : aucune tranche ne la recrée. L'ordre des migrations
suit l'ordre de fusion des tranches, et chaque tranche prend le numéro suivant au moment où elle
se fusionne, pas avant (AD-51).

## Migration `kanevas-fichiers` (numéro pris à la fusion, AD-51 : le suivant de 0003)

> Provisoire comme celle des systèmes ci-dessus. Fichier : `src/db/migrations/0004-pieces-jointes.sql` — **numéro provisoire** (0004), recalé à la
> fusion si une autre tranche est entrée avant (AD-51). Code : `src/services/stockage.ts` (octets,
> sans notion de section) et `src/services/pieces-jointes.ts` ; dossier réglable par `ATTACHMENTS_DIR`
> (défaut : `attachments/` à côté de la base).

Une table ; aucune entité nouvelle (la pièce jointe est celle du cadrage). Les octets ne sont pas
en base (AD-7) : ils vivent sous `/data/attachments/`.

| Objet | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `pieces_jointes` | `id`, `section_id`, `nom` (nom d'origine), `type` (type MIME **déterminé par le serveur**, AD-66), `taille` (octets), `fichier` (nom sur disque, UUID, AD-35), `secrete` (booléen), `cree_le` | `section_id` → `sections` **ON DELETE CASCADE** (retirer une section retire ses lignes) ; `fichier` unique ; `nom` 1 à 200 caractères ; `taille` > 0 ; `secrete` faux à la création sauf demande du MJ ; index `pieces_jointes (section_id)` |

**Sur le disque** : `/data/attachments/<fichier>` (un fichier plat par pièce, nom = UUID) ; les envois
en cours s'écrivent dans `/data/attachments/tmp/` puis passent d'un coup à leur nom définitif
(AD-65) ; le dossier `tmp/` est vidé au démarrage (sauf base en mémoire). Une ligne et son fichier vont ensemble : jamais
de ligne sans fichier, et un fichier sans ligne n'est pas atteignable (nom aléatoire, aucune route
statique).

Ce que la base ne dit pas, et que le service porte, avec sa raison (la règle croise la section, le
rôle et le mode) : **50 pièces jointes** au plus par section ; ajouter ou retirer demande
d'**écrire** la section ; `secrete` ne se pose et ne se lève que par un MJ ; une pièce se **lit** si
la section est lisible et, si elle est secrète, par un MJ hors mode Joueur ; un fichier vide est refusé.
Ajouter ou retirer une pièce ne change ni la `version` ni `modifie_le` de la section (ce n'est
pas une écriture de son contenu, AD-59).

Retirer une pièce, ou une section, supprime la ligne **puis** le fichier du disque ; si la
suppression du fichier échoue, la ligne est déjà partie et l'orphelin est inatteignable (risque
accepté : il n'y a pas de balayage des orphelins en V1).
## Migration `kanevas-cartes-graphes` (`0006-cartes.sql`, numéro provisoire recalé à la fusion si une autre tranche entre avant, AD-51)

Deux tables ; aucune entité nouvelle (la carte et l'élément de carte sont ceux du cadrage). Les
octets d'un fond ne sont pas en base (AD-7) : ils vivent sous `/data/attachments/` (AD-69).

| Table | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `cartes` | `id`, `univers_id`, `titre`, `forme` (`illustree` \| `graphe`), `visible` (booléen), `fond` (nom sur disque, UUID, facultatif), `fond_type` (type MIME déterminé par le serveur), `cree_le` | `univers_id` → `univers` ; `titre` non vide, 1 à 80 caractères ; `forme` contrainte à ces deux valeurs et **jamais modifiée** ; `visible` **faux à la création** ; `fond` et `fond_type` ensemble ou ensemble absents, et absents d'un graphe (`CHECK`) ; `fond` unique ; index `cartes (univers_id)` ; **aucune suppression** |
| `elements_carte` | `id`, `carte_id`, `fiche_id`, `x`, `y` (réels, pourcentage, AD-70), `cree_le` | `carte_id` → `cartes` ; `fiche_id` → `fiches` **ON DELETE RESTRICT** (une fiche ne se supprime pas) ; `UNIQUE (carte_id, fiche_id)` ; `x` et `y` ensemble nuls ou ensemble entre 0 et 100 (`CHECK`) |

Ce que la base ne dit pas, et que le service porte, avec sa raison (la règle croise la carte, la
fiche et le rôle) : la fiche d'un élément est **du même univers** que la carte ; une carte
**illustrée** porte des éléments avec position, un **graphe** des éléments sans position ; **100
éléments** au plus par carte (AD-72) ; seul un MJ hors mode Joueur crée une carte, la règle (titre,
visibilité), change son fond, place, déplace ou retire un élément ; un fond n'est qu'une image de
25 Mo au plus (AD-69). Retirer un élément supprime sa ligne, jamais la fiche.

Lecture, évaluée pour **le compte et le mode** de l'appelant (AD-68) : une carte se lit si le
compte est MJ hors mode Joueur, ou si elle est visible. Un élément est rendu si sa fiche est lisible
(au moins une section lisible ; le MJ hors mode Joueur lit toute fiche de son univers, AD-38). Les
liens d'un graphe ne sont pas stockés (AD-41) : pour deux éléments rendus A et B, un lien « A → B,
type » existe pour chaque relation de `relations` portée par une section de A que le lecteur lit, qui
vise B et qui se lit sous les deux gardes d'AD-64 (par la même fonction de lecture des relations que
la fiche). Un lien n'est rendu que si ses deux bouts le sont. Aucune réponse ne dit combien
d'éléments ou de liens ont été écartés. La liste des cartes d'un joueur ne contient que les cartes
visibles ; un MJ en mode Joueur voit la même.
