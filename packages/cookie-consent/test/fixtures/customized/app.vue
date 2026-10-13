<script setup lang="ts">
const { t, policyUrl } = useConsentT()
</script>

<template>
  <div>
    <p data-testid="policy-url">
      {{ policyUrl }}
    </p>
    <p data-testid="policy-label">
      {{ t('policy') }}
    </p>
    <CookieConsentManage />
    <CookieConsentBannerActions />
  </div>
</template>
