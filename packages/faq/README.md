# @frigear-nu/faq

Short, bilingual questions and answers, managed once in an admin area and shown anywhere: in Markdown (MDC) pages, in
custom pages, in the help center (later) and in the mobile app. It replaces hand-written FAQ cards in page frontmatter.
Part of the volunteering modules; it follows the contracts of [`@frigear-nu/audience`](../audience): every group and item
has a `visibility`, and the viewer is resolved through `audience:viewer:resolve`.

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
