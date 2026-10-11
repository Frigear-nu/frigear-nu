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
          class="admin-cards"
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

<style scoped>
.admin-cards {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
}
</style>
