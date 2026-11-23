<script setup lang="ts">
import { computed, useDashboardNav, useLocaleLink, useModuleT, useRuntimeConfig } from '#imports'
import { useUserSession } from '#dashboard/optional'

// The signed-in hub (`dashboard.settings.pages.home`): a greeting, shortcuts to the areas of the `dashboard` menu, and
// the `settings.home.dashboard` dashboard.
defineOptions({ name: 'DashboardHubPage' })

const t = useModuleT('dashboard')
const { localize } = useLocaleLink()
const name = useRuntimeConfig().public.dashboard?.homeDashboard || 'home'
const session = typeof useUserSession === 'function' ? useUserSession() : undefined
const { shortcuts } = await useDashboardNav()

const firstName = computed(() => {
  const user = session?.user.value as { name?: string | null } | null | undefined
  return user?.name?.trim().split(/\s+/)[0] || ''
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="firstName ? t('hub.greeting', 'Hi {name}', { name: firstName }) : t('hub.title', 'Your dashboard')"
      :description="t('hub.description', 'Your shortcuts and what is happening.')"
    />

    <UPageGrid
      v-if="shortcuts.length"
      class="lg:grid-cols-3"
      data-dashboard-shortcuts
    >
      <UPageCard
        v-for="item in shortcuts"
        :key="item.id"
        :title="item.label"
        :description="item.description"
        :icon="item.icon"
        :to="item.external ? item.to : localize(item.to)"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
        }"
      />
    </UPageGrid>

    <Dashboard :name="name">
      <!-- An empty dashboard: the hub's own empty state, or nothing below the shortcuts (an empty slot would show the
           dashboard's default one). -->
      <template #empty>
        <UEmpty
          v-if="!shortcuts.length"
          icon="i-lucide-layout-dashboard"
          :title="t('hub.empty.title', 'Nothing here yet')"
          :description="t('hub.empty.description', 'Shortcuts and overviews appear here as your organisation turns on more features.')"
          variant="naked"
        />
        <div
          v-else
          class="hidden"
          data-dashboard-empty
        />
      </template>
    </Dashboard>
  </div>
</template>
