import CardIcon from "@/components/CardIcon";
import type { Dictionary } from "@/data/i18n";
import type { DeckCardData } from "@/types";

interface DeckCardProps {
  deck: DeckCardData;
  dict: Dictionary;
}

export default function DeckCard({ deck, dict }: DeckCardProps) {
  return (
    <article className="glass-panel group p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-semibold text-white">{deck.name}</h3>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">{deck.archetype}</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
          {dict.common.avgElixir}: {deck.avgElixir.toFixed(1)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="text-slate-300">{dict.common.winrate}</p>
          <p className="font-semibold text-white">{deck.winRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="text-slate-300">{dict.common.useRate}</p>
          <p className="font-semibold text-white">{deck.useRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2 col-span-2 sm:col-span-2">
          <p className="text-slate-300">{dict.common.trophyRange}</p>
          <p className="font-semibold text-white">
            {deck.trophies[0]} - {deck.trophies[1]}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {deck.cards.map((cardKey) => (
          <CardIcon key={`${deck.id}-${cardKey}`} cardKey={cardKey} />
        ))}
      </div>
    </article>
  );
}
