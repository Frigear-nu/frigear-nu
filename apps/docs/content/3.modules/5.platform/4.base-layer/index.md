---
title: Base Layer
description: Start a content website with the modules, styling, layouts and SEO already set up, by extending one layer.
seo:
  title: Base Layer
navigation:
  title: Overview
---

A content website needs the same setup every time: Nuxt UI, content pages, SEO, a header and a footer. The base layer
is that setup, ready to extend, and your app adds its content. If your app has no public content pages, install the
[modules](/modules) you need instead.

The package is `@frigear-nu/base`, a [Nuxt layer](https://nuxt.com/docs/4.x/guide/going-further/layers) rather than a
module. You add it with `extends`. The [Frigear website app](/examples/apps/frigear-nu-website) extends it.

## What you get

All on by default:

- **Pages.** A landing page at `/`, and a page for every Markdown file under `content/pages`.
- **Composables and helpers.** `useConfig`, `useCurrentPage`, `useNavigation` and locale helpers.
- **Layouts and components.** Two layouts, and a header and footer you can replace.
- **SEO.** Titles, Open Graph tags, a sitemap, robots rules and hreflang links.

:module-runtime{client}

::note
**Installed for you:** the modules under [Bundled modules](#bundled-modules), including [Menu](/modules/interface/menu).
**You add:** `nuxt` `^4.6` as a peer dependency, and [Cookie Consent](/modules/features/cookie-consent) or a
`CookieConsentBanner` component of your own.
**Optional:** `i18n.locales`, to localize the site.
::

## Quick setup

::steps

### Install the layer

```bash
pnpm add @frigear-nu/base nuxt
```

:::tip
Inside the [Frigear repository](/guide/concepts/glossary), use `"@frigear-nu/base": "workspace:*"` instead.
:::

### Extend it in `nuxt.config.ts`

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  extends: ['@frigear-nu/base'],
})
```

### Add content

Put the site config in `content/config.yaml` and the pages under `content/pages/`. Both are described in
[Content collections](/modules/platform/base-layer/content-collections).

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** `/` shows the landing page with the site header and footer, and `/about` renders
`content/pages/about.md`.
::

## Options

The layer has no options. It sets these defaults, which your app overrides in its own `nuxt.config.ts` or
`app.config.ts`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `i18n.strategy` | `'prefix_except_default'` | The default locale has no prefix, the others do. |
| `i18n.detectBrowserLanguage` | `false` | No automatic redirect to another locale. |
| `runtimeConfig.public.i18n.baseUrl` | `site.url` | Stops `useLocaleHead()` warning. Set only when neither this key nor `i18n.baseUrl` is. |
| `menus.content.main` | `true` | Builds the `main` menu from content. The header reads it with `useMenu('main')`. |
| `robots.disallow` | `['/admin', '/api', '/auth', '/account']` | Keeps app, API and auth routes out of search results. |
| `content.build.markdown.highlight` | `false` | Code highlighting is off. |
| `content.experimental.sqliteConnector` | `'native'` | The native SQLite connector for Nuxt Content. |
| `sourcemap.server` | `false` | No server source maps, which halves production build time. Client source maps stay. |
| `features.inlineStyles` | `true` | Inlines critical styles. |
| `experimental.defaults.nuxtLink.prefetchOn` | `{ interaction: true, visibility: false }` | Links prefetch on interaction only. |
| `app.config` `ui.colors` | `{ primary: 'green', neutral: 'slate' }` | Nuxt UI colours. |
| `app.config` `header.icon` | `{ desktop: false, mobile: true }` | Whether navigation icons show in the desktop and mobile header. |
| `app.config` `header.colorMode` | `true` | The colour mode button. Turn it off when the account menu offers it. |
| `app.config` `seo.localeAlternates` | `true` | Whether pages get [hreflang tags](/modules/platform/base-layer/content-collections#languages-and-hreflang) on multi-locale sites. |
| `eslint.config.stylistic` | `commaDangle: 'always-multiline'`, `braceStyle: '1tbs'` | Lint style. |

**`robots.disallow`** hides routes. Your app's `site.indexable` decides whether the site is indexed at all.

`app.config` also accepts `socials` (`Record<string, string>`) and `github.url`, typed in `app/app.d.ts`.

## Bundled modules

The layer registers these modules, so your app does not list them again.

| Group | Modules |
| --- | --- |
| Layer | `modules/config` (the i18n `baseUrl` default) and `modules/routing` (see [Routing](/modules/platform/base-layer/layouts-and-routing#routing)) |
| Nuxt | `@nuxt/eslint`, `@nuxt/icon`, `@nuxt/image`, `@nuxt/fonts`, `@nuxt/hints`, `@nuxt/ui`, `@nuxt/content`, `@nuxtjs/device`, `@nuxtjs/i18n` |
| SEO | `@nuxtjs/sitemap`, `@nuxtjs/robots`, `nuxt-og-image`, `nuxt-seo-utils` |
| Content | `@comark/nuxt` |
| Frigear | `@frigear-nu/menu` |

The layer also adds `app/assets/css/main.css`: Tailwind, Nuxt UI, the colour scales and the `Public Sans` font.

::warning
A `main.css` in your app replaces the layer's. Start it with `@import "@frigear-nu/base/app/assets/css/main.css";`, or
the font and colour scales are lost. That file already imports Tailwind and Nuxt UI.
::

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Content collections](/modules/platform/base-layer/content-collections) | The `config` and `pages` collections, localization, SEO and hreflang. | App developers |
| [Layouts and routing](/modules/platform/base-layer/layouts-and-routing) | Layouts, replaceable components and the content routes. | App developers |
| [Composables and utils](/modules/platform/base-layer/composables-and-utils) | `useConfig`, `useCurrentPage`, `useNavigation`, locale helpers and content utils. | App developers |

## Next steps

- [Content collections](/modules/platform/base-layer/content-collections) – write the site config and the first page.
- [Layouts and routing](/modules/platform/base-layer/layouts-and-routing) – replace the header or footer.
