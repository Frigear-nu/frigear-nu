<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { FaqCardProps } from '../../../types'
import { useHelpCenterFaqCards } from '../composables/useHelpCenterFaqCards'
import FaqCard from './FaqCard.vue'

defineOptions({ name: 'FaqCards' })

// The cards alone, without a wrapper: for a grid the parent already lays out, such as the `#features` slot of
// `UPageSection` (`<UPageSection><template #features><FaqCards categories="funding" public /></template></UPageSection>`).
// A `cards` category gives a card per article. Same props as `FaqGrid`.
const props = defineProps<{
  items?: FaqCardProps[]
  categories?: string | string[]
  contact?: ButtonProps & { initial?: Record<string, unknown> }
  public?: boolean
  loading?: boolean
}>()

const { cards, loading: fetching } = useHelpCenterFaqCards(() => props)
</script>

<template>
  <template v-if="loading || fetching">
    <USkeleton
      v-for="n in 3"
      :key="n"
      class="h-40"
    />
  </template>
  <template v-else>
    <FaqCard
      v-for="(card, index) in cards"
      :key="index"
      v-bind="card"
      :public="props.public"
    />
  </template>
</template>
