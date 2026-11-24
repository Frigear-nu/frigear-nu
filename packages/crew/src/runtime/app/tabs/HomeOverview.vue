<script setup lang="ts">
import { CREW_DASHBOARD } from '../../dashboard'

defineOptions({ name: 'CrewHomeOverviewTab' })

// The Overview tab of the crew home (`crew.dashboard`, the default tab): the `crew.home` dashboard, with every installed
// module's items the person may see (their crew status, next shift, teams, help, ...). Each item checks its own
// permission.
</script>

<template>
  <Dashboard :name="CREW_DASHBOARD" />
</template>
