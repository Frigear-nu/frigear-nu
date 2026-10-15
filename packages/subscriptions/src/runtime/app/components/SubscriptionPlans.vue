<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import { formatMoney } from '@frigear-nu/ui/money'
import { usePlans } from '../composables/usePlans'
import type { SubscriptionPlan, SubscriptionPlanPrice } from '../composables/usePlans'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionPlans' })

const props = withDefaults(defineProps<{
  locale?: string
  /** Override the price currency formatting currency (defaults to the price's own currency). */
  currency?: string
  interval?: SubscriptionPlanPrice['interval']
  /** Only show these plan keys. */
  plans?: string[]
  /** Ask for confirmation (modal) before changing an existing subscription. */
  confirmChange?: boolean
  /** `list` shows all plans side by side, `tabs` one at a time. `auto` uses tabs on small screens. */
  mode?: 'auto' | 'list' | 'tabs'
  /** Plan key to emphasise (defaults to the current plan, when subscribed). */
  highlight?: string
}>(), { confirmChange: false, mode: 'auto' })

const emit = defineEmits<{ select: [plan: SubscriptionPlan, price: SubscriptionPlanPrice] }>()

const t = useModuleT('subscriptions.plans')
const tp = useModuleT('subscriptions.catalog')
const ti = useModuleT('subscriptions.interval')
const { plans: allPlans, status } = usePlans()
const { plan: currentPlan, isActive, cancelsAt, pending, subscribe, error, status: subscriptionStatus } = useSubscription()
const { loggedIn } = useUserSession()
const format = useFormat()
const route = useRoute()
const [DefineCard, ReuseCard] = createReusableTemplate<{ plan: SubscriptionPlan, preview?: boolean }>()

const visible = computed(() => allPlans.value.filter(p => !props.plans || props.plans.includes(p.key)))
const currentRank = computed(() => allPlans.value.find(p => p.key === currentPlan.value)?.rank ?? null)

function priceFor(plan: SubscriptionPlan): SubscriptionPlanPrice | undefined {
  return plan.prices.find(p => p.interval === props.interval) ?? plan.prices[0]
}

function formatPrice(price: SubscriptionPlanPrice) {
  if (price.amount === null) return ''
  const currency = props.currency ?? price.currency
  return props.locale ? formatMoney(price.amount, currency, props.locale) : format.money(price.amount, currency)
}

function intervalLabel(price: SubscriptionPlanPrice) {
  const singular = { day: 'day', week: 'week', month: 'month', year: 'year' } as const
  const unit = singular[price.interval]
  if (price.interval === 'month' && price.intervalCount === 3) return ti('quarter', 'quarter')
  if (price.intervalCount <= 1) return ti(unit, unit)
  return `${price.intervalCount} ${ti(`${unit}s`, `${unit}s`)}`
}

const labelOf = (plan: SubscriptionPlan) => tp(`${plan.key}.label`, plan.label)
const descriptionOf = (plan: SubscriptionPlan) => plan.description ? tp(`${plan.key}.description`, plan.description) : ''

function stateOf(plan: SubscriptionPlan): 'current' | 'resume' | 'upgrade' | 'downgrade' | 'subscribe' {
  if (!isActive.value) return 'subscribe'
  if (plan.key === currentPlan.value) return cancelsAt.value ? 'resume' : 'current'
  if (currentRank.value === null) return 'subscribe'
  return plan.rank > currentRank.value ? 'upgrade' : 'downgrade'
}

const stateLabel = (state: ReturnType<typeof stateOf>) =>
  t(state, { current: 'Current plan', resume: 'Resubscribe', subscribe: 'Subscribe', upgrade: 'Upgrade', downgrade: 'Downgrade' }[state])

// `auto` renders both layouts and lets CSS pick one, so the server and client markup match (no swap after hydration).
const showTabs = computed(() => props.mode !== 'list')
const showGrid = computed(() => props.mode !== 'tabs')
const activeTab = ref<string>()
const tabItems = computed(() => visible.value.map(plan => ({
  value: plan.key,
  label: priceFor(plan) ? `/ ${intervalLabel(priceFor(plan)!)}` : labelOf(plan),
  plan,
})))
watchEffect(() => {
  if (!activeTab.value || !visible.value.some(p => p.key === activeTab.value)) {
    activeTab.value = (visible.value.find(p => p.key === currentPlan.value) ?? visible.value[visible.value.length - 1])?.key
  }
})

const highlighted = (plan: SubscriptionPlan) => props.highlight ? props.highlight === plan.key : stateOf(plan) === 'current'

function featuresOf(plan: SubscriptionPlan) {
  return plan.features?.length ? plan.features : undefined
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

/** Where to send visitors that are not signed in: register, then straight back here with the plan selected. */
function signUpTarget(plan: SubscriptionPlan) {
  const authPages = useAuthPages()
  const pages = useRuntimeConfig().public as { subscriptions?: { pages?: { membership?: string } } }
  const entry = authPages.register ?? authPages.login
  const back = `${pages.subscriptions?.pages?.membership ?? route.path}?plan=${encodeURIComponent(plan.key)}`
  return entry ? `${entry}?redirect=${encodeURIComponent(back)}` : null
}

function choose(plan: SubscriptionPlan) {
  const price = priceFor(plan)
  if (!price) return
  if (!loggedIn.value) {
    const target = signUpTarget(plan)
    if (target) navigateTo(target)
    return
  }
  if (stateOf(plan) === 'current') return
  if (props.confirmChange && isActive.value) confirming.value = { plan, price }
  else go(plan, price)
}

const confirmKind = computed(() => confirming.value ? stateOf(confirming.value.plan) : 'subscribe')
const confirmText = computed(() => ({
  upgrade: t('confirmUpgrade', 'Upgrading moves you to the higher plan immediately and charges the difference.'),
  downgrade: t('confirmDowngrade', 'Downgrading keeps your current plan until the next due date.'),
  resume: t('confirmResume', 'Your membership will keep renewing as before.'),
  subscribe: t('confirmCheckout', 'You will now be taken to Stripe to confirm.'),
  current: '',
}[confirmKind.value]))

// `?plan=<key>` (set by the sign-up redirect) opens the selection for that plan once data is ready.
const handledPlanQuery = ref(false)
watch([visible, subscriptionStatus, loggedIn], () => {
  const key = route.query.plan
  if (handledPlanQuery.value || typeof key !== 'string' || !loggedIn.value || subscriptionStatus.value === 'pending') return
  const plan = visible.value.find(p => p.key === key)
  if (!plan) return
  handledPlanQuery.value = true
  if (stateOf(plan) !== 'current') choose(plan)
  navigateTo({ path: route.path, query: { ...route.query, plan: undefined } }, { replace: true })
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <DefineCard v-slot="{ plan, preview }">
      <UPricingPlan
        :data-plan="plan.key"
        :title="labelOf(plan)"
        :description="descriptionOf(plan)"
        :price="priceFor(plan) ? formatPrice(priceFor(plan)!) : undefined"
        :billing-cycle="priceFor(plan) ? `/ ${intervalLabel(priceFor(plan)!)}` : undefined"
        :features="featuresOf(plan)"
        :terms="t('feeIncluded', '*Payment fees are included in the amount')"
        :highlight="!preview && highlighted(plan)"
        :badge="!preview && stateOf(plan) === 'current' ? t('current', 'Current plan') : undefined"
        :tagline="priceFor(plan)?.trialPeriodDays ? t('trial', '{days}-day free trial', { days: priceFor(plan)!.trialPeriodDays! }) : undefined"
        variant="subtle"
        :ui="{
          root: 'rounded-xl transition-shadow hover:shadow-lg',
          title: 'text-lg font-semibold',
          price: 'text-4xl font-extrabold text-primary',
          billingCycle: 'uppercase ml-1 text-muted',
          terms: 'text-xs text-muted',
        }"
      >
        <template
          v-if="$slots.header"
          #header
        >
          <slot
            name="header"
            :plan="plan"
            :state="stateOf(plan)"
          />
        </template>
        <template
          v-if="$slots.badge"
          #badge
        >
          <slot
            name="badge"
            :plan="plan"
            :state="stateOf(plan)"
          />
        </template>
        <template
          v-if="$slots.price"
          #price
        >
          <slot
            name="price"
            :plan="plan"
            :price="priceFor(plan)"
            :format-price="formatPrice"
            :interval-label="intervalLabel"
          />
        </template>
        <template
          v-if="$slots.features"
          #features
        >
          <slot
            name="features"
            :plan="plan"
          />
        </template>
        <template
          v-if="!preview"
          #button
        >
          <slot
            name="action"
            :plan="plan"
            :state="stateOf(plan)"
            :pending="pending"
            :select="() => choose(plan)"
          >
            <UButton
              block
              size="lg"
              class="uppercase"
              :loading="pending"
              :disabled="stateOf(plan) === 'current' || !priceFor(plan)"
              :variant="stateOf(plan) === 'current' ? 'subtle' : 'solid'"
              :label="loggedIn ? stateLabel(stateOf(plan)) : t('subscribe', 'Subscribe')"
              @click="choose(plan)"
            />
          </slot>
        </template>
      </UPricingPlan>
    </DefineCard>

    <slot
      v-if="status === 'pending' && !visible.length"
      name="loading"
    >
      <p class="text-center text-sm text-muted">
        {{ t('loading', 'Loading plans…') }}
      </p>
    </slot>

    <slot
      v-else-if="!visible.length"
      name="empty"
    >
      <p class="text-center text-sm text-muted">
        {{ t('empty', 'No plans are available right now.') }}
      </p>
    </slot>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :description="error"
    />

    <template v-if="visible.length">
      <template v-if="showTabs">
        <UTabs
          v-model="activeTab"
          :items="tabItems"
          :content="false"
          class="w-full"
          :class="{ 'sm:hidden': showGrid }"
        />
        <div
          class="pt-2"
          :class="{ 'sm:hidden': showGrid }"
        >
          <ReuseCard
            v-if="visible.find(p => p.key === activeTab)"
            :plan="visible.find(p => p.key === activeTab)!"
          />
        </div>
      </template>
      <div
        v-if="showGrid"
        class="items-stretch gap-6 sm:grid-cols-2"
        :class="[showTabs ? 'hidden sm:grid' : 'grid', visible.length >= 3 ? 'lg:grid-cols-3' : '']"
      >
        <ReuseCard
          v-for="plan in visible"
          :key="plan.key"
          :plan="plan"
        />
      </div>
    </template>

    <UModal
      v-model:open="confirmOpen"
      :title="confirmKind === 'subscribe' ? t('checkoutTitle', 'Get a membership') : t('changeTitle', 'Update subscription')"
    >
      <template #body>
        <slot
          name="confirm"
          :plan="confirming?.plan"
          :price="confirming?.price"
        >
          <div class="space-y-4">
            <p class="text-muted">
              {{ t('subscribeTo', 'You will now subscribe to:') }}
            </p>
            <ReuseCard
              v-if="confirming"
              :plan="confirming.plan"
              preview
            />
            <p class="text-sm text-muted">
              {{ confirmText }}
            </p>
          </div>
        </slot>
      </template>
      <template #footer>
        <slot
          name="confirm-actions"
          :plan="confirming?.plan"
          :price="confirming?.price"
          :confirm="() => confirming && go(confirming.plan, confirming.price)"
        >
          <div class="flex w-full justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              :label="t('cancel', 'Cancel')"
              @click="confirming = null"
            />
            <UButton
              :label="t('confirm', 'Confirm')"
              :loading="pending"
              @click="confirming && go(confirming.plan, confirming.price)"
            />
          </div>
        </slot>
      </template>
    </UModal>
  </div>
</template>
