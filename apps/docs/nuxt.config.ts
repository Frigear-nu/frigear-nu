export default defineNuxtConfig({
  extends: ["docus"],
  content: {
    experimental: {
      sqliteConnector: "native",
    },
  },
});
