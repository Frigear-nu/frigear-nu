<script setup lang="ts">
import { computed, useDashboardItem, useModuleT, useMyApplications, watchEffect } from '#imports'
import type { UserApplicationDto } from '../../../types'

defineOptions({ name: 'OAuthAppsWidget' })

// "Your apps" (`oauth-server.apps`): the applications the user may sign in to, as cards opening each in a new tab. The
// frame shows the skeleton and the error (with a retry); with no applications the item leaves the dashboard (`empty`).
const t = useModuleT('oauthServer')
const item = useDashboardItem()
const { applications, loading, error, refresh } = useMyApplications()

watchEffect(() => {
  item.loading.value = loading.value
  item.error.value = applications.value.length ? null : error.value
  // `empty` is newer than `useDashboardItem()` itself: an older `@frigear-nu/dashboard` shows the title over nothing.
  if (item.empty) item.empty.value = !loading.value && !error.value && !applications.value.length
})
item.onRefresh(refresh)

const host = (url: string | null) => {
  if (!url) return undefined
  try {
    return new URL(url).host
  }
  catch {
    return undefined
  }
}

const cards = computed(() => applications.value.map((application: UserApplicationDto) => ({
  id: application.id,
  title: application.name,
  description: application.description || host(application.websiteUrl) || host(application.loginUrl),
  icon: application.icon || 'i-lucide-globe',
  to: application.loginUrl,
})))
</script>

<template>
  <UPageGrid
    v-if="cards.length"
    class="lg:grid-cols-2"
    data-oauth-apps
  >
    <UPageCard
      v-for="card in cards"
      :key="card.id"
      :title="card.title"
      :description="card.description"
      :icon="card.icon"
      :to="card.to"
      target="_blank"
      external
      orientation="horizontal"
      variant="subtle"
      :aria-label="t('applications.openApplication', 'Open {name}', { name: card.title })"
      :ui="{ container: 'lg:grid-cols-[1fr_auto]', wrapper: 'min-w-0' }"
    >
      <!-- Only a visual cue: the whole card is the link (a nested button link would not be valid HTML). -->
      <div class="hidden justify-end lg:flex">
        <UButton
          as="span"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-up-right"
          size="sm"
          tabindex="-1"
          aria-hidden="true"
          :label="t('applications.open', 'Open')"
        />
      </div>
    </UPageCard>
  </UPageGrid>
</template>
