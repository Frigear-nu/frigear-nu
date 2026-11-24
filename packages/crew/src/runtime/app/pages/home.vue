<script setup lang="ts">
import { CREW_HOME_TABS } from '../../utils/links'
import { computed, useHead, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'CrewHomePage' })

// A crew member's home: the `crew.dashboard` tabs (Overview with the `crew.home` dashboard, My crew, and what other
// modules add, such as shifts' My shifts and Swaps), the active one in `?tab=`. Signed-in only (`guardPages` in
// `module.ts`). Below the signed-in hub (`/dashboard/crew`) it is an app page in the hub's layout; elsewhere a page of
// the site, in its own container.
const t = useModuleT('crew')
const config = useRuntimeConfig().public
const inHub = computed(() => {
  const hub = (config.dashboard as { pages?: { home?: string } } | undefined)?.pages?.home
  const home = config.crew?.pages?.home
  return !!(hub && home && (hub === '/' || home === hub || home.startsWith(`${hub}/`)))
})

useHead({ title: () => t('home.title', 'Crew') })
</script>

<template>
  <div
    v-if="inHub"
    class="flex flex-col gap-4"
  >
    <PageHeading
      :title="t('home.title', 'Crew')"
      :description="t('home.description', 'Your crew places, your shifts and what is happening for you.')"
    />
    <WidgetTabs :name="CREW_HOME_TABS" />
  </div>
  <UContainer v-else>
    <UPage>
      <UPageHeader
        :title="t('home.title', 'Crew')"
        :description="t('home.description', 'Your crew places, your shifts and what is happening for you.')"
      />
      <UPageBody>
        <WidgetTabs :name="CREW_HOME_TABS" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
