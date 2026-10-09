<script setup lang="ts">
defineOptions({ name: 'SubscriptionCancelPage' })

const t = useModuleT('subscriptions.cancel')
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody class="space-y-6">
        <UPageHeader
          :title="t('title', 'Checkout canceled')"
          :description="t('body', 'No changes were made and you have not been charged.')"
        />
        <UButton
          v-if="membership"
          :to="membership"
          :label="t('back', 'Back to plans')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
