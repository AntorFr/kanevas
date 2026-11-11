#!/usr/bin/env bash
# Compiles every crate of rust/modules/ to Wasm and writes rust/pkg/<module>/ (AD-rust-3).
# Installs nothing: a missing tool is named, a wasm-bindgen CLI that differs from the lock is refused.
# CARGO_LOCK overrides the lock file read for the version check (tests force a mismatch with it).
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rust="$racine/rust"
lock="${CARGO_LOCK:-$rust/Cargo.lock}"

for outil in cargo wasm-bindgen; do
  command -v "$outil" >/dev/null 2>&1 || { echo "Missing tool: $outil (not in PATH); this script installs nothing." >&2; exit 1; }
done
rustup target list --installed 2>/dev/null | grep -qx wasm32-unknown-unknown \
  || { echo "Missing tool: the wasm32-unknown-unknown target of rustc (rustup target add wasm32-unknown-unknown)." >&2; exit 1; }

# The version of the wasm-bindgen crate in the lock file.
attendue="$(awk '/^name = "wasm-bindgen"$/ { getline; gsub(/version = |"/, ""); print; exit }' "$lock")"
[ -n "$attendue" ] || { echo "No wasm-bindgen entry in $lock." >&2; exit 1; }
installee="$(wasm-bindgen --version | awk '{print $2}')"
if [ "$installee" != "$attendue" ]; then
  echo "wasm-bindgen version mismatch: the lock file wants $attendue, the installed CLI is $installee. Install wasm-bindgen-cli $attendue." >&2
  exit 1
fi

cd "$rust"
cargo build --release --target wasm32-unknown-unknown --workspace --locked

rm -rf pkg
for dir in modules/*/; do
  [ -f "$dir/Cargo.toml" ] || continue
  nom="$(awk -F'"' '/^name *=/ { print $2; exit }' "$dir/Cargo.toml")"
  wasm="target/wasm32-unknown-unknown/release/${nom//-/_}.wasm"
  wasm-bindgen --target web --out-dir "pkg/$nom" "$wasm"
done
