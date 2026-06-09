import { clamp, damp } from '@/utils/math';
import { WORLD_H, WORLD_W } from './World';

const MIN_ZOOM = 0.22;
const MAX_ZOOM = 4.5;

/**
 * 2D camera with smooth pan/zoom. `x, y` is the world point at the center
 * of the viewport. Rendering uses the eased (display) values so motion
 * feels fluid.
 */
export class Camera {
  // Target values (set by input).
  x = WORLD_W / 2;
  y = WORLD_H / 2;
  zoom = 0.5;

  // Eased values (used for rendering).
  dx = this.x;
  dy = this.y;
  dzoom = this.zoom;

  viewportW = 1;
  viewportH = 1;

  setViewport(w: number, h: number): void {
    this.viewportW = w;
    this.viewportH = h;
    const minZoom = Math.max(w / WORLD_W, h / WORLD_H, MIN_ZOOM) * 0.55;
    if (this.zoom < minZoom) this.zoom = minZoom;
  }

  update(dt: number): void {
    this.dx = damp(this.dx, this.x, 10, dt);
    this.dy = damp(this.dy, this.y, 10, dt);
    this.dzoom = damp(this.dzoom, this.zoom, 10, dt);
  }

  panBy(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.dzoom;
    this.y -= screenDy / this.dzoom;
    this.clampTarget();
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    // Recompute with target zoom to anchor the cursor point.
    const wx = (screenX - this.viewportW / 2) / this.zoom + this.x;
    const wy = (screenY - this.viewportH / 2) / this.zoom + this.y;
    this.x += before.x - wx;
    this.y += before.y - wy;
    this.clampTarget();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clampTarget();
  }

  private clampTarget(): void {
    const halfW = this.viewportW / 2 / this.zoom;
    const halfH = this.viewportH / 2 / this.zoom;
    const padX = Math.min(halfW, WORLD_W / 2);
    const padY = Math.min(halfH, WORLD_H / 2);
    this.x = clamp(this.x, padX * 0.4, WORLD_W - padX * 0.4);
    this.y = clamp(this.y, padY * 0.4, WORLD_H - padY * 0.4);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewportW / 2) / this.dzoom + this.dx,
      y: (sy - this.viewportH / 2) / this.dzoom + this.dy,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.dx) * this.dzoom + this.viewportW / 2,
      y: (wy - this.dy) * this.dzoom + this.viewportH / 2,
    };
  }

  /** Visible world-space rectangle. */
  visibleRect(): { x: number; y: number; w: number; h: number } {
    const w = this.viewportW / this.dzoom;
    const h = this.viewportH / this.dzoom;
    return { x: this.dx - w / 2, y: this.dy - h / 2, w, h };
  }
}
