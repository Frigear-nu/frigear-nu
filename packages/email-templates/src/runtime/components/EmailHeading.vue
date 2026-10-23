<script setup lang="ts">
import { tokens, useEmailTheme } from './theme'

withDefaults(defineProps<{
  /** `danger` for security alerts. */
  tone?: 'default' | 'danger'
}>(), {
  tone: 'default',
})

const theme = useEmailTheme()
</script>

<template>
  <h2 :style="{ color: tone === 'danger' ? theme.danger : tokens.heading, fontSize: '20px', fontWeight: '700', lineHeight: '28px', margin: '0 0 16px' }">
    <slot />
  </h2>
</template>
