<script setup lang="ts">
import { computed, useModuleT } from '#imports'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useMobileBack } from '../utils/back'

/**
 * The page's title bar in a browser and on Android (on iOS the native navbar draws it, and this keeps only an
 * `sr-only` heading). The title comes from `definePageMeta({ mobile: { title } })`, else the selected tab, else
 * `appName`. Slots: `leading` (replaces the back button), `trailing`.
 */
const { state, native } = useMobileChrome()
const t = useModuleT('mobile')
const header = computed(() => state.value.header)
const goBack = useMobileBack(() => state.value)

function back() {
  void goBack()
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
      <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">
        {{ header.title }}
      </h1>
      <slot name="trailing" />
    </div>
  </header>
</template>
