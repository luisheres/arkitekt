# Architect

Buy a plot, build a house from walls, windows, doors and a roof, and sell it. An AI
appraiser (Claude) judges how good the house looks; a better house sells for more,
which pays for a better plot.

A TypeScript web game built with Vite and Three.js. (The first prototype was Rust/Bevy; it
is in the first git commit.)

## Layout

| Path | Purpose |
|---|---|
| `src/core` | Renderer-free model: walls/openings/roof, footprint detection, roof & floor geometry, costs, validation, plots, sample houses, editing operations (snapping, moving corners/walls, placing openings) and undo history. Fully unit-tested (Vitest). |
| `src/game` | The editor: `store.ts` (state, undo, autosave), `plan.ts` (2D plan tools), `view3d.ts` + `scene.ts` (Three.js view), `panel.ts` (sidebar), `capture.ts` (appraisal views). |
| `scripts/e2e.mjs` | End-to-end check: builds houses through the real UI in headless Chromium. |
| `scripts/capture.mjs` | Headless capture of the four appraisal views (Playwright + software WebGL). |

## Running

```sh
npm install
npm run dev                        # open the printed URL (http://localhost:5173)
npm test                           # unit tests
npm run e2e -- --out screenshots/  # end-to-end editor check (screenshots optional)
npm run typecheck
npm run build                      # static site in dist/
npm run capture -- --sample 2 --out screenshots/   # render the 4 appraisal views to PNG
```

The house autosaves in the browser; `?sample=N` in the URL starts from sample house N
instead. `npm run e2e` and `npm run capture` need `npx playwright install chromium` once.

## Editing

The plan (left) is a view from above with the street at the bottom; the 3D view (right)
updates live. **Plan / Split / 3D** at the top switches the layout.

| Tool | Key | |
|---|---|---|
| Select | `V` | Drag a corner to reshape, drag a wall to push it in or out, drag a window or door along (or onto another) wall. Drag empty space to pan. |
| Room | `R` | Drag a rectangle to create four walls. |
| Wall | `W` | Click corners; click the first corner to close the room. `Enter` or double-click ends an open chain, `Esc` cancels. |
| Window / Door | `N` / `D` | Click a wall. |

Points snap to a 0.5 m grid and to existing corners; hold `Alt` for 5 cm steps. Problem
walls and openings are outlined in red; click an issue in the sidebar to select it.

Other keys: `Del` delete selection, `Ctrl+Z` / `Ctrl+Shift+Z` undo / redo, `F` fit the
plan, wheel zoom and right-drag pan in either view, `1`-`4` 3D preset views, `G` plot
guides, `C` capture the appraisal views.

### In the devcontainer

The dev server runs inside the container; VS Code forwards port 5173, so open the game in
your host browser, which uses your real GPU. Node 22 comes from the devcontainer `node`
feature, and `.devcontainer/post-create-script.sh` runs `npm ci`.

## Rules in the MVP

- Single storey; exterior walls must form one closed loop (no interior walls yet).
- Gable and hip roofs need a rectangular footprint; flat roofs work on any shape.
- A sellable house needs a door, a roof, a floor area of at least 20 m², walls inside the
  plot's setback, and openings that fit their walls. See `src/core/validate.ts`.
