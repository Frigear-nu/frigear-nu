<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { FaqCardProps } from '../../../types'
import { useFaqCards } from '../composables/useFaqCards'
import FaqCard from './FaqCard.vue'

defineOptions({ name: 'FaqGrid' })

// The cards in a grid. Managed groups (`groups="a,b"`, `operation`) and inline `items` (what the website's page
// frontmatter holds) can be mixed: the managed ones come first. `loading` forces the skeleton, for a page that fetches
// with `useFaq()` itself.
const props = defineProps<{
  items?: FaqCardProps[]
  groups?: string | string[]
  operation?: string
  contact?: ButtonProps & { initial?: Record<string, unknown> }
  public?: boolean
  loading?: boolean
}>()

const { cards, loading: fetching } = useFaqCards(() => props)
</script>

<template>
  <UPageGrid :ui="{ base: $attrs.class }">
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
      />
    </template>
  </UPageGrid>
</template>
