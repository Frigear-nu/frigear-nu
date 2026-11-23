<script setup lang="ts">
defineOptions({ name: 'HelpCenterSignedInIndexPage' })

// The start page of the signed-in help center (see `HelpCenterHome`): the articles the viewer may read, their onboarding
// checklists and what changed lately. No container: under `/account/**` the account layout provides it.
</script>

<template>
  <HelpCenterHome area="signedIn" />
</template>
