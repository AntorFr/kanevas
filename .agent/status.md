# Status — kanevas

> MàJ : 2026-10-05

**État :** `epic/kanevas` porte le socle, la première fiche, les systèmes de jeu et le suivi de la séance
(campagnes, scénarios, préparation, comptes-rendus ; E-6, E-7, E-13). `feature/kanevas-fichiers`
y ajoute, en PR non fusionnée : la migration `0004-pieces-jointes.sql` (table `pieces_jointes`),
`services/stockage.ts` (octets sous `<dossier de la base>/attachments/`, `tmp/` vidé au démarrage),
`services/pieces-jointes.ts` (`deposerPieceJointe` seule fonction d'envoi, marquer, retirer, lire, ouvrir),
les quatre routes sous `…/sections/:id/pieces-jointes` et `…/pieces-jointes/:id[/fichier]`, et le bloc
Pièces jointes de E-9 (AD-65 à AD-67). La lecture d'une fiche porte les pièces de chaque section ; la
confirmation de retrait d'une section annonce ses pièces. Carte : `ARCHITECTURE.md`.

**Reste :** la fusion et le tag `v*` (recette acceptée par Monsieur). Rien n'est amorcé : tout se crée à
la main (Léa se connecte une fois avant d'être ajoutée). Aucune image n'existe avant le tag.

**Pièges :**
- Node 20 est la cible (CI, Dockerfile). `better-sqlite3` est donc épinglé en `^12` : la 13 exige
  Node ≥ 22 et plante (SIGSEGV) sous Node 20. Ne pas remonter sans changer aussi la CI et le Dockerfile.
- La suite a été jouée sous Node 22 dans les pods de la chaîne (pas de Docker) ; la CI Node 20 fait foi.
- La CI ne pousse d'image que sur `main` et sur un tag `v*` ; sur une PR elle ne fait qu'un build de
  validation. L'image testable n'existe qu'après le tag, posé à la fusion.
- **Numéro de migration** : `0004-pieces-jointes.sql` (après `0003-suivi.sql`, recalée à la fusion, AD-51) ; si une autre tranche fusionne une migration
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
- P-7 : le portrait (pièce jointe) est livré ; la demande à l'assistant (`kanevas-assistant-membre`) reste à venir.
- Pièces jointes : le type est déterminé par la signature des octets, jamais par le navigateur ; seules PNG,
  JPEG, GIF, WebP sont servies en ligne, le reste (SVG compris) en `attachment` sous `nosniff` et CSP sandbox.
  Un refus de lecture répond 404 comme un identifiant inconnu (AD-22) ; 50 pièces au plus par section, pas de
  limite de taille ; ajouter, marquer ou retirer ne change pas la `version` de la section. Pas de route de liste,
  pas de glisser-déposer. `deposerPieceJointe` et `stockage.ts` serviront aux images générées et aux fonds de carte.
- Rendu du bloc Pièces jointes vérifié par les tests e2e (Playwright) là où il est installé ; la CI ne les joue pas.
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

**Suivant :** relations et recherche (`kanevas-relier-chercher`), administration.
