export interface PublicCardMeta {
  id: number;
  name: string;
  iconUrl: string | null;
}

type CardRow = {
  id: number;
  name_en: string | null;
  name_fr: string | null;
  icon_url_source: string | null;
  icon_path: string | null;
};

const cardsLookupPromises = new Map<"fr" | "en", Promise<Map<number, PublicCardMeta>>>();

const resolveSupabasePublicEnv = () => {
  const url = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anonKey) {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
};

const toCardMeta = (row: CardRow, locale: "fr" | "en"): PublicCardMeta => {
  const localizedName = locale === "fr" ? row.name_fr || row.name_en : row.name_en || row.name_fr;
  return {
    id: Number(row.id),
    name: localizedName || `Card ${row.id}`,
    iconUrl: row.icon_url_source || row.icon_path || null
  };
};

export const fetchCardsLookup = async (locale: "fr" | "en"): Promise<Map<number, PublicCardMeta>> => {
  const existing = cardsLookupPromises.get(locale);
  if (existing) {
    const lookup = await existing;
    return lookup;
  }

  const promise = (async () => {
    const env = resolveSupabasePublicEnv();
    if (!env) {
      return new Map<number, PublicCardMeta>();
    }

    const endpoint = `${env.url}/rest/v1/cards?select=id,name_en,name_fr,icon_url_source,icon_path&order=id.asc`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return new Map<number, PublicCardMeta>();
    }

    const rows = (await response.json()) as CardRow[];
    const lookup = new Map<number, PublicCardMeta>();
    for (const row of rows) {
      const meta = toCardMeta(row, locale);
      lookup.set(meta.id, meta);
    }

    return lookup;
  })();

  cardsLookupPromises.set(locale, promise);

  const lookup = await promise;
  return lookup;
};
