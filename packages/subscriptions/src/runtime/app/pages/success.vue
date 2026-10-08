<script setup lang="ts">
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription, useSubscriptionLabels } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionSuccessPage' })

const t = useSubscriptionLabels({
  title: 'Thank you!',
  body: 'Your subscription is being activated. This can take a few seconds.',
  continue: 'Continue',
})
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
          :title="t('title')"
          :description="t('body')"
        />
        <SubscriptionStatus />
        <UButton
          v-if="membership"
          :to="membership"
          :label="t('continue')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
