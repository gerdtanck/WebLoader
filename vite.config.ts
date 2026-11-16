import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: false,
  build: { outDir: 'artifacts/site', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, strictPort: true, fs: { strict: true } },
  preview: { port: 4173, strictPort: true },
});
