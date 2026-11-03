<script setup lang="ts">
import { computed } from '#imports'
import type { MobileTab } from '../../../types'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useMobileTabs } from '../composables/useMobileTabs'
import { useNative } from '../composables/useNative'

/** The web tab bar (browsers, Android): hidden where the native one draws the tabs, while overlays are open, and on pages without a tab. */
const { state } = useMobileChrome()
const { label } = useMobileTabs()
const { haptic } = useNative()
const visible = computed(() => state.value.mode === 'web' && state.value.tabBar.visible)
const columns = computed(() => ({ gridTemplateColumns: `repeat(${state.value.tabs.length}, minmax(0, 1fr))` }))
const active = (tab: MobileTab) => state.value.activeTab?.id === tab.id
</script>

<template>
  <nav
    v-if="visible"
    class="fixed inset-x-0 bottom-0 z-10 grid border-t border-default bg-default/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    :style="columns"
    data-mobile-tabbar
  >
    <NuxtLink
      v-for="tab in state.tabs"
      :key="tab.id"
      :to="tab.to"
      class="flex h-14 flex-col items-center justify-center gap-0.5 text-xs transition-colors"
      :class="active(tab) ? 'text-primary' : 'text-muted'"
      :aria-current="active(tab) ? 'page' : undefined"
      @click="haptic('selection')"
    >
      <UIcon
        :name="active(tab) ? (tab.activeIcon ?? tab.icon) : tab.icon"
        class="size-6"
      />
      <span class="truncate">{{ label(tab) }}</span>
    </NuxtLink>
  </nav>
</template>
