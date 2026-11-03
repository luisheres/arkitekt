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
| `src/core` | Renderer-free game logic, fully unit-tested (Vitest). `model.ts` walls, openings, roof and room labels; `layout.ts` finds rooms, the outline and exterior walls from the wall graph; `rooms.ts` room types, doors, windows and reachability; `validate.ts` building rules; `cost.ts`; `roof.ts` roof and floor geometry; `brief.ts` requirements, evaluation and the client's verdict; `clients.ts` the clients and the career; `edit.ts` editing operations; `history.ts` undo. |
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
5. **Present to client.** They accept when every must-have is met, the house has no
   building problems and it is within budget. Your fee is 8% of their budget, plus up to
   half again for wishes granted.

## Editing

The plan (left) is a view from above with the street at the bottom; the 3D view (right)
updates live. **Plan / Split / 3D** switches the layout; **Roof** (`H`) hides the roof to
look inside.

| Tool | Key | |
|---|---|---|
| Select | `V` | Click a room to set its use. Drag a corner to reshape, a wall to push it in or out (walls attached to it follow), a window or door along (or onto another) wall, a room name to move it. Drag empty space to pan. |
| Room | `R` | Drag a rectangle to create four walls. Sides along existing walls are shared, so rooms can be added next to each other. |
| Wall | `W` | Click corners. Starting or ending on a wall connects to it (and ends the chain); click the first corner to close a loop. `Enter` or double-click ends an open chain, `Esc` cancels. |
| Window / Door | `N` / `D` | Click a wall. |

Points snap to a 0.5 m grid, to corners and onto walls; hold `Alt` for 5 cm steps.
Problem walls, openings and rooms are outlined in red; click an issue in the sidebar to
select it.

Other keys: `Del` delete selection (or clear a room's use), `Ctrl+Z` / `Ctrl+Shift+Z`
undo / redo, `F` fit the plan, wheel zoom and right-drag pan in either view, `1`-`4` 3D
preset views, `G` plot guides, `C` capture the appraisal views.

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
  a window, and every room must be reachable from outside through doors.
- A sellable house also needs a front door, a roof, at least 20 m² of floor, walls inside
  the plot's setback, and openings that fit their walls. See `src/core/validate.ts`.

## Ideas for next steps

- The AI appraiser: send the four captured views and the brief to Claude, and let its
  judgement of the looks feed into the client's verdict and the fee.
- Clients generated by Claude from a few parameters, instead of a fixed list.
- Unlocks with earnings: bigger plots, better clients, new materials.
