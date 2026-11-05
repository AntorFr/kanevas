# Kanevas — icône Marge

Variante 01 « Encre & papier », reconstruite en vectoriel depuis la piste retenue.
Le montant pervenche matérialise la marge ; les deux branches blanc cassé composent le K.
Les aplats remplacent les variations de matière de la planche exploratoire.

## Palette

| Couleur | HEX | RGB | Usage |
|---|---|---|---|
| Encre | #121317 | 18, 19, 23 | Fond principal |
| Pervenche | #8B9BF0 | 139, 155, 240 | Marge verticale |
| Papier | #FCFCFD | 252, 252, 253 | Branches du K |

Couleurs sRGB issues des neutres et de l’accent de la charte. Aucune modification des tokens du produit.

## Fichiers

- `svg/` : sources vectorielles, sans police ni ressource externe.
- `png/` : PNG RGBA en 16, 24, 32, 48, 64, 128, 256, 512 et 1024 px pour chaque variante ; WebP sans perte et JPEG 1024 px de l’icône principale.
- `print/` : PDF et EPS vectoriels de chaque variante, en RGB. Pour une impression CMJN, convertir avec le profil de l’imprimeur.
- `web/` : favicon SVG et ICO multi-résolutions (16 à 256 px), Apple Touch 180 px opaque, icônes 192 et 512 px opaques, icône maskable 512 px et manifeste d’icônes.
- `desktop/` : ICNS macOS multi-résolutions.
- `scripts/export.py` : génération reproductible avec Python, CairoSVG et Pillow.
- `../kanevas-marge.zip` : archive du pack complet.

`kanevas-icon` est la version principale sur carré encre arrondi (coins extérieurs transparents).
`kanevas-symbol` conserve les deux couleurs sans carré de fond : à employer sur fond sombre.
`kanevas-on-light` est la variante sur fond papier, avec branches encre.
`kanevas-mono-dark` et `kanevas-mono-white` sont des symboles monochromes sur fond transparent.
Le JPEG est aplati sur papier ; privilégier SVG ou PNG pour préserver la transparence.

## Utilisation

Privilégier le SVG pour une taille libre. Pour une petite icône raster, choisir la taille native
ou une définition double pour un écran haute densité. Minimum conseillé : 16 px ;
24 px ou plus conserve mieux la séparation entre la marge et les branches.
Conserver les proportions, les aplats et les espaces internes ; ne pas ajouter de contour,
d’ombre ou de dégradé. Pour un symbole isolé, laisser autour une zone libre d’au moins
la largeur de sa marge verticale. Les PDF/EPS ont un plan de travail carré, sans fond perdu.

Les variantes web mobiles ont volontairement un fond carré opaque : le système applique
son propre masque. L’export maskable réduit le symbole dans la zone sûre centrale.

### Exemple d’intégration web

Copier le contenu de `web/` vers un emplacement public puis adapter les chemins :

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
```

Le manifeste livré contient seulement le nom et les icônes ; le compléter avec les réglages
de l’application si une PWA est souhaitée. Le pack est livré comme ressource de charte :
l’interface et le HTML de l’application n’ont pas été modifiés.

## Régénération

```sh
python3 -m venv /tmp/kanevas-brand-venv
/tmp/kanevas-brand-venv/bin/pip install cairosvg pillow
/tmp/kanevas-brand-venv/bin/python assets/brand/kanevas-marge/scripts/export.py
```
