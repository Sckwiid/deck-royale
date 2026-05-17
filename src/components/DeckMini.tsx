import CardIcon from "@/components/CardIcon";

interface DeckMiniProps {
  cardIds: number[];
}

export default function DeckMini({ cardIds }: DeckMiniProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cardIds.slice(0, 8).map((cardId, index) => (
        <CardIcon
          key={`${cardId}-${index}`}
          cardId={cardId}
          className="h-11 w-9 sm:h-12 sm:w-10"
        />
      ))}
    </div>
  );
}
