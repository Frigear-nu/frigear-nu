<script setup lang="ts">
import { formatDate as formatDateValue } from '@frigear-nu/ui/utils'
import { usePlans } from '../composables/usePlans'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionStatus' })

const props = defineProps<{
  locale?: string
}>()

const t = useModuleT('subscriptions.status')
const tp = useModuleT('subscriptions.catalog')
const format = useFormat()
const { plans } = usePlans()
const { subscription, plan, isActive, cancelsAt, loading, pending, error, subscribe, openPortal } = useSubscription()

const planLabel = computed(() => {
  const found = plans.value.find(p => p.key === plan.value)
  return plan.value ? tp(`${plan.value}.label`, found?.label ?? plan.value) : plan.value
})

// `status` is what `StatusBadge` colours by; `color` stays on the object for consumers of the `badge` slot.
const badge = computed(() => {
  const value = subscription.value?.status
  if (cancelsAt.value) return { status: 'cancelling', label: t('cancelling', 'Membership is ending'), color: 'warning' as const, icon: 'i-lucide-battery-warning' }
  if (value === 'active') return { status: value, label: t('active', 'Active'), color: statusColor(value), icon: 'i-lucide-shield-check' }
  if (value === 'trialing') return { status: value, label: t('trialing', 'Trial'), color: statusColor(value), icon: undefined }
  if (value === 'past_due' || value === 'unpaid') return { status: 'past_due', label: t('pastDue', 'Past due'), color: statusColor('past_due'), icon: undefined }
  if (value === 'canceled') return { status: value, label: t('canceled', 'Canceled'), color: statusColor(value), icon: undefined }
  return { status: value, label: t('other', 'Inactive'), color: statusColor(value), icon: undefined }
})

// The `locale` prop wins over the active locale.
const formatDate = (value: string | null) => formatDateValue(value, props.locale ?? format.locale.value, { dateStyle: 'long' })

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
  <SectionCard
    :title="t('title', 'Your membership')"
    icon="i-lucide-credit-card"
    :loading="loading && !$slots.loading"
  >
    <template
      v-if="$slots.header"
      #header
    >
      <slot name="header" />
    </template>

    <slot
      v-if="loading"
      name="loading"
    >
      <p class="text-muted text-sm">
        {{ t('loading', 'Loading membership…') }}
      </p>
    </slot>

    <div
      v-else-if="isActive && subscription"
      class="flex flex-col gap-4"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex flex-col">
          <span class="text-muted text-sm">{{ t('currentPlan', 'Current plan') }}</span>
          <slot
            name="plan"
            :plan="plan"
            :label="planLabel"
            :subscription="subscription"
          >
            <span class="text-highlighted text-lg font-semibold">{{ planLabel }}</span>
          </slot>
        </div>
        <slot
          name="badge"
          :subscription="subscription"
          :badge="badge"
        >
          <StatusBadge
            :status="badge.status"
            :label="badge.label"
            :icon="badge.icon"
            :colors="{ cancelling: 'warning' }"
          />
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
          class="bg-muted/50 rounded-md px-4 py-3 text-sm"
        >
          {{ dateText }}
        </div>
      </slot>
    </div>

    <slot
      v-else
      name="empty"
    >
      <p class="text-muted text-sm">
        {{ t('none', 'You do not have an active membership.') }}
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
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="!cancelsAt"
            color="error"
            variant="outline"
            icon="i-lucide-x"
            :loading="pending"
            :label="t('cancel', 'Cancel membership')"
            @click="manage"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-credit-card"
            :loading="pending"
            :label="t('changePaymentMethod', 'Change payment method')"
            @click="manage"
          />
          <UButton
            v-if="cancelsAt"
            icon="i-lucide-rotate-ccw"
            :loading="pending"
            :label="t('resubscribe', 'Resubscribe')"
            @click="resubscribe"
          />
        </div>
      </slot>
    </template>
  </SectionCard>
</template>
