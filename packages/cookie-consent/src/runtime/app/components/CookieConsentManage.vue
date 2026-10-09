<script setup lang="ts">
// A small "Manage cookies" link/button for footers. Also lets visitors withdraw consent later.
const { openPreferences } = useCookieConsent()
const { t } = useConsentT()
</script>

<template>
  <button
    type="button"
    :class="['cc-manage', { 'cc-manage-text': !$slots.default }]"
    data-testid="cookie-consent-manage"
    @click="openPreferences"
  >
    <slot>{{ t('manage') }}</slot>
  </button>
</template>

<style scoped>
.cc-manage { cursor: pointer; background: none; border: 0; padding: 0; color: inherit; }
.cc-manage-text { text-decoration: underline; }
</style>
