# Kanevas — charte graphique

> Doc du produit. Les tokens que le code lit vivent dans `frontend/src/ui/tokens.css` ; ce
> document dit ce qu'ils signifient, ce que fait chaque composant et les seuils mesurés. La
> maquette de référence est `docs/maquettes/e09-fiche.html` : elle porte le cadre de tous les
> écrans d'un univers et chaque composant ci-dessous, dans les deux thèmes, au bureau et au
> téléphone. Changer la valeur d'un token existant change tous les écrans : c'est une décision
> de Monsieur, écrite ici avec sa raison (voir « Écarts assumés »).

## 1. Direction

- **Sujet.** La mémoire d'une table de jeu de rôle. Un MJ y écrit le soir à son bureau, longtemps ;
  une joueuse y relit sur son téléphone, entre deux séances. On y **lit** des textes longs, et ce
  qui est secret ou partagé en est le cœur : une fuite vaut un spoiler.
- **Références.** La page-document de Notion (une colonne de lecture, des blocs sans cadre, le
  titre qui ouvre la page) ; la navigation et les menus de Linear (densité, icônes partout, menu
  du compte, finesse des états de survol et de focus) ; les wikis de monde (World Anvil, Kanka)
  pour le vocabulaire — fiche, lore, relations — sans leur encombrement de panneaux.
- **Ligne de caractère : « qui voit quoi », rendu matière.** Chaque section porte dans sa marge un
  **filet d'audience** : vert plein, la table la lit ; pointillé neutre, elle est confiée à un
  joueur ; et la section **MJ seul** n'est plus un texte mais une matière — trame hachurée et
  filet ambre, qui déborde de la colonne. En descendant une fiche, on lit sa carte des secrets
  dans la marge avant d'en lire un mot. Le mode Joueur efface la marge : il n'y a rien à cacher
  à qui ne voit que ce qu'il peut voir.
- **Typographie de livre, interface d'outil.** Fraunces pour les titres (un serif à axe optique,
  chaleureux sans faire « médiéval »), Newsreader pour le texte à lire (dessiné pour la lecture
  longue à l'écran), Inter pour tout ce qui se manipule. L'accent est l'**encre** : un indigo
  qui dit « agir, écrire », loin de l'ambre du secret et du vert de la table.

## 2. Tokens

Source : `frontend/src/ui/tokens.css`, propriétés sur `:root` (sombre) et
`:root[data-theme="light"]` ; `color-scheme: light dark`. Le choix Clair / Sombre / Système est
mémorisé (`localStorage`, clé `kanevas-theme`) ; « Système » suit `prefers-color-scheme` et est
résolu en sombre ou clair par `theme.ts`, si bien que ces deux blocs sont les seuls endroits où
vivent les couleurs. Les composants ne lisent que ces tokens : un hexadécimal dans un composant
est un défaut. La maquette porte les mêmes noms et les mêmes valeurs.

Les neutres sont teintés vers l'encre (bleu froid très léger), jamais un gris pur.

| Token | Sombre | Clair | Rôle |
|---|---|---|---|
| `--fond` | `#121317` | `#fcfcfd` | fond de la page-document |
| `--fond-lateral` | `#0e0f12` | `#f4f5f7` | barre latérale |
| `--surface` | `#191a1f` | `#ffffff` | ce qui flotte (menu, réglage, boîte de dialogue, toast), champ, formulaire en ligne |
| `--surface-2` | `#202128` | `#f1f2f5` | survol d'un item, fond d'un segment, cible d'une relation |
| `--surface-3` | `#2a2b33` | `#e8e9ee` | bouton neutre, interrupteur éteint |
| `--bord` | `rgba(255,255,255,.08)` | `rgba(22,26,44,.09)` | séparateur décoratif (filet d'en-tête, entre blocs) |
| `--bord-fort` *(nouveau)* | `rgba(255,255,255,.14)` | `rgba(22,26,44,.16)` | contour d'un bouton neutre, d'une vignette, d'un formulaire en ligne |
| `--bord-champ` | `#74757f` | `#808290` | contour qui **identifie** un champ, une case, un interrupteur éteint (3:1) |
| `--texte` | `#ebecf0` | `#1a1b22` | texte courant, texte à lire |
| `--texte-2` | `#a6a7b0` | `#4a4c58` | texte secondaire, item de navigation au repos |
| `--texte-3` | `#8b8c97` | `#646674` | aide, légende, titre de groupe, état vide |
| `--accent` | `#8b9bf0` | `#3a4cc0` | l'encre : action principale, interrupteur allumé, choix courant |
| `--sur-accent` | `#11142b` | `#ffffff` | texte sur `--accent` |
| `--accent-texte` | `#9aa6f5` | `#3a4cc0` | icône ou texte d'accent (item courant, avatar) |
| `--accent-fond` | `rgba(154,166,245,.16)` | `rgba(58,76,192,.10)` | item courant de la navigation, halo d'un champ en édition |
| `--mj` | `#f2a33c` | `#8a5300` | **réservé au MJ** : texte, icône, filet de la section MJ seul, cadre d'une pièce secrète |
| `--mj-fond` | `rgba(242,163,60,.14)` | `rgba(214,140,30,.14)` | fond de la pastille « MJ seul », segment « Mode MJ » |
| `--mj-bord` *(nouveau)* | `rgba(242,163,60,.42)` | `rgba(176,108,10,.45)` | contour d'une section MJ seul, d'une pièce secrète |
| `--mj-trame` *(nouveau)* | `rgba(242,163,60,.075)` | `rgba(176,108,10,.09)` | hachure de la section MJ seul (1 px tous les 8 px, à 135°) |
| `--table` | `#3fc79a` | `#08694a` | **lu par la table** : texte, icône |
| `--table-fond` | `rgba(63,199,154,.14)` | `rgba(8,105,74,.12)` | pastille « Lue des joueurs », segment « Mode Joueur », bandeau du mode Joueur |
| `--table-bord` *(nouveau)* | `rgba(63,199,154,.55)` | `rgba(8,105,74,.70)` | filet d'audience d'une section lue des joueurs |
| `--danger` | `#ec7b6f` | `#b4352b` | erreur, refus, action destructive |
| `--sur-danger` *(nouveau)* | `#1a0c0a` | `#ffffff` | texte sur un bouton `--danger` |
| `--danger-fond` | `rgba(236,123,111,.14)` | `rgba(180,53,43,.10)` | message d'erreur, bandeau « connexion perdue » |
| `--focus` | `#9aa6f5` | `#3a4cc0` | anneau de focus |
| `--voile` *(nouveau)* | `rgba(5,6,9,.62)` | `rgba(20,22,34,.38)` | sous une boîte de dialogue, sous le tiroir |
| `--ombre-flottant` *(nouveau)* | anneau blanc 6 % + ombre 32 px | anneau encre 8 % + ombre 32 px | tout ce qui flotte (seule ombre du produit) |
| `--squelette` *(nouveau)* | `rgba(255,255,255,.06)` | `rgba(22,26,44,.07)` | blocs de chargement |

**Typographie.** `--police-titre` : Fraunces (axe optique : 144 pour le titre de fiche, 48 pour
une section), repli `"Iowan Old Style", Georgia, serif`. `--police-lecture` *(nouveau)* :
Newsreader, même repli. `--police-texte` : Inter, repli `system-ui, -apple-system, "Segoe UI",
Roboto, sans-serif`. En production, les trois sont servies par le produit (`@fontsource`,
poids 400/500/600, Newsreader avec italique), jamais par un hôte externe ; la maquette les prend
chez Google Fonts. Échelle : `--t-12` légende, pastille · `--t-13` interface dense (navigation,
boutons, blocs) · `--t-14` corps d'interface · `--t-16` titre de boîte de dialogue · `--t-18`
*(nouveau)* texte à lire (17 px au téléphone), interligne 1,68, 66 caractères au plus par ligne ·
`--t-22` titre de section · `--t-32` *(nouveau)* titre de fiche au téléphone · `--t-40`
*(nouveau)* titre de fiche au bureau, interligne 1,08, approche −1,5 %. Graisses : 400 lecture,
500 interface et titres, 600 nom d'univers et titres de boîte.

**Espace.** Grille de 4 px : `--e-1` 4 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 24 ·
`--e-6` 32 *(nouveau)* · `--e-7` 48 *(nouveau)* · `--e-8` 64 *(nouveau)*. Colonne de lecture :
784 px de large avec ses marges (688 px de texte), centrée ; 64 px au-dessus du titre ; 32 px
entre deux sections ; marge d'audience à 28 px à gauche de la colonne (18 px sous 1 080 px,
10 px au téléphone, où la gouttière est de 16 px).

**Profondeur.** Une seule stratégie : **des plans de couleur et des filets fins** ; une seule
ombre, `--ombre-flottant`, réservée à ce qui flotte au-dessus de la page. Les sections ne sont
pas des cartes : seule la section MJ seul a une matière. Rayons : `--rayon-item` *(nouveau)*
6 px (item, bouton-icône, segment) · `--rayon-champ` 8 px (bouton, champ, vignette, ligne de
fichier) · `--rayon-panneau` 12 px (menu, boîte, formulaire en ligne, section MJ seul) ·
`--rayon-pastille` 999 px.

**Icônes.** Lucide, trait 1,75, 16 px (14 px dans un bouton ou une ligne de bloc, 12 px dans une
pastille), `currentColor`. Servies par le produit (`lucide-react`), jamais par un CDN. Une icône
à côté de chaque item de navigation et de chaque action ; un bouton qui n'a qu'une icône a une
étiquette accessible et une infobulle. Jamais d'émoji. Correspondances fixées : Vue d'ensemble
`layout-grid`, Campagnes `flag`, Comptes-rendus `notebook-pen`, Personnages `users-round`, Lieux
`map-pin`, Factions `shield`, Objets `gem`, Événements `hourglass`, Quêtes `scroll-text`, Membres
`contact-round`, Paramètres `settings-2`, Relations `waypoints`, Pièces jointes `paperclip`, MJ
seul et secret `lock`, lu des joueurs `eye`, écrit par les joueurs `pen-line`, mode MJ
`lock-keyhole`, assistant `sparkles`, thème `sun` / `moon` / `monitor`, déconnexion `log-out`,
menu du téléphone `panel-left`.

**Mouvement.** `--duree` 160 ms, `--courbe` *(nouveau)* `cubic-bezier(.2,.7,.2,1)`. Seuls
bougent : l'apparition d'un menu, d'un réglage ou d'une boîte (opacité et 4 px), le tiroir, le
toast, l'interrupteur. Aucune animation d'entrée de page. Sous `prefers-reduced-motion`,
`--duree` vaut 0.

## 3. Usages

Ceux que Kanevas suit :

- **Le compte** : un avatar et l'identifiant en pied de barre latérale, qui ouvrent un menu —
  l'identifiant (« Votre identifiant »), le **thème** en bascule à trois icônes (soleil, lune,
  écran), « Se déconnecter ». Rien de cela n'est étalé dans la navigation.
- **La navigation** : en tête le sélecteur d'univers (sceau, nom, rôle en pastille, menu des
  univers du compte et « Mes univers ») ; des items à icône groupés, les groupes titrés en casse
  normale (« Lore », « Univers »), l'item courant sur `--accent-fond` avec son icône en
  `--accent-texte` ; un tiroir sous un bouton « Menu » au téléphone.
- **La barre haute** : le fil d'Ariane (univers › type › fiche ; au téléphone, l'icône du type et
  le titre seul) et, sur les écrans qui l'ont, la bascule mode MJ / mode Joueur.
- **L'édition en place** : « Modifier » transforme la section en champ à la même typographie, au
  même endroit ; Échap annule, Ctrl/⌘ + Entrée enregistre ; le compteur de caractères est visible.
- **Les réglages rares sont repliés** : l'audience d'une section se lit dans sa pastille et se
  règle derrière elle. **Les actions secondaires se révèlent au survol et au focus** (« Modifier »
  et le menu « ⋯ » d'une section, « Retirer » d'une relation) ; elles restent visibles là où il
  n'y a pas de survol (écran tactile).
- **Les retours** : un toast par action réussie ; un message en ligne, au-dessus du panneau
  concerné, pour un échec (les textes sont ceux de `docs/ecrans.md`) ; des squelettes au
  chargement d'une fiche.
- **Les composants** sont dessinés : menus, interrupteurs, cases, bascules segmentées, boîtes de
  dialogue. Une liste déroulante native n'est gardée que pour un choix dans une liste courte
  (auteur, type de fiche), habillée (fond, contour, chevron Lucide).

Écarts assumés à l'usage :

- **Pas de palette ⌘K** pour l'instant : `docs/ecrans.md` n'en décrit pas ; la recherche vit
  dans E-8. Elle est proposée, pas dessinée.
- **Le bouton de l'assistant est sombre sur clair (inversé), pas en accent** : il flotte sur
  toute page et ne doit pas se confondre avec l'action principale de l'écran.

## 4. Composants

Pour chacun : **V** visuelle, **C** comportementale. Tous ont l'anneau de focus (2 px `--focus`,
décalé de 2 px) sur `:focus-visible`.

**Bouton** (neutre, principal, danger, fantôme ; normal 30 px, petit 26 px ; bouton-icône 28 px).
- V : neutre `--surface-3`, contour `--bord-fort` (survol : `--bord-champ`), texte `--texte` ;
  principal `--accent` / `--sur-accent` (survol : 12 % de `--texte` mêlé) ; danger `--danger` /
  `--sur-danger` ; fantôme sans fond, `--texte-2`, survol `--surface-2` et `--texte` ;
  bouton-icône `--texte-3`, survol `--surface-2` (danger : `--danger-fond` et `--danger`). Rayon
  `--rayon-champ` (icône : `--rayon-item`). Icône Lucide 14 px à gauche du libellé. Désactivé :
  opacité 45 % et curseur interdit. Chargement : libellé « … ».
- C : Tab l'atteint, Entrée et Espace l'activent ; désactivé, il porte `aria-disabled="true"`
  et ne part pas ; pendant l'envoi, il affiche « … » et ne se déclenche qu'une fois. Un bouton
  destructif porte le verbe et l'objet (« Retirer la section », « Retirer le fichier »), jamais
  « OK ». Un bouton-icône a une étiquette accessible qui nomme l'objet (« Retirer la relation
  membre de → Lames Grises ») et une infobulle courte (« Retirer »). 36 à 40 px au téléphone.

**Menu** (compte, univers, actions d'une section).
- V : `--surface`, `--ombre-flottant`, rayon `--rayon-panneau`, 4 px de marge intérieure ;
  entrées de 32 px (40 au téléphone), icône `--texte-3` à gauche, survol `--surface-2` ; une
  entrée danger en `--danger` (icône comprise) ; séparateur `--bord` ; titre de groupe 12 px
  `--texte-3`. Apparition : opacité et 4 px, `--duree`.
- C : le bouton qui l'ouvre porte `aria-haspopup="menu"` et `aria-expanded` ; le menu
  `role="menu"`, ses entrées `role="menuitem"`. Ouvert au clavier, le focus va à la première
  entrée ; ↑ ↓ la déplacent ; Échap ferme et rend le focus au bouton ; un clic dehors ferme.
  Une entrée impossible (« Monter » sur la première section) est `aria-disabled`, visible,
  inerte. Le menu d'une section : « Monter », « Descendre », puis « Retirer la section ».

**Interrupteur** (les quatre réglages booléens de l'audience).
- V : 32 × 18 px ; éteint `--surface-3` cerné de `--bord-champ`, pastille `--texte-2` ; allumé
  `--accent`, pastille `--sur-accent` à droite. La ligne entière (40 px) est la cible ; son
  libellé est à gauche, avec son icône.
- C : `role="switch"` et `aria-checked` ; Espace et un clic sur la ligne le basculent ; le
  changement est enregistré aussitôt (pas de bouton « Enregistrer ») et confirmé par un toast ;
  en cas d'échec, il revient à sa valeur d'avant et le message « L'action n'a pas abouti.
  Réessayez. » paraît. Le mouvement suit `--duree`.

**Pastille d'audience** (et pastilles de rôle, de secret).
- V : 22 px de haut, rayon pastille, 12 px graisse 500, icône Lucide 12 px. Les quatre états
  d'une section : **Lue des joueurs** (`eye`, `--table` sur `--table-fond`) ; **Écrite par les
  joueurs** (`pen-line`, mêmes teintes) ; **Confiée à Léa** (avatar de l'auteur, neutre
  `--texte-2` sur `--surface-2`) ; **MJ seul** (`lock`, `--mj` sur `--mj-fond`). Rôle dans le
  sélecteur : « MJ » ambre, « Joueur » vert. Pièce secrète : « Secrète — MJ seul » (`lock`,
  `--mj` sur `--surface` cerné de `--mj-bord`), posée sur la vignette. Sur une fiche du MJ, la
  pastille est un bouton (chevron 12 px) : au survol, un anneau de sa propre teinte. Elle se
  place **juste après le titre** de la section, jamais poussée par les actions.
- C : l'état est porté par **icône + mot + teinte**, jamais la teinte seule. Le mot se déduit des
  cinq réglages : les joueurs la lisent → « Lue des joueurs » (« Écrite par les joueurs » s'ils
  l'écrivent aussi) ; sinon un auteur qui la lit ou l'écrit → « Confiée à <auteur> » ; sinon
  « MJ seul ». Elle ouvre le réglage d'audience (un panneau `role="dialog"`, titré « Qui voit
  « <section> » », 320 px) : les deux interrupteurs des joueurs, la liste « Auteur » (aucun,
  puis les Joueurs de l'univers), les deux interrupteurs de l'auteur, et « Chaque changement est
  enregistré aussitôt. ». Échap le ferme et rend le focus à la pastille. Son étiquette accessible
  dit l'état et le geste (« Lue des joueurs — régler l'audience de « Apparence » »). Elle
  n'existe ni pour un Joueur ni en mode Joueur.

**Filet d'audience et section MJ seul** (la ligne de caractère).
- V : à 28 px à gauche de la colonne, un filet de 2 px sur la hauteur de la section :
  `--table-bord` plein (lue, ou écrite, par les joueurs), pointillé `--bord-champ` 4/4 (confiée).
  La section MJ seul déborde de 28 px de chaque côté de la colonne (son texte reste aligné) :
  fond `--mj-fond` à 22 % sous une hachure `--mj-trame` (1 px tous les 8 px, 135°), contour
  `--mj-bord` à 45 %, filet `--mj` de 3 px à gauche, coins droits arrondis `--rayon-panneau`.
- C : purement redondant — la pastille dit la même chose en mots, le filet n'est jamais le seul
  porteur. Il change avec le réglage (une section qu'on ferme aux joueurs devient hachurée sous
  les yeux du MJ). En mode Joueur, aucun filet ni hachure : la section MJ seul n'existe pas.

**Toast.**
- V : `--surface`, `--ombre-flottant`, rayon `--rayon-champ`, 40 px de haut ; icône
  `circle-check` en `--table`, texte 13 px, bouton-icône « Fermer ». Centré en bas au bureau ;
  au téléphone, pleine largeur moins la place du bouton de l'assistant.
- C : un toast par action réussie (« « Rumeurs entendues » enregistrée », « Audience de
  « Apparence » enregistrée », « Section « … » retirée »), dans une région `role="status"`
  `aria-live="polite"` ; il part seul après 4 s, ou à « Fermer » ; il ne prend jamais le focus.
  Un échec n'est pas un toast : c'est un message en ligne qui reste.

**Boîte de dialogue** (confirmation de retrait d'une section).
- V : `--surface` sur `--voile`, `--ombre-flottant`, rayon `--rayon-panneau`, 440 px au plus,
  24 px de marge ; pastille d'icône 36 px (`trash-2` en `--danger` sur `--danger-fond`) ; titre
  16 px graisse 600 ; texte `--texte-2` ; boutons à droite, « Annuler » neutre puis l'action en
  danger.
- C : `role="alertdialog"`, `aria-modal`, titrée et décrite ; le focus entre sur « Annuler » et
  y reste (Tab boucle) ; Échap ou un clic sur le voile ferme ; le focus revient au bouton qui l'a
  ouverte (au titre de la fiche si la section a disparu). Les textes sont ceux de
  `docs/ecrans.md`. La confirmation de retrait d'un fichier, elle, se fait **sur place** : la
  ligne « Retirer « plan-des-egouts.pdf » ? Le fichier sera perdu. » avec « Annuler » et
  « Retirer le fichier ».

**Champ** (texte, zone de texte d'une section, liste, case).
- V : 34 px, `--surface`, contour `--bord-champ`, rayon `--rayon-champ`, étiquette 12 px
  graisse 500 `--texte-2` au-dessus ; au focus, contour `--accent` et halo 3 px
  `--accent-fond`. La zone de texte d'une section garde la typographie de lecture (Newsreader
  18 px) sur `--surface`, cernée d'`--accent` avec halo, pied « 313 / 20 000 », aide clavier,
  « Annuler », « Enregistrer ». Case : 16 px, contour `--bord-champ` ; cochée `--mj` (la seule
  case du produit dit « Secrète (MJ seul) »).
- C : une étiquette visible liée au champ ; l'erreur s'affiche dessous en `--danger` avec
  « Erreur : » devant, reliée par `aria-describedby` ; une saisie n'est jamais perdue sur échec.

**Item de navigation.**
- V : 30 px (40 au téléphone), rayon `--rayon-item`, icône 16 px `--texte-3` et libellé 13 px
  graisse 500 `--texte-2` ; survol `--surface-2`, `--texte` ; courant `--accent-fond`, libellé
  `--texte`, icône `--accent-texte`. Titre de groupe 12 px `--texte-3`, casse normale.
- C : dans un `nav` étiqueté ; l'item courant porte `aria-current="page"` ; un item dont l'écran
  n'est pas proposé au rôle, ou pas construit, est absent. Au téléphone, la barre est un tiroir
  (300 px au plus, sur `--voile`) sous le bouton « Menu » (`panel-left`, `aria-expanded`) ; Échap
  ou un toucher sur le voile le ferme et rend le focus à « Menu ».

**Avatar.**
- V : cercle 28 px (16 px dans une pastille), initiales en 11 px graisse 600 ; le compte
  connecté sur `--accent-fond` / `--accent-texte` ; un joueur auteur sur `--table-fond` /
  `--table`.
- C : décoratif (`aria-hidden`) : le nom est toujours écrit à côté. Le bouton du compte
  (avatar, identifiant, chevron) ouvre le menu du compte, `aria-haspopup="menu"`.

**Bascule mode MJ / mode Joueur.**
- V : deux segments dans un fond `--surface-2` ; « Mode MJ » (`lock-keyhole`) actif en `--mj`
  sur `--mj-fond` ; « Mode Joueur » (`eye`) actif en `--table` sur `--table-fond`. Au téléphone :
  « MJ » et « Joueur ». En mode Joueur, un bandeau `--table-fond` sous la barre haute : « Mode
  Joueur : vous voyez ce que voit un joueur. »
- C : `role="radiogroup"`, deux `role="radio"` ; ← → basculent ; le bandeau est `role="status"`.

**Bloc de section** (Relations, Pièces jointes).
- V : une ligne sous le texte, séparée par `--bord` : libellé à gauche (136 px, icône et 13 px
  `--texte-3`), contenu à droite ; au téléphone, l'un sous l'autre. Relation : « membre de »
  `--texte-2`, flèche, puis la cible en jeton (`--surface-2`, icône du type, titre, type en
  `--texte-3`). Vignette 160 × 120, rayon `--rayon-champ`, légende 12 px dessous puis ses
  boutons-icônes ; une pièce secrète est cernée de 2 px `--mj` et porte sa pastille. Fichier :
  une ligne de 40 px cernée de `--bord` (secret : `--mj-bord` et filet `--mj`), icône, nom,
  taille, boutons-icônes. Envoi : la même ligne avec « Envoi… 42 % » et une barre de 2 px
  `--accent`. Vide : « Aucune relation pour l'instant. » en `--texte-3` suivi de l'action.
- C : ce que voit chaque rôle est celui de `docs/ecrans.md` (un bloc qui n'a rien à dire n'existe
  pas pour un joueur ; le MJ voit chaque bloc, même vide).

**Bandeau** (connexion perdue, mode bouchon, mode Joueur).
- V : pleine largeur, collé sous la barre haute, opaque (`--fond` sous la teinte) ; connexion
  perdue `--danger` sur `--danger-fond` avec `wifi-off` ; mode bouchon `--mj` sur `--mj-fond`.
- C : `role="status"`, non fermable ; textes exacts dans `docs/ecrans.md`. Connexion perdue : tout
  geste qui écrit est désactivé (`aria-disabled`, 45 %).

**État de chargement.** V : des squelettes `--squelette` à la forme de la fiche (type, titre,
filet, deux sections). C : `role="status"`, « Chargement de la fiche… » lu et écrit dessous.

## 5. Seuils

Plancher : WCAG 2.2 AA. Mesuré avec `scripts/contraste.py` de la skill `charte-graphique` ; une
teinte translucide est composée sur ce qui est dessous.

| Premier plan | Fond | Thème | Ratio | Seuil | |
|---|---|---|---|---|---|
| `--texte` | `--fond` | sombre / clair | 15,73 / 16,74 | 4,5 | ok |
| `--texte` | `--surface` | sombre / clair | 14,72 / 17,16 | 4,5 | ok |
| `--texte-2` | `--fond` | sombre / clair | 7,76 / 8,31 | 4,5 | ok |
| `--texte-2` | `--fond-lateral` | sombre / clair | 8,01 / 7,81 | 4,5 | ok |
| `--texte-3` | `--fond` | sombre / clair | 5,57 / 5,54 | 4,5 | ok |
| `--texte-3` | `--fond-lateral` | sombre / clair | 5,75 / 5,21 | 4,5 | ok |
| `--texte-3` | `--surface` | sombre / clair | 5,21 / 5,68 | 4,5 | ok |
| `--texte-3` | `--surface-2` | sombre / clair | 4,81 / 5,08 | 4,5 | ok |
| `--sur-accent` | `--accent` | sombre / clair | 6,94 / 7,06 | 4,5 | ok |
| `--accent-texte` | `--fond` | sombre / clair | 8,09 / 6,88 | 4,5 | ok |
| `--texte` (item courant) | `--accent-fond` sur `--fond-lateral` | sombre / clair | 12,48 / 13,52 | 4,5 | ok |
| `--accent-texte` (icône courante) | `--accent-fond` sur `--fond-lateral` | sombre / clair | 6,42 / 5,56 | 3 | ok |
| `--mj` | `--mj-fond` sur `--fond` | sombre / clair | 6,97 / 5,43 | 4,5 | ok |
| `--mj` | `--mj-fond` sur `--surface-2` (segment « Mode MJ ») | sombre / clair | 5,87 / 5,01 | 4,5 | ok |
| `--mj` | `--surface` (« Secrète — MJ seul » sur vignette) | sombre / clair | 8,34 / 6,33 | 4,5 | ok |
| `--texte` | trame MJ sur `--fond` (texte de la section MJ seul) | sombre / clair | 15,06 / 15,03 | 4,5 | ok |
| `--table` | `--table-fond` sur `--fond` | sombre / clair | 6,84 / 5,45 | 4,5 | ok |
| `--table` | `--table-fond` sur `--surface-2` (segment « Mode Joueur ») | sombre / clair | 5,77 / 5,02 | 4,5 | ok |
| `--table-bord` (filet d'audience) | `--fond` | sombre / clair | 3,40 / 4,24 | 3 | ok |
| `--danger` | `--danger-fond` sur `--fond` | sombre / clair | 5,53 / 5,03 | 4,5 | ok |
| `--texte` (message d'erreur) | `--danger-fond` sur `--fond` | sombre / clair | 12,90 / 14,33 | 4,5 | ok |
| `--sur-danger` | `--danger` | sombre / clair | 6,93 / 6,03 | 4,5 | ok |
| `--bord-champ` | `--surface-2` | sombre / clair | 3,51 / 3,40 | 3 | ok |
| `--bord-champ` | `--surface` | sombre / clair | 3,80 / 3,81 | 3 | ok |
| `--focus` | `--fond` | sombre / clair | 8,09 / 6,88 | 3 | ok |
| `--mj` (filet de la section MJ seul) | `--fond` | sombre / clair | 8,91 / 6,17 | 3 | ok |
| `--fond` (assistant, inversé) | `--texte` | sombre / clair | 15,73 / 16,74 | 4,5 | ok |

Mesuré et écarté en cours de route : le vert clair d'avant, `#0a7554` (puis `#0b7352`), tombait
à 4,42:1 dans le segment « Mode Joueur » et son filet à 2,39:1 ; `--table` clair est passé à
`#08694a` et `--table-bord` à 70 %.

Tenus par construction : l'anneau de focus n'est jamais retiré sans remplacement (2.4.7) ; la
barre haute collante (52 px) et les bandeaux sont compensés par `scroll-padding-top` et ne
masquent jamais l'élément focalisé (2.4.11) ; toute cible fait au moins 24 × 24 px CSS (les
plus petites, la pastille de 22 px de haut et les boutons-icônes de 26 px, sont espacées de
sorte que leur cercle de 24 px ne touche aucune autre cible), 36 à 40 px au téléphone (2.5.8) ;
aucun état ne repose sur la couleur seule — audience, rôle, secret, mode : icône + mot +
teinte (1.4.1). `--texte-3` n'est jamais posé sur `--surface-3`.

## 6. Écarts assumés

Aucun ratio sous un seuil.

**Valeurs de tokens existants changées par cette charte — décision de Monsieur.** La maquette
et cette charte les portent ; `frontend/src/ui/tokens.css` garde les anciennes valeurs tant que
Monsieur n'a pas validé et qu'une tranche ne les a pas appliquées au code (les noms, eux, ne
changent pas : le code les lit tels quels).

| Token | Avant (sombre / clair) | Après | Raison |
|---|---|---|---|
| `--accent`, `--accent-texte`, `--accent-fond`, `--focus`, `--sur-accent` | violet `#8b7cf6` / `#5240d0` | encre `#8b9bf0` / `#3a4cc0` | le violet est la teinte par défaut des produits SaaS et de « l'IA » ; l'encre dit écrire, et s'écarte de l'ambre et du vert sans les concurrencer |
| `--fond`, `--fond-lateral`, `--surface`, `--surface-2`, `--surface-3`, `--bord`, `--bord-champ`, `--texte`, `--texte-2`, `--texte-3` | neutres gris chauds (`#101012`… / `#f4f3f0`…) | neutres teintés vers l'encre ; en clair, page presque blanche (`#fcfcfd`) | une page-document se lit sur blanc ; les gris purs faisaient « formulaire » |
| `--table`, `--table-fond` (clair) | `#0a7554` | `#08694a` | l'ancien vert tombait à 4,42:1 dans le segment « Mode Joueur » |
| `--mj-fond` (clair) | `rgba(242,163,60,.14)` | `rgba(214,140,30,.14)` | une teinte ambre propre au clair, plus dense sur blanc |
| `--danger`, `--danger-fond` (clair) | `#b0332a` | `#b4352b` | alignement mesuré ; quasi inchangé |
| `--police-titre`, `--police-texte` | serif et sans-serif système | Fraunces, Inter (servies par le produit) | une vraie fonte choisie pour le sujet ; la police système faisait l'écran « basique » |
| `--duree` | 120 ms | 160 ms | dans la plage 150–250 ms ; 120 ms paraissait sec sur les menus |
| titre de fiche (`h1`) | `--t-22` | `--t-40` (`--t-32` au téléphone) | le titre ouvre la page comme dans un document ; `--t-22` reste le titre de section |

Les tokens marqués *(nouveau)* s'ajoutent sans rien changer à l'existant.
