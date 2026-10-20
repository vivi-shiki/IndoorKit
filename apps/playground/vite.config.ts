import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/IndoorKit/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
