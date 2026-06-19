import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5174, strictPort: true },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
});
