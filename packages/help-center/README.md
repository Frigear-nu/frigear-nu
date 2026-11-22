# @frigear-nu/help-center

Bilingual help articles in categories, public or visible per role, with onboarding checklists that track what each
volunteer has read. Articles come from the database (edited in an admin area) or from Nuxt Content, behind one source
interface. Every category, article and checklist stores who may read it as a grant list of
[`@frigear-nu/auth`](../auth), read through `help-center:read` and its policy; a `public` grant needs no sign-in, and
an empty list admits nobody. A send reaches the members of a grant list.

- **Public area** (`/help`): public articles only, the same for every visitor, so it caches and indexes the same way.
- **Signed-in area** (`/account/help`): the articles the person is granted, onboarding checklists with read state,
  "recently updated for you". Both paths are options.
- **Coordinators** see who has read what (`help-center:pii`) and send article links by email and SMS.
- **FAQ**: a category shown as an `accordion` lists its articles as questions that open in place, and the global
  `Faq`, `FaqGrid` and `FaqSectionList` components show such categories (or inline cards) on any page or in Markdown.

## Quick Setup

Requires `@nuxthub/core`. `@frigear-nu/admin` (admin pages), `@frigear-nu/menu`, `@frigear-nu/widget` with
`@frigear-nu/account` (the "Your onboarding" widget), `@frigear-nu/notify` (sending links), `@frigear-nu/forms` (the
FAQ cards' built-in contact button), `@nuxt/content` (the file source) and `@frigear-nu/mobile` (a Help tab) are optional;
`@nuxt/ui` is needed for the components and pages.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/help-center'],
  helpCenter: { settings: { pages: { admin: true } } },
})
```

Generate and commit a migration for the `help_*` tables in your app (see the repository `AGENTS.md`).

The two areas are on by default and move with `settings.pages.public` and `settings.pages.signedIn` (`false` turns one
off). Articles need Danish and English in title and body before they are published (`requiredLocales`). Staff routes need
the `help-center:manage` permission, granted to the `admin` and `coordinator` roles.

Show the questions of an accordion category in a Markdown page, or fetch them on a custom page:

```md
::faq-grid{categories="membership,volunteering"}
::
```

```vue
<script setup lang="ts">
const { faqs, status } = await useHelpCenterFaqs(['volunteering'])
</script>
<template>
  <FaqGrid :items="faqs.map(toFaqCardProps)" :loading="status === 'pending'" />
</template>
```

Full documentation: <https://docs.frigear.dev/modules/content/help-center>.
