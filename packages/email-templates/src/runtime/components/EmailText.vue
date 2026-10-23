<script setup lang="ts">
import { computed } from 'vue'
import { tokens } from './theme'

const props = withDefaults(defineProps<{
  /** `muted` for secondary text, `small` for fine print. */
  variant?: 'default' | 'muted' | 'small'
}>(), {
  variant: 'default',
})

const style = computed(() => ({
  default: { color: tokens.text, fontSize: '16px', lineHeight: '24px' },
  muted: { color: tokens.muted, fontSize: '14px', lineHeight: '20px', wordBreak: 'break-word' },
  small: { color: tokens.faint, fontSize: '12px', lineHeight: '16px' },
}[props.variant]))
</script>

<template>
  <p :style="{ ...style, margin: '0 0 16px' }">
    <slot />
  </p>
</template>
