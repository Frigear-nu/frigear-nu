<script setup lang="ts">
defineOptions({ name: 'AdminDashboardPage' })

const t = useModuleT('admin')
const { data: menu } = await useMenu('admin.nav')
// The dashboard entry would just link to this page.
const items = computed(() => (menu.value ?? []).filter(item => item.id !== 'admin-dashboard'))

// Modules fill three areas: the stat row, the main column and the narrow side column (see `extendAdminDashboard`).
const [{ data: top }, { data: main }, { data: side }] = await Promise.all([
  useWidgets('admin.dashboard.top'),
  useWidgets('admin.dashboard'),
  useWidgets('admin.dashboard.side'),
])
const hasWidgets = computed(() => !!(top.value?.length || main.value?.length || side.value?.length))
const stack = 'flex flex-col gap-4'
</script>

<template>
  <AdminPage>
    <AdminPageHeader
      :title="t('dashboard.title', 'Dashboard')"
      :description="t('dashboard.description', 'Overview and shortcuts for administrators.')"
    />

    <template v-if="hasWidgets">
      <WidgetArea name="admin.dashboard.top" />
      <div class="grid gap-4 lg:grid-cols-3">
        <WidgetArea
          name="admin.dashboard"
          :grid-class="`${stack} ${side?.length ? 'lg:col-span-2' : 'lg:col-span-3'}`"
        />
        <WidgetArea
          name="admin.dashboard.side"
          :grid-class="stack"
        />
      </div>
    </template>

    <template v-else>
      <UPageGrid
        v-if="items.length"
        class="lg:grid-cols-3"
      >
        <UPageCard
          v-for="item in items"
          :key="item.id"
          :title="item.label"
          :description="item.description"
          :icon="item.icon"
          :to="item.to"
          variant="subtle"
          :ui="{
            container: 'gap-y-1.5',
            wrapper: 'items-start',
            leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
          }"
        />
      </UPageGrid>
      <p
        v-else
        class="text-muted"
      >
        {{ t('dashboard.empty', 'Nothing here yet. Modules add their admin pages and widgets automatically.') }}
      </p>
    </template>
  </AdminPage>
</template>
