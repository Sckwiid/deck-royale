import { cardCatalog } from "@/data/mock";
import type { PublicCardMeta } from "@/lib/cards";

interface CardIconProps {
  cardKey?: string;
  cardId?: number;
  cardMeta?: PublicCardMeta | null;
  className?: string;
  evo?: boolean;
  gold?: boolean;
}

const buildCardImageFromId = (cardId?: number) => {
  if (!cardId || !Number.isFinite(cardId)) {
    return null;
  }
  return null;
};

export default function CardIcon({
  cardKey,
  cardId,
  cardMeta,
  className = "",
  evo = false,
  gold = false
}: CardIconProps) {
  const card = cardKey ? cardCatalog.find((item) => item.key === cardKey) : undefined;
  const src = cardMeta?.iconUrl ?? card?.icon ?? buildCardImageFromId(cardId);
  const alt = cardMeta?.name ?? card?.nameEn ?? `Card ${cardId ?? ""}`.trim();
  const hasIndicator = evo || gold;

  if (!src) {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        <span
          className={`inline-flex h-12 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] uppercase text-slate-300 ${className}`.trim()}
        >
          N/A
        </span>
        {hasIndicator ? (
          <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            {evo ? "EVO" : ""}
            {evo && gold ? " · " : ""}
            {gold ? "GOLD" : ""}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
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
      {hasIndicator ? (
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em]">
          {evo ? <span className="text-violet-200">EVO</span> : null}
          {evo && gold ? <span className="text-slate-400"> · </span> : null}
          {gold ? <span className="text-amber-200">GOLD</span> : null}
        </span>
      ) : null}
    </div>
  );
}
