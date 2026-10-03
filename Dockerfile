# Patron repris d'Antre-du-maitre (AD-10), débarrassé de ses étapes Prisma.

FROM node:20-bookworm-slim AS deps

WORKDIR /app

# python3, make and g++: better-sqlite3 compiles itself when no prebuilt binary
# is found for the base image (node-gyp). Build stage only: the runtime stage
# copies the compiled node_modules and needs none of them.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
COPY frontend ./frontend

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Seule source de vérité pour la version affichée et publiée : jamais
# package.json (plan.md, critère de sortie de cette tâche).
ARG APP_VERSION=0.0.0-dev

ENV NODE_ENV=production
ENV PORT=3001
ENV APP_VERSION=${APP_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist

# Run as the non-root "node" user (uid 1000) shipped by the base image.
# /data is a mounted volume (AD-5/AD-7, vide à ce stade). Under uid 1000 its
# hostPath must be writable by that user; the cluster actually runs the pod as
# root (see ARCHITECTURE.md).
RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
