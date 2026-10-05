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
        previews: {}, // this is required for CF preview deployments...
      },
    },
  },
});
