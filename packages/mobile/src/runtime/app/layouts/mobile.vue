<script setup lang="ts">
import { computed } from '#imports'
import MobileHeader from '../components/MobileHeader.vue'
import MobileTabBar from '../components/MobileTabBar.vue'
import { useMobileChrome } from '../composables/useMobileChrome'

/**
 * The app shell: `MobileHeader`, the page, `MobileTabBar`. With the native bars (iOS) the page is padded by their
 * size instead. A `mobile` layout of the app replaces this one. Slots: `header-trailing`, `default`.
 */
const { native, state } = useMobileChrome()
// Under the native navbar, or with no header at all, the page clears the top inset itself.
const padTop = computed(() => native.value || !state.value.header.visible)
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <MobileHeader>
      <template #trailing>
        <slot name="header-trailing" />
      </template>
    </MobileHeader>
    <main
      class="flex flex-1 flex-col gap-4 px-4 pt-4 pb-[calc(var(--mobile-inset-bottom)+1rem)]"
      :class="padTop && 'pt-[calc(var(--mobile-inset-top)+1rem)]'"
    >
      <slot />
    </main>
    <MobileTabBar />
  </div>
</template>
