import { defineConfig } from 'vite';

// Builds only the Wasm proof page (AD-rust-7), never into dist/public; the tests pass `outDir`.
// `assetsInlineLimit: 0` keeps the small .wasm a hashed file under /assets/ instead of a data URI (AD-rust-9).
export default defineConfig({
  root: `${import.meta.dirname}/src/wasm/essai`,
  base: '/',
  build: { outDir: `${import.meta.dirname}/../dist/essai-wasm`, emptyOutDir: true, assetsInlineLimit: 0 },
  server: { fs: { allow: [`${import.meta.dirname}/..`] } },
});
