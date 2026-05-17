interface GamesCountProps {
  count: number;
  label: string;
}

export default function GamesCount({ count, label }: GamesCountProps) {
  return <p className="text-xs text-slate-300">{label.replace("{count}", String(count))}</p>;
}
