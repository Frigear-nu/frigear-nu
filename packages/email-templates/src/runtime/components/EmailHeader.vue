<script setup lang="ts">
import { computed } from 'vue'
import { tokens, useEmailTheme } from './theme'

const props = defineProps<{
  /** Overrides the configured logo. */
  logoUrl?: string
}>()

const theme = useEmailTheme()
const src = computed(() => props.logoUrl || theme.logoUrl)
</script>

<template>
  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    :style="{ backgroundColor: tokens.page, borderRadius: '6px', marginBottom: '24px' }"
  >
    <tr>
      <td
        align="center"
        style="padding: 20px"
      >
        <EImg
          v-if="src"
          :src="src"
          :alt="theme.brandName"
          width="150"
          style="margin: 0 auto"
        />
        <span
          v-else
          :style="{ color: tokens.heading, fontSize: '24px', fontWeight: '700', lineHeight: '32px' }"
        >{{ theme.brandName }}</span>
      </td>
    </tr>
  </table>
</template>
