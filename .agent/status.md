# Status — kanevas

> MàJ : 2026-10-03

**État :** socle posé sur `feature/kanevas-socle` (PR ouverte, non fusionnée) :
`/healthz` (`kanevas <version>`, version = build-arg `APP_VERSION`), OIDC
d'identité, transports LLM réservés, Dockerfile (utilisateur `node`, mais le pod tourne en root au cluster), CI
`docker-publish.yml` (test puis image GHCR). Typecheck et 8 tests verts. Carte et
invariants : `ARCHITECTURE.md`.

**Pièges :**
- La CI ne publie `ghcr.io/antorfr/kanevas:0.1.0` que sur le tag `v0.1.0`, à
  pousser après la fusion de la PR. Sur la branche, aucune image n'existe (la
  PR ne fait qu'un build sans push). `k8s-home-lab` épingle ce tag.
- `docker build` n'a jamais tourné dans les pods de la chaîne (pas de démon) :
  vérifié avec Node (`APP_VERSION=0.1.0 node dist/server.js`). Le premier vrai
  build est celui de la CI.

**Suivant :** `kanevas-identite` (session, rôles AD-9, première écriture dans
`/data`).

**Tâche `kanevas-pf-donnees` (branche `task/kanevas-pf-donnees`) :** `src/db/`
(better-sqlite3, migration 0001, runner idempotent) et `src/services/`
(`comptes`, `univers`, `membres`, `fiches`, `sections`, `droits`) faits ; la
base s'ouvre dans `buildApp` (`app.db`). Erreurs : `ErreurService.code`
(`introuvable` 404, `refuse` 403, `invalide` 400, `conflit` 409
`section_modifiee`). Sans `/data` en production, base en mémoire avec avertissement
(le test e2e de `/healthz` tourne ainsi). Pas encore de tests de service ni de route.

**Tâche `kanevas-pf-session` (branche `task/kanevas-pf-session`) :** session (cookie
`kanevas_session` signé, secret `SESSION_SECRET` ou `/data/session.key`), mode bouchon
(`/connexion-bouchon`, refus de démarrer avec une variable `OIDC_*`), garde (401 sous `/api`,
redirection ailleurs ; routes inconnues restent 404), `GET /api/moi`, `POST /api/auth/logout`,
pages « Connexion refusée / indisponible » (le callback ne rend la page que si `Accept` contient
`text/html`, sinon l'ancien JSON 401, pour garder les tests existants). Pas encore de tests.

**Tâche `kanevas-pf-shell` (branche `task/kanevas-pf-shell`) :** `frontend/` (Vite, React 19,
react-router) : `ui/tokens.css` + composants de la charte, registre d'écrans (`src/ecrans/*.tsx`,
aucun enregistré), barre latérale (items de `items.ts`, affichés seulement si un écran répond à
leur adresse ; tiroir « Menu » sous 760 px), thème Clair/Sombre/Système (localStorage), bandeaux
bouchon (`<meta name="kanevas-bouchon">` injecté dans `index.html` par le serveur) et connexion
perdue. Le serveur sert `dist/public` derrière la garde ; le Dockerfile construit les deux.
Pas de navigateur dans le pod : rendu non vérifié visuellement, ni test de contraste (testeur).

**Tâche `kanevas-pf-accueil-univers` (branche `task/kanevas-pf-accueil-univers`) :** écrans E-1
(`/`), E-2 (`/univers/nouveau`), E-3 (`/univers/:id`, refus = 404 de l'API → « Page introuvable. »)
dans `frontend/src/ecrans/`. Blocs de E-3 : un fichier dans `ecrans/vue-ensemble/blocs/` (export
par défaut `Bloc`), trouvé par `vue-ensemble/registre.ts`. Le service refuse aussi une
description de plus de 500 caractères. Pas encore de tests ; rendu non vérifié au navigateur (pas de navigateur dans le pod).

**Tâche `kanevas-sy-donnees` (branche `task/kanevas-sy-donnees`) :** migration `0002-systemes.sql`
(**numéro provisoire**, AD-51 : `systemes_jeu`, `gabarits`, `univers.systeme_id` NULL), services
`src/services/systemes.ts` (`listerSystemes`, `creerSysteme`, `rattacherSysteme`,
`creerEtRattacherSysteme`, `lireSysteme`, `listerGabarits`, `creerGabarit`, `modifierGabarit`) et
`modifierUnivers` dans `univers.ts`. Erreurs : conflit de détail `nom_pris` ou `gabarit_modifie`.
Le test existant `migration: cinq tables…` attend 5 tables : à mettre à jour par le testeur.
Pas encore de tests des nouveaux services ni de routes.

**Tâche `kanevas-sy-routes` (branche `task/kanevas-sy-routes`) :** `src/routes/systemes.ts`, dans la
portée gardée : `GET|POST /api/systemes`, `PATCH /api/univers/:id` (nom, description),
`PUT /api/univers/:id/systeme` (`{systemeId: n|null}`, 204), `POST …/systeme-nouveau` (201),
`GET …/systeme?type=regle|creature|objet&curseur=` (système + N + `gabarits` + `suivant`),
`POST …/systeme/gabarits` (`{type,nom,contenu}`), `PUT …/systeme/gabarits/:gabaritId`
(`{nom,contenu,version}`). Aucune suppression. Pas encore de tests de route.

**Tâche `kanevas-sy-ecran-systeme` :** E-15 `frontend/src/ecrans/systeme.tsx`
(`/univers/:id/systeme` : onglets, ajout/modification MJ, version lue AD-85, « Charger la
suite ») et le bloc E-3 `blocs/systeme.tsx` (absent sans système). Typecheck et build verts ;
`registre.test.ts` (3e test) suppose `blocs/` vide et échoue désormais — à adapter par le testeur.
