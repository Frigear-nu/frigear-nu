export default defineNuxtConfig({
  extends: ["docus"],
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
