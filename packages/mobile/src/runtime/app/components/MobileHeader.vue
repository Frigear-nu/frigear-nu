<script setup lang="ts">
import { computed, navigateTo, useModuleT } from '#imports'
import type { ChromeAction } from '../../shared/chrome'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useMobileBack } from '../utils/back'
import { runNavbarAction } from '../utils/navbar-actions'

/**
 * The page's title bar in a browser and on Android (on iOS the native navbar draws it, and this keeps only an
 * `sr-only` heading). The title comes from `definePageMeta({ mobile: { title } })`, else the selected tab, else
 * `appName`. The page's navbar actions (`definePageMeta({ mobile: { actions } })`, `useMobileNavbarActions()`) show
 * as buttons, left ones after the back button and right ones before the `trailing` slot. Slots: `leading` (replaces
 * the back button), `trailing`.
 */
const { state, native } = useMobileChrome()
const t = useModuleT('mobile')
const header = computed(() => state.value.header)
const goBack = useMobileBack(() => state.value)

const leftActions = computed(() => header.value.actions.filter(action => action.placement === 'left'))
const rightActions = computed(() => header.value.actions.filter(action => action.placement !== 'left'))

function back() {
  void goBack()
}

function select(action: ChromeAction) {
  runNavbarAction(action, to => navigateTo(to))
    .catch(error => console.error('[@frigear-nu/mobile] Navbar action failed:', error))
}
</script>

<template>
  <h1
    v-if="native"
    class="sr-only"
  >
    {{ header.title }}
  </h1>
  <header
    v-else-if="header.visible"
    class="sticky top-0 z-10 border-b border-default bg-default/80 pt-(--mobile-inset-top) backdrop-blur"
  >
    <div class="flex min-h-12 items-center gap-2 px-4 py-2">
      <slot name="leading">
        <UButton
          v-if="header.back"
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          class="-ms-2"
          :aria-label="t('back', 'Back')"
          @click="back"
        />
      </slot>
      <UButton
        v-for="action in leftActions"
        :key="action.id"
        :icon="action.icon"
        :label="action.icon ? undefined : action.label"
        :aria-label="action.label"
        :disabled="action.disabled"
        color="neutral"
        variant="ghost"
        @click="select(action)"
      />
      <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">
        {{ header.title }}
      </h1>
      <UButton
        v-for="action in rightActions"
        :key="action.id"
        :icon="action.icon"
        :label="action.icon ? undefined : action.label"
        :aria-label="action.label"
        :disabled="action.disabled"
        color="neutral"
        variant="ghost"
        @click="select(action)"
      />
      <slot name="trailing" />
    </div>
  </header>
</template>
