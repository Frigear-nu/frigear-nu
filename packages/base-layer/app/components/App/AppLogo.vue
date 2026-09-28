<script setup lang="ts">
import { name } from '~~/package.json'

const { data: config } = await useConfig()
const logoLight = computed(() => stringOrPropValue(config.value?.logo, 'light') || stringOrPropValue(config.value?.logo, 'dark'))
const logoDark = computed(() => stringOrPropValue(config.value?.logo, 'dark') || stringOrPropValue(config.value?.logo, 'light'))
const logoAlt = computed(() => stringOrPropValue(config.value?.logo, 'alt') || stringOrPropValue(config.value?.name, 'long') || name)
</script>

<template>
  <UColorModeImage
    v-if="logoLight && logoDark"
    :light="logoLight"
    :dark="logoDark"
    :alt="logoAlt"
    :class="stringOrPropValue(config?.logo, 'class') || []"
    fetchpriority="high"
    rel="preload"
  />
  <span v-else>
    {{ stringOrPropValue(config?.name, 'long') || stringOrPropValue(config?.name, 'short') || name }}
  </span>
</template>
