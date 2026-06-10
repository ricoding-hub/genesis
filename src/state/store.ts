import { create } from 'zustand';
import { Biome, CreatureInfo, Genes, GodTool, StatsSnapshot } from '@/types';
import { GENE_PRESETS } from '@/engine/Genetics';

interface UIState {
  snapshot: StatsSnapshot | null;
  tool: GodTool;
  godModeOpen: boolean;
  brushBiome: Biome;
  brushRadius: number;
  labOpen: boolean;
  dashboardOpen: boolean;
  civOpen: boolean;
  minimapVisible: boolean;
  helpOpen: boolean;
  labGenes: Genes;
  /** Genes used by the next spawn-creature click (null = random). */
  spawnGenes: Genes | null;
  selected: CreatureInfo | null;
  toast: string | null;

  setSnapshot(s: StatsSnapshot): void;
  setTool(t: GodTool): void;
  toggleGodMode(): void;
  setBrushBiome(b: Biome): void;
  setBrushRadius(r: number): void;
  setLabOpen(open: boolean): void;
  setDashboardOpen(open: boolean): void;
  setCivOpen(open: boolean): void;
  toggleMinimap(): void;
  setHelpOpen(open: boolean): void;
  setLabGenes(g: Genes): void;
  setSpawnGenes(g: Genes | null): void;
  setSelected(c: CreatureInfo | null): void;
  showToast(msg: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<UIState>((set) => ({
  snapshot: null,
  tool: 'none',
  godModeOpen: false,
  brushBiome: Biome.Forest,
  brushRadius: 70,
  labOpen: false,
  dashboardOpen: false,
  civOpen: false,
  minimapVisible: true,
  helpOpen: false,
  labGenes: { ...GENE_PRESETS[2].genes },
  spawnGenes: null,
  selected: null,
  toast: null,

  setSnapshot: (snapshot) => set({ snapshot }),
  setTool: (tool) => set({ tool }),
  toggleGodMode: () =>
    set((s) => ({
      godModeOpen: !s.godModeOpen,
      tool: s.godModeOpen ? 'none' : s.tool,
    })),
  setBrushBiome: (brushBiome) => set({ brushBiome }),
  setBrushRadius: (brushRadius) => set({ brushRadius }),
  setLabOpen: (labOpen) => set({ labOpen }),
  setDashboardOpen: (dashboardOpen) => set({ dashboardOpen }),
  setCivOpen: (civOpen) => set({ civOpen }),
  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setLabGenes: (labGenes) => set({ labGenes }),
  setSpawnGenes: (spawnGenes) => set({ spawnGenes }),
  setSelected: (selected) => set({ selected }),
  showToast: (toast) => {
    set({ toast });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
