// Render the four appraisal views of a sample house to PNG files, without a window.
//
//   npm run capture -- [--sample N] [--out DIR] [--screenshot]
//
// Starts the Vite dev server, loads the game in headless Chromium (software WebGL, so it
// works in containers without a GPU), calls `window.architect.captureViews()` and writes
// the images. `--screenshot` also saves the whole page, HUD included, as `page.png`.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    sample: { type: "string", default: "1" },
    out: { type: "string", default: "screenshots" },
    screenshot: { type: "boolean", default: false },
  },
});
const sample = Number(values.sample);
const outDir = resolve(values.out);

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.goto(`${url}?sample=${sample}`);
  await page.waitForFunction(() => window.architect !== undefined);

  await mkdir(outDir, { recursive: true });
  if (values.screenshot) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, "page.png") });
  }
  const views = await page.evaluate(() => window.architect.captureViews());
  for (const v of views) {
    const path = join(outDir, `house${sample}-${v.name}.png`);
    await writeFile(path, Buffer.from(v.dataUrl.split(",")[1], "base64"));
    console.log(`wrote ${path}`);
  }
} finally {
  await browser.close();
  await server.close();
}
