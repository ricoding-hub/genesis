import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { createEngine } from './engine/engine';
import { useStore } from './state/store';
import { App } from './ui/App';
import type { SimSpeed } from './engine/Simulation';

// ---------------- engine boot ----------------

const canvasRoot = document.getElementById('canvas-root')!;
const terrainCanvas = document.createElement('canvas');
const entityCanvas = document.createElement('canvas');
canvasRoot.appendChild(terrainCanvas);
canvasRoot.appendChild(entityCanvas);

const engine = createEngine(terrainCanvas, entityCanvas);
const { sim, camera, renderer } = engine;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
}
resize();
window.addEventListener('resize', resize);

// ---------------- game loop ----------------

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let statsTimer = 0;

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  sim.advance(dt);
  renderer.frame(dt);

  // FPS tracking.
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    sim.fps = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  // Push a stats snapshot to React a few times a second.
  statsTimer += dt;
  if (statsTimer >= 0.35) {
    statsTimer = 0;
    useStore.getState().setSnapshot(sim.snapshot());
    // Refresh inspector if a creature is selected.
    const sel = renderer.selected;
    if (sel) {
      useStore.getState().setSelected(sel.dead ? null : sim.creatureInfo(sel));
      if (sel.dead) renderer.selected = null;
    }
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------- pointer input ----------------

let dragging = false;
let painting = false;
let lastPointer = { x: 0, y: 0 };
let movedSinceDown = 0;

function applyTool(screenX: number, screenY: number): void {
  const { tool, brushBiome, brushRadius, spawnGenes } = useStore.getState();
  const w = camera.screenToWorld(screenX, screenY);
  switch (tool) {
    case 'terraform':
      sim.paintBiome(w.x, w.y, brushRadius, brushBiome);
      break;
    case 'food':
      sim.dropFood(w.x, w.y);
      break;
    case 'kill':
      sim.killZone(w.x, w.y, brushRadius);
      break;
    case 'spawn': {
      const c = sim.spawnCreature(w.x, w.y, spawnGenes ?? undefined);
      if (!c) useStore.getState().showToast('Cannot spawn here (water or population cap)');
      break;
    }
    default:
      break;
  }
}

entityCanvas.style.touchAction = 'none';

window.addEventListener('pointerdown', (e) => {
  // Ignore clicks on UI panels.
  if ((e.target as HTMLElement).closest('#ui-root')) return;
  const { tool } = useStore.getState();
  lastPointer = { x: e.clientX, y: e.clientY };
  movedSinceDown = 0;
  if (tool === 'terraform' || tool === 'kill') {
    painting = true;
    applyTool(e.clientX, e.clientY);
  } else if (tool === 'food' || tool === 'spawn') {
    applyTool(e.clientX, e.clientY);
  } else {
    dragging = true;
  }
});

window.addEventListener('pointermove', (e) => {
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  movedSinceDown += Math.abs(dx) + Math.abs(dy);

  // Brush hover indicator.
  const w = camera.screenToWorld(e.clientX, e.clientY);
  const { tool, brushRadius } = useStore.getState();
  renderer.brush = {
    tool,
    x: w.x,
    y: w.y,
    radius: brushRadius,
    visible: !(e.target as HTMLElement).closest?.('#ui-root'),
  };

  if (dragging) {
    camera.panBy(dx, dy);
  } else if (painting) {
    applyTool(e.clientX, e.clientY);
  }
  lastPointer = { x: e.clientX, y: e.clientY };
});

window.addEventListener('pointerup', (e) => {
  const wasDragging = dragging;
  dragging = false;
  painting = false;
  // Treat a non-drag click with no tool as creature selection.
  if (wasDragging && movedSinceDown < 6) {
    if ((e.target as HTMLElement).closest('#ui-root')) return;
    const w = camera.screenToWorld(e.clientX, e.clientY);
    const c = sim.creatureAt(w.x, w.y, 20 / camera.dzoom + 10);
    renderer.selected = c;
    useStore.getState().setSelected(c ? sim.creatureInfo(c) : null);
  }
});

window.addEventListener(
  'wheel',
  (e) => {
    if ((e.target as HTMLElement).closest('#ui-root')) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0012);
    camera.zoomAt(e.clientX, e.clientY, factor);
  },
  { passive: false },
);

// ---------------- keyboard shortcuts ----------------

const SPEEDS: SimSpeed[] = [1, 2, 5, 10];

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const store = useStore.getState();
  switch (e.key) {
    case ' ':
      e.preventDefault();
      sim.paused = !sim.paused;
      store.showToast(sim.paused ? 'Paused' : 'Running');
      break;
    case '+':
    case '=': {
      const i = SPEEDS.indexOf(sim.speed);
      sim.speed = SPEEDS[Math.min(SPEEDS.length - 1, i + 1)];
      sim.paused = false;
      store.showToast(`Speed ${sim.speed}x`);
      break;
    }
    case '-':
    case '_': {
      const i = SPEEDS.indexOf(sim.speed);
      sim.speed = SPEEDS[Math.max(0, i - 1)];
      store.showToast(`Speed ${sim.speed}x`);
      break;
    }
    case '.':
      sim.paused = true;
      sim.stepOnce();
      break;
    case 'g':
    case 'G':
      store.toggleGodMode();
      break;
    case 'l':
    case 'L':
      store.setLabOpen(!store.labOpen);
      break;
    case 'm':
    case 'M':
      store.toggleMinimap();
      break;
    case 'd':
    case 'D':
      store.setDashboardOpen(!store.dashboardOpen);
      break;
    case 'Escape':
      store.setTool('none');
      store.setLabOpen(false);
      store.setHelpOpen(false);
      renderer.selected = null;
      store.setSelected(null);
      break;
    default:
      break;
  }
});

// ---------------- React overlay ----------------

createRoot(document.getElementById('ui-root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
