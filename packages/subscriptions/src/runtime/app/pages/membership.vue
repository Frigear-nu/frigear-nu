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
        <UPageHero
          v-else-if="loggedIn"
          :title="t('status.heroTitle', 'Join the team today')"
          :description="t('status.heroDescription', 'Set up your membership to get started!')"
          :ui="{ title: 'text-3xl sm:text-4xl' }"
          class="py-0 sm:py-0"
        />
        <UPageHeader
          v-if="cancelsAt"
          :title="t('plans.resubscribe', 'Resubscribe')"
        />
        <SubscriptionPlans confirm-change />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
