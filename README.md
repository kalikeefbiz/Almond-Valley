# Almond Valley

A mobile-first 3D survival settlement builder set in BlackHouse's Ashes × Aether universe.

**Play:** https://kalikeefbiz.github.io/Almond-Valley/

Grow a frontier settlement in a dry canyon beneath two suns, keep the Heartwell pumping, and bring your people through Double Noon every summer.

## Develop

```
npm install
npm run dev      # local dev server
npm test         # headless simulation tests
npm run build    # production build in dist/ (base path /Almond-Valley/)
```

Pushing to `main` builds and deploys through GitHub Actions (`.github/workflows/deploy.yml`).

## Layout

- `src/data.js` — buildings, research, seasons, starting settlement
- `src/sim.js` — the simulation (population, production, Heartwell, Double Noon, Clickers). No rendering; runs in node for tests
- `src/render.js`, `src/world.js`, `src/models.js` — three.js scene, canyon, procedural models
- `src/ui.js`, `src/input.js`, `src/main.js` — interface, touch controls, game loop, save/load
