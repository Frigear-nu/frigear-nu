<script setup lang="ts">
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

// `AppShell` as an area layout would use it: links from a menu, one ⌘K group per nav group, identity in the footer.
const overview = useNavLinks([{ label: 'Overview', icon: 'i-lucide-house', to: '/shell' }], { exact: ['/shell'] })
const manage = useNavLinks([{ label: 'Components', icon: 'i-lucide-blocks', to: '/' }], { exact: ['/'] })

const navigation = computed<NavigationMenuItem[][]>(() => [
  overview.value,
  [{ type: 'label', label: 'Manage' }, ...manage.value],
])
const searchGroups = computed<CommandPaletteGroup[]>(() => [{
  id: 'playground-nav',
  label: 'Go to',
  items: [...overview.value, ...manage.value].map(({ label, icon, to }) => ({ id: String(to), label, icon, to })),
}])
</script>

<template>
  <AppShell
    id="playground"
    title="Playground"
    home="/shell"
    :navigation="navigation"
    nav-label="Playground navigation"
    :search-groups="searchGroups"
    :back-to="{ to: '/', label: 'Back to the components' }"
  >
    <template #sidebar-footer="{ collapsed }">
      <UUser
        name="Ada Lovelace"
        :description="collapsed ? undefined : 'ada@example.com'"
        :avatar="{ alt: 'Ada Lovelace' }"
        size="sm"
      />
    </template>
    <slot />
  </AppShell>
</template>
