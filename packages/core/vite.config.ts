import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts', twin: 'src/twin/index.ts' }, formats: ['es'] },
    rollupOptions: { external: [/^@indoorkit\//, /^three(?:\/|$)/, 'maplibre-gl', 'zod'] },
  },
});
