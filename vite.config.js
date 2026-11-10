import { defineConfig } from 'vite';

// Production is served from https://kalikeefbiz.github.io/Almond-Valley/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Almond-Valley/' : '/',
  build: { target: 'es2019', chunkSizeWarningLimit: 900 },
}));
