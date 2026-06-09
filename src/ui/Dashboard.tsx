import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStore } from '@/state/store';
import { GeneHistogram, Genes, SpeciesInfo } from '@/types';

const GENE_SHORT: Partial<Record<keyof Genes, string>> = {
  speed: 'Speed',
  size: 'Size',
  vision: 'Vision',
  diet: 'Diet',
  efficiency: 'Efficiency',
  mutationRate: 'Mutation',
  lifespan: 'Lifespan',
  nocturnal: 'Nocturnal',
};

const tooltipStyle = {
  background: 'rgba(13,17,28,0.95)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  fontSize: 11,
};

function HistogramMini({ h }: { h: GeneHistogram }) {
  const data = h.buckets.map((count, i) => ({ bucket: (i / 10).toFixed(1), count }));
  return (
    <div>
      <div className="text-[10px] text-slate-400 mb-0.5">{GENE_SHORT[h.gene] ?? h.gene}</div>
      <ResponsiveContainer width="100%" height={52}>
        <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Bar dataKey="count" fill="#34d399" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <XAxis dataKey="bucket" hide />
          <YAxis hide />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DominantCard() {
  const snapshot = useStore((s) => s.snapshot);
  const d = snapshot?.dominant;
  if (!d) return null;
  const g = d.avgGenes;
  const traits: [string, number][] = [
    ['speed', g.speed],
    ['size', g.size],
    ['vision', g.vision],
    ['diet', g.diet],
    ['efficiency', g.efficiency],
    ['nocturnal', g.nocturnal],
  ];
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="panel-title mb-2">Dominant species</div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-4 h-4 rounded-full inline-block border border-white/30"
          style={{ background: d.color }}
        />
        <span className="text-sm font-semibold">Species #{d.id}</span>
        <span className="text-xs text-slate-400 ml-auto font-mono">{d.population} alive</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {traits.map(([name, v]) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 w-14 capitalize">{name}</span>
            <div className="flex-1 h-1 rounded bg-white/10">
              <div
                className="h-full rounded"
                style={{ width: `${(v * 100).toFixed(0)}%`, background: d.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpeciationTimeline({ species }: { species: SpeciesInfo[] }) {
  const recent = [...species]
    .sort((a, b) => b.bornAt - a.bornAt)
    .slice(0, 8);
  if (recent.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="panel-title mb-2">Phylogenetic timeline</div>
      <div className="flex flex-col gap-1">
        {recent.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
              style={{ background: s.color, opacity: s.extinct ? 0.35 : 1 }}
            />
            <span className={s.extinct ? 'text-slate-500 line-through' : 'text-slate-300'}>
              Species #{s.id}
            </span>
            <span className="text-slate-500">
              {s.parentId >= 0 ? `← split from #${s.parentId}` : '· genesis seed'}
            </span>
            <span className="text-slate-500 font-mono ml-auto">
              gen {s.bornGeneration}
              {s.extinct ? ' †' : ` · ${s.population}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const open = useStore((s) => s.dashboardOpen);
  const setOpen = useStore((s) => s.setDashboardOpen);
  const snapshot = useStore((s) => s.snapshot);
  if (!open || !snapshot) return null;

  const livingSpecies = snapshot.species
    .filter((s) => s.population > 0)
    .sort((a, b) => b.population - a.population)
    .slice(0, 6);

  return (
    <div className="glass absolute left-3 top-16 bottom-20 w-[400px] p-4 overflow-y-auto thin-scroll animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">📊 Evolution Dashboard</h2>
        <button className="btn" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4 text-center">
        {[
          ['Generation', snapshot.generation],
          ['Population', snapshot.population],
          ['Births', snapshot.births],
          ['Deaths', snapshot.deaths],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/5 border border-white/10 py-2">
            <div className="text-base font-bold font-mono text-emerald-300">{value}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="panel-title mb-1">Population over time</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={snapshot.popSeries} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#7a8499' }} unit="s" />
          <YAxis tick={{ fontSize: 9, fill: '#7a8499' }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            dataKey="total"
            stroke="#e8ecf4"
            dot={false}
            strokeWidth={1.8}
            isAnimationActive={false}
            name="total"
          />
          {livingSpecies.map((s) => (
            <Line
              key={s.id}
              dataKey={`s${s.id}`}
              stroke={s.color}
              dot={false}
              strokeWidth={1.2}
              isAnimationActive={false}
              name={`#${s.id}`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="panel-title mt-3 mb-1">Diversity index</div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart
          data={snapshot.diversitySeries}
          margin={{ top: 4, right: 4, bottom: 0, left: -28 }}
        >
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#7a8499' }} unit="s" />
          <YAxis tick={{ fontSize: 9, fill: '#7a8499' }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            dataKey="diversity"
            stroke="#c084fc"
            fill="rgba(192,132,252,0.18)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="panel-title mt-3 mb-2">Gene distribution</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-4">
        {snapshot.histograms.map((h) => (
          <HistogramMini key={h.gene} h={h} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <DominantCard />
        <SpeciationTimeline species={snapshot.species} />
      </div>
    </div>
  );
}
