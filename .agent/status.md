# Status — kanevas

> MàJ : 2026-10-05

**État :** `epic/kanevas` porte le socle, la première fiche et le système de jeu (migration 0002).
`feature/kanevas-relier-chercher` y ajoute, en PR non fusionnée : la migration `0003-relier-chercher.sql`
(`relations`, index FTS5 `recherche_fiches` et `recherche_sections`, déclencheurs, remplissage de
l'existant), `services/relations.ts` (relier, retirer, lire sous deux gardes), `peutVoirFiche` et les
conditions SQL de lecture dans `droits.ts`, l'option `recherche` de `listerFiches`, les routes `?q=` et
`/relations`, le composant `ListeRecherche` (E-8, réemployé par « Relier ») et le bloc Relations de E-9
(AD-63, AD-64). Typecheck, build et 337 tests verts, e2e navigateur compris (Node 22). Carte et
invariants : `ARCHITECTURE.md`.

**Reste :** la recette de Monsieur au navigateur en bouchon (critère : Léa cherche « Vérité » dans les
personnages et n'obtient rien, Antor trouve Aldric ; sur la fiche d'Aldric Léa voit « membre de » vers une
faction lisible et pas vers la faction secrète), puis la fusion et le tag `v*`. Rien n'est amorcé : univers,
fiches, sections et relations se créent à la main (Antor crée « Lame d'Ébène » par E-2, ajoute Léa après sa
première connexion). Aucune image n'existe avant le tag.

**Pièges :**
- Node 20 est la cible (CI, Dockerfile). `better-sqlite3` est donc épinglé en `^12` : la 13 exige
  Node ≥ 22 et plante (SIGSEGV) sous Node 20. Ne pas remonter sans changer aussi la CI et le Dockerfile.
- La suite a été jouée sous Node 22 dans les pods de la chaîne (pas de Docker) ; la CI Node 20 fait foi.
- La CI ne pousse d'image que sur `main` et sur un tag `v*` ; sur une PR elle ne fait qu'un build de
  validation. L'image testable n'existe qu'après le tag, posé à la fusion.
- **Numéro de migration provisoire** : `0003-relier-chercher.sql` ; si une autre tranche fusionne une migration
  avant, la phase merge la recale (AD-51).
- Recherche : `listerFiches({recherche})` seule (AD-63) ; les index FTS5 ne livrent que des identifiants
  candidats, tenus par déclencheurs : ne jamais écrire dans `recherche_*` depuis le code. La saisie est
  neutralisée (mots cités en préfixe) ; vide ou > 100 caractères = 400.
- Relations : lues sous deux gardes (section porteuse et fiche cible lisibles, AD-64), sans compteur ni
  placeholder ; seul le MJ relie ou retire, un joueur reçoit 404. Pas de relations entrantes (hors tranche).
  Codes : `auto_relation` (400), `relation_existante` et `limite_relations` (409, 100 par section).
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

**Suivant :** pièces jointes, campagnes,
administration.
