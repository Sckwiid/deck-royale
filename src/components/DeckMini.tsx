import CardIcon from "@/components/CardIcon";
import type { PublicCardMeta } from "@/lib/cards";

interface DeckMiniProps {
  cardIds: number[];
  cardLookup?: Map<number, PublicCardMeta>;
}

export default function DeckMini({ cardIds, cardLookup }: DeckMiniProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cardIds.slice(0, 8).map((cardId, index) => (
        <CardIcon
          key={`${cardId}-${index}`}
          cardId={cardId}
          cardMeta={cardLookup?.get(cardId) ?? null}
          className="h-11 w-9 sm:h-12 sm:w-10"
        />
      ))}
    </div>
  );
}
