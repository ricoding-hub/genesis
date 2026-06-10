import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import i18n from './i18n';
import { createEngine } from './engine/engine';
import { debugSheet } from './engine/Sprites';
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
// Expose for debugging / automated verification.
(window as unknown as Record<string, unknown>).__engine = engine;
(window as unknown as Record<string, unknown>).__debugSprites = debugSheet;

/** Coarse pointer ≈ touch device: lower pixel budget, fewer particles. */
const isCoarse = window.matchMedia('(pointer: coarse)').matches;
renderer.quality = isCoarse ? 0.5 : 1;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2);
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
/** Active pointers (multi-touch); two fingers = pinch zoom. */
const pointers = new Map<number, { x: number; y: number }>();
let pinchDist = 0;
let pinching = false;

function pinchInfo(): { cx: number; cy: number; d: number } | null {
  if (pointers.size < 2) return null;
  const [a, b] = [...pointers.values()];
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    d: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

function toast(key: string, params?: Record<string, string | number>): void {
  useStore.getState().showToast(i18n.t(key, params));
}

function applyTool(screenX: number, screenY: number): void {
  const st = useStore.getState();
  const { tool, brushBiome, brushRadius, spawnGenes } = st;
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
    case 'wall':
      sim.paintWall(w.x, w.y, brushRadius * 0.5);
      break;
    case 'gate':
      sim.eraseWall(w.x, w.y, brushRadius * 0.5);
      break;
    case 'spawn': {
      const c = sim.spawnCreature(w.x, w.y, spawnGenes ?? undefined);
      if (!c) toast('toast.cannotSpawn');
      break;
    }
    case 'tribe': {
      const ok = sim.spawnTribe(w.x, w.y);
      toast(ok ? 'toast.tribeSettled' : 'toast.tribeNoGround');
      break;
    }
    case 'humans': {
      const ok = sim.spawnCohort(w.x, w.y, {
        count: st.cohortCount,
        sex: st.cohortSex,
        profile: st.cohortProfile,
      });
      toast(ok ? 'toast.cohortPlaced' : 'toast.tribeNoGround');
      break;
    }
    case 'bless': {
      const name = sim.bless(w.x, w.y);
      toast(name ? 'toast.praiseHarvest' : 'toast.blessed', name ? { tribe: name } : undefined);
      break;
    }
    case 'smite': {
      const name = sim.smite(w.x, w.y);
      toast(name ? 'toast.fearWrath' : 'toast.smote', name ? { tribe: name } : undefined);
      break;
    }
    default:
      break;
  }
}

entityCanvas.style.touchAction = 'none';

/** True when the event originated on a UI panel rather than the world canvas. */
function onUI(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.('#ui-root');
}

window.addEventListener('pointerdown', (e) => {
  // Ignore clicks on UI panels.
  if (onUI(e)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Second finger down → switch to pinch, cancel any pan/paint in progress.
  if (pointers.size === 2) {
    dragging = false;
    painting = false;
    pinching = true;
    pinchDist = pinchInfo()!.d;
    return;
  }
  if (pinching) return;

  const { tool } = useStore.getState();
  lastPointer = { x: e.clientX, y: e.clientY };
  movedSinceDown = 0;
  if (tool === 'terraform' || tool === 'kill' || tool === 'wall' || tool === 'gate') {
    painting = true;
    applyTool(e.clientX, e.clientY);
  } else if (
    tool === 'food' ||
    tool === 'spawn' ||
    tool === 'tribe' ||
    tool === 'humans' ||
    tool === 'bless' ||
    tool === 'smite'
  ) {
    applyTool(e.clientX, e.clientY);
  } else {
    dragging = true;
  }
});

window.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  // Two-finger pinch zoom.
  if (pinching) {
    const info = pinchInfo();
    if (info && pinchDist > 0) {
      camera.zoomAt(info.cx, info.cy, info.d / pinchDist);
      pinchDist = info.d;
    }
    return;
  }

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
    visible: !onUI(e),
  };

  if (dragging) {
    camera.panBy(dx, dy);
  } else if (painting) {
    applyTool(e.clientX, e.clientY);
  }
  lastPointer = { x: e.clientX, y: e.clientY };
});

function releasePointer(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pinching) {
    // Pinch ends when fewer than two fingers remain; swallow the tap.
    if (pointers.size < 2) {
      pinching = false;
      pinchDist = 0;
      dragging = false;
      painting = false;
      movedSinceDown = 99;
    }
    return;
  }

  const wasDragging = dragging;
  dragging = false;
  painting = false;
  // Treat a non-drag click with no tool as creature selection.
  if (wasDragging && movedSinceDown < 6) {
    if (onUI(e)) return;
    const w = camera.screenToWorld(e.clientX, e.clientY);
    const c = sim.creatureAt(w.x, w.y, 20 / camera.dzoom + 10);
    renderer.selected = c;
    useStore.getState().setSelected(c ? sim.creatureInfo(c) : null);
  }
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

window.addEventListener(
  'wheel',
  (e) => {
    if (onUI(e)) return;
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
      store.showToast(i18n.t(sim.paused ? 'controls.paused' : 'controls.running'));
      break;
    case '+':
    case '=': {
      const i = SPEEDS.indexOf(sim.speed);
      sim.speed = SPEEDS[Math.min(SPEEDS.length - 1, i + 1)];
      sim.paused = false;
      store.showToast(i18n.t('controls.speed', { n: sim.speed }));
      break;
    }
    case '-':
    case '_': {
      const i = SPEEDS.indexOf(sim.speed);
      sim.speed = SPEEDS[Math.max(0, i - 1)];
      store.showToast(i18n.t('controls.speed', { n: sim.speed }));
      break;
    }
    case '.':
      sim.paused = true;
      sim.stepOnce();
      break;
    case 'g':
    case 'G':
      store.togglePanel('god');
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
      store.togglePanel('stats');
      break;
    case 'c':
    case 'C':
      store.togglePanel('civ');
      break;
    case 'e':
    case 'E':
      store.togglePanel('events');
      break;
    case 'Escape':
      store.setTool('none');
      store.setPanel('none');
      store.setLabOpen(false);
      store.setScenarioOpen(false);
      store.setHelpOpen(false);
      store.closeConfirm();
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
