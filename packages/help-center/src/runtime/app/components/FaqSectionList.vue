<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { FaqCardProps } from '../../../types'
import { useHelpCenterFaqCards } from '../composables/useHelpCenterFaqCards'
import { faqSectionListExpected, faqSectionListLayout } from '../utils/faq-layout'
import FaqCard from './FaqCard.vue'
import { computed } from '#imports'

defineOptions({ name: 'FaqSectionList' })

// The FAQ of a page section, at the full width it gets. One card shows its questions at reading width in the middle,
// without a card frame; several fill a grid (see `faqSectionListLayout`). Same props as `FaqGrid`: help-center
// categories (`categories="a,b"`) and inline `items`.
const props = defineProps<{
  items?: FaqCardProps[]
  categories?: string | string[]
  contact?: ButtonProps & { initial?: Record<string, unknown> }
  public?: boolean
  loading?: boolean
}>()

const { cards, loading: fetching } = useHelpCenterFaqCards(() => props)
const pending = computed(() => props.loading || fetching.value)
// While loading, lay out as many skeletons as the categories and items asked for, so the layout does not jump.
const count = computed(() => pending.value ? faqSectionListExpected(props) : cards.value.length)
const layout = computed(() => faqSectionListLayout(count.value))
</script>

<template>
  <div class="@container w-full">
    <div :class="layout.list">
      <template v-if="pending">
        <USkeleton
          v-for="n in Math.max(count, 1)"
          :key="n"
          class="h-40"
        />
      </template>
      <template v-else>
        <FaqCard
          v-for="(card, index) in cards"
          :key="index"
          v-bind="{ ...card, ...layout.card }"
          :public="props.public"
        />
      </template>
    </div>
  </div>
</template>
