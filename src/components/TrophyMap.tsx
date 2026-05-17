import type { DeckCardData } from "@/types";

interface TrophyMapProps {
  decks: DeckCardData[];
}

export default function TrophyMap({ decks }: TrophyMapProps) {
  return (
    <div className="glass-panel p-4">
      <h3 className="font-display text-lg font-semibold text-white">Trophy Ladder Coverage</h3>
      <div className="mt-4 space-y-3">
        {decks.map((deck) => {
          const start = ((deck.trophies[0] - 4000) / 4000) * 100;
          const width = ((deck.trophies[1] - deck.trophies[0]) / 4000) * 100;

          return (
            <div key={deck.id}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>{deck.name}</span>
                <span>
                  {deck.trophies[0]}-{deck.trophies[1]}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <span
                  className="absolute inset-y-0 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400"
                  style={{ left: `${start}%`, width: `${Math.max(width, 8)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
