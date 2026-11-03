---
title: UI
description: Shared Vue components and composables for Frigear Nuxt applications, built on Nuxt UI.
navigation:
  title: Overview
---

The shared building blocks for Frigear screens: the page components every admin and account page is made of, form inputs,
a confirmation dialog, and composables and helpers for toasts, formatting, links and translated text. Use it for any
screen built on Nuxt UI; it requires `@nuxt/ui` and [`@frigear-nu/module-kit`](/modules/platform/module-kit). The module
auto-imports its components (lazily, by name), composables and helpers. How the pieces fit together is described in
[UX patterns](/guide/ux-patterns/layouts-and-navigation).

:module-runtime{client}

::note
**Requires** `@nuxt/ui` and [`@frigear-nu/module-kit`](/modules/platform/module-kit), both installed automatically as module
dependencies.
**Optional** `nuxt-monaco-editor` (only `MonacoCodeEditor` needs it) and `@nuxtjs/i18n`: when installed, the module
contributes shared `da` and `en` strings and the locale composables follow the active locale.
::

## Quick setup

Admin, Account and the feature modules install UI for you. Add it yourself when you use it on its own:

```bash
pnpm add @frigear-nu/ui @nuxt/ui
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/ui'],
})
```

## Options

None. The module registers its own `runtime` folder as a Tailwind source, so the classes its components use are
generated without configuration in the host. Its playground at `packages/ui/playground` is for developing and
previewing components.

## On this module

- [Page components](/modules/interface/ui/page-components): headings, tabs, cards, tables, row menus, stat cards and per-entity actions.
- [App shell](/modules/interface/ui/app-shell): the dashboard layout of the admin area.
- [Form inputs](/modules/interface/ui/form-inputs): currency, tag, translated and markdown inputs and more.
- [Composables and helpers](/modules/interface/ui/composables): confirmations, errors, data loading, formatting, tables and locale.
- [Reference](/modules/interface/ui/reference): subpath exports, translated and money helpers, translation keys.
