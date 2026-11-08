import { chromium } from "playwright";
import { createServer } from "vite";
const out = process.argv[2];
const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(server.resolvedUrls.local[0]);
await p.waitForFunction(() => window.architect !== undefined);
await p.click('#modal [data-action="free"]');
await p.click('#modal [data-action="plot-corner"]');
for (const id of ["corner", "slope", "lakeview", "riverside", "townplot", "seaside", "mountain"]) {
  await p.evaluate((id) => {
    const { store, core } = window.architect;
    store.setFreePlot(id);
    const V = core.Vec2;
    const { width: w, depth: d } = store.plot;
    store.load(new core.House());
    store.edit((h) => {
      const [x0, y0] = [w / 2 - 6, d / 2 - 4];
      const ids = h.addWallLoop([new V(x0, y0), new V(x0 + 12, y0), new V(x0 + 12, y0 + 9), new V(x0, y0 + 9)], 2.7, "Plaster");
      h.addDoor(ids[0], 3, 1, 2.1);
      h.addGarageDoor(ids[1], 4.5, 2.5, 2.1);
      h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Tiles" };
    });
  }, id);
  await p.click(".layout-switch button[data-layout='split']");
  await p.waitForTimeout(400);
  await p.evaluate(() => { const v = window.architect.view3d; Object.assign(v.orbit, v.homeOrbit()); v.orbit.distance = 45; v.orbit.pitch = 0.45; v.requestRender(); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${id}.png` });
  console.log(id, (await p.locator(".status").innerText()).split("\n").filter((l) => /Groundworks|problem|reach/.test(l)).join(" | "));
}
console.log("errors", JSON.stringify(errs));
await b.close(); await server.close();
