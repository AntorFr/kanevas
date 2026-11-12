// `npm run build` step: copies rust/pkg to dist/wasm without compiling any Rust (AD-rust-3).
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!existsSync('rust/pkg')) {
  console.error('rust/pkg/ is missing: run `npm run build:wasm` first.');
  process.exit(1);
}
mkdirSync('dist', { recursive: true });
cpSync('rust/pkg', 'dist/wasm', { recursive: true });
// The image's last check runs from dist/wasm/ (AD-rust-5); read next to this script, whatever the working directory.
copyFileSync(fileURLToPath(new URL('./verifier-wasm.mjs', import.meta.url)), 'dist/wasm/verifier.mjs');
