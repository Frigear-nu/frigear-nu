<script setup lang="ts">
defineOptions({ name: 'AdminDashboardPage' })

const t = useModuleT('admin')
const { data: items } = await useMenu('admin.nav')
</script>

<template>
  <div>
    <AdminPageHeader
      :title="t('dashboard.title', 'Dashboard')"
      :description="t('dashboard.description', 'Overview and shortcuts for administrators.')"
    />
    <WidgetArea name="admin.dashboard">
      <template #empty>
        <div
          v-if="items?.length"
          class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4"
        >
          <UPageCard
            v-for="item in items"
            :key="item.id"
            :title="item.label"
            :description="item.description"
            :icon="item.icon"
            :to="item.to"
          />
        </div>
        <p
          v-else
          class="text-muted"
        >
          {{ t('dashboard.empty', 'Nothing here yet. Modules add their admin pages and widgets automatically.') }}
        </p>
      </template>
    </WidgetArea>
  </div>
</template>
