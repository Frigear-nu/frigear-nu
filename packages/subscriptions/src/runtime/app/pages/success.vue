<script setup lang="ts">
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionSuccessPage' })

const t = useModuleT('subscriptions.success')
const { refresh, isActive } = useSubscription()
const { localize } = useLocaleLink()
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership

// The webhook may land slightly after the redirect; keep polling until active (or we give up after ~2 minutes).
const MAX_ATTEMPTS = 40
const INTERVAL_MS = 3000
let stopped = false
onBeforeUnmount(() => {
  stopped = true
})

onMounted(async () => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !stopped && !isActive.value; attempt++) {
    await refresh()
    if (!isActive.value && !stopped) await new Promise(resolve => setTimeout(resolve, INTERVAL_MS))
  }
})
</script>

<template>
  <UEmpty
    :icon="isActive ? 'i-lucide-circle-check' : 'i-lucide-loader-circle'"
    :title="t('title', 'Thank you!')"
    :description="isActive
      ? t('activeBody', 'Your subscription is now active.')
      : t('body', 'Your subscription is being activated. This can take a few seconds.')"
    :actions="membership ? [{ label: t('back', 'Back to membership'), to: localize(membership) }] : []"
  />
</template>
