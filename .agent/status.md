# Status — kanevas

> MàJ : 2026-10-04

**État :** la branche `feature/kanevas-recours-admin` empile le socle, la première fiche et le
recours admin ; rien n'est fusionné dans `main`. Recours admin assemblé : un compte du groupe
`parents` voit les univers de l'instance et leurs membres, en ajoute, change le rôle, en retire
(E-5, B-6), sans jamais lire le contenu. Typecheck, build et 130 tests verts (dont `src/e2e/administration.test.ts`, navigateur piloté en bouchon).

- `src/services/instance.ts` : seul module à accepter le drapeau `admin` (AD-86), ne touche que
  `membres` ; les règles de membres sont le noyau de `services/membres.ts`, partagé avec les
  fonctions MJ.
- `src/routes/instance.ts` : `/api/instance/univers` et `/api/instance/univers/:id/membres`
  (GET, POST, PATCH, DELETE). Hors du groupe, 404 comme une adresse inconnue (AD-87). L'acteur
  vient des groupes de la session, jamais de la requête.
- `frontend/src/ecrans/administration.tsx` : E-5, un seul motif `/administration/*` (le registre
  prend un chemin par fichier). Liste de membres partagée avec E-4 : `frontend/src/ListeMembres.tsx`.
  Entrée « Administration » dans `items.ts` et `Barre.tsx`, si `/api/moi` porte `parents`.

**Pièges encore vrais :**
- Le groupe est lu à la connexion et vaut jusqu'à l'expiration de la session (7 jours, AD-86).
- L'API de liste rend tous les univers ; la pagination par 100 est côté client (300 univers testés
  seulement en service/route, pas au navigateur).
- Un admin sans rôle reste un compte sans rôle pour fiches et sections : c'est voulu (AD-9, AD-22).
- Aucun test de composant du frontend ; l'écran E-5 n'a pas été vu au navigateur (pas de navigateur
  dans le pod). Les six états sont à jouer à la recette.
- En bouchon, la base est vide au départ (`./data/kanevas.db` hors image, `/data` dans l'image) : créer un
  univers en antor avant de tester E-5.
- `docker build` ne tourne pas dans les pods (pas de démon) : la CI de la PR construit l'image.
  Version de l'application : build-arg `APP_VERSION` seulement, jamais `package.json`.
- Le socle publie `ghcr.io/antorfr/kanevas:<version>` seulement sur un tag `vX.Y.Z`, posé à la fusion.
- `services/llm/*` est repris d'Antre-du-maitre et branché nulle part.

**Reste :** recette de Monsieur au navigateur en bouchon (critère de la feature), puis fusion et tag.
