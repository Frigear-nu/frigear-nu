<script setup lang="ts">
import { useConsentT, useCookieConsent } from '#imports'
// The button row of the banner. Override this component to change the buttons without replacing the whole banner.
const { acceptAll, rejectAll, openPreferences } = useCookieConsent()
const { t } = useConsentT()
</script>

<template>
  <div class="flex shrink-0 flex-wrap gap-2">
    <UButton
      color="neutral"
      variant="ghost"
      :label="t('preferences')"
      data-testid="cookie-consent-preferences"
      @click="openPreferences"
    />
    <UButton
      color="neutral"
      variant="outline"
      :label="t('reject')"
      data-testid="cookie-consent-reject"
      @click="rejectAll"
    />
    <UButton
      color="primary"
      :label="t('accept')"
      data-testid="cookie-consent-accept"
      @click="acceptAll"
    />
  </div>
</template>
