<script setup lang="ts">
import { computed, useLocaleLink, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'SubscriptionCancelPage' })

const t = useModuleT('subscriptions.cancel')
const { localize } = useLocaleLink()
const tm = useModuleT('subscriptions.menu.membership')
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership
const breadcrumb = computed(() => [
  ...(membership ? [{ label: tm('label', 'Membership'), to: localize(membership) }] : []),
  { label: t('crumb', 'Checkout canceled') },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="tm('label', 'Membership')"
      :description="tm('description', 'Manage your plan and billing.')"
      :breadcrumb="breadcrumb"
    />
    <UEmpty
      icon="i-lucide-circle-x"
      :title="t('title', 'Checkout canceled')"
      :description="t('body', 'No changes were made and you have not been charged.')"
      :actions="membership ? [{ label: t('back', 'Back to membership'), to: localize(membership) }] : []"
    />
  </div>
</template>
