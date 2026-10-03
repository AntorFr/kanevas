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
| **proposition** | contenu proposé, empreinte du contenu d'origine, appliquée le | univers, compte demandeur, section, CR source | son seul demandeur | créée par l'agent du MJ ; appliquée une fois par son demandeur, si la section n'a pas changé (B-21) |

**Index de recherche** : un index plein texte (FTS5) sur les titres et contenus de sections, tenu
à jour par la base (déclencheurs) ; aucune réponse n'en sort sans repasser par le filtre de
droits (AD-8, AD-21).

**Pas de table** pour : les sessions (cookie signé), les conversations avec l'assistant (le fil
vit dans le navigateur, AD-28), la disposition d'un graphe (calculée dans le navigateur, AD-42),
ses liens (déduits des relations, AD-41).

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

## Évolution

Migrations SQL numérotées, appliquées au démarrage, sans ORM (AD-14). **La table des fiches
connaît ses sept types dès sa création** : aucune tranche ne la recrée. L'ordre des migrations
suit l'ordre de fusion des tranches, et chaque tranche prend le numéro suivant au moment où elle
se fusionne, pas avant (AD-51).

## Migration `kanevas-cartes-graphes` (numéro pris à la fusion, AD-51 : le suivant)

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
