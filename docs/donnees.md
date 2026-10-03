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
| **système de jeu** | nom | ← univers ; → gabarits | tout compte (nom seul) ; le contenu : membres d'un univers rattaché | création : tout MJ ; référentiel : MJ d'un univers rattaché |
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
| **proposition** | contenu proposé, empreinte du contenu d'origine (la `version` de la section, AD-59), créée le, appliquée le | univers, compte demandeur, section, CR source | son seul demandeur | créée par l'agent du MJ ; appliquée une fois par son demandeur, si la section n'a pas changé (B-21) |

**Index de recherche** : un index plein texte (FTS5) sur les titres et contenus de sections, tenu
à jour par la base (déclencheurs) ; aucune réponse n'en sort sans repasser par le filtre de
droits (AD-8, AD-21).

**Pas de table** pour : les sessions (cookie signé), les conversations avec l'assistant (le fil
vit dans le navigateur, AD-28), la disposition d'un graphe (calculée dans le navigateur, AD-42),
ses liens (déduits des relations, AD-41).

## Assistant (`kanevas-assistant-membre`)

Aucune migration, aucune table, aucun attribut : l'assistant lit et écrit par les fonctions de
service existantes (AD-2, AD-74), et le fil de la conversation n'est stocké nulle part (AD-28,
AD-75). La table `propositions` du cadrage est posée par `kanevas-monde` (ci-dessous).

## Propositions de mise à jour (`kanevas-monde`)

Une table, `propositions` (migration numérotée à la fusion, AD-51) :

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | entier | clé |
| `univers_id` | → `univers` | non nul ; sert à refuser une proposition lue sous un autre univers |
| `demandeur_id` | → `comptes` | non nul ; le seul compte qui la lit, l'applique ou l'abandonne (AD-79) |
| `section_id` | → `sections` | non nul ; suppression en cascade avec la section |
| `cr_id` | → `fiches` | non nul ; la fiche de type `compte_rendu` d'où part la proposition ; cascade par précaution (aucune suppression de CR en V1) |
| `contenu_propose` | texte | non nul, non vide, 20 000 caractères au plus (la limite d'une section) |
| `version_origine` | entier | non nul ; la `version` que la section avait quand l'assistant l'a lue (AD-59, AD-80) |
| `creee_le` | date | non nul |
| `appliquee_le` | date | nul tant qu'elle est en attente |

Invariants, tenus par la base ou la fonction de service : **une seule proposition en attente par
(demandeur, section)** (index unique partiel sur `appliquee_le IS NULL` ; la nouvelle remplace
l'ancienne dans la même transaction) ; une proposition appliquée ne se réapplique pas ni ne
s'abandonne ; abandonner supprime la ligne ; elle n'est lue que par son demandeur, encore MJ de
l'univers. Aucun autre attribut sur `sections` : la `version` d'AD-59 suffit. Lecture : « périmée »
n'est pas stocké, c'est `version` courante ≠ `version_origine` **tant que la proposition n'est pas appliquée**, calculé à chaque lecture ; une proposition appliquée est toujours « appliquée » (appliquer augmente la `version`).

## Migration 0001 (`kanevas-premiere-fiche`)

Cinq tables : `comptes`, `univers`, `membres`, `fiches`, `sections`. Pas de recherche (FTS5 vient
avec `kanevas-relier-chercher`, qui prend le numéro suivant, AD-51).

| Table | Colonnes (hors clés) | Contraintes |
|---|---|---|
| `comptes` | `id`, `username` (identifiant Authelia, `preferred_username`), `cree_le` | `username` unique ; jamais de rôle ni de groupe (les groupes vivent dans la session) |
| `univers` | `id`, `nom`, `description`, `cree_le` | `nom` non vide, 1 à 80 caractères |
| `membres` | `univers_id`, `compte_id`, `role` (`mj` \| `joueur`) | clé primaire (`univers_id`, `compte_id`) ; clés étrangères ; au moins un `mj` par univers garanti par le service (B-5), pas par la base |
| `fiches` | `id`, `univers_id`, `type` (les sept : `personnage`, `lieu`, `faction`, `objet`, `evenement`, `quete`, `compte_rendu`), `titre`, `charge` (JSON versionné, AD-6 et AD-17 : `{"v":1}` ; personnage `{"v":1,"pj":true\|false}` ; compte-rendu `{"v":1,"campagne_id":…}`), `cree_le`, `modifie_le` | `type` contraint à ces sept valeurs ; `titre` non vide, 1 à 120 caractères ; **aucune suppression** |
| `sections` | `id`, `fiche_id`, `titre`, `ordre`, `contenu` (texte brut, AD-58), `version` (entier, AD-59, 1 à la création), `modifie_le`, `joueurs_lisent`, `joueurs_ecrivent`, `auteur_id` (compte, facultatif), `auteur_lit`, `auteur_ecrit` | quatre bascules booléennes, **toutes à faux à la création** (une section naît fermée aux joueurs) ; `ordre` entier unique par fiche ; `titre` non vide, 1 à 80 caractères ; `auteur_id` doit être un membre Joueur de l'univers de la fiche, vérifié par le service ; retirer un membre efface son `auteur_id` |

`modifie_le` de la fiche suit la dernière écriture d'une de ses sections. `ordre` est renuméroté
de 1 à n à chaque réordonnancement ou retrait. Le mode Joueur est calculé par le service, jamais
par le client : il lit comme un Joueur **qui n'est l'auteur d'aucune section** (AD-39).

## Migration `kanevas-suivi` (numéro pris à la fusion, AD-51 : le suivant de 0001)

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

## Migration `kanevas-relier-chercher` (numéro pris à la fusion, AD-51 : le suivant)

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
Recherche : la liste d'un type avec une condition de plus (AD-63), saisie de 1 à 100 caractères (le service refuse au-delà) ; l'index ne livre que des
identifiants de candidats, jamais un résultat.

## Évolution

Migrations SQL numérotées, appliquées au démarrage, sans ORM (AD-14). **La table des fiches
connaît ses sept types dès sa création** : aucune tranche ne la recrée. L'ordre des migrations
suit l'ordre de fusion des tranches, et chaque tranche prend le numéro suivant au moment où elle
se fusionne, pas avant (AD-51).
