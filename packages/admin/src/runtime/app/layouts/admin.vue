<script setup lang="ts">
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

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

const home = config?.dashboard ?? config?.base ?? '/admin'
const { localize } = useLocaleLink()

// One read of every group (`admin.nav`, `admin.nav.overview`, `admin.nav.settings`); each item carries its group.
const { data: items } = await useMenu('admin.nav.*')
type GroupName = 'overview' | 'manage' | 'settings'
const groupOf = (group?: string): GroupName => group === 'nav.overview' ? 'overview' : group === 'nav.settings' ? 'settings' : 'manage'
const byGroup = (name: GroupName) => (items.value ?? []).filter(item => groupOf(item.group) === name)

// The dashboard lives at the base itself, so it only matches exactly (ignoring a locale prefix).
const navOptions = { exact: [home] }
const overview = useNavLinks(() => byGroup('overview'), navOptions)
const manage = useNavLinks(() => byGroup('manage'), navOptions)
const settings = useNavLinks(() => byGroup('settings'), navOptions)

const groups = computed(() => [
  { id: 'overview', label: undefined, links: overview.value },
  { id: 'manage', label: t('nav.groups.manage', 'Manage'), links: manage.value },
  { id: 'settings', label: t('nav.groups.settings', 'Settings'), links: settings.value },
].filter(group => group.links.length))

// Overview needs no heading: it holds the dashboard only.
const navigation = computed<NavigationMenuItem[][]>(() => groups.value.map(group => group.label
  ? [{ type: 'label', label: group.label }, ...group.links]
  : group.links))

// The header names the section being viewed: the nav entry the route belongs to, else the area itself.
const title = computed(() => groups.value.flatMap(group => group.links).find(link => link.active)?.label ?? t('title', 'Administration'))

const sidebarOpen = ref(false)
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// ⌘K palette over the same entries as the sidebar, one group per nav group.
const searchGroups = computed<CommandPaletteGroup[]>(() => groups.value.map(group => ({
  id: `admin-nav-${group.id}`,
  label: group.label ?? t('search.goTo', 'Go to'),
  items: group.links.map(({ label, icon, to }) => ({ id: String(to ?? label), label, icon, to })),
})))
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="admin"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default flex-col items-stretch gap-1' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          :to="localize(home)"
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
          :items="navigation"
          orientation="vertical"
          tooltip
          :aria-label="t('nav.label', 'Admin navigation')"
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          :to="localize('/')"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :label="collapsed ? undefined : t('backToSite', 'Back to the site')"
          :square="collapsed"
          block
          class="justify-start"
        />
        <component
          :is="optional(AccountMenu)"
          v-if="optional(AccountMenu)"
          block
          :collapsed="collapsed"
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
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-7xl">
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
