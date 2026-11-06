import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: true, port: 5173 },
  // Three.js alone is ~600 kB minified.
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ["src/**/*.test.ts"] },
});
