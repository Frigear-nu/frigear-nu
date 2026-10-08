<script setup lang="ts">
import { usePlans } from '../composables/usePlans'
import type { SubscriptionPlan, SubscriptionPlanPrice } from '../composables/usePlans'
import { useSubscription, useSubscriptionLabels } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionPlans' })

const defaults = {
  current: 'Current plan',
  subscribe: 'Subscribe',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  empty: 'No plans are available right now.',
  loading: 'Loading plans…',
  trial: '{days}-day free trial',
  confirmTitle: 'Change plan',
  confirmBody: 'Switch to {plan}? Your subscription will be updated.',
  confirm: 'Confirm',
  cancel: 'Cancel',
  perDay: 'day',
  perWeek: 'week',
  perMonth: 'month',
  perYear: 'year',
}
type Labels = typeof defaults

const props = withDefaults(defineProps<{
  locale?: string
  /** Override the price currency formatting currency (defaults to the price's own currency). */
  currency?: string
  interval?: SubscriptionPlanPrice['interval']
  /** Only show these plan keys. */
  plans?: string[]
  labels?: Partial<Labels>
  /** Ask for confirmation (modal) before changing an existing subscription. */
  confirmChange?: boolean
}>(), { confirmChange: false })

const emit = defineEmits<{ select: [plan: SubscriptionPlan, price: SubscriptionPlanPrice] }>()

const t = useSubscriptionLabels(defaults, () => props.labels)
const { plans: allPlans, status } = usePlans()
const { plan: currentPlan, isActive, pending, subscribe, error } = useSubscription()

const visible = computed(() => allPlans.value.filter(p => !props.plans || props.plans.includes(p.key)))
const currentRank = computed(() => allPlans.value.find(p => p.key === currentPlan.value)?.rank ?? null)

function priceFor(plan: SubscriptionPlan): SubscriptionPlanPrice | undefined {
  return plan.prices.find(p => p.interval === props.interval) ?? plan.prices[0]
}

function formatPrice(price: SubscriptionPlanPrice) {
  if (price.amount === null) return ''
  return new Intl.NumberFormat(props.locale, {
    style: 'currency',
    currency: (props.currency ?? price.currency).toUpperCase(),
  }).format(price.amount / 100)
}

function intervalLabel(price: SubscriptionPlanPrice) {
  const unit = t(({ day: 'perDay', week: 'perWeek', month: 'perMonth', year: 'perYear' } as const)[price.interval])
  return price.intervalCount > 1 ? `${price.intervalCount} ${unit}` : unit
}

function stateOf(plan: SubscriptionPlan): 'current' | 'upgrade' | 'downgrade' | 'subscribe' {
  if (!isActive.value) return 'subscribe'
  if (plan.key === currentPlan.value) return 'current'
  if (currentRank.value === null) return 'subscribe'
  return plan.rank > currentRank.value ? 'upgrade' : 'downgrade'
}

const confirming = ref<{ plan: SubscriptionPlan, price: SubscriptionPlanPrice } | null>(null)
const confirmOpen = computed({
  get: () => confirming.value !== null,
  set: (value: boolean) => { if (!value) confirming.value = null },
})

async function go(plan: SubscriptionPlan, price: SubscriptionPlanPrice) {
  emit('select', plan, price)
  confirming.value = null
  await subscribe(plan.key).catch(() => undefined)
}

function choose(plan: SubscriptionPlan) {
  const price = priceFor(plan)
  if (!price) return
  if (props.confirmChange && isActive.value) confirming.value = { plan, price }
  else go(plan, price)
}
</script>

<template>
  <div class="space-y-4">
    <slot
      v-if="status === 'pending' && !visible.length"
      name="loading"
    >
      <p class="text-sm text-muted">
        {{ t('loading') }}
      </p>
    </slot>

    <slot
      v-else-if="!visible.length"
      name="empty"
    >
      <p class="text-sm text-muted">
        {{ t('empty') }}
      </p>
    </slot>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :description="error"
    />

    <div
      v-if="visible.length"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="plan in visible"
        :key="plan.key"
        :data-plan="plan.key"
      >
        <template #header>
          <slot
            name="header"
            :plan="plan"
            :state="stateOf(plan)"
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-semibold">
                {{ plan.label }}
              </h3>
              <slot
                name="badge"
                :plan="plan"
                :state="stateOf(plan)"
              >
                <UBadge
                  v-if="stateOf(plan) === 'current'"
                  color="primary"
                  variant="subtle"
                >
                  {{ t('current') }}
                </UBadge>
              </slot>
            </div>
            <p
              v-if="plan.description"
              class="mt-1 text-sm text-muted"
            >
              {{ plan.description }}
            </p>
          </slot>
        </template>

        <slot
          name="price"
          :plan="plan"
          :price="priceFor(plan)"
          :format-price="formatPrice"
          :interval-label="intervalLabel"
        >
          <template v-if="priceFor(plan)">
            <p class="text-2xl font-bold">
              {{ formatPrice(priceFor(plan)!) }}
              <span class="text-sm font-normal text-muted">/ {{ intervalLabel(priceFor(plan)!) }}</span>
            </p>
            <p
              v-if="priceFor(plan)!.trialPeriodDays"
              class="mt-1 text-sm text-muted"
            >
              {{ t('trial', { days: priceFor(plan)!.trialPeriodDays! }) }}
            </p>
          </template>
        </slot>

        <slot
          name="features"
          :plan="plan"
        />

        <template #footer>
          <slot
            name="action"
            :plan="plan"
            :state="stateOf(plan)"
            :pending="pending"
            :select="() => choose(plan)"
          >
            <UButton
              block
              :loading="pending"
              :disabled="stateOf(plan) === 'current' || !priceFor(plan)"
              :variant="stateOf(plan) === 'current' ? 'outline' : 'solid'"
              :label="t(stateOf(plan))"
              @click="choose(plan)"
            />
          </slot>
        </template>
      </UCard>
    </div>

    <UModal
      v-model:open="confirmOpen"
      :title="t('confirmTitle')"
    >
      <template #body>
        <slot
          name="confirm"
          :plan="confirming?.plan"
          :price="confirming?.price"
        >
          <p>{{ t('confirmBody', { plan: confirming?.plan.label ?? '' }) }}</p>
        </slot>
      </template>
      <template #footer>
        <slot
          name="confirm-actions"
          :plan="confirming?.plan"
          :price="confirming?.price"
          :confirm="() => confirming && go(confirming.plan, confirming.price)"
        >
          <UButton
            variant="outline"
            :label="t('cancel')"
            @click="confirming = null"
          />
          <UButton
            :label="t('confirm')"
            :loading="pending"
            @click="confirming && go(confirming.plan, confirming.price)"
          />
        </slot>
      </template>
    </UModal>
  </div>
</template>
