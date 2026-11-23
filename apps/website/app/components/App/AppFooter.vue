<script setup lang="ts">
// The site's footer: the base layer's (`@frigear-nu/base`, same content from `config.yaml`) with Frigear's look on top,
// as on the old site: a dashed divider with the bullhorn logo above it, and narrow, indented link columns (two per row
// on phones, four on wide screens). Replaces the layer's `AppFooter` by name.
const { data: config } = await useConfig()
</script>

<template>
  <USeparator
    type="dashed"
    size="lg"
    class="mt-8 h-px"
  >
    <UColorModeImage
      light="/images/branding/logos/square/frigear-bullhorn-icon-4a2fda-d-blue.png"
      dark="/images/branding/logos/square/frigear-bullhorn-icon-white.png"
      class="h-auto w-24"
      loading="lazy"
      alt=""
    />
  </USeparator>
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
          :ui="{
            center: 'pl-12 grid grid-cols-2 grid-flow-row gap-y-16 pt-12 lg:grid-cols-4 lg:grid-flow-col lg:auto-cols-fr lg:gap-x-8 lg:gap-y-8 xl:col-span-2',
            label: 'text-xs font-semibold tracking-wide',
            list: 'mt-3 space-y-3 pl-2',
          }"
        />
      </UContainer>
    </template>
    <template
      v-if="config?.footer && config?.footer.right"
      #right
    >
      <AppFooterRight :links="config?.footer.right" />
    </template>
  </UFooter>
</template>
