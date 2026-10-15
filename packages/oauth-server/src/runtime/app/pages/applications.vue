<script setup lang="ts">
defineOptions({ name: 'OAuthApplicationsPage' })

// No container or heading: the `account` layout provides both.
const t = useModuleT('oauthServer')
const { applications, status } = useMyApplications()
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="status !== 'pending' && !applications.length"
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
