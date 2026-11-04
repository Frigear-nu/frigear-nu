<script setup lang="ts">
const { hasResponded, isAllowed } = useCookieConsent()
const { t, policyUrl } = useConsentT()
</script>

<template>
  <div>basic</div>
  <p id="consent">
    responded: {{ hasResponded }}, analytics: {{ isAllowed('analytics') }}
  </p>
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
