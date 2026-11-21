<script setup lang="ts">
import { resolveComponent } from '#imports'

defineOptions({ name: 'HelpCenterArticleBody' })

// An article's Markdown. It renders through `<MDC>` (Nuxt Content, `@nuxtjs/mdc`) when the app has it, so MDC components
// such as `::faq{group="..."}` work inside articles, and as plain paragraphs otherwise.
defineProps<{ body: string }>()

// Resolves to a plain string name when the app has no MDC.
const hasMdc = typeof resolveComponent('MDC') !== 'string'
</script>

<template>
  <div
    class="prose prose-sm dark:prose-invert max-w-none"
    data-test="help-center-body"
  >
    <MDC
      v-if="hasMdc"
      :value="body"
    />
    <p
      v-else
      class="whitespace-pre-line"
    >
      {{ body }}
    </p>
  </div>
</template>
