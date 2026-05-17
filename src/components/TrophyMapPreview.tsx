interface TrophyMapPreviewProps {
  title: string;
  subtitle: string;
}

const lanes = [
  { range: "5000-5250", winrate: 54.7, games: 912 },
  { range: "5250-5500", winrate: 55.3, games: 1084 },
  { range: "5500-5750", winrate: 56.1, games: 962 },
  { range: "5750-6000", winrate: 57.0, games: 875 },
  { range: "6000-6250", winrate: 56.4, games: 802 }
];

export default function TrophyMapPreview({ title, subtitle }: TrophyMapPreviewProps) {
  return (
    <div className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-300">{subtitle}</p>

      <div className="mt-4 space-y-3">
        {lanes.map((lane, index) => (
          <div
            key={lane.range}
            className={`rounded-xl border p-3 ${
              index === 2 ? "border-cyan-300/35 bg-cyan-300/10" : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-wide text-slate-100">{lane.range}</span>
              <span className="text-xs text-cyan-200">{lane.winrate.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400"
                style={{ width: `${Math.min(95, lane.winrate)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-300">{lane.games} games</p>
          </div>
        ))}
      </div>
    </div>
  );
}
