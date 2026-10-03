import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The build lands in dist/public, next to the compiled server, which serves it (AD-57).
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: '../dist/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
