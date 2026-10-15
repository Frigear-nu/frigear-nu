<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

const { data: config } = await useConfig()
// The same entries as the desktop header (`main` menu, including items modules add); the content config's
// `navigation` when the menu has none.
const { data: menu } = await useMenu('main')
const appConfig = useAppConfig()

const items = computed(() => {
  // The content config's `navigation` is only a list when the host sets one.
  const fallback = Array.isArray(config.value?.navigation) ? config.value.navigation : []
  const source = menu.value?.length ? menu.value : fallback
  const iconOnMobile = appConfig.header?.icon?.mobile

  if (typeof iconOnMobile === 'boolean' && !iconOnMobile) {
    return source.map(item => ({
      ...item,
      icon: undefined,
    }))
  } else {
    return source
  }
})

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
</script>

<template>
  <div class="mt-4">
    <UPageGrid v-if="items?.length">
      <UPageCard
        v-for="item in items"
        :key="item.label"
        :title="item.label"
        :icon="item.icon"
        :description="item.description"
        :to="item.to"
        class="hover:shadow-lg"
        variant="subtle"
        :ui="{ title: 'text-xl font-semibold' }"
      />
    </UPageGrid>
    <UContentNavigation
      v-else
      highlight
      variant="link"
      :navigation="navigation"
    />
  </div>
</template>
