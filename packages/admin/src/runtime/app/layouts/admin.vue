<script setup lang="ts">
defineOptions({ name: 'AdminLayout' })

const t = useModuleT('admin')
const route = useRoute()
const config = useRuntimeConfig().public.admin
// The same header controls as the site, resolved by name so a host's own overrides win and nothing is required:
// `LanguageSelect` (base layer), `AccountMenu` (@frigear-nu/account). A name that doesn't resolve stays a string.
const LanguageSelect = resolveComponent('LanguageSelect')
const AccountMenu = resolveComponent('AccountMenu')
const optional = (component: unknown) => typeof component === 'string' ? undefined : component
const nuxtApp = useNuxtApp() as { $i18n?: { locales?: { value?: unknown[] } } }
const multiLocale = (nuxtApp.$i18n?.locales?.value?.length ?? 0) > 1
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
              <component
                :is="optional(LanguageSelect)"
                v-if="optional(LanguageSelect) && multiLocale"
              />
              <UColorModeButton />
              <component
                :is="optional(AccountMenu)"
                v-if="optional(AccountMenu)"
              />
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <div class="admin-content">
            <slot />
          </div>
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </div>
</template>

<style scoped>
/* Other modules' admin pages are often wrapped in a `UContainer` (centered, max width, padded). Inside the panel
   they should fill it like the users page does, so neutralize every container directly in the content. */
.admin-content :deep([class*='--ui-container']) {
  max-width: none;
  margin-inline: 0;
  padding: 0;
}

/* A boxed shell: header on top of the content, sidebar on the left, all inside one bordered frame. */
.admin-frame {
  max-width: 80rem;
  height: 100dvh;
  margin: 0 auto;
  border-inline: 1px solid var(--ui-border);
  overflow: hidden;
  background: var(--ui-bg);
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

@media (max-width: 64rem) {
  .admin-frame {
    border-inline: 0;
  }
}
</style>
