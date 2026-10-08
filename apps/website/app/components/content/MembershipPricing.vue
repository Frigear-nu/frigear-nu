<script setup lang="ts">
// MDC wrapper so the `/membership` content pages can use `:::membership-pricing`.
// Plans, prices, checkout and plan changes are all handled by `@frigear-nu/subscriptions`.
const { locale } = useI18n()
</script>

<template>
  <SubscriptionPlans :locale="locale" />
</template>
