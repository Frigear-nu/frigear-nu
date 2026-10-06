<script setup lang="ts">
const { data: navigation } = useMenu('main')
const items = computed(() => {
  const iconOnDesktop = useAppConfig().header?.icon?.desktop

  if (typeof iconOnDesktop === 'boolean' && !iconOnDesktop) {
    return navigation?.value?.map(item => ({
      ...item,
      icon: undefined,
    }))
  } else {
    return navigation?.value
  }
})
</script>

<template>
  <UNavigationMenu
    v-if="navigation"
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
