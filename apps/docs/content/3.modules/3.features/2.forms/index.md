---
title: Forms
description: Publish forms your staff edit without a deploy, and store, email or forward every submission.
navigation:
  title: Overview
---

Forms lets you publish contact forms, sign-ups and applications without building a page for each one.
[Staff](/guide/concepts/glossary) build a form in the admin area, or you define it in code. Every submission is stored,
emailed or passed to your own code. Use it when visitors or users should send you structured answers. For settings a
user keeps on their own account, use [Preferences](/modules/identity/preferences) instead.

The package is `@frigear-nu/forms`. Each form is a definition stored in the database.

## What you get

- **Pages** (opt-in): a public page per form at `/forms/:slug`. `<FormRenderer>` and a Markdown embed place a form on
  any other page.
- **Admin area** (opt-in, with [Admin](/modules/interface/admin)): the form list at `/admin/forms`, a visual builder for
  each form, and its submissions.
- **Server routes** (on by default): read and submit a published form, and a staff API for forms, submissions and
  access. The staff API stays closed until your app answers the `forms:authorize`
  [policy hook](/guide/concepts/glossary).
- **Composables and helpers** (on by default): `defineForm()` to write a form in code, and a hook that receives every
  submission.
- **MCP tools** (opt-in): list and submit forms, and manage them as staff, through [MCP](/modules/features/mcp).
- **Emails** (opt-in per form): each submission is emailed through [Notify](/modules/platform/notify) to the recipients
  the form names. Your app picks the Notify driver; until it does, emails are not sent.

:module-runtime{server client}

::note
**Installed for you:** [Notify](/modules/platform/notify), [Auth](/modules/identity/auth),
[Users](/modules/identity/users), [MCP](/modules/features/mcp), [UI](/modules/interface/ui) and Module Kit.
**You add:** `@nuxthub/core` (Forms turns on its key-value storage for rate limiting and blob storage for uploads), and
`@nuxt/ui` for the pages.
**Optional:** [Admin](/modules/interface/admin) for the admin pages, and [Menu](/modules/interface/menu) for the admin
sidebar item.
::

## Quick setup

::steps

### Install Forms

```bash
pnpm add @frigear-nu/forms @nuxthub/core
```

### Add it to nuxt.config.ts

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/forms'],
  forms: {
    settings: {
      pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true },
    },
  },
})
```

### Generate the migration

:::warning
Without a [migration](/guide/concepts/glossary) the form tables do not exist, and creating or submitting a form fails.
:::

Forms adds six tables. Generate the migration and commit it:

```bash
pnpm db:generate
```

### Answer the policy hook

:::warning
Without this hook nobody can manage forms. Staff access is denied until your app allows it.
:::

```ts [server/plugins/forms-policy.ts]
// Loads the module's hook types: Nitro's server tsconfig does not include module types.
import type {} from '@frigear-nu/forms'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    ctx.allowed = false // replace with your own staff check on ctx.userId
  })
})
```

[Answer its policy hook](/get-started/adding-modules#answer-its-policy-hook) shows a check by role.

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** signed in as staff, `/admin/forms` lists your forms. A published form answers at
`/forms/<slug>`.
::

## Options

Options go under the `forms` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `settings.pages.form` | `string \| boolean` | off | The public form page. `true` is `/forms/:slug`. |
| `settings.pages.admin` | `string \| boolean` | off | The admin form list. `true` is `/admin/forms`. |
| `settings.pages.adminForm` | `string \| boolean` | off | The builder. `true` is `/admin/forms/:id`. |
| `settings.pages.adminSubmissions` | `string \| boolean` | off | A form's submissions. `true` is `/admin/forms/:id/submissions`. |
| `settings.pages.adminSubmission` | `string \| boolean` | off | One submission. `true` is `/admin/forms/:id/submissions/:submissionId`. |
| `settings.rateLimit` | `number` | `10` | Submissions per client and form in one window. `0` turns rate limiting off. |
| `settings.rateLimitWindowSeconds` | `number` | `600` | The length of the window. |
| `settings.mcp` | `boolean` | `false` | Adds the module's [MCP tools](/modules/features/forms/server#mcp-tools). |
| `seed.enabled` | `boolean` | `false` | Inserts `seed.forms` at startup. |
| `seed.forms` | `SeedForm[]` | `[]` | `{ slug, name, status?, definition }`. `status` defaults to `draft`. |
| `captcha.<provider>.siteKey` | `string` | `''` | The public site key. |
| `captcha.<provider>.secretKey` | `string` | `''` | The secret key, used only on the server. |
| `captcha.defaultProvider` | `CaptchaProvider` | `'turnstile'` | The provider of a captcha field that names none. |
| `encryptionKey` | `string` | `''` | The key that encrypts [per-form secrets](/modules/features/forms/server#per-form-secrets). |

**`settings.pages.*`** paths keep the parameters of the default, such as `:slug`. Admin pages need Admin.

**`settings.rateLimit`** also caps wrong password attempts, on a separate counter with the same window. `0` turns both
off.

**`captcha.<provider>`** is `turnstile`, `recaptcha` or `hcaptcha`.

**`encryptionKey`** falls back to `NUXT_ENCRYPTION_KEY`, then to the session password.

### Runtime config

| Env var | Option |
| --- | --- |
| `NUXT_FORMS_SEED_ENABLED` | `seed.enabled` |
| `NUXT_PUBLIC_FORMS_CAPTCHA_TURNSTILE_SITE_KEY`, `…_RECAPTCHA_SITE_KEY`, `…_HCAPTCHA_SITE_KEY` | `captcha.<provider>.siteKey` |
| `NUXT_FORMS_CAPTCHA_TURNSTILE_SECRET_KEY`, `…_RECAPTCHA_SECRET_KEY`, `…_HCAPTCHA_SECRET_KEY` | `captcha.<provider>.secretKey` |
| `NUXT_PUBLIC_FORMS_CAPTCHA_DEFAULT_PROVIDER` | `captcha.defaultProvider` |
| `NUXT_FORMS_ENCRYPTION_KEY` | `encryptionKey` |

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Definition](/modules/features/forms/definition) | What a form is made of: fields, conditions, phone fields, open periods, the email, captcha and the builder. | App developers |
| [Server API](/modules/features/forms/server) | Submitting, who may submit, rate limits, secrets, seeding, staff access and MCP tools. | App developers and module authors |
| [App](/modules/features/forms/app) | Pages, components, the Markdown embed, composables and utils. | App developers |
| [Reference](/modules/features/forms/reference) | Hooks, routes, tables and translations. | App developers |

## Next steps

- [Build a form](/examples/tasks/build-a-form) – define a contact form in code, seed it and receive it by email.
- [Definition](/modules/features/forms/definition) – add steps, conditional fields, uploads and an open period.
- [Send an email](/examples/tasks/send-an-email) – pick the Notify driver that delivers form emails.
