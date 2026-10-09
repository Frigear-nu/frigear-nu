<script setup lang="ts">
import { useSubscriptionLabels } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionCancelPage' })

const t = useSubscriptionLabels({
  cancelTitle: 'Checkout canceled',
  cancelBody: 'No changes were made and you have not been charged.',
  back: 'Back to plans',
})
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody class="space-y-6">
        <UPageHeader
          :title="t('cancelTitle')"
          :description="t('cancelBody')"
        />
        <UButton
          v-if="membership"
          :to="membership"
          :label="t('back')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
