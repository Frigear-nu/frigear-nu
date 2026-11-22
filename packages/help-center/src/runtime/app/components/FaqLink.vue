<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { computed } from '#imports'

defineOptions({ name: 'FaqLink' })

// A button in an article's text: `::faq-link{label="Become a member" to="/membership" icon="i-lucide-user-plus"
// trailing-icon="i-lucide-arrow-right" variant="subtle" size="lg"}`. In a `cards` category each block becomes a
// full-width button at the foot of the article's card (see `splitFaqBody`); anywhere else it renders on its own. The
// label can also be the content of the block.
const props = defineProps<{
  label?: string
  to?: string
  icon?: string
  trailingIcon?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  color?: ButtonProps['color']
  target?: ButtonProps['target']
}>()

const button = computed(() => Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined && value !== '')))
</script>

<template>
  <div
    class="not-prose my-4"
    data-test="faq-link"
  >
    <UButton v-bind="button">
      <template
        v-if="!label && $slots.default"
        #default
      >
        <slot mdc-unwrap="p" />
      </template>
    </UButton>
  </div>
</template>
