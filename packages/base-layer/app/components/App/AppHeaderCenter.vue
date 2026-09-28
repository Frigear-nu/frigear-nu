<script setup lang="ts">
const { data: config } = await useConfig()
const items = computed(() => {
  const iconOnDesktop = useAppConfig().header.icon.desktop

  if (typeof iconOnDesktop === 'boolean' && !iconOnDesktop) {
    return config.value?.navigation?.map(item => ({
      ...item,
      icon: undefined,
    }))
  } else {
    return config.value?.navigation
  }
})
</script>

<template>
  <UNavigationMenu
    v-if="config?.navigation"
    :items="items"
    variant="link"
  />
  <UContentSearchButton
    v-else
    :collapsed="false"
    class="w-full"
    variant="soft"
    :ui="{
      leadingIcon: 'size-4 mr-1',
    }"
  />
</template>
