# Architecture — kanevas

Compagnon de campagne JDR. Ce dépôt ne porte encore que le **socle** : une
application Fastify (Node 20, TypeScript) qui répond `GET /healthz`, une
mécanique OIDC d'identité, une image publiée par la CI. Aucune fonction métier.

## Carte

- `src/server.ts`, `src/app.ts` : démarrage et assemblage de l'app Fastify
  (`buildApp`), seule application du dépôt ; toutes les routes futures s'y
  enregistrent.
- `src/config/env.ts` : unique lecture de l'environnement (zod).
- `src/routes/health.ts` : `registerHealthRoutes`, `GET /healthz`.
- `src/routes/auth.ts`, `src/services/oidc.ts` : login et callback OIDC.
- `src/services/llm/` : transports LLM (`transport.ts`, `anthropic-transport.ts`,
  `claude-agent-transport.ts`), repris d'Antre-du-maitre, branchés nulle part.
- `Dockerfile` (multi-stage, utilisateur `node`) et
  `.github/workflows/docker-publish.yml` (tests puis image GHCR).

Volume `/data` : emplacement réservé de SQLite et des pièces jointes, vide.

## Invariants

- **La version a une seule source** : le build-arg Docker `APP_VERSION`, dérivé
  par la CI du tag semver poussé. `/healthz` et le tag d'image publié ne
  peuvent donc pas diverger. `package.json` ne porte volontairement aucun
  `version`.
- **`/healthz` est public**, en texte brut `kanevas <version>`, sans donnée.
- **Le callback OIDC authentifie une identité et s'arrête là** : pas de session,
  pas de rôle, pas de persistance. Les rôles par univers (AD-9) viendront d'une
  lecture de `univers_membres`, dans la feature d'identité. Sans les quatre
  variables `OIDC_*`, les routes OIDC répondent 404.
- **Aucune table, aucun ORM** : AD-5 (SQLite) ne réserve que le volume.
- **Rien n'appelle un LLM** : les transports compilent mais ne sont reliés à
  aucune route. Aucun secret `ANTHROPIC_API_KEY` n'est déployé.
- Client OIDC : `client_id` `kanevas`, callback
  `https://kanevas.tantive.berard.me/api/auth/oidc/callback`, émetteur
  `https://auth.berard.me`. Ces valeurs sont partagées avec la déclaration du
  client dans `k8s-home-lab` : les changer ici impose de changer là-bas.

## Décisions et options écartées

- **Dépôt neuf, reprise sélective d'Antre-du-maitre (AD-10)** : bootstrap
  Fastify, OIDC, transports LLM, patron Dockerfile et CI, sans Prisma ni le
  domaine métier. Écarté : forker Antre-du-maitre.
- **OIDC câblé dès le socle**, pas différé : AD-10 le range parmi ce qui est
  repris au socle. `claude-token.ts` (fenêtre admin de setup-token, route de
  contenu) n'est **pas** repris : à rapporter avec la feature qui active un LLM.
- **Pas de frontend ni de page canari** : `/healthz` en texte brut suffit. À
  rouvrir si la bibliothèque de composants a besoin d'une page avant la première
  page métier.
- **Dépôt public, licence MIT** : le package GHCR public évite pull-secret et
  auto-bump Renovate ; MIT faute de politique de licence commune dans le parc.
  Renversé seulement si le code devait devenir confidentiel.
- **Version lue depuis `package.json`** : écarté, deux sources non synchronisées.
- Tourne en `runAsUser: 0` au cluster (hostPath inscriptible, convention des
  apps `games`), alors que l'image est non-root.
