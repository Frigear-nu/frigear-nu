<script setup lang="ts">
import { navigateTo, useRoute, useShiftsLinks } from '#imports'

defineOptions({ name: 'ShiftsShiftRedirectPage' })

// The old address of one shift (`/shifts/:assignmentId`), kept when the page moved below the crew home in the signed-in
// hub: links in emails already sent and bookmarks send on to it.
const route = useRoute()
await navigateTo(useShiftsLinks().shift(String(route.params.assignmentId ?? '')), { redirectCode: 301, replace: true })
</script>

<template>
  <div />
</template>
