import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

const site = process.env.PUBLIC_SITE_URL ?? "https://example.com";
const base = process.env.PUBLIC_BASE_PATH ?? "/";

export default defineConfig({
  site,
  base,
  integrations: [react(), tailwind()],
  output: "static",
  trailingSlash: "always"
});
