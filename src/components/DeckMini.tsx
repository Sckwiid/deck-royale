import CardIcon from "@/components/CardIcon";
import type { PublicCardMeta } from "@/lib/cards";

interface DeckMiniProps {
  cardIds: number[];
  cardLookup?: Map<number, PublicCardMeta>;
  cardIndicatorsById?: Map<number, { evo: boolean; gold: boolean }>;
}

export default function DeckMini({ cardIds, cardLookup, cardIndicatorsById }: DeckMiniProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cardIds.slice(0, 8).map((cardId, index) => {
        const indicators = cardIndicatorsById?.get(cardId);
        return (
        <CardIcon
          key={`${cardId}-${index}`}
          cardId={cardId}
          cardMeta={cardLookup?.get(cardId) ?? null}
          evo={Boolean(indicators?.evo)}
          gold={Boolean(indicators?.gold)}
          className="h-11 w-9 sm:h-12 sm:w-10"
        />
        );
      })}
    </div>
  );
}
