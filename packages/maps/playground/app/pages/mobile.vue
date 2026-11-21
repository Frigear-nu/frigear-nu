<script setup lang="ts">
import { demoLayout } from '../utils/demo'

// The mobile viewer as a mobile screen would place it: the page gives it the space below its title.
const layout = demoLayout()
</script>

<template>
  <div class="flex min-h-dvh flex-col gap-3 p-4">
    <h1 class="text-xl font-semibold">
      Venue
    </h1>
    <MapMobileViewer
      :layout="layout"
      surface="demo.venue"
      :params="{ venue: 'roskilde' }"
    />
  </div>
</template>
