import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Relative asset paths, so the built game works from any folder, such as GitHub Pages'
  // https://<user>.github.io/<repo>/.
  base: "./",
  server: { host: true, port: 5173 },
  // Three.js alone is ~600 kB minified.
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ["src/**/*.test.ts"] },
});
