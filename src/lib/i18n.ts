import type { Locale } from "@/types";
import { translations, type Dictionary } from "@/i18n/translations";

export const locales: Locale[] = ["fr", "en"];

export const getDictionary = (locale: Locale): Dictionary => translations[locale];

export const resolveLocale = (path: string): Locale => {
  if (path.startsWith("/fr")) {
    return "fr";
  }
  return "en";
};

export const switchPathLocale = (path: string, targetLocale: Locale): string => {
  const normalizedPath = path.endsWith("/") ? path : `${path}/`;

  const routeMap: Record<string, { fr: string; en: string }> = {
    "/fr/": { fr: "/fr/", en: "/en/" },
    "/en/": { fr: "/fr/", en: "/en/" },
    "/fr/analyser/": { fr: "/fr/analyser/", en: "/en/analyze/" },
    "/en/analyze/": { fr: "/fr/analyser/", en: "/en/analyze/" },
    "/fr/meta/": { fr: "/fr/meta/", en: "/en/meta/" },
    "/en/meta/": { fr: "/fr/meta/", en: "/en/meta/" },
    "/fr/pro-tracking/": { fr: "/fr/pro-tracking/", en: "/en/pro-tracking/" },
    "/en/pro-tracking/": { fr: "/fr/pro-tracking/", en: "/en/pro-tracking/" }
  };

  const mapped = routeMap[normalizedPath];

  if (mapped) {
    return mapped[targetLocale];
  }

  if (normalizedPath.startsWith("/fr/")) {
    return normalizedPath.replace(/^\/fr\//, `/${targetLocale}/`);
  }

  if (normalizedPath.startsWith("/en/")) {
    return normalizedPath.replace(/^\/en\//, `/${targetLocale}/`);
  }

  return targetLocale === "fr" ? "/fr/" : "/en/";
};
