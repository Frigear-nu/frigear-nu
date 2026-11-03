---
title: Forms
description: Dynamic forms stored in the database - single page or stepped, conditional fields, file uploads, stored or email-only submissions.
navigation:
  title: Overview
---

Forms as one declarative **definition** stored in the database, one renderer and one server pipeline: single page or
stepped, conditional fields, file uploads, captcha, access control, and stored or email-only submissions.

:module-runtime{server client}

::note
**Requires** [`@frigear-nu/module-kit`](/modules/platform/module-kit), [`@frigear-nu/auth`](/modules/identity/auth),
[`@frigear-nu/users`](/modules/identity/users), [`@frigear-nu/mcp`](/modules/features/mcp), [`@frigear-nu/notify`](/modules/platform/notify)
(email delivery; the host picks the driver), [`@frigear-nu/ui`](/modules/interface/ui) and `@nuxthub/core` with **KV** (rate
limiting) and **blob** (uploads) enabled.
**Optional** [`@frigear-nu/menu`](/modules/interface/menu) (menu entries) and [`@frigear-nu/admin`](/modules/interface/admin) (the admin
pages live in its shell, so they only exist when it is installed). The pages follow the
[UX patterns](/guide/ux-patterns/layouts-and-navigation) and are built from the shared components of `@frigear-nu/ui`.
::

## Quick setup

```bash
pnpm add @frigear-nu/forms @nuxthub/core
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/forms'],
  forms: {
    settings: {
      pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true },
    },
  },
})
```

Pages are opt-in and use [`@nuxt/ui`](https://ui.nuxt.com). `<FormRenderer slug="..." />` can also be placed in any page.

```ts
// server/plugins/forms-policy.ts - who may manage forms (denied by default)
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    ctx.allowed = await isStaff(ctx.userId)
  })
})
```

::warning
Every host app and test fixture must generate and commit a migration for the module's tables. See [Database](/modules/features/forms/reference#database)
and [Module Kit](/modules/platform/module-kit/database#migrations-and-database-backed-module-tests).
::

## Design

- **A form is data.** The definition is JSON in the `forms` table, so editors can change fields without a deploy.
- **One compiler.** `buildFormSchema(definition, answers)` turns a definition into a zod schema. The client uses it per
  step, the server for the whole form, so both sides agree on what is required.
- **Submissions are snapshots.** Each submission stores the definition (and its `version`) it was answered against, so
  old submissions keep rendering after the form changes.
- **Storing is optional.** `storage: 'none'` never persists answers: they are only emitted through `forms:submitted`
  (and emailed).
- **Delivery never loses a stored submission.** The row is written first; delivery errors are recorded on it and can be
  retried from the admin.
- **Staff access is the host's decision.** There is no shared permission system; see [Authorization](/modules/features/forms/server#authorization).
- **Forms are never deleted.** `DELETE` archives, so submissions always keep their form.

## Options

All options live under `forms`.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `settings.pages.form` | `string \| boolean` | off | Public form page; must contain `:slug`. `true` = `/forms/:slug`. |
| `settings.pages.admin` | `string \| boolean` | off | Admin list. `true` = `/admin/forms`. Admin pages need `@frigear-nu/admin`. |
| `settings.pages.adminForm` | `string \| boolean` | off | Admin editor; must contain `:id`. `true` = `/admin/forms/:id`. |
| `settings.pages.adminSubmissions` | `string \| boolean` | off | Submissions of one form; must contain `:id`. `true` = `/admin/forms/:id/submissions`. |
| `settings.pages.adminSubmission` | `string \| boolean` | off | One submission; must contain `:id` and `:submissionId`. `true` = `/admin/forms/:id/submissions/:submissionId`. |
| `settings.rateLimit` | `number` | `10` | Submissions per client and form per window; `0` disables rate limiting (including password-attempt limiting). |
| `settings.rateLimitWindowSeconds` | `number` | `600` | Length of the window. |
| `settings.mcp` | `boolean` | `false` | Expose this module's tools on the [MCP](/modules/features/mcp) endpoint. |
| `seed.enabled` | `boolean` | `false` | Insert `seed.forms` at startup (env `NUXT_FORMS_SEED_ENABLED`). See [Seeding and import](/modules/features/forms/server#seeding-and-import). |
| `seed.forms` | `SeedForm[]` | `[]` | `{ slug, name, status?, definition }`; `status` defaults to `draft`. |
| `captcha.<provider>.siteKey` | `string` | `''` | Public site key; `<provider>` is `turnstile`, `recaptcha` or `hcaptcha`. |
| `captcha.<provider>.secretKey` | `string` | `''` | Secret key, server only. |
| `captcha.defaultProvider` | `CaptchaProvider` | `'turnstile'` | Provider of a captcha field that names none. |
| `encryptionKey` | `string` | `''` | Key for per-form secrets. Falls back to `NUXT_ENCRYPTION_KEY`, then the session password. |

Environment variables:

| Variable | Option |
| --- | --- |
| `NUXT_FORMS_SEED_ENABLED` | `seed.enabled` |
| `NUXT_PUBLIC_FORMS_CAPTCHA_TURNSTILE_SITE_KEY`, `..._RECAPTCHA_SITE_KEY`, `..._HCAPTCHA_SITE_KEY` | `captcha.<provider>.siteKey` |
| `NUXT_FORMS_CAPTCHA_TURNSTILE_SECRET_KEY`, `..._RECAPTCHA_SECRET_KEY`, `..._HCAPTCHA_SECRET_KEY` | `captcha.<provider>.secretKey` |
| `NUXT_PUBLIC_FORMS_CAPTCHA_DEFAULT_PROVIDER` | `captcha.defaultProvider` |
| `NUXT_FORMS_ENCRYPTION_KEY` | `encryptionKey` |

## On this module

- [Definition](/modules/features/forms/definition): fields, open periods, email body, captcha and the visual builder.
- [Server](/modules/features/forms/server): submitting, access, rate limiting, secrets, seeding, authorization, scopes and MCP tools.
- [App](/modules/features/forms/app): pages, components, Markdown embedding, composables and utils.
- [Reference](/modules/features/forms/reference): hooks, routes, database tables and translations.
