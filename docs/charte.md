# Kanevas — charte graphique

> Doc du produit, posée par `kanevas-premiere-fiche` (premier écran). Les tokens que le code lit
> vivent dans `frontend/src/ui/tokens.css` ; ce document dit ce qu'ils signifient, ce que chaque
> composant fait, et les seuils mesurés. Changer la valeur d'un token existant change tous les
> écrans : c'est une décision de Monsieur, écrite ici avec sa raison.

## Parti pris

Kanevas est la mémoire d'une table de jeu de rôle : un MJ y écrit le soir à son bureau, une
joueuse y relit sur son téléphone. L'écran doit d'abord **lire** — un texte long, des sections
bien séparées — avant de décorer. Sombre par défaut (on prépare la séance le soir), clair
disponible. **Une seule audace** : les titres de page et de fiche en serif système
(`ui-serif, Georgia`), le reste en sans-serif système. La couleur sert à dire **qui voit quoi** :
ambre pour ce qui est réservé au MJ, vert pour ce que la table lit, violet pour l'action et la
sélection. Aucun dégradé décoratif, aucune ombre sur les panneaux ; un seul rayon par famille de
composant (voir ci-dessous).

## Tokens

Source : `frontend/src/ui/tokens.css`, propriétés sur `:root` (thème sombre) et
`:root[data-theme="light"]` ; `color-scheme: light dark`. Le thème « Système » suit
`prefers-color-scheme` ; le choix explicite (Clair, Sombre, Système) est mémorisé dans le
navigateur. Les composants ne lisent que les tokens sémantiques ; aucune valeur en dur.

| Token | Rôle | Sombre | Clair |
|---|---|---|---|
| `--fond` | fond de page | `#101012` | `#f4f3f0` |
| `--fond-lateral` | barre latérale | `#131316` | `#ebe9e5` |
| `--surface` | panneau, carte, champ au repos | `#1a1a1f` | `#ffffff` |
| `--surface-2` | champ, ligne survolée | `#212127` | `#f4f3f0` |
| `--surface-3` | bouton neutre | `#2a2a31` | `#ebe9e5` |
| `--bord` | séparateur décoratif | `rgba(255,255,255,.07)` | `rgba(0,0,0,.09)` |
| `--bord-champ` | contour qui identifie un champ ou un bouton | `#7b7a83` | `#85848d` |
| `--texte` | texte courant | `#f5f4f2` | `#1b1a1f` |
| `--texte-2` | texte secondaire | `#a3a2a8` | `#4a4952` |
| `--texte-3` | aide, légende | `#8f8e96` | `#65646d` |
| `--accent` | action principale, sélection (fond) | `#8b7cf6` | `#5240d0` |
| `--sur-accent` | texte sur `--accent` | `#14121f` | `#ffffff` |
| `--accent-texte` | texte et icône d'accent | `#aca2f9` | `#5240d0` |
| `--accent-fond` | fond teinté d'accent | `rgba(139,124,246,.16)` | `rgba(82,64,208,.12)` |
| `--mj` | réservé au MJ (texte, icône) | `#f2a33c` | `#855000` |
| `--mj-fond` | fond teinté MJ | `rgba(242,163,60,.14)` | `rgba(242,163,60,.14)` |
| `--table` | lu par la table (texte, icône) | `#3fc79a` | `#0a7554` |
| `--table-fond` | fond teinté table | `rgba(63,199,154,.14)` | `rgba(10,117,84,.14)` |
| `--danger` | erreur, refus, action destructive (texte) | `#ec7b6f` | `#b0332a` |
| `--danger-fond` | fond teinté danger | `rgba(226,104,91,.14)` | `rgba(176,51,42,.10)` |
| `--focus` | anneau de focus | `#aca2f9` | `#5240d0` |

Typographie : `--police-titre` (`ui-serif, Georgia, serif`), `--police-texte` (police système
sans-serif) ; échelle 12 · 13 · 14 · 16 · 22 px ; texte courant 14 px, interligne 1,6 pour le
contenu des sections. Espacements : 4 · 8 · 12 · 16 · 24 px. Rayons : `--rayon-champ` 8 px,
`--rayon-panneau` 12 px, `--rayon-pastille` 999 px. Durées : `--duree` 120 ms, ramenée à 0 sous
`prefers-reduced-motion`.

**Écart au cadrage.** Les maquettes du cadrage portaient un gris tertiaire `#6b6a72`, mesuré à
3,24:1 sur la surface sombre (seuil 4,5:1) : la charte le remplace par `#8f8e96` (5,35:1). Décision
prise au nom de Monsieur par le mandataire ; renversée si Monsieur tient à l'ancien gris.

## Composants

Pour chacun : **V** visuelle, **C** comportementale.

- **Bouton** (neutre, principal, danger, petit). V : neutre `--surface-3` contour `--bord-champ` ;
  principal `--accent` texte `--sur-accent` ; danger contour et texte `--danger` ; rayon
  `--rayon-champ`. Désactivé : opacité réduite **et** `aria-disabled`, jamais la teinte seule.
  C : atteignable à la tabulation, Entrée et Espace l'activent ; un bouton destructif porte le
  verbe et l'objet (« Retirer la section Apparence »), jamais « OK » ; pendant l'action, il
  affiche « … » et ne se déclenche pas deux fois.
- **Champ** (texte, zone de texte, liste). V : `--surface-2`, contour `--bord-champ`, rayon
  `--rayon-champ`. C : une étiquette visible liée au champ ; l'erreur s'affiche sous le champ, en
  `--danger` avec le mot « Erreur » devant, reliée par `aria-describedby`.
- **Pastille de rôle / d'audience** (MJ, Joueur, « MJ seul », « lue des joueurs »). V : fond
  `--mj-fond` + texte `--mj`, ou `--table-fond` + `--table`, rayon pastille. C : l'état est dit par
  **mot + teinte**, jamais la teinte seule ; même teinte pour le même sens sur tous les écrans.
- **Panneau** (une section de fiche, un bloc d'écran). V : `--surface`, bord `--bord`, rayon
  `--rayon-panneau` ; un panneau réservé au MJ porte un liseré `--mj` à gauche et le mot « MJ
  seul ». C : un panneau est un `section` titré (`h2`) ; son titre est lu par un lecteur d'écran.
- **Barre latérale.** V : `--fond-lateral`, item actif `--accent-fond` + `--accent-texte` ; sur
  téléphone elle devient un tiroir sous un bouton « Menu ». C : navigation `nav` ; l'item actif a
  `aria-current="page"` ; le tiroir se ferme à Échap et rend le focus à « Menu » ; un item dont
  l'écran n'est pas proposé au rôle n'est pas affiché.
- **Bascule MJ / Joueur** (mode Joueur de la fiche). V : deux segments, l'actif en `--mj-fond`
  (mode MJ) ou `--table-fond` (mode Joueur). C : groupe de deux boutons radio ; le changement est
  annoncé (« Mode Joueur : vous voyez ce que voit un joueur »).
- **Bandeau** (mode bouchon, connexion perdue). V : pleine largeur, `--danger-fond` pour la
  connexion perdue, `--mj-fond` pour le mode bouchon. C : `role="status"` ; non fermable ; texte
  exact dans `docs/ecrans.md`.
- **Panneau d'assistant** (E-12). V : un bouton flottant « Demander à Kanevas » en `--accent` /
  `--sur-accent`, rayon pastille, en bas à droite ; le panneau en `--fond-lateral`, bord gauche
  `--bord-champ`, 380 px, plein écran sous 760 px ; message de la personne `--surface-3`, réponse
  `--surface` avec bord `--bord` ; bloc « Écrit par l'assistant » : `--surface-2`, liseré `--accent`,
  le mot « Écrit par l'assistant » en `--accent-texte` ; erreur : `--danger-fond` et `--danger`.
  C : le bouton est atteignable à la tabulation et porte `aria-expanded` ; le panneau est un
  `complementary` titré (`h2`) ; à l'ouverture le focus va au champ, Échap ferme et rend le focus au
  bouton ; une nouvelle réponse est annoncée (`role="log"`, `aria-live="polite"`) ; « Kanevas
  réfléchit… » est un `role="status"` ; l'erreur un `role="alert"` ; l'état indisponible désactive
  le champ **et** dit pourquoi. Le bouton ne masque jamais un champ ou un bouton de l'écran : le
  contenu garde une marge basse de la hauteur du bouton. Aucun état par la teinte seule.
- **Fenêtre** (créer une fiche). V : `--surface` sur voile ; C : `role="dialog"`, le focus y
  entre et y reste, Échap ferme, le focus revient au bouton qui l'a ouverte.
- **État d'écran** (vide, chargement, erreur, refus). V : un bloc centré, texte `--texte-2`, un
  titre, une action. C : chargement `role="status"` ; erreur `role="alert"` avec le bouton
  « Réessayer ».

## Seuils

Plancher : WCAG 2.2 AA (4,5:1 texte ; 3:1 grand texte et non textuel). Mesuré avec
`contraste.py` de la skill `charte-graphique`.

| Premier plan | Fond | Thème | Ratio | Seuil | |
|---|---|---|---|---|---|
| `--texte` | `--surface` | sombre / clair | 15,77 / 17,30 | 4,5 | ok |
| `--texte-2` | `--surface` | sombre / clair | 6,84 / 8,88 | 4,5 | ok |
| `--texte-3` | `--surface` | sombre / clair | 5,35 / 5,84 | 4,5 | ok |
| `--texte-3` | `--surface-2` | sombre | 4,94 | 4,5 | ok |
| `--texte-3` | `--fond` | sombre / clair | 5,86 / 5,26 (sur `#f4f3f0`) | 4,5 | ok |
| `--texte-3` | `--fond-lateral` | clair | 4,81 | 4,5 | ok |
| `--sur-accent` | `--accent` | sombre / clair | 5,56 / 6,99 | 4,5 | ok |
| `--accent-texte` | `--surface` | sombre / clair | 7,67 / 6,99 | 4,5 | ok |
| `--accent-texte` | `--accent-fond` sur `--surface` | sombre / clair | 6,14 / 5,79 | 4,5 | ok |
| `--mj` | `--surface` | sombre / clair | 8,32 / 6,68 | 4,5 | ok |
| `--mj` | `--mj-fond` sur `--surface` | sombre / clair | 6,40 / 6,04 | 4,5 | ok |
| `--table` | `--surface` | sombre / clair | 8,13 / 5,70 | 4,5 | ok |
| `--table` | `--table-fond` sur `--surface` | sombre / clair | 6,29 / 4,65 | 4,5 | ok |
| `--danger` | `--surface` | sombre / clair | 6,30 / 6,26 | 4,5 | ok |
| `--danger` | `--danger-fond` sur `--surface` | sombre / clair | 5,25 / 5,35 | 4,5 | ok |
| `--bord-champ` | `--surface-2` / `--surface` | sombre / clair | 3,78 / 3,70 | 3 | ok |
| `--focus` | `--fond` | sombre / clair | 8,41 / 6,99 | 3 | ok |

Autres seuils tenus par construction : l'anneau de focus (2 px, `--focus`) n'est jamais retiré
sans remplacement (2.4.7) ; le focus n'est jamais masqué par la barre latérale ou un bandeau
(2.4.11, le contenu défile sous un bandeau collant avec un `scroll-padding`) ; toute cible fait
au moins 24 × 24 px CSS, 40 px de haut sur téléphone (2.5.8) ; aucun état ne repose sur la couleur
seule (1.4.1).

`--texte-3` n'est jamais posé sur `--surface-3` (4,39:1, sous le seuil) : le texte d'un bouton
neutre est en `--texte`.

## Écarts assumés

Aucun sous un seuil. Le thème clair des maquettes du cadrage n'existait pas : les valeurs claires
ci-dessus sont posées avec cette charte.
