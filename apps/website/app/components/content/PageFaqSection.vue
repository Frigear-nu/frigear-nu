<script setup lang="ts">
// A page's FAQ section: the public help-center categories `appConfig.pageFaqs[page]` names, as cards in the section's
// feature grid (a `cards` category gives a card per question, the old page cards). Staff write the questions at
// /admin/help-center/faq. When none of the categories exists or has a published article (or the request fails) the whole
// section is hidden. In Markdown:
//
//   ::page-faq-section{page="board" card icon="i-lucide-message-circle-question-mark" id="good-to-know"}
//   #title
//   ...
//   #description
//   ...
//   ::
const props = defineProps<{
  /** The key in `appConfig.pageFaqs`. */
  page: string
  icon?: string
  id?: string
  /** Wraps the section in a raised card (`::card{.shadow-2xl}`, Nuxt UI's `ProseCard`). */
  card?: boolean
}>()

const appConfig = useAppConfig()
const slugs = computed(() => pageFaqSlugs(appConfig.pageFaqs, props.page))
// Awaited, so a client-side navigation waits for the cards instead of flashing a skeleton. The same request (and key)
// as the cards below, so the page fetches once.
const { faqs, status } = await useHelpCenterFaqs(slugs, { public: true, enabled: () => slugs.value.length > 0 })
const visible = computed(() => showPageFaqs({ slugs: slugs.value, status: status.value, found: pageFaqsFound(faqs.value) }))
const wrapper = props.card ? resolveComponent('ProseCard') : 'div'
</script>

<template>
  <component
    :is="wrapper"
    v-if="visible"
    :class="card ? 'shadow-2xl' : undefined"
  >
    <UPageSection
      :id="id"
      :icon="icon"
    >
      <template
        v-if="$slots.title"
        #title
      >
        <slot name="title" />
      </template>
      <template
        v-if="$slots.description"
        #description
      >
        <slot name="description" />
      </template>
      <!-- The section's own feature grid (`sm:grid-cols-2 lg:grid-cols-3`), with the cards straight in it. -->
      <template #features>
        <FaqCards
          :categories="slugs"
          public
        />
      </template>
    </UPageSection>
  </component>
</template>
