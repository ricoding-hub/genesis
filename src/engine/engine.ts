import { Camera } from './Camera';
import { Renderer } from './Renderer';
import { Simulation } from './Simulation';

/**
 * Engine singleton: created once by main.tsx before React mounts, then
 * imported anywhere UI needs to talk to the simulation.
 */
export interface Engine {
  sim: Simulation;
  camera: Camera;
  renderer: Renderer;
}

let instance: Engine | null = null;

export function createEngine(
  terrainCanvas: HTMLCanvasElement,
  entityCanvas: HTMLCanvasElement,
): Engine {
  const sim = new Simulation();
  const camera = new Camera();
  const renderer = new Renderer(terrainCanvas, entityCanvas, sim, camera);
  instance = { sim, camera, renderer };
  return instance;
}

export function getEngine(): Engine {
  if (!instance) throw new Error('Engine not initialized');
  return instance;
}
