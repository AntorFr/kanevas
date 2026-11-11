// `npm run build` step: copies rust/pkg to dist/wasm without compiling any Rust (AD-rust-3).
import { cpSync, existsSync, mkdirSync } from 'node:fs';

if (!existsSync('rust/pkg')) {
  console.error('rust/pkg/ is missing: run `npm run build:wasm` first.');
  process.exit(1);
}
mkdirSync('dist', { recursive: true });
cpSync('rust/pkg', 'dist/wasm', { recursive: true });
