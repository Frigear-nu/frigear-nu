<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

const { data: config } = await useConfig()

const items = computed(() => {
  const iconOnMobile = useAppConfig().header?.icon?.mobile

  if (typeof iconOnMobile === 'boolean' && !iconOnMobile) {
    return config.value?.navigation?.map(item => ({
      ...item,
      icon: undefined,
    }))
  } else {
    return config.value?.navigation
  }
})

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
</script>

<template>
  <div class="mt-4">
    <UPageGrid v-if="config?.navigation">
      <UPageCard
        v-for="item in items "
        :key="item.label"
        :title="item.label"
        :icon="item.icon"
        :description="item.description"
        :to="item.to"
        class="hober:shadow-lg"
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
