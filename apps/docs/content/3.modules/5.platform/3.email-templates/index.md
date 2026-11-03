---
title: Email Templates
description: Vue email templates for Notify, rendered with nuxt-email-renderer - typed sendEmailTemplate for the host, and module emails the host can override by file name.
navigation:
  title: Overview
---

Emails written as Vue components, rendered with [nuxt-email-renderer](https://nuxtemail.com) and sent through
[Notify](/modules/platform/notify), as a [Nuxt module](https://nuxt.com/docs/4.x/guide/modules). It does two things:

- The host sends its own templates with a typed `sendEmailTemplate(name, props, message)`.
- Modules ([Auth](/modules/identity/auth), [Users](/modules/identity/users), [Subscriptions](/modules/commerce/subscriptions)) ship a template
  for every email they send. With this module installed, those emails are rendered from the templates. Without it, they
  go out as the plain HTML each module builds. The host overrides any module template by adding a file with the same
  name.

All the Vue rendering lives here: Notify and the feature modules stay free of Vue SSR.

:module-runtime{server}

::note
**Requires** `@frigear-nu/module-kit`, [`@frigear-nu/notify`](/modules/platform/notify) and `nuxt-email-renderer`; all are
installed automatically.
::

## Quick setup

```bash
pnpm add @frigear-nu/email-templates
```

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/email-templates'],
})
```

::note
The module emails (auth, users, subscriptions) only use their Vue templates when the host lists
`@frigear-nu/email-templates` in `modules`. Installed as a dependency of another module is not enough: without it in
`modules`, notify sends the plain HTML fallback.
::

Add templates to `app/emails` (or `emails/`, or the `nuxtEmailRenderer.emailsDir` option). Every top-level `.vue` file
is a template, named by its file name. Build them from the [components](/modules/platform/email-templates/components) so they match the module emails:

::tabs
:::tabs-item{label="welcome.vue"}
```vue [app/emails/welcome.vue]
<script setup lang="ts">
import { EmailButton, EmailDivider, EmailHeading, EmailLayout, EmailLinkFallback, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{ name: string, url: string }>()
</script>

<template>
  <EmailLayout :preview="`Welcome, ${name}!`">
    <ESubject>Welcome, {{ name }}</ESubject>
    <EmailHeading>Welcome, {{ name }}!</EmailHeading>
    <EmailDivider />
    <EmailText>Thanks for signing up. Click the button below to get started.</EmailText>
    <EmailButton :href="url">Get started</EmailButton>
    <EmailLinkFallback :href="url" />
  </EmailLayout>
</template>
```
:::
:::tabs-item{label="Preview"}
![The welcome email, built from the components](/images/email-templates/welcome.png)
:::
::

The `E*` components, `<ESubject>`, i18n (`$t` with `@nuxtjs/i18n`), `globalCss` and the DevTools preview all come
from [nuxt-email-renderer](https://nuxtemail.com). This module sets its `codeHighlighting` default to `false`, which
keeps Shiki out of the server bundle. Set `nuxtEmailRenderer.codeHighlighting: true` if you need `<ECodeBlock>`.

## Options

Branding comes from the module options. Each option can also be set at runtime:

```ts
export default defineNuxtConfig({
  emailTemplates: {
    brandName: 'Frigear', // logo alt text, and the header when there is no logo
    logoUrl: '/logo.png', // absolute, or resolved against siteUrl
    siteUrl: 'https://frigear.nu',
    colors: { primary: '#2563eb', danger: '#dc2626' },
  },
})
```

| Environment variable | Option |
| --- | --- |
| `NUXT_EMAIL_TEMPLATES_BRAND_NAME` | `brandName` |
| `NUXT_EMAIL_TEMPLATES_LOGO_URL` | `logoUrl` |
| `NUXT_EMAIL_TEMPLATES_SITE_URL` | `siteUrl` |
| `NUXT_EMAIL_TEMPLATES_COLORS_PRIMARY`, `_DANGER` | `colors.primary`, `colors.danger` |

Use an absolute URL for the logo: mail clients cannot resolve relative paths. The previews on this page use the
default colours and the Frigear logo.

## On this module

- [Components](/modules/platform/email-templates/components): the `Email*` building blocks and composing an email.
- [Server](/modules/platform/email-templates/server): `sendEmailTemplate`, `renderEmailTemplate` and bundle notes.
- [Module emails](/modules/platform/email-templates/module-emails): templates shipped by modules and how to override them.
