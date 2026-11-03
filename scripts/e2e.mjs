// End-to-end check of the house editor in headless Chromium.
//
//   npm run e2e -- [--out DIR]
//
// Builds a house from an empty plot through the real UI (plan tools, sidebar controls,
// undo/redo) and asserts on the resulting model. With --out, saves screenshots there.

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const outDir = values.out && resolve(values.out);
if (outDir) await mkdir(outDir, { recursive: true });

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let step = 0;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.architect);
  await page.waitForTimeout(200);

  const shot = async (name) => outDir && (await page.screenshot({ path: join(outDir, `${String(++step).padStart(2, "0")}-${name}.png`) }));
  const house = () =>
    page.evaluate(() => {
      const h = window.architect.store.house;
      return { walls: h.walls.length, openings: h.openings.map((o) => o.kind), area: h.floorArea(), roof: h.roof?.style ?? null };
    });
  const at = (x, y) => page.evaluate(([x, y]) => window.architect.plan.clientPoint(x, y), [x, y]);
  const click = async (x, y) => {
    const p = await at(x, y);
    await page.mouse.click(p.x, p.y);
  };
  const dragPlan = async ([x0, y0], [x1, y1]) => {
    const [a, b] = [await at(x0, y0), await at(x1, y1)];
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  };
  const status = () => page.locator(".status").innerText();
  await shot("start");

  // Start from an empty plot.
  await page.selectOption("#sidebar select[title='Replace the house']", "empty");
  assert.equal((await house()).walls, 0);

  // Room tool: drag a 10 x 7 m rectangle inside the setback.
  await page.keyboard.press("r");
  await dragPlan([5, 6], [15, 13]);
  let h = await house();
  assert.equal(h.walls, 4, "room makes four walls");
  assert.equal(h.area, 70);
  assert.match(await status(), /needs at least one door/);
  assert.match(await status(), /needs a roof/);

  // Door on the front wall (y = 6), two windows.
  await page.keyboard.press("d");
  await click(10, 6.05);
  await page.keyboard.press("n");
  await click(7, 6);
  await click(13, 13);
  h = await house();
  assert.deepEqual(h.openings.sort(), ["Door", "Window", "Window"]);

  // Roof from the sidebar.
  await page.selectOption("#sidebar .house select >> nth=1", "Gable");
  h = await house();
  assert.equal(h.roof, "Gable");
  assert.match(await status(), /Ready to sell/);
  await shot("room-with-roof");

  // Select tool: push the back wall out by 2 m (drag from y=13 to y=15).
  await page.keyboard.press("v");
  await dragPlan([9, 13], [9, 15]);
  assert.equal((await house()).area, 90, "pushing the back wall grows the room");

  // Undo restores the size; redo re-applies it.
  await page.keyboard.press("Control+z");
  assert.equal((await house()).area, 70);
  await page.keyboard.press("Control+Shift+z");
  assert.equal((await house()).area, 90);

  // Drag a corner diagonally: the footprint is no longer a rectangle, so the gable is refused.
  await dragPlan([15, 15], [17, 17]);
  assert.match(await status(), /Gable roofs need a rectangular footprint/);
  await page.keyboard.press("Control+z");
  assert.doesNotMatch(await status(), /rectangular footprint/);

  // Slide the door along its wall.
  const doorBefore = await page.evaluate(() => window.architect.store.house.openings.find((o) => o.kind === "Door").offset);
  await dragPlan([10, 6], [12, 6]);
  const doorAfter = await page.evaluate(() => window.architect.store.house.openings.find((o) => o.kind === "Door").offset);
  assert.ok(Math.abs(Math.abs(doorAfter - doorBefore) - 2) < 0.06, `door moved ${doorBefore} -> ${doorAfter}`);

  // Select a window and delete it.
  await click(7, 6);
  assert.equal(await page.locator(".selection h2").textContent(), "Window");
  await page.keyboard.press("Delete");
  assert.deepEqual((await house()).openings.sort(), ["Door", "Window"]);

  // Wall tool: an L-shaped annex on a fresh plot, closed by clicking the first corner.
  await page.selectOption("#sidebar select[title='Replace the house']", "empty");
  await page.keyboard.press("w");
  for (const [x, y] of [[4, 5], [16, 5], [16, 10], [10, 10], [10, 16], [4, 16], [4, 5]]) await click(x, y);
  h = await house();
  assert.equal(h.walls, 6);
  assert.equal(h.area, 12 * 5 + 6 * 6);
  await page.selectOption("#sidebar .house select >> nth=1", "Flat");
  await page.keyboard.press("d");
  await click(7, 5);
  assert.match(await status(), /Ready to sell/);
  await shot("l-shape");

  // The wall-height slider updates every wall.
  await page.locator("#sidebar .house input[type=range] >> nth=0").fill("3.5");
  assert.deepEqual(await page.evaluate(() => [...new Set(window.architect.store.house.walls.map((w) => w.height))]), [3.5]);

  // Clicking an issue selects the offending wall.
  await page.keyboard.press("v");
  await dragPlan([4, 16], [1, 16]); // outside the 3 m setback
  await page.locator(".issues li[data-kind=wall]").first().click();
  assert.equal(await page.locator(".selection h2").textContent(), "Wall");
  await shot("issue-selected");

  // The house survives a reload (autosave).
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.architect);
  assert.equal((await house()).walls, 6);

  // Layout switch.
  await page.click(".layout-switch button[data-layout=plan]");
  assert.equal(await page.locator("#view3d").isVisible(), false);
  await page.click(".layout-switch button[data-layout=split]");
  await shot("reloaded");

  assert.deepEqual(errors, [], "no page errors");
  console.log("e2e: all checks passed");
} catch (e) {
  console.error(e);
  if (errors.length) console.error("page errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
