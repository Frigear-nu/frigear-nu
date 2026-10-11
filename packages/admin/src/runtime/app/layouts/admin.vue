<script setup lang="ts">
defineOptions({ name: 'AdminLayout' })

const t = useModuleT('admin')
const route = useRoute()
const config = useRuntimeConfig().public.admin
const { user } = useUserSession()
const { data: items } = await useMenu('admin.nav')

const home = config?.dashboard ?? config?.base ?? '/admin'

const links = computed(() => (items.value ?? []).map(item => ({
  label: item.label,
  icon: item.icon,
  to: item.to,
  external: item.external,
  active: !!item.to && (route.path === item.to || route.path.startsWith(`${item.to}/`)),
})))

// The header names the section being viewed: the nav entry the route belongs to, else the area itself.
const title = computed(() => links.value.find(link => link.active)?.label ?? t('title', 'Administration'))

const sidebarOpen = ref(false)
watch(() => route.path, () => {
  sidebarOpen.value = false
})
</script>

<template>
  <!-- The structure is plain scoped CSS rather than utility classes: Tailwind does not scan workspace packages. -->
  <div class="admin-frame">
    <UDashboardGroup
      unit="rem"
      :ui="{ base: 'admin-group relative flex h-full w-full overflow-hidden' }"
    >
      <UDashboardSidebar
        v-model:open="sidebarOpen"
        :default-size="16"
        :min-size="12"
        :max-size="22"
        :ui="{ root: 'min-h-0', footer: 'border-t border-default' }"
      >
        <template #header>
          <NuxtLink
            :to="home"
            class="admin-brand"
          >
            <UIcon name="i-lucide-layout-dashboard" />
            <span>{{ t('title', 'Administration') }}</span>
          </NuxtLink>
        </template>

        <UNavigationMenu
          orientation="vertical"
          :items="links"
          :aria-label="t('nav.label', 'Admin navigation')"
        />

        <template #footer>
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            :label="t('backToSite', 'Back to the site')"
            block
          />
        </template>
      </UDashboardSidebar>

      <UDashboardPanel>
        <template #header>
          <UDashboardNavbar :title="title">
            <template #leading>
              <UDashboardSidebarCollapse />
            </template>
            <template #right>
              <span
                v-if="user"
                class="admin-user"
              >
                {{ user.email }}
              </span>
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <slot />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </div>
</template>

<style scoped>
/* A boxed shell: header on top of the content, sidebar on the left, all inside one bordered frame. */
.admin-frame {
  max-width: 80rem;
  height: calc(100dvh - 2rem);
  margin: 1rem auto;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--ui-bg);
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.admin-user {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

@media (max-width: 64rem) {
  .admin-frame {
    margin: 0;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }
}
</style>
