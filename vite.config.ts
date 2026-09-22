import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  // Keep existing files intact; packaging selects only this build's manifest entries.
  build: { emptyOutDir: false, manifest: true, sourcemap: false },
});
