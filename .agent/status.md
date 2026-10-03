# Status — kanevas

> MàJ : 2026-10-03

**État :** `feature/kanevas-premiere-fiche` assemblée (PR vers `main`, non fusionnée) : comptes, univers,
membres, fiches, sections et droits (`src/services/`, migration 0001), session et mode bouchon, routes
`/api`, frontend React (E-1 à E-4, E-8, E-9). Typecheck, build et 115 tests verts sous Node 22 ; la
commande du `CLAUDE.md` (Node 20 en conteneur) n'a pas pu tourner dans le pod (pas de Docker).
Carte et invariants : `ARCHITECTURE.md`.

**Pièges :**
- Aucun rendu n'a été vu au navigateur (pas de navigateur dans la chaîne) : la recette de Monsieur
  est la première vraie vue des écrans.
- La CI ne pousse d'image que sur `main` et sur un tag `v*` ; sur `feature/*` la PR ne fait qu'un
  build de validation. L'image testable n'existe qu'après le tag (posé à la fusion) ; `k8s-home-lab`
  épingle ce tag.
- `docker build` n'a jamais tourné dans les pods de la chaîne : le premier vrai build est celui de la CI.
- P-7 : seule l'écriture du joueur sur sa section est livrée ; portrait (`kanevas-fichiers`) et demande
  à l'assistant (`kanevas-assistant-membre`) restent aux tranches suivantes.

**Suivant :** relations et recherche (`kanevas-relier-chercher`), pièces jointes, campagnes, administration.
