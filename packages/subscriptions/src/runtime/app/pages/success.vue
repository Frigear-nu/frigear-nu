<script setup lang="ts">
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionSuccessPage' })

const t = useModuleT('subscriptions.success')
const { refresh, isActive } = useSubscription()
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership

// The webhook may land slightly after the redirect; poll briefly until active.
onMounted(async () => {
  for (let attempt = 0; attempt < 5 && !isActive.value; attempt++) {
    await refresh()
    if (!isActive.value) await new Promise(resolve => setTimeout(resolve, 2000))
  }
})
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody class="space-y-6">
        <UPageHeader
          :title="t('title', 'Thank you!')"
          :description="t('body', 'Your subscription is being activated. This can take a few seconds.')"
        />
        <SubscriptionStatus />
        <UButton
          v-if="membership"
          :to="membership"
          :label="t('continue', 'Continue')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
