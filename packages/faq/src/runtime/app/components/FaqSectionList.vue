<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { FaqCardProps } from '../../../types'
import { useFaqCards } from '../composables/useFaqCards'
import FaqCard from './FaqCard.vue'

defineOptions({ name: 'FaqSectionList' })

// The cards one under the other. Same props as `FaqGrid`: managed groups (`groups="a,b"`, `operation`) and inline `items`.
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
  <template v-if="loading || fetching">
    <USkeleton
      v-for="n in 2"
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
</template>
