---
title: UI
description: Gives every module's screens the same headings, cards, tables, forms and toasts, on top of Nuxt UI.
navigation:
  title: Overview
---

UI makes screens from different modules look like one app. It has the headings, cards, tables, inputs and toasts
of every admin and account page. Admin, Account and the feature modules install it for you.

The package is `@frigear-nu/ui`. Its components and composables are auto-imported.

## What you get

- **Components** (on by default): page components, the App shell and form inputs.
- **Composables and helpers** (on by default): confirmations, toasts, data loading, formatting and tables.
- **Translations** (opt-in, with `@nuxtjs/i18n`): shared `da` and `en` strings that every module reuses.

:module-runtime{client}

::note
**Installed for you:** [`@frigear-nu/module-kit`](/modules/platform/module-kit).

**You add:** `@nuxt/ui`.

**Optional:** `@nuxtjs/i18n` and `nuxt-monaco-editor` (for `MonacoCodeEditor`).
::

## Quick setup

::steps

### Install UI

Skip this when another module installs UI.

```bash
pnpm add @frigear-nu/ui @nuxt/ui
```

### Add it to nuxt.config.ts

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/ui'],
})
```

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** `<PageHeading title="Orders" />` renders a heading without an import.
::

## Options

The module has no options.

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Page components](/modules/interface/ui/page-components) | Headings, tabs, cards, tables and forms. | Page authors |
| [App shell](/modules/interface/ui/app-shell) | The admin dashboard layout. | Module authors |
| [Form inputs](/modules/interface/ui/form-inputs) | Money, date, tag and translated inputs. | Page authors |
| [Composables and helpers](/modules/interface/ui/composables) | Confirmations, data loading, formatting and tables. | Page authors |
| [UI reference](/modules/interface/ui/reference) | Import paths, helpers and translation keys. | Page authors |

## Next steps

- [Pages](/guide/ux-patterns/pages) – see how a list and a detail page combine the components.
- [Admin](/modules/interface/admin) – add the admin area these components are built for.
