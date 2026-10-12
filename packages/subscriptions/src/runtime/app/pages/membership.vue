<script setup lang="ts">
import SubscriptionPlans from '../components/SubscriptionPlans.vue'
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionMembershipPage' })

const t = useModuleT('subscriptions')
const { isActive, cancelsAt } = useSubscription()
const { loggedIn } = useUserSession()
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody class="space-y-8">
        <SubscriptionStatus v-if="isActive" />
        <div
          v-else-if="loggedIn"
          class="space-y-2 text-center"
        >
          <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
            {{ t('status.heroTitle', 'Join the team today') }}
          </h1>
          <p class="text-muted">
            {{ t('status.heroDescription', 'Set up your membership to get started!') }}
          </p>
        </div>
        <UPageHeader
          v-if="cancelsAt"
          :title="t('plans.resubscribe', 'Resubscribe')"
        />
        <SubscriptionPlans confirm-change />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
