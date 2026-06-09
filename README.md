# 🌍 GENESIS — Living Ecosystem Simulator

**Watch evolution happen.** GENESIS is a browser-based ecosystem simulator where creatures with simulated DNA are born, eat, reproduce, mutate, and die in a procedurally generated world. There is no fitness function — the environment itself is the selector. Natural selection plays out in real time, and you can intervene as a god.

> 100% client-side. No backend, no APIs, no accounts. One command to run, one click to deploy.

![GENESIS screenshot](docs/screenshot.png)

---

## ✨ Features

- **Procedural world** — simplex-noise terrain with 7 biomes (ocean, shore, grassland, forest, desert, tundra, mountain), each with its own food rate, temperature and movement cost
- **Simulated DNA** — 10 genes per creature: speed, size, vision, color, diet spectrum, efficiency, reproduction threshold, mutation rate, lifespan, nocturnality
- **Real natural selection** — crossover + mutation on reproduction; the environment decides who survives
- **Speciation** — populations that drift genetically apart fork into visually distinct species, tracked on a phylogenetic timeline
- **Day/night cycle** — lighting shifts and nocturnal genes change creature behavior after dark
- **God Mode** — terraform biomes with a brush, drop food clusters, draw kill zones, spawn creatures
- **Genetic Lab** — design a genome with sliders, preview the phenotype live, release it into the world (presets: Speed Demon, Tank, Balanced, Nocturnal Hunter)
- **Catastrophic events** — meteor strike, ice age, wildfire, plague; the ecosystem crashes, adapts, rebuilds
- **Evolution Dashboard** — population per species, gene distribution histograms, diversity index, dominant species card, generation counter
- **Visual polish** — movement trails, breathing animations, biome particles (pollen, snow, embers, fireflies), water caustics, minimap with density overlay
- **Performance** — spatial hash grid, pre-baked terrain layer, off-screen culling; smooth with 500+ creatures

## 🚀 Run locally

```bash
npm install
npm run dev      # → http://localhost:5173
```

```bash
npm run build    # production build in dist/
npm run preview  # serve the production build
```

## ☁️ Deploy

**Vercel** (zero config): import the repo at [vercel.com/new](https://vercel.com/new) — the included `vercel.json` and Vite preset handle everything.

**GitHub Pages**: `npm run build`, then publish the `dist/` folder (the build uses relative asset paths, so it works from any subpath):

```bash
npx gh-pages -d dist
```

## 🎮 Controls

| Input | Action |
| --- | --- |
| Drag | Pan the world |
| Scroll | Zoom |
| Click creature | Inspect genome, energy, age, lineage |
| `Space` | Pause / play |
| `+` / `-` | Simulation speed (1x · 2x · 5x · 10x) |
| `.` | Step one tick |
| `G` | God Mode toolbar |
| `L` | Genetic Lab |
| `M` | Minimap |
| `D` | Evolution Dashboard |

## 🛠 Tech stack

- **Vite + TypeScript (strict)** — build & type safety
- **HTML5 Canvas 2D** — world rendering (terrain layer + entity layer)
- **React 18 + TailwindCSS** — glass-morphism UI overlay
- **Recharts** — dashboard charts
- **zustand** — engine → UI state bridge
- Custom simplex noise, spatial hash grid, fixed-timestep game loop

## 🏗 Architecture

```
src/
├── engine/          # framework-free simulation core
│   ├── World.ts        # tile grid, biome generation, food, terraform, regrowth
│   ├── Genetics.ts     # genome, crossover, mutation, presets
│   ├── Creature.ts     # steering behaviors, energy model, lifecycle
│   ├── Species.ts      # online clustering → speciation tracking
│   ├── Events.ts       # meteor / ice age / wildfire / plague
│   ├── Simulation.ts   # fixed-timestep orchestrator + god-mode API
│   ├── Renderer.ts     # canvas layers, lighting, trails, effects
│   ├── Particles.ts    # ambient & event particle pools
│   ├── Camera.ts       # smooth pan/zoom
│   ├── SpatialGrid.ts  # O(1) neighbor queries
│   └── Stats.ts        # time series & histograms for the dashboard
├── ui/              # React overlay (HUD, panels, modals)
├── state/store.ts   # zustand bridge between engine and UI
└── utils/           # noise, math, color helpers
```

The simulation runs at a fixed 30 ticks/s decoupled from the render loop, so changing speed (up to 10x) never changes the physics. The React overlay receives a stats snapshot a few times per second; god-mode tools call directly into the engine singleton.

---

*Built with Claude Fable 5.*
