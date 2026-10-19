import { defineConfig } from 'vite';

export default defineConfig({
  base: '/IndoorKit/',
  build: { chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
