interface WinrateBadgeProps {
  value: number | null;
}

const colorByWinrate = (value: number | null) => {
  if (value === null) return "border-white/10 bg-white/5 text-slate-300";
  if (value >= 55) return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  if (value >= 50) return "border-cyan-300/30 bg-cyan-300/10 text-cyan-200";
  return "border-amber-300/30 bg-amber-300/10 text-amber-200";
};

export default function WinrateBadge({ value }: WinrateBadgeProps) {
  const label = value === null ? "N/A" : `${value.toFixed(1)}%`;

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${colorByWinrate(value)}`}
    >
      {label}
    </span>
  );
}
