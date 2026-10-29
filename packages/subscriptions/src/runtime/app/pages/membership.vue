<script setup lang="ts">
import SubscriptionPlans from '../components/SubscriptionPlans.vue'
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionMembershipPage' })

// No container: under `/account/**` the `account` layout provides it. The page renders its own heading, from the
// same keys as its account menu item, so title and navigation label cannot drift.
const t = useModuleT('subscriptions')
const tm = useModuleT('subscriptions.menu.membership')
// Awaited, so the server renders the right state; on client navigation the remembered subscription shows at once.
const { isActive, cancelsAt, loading, loadError, refresh } = await useSubscription()
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="tm('label', 'Membership')"
      :description="tm('description', 'Manage your plan and billing.')"
    />

    <!-- Until the subscription is known, a placeholder the size of the status card: never the "join" empty state. -->
    <SectionCard
      v-if="loading"
      :title="t('status.title', 'Your membership')"
      icon="i-lucide-credit-card"
      loading
    />
    <SubscriptionStatus v-else-if="isActive" />
    <UEmpty
      v-else-if="loadError"
      icon="i-lucide-circle-alert"
      :title="t('status.loadFailed', 'Your membership could not be loaded')"
      :description="errorMessage(loadError, '')"
      :actions="[{ label: t('status.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <SectionCard
      v-else-if="loggedIn"
      :title="t('status.title', 'Your membership')"
      icon="i-lucide-credit-card"
    >
      <UEmpty
        variant="naked"
        icon="i-lucide-badge-check"
        :title="t('status.emptyTitle', 'No membership yet')"
        :description="t('status.emptyDescription', 'Set up your membership to get started!')"
      />
    </SectionCard>

    <SectionCard
      v-if="cancelsAt"
      :title="t('plans.resubscribe', 'Resubscribe')"
    >
      <SubscriptionPlans confirm-change />
    </SectionCard>
    <SubscriptionPlans
      v-else
      confirm-change
    />
  </div>
</template>
