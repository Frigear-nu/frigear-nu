<script setup lang="ts">
import { name } from '~~/package.json'

const { data: config } = await useConfig()
</script>

<template>
  <UColorModeImage
    v-if="config?.logo"
    :light="stringOrPropValue(config.logo, 'light') || stringOrPropValue(config?.logo, 'dark')"
    :dark="stringOrPropValue(config.logo, 'dark') || stringOrPropValue(config?.logo, 'light')"
    :alt="stringOrPropValue(config.logo, 'alt') || stringOrPropValue(config?.name, 'long')"
    :class="stringOrPropValue(config.logo, 'class') || []"
    fetchpriority="high"
    rel="preload"
  />
  <span v-else>
    {{ stringOrPropValue(config?.name, 'long') || stringOrPropValue(config?.name, 'short') || name }}
  </span>
</template>
