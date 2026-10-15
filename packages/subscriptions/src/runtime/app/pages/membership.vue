<script setup lang="ts">
import SubscriptionPlans from '../components/SubscriptionPlans.vue'
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionMembershipPage' })

// No container or page heading: under `/account/**` the `account` layout provides both.
const t = useModuleT('subscriptions')
const { isActive, cancelsAt } = useSubscription()
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="flex flex-col gap-6">
    <SubscriptionStatus v-if="isActive" />
    <div
      v-else-if="loggedIn"
      class="flex flex-col gap-1"
    >
      <h2 class="text-highlighted text-lg font-semibold">
        {{ t('status.heroTitle', 'Join the team today') }}
      </h2>
      <p class="text-muted text-sm">
        {{ t('status.heroDescription', 'Set up your membership to get started!') }}
      </p>
    </div>
    <h2
      v-if="cancelsAt"
      class="text-highlighted text-lg font-semibold"
    >
      {{ t('plans.resubscribe', 'Resubscribe') }}
    </h2>
    <SubscriptionPlans confirm-change />
  </div>
</template>
