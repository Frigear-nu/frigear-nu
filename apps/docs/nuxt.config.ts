export default defineNuxtConfig({
  extends: ["docus"],
  site: {
    // Docus only infers the site URL from Vercel/Netlify/Pages env vars, not Workers Builds. Without it,
    // prerendered canonical URLs fall back to the build-time request origin (`http://localhost`) and
    // nuxt-llms skips `/llms.txt`. Previews keep the production canonical; override with NUXT_SITE_URL.
    url: process.env.NUXT_SITE_URL || "https://docs.frigear.dev",
  },
  routeRules: {
    // The quick start became the workspace starter guide.
    "/getting-started/quick-start": { redirect: { to: "/guides/workspace-starter", statusCode: 301 } },
    "/raw/getting-started/quick-start.md": { redirect: { to: "/raw/guides/workspace-starter.md", statusCode: 301 } },
  },
  content: {
    experimental: {
      sqliteConnector: "native",
    },
  },
  nitro: {
    cloudflare: {
      wrangler: {
        // Required for `wrangler preview` to report a *.workers.dev preview URL.
        workers_dev: true,
        preview_urls: true,
        previews: {}, // this is required for CF preview deployments...
      },
    },
  },
});
