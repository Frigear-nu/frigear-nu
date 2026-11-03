---
title: Base Layer
description: The shared Nuxt layer for Frigear websites - bundled modules, content collections, layouts, routing and composables.
seo:
  title: Base Layer
navigation:
  title: Overview
---

`@frigear-nu/base` is a [Nuxt layer](https://nuxt.com/docs/4.x/guide/going-further/layers), not a module: you add it with
`extends`, and it bundles and configures the modules for you. It centralizes the module wiring, styling, UI defaults and
content-driven page conventions of Frigear websites, so applications do not repeat the same setup.
[`apps/website`](/examples/apps/frigear-nu-website) extends it.

:module-runtime{client}

::note
**Requires** Nuxt 4 (`^4.6`) and its app layout (`app/`); Nuxt 3 is not supported. It bundles every module listed under
[Bundled modules](#bundled-modules), including [`@frigear-nu/menu`](/modules/interface/menu). `@nuxtjs/i18n` is
installed, but localization stays opt-in until the app sets `i18n.locales`.
::

## Quick setup

Install the layer and `nuxt` (a peer dependency), then extend it:

```bash
pnpm add @frigear-nu/base nuxt
```

Inside this monorepo use the workspace protocol instead (`"@frigear-nu/base": "workspace:*"`).

```ts
export default defineNuxtConfig({
  extends: ['@frigear-nu/base'],
})
```

Put the site content under `content/` in the app (see [Content collections](/modules/platform/base-layer/content-collections)).

## Options

The layer has no options of its own. It sets the defaults below, which an app overrides in its own
`nuxt.config.ts` or `app.config.ts`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `i18n.strategy` | `'prefix_except_default'` | The default locale is unprefixed, the others get a prefix. |
| `i18n.detectBrowserLanguage` | `false` | No automatic locale redirect. |
| `runtimeConfig.public.i18n.baseUrl` | `site.url` | Only when neither `i18n.baseUrl` nor this key is set. `useLocaleHead()` warns on every render without it. |
| `menus.content.main` | `true` | Builds the `main` menu from content (see [Menu](/modules/interface/menu)); the header reads it with `useMenu('main')`. |
| `robots.disallow` | `['/admin', '/api', '/auth', '/account']` | Keeps app, API and auth routes out of search results. Whether the site is indexable at all comes from `site.indexable`, set by the host. |
| `content.build.markdown.highlight` | `false` | Code highlighting is off. |
| `content.experimental.sqliteConnector` | `'native'` | Native SQLite connector for Nuxt Content. |
| `sourcemap.server` | `false` | Skips server source maps to halve production build time; client source maps are kept. |
| `features.inlineStyles` | `true` | Inlines critical styles. |
| `experimental.defaults.nuxtLink.prefetchOn` | `{ interaction: true, visibility: false }` | Links prefetch on interaction only. |
| `app.config` `ui.colors` | `{ primary: 'green', neutral: 'slate' }` | Nuxt UI colours. |
| `app.config` `header.icon` | `{ desktop: false, mobile: true }` | Whether navigation icons show in the desktop and mobile header. |
| `app.config` `header.colorMode` | `true` | Whether the header shows the colour mode button. Turn it off when the account menu (`@frigear-nu/account`) offers Appearance instead. |
| `app.config` `seo.localeAlternates` | `true` | Whether pages get hreflang and `og:locale:alternate` tags on sites with more than one locale (see [Languages and hreflang](/modules/platform/base-layer/content-collections#languages-and-hreflang)). |
| `eslint.config.stylistic` | `commaDangle: 'always-multiline'`, `braceStyle: '1tbs'` | Lint style. |

`app.config` also accepts `socials` (`Record<string, string>`) and `github.url`, typed in `app/app.d.ts`.

## Bundled modules

`nuxt.config.ts` registers these modules, so apps do not list them again:

| Group | Modules |
| --- | --- |
| Layer-internal | `modules/config` (a no-op placeholder), `modules/routing` (see [Routing](/modules/platform/base-layer/layouts-and-routing#routing)) |
| Nuxt | `@nuxt/eslint`, `@nuxt/icon`, `@nuxt/image`, `@nuxt/fonts`, `@nuxt/hints`, `@nuxt/ui`, `@nuxt/content`, `@nuxtjs/device`, `@nuxtjs/i18n` |
| SEO | `@nuxtjs/sitemap`, `@nuxtjs/robots`, `nuxt-og-image`, `nuxt-seo-utils` |
| Content | `@comark/nuxt` |
| Frigear | `@frigear-nu/menu` |

It also adds `app/assets/css/main.css` (Tailwind, Nuxt UI, the green and brand colour scales and the `Public Sans`
font) to `css` unless the app already has a `main.css`. An app with its own `main.css` replaces the layer's, so it must
start with `@import "@frigear-nu/base/app/assets/css/main.css";` to keep the font and the colour scales (that file
already imports Tailwind and Nuxt UI, so the app's file does not repeat them).

`app/app.vue` renders `<CookieConsentBanner />`, which comes from
[Cookie Consent](/modules/features/cookie-consent). That module is not bundled, so an app that extends the layer without it
needs to provide the component.

## On this module

- [Content collections](/modules/platform/base-layer/content-collections): `config` and `pages` collections, localization, SEO and hreflang.
- [Layouts and routing](/modules/platform/base-layer/layouts-and-routing): layouts, overridable components and the catch-all content routes.
- [Composables and utils](/modules/platform/base-layer/composables-and-utils): `useConfig`, `useCurrentPage`, `useNavigation`, locale helpers and content utils.
