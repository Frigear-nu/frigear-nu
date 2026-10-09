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
localized/non-localized setup, see the [Base Layer docs](../../apps/docs/content/3.layers/1.base.md).

Page front matter also accepts `container: true`, which wraps the rendered body in a `UContainer` (use it for plain prose pages such as legal; pages built from `u-page-*` sections manage their own containers).

## Notes

- This package is a shared workspace dependency and is linked via `workspace:*` from apps.
- Keep changes here compatible with both consuming apps.
- If you change module config or public runtime behavior, validate both app consumers in the same change.
