<script setup lang="ts">
const { data: config } = await useConfig()
const { data: navigation } = useMenu('main')
const multiLocale = useRuntimeConfig().public.multiLocale === true
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
      <LanguageSelect v-if="multiLocale" />
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
