# @frigear-nu/base

Shared Nuxt layer for the frigear.nu websites.

This package is the common foundation used by the Nuxt apps in this monorepo. It centralizes shared configuration, Nuxt modules, app defaults, and styling primitives so the websites stay consistent without duplicating setup in each app.

## What it provides

- Shared Nuxt config and module wiring
- Tailwind and UI defaults
- Common app-level conventions and aliases
- Reusable runtime setup for Frigear.nu sites

## Consumers

- [apps/website](../../apps/website)

## Usage

```bash
pnpm add @frigear-nu/base nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@frigear-nu/base'],
})
```

`nuxt` is a peer dependency. The layer ships as source (`app`, `modules`, `shared`, `utils`, `content.config.ts`,
`nuxt.config.ts`) with no build step. Its `@frigear-nu/menu` dependency is installed with it.

## Setup

From the repository root:

```bash
corepack enable
pnpm install
```

## Local development

This package is usually consumed through the app workspaces rather than run directly. If you need to validate the layer in isolation:

```bash
pnpm --filter '@frigear-nu/base' typecheck
pnpm --filter '@frigear-nu/base' lint
```

## Common workspace commands

```bash
# Validate the shared layer
pnpm --filter '@frigear-nu/base' typecheck
pnpm --filter '@frigear-nu/base' lint

# Run an app that consumes the layer
pnpm --filter '@frigear-nu/website' dev
```

## Optional i18n for content

Content collections (`config`, `pages`) support opt-in localization, fully driven by the consuming app:

- By default (no i18n configured), content stays flat: `content/config.yaml`, `content/pages/**`.
- To localize, register `@nuxtjs/i18n` in the consuming app and configure its `locales` (e.g. `['en', 'no']`), then nest content under a locale folder: `content/en/config.yaml`, `content/en/pages/**`, `content/no/config.yaml`, `content/no/pages/**`.
- When locales are configured, `content.config.ts` defines locale-suffixed collections (`config_en`, `pages_en`, ...) instead of the flat ones. `useConfig`/`useCurrentPage` pick the right collection automatically based on the current `$i18n` locale.
- No locale folder/config means no behavior change — this feature is entirely opt-in.

The `config` and `pages` collections are validated against `WebsiteConfigSchema` and `WebsitePageSchema` (see
`shared/schema/config.ts` and `shared/schema/page.ts`). For the full schema reference and more detail on the
localized/non-localized setup, see the [Base Layer docs](../../apps/docs/content/3.modules/5.platform/4.base-layer.md).

Page front matter also accepts `container: true`, which wraps the rendered body in a `UContainer` (use it for plain prose pages such as legal; pages built from `u-page-*` sections manage their own containers). It also accepts `seo: { title, description, image, noindex }`, and `config.yaml` accepts `seo: { titleTemplate, description, image }`; the layer ships no SEO defaults, see the docs.

## Languages and hreflang

With more than one i18n locale, every page gets `<link rel="alternate" hreflang>` tags for each locale plus
`x-default`, and `og:locale:alternate` for the other locales (`useLocaleAlternates()`, called from `app.vue`).

- The alternates come from the app's `i18n.locales`, through `@nuxtjs/i18n`'s `useLocaleHead()`. The canonical,
  `og:url`, `og:locale` and `<html lang>` stay with `nuxt-seo-utils`.
- Each locale's `language` (BCP 47) decides its hreflang; a locale without one gets no alternate. Include a region
  (`da-DK`, `en-GB`) for `og:locale:alternate`, which leaves out bare languages such as `en`.
- Hrefs are absolute like the canonical: from `site.url` when set, otherwise from the request origin. Prerendered
  routes need `site.url` at build time; without it their alternate links are skipped with a warning.
- Opt out with `seo: { localeAlternates: false }` in `app.config.ts`, for apps that write their own hreflang tags or
  enable i18n's `experimental.strictSeo`.

## Notes

- This package is a shared workspace dependency and is linked via `workspace:*` from apps.
- Keep changes here compatible with both consuming apps.
- If you change module config or public runtime behavior, validate both app consumers in the same change.
- Client-side navigation: the content page and landing template render `UPageHeader`, `UPageBody` and `ContentRenderer` directly, not their `Lazy*` variants. Every page needs them, and a lazy wrapper costs one more round trip on each navigation. `app.vue` shows `NuxtLoadingIndicator`. `@nuxt/ui` must be ≥ 4.12: older `ULink` renders `NuxtLink` in `custom` mode without its prefetch listeners, so links never prefetch on hover or focus.

## Publishing

Released like the other packages (see the [publishing guide](../../apps/docs/content/5.contribute/4.publishing.md)):
the **Release** workflow with `base-layer`, or `pnpm exec release-it` from this folder. Check what ships with
`pnpm pack --dry-run`. Only the paths in `files` are published; add new top-level folders there. Dependencies the layer
needs at runtime belong in `dependencies`, not `devDependencies`. There is deliberately no `postinstall` script: it would
run in every consumer's install.
