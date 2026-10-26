<script setup lang="ts">
import { usePlans } from '../composables/usePlans'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionsMembershipSummary' })

// Summary card for the `account.overview` widget area of the account area (`@frigear-nu/account`).
const t = useModuleT('subscriptions.overview')
const ts = useModuleT('subscriptions.status')
const tp = useModuleT('subscriptions.catalog')
const format = useFormat()
const { localize } = useLocaleLink()
const { plans } = usePlans()
const { subscription, plan, isActive, cancelsAt, loading } = useSubscription()
const membership = useRuntimeConfig().public.subscriptions?.pages?.membership

const planLabel = computed(() => {
  if (!plan.value) return ''
  return tp(`${plan.value}.label`, plans.value.find(p => p.key === plan.value)?.label ?? plan.value)
})

const hint = computed(() => {
  const end = subscription.value?.currentPeriodEnd
  if (!end) return undefined
  const date = format.date(end)
  if (subscription.value?.source === 'manual') return ts('freeUntil', 'Free membership until {date}', { date })
  return cancelsAt.value ? ts('cancels', 'Ends on {date}', { date }) : ts('renews', 'Renews on {date}', { date })
})
</script>

<template>
  <StatCard
    :label="t('label', 'Membership')"
    icon="i-lucide-credit-card"
    :to="membership ? localize(membership) : undefined"
    :loading="loading"
    :value="isActive ? planLabel : undefined"
    :hint="isActive ? hint : undefined"
    :empty="t('none', 'No active membership')"
  />
</template>
