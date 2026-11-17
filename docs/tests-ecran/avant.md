# Screen suite duration — before any rewrite

Measured on the state of `main` plus the `methode` task (no screen test touched), commit `0e1215c8` of the
feature branch base, by `npm run tests:attestes` (the declared suite: typecheck, build, every test file).

| | |
| --- | --- |
| Date | 2026-11-15, started 21:28 UTC |
| Machine | 13th Gen Intel Core i5-13500, 18 logical CPUs (pod) |
| Test file concurrency | 2 (the default of `tests:attestes`) |
| Run | 4460 tests, 4460 pass, 0 fail, 0 skipped |
| Wall time of the whole run (all 4460 tests, `ℹ duration_ms`) | 2858 s (47.6 min) |
| Screen files (`src/e2e/*.test.ts`) | **275** (the plan said 274; `src/e2e/fixtures/` holds no test file) |
| **Total, sum of the screen files** | **4904.5 s (81.7 min)** |

The total is the **work** of the screen files (the sum of their durations), not the wall time of the run:
two files run at a time, so the wall time is about half. `avant` and `apres` are compared on this same
total, with the same concurrence.

How it is read: `node scripts/duree-tests-ecran.mjs resultats.tap --markdown`. Node's `tap` reporter
names no file, so a file's duration is the sum of the top-level report entries whose title the file
declares (literal title, or a `${…}` template read as a pattern). Six entries have a title declared by
several files and are split evenly. Five files show 0.0 s because they hold no timed browser test:
`monde-aide` (shared helpers, no test of its own), `harnais`, `rattrapage-doc` and `socle-rust-doc`
(document checks, a few ms), and `acces-api-alignement` (its tests are declared through a helper, so its
title cannot be read: its time is not attributed and is missing from the total).

## Per file

| File | Duration (s) | Result |
| --- | ---: | --- |
| `src/e2e/acces-api-alignement.test.ts` | 0.0 | ok |
| `src/e2e/acces-api-jeton-mentions-390.test.ts` | 3.5 | ok |
| `src/e2e/acces-api-jetons-date-ensemble.test.ts` | 5.9 | ok |
| `src/e2e/acces-api-relation-nature.test.ts` | 2.2 | ok |
| `src/e2e/accueil-cartes-largeur.test.ts` | 2.9 | ok |
| `src/e2e/accueil-refonte.test.ts` | 9.4 | ok |
| `src/e2e/administration-badge-entete.test.ts` | 23.7 | ok |
| `src/e2e/administration-besoin.test.ts` | 28.9 | ok |
| `src/e2e/administration-bords-reprise.test.ts` | 23.3 | ok |
| `src/e2e/administration-exclusions.test.ts` | 24.9 | ok |
| `src/e2e/administration-formulaire-390.test.ts` | 9.4 | ok |
| `src/e2e/administration-formulaire-telephone.test.ts` | 14.4 | ok |
| `src/e2e/administration-ordre.test.ts` | 6.9 | ok |
| `src/e2e/administration.test.ts` | 76.7 | ok |
| `src/e2e/alias-etiquettes-e9.test.ts` | 7.4 | ok |
| `src/e2e/arbre-ensemble-besoin.test.ts` | 12.9 | ok |
| `src/e2e/arbre-ensemble-complements.test.ts` | 7.6 | ok |
| `src/e2e/arbre-fiche-critere.test.ts` | 12.2 | ok |
| `src/e2e/arbre-fiche-pied-alerte-bascule.test.ts` | 10.5 | ok |
| `src/e2e/arbre-fiche-visuel.test.ts` | 7.9 | ok |
| `src/e2e/arbre-fil-390-chevrons.test.ts` | 2.8 | ok |
| `src/e2e/arbre-liste-critere.test.ts` | 6.3 | ok |
| `src/e2e/assistant-besoins.test.ts` | 41.5 | ok |
| `src/e2e/assistant-ecran.test.ts` | 56.5 | ok |
| `src/e2e/assistant-image-ecran.test.ts` | 14.4 | ok |
| `src/e2e/aventure-fiche-statut-critere.test.ts` | 8.9 | ok |
| `src/e2e/aventures-liste-critere.test.ts` | 12.1 | ok |
| `src/e2e/aventures-suivi-bilan.test.ts` | 8.2 | ok |
| `src/e2e/aventures-suivi-blocs.test.ts` | 8.5 | ok |
| `src/e2e/aventures-suivi-bords-ensemble.test.ts` | 6.3 | ok |
| `src/e2e/aventures-suivi-critere.test.ts` | 6.4 | ok |
| `src/e2e/aventures-suivi-ecrans.test.ts` | 10.8 | ok |
| `src/e2e/aventures-suivi-ensemble.test.ts` | 26.6 | ok |
| `src/e2e/aventures-suivi-lots-e18.test.ts` | 3.0 | ok |
| `src/e2e/aventures-type-ensemble.test.ts` | 24.4 | ok |
| `src/e2e/barre-droits.test.ts` | 13.4 | ok |
| `src/e2e/besoins-ensemble.test.ts` | 116.1 | ok |
| `src/e2e/besoins-relier-chercher.test.ts` | 42.5 | ok |
| `src/e2e/bloc-relations.test.ts` | 13.5 | ok |
| `src/e2e/cadre-tiroir-court.test.ts` | 21.9 | ok |
| `src/e2e/cadre-univers.test.ts` | 13.4 | ok |
| `src/e2e/carte-illustree-ecran.test.ts` | 16.0 | ok |
| `src/e2e/cartes-ecran.test.ts` | 11.5 | ok |
| `src/e2e/cartes-formulaire.test.ts` | 3.5 | ok |
| `src/e2e/cartes-graphes-besoin.test.ts` | 61.9 | ok |
| `src/e2e/cartes-graphes-critere.test.ts` | 9.1 | ok |
| `src/e2e/cartes-graphes-verification.test.ts` | 15.4 | ok |
| `src/e2e/composants-clavier.test.ts` | 21.5 | ok |
| `src/e2e/comptes-rendus-plafond.test.ts` | 4.6 | ok |
| `src/e2e/connexion-bouchon.test.ts` | 10.8 | ok |
| `src/e2e/connexion-cause-besoin.test.ts` | 2.9 | ok |
| `src/e2e/connexion-claude-com.test.ts` | 15.5 | ok |
| `src/e2e/connexion-code-long-ensemble.test.ts` | 7.3 | ok |
| `src/e2e/creer-univers-apercu.test.ts` | 2.2 | ok |
| `src/e2e/demarrage-suite-besoin.test.ts` | 2.8 | ok |
| `src/e2e/deplacer-arborescence-boite.test.ts` | 19.3 | ok |
| `src/e2e/deplacer-arborescence-deplacement-echecs.test.ts` | 9.3 | ok |
| `src/e2e/deplacer-arborescence-ensemble-besoin.test.ts` | 17.0 | ok |
| `src/e2e/diagnostic-besoin.test.ts` | 44.6 | ok |
| `src/e2e/disparu-ecran-390.test.ts` | 32.9 | ok |
| `src/e2e/disparu-ecran-critere.test.ts` | 75.5 | ok |
| `src/e2e/disparu-ensemble-verification.test.ts` | 8.7 | ok |
| `src/e2e/etats.test.ts` | 19.7 | ok |
| `src/e2e/fiche-mj-seul-ecran-besoin.test.ts` | 6.7 | ok |
| `src/e2e/fiche-mj-seul-ensemble-besoin.test.ts` | 5.8 | ok |
| `src/e2e/fiche-mj-seul-ensemble-complements.test.ts` | 3.1 | ok |
| `src/e2e/fiche-mj-seul-mobile-besoin.test.ts` | 3.3 | ok |
| `src/e2e/fiche-refonte.test.ts` | 43.0 | ok |
| `src/e2e/fiche-toast-creation.test.ts` | 3.3 | ok |
| `src/e2e/fichiers-attente-illustration-390.test.ts` | 3.9 | ok |
| `src/e2e/fondations-visuelles.test.ts` | 3.2 | ok |
| `src/e2e/format-evolue-amendes-ensemble.test.ts` | 20.4 | ok |
| `src/e2e/format-evolue-masses-ensemble.test.ts` | 63.0 | ok |
| `src/e2e/format-evolue-routes-ensemble.test.ts` | 58.9 | ok |
| `src/e2e/format-zones-ensemble.test.ts` | 58.5 | ok |
| `src/e2e/galaxie-lire-ecran.test.ts` | 34.4 | ok |
| `src/e2e/galaxie-lire-ensemble-besoin.test.ts` | 127.2 | ok |
| `src/e2e/galaxie-lire-ensemble-complements.test.ts` | 52.4 | ok |
| `src/e2e/galaxie-tenir-ecran-forme.test.ts` | 9.4 | ok |
| `src/e2e/galaxie-tenir-ecran.test.ts` | 28.2 | ok |
| `src/e2e/galaxie-tenir-ensemble-besoin.test.ts` | 89.3 | ok |
| `src/e2e/galaxie-tenir-lot-rapport.test.ts` | 6.4 | ok |
| `src/e2e/galaxie-tenir-verif-besoin.test.ts` | 29.4 | ok |
| `src/e2e/galaxie-zone-hexagones-ecran.test.ts` | 16.1 | ok |
| `src/e2e/graphe-ecran.test.ts` | 11.4 | ok |
| `src/e2e/graphe-geometrie-traits.test.ts` | 5.5 | ok |
| `src/e2e/harnais-attendre.test.ts` | 84.3 | ok |
| `src/e2e/harnais-besoin-ensemble.test.ts` | 51.6 | ok |
| `src/e2e/harnais-concurrence.test.ts` | 7.8 | ok |
| `src/e2e/harnais-diagnostic.test.ts` | 1.9 | ok |
| `src/e2e/harnais-garde-fous.test.ts` | 0.1 | ok |
| `src/e2e/harnais-sans-delai.test.ts` | 0.1 | ok |
| `src/e2e/harnais.test.ts` | 0.0 | ok |
| `src/e2e/healthz.test.ts` | 11.0 | ok |
| `src/e2e/icones-marque-besoin.test.ts` | 4.1 | ok |
| `src/e2e/illustration-ecrans.test.ts` | 10.3 | ok |
| `src/e2e/illustrations-systemes-besoin-etats.test.ts` | 26.9 | ok |
| `src/e2e/illustrations-systemes-besoin.test.ts` | 12.4 | ok |
| `src/e2e/images-besoin.test.ts` | 68.0 | ok |
| `src/e2e/images-echec-message.test.ts` | 7.5 | ok |
| `src/e2e/import-assistant-besoin.test.ts` | 10.3 | ok |
| `src/e2e/import-fichiers-attente-mediatheque.test.ts` | 1.6 | ok |
| `src/e2e/import-fichiers-besoin.test.ts` | 19.5 | ok |
| `src/e2e/import-fichiers-verification.test.ts` | 5.6 | ok |
| `src/e2e/import-fil-besoin.test.ts` | 36.7 | ok |
| `src/e2e/import-fil-complements.test.ts` | 0.9 | ok |
| `src/e2e/import-fil-recette.test.ts` | 18.5 | ok |
| `src/e2e/jeton-assistant-besoin.test.ts` | 57.9 | ok |
| `src/e2e/jeton-assistant-connexion-id.test.ts` | 10.1 | ok |
| `src/e2e/jeton-assistant-panneau.test.ts` | 46.0 | ok |
| `src/e2e/liees-bloc-besoin-ensemble.test.ts` | 19.8 | ok |
| `src/e2e/liees-bloc-mode-joueur-ecran.test.ts` | 6.6 | ok |
| `src/e2e/liees-bloc-rafraichissement-besoin.test.ts` | 6.7 | ok |
| `src/e2e/liees-bloc-revue.test.ts` | 40.4 | ok |
| `src/e2e/liees-bloc-types-lents-besoin.test.ts` | 10.3 | ok |
| `src/e2e/liees-bloc-types-tardifs.test.ts` | 4.5 | ok |
| `src/e2e/liees-vignette-geometrie.test.ts` | 3.2 | ok |
| `src/e2e/liens-ecran-besoin.test.ts` | 20.5 | ok |
| `src/e2e/liens-ecran-liste-et-enregistrer.test.ts` | 5.7 | ok |
| `src/e2e/liens-ecran-maquette-blocs.test.ts` | 6.1 | ok |
| `src/e2e/liens-ecran-mise-en-page.test.ts` | 11.8 | ok |
| `src/e2e/liens-ensemble-besoin.test.ts` | 15.9 | ok |
| `src/e2e/markdown-editeur.test.ts` | 13.6 | ok |
| `src/e2e/markdown-ensemble-besoin.test.ts` | 7.9 | ok |
| `src/e2e/markdown-lecture.test.ts` | 8.1 | ok |
| `src/e2e/mediatheque-besoin-echecs-assistant.test.ts` | 15.0 | ok |
| `src/e2e/mediatheque-besoin-ensemble-reprise.test.ts` | 6.4 | ok |
| `src/e2e/mediatheque-besoin-verification.test.ts` | 45.5 | ok |
| `src/e2e/mediatheque-cadre-unique.test.ts` | 3.3 | ok |
| `src/e2e/mediatheque-critere-migration.test.ts` | 3.6 | ok |
| `src/e2e/mediatheque-critere-sortie.test.ts` | 10.1 | ok |
| `src/e2e/mediatheque-declencheur-joindre-style.test.ts` | 2.4 | ok |
| `src/e2e/mediatheque-declencheur-joindre.test.ts` | 2.9 | ok |
| `src/e2e/mediatheque-ecran-reprise.test.ts` | 5.2 | ok |
| `src/e2e/mediatheque-ecran.test.ts` | 13.2 | ok |
| `src/e2e/mediatheque-ensemble-bords-exclusions.test.ts` | 13.2 | ok |
| `src/e2e/mediatheque-ensemble-insertion-menu-illustration.test.ts` | 12.3 | ok |
| `src/e2e/mediatheque-ensemble.test.ts` | 29.2 | ok |
| `src/e2e/mediatheque-envoi-coupe-besoin.test.ts` | 4.6 | ok |
| `src/e2e/mediatheque-fiche-ferme.test.ts` | 5.6 | ok |
| `src/e2e/mediatheque-fiche-selecteur.test.ts` | 9.8 | ok |
| `src/e2e/mediatheque-fiche.test.ts` | 14.8 | ok |
| `src/e2e/mediatheque-panneau-document.test.ts` | 6.4 | ok |
| `src/e2e/mediatheque-relu-besoin.test.ts` | 34.2 | ok |
| `src/e2e/mediatheque-reverification.test.ts` | 3.2 | ok |
| `src/e2e/mediatheque-tuile-document-reserve.test.ts` | 3.0 | ok |
| `src/e2e/mediatheque-verification.test.ts` | 5.5 | ok |
| `src/e2e/membres-pastille-largeur.test.ts` | 3.3 | ok |
| `src/e2e/menu-compte-connexion-perdue.test.ts` | 4.1 | ok |
| `src/e2e/menu-compte-moi-en-echec.test.ts` | 3.2 | ok |
| `src/e2e/monde-aide.test.ts` | 0.0 | ok |
| `src/e2e/monde-besoin-api.test.ts` | 4.3 | ok |
| `src/e2e/monde-besoin-ecran.test.ts` | 19.3 | ok |
| `src/e2e/monde-mode-joueur.test.ts` | 3.4 | ok |
| `src/e2e/natures-ensemble-besoin.test.ts` | 12.8 | ok |
| `src/e2e/natures-ensemble-complements.test.ts` | 5.4 | ok |
| `src/e2e/natures-ensemble-import.test.ts` | 3.1 | ok |
| `src/e2e/natures-ensemble-migration.test.ts` | 1.6 | ok |
| `src/e2e/natures-ensemble-semis.test.ts` | 2.8 | ok |
| `src/e2e/natures-reverification-ecrans.test.ts` | 9.8 | ok |
| `src/e2e/oidc-login.test.ts` | 16.0 | ok |
| `src/e2e/outils-barre-critere.test.ts` | 6.4 | ok |
| `src/e2e/outils-cadre-assistant-besoin.test.ts` | 1.6 | ok |
| `src/e2e/outils-cadre-besoin.test.ts` | 23.0 | ok |
| `src/e2e/outils-catalogue-acces-api-critere.test.ts` | 12.5 | ok |
| `src/e2e/outils-catalogue-ecrans-verif.test.ts` | 25.3 | ok |
| `src/e2e/outils-catalogue-elements-critere.test.ts` | 12.9 | ok |
| `src/e2e/outils-catalogue-ensemble-verif.test.ts` | 45.6 | ok |
| `src/e2e/outils-catalogue-import-critere.test.ts` | 22.0 | ok |
| `src/e2e/outils-catalogue-libelles-reverif.test.ts` | 34.8 | ok |
| `src/e2e/outils-onglet-critere.test.ts` | 24.2 | ok |
| `src/e2e/outils-retrait-ensemble-besoin.test.ts` | 44.8 | ok |
| `src/e2e/outils-retrait-fenetre-ecran.test.ts` | 11.7 | ok |
| `src/e2e/outils-textes-vise-exige-ecran.test.ts` | 9.0 | ok |
| `src/e2e/panneau-mj-cadenas.test.ts` | 4.1 | ok |
| `src/e2e/parametres-gabarit-mj.test.ts` | 3.4 | ok |
| `src/e2e/parametres-systeme-besoin.test.ts` | 5.7 | ok |
| `src/e2e/pieces-jointes-besoin.test.ts` | 32.3 | ok |
| `src/e2e/pieces-jointes-complements.test.ts` | 19.7 | ok |
| `src/e2e/pieces-jointes-geometrie.test.ts` | 4.7 | ok |
| `src/e2e/pieces-jointes.test.ts` | 46.9 | ok |
| `src/e2e/plafond-sections.test.ts` | 8.6 | ok |
| `src/e2e/premiere-fiche.test.ts` | 29.5 | ok |
| `src/e2e/preuve-tests-declaree.test.ts` | 0.2 | ok |
| `src/e2e/proposition-ecran.test.ts` | 14.5 | ok |
| `src/e2e/rattrapage-doc.test.ts` | 0.0 | ok |
| `src/e2e/rattrapage-ensemble.test.ts` | 7.2 | ok |
| `src/e2e/rattrapage-migration-main.test.ts` | 1.8 | ok |
| `src/e2e/recherche-avancee-ecran.test.ts` | 8.8 | ok |
| `src/e2e/recherche-e17-maquette.test.ts` | 6.3 | ok |
| `src/e2e/recherche-ensemble-verif.test.ts` | 31.6 | ok |
| `src/e2e/recherche-liee-besoin.test.ts` | 10.3 | ok |
| `src/e2e/recherche-liste.test.ts` | 11.6 | ok |
| `src/e2e/recours-admin-ensemble.test.ts` | 92.5 | ok |
| `src/e2e/recours-admin-reverification.test.ts` | 15.3 | ok |
| `src/e2e/refonte-audience-clavier.test.ts` | 4.5 | ok |
| `src/e2e/refonte-audience-hors-ligne.test.ts` | 4.7 | ok |
| `src/e2e/refonte-besoin.test.ts` | 52.0 | ok |
| `src/e2e/refonte-ensemble-complements.test.ts` | 12.4 | ok |
| `src/e2e/refonte-ensemble-regard.test.ts` | 15.3 | ok |
| `src/e2e/refonte-verification-telephone.test.ts` | 9.3 | ok |
| `src/e2e/reglages-membres-charte.test.ts` | 6.4 | ok |
| `src/e2e/reglages-membres-reessayer.test.ts` | 2.9 | ok |
| `src/e2e/reglages-rendu-mesure.test.ts` | 3.5 | ok |
| `src/e2e/reglages-toasts.test.ts` | 6.9 | ok |
| `src/e2e/relation-badge-pj-besoin.test.ts` | 4.8 | ok |
| `src/e2e/relation-badge-pj-ensemble.test.ts` | 4.8 | ok |
| `src/e2e/relation-badge-pj-verif.test.ts` | 7.0 | ok |
| `src/e2e/relation-badge-pj.test.ts` | 3.7 | ok |
| `src/e2e/relations-cible-personnage-besoin.test.ts` | 8.7 | ok |
| `src/e2e/relations-cible-personnage.test.ts` | 8.2 | ok |
| `src/e2e/relier-natures-ecran.test.ts` | 13.7 | ok |
| `src/e2e/reprise-besoin.test.ts` | 13.1 | ok |
| `src/e2e/revue-audience-fil.test.ts` | 7.1 | ok |
| `src/e2e/revue-ligne-relation-390.test.ts` | 9.3 | ok |
| `src/e2e/route-type-lien-ecran.test.ts` | 19.3 | ok |
| `src/e2e/secrets-ensemble-besoin.test.ts` | 11.7 | ok |
| `src/e2e/sections-gerees-bandeau-alerte-icones.test.ts` | 6.1 | ok |
| `src/e2e/sections-gerees-besoin-ensemble.test.ts` | 7.5 | ok |
| `src/e2e/sections-gerees-ecran.test.ts` | 15.2 | ok |
| `src/e2e/socle-rust-doc.test.ts` | 0.0 | ok |
| `src/e2e/socle-rust-ensemble.test.ts` | 29.0 | ok |
| `src/e2e/sous-type-dialogue-badge.test.ts` | 11.5 | ok |
| `src/e2e/sous-type-dialogue-boite.test.ts` | 12.0 | ok |
| `src/e2e/sous-type-dialogue-complements.test.ts` | 5.1 | ok |
| `src/e2e/sous-type-dialogue-ensemble.test.ts` | 31.1 | ok |
| `src/e2e/suivi-besoin-ensemble.test.ts` | 25.0 | ok |
| `src/e2e/suivi-collisions-css.test.ts` | 4.0 | ok |
| `src/e2e/suivi-migration-ensemble.test.ts` | 6.2 | ok |
| `src/e2e/systemes-ecrans.test.ts` | 16.6 | ok |
| `src/e2e/systemes-ensemble.test.ts` | 37.2 | ok |
| `src/e2e/taille-images-editeur-menu-etroit.test.ts` | 7.3 | ok |
| `src/e2e/taille-images-ensemble-besoin.test.ts` | 34.3 | ok |
| `src/e2e/taille-images-import-besoin.test.ts` | 1.7 | ok |
| `src/e2e/tenir-ensemble-besoin.test.ts` | 33.1 | ok |
| `src/e2e/tenir-fiche-ecran.test.ts` | 13.6 | ok |
| `src/e2e/tenir-univers-ecran.test.ts` | 5.0 | ok |
| `src/e2e/tenir-univers-maquette.test.ts` | 2.9 | ok |
| `src/e2e/tenir-univers-telephone-hauteurs.test.ts` | 5.0 | ok |
| `src/e2e/tenir-univers-telephone.test.ts` | 4.6 | ok |
| `src/e2e/theme-nulle-part-ailleurs.test.ts` | 14.6 | ok |
| `src/e2e/types-besoin-complements.test.ts` | 11.8 | ok |
| `src/e2e/types-besoin-verification.test.ts` | 26.2 | ok |
| `src/e2e/types-ecran-fiche-reprise.test.ts` | 7.6 | ok |
| `src/e2e/types-ecran-fiche.test.ts` | 13.0 | ok |
| `src/e2e/types-ecrans-lore.test.ts` | 10.6 | ok |
| `src/e2e/types-ecrans-reglage-mise-en-page.test.ts` | 4.4 | ok |
| `src/e2e/types-ecrans-reglage.test.ts` | 10.8 | ok |
| `src/e2e/vaisseaux-atelier-ecarts-review.test.ts` | 12.9 | ok |
| `src/e2e/vaisseaux-atelier-effets-review.test.ts` | 16.3 | ok |
| `src/e2e/vaisseaux-atelier-equipage-review.test.ts` | 45.8 | ok |
| `src/e2e/vaisseaux-atelier-livre-review.test.ts` | 8.6 | ok |
| `src/e2e/vaisseaux-atelier-suite-review.test.ts` | 8.1 | ok |
| `src/e2e/vaisseaux-ecarts-ensemble-api.test.ts` | 52.2 | ok |
| `src/e2e/vaisseaux-ecarts-ensemble-ecran.test.ts` | 24.9 | ok |
| `src/e2e/vaisseaux-ecran-critere.test.ts` | 51.2 | ok |
| `src/e2e/vaisseaux-ecran-ecarts.test.ts` | 8.9 | ok |
| `src/e2e/vaisseaux-effets-ensemble-api.test.ts` | 63.9 | ok |
| `src/e2e/vaisseaux-effets-ensemble-ecran.test.ts` | 32.1 | ok |
| `src/e2e/vaisseaux-ensemble-api.test.ts` | 45.5 | ok |
| `src/e2e/vaisseaux-ensemble-assistant.test.ts` | 1.8 | ok |
| `src/e2e/vaisseaux-ensemble-ecran.test.ts` | 44.7 | ok |
| `src/e2e/vaisseaux-fiches-ensemble-api.test.ts` | 54.4 | ok |
| `src/e2e/vaisseaux-fiches-ensemble-ecran.test.ts` | 33.7 | ok |
| `src/e2e/vaisseaux-fiches-ensemble-legendes.test.ts` | 3.4 | ok |
| `src/e2e/vaisseaux-regles-ecran-colonne.test.ts` | 9.2 | ok |
| `src/e2e/vaisseaux-regles-ecran-revue.test.ts` | 24.9 | ok |
| `src/e2e/vaisseaux-regles-ensemble.test.ts` | 30.9 | ok |
| `src/e2e/vaisseaux-regles-livre-ensemble-api.test.ts` | 43.2 | ok |
| `src/e2e/vaisseaux-regles-livre-ensemble-ecran.test.ts` | 29.3 | ok |
| `src/e2e/vaisseaux-reverification-liste-bandeau.test.ts` | 3.5 | ok |
| `src/e2e/vaisseaux-suite-ensemble-api.test.ts` | 42.9 | ok |
| `src/e2e/vaisseaux-suite-ensemble-ecran.test.ts` | 23.4 | ok |
| `src/e2e/verif-refonte-besoin.test.ts` | 61.4 | ok |
| `src/e2e/wasm-navigateur.test.ts` | 0.5 | ok |
| **Total (275 files)** | **4904.5** | |

6 entries with a title declared by several files: duration split evenly.
