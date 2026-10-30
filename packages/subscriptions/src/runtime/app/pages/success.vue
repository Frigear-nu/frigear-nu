<script setup lang="ts">
import { useSubscription } from '../composables/useSubscription'
import { computed, onBeforeUnmount, onMounted, useLocaleLink, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'SubscriptionSuccessPage' })

const t = useModuleT('subscriptions.success')
// Awaited, so the server already knows whether the subscription is active and the first render is never the wrong
// state; the polling below only covers the webhook landing after the redirect.
const { refresh, isActive } = await useSubscription()
const { localize } = useLocaleLink()
const tm = useModuleT('subscriptions.menu.membership')
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership
const breadcrumb = computed(() => [
  ...(membership ? [{ label: tm('label', 'Membership'), to: localize(membership) }] : []),
  { label: t('crumb', 'Checkout complete') },
])

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
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="tm('label', 'Membership')"
      :description="tm('description', 'Manage your plan and billing.')"
      :breadcrumb="breadcrumb"
    />
    <UEmpty
      :icon="isActive ? 'i-lucide-circle-check' : 'i-lucide-loader-circle'"
      :title="t('title', 'Thank you!')"
      :description="isActive
        ? t('activeBody', 'Your membership is now active.')
        : t('body', 'Your membership is being activated. This can take a few seconds.')"
      :actions="membership ? [{ label: t('back', 'Back to membership'), to: localize(membership) }] : []"
    />
  </div>
</template>
