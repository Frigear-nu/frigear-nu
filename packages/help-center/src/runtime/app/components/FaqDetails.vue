<script setup lang="ts">
defineOptions({ name: 'FaqDetails' })

// A question that opens in place, in an article's text: `::faq-details{label="More about the process..." icon="..."}`
// with a list (or any Markdown) inside. In a `cards` category each block becomes a question of the article's card (see
// `splitFaqBody`); anywhere else (the article page, an accordion) it renders on its own, like a question of `FaqCard`.
defineProps<{
  label?: string
  icon?: string
}>()
</script>

<template>
  <UCollapsible
    :default-open="false"
    :unmount-on-hide="false"
    class="not-prose my-4 flex w-full flex-col gap-2"
    data-test="faq-details"
  >
    <UButton
      block
      :icon="icon"
      class="group"
      trailing-icon="i-lucide-chevron-down"
      variant="subtle"
      color="neutral"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200',
      }"
    >
      {{ label }}
    </UButton>
    <template #content>
      <div class="prose prose-sm dark:prose-invert max-w-none">
        <slot />
      </div>
    </template>
  </UCollapsible>
</template>
