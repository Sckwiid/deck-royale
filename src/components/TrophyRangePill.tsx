interface TrophyRangePillProps {
  min: number | null;
  max: number | null;
  active?: boolean;
}

export default function TrophyRangePill({ min, max, active = false }: TrophyRangePillProps) {
  const text = min === null || max === null ? "N/A" : `${min} - ${max}`;

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active
          ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
          : "border-white/10 bg-white/5 text-slate-200"
      }`}
    >
      {text}
    </span>
  );
}
