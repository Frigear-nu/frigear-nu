<script setup lang="ts">
import { errorMessage, useModuleT, useMyApplications } from '#imports'

defineOptions({ name: 'OAuthApplicationsPage' })

const t = useModuleT('oauthServer')
// Awaited, so the server renders the applications; on client navigation the remembered list shows at once.
const { applications, loading, error, refresh } = await useMyApplications()
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- The same keys as the account menu item, so the label and the title cannot drift. -->
    <PageHeading
      :title="t('menu.applications.label', 'Applications')"
      :description="t('menu.applications.description', 'Applications you can sign in to.')"
    />

    <SectionCard
      v-if="loading"
      loading
      aria-busy="true"
    />
    <UEmpty
      v-else-if="error && !applications.length"
      icon="i-lucide-circle-alert"
      :title="t('applications.loadFailed', 'Your applications could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('applications.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <SectionCard
      v-else
      flush
    >
      <UEmpty
        v-if="!applications.length"
        variant="naked"
        icon="i-lucide-layout-grid"
        :title="t('applications.emptyTitle', 'No applications yet')"
        :description="t('applications.emptyDescription', 'There are no applications you can sign in to yet.')"
      />
      <ul
        v-else
        class="divide-default divide-y"
      >
        <li
          v-for="application in applications"
          :key="application.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UAvatar
            :icon="application.icon || 'i-lucide-globe'"
            size="md"
          />
          <div class="min-w-0 flex-1">
            <p class="text-highlighted truncate text-sm font-medium">
              {{ application.name }}
            </p>
            <p class="text-muted truncate text-sm">
              {{ application.description ?? application.websiteUrl ?? application.loginUrl }}
            </p>
          </div>
          <UButton
            :to="application.loginUrl"
            external
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-arrow-up-right"
            size="sm"
            :label="t('applications.open', 'Open')"
            :aria-label="t('applications.openApplication', 'Open {name}', { name: application.name })"
          />
        </li>
      </ul>
    </SectionCard>
  </div>
</template>
