const GITHUB_PAGES_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.github\.io$/i;
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const parseOrigins = (input: string) =>
  input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const staticAllowedOrigins = () => {
  const explicit = [
    ...parseOrigins(Deno.env.get("ALLOWED_ORIGINS") ?? ""),
    ...parseOrigins(Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "")
  ];

  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? "").trim();
  if (siteUrl) {
    try {
      explicit.push(new URL(siteUrl).origin);
    } catch {
      // ignore malformed PUBLIC_SITE_URL
    }
  }

  return new Set(explicit);
};

const EXTRA_ALLOWED_ORIGINS = staticAllowedOrigins();

export const isAllowedOrigin = (origin: string | null) => {
  if (!origin) {
    return true;
  }

  if (LOCAL_ORIGIN_RE.test(origin)) {
    return true;
  }

  if (GITHUB_PAGES_ORIGIN_RE.test(origin)) {
    return true;
  }

  return EXTRA_ALLOWED_ORIGINS.has(origin);
};

export const buildCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const allowed = isAllowedOrigin(origin);

  return {
    "Access-Control-Allow-Origin": allowed ? origin ?? "*" : "null",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, x-forwarded-for",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin"
  };
};

export const corsPreflight = (req: Request) => {
  const headers = buildCorsHeaders(req);

  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return new Response("Origin not allowed", { status: 403, headers });
  }

  return new Response("ok", { status: 200, headers });
};

export const jsonResponse = (req: Request, payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
