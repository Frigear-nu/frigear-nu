<script setup lang="ts">
import { useConsentT, useCookieConsent } from '#imports'
// A small "Manage cookies" link/button for footers. Also lets visitors withdraw consent later.
const { openPreferences } = useCookieConsent()
const { t } = useConsentT()
</script>

<template>
  <button
    type="button"
    :class="['cursor-pointer', { underline: !$slots.default }]"
    data-testid="cookie-consent-manage"
    @click="openPreferences"
  >
    <slot>{{ t('manage') }}</slot>
  </button>
</template>
