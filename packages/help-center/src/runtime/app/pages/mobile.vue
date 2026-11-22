<script setup lang="ts">
defineOptions({ name: 'HelpCenterMobilePage' })

// The Help tab of the mobile app (`@frigear-nu/mobile` installed, `helpCenter.settings.mobileTab` not `false`): the
// signed-in area's start page, with the search, the categories and the onboarding checklist with read state.
</script>

<template>
  <div class="p-4">
    <HelpCenterHome area="signedIn" />
  </div>
</template>
