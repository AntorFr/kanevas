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
Bandeau « Connexion perdue » : sondé toutes les 3 s sur `/healthz` tant qu'il est levé, il disparaît seul au retour du serveur. Commentaires de code traduits en anglais.
**Suivant :** relations et recherche (`kanevas-relier-chercher`), pièces jointes, campagnes, administration.
