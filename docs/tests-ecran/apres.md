# Screen suite duration — after the rewrite of the seven lots

Measured on the tip of the feature branch (`task/kanevas-tests-hors-ecran-assemblage`, commit `cfa650e8`, every lot
integrated, the inventory guard included), the same way as [`avant.md`](avant.md): `npm run tests:attestes`
(the declared suite: typecheck, build, every test file), then `node scripts/duree-tests-ecran.mjs resultats.tap --markdown`.

| | |
| --- | --- |
| Date | 2026-11-16, started 08:13 UTC |
| Machine | 13th Gen Intel Core i5-13500, 18 logical CPUs (pod), the same as `avant.md` |
| Test file concurrency | 2 (the default of `tests:attestes`) |
| Run | 4541 tests, 4541 pass, 0 fail, 0 skipped |
| Wall time of the whole run (all 4541 tests, `ℹ duration_ms`) | 2403 s (40.0 min) |
| Screen files (`src/e2e/*.test.ts`) | **256** (275 before, 19 removed, listed below) |
| **Total, sum of the screen files** | **3651.0 s (60.9 min)** |

## Before and after

| | Files | Total (s) | Total (min) |
| --- | ---: | ---: | ---: |
| `avant.md` | 275 | 4904.5 | 81.7 |
| `apres.md` | 256 | 3651.0 | 60.9 |
| Same 256 files, before (`avant.md` less the 19 removed files) | 256 | 4518.3 | 75.3 |

The 19 removed files weigh 386.2 s of the before total; the other 256 files went from 4518.3 s to 3651.0 s
(−867.3 s, −19 %), and the whole sum from 4904.5 s to 3651.0 s (−1253.5 s, −26 %). The whole run's wall time went
from 2858 s (47.6 min, 4460 tests) to 2403 s (40.0 min, 4541 tests): the tests carried over to their doors
(`src/routes/`, `src/services/`) now play in the non-screen files, which are not in this sum. Both measures are one
run each, on a pod: a file's figure moves by some seconds from one run to the next, and a title declared by several files is split evenly (14 such
entries here, 6 before), so read the totals, not a single file.

## The 19 removed files

Every test of these files has the decision `retiré` in the inventory of its lot, its door being green.
Duration before (`avant.md`):

| File | Before (s) | Lot inventory |
| --- | ---: | --- |
| `src/e2e/connexion-cause-besoin.test.ts` | 2.9 | `lot-acces.md` |
| `src/e2e/import-fichiers-attente-mediatheque.test.ts` | 1.6 | `lot-acces.md` |
| `src/e2e/import-fil-complements.test.ts` | 0.9 | `lot-acces.md` |
| `src/e2e/jeton-assistant-connexion-id.test.ts` | 10.1 | `lot-acces.md` |
| `src/e2e/monde-besoin-api.test.ts` | 4.3 | `lot-ecrans.md` |
| `src/e2e/monde-mode-joueur.test.ts` | 3.4 | `lot-ecrans.md` |
| `src/e2e/natures-ensemble-complements.test.ts` | 5.4 | `lot-outils.md` |
| `src/e2e/natures-ensemble-import.test.ts` | 3.1 | `lot-outils.md` |
| `src/e2e/natures-ensemble-migration.test.ts` | 1.6 | `lot-outils.md` |
| `src/e2e/outils-cadre-assistant-besoin.test.ts` | 1.6 | `lot-outils.md` |
| `src/e2e/outils-catalogue-ensemble-verif.test.ts` | 45.6 | `lot-outils.md` |
| `src/e2e/rattrapage-migration-main.test.ts` | 1.8 | `lot-aventures.md` |
| `src/e2e/vaisseaux-ecarts-ensemble-api.test.ts` | 52.2 | `lot-vaisseaux.md` |
| `src/e2e/vaisseaux-effets-ensemble-api.test.ts` | 63.9 | `lot-vaisseaux.md` |
| `src/e2e/vaisseaux-ensemble-api.test.ts` | 45.5 | `lot-vaisseaux.md` |
| `src/e2e/vaisseaux-ensemble-assistant.test.ts` | 1.8 | `lot-vaisseaux.md` |
| `src/e2e/vaisseaux-fiches-ensemble-api.test.ts` | 54.4 | `lot-vaisseaux.md` |
| `src/e2e/vaisseaux-regles-livre-ensemble-api.test.ts` | 43.2 | `lot-vaisseaux.md` |
| `src/e2e/vaisseaux-suite-ensemble-api.test.ts` | 42.9 | `lot-vaisseaux.md` |

## Per file

| File | Duration (s) | Result |
| --- | ---: | --- |
| `src/e2e/acces-api-alignement.test.ts` | 0.0 | ok |
| `src/e2e/acces-api-jeton-mentions-390.test.ts` | 2.7 | ok |
| `src/e2e/acces-api-jetons-date-ensemble.test.ts` | 4.4 | ok |
| `src/e2e/acces-api-relation-nature.test.ts` | 1.5 | ok |
| `src/e2e/accueil-cartes-largeur.test.ts` | 1.9 | ok |
| `src/e2e/accueil-refonte.test.ts` | 6.7 | ok |
| `src/e2e/administration-badge-entete.test.ts` | 15.8 | ok |
| `src/e2e/administration-besoin.test.ts` | 21.9 | ok |
| `src/e2e/administration-bords-reprise.test.ts` | 10.3 | ok |
| `src/e2e/administration-exclusions.test.ts` | 17.3 | ok |
| `src/e2e/administration-formulaire-390.test.ts` | 8.1 | ok |
| `src/e2e/administration-formulaire-telephone.test.ts` | 10.9 | ok |
| `src/e2e/administration-ordre.test.ts` | 4.8 | ok |
| `src/e2e/administration.test.ts` | 60.0 | ok |
| `src/e2e/alias-etiquettes-e9.test.ts` | 5.5 | ok |
| `src/e2e/arbre-ensemble-besoin.test.ts` | 9.7 | ok |
| `src/e2e/arbre-ensemble-complements.test.ts` | 8.0 | ok |
| `src/e2e/arbre-fiche-critere.test.ts` | 10.9 | ok |
| `src/e2e/arbre-fiche-pied-alerte-bascule.test.ts` | 9.9 | ok |
| `src/e2e/arbre-fiche-visuel.test.ts` | 6.4 | ok |
| `src/e2e/arbre-fil-390-chevrons.test.ts` | 2.9 | ok |
| `src/e2e/arbre-liste-critere.test.ts` | 5.8 | ok |
| `src/e2e/assistant-besoins.test.ts` | 39.6 | ok |
| `src/e2e/assistant-ecran.test.ts` | 56.5 | ok |
| `src/e2e/assistant-image-ecran.test.ts` | 12.3 | ok |
| `src/e2e/aventure-fiche-statut-critere.test.ts` | 8.5 | ok |
| `src/e2e/aventures-liste-critere.test.ts` | 10.7 | ok |
| `src/e2e/aventures-suivi-bilan.test.ts` | 7.9 | ok |
| `src/e2e/aventures-suivi-blocs.test.ts` | 7.7 | ok |
| `src/e2e/aventures-suivi-bords-ensemble.test.ts` | 6.3 | ok |
| `src/e2e/aventures-suivi-critere.test.ts` | 6.0 | ok |
| `src/e2e/aventures-suivi-ecrans.test.ts` | 11.5 | ok |
| `src/e2e/aventures-suivi-ensemble.test.ts` | 27.2 | ok |
| `src/e2e/aventures-suivi-lots-e18.test.ts` | 3.1 | ok |
| `src/e2e/aventures-type-ensemble.test.ts` | 25.6 | ok |
| `src/e2e/barre-droits.test.ts` | 11.0 | ok |
| `src/e2e/besoins-ensemble.test.ts` | 107.9 | ok |
| `src/e2e/besoins-relier-chercher.test.ts` | 41.4 | ok |
| `src/e2e/bloc-relations.test.ts` | 14.5 | ok |
| `src/e2e/cadre-tiroir-court.test.ts` | 23.8 | ok |
| `src/e2e/cadre-univers.test.ts` | 13.4 | ok |
| `src/e2e/carte-illustree-ecran.test.ts` | 15.8 | ok |
| `src/e2e/cartes-ecran.test.ts` | 10.9 | ok |
| `src/e2e/cartes-formulaire.test.ts` | 2.8 | ok |
| `src/e2e/cartes-graphes-besoin.test.ts` | 54.6 | ok |
| `src/e2e/cartes-graphes-critere.test.ts` | 8.8 | ok |
| `src/e2e/cartes-graphes-verification.test.ts` | 13.5 | ok |
| `src/e2e/composants-clavier.test.ts` | 20.4 | ok |
| `src/e2e/comptes-rendus-plafond.test.ts` | 4.3 | ok |
| `src/e2e/connexion-bouchon.test.ts` | 9.3 | ok |
| `src/e2e/connexion-claude-com.test.ts` | 7.0 | ok |
| `src/e2e/connexion-code-long-ensemble.test.ts` | 8.1 | ok |
| `src/e2e/creer-univers-apercu.test.ts` | 2.3 | ok |
| `src/e2e/demarrage-suite-besoin.test.ts` | 3.2 | ok |
| `src/e2e/deplacer-arborescence-boite.test.ts` | 19.9 | ok |
| `src/e2e/deplacer-arborescence-deplacement-echecs.test.ts` | 8.7 | ok |
| `src/e2e/deplacer-arborescence-ensemble-besoin.test.ts` | 18.9 | ok |
| `src/e2e/diagnostic-besoin.test.ts` | 44.3 | ok |
| `src/e2e/disparu-ecran-390.test.ts` | 35.4 | ok |
| `src/e2e/disparu-ecran-critere.test.ts` | 46.5 | ok |
| `src/e2e/disparu-ensemble-verification.test.ts` | 8.1 | ok |
| `src/e2e/etats.test.ts` | 19.2 | ok |
| `src/e2e/fiche-mj-seul-ecran-besoin.test.ts` | 8.4 | ok |
| `src/e2e/fiche-mj-seul-ensemble-besoin.test.ts` | 9.7 | ok |
| `src/e2e/fiche-mj-seul-ensemble-complements.test.ts` | 4.2 | ok |
| `src/e2e/fiche-mj-seul-mobile-besoin.test.ts` | 4.0 | ok |
| `src/e2e/fiche-refonte.test.ts` | 38.6 | ok |
| `src/e2e/fiche-toast-creation.test.ts` | 2.0 | ok |
| `src/e2e/fichiers-attente-illustration-390.test.ts` | 2.8 | ok |
| `src/e2e/fondations-visuelles.test.ts` | 2.5 | ok |
| `src/e2e/format-evolue-amendes-ensemble.test.ts` | 7.9 | ok |
| `src/e2e/format-evolue-masses-ensemble.test.ts` | 16.1 | ok |
| `src/e2e/format-evolue-routes-ensemble.test.ts` | 15.5 | ok |
| `src/e2e/format-zones-ensemble.test.ts` | 12.7 | ok |
| `src/e2e/galaxie-lire-ecran.test.ts` | 28.1 | ok |
| `src/e2e/galaxie-lire-ensemble-besoin.test.ts` | 39.1 | ok |
| `src/e2e/galaxie-lire-ensemble-complements.test.ts` | 34.5 | ok |
| `src/e2e/galaxie-tenir-ecran-forme.test.ts` | 7.0 | ok |
| `src/e2e/galaxie-tenir-ecran.test.ts` | 27.2 | ok |
| `src/e2e/galaxie-tenir-ensemble-besoin.test.ts` | 24.7 | ok |
| `src/e2e/galaxie-tenir-lot-rapport.test.ts` | 6.5 | ok |
| `src/e2e/galaxie-tenir-verif-besoin.test.ts` | 25.4 | ok |
| `src/e2e/galaxie-zone-hexagones-ecran.test.ts` | 12.8 | ok |
| `src/e2e/graphe-ecran.test.ts` | 9.6 | ok |
| `src/e2e/graphe-geometrie-traits.test.ts` | 4.3 | ok |
| `src/e2e/harnais-attendre.test.ts` | 82.6 | ok |
| `src/e2e/harnais-besoin-ensemble.test.ts` | 41.3 | ok |
| `src/e2e/harnais-concurrence.test.ts` | 4.9 | ok |
| `src/e2e/harnais-diagnostic.test.ts` | 1.1 | ok |
| `src/e2e/harnais-garde-fous.test.ts` | 0.1 | ok |
| `src/e2e/harnais-sans-delai.test.ts` | 0.0 | ok |
| `src/e2e/harnais.test.ts` | 0.0 | ok |
| `src/e2e/healthz.test.ts` | 5.7 | ok |
| `src/e2e/icones-marque-besoin.test.ts` | 2.7 | ok |
| `src/e2e/illustration-ecrans.test.ts` | 7.7 | ok |
| `src/e2e/illustrations-systemes-besoin-etats.test.ts` | 19.8 | ok |
| `src/e2e/illustrations-systemes-besoin.test.ts` | 7.5 | ok |
| `src/e2e/images-besoin.test.ts` | 56.0 | ok |
| `src/e2e/images-echec-message.test.ts` | 3.5 | ok |
| `src/e2e/import-assistant-besoin.test.ts` | 4.0 | ok |
| `src/e2e/import-fichiers-besoin.test.ts` | 9.4 | ok |
| `src/e2e/import-fichiers-verification.test.ts` | 3.9 | ok |
| `src/e2e/import-fil-besoin.test.ts` | 19.5 | ok |
| `src/e2e/import-fil-recette.test.ts` | 11.9 | ok |
| `src/e2e/jeton-assistant-besoin.test.ts` | 44.6 | ok |
| `src/e2e/jeton-assistant-panneau.test.ts` | 40.5 | ok |
| `src/e2e/liees-bloc-besoin-ensemble.test.ts` | 18.7 | ok |
| `src/e2e/liees-bloc-mode-joueur-ecran.test.ts` | 7.0 | ok |
| `src/e2e/liees-bloc-rafraichissement-besoin.test.ts` | 5.6 | ok |
| `src/e2e/liees-bloc-revue.test.ts` | 39.4 | ok |
| `src/e2e/liees-bloc-types-lents-besoin.test.ts` | 9.3 | ok |
| `src/e2e/liees-bloc-types-tardifs.test.ts` | 3.9 | ok |
| `src/e2e/liees-vignette-geometrie.test.ts` | 1.8 | ok |
| `src/e2e/liens-ecran-besoin.test.ts` | 13.5 | ok |
| `src/e2e/liens-ecran-liste-et-enregistrer.test.ts` | 3.9 | ok |
| `src/e2e/liens-ecran-maquette-blocs.test.ts` | 4.5 | ok |
| `src/e2e/liens-ecran-mise-en-page.test.ts` | 7.9 | ok |
| `src/e2e/liens-ensemble-besoin.test.ts` | 10.8 | ok |
| `src/e2e/markdown-editeur.test.ts` | 11.1 | ok |
| `src/e2e/markdown-ensemble-besoin.test.ts` | 5.1 | ok |
| `src/e2e/markdown-lecture.test.ts` | 5.5 | ok |
| `src/e2e/mediatheque-besoin-echecs-assistant.test.ts` | 12.6 | ok |
| `src/e2e/mediatheque-besoin-ensemble-reprise.test.ts` | 4.2 | ok |
| `src/e2e/mediatheque-besoin-verification.test.ts` | 40.4 | ok |
| `src/e2e/mediatheque-cadre-unique.test.ts` | 2.5 | ok |
| `src/e2e/mediatheque-critere-migration.test.ts` | 2.0 | ok |
| `src/e2e/mediatheque-critere-sortie.test.ts` | 5.4 | ok |
| `src/e2e/mediatheque-declencheur-joindre-style.test.ts` | 1.3 | ok |
| `src/e2e/mediatheque-declencheur-joindre.test.ts` | 1.6 | ok |
| `src/e2e/mediatheque-ecran-reprise.test.ts` | 3.4 | ok |
| `src/e2e/mediatheque-ecran.test.ts` | 9.0 | ok |
| `src/e2e/mediatheque-ensemble-bords-exclusions.test.ts` | 9.7 | ok |
| `src/e2e/mediatheque-ensemble-insertion-menu-illustration.test.ts` | 8.1 | ok |
| `src/e2e/mediatheque-ensemble.test.ts` | 19.6 | ok |
| `src/e2e/mediatheque-envoi-coupe-besoin.test.ts` | 2.5 | ok |
| `src/e2e/mediatheque-fiche-ferme.test.ts` | 3.4 | ok |
| `src/e2e/mediatheque-fiche-selecteur.test.ts` | 6.8 | ok |
| `src/e2e/mediatheque-fiche.test.ts` | 11.0 | ok |
| `src/e2e/mediatheque-panneau-document.test.ts` | 4.4 | ok |
| `src/e2e/mediatheque-relu-besoin.test.ts` | 30.2 | ok |
| `src/e2e/mediatheque-reverification.test.ts` | 2.7 | ok |
| `src/e2e/mediatheque-tuile-document-reserve.test.ts` | 4.1 | ok |
| `src/e2e/mediatheque-verification.test.ts` | 4.0 | ok |
| `src/e2e/membres-pastille-largeur.test.ts` | 3.1 | ok |
| `src/e2e/menu-compte-connexion-perdue.test.ts` | 2.9 | ok |
| `src/e2e/menu-compte-moi-en-echec.test.ts` | 2.6 | ok |
| `src/e2e/monde-aide.test.ts` | 0.0 | ok |
| `src/e2e/monde-besoin-ecran.test.ts` | 17.3 | ok |
| `src/e2e/natures-ensemble-besoin.test.ts` | 11.2 | ok |
| `src/e2e/natures-ensemble-semis.test.ts` | 3.3 | ok |
| `src/e2e/natures-reverification-ecrans.test.ts` | 8.6 | ok |
| `src/e2e/oidc-login.test.ts` | 16.4 | ok |
| `src/e2e/outils-barre-critere.test.ts` | 7.2 | ok |
| `src/e2e/outils-cadre-besoin.test.ts` | 24.9 | ok |
| `src/e2e/outils-catalogue-acces-api-critere.test.ts` | 11.9 | ok |
| `src/e2e/outils-catalogue-ecrans-verif.test.ts` | 25.2 | ok |
| `src/e2e/outils-catalogue-elements-critere.test.ts` | 13.1 | ok |
| `src/e2e/outils-catalogue-import-critere.test.ts` | 20.6 | ok |
| `src/e2e/outils-catalogue-libelles-reverif.test.ts` | 34.7 | ok |
| `src/e2e/outils-onglet-critere.test.ts` | 24.3 | ok |
| `src/e2e/outils-retrait-ensemble-besoin.test.ts` | 35.4 | ok |
| `src/e2e/outils-retrait-fenetre-ecran.test.ts` | 11.3 | ok |
| `src/e2e/outils-textes-vise-exige-ecran.test.ts` | 7.8 | ok |
| `src/e2e/panneau-mj-cadenas.test.ts` | 4.1 | ok |
| `src/e2e/parametres-gabarit-mj.test.ts` | 3.2 | ok |
| `src/e2e/parametres-systeme-besoin.test.ts` | 4.0 | ok |
| `src/e2e/pieces-jointes-besoin.test.ts` | 24.3 | ok |
| `src/e2e/pieces-jointes-complements.test.ts` | 12.7 | ok |
| `src/e2e/pieces-jointes-geometrie.test.ts` | 3.8 | ok |
| `src/e2e/pieces-jointes.test.ts` | 44.1 | ok |
| `src/e2e/plafond-sections.test.ts` | 5.3 | ok |
| `src/e2e/premiere-fiche.test.ts` | 21.5 | ok |
| `src/e2e/preuve-tests-declaree.test.ts` | 0.1 | ok |
| `src/e2e/proposition-ecran.test.ts` | 10.0 | ok |
| `src/e2e/rattrapage-doc.test.ts` | 0.0 | ok |
| `src/e2e/rattrapage-ensemble.test.ts` | 5.5 | ok |
| `src/e2e/recherche-avancee-ecran.test.ts` | 10.4 | ok |
| `src/e2e/recherche-e17-maquette.test.ts` | 4.3 | ok |
| `src/e2e/recherche-ensemble-verif.test.ts` | 27.6 | ok |
| `src/e2e/recherche-liee-besoin.test.ts` | 12.3 | ok |
| `src/e2e/recherche-liste.test.ts` | 10.3 | ok |
| `src/e2e/recours-admin-ensemble.test.ts` | 58.6 | ok |
| `src/e2e/recours-admin-reverification.test.ts` | 8.4 | ok |
| `src/e2e/refonte-audience-clavier.test.ts` | 3.3 | ok |
| `src/e2e/refonte-audience-hors-ligne.test.ts` | 4.2 | ok |
| `src/e2e/refonte-besoin.test.ts` | 45.2 | ok |
| `src/e2e/refonte-ensemble-complements.test.ts` | 9.2 | ok |
| `src/e2e/refonte-ensemble-regard.test.ts` | 12.7 | ok |
| `src/e2e/refonte-verification-telephone.test.ts` | 8.0 | ok |
| `src/e2e/reglages-membres-charte.test.ts` | 4.7 | ok |
| `src/e2e/reglages-membres-reessayer.test.ts` | 2.7 | ok |
| `src/e2e/reglages-rendu-mesure.test.ts` | 3.0 | ok |
| `src/e2e/reglages-toasts.test.ts` | 4.7 | ok |
| `src/e2e/relation-badge-pj-besoin.test.ts` | 3.4 | ok |
| `src/e2e/relation-badge-pj-ensemble.test.ts` | 3.9 | ok |
| `src/e2e/relation-badge-pj-verif.test.ts` | 5.6 | ok |
| `src/e2e/relation-badge-pj.test.ts` | 3.1 | ok |
| `src/e2e/relations-cible-personnage-besoin.test.ts` | 7.1 | ok |
| `src/e2e/relations-cible-personnage.test.ts` | 5.6 | ok |
| `src/e2e/relier-natures-ecran.test.ts` | 11.6 | ok |
| `src/e2e/reprise-besoin.test.ts` | 6.5 | ok |
| `src/e2e/revue-audience-fil.test.ts` | 6.1 | ok |
| `src/e2e/revue-ligne-relation-390.test.ts` | 6.5 | ok |
| `src/e2e/route-type-lien-ecran.test.ts` | 17.8 | ok |
| `src/e2e/secrets-ensemble-besoin.test.ts` | 8.0 | ok |
| `src/e2e/sections-gerees-bandeau-alerte-icones.test.ts` | 4.9 | ok |
| `src/e2e/sections-gerees-besoin-ensemble.test.ts` | 6.0 | ok |
| `src/e2e/sections-gerees-ecran.test.ts` | 12.6 | ok |
| `src/e2e/socle-rust-doc.test.ts` | 0.0 | ok |
| `src/e2e/socle-rust-ensemble.test.ts` | 23.9 | ok |
| `src/e2e/sous-type-dialogue-badge.test.ts` | 9.2 | ok |
| `src/e2e/sous-type-dialogue-boite.test.ts` | 11.1 | ok |
| `src/e2e/sous-type-dialogue-complements.test.ts` | 4.1 | ok |
| `src/e2e/sous-type-dialogue-ensemble.test.ts` | 33.0 | ok |
| `src/e2e/suivi-besoin-ensemble.test.ts` | 24.0 | ok |
| `src/e2e/suivi-collisions-css.test.ts` | 5.1 | ok |
| `src/e2e/suivi-migration-ensemble.test.ts` | 4.5 | ok |
| `src/e2e/systemes-ecrans.test.ts` | 17.7 | ok |
| `src/e2e/systemes-ensemble.test.ts` | 36.5 | ok |
| `src/e2e/taille-images-editeur-menu-etroit.test.ts` | 8.0 | ok |
| `src/e2e/taille-images-ensemble-besoin.test.ts` | 33.6 | ok |
| `src/e2e/taille-images-import-besoin.test.ts` | 1.8 | ok |
| `src/e2e/tenir-ensemble-besoin.test.ts` | 35.3 | ok |
| `src/e2e/tenir-fiche-ecran.test.ts` | 14.3 | ok |
| `src/e2e/tenir-univers-ecran.test.ts` | 5.8 | ok |
| `src/e2e/tenir-univers-maquette.test.ts` | 3.4 | ok |
| `src/e2e/tenir-univers-telephone-hauteurs.test.ts` | 5.4 | ok |
| `src/e2e/tenir-univers-telephone.test.ts` | 6.3 | ok |
| `src/e2e/theme-nulle-part-ailleurs.test.ts` | 14.3 | ok |
| `src/e2e/types-besoin-complements.test.ts` | 10.8 | ok |
| `src/e2e/types-besoin-verification.test.ts` | 18.7 | ok |
| `src/e2e/types-ecran-fiche-reprise.test.ts` | 6.1 | ok |
| `src/e2e/types-ecran-fiche.test.ts` | 12.0 | ok |
| `src/e2e/types-ecrans-lore.test.ts` | 10.1 | ok |
| `src/e2e/types-ecrans-reglage-mise-en-page.test.ts` | 4.6 | ok |
| `src/e2e/types-ecrans-reglage.test.ts` | 10.2 | ok |
| `src/e2e/vaisseaux-atelier-ecarts-review.test.ts` | 12.2 | ok |
| `src/e2e/vaisseaux-atelier-effets-review.test.ts` | 16.3 | ok |
| `src/e2e/vaisseaux-atelier-equipage-review.test.ts` | 46.2 | ok |
| `src/e2e/vaisseaux-atelier-livre-review.test.ts` | 8.5 | ok |
| `src/e2e/vaisseaux-atelier-suite-review.test.ts` | 8.7 | ok |
| `src/e2e/vaisseaux-ecarts-ensemble-ecran.test.ts` | 20.9 | ok |
| `src/e2e/vaisseaux-ecran-critere.test.ts` | 54.2 | ok |
| `src/e2e/vaisseaux-ecran-ecarts.test.ts` | 9.7 | ok |
| `src/e2e/vaisseaux-effets-ensemble-ecran.test.ts` | 25.1 | ok |
| `src/e2e/vaisseaux-ensemble-ecran.test.ts` | 36.0 | ok |
| `src/e2e/vaisseaux-fiches-ensemble-ecran.test.ts` | 32.5 | ok |
| `src/e2e/vaisseaux-fiches-ensemble-legendes.test.ts` | 3.1 | ok |
| `src/e2e/vaisseaux-regles-ecran-colonne.test.ts` | 10.5 | ok |
| `src/e2e/vaisseaux-regles-ecran-revue.test.ts` | 28.3 | ok |
| `src/e2e/vaisseaux-regles-ensemble.test.ts` | 15.4 | ok |
| `src/e2e/vaisseaux-regles-livre-ensemble-ecran.test.ts` | 21.0 | ok |
| `src/e2e/vaisseaux-reverification-liste-bandeau.test.ts` | 5.1 | ok |
| `src/e2e/vaisseaux-suite-ensemble-ecran.test.ts` | 22.7 | ok |
| `src/e2e/verif-refonte-besoin.test.ts` | 75.5 | ok |
| `src/e2e/wasm-navigateur.test.ts` | 0.7 | ok |
| **Total (256 files)** | **3651.0** | |

14 entries with a title declared by several files: duration split evenly.
