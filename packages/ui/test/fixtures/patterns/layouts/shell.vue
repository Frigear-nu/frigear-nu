<script setup lang="ts">
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

defineOptions({ name: 'ShellLayout' })

const links = useNavLinks([
  { label: 'Shell', icon: 'i-lucide-house', to: '/shell' },
  { label: 'Wide', icon: 'i-lucide-maximize', to: '/wide' },
])
const navigation = computed<NavigationMenuItem[][]>(() => [[{ type: 'label', label: 'Pages' }, ...links.value]])
const searchGroups = computed<CommandPaletteGroup[]>(() => [{
  id: 'fixture-nav',
  label: 'Go to',
  items: links.value.map(({ label, icon, to }) => ({ id: String(to), label, icon, to })),
}])
</script>

<template>
  <AppShell
    id="fixture"
    title="Fixture area"
    home="/shell"
    :navigation="navigation"
    nav-label="Fixture navigation"
    :search-groups="searchGroups"
    :back-to="{ to: '/', label: 'Back to the site' }"
  >
    <template #sidebar-footer="{ collapsed }">
      <span data-testid="sidebar-footer">{{ collapsed ? 'Collapsed footer' : 'Sidebar footer' }}</span>
    </template>
    <slot />
  </AppShell>
</template>
