# @frigear-nu/faq

Short, bilingual questions and answers, managed once in an admin area and shown anywhere: in Markdown (MDC) pages, in
custom pages, in the help center (later) and in the mobile app. It replaces hand-written FAQ cards in page frontmatter.
Every group and item stores who may read it as a grant list of [`@frigear-nu/grants`](../grants): a group with a
`public` grant needs no sign-in, anything else goes through the `faq:read` permission and its policy. An empty list
admits nobody, and an item without a list of its own inherits its group.

## Quick Setup

Requires `@nuxthub/core`. `@frigear-nu/admin` (admin pages), `@frigear-nu/menu`, `@frigear-nu/forms` (the built-in
contact button) and `@frigear-nu/mobile` (an FAQ tab) are optional; `@nuxt/ui` is needed for the components and pages.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/faq'],
  faq: { settings: { pages: { admin: true } } },
})
```

Generate and commit a migration for the `faq_groups` and `faq_items` tables in your app (see the repository `AGENTS.md`).

Then show a managed group in a Markdown page, or fetch it on a custom page:

```md
::faq-grid{groups="membership,volunteering"}
::
```

```vue
<script setup lang="ts">
const { groups, status } = await useFaq(['volunteering'])
</script>
<template>
  <FaqGrid :items="groups.map(toFaqCardProps)" :loading="status === 'pending'" />
</template>
```

`FaqGrid` and `FaqSectionList` also take inline `items` in the shape of the website's page frontmatter. Staff routes need
the `faq:manage` permission, granted to the `admin` and `coordinator` roles. An item is a draft until it is published, and
publishing needs every language in `requiredLocales` (`da` and `en` by default).

Full documentation: <https://docs.frigear.dev/modules/content/faq>.
