<script setup lang="ts">
import { usePlans } from '../composables/usePlans'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionStatus' })

const props = defineProps<{
  locale?: string
}>()

const t = useModuleT('subscriptions.status')
const tp = useModuleT('subscriptions.catalog')
const { plans } = usePlans()
const { subscription, plan, status, isActive, cancelsAt, pending, error, subscribe, openPortal } = useSubscription()

const planLabel = computed(() => {
  const found = plans.value.find(p => p.key === plan.value)
  return plan.value ? tp(`${plan.value}.label`, found?.label ?? plan.value) : plan.value
})

const badge = computed(() => {
  const value = subscription.value?.status
  if (cancelsAt.value) return { label: t('cancelling', 'Subscription is ending'), color: 'warning' as const, icon: 'i-lucide-battery-warning' }
  if (value === 'active') return { label: t('active', 'Active'), color: 'success' as const, icon: 'i-lucide-shield-check' }
  if (value === 'trialing') return { label: t('trialing', 'Trial'), color: 'info' as const }
  if (value === 'past_due' || value === 'unpaid') return { label: t('pastDue', 'Past due'), color: 'warning' as const }
  if (value === 'canceled') return { label: t('canceled', 'Canceled'), color: 'neutral' as const }
  return { label: t('other', 'Inactive'), color: 'neutral' as const }
})

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(props.locale, { dateStyle: 'long' }).format(new Date(value)) : ''
}

const isManual = computed(() => subscription.value?.source === 'manual')

const dateText = computed(() => {
  const end = subscription.value?.currentPeriodEnd
  if (isManual.value) return end ? t('freeUntil', 'Free membership until {date}', { date: formatDate(end) }) : t('free', 'Free membership')
  if (cancelsAt.value) return t('cancelsAt', 'Ending at {date}', { date: formatDate(cancelsAt.value) })
  return end ? t('renewsAutomaticallyAt', 'Renews automatically on {date}', { date: formatDate(end) }) : ''
})

const resubscribe = () => subscription.value?.planKey
  ? subscribe(subscription.value.planKey).catch(() => undefined)
  : subscribe(subscription.value?.priceId ?? '').catch(() => undefined)
const manage = () => openPortal().catch(() => undefined)
</script>

<template>
  <UPageCard :title="t('title', 'Your subscription')">
    <template
      v-if="$slots.header"
      #header
    >
      <slot name="header" />
    </template>

    <slot
      v-if="status === 'pending' && !subscription"
      name="loading"
    >
      <p class="text-sm text-muted">
        {{ t('loading', 'Loading subscription…') }}
      </p>
    </slot>

    <div
      v-else-if="isActive && subscription"
      class="flex flex-col gap-4"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex flex-col">
          <span class="text-sm text-muted">{{ t('currentPlan', 'Current plan') }}</span>
          <slot
            name="plan"
            :plan="plan"
            :label="planLabel"
            :subscription="subscription"
          >
            <span class="text-lg font-semibold">{{ planLabel }}</span>
          </slot>
        </div>
        <slot
          name="badge"
          :subscription="subscription"
          :badge="badge"
        >
          <UBadge
            :color="badge.color"
            :icon="badge.icon"
            variant="soft"
          >
            {{ badge.label }}
          </UBadge>
        </slot>
      </div>
      <slot
        name="dates"
        :subscription="subscription"
        :cancels-at="cancelsAt"
        :date-text="dateText"
      >
        <div
          v-if="dateText"
          class="rounded-md bg-muted/50 px-4 py-3 text-sm"
        >
          {{ dateText }}
        </div>
      </slot>
    </div>

    <slot
      v-else
      name="empty"
    >
      <p class="text-sm text-muted">
        {{ t('none', 'You do not have an active subscription.') }}
      </p>
    </slot>

    <UAlert
      v-if="error"
      class="mt-3"
      color="error"
      variant="subtle"
      :description="error"
    />

    <template
      v-if="isActive && !isManual"
      #footer
    >
      <slot
        name="actions"
        :manage="manage"
        :resubscribe="resubscribe"
        :cancelling="!!cancelsAt"
        :pending="pending"
      >
        <div class="flex flex-wrap gap-3">
          <UButton
            v-if="!cancelsAt"
            color="error"
            variant="soft"
            icon="i-lucide-x"
            :loading="pending"
            :label="t('cancel', 'Cancel membership')"
            @click="manage"
          />
          <UButton
            v-else
            icon="i-lucide-rotate-ccw"
            :loading="pending"
            :label="t('resubscribe', 'Resubscribe')"
            @click="resubscribe"
          />
          <UButton
            variant="outline"
            icon="i-lucide-credit-card"
            :loading="pending"
            :label="t('changePaymentMethod', 'Change payment method')"
            @click="manage"
          />
        </div>
      </slot>
    </template>
  </UPageCard>
</template>
