# Pattern reused from Antre-du-maitre (AD-10), minus its Prisma steps.

# Versions of the Wasm toolchain: each equals its source in the repository (a test reads both).
# RUST_VERSION = rust/rust-toolchain.toml, WASM_BINDGEN_VERSION = the wasm-bindgen entry of rust/Cargo.lock.
ARG RUST_VERSION=1.99.1
ARG WASM_BINDGEN_VERSION=0.2.130

# Wasm stage (AD-rust-5): the only one with a Rust toolchain. It copies the Rust workspace and its build
# script alone, so a change to src/ or frontend/ does not rebuild it.
FROM rust:${RUST_VERSION}-bookworm AS wasm

ARG WASM_BINDGEN_VERSION

WORKDIR /app

RUN rustup target add wasm32-unknown-unknown \
  && cargo install --locked --version =${WASM_BINDGEN_VERSION} wasm-bindgen-cli

COPY rust ./rust
COPY scripts/rust-wasm.sh ./scripts/rust-wasm.sh

RUN bash scripts/rust-wasm.sh

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
COPY scripts ./scripts
COPY --from=wasm /app/rust/pkg ./rust/pkg

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Single source of truth for the displayed and published version: never
# package.json.
ARG APP_VERSION=0.0.0-dev

ENV NODE_ENV=production
ENV PORT=3001
ENV APP_VERSION=${APP_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# The image engine (AD-50, AD-90): the `codex` executable, pinned. Its credentials are not in the image
# (`auth.json` is put in CODEX_HOME on the volume by the operator).
ARG CODEX_VERSION=0.162.0
RUN npm install -g @openai/codex@${CODEX_VERSION} \
  && npm cache clean --force \
  && codex --version

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
# Stand-in for `claude setup-token`, run only under KANEVAS_STUB=1 (AD-112 5).
COPY scripts ./scripts

# Run as the non-root "node" user (uid 1000) shipped by the base image.
# /data is a mounted volume (AD-5, empty for now). Under uid 1000 its
# hostPath must be writable by that user; the cluster actually runs the pod as
# root (see ARCHITECTURE.md).
RUN mkdir -p /data && chown -R node:node /data /app

USER node

# An image that cannot run its Wasm does not build (AD-rust-5).
RUN node dist/wasm/verifier.mjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
