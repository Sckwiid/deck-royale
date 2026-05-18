import { cardCatalog } from "@/data/mock";
import type { PublicCardMeta } from "@/lib/cards";

interface CardIconProps {
  cardKey?: string;
  cardId?: number;
  cardMeta?: PublicCardMeta | null;
  className?: string;
}

const buildCardImageFromId = (cardId?: number) => {
  if (!cardId || !Number.isFinite(cardId)) {
    return null;
  }
  return null;
};

export default function CardIcon({ cardKey, cardId, cardMeta, className = "" }: CardIconProps) {
  const card = cardKey ? cardCatalog.find((item) => item.key === cardKey) : undefined;
  const src = cardMeta?.iconUrl ?? card?.icon ?? buildCardImageFromId(cardId);
  const alt = cardMeta?.name ?? card?.nameEn ?? `Card ${cardId ?? ""}`.trim();

  if (!src) {
    return (
      <span
        className={`inline-flex h-12 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] uppercase text-slate-300 ${className}`.trim()}
      >
        N/A
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={40}
      height={48}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      onError={(event) => {
        (event.currentTarget as HTMLImageElement).style.opacity = "0.35";
      }}
      className={`h-12 w-10 rounded-lg border border-white/10 bg-black/20 object-cover ${className}`.trim()}
      referrerPolicy="no-referrer"
    />
  );
}
