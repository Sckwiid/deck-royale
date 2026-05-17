import type { APIRoute } from "astro";
import { TROPHY_ROAD_RANGES } from "@/lib/metaSeo";

const ROUTES = [
  "/fr/",
  "/en/",
  "/fr/analyser/",
  "/en/analyze/",
  "/fr/meta/",
  "/en/meta/",
  "/fr/meta/trophy-road/",
  "/en/meta/trophy-road/",
  "/fr/meta/ranked/",
  "/en/meta/ranked/",
  "/fr/pro-tracking/",
  "/en/pro-tracking/"
];

const TROPHY_ROAD_RANGE_ROUTES = TROPHY_ROAD_RANGES.flatMap((range) => [
  `/fr/meta/trophy-road/${range.slug}/`,
  `/en/meta/trophy-road/${range.slug}/`
]);

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://example.com");
  const basePath = import.meta.env.BASE_URL;
  const safeBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;

  const urls = [...ROUTES, ...TROPHY_ROAD_RANGE_ROUTES].map((route) => {
    const fullRoute = `${safeBasePath}${route.replace(/^\//, "")}`;
    const url = new URL(fullRoute, base).toString();
    return `<url><loc>${url}</loc></url>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
};
