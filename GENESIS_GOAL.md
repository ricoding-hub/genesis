/goal

# GENESIS — Living Ecosystem Simulator

Build a complete, visually stunning browser-based ecosystem simulator from scratch. Creatures with simulated DNA are born, eat, reproduce, mutate, and die in a procedurally generated world. Natural selection plays out in real time. The user watches evolution happen — and can intervene as a god.

This is a **single repo, 100% client-side** project. No backend, no paid APIs, no external services. One command to run locally, one click to deploy free (Vercel / GitHub Pages).

---

## Tech Stack

- **Build**: Vite + TypeScript (strict)
- **Rendering**: HTML5 Canvas 2D (primary world render — keep it performant for 500+ entities)
- **UI Overlay**: React 18 + TailwindCSS (control panel, stats, modals — mounted on top of canvas)
- **Charts**: Recharts (population graphs, gene distribution, phylogenetic timeline)
- **Noise**: Implement or use a lightweight Perlin/Simplex noise lib for terrain generation
- **Animations**: requestAnimationFrame game loop with delta-time; GSAP optional for UI transitions
- **Package manager**: npm

---

## Core Systems

### 1. World Engine

- Procedural 2D terrain using Perlin/Simplex noise mapped to biomes: **ocean, shore, grassland, forest, desert, tundra, mountain**
- Each biome has distinct color palette, food spawn rate, temperature, and movement cost
- World size: scrollable/pannable with mouse drag + zoom wheel
- **Day/night cycle**: lighting overlay that shifts color temperature and affects creature behavior through nocturnal vs diurnal genes
- Food spawns organically per biome and decays over time

### 2. Creature System

Each creature is an autonomous agent with:

- **DNA genome**: array of genes encoding speed, size, vision radius, color RGB, diet spectrum herbivore/carnivore, energy efficiency, reproduction threshold, mutation rate, lifespan, nocturnal tendency
- **Phenotype**: visual appearance derived from DNA — color, body size, subtle glow/trail based on energy level
- **Steering behaviors**: wander, seek food, flee predators, seek mate — weighted by genes and current state
- **Energy model**: movement costs energy proportional to speed × size, eating restores it, starvation causes death
- **Lifecycle**: birth → growth → maturity → reproduction → aging → death, with visible age indicator

### 3. Genetic / Evolution Engine

- **Reproduction**: when two compatible creatures meet with enough energy, create offspring using crossover DNA plus mutation chance per gene
- **Mutation**: small random perturbation on gene values; mutation rate is also a gene
- **Selection pressure**: the environment is the selector — no artificial fitness function, just survival
- **Generation tracking**: count generations, track lineage, record dominant gene values per generation
- **Speciation**: if gene drift is large enough between populations, visually differentiate them as distinct species/color clusters

### 4. Rendering & Visual Polish

- Creatures rendered as organic shapes with soft circles/ellipses, breathing animation, and slight wobble
- Fading movement trails behind fast creatures
- Ambient biome particles: pollen, dust, snow, fire embers, etc.
- Subtle animated water caustic/wave effect
- Smooth camera transitions on zoom/pan
- Minimap showing full world and creature density heatmap
- **Visual goal**: someone opens this and wants to stare at it for 10 minutes. It should feel alive.

---

## Interactive Features

### God Mode Toolbar

- **Terraform**: click/drag to paint biomes — turn desert into forest, raise mountains, flood areas
- **Spawn Food**: drop food clusters anywhere
- **Kill Zone**: draw an area that kills everything inside, simulating disaster
- **Spawn Creature**: place a random-DNA creature or open the genetic lab

### Genetic Lab

- Sliders for each gene
- Live phenotype preview
- "Release into world" button
- Presets: "Speed Demon", "Tank", "Balanced", "Nocturnal Hunter"

### Catastrophic Events

- **Meteor**: destroys a random area, kills creatures there, changes biome to wasteland, then slowly regenerates
- **Ice Age**: temperature drops globally, tundra expands, food becomes scarce, only efficient creatures survive
- **Wildfire**: spreads through forest biomes, destroys food, creatures flee or die
- **Plague**: random gene becomes lethal, creatures with that gene value start dying
- After each event, the ecosystem should crash, adapt, and rebuild. This is one of the main magic moments.

### Evolution Dashboard

- Population over time, per species/color cluster
- Gene distribution histograms for speed, size, vision, mutation rate, diet, etc.
- Dominant species card with most populous species, average genes, generation count
- Diversity index over time
- Simple phylogenetic tree or timeline showing speciation events
- Generation counter and world age

### Time Controls

- Pause, Play, 2x, 5x, 10x
- Step-by-step mode to advance one tick at a time

---

## UX & Layout

- Full viewport canvas as the base layer
- Glass-morphism UI panels overlaid on canvas with semi-transparent surfaces and backdrop blur
- Dark theme by default, because the world provides most of the color
- Responsive: optimized for 1080p+ desktop; on mobile show a simplified view or "best on desktop" nudge
- First-time experience: when opened, the world auto-generates and seeds around 30 starter creatures. Evolution begins immediately. No onboarding wall. Use subtle tooltips for discoverability.
- Keyboard shortcuts:
  - `Space`: pause/play
  - `+ / -`: change speed
  - `G`: toggle God Mode
  - `L`: open Genetic Lab
  - `M`: toggle minimap

---

## Suggested Project Structure

```text
genesis/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── public/
├── src/
│   ├── main.ts
│   ├── engine/
│   │   ├── World.ts
│   │   ├── Creature.ts
│   │   ├── Genetics.ts
│   │   ├── Physics.ts
│   │   ├── Simulation.ts
│   │   └── Renderer.ts
│   ├── ui/
│   │   ├── App.tsx
│   │   ├── Dashboard.tsx
│   │   ├── GodMode.tsx
│   │   ├── GeneticLab.tsx
│   │   ├── TimeControls.tsx
│   │   ├── Minimap.tsx
│   │   └── Events.tsx
│   ├── utils/
│   │   ├── noise.ts
│   │   ├── colors.ts
│   │   └── math.ts
│   └── types/
│       └── index.ts
├── README.md
└── vercel.json
```

This structure is recommended, not mandatory. Adjust if a better architecture emerges while building.

---

## Performance Targets

- Smooth 60fps with up to 500 creatures on mid-range hardware
- Use spatial partitioning via grid or quadtree for neighbor queries
- Creatures should only check nearby entities
- Off-screen creatures should keep simulating but skip rendering
- Use canvas layering if needed: static terrain layer + dynamic entity layer

---

## Deployment

- `npm run dev` must start local development
- `npm run build` must produce a production-ready `dist/`
- Deploy to **Vercel** with zero-config Vite setup
- Optional GitHub Pages support if simple to add
- The README must include:
  - Project description
  - Screenshot/GIF placeholder
  - How to run locally
  - How to deploy
  - Tech stack
  - Architecture overview
  - "Built with Claude Fable 5" note

---

## Definition of Done

The project is complete when:

1. World generates procedurally with distinct and beautiful biomes
2. Creatures spawn, move autonomously, eat, reproduce with genetic crossover/mutation, and die
3. Natural selection is visible after 50+ generations
4. God Mode works: terraform, spawn food, kill zone, spawn creature
5. Genetic Lab works with sliders, phenotype preview, presets, and release action
6. Catastrophic Events work and visibly impact the ecosystem
7. Dashboard shows real-time population charts, gene distributions, generation counter, diversity, and dominant species
8. Day/night cycle works and affects creature behavior
9. Visual polish is strong: particles, trails, lighting, smooth animations, alive feeling
10. Minimap works
11. App runs smoothly with 300+ creatures
12. `npm run dev` works out of the box
13. `npm run build` produces deployable output
14. README.md is complete and professional

---

## Autonomy Instructions

Do not stop at scaffolding. Do not stop at a prototype. Build the full experience.

Work autonomously until the Definition of Done is complete. If a technical decision is unclear, choose the option that best supports:

1. Visual impact
2. Performance
3. Zero-cost deployment
4. Maintainability
5. Portfolio value

You have full creative freedom to add small bonus features if they increase the wow effect without making the project depend on paid APIs, backend infrastructure, or external services.

Make it extraordinary.
