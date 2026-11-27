<script setup lang="ts">
import { resolveComponent, useModuleT, useRuntimeConfig } from '#imports'

// The Home tab of `@frigear-nu/mobile` (option `dashboard.homeTab`). The navbar title is the tab's label. It draws the
// dashboard (only `homeTab.items` when set), then the `dashboard.home` widget area, where the app adds its own
// sections. Items get `homeTab: true` as a prop, so one can render nothing here when it has nothing to say.
defineOptions({ name: 'DashboardHomePage' })

const t = useModuleT('dashboard')
const config = useRuntimeConfig().public.dashboard as { home?: string, homeItems?: string[] } | undefined
const name = config?.home || 'crew.home'
const items = config?.homeItems?.length ? config.homeItems : undefined
const context = { homeTab: true }

// `@frigear-nu/widget` is a dependency of this module, but resolve it like the other pages do.
const WidgetArea = resolveComponent('WidgetArea')
const widgetArea = typeof WidgetArea === 'string' ? undefined : WidgetArea
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- The mobile navbar shows the tab label; the page still has one heading for screen readers. -->
    <h1 class="sr-only">
      {{ t('home.label', 'Home') }}
    </h1>
    <Dashboard
      :name="name"
      :items="items"
      :context="context"
      :editable="!items"
    >
      <!-- With chosen items, nothing to show is nothing: the sections below follow. -->
      <template
        v-if="items"
        #empty
      >
        <span />
      </template>
    </Dashboard>
    <component
      :is="widgetArea"
      v-if="widgetArea"
      name="dashboard.home"
      :context="context"
      grid-class="flex flex-col gap-4"
    />
  </div>
</template>
