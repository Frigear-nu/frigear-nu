<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { useHelpCenterFaqCards } from '../composables/useHelpCenterFaqCards'
import FaqCard from './FaqCard.vue'

defineOptions({ name: 'Faq' })

// One help-center category as a card of questions: `::faq{category="volunteering"}` in Markdown (MDC),
// `<Faq category="volunteering" />` in a page. A category that does not exist, or that the viewer may not read, renders
// nothing.
const props = defineProps<{
  /** Slug of the category. */
  category: string
  contact?: ButtonProps & { initial?: Record<string, unknown> }
  public?: boolean
}>()

const { cards, loading } = useHelpCenterFaqCards(() => ({ categories: [props.category], contact: props.contact, public: props.public }))
</script>

<template>
  <USkeleton
    v-if="loading"
    class="h-40"
  />
  <template v-else>
    <FaqCard
      v-for="(card, index) in cards"
      :key="index"
      v-bind="card"
      :public="props.public"
    />
  </template>
</template>
