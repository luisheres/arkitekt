# Arkitekt

A game about becoming an architect. Clients bring you a plot, a budget and their wishes;
you design the house, in plan and in 3D, and if they like it you get paid, earn stars and
take on bigger jobs.

**Play:** https://luisheres.github.io/arkitekt/

## Run it yourself

```bash
npm ci
npm run dev        # http://localhost:5173
```

`npm test` runs the unit tests and `npm run build` makes the site in `dist/`. For
`npm run e2e`, run `npx playwright install chromium` once.

Pushing to `main` publishes the game on GitHub Pages (Settings → Pages → Source: GitHub
Actions).

How the game grew, sprint by sprint, is in [`sprints/`](sprints/README.md).
