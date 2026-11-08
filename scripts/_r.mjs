import { chromium } from "playwright";
import { createServer } from "vite";
const out = process.argv[2];
const shots = JSON.parse(process.argv[3]);
const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.goto(server.resolvedUrls.local[0]);
await p.waitForFunction(() => window.architect !== undefined);
await p.click('#modal [data-action="free"]');
await p.click('#modal [data-action="plot-suburban"]');
await p.evaluate(() => { const { store, core } = window.architect; store.load(new core.House()); });
await p.click(".layout-switch button[data-layout='3d']");
for (const [name, id, tx, ty, yaw, pitch, dist] of shots) {
  await p.evaluate((id) => window.architect.store.setFreePlot(id), id);
  await p.waitForTimeout(300);
  await p.evaluate(([tx, ty, yaw, pitch, dist]) => { const v = window.architect.view3d; v.orbit.target.set(tx, 1, ty); v.orbit.yaw = yaw; v.orbit.pitch = pitch; v.orbit.distance = dist; v.requestRender(); }, [tx, ty, yaw, pitch, dist]);
  await p.waitForTimeout(1300);
  await p.locator("#view").screenshot({ path: `${out}/${name}.png` });
}
await b.close(); await server.close();
