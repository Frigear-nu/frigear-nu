<script setup lang="ts">
import type { FaqCardProps } from '~/types/faq'
import FaqCard from './FaqCard.vue'

defineProps<{
  items: FaqCardProps[]
}>()
</script>

<template>
  <UPageGrid :ui="{ base: $attrs.class }">
    <FaqCard
      v-for="(card, index) in items"
      :key="index"
      v-bind="card"
    />
  </UPageGrid>
</template>
