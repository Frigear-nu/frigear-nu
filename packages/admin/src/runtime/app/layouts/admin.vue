<script setup lang="ts">
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

defineOptions({ name: 'AdminLayout' })

const t = useModuleT('admin')
const config = useRuntimeConfig().public.admin
// `AccountMenu` (@frigear-nu/account) is resolved by name so a host's own override wins and nothing is required:
// a name that doesn't resolve stays a string. `LanguageSelect` and the rest of the chrome belong to `AppShell`.
const AccountMenu = resolveComponent('AccountMenu')
const optional = (component: unknown) => typeof component === 'string' ? undefined : component

const home = config?.dashboard ?? config?.base ?? '/admin'

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

// ⌘K palette over the same entries as the sidebar, one group per nav group.
const searchGroups = computed<CommandPaletteGroup[]>(() => groups.value.map(group => ({
  id: `admin-nav-${group.id}`,
  label: group.label ?? t('search.goTo', 'Go to'),
  items: group.links.map(({ label, icon, to }) => ({ id: String(to ?? label), label, icon, to })),
})))
</script>

<template>
  <!-- The dashboard chrome (brand, sidebar, eyebrow navbar, language select) is the shared `AppShell`; this layout only
       feeds it the admin menus and the account menu. Paths are passed raw: the shell localises them. -->
  <AppShell
    id="admin"
    :title="t('title', 'Administration')"
    :home="home"
    :navigation="navigation"
    :nav-label="t('nav.label', 'Admin navigation')"
    :search-groups="searchGroups"
    :back-to="{ to: '/', label: t('backToSite', 'Back to the site') }"
  >
    <template #sidebar-footer="{ collapsed }">
      <component
        :is="optional(AccountMenu)"
        v-if="optional(AccountMenu)"
        block
        :collapsed="collapsed"
      />
    </template>

    <slot />
  </AppShell>
</template>
