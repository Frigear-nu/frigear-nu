<script setup lang="ts">
import SubscriptionPlans from '../components/SubscriptionPlans.vue'
import SubscriptionStatus from '../components/SubscriptionStatus.vue'
import { useSubscription } from '../composables/useSubscription'

defineOptions({ name: 'SubscriptionMembershipPage' })

const { isActive } = useSubscription()
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody class="space-y-8">
        <SubscriptionStatus v-if="isActive" />
        <SubscriptionPlans confirm-change />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
