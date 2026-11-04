# Architect

You are an architect. Clients come to you with a plot, a budget and a brief: a retired
couple who want everything on one level, a family that needs a bedroom for each kid, a
carpenter who wants a workshop. Design a house that meets their must-haves, grant as many
of their wishes as you can, and present it. If they accept, you earn a fee (more for each
wish granted) and the next client calls.

A TypeScript web game built with Vite and Three.js. (The first prototype was Rust/Bevy; it
is in the first git commit.)

## Layout

| Path | Purpose |
|---|---|
| `src/core` | Renderer-free game logic, fully unit-tested (Vitest). `i18n/` message catalogs and number formatting; `model.ts` walls, openings, roof and room labels; `layout.ts` finds rooms, the outline and exterior walls from the wall graph; `rooms.ts` room types, doors, windows and reachability; `validate.ts` building rules; `cost.ts`; `roof.ts` roof and floor geometry; `brief.ts` requirements, evaluation and the client's verdict; `clients.ts` the written clients and the career; `generate.ts` generated clients; `edit.ts` editing operations; `history.ts` undo. |
| `src/game` | The game UI: `store.ts` (state, undo, autosave), `plan.ts` (2D plan tools), `view3d.ts` + `scene.ts` (Three.js view), `panel.ts` + `hud.ts` (sidebar), `dialogs.ts` (client and verdict), `capture.ts` (appraisal views). |
| `scripts/e2e.mjs` | End-to-end check: plays the first commission through the real UI in headless Chromium. |
| `scripts/capture.mjs` | Headless capture of the four appraisal views (Playwright + software WebGL). |

## Running

```sh
npm install
npm run dev                        # open the printed URL (http://localhost:5173)
npm test                           # unit tests
npm run e2e -- --out screenshots/  # end-to-end check (screenshots optional)
npm run typecheck
npm run build                      # static site in dist/
npm run capture -- --sample 2 --out screenshots/   # render the 4 appraisal views to PNG
```

Progress (career and the commission in progress) autosaves in the browser. `?sample=N`
puts sample house N on the current plot, for screenshots. `npm run e2e` and
`npm run capture` need `npx playwright install chromium` once.

## Playing

1. **Meet the client.** Read their story, budget, must-haves and wishes. **Brief** in the
   sidebar shows it again; the sidebar checklist updates live as you design.
2. **Draw the house.** Outer walls first (Room tool), then interior walls from wall to
   wall to divide it into rooms.
3. **Say what each room is.** Click a room and pick its use: living room, kitchen,
   bedroom, bathroom, WC, hall, office, utility room, garage or storage.
4. **Add doors and windows, and a roof.** Every room must be reachable through doors from
   the front door; bedrooms, living rooms, kitchens and offices need a window; a garage
   needs a garage door (select a door and change its type, or use the wall's buttons).
5. **Choose materials.** The facade (wood boards, Falu red panel, brick, plaster or
   stone) and roof covering are set in the sidebar's House section; each room's floor
   (wood, laminate, tiles, stone, carpet or concrete) in its room panel. Everything has a
   price, and wet rooms and garages need hard, waterproof floors.
6. **Present to client.** They accept when every must-have is met, the house has no
   building problems and it is within budget. Your fee is 8% of their budget, plus up to
   half again for wishes granted.

Not keen on a job? **New client** turns the request down (the design is discarded) and
the next client calls. Once the five written clients are served or turned down, new
clients are generated: families, couples, retirees and people working from home, each
with their own household, brief, plot and budget, in both languages.

## Editing

The plan (left) is a view from above with the street at the bottom; the 3D view (right)
updates live. **Plan / Split / 3D** switches the layout; **Roof** (`H`) hides the roof to
look inside.

| Tool | Key | |
|---|---|---|
| Select | `V` | Click a room to set its use. Drag a corner to reshape, a wall to push it in or out (walls attached to it follow), a window or door along (or onto another) wall, a room name to move it. Drag empty space to pan. |
| Room | `R` | Drag a rectangle to create four walls. Sides along existing walls are shared, so rooms can be added next to each other. |
| Open | `B` | Draw a room boundary, like a wall but not built: it divides open-plan space into rooms (e.g. kitchen and living room) that are open to each other. Select an interior wall to switch it between wall and open. |
| Wall | `W` | Click corners. Starting or ending on a wall connects to it (and ends the chain); click the first corner to close a loop. `Enter` or double-click ends an open chain, `Esc` cancels. |
| Window / Door | `N` / `D` | Click a wall. |
| Stairs | `S` | Click inside a room to place a straight flight up to the floor above. Rotate it in the sidebar; drag it to move. |

**Floors.** The **Floors** box in the plan switches storeys. **+ Add floor** starts a new
storey on top with the outline of the one below (up to three); **− Remove floor** removes
the top one. The floor below shows faintly underneath, and its corners are snap points.
With the roof hidden (`H`), the 3D view cuts away everything above the floor you are
editing.

Points snap to a 0.5 m grid, to corners and onto walls; hold `Alt` for 5 cm steps.
Problem walls, openings and rooms are outlined in red; click an issue in the sidebar to
select it.

Other keys: `Del` delete selection (or clear a room's use), `Ctrl+Z` / `Ctrl+Shift+Z`
undo / redo, `F` fit the plan, wheel zoom and right-drag pan in either view, `1`-`4` 3D
preset views, `G` plot guides, `C` capture the appraisal views.

## Languages

The game speaks English and Swedish. It picks the browser's language the first time and
remembers the choice from the menu next to the title.

All text lives in `src/core/i18n/`: `types.ts` defines `Messages`, and `en.ts` / `sv.ts`
implement it. Client stories and plot names sit with each client in `clients.ts` and
`plot.ts`, one text per language. To add a language: add its code to `LANGS` in
`types.ts`, copy `sv.ts` and translate it, register it in `i18n/index.ts`, and add the
language to every client and plot. The compiler points out anything missing, and
`i18n.test.ts` flags strings left identical to the English.

### In the devcontainer

The dev server runs inside the container; VS Code forwards port 5173, so open the game in
your host browser, which uses your real GPU. Node 22 comes from the devcontainer `node`
feature, and `.devcontainer/post-create-script.sh` runs `npm ci`.

## Building rules

- Single storey. Exterior walls enclose one connected house; interior walls may end on
  other walls (T-junctions) but not cross them. Walls with a loose end must be connected.
- Gable and hip roofs need a rectangular outline; flat roofs work on any shape.
- Windows go in exterior walls; no window or door may straddle a junction with another
  wall.
- Rooms have minimum sizes by use (e.g. bedroom 7 m², garage 15 m²), habitable rooms need
  daylight, and every room must be reachable from outside.
- Upper storeys must rest on the storey below (within its outline), and stairs must
  lead to them: a staircase stands inside rooms on both floors, clear of walls. Rooms
  upstairs are reachable only by stairs. The roof sits on the top storey; where a storey
  is smaller than the one below, the slab below is a flat roof (a terrace).
- Room boundaries make open plan: rooms on either side count as connected (no door
  needed) and share daylight. Boundaries cost nothing, carry no windows or doors, and
  cannot form the outside of the house.
- A sellable house also needs a front door, a roof, at least 20 m² of floor, walls inside
  the plot's setback, and openings that fit their walls. See `src/core/validate.ts`.

## Ideas for next steps

- The AI appraiser: send the four captured views and the brief to Claude, and let its
  judgement of the looks feed into the client's verdict and the fee.
- Clients generated by Claude from a few parameters, instead of a fixed list.
- Unlocks with earnings: bigger plots, better clients, new materials.
