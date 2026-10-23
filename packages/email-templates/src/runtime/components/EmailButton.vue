<script setup lang="ts">
import { useEmailTheme } from './theme'

withDefaults(defineProps<{
  href: string
  /** `danger` for security actions. */
  color?: 'primary' | 'danger'
}>(), {
  color: 'primary',
})

const theme = useEmailTheme()
</script>

<template>
  <EButton
    :href="href"
    :style="{ backgroundColor: color === 'danger' ? theme.danger : theme.primary, borderRadius: '4px', color: '#ffffff', fontSize: '16px', fontWeight: '600', marginBottom: '16px', padding: '8px 16px' }"
  >
    <slot />
  </EButton>
</template>
