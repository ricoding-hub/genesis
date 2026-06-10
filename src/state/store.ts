import { create } from 'zustand';
import {
  Biome,
  CohortProfile,
  CohortSex,
  CreatureInfo,
  Genes,
  GodTool,
  StatsSnapshot,
} from '@/types';
import { GENE_PRESETS } from '@/engine/Genetics';

/** Which single docked panel is open (only one at a time → never overlap). */
export type PanelId = 'none' | 'god' | 'events' | 'stats' | 'civ' | 'versus';

export interface ConfirmRequest {
  titleKey: string;
  bodyKey: string;
  confirmKey: string;
  params?: Record<string, string | number>;
  danger?: boolean;
  onConfirm: () => void;
}

interface UIState {
  snapshot: StatsSnapshot | null;
  panel: PanelId;
  tool: GodTool;
  brushBiome: Biome;
  brushRadius: number;
  labOpen: boolean;
  scenarioOpen: boolean;
  minimapVisible: boolean;
  helpOpen: boolean;
  labGenes: Genes;
  /** Genes used by the next spawn-creature click (null = random). */
  spawnGenes: Genes | null;
  /** Options for the "Human cohort" god tool. */
  cohortSex: CohortSex;
  cohortCount: number;
  cohortProfile: CohortProfile;
  selected: CreatureInfo | null;
  toast: string | null;
  confirm: ConfirmRequest | null;

  setSnapshot(s: StatsSnapshot): void;
  /** Open a panel (or 'none' to close). Selecting a tool stays valid only in god. */
  setPanel(p: PanelId): void;
  togglePanel(p: PanelId): void;
  setTool(t: GodTool): void;
  setBrushBiome(b: Biome): void;
  setBrushRadius(r: number): void;
  setLabOpen(open: boolean): void;
  setScenarioOpen(open: boolean): void;
  toggleMinimap(): void;
  setHelpOpen(open: boolean): void;
  setLabGenes(g: Genes): void;
  setSpawnGenes(g: Genes | null): void;
  setCohortSex(s: CohortSex): void;
  setCohortCount(n: number): void;
  setCohortProfile(p: CohortProfile): void;
  setSelected(c: CreatureInfo | null): void;
  showToast(msg: string): void;
  askConfirm(req: ConfirmRequest): void;
  closeConfirm(): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<UIState>((set) => ({
  snapshot: null,
  panel: 'none',
  tool: 'none',
  brushBiome: Biome.Forest,
  brushRadius: 70,
  labOpen: false,
  scenarioOpen: false,
  minimapVisible: true,
  helpOpen: false,
  labGenes: { ...GENE_PRESETS[2].genes },
  spawnGenes: null,
  cohortSex: 'mixed',
  cohortCount: 12,
  cohortProfile: 'balanced',
  selected: null,
  toast: null,
  confirm: null,

  setSnapshot: (snapshot) => set({ snapshot }),
  setPanel: (panel) =>
    set((s) => ({ panel, tool: panel === 'god' ? s.tool : 'none' })),
  togglePanel: (p) =>
    set((s) => {
      const panel = s.panel === p ? 'none' : p;
      return { panel, tool: panel === 'god' ? s.tool : 'none' };
    }),
  setTool: (tool) => set({ tool }),
  setBrushBiome: (brushBiome) => set({ brushBiome }),
  setBrushRadius: (brushRadius) => set({ brushRadius }),
  setLabOpen: (labOpen) => set({ labOpen }),
  setScenarioOpen: (scenarioOpen) => set({ scenarioOpen }),
  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setLabGenes: (labGenes) => set({ labGenes }),
  setSpawnGenes: (spawnGenes) => set({ spawnGenes }),
  setCohortSex: (cohortSex) => set({ cohortSex }),
  setCohortCount: (cohortCount) => set({ cohortCount }),
  setCohortProfile: (cohortProfile) => set({ cohortProfile }),
  setSelected: (selected) => set({ selected }),
  showToast: (toast) => {
    set({ toast });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
  askConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
}));
