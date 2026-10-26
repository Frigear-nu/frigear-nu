<script setup lang="ts">
import SubscriptionPlans from '../components/SubscriptionPlans.vue'
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionMembershipPage' })

// No container or page heading: under `/account/**` the `account` layout provides both.
const t = useModuleT('subscriptions')
// Awaited, so the server renders the right state; on client navigation the remembered subscription shows at once.
const { isActive, cancelsAt, loading, loadError, refresh } = await useSubscription()
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Until the subscription is known, a placeholder the size of the status card: never the "join" hero. -->
    <SectionCard
      v-if="loading"
      :title="t('status.title', 'Your subscription')"
      icon="i-lucide-credit-card"
      loading
    />
    <SubscriptionStatus v-else-if="isActive" />
    <UEmpty
      v-else-if="loadError"
      icon="i-lucide-circle-alert"
      :title="t('status.loadFailed', 'Your membership could not be loaded')"
      :description="errorMessage(loadError)"
      :actions="[{ label: t('status.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
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
