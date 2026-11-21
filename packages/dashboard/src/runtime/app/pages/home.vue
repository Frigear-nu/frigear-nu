<script setup lang="ts">
import { useRuntimeConfig } from '#imports'

// The Home tab of `@frigear-nu/mobile` (option `dashboard.homeTab`). The navbar title is the tab's label.
defineOptions({ name: 'DashboardHomePage' })

const name = (useRuntimeConfig().public.dashboard as { home?: string } | undefined)?.home || 'crew.home'
</script>

<template>
  <div class="flex flex-col gap-4">
    <Dashboard :name="name" />
  </div>
</template>
