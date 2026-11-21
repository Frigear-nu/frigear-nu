<script setup lang="ts">
import { useModuleT, useRuntimeConfig } from '#imports'

// The Home tab of `@frigear-nu/mobile` (option `dashboard.homeTab`). The navbar title is the tab's label.
defineOptions({ name: 'DashboardHomePage' })

const t = useModuleT('dashboard')
const name = (useRuntimeConfig().public.dashboard as { home?: string } | undefined)?.home || 'crew.home'
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- The mobile navbar shows the tab label; the page still has one heading for screen readers. -->
    <h1 class="sr-only">
      {{ t('home.label', 'Home') }}
    </h1>
    <Dashboard :name="name" />
  </div>
</template>
