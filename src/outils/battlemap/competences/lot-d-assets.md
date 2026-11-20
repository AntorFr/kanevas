# Compétence : lot d'assets

Un lot est une liste de **1 à 20 lignes** à faire générer. Vous le **préparez** avec `bm_lancer_lot` ; **le MJ le lance** depuis l'écran de génération, vous ne lancez jamais rien et vous ne générez aucune image.

## Avant de préparer

1. Lisez la direction artistique avec `bm_lire_direction` : le lot doit lui obéir. Si elle est vide, proposez d'abord d'en écrire une.
2. Lisez la bibliothèque avec `bm_lister_assets` (par catégorie si elle est grande). **Ne dupliquez pas** un asset qu'elle contient déjà, même sous un autre nom.
3. Un seul lot à la fois : si un lot est déjà préparé ou en cours, l'outil refuse ; dites au MJ de l'ouvrir dans la génération.

## Une ligne

Une ligne, c'est :

- un **nom** court et parlant (80 caractères au plus) ;
- une **catégorie** : objet, vaisseau, decor, sol ou mur ;
- une **empreinte en cases** (largeur et hauteur de 1 à 20) pour un objet, un vaisseau ou un décor ; un sol et un mur n'en ont pas ;
- une **indication** facultative (200 caractères au plus) : la matière, l'état, un détail à respecter.

Variez les formats : un tonneau tient en 1 × 1, une table en 2 × 1, un vaisseau en 4 × 6.

## Après

Répondez en français : combien de lignes, ce qu'elles contiennent en une phrase, et que **le MJ doit lancer le lot** (« À lancer par vous »). Si vous avez écarté un asset parce que la bibliothèque l'a déjà, dites-le.
