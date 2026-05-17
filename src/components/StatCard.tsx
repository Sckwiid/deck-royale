interface StatCardProps {
  label: string;
  value: string;
  accent?: "cyan" | "violet" | "gold";
}

const accentClassMap = {
  cyan: "from-cyan-300/30 to-transparent border-cyan-300/30",
  violet: "from-violet-400/30 to-transparent border-violet-300/30",
  gold: "from-amber-300/30 to-transparent border-amber-200/30"
};

export default function StatCard({ label, value, accent = "cyan" }: StatCardProps) {
  return (
    <div
      className={`glass-panel relative overflow-hidden border px-4 py-4 before:absolute before:inset-0 before:bg-gradient-to-br ${accentClassMap[accent]}`}
    >
      <div className="relative">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{label}</p>
        <p className="mt-2 font-display text-3xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
