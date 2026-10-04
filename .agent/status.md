# Status — kanevas

> MàJ : 2026-10-04

**État :** `main` porte le socle et la première fiche (comptes, univers, membres, fiches, sections,
droits, session et mode bouchon, frontend E-1 à E-4, E-8, E-9, plafond de section AD-91).
`feature/kanevas-systemes` y ajoute, en PR non fusionnée : la migration `0002-systemes.sql`
(`systemes_jeu`, `gabarits`, `univers.systeme_id`), les services `systemes.ts` et `modifierUnivers`,
les routes `src/routes/systemes.ts`, les écrans E-14 (Paramètres) et E-15 (Système de jeu) et le
bloc « Système de jeu » de E-3 (AD-83 à AD-85). Typecheck et tests verts après fusion de `main`
dans la branche. Carte et invariants : `ARCHITECTURE.md`.

**Reste :** la recette de Monsieur au navigateur en bouchon (critère de la feature : Antor rattache
« Lame d'Ébène » à « CoF Mini » et y ajoute une créature ; Mira rattache « Les Landes grises » et la
voit ; Admin crée « Brume », non rattachée, sans système), puis la fusion et le tag `v*`. Le catalogue
naît vide : le premier MJ crée « CoF Mini » depuis E-14. Aucune image n'existe avant le tag.

**Pièges :**
- Node 20 est la cible (CI, Dockerfile). `better-sqlite3` est donc épinglé en `^12` : la 13 exige
  Node ≥ 22 et plante (SIGSEGV) sous Node 20. Ne pas remonter sans changer aussi la CI et le Dockerfile.
- La suite a été jouée sous Node 22 dans les pods de la chaîne (pas de Docker) ; la CI Node 20 fait foi.
- La CI ne pousse d'image que sur `main` et sur un tag `v*` ; sur une PR elle ne fait qu'un build de
  validation. L'image testable n'existe qu'après le tag, posé à la fusion.
- **Numéro de migration provisoire** : `0002-systemes.sql` ; si une autre tranche fusionne une migration
  avant, la phase merge la recale (AD-51).
- Systèmes : l'accès passe toujours par `/api/univers/:id/systeme…` (AD-83) ; un refus (compte sans rôle,
  univers non rattaché) répond comme un identifiant inconnu (404) ; aucune réponse ne nomme un autre
  univers (AD-84) ; écriture de gabarit périmée = 409 `gabarit_modifie` (AD-85). Ni suppression, ni import
  de référentiel, ni visibilité différenciée des gabarits (hors tranche).
- Rendu des écrans E-14 et E-15 non vérifié au navigateur (pas de navigateur dans les pods).
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
