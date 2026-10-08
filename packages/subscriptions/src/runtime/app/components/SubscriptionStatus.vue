<script setup lang="ts">
import { usePlans } from '../composables/usePlans'
import { useSubscription, useSubscriptionLabels } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionStatus' })

const defaults = {
  title: 'Your subscription',
  none: 'You do not have an active subscription.',
  loading: 'Loading subscription…',
  plan: 'Plan',
  renews: 'Renews on {date}',
  cancels: 'Ends on {date}',
  manage: 'Manage billing',
  resubscribe: 'Resubscribe',
  statusActive: 'Active',
  statusTrialing: 'Trial',
  statusPastDue: 'Past due',
  statusCanceled: 'Canceled',
  statusOther: 'Inactive',
}
type Labels = typeof defaults

const props = defineProps<{
  locale?: string
  labels?: Partial<Labels>
}>()

const t = useSubscriptionLabels(defaults, () => props.labels)
const { plans } = usePlans()
const { subscription, plan, status, isActive, cancelsAt, pending, error, subscribe, openPortal } = useSubscription()

const planLabel = computed(() => plans.value.find(p => p.key === plan.value)?.label ?? plan.value)

const badge = computed(() => {
  const value = subscription.value?.status
  if (value === 'active') return { label: t('statusActive'), color: 'success' as const }
  if (value === 'trialing') return { label: t('statusTrialing'), color: 'info' as const }
  if (value === 'past_due' || value === 'unpaid') return { label: t('statusPastDue'), color: 'warning' as const }
  if (value === 'canceled') return { label: t('statusCanceled'), color: 'neutral' as const }
  return { label: t('statusOther'), color: 'neutral' as const }
})

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(props.locale, { dateStyle: 'long' }).format(new Date(value)) : ''
}

const dateText = computed(() => {
  if (cancelsAt.value) return t('cancels', { date: formatDate(cancelsAt.value) })
  const end = subscription.value?.currentPeriodEnd
  return end ? t('renews', { date: formatDate(end) }) : ''
})

const resubscribe = () => subscription.value?.planKey
  ? subscribe(subscription.value.planKey).catch(() => undefined)
  : subscribe(subscription.value?.priceId ?? '').catch(() => undefined)
const manage = () => openPortal().catch(() => undefined)
</script>

<template>
  <UCard>
    <template #header>
      <slot name="header">
        <h3 class="font-semibold">
          {{ t('title') }}
        </h3>
      </slot>
    </template>

    <slot
      v-if="status === 'pending' && !subscription"
      name="loading"
    >
      <p class="text-sm text-muted">
        {{ t('loading') }}
      </p>
    </slot>

    <template v-else-if="isActive && subscription">
      <div class="flex flex-wrap items-center gap-2">
        <slot
          name="plan"
          :plan="plan"
          :label="planLabel"
          :subscription="subscription"
        >
          <span class="font-medium">{{ planLabel }}</span>
        </slot>
        <slot
          name="badge"
          :subscription="subscription"
          :badge="badge"
        >
          <UBadge
            :color="badge.color"
            variant="subtle"
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
        <p
          v-if="dateText"
          class="mt-2 text-sm text-muted"
        >
          {{ dateText }}
        </p>
      </slot>
    </template>

    <slot
      v-else
      name="empty"
    >
      <p class="text-sm text-muted">
        {{ t('none') }}
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
      v-if="isActive"
      #footer
    >
      <slot
        name="actions"
        :manage="manage"
        :resubscribe="resubscribe"
        :cancelling="!!cancelsAt"
        :pending="pending"
      >
        <div class="flex flex-wrap gap-2">
          <UButton
            :loading="pending"
            :label="t('manage')"
            @click="manage"
          />
          <UButton
            v-if="cancelsAt"
            variant="outline"
            :loading="pending"
            :label="t('resubscribe')"
            @click="resubscribe"
          />
        </div>
      </slot>
    </template>
  </UCard>
</template>
