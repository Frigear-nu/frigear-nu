<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { FaqCardProps } from '../../../types'
import { useHelpCenterFaqCards } from '../composables/useHelpCenterFaqCards'
import FaqCard from './FaqCard.vue'

defineOptions({ name: 'FaqGrid' })

// The cards in a grid. Help-center categories (`categories="a,b"`) and inline `items` (cards written in page frontmatter)
// can be mixed: the categories come first. `loading` forces the skeleton, for a page that fetches with
// `useHelpCenterFaqs()` itself. The fetch is awaited, so a client-side navigation waits for the cards instead of
// flashing a skeleton; the grid renders nothing when there are no cards.
const props = defineProps<{
  items?: FaqCardProps[]
  categories?: string | string[]
  contact?: ButtonProps & { initial?: Record<string, unknown> }
  public?: boolean
  loading?: boolean
}>()

const { cards, loading: fetching } = await useHelpCenterFaqCards(() => props, { lazy: false })
</script>

<template>
  <UPageGrid
    v-if="loading || fetching || cards.length"
    :ui="{ base: $attrs.class }"
  >
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
  </UPageGrid>
</template>
