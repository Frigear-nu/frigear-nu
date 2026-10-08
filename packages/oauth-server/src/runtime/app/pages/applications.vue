<script setup lang="ts">
defineOptions({ name: 'OAuthApplicationsPage' })

const { applications, status } = useMyApplications()
</script>

<template>
  <UContainer class="py-10">
    <h1 class="mb-6 text-2xl font-semibold">
      Applications
    </h1>
    <p
      v-if="status !== 'pending' && !applications.length"
      class="text-muted"
    >
      There are no applications you can sign in to yet.
    </p>
    <div class="grid gap-4 md:grid-cols-2">
      <UCard
        v-for="application in applications"
        :key="application.id"
      >
        <div class="flex items-start gap-3">
          <UIcon
            :name="application.icon || 'i-lucide-globe'"
            class="mt-1 size-6 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <h2 class="font-medium">
              {{ application.name }}
            </h2>
            <p
              v-if="application.description"
              class="text-sm text-muted"
            >
              {{ application.description }}
            </p>
          </div>
          <UButton
            :to="application.loginUrl"
            external
            trailing-icon="i-lucide-arrow-up-right"
            size="sm"
          >
            Open
          </UButton>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
