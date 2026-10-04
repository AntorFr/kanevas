# Status — kanevas

> MàJ : 2026-10-04

**État :** `feature/kanevas-premiere-fiche` assemblée (PR #2 vers `main`, non fusionnée) : comptes,
univers, membres, fiches, sections et droits (`src/services/`, migration 0001), session et mode
bouchon, routes `/api`, frontend React (E-1 à E-4, E-8, E-9), charte et tokens. Typecheck, build et
215 tests verts sous Node 22 (dont `src/e2e/` sous Chromium, ignorés sans Playwright : voir le README). Carte et invariants :
`ARCHITECTURE.md`.

**Reste :** la recette de Monsieur au navigateur (critère de sortie de la feature), puis la fusion
et le tag `v*` qui produit l'image ; `k8s-home-lab` épingle ensuite ce tag.

**Pièges :**
- Node 20 est la cible (CI, Dockerfile). `better-sqlite3` est donc épinglé en `^12` : la 13 exige
  Node ≥ 22 et plante (SIGSEGV) sous Node 20. Ne pas remonter sans changer aussi la CI et le Dockerfile.
- La suite a été jouée sous Node 22 dans les pods de la chaîne (pas de Docker) ; la CI Node 20 fait foi.
- La CI ne pousse d'image que sur `main` et sur un tag `v*` ; sur une PR elle ne fait qu'un build de
  validation. L'image testable n'existe qu'après le tag, posé à la fusion.
- P-7 : seule l'écriture du joueur sur sa section est livrée ; portrait (`kanevas-fichiers`) et
  demande à l'assistant (`kanevas-assistant-membre`) restent aux tranches suivantes.
- « Connexion perdue » (frontend/src/api.ts) : sondé toutes les 3 s sur `/healthz` tant que le bandeau
  est levé ; il disparaît seul au retour du serveur.
- Le contenu d'une section est plafonné à 20 000 caractères par le serveur (`MAX_CONTENU_SECTION`,
  AD-91), rendu par `GET /api/moi` (`limites.contenuSection`) ; l'écran de fiche lit cette valeur.
- Doublons connus, non traités : `corps(request)` (routes/fiches.ts, univers.ts), message d'échec
  des écrans, texte du bandeau bouchon (pages.ts / Cadre.tsx).

- Sans `/data` en production, la base est en mémoire (avertissement au démarrage) ; la clé de session
  vient de `SESSION_SECRET`, sinon de `<data>/session.key`.
- Le callback OIDC ne rend la page « Connexion refusée/indisponible » que si `Accept` contient
  `text/html`, sinon 401 JSON.
- Code mort ou sans appelant, non traité : `export { ErreurService }` (droits.ts), `renommerSection`
  et la branche titre du PATCH d'une section (renommer est hors tranche), option `limite` de
  `listerFiches`, `blocsVisibles`/`blocsSectionVisibles` jumeaux ; le parseur form-urlencoded du
  bouchon vaut aussi pour `/api`.

**Suivant :** relations et recherche (`kanevas-relier-chercher`), pièces jointes, campagnes,
administration.
