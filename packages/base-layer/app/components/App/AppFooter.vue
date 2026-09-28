<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const { data: config } = await useConfig()

const footerRightLinks = computed(() => (config.value?.footer?.right ?? []) as ButtonProps[])
</script>

<template>
  <UFooter>
    <template
      v-if="config?.footer && config?.footer?.copyright"
      #left
    >
      <AppFooterLeft
        :parts="Array.isArray(config?.footer?.copyright) ? config?.footer?.copyright : [config?.footer?.copyright]"
      />
    </template>
    <template
      v-if="config?.footer && config?.footer.sections && config?.footer.sections.length"
      #top
    >
      <UContainer>
        <UFooterColumns
          :columns="config?.footer.sections"
        />
      </UContainer>
    </template>
    <template
      v-if="config?.footer && config?.footer.right"
      #right
    >
      <AppFooterRight :links="footerRightLinks" />
    </template>
  </UFooter>
</template>
