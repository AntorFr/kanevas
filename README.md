# kanevas

Système de gestion de JDR (lore, campagnes, comptes-rendus, droits, cartes).
Ce dépôt porte le socle (santé, OIDC, image, CI), la **première fonction métier** :
un MJ crée un univers, y réunit ses joueurs et y écrit des fiches dont chaque section a
son audience ; un joueur ne lit que ce que l'audience lui ouvre. Ce que le produit permet et
par quels écrans : `docs/parcours.md`, `docs/ecrans.md`, `docs/donnees.md`. Les sigles : E-n = un écran (`docs/ecrans.md`), B-n = un besoin, P-n = un parcours, AD-n = une décision d'architecture (`ARCHITECTURE.md`) ; « Monsieur » = le commanditaire qui fait la recette, « tranche » = une feature livrée, « phase merge » = la fusion qui suit la recette.

Au-delà de la première fonction métier, le dépôt porte le **système de jeu** : un référentiel (règles, créatures, objets) que plusieurs
univers se partagent, rattaché depuis les paramètres de l'univers. Il porte aussi le **suivi de la séance** : campagnes, scénarios (MJ), préparation en cinq catégories (MJ) et comptes-rendus (tout membre). The universe's **media library** (E-19) stores each image or document as a row in `fichiers` with its own visibility (player-visible or GM-only), determined by where it is added; a section attaches it (up to 100) or embeds it in its text, and a sheet can use it as its illustration. Il porte l'**administration d'instance** : un compte du groupe Authelia `parents` voit les univers et leurs membres (jamais le contenu) et les répare (E-5, B-6). Chaque fiche peut porter une **illustration** (an image from the media library, set by the GM, in the E-8 card grid and E-9 header), et les **systèmes de jeu** ont leur écran hors des univers (E-16, E-15). Il porte aussi les **relations** entre fiches (bloc Relations de la fiche) et la **recherche** dans tous les types de fiche, par alias et par étiquette (E-17), les **cartes** (E-10, E-11 : carte illustrée avec fond et tokens, ou graphe des relations ; visibles ou non des joueurs ; bloc « Cartes visibles » de E-3) et l'**assistant** de chaque membre (E-12 : un panneau de conversation qui cherche, lit, écrit et, pour le MJ, crée une campagne ou un scénario et **propose une mise à jour d'une section** d'après un compte-rendu, que seul son geste « Appliquer » écrit, avec exactement les droits de la personne ; l'accès au modèle passe par l'abonnement Claude de l'exploitant, `CLAUDE_CODE_OAUTH_TOKEN` ou, sans redéploiement, le jeton que l'admin d'instance pose depuis l'administration, et en bouchon un script répond). Le MJ peut aussi lui demander un **portrait** : l'assistant génère une image et l'attache à la section, où elle entre dans la médiathèque (moteur Codex sur l'abonnement de l'exploitant ; en bouchon, une image fixe).

## Structure

```txt
Dockerfile                        Image unique : API Fastify + frontend construit
scripts/faux-setup-token.mjs        Le `claude setup-token` du bouchon (copié dans l'image)
scripts/tests-attestes.mjs           `npm run tests:attestes` : joue toute la suite sur l'arbre commité (refuse un arbre sale, code 2) et écrit `rapport-tests.json` (ignoré par git, local à l’exécution : un rouge ancien se périme en rejouant la commande)
src/
  server.ts, app.ts               Démarrage ; assemblage des plugins et des routes
  config/env.ts                   Variables d'environnement (zod)
  db/                             SQLite (better-sqlite3), migrations/0001 to 0016, runner
  services/                       comptes, univers, membres, instance, fiches, sections, droits, systemes, relations, campagnes, scenarios, preparation, comptes_rendus, propositions, markdown (rendu unique), liens (table liens, seul écrivain), etiquettes (alias et étiquettes, seul écrivain), mentions (« Mentionnée dans »), types, types-fiche (la liste des types et leur activation),
                                   fichiers (media library, sole writer of `fichiers*`, except that deleting a universe in `univers.ts` erases its rows), fichiers-lecture (read of the files a text or sheet references by key, waiting render), cartes, jetons, lots, import (contexte du jeton), import-fiches (API d'import), import-suivi (campaigns and scenarios by origin key), import-relations (relations by origin key),  stockage (octets sur le volume)
                                   seul code qui lit ou écrit les données ; session, oidc
  routes/                         health, auth (OIDC), session (cookie, garde, /api/moi),
                                   bouchon, univers (+ membres), instance (admin, AD-87), systemes, suivi, cartes, fiches (+ sections), fichiers (E-19 media library, bytes, attachments, illustration), propositions, assistant, acces-api (E-18, session), import (API d'import à jeton, `/api/import/v1`), frontend
  bouchon/                        Monde de démonstration semé au démarrage en bouchon (depart.ts), client-import.ts et echantillon/ (recette de reprise) et ses fichiers (demo/)
  services/assistant/             L'assistant : catalogues d'outils, port AgentTransport (bouchon, claude-agent), orchestration, jeton et sa session de connexion
  services/images/                Moteur d'images de l'assistant : port GenerateurImage, adaptateurs bouchon, codex, aucun (AD-88, AD-90)
  services/llm/                   Transports LLM repris d'Antre-du-maitre, branchés nulle part
docs/                             Conception retenue, telle que construite : parcours, écrans, données, charte ; maquettes/ = pages HTML à ouvrir dans un navigateur (e09-fiche.html est la référence de la charte)
frontend/                         React + Vite : charte (ui/), écrans (src/ecrans/, dont E-5 administration.tsx), barre latérale
.github/workflows/docker-publish.yml   CI : image GHCR sur un tag attesté (aucun test joué) ; tests.yml : suite complète manuelle
```

La liste des types de fiche vient du serveur ; le frontend ne tient que la table icône → composant, dans `frontend/src/types-contexte.tsx` (c'est là qu'on ajoute l'icône d'un nouveau type).
Un écran est un fichier `frontend/src/ecrans/<nom>.tsx` enregistré par le registre
(`frontend/src/registre.ts`) ; les couleurs du frontend ne viennent que de `frontend/src/ui/tokens.css` (seule exception, le bandeau bouchon des pages rendues par le serveur, `src/routes/pages.ts`)
(`docs/charte.md`). Le cadre (`Cadre.tsx`, `Barre.tsx` : navigation à icônes, barre haute, tiroir au téléphone,
menu de l'avatar qui porte le thème et la déconnexion) et les composants partagés (`frontend/src/ui/` : bouton, menu, toast,
boîte de dialogue, interrupteur, pastille…) sont communs à tous les écrans. Les polices (Fraunces, Newsreader, Inter,
`@fontsource`) et les icônes (`lucide-react`) sont empaquetées, sans requête vers un hôte tiers (AD-92).

Tests sans Docker : `npm run typecheck` puis `npm test` (ils jouent aussi les e2e là où Playwright est installé, ce qui est long : voir « Tests de bout en bout » ; un seul fichier, e2e ou non (`src/db/migration-types.test.ts` : moins d'une seconde) : `node --import tsx --test <fichier>.test.ts`, et jamais deux suites à la fois, les e2e démarrent leurs serveurs et échouent en masse sous concurrence ; après un renumérotage de migration, `rm -rf dist` avant `npm run build`, sinon l'ancien fichier copié reste dans `dist/db/migrations` et le serveur ne démarre plus) ; la voie Docker de référence est dans `CLAUDE.md`.

## Démarrage local

To **view the screens**, use the command under « Sans Authelia : le mode bouchon » below (`npm ci && npm run build && KANEVAS_STUB=1 npm start`). The block below only serves the API (`/healthz`). `npm run build` writes to the repository's `dist/`: after renumbering a migration, run `rm -rf dist` first.

```bash
# écrit node_modules/ et ./data/ (base et session.key) dans le dépôt monté, en root ; les deux sont ignorés par git.
# Sans `npm run build` préalable (fait dans l'hôte, hors de cette commande), cette voie ne sert que l'API : voir plus bas.
# Pour voir les écrans (dont E-5, `/administration`) : même conteneur, mais `sh -c "npm ci && npm run build && KANEVAS_STUB=1 npm start"`
# (ou, avec Node ≥ 20 sur l'hôte, `npm ci` puis la commande de la section « mode bouchon »).
docker run --rm -p 3001:3001 -v "$PWD":/src -w /src node:20-bookworm-slim sh -c "npm ci && npm run dev"
# puis, depuis l'hôte : curl http://localhost:3001/healthz
# (sans KANEVAS_STUB=1 ni les quatre OIDC_*, `/` mène à une connexion OIDC qui répond 404 : aucun écran, pour les voir lancer le mode bouchon ci-dessus)
```

Ce bloc ne pose pas de `.env` : les valeurs par défaut suffisent pour `/healthz`, OIDC
reste désactivé (`/api/auth/oidc/login` répond 404). Pour l'activer, créer `.env` (voir
`.env.example`) à la racine : le montage `-v "$PWD":/src` le rend lisible. Ce bloc crée
aussi `node_modules/` dans le dépôt de l'hôte (ignoré par git) ; il appartient à root : à supprimer par
`docker run --rm -v "$PWD":/src -w /src node:20-bookworm-slim rm -rf node_modules` ou `sudo rm -rf node_modules`.

Ou, avec un Node 20+ installé localement (`engines` : `>=20` ; la suite passe aussi sous Node 22, la CI joue Node 20) :

```bash
npm install
cp .env.example .env
npm run dev            # ou, sans rechargement : npm run build && npm start (`npm start` seul échoue sans `dist/`, ignoré par git)
curl http://localhost:3001/healthz   # -> "kanevas 0.0.0-dev"
```

The attested run is `npm run tests:attestes` (no test skipped). The script refuses a dirty tree (exit 2): commit first.

This block serves `/healthz` and the API only; to log in and see the screens, use the stub-mode command under « Sans Authelia : le mode bouchon » (`KANEVAS_STUB=1`).

`npm run dev` sert l'API, et le frontend seulement s'il a été construit : lancer d'abord
`npm run build` (il construit `dist/public`, servi par Fastify derrière la session ; sans lui, `/`
ne montre aucun écran). `npm run dev:front` lance Vite seul (port 5173 par défaut) et ne relaie que
`/api` vers `http://localhost:3001` (écrit en dur dans `frontend/vite.config.ts` : à changer si `PORT` change) : il ne remplace pas le serveur pour la connexion en bouchon. Pour l'utiliser : lancer d'abord le
serveur en bouchon (port 3001), s'y connecter sur `http://localhost:3001/`, puis ouvrir
`http://localhost:5173/` (le cookie de session ne dépend pas du port).

La voie de référence reste le conteneur Node 20 de `CLAUDE.md` (celle de la CI) ; sans Docker, un Node local
récent suffit pour les mêmes commandes (`npm ci && npm run typecheck && npm test`).

### Import sample acceptance

Start the stub application on a fresh database (see below). « Essai Kanka » is universe 4 on a fresh
seed; the client needs no browser session, only that id and a token. In another terminal:

```bash
npm run import:echantillon -- http://localhost:3001 4 <token>
```

Use the public stub token `kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue` (`JETON_BOUCHON` in `src/bouchon/depart.ts`) or create a token in
« Accès par API » (E-18). The standalone client sends files, campaigns, parent-first sheets,
relations and scenarios in a batch, closes it, and prints the counters and warning reasons.
Tokens are passed as arguments and never written to disk. The sample comes from Éneria;
its source mapping and neutral JSON format are documented in `src/bouchon/echantillon/README.md`.

The database must be fresh (delete the file first) and the port free (`EADDRINUSE` shows only in the server log, and the client then talks to whatever else listens there): on a used base the first run reads like a replay. First run: 11 sheets, 3 files, 2 campaigns, 2 scenarios and 3 relations created, one unknown-target
warning (the relation probe from `personnage:tenny-balla` to `lieu:absent`), zero refusals. The summary line « liens et références en attente : 2 » counts the whole universe: Nyx, plus the link already waiting in the stub seed. Rerun the command: no creations, 11 unchanged sheets. In E-13, check
April 18, March 3, February 10, 2021, newest first. In Éneria Prime, Base Éneria-1 resolves
and Nyx stays « en attente »; player mode hides the GM paragraph and image, the base and
Obscura, including in search. In E-7, open the 60,000-character scenario and follow its
Éneria Prime link. Change the campaign status in E-6 and rerun: it stays changed, with a warning.

To exercise incremental replay, copy the sample JSON **within its directory** (file paths are
relative to it), append a sheet with a fresh `cle`, then pass that JSON path as a fourth argument:
one created sheet and eleven unchanged. Use the original file again for the baseline replay.
For the refusal case (one refusal, reason names the missing campaign, exit status 1):

```bash
npm run import:echantillon -- http://localhost:3001 4 <token> src/bouchon/echantillon/refus.json
```

Finally delete « Essai Kanka » in E-14, create a fresh universe and a token in E-18, and run
the original command with their id and token: the first-run counts must match. The stub
token belongs to the deleted universe and cannot be reused for the new one.

### Sans Authelia : le mode bouchon

```bash
npm ci && npm run build && KANEVAS_STUB=1 npm start   # puis ouvrir http://localhost:3001/ : choix d'un compte de test
# le semis précède l'écoute du port (moins d'une seconde ici) ; sans écrire dans ./data/ ni sur le port 3001 : npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start
# The recipes below that name `http://localhost:3001` assume `npm start` without `PORT`; with the `PORT=3055` command, replace 3001 by 3055. Stop with Ctrl-C. In the background, `kill $!` stops only `npm`, not the server: kill the `node dist/server.js` process that listens on the port (simplest: start it with `PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 node dist/server.js &` instead of `npm start`, then `kill $!` stops it; `ss`, `ps` and `pgrep` may be missing in a pod) (a server left running keeps the port, the database and `session.key`). Delete /tmp/k.db to reset the database. Every recipe below assumes a fresh seeded database (ids such as universe 4 are those of a fresh seed; the deletion recipe destroys « Port-Sel » and the universe it is run on): delete /tmp/k.db before each.
# `session.key` and `attachments/` are created beside the database: use a dedicated directory,
# e.g. `DB_PATH=/tmp/kanevas-essai/k.db`, and delete that entire directory to reset everything.
```

`/connexion-bouchon` remplace Authelia (AD-55) sous un bandeau « mode bouchon ». Les comptes de test
ont pour identifiants `antor`, `lea`, `teo`, `mira` et `admin` (noms affichés Antor, Léa…) : c'est
l'identifiant qu'on tape pour ajouter un membre. Sur une base sans univers, le bouchon sème au démarrage un monde de
démonstration (« Lame d'Ébène » : Antor MJ, Léa joueuse ; « Les Landes grises » : Mira MJ ; le système « CoF Mini » ;
des fiches, dont certaines illustrées ; « Les Cendres de Vaëlis », Admin MJ et Antor joueur, rattachée à « Chroniques Oubliées Fantasy » ; Teo n'est membre d'aucun univers) ; `KANEVAS_SANS_SEMIS=1` le coupe. En bouchon l'assistant répond par un script de mots-clés qui appelle les vrais outils (AD-78), connecté en `antor` (MJ de « Lame d'Ébène ») : « Crée une campagne « Les Marches rouges » » puis « Crée un scénario « Acte III — La crypte » dans « Les Marches rouges » » (le semis ne contient aucune campagne) ; chez `lea` (joueuse) la création est refusée ; « Lis-moi la section « Vérité » » donne « Introuvable. » à qui ne la lit pas. Un compte créé hors semis n'existe qu'après sa
première connexion (sinon « Ce compte ne s'est jamais connecté. » à l'ajout). Kanevas refuse de
démarrer en bouchon si une variable `OIDC_*` est posée. Avec `NODE_ENV=production` (celui de l'image ; `npm start` ne le pose pas) et sans volume `/data`, la base est en
mémoire (avertissement au démarrage).

**Recette du bloc MJ** (`kanevas-import-secrets`, en bouchon) : dans « Lame d'Ébène », fiche « Port-Sel » (type lieu), section « Histoire ».
Connecté en `lea`, la section se lit sans le mot « sous-main » et n'a pas « Modifier » ; la recherche « sous-main » dans « Lieux » ne rend pas « Port-Sel ».
Connecté en `antor`, le bloc apparaît hachuré avec la pastille « MJ seul », la même recherche rend « Port-Sel », et le mode Joueur redonne la vue de Léa.
En édition, « Bloc MJ » entoure la sélection de `:::mj` et `:::`.

En bouchon seulement, `/demo-composants` (session requise) montre les composants de la charte dans tous leurs états ;
hors bouchon, cette adresse répond 404 une fois connecté (302 vers la connexion sinon).

Recette de E-14 en bouchon : en `antor`, « Lame d'Ébène » puis « Paramètres » (navigation) ; les trois blocs MJ (Identité, Système de jeu, Créer un système) sont des blocs fermés hachurés d'ambre, filet ambre à gauche, comme les sections MJ seul de la fiche (sous 760 px le débord est de 12 px au lieu de 28). Les textes de l'interface portent l'apostrophe typographique (’).

**Relation badge recipe** (`kanevas-relation-badge-pj`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database; the sections of « Port-Sel » (fiche 12; « Description » is section 13) carry no relation at the start, so you make one). As `antor`, open the sheet « Port-Sel » (not « Maître Aldric » itself: a sheet cannot be related to itself), and in the Relations block of one of its sections, in the order of E-9 (`docs/ecrans.md`): type a label (e.g. « allié de »), choose « Type de fiche » = Personnage, search and pick « Maître Aldric », click « Relier »: the sheet stays open and the line shows the badge « PNJ ». Repeat with « Type de fiche » = Lieu and any place: the line shows « Lieu ». Same through the API: log in (`curl -c /tmp/j -d compte=antor http://localhost:3055/connexion-bouchon`, then `-b /tmp/j`); `<fid>` is 12 and `<sid>` 13 on a fresh base (otherwise read them from `GET /api/univers/1/fiches/<fid>`); `GET /api/univers/1/fiches/<fid>/sections/<sid>/relations` gives `cible.charge = {pj: false}` for Aldric and no `charge` for a place; the 201 of `POST` (body `{"cibleFicheId": <id>, "type": "allié de"}`) returns the same `cible`.

**Media library recipe** (`kanevas-import-mediatheque`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database; « Lame d'Ébène »). As `antor`: « Médiathèque » in the sidebar (E-19) lists, among others (the seeded illustrations are there too), « Carte des Sphères », « Plan secret de la Guilde » (GM-only) and « port-sel-quais.webp »; opening « Carte des Sphères » gives its usages (« Val-Fortin », « Maître Aldric », the illustration of « Port-Sel »). On « Port-Sel », « Description »: « Joindre un fichier » adds a document, visible to players; « Fichier » in the editor, inside a GM block, adds a GM-only file. As `lea`: « Plan secret de la Guilde » is not in the library, and a GM-only image (inserted in a text with `![plan](fichier:<id>)`, here « Plan secret de la Guilde », unused in the seed; read its `<id>` from `GET /api/univers/1/fichiers` with Antor's cookie (log in first, see the block below): it is 11 on a fresh database (the id, not a count); « Lame d'Ébène » is universe 1) read in a text becomes « Image réservée au MJ. ». Reserving « Carte des Sphères » for the GM (E-19) first lists what players lose.

Without a browser (English, as `CLAUDE.md` asks; the stub server above must be running on port 3055 (substitute your port in every URL otherwise); run from an empty scratch directory (the commands write a PDF in the current one); same cookie jar `-b /tmp/j`; « Lame d'Ébène » is universe 1, « Port-Sel » is fiche 12 and its « Description » section 13 on a fresh base):
```bash
curl -c /tmp/j -d compte=antor http://localhost:3055/connexion-bouchon   # log in as Antor (stub mode, no password); every curl below sends this cookie jar
curl -b /tmp/j http://localhost:3055/api/univers/1/fichiers   # {"fichiers":[{"id","nom",…}],"suite","total"} : read the id by "nom"
printf '%%PDF-1.4\n' > tarifs-du-port.pdf   # any small file named so will do
curl -b /tmp/j -F section=13 -F maniere=joint -F fichier=@tarifs-du-port.pdf http://localhost:3055/api/univers/1/fichiers   # « Joindre un fichier »; add -F blocMj=true for the GM-block path (fields before the file)
curl -b /tmp/j -X PUT -H 'Content-Type: application/json' -d '{"contenu":"![plan](fichier:11)","version":1}' http://localhost:3055/api/univers/1/fiches/12/sections/13/contenu   # version: read it from the section first
```

Recette de la mise à jour du monde en bouchon (le semis ne contient ni campagne ni compte-rendu ; « Maître Aldric » a une section « Vérité — MJ seul », que « Vérité » suffit à désigner). Toujours dans « Lame d'Ébène » :
1. En `antor`, dans le panneau de l'assistant (bouton flottant) : « Crée une campagne « Marches » ».
2. Se déconnecter (menu de l'avatar) puis `/connexion-bouchon` : en `lea`, depuis la fiche de la campagne ou l'écran des comptes-rendus (E-13, `docs/ecrans.md`), créer le compte-rendu, titre exactement « Séance 3 » (le bouchon cherche ce titre tel quel), dans cette campagne.
3. En `antor`, dans le panneau : « Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 3 » » ; le fil montre « Mise à jour proposée » (actuel, proposé) et la fiche est inchangée jusqu'à « Appliquer ». « Proposé » = le contenu actuel suivi de « Mise à jour d'après « Séance 3 ». » ; après « Appliquer », le bloc dit « Appliquée : la section « Vérité — MJ seul » est à jour. » et la fiche montre ce contenu.
4. Modifier la section depuis la fiche avant d'appliquer rend la proposition périmée (« Appliquer » désactivé, raison affichée).
5. La même demande en `lea` ne crée rien : l'assistant répond « Je ne peux pas le faire : l'outil « proposer_mise_a_jour » ne fait pas partie de ceux dont vous disposez. », sans bloc. Une proposition ne se retrouve pas après un rechargement du fil (AD-79).

Recette du Markdown en bouchon : dans « Lame d'Ébène », en `antor`, ouvrir la fiche « Maître Aldric », « Modifier » sur la section « Apparence », et écrire un intertitre (`## Quartiers`), une liste, un tableau, `**gras**`, `[site](https://exemple.org)`, `[x](javascript:alert(1))` et `<script>alert(1)</script>`, puis « Aperçu » (il montre ce que lira Léa) et « Enregistrer ». Les intertitres sont décalés d'un cran : `## Quartiers` s'affiche en `<h3>`, sous le titre de la section. En `lea`, la fiche montre l'intertitre, la liste, le tableau et le lien web mis en forme ; le lien `javascript:` et la balise restent du texte, aucun script ne s'exécute. Plafond : 100 000 caractères pour tout texte (sections, comptes-rendus, scénarios, entrées de système, propositions), 100 001 est refusé.

**Recette des types de fiche** (`kanevas-import-types`, en bouchon : `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, base neuve semée, donc « Essai Kanka » a l'id 4) : en `antor`, sur « CoF Mini » ▸ onglet « Types de fiche », désactiver « Vaisseau » et « Note » : la barre de « Lame d'Ébène » (qui suit « CoF Mini ») perd « Vaisseaux » et « Notes » ; en `mira` (seule MJ de « Les Landes grises », qui suit aussi « CoF Mini »), sa barre perd « Vaisseaux » et « Notes ». Sur « Lame d'Ébène » ▸ panneau « Types de fiche » (E-14), mettre « Vaisseau » à Activé : sa barre montre « Vaisseaux », pas « Notes ». Créer un Savoir « Les Cristaux d'Ombre » de sous-type « Ressource », puis « ⋯ » ▸ « Changer le type… » ▸ Note : une boîte annonce que le sous-type sera retiré, et la fiche n'en a plus. En `lea`, « Lieux » ▸ filtre « Sous-type » ▸ « Taverne » : seul « Le Pendu Joyeux » reste. Par l'API, avec le jeton du bouchon (valeur de `JETON_BOUCHON`, `src/bouchon/depart.ts`, `kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue`) dans « Essai Kanka » (id 4 sur une base semée) : `curl -X PUT -H "Authorization: Bearer kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue" -H 'Content-Type: application/json' -d '{"type":"vaisseau","titre":"Aube","sousType":"Frégate"}' http://localhost:3055/api/import/v1/univers/4/fiches/vaisseau:aube` répond `{"id":…,"etat":"creee","avertissements":[]}` (sans `?lot=`, rien n'est compté) ; le même appel rejoué rend `"etat":"inchangee"` ; `JETON_BOUCHON` est la constante de `src/bouchon/depart.ts`.

**Adventure recipe** (`kanevas-scenarios-type`, stub: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, then `http://localhost:3055/`): as `antor` in « Lame d'Ébène », « Aventures » in the Lore bar ▸ « Nouvelle aventure »: title « La Couronne brisée », sub-type « Campagne », « Visible des joueurs » left unchecked ▸ the sheet opens « En préparation » with a closed « Présentation » section. Create « Acte II — Le sceau brisé » (sub-type « Scénario », « Dans » the campaign): it shows under the campaign in the tree. Set the campaign « En cours » from the sheet header and the scenario « Prête » from its tree line; « Statut » ▸ « En cours » lists the campaign only. As `lea`, « Aventures » is empty until Antor opens « Présentation » (section audience); she then sees « La Couronne brisée · En cours », never « Acte II », and no status menu. The campaigns of E-6/E-7 still work as before.

Recette des liens en bouchon. Dans « Lame d'Ébène », en `antor`, fiche « Port-Sel », « Modifier » sur « Histoire » : taper `[[` puis « ald » ouvre la liste, Entrée insère `[[<id>|Maître Aldric]]` ; de même pour « La Guilde des Brumes » (MJ seul). En `lea`, le premier est un lien qui ouvre « Maître Aldric », le second du texte sans marque ; sur « Maître Aldric », « Mentionnée dans » nomme « Port-Sel » (un lien posé dans un bloc MJ de « Rapport secret de l'amirauté » n'y paraît qu'en `antor`). Dans « Essai Kanka », « Anse-aux-Sels » montre en `antor` un lien « en attente » et un lien cassé, en `lea` du texte. Avec le jeton du bouchon, un `PUT` de `lieu:port-sel` dont une section porte `[[cle:faction:guilde|la Guilde]]` donne un lien en attente ; le `PUT` de `faction:guilde` le résout sans changer la version de Port-Sel ; rejoués, les deux rendent « inchangee ». Dans un scénario, `[[` ouvre la même liste ; dans une entrée de système, `[[…]]` reste du texte.

Recette de l'accès par API en bouchon (« Essai Kanka » est semé : Antor MJ, Léa joueuse, et un « Jeton du bouchon » de valeur fixe `JETON_BOUCHON`, `src/bouchon/depart.ts`). En `antor`, « Essai Kanka » ▸ « Accès par API » (E-18) : créer un jeton, qui ne s'affiche qu'une fois. Avec lui (ou le jeton du bouchon), l'API d'import (AD-103, AD-104), sur une base neuve (« Essai Kanka » est le 4ᵉ univers semé, id 4 ; avec `KANEVAS_SANS_SEMIS=1` il n'existe pas, ni le jeton du bouchon : créer un univers et un jeton, l'id est celui de l'adresse de base copiable sur E-18) :
```bash
JETON=kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue   # le jeton du bouchon, ou celui créé sur E-18
B=http://localhost:3055/api/import/v1/univers/4          # sans barre finale ; port 3055 comme la commande du bouchon ci-dessus (3001 pour `npm start` sans PORT)
curl -H "Authorization: Bearer $JETON" $B                        # le contrat : types, limites
curl -X POST -H "Authorization: Bearer $JETON" $B/lots            # ouvre (ou reprend) un lot ; copier le champ `lotId` de la réponse JSON
curl -X PUT -H "Authorization: Bearer $JETON" -H 'content-type: application/json' "$B/fiches/lieu:port-sel?lot=<lotId>" \
  -d '{"type":"lieu","titre":"Port-Sel","sections":[{"cle":"desc","titre":"Description","contenu":"Un port.\n\n:::mj\nTenu en sous-main.\n:::","joueursLisent":true},{"cle":"verite","titre":"Vérité","contenu":"…"}]}'
```
Une section lue des seuls MJ omet `joueursLisent`. Réponse `creee`, puis `inchangee` au rejeu ; E-18 montre les lots. En `lea` (même serveur, même port que `B` ; `curl -c /tmp/j -d compte=lea http://localhost:3055/connexion-bouchon`, puis `GET /api/univers/<id de l'univers>/fiches/<id rendu par le PUT>` avec `-b /tmp/j`), « Description » se lit sans « sous-main » (le bloc MJ) et « Vérité » n'existe pas. Sans `?lot=`, l'écriture réussit mais aucun lot ne la compte. A field the endpoint does not handle is ignored without a warning, e.g. `fichiers` sent on the sheet instead of inside a section: nothing is attached, so put it in the section. Available routes: `GET /`, the three batch routes, `PUT /fiches/:cle`, `PUT /fichiers/:cle`, `DELETE /fiches/:cle` (see « Deletion recipe »), `PUT /campagnes/:cle`, `PUT /campagnes/:cle/scenarios/:scle` and `POST /fiches/:cle/relations` (see « Import sample acceptance »). Unhandled fields are ignored without a warning ( `parent` (clé d'origine) est traité, voir « Recette de l'arbre » ; `alias` et `etiquettes` sont écrits, voir « Recette de la recherche »). Un `compte_rendu` est accepté avec une `campagne` connue (clé d'origine) ; sans elle, ou avec une clé inconnue, il est refusé (400, `champ: campagne`). Le contenu est rendu en Markdown (AD-95) ; un contenu qui porte `:::mj … :::` produit le même bloc MJ que l'écran (AD-114).

**File import recipe** (`kanevas-fichiers-put`; « the script » is the external import script that calls this API, kept outside this repository): with `$JETON` and `$B` from the import recipe above (redefine `B` with the port the server was started on, e.g. `B=http://localhost:3055/api/import/v1/univers/4` for the 3055 of the other recipes; close any open batch first, or `POST $B/lots` resumes it), open a batch (`LOT=$(curl -s -X POST -H "Authorization: Bearer $JETON" $B/lots | node -pe 'JSON.parse(require("fs").readFileSync(0)).lotId')`; or copy the `lotId` by hand), make a small PDF (`printf '%%PDF-1.4\n' > tarifs.pdf` is enough; any real PDF works), then send `curl -X PUT -H "Authorization: Bearer $JETON" -F "nom=Tarifs du port" -F "fichier=@tarifs.pdf" "$B/fichiers/doc:tarifs?lot=$LOT"` (`nom` is required, a missing one is a 400). A closed batch refuses any further `PUT` (409 `lot_clos`). The response is `creee`; close the batch with `POST $B/lots/<lotId>/clore`. Replaying in a new batch returns `inchangee`; replacing the bytes returns `mise_a_jour`. Add `-F "visibilite=mj"` before `fichier` for GM-only files. Change the name or visibility on E-19, then replay: the manual change stays and the batch warns. An empty file returns 400 with `champ: fichier`, counted as refused; a revoked token returns 401. `GET $B` exposes `limites.fichiersJointsParSection: 100`.

**File references recipe** (`kanevas-fichiers-references`): with the same `$JETON`, `$B` and a batch open, push a sheet first with `"illustration": "img:plan"`, `"fichiers": ["doc:tarifs"]` in a section, or `![](fichier:cle:img:quais)` in a text. Files not sent yet leave the sheet `creee` with one warning per key and the references counted « en attente » at the batch closing; the GM sees « Fichier en attente d'import : « img:quais ». » on the sheet, a player nothing. `PUT $B/fichiers/img:quais` (an image, `-F "nom=Quais" -F "fichier=@quais.png"`: `nom` is required) and `PUT $B/fichiers/doc:tarifs` (a PDF, `-F "nom=Tarifs"`), sent like the file recipe above, then resolve them without a new version; replaying everything returns `inchangee`/`inchangé`. An `illustration` naming a document is a 400 `pas_une_image`; more than 100 `fichiers` in a section is a 400 `invalide`.

**Recette de la recherche** (`kanevas-import-recherche`, en bouchon : `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, base neuve semée ; avec Docker, la commande de la section « mode bouchon » ci-dessus). En `lea`, « Rechercher » de la barre (ou la touche `/` hors d'un champ) ouvre E-17 : « salport » rend « Port-Sel » avec « alias : Salport » ; « sous-main » (mot du seul bloc MJ) : « Aucune fiche ne correspond. » ; la pastille « Côte des Brumes » ne laisse que les fiches qu'elle lit. En `antor`, « sous-main » rend « Port-Sel », et rien en « Mode Joueur » (l'adresse porte `mode=joueur`). Dans « Lame d'Ébène », « Savoir » désactivé (en `antor`, E-14 « Types de fiche » de l'univers) : « chronique » rend encore « Chronique de l'Âge d'Ombre », sans pastille « Savoirs ». Sur la fiche « Port-Sel », en `antor`, « ⋯ ▸ Alias et étiquettes… » pose alias et étiquettes ; leurs limites sont 20 alias de 120 caractères. Par l'API d'import, un `PUT` de `lieu:port-sel` avec `"alias":["Salport"],"etiquettes":["Côte des Brumes"]` dans « Essai Kanka » rend `creee`, puis `inchangee` au rejeu (ordre et casse indifférents) ; un alias ajouté dans Kanevas n'est pas écrasé et le lot l'avertit.

**Recette de l'arbre** (`kanevas-import-arbre`, en bouchon : `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, base neuve semée, « Essai Kanka » a l'id 4). Dans « Lame d'Ébène », « Port-Sel » est rangée sous « Les Sphères » (MJ seul), avec cinq lieux dessous dont « Le Repaire des contrebandiers » (MJ seul). En `antor`, « Lieux » ▸ bascule « Arbre » (le choix survit au rechargement) : déplier « Les Sphères », puis « Port-Sel » montre « La Taverne du Kraken ». En `lea`, « Port-Sel » est une racine ; sa fiche a le fil « Lame d'Ébène › Lieux › Port-Sel » et « Contient » nomme quatre lieux, pas le Repaire. En `antor`, « ⋯ ▸ Déplacer sous… » : « Les Sphères » sous « Port-Sel » est refusé (« Une fiche ne peut pas être rangée sous l'un de ses descendants. »), « Les Docks » sous « Les Sphères » donne le toast « Fiche déplacée. ». Par l'API d'import avec le jeton du bouchon (`JETON` et `B` de la recette ci-dessus, avec le port 3055 de ce serveur : `B=http://localhost:3055/api/import/v1/univers/4` ; ces fiches sont celles de « Essai Kanka », distinctes de « Les Docks » de « Lame d'Ébène » ci-dessus ; ouvrir un lot par `curl -X POST -H "Authorization: Bearer $JETON" $B/lots`, copier son `lotId`, puis mettre `?lot=<lotId>` sur chaque `PUT` et clore le lot pour que le compte soit rendu) : `PUT $B/fiches/lieu:les-docks` avec le corps `{"type":"lieu","titre":"Les Docks","parent":"lieu:port-sel-absent"}` (`type` et `titre` sont obligatoires) écrit la fiche sans parent et répond l'avertissement « parent lieu:port-sel-absent inconnu : fiche écrite sans parent » (à la clôture, le lot compte les liens et parents en attente de **tout l'univers**, pas ceux du seul lot) ; le `PUT` de `lieu:port-sel-absent` puis le rejeu de « Les Docks » posent le parent (`mise_a_jour`) ; un parent changé à la main n'est plus écrasé (« parent modifié dans Kanevas : non écrasé »).

**Deletion recipe** (`kanevas-import-tenir`, in stub mode: `npm run build && PORT=3055 DB_PATH=/tmp/k.db KANEVAS_STUB=1 npm start`, fresh seeded database: remove the file or change `DB_PATH` before replaying the other recipes, since this one deletes « Port-Sel » and universe 4; « Essai Kanka » is universe 4). As `antor` in « Lame d'Ébène », sheet « Port-Sel »: click the title, type « Port-Sel-sur-Brume », Enter renames it. « ⋯ ▸ Supprimer la fiche… » opens a box that counts what goes (3 sections, 3 relations, 1 map place, 2 files that stay, 5 children moved under « Les Sphères ») and says the files stay in the media library; confirming returns to the list of the type (toast « Fiche supprimée. »), the old address answers « Page introuvable. », the children sit under « Les Sphères », and a link to it (section « Apparence » of « Maître Aldric ») reads « lien cassé » for `antor` and plain text for `lea`. In « Essai Kanka » ▸ settings, « Supprimer l'univers »: typing « essai kanka » leaves the button inactive, the exact name deletes it and `lea` no longer sees it. Without a browser (`JETON` as in « Recette de l'accès par API » above; `B=http://localhost:3055/api/import/v1/univers/4`; open a lot with `curl -X POST -H "Authorization: Bearer $JETON" $B/lots` and set `LOT` to the `lotId` of the answer (`POST $B/lots/$LOT/clore` then `GET $B/lots/$LOT` shows `compteurs.fiches.supprimees`); the body of the `PUT` is `{"type":"lieu","titre":"Havre-Gris","sections":[]}`, « Havre-Gris » is not in the seed): `curl -X PUT -H "Authorization: Bearer $JETON" -H 'content-type: application/json' -d '{"type":"lieu","titre":"Havre-Gris","sections":[]}' "$B/fiches/lieu:havre-gris?lot=$LOT"`, then `curl -X DELETE "$B/fiches/lieu:havre-gris?lot=$LOT" -H "Authorization: Bearer $JETON"` (204), and the same `PUT` answers `creee` again (no tombstone).

### Tests de bout en bout

`npm test` joue aussi `src/e2e/` : `node dist/server.js` en bouchon, piloté par un vrai Chromium via
Playwright. Le build n'est lancé que si `dist/public/index.html` manque : après un changement dans
`src/` ou `frontend/`, relancer `npm run build` avant `npm test`, sinon ces tests jouent l'ancien code.
Les textes de `docs/ecrans.md` sont écrits avec l'apostrophe droite ; l'interface porte l'apostrophe typographique (’).
Playwright n'est pas une dépendance du dépôt : il doit être installé globalement
(`/usr/lib/node_modules` ou `/usr/local/lib/node_modules`) or in the current directory (`npm install --no-save playwright@1.63.0`) avec un Chromium, ce que ne fait pas
`node:20-bookworm-slim` ; le workflow manuel `tests.yml` l'installe en local, donc il joue les e2e. Pour savoir s'il est vu : `ls /usr/lib/node_modules/playwright` (this only proves the package: Chromium must be installed too, possibly under `PLAYWRIGHT_BROWSERS_PATH`). Là où il manque, ces tests sont **ignorés avec un message**,
sans échec ; les autres tests (services, routes HTTP) tournent partout. Compter une dizaine de minutes même sans les e2e, une trentaine avec Playwright (2406 tests, silencieuse jusqu'à la fin ; un message « ignoré » en tête de sortie dit que Playwright n'est pas vu). 
An e2e test must wait for the state it reads (an element appearing or disappearing, navigation completing), never a fixed delay: under load, a test that reads the DOM too early fails at random. To reproduce the conditions of `tests.yml` (4 cores, two files at a time), run from the repository root (about 28 minutes for `src/e2e` in a pod), after `npm run build` (a stale `dist/` silently plays the old code: rebuild after any change to `src/` or `frontend/`) and without rerunning typecheck or build: `taskset -c 0-3 node --import tsx --test --test-concurrency=2 $(find src/e2e -name '*.test.ts')`. If an e2e test times out under heavy load (8 s in files that set it, Playwright's default of 30 s elsewhere), rerun it alone (`node --import tsx --test src/e2e/<fichier>.test.ts`) before treating it as a defect.
Recette de l'administration en bouchon (le monde de démonstration est semé : « Lame d'Ébène », « Les Landes grises », « Les Cendres de Vaëlis », cinq comptes déjà connus) : se connecter en « Admin », ouvrir `/administration`, choisir « Lame d'Ébène » (où Admin n'a aucun rôle) et ajouter « mira ». Un compte jamais connecté (« nadia ») est refusé. Les e2e `src/e2e/administration*.test.ts` pilotent E-5.
Recette du jeton de l'assistant en bouchon (P-15) : en « Admin », sur `/administration`, le panneau « Jeton de l'assistant » dit « Aucun jeton posé. » ; « Connecter l'abonnement » montre une adresse (fixe en bouchon) et un champ « Code » ; `bouchon` donne « Jeton posé le … » ; tout autre code, « La connexion n'a pas abouti. Recommencez. » et l'état d'avant reste. La valeur du jeton n'apparaît jamais ; « lea » reçoit « Page introuvable. ». En bouchon l'assistant répond déjà par son script : la disponibilité réelle se joue sur l'URL déployée (premier vrai appel au modèle, geste de Monsieur). Sans navigateur, sur le serveur lancé plus haut avec `PORT=3055` (`curl -c /tmp/j -d compte=admin http://localhost:3055/connexion-bouchon`), puis, avec `-b /tmp/j` : `POST /api/instance/assistant/jeton/connexion` (rend `connexionId`, `adresse`, `expireLe`), `POST …/jeton/code` avec `-H 'Content-Type: application/json' -d '{"connexionId":"…","code":"bouchon"}'` (sans cet en-tête le corps n'est pas lu en JSON et la réponse est 400) et `GET …/jeton` pour l'état. Hors bouchon, la connexion lance `script` (paquet `bsdutils`, présent dans `node:20-bookworm-slim`, base de l'image) : sans lui, `connexion_impossible`. Le jeton posé écrit `claude/oauth-token` à côté de la base (`./data/claude/` en développement).
Recette de l'image en bouchon : en « antor », ouvrir le panneau de l'assistant dans « Lame d'Ébène » et demander « Fais un portrait pour « Apparence » d'« Maître Aldric » » (à recopier tel quel, guillemets « » compris : le bouchon les cherche, sans eux il répond « Je ne sais répondre qu'à des demandes de test… ») : le fil montre « Image attachée à la section… » avec une vignette et « Ouvrir la section », et l'image figure dans la médiathèque (E-19), « Visible des joueurs » ou « Réservé au MJ » selon la section ; une demande qui contient « échec » n'attache rien (la médiathèque ne gagne aucun fichier) et répond « Je n'ai pas pu générer l'image. » ; en « lea », l'assistant n'a pas l'outil. Le vrai moteur (Codex) ne se joue que sur l'URL déployée, avec l'`auth.json` de l'exploitant.

Recette des cartes en bouchon (le semis ne contient aucune carte) : en « antor », ouvrir « Cartes » de « Lame d'Ébène », créer « La ville de Brume » (carte illustrée, avec une image en fond), y ajouter une fiche, puis « Rendre visible » ; se reconnecter en « lea » : la carte est dans sa liste, avec les seuls tokens des fiches qu'elle lit. Un graphe se crée de même (forme « Graphe »). Le mode Joueur d'Antor montre ce que voit Léa.

## Réglages

La liste de départ est `.env.example` (elle porte aussi `NODE_ENV`, `ANTHROPIC_API_KEY` et `ANTHROPIC_MODEL` ; seuls `ANTHROPIC_MODEL`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_DIR` et `CODEX_HOME` servent, à l'assistant ; `ANTHROPIC_API_KEY` n'est lue par aucune route). En plus : `APP_NAME` (défaut `kanevas` ; seul le texte de `/healthz` le reprend),
`APP_VERSION` (défaut `0.0.0-dev`, posée par le build-arg en image), `PORT` (3001), `DB_PATH` (fichier SQLite ; défaut `/data/kanevas.db` avec `NODE_ENV=production`, `./data/kanevas.db` en développement), `ATTACHMENTS_DIR` (media library files; defaults to `attachments/` beside the database, hence `/data/attachments` in production), `SESSION_SECRET` (≥ 16 caractères ; à défaut `session.key`, créée à côté de la base : `/data/session.key` en production, `./data/session.key` en développement), `KANEVAS_STUB` (`1`), `KANEVAS_SANS_SEMIS` (`1` : pas de monde de démonstration en bouchon), `FRONTEND_DIR` (dossier du frontend construit ; posé par les tests de routes, inutile à l'exploitation), `LLM_PROVIDER` (`mock` | `anthropic` | `claude-agent`, défaut `mock` ; lu par le seul transport texte, que l'assistant n'emploie pas), `CLAUDE_CODE_OAUTH_TOKEN` (jeton de l'abonnement Claude, posé par l'exploitant ; vide et sans jeton posé depuis l'administration = l'assistant est indisponible hors bouchon et le dit, il ne retombe jamais sur le bouchon, AD-77), `CLAUDE_DIR` (dossier du fichier `oauth-token` posé depuis l'administration ; défaut `claude/` à côté de la base, donc `/data/claude` en production, sous le dossier temporaire et perdu au redémarrage si la base est en mémoire, c'est-à-dire sans volume ; ce fichier prime sur la variable, AD-109), `CODEX_HOME` (dossier de l'`auth.json` de Codex, posé par l'exploitant ; défaut `codex/` à côté de la base, donc `/data/codex` en production ; sans `codex` exécutable ni `auth.json`, l'assistant n'offre pas la génération d'image, AD-88). `codex` (paquet npm `@openai/codex`, version épinglée par `CODEX_VERSION` dans le `Dockerfile`) n'est installé que dans l'image ; hors image, `npm i -g @openai/codex` le met sur le `PATH`. Rien ne dit l'adaptateur choisi : l'outil `generer_image` est présent dans le catalogue du MJ si et seulement si l'adaptateur n'est pas `aucun`.

## Version de l'application

`/healthz` répond `kanevas <version>`. Cette version vient **exclusivement**
du build-arg Docker `APP_VERSION`, jamais de `package.json` (qui n'en porte
volontairement pas) :

```bash
# sans --build-arg, la version vaut 0.0.0-dev
docker build --build-arg APP_VERSION=0.1.0 -t kanevas:0.1.0 .
docker run --rm -p 3001:3001 kanevas:0.1.0
curl http://localhost:3001/healthz   # -> "kanevas 0.1.0"
```

Une image n'est construite que sur un tag `v*` dont le commit porte l'attestation « tests-complets » : `npm run tests:attestes -- --publier` (poste de travail, pod de la chaîne) ou le workflow manuel `tests.yml` la posent après une suite complète ; `docker-publish.yml` ne joue aucun test, il vérifie cette preuve (sans elle, le tag ne produit aucune image ; pas de build sur `main` ni sur les PR).

Sur un tag, la CI dérive ce même build-arg du tag semver poussé (`docker/metadata-action`)
: pousser `v0.1.0` publie `ghcr.io/antorfr/kanevas:0.1.0` avec `APP_VERSION`
embarqué à `0.1.0` — une seule source de vérité pour la version affichée et le
tag publié. Seul un tag donne une version fiable : aucun build automatique n'existe hors tag.

## OIDC

`GET /api/auth/oidc/login` et `GET /api/auth/oidc/callback` reprennent la
mécanique générique d'Antre-du-maitre (découverte OIDC, PKCE, state), arrêtée
à l'authentification de l'identité : le callback ouvre la session (cookie signé,
7 jours, AD-56) et crée le compte à la première connexion ; les rôles d'univers ne
viennent jamais d'Authelia (AD-9). `KANEVAS_STUB=1` remplace Authelia par le choix d'un
compte de test (`/connexion-bouchon`, AD-55). `GET /api/auth/config` répond `{oidcEnabled}`. Sans les quatre variables
`OIDC_*` posées (voir `.env.example`) — même si une partie seulement l'est —
login et callback répondent `404` : pas de mode dégradé. Une valeur posée mais
vide ou invalide (URL mal formée) fait en revanche échouer le démarrage
(`ZodError`, `src/config/env.ts`).

## Déploiement

Hors de ce dépôt : chart Helm `charts/kanevas` dans `smart-home-charts`,
manifeste `clusters/tantive/games/kanevas-helm-config.yml` et client OIDC
`kanevas` (`clusters/homenode/infra/authelia-helm-config.yml`) dans
`k8s-home-lab`. Ordre : publier l'image (tag `vX.Y.Z`), publier le chart, puis
fusionner `k8s-home-lab`, dont la fusion déploie.

See `ARCHITECTURE.md` for the code map, invariants and rejected options. Its table lists the epic's
retained `AD-n` decisions, including those still awaiting implementation; “La cible” identifies what
is built. Decision numbers are stable; gaps correspond to withdrawn decisions or other slices.
Design documents (`plan.md`, `technique.md`, `socle-projet`) live outside this repository, in the
SDLC tracking store. There, “Monsieur” is the stakeholder who performs acceptance checks, “tranche”
is a delivered feature and “phase merge” is the merge after acceptance. Material that must outlive
those design documents is kept in `ARCHITECTURE.md` and `docs/`.
