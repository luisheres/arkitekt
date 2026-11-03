# Architect

Buy a plot, build a house from walls, windows, doors and a roof, and sell it. An AI
appraiser (Claude) judges how good the house looks; a better house sells for more,
which pays for a better plot.

The game is a TypeScript web app in [`web/`](web/) (Vite + Three.js). The original Rust/Bevy
prototype is still in `crates/` for reference.

## Layout

| Path | Purpose |
|---|---|
| `web/src/core` | Renderer-free model: walls/openings/roof, footprint detection, roof & floor geometry, costs, validation, plots, sample houses. Fully unit-tested (Vitest). |
| `web/src/game` | Three.js viewer: orbit camera, house rendering, HTML HUD, appraisal-view capture. |
| `web/scripts/capture.mjs` | Headless capture of the four appraisal views (Playwright + software WebGL). |

## Running

```sh
cd web
npm install
npm run dev                        # open the printed URL (http://localhost:5173)
npm test                           # unit tests
npm run typecheck
npm run build                      # static site in web/dist
npm run capture -- --sample 2 --out screenshots/   # render the 4 appraisal views to PNG
```

`?sample=N` in the URL starts on sample house N. The first `npm run capture` needs
`npx playwright install chromium`.

Viewer controls: left-drag rotate, right-drag pan, wheel zoom, `1`-`4` preset views,
`Tab` next house, `R` roof style, `T` roof material, `M` wall material, `[` `]` roof
pitch, `O` `P` overhang, `-` `=` wall height, `G` plot guides, `C` capture the
appraisal views.

### In the devcontainer

The dev server runs inside the container; VS Code forwards port 5173, so open the game in
your host browser, which uses your real GPU. Node 22 comes from the devcontainer `node`
feature.

## Rules in the MVP

- Single storey; exterior walls must form one closed loop (no interior walls yet).
- Gable and hip roofs need a rectangular footprint; flat roofs work on any shape.
- A sellable house needs a door, a roof, a floor area of at least 20 m², walls inside the
  plot's setback, and openings that fit their walls. See `web/src/core/validate.ts`.
