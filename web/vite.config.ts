import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true, port: 5173 },
  // Three.js alone is ~600 kB minified.
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ["src/**/*.test.ts"] },
});
