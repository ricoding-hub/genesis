/**
 * Uniform spatial hash grid for fast neighbor queries. Entities are
 * re-inserted each tick (cheap with pre-sized buckets).
 */
export interface Positioned {
  x: number;
  y: number;
}

export class SpatialGrid<T extends Positioned> {
  private cells: T[][];
  private readonly cols: number;
  private readonly rows: number;

  constructor(width: number, height: number, private readonly cellSize: number) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  clear(): void {
    for (const cell of this.cells) cell.length = 0;
  }

  insert(item: T): void {
    const c = this.colOf(item.x);
    const r = this.rowOf(item.y);
    this.cells[r * this.cols + c].push(item);
  }

  private colOf(x: number): number {
    const c = (x / this.cellSize) | 0;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private rowOf(y: number): number {
    const r = (y / this.cellSize) | 0;
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Visit every item within `radius` of (x, y). Return true from cb to stop early. */
  query(x: number, y: number, radius: number, cb: (item: T, d2: number) => boolean | void): void {
    const c0 = this.colOf(x - radius);
    const c1 = this.colOf(x + radius);
    const r0 = this.rowOf(y - radius);
    const r1 = this.rowOf(y + radius);
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      const rowBase = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[rowBase + c];
        for (let i = 0; i < cell.length; i++) {
          const item = cell[i];
          const dx = item.x - x;
          const dy = item.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2) {
            if (cb(item, d2)) return;
          }
        }
      }
    }
  }
}
