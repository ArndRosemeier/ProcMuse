import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths: the app is published inside a folder of a static host
  base: './',
  resolve: { conditions: ['source'] },
  worker: { format: 'es' },
  build: {
    // the publish step serves the repository's dist/ folder
    outDir: '../../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
