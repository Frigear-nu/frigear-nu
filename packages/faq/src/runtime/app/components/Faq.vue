<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { useFaqCards } from '../composables/useFaqCards'
import FaqCard from './FaqCard.vue'

defineOptions({ name: 'Faq' })

// One managed group as a card: `::faq{group="volunteering"}` in Markdown (MDC), `<Faq group="volunteering" />` in a page.
// A group that does not exist, or that the viewer may not read, renders nothing.
const props = defineProps<{
  /** Slug of the group. */
  group: string
  contact?: ButtonProps & { initial?: Record<string, unknown> }
  public?: boolean
}>()

const { cards, loading } = useFaqCards(() => ({ groups: [props.group], contact: props.contact, public: props.public }))
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
    />
  </template>
</template>
