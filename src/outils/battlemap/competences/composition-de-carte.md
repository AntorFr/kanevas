# Compétence : composition de carte

Vous composez une carte **avec les assets de la bibliothèque**, jamais avec des assets que vous imaginez. Le retouchage fin est l'affaire du MJ, dans l'éditeur.

## Conventions

- Tout se compte en **cases**. L'origine est le coin **haut-gauche** ; x va vers la droite, y vers le bas.
- Une carte de L × H cases a des cases de 0 à L − 1 et de 0 à H − 1.
- Un **mur est posé sur le bord d'une case** : le côté `"h"` est le bord haut de la case (x, y), le côté `"v"` son bord gauche. Les bords du bas et de droite de la carte sont donc y = H (côté `"h"`) et x = L (côté `"v"`).
- Une pièce de l × h cases à partir de (x0, y0) a quatre murs : bord haut `"h"` en y0 pour x de x0 à x0 + l − 1, bord bas `"h"` en y0 + h, bord gauche `"v"` en x0 pour y de y0 à y0 + h − 1, bord droit `"v"` en x0 + l.
- Les calques, dans l'ordre : **Sol**, **Murs**, **Objets**. Une commande vise le calque de son genre, par son identifiant.

## Déroulé

1. Lisez la direction artistique (`bm_lire_direction`) et la bibliothèque (`bm_lister_assets`). **N'inventez jamais un identifiant d'asset** : prenez ceux de la liste, par catégorie et par empreinte (un sol pour `peindre_sol`, un mur pour `tracer_mur`, un objet ou un décor pour `poser_element`).
2. Créez la carte avec `bm_creer_carte` : elle est cachée aux joueurs, **le MJ la montre lui-même**. Notez la version et les identifiants des calques rendus.
3. Appliquez les commandes avec `bm_appliquer_commandes`, **par paquets de 200 au plus**, en redonnant la version rendue par le paquet précédent. Un paquet est appliqué en entier ou refusé en entier ; une phrase dit pourquoi.
4. Relisez la carte avec `bm_lire_carte` et vérifiez qu'elle est conforme à la demande.
5. Si un asset manque (« une cuisine » sans asset de cuisine), **construisez le reste sans lui et dites-le** dans votre réponse (« Il manque un asset de cuisine »). Le MJ pourra le faire générer.

## Les commandes

La liste est fermée. Chaque commande est un objet avec son `"type"`.

- `peindre_sol` : `{"type":"peindre_sol","calque":"sol","cellules":[{"x":0,"y":0},{"x":1,"y":0}],"asset_id":"12"}`
- `tracer_mur` : `{"type":"tracer_mur","calque":"murs","segments":[{"x":0,"y":0,"cote":"h"}],"asset_id":"7"}`
- `poser_porte` : `{"type":"poser_porte","calque":"murs","x":3,"y":0,"cote":"h","porte":true}` (transforme un mur déjà tracé en porte)
- `poser_element` : `{"type":"poser_element","id":"caisse-1","calque":"objets","asset_id":"31","x":2.5,"y":3.5,"rotation":0,"miroir":false,"echelle":1}` (l'identifiant de l'élément est de votre choix et unique sur la carte)
- `deplacer_element` : `{"type":"deplacer_element","id":"caisse-1","x":4,"y":3}`
- `pivoter_element` : `{"type":"pivoter_element","id":"caisse-1","rotation":90}` (0, 90, 180 ou 270)
- `supprimer_element` : `{"type":"supprimer_element","id":"caisse-1"}`
- `gommer` : `{"type":"gommer","calque":"sol","cellules":[{"x":0,"y":0}],"segments":[]}`
- `lier_fiche` : `{"type":"lier_fiche","id":"caisse-1","fiche_id":"42"}`
- `creer_calque` : `{"type":"creer_calque","id":"secret","nom":"Secret","genre":"objet","mj_seul":true}` (genre : sol, mur ou objet)
- `renommer_calque` : `{"type":"renommer_calque","id":"secret","nom":"Pièges"}`
- `regler_calque` : `{"type":"regler_calque","id":"secret","visible":true,"verrouille":false,"mj_seul":true}`
- `ordonner_calque` : `{"type":"ordonner_calque","id":"secret","index":1}`
- `supprimer_calque` : `{"type":"supprimer_calque","id":"secret"}`
- `redimensionner` : `{"type":"redimensionner","largeur":40,"hauteur":30}`
- `retourner_element` : `{"type":"retourner_element","id":"caisse-1","miroir":true}`
- `mettre_a_echelle` : `{"type":"mettre_a_echelle","id":"caisse-1","echelle":1.5}` (de 0,25 à 4)
- `dupliquer_elements` : `{"type":"dupliquer_elements","ids":["caisse-1"],"nouveaux_ids":["caisse-2"],"dx":1,"dy":0}`

## Bonnes pratiques

- Une pièce : sol d'abord, murs ensuite, objets en dernier, dans des paquets séparés ou dans l'ordre du même paquet.
- Respectez l'empreinte d'un asset : un objet de 2 × 1 cases ne se pose pas contre un mur sans lui laisser la place.
- Ne retouchez pas ce que le MJ a placé : une retouche est son geste.
- Répondez en français : ce que contient la carte, ce qui manque, et que la carte est cachée aux joueurs jusqu'à ce que le MJ la montre.
