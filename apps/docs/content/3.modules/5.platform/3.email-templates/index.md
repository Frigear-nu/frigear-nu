---
title: Email Templates
description: Design your app's emails, and the emails modules send, as Vue components with your own branding.
navigation:
  title: Overview
---

Emails from modules, such as a sign-in link, go out as plain HTML by default. Email Templates renders them, and your
own emails, from Vue components with your logo and colours. Your app replaces any module's email by adding a file with
the same name. To only choose how email is delivered, [Notify](/modules/platform/notify) is enough.

The package is `@frigear-nu/email-templates`. It renders with [nuxt-email-renderer](https://nuxtemail.com) and sends
through Notify.

## What you get

- **Composables and helpers.** `sendEmailTemplate` and `renderEmailTemplate` on the server, typed per template. On by
  default.
- **Emails.**
  - Styled `Email*` components to build emails from. On by default.
  - Templates for the emails of [Auth](/modules/identity/auth), [Users](/modules/identity/users) and
    [Subscriptions](/modules/commerce/subscriptions). On when the module is in `modules`.

:module-runtime{server}

::note
**Installed for you:** Notify, Module Kit and nuxt-email-renderer.
**You add:** `@frigear-nu/email-templates` to `modules`.
**Optional:** `@nuxtjs/i18n`, to translate templates.
::

## Quick setup

::steps

### Install the module

```bash
pnpm add @frigear-nu/email-templates
```

:::warning
Module emails use their templates only when `@frigear-nu/email-templates` is in your `modules`. Installed as a
dependency of another module, it is not enough, and Notify sends the plain HTML.
:::

### Configure it in `nuxt.config.ts`

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@frigear-nu/email-templates'],
  emailTemplates: {
    brandName: 'Frigear',
    logoUrl: 'https://frigear.nu/logo.png',
  },
})
```

### Add a template

Every top-level `.vue` file in `app/emails` is a template, named by its file name. Copy `welcome.vue` from
[Composing an email](/modules/platform/email-templates/components#composing-an-email).

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** the template in the email preview of Nuxt DevTools.
::

## Options

Options go under the `emailTemplates` key. Each can also be set at runtime.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `brandName` | `string` | `'Frigear'` | The logo's alt text, and the header when there is no logo. |
| `logoUrl` | `string` | none | The header logo. Relative paths resolve against `siteUrl`. |
| `siteUrl` | `string` | none | The base URL for a relative `logoUrl`. |
| `colors.primary` | `string` | `'#2563eb'` | Button colour. |
| `colors.danger` | `string` | `'#dc2626'` | Colour of a `danger` heading or button. |

::tip
Use an absolute URL for the logo. Mail clients cannot resolve relative paths.
::

Templates may also live in `emails/` or the `nuxtEmailRenderer.emailsDir` folder. The renderer supplies the `E*`
components, `<ESubject>`, `$t`, `globalCss` and the preview. Its `codeHighlighting` is off, which keeps Shiki out of
the server bundle. Set `nuxtEmailRenderer.codeHighlighting: true` to use `<ECodeBlock>`.

### Runtime config

| Env var | Option |
| --- | --- |
| `NUXT_EMAIL_TEMPLATES_BRAND_NAME` | `brandName` |
| `NUXT_EMAIL_TEMPLATES_LOGO_URL` | `logoUrl` |
| `NUXT_EMAIL_TEMPLATES_SITE_URL` | `siteUrl` |
| `NUXT_EMAIL_TEMPLATES_COLORS_PRIMARY`, `_DANGER` | `colors.primary`, `colors.danger` |

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Email components](/modules/platform/email-templates/components) | The `Email*` components, and three example emails. | App developers |
| [Server](/modules/platform/email-templates/server) | `sendEmailTemplate`, `renderEmailTemplate`, and bundle notes. | App developers |
| [Module emails](/modules/platform/email-templates/module-emails) | Shipping a template from a module, and overriding one. | Module authors and app developers |

## Next steps

- [Email templates server](/modules/platform/email-templates/server) – send the template from a server route.
- [Module emails](/modules/platform/email-templates/module-emails) – give the sign-in emails your own words.
