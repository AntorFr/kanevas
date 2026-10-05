# Status — kanevas

> MàJ : 2026-10-05

**État :** `main` porte le socle, la première fiche et les systèmes de jeu. `feature/kanevas-suivi`
(PR vers `epic/kanevas`, non fusionnée) ajoute : la migration `0003-suivi.sql` (`campagnes`,
`scenarios`, `taches_preparation`), les services `campagnes`, `scenarios`, `preparation`,
`comptes_rendus`, les routes `src/routes/suivi.ts`, les écrans E-6 (liste et page), E-7, E-13, trois
blocs de E-3 (campagnes actives, derniers comptes-rendus, préparation pour le MJ) et la ligne
« Campagne » de E-9. Typecheck, build et 325 tests verts (Node 22 ; la CI Node 20 fait foi).
Carte et invariants : `ARCHITECTURE.md`.

**Reste :** la recette de Monsieur au navigateur en bouchon (critère de la feature : Antor crée « La
Couronne brisée », l'active, écrit un scénario, ajoute et coche une tâche ; Léa voit la campagne mais ni
scénario ni préparation, écrit un compte-rendu que Teo, ajouté en Joueur après sa première connexion,
lit sans pouvoir le modifier ; le plus récent vient en tête ; la vue d'ensemble d'Antor montre la
campagne active et le compte-rendu de Léa), puis la fusion et le tag `v*`. Rien n'est amorcé : tout se
crée à la main. Hors tranche : créer une campagne par l'assistant, mettre le monde à jour depuis un
compte-rendu, renommer une campagne ou une tâche. Aucune image n'existe avant le tag.

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
- Suivi : scénarios et tâches se gardent sur l'univers de la **campagne** (AD-47), jamais sur un identifiant
  d'univers fourni ; un refus répond 404. Le MJ qui crée un compte-rendu n'en est pas l'auteur affiché ;
  l'auteur Joueur lit et écrit sa section même fermée aux autres joueurs (AD-61). Plusieurs campagnes
  peuvent être actives (AD-60) ; aucune suppression nulle part.
- Rendu des écrans E-14, E-15 et du suivi (E-6, E-7, E-13) non vérifié au navigateur (pas de navigateur dans les pods).
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

**Suivant :** relations et recherche (`kanevas-relier-chercher`), pièces jointes, administration.
