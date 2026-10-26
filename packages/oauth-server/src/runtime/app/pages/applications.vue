<script setup lang="ts">
defineOptions({ name: 'OAuthApplicationsPage' })

// No container or heading: the `account` layout provides both.
const t = useModuleT('oauthServer')
// Awaited, so the server renders the applications; on client navigation the remembered list shows at once.
const { applications, loading, error, refresh } = await useMyApplications()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="loading"
      class="grid gap-4 md:grid-cols-2"
      aria-busy="true"
    >
      <SectionCard
        v-for="index in 2"
        :key="index"
        loading
      />
    </div>
    <UEmpty
      v-else-if="error && !applications.length"
      icon="i-lucide-circle-alert"
      :title="t('applications.loadFailed', 'Your applications could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('applications.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!applications.length"
      icon="i-lucide-layout-grid"
      :title="t('applications.emptyTitle', 'No applications yet')"
      :description="t('applications.emptyDescription', 'There are no applications you can sign in to yet.')"
    />
    <div
      v-else
      class="grid gap-4 md:grid-cols-2"
    >
      <UPageCard
        v-for="application in applications"
        :key="application.id"
        variant="outline"
        :title="application.name"
        :description="application.description ?? application.websiteUrl"
        :icon="application.icon || 'i-lucide-globe'"
      >
        <UButton
          :to="application.loginUrl"
          external
          trailing-icon="i-lucide-arrow-up-right"
          size="sm"
          :label="t('applications.open', 'Open')"
          :aria-label="t('applications.openApplication', 'Open {name}', { name: application.name })"
        />
      </UPageCard>
    </div>
  </div>
</template>
