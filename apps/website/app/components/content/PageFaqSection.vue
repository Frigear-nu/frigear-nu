<script setup lang="ts">
// A page's FAQ section: the public help-center categories `appConfig.pageFaqs[page]` names, with questions that open
// in place. One category reads at the section's full width, several share a grid (`FaqSectionList` decides). Staff
// write the questions at /admin/help-center. When none of the categories exists (or the request fails) the whole
// section is hidden. In Markdown:
//
//   ::page-faq-section{page="board" icon="i-lucide-message-circle-question-mark" id="good-to-know"}
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
  /** Wraps the section in a raised card. */
  card?: boolean
}>()

const appConfig = useAppConfig()
const slugs = computed(() => pageFaqSlugs(appConfig.pageFaqs, props.page))
// The same request (and key) as the cards below, so the page fetches once.
const { faqs, status } = useHelpCenterFaqs(slugs, { public: true, lazy: true, enabled: () => slugs.value.length > 0 })
const visible = computed(() => showPageFaqs({ slugs: slugs.value, status: status.value, found: faqs.value.length }))
const wrapper = props.card ? resolveComponent('UCard') : 'div'
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
      <!-- The default slot, not #features: that one is a three-column grid, and the list lays itself out. -->
      <FaqSectionList
        :categories="slugs"
        public
      />
    </UPageSection>
  </component>
</template>
