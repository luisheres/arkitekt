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
await p.click('#modal [data-action="plot-lakeside"]');
const info = await p.evaluate(() => {
  const { store, core } = window.architect;
  const V = core.Vec2;
  store.load(new core.House());
  store.edit((h) => {
    // An L: main block along the front, a wing to the back-left.
    const ids = h.addWallLoop([new V(6, 8), new V(22, 8), new V(22, 15), new V(13, 15), new V(13, 23), new V(6, 23)], 2.7, "FaluRed");
    h.addWall(new V(13, 8), new V(13, 15), 2.7, "Plaster");
    h.addDoor(ids[0], 4, 1, 2.1);
    h.addWindow(ids[0], 12, 1.4, 1.2, 0.9);
    h.addWindow(ids[4], 4, 1.4, 1.2, 0.9);
    const glass = h.addGlassDoor(ids[1], 3.5, 2.4, 2.1);
    h.addPassage(h.walls[h.walls.length - 1].id, 3.5, 1.6, 2.2);
    core.setRoomType(h, new V(17, 11), "Living", 0);
    core.setRoomType(h, new V(9, 15), "Kitchen", 0);
    h.addFurniture({ kind: "Fireplace", level: 0, at: new V(17.5, 14.6), facing: new V(0, -1), width: 1.4, depth: 0.6, height: 1.2 });
    h.addBalcony(ids[1], 3.5, 4, 2.5);
    h.roof = { style: "Gable", pitchDeg: 38, overhang: 0.4, material: "Tiles" };
    h.addDormer(ids[0], 12, 1.8);
    h.addDormer(ids[4], 3.5, 1.6);
  });
  const issues = core.validate(store.house, store.plot, Infinity, store.prices).map((i) => store.house && i.kind);
  return { issues, lines: core.costLines(store.house, store.prices, store.plot).filter((l) => ["dormer", "fireplace", "chimney", "deck"].includes(l.what.kind) || (l.what.kind === "opening" && ["GlassDoor", "Passage"].includes(l.what.opening))).map((l) => `${l.what.kind}${l.what.opening ?? ""} ${Math.round(l.amount)}`) };
});
console.log(JSON.stringify(info));
await p.click(".layout-switch button[data-layout='split']");
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/split.png` });
await p.click(".layout-switch button[data-layout='3d']");
for (const [n, yaw, pitch] of [["front", 3.6, 0.3], ["side", 1.9, 0.3], ["back", 0.6, 0.35]]) {
  await p.evaluate(([yaw, pitch]) => { const v = window.architect.view3d; v.orbit.target.set(14, 2.5, 15); v.orbit.yaw = yaw; v.orbit.pitch = pitch; v.orbit.distance = 26; v.requestRender(); }, [yaw, pitch]);
  await p.waitForTimeout(1300);
  await p.locator("#view").screenshot({ path: `${out}/${n}.png` });
}
await p.evaluate(() => { const s = window.architect.store; s.toggleRoof(); const v = window.architect.view3d; v.orbit.pitch = 0.9; v.orbit.distance = 20; v.requestRender(); });
await p.waitForTimeout(1300);
await p.locator("#view").screenshot({ path: `${out}/inside.png` });
console.log("errors", JSON.stringify(errs));
await b.close(); await server.close();
