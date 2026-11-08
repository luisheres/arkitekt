import { chromium } from "playwright";
import { createServer } from "vite";
const out = process.argv[2];
const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.goto(server.resolvedUrls.local[0]);
await p.waitForFunction(() => window.architect !== undefined);
await p.click('#modal [data-action="free"]');
await p.click('#modal [data-action="plot-hillside"]');
await p.click(".layout-switch button[data-layout='3d']");
const shapes = { L: [[0, 0], [12, 0], [12, 6], [6, 6], [6, 12], [0, 12]], T: [[0, 0], [14, 0], [14, 6], [10, 6], [10, 14], [4, 14], [4, 6], [0, 6]], U: [[0, 0], [16, 0], [16, 12], [11, 12], [11, 6], [5, 6], [5, 12], [0, 12]] };
for (const [name, pts] of Object.entries(shapes))
  for (const style of ["Gable", "Hip"]) {
    await p.evaluate(([pts, style]) => {
      const { store, core } = window.architect;
      store.load(new core.House());
      store.edit((h) => {
        h.addWallLoop(pts.map(([x, y]) => new core.Vec2(x + 10, y + 12)), 2.7, "Plaster");
        h.roof = { style, pitchDeg: 32, overhang: 0.4, material: "Tiles" };
      });
    }, [pts, style]);
    await p.evaluate(() => { const v = window.architect.view3d; v.orbit.target.set(17, 3, 18); v.orbit.yaw = 2.5; v.orbit.pitch = 0.45; v.orbit.distance = 30; v.requestRender(); });
    await p.waitForTimeout(1200);
    await p.locator("#view").screenshot({ path: `${out}/${name}-${style}.png` });
  }
await b.close(); await server.close();
