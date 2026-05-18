# DeckRadar

DeckRadar is a mobile-first Clash Royale analytics website built with Astro + React + TypeScript and designed for static hosting on GitHub Pages. It recommends decks by trophy range and calls Supabase Edge Functions for backend-only Clash Royale API access.

## Stack

- Astro + React + TypeScript
- Tailwind CSS
- Supabase JS (frontend with anon key only)
- Supabase Edge Functions (TypeScript/Deno)
- Supabase Postgres
- GitHub Actions for GitHub Pages deploy

## Product Direction

- Mobile-first, iPad-first, desktop compatible
- Tactical Arena premium dashboard visual style
- Dark mode default
- Localized routes in French and English
- SEO-focused static pages

## Routes

- `/`
- `/fr/`
- `/en/`
- `/fr/analyser/`
- `/en/analyze/`
- `/fr/meta/`
- `/en/meta/`
- `/fr/meta/trophy-road/`
- `/en/meta/trophy-road/`
- `/fr/meta/trophy-road/12000-12250/`
- `/fr/meta/trophy-road/12250-12500/`
- `/fr/meta/trophy-road/12500-12750/`
- `/fr/meta/trophy-road/12750-13000/`
- `/en/meta/trophy-road/12000-12250/`
- `/en/meta/trophy-road/12250-12500/`
- `/en/meta/trophy-road/12500-12750/`
- `/en/meta/trophy-road/12750-13000/`
- `/fr/meta/ranked/`
- `/en/meta/ranked/`
- `/fr/pro-tracking/`
- `/en/pro-tracking/`
- `/fr/player/` and `/fr/player/[tag]/`
- `/en/player/` and `/en/player/[tag]/`

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env
```

3. Fill only public frontend vars in `.env`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_SITE_URL`
- `PUBLIC_BASE_PATH`

4. Run locally:

```bash
npm run dev
```

5. Build production static output:

```bash
npm run build
```

6. Preview static build:

```bash
npm run preview
```

## Frontend Runtime Model

- Static HTML is generated at build for all public pages (`/fr`, `/en`, `/meta`, Trophy Road ranges, ranked, pro-tracking).
- React hydration is limited to interactive sections:
  - Player dashboard (`/fr/player/*`, `/en/player/*`)
  - Pro Tracking form (`client:idle`)
- Header and home/analyze search hero are Astro components with inline progressive JS (no React hydration).

## Supabase Setup

1. Create a Supabase project.
2. Link local project with Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

3. Push schema:

```bash
supabase db push
```

4. Set Edge Function secrets (Dashboard or CLI):

```bash
supabase secrets set CLASH_API_BASE_URL=https://proxy.royaleapi.dev/v1
supabase secrets set CLASH_ROYALE_API_TOKEN=xxx
supabase secrets set PROJECT_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SERVICE_ROLE_KEY=xxx
supabase secrets set CRON_SECRET=xxx
supabase secrets set ALLOWED_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io
supabase secrets set PRO_TRACKING_ALLOWLIST_TAGS="#GUUR8QP0,#ABC123,#P2LQ8V"
```

5. Deploy functions:

```bash
supabase functions deploy sync-cards --no-verify-jwt
supabase functions deploy analyze-player --no-verify-jwt
supabase functions deploy scan-player --no-verify-jwt
supabase functions deploy cron-scan --no-verify-jwt
supabase functions deploy pro-contact --no-verify-jwt
```

6. (Optional) run functions locally:

```bash
supabase start
supabase functions serve --env-file .env
```

## Configuration Clash Royale API avec proxy RoyaleAPI

1. Aller sur [developer.clashroyale.com](https://developer.clashroyale.com) et creer une cle API officielle Clash Royale.
2. Whitelister l'IP suivante dans le dashboard Clash Royale Developer:
   - `45.79.218.79`
3. Utiliser le proxy officiel/documente RoyaleAPI en base URL:
   - `https://proxy.royaleapi.dev/v1`
4. Ajouter les secrets Supabase:

```bash
supabase secrets set CLASH_ROYALE_API_TOKEN=xxx
supabase secrets set CLASH_API_BASE_URL=https://proxy.royaleapi.dev/v1
```

5. Deployer les Edge Functions:

```bash
supabase functions deploy sync-cards --no-verify-jwt
supabase functions deploy analyze-player --no-verify-jwt
supabase functions deploy scan-player --no-verify-jwt
supabase functions deploy cron-scan --no-verify-jwt
```

6. Tester le flux:

```bash
supabase functions invoke sync-cards --body '{"secret":"YOUR_CRON_SECRET"}'
```

Notes:
- Le frontend n'appelle jamais directement l'API Clash Royale.
- Le token Clash Royale reste uniquement dans les secrets Supabase.
- Le code reste compatible si `CLASH_API_BASE_URL` est bascule plus tard vers `https://api.clashroyale.com/v1` (cas VPS IP fixe).

## Edge Functions

### `sync-cards`

- Calls Clash API `GET /cards` through `CLASH_API_BASE_URL`.
- Upserts cards into `public.cards` (`id`, `name_en`, `rarity`, `max_level`, `elixir_cost`, `icon_url_source`).
- Requires `CRON_SECRET` in header `x-cron-secret` or request body.
- Returns `{ ok, inserted, updated, total }`.

### `analyze-player`

- Public endpoint for frontend use.
- Input: `POST { tag, lang? }`.
- Fetches player profile and battlelog from the configured Clash API base URL (`CLASH_API_BASE_URL`).
- Upserts player, snapshot, decks, battles, direct opponents (paused).
- Refreshes `refresh_deck_stats_by_trophy_range()` and `refresh_player_deck_stats()`.
- Uses clean API error mapping for frontend:
  - `403`: invalid key or non-whitelisted IP
  - `404`: player not found
  - `429`: Clash API rate limit
  - `502/503`: RoyaleAPI proxy temporarily unavailable
- Returns frontend payload: `player`, `recentDecks`, `recommendedDecksForCurrentRange`, `trophyMap` (with `ranges`), `directOpponents`, `deckChanges`, `newBattlesCount`, `statsUpdatedAt`.
- If the player tag is present in `PRO_TRACKING_ALLOWLIST_TAGS`, tracking is forced to `pro` priority and the payload includes `advancedTrackingEnabled: true`.

### `scan-player`

- Cron/internal scan endpoint.
- Input: `POST { tag, secret? }` and/or header `x-cron-secret`.
- Idempotent battle ingestion (only new `battle_id` rows are inserted).
- Updates `last_scan_at`, `next_scan_at`, resets/increments `scan_error_count`.

### `cron-scan`

- Batch scanner endpoint for schedulers.
- Requires header `x-cron-secret`.
- Selects due players in priorities `normal|active|top|pro`.
- Scans sequentially with 3-5 seconds delay between Clash API calls.
- Writes `scan_jobs_log` and returns `{ ok, playersScanned, newBattles, errors }`.

### `pro-contact`

- Public endpoint for pro tracking requests.
- Input: `POST { player_tag, email?, discord?, message?, language?, consent_contact, website? }`.
- Includes client/server validation and a honeypot field (`website`) anti-spam.
- Inserts request rows into `pro_tracking_requests` only (no automatic pro tracking enablement).

## Migrations

Schema files are in `supabase/migrations/`.

Apply pending migrations:

```bash
supabase db push
```

Reset local database and reapply migrations (local only):

```bash
supabase db reset
```

## Security Model

- Clash Royale token is never exposed to the frontend.
- Service role key is used only in Edge Functions through `Deno.env.get(...)`.
- Frontend uses only Supabase anon key and public Edge Function endpoints.
- CORS is restricted to GitHub Pages origins and localhost (+ optional `ALLOWED_ORIGINS`).
- Lightweight in-memory rate limits are applied by IP and/or tag on public endpoints.

## SEO Files Included

- `src/components/SEOHead.astro`
- `src/pages/sitemap.xml.ts`
- `public/robots.txt`
- `public/manifest.webmanifest`
- `public/og-cover.svg`
- JSON-LD:
  - `WebSite` + `Organization` injected globally from `SEOHead`
  - `BreadcrumbList` + `FAQPage` on meta/range/ranked pages

## GitHub Pages Deployment

GitHub Actions workflows:

- `.github/workflows/deploy-pages.yml`
- `.github/workflows/cron-scan.yml`
- `.github/workflows/sync-cards.yml`

Default behavior assumes project pages URL format:

- `https://USERNAME.github.io/REPOSITORY/`

If you use a custom domain or user pages root, update `PUBLIC_BASE_PATH` and `PUBLIC_SITE_URL` in workflow env.

Manual deploy trigger:

1. Push to `main` for automatic deploy.
2. Or run `Deploy DeckRadar to GitHub Pages` from Actions (`workflow_dispatch`).

## Secrets Configuration

### GitHub repository secrets (or variables)

These values are used by GitHub Actions workflows:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_SITE_URL`
- `PUBLIC_FUNCTIONS_BASE_URL`
- `CRON_SCAN_URL`
- `SYNC_CARDS_URL`
- `CRON_SECRET`

### Supabase Edge Function secrets

These values must be configured in Supabase Function secrets:

- `CLASH_API_BASE_URL` (recommended: `https://proxy.royaleapi.dev/v1`)
- `CLASH_ROYALE_API_TOKEN`
- `PROJECT_URL`
- `SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `ALLOWED_ORIGINS`
- `PRO_TRACKING_ALLOWLIST_TAGS` (comma/space/newline separated tags, e.g. `#GUUR8QP0,#ABC123`)

### Security rules

- GitHub Pages output is public.
- `PUBLIC_SUPABASE_ANON_KEY` can be visible in frontend bundles if RLS is correctly configured.
- `SERVICE_ROLE_KEY` must never be shipped to the frontend or GitHub Pages build artifacts.
- `CLASH_ROYALE_API_TOKEN` must never be shipped to the frontend or GitHub Pages build artifacts.

## Run Operational Jobs

Daily cards sync (manual HTTP trigger example):

```bash
curl -X POST "$SYNC_CARDS_URL" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{}'
```

Cron scan trigger (manual HTTP example, default limit 100):

```bash
curl -X POST "$CRON_SCAN_URL" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"limit":100}'
```

Or use GitHub Actions:

- `Sync Clash Royale Cards`
- `Cron Scan Players`

## Notes About Dynamic Player Paths on Static Hosting

GitHub Pages is static-only. Unknown dynamic URLs can return a 404 before client code runs. A custom `404.astro` fallback is included to redirect unknown `/fr/player/<tag>/` and `/en/player/<tag>/` routes to `/fr/player/?tag=...` or `/en/player/?tag=...` so the client dashboard still resolves the tag.

## Known Limits

- Clash Royale battle log is finite and recent-history only. Very old battles are not retroactively available.
- Some battle entries may miss `startingTrophies`; DeckRadar falls back to current trophies when possible.
- New or niche decks/ranges may have low sample depth; pages still render and improve automatically as data grows.
- Edge-function in-memory rate limiting is per-instance and best-effort (not a global distributed quota).
- GitHub Pages is static-only: direct deep links to unknown dynamic player paths depend on the 404 redirect fallback.

## Legal

DeckRadar is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Clash Royale and Supercell are trademarks of Supercell Oy.
