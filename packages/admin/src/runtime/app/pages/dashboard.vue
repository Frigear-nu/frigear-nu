<script setup lang="ts">
defineOptions({ name: 'AdminDashboardPage' })

const t = useModuleT('admin')
const { data: menu } = await useMenu('admin.nav')
// The dashboard entry would just link to this page.
const items = computed(() => (menu.value ?? []).filter(item => item.id !== 'admin-dashboard'))
</script>

<template>
  <AdminPage>
    <AdminPageHeader
      :title="t('dashboard.title', 'Dashboard')"
      :description="t('dashboard.description', 'Overview and shortcuts for administrators.')"
    />
    <WidgetArea name="admin.dashboard">
      <template #empty>
        <div
          v-if="items.length"
          class="border-default bg-default grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3"
        >
          <NuxtLink
            v-for="item in items"
            :key="item.id"
            :to="item.to"
            class="hover:bg-elevated/50 group flex gap-3 p-4 transition-colors"
          >
            <UIcon
              v-if="item.icon"
              :name="item.icon"
              class="text-highlighted mt-0.5 size-5 shrink-0"
            />
            <div class="min-w-0">
              <p class="text-highlighted group-hover:text-primary text-sm font-semibold transition-colors">
                {{ item.label }}
              </p>
              <p
                v-if="item.description"
                class="text-muted mt-0.5 text-sm text-pretty"
              >
                {{ item.description }}
              </p>
            </div>
          </NuxtLink>
        </div>
        <p
          v-else
          class="text-muted"
        >
          {{ t('dashboard.empty', 'Nothing here yet. Modules add their admin pages and widgets automatically.') }}
        </p>
      </template>
    </WidgetArea>
  </AdminPage>
</template>
