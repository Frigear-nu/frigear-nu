// Pages moved in the docs restructure. Published package.json `homepage` fields and READMEs still link to the old
// URLs until each package is released again, so keep these redirects.
const redirects: Record<string, string> = {
  "/getting-started": "/get-started/introduction",
  "/getting-started/introduction": "/get-started/introduction",
  "/getting-started/quick-start": "/get-started/installation",
  "/getting-started/local-development": "/contribute/local-development",
  "/getting-started/publishing": "/contribute/publishing",
  "/getting-started/writing-a-module": "/contribute/writing-a-module/scaffold",
  "/getting-started/ux-patterns": "/guide/ux-patterns/layouts-and-navigation",
  "/guides": "/examples/starters/workspace",
  "/guides/workspace-starter": "/examples/starters/workspace",
  "/guides/mobile-starter": "/examples/starters/mobile",
  "/guides/mobile-standalone-starter": "/examples/starters/mobile-standalone",
  "/guides/own-oauth-server": "/guide/going-further/own-oauth-server",
  "/guides/oauth-application": "/guide/going-further/oauth-application",
  "/applications": "/examples/apps/frigear-nu-website",
  "/applications/website": "/examples/apps/frigear-nu-website",
  "/applications/docs": "/contribute/documentation",
  "/layers": "/modules/platform/base-layer",
  "/layers/base": "/modules/platform/base-layer",
  "/packages": "/contribute/tooling/cli",
  "/packages/cli": "/contribute/tooling/cli",
  "/packages/eslint-config": "/contribute/tooling/eslint-config",
  "/modules/auth": "/modules/identity/auth",
  "/modules/users": "/modules/identity/users",
  "/modules/account": "/modules/identity/account",
  "/modules/authorization": "/modules/identity/authorization",
  "/modules/preferences": "/modules/identity/preferences",
  "/modules/oauth-server": "/modules/identity/oauth-server",
  "/modules/identity/frigear-resource": "/modules/identity/oauth-resource",
  "/modules/frigear-resource": "/modules/identity/oauth-resource",
  "/modules/stripe": "/modules/commerce/stripe",
  "/modules/payments": "/modules/commerce/payments",
  "/modules/subscriptions": "/modules/commerce/subscriptions",
  "/modules/events": "/modules/features/events",
  "/modules/forms": "/modules/features/forms",
  "/modules/cookie-consent": "/modules/features/cookie-consent",
  "/modules/mcp": "/modules/features/mcp",
  "/modules/ui": "/modules/interface/ui",
  "/modules/admin": "/modules/interface/admin",
  "/modules/menu": "/modules/interface/menu",
  "/modules/widget": "/modules/interface/widget",
  "/modules/mobile": "/modules/interface/mobile",
  "/modules/module-kit": "/modules/platform/module-kit",
  "/modules/notify": "/modules/platform/notify",
  "/modules/email-templates": "/modules/platform/email-templates",
};

export default defineNuxtConfig({
  extends: ["docus"],
  site: {
    // Docus only infers the site URL from Vercel/Netlify/Pages env vars, not Workers Builds. Without it,
    // prerendered canonical URLs fall back to the build-time request origin (`http://localhost`) and
    // nuxt-llms skips `/llms.txt`. Previews keep the production canonical; override with NUXT_SITE_URL.
    url: process.env.NUXT_SITE_URL || "https://docs.frigear.dev",
  },
  routeRules: Object.fromEntries(
    Object.entries(redirects).map(([from, to]) => [from, { redirect: { to, statusCode: 301 } }]),
  ),
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
