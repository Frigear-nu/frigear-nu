<script setup lang="ts">
const { data: config } = await useConfig()
const { data: navigation } = await useNavigation()
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
      <div>Current: {{ $i18n.locale }}</div>
      <LanguageSelect v-if="typeof $i18n !== 'undefined' && $i18n.locales && $i18n.locales.value && $i18n.locales.value.length > 1" />
      <UContentSearchButton class="lg:hidden" />
      <UColorModeButton />
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
