// End-to-end check of the game in headless Chromium.
//
//   npm run e2e -- [--out DIR]
//
// Takes the first client's commission, designs a house that meets their brief through
// the real UI (plan tools, sidebar, dialogs), sells it and moves on to the next client.
// With --out, saves screenshots there.

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
  const model = () =>
    page.evaluate(() => {
      const { store } = window.architect;
      const h = store.house;
      return { client: store.client.id, walls: h.walls.length, area: h.floorArea(), labels: h.labels.map((l) => l.type).sort() };
    });
  const at = (x, y) => page.evaluate(([x, y]) => window.architect.plan.clientPoint(x, y), [x, y]);
  const click = async (x, y) => {
    const p = await at(x, y);
    await page.mouse.click(p.x, p.y);
  };
  const drag = async ([x0, y0], [x1, y1]) => {
    const [a, b] = [await at(x0, y0), await at(x1, y1)];
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  };
  // The plan redraws on the next animation frame.
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const roomCount = async () => (await frame(), page.locator(".plan .room").count());
  const unmetMusts = () => page.locator(".brief:not(.wishes) li.unmet").allTextContents();
  const status = () => page.locator(".status").innerText();
  const ROOM_NAMES = { Living: "Living room", Kitchen: "Kitchen", Bedroom: "Bedroom", Bathroom: "Bathroom", Hall: "Hall", Office: "Office" };
  /** Click a room in the plan and pick its use in the menu that opens. */
  const setRoom = async (x, y, type) => {
    await click(x, y);
    await page.click(`.popover .choices.rooms button[title="${ROOM_NAMES[type]}"]`);
    await page.keyboard.press("Escape");
  };
  /** Open a sidebar menu (Roof, Facade) and pick an option in it. */
  const fromMenu = async (menu, option) => {
    await page.click(`#sidebar .house button:has-text("${menu}")`);
    await page.click(`.popover button[title="${option}"]`);
    await page.keyboard.press("Escape");
  };

  // The first client introduces themselves.
  await page.locator("#modal .dialog").waitFor();
  assert.match(await page.locator("#modal h2").textContent(), /Lindgren/);
  await shot("client");
  await page.click("#modal button.primary");
  assert.equal(await page.locator("#modal").isHidden(), true);

  // The outer walls: a 10 x 8.5 m rectangle.
  await page.keyboard.press("r");
  await drag([9, 8], [19, 16.5]);
  assert.equal((await model()).area, 85);

  // Partitions, each drawn from one wall to another.
  await page.keyboard.press("w");
  for (const [a, b] of [
    [[9, 12.5], [19, 12.5]],
    [[13, 12.5], [13, 16.5]],
    [[15.5, 12.5], [15.5, 16.5]],
  ]) {
    await click(...a);
    await click(...b);
  }
  // An open-plan kitchen: a room boundary instead of a wall to the living room.
  await page.keyboard.press("b");
  await click(15, 8);
  await click(15, 12.5);
  await frame();
  assert.equal(await page.locator(".plan .boundary").count(), 1);
  assert.equal((await model()).walls, 8, "three partitions and a boundary");
  assert.equal(await roomCount(), 5, "five rooms");

  // Doors between rooms, and the front door.
  await page.keyboard.press("d");
  for (const p of [[12.3, 8], [11, 12.5], [14, 12.5], [17.25, 12.5]]) await click(...p);
  assert.equal(await page.evaluate(() => window.architect.store.house.openings.length), 4, "no door on the boundary");
  // Windows for the habitable rooms.
  await page.keyboard.press("n");
  for (const p of [[11, 8], [17, 8], [11, 16.5], [17.25, 16.5]]) await click(...p);

  // Say what each room is.
  await page.keyboard.press("v");
  for (const [x, y, type] of [[12, 10, "Living"], [17, 10, "Kitchen"], [11, 14.5, "Bedroom"], [14.2, 14.5, "Bathroom"], [17.25, 14.5, "Bedroom"]]) await setRoom(x, y, type);
  assert.deepEqual((await model()).labels, ["Bathroom", "Bedroom", "Bedroom", "Kitchen", "Living"]);
  assert.match(await status(), /The house needs a roof/);

  // A hip roof: one of the wishes.
  await fromMenu("Roof", "Hip");
  assert.deepEqual(await unmetMusts(), []);
  assert.match(await page.locator(".brief.wishes li.met").allInnerTexts().then((t) => t.join("\n")), /open plan between the kitchen and the living room/);
  assert.match(await status(), /No building problems/);
  await shot("lindgren-design");

  // Rooms furnish themselves for their use.
  const furniture = () => page.evaluate(() => window.architect.store.house.furniture.map((f) => ({ id: f.id, kind: f.kind, x: f.at.x, y: f.at.y })));
  const kinds = (await furniture()).map((f) => f.kind);
  for (const k of ["Bed", "Bathtub", "Toilet", "Sofa", "Counter"]) assert.ok(kinds.includes(k), `a ${k}`);

  // Floors, in the room's menu (clicking the room's name): a wooden bathroom floor is a
  // building problem; tiles are fine.
  await click(14.2, 14.5);
  assert.equal(await page.locator(".popover h2").textContent(), "Bathroom");
  assert.equal(await page.locator(".popover .choices.swatches button.active").getAttribute("title"), "Tiles");
  await page.click('.popover .choices.swatches button[title="Wood"]');
  assert.match(await status(), /wood is not a suitable floor here; choose tiles, stone or concrete/);
  await page.click('.popover .choices.swatches button[title="Tiles"]');
  assert.match(await status(), /No building problems/);

  // Furniture in the room's menu: remove a piece, add another.
  const bathroom = () => furniture().then((fs) => fs.filter((f) => f.x > 13 && f.x < 15.5 && f.y > 12.5 && f.y < 16.5).map((f) => f.kind).sort());
  const before = await bathroom();
  await page.click('.popover .furniture-list li:has-text("Washbasin") button[title="Remove"]');
  assert.deepEqual(await bathroom(), before.filter((k) => k !== "Sink"));
  await page.selectOption(".popover .add-furniture", "Washer");
  assert.ok((await bathroom()).includes("Washer"));
  assert.equal(await page.locator(".popover h2").textContent(), "Washing machine", "the new piece is selected");
  await page.click('.popover button:has-text("Rotate")');
  await page.keyboard.press("Escape");

  // Drag a piece of furniture in the plan.
  const washer = (await furniture()).find((f) => f.kind === "Washer");
  await drag([washer.x, washer.y], [washer.x - 0.5, washer.y]);
  const moved = (await furniture()).find((f) => f.id === washer.id);
  assert.ok(Math.abs(moved.x - (washer.x - 0.5)) < 0.06, `washer moved to ${moved.x}`);
  await page.keyboard.press("Delete");
  assert.ok(!(await furniture()).some((f) => f.id === washer.id), "Delete removes the selected piece");

  // A label left outside every room (as when its room is moved away) shows as an issue;
  // clicking the issue opens the label's menu, where it can be deleted.
  await page.evaluate(() => {
    const { store, core } = window.architect;
    const id = store.house.labels[0].id;
    store.edit((h) => (h.label(id).at = new core.Vec2(24, 20)));
  });
  assert.match(await status(), /is no longer inside a room/);
  await page.click('.issues li:has-text("is no longer inside a room")');
  assert.match(await page.locator(".popover p.sub").textContent(), /drag it into a room or delete it/);
  await page.click(".popover button.danger");
  assert.doesNotMatch(await status(), /is no longer inside a room/);
  await page.keyboard.press("Control+z"); // put the label back for the rest of the test
  await page.evaluate(() => {
    const { store, core } = window.architect;
    store.edit((h) => (h.labels[0].at = new core.Vec2(12, 10)));
  });
  assert.match(await status(), /No building problems/);

  // A stone facade, then back to plaster, from the Facade menu.
  await fromMenu("Facade", "Stone");
  assert.deepEqual(await page.evaluate(() => [...new Set(window.architect.store.house.walls.filter((w) => w.material === "Stone").map((w) => w.id))].length), 4);
  await fromMenu("Facade", "Plaster");

  // Clicking in 3D opens the menu for what was clicked: here the roof.
  await page.click(".layout-switch button[data-layout='3d']");
  await frame();
  const roofAt = await page.evaluate(() => {
    const r = document.querySelector("#view").getBoundingClientRect();
    for (let fy = 0.2; fy < 0.8; fy += 0.02) {
      const [x, y] = [r.left + r.width / 2, r.top + r.height * fy];
      if (window.architect.view3d.pick(x, y)?.kind === "roof") return { x, y };
    }
    return null;
  });
  assert.ok(roofAt, "the roof is somewhere in the middle of the view");
  await page.mouse.click(roofAt.x, roofAt.y);
  assert.equal(await page.locator(".popover h2").textContent(), "Roof");
  await page.keyboard.press("Escape");
  await page.click(".layout-switch button[data-layout='split']");

  // Look inside with the roof off.
  await page.keyboard.press("h");
  await page.waitForTimeout(200);
  await shot("roof-off");
  await page.keyboard.press("h");

  // Pushing the back wall out keeps the partitions attached; undo puts it back.
  await drag([12.25, 16.5], [12.25, 17.5]);
  assert.equal((await model()).area, 95);
  assert.equal(await roomCount(), 5);
  await page.keyboard.press("Control+z");
  assert.equal((await model()).area, 85);

  // A window in an interior wall is a building problem.
  await page.keyboard.press("n");
  await click(12, 12.5);
  assert.match(await status(), /window is in an interior wall/);
  await page.keyboard.press("Delete");
  assert.match(await status(), /No building problems/);

  // Present to the client: sold.
  await page.keyboard.press("v");
  await page.click("text=Present to client");
  await page.locator("#modal .dialog").waitFor();
  assert.match(await page.locator("#modal h2").textContent(), /Sold!/);
  await shot("sold");
  await page.click("#modal button.primary"); // Next client

  // The next client has their own plot and brief.
  await page.locator("#modal .dialog").waitFor();
  assert.match(await page.locator("#modal h2").textContent(), /Noor/);
  await page.click("#modal button.primary");
  const next = await model();
  assert.equal(next.client, "haddad");
  assert.equal(next.walls, 0);
  assert.match(await page.locator("#sidebar header").innerText(), /1 house sold/);

  // A design that misses must-haves is turned down, with reasons.
  await page.keyboard.press("r");
  await drag([5, 5], [12, 11]);
  await page.click("text=Present to client");
  assert.match(await page.locator("#modal h2").textContent(), /Not quite yet/);
  assert.match(await page.locator("#modal .problems").innerText(), /Missing: an office/);
  await shot("rejected");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#modal").isHidden(), true);

  // Progress survives a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.architect);
  const reloaded = await model();
  assert.equal(reloaded.client, "haddad");
  assert.equal(reloaded.walls, 4);
  assert.equal(await page.locator("#modal").isHidden(), true, "no intro while a commission is in progress");

  // Switch to Swedish: the page reloads in Swedish with the game where it was.
  await page.selectOption("#sidebar header select", "sv");
  await page.waitForLoadState("load");
  await page.waitForFunction(() => window.architect);
  assert.equal(await page.locator("html").getAttribute("lang"), "sv");
  assert.equal((await model()).walls, 4, "the design survives the switch");
  assert.equal(await page.locator(".client-section button.primary").textContent(), "Presentera för kunden");
  assert.match(await page.locator("#sidebar header").innerText(), /Intjänat 7\s200 · 1 hus sålt/);
  assert.match(await page.locator(".brief").first().innerText(), /Ett arbetsrum på minst 8 m²/);
  assert.match(await page.locator(".plan-hint").textContent(), /Klicka på något för att ändra det/);
  assert.equal(await page.locator("#view3d .pane-hint kbd").count(), 3);
  await page.click("text=Presentera för kunden");
  assert.equal(await page.locator("#modal h2").textContent(), "Inte riktigt än");
  assert.match(await page.locator("#modal .problems").innerText(), /Saknas: ett arbetsrum på minst 8 m² \(0 av 1\)/);
  await shot("swedish");
  await page.keyboard.press("Escape");
  await page.selectOption("#sidebar header select", "en");
  await page.waitForLoadState("load");
  await page.waitForFunction(() => window.architect);
  assert.equal(await page.locator(".client-section button.primary").textContent(), "Present to client");

  // Turning a client down: confirm, and the next client calls.
  await page.click(".client-section button.new-client");
  assert.match(await page.locator("#modal h2").textContent(), /Turn down this job/);
  await page.keyboard.press("Enter"); // the safe choice has the focus
  assert.equal((await model()).client, "haddad");
  await page.click(".client-section button.new-client");
  await page.click("#modal button[data-action=confirm]");
  assert.match(await page.locator("#modal h2").textContent(), /Andersson/);
  await page.click("#modal button.primary");
  assert.equal((await model()).client, "andersson");
  assert.equal((await model()).walls, 0);

  // Two storeys: the Anderssons' bedrooms upstairs.
  await page.click("text=Clear plot");
  await page.keyboard.press("r");
  await drag([5, 5], [15, 13]);
  await page.keyboard.press("w");
  for (const [a, b] of [[[5, 9], [15, 9]], [[9, 9], [9, 13]]]) {
    await click(...a);
    await click(...b);
  }
  await page.keyboard.press("d");
  for (const p of [[10, 5], [7, 9], [12, 9]]) await click(...p);
  await page.keyboard.press("n");
  for (const p of [[7.5, 5], [12, 13]]) await click(...p);
  await page.keyboard.press("v");
  for (const [x, y, type] of [[10, 7, "Living"], [6, 10.5, "Hall"], [12, 11, "Kitchen"]]) await setRoom(x, y, type);

  // Add a floor: it starts with the outline of the one below.
  await page.click(".level-switch button[data-action=add]");
  const upstairs = () => page.evaluate(() => window.architect.store.house.wallsOn(1).length);
  assert.equal(await page.evaluate(() => window.architect.store.level), 1);
  assert.equal(await upstairs(), 4);
  await page.keyboard.press("w");
  for (const [a, b] of [[[5, 9], [15, 9]], [[9, 9], [9, 13]], [[10, 5], [10, 9]], [[12, 9], [12, 13]]]) {
    await click(...a);
    await click(...b);
  }
  assert.equal(await upstairs(), 8);
  await page.keyboard.press("d");
  for (const p of [[7, 9], [10, 7], [9, 11], [13.5, 9]]) await click(...p);
  await page.keyboard.press("n");
  for (const p of [[7.5, 5], [12.5, 5], [13.5, 13]]) await click(...p);
  await page.keyboard.press("v");
  for (const [x, y, type] of [[7.5, 7, "Bedroom"], [12.5, 7, "Bedroom"], [6, 10.5, "Hall"], [10.5, 11, "Bathroom"], [13.5, 11, "Bedroom"]]) await setRoom(x, y, type);
  assert.match(await status(), /No stairs lead up to floor 2/);
  assert.match(await status(), /cannot be reached/);

  // Stairs from the ground-floor hall.
  await page.click(".level-switch button[data-level='0']");
  await page.keyboard.press("s");
  await click(7, 11);
  await fromMenu("Roof", "Gable");
  const problems = await page.locator(".issues li").allTextContents();
  assert.deepEqual(problems.filter((p) => !/over the budget/.test(p)), [], "only the budget is a problem");
  assert.deepEqual(await unmetMusts(), [], "every must-have met across both floors");
  assert.match((await page.locator(".brief.wishes li.met").allInnerTexts()).join("\n"), /3 bedrooms of at least 9 m² upstairs/);
  await shot("two-storeys");

  // The 3D view can leave out the roof and any floor, and shows furniture.
  assert.ok((await page.evaluate(() => window.architect.core.furnish(window.architect.store.house).length)) >= 8, "rooms are furnished");
  await page.click("#view-toggles input[data-toggle='roof']");
  await page.click("#view-toggles input[data-toggle='level:1']");
  assert.deepEqual(await page.evaluate(() => [window.architect.store.showRoof, [...window.architect.store.hiddenLevels]]), [false, [1]]);
  await page.waitForTimeout(200);
  await shot("ground-floor-furnished");
  await page.click("#view-toggles input[data-toggle='level:1']");
  await page.click("#view-toggles input[data-toggle='roof']");

  // Removing the floor removes the stairs with it.
  await page.click(".level-switch button[data-action=remove]");
  assert.equal(await page.evaluate(() => window.architect.store.house.levels), 1);
  assert.equal(await page.evaluate(() => window.architect.store.house.stairs.length), 0);

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
