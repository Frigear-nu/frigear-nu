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

const stripLocale = (path: string) => {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  const first = trimmed.split('/')[1]
  const codes = (nuxtApp.$i18n?.locales?.value ?? []).map(l => typeof l === 'string' ? l : (l as { code: string }).code)
  return first && codes.includes(first) ? (trimmed.slice(first.length + 1) || '/') : trimmed
}

const links = computed(() => (items.value ?? []).map(item => ({
  label: item.label,
  icon: item.icon,
  to: item.to,
  external: item.external,
  // The dashboard lives at the base itself, so it only matches exactly (ignoring a locale prefix).
  active: !!item.to && (item.to === home
    ? stripLocale(route.path) === home
    : route.path === item.to || route.path.startsWith(`${item.to}/`)),
})))

// The header names the section being viewed: the nav entry the route belongs to, else the area itself.
const title = computed(() => links.value.find(link => link.active)?.label ?? t('title', 'Administration'))

const sidebarOpen = ref(false)
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// ⌘K palette over the same entries as the sidebar.
const searchGroups = computed(() => [{
  id: 'admin-nav',
  label: t('search.goTo', 'Go to'),
  items: links.value.map(({ label, icon, to }) => ({ id: to ?? label, label, icon, to })),
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="admin"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          :to="home"
          class="flex min-w-0 items-center gap-2"
        >
          <span class="bg-primary text-inverted flex size-7 shrink-0 items-center justify-center rounded-lg">
            <UIcon
              name="i-lucide-layout-dashboard"
              class="size-4"
            />
          </span>
          <span
            v-if="!collapsed"
            class="text-highlighted truncate font-semibold"
          >{{ t('title', 'Administration') }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
          :aria-label="t('nav.label', 'Admin navigation')"
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :label="collapsed ? undefined : t('backToSite', 'Back to the site')"
          :square="collapsed"
          block
          class="justify-start"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="searchGroups" />

    <UDashboardPanel id="admin-main">
      <template #header>
        <UDashboardNavbar
          :title="title"
          :ui="{ right: 'gap-2' }"
        >
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
        <div class="admin-content mx-auto w-full max-w-7xl">
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
