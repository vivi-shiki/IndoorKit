import { defineConfig } from 'vite';

export default defineConfig({
  base: '/vivi-map/',
  build: { chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
