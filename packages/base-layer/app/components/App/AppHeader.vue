<script setup lang="ts">
const { data: config } = await useConfig()
const { data: navigation } = useMenu('main')
</script>

<template>
  <UHeader
    :ui="{ center: navigation && navigation.length > 0 ? '' : 'flex-1' }"
    to="/"
    :title="stringOrPropValue(config?.name, 'long') || stringOrPropValue(config?.name, 'short')"
  >
    <template #title>
      <AppHeaderLogo class="shrink-0" />
    </template>

    <AppHeaderCenter />
    <template #right>
      <AppHeaderCTA />
      <LanguageSelect v-if="typeof $i18n !== 'undefined' && $i18n.locales && $i18n.locales.value && $i18n.locales.value.length > 1" />
      <UColorModeButton />
      <AppHeaderRight />
    </template>

    <template #toggle="{ open, toggle }">
      <IconMenuToggle
        :open="open"
        class="lg:hidden"
        @click="toggle"
      />
    </template>

    <template #body>
      <LazyAppHeaderBody />
    </template>
  </UHeader>
</template>
