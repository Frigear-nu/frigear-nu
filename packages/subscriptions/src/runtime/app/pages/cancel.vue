<script setup lang="ts">
defineOptions({ name: 'SubscriptionCancelPage' })

const t = useModuleT('subscriptions.cancel')
const { localize } = useLocaleLink()
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership
</script>

<template>
  <UEmpty
    icon="i-lucide-circle-x"
    :title="t('title', 'Checkout canceled')"
    :description="t('body', 'No changes were made and you have not been charged.')"
    :actions="membership ? [{ label: t('back', 'Back to membership'), to: localize(membership) }] : []"
  />
</template>
